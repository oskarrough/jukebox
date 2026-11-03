/**
 * Vein — cut-paper marbling, vendored with the author's permission.
 * From https://www.playgrnd.tools/vein; see README.md for provenance.
 * A warped noise field, sliced into filled contour paths.
 */
import { PALETTES, hexToRgb } from './palettes.js'

const TAU = Math.PI * 2

export const RATIOS = [
	{ id: '9:16', w: 9, h: 16 },
	{ id: '3:4', w: 3, h: 4 },
	{ id: '4:5', w: 4, h: 5 },
	{ id: '1:1', w: 1, h: 1 },
	{ id: '5:4', w: 5, h: 4 },
	{ id: '4:3', w: 4, h: 3 },
	{ id: '3:2', w: 3, h: 2 },
	{ id: '16:9', w: 16, h: 9 },
]

export const DEFAULTS = {
	seed: 4417,
	ratio: '3:4',
	flow: 'marble',
	scale: 0.5,
	curve: 0.6,
	levels: 9,
	tiger: 0.5,
	edges: 0.4,
	stars: 0.5,
	tints: 0.5,
	runs: 0.5,
	size_px: 1600,
	motion: { on: false, amount: 1, frames: 48 },
	frame: 0,
	palette: PALETTES[0],
}

function hash(x, y, s) {
	let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1274126177)
	n = Math.imul(n ^ (n >>> 13), 1274126177)
	n ^= n >>> 16
	return (n >>> 0) / 4294967296
}

function noise(x, y, s) {
	const xi = Math.floor(x),
		yi = Math.floor(y),
		xf = x - xi,
		yf = y - yi
	const u = xf * xf * (3 - 2 * xf),
		v = yf * yf * (3 - 2 * yf)
	const a = hash(xi, yi, s),
		b = hash(xi + 1, yi, s),
		c = hash(xi, yi + 1, s),
		d = hash(xi + 1, yi + 1, s)
	return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v
}

function random(seed) {
	let a = seed >>> 0 || 1
	return function () {
		a ^= a << 13
		a >>>= 0
		a ^= a >>> 17
		a >>>= 0
		a ^= a << 5
		a >>>= 0
		return a / 4294967296
	}
}

