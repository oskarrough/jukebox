// Loop bricks, after Dance eJay: one bar of something that grooves, dropped into
// a song as a new voice playing it in every pattern, or in one. A brick is 16 steps; it
// stretches to whatever a bar holds in the song.
import { parse } from './score.js'
import { keyOf, transposeBrick } from './key.js'

// Drums: x hit, X accent, o soft, . nothing. Melodic: a note or chord starts,
// - holds it, . rests.
const notes = (s) => s.split(/\s+/)
export const BRICKS = [
	{ id: 'kick', shelf: 'Drums', label: '4 to the floor', voice: 'kick', inst: 'kick', vol: 0.9, steps: 'x... x... x... x...' },
	{ id: 'break', shelf: 'Drums', label: 'Breakbeat', voice: 'kick', inst: 'kick', vol: 0.9, steps: 'x... .... ..x. .x..' },
	{ id: 'snare', shelf: 'Drums', label: 'Backbeat', voice: 'snare', inst: 'snare', vol: 0.6, steps: '.... x... .... x...' },
	{ id: 'clap', shelf: 'Drums', label: 'Claps', voice: 'clap', inst: 'clap', vol: 0.55, steps: '.... x... .... x..x' },
	{ id: 'hats', shelf: 'Drums', label: 'Hi-Hats', voice: 'hat', inst: 'hat', vol: 0.4, steps: 'x.x. x.x. x.x. xxxx' },
	{ id: 'offhat', shelf: 'Drums', label: 'Offbeat', voice: 'ohat', inst: 'ohat', vol: 0.3, steps: '..x. ..x. ..x. ..x.' },
	{ id: 'shaker', shelf: 'Drums', label: 'Shaker', voice: 'shaker', inst: 'shaker', vol: 0.35, steps: 'xoxo xoxo xoxo xoxo' },
	{ id: 'darbuka', shelf: 'Drums', label: 'Darbuka', voice: 'darbuka', inst: 'dum', vol: 0.7, steps: 'x... ..x. x... ....' },
	{ id: 'cowbell', shelf: 'Drums', label: 'Cowbell', voice: 'cowbell', inst: 'cowbell', vol: 0.35, steps: 'x... x... x... x.x.' },
	{
		id: 'pulse',
		shelf: 'Bass',
		label: 'Pulse',
		voice: 'bass',
		inst: 'synbass',
		vol: 0.8,
		notes: notes('C2 - . . C2 - . . C2 - . . C2 - C3 -'),
	},
	{
		id: 'bounce',
		shelf: 'Bass',
		label: 'Octaves',
		voice: 'bass',
		inst: 'ebass',
		vol: 0.8,
		notes: notes('C2 . C3 . C2 . C3 . C2 . C3 . G2 . Bb2 .'),
	},
	{ id: '808', shelf: 'Bass', label: '808', voice: 'b808', inst: '808', vol: 1, notes: notes('C2 - - - - - . C2 - . . . Eb2 - - -') },
	{
		id: 'pad',
		shelf: 'Chords',
		label: 'Pad',
		voice: 'pad',
		inst: 'pad',
		vol: 0.35,
		notes: ['[Cm]', ...'- '.repeat(15).trim().split(' ')],
	},
	{
		id: 'organ',
		shelf: 'Chords',
		label: 'Organ stabs',
		voice: 'organ',
		inst: 'organ',
		vol: 0.4,
		notes: notes('. . [C] . . . [C] . . . [C] . . . [C] .'),
	},
	{
		id: 'arp',
		shelf: 'Melody',
		label: 'Arpeggio',
		voice: 'arp',
		inst: 'marimba',
		vol: 0.6,
		notes: notes('C5 Eb5 G5 C6 G5 Eb5 C5 Eb5 G5 C6 G5 Eb5 C5 Eb5 G5 Bb5'),
	},
	{
		id: 'bells',
		shelf: 'Melody',
		label: 'Bells',
		voice: 'bell',
		inst: 'glock',
		vol: 0.45,
		notes: notes('G5 - . . Eb5 - . . C5 - - - . . . .'),
	},
	{
		id: 'chip',
		shelf: 'Melody',
		label: 'Chiptune',
		voice: 'chip',
		inst: 'chip',
		vol: 0.35,
		notes: notes('C5 . C5 Eb5 . G5 . Bb5 - . G5 . F5 Eb5 - .'),
	},
]

