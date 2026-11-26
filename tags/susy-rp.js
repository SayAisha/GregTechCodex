// GregTechCodex recipe tag for SuperSymmetry
// %t rp <item> [machine] [n] [--uses] [--light] [--list] [--page n]

const VERSION = "GregTechCodex";
const PACK = "SuperSymmetry 0.2.0.4";
const COLOR = 0xa78bfa;

const ORIGIN = "https://gregtechcodex.vercel.app";
const SEARCH_URL = ORIGIN + "/api/susy/search";
const SHOT_URL = ORIGIN + "/api/susy/shot";
const SITE_URL = ORIGIN + "/?pack=susy";

const SEARCH_TIMEOUT = 8000;
const SHOT_TIMEOUT = 11000;
const SHOT_WAIT = 9;

const PAGE_SIZE = 15;
const MAX_DESCRIPTION = 4000;

const NAV_WORDS = { next: 1, n: 1, more: 1, m: 1, prev: -1, p: -1, back: -1, b: -1 };

const TIER_WORD_REGEX = /(tier|mk|mark|level|stage|grade|class|rank|miner|miners)$/i;
const NAV_MARKER_REGEX = /⟨rp:([^|⟩]+)\|(r|p)(\d+)⟩/;
const HOT_INGOT_REGEX = /\bHot [^,(]+ Ingot\b/;

// --- formatting ---

function plain(text) {
    return String(text ?? "").replace(/<[^>]*>/g, "");
}

function seconds(ticks) {
    return ticks / 20;
}

function describeVariants(recipe) {
    const variants = recipe.variants ?? [];
    if (!variants.length) return "";

    const machines = [...new Set(variants.map(v => v.type).filter(type => type !== recipe.type))];
    if (machines.length) return ` • also ${machines.join(", ")}`;

    return ` • +${variants.length} variant${variants.length === 1 ? "" : "s"}`;
}


function describeRecipe(recipe) {
    let text = recipe.type + (recipe.itemName ? ` → **${recipe.itemName}**` : "");

    if (recipe.eu) text += ` • ${recipe.eu} EU/t`;
    text += ` • ${seconds(recipe.dur)}s`;
    if (recipe.tier && recipe.tier !== "?") text += ` (${recipe.tier})`;
    if (recipe.heat) text += ` • ${recipe.heat}K`;
    if (recipe.clean) text += " • cleanroom";
    if (recipe.circuit != null) text += ` • circuit ${recipe.circuit}`;
    if (recipe.averageYield) text += " • average yield per plant";

    return text + describeVariants(recipe);
}

function describeIO(inputs, outputs) {
    const from = inputs ? `from **${plain(inputs)}**` : "",
        to = outputs ? ` → **${plain(outputs)}**` : "";

    return from || to ? `\n  ${from}${to}` : "";
}

function describeUse(use) {
    let text = `makes **${plain(use.n)}** — ${use.t}`;

    if (use.e) text += ` • ${use.e} EU/t`;
    text += ` • ${seconds(use.d)}s`;
    if (use.circuit != null) text += ` • circuit ${use.circuit}`;
    if (use.averageYield) text += " • average yield per plant";
    if (use.i) text += ` from **${plain(use.i)}**`;

    return text;
}

function footer(mode, marker = "") {
    return { text: `${PACK} • ${mode} mode${marker ? " " + marker : ""}` };
}

function navMarker(query, kind, n) {
    return `⟨rp:${query}|${kind}${n}⟩`;
}

function reply(embed) {
    if (embed.description?.length > MAX_DESCRIPTION) {
        embed.description = embed.description.slice(0, MAX_DESCRIPTION - 1) + "…";
    }
    msg.reply({ embed: { color: COLOR, ...embed } });
}

function say(text) {
    reply({ description: text });
}

// --- argument parsing ---

function takeFlag(state, regex) {
    const match = state.text.match(regex);

    if (match) state.text = state.text.replace(match[0], " ");
    return match;
}

function parseArgs(raw) {
    const state = { text: ` ${raw} ` };

    const uses = takeFlag(state, /\s--uses?(?=\s)/) !== null,
        light = takeFlag(state, /\s--light(?=\s)/) !== null,
        list = takeFlag(state, /\s--list(?=\s)/) !== null;

    const page = takeFlag(state, /\s--page\s+(\d+)(?=\s)/);

    let query = state.text.replace(/\s+/g, " ").trim(),
        pick = -1;

    const pickMatch = query.match(/\s+(\d+)$/);

    if (pickMatch && !TIER_WORD_REGEX.test(query.slice(0, pickMatch.index))) {
        pick = parseInt(pickMatch[1], 10);
        query = query.slice(0, pickMatch.index);
    }

    return {
        query,
        pick,
        mode: "normal",
        uses,
        light,
        list,
        page: page ? Math.max(1, parseInt(page[1], 10)) : 1
    };
}

function stripPick(query) {
    const match = query.match(/\s+(\d+)\s*$/);
    return !match || TIER_WORD_REGEX.test(query.slice(0, match.index)) ? query : query.slice(0, match.index);
}

// --- network ---

function getJson(url, timeout) {
    const res = http.request({ method: "GET", url, timeout, responseType: "json" });

    if (res.status < 200 || res.status >= 300 || res.data === null || typeof res.data !== "object") {
        throw new Error(`HTTP ${res.status}`);
    }

    return res.data;
}

function search(query, mode, uses) {
    const params = `?q=${encodeURIComponent(query)}&mode=${mode}${uses ? "&uses=1" : ""}`;

    try {
        return getJson(SEARCH_URL + params, SEARCH_TIMEOUT);
    } catch {
        return null;
    }
}

function renderCard(itemId, mode, recipeNum, extra) {
    const url = `${SHOT_URL}?item=${encodeURIComponent(itemId)}&mode=${mode}&r=${recipeNum}${extra}&sel=card&format=json&wait=${SHOT_WAIT}`;

    try {
        const data = getJson(url, SHOT_TIMEOUT);
        return data.abs || null;
    } catch {
        return null;
    }
}

// --- views ---

function showHelp() {
    reply({
        description: [
            "**Search & view**",
            "`%t rp <item>` — list an item's recipes",
            "`%t rp <item> <n>` — show recipe #n as a card",
            "`%t rp <item> <machine>` — filter by machine (EBF, LCR, mixer, …)",
            "`%t rp <item> <machine> <n>` — one recipe from that machine",
            "",
            "**Uses**",
            "`%t rp <item> --uses` — recipes that consume the item",
            "`%t rp <item> --uses <n>` — show one use",
            "",
            "**Navigation**",
            "`%t rp next` / `prev` — next or previous page or recipe",
            "`%t rp p2` / `page 2` — jump to a page",
            "",
            "**Options**",
            "`--light` light card • `--list` always list"
        ].join("\n"),
        footer: { text: `${VERSION} • ${SITE_URL}` }
    });
}

function showNotFound(query, data) {
    const names = (data?.alternatives ?? []).map(alt => `**${alt.name}**`).join(", ");
    say(`:mag: No item found for \`${query}\`${names ? `\nDid you mean: ${names}` : ""}`);
}

function hotIngotHint(recipes, mode) {
    for (const recipe of recipes) {
        const match = plain(recipe.ins).match(HOT_INGOT_REGEX);
        if (match) return `\n*Smelted hot in the EBF: \`%t rp ${match[0].slice(4).toLowerCase()} ebf${mode === "expert" ? " --expert" : ""}\`*`;
    }

    return "";
}

function showList(item, recipes, args, raw, data) {
    const pages = Math.max(1, Math.ceil(recipes.length / PAGE_SIZE)),
        page = Math.min(args.page, pages),
        start = (page - 1) * PAGE_SIZE;

    const lines = recipes
        .slice(start, start + PAGE_SIZE)
        .map((recipe, i) => `\`${start + i + 1}\` ${describeRecipe(recipe)}${describeIO(recipe.ins, recipe.outs)}`);

    const base = raw.replace(/\s+--page\s+\d+/, "").trim();

    let description = lines.join("\n");

    if (pages > 1) description += `\n… page ${page} of ${pages} (${recipes.length} recipes)`;
    if (data.hotChain) description += `\n*:information_source: Showing the hot ingot — the ${data.machineFilter} step.*`;

    if (!recipes.some(recipe => recipe.role === "hot")) description += hotIngotHint(recipes, args.mode);
    description += `\n\n*Use \`%t rp ${base} <number>\` to view one${pages > page ? ` — \`%t rp next\` for page ${page + 1}` : ""}.*`;

    reply({
        title: plain(item.name) + (data.machineFilter ? ` (${data.machineFilter})` : ""),
        description,
        footer: footer(args.mode, navMarker(base, "p", page))
    });
}

function showRecipe(item, recipes, args, raw, data) {
    const recipe = recipes[args.pick - 1],
        recipeNum = recipe.idx != null ? recipe.idx + 1 : args.pick;

    const extra = (recipe.idx == null && data.machineFilter ? `&type=${encodeURIComponent(data.machineFilter)}` : "") + (args.light ? "&theme=light" : "");

    const description =
        `**${plain(item.name)}** — ${describeRecipe(recipe)}${describeIO(recipe.ins, recipe.outs)}` +
        `\n*recipe ${args.pick} of ${recipes.length}${data.machineFilter ? ` (${data.machineFilter})` : ""} • ${args.mode} mode*`;

    const card = renderCard(recipe.itemId ?? item.id, args.mode, recipeNum, extra);

    reply({
        title: plain(recipe.itemName ?? item.name),
        description: card ? description : `${description}\n:link: <${SITE_URL}#/item/${encodeURIComponent(item.id)}>`,
        image: card ? { url: card } : undefined,
        footer: footer(args.mode, navMarker(stripPick(raw), "r", args.pick))
    });
}

