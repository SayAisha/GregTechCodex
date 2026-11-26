# GregTechCodex

An unofficial recipe browser for [NomiFactory CEu](https://github.com/Nomi-CEu/Nomi-CEu) and [SuperSymmetry](https://github.com/SymmetricDevs/Supersymmetry). Select a pack in the toolbar. NomiFactory CEu has normal and expert modes.

## Features

- Search exported items and fluids and browse their recipes
- Machine recipes with EU/t, duration, voltage tier, heat and chance outputs
- Multiblock and singleblock machines per recipe type
- **Extended Crafting** supports basic/advanced/elite/ultimate tables
- Built-in overclock calculator (ported from the `oceu` Leveret tag) with automatic
  recipe kind detection (standard, EBF heat, LCR perfect OC)
- Light and dark themes

## Recipe API

| Pack | Search | Card renderer |
| --- | --- | --- |
| NomiFactory CEu | `/api/nomi/search?q=steel%20ingot` | `/api/nomi/shot` |
| SuperSymmetry | `/api/susy/search?q=steel%20ingot` | `/api/susy/shot` |

The existing Nomi routes at `https://nomi-codex.vercel.app/api/search` and `https://nomi-codex.vercel.app/api/shot` are available for existing integrations. Use `uses=1` for recipes that consume an item. The card renderer accepts the item ID, a one-based recipe number `r`, and `format=json` for a link to the card.

For an El Levert JavaScript tag named `rp` on a SuperSymmetry server, use [tags/susy-rp.js](tags/susy-rp.js).

## Rebuild the SuperSymmetry dataset

Use the [SuSy Factory Flow dataset pipeline](https://github.com/SymmetricDevs/susy-factory-flow) with the corresponding release, including the Oracle's rendered icon export. Import the normalized `recipes.json` after texture enrichment, then rebuild the search index.

```sh
node import-susy.mjs /path/to/recipes.json /path/to/textures/rendered /path/to/recipedump.json
node rebuild-search-data.mjs susy
npm test
```

The importer keeps item variants, ingredient alternatives, recipe links, and rendered icons in the shared browser format. It reads the crafting grid from `recipedump.json` so repeated ingredients and empty slots stay in place. It reports any recipes it can't represent. Search and cards use the same imported dataset.

## Credits

GregTechCodex uses data and tools from these projects.

- **[NomiFactory CEu](https://github.com/Nomi-CEu/Nomi-CEu)** - the modpack this browses.
  All items, recipes and content belong to its team and the mod authors.
- **[GTNH Calculator](https://github.com/ShadowTheAge/gtnh)** by ShadowTheAge - the site's
  codebase, data format and NEI-style interface were adapted from this project.
- **[susy-factory-flow](https://github.com/SymmetricDevs/susy-factory-flow)** by
  SymmetricDevs - the in game icon rendering pipeline used to capture every item texture.

## Disclaimer

Unofficial, fan made tool. Not affiliated with, endorsed by, or sponsored by the
NomiFactory CEu team, GTCEu, or any mod authors. Minecraft, NomiFactory CEu, and all
mods, items, names, and textures are the property of their respective owners. All rights
belong to their owners.