function rgbToHex(c) {
	return (
		'#' +
		[0, 1, 2]
			.map((i) =>
				Math.max(0, Math.min(255, Math.round(c[i])))
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	)
}

function tint(c, t) {
	if (t >= 0) {
		const k = Math.min(1, t)
		return [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k]
	}
	const k = Math.min(1, -t)
	return [c[0] * (1 - k * 0.9), c[1] * (1 - k * 0.9), c[2] * (1 - k * 0.9)]
}

function luminance(c) {
	return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

function contours(grid, gridWidth, gridHeight, t, cellSize, ox, oy) {
	/* the grid carries a one-cell border of -1, so every loop closes */
	const segments = new Map() /* edge id -> [edge id, edge id] */
	const points = new Map() /* edge id -> [x,y] */
	const edgeId = (i, j, side) => (j * gridWidth + i) * 2 + side /* side 0: top edge of cell, 1: left edge */
	const lerp = (a, b) => (t - a) / (b - a || 1e-9)
	const link = (a, b) => {
		let la = segments.get(a)
		if (!la) {
			la = []
			segments.set(a, la)
		}
		la.push(b)
		let lb = segments.get(b)
		if (!lb) {
			lb = []
			segments.set(b, lb)
		}
		lb.push(a)
	}
	for (let j = 0; j < gridHeight - 1; j++) {
		for (let i = 0; i < gridWidth - 1; i++) {
			const a = grid[j * gridWidth + i],
				b = grid[j * gridWidth + i + 1],
				c = grid[(j + 1) * gridWidth + i + 1],
				d = grid[(j + 1) * gridWidth + i]
			const code = (a >= t ? 8 : 0) | (b >= t ? 4 : 0) | (c >= t ? 2 : 0) | (d >= t ? 1 : 0)
			if (code === 0 || code === 15) continue
			const top = edgeId(i, j, 0),
				right = edgeId(i + 1, j, 1),
				bottom = edgeId(i, j + 1, 0),
				left = edgeId(i, j, 1)
			if (!points.has(top)) points.set(top, [(i + lerp(a, b)) * cellSize + ox, j * cellSize + oy])
			if (!points.has(right)) points.set(right, [(i + 1) * cellSize + ox, (j + lerp(b, c)) * cellSize + oy])
			if (!points.has(bottom)) points.set(bottom, [(i + lerp(d, c)) * cellSize + ox, (j + 1) * cellSize + oy])
			if (!points.has(left)) points.set(left, [i * cellSize + ox, (j + lerp(a, d)) * cellSize + oy])
			switch (code) {
				case 1:
				case 14:
					link(left, bottom)
					break
				case 2:
				case 13:
					link(bottom, right)
					break
				case 3:
				case 12:
					link(left, right)
					break
				case 4:
				case 11:
					link(top, right)
					break
				case 6:
				case 9:
					link(top, bottom)
					break
				case 7:
				case 8:
					link(top, left)
					break
				case 5:
					if ((a + b + c + d) * 0.25 >= t) {
						link(top, left)
						link(bottom, right)
					} else {
						link(top, right)
						link(left, bottom)
					}
					break
				case 10:
					if ((a + b + c + d) * 0.25 >= t) {
						link(top, right)
						link(left, bottom)
					} else {
						link(top, left)
						link(bottom, right)
					}
					break
			}
		}
	}
	/* trace the loops, smoothing each corner into a curve through the
     midpoints, so the cut edges read as paint and not as a grid */
	const seen = new Set()
	let d = ''
	const f = (v) => Math.round(v * 10) / 10
	for (const start of segments.keys()) {
		if (seen.has(start)) continue
		const loop = []
		let cur = start,
			prev = -1
		while (cur !== undefined && !seen.has(cur)) {
			seen.add(cur)
			loop.push(points.get(cur))
			const nb = segments.get(cur)
			const nx = nb[0] !== prev ? nb[0] : nb[1]
			prev = cur
			cur = nx
			if (cur === start) break
		}
		const n = loop.length
		if (n < 3) continue
		const m = (k) => {
			const p = loop[k % n],
				q = loop[(k + 1) % n]
			return [(p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5]
		}
		const s0 = m(0)
		d += 'M' + f(s0[0]) + ' ' + f(s0[1])
		for (let k = 1; k <= n; k++) {
			const p = loop[k % n],
				mm = m(k)
			d += 'Q' + f(p[0]) + ' ' + f(p[1]) + ' ' + f(mm[0]) + ' ' + f(mm[1])
		}
		d += 'Z'
	}
	return d
}

function scene(width, height, options) {
	const motion = options.motion
	const phase = (motion.on ? options.frame / motion.frames : 0) * TAU
	const raw = options.palette.length ? options.palette : PALETTES[0]
	const inks = raw.map(hexToRgb),
		inkCount = inks.length
	const unit = Math.sqrt(width * height)
	const seed = options.seed | 0
	const warpSeed = seed * 7 + 1,
		noiseSeed = seed * 7 + 2,
		stripeSeed = seed * 7 + 3

	/* Drift follows a circle so the final frame loops back to the first. */
	const ox = motion.on ? Math.cos(phase) * motion.amount * 0.25 : 0
	const oy = motion.on ? Math.sin(phase) * motion.amount * 0.25 : 0
	const curve = options.curve

	/* ---- the sheet, dealt once ---- */
	const r = random(Math.imul(seed, 2246822519) ^ 0x27d4eb2f)
	const angle = r() * TAU,
		cosAngle = Math.cos(angle),
		sinAngle = Math.sin(angle)
	const centerX = ((0.3 + r() * 0.4) * width) / unit,
		centerY = ((0.3 + r() * 0.4) * height) / unit
	const scale = 0.6 + options.scale * 1.6,
		flow = options.flow,
		tiger = options.tiger

	const field = (u, v) => {
		const wu = u + curve * 0.55 * (noise(u * 1.3 + ox + 3, v * 1.3 + oy + 1, warpSeed) - 0.5) * 2
		const wv = v + curve * 0.55 * (noise(u * 1.3 + oy + 8, v * 1.3 + ox + 5, warpSeed) - 0.5) * 2
		const n =
			0.6 * noise(wu * 2.4 * scale + 7, wv * 2.4 * scale + 2, noiseSeed) +
			0.3 * noise(wu * 5 * scale + 3, wv * 5 * scale + 9, noiseSeed) +
			0.1 * noise(wu * 11 * scale + 4, wv * 11 * scale + 6, noiseSeed)
		let fv
		if (flow === 'marble') {
			const p = wu * cosAngle + wv * sinAngle
			fv = 0.5 + 0.5 * Math.sin((p * 1.6 * scale + 2.4 * (n - 0.5)) * Math.PI)
		} else if (flow === 'swirl') {
			const dx = u - centerX,
				dy = v - centerY,
				d = Math.sqrt(dx * dx + dy * dy)
			const ang = curve * 4 * Math.exp((-d * d) / 0.16)
			const rx = centerX + dx * Math.cos(ang) - dy * Math.sin(ang),
				ry = centerY + dx * Math.sin(ang) + dy * Math.cos(ang)
			const p = rx * cosAngle + ry * sinAngle
			fv = 0.5 + 0.5 * Math.sin((p * 1.6 * scale + 2.0 * (n - 0.5)) * Math.PI)
		} else {
			const p = wv * 0.7 + wu * 0.15
			fv = 0.5 + 0.5 * Math.sin((p * 2.6 * scale + 1.4 * (n - 0.5)) * Math.PI)
		}
		/* the tiger stripes: where a slow mask says so, the level lines crowd */
		if (tiger > 0) {
			const m = noise(u * 1.5 + 9, v * 1.5 + 4, stripeSeed)
			const k = Math.max(0, Math.min(1, (m - 0.45) / 0.25))
			fv += tiger * k * 0.09 * Math.sin(fv * TAU * 5)
		}
		return fv
	}

	/* ---- the field, on a grid with a border of -1 ---- */
	const cellSize = unit / 150
	const gridWidth = Math.ceil(width / cellSize) + 3,
		gridHeight = Math.ceil(height / cellSize) + 3
	const grid = new Float32Array(gridWidth * gridHeight).fill(-1)
	for (let j = 1; j < gridHeight - 1; j++)
		for (let i = 1; i < gridWidth - 1; i++) grid[j * gridWidth + i] = field(((i - 1) * cellSize) / unit, ((j - 1) * cellSize) / unit)
	const at = (x, y) => {
		const i = Math.max(1, Math.min(gridWidth - 2, Math.round(x / cellSize) + 1)),
			j = Math.max(1, Math.min(gridHeight - 2, Math.round(y / cellSize) + 1))
		return grid[j * gridWidth + i]
	}

	/* ---- the levels: an ink and a tint each, the low ones dark ---- */
	const levelCount = Math.max(2, options.levels | 0)
	const dark = Math.max(1, Math.round(levelCount * 0.3))
	const colors = [],
		edgeInk = []
	let ink = 1 % inkCount,
		until = 0
	const runLength = 1 + options.runs * 3
	for (let k = 0; k < levelCount; k++) {
		if (k < dark) {
			colors.push(rgbToHex(tint(inks[0], k & 1 ? 0.12 : -0.2)))
			edgeInk.push(null)
			continue
		}
		if (k >= until) {
			let nx = 1 + ((hash(k, 4, seed) * (inkCount - 1)) | 0)
			if (nx === ink && inkCount > 2) nx = 1 + (nx % (inkCount - 1))
			ink = inkCount > 1 ? nx : 0
			until = k + 1 + Math.floor(hash(k, 5, seed) * runLength)
		}
		const t = (hash(k, 6, seed) - 0.5) * 2 * options.tints * 0.45
		colors.push(rgbToHex(tint(inks[ink], t)))
		edgeInk.push(
			inkCount > 1 && hash(k, 7, seed) < options.edges
				? rgbToHex(tint(inks[1 + ((ink + 1 + ((hash(k, 8, seed) * (inkCount - 2)) | 0)) % (inkCount - 1))], 0.25))
				: null,
		)
	}
	const items = []
	for (let k = 0; k < levelCount; k++) {
		const t = (k + 0.5) / levelCount
		const d = contours(grid, gridWidth, gridHeight, t, cellSize, -cellSize, -cellSize)
		if (!d) continue
		items.push({ d, fill: colors[k], stroke: edgeInk[k], sw: Math.max(0.6, unit * 0.0035) })
	}
	/* ---- the stars: over the dark ground only ---- */
	const stars = []
	const ns = Math.round(options.stars * 600)
	let light = inkCount > 1 ? 1 : 0
	for (let k = 1; k < inkCount; k++) if (luminance(inks[k]) > luminance(inks[light])) light = k
	for (let k = 0; k < ns; k++) {
		const x = hash(k, 11, seed) * width,
			y = hash(k, 12, seed) * height
		if (at(x, y) >= dark / levelCount) continue
		const ik = inkCount === 1 || hash(k, 13, seed) < 0.7 ? light : 1 + ((hash(k, 14, seed) * (inkCount - 1)) | 0)
		stars.push([x, y, unit * (0.0012 + hash(k, 15, seed) * 0.002), rgbToHex(tint(inks[ik], 0.4))])
	}
	return { ground: rgbToHex(inks[0]), items, stars }
}

/** One frame of vector: the whole picture as an <svg> string. */
export function renderSVG(options = {}) {
	const settings = { ...DEFAULTS, ...options, motion: { ...DEFAULTS.motion, ...options.motion } }
	const ratio = RATIOS.find((ratio) => ratio.id === settings.ratio) || RATIOS[1]
	const customSize = Boolean(settings.width || settings.height)
	const width = settings.width || (settings.height ? Math.round((settings.height * ratio.w) / ratio.h) : settings.size_px)
	const height = settings.height || Math.round((width * ratio.h) / ratio.w)
	const picture = scene(width, height, settings)
	const round = (value) => Math.round(value * 10) / 10
	let paths = ''
	for (const path of picture.items) {
		// Keep the original size-based rounding and explicit-dimension precision.
		const strokeWidth = customSize ? path.sw : round(path.sw)
		paths += `<path d="${path.d}" fill="${path.fill}" fill-rule="evenodd"${path.stroke ? ` stroke="${path.stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"` : ''}/>`
	}
	let inner = `<rect width="${width}" height="${height}" fill="${picture.ground}"/><g>${paths}</g>`
	if (picture.stars.length)
		inner +=
			'<g>' +
			picture.stars
				.map(([x, y, radius, fill]) => `<circle cx="${round(x)}" cy="${round(y)}" r="${round(radius)}" fill="${fill}"/>`)
				.join('') +
			'</g>'
	// The size-based SVGs historically include this namespace; preserve their bytes.
	const namespace = customSize ? '' : ' xmlns:xlink="http://www.w3.org/1999/xlink"'
	return `<svg xmlns="http://www.w3.org/2000/svg"${namespace} width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${inner}</svg>`
}