function showUses(item, uses, args, raw) {
    if (!uses.length) {
        return say(`:information_source: **${plain(item.name)}** isn't used as an input in any indexed recipe.`);
    }

    if (args.pick < 0 || args.list) {
        const lines = uses.slice(0, PAGE_SIZE).map((use, i) => `\`${i + 1}\` ${describeUse(use)}`),
            more = uses.length > PAGE_SIZE ? `\n… showing ${PAGE_SIZE} of ${uses.length}` : "";

        return reply({
            title: `Uses: ${plain(item.name)}`,
            description: `${lines.join("\n")}${more}\n\n*Use \`%t rp ${args.query} --uses <number>\` to view one.*`,
            footer: footer(args.mode)
        });
    }

    if (args.pick === 0 || args.pick > uses.length) {
        return say(`:warning: Use number must be 1–${uses.length}.`);
    }

    const use = uses[args.pick - 1];

    const extra = "&view=uses" + (args.light ? "&theme=light" : "");

    const description =
        `**${plain(item.name)}** ${describeUse(use)}\n*use ${args.pick} of ${uses.length} • ${args.mode} mode*`;

    const card = renderCard(item.id, args.mode, use.idx + 1, extra);

    reply({
        title: `Uses: ${plain(item.name)}`,
        description,
        image: card ? { url: card } : undefined,
        footer: footer(args.mode)
    });
}

