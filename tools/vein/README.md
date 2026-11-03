# Vein

Standalone contour art: a warped noise field, cut into bands and painted as SVG.

## Use it

With the jukebox dev server running, open [the controls](http://localhost:5199/@fs/home/osk/sites/jukebox/tools/vein.html).
Drag the dials, pick a palette or pencil ink, then download the SVG.
Solid currently intercepts `/tools/vein.html`; the link uses Vite's `/@fs/<absolute-checkout>/tools/vein.html` route.

```sh
bun tools/vein/render.js --palette vallotton --seed 12 --out cover.svg
bun tools/vein/render.js --palette '#232d95,#fe675c,#fffada' --width 1200 --ratio 1:1
bun tools/vein/render.js --list
bun tools/vein/render.js --frames 8 --out drift.svg # drift-01.svg …
```

From code, `scene.js` exports `renderSVG(options)`; each call starts from `DEFAULTS`.
`palettes.js` supplies the named palettes, pencil inks and `paletteByName(name)`.
Palette colours are tinted per band; `--snap` first picks their nearest pencil inks.

## Options

`palette` (hex array), `seed`, `ratio`, `flow` (`marble`, `swirl`, `iso`),
`levels`, `curve`, `scale`, `tiger`, `edges`, `stars`, `tints`, `runs`,
and `width`/`height` or `size_px` (width, with height set by the ratio).
`motion: { on: true, amount: 1, frames: 48 }` plus `frame` selects a drifting still.
The CLI uses the same dial names; `--size` sets `size_px`.

## Provenance

Vendored with the original author's permission from [Vein](https://www.playgrnd.tools/vein).
This is a standalone adaptation of its served bundle, decompiled into readable source;
it is not the upstream source and does not track upstream updates.
