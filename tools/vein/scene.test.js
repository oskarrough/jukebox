import { expect, test } from 'bun:test'
import { renderSVG } from './scene.js'
import { INKS, NAMED, PALETTES, hexToRgb, paletteByName, snapToInks } from './palettes.js'

// SHA-256 of the original CLI's SVG bytes, captured before cleanup.
for (const [palette, seed, digest] of [
	['vallotton', 1, '7eb5a03d558f3444b6d529f9958ea7198bb880230668a67007759ac58fec74bc'],
	['vallotton', 12, '7b39f5923c1319c1341780e485aefd21c94423a5b3c5411145d05d7ca3a6bb22'],
	['vallotton', 4417, 'c05ae4634fafffa2d3a218a9267ef3afe82680e61fde8f0fb7c367fac15a4a50'],
	['jukebox', 1, '715476ce786d0c166f7cd037a168eb7a01e35154c6428dece7756316e138dff8'],
	['jukebox', 12, 'c87bf982bd64e8ed2804242f3cc4ff3b6784ab23ac753502576db952cc9e0290'],
	['jukebox', 4417, '4f3c6ef350dbe2827a2d9b008c0fb630bf27e03d5e4ab632d3f5769ba1741645'],
]) {
	test(`${palette}, seed ${seed}: original SVG bytes`, () => {
		const svg = renderSVG({ palette: NAMED[palette], seed })
		expect(new Bun.CryptoHasher('sha256').update(svg).digest('hex')).toBe(digest)
	})
}

test('each render starts from defaults, not the previous render', () => {
	const original = renderSVG()
	renderSVG({ palette: NAMED.vallotton, width: 320, height: 180, seed: 12, flow: 'swirl', levels: 3, stars: 0 })
	expect(renderSVG()).toBe(original)
})

test('explicit dimensions keep their aspect ratio and precision', () => {
	expect(renderSVG({ width: 1200, ratio: '4:3' })).toContain('viewBox="0 0 1200 900"')
	expect(renderSVG({ height: 900, ratio: '4:3' })).toContain('viewBox="0 0 1200 900"')
	expect(renderSVG({ width: 300, height: 200 })).toContain('viewBox="0 0 300 200"')
})

test('drifting frames and the three flows produce distinct pictures', () => {
	const motion = { on: true, amount: 1, frames: 8 }
	expect(renderSVG({ motion, frame: 0 })).not.toBe(renderSVG({ motion, frame: 1 }))
	expect(new Set(['marble', 'swirl', 'iso'].map((flow) => renderSVG({ flow }))).size).toBe(3)
})

test('every palette and individual ink renders with stars and edges', () => {
	for (const palette of [...Object.values(NAMED), ...PALETTES, ...Object.values(INKS).map((ink) => [ink])]) {
		const svg = renderSVG({ palette, stars: 1, edges: 1 })
		expect(svg).toContain('<path ')
		expect(svg).not.toMatch(/NaN|undefined/)
	}
	expect(new Set(Object.values(INKS)).size).toBe(Object.keys(INKS).length)
})

test('palette lookup and snapping accept names and short or full hexes', () => {
	expect(paletteByName('vallotton')).toEqual(NAMED.vallotton)
	expect(paletteByName('vein-2')).toEqual(PALETTES[2])
	expect(paletteByName('ink-pink')).toEqual([INKS['ink-pink']])
	expect(paletteByName('#abc, #123456')).toEqual(['#abc', '#123456'])
	expect(hexToRgb('#abc')).toEqual([170, 187, 204])
	expect(snapToInks(['#1e1916', '#ff65a5'])).toEqual([INKS['ink-black'], INKS['ink-pink']])
	expect(() => paletteByName('vein-99')).toThrow()
	expect(() => paletteByName('not-a-palette')).toThrow()
})