function showMachineMiss(item, data, mode) {
    const types = (item.types ?? []).join(", "),
        others = (data.alternatives ?? []).filter(alt => alt.hasMachine).map(alt => `**${alt.name}**`).join(", ");

    say(
        `:information_source: **${plain(item.name)}** has no **${data.machineFilter}** recipes.` +
            (types ? `\nIt has recipes in: ${types}.` : "") +
            (others ? `\nThese have ${data.machineFilter} recipes: ${others}.` : "") +
            `\n*Use \`%t rp ${plain(item.name).toLowerCase()}${mode === "expert" ? " --expert" : ""}\` to list everything.*`
    );
}

// --- navigation ---

function findLastMarker() {
    let msgs = null;

    try {
        msgs = util.fetchMessages(msg.channelId, { limit: 25 });
    } catch {}

    for (const message of msgs ?? []) {
        for (const embed of message.embeds ?? []) {
            const text = embed.footer?.text;
            if (!text?.startsWith(PACK + " • ")) continue;
            const marker = NAV_MARKER_REGEX.exec(text);
            if (marker) return { query: marker[1], kind: marker[2], n: parseInt(marker[3], 10) };
        }
    }

    return null;
}

function resolveNavigation(text) {
    const word = text.toLowerCase();
    const pageMatch = word.match(/^(?:p|page)\s*(\d+)$/) ?? word.match(/^page\s+(next|more|prev|back)$/);

    if (!(word in NAV_WORDS) && !pageMatch) return null;

    const marker = findLastMarker();

    if (!marker) {
        say(":information_source: Nothing to continue — run a search like `%t rp steel ingot` first.");
        return "";
    }

    let n;

    if (pageMatch && /^\d+$/.test(pageMatch[1])) n = Math.max(1, parseInt(pageMatch[1], 10));
    else n = Math.max(1, marker.n + NAV_WORDS[pageMatch ? pageMatch[1] : word]);

    return marker.kind === "r" ? `${stripPick(marker.query)} ${n}` : `${marker.query} --page ${n}`;
}

// --- main ---

function main(raw) {
    raw = String(raw ?? "").trim();

    if (!raw || /^help$/i.test(raw)) return showHelp();

    const navigated = resolveNavigation(raw);
    if (navigated === "") return;
    if (navigated) return main(navigated);

    if (/(?:^|\s)--expert(?:\s|$)/.test(raw)) return say(":information_source: SuperSymmetry has one recipe mode.");

    const args = parseArgs(raw);

    if (!args.query) return say(":warning: Give me an item name.");

    const data = search(args.query, args.mode, args.uses);

    if (data === null) return say(":warning: The recipe search is unavailable. Try again in a moment.");
    if (data.error === "not found" || !data.item) return showNotFound(args.query, data);

    const item = data.item;

    if (args.uses) return showUses(item, data.uses ?? [], args, raw);

    const recipes = data.recipes ?? [];

    if (!recipes.length && data.machineFilter) return showMachineMiss(item, data, args.mode);
    if (!recipes.length) return say(`:information_source: **${plain(item.name)}** has no listed recipes.`);

    if (args.pick < 0 || args.list) {
        if (recipes.length === 1 && !args.list) args.pick = 1;
        else return showList(item, recipes, args, raw, data);
    }

    if (args.pick === 0 || args.pick > recipes.length) return say(`:warning: Recipe number must be 1–${recipes.length}.`);
    showRecipe(item, recipes, args, raw, data);
}

main(tag.args);
