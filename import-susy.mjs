import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { RecipeIoType as Io } from "./src/repository.js";
import { tierIndexOf } from "./src/utils.js";

const version = 7;
const searchBits = [-1, -1, -1, -1];
const integerMax = 0x7fffffff;
const emptySlot = 65535;

const cleanName = value => String(value).replace(/§[0-9a-fk-or]/gi, "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[char]);

const goodsId = ({ kind, id }) => `${kind === "fluid" ? "f" : "i"}:${id}`;
const supported = value => Number.isInteger(value) && value >= 0 && value <= integerMax;

class BinaryDataset {
    constructor() {
        this.words = [version, 0, 0, 0, 0, 0, 0, 0];
        this.strings = new Map();
        this.empty = this.list([]);
    }

    add(values) {
        const ptr = this.words.length;
        for (const value of values) this.words.push(value);
        return ptr;
    }

    list(values) {
        return this.add([values.length, ...values]);
    }

    string(value) {
        if (!this.strings.has(value)) {
            const text = Buffer.from(value);
            const aligned = Buffer.alloc(Math.ceil(text.length / 4) * 4);
            text.copy(aligned);
            const ptr = this.add([text.length]);
            for (let offset = 0; offset < aligned.length; offset += 4) {
                this.words.push(aligned.readInt32LE(offset));
            }
            this.strings.set(value, ptr);
        }
        return this.strings.get(value);
    }

    metadata(key, value) {
        const double = Buffer.alloc(8);
        double.writeDoubleLE(value);
        return this.add([this.string(key), double.readInt32LE(0), double.readInt32LE(4)]);
    }

    finish(collections) {
        collections.forEach((values, idx) => { this.words[idx + 1] = this.list(values); });
        const buffer = Buffer.alloc(this.words.length * 4);
        this.words.forEach((value, idx) => buffer.writeInt32LE(value, idx * 4));
        return buffer;
    }
}

function ioType(slot, output, ore) {
    if (slot.kind === "fluid") return output ? Io.FluidOutput : Io.FluidInput;
    if (ore) return Io.OreDictInput;
    return output ? Io.ItemOutput : Io.ItemInput;
}

function restoreCraftingGrid(recipe, raw) {
    const { shape, keymap } = raw.recipe;
    const keys = Object.keys(keymap);
    if (keys.length !== recipe.inputs.length) return null;

    const width = Math.max(...shape.map(row => row.length));
    const keyed = new Map(keys.map((key, idx) => [key, recipe.inputs[idx]]));
    const inputs = [], craftingSlots = [];

    for (const [y, row] of shape.entries()) {
        for (const [x, key] of [...row].entries()) {
            if (key === " ") continue;
            if (!keyed.has(key)) return null;
            inputs.push(keyed.get(key));
            craftingSlots.push(y * width + x);
        }
    }

    return { ...recipe, inputs, craftingSlots, craftingGrid: [width, shape.length] };
}

export function compileSusy(dataset, rawCrafting = []) {
    const bin = new BinaryDataset();
    const goods = new Map();
    const catalog = new Map(dataset.resources.map(resource => [goodsId(resource), resource]));
    const recipes = [], icons = [];
    const types = new Map(), groups = new Map();
    const catalysts = new Map((dataset.recipeMapIcons ?? []).map(entry => [entry.recipeMap, entry.resource]));
    const shaped = new Map(rawCrafting.filter(entry => entry.type === "shaped").map(entry => [entry.registryName, entry]));

    function addGoods(resource) {
        const id = goodsId(resource);
        const existing = goods.get(id);
        if (existing) return existing;

        resource = catalog.get(id) ?? resource;

        const mod = resource.modId ?? resource.id.split(":")[0];
        const item = resource.kind !== "fluid";
        const file = resource.iconPath ? path.basename(resource.iconPath) : null;
        const icon = file === null ? -1 : icons.push(file.replace(/\.png$/i, "")) - 1;
        const ptr = bin.add([
            ...searchBits, bin.string(id), bin.string(cleanName(resource.displayName ?? resource.id)),
            bin.string(mod), bin.string(resource.id), 0, icon, bin.empty, -1, -1, bin.empty, bin.empty,
            ...(item ? [64, 0, -1] : [0, bin.empty])
        ]);
        const record = { ptr, item, production: new Set(), consumption: new Set() };
        goods.set(id, record);
        return record;
    }

    function layout(recipe, counts) {
        const dimensions = counts.flatMap((count, idx) => {
            if (idx === 0 && recipe.craftingGrid) return recipe.craftingGrid;
            const columns = Math.min(3, count);
            return [columns, columns ? Math.ceil(count / columns) : 0];
        });
        const key = JSON.stringify([recipe.machineType, recipe.category, dimensions]);
        if (!types.has(key)) {
            const machine = catalysts.get(recipe.machineType);
            types.set(key, bin.add([
                bin.string(recipe.machineType), bin.string(recipe.category ?? ""), bin.list(dimensions),
                bin.empty, 0, bin.empty, machine ? addGoods(machine).ptr : -1
            ]));
        }
        return types.get(key);
    }

    function slotGroup(slot) {
        const variants = slot.accepted ?? [];
        if (slot.kind !== "item" || variants.length < 2) return null;

        const key = JSON.stringify(variants.map(goodsId).sort());
        if (!groups.has(key)) {
            const members = variants.map(addGoods);
            const label = slot.groupId?.replace(/^oredict:/, "") ?? slot.id;
            const ptr = bin.add([...searchBits, bin.string(`o:${label}:${groups.size}`), bin.list(members.map(item => item.ptr))]);
            groups.set(key, { ptr, members });
        }
        return groups.get(key);
    }

    let skipped = 0;
    for (let recipe of dataset.recipes) {
        const raw = recipe.source?.recipeMap === "crafting" ? shaped.get(recipe.source.rawRecipeId) : null;
        if (raw) recipe = restoreCraftingGrid(recipe, raw);

        if (!recipe || ![recipe.eut, recipe.durationTicks].every(supported) ||
            [...recipe.inputs, ...recipe.outputs].some(slot => !supported(slot.amount))) {
            skipped++;
            continue;
        }

        const counts = [0, 0, 0, 0];
        const slots = [];
        const inputs = new Set(), outputs = new Set();

        for (const [output, entries] of [[false, recipe.inputs], [true, recipe.outputs]]) {
            for (const [idx, slot] of entries.entries()) {
                const group = output ? null : slotGroup(slot);
                const records = group ? group.members : [addGoods(slot)];
                const type = ioType(slot, output, group);
                const bucket = (output ? 2 : 0) + (slot.kind === "fluid" ? 1 : 0);
                const sequence = counts[bucket]++;
                const position = !output && recipe.craftingSlots ? recipe.craftingSlots[idx] : sequence;
                const amount = slot.consumed === false && !output ? 0 : slot.amount;
                slots.push(type, group?.ptr ?? records[0].ptr, position < emptySlot ? position : emptySlot,
                    amount, Math.round((slot.chance ?? 1) * 100));
                records.forEach(record => (output ? outputs : inputs).add(record));
            }
        }

        const meta = [];
        if (recipe.specialValue > 0 && /blast furnace/i.test(recipe.machineType)) meta.push(bin.metadata("coil_heat", recipe.specialValue));
        if (recipe.metadata?.cleanroom) meta.push(bin.metadata("cleanroom", 1));
        if (recipe.programmedCircuit !== undefined) meta.push(bin.metadata("programmed_circuit", Number(recipe.programmedCircuit)));
        if (recipe.metadata?.fusionEuToStart > 0) meta.push(bin.metadata("fusion_eu_to_start", recipe.metadata.fusionEuToStart));
        const gt = recipe.metadata?.synthesizedDuration || recipe.source?.recipeMap === "crafting"
            ? -1
            : bin.add([recipe.eut, recipe.durationTicks, 1, tierIndexOf(recipe.eut), bin.list(meta), 0, 0]);
        const ptr = bin.add([...searchBits, bin.string(`r:${recipe.id}`), bin.list(slots), layout(recipe, counts), gt]);
        recipes.push(ptr);
        inputs.forEach(record => record.consumption.add(ptr));
        outputs.forEach(record => record.production.add(ptr));
    }

    const items = [], fluids = [];
    for (const { ptr, item, production, consumption } of goods.values()) {
        bin.words[ptr + 13] = bin.list([...production]);
        bin.words[ptr + 14] = bin.list([...consumption]);
        (item ? items : fluids).push(ptr);
    }
    return {
        binary: bin.finish([items, fluids, [...groups.values()].map(group => group.ptr), [...types.values()], recipes, [], []]),
        icons,
        skipped,
        recipes: recipes.length
    };
}

async function main(file, textureDir, rawFile) {
    if (!file || !textureDir || !rawFile) throw new Error("Usage: node import-susy.mjs <recipes.json> <rendered-texture-directory> <recipedump.json>");
    const dataset = JSON.parse(await fs.readFile(file, "utf8"));
    const { crafting } = JSON.parse(await fs.readFile(rawFile, "utf8"));
    const { binary, icons, recipes, skipped } = compileSusy(dataset, crafting);

    const dataDir = "public/data-susy", iconDir = "public/susy/icons";
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(iconDir, { recursive: true });
    await fs.writeFile(path.join(dataDir, "data.bin"), gzipSync(binary));
    await fs.writeFile(path.join(dataDir, "icons-v2.json"), JSON.stringify(icons));
    for (const icon of new Set(icons)) {
        await fs.copyFile(path.join(textureDir, `${icon}.png`), path.join(iconDir, `${icon}.png`));
    }
    console.log(`Imported ${recipes} recipes and ${new Set(icons).size} rendered icons (${skipped} unrepresentable recipes).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    await main(...process.argv.slice(2));
}
