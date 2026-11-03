/**
 * Opening palettes from Vein and hex conversions of the jukebox's
 * Caran d'Ache tokens in src/App.css.
 */

export const PALETTES = [
	['#0E1A2B', '#2E63B8', '#7FA8E0', '#E9DCC3', '#F2892B', '#E0362F', '#2FA39A', '#8B5A2B'],
	['#12102A', '#FF3D7A', '#3DE0FF', '#F2F2F0', '#FFB020', '#00E5A8', '#7B5CFF'],
	['#1B1B1B', '#F5F1E8', '#E63946', '#1D3557', '#F1C40F', '#2A9D8F', '#E76F51'],
	['#2B1B4A', '#7B2CBF', '#F26CA7', '#FFD6EA', '#4CE0D2', '#FFB347', '#3B5BFF'],
	['#0B2E2A', '#00C2A8', '#FFE45C', '#FFFBD6', '#FF6B6B', '#4D96FF', '#F4A261'],
	['#F4EFE3', '#1D3557', '#E63946', '#F1C40F', '#2A9D8F', '#6C8DB5', '#8B5A2B'],
]

export const INKS = {
	'ink-black': '#1e1916',
	'ink-snow': '#fffada',
	'ink-naples': '#ffcb63',
	'ink-vermilion': '#e3372a',
	'ink-carmine': '#c60925',
	'ink-sepia': '#644932',
	'ink-french-blue': '#01437f',
	'ink-viridian': '#006d4e',
	'ink-ultramarine': '#232d95',
	'ink-teal': '#54bfad',
	'ink-linden': '#e4e837',
	'ink-violet': '#951d6e',
	'ink-chrome-yellow': '#ffc500',
	'ink-cobalt-green': '#00a374',
	'ink-pink': '#ff65a5',
	'ink-heliotrope': '#a183ba',
	'ink-raw-umber': '#785d2e',
	'ink-burnt-sienna': '#a64d30',
	'ink-sky-blue': '#4b93bf',
}

/* Vallotton flat planes: warm light, hot accents, cool shadows. */
export const NAMED = {
	vallotton: ['#fffada', '#ffcb63', '#e3372a', '#c60925', '#644932', '#1e1916', '#01437f', '#006d4e'],
	/* the jukebox set with its own accent kept */
	jukebox: ['#232d95', '#255077', '#fe675c', '#fffada', '#e52f5c', '#e4e837', '#951d6e'],
	/* Dark ground with warm and cool accents. */
	ink: ['#1e1916', '#fffada', '#ff631e', '#01437f', '#006d4e', '#e3372a', '#ffcb63'],
}

/* Snap by squared RGB distance, keeping palette order. */
export function snapToInks(palette) {
	return palette.map((hex) => {
		const [r, g, b] = hexToRgb(hex)
		let best = null
		let bestD = Infinity
		for (const ink of Object.values(INKS)) {
			const [ir, ig, ib] = hexToRgb(ink)
			const d = (r - ir) ** 2 + (g - ig) ** 2 + (b - ib) ** 2
			if (d < bestD) {
				bestD = d
				best = ink
			}
		}
		return best
	})
}

export function hexToRgb(hex) {
	let h = hex.replace('#', '')
	if (h.length === 3)
		h = h
			.split('')
			.map((digit) => digit + digit)
			.join('')
	return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}

/** Resolve a named palette, a single ink, or a comma-separated hex list. */
export function paletteByName(name) {
	if (Object.hasOwn(NAMED, name)) return NAMED[name]
	if (Object.hasOwn(INKS, name)) return [INKS[name]]
	if (/^vein-\d+$/.test(name)) {
		const palette = PALETTES[Number(name.slice(5))]
		if (palette) return palette
	}
	const colors = name.split(',').map((color) => color.trim())
	if (colors.every((color) => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color))) return colors
	throw new Error(`Unknown palette or invalid hex list: ${name}`)
}
