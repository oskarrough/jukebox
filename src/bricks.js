// Loop bricks, after Dance eJay: one bar of something that grooves, dropped into
// a song as a new voice playing it in every pattern, or in one. A brick is 16 steps; it
// stretches to whatever a bar holds in the song, and to every bar of the pattern.
import { parse } from './score.js'
import { keyOf, prefersFlats, transposeChordBody } from './key.js'

// x hit, X accent, o soft, . nothing. A melodic brick plays the chord row
// on its x steps, as much of each chord as `part` says, and - holds it.
// `sound` is the brick's voice options, so any stack of bricks comes out mixed:
// kick on top, bass low and centred under it, hats quiet and wide, the pad and
// stabs ducking under the kick with `pump`.
export const BRICKS = [
	{
		id: 'kick',
		shelf: 'Drums',
		label: '4 to the floor',
		voice: 'kick',
		inst: 'kick',
		sound: 'vol=0.95 rev=0.03',
		steps: 'x... x... x... x...',
	},
	{
		id: 'break',
		shelf: 'Drums',
		label: 'Breakbeat',
		voice: 'kick',
		inst: 'kick',
		sound: 'vol=0.95 rev=0.03',
		steps: 'x... .... ..x. .x..',
	},
	{
		id: 'snare',
		shelf: 'Drums',
		label: 'Backbeat',
		voice: 'snare',
		inst: 'snare',
		sound: 'vol=0.7 rev=0.3 bright=1.1',
		steps: '.... x... .... x...',
	},
	{
		id: 'clap',
		shelf: 'Drums',
		label: 'Claps',
		voice: 'clap',
		inst: 'clap',
		sound: 'vol=0.65 rev=0.35 pan=0.1',
		steps: '.... x... .... x..x',
	},
	{
		id: 'hats',
		shelf: 'Drums',
		label: 'Hi-Hats',
		voice: 'hat',
		inst: 'hat',
		sound: 'vol=0.34 pan=0.25 rev=0.08 bright=1.2',
		steps: 'x.x. x.x. x.x. xxxx',
	},
	{
		id: 'offhat',
		shelf: 'Drums',
		label: 'Offbeat',
		voice: 'ohat',
		inst: 'ohat',
		sound: 'vol=0.28 pan=-0.25 rev=0.12',
		steps: '..x. ..x. ..x. ..x.',
	},
	{
		id: 'shaker',
		shelf: 'Drums',
		label: 'Shaker',
		voice: 'shaker',
		inst: 'shaker',
		sound: 'vol=0.3 pan=0.4 rev=0.1',
		steps: 'xoxo xoxo xoxo xoxo',
	},
	{
		id: 'darbuka',
		shelf: 'Drums',
		label: 'Darbuka',
		voice: 'darbuka',
		inst: 'dum',
		sound: 'vol=0.5 pan=-0.3 rev=0.2',
		steps: 'x... ..x. x... ....',
	},
	{
		id: 'cowbell',
		shelf: 'Drums',
		label: 'Cowbell',
		voice: 'cowbell',
		inst: 'cowbell',
		sound: 'vol=0.28 pan=0.35 rev=0.15 echo=3 tail=0.3',
		steps: 'x... x... x... x.x.',
	},
	{
		id: 'pulse',
		shelf: 'Bass',
		label: 'Pulse',
		voice: 'bass',
		inst: 'synbass',
		sound: 'vol=0.65 rev=0 bright=0.9 pump=0.3',
		part: 'root',
		steps: 'x-.. x-.. x-.. x-x-',
	},
	{
		id: 'bounce',
		shelf: 'Bass',
		label: 'Bounce',
		voice: 'bass',
		inst: 'ebass',
		sound: 'vol=0.65 rev=0 pump=0.3',
		part: 'up',
		steps: 'x.x. x.x. x.x. x.x.',
	},
	{
		id: '808',
		shelf: 'Bass',
		label: '808',
		voice: 'b808',
		inst: '808',
		sound: 'vol=0.6 rev=0 drive=0.4 pump=0.2',
		part: 'root',
		steps: 'x--- --.x -... x---',
	},
	{
		id: 'pad',
		shelf: 'Chords',
		label: 'Pad',
		voice: 'pad',
		inst: 'pad',
		sound: 'vol=0.4 rev=0.6 bright=0.8 pump=0.6',
		part: 'chord',
		steps: 'x--- ---- ---- ----',
	},
	{
		id: 'organ',
		shelf: 'Chords',
		label: 'Organ stabs',
		voice: 'organ',
		inst: 'organ',
		sound: 'vol=0.45 pan=-0.15 rev=0.2 gate=0.5 echo=3 tail=0.35 pump=0.3',
		part: 'chord',
		steps: '..x. ..x. ..x. ..x.',
	},
	{
		id: 'arp',
		shelf: 'Melody',
		label: 'Arpeggio',
		voice: 'arp',
		inst: 'marimba',
		sound: 'vol=0.4 pan=0.3 rev=0.25 gate=0.6 pump=0.3',
		part: 'up',
		center: 'E5',
		steps: 'xxxx xxxx xxxx xxxx',
	},
	{
		id: 'bells',
		shelf: 'Melody',
		label: 'Bells',
		voice: 'bell',
		inst: 'glock',
		sound: 'vol=0.35 pan=-0.35 rev=0.45 echo=4 tail=0.3',
		part: 'up',
		center: 'G5',
		steps: 'x-.. x-.. x--- ....',
	},
	{
		id: 'chip',
		shelf: 'Melody',
		label: 'Chiptune',
		voice: 'chip',
		inst: 'chip',
		sound: 'vol=0.3 pan=0.2 rev=0.2 gate=0.6 bright=0.8 echo=3 tail=0.3 pump=0.2',
		part: 'up',
		center: 'F5',
		steps: 'x.xx .x.x -.x. xx-.',
	},
]

