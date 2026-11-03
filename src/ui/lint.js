// The score's errors placed on the words they're about, each with a fix when
// one is obvious: the word it should be, or a line it needs. Errors you're
// still writing wait: those on the line you're typing on, and those that are
// only there because that line isn't finished yet.
import { CHORDS, OPTIONS, PATTERN_OPTIONS, SETTINGS, chordToMidis, parse } from '../score.js'
import { INSTRUMENTS } from './complete.js'
import { barAt } from './link.js'

const KEYWORDS = [...SETTINGS, 'voice', 'pattern', 'play', 'loop', 'mute']
const KEYS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'].flatMap((k) => [k, k + 'm'])
const MUSIC = /^\s*([A-Za-z_]\w*)(@\d+)?\s*\|/
const starts = (word) => (line) => new RegExp(`^\\s*${word}\\b`, 'i').test(line ?? '')
const isVoice = starts('voice')
const isPattern = starts('pattern')
const isPlay = starts('(play|loop)')

// For each line with errors, by line number: [{ start, end, msg, fix }],
// start and end the columns to underline, fix null or { label, tip, start,
// end, to, caret }: write `to` over start…end of the text and put the caret
// at `caret`. `caret` is the line the caret is on and `typing` the one being
// typed on, if any.
export function mistakes(text, errors, { caret = 0, typing = 0 } = {}) {
	const out = new Map()
	if (!errors.length) return out
	const lines = text.split('\n')
	const { song } = parse(text)
	const offset = (ln) => lines.slice(0, ln - 1).reduce((n, l) => n + l.length + 1, 0)
	for (const e of errors) {
		if (echo(e, lines, errors) || waits(e, lines, caret, typing)) continue
		const line = lines[e.line - 1] ?? ''
		const hash = line.match(/(^|\s)#/)
		const body = hash ? line.slice(0, hash.index + hash[1].length) : line
		const bar = e.bar >= 0 && barAt(body, e.bar)
		let start = body.search(/\S/)
		let end = body.trimEnd().length
		if (bar && !bar.text.trim()) [start, end] = [bar.start, bar.end]
		else if (bar) [start, end] = [bar.start + bar.text.search(/\S|$/), bar.start + bar.text.trimEnd().length]
		// A pattern's base is the word after its from.
		if (e.kind === 'self' || (e.kind === 'nopattern' && e.from)) start = Math.max(start, body.search(/\sfrom\s/i) + 1)
		const at = e.word ? find(body, e.word, start, end) : -1
		if (at >= 0) [start, end] = [at, at + e.word.length]
		const ctx = { e, body, at, bar, lines, song, line: e.line }
		const fix = at >= 0 || bar || !e.word ? FIX[e.kind]?.(ctx) : null
		let msg = e.msg
		if (fix?.msg) msg = fix.msg
		const mistake = { start: Math.max(0, start), end: Math.max(start + 1, end), msg, fix: null }
		if (fix) {
			const base = fix.ln ? offset(fix.ln) : offset(e.line)
			const from = base + (fix.start ?? 0)
			const to = from + (fix.end ?? fix.start ?? 0) - (fix.start ?? 0)
			// After a fix in place, the caret ends after it; after a new line,
			// it stays at the end of the line that was wrong.
			const after = fix.ln ? offset(e.line) + fix.to.length + body.trimEnd().length : from + fix.to.length
			mistake.fix = { label: fix.label ?? fix.to, tip: fix.tip, start: from, end: to, to: fix.to, caret: after }
		}
		out.set(e.line, [...(out.get(e.line) ?? []), mistake])
	}
	return out
}

// An error that another one already tells of: a voice whose own line is
// wrong, music below a pattern line that's wrong, or a pattern whose lines
// are wrong.
function echo(e, lines, errors) {
	if (e.kind === 'novoice') return lines.some((l) => new RegExp(`^\\s*voice\\s+${e.word}(\\s|$)`, 'i').test(l))
	if (e.kind === 'outside') return isPattern(lines[above(lines, e.line) - 1])
	if (e.kind === 'empty') {
		const end = e.line + span(lines, e.line).length
		return errors.some((o) => o.line > e.line && o.line <= end)
	}
	return false
}

// Whether `e` waits: it's on the line being typed, or only there because
// that line isn't finished, or it's a pattern with no music yet and the
// caret is in it.
function waits(e, lines, caret, typing) {
	if (e.kind === 'empty' && caret && (caret === e.line || above(lines, caret) === e.line)) return true
	if (!typing) return false
	const line = lines[typing - 1]
	if (e.line === typing) return true
	if (e.kind === 'novoice' || e.kind === 'line') return isVoice(line)
	if (e.kind === 'nopattern' || e.kind === 'outside' || e.kind === 'self') return isPattern(line)
	return false
}

// The nearest pattern, play or loop line above line `ln`, or 0.
function above(lines, ln) {
	for (let i = ln - 1; i > 0; i--) if (isPattern(lines[i - 1]) || isPlay(lines[i - 1])) return i
	return 0
}

// The lines inside the pattern on line `ln`.
function span(lines, ln) {
	const out = []
	for (let i = ln; i < lines.length && !isPattern(lines[i]) && !isPlay(lines[i]); i++) out.push(lines[i])
	return out
}

// Where `word` is written between `from` and `to` in `line`, as a word of its
// own if it can be; -1 if it isn't.
function find(line, word, from, to) {
	const span = line.slice(0, to)
	let loose = -1
	for (let i = span.indexOf(word, from); i >= 0; i = span.indexOf(word, i + 1)) {
		if (!/\w/.test(line[i - 1] ?? '') && !/\w/.test(line[i + word.length] ?? '')) return i
		if (loose < 0) loose = i
	}
	return loose
}

// How to fix each kind of error, given where its word is: a replacement for
// the word or the bar, or a new line `ln` to write.
const word = (ctx, to, tip = `Replace with ${to}`) => to && to !== ctx.e.word && { start: ctx.at, end: ctx.at + ctx.e.word.length, to, tip }
const slip = (list) => (ctx) => word(ctx, closest(ctx.e.word, list))
const FIX = {
	inst: slip(INSTRUMENTS),
	opt: slip(OPTIONS),
	'pattern-opt': slip(PATTERN_OPTIONS),
	'opt-form': (ctx) => (ctx.e.msg === 'Missing =' ? equals(ctx) : null),
	'pattern-word': (ctx) => (ctx.e.msg === 'Missing =' ? equals(ctx) : slip([...PATTERN_OPTIONS, 'from'])(ctx)),
	key: (ctx) => word(ctx, /^h(m?)$/i.test(ctx.e.word) ? `B${ctx.e.word.slice(1)}` : closest(ctx.e.word, KEYS)),
	line: (ctx) => {
		const { e, song } = ctx
		if (!e.music) return slip(KEYWORDS)(ctx)
		const voice = closest(
			e.word,
			song.voices.map((v) => v.name),
		)
		if (voice) return word(ctx, voice)
		const setting = closest(e.word, KEYWORDS)
		if (setting) return { ...word(ctx, setting), msg: `No setting called ${e.word}` }
		return addVoice(ctx)
	},
	novoice: (ctx) => {
		const voice = closest(
			ctx.e.word,
			ctx.song.voices.map((v) => v.name),
		)
		return voice ? word(ctx, voice) : addVoice(ctx)
	},
	bars: (ctx) => word(ctx, `${ctx.e.word} |`, 'Add |'),
	nopattern: (ctx) => {
		const { e, song } = ctx
		const times = /^(\w+?)[xX](\d+)$/.exec(e.word)
		if (!e.from && times && song.patterns[times[1]]) return word(ctx, `${times[1]}*${times[2]}`)
		return word(ctx, closest(e.word, song.patternOrder))
	},
	refs: (ctx) => {
		const to = ctx.e.word
			.replace(/×/g, '*')
			.replace(/[^\w*+-]+/g, ' ')
			.replace(/[*+-]+(\s|$)/g, '$1')
			.trim()
		const ok = to && to.split(' ').every((w) => /^[A-Za-z_]\w*?([+-]\d+)?(\*\d+)?$/.test(w))
		return ok ? word(ctx, to) : null
	},
	center: (ctx) => octave(ctx, 4),
	note: (ctx) => {
		const w = ctx.e.word
		if (/^h\d/i.test(w)) return word(ctx, `B${w.slice(1)}`)
		const near = [...ctx.body.slice(0, ctx.at).matchAll(/[A-Ga-g](?:##|bb|#|b|q)?([0-8])\b/g)].at(-1)
		const bare = octave(ctx, near?.[1] ?? 4)
		if (bare) return bare
		// Dm7-- is the chord [Dm7]--.
		const [, sym, tail] = /^(.*?)([-!?]*)$/.exec(w)
		const to = /^[A-G]/.test(sym) && (chordToMidis(sym, 60) ? sym : chord(sym))
		return to ? word(ctx, `[${to}]${tail}`) : null
	},
	chord: (ctx) => {
		const to = chord(ctx.e.word.slice(1, -1))
		return to && word(ctx, `[${to}]`)
	},
	hit: (ctx) => (/^[0O]$/.test(ctx.e.word) ? word(ctx, 'o') : null),
	'empty-bar': (ctx) => ({ start: ctx.bar.start, end: ctx.bar.end, to: ' _ ', label: '_', tip: 'Make it a silent bar' }),
	at0: (ctx) => word(ctx, ctx.e.word.replace(/@\d+$/, '@1')),
	'voice-line': (ctx) => {
		const { e, body, at } = ctx
		if (e.msg !== 'No instrument') return null
		const inst = guess(e.word, '')
		const end = at + e.word.length
		return { start: end, end: body.trimEnd().length, to: ` ${inst}`, label: inst, tip: `Add ${inst}` }
	},
	name: (ctx) => word(ctx, tidy(ctx.e.word)),
	'pattern-name': (ctx) => {
		const { e, at, song } = ctx
		if (e.msg !== 'Needs a name') return word(ctx, tidy(e.word))
		const name = freeLetter(song)
		return { start: at + e.word.length, end: at + e.word.length, to: ` ${name}`, label: name, tip: `Name it ${name}` }
	},
	twice: (ctx) =>
		rename(
			ctx,
			ctx.song.voices.map((v) => v.name),
		),
	'pattern-twice': (ctx) => rename(ctx, ctx.song.patternOrder),
	outside: (ctx) => {
		const { e, lines, song } = ctx
		if (!MUSIC.test(lines[e.line - 1])) return null
		// Above the first of the music lines here.
		let ln = e.line
		for (let i = ln - 1; i > 0 && (MUSIC.test(lines[i - 1]) || !lines[i - 1].trim()); i--) if (MUSIC.test(lines[i - 1])) ln = i
		const to = `pattern ${freeLetter(song)}`
		return { ln, start: 0, end: 0, to: `${to}\n`, label: `+ ${to}`, tip: `Add ${to} above` }
	},
	steps: (ctx) => {
		const { e, bar, body, song } = ctx
		const voice = song.voiceMap[MUSIC.exec(body)?.[1]]
		if (!bar || !voice) return null
		const lead = bar.text.match(/^\s*/)[0]
		const trail = bar.text.slice(bar.text.trimEnd().length) || ' '
		const text = bar.text.trim()
		const fill = e.used < e.need
		const to = voice.drum ? drumBar(text, e.need) : fill ? `${text} ${'.'.repeat(e.need - e.used)}` : cut(text, e.need)
		return { start: bar.start, end: bar.end, to: lead + to + trail, label: to, tip: fill ? 'Fill with rests' : `Cut to ${e.need} steps` }
	},
}

// vol 0.8 or vol:0.8, as vol=0.8.
function equals(ctx) {
	const { e, body, at } = ctx
	const bare = /^(\w+)$/.exec(e.word)
	if (!bare) return word(ctx, e.word.replace(/^(\w+)\W/, '$1='))
	const next = /^(\s+)(\S+)/.exec(body.slice(at + e.word.length))
	if (!next) return null
	const to = `${e.word}=${next[2]}`
	return { start: at, end: at + e.word.length + next[0].length, to, tip: `Replace with ${to}` }
}

// A note written without its octave, given one.
function octave(ctx, n) {
	const m = /^([A-Ga-g])(##|bb|#|b|q)?$/.exec(ctx.e.word)
	return m && word(ctx, `${m[1].toUpperCase()}${m[2] ?? ''}${n}`)
}

// A drum bar with `need` steps, filled with rests or cut.
function drumBar(text, need) {
	const steps = text.replace(/\s+/g, '')
	if (steps.length < need) return text + '.'.repeat(need - steps.length)
	let kept = 0
	let i = 0
	for (; i < text.length && kept < need; i++) if (!/\s/.test(text[i])) kept++
	return text.slice(0, i)
}

// A melodic bar cut to `need` steps: what plays of it.
function cut(text, need) {
	let pos = 0
	for (const m of text.matchAll(/\S+/g)) {
		const t = m[0]
		const rest = /^[.-]+$/.test(t)
		const len = rest ? t.length : 1 + (t.replace(/\[[^\]]*\]/, '').match(/-/g) ?? []).length
		if (pos + len >= need) {
			const left = need - pos
			const head = rest ? t.slice(0, left) : t.replace(/-+/, '-'.repeat(left - 1))
			return text.slice(0, m.index) + head
		}
		pos += len
	}
	return text
}

// A chord symbol the way the score writes it, or null.
const SUFFIX = { min: 'm', minor: 'm', major: '', M: 'maj', M7: 'maj7', min7: 'm7', '-': 'm', '-7': 'm7', '°': 'dim', o: 'dim', ø: 'm7b5' }
function chord(sym) {
	const m = /^([A-Ga-gHh])(#|b)?([^/]*)(\/.*)?$/.exec(sym)
	if (!m) return null
	const root = /h/i.test(m[1]) ? 'B' : m[1].toUpperCase()
	const kind = SUFFIX[m[3]] ?? (m[3] in CHORDS ? m[3] : closest(m[3], Object.keys(CHORDS).filter(Boolean)))
	const to = kind == null ? null : `${root}${m[2] ?? ''}${kind}${m[4] ?? ''}`
	return to && to !== sym && chordToMidis(to, 60) ? to : null
}

// A new voice for an unknown name: a line after the last voice line, with
// an instrument that fits its name or its music.
function addVoice(ctx) {
	const { e, lines, body } = ctx
	const last = lines.findLastIndex(isVoice)
	const first = lines.findIndex(isPattern)
	const ln = last >= 0 ? last + 2 : first >= 0 ? first + 1 : e.line
	const to = `voice ${e.word} ${guess(e.word, body.slice(body.indexOf('|')))}`
	return { ln, start: 0, end: 0, to: `${to}\n`, label: `+ ${to}`, tip: `Add voice ${e.word}` }
}

const ALIAS = {
	bass: 'ebass',
	drum: 'kick',
	perc: 'conga',
	keys: 'rhodes',
	piano: 'rhodes',
	chord: 'pad',
	lead: 'square',
	melody: 'flute',
	hh: 'hat',
	bd: 'kick',
	sd: 'snare',
}
// An instrument for a voice called `name` playing `bars`.
export function guess(name, bars) {
	const n = name.toLowerCase()
	if (INSTRUMENTS.includes(n)) return n
	const inside = INSTRUMENTS.find((i) => i.length > 2 && n.includes(i))
	if (inside) return inside
	const alias = Object.keys(ALIAS).find((a) => n.includes(a))
	if (alias) return ALIAS[alias]
	if (/[xXo]/.test(bars) && /^[\sxXo.\-|_%]*$/.test(bars)) return 'kick'
	if (bars.includes('[')) return 'pad'
	if (/[A-G](#|b)?[0-2]/.test(bars)) return 'ebass'
	return 'rhodes'
}

// A name with only letters, digits and _, not starting with a digit.
function tidy(name) {
	const to = name.replace(/\W+/g, '_')
	return /^\d/.test(to) ? `_${to}` : to
}
function rename(ctx, taken) {
	let n = 2
	while (taken.includes(`${ctx.e.word}${n}`)) n++
	return word(ctx, `${ctx.e.word}${n}`, `Rename to ${ctx.e.word}${n}`)
}
function freeLetter(song) {
	for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!song.patterns[c]) return c
	return `P${song.patternOrder.length + 1}`
}

// The one word in `list` that `word` most likely meant to be: the only one it
// starts, or the only one a slip or two away; null if none or several.
export function closest(word, list) {
	const w = word.toLowerCase()
	const starts = list.filter((c) => c.toLowerCase().startsWith(w))
	if (w.length > 1 && starts.length === 1) return starts[0]
	const most = w.length > 4 ? 2 : w.length > 1 ? 1 : 0
	let best = null
	let tie = false
	let least = most + 1
	for (const c of list) {
		const d = distance(w, c.toLowerCase())
		if (d < least) [best, least, tie] = [c, d, false]
		else if (d === least) tie = true
	}
	return best && !tie && best !== word ? best : null
}

// Edits from a to b, a swap of two letters counting as one.
function distance(a, b) {
	const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
	for (let j = 1; j <= b.length; j++) d[0][j] = j
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1
			d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
		}
	return d[a.length][b.length]
}
