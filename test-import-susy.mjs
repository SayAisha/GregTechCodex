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
            outputs: [{ ...dust, amount: 2, chance: 0.3 }]
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
    assert.equal(recipe.items[2].probability, 0.3);
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
    const { binary } = compileSusy(dataset, [{
        type: "shaped", registryName: id, recipe: { keymap: { A: {}, B: {} }, shape: ["A A", " B "] }
    }]);
    const repo = Repository.load(binary.buffer.slice(binary.byteOffset, binary.byteOffset + binary.byteLength));
    const recipe = repo.GetById("r:craft-tool");

    assert.deepEqual([...recipe.recipeType.dimensions].slice(0, 2), [3, 2]);
    assert.deepEqual(recipe.items.filter(io => io.type === Io.ItemInput).map(io => [io.slot, io.goods.id]), [
        [0, "i:susy:plank"], [2, "i:susy:plank"], [4, "i:susy:stick"]
    ]);
    assert.equal(recipe.gtRecipe, null);
});
