import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { bars, measure, sections, wav } from '../scripts/render.js'
import { compile } from '../src/score.js'

test('levels include both channels, silence and clipping before PCM clamping', () => {
	const channels = [new Float32Array([0, 2]), new Float32Array([0, -2])]
	expect(measure(channels)).toEqual({ peak: 2, energy: 8, rms: Math.sqrt(2), clipped: 2 })
	expect(measure(channels, 0, 1).rms).toBe(0)
	expect(() => measure([new Float32Array([NaN])])).toThrow('non-finite')
	const buffer = wav(channels)
	expect(buffer.readUInt32LE(40)).toBe(8)
	expect(buffer.readInt16LE(48)).toBe(32767)
	expect(buffer.readInt16LE(50)).toBe(-32768)
})

test('bar windows follow pattern tempo changes and repeated loops', () => {
	const song = compile(`voice a sine
pattern intro
tempo 120
a | C4--------------- |
pattern A
tempo 60
a | C4--------------- |
play intro
loop A`)
	expect(song.errors).toEqual([])
	expect(bars(song, 11)).toEqual([
		[0, 2],
		[2, 6],
		[6, 10],
		[10, 11],
	])
})

test('pattern windows preserve play order, repetitions, tempo and meter when starting later', () => {
	const song = compile(`voice a sine
pattern intro
tempo 120
a | C4--------------- |
pattern A
tempo 60
beats 3
a | C4----------- |
pattern B
tempo 120
a | D4--------------- |
play intro
loop A*2 B`)
	expect(song.errors).toEqual([])
	expect(sections(song, 9, 2).map(({ name, start, end, partial }) => [name, start, end, partial])).toEqual([
		['A', 0, 3, false],
		['A', 3, 6, false],
		['B', 6, 8, false],
		['A', 8, 9, true],
	])
	expect(bars(song, 9, 2)).toEqual([
		[0, 3],
		[3, 6],
		[6, 8],
		[8, 9],
	])
})

test.each(['hermannstrasse-um-drei', 'dorian'])('music/%s.song: pattern starts do not leave phantom sections or bars', (name) => {
	const song = compile(readFileSync(new URL(`../music/${name}.song`, import.meta.url), 'utf8'))
	const duration = song.intro.dur + song.loop.dur
	const all = sections(song, duration)
	for (let i = 0; i < all.length; i++) {
		const from = all[i].start
		const rest = sections(song, duration - from, from)
		expect(rest.map((section) => section.name)).toEqual(all.slice(i).map((section) => section.name))
		expect(rest.every((section) => !section.partial && section.end - section.start > 1 / 44100)).toBe(true)
		expect(bars(song, duration - from, from)).toHaveLength(all.slice(i).reduce((sum, section) => sum + section.bars, 0))
	}
})

test('Node CLI renders the real synth, intro and loop, and writes an unnormalized stereo WAV', () => {
	const folder = mkdtempSync(join(tmpdir(), 'jukebox-render-'))
	try {
		const file = join(folder, 'fixture.song')
		writeFileSync(
			file,
			`tempo 240
voice organ organ vol=0.5
voice quiet sine vol=0
pattern intro
organ | _ |
pattern A
organ | [C]--------------- |
quiet | C4--------------- |
play intro
loop A`,
		)
		const result = spawnSync('node', ['scripts/render.js', file, '--voices'], { encoding: 'utf8' })
		expect(result.stderr).toBe('')
		expect(result.status).toBe(0)
		expect(result.stdout).toContain('(2.00s, stereo 44.1 kHz, no normalization)')
		expect(result.stdout).toContain('quiet: peak silent, RMS silent, no clipping, share 0.0%')
		expect(result.stdout.indexOf('Overall (finished mix)')).toBeLessThan(result.stdout.indexOf('Rendering voice 1/2'))
		expect(result.stdout).toContain('intro: RMS silent (0.00–1.00s)')
		expect(result.stdout).toMatch(/A: RMS -[\d.]+ dBFS \(1.00–2.00s\)/)
		expect(result.stdout).toContain('one or both are silent')
		expect(result.stdout).toMatch(/RMS by bar: _[1-9] /)
		const buffer = readFileSync(join(folder, 'renders', 'fixture.wav'))
		expect(buffer.toString('ascii', 0, 4)).toBe('RIFF')
		expect(buffer.readUInt16LE(22)).toBe(2)
		expect(buffer.readUInt32LE(24)).toBe(44100)
		expect(buffer.length).toBe(44 + 2 * 44100 * 4)
		expect(buffer.subarray(44, 44 + 44100 * 4).every((byte) => byte === 0)).toBe(true)
		expect(buffer.subarray(44 + 44100 * 4).some((byte) => byte !== 0)).toBe(true)
		const mix = spawnSync('node', ['scripts/render.js', file], { encoding: 'utf8' })
		expect(mix.status).toBe(0)
		expect(mix.stdout).toContain('Overall (finished mix)')
		expect(mix.stdout).not.toContain('Rendering voice')
		expect(mix.stdout).not.toContain('Voices (solo')

		const part = spawnSync('node', ['scripts/render.js', file, '--seconds', '2.5', '--from', 'A'], { encoding: 'utf8' })
		expect(part.stderr).toBe('')
		expect(part.status).toBe(0)
		expect(part.stdout).toContain('Rendering mix: 2.50s from A')
		expect(part.stdout).toContain('Intro vs loop: skipped')
		expect(part.stdout).not.toContain('intro: RMS')
		expect(part.stdout.match(/A: RMS/g)).toHaveLength(3)
		expect(part.stdout).toContain('(2.00–2.50s; partial)')
		const excerpt = readFileSync(join(folder, 'renders', 'fixture.wav'))
		expect(excerpt.length).toBe(44 + 2.5 * 44100 * 4)
		expect(excerpt.subarray(44, 44 + 44100 * 4).some((byte) => byte !== 0)).toBe(true)

		const rest = spawnSync('node', ['scripts/render.js', file, '--from', 'A', '--voices'], { encoding: 'utf8' })
		expect(rest.status).toBe(0)
		expect(rest.stdout).toContain('(1.00s, stereo 44.1 kHz, no normalization)')
		expect(rest.stdout).toContain('Rendering voice 1/2 (organ): 1.00s from A')

		for (const flags of [
			['--seconds', '0'],
			['--seconds', '601'],
			['--seconds', 'NaN'],
		]) {
			const invalid = spawnSync('node', ['scripts/render.js', file, ...flags], { encoding: 'utf8' })
			expect(invalid.status).toBe(1)
			expect(invalid.stderr).toContain('Render length')
		}
		for (const flags of [['--from'], ['--seconds'], ['--voices', '--voices'], ['--unknown']]) {
			const invalid = spawnSync('node', ['scripts/render.js', file, ...flags], { encoding: 'utf8' })
			expect(invalid.status).toBe(1)
			expect(invalid.stderr).toContain('Usage:')
		}
		const missing = spawnSync('node', ['scripts/render.js', file, '--from', 'missing'], { encoding: 'utf8' })
		expect(missing.status).toBe(1)
		expect(missing.stderr).toContain('No played pattern called missing')
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
})
