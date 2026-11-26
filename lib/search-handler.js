import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { search } from "./search.js";
import { buildDepths } from "./ranking.js";

export function createSearchHandler(pack) {
    const sources = new Map();

    function loadSource(dataset) {
        if (!sources.has(dataset)) {
            const index = JSON.parse(gunzipSync(readFileSync(path.join(process.cwd(), "search-data", `${dataset}.json.gz`))));
            const machineTypes = pack === "susy" ? new Map(Object.entries(index.machineAliases ?? {})) : null;
            if (machineTypes) {
                for (const item of index.i) {
                    for (const name of item[6]) machineTypes.set(name.toLowerCase(), name.toLowerCase());
                }
            }
            sources.set(dataset, {
                items: index.i,
                aliases: index.a,
                machineTypes,
                depth: buildDepths(index),
                getRecipes: id => index.recipes[id] ?? [],
                getUses: id => index.uses[id] ?? []
            });
        }

        return sources.get(dataset);
    }

    return async function handler(req, res) {
        const params = new URL(req.url, "https://codex.invalid").searchParams;
        const mode = pack === "nomi" && params.get("mode") === "expert" ? "expert" : "normal";
        const dataset = pack === "susy" ? pack : mode;

        const send = (data, status) => {
            res.statusCode = status;
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(JSON.stringify(data));
        };

        let source;

        try {
            source = loadSource(dataset);
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
            return send({ error: "recipe dataset unavailable" }, 503);
        }

        const { status, body } = await search({ q: params.get("q"), mode, uses: params.get("uses") === "1" }, source);
        return send(body, status);
    };
}
