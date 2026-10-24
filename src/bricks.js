// Loop bricks, after Dance eJay: one bar of something that grooves, dropped into
// a song as a new voice playing it in every pattern. A brick is 16 steps; it
// stretches to whatever a bar holds in the song.
import { parse } from './score.js'

// Drums: x hit, X accent, o soft, . nothing. Melodic: a note or chord starts,
// - holds it, . rests.
const notes = (s) => s.split(/\s+/)
export const BRICKS = [
	{ id: 'kick', shelf: 'Drums', label: '4 to the floor', voice: 'kick', inst: 'kick', vol: 0.9, steps: 'x... x... x... x...' },
	{ id: 'break', shelf: 'Drums', label: 'Breakbeat', voice: 'kick', inst: 'kick', vol: 0.9, steps: 'x... .... ..x. .x..' },
	{ id: 'snare', shelf: 'Drums', label: 'Backbeat', voice: 'snare', inst: 'snare', vol: 0.6, steps: '.... x... .... x...' },
	{ id: 'clap', shelf: 'Drums', label: 'Klatschen', voice: 'clap', inst: 'clap', vol: 0.55, steps: '.... x... .... x..x' },
	{ id: 'hats', shelf: 'Drums', label: 'Hi-Hats', voice: 'hat', inst: 'hat', vol: 0.4, steps: 'x.x. x.x. x.x. xxxx' },
	{ id: 'offhat', shelf: 'Drums', label: 'Offbeat', voice: 'ohat', inst: 'ohat', vol: 0.3, steps: '..x. ..x. ..x. ..x.' },
	{ id: 'shaker', shelf: 'Drums', label: 'Shaker', voice: 'shaker', inst: 'shaker', vol: 0.35, steps: 'xoxo xoxo xoxo xoxo' },
	{ id: 'darbuka', shelf: 'Drums', label: 'Darbuka', voice: 'darbuka', inst: 'dum', vol: 0.7, steps: 'x... ..x. x... ....' },
	{ id: 'cowbell', shelf: 'Drums', label: 'Kuhglocke', voice: 'cowbell', inst: 'cowbell', vol: 0.35, steps: 'x... x... x... x.x.' },
	{
		id: 'pulse',
		shelf: 'Bass',
		label: 'Puls',
		voice: 'bass',
		inst: 'synbass',
		vol: 0.8,
		notes: notes('C2 - . . C2 - . . C2 - . . C2 - C3 -'),
	},
	{
		id: 'bounce',
		shelf: 'Bass',
		label: 'Oktaven',
		voice: 'bass',
		inst: 'ebass',
		vol: 0.8,
		notes: notes('C2 . C3 . C2 . C3 . C2 . C3 . G2 . Bb2 .'),
	},
	{ id: '808', shelf: 'Bass', label: '808', voice: 'b808', inst: '808', vol: 1, notes: notes('C2 - - - - - . C2 - . . . Eb2 - - -') },
	{
		id: 'pad',
		shelf: 'Akkorde',
		label: 'Fläche',
		voice: 'pad',
		inst: 'pad',
		vol: 0.35,
		notes: ['[Cm]', ...'- '.repeat(15).trim().split(' ')],
	},
	{
		id: 'organ',
		shelf: 'Akkorde',
		label: 'Orgel-Stabs',
		voice: 'organ',
		inst: 'organ',
		vol: 0.4,
		notes: notes('. . [C] . . . [C] . . . [C] . . . [C] .'),
	},
	{
		id: 'arp',
		shelf: 'Melodie',
		label: 'Arpeggio',
		voice: 'arp',
		inst: 'marimba',
		vol: 0.6,
		notes: notes('C5 Eb5 G5 C6 G5 Eb5 C5 Eb5 G5 C6 G5 Eb5 C5 Eb5 G5 Bb5'),
	},
	{
		id: 'bells',
		shelf: 'Melodie',
		label: 'Glöckchen',
		voice: 'bell',
		inst: 'glock',
		vol: 0.45,
		notes: notes('G5 - . . Eb5 - . . C5 - - - . . . .'),
	},
	{
		id: 'chip',
		shelf: 'Melodie',
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

const MUSIC = /^([A-Za-z_]\w*)\s*\|/
const strip = (line) => line.replace(/(^|\s)#.*$/, '').trim()

// The song `text` with `brick` added: a new voice, and a line of it in every
// pattern, as many bars long as the pattern.
export function addBrick(text, brick) {
	const { song } = parse(text)
	let name = brick.voice
	for (let k = 2; song.voiceMap[name]; k++) name = `${brick.voice}${k}`
	const lines = text.split('\n')
	const inserts = [] // [after line index, text]
	const barsOf = (p) => Math.max(0, ...Object.values(p.raw).map((ls) => ls.reduce((n, l) => n + l.bars.length, 0)))
	for (const p of Object.values(song.patterns)) {
		const beats = p.opts.beats || song.beats
		const steps = p.opts.steps || song.steps
		const bars = barsOf(p) || (p.from && song.patterns[p.from] ? barsOf(song.patterns[p.from]) : 0) || 1
		let last = p.ln - 1
		for (let i = p.ln; i < lines.length; i++) {
			const l = strip(lines[i])
			if (!l) continue
			if (MUSIC.test(l)) last = i
			else if (!/^mute\b/i.test(l)) break
		}
		const bar = brickBar(brick, beats * steps)
		inserts.push([last, `${name.padEnd(4)} | ${[bar, ...Array(bars - 1).fill('%')].join(' | ')} |`])
	}
	const voiceLines = lines.flatMap((l, i) => (/^voice\s/i.test(strip(l)) ? [i] : []))
	const firstPattern = Object.values(song.patterns).reduce((m, p) => Math.min(m, p.ln - 1), lines.length)
	const voiceAt = voiceLines.length ? voiceLines[voiceLines.length - 1] : firstPattern - 1
	inserts.push([voiceAt, `voice ${name} ${brick.inst} vol=${brick.vol}`])
	// From the bottom up, so earlier line numbers stay put; the voice line goes
	// above any pattern line at the same place.
	inserts.sort((a, b) => b[0] - a[0] || (a[1].startsWith('voice') ? 1 : -1))
	for (const [after, line] of inserts) lines.splice(after + 1, 0, line)
	if (!Object.keys(song.patterns).length)
		lines.push('', 'pattern A', `${name} | ${brickBar(brick, song.beats * song.steps)} |`, '', 'loop A')
	return { text: lines.join('\n'), voice: name }
}
