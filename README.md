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

The existing Nomi routes at `https://nomi-codex.vercel.app/api/search` and `https://nomi-codex.vercel.app/api/shot` are available for existing integrations. Use `uses=1` for recipes that use an item as an input. The card renderer accepts the item ID, a one-based recipe number `r`, and `format=json` for a link to the card.

For an El Levert JavaScript tag named `rp` on a SuperSymmetry server, use [tags/susy-rp.js](tags/susy-rp.js).

## Rebuild the SuperSymmetry dataset

Use the [SuSy Factory Flow dataset pipeline](https://github.com/SymmetricDevs/susy-factory-flow) with the corresponding release, including the Oracle's rendered icon export. Import the normalized `recipes.json` after texture enrichment, then rebuild the search index.

```sh
node import-susy.mjs /path/to/recipes.json /path/to/textures/rendered /path/to/recipedump.json /path/to/pack/.minecraft
node rebuild-search-data.mjs susy
npm test
```

Use the same pack instance that produced the export. The importer reads the pack's English translations from its language files and mod JARs using `unzip`. It uses registered machine icons, expands wildcard ingredients to the exported variants, and reads the crafting grid from `recipedump.json`. Crop Farm cards label fractional harvests as averages per plant. Search and cards share the same imported data.

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
