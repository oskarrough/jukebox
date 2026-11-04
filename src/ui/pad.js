// The chord pad, as text: the chords it lays out for a song's key, on the
// circle of fifths with the key's own in the middle, and a tap written into
// a pattern's chord row, the way you'd type it.
import { CHORD_RE, compile, parse } from '../score.js'
import { prefersFlats } from '../key.js'
import { BRICKS, brickVoice } from '../bricks.js'
import { barAt } from './link.js'

const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const pcOf = (n) => ((n % 12) + 12) % 12

// What a modifier makes of a chord: major, minor, and major on the sharp
// side of home (V, II, VI), which a seventh makes dominant.
export const MODS = {
	7: ['maj7', 'm7', '7'],
	9: ['maj9', 'm9', '9'],
	sus: ['sus4', 'sus4', 'sus4'],
	add9: ['add9', 'madd9', 'add9'],
}

// The pad for `key`: seven columns round the circle of fifths, home in the
// middle, each a major chord over its relative minor. `far` is how far a
// column is from the key's own three (0 for those). With `mod`, every chord
// gets that colour.
export function padChords(key, mod) {
	const home = pcOf(key.pc + (key.minor ? 3 : 0))
	const flats = prefersFlats(key)
	return [-3, -2, -1, 0, 1, 2, 3].map((off) => {
		const pc = pcOf(home + off * 7)
		// sharps up the circle, flats down it; where they meet, as the key spells
		const side = pcOf(pc * 7)
		const names = side >= 1 && side <= 4 ? SHARP : side >= 8 ? FLAT : flats ? FLAT : SHARP
		const kind = MODS[mod] ?? ['', 'm', '']
		const major = names[pc] + kind[off > 0 ? 2 : 0]
		const minor = names[pcOf(pc + 9)] + kind[1]
		return { off, far: Math.max(0, Math.abs(off) - 1), major, minor, home: off === 0 ? (key.minor ? 'minor' : 'major') : null }
	})
}

// The colour a chord's name gives it beyond major or minor, as the major,
// minor and dominant ways to write it, like MODS: Dm9 is a 9th, C6/9 a 6/9.
const COLOURS = [
	[/^(maj|m|min)?$/, ['', 'm', '']],
	[/^(maj7|m7|7|mmaj7)$/, MODS[7]],
	[/^(maj9|m9|9)$/, MODS[9]],
	[/^m?add9$/, MODS.add9],
	[/^m?6$/, ['6', 'm6', '7']],
	[/^m?6\/9$/, ['6/9', 'm6/9', '9']],
	[/^m?11$/, ['add9', 'm11', '11']],
	[/^(maj13|m13|13)$/, ['maj13', 'm13', '13']],
	[/^\d*sus\d?$/, null],
]

// The chords chord `sym` can become in `key`, as a ladder up the circle of
// fifths: the key's six major and minor chords (not the diminished one), the
// major a fifth below them, and in a minor key its dominant 7th, each in
// `sym`'s colour, `sym` itself in its own place. Returns { chords, home },
// the chords from the bottom rung up and `sym`'s index.
export function chordLadder(sym, key) {
	const m = CHORD_RE.exec(sym)
	if (!m) return { chords: [sym], home: 0 }
	const suffix = m[3]
	const colour = COLOURS.find(([re]) => re.test(suffix))
	const [maj, min, dom] = colour ? (colour[1] ?? [suffix, suffix, suffix]) : ['', 'm', '']
	const cols = padChords(key)
	const at = (off) => cols[off + 3]
	// Each rung: its root, where it sits round the circle from the key's major
	// chord, and whether it's minor; minor first where both share a root.
	const rungs = [-2, -1, 0, 1].map((off) => ({ sym: at(off).major + (off > 0 ? dom : maj), pos: off, minor: false }))
	for (const off of [-1, 0, 1]) rungs.push({ sym: at(off).minor.slice(0, -1) + min, pos: off + 3, minor: true })
	if (key.minor) rungs.push({ sym: at(1).minor.slice(0, -1) + (dom || '7'), pos: 4, minor: false })
	// Where `sym` sits: in place of the rung on its root, or between them.
	const home = pcOf(key.pc + (key.minor ? 3 : 0))
	let pos = pcOf((pcOf(PCS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0)) - home) * 7)
	if (pos > 7) pos -= 12
	const minor = /^m(?!aj)/.test(suffix) || /^dim/.test(suffix)
	const own = rungs.findIndex((r) => r.pos === pos && r.minor === minor)
	if (own >= 0) rungs[own].sym = sym
	else rungs.push({ sym, pos, minor })
	rungs.sort((a, b) => a.pos - b.pos || b.minor - a.minor)
	return { chords: rungs.map((r) => r.sym), home: rungs.findIndex((r) => r.sym === sym) }
}
const PCS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