// One bar of `brick` in a bar of `barSteps` steps.
export function brickBar(brick, barSteps) {
	const at = (i) => Math.floor((i * 16) / barSteps)
	const src = brick.steps.replace(/\s+/g, '')
	// A step stretched over two: a drum hits once, a held chord holds on.
	const again = (c) => (brick.part && c !== '.' ? '-' : '.')
	let out = ''
	for (let i = 0; i < barSteps; i++) {
		const c = src[at(i)]
		out += (i && at(i) === at(i - 1) ? again(c) : c) + (i % 4 === 3 && i < barSteps - 1 ? ' ' : '')
	}
	return out
}

// The voice line that plays `brick`, as voice `name`: its sound, mixed to sit
// with any other bricks, then what it plays of the chords. It ducks under the
// kick only once the song has one (`kicked`): pump needs a kick to follow.
export function brickVoice(brick, name = brick.voice, kicked = false) {
	const sound = kicked ? brick.sound : brick.sound.replace(/\s*pump=\S+/, '')
	return `voice ${name} ${brick.inst} ${sound}${brick.part && brick.part !== 'chord' ? ` part=${brick.part}` : ''}${brick.center ? ` center=${brick.center}` : ''}`
}
// `lines` of `text` with each brick voice, as a brick wrote it, ducking under
// the kick once the song has one.
function pumped(lines) {
	const text = lines.filter((l) => l != null).join('\n')
	if (!parse(text).song.voices.some((v) => v.inst === 'kick')) return text
	return text
		.split('\n')
		.map((l) => {
			const [, name, inst] = /^voice\s+(\S+)\s+(\S+)/.exec(l) ?? []
			const brick = BRICKS.find((b) => b.inst === inst && b.sound.includes('pump='))
			return brick && l.trim() === brickVoice(brick, name) ? brickVoice(brick, name, true) : l
		})
		.join('\n')
}

// The key's own chord, for a chord row to start from: C, Am, F#m.
export const tonic = (key) => transposeChordBody(key?.minor ? 'Cm' : 'C', key?.pc ?? 0, prefersFlats(key))

// How many bars `lines` play: one voice's lines in a pattern, or its chord row.
function span(lines) {
	let whole = 0
	let end = 0
	for (const l of lines)
		if (l.at) end = Math.max(end, l.at - 1 + l.bars.length)
		else whole += l.bars.length
	return Math.max(whole, end)
}
// How many bars each voice, and the chord row, play in pattern `name`,
// with what it builds on.
function spans(song, name, seen = []) {
	const p = song.patterns[name]
	if (!p || seen.includes(name)) return {}
	const out = p.from ? spans(song, p.from, [...seen, name]) : {}
	for (const [v, ls] of [...Object.entries(p.raw), ['\0chords', p.chords]])
		if (ls.length) out[v] = ls.some((l) => !l.at) ? span(ls) : Math.max(out[v] ?? 0, span(ls))
	return out
}
// Whether pattern `name` has a chord row, its own or one it builds on.
function rowed(song, name, seen = []) {
	const p = song.patterns[name]
	if (!p || seen.includes(name)) return false
	return p.chords.length > 0 || (!!p.from && rowed(song, p.from, [...seen, name]))
}
// A voice's lines that play one bar of steps over and over: `kick | x... | % | % |`.
const STEP_BAR = /^[xXo.\-\s]*[xXo][xXo.\-\s]*$/
const repeats = (ls) => ls?.length === 1 && !ls[0].at && STEP_BAR.test(ls[0].bars[0]) && ls[0].bars.slice(1).every((b) => b.trim() === '%')
// How long pattern `name` is without its repeating lines: its chord row and its other voices.
function spine(song, name) {
	const p = song.patterns[name]
	const all = spans(song, name)
	return Math.max(0, ...Object.entries(all).map(([v, n]) => (repeats(p.raw[v]) ? 0 : n)))
}

