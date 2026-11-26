import assert from "node:assert/strict";
import test from "node:test";

import { compileSusy } from "./import-susy.mjs";
import { Recipe, RecipeIoType as Io, Repository } from "./src/repository.js";

test("converts a SuSy recipe into the shared binary browser format", () => {
    const ore = { kind: "item", id: "susy:ore@1", displayName: "§aExample Ore", iconPath: "/textures/example.png" };
    const equivalent = { kind: "item", id: "susy:ore@2", displayName: "Other Example Ore" };
    const water = { kind: "fluid", id: "water", displayName: "Water" };
    const dust = { kind: "item", id: "susy:dust@1", displayName: "Example Dust" };

    const result = compileSusy({
        resources: [ore, equivalent, water, dust],
        recipes: [{
            id: "test", machineType: "Ore Washer", eut: 30, durationTicks: 200,
            inputs: [{ ...ore, amount: 1, accepted: [ore, equivalent] }, { ...water, amount: 100 }],
            outputs: [{ ...dust, amount: 2, chance: 0.3333 }]
        }]
    });

    const { buffer, byteOffset, byteLength } = result.binary;
    const repo = Repository.load(buffer.slice(byteOffset, byteOffset + byteLength));
    const recipe = repo.GetObject(repo.GetById("i:susy:dust@1").production[0], Recipe);

    assert.equal(recipe.recipeType.name, "Ore Washer");
    assert.equal(recipe.gtRecipe.voltage, 30);
    assert.equal(recipe.gtRecipe.durationTicks, 200);
    assert.equal(recipe.items[0].type, Io.OreDictInput);
    assert.deepEqual(recipe.items[0].goods.items.map(item => item.name), ["Example Ore", "Other Example Ore"]);
    assert.equal(recipe.items[1].type, Io.FluidInput);
    assert.equal(recipe.items[1].amount, 100);
    assert.equal(recipe.items[2].probability, 0.3333);
    assert.equal(repo.GetById("i:susy:ore@2").consumption[0], recipe.objectOffset);
    assert.equal(result.icons[repo.GetById("i:susy:ore@1").iconId], "example");
});

test("preserves repeated ingredients and empty cells in a shaped recipe", () => {
    const material = id => ({ kind: "item", id: `susy:${id}` });
    const plank = material("plank"), stick = material("stick"), tool = material("tool");
    const id = "susy:craft_tool";
    const dataset = {
        resources: [plank, stick, tool],
        recipes: [{
            id: "craft-tool", machineType: "Crafting Table", eut: 0, durationTicks: 1,
            inputs: [{ ...plank, amount: 1 }, { ...stick, amount: 1 }],
            outputs: [{ ...tool, amount: 1 }],
            source: { recipeMap: "crafting", rawRecipeId: id }
        }]
    };
    const { binary } = compileSusy(dataset, { crafting: [{
        type: "shaped", registryName: id, recipe: { keymap: { A: {}, B: {} }, shape: ["A A", " B "] }
    }] });
    const repo = Repository.load(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
    const recipe = repo.GetById("r:craft-tool");

    assert.deepEqual([...recipe.recipeType.dimensions].slice(0, 2), [3, 2]);
    assert.deepEqual(recipe.items.filter(io => io.type === Io.ItemInput).map(io => [io.slot, io.goods.id]), [
        [0, "i:susy:plank"], [2, "i:susy:plank"], [4, "i:susy:stick"]
    ]);
    assert.equal(recipe.gtRecipe, null);
});

test("resolves item names and wildcard ingredients while keeping fractional yields", () => {
    const base = "gregtechfoodoption:gtfo_leaves_2";
    const leaves = { kind: "item", id: base + "@32767", displayName: base + "@32767" };
    const seeds = { kind: "item", id: "gregtechfoodoption:gtfo_oredict_item@1000",
        displayName: "gregtechfoodoption:gtfo_oredict_item@1000", iconPath: "corn_seeds-29ac01ede8ff.png" };
    const { binary, skipped } = compileSusy({
        resources: [leaves, seeds],
        recipes: [{
            id: "farm", machineType: "Crop Farm", category: "crop-farm", eut: 0, durationTicks: 600,
            inputs: [{ ...leaves, amount: 1, groupId: "oredict:treeLeaves" }],
            outputs: [{ ...seeds, amount: 0.5 }]
        }]
    }, { items: [
        { resource: base, metadata: 0, displayName: "Nutmeg Leaves" },
        { resource: base, metadata: 4, displayName: "Coconut Leaves" }
    ] }, new Map([["metaitem.corn_kernel_gem_chipped.name", "Corn Seeds"]]));
    const repo = Repository.load(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
    const recipe = repo.GetById("r:farm");
    assert.equal(skipped, 0);
    assert.equal(recipe.items[0].goods.name, "Tree Leaves");
    assert.deepEqual(recipe.items[0].goods.items.map(item => item.name), ["Nutmeg Leaves", "Coconut Leaves"]);
    assert.equal(repo.GetById("i:" + leaves.id).consumption[0], recipe.objectOffset);
    assert.equal(recipe.items[1].goods.name, "Corn Seeds");
    assert.equal(recipe.items[1].amount, 0.5);
});

test("uses a verified controller when the exported category icon is a fluid", () => {
    const map = "low_pressure_cryogenic_distillation";
    const registry = "susy:" + map + "_plant";
    const translationKey = "recipemap." + map + ".name";
    const machine = { kind: "item", id: "gregtech:machine@17015",
        displayName: "Low Pressure Cryogenic Distillation Plant", iconPath: "plant.png" };
    const oxygen = { kind: "fluid", id: "oxygen", displayName: "Oxygen", iconPath: "oxygen.png" };
    const type = "Low Pressure Cryogenic Distillation";
    const { binary } = compileSusy({
        resources: [machine, oxygen],
        recipeMapIcons: [{ recipeMap: type, resource: oxygen }],
        recipes: [{
            id: "distill", machineType: type, eut: 30, durationTicks: 5,
            inputs: [{ ...oxygen, amount: 1 }], outputs: [{ ...oxygen, amount: 1 }]
        }]
    }, {
        recipemaps: { [map]: { translationKey } },
        gtMTEs: { [registry]: { metaName: "machine", isController: true } },
        items: [{ itemClass: "MachineItemBlock", resource: "gregtech:machine", metadata: 17015,
            translationKey: "machine", displayName: machine.displayName }]
    }, new Map([[translationKey, type]]));
    const repo = Repository.load(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
    const { recipeType } = repo.GetById("r:distill");
    assert.equal(recipeType.sourceName, type);
    assert.equal(recipeType.name, machine.displayName);
    assert.equal(recipeType.defaultCrafter.id, "i:" + machine.id);
});
