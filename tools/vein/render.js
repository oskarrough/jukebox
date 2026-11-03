#!/usr/bin/env bun
/**
 * Render vein art to SVG from the command line. No browser, no network.
 *
 *   bun tools/vein/render.js --palette vallotton --seed 12 --out vein.svg
 *   bun tools/vein/render.js --palette '#232d95,#fe675c,#fffada' --width 1200
 *   bun tools/vein/render.js --list
 *
 * Flags mirror the page's dials: --flow marble|swirl|iso,
 * --levels, --curve, --scale, --tiger, --edges, --stars, --tints, --runs,
 * --ratio 3:4|1:1|4:3|16:9|9:16|5:4|3:2|4:5.
 *
 *   --width N | --height N   explicit dimensions; --size N sets the width
 *   --frames N               N stills of a drifting field, written as out-01.svg …
 *   --snap                   snap the palette onto the jukebox ink set
 */

import { renderSVG, DEFAULTS, RATIOS } from './scene.js'
import { INKS, NAMED, PALETTES, paletteByName, snapToInks } from './palettes.js'

const args = process.argv.slice(2)

function arg(name, fallback) {
	const i = args.indexOf(`--${name}`)
	if (i === -1) return fallback
	const v = args[i + 1]
	return v === undefined || v.startsWith('--') ? true : v
}

if (args.includes('--help') || args.includes('-h')) {
	console.log(
		[
			'bun tools/vein/render.js --palette vallotton --seed 12 --out vein.svg',
			'',
			'palettes: ' + [...Object.keys(NAMED), ...PALETTES.map((_, i) => `vein-${i}`)].join(', '),
			'ratios:   ' + RATIOS.map((r) => r.id).join(', '),
			'inks:     --palette ink-pink; --snap to nearest pencil inks (see --list)',
			'flow:     --flow marble|swirl|iso',
			'dials:    --seed --levels --curve --scale --tiger --edges --stars --tints --runs',
			'size:     --width N --height N, or --size N with --ratio',
			'frames:   --frames N --out drift.svg writes drifting stills',
		].join('\n'),
	)
	process.exit(0)
}

if (args.includes('--list')) {
	console.log('palettes')
	for (const [name, pal] of Object.entries(NAMED)) console.log(`  ${name.padEnd(12)} ${pal.join(' ')}`)
	PALETTES.forEach((pal, i) => console.log(`  vein-${String(i).padEnd(7)} ${pal.join(' ')}`))
	console.log('\ninks')
	for (const [name, hex] of Object.entries(INKS)) console.log(`  ${name.padEnd(18)} ${hex}`)
	console.log('\nratios')
	for (const r of RATIOS) console.log(`  ${r.id.padEnd(6)} ${r.w}x${r.h}`)
	process.exit(0)
}

const paletteArg = arg('palette', null)
if (paletteArg === true) throw new Error('--palette needs a name or hex list')
let palette = paletteArg ? paletteByName(paletteArg) : DEFAULTS.palette
if (arg('snap', false) === true) palette = snapToInks(palette)

const num = (name, fallback) => {
	const v = arg(name, null)
	if (v === null) return fallback
	if (v === true || !Number.isFinite(Number(v))) throw new Error(`--${name} needs a number`)
	return Number(v)
}

const options = {
	palette,
	seed: num('seed', DEFAULTS.seed),
	ratio: arg('ratio', DEFAULTS.ratio),
	flow: arg('flow', DEFAULTS.flow),
	levels: num('levels', DEFAULTS.levels),
	curve: num('curve', DEFAULTS.curve),
	scale: num('scale', DEFAULTS.scale),
	tiger: num('tiger', DEFAULTS.tiger),
	edges: num('edges', DEFAULTS.edges),
	stars: num('stars', DEFAULTS.stars),
	tints: num('tints', DEFAULTS.tints),
	runs: num('runs', DEFAULTS.runs),
	size_px: num('size', DEFAULTS.size_px),
}
const width = num('width', null)
const height = num('height', null)
if (width != null || height != null) {
	options.width = width
	options.height = height
	delete options.size_px
}

if (!RATIOS.some((ratio) => ratio.id === options.ratio)) throw new Error('Unknown ratio')
if (!['marble', 'swirl', 'iso'].includes(options.flow)) throw new Error('Unknown flow: use marble, swirl or iso')
for (const dimension of [options.width, options.height, options.size_px])
	if (dimension != null && dimension <= 0) throw new Error('Dimensions must be positive')

const out = arg('out', null)
const frames = num('frames', 0)

async function write(name, svg) {
	await Bun.write(name, svg)
	console.log(`${name}  ${(svg.length / 1024).toFixed(0)} kB`)
}

if (frames > 1) {
	const base = typeof out === 'string' ? out.replace(/\.svg$/i, '') : 'vein'
	options.motion = { on: true, amount: 1, frames }
	for (let f = 0; f < frames; f++) {
		const svg = renderSVG({ ...options, frame: f })
		await write(`${base}-${String(f + 1).padStart(2, '0')}.svg`, svg)
	}
} else {
	const svg = renderSVG(options)
	if (typeof out === 'string') await write(out, svg)
	else console.log(svg)
}
