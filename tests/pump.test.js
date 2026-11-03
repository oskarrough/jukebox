import { expect, test } from 'bun:test'
import { OPTIONS, compile, parse } from '../src/score.js'
import { render } from '../scripts/render.js'
import { suggest } from '../src/ui/complete.js'
import { HINTS } from '../src/ui/hints.js'

const song = (opts, kick = 'voice kick kick vol=0.01') =>
	`tempo 120\nreverb 0\nvoice pad sine vol=0.5 rev=0 ${opts}\n${kick}\npattern A\npad | C4--------------- |\nkick | x... .... .... .... |\nloop A`

test('pump parses as an option, off by default, and is suggested and explained', () => {
	expect(OPTIONS).toContain('pump')
	expect(HINTS.pump).toBeTruthy()
	expect(parse(song('')).song.voiceMap.pad.pump).toBe(0)
	const { song: s, errors } = parse(song('pump=0.6'))
	expect(errors).toEqual([])
	expect(s.voiceMap.pad.pump).toBe(0.6)
	expect(suggest('voice a pad p', 13, { letter: 'C', acc: '', minor: false }).items.map((i) => i.word)).toContain('pump')
})

test('bad pump values and a song with no kick give a plain error', () => {
	for (const bad of ['pump=lots', 'pump=-0.1', 'pump=1.5']) {
		const { errors } = parse(song(bad))
		expect(errors[0].msg).toBe('pump takes 0 to 1, how far the kick ducks it')
		expect(errors[0].line).toBe(3)
	}
	const none = parse(song('pump=0.5', 'voice snare snare')).errors
	expect(none.map((e) => e.msg)).toEqual(['pump needs a voice that plays kick'])
	expect(parse(song('pump=0.5', 'voice kick kick pump=0.5')).errors.map((e) => e.msg)).toContain('A kick cannot pump itself')
})

test('kick events say how long a beat is only when a voice pumps', () => {
	const kicks = (opts) => compile(song(opts)).loop.events.filter((e) => e.v === 1)
	expect(kicks('pump=0.5')[0].bt).toBeCloseTo(0.5)
	expect(kicks('')[0].bt).toBeUndefined()
})

test('a pumping voice ducks right after the kick and swells back over a beat', async () => {
	const rms = (ch, a, b) => {
		let e = 0
		for (const c of ch) for (let i = Math.floor(a * 44100); i < Math.floor(b * 44100); i++) e += c[i] * c[i]
		return Math.sqrt(e / (ch.length * (b - a) * 44100))
	}
	const plain = await render(compile(song('')), 1.5)
	const pumped = await render(compile(song('pump=0.8')), 1.5)
	// 0.8 leaves a fifth of the level just after the kick; a beat later it is back
	const ducked = rms(pumped, 0.03, 0.08) / rms(plain, 0.03, 0.08)
	expect(ducked).toBeGreaterThan(0.15)
	expect(ducked).toBeLessThan(0.45)
	const back = rms(pumped, 0.4, 0.5) / rms(plain, 0.4, 0.5)
	expect(back).toBeGreaterThan(0.9)
	expect(rms(pumped, 0.03, 0.08)).toBeLessThan(rms(pumped, 0.3, 0.4))
	// before the first kick there is nothing to duck, and a voice without pump is untouched
	expect(rms(pumped, 0.9, 1.0) / rms(plain, 0.9, 1.0)).toBeGreaterThan(0.95)
})
