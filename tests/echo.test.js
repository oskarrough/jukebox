import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { OPTIONS, compile, parse } from '../src/score.js'
import { suggest } from '../src/ui/complete.js'
import { HINTS } from '../src/ui/hints.js'

const song = (opts) => `voice rim rim ${opts}\npattern A\nrim | x... .... .... .... |\nloop A`

test('echo and tail parse as options, off by default', () => {
	expect(OPTIONS).toContain('echo')
	expect(OPTIONS).toContain('tail')
	expect(HINTS.echo).toBeTruthy()
	expect(HINTS.tail).toBeTruthy()
	const plain = parse(song('')).song.voiceMap.rim
	expect([plain.echo, plain.tail]).toEqual([0, 0.5])
	const { song: s, errors } = parse(song('echo=3 tail=0.4'))
	expect(errors).toEqual([])
	expect([s.voiceMap.rim.echo, s.voiceMap.rim.tail]).toEqual([3, 0.4])
	expect(suggest('voice a rim e', 13, { letter: 'C', acc: '', minor: false }).items.map((i) => i.word)).toContain('echo')
})

test('bad echo values give a plain error', () => {
	for (const bad of ['echo=lots', 'echo=-1', 'echo=17', 'tail=1', 'tail=x']) {
		const { errors } = parse(song(bad))
		expect(errors.length).toBeGreaterThan(0)
		expect(errors[0].msg).toMatch(/^(echo|tail) takes /)
		expect(errors[0].line).toBe(1)
	}
})

test('events say how long a step is only for voices with an echo', () => {
	const s = compile(`tempo 90\nvoice a rim echo=2\nvoice b rim\npattern A\na | x... .... .... .... |\nb | x... .... .... .... |\nloop A`)
	expect(s.errors).toEqual([])
	const [a, b] = s.loop.events
	expect(a.sd).toBeCloseTo(60 / 90 / 4)
	expect(b.sd).toBeUndefined()
})

test('an echo repeats the hit, one side then the other, and a song with one renders', () => {
	const folder = mkdtempSync(join(tmpdir(), 'jukebox-echo-'))
	try {
		const heard = (name, opts) => {
			const file = join(folder, `${name}.song`)
			writeFileSync(file, song(`rev=0 ${opts}`))
			const result = spawnSync('node', ['scripts/render.js', file], { encoding: 'utf8' })
			expect(result.status).toBe(0)
			const wav = readFileSync(join(folder, 'renders', `${name}.wav`))
			// PCM16 stereo at 44.1 kHz: the energy of each channel from `a` to `b` seconds
			const energy = (a, b) => {
				const sum = [0, 0]
				for (let i = Math.floor(a * 44100); i < Math.floor(b * 44100); i++)
					for (const c of [0, 1]) sum[c] += (wav.readInt16LE(44 + i * 4 + c * 2) / 32768) ** 2
				return sum
			}
			return energy
		}
		// A step is 0.125 s at the default tempo: echo=4 repeats every half second.
		const dry = heard('dry', '')
		const wet = heard('wet', 'echo=4 tail=0.6')
		expect(dry(0.45, 0.75)).toEqual([0, 0])
		expect(dry(0.95, 1.25)).toEqual([0, 0])
		const [l1, r1] = wet(0.45, 0.75)
		const [l2, r2] = wet(0.95, 1.25)
		expect(l1).toBeGreaterThan(0)
		expect(l1).toBeGreaterThan(r1 * 4)
		expect(r2).toBeGreaterThan(0)
		expect(r2).toBeGreaterThan(l2 * 4)
		// each one quieter than the last
		expect(r2).toBeLessThan(l1)
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
})
