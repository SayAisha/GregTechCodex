import path from "node:path";

export const wildcard = "@32767";
export const goodsId = ({ kind, id }) => `${kind === "fluid" ? "f" : "i"}:${id}`;
const nameSlug = name => name.toLowerCase().replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const words = name => name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").replace(/\b[a-z]/g, c => c.toUpperCase());

export function resolveResources(resources, rawItems, locales) {
    const catalog = new Map(resources.map(resource => [goodsId(resource), resource]));
    const itemNames = new Map();
    for (const [key, name] of locales) {
        if (key.endsWith(".name") && !name.includes("%")) itemNames.set(nameSlug(name), name);
    }

    for (const [id, resource] of catalog) {
        if (!resource.iconPath || (resource.displayName && resource.displayName !== resource.id)) continue;
        // The Oracle uses the in-game display name for the filename's stem.
        const stem = path.basename(resource.iconPath).replace(/-[0-9a-f]{12}\.png$/, "");
        if (stem !== nameSlug(resource.id)) {
            const displayName = itemNames.get(stem) ?? words(stem);
            catalog.set(id, { ...resource, displayName });
        }
    }

    const families = new Map(resources.filter(resource => resource.kind === "item" && resource.id.endsWith(wildcard))
        .map(resource => [resource.id.slice(0, -wildcard.length), []]));
    for (const item of rawItems) {
        const family = families.get(item.resource);
        if (!family || !item.displayName || Number(item.metadata) === 32767) continue;
        const id = item.metadata ? `${item.resource}@${item.metadata}` : item.resource;
        const resource = { kind: "item", id, displayName: item.displayName };
        const known = catalog.get(goodsId(resource));
        if (!known || !known.displayName || known.displayName === id) catalog.set(goodsId(resource), { ...known, ...resource });
        family.push(catalog.get(goodsId(resource)));
    }

    const variants = new Map();
    for (const [base, family] of families) {
        if (!family.length) continue;
        const id = base + wildcard;
        const names = [...new Set(family.map(item => item.displayName))];
        const label = names.length <= 2 ? names.join(" or ") : names[0] + " and other variants";
        catalog.set("i:" + id, { ...catalog.get("i:" + id), displayName: label });
        variants.set(id, family);
    }
    return { catalog, variants };
}

export function resolveIngredient(slot, variants) {
    const choices = slot.accepted ?? [slot];
    const aliases = choices.filter(item => variants.has(item.id));
    if (!aliases.length) return { choices, aliases };

    const expanded = new Map();
    for (const item of choices) {
        for (const variant of variants.get(item.id) ?? [item]) expanded.set(goodsId(variant), variant);
    }
    const label = slot.groupId ? words(slot.groupId.replace(/^oredict:/, "")) : null;
    return { choices: [...expanded.values()], aliases, label };
}