// The song `text` with each line that repeats one bar of steps as long as
// its pattern: the bricks grow with the chord row and the other voices.
// With `before`, only in patterns that got longer since then.
export function growRepeats(text, before) {
	const { song } = parse(text)
	const was = before == null ? null : parse(before).song
	const lines = text.split('\n')
	let changed = false
	for (const p of Object.values(song.patterns)) {
		const bars = spine(song, p.name)
		if (was && (!was.patterns[p.name] || spine(was, p.name) >= bars)) continue
		for (const ls of Object.values(p.raw)) {
			if (!repeats(ls) || ls[0].bars.length >= bars) continue
			const line = lines[ls[0].ln - 1]
			const c = /(^|\s)#.*$/.exec(line)
			let body = line.slice(0, c ? c.index : line.length).trimEnd()
			if (!body.endsWith('|')) body += ' |'
			lines[ls[0].ln - 1] = body + ' % |'.repeat(bars - ls[0].bars.length) + (c ? line.slice(c.index) : '')
			changed = true
		}
	}
	return changed ? lines.join('\n') : text
}

const MUSIC = /^([A-Za-z_]\w*)(?:@\d+)?\s*\|/
const strip = (line) => line.replace(/(^|\s)#.*$/, '').trim()

// The song `text` with `brick` added: a voice, and a line of it in every
// pattern, as many bars long as the pattern. A song that already has the
// brick's voice gets that voice's lines and instrument swapped instead.
export function addBrick(text, brick) {
	const { song } = parse(text)
	const row = brick.part && `chords | ${tonic(keyOf(text, song))} |`
	const name = brick.voice
	const lines = text.split('\n')
	const inserts = [] // [after line index, text, rank among those at the same place]
	for (const p of Object.values(song.patterns)) {
		const beats = p.opts.beats || song.beats
		const steps = p.opts.steps || song.steps
		const bars = Math.max(1, ...Object.values(spans(song, p.name)))
		// A melodic brick needs chords to play: the key's own, where there are none.
		if (row && !rowed(song, p.name)) inserts.push([p.ln - 1, row, 0])
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
		else if (!(song.voiceMap[name] && p.from)) inserts.push([last, line, 1])
	}
	const voice = brickVoice(brick)
	const declared = lines.findIndex((l) => l != null && new RegExp(`^voice\\s+${name}\\s`, 'i').test(strip(l)))
	if (song.voiceMap[name] && declared >= 0) lines[declared] = voice
	else {
		const voiceLines = lines.flatMap((l, i) => (l != null && /^voice\s/i.test(strip(l)) ? [i] : []))
		const firstPattern = Object.values(song.patterns).reduce((m, p) => Math.min(m, p.ln - 1), lines.length)
		inserts.push([voiceLines.length ? voiceLines[voiceLines.length - 1] : firstPattern - 1, voice, -1])
	}
	// From the bottom up, so earlier line numbers stay put; at the same place,
	// the voice line, then the chord row, then the brick's line.
	inserts.sort((a, b) => b[0] - a[0] || b[2] - a[2])
	for (const [after, line] of inserts) lines.splice(after + 1, 0, line)
	if (!Object.keys(song.patterns).length)
		lines.push('', 'pattern A', ...(row ? [row] : []), `${name} | ${brickBar(brick, song.beats * song.steps)} |`, '', 'loop A')
	return { text: pumped(lines), voice: name }
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
	// A melodic brick needs chords to play: the key's own, where there are none.
	if (brick.part && !rowed(song, name)) inserts.push([p.ln - 1, `chords | ${tonic(keyOf(text, song))} |`])
	// The brick's line, in place of this voice's own lines here.
	const line = `${v.padEnd(4)} | ${[brickBar(brick, (p.opts.beats || song.beats) * (p.opts.steps || song.steps)), ...Array(Math.max(1, ...Object.values(spans(song, name))) - 1).fill('%')].join(' | ')} |`
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
		inserts.push([voiceLines.length ? voiceLines.at(-1) : firstPattern - 1, brickVoice(brick, v)])
	}
	// From the bottom up, so earlier line numbers stay put; at the same place,
	// in the order they came.
	const ordered = inserts.map((ins, k) => [...ins, k]).sort((a, b) => b[0] - a[0] || b[2] - a[2])
	for (const [after, l] of ordered) lines.splice(after + 1, 0, l)
	return { text: pumped(lines), voice: v }
}
