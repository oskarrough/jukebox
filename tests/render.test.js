import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { bars, measure, wav } from '../scripts/render.js'
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
		const result = spawnSync('node', ['scripts/render.js', file], { encoding: 'utf8' })
		expect(result.stderr).toBe('')
		expect(result.status).toBe(0)
		expect(result.stdout).toContain('(2.00s, stereo 44.1 kHz, no normalization)')
		expect(result.stdout).toContain('quiet: peak silent, RMS silent, no clipping, share 0.0%')
		expect(result.stdout).toContain('one or both are silent')
		expect(result.stdout).toMatch(/RMS by bar: _[1-9] /)
		const buffer = readFileSync(join(folder, 'renders', 'fixture.wav'))
		expect(buffer.toString('ascii', 0, 4)).toBe('RIFF')
		expect(buffer.readUInt16LE(22)).toBe(2)
		expect(buffer.readUInt32LE(24)).toBe(44100)
		expect(buffer.length).toBe(44 + 2 * 44100 * 4)
		expect(buffer.subarray(44, 44 + 44100 * 4).every((byte) => byte === 0)).toBe(true)
		expect(buffer.subarray(44 + 44100 * 4).some((byte) => byte !== 0)).toBe(true)
		const invalid = spawnSync('node', ['scripts/render.js', file, '--seconds', '0'], { encoding: 'utf8' })
		expect(invalid.status).toBe(1)
		expect(invalid.stderr).toContain('Render length')
	} finally {
		rmSync(folder, { recursive: true, force: true })
	}
})
