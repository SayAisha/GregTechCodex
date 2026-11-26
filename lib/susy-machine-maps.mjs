import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const unzip = promisify(execFile);
const mapKey = name => name.toLowerCase().replace(/[_\s-]+/g, " ");

// Controller registrations in Susy-Core v0.2.9 and GregTech. The raw dump omits their map IDs.
const controllerMaps = {
    "gregtech:primitive_blast_furnace.bronze": "primitive_blast_furnace",
    "gregtech:large_turbine.plasma": "plasma_generator",
    "gregtech:fusion_reactor.luv": "fusion_reactor",
    "susy:sieve_distillation_tower": "sieve_distillation",
    "susy:high_pressure_cryogenic_distillation_plant": "high_pressure_cryogenic_distillation",
    "susy:low_pressure_cryogenic_distillation_plant": "low_pressure_cryogenic_distillation",
    "susy:single_column_cryogenic_distillation_plant": "single_column_cryogenic_distillation",
    "susy:catalytic_reformer": "catalytic_reformer_recipes",
    "susy:vacuum_distillation_tower": "vacuum_distillation",
    "susy:froth_flotation_tank": "froth_flotation",
    "susy:heat_radiator": "radiator",
    "susy:high_temperature_distillation_tower": "high_temperature_distillation",
    "susy:fermentation_vat": "vat_fermentation",
    "susy:electric_discharge_machine": "edm",
    "susy:basic_steam_turbine": "large_steam_turbine",
    "susy:pressure_swing_adsorber": "pressure_swing_adsorption",
    "susy:multi_stage_flash_distiller": "multi_stage_flash_distillation",
    "susy:greenhouse": "greenhouse_plant",
    "susy:lunar_bucket_wheel_excavator": "lunar_bwe"
};

export async function readPackLocales(instance) {
    const names = new Map();
    const readNames = text => {
        for (const [, key, name] of text.matchAll(/^([^#=\s]+)=(.+)$/gm)) {
            names.set(key, name.trim());
        }
    };

    const mods = path.join(instance, "mods");
    for (const jar of (await fs.readdir(mods)).sort()) {
        if (!jar.endsWith(".jar")) continue;
        try {
            const { stdout } = await unzip("unzip", ["-p", path.join(mods, jar), "assets/*/lang/en_us.lang"]);
            readNames(stdout);
        } catch (err) {
            if (err.code !== 11) throw err; // This jar has no English language file.
        }
    }
    readNames(await fs.readFile(path.join(instance, "resources/langfiles/lang/en_us.lang"), "utf8"));
    return names;
}

export function resolveMachineMaps(dataset, raw, locale) {
    const byId = new Map();
    const byName = new Map();
    for (const [id, map] of Object.entries(raw.recipemaps ?? {})) {
        const entry = { id, label: locale.get(map.translationKey), machines: new Map() };
        byId.set(id, entry);
        byName.set(mapKey(id.split(".").pop()), entry);
    }

    const items = new Map((raw.items ?? [])
        .filter(item => item.translationKey && item.itemClass?.includes("MachineItemBlock"))
        .map(item => [item.translationKey, item]));
    for (const [id, machine] of Object.entries(raw.gtMTEs ?? {})) {
        const controllerMap = machine.isController ? controllerMaps[id] ?? id.split(":").pop() : null;
        const entry = byId.get(machine.recipemapName ?? controllerMap);
        const item = items.get(machine.metaName);
        if (!entry || !item) continue;
        const resource = {
            kind: "item",
            id: item.metadata ? `${item.resource}@${item.metadata}` : item.resource,
            displayName: item.displayName
        };
        entry.machines.set(resource.id, resource);
        if (machine.isController) entry.controller = resource;
    }

    const originalIcons = new Map((dataset.recipeMapIcons ?? []).map(entry => [entry.recipeMap, entry.resource]));
    const types = new Set(dataset.recipes.map(recipe => recipe.machineType));
    const labels = new Map();
    for (const type of types) {
        const label = byName.get(mapKey(type))?.label ?? type;
        labels.set(label, (labels.get(label) ?? 0) + 1);
    }

    const resolved = new Map();
    for (const type of types) {
        const map = byName.get(mapKey(type));
        let label = map?.label ?? type;
        const resource = map?.machines.get(originalIcons.get(type)?.id) ?? map?.controller ?? map?.machines.values().next().value;
        // The furnace tabs share a translation. The plant names include their full controller title.
        if (map?.controller?.displayName && (labels.get(label) > 1 || map.id.endsWith("_cryogenic_distillation"))) {
            label = map.controller.displayName;
        }
        resolved.set(type, { label, resource });
    }
    return resolved;
}