// One bar of `brick` in a bar of `barSteps` steps.
export function brickBar(brick, barSteps) {
	const at = (i) => Math.floor((i * 16) / barSteps)
	if (brick.steps) {
		const src = brick.steps.replace(/\s+/g, '')
		let out = ''
		for (let i = 0; i < barSteps; i++) out += (i && at(i) === at(i - 1) ? '.' : src[at(i)]) + (i % 4 === 3 && i < barSteps - 1 ? ' ' : '')
		return out
	}
	const tokens = []
	for (let i = 0; i < barSteps; i++) {
		const n = brick.notes[at(i)]
		const repeat = i && at(i) === at(i - 1)
		if (n === '-' || (repeat && n !== '.')) {
			if (tokens.length) tokens[tokens.length - 1] += '-'
			else tokens.push('.')
		} else tokens.push(n)
	}
	return tokens.join(' ')
}

const MUSIC = /^([A-Za-z_]\w*)(?:@\d+)?\s*\|/
const strip = (line) => line.replace(/(^|\s)#.*$/, '').trim()

// The song `text` with `brick` added: a voice, and a line of it in every
// pattern, as many bars long as the pattern. A song that already has the
// brick's voice gets that voice's lines and instrument swapped instead.
export function addBrick(text, brick) {
	const { song } = parse(text)
	brick = transposeBrick(brick, keyOf(text, song))
	const name = brick.voice
	const lines = text.split('\n')
	const inserts = [] // [after line index, text]
	const barsOf = (p) => Math.max(0, ...Object.values(p.raw).map((ls) => ls.reduce((n, l) => n + l.bars.length, 0)))
	for (const p of Object.values(song.patterns)) {
		const beats = p.opts.beats || song.beats
		const steps = p.opts.steps || song.steps
		const bars = barsOf(p) || (p.from && song.patterns[p.from] ? barsOf(song.patterns[p.from]) : 0) || 1
		let last = p.ln - 1
		let own = -1 // the voice's first line in this pattern
		for (let i = p.ln; i < lines.length; i++) {
			const l = strip(lines[i] ?? '')
			if (!l) continue
			const m = MUSIC.exec(l)
			if (!m && !/^mute\b/i.test(l)) break
			if (!m) continue
			last = i
			if (m[1] !== name) continue
			if (own < 0) own = i
			else lines[i] = null
		}
		const line = `${name.padEnd(4)} | ${[brickBar(brick, beats * steps), ...Array(bars - 1).fill('%')].join(' | ')} |`
		if (own >= 0) lines[own] = line
		else if (!(song.voiceMap[name] && p.from)) inserts.push([last, line])
	}
	const voice = `voice ${name} ${brick.inst} vol=${brick.vol}`
	const declared = lines.findIndex((l) => l != null && new RegExp(`^voice\\s+${name}\\s`, 'i').test(strip(l)))
	if (song.voiceMap[name] && declared >= 0) lines[declared] = voice
	else {
		const voiceLines = lines.flatMap((l, i) => (l != null && /^voice\s/i.test(strip(l)) ? [i] : []))
		const firstPattern = Object.values(song.patterns).reduce((m, p) => Math.min(m, p.ln - 1), lines.length)
		inserts.push([voiceLines.length ? voiceLines[voiceLines.length - 1] : firstPattern - 1, voice])
	}
	// From the bottom up, so earlier line numbers stay put; the voice line goes
	// above any pattern line at the same place.
	inserts.sort((a, b) => b[0] - a[0] || (a[1].startsWith('voice') ? 1 : -1))
	for (const [after, line] of inserts) lines.splice(after + 1, 0, line)
	if (!Object.keys(song.patterns).length)
		lines.push('', 'pattern A', `${name} | ${brickBar(brick, song.beats * song.steps)} |`, '', 'loop A')
	return { text: lines.filter((l) => l != null).join('\n'), voice: name }
}

// Whether pattern `name` of `song` plays voice `v`: its own line or one it
// builds on with from, unless muted along the way.
function plays(song, name, v, seen = []) {
	const p = song.patterns[name]
	if (!p || seen.includes(name) || p.mute.has(v)) return false
	if (p.voiceOrder.includes(v)) return true
	return !!p.from && plays(song, p.from, v, [...seen, name])
}
// The pattern whose lines for `v` pattern `name` plays.
function ownerOf(song, name, v, seen = []) {
	const p = song.patterns[name]
	if (!p || seen.includes(name)) return null
	return p.voiceOrder.includes(v) ? p : p.from ? ownerOf(song, p.from, v, [...seen, name]) : null
}
// How many bars pattern `p` is, its own or from what it builds on.
function barsIn(song, p, seen = []) {
	const own = Math.max(0, ...Object.values(p.raw).map((ls) => ls.reduce((n, l) => n + l.bars.length, 0)))
	const base = p.from && !seen.includes(p.from) && song.patterns[p.from]
	return own || (base ? barsIn(song, base, [...seen, p.name]) : 1)
}
// Where pattern `p` ends in `lines`, and which of its lines are music or mute.
function bodyOf(lines, p) {
	let last = p.ln - 1
	const music = []
	const mutes = []
	for (let i = p.ln; i < lines.length; i++) {
		const l = strip(lines[i] ?? '')
		if (!l) continue
		const m = MUSIC.exec(l)
		if (!m && !/^mute\b/i.test(l)) break
		last = i
		if (m) music.push([i, m[1]])
		else mutes.push(i)
	}
	return { last, music, mutes }
}

// The song `text` with `brick` added to pattern `name` only. Every other
// pattern sounds as it did: one built on it with from keeps what it had (it
// gets the old line, or a mute if it had none). A brick whose voice already
// plays another instrument gets a voice of its own, replacing that one here.
export function brickInto(text, brick, name) {
	const { song } = parse(text)
	const p = song.patterns[name]
	if (!p) return { text, voice: null }
	brick = transposeBrick(brick, keyOf(text, song))
	let v = brick.voice
	let replaced = null
	if (song.voiceMap[v] && song.voiceMap[v].inst !== brick.inst) {
		replaced = v
		const kin = song.voices.find((w) => w.inst === brick.inst && new RegExp(`^${v}\\d+$`).test(w.name))
		let n = 2
		while (!kin && song.voiceMap[v + n]) n++
		v = kin ? kin.name : v + n
	}
	const lines = text.split('\n')
	const inserts = [] // [after line index, text], kept in order
	const mutes = new Map() // pattern -> voices to mute in it
	const mute = (q, w) => mutes.set(q, [...(mutes.get(q) ?? []), w])

	const changed = [v, replaced].filter(Boolean)
	for (const c of Object.values(song.patterns).filter((c) => c.from === name))
		for (const w of changed) {
			if (c.voiceOrder.includes(w) || c.mute.has(w)) continue
			if (!plays(song, name, w)) mute(c, w)
			else for (const l of ownerOf(song, name, w).raw[w]) inserts.push([bodyOf(lines, c).last, lines[l.ln - 1]])
		}

	const body = bodyOf(lines, p)
	// The brick's line, in place of this voice's own lines here.
	const line = `${v.padEnd(4)} | ${[brickBar(brick, (p.opts.beats || song.beats) * (p.opts.steps || song.steps)), ...Array(barsIn(song, p) - 1).fill('%')].join(' | ')} |`
	const own = body.music.filter(([, w]) => w === v).map(([i]) => i)
	if (own.length) {
		lines[own[0]] = line
		for (const i of own.slice(1)) lines[i] = null
	} else inserts.push([body.last, line])
	// The voice it replaces goes quiet here.
	if (replaced) {
		for (const [i, w] of body.music) if (w === replaced) lines[i] = null
		if (p.from && plays(song, p.from, replaced) && !p.mute.has(replaced)) mute(p, replaced)
	}
	// A mute here of the brick's own voice goes.
	for (const i of body.mutes) {
		const words = strip(lines[i]).split(/\s+/)
		if (!words.includes(v)) continue
		const left = words.slice(1).filter((w) => w !== v)
		lines[i] = left.length ? `mute ${left.join(' ')}` : null
	}
	for (const [q, ws] of mutes) {
		const at = bodyOf(lines, q).mutes.find((i) => lines[i] != null)
		if (at != null) lines[at] = `${lines[at]} ${ws.join(' ')}`
		else inserts.push([q.ln - 1, `mute ${ws.join(' ')}`])
	}
	if (!song.voiceMap[v]) {
		const voiceLines = lines.flatMap((l, i) => (l != null && /^voice\s/i.test(strip(l)) ? [i] : []))
		const firstPattern = Math.min(...Object.values(song.patterns).map((q) => q.ln - 1))
		inserts.push([voiceLines.length ? voiceLines.at(-1) : firstPattern - 1, `voice ${v} ${brick.inst} vol=${brick.vol}`])
	}
	// From the bottom up, so earlier line numbers stay put; at the same place,
	// in the order they came.
	const ordered = inserts.map((ins, k) => [...ins, k]).sort((a, b) => b[0] - a[0] || b[2] - a[2])
	for (const [after, l] of ordered) lines.splice(after + 1, 0, l)
	return { text: lines.filter((l) => l != null).join('\n'), voice: v }
}