const strip = (line) => line.replace(/(^|\s)#.*$/, '').trim()
const MUSIC = /^([A-Za-z_]\w*)(?:@(\d+))?\s*\|/
const STEPS = /^[xXo.\-\s]*[xXo][xXo.\-\s]*$/

// The voice that plays the chord row's chords whole (or without the root),
// if any: the one to hear a chord on.
export function harmonyVoice(text) {
	const { song } = parse(text)
	const follows = followers(text, song)
	return song.voices.find((v) => follows.has(v.name) && (v.part === 'chord' || v.part === 'rootless'))?.name ?? null
}

// The melodic voices that play the chord row's chords, by name: those with
// steps (x, o) rather than notes.
export function followers(text, song = parse(text).song) {
	const out = new Set()
	for (const p of Object.values(song.patterns))
		for (const [name, lines] of Object.entries(p.raw)) if (lines.some((l) => l.bars.some((b) => STEPS.test(b)))) out.add(name)
	for (const v of song.voices) if (v.drum) out.delete(v.name)
	return out
}

// Where pattern `p`'s lines end: the last line of music or mute under it.
function endOf(lines, p) {
	let last = p.ln - 1
	for (let i = p.ln; i < lines.length; i++) {
		const l = strip(lines[i] ?? '')
		if (!l) continue
		if (!MUSIC.test(l) && !/^mute\b/i.test(l)) break
		last = i
	}
	return last
}

// How many bars pattern `name` has: its chord row's, and its voices'.
export const barsOf = (text, name) => barsIn(compile(text, name).loop.sections[0])
// The same of a compiled section.
export function barsIn(sec) {
	if (!sec) return { row: 0, voices: 0 }
	const where = sec.where ?? {}
	const voices = Math.max(0, ...Object.entries(where).map(([v, w]) => (v === 'chords' ? 0 : w.length)))
	return { row: where.chords?.length ?? 0, voices }
}

// The song `text` with chord `sym` in bar `bar` (from 0) of pattern `name`'s
// chord row: in place where the pattern writes that bar, else at the end of
// its row, as a chords@N line where it takes the row from another pattern,
// or as a new row. Bars before it with nothing yet repeat the last chord
// (%), or have none (_). A song with no pattern gets one. Returns
// { text, ln, col }, where the chord landed, or null.
export function writeChord(text, name, bar, sym) {
	const { song } = parse(text)
	const lines = text.split('\n')
	const p = song.patterns[name]
	if (!p) {
		if (song.patternOrder.length) return null
		const row = `chords | ${[...Array(bar).fill('_'), sym].join(' | ')} |`
		const head = text.replace(/\s+$/, '')
		const ln = head.split('\n').length + 3
		return { text: `${head}\n\npattern A\n${row}\n\nloop A\n`, ln, col: row.lastIndexOf(sym) }
	}
	const where = compile(text, name).loop.sections[0]?.where?.chords ?? []
	const own = (ln) => p.chords.some((l) => l.ln === ln)
	const at = (ln, i, to) => {
		lines[ln - 1] = to
		return { text: lines.join('\n'), ln, col: i }
	}

	// A bar this pattern writes: in place, the bar after it written out if it repeated this one.
	const w = where[bar]
	if (w && w.k >= 0 && own(w.ln)) {
		const line = lines[w.ln - 1]
		const found = barAt(line, w.k)
		let tail = line.slice(found.end)
		const next = barAt(line, w.k + 1)
		if (next?.text.trim() === '%') {
			let was = found.text.trim()
			for (let k = w.k - 1; was === '%' && k >= 0; k--) was = barAt(line, k).text.trim()
			if (was !== '%') tail = `${line.slice(found.end, next.start)} ${was} ${line.slice(next.end)}`
		}
		return at(w.ln, found.start + 1, `${line.slice(0, found.start)} ${sym} ${tail}`)
	}

	// Past the end of a row the pattern writes whole: more bars on its last line.
	const whole = p.chords.filter((l) => !l.at)
	if (whole.length && whole.length === p.chords.length) {
		const ln = whole.at(-1).ln
		const line = lines[ln - 1].replace(/\s*$/, '')
		const gap = Array(Math.max(0, bar - where.length)).fill('%')
		const body = line.endsWith('|') ? line : `${line} |`
		const to = `${body} ${[...gap, sym].join(' | ')} |`
		return at(ln, to.length - sym.length - 2, to)
	}

	// No row of its own: a new one under the pattern line, or a patch on the one it takes.
	const patch = p.chords.find((l) => l.at && l.at - 1 + l.bars.length === bar)
	if (patch) {
		const line = lines[patch.ln - 1].replace(/\s*$/, '')
		const to = `${line.endsWith('|') ? line : `${line} |`} ${sym} |`
		return at(patch.ln, to.length - sym.length - 2, to)
	}
	const row = where.length ? `chords@${bar + 1} | ${sym} |` : `chords | ${[...Array(bar).fill('_'), sym].join(' | ')} |`
	const after = p.chords.length ? Math.max(...p.chords.map((l) => l.ln)) : p.ln
	lines.splice(after, 0, row)
	return { text: lines.join('\n'), ln: after + 1, col: row.lastIndexOf(sym) }
}

// The song `text` with a pad that plays its chord row, held a bar at a
// time: a voice, and a line of it in every pattern that isn't built on
// another, as long as the pattern. Returns { text, voice }.
export function addPad(text) {
	const { song } = parse(text)
	let name = 'pad'
	for (let n = 2; song.voiceMap[name]; n++) name = `pad${n}`
	const lines = text.split('\n')
	const inserts = [] // [after line index, text]
	for (const p of Object.values(song.patterns)) {
		if (p.from) continue
		const n = (p.opts.beats || song.beats) * (p.opts.steps || song.steps)
		const { row, voices } = barsOf(text, p.name)
		const bars = Math.max(1, row, voices)
		inserts.push([endOf(lines, p), `${name} | ${['x'.padEnd(n, '-'), ...Array(bars - 1).fill('%')].join(' | ')} |`])
	}
	const voiceLines = lines.flatMap((l, i) => (/^voice\s/i.test(strip(l)) ? [i] : []))
	const firstPattern = Math.min(lines.length, ...Object.values(song.patterns).map((p) => p.ln - 1))
	const voice = brickVoice(
		BRICKS.find((b) => b.id === 'pad'),
		name,
		song.voices.some((v) => v.inst === 'kick'),
	)
	if (voiceLines.length) inserts.push([voiceLines.at(-1), voice])
	else inserts.push([firstPattern - 1, firstPattern < lines.length ? `${voice}\n` : voice])
	// From the bottom up, so earlier line numbers stay put.
	inserts.sort((a, b) => b[0] - a[0])
	for (const [after, line] of inserts) lines.splice(after + 1, 0, line)
	return { text: lines.join('\n'), voice: name }
}
