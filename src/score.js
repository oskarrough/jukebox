// The score parser, started from Simon Willison's Scrimshaw Jukebox
// (https://tools.simonwillison.net/scrimshaw-jukebox, Apache License 2.0, see LICENSE here).
// Ours now: change it to whatever the game needs.

const MELODIC = [
	'steeldrum',
	'marimba',
	'rhodes',
	'vibes',
	'celesta',
	'glock',
	'xylophone',
	'musicbox',
	'bell',
	'organ',
	'pipe',
	'strings',
	'pad',
	'choir',
	'voices',
	'brass',
	'trumpet',
	'horn',
	'tuba',
	'flute',
	'clarinet',
	'oboe',
	'bassoon',
	'accordion',
	'fiddle',
	'harp',
	'guitar',
	'drive',
	'banjo',
	'harpsichord',
	'pizz',
	'upright',
	'ebass',
	'moog',
	'fretless',
	'synbass',
	'timpani',
	'chip',
	'oud',
	'qanun',
	'ney',
	'808',
	'logdrum',
	'cowbell808',
	'chop',
	'saz',
	'wah',
	'sine',
	'square',
	'saw',
	'triangle',
]
const DRUMS = [
	'kick',
	'snare',
	'rim',
	'hat',
	'ohat',
	'ride',
	'crash',
	'shaker',
	'tamb',
	'conga',
	'tumba',
	'bongo',
	'bongolo',
	'clave',
	'block',
	'cowbell',
	'cuica',
	'guiro',
	'tomlo',
	'tommid',
	'tomhi',
	'bodhran',
	'timbale',
	'tri',
	'clap',
	'dum',
	'tek',
	'riq',
	'gong',
	'thunder',
	'surf',
]

const PC = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }
// q is a half-flat, a quarter tone down: Eq4 is the E half-flat of maqam Rast
// and Bayati. Its midi number is fractional and the synth plays it as such.
const NOTE_RE = /^([A-Ga-g])(##|bb|#|b|q)?([0-8])$/
const ACC = { '': 0, '#': 1, '##': 2, b: -1, bb: -2, q: -0.5 }

function noteToMidi(s) {
	const m = NOTE_RE.exec(s)
	if (!m) return null
	return 12 * (+m[3] + 1) + PC[m[1].toLowerCase()] + ACC[m[2] || '']
}

// Every setting the head takes, as in tempo 120; tempo, beats, steps and
// swing also work inside a pattern, and on its line as tempo=90.
const SETTINGS = ['title', 'key', 'tempo', 'beats', 'steps', 'swing', 'reverb', 'tags', 'about', 'composer', 'by', 'game', 'street', 'at']
const PATTERN_OPTIONS = ['tempo', 'beats', 'steps', 'swing']

// Every option a voice line takes, as in vol=0.8.
const OPTIONS = ['vol', 'pan', 'rev', 'oct', 'trans', 'gate', 'glide', 'bright', 'att', 'rel', 'center', 'drive', 'echo', 'tail', 'part']

// What a voice plays of the chord row's chord, on its x steps: the whole
// chord, its root (the note after / on a slash chord), the chord without its
// root (when a bass has it), its top note, or the next note up on each hit.
const PARTS = ['chord', 'root', 'rootless', 'top', 'up']

// Instruments that sound best an octave or two down: their chords and roots
// sit around D2 unless center= says otherwise.
const LOW = new Set(['808', 'logdrum', 'ebass', 'upright', 'fretless', 'synbass', 'tuba', 'bassoon', 'timpani'])

// Each chord as semitones above its root; 12 and up are the colours a
// pianist plays above the octave: 14 the 9th, 17 the 11th, 21 the 13th.
const CHORDS = {
	'': [0, 4, 7],
	maj: [0, 4, 7],
	m: [0, 3, 7],
	min: [0, 3, 7],
	5: [0, 7],
	6: [0, 4, 7, 9],
	m6: [0, 3, 7, 9],
	7: [0, 4, 7, 10],
	m7: [0, 3, 7, 10],
	maj7: [0, 4, 7, 11],
	mmaj7: [0, 3, 7, 11],
	9: [0, 4, 7, 10, 14],
	m9: [0, 3, 7, 10, 14],
	maj9: [0, 4, 7, 11, 14],
	add9: [0, 4, 7, 14],
	madd9: [0, 3, 7, 14],
	'6/9': [0, 4, 7, 9, 14],
	'm6/9': [0, 3, 7, 9, 14],
	// An 11 leaves out the 3rd, a 13 the 11th, as pianists do.
	11: [0, 7, 10, 14, 17],
	m11: [0, 3, 7, 10, 14, 17],
	13: [0, 4, 7, 10, 14, 21],
	m13: [0, 3, 7, 10, 14, 21],
	maj13: [0, 4, 7, 11, 14, 21],
	sus2: [0, 2, 7],
	sus4: [0, 5, 7],
	sus: [0, 5, 7],
	'7sus4': [0, 5, 7, 10],
	'9sus4': [0, 5, 7, 10, 14],
	dim: [0, 3, 6],
	dim7: [0, 3, 6, 9],
	m7b5: [0, 3, 6, 10],
	aug: [0, 4, 8],
	'+': [0, 4, 8],
	'7b9': [0, 4, 7, 10, 13],
	'7#9': [0, 4, 7, 10, 15],
	'maj7#11': [0, 4, 7, 11, 18],
}

function pcOf(letter, acc) {
	return (PC[letter.toLowerCase()] + ACC[acc || ''] + 12) % 12
}

// `key C`, `key Dm`, `key F#`. Existing songs may omit it.
export function parseKey(s) {
	if (s == null || s === '') return null
	const m = /^([A-G])(#|b)?\s*(maj|major|min|minor|m)?$/i.exec(String(s).trim())
	if (!m) return null
	const letter = m[1].toUpperCase()
	const acc = m[2] || ''
	const mode = (m[3] || '').toLowerCase()
	const minor = mode === 'm' || mode === 'min' || mode === 'minor'
	const pc = (PC[letter.toLowerCase()] + (ACC[acc] || 0) + 12) % 12
	return { letter, acc, minor, pc, name: letter + acc + (minor ? 'm' : '') }
}
function placeNear(pc, lo) {
	return lo + ((((pc - lo) % 12) + 12) % 12)
}

// Dm7, C/E, C6/9: its root, its kind and the note after the slash.
const CHORD_RE = /^([A-G])(#|b)?(.*?)(?:\/([A-G])(#|b)?)?$/
function parseChord(sym) {
	const m = CHORD_RE.exec(sym)
	if (!m || !Object.hasOwn(CHORDS, m[3])) return null
	return { root: pcOf(m[1], m[2]), ivs: CHORDS[m[3]], bass: m[4] ? pcOf(m[4], m[5]) : null }
}

// [Dm7] or [C/E] -> midi notes voiced in a window around `center`. Chords
// with colours above the octave are voiced the way a pianist would; the
// rest as they always were, every note within a few steps of `center`.
function chordToMidis(sym, center) {
	const c = parseChord(sym)
	if (!c) return null
	if (c.ivs.some((iv) => iv >= 12)) return voicing(c, center)
	const lo = center - 6
	const set = new Set(c.ivs.map((iv) => placeNear((c.root + iv) % 12, lo)))
	if (c.bass != null) set.add(placeNear(c.bass, lo - 12))
	return [...set].sort((a, b) => a - b)
}

// The best way to play chord `c` near `center`: every note within 14 steps
// of it, colours above the root's octave, close rather than spread, seldom
// two a semitone apart. After `prev`, the one the hands move least to reach;
// with nothing before, root at the bottom.
function voicing(c, center, prev) {
	const notes = c.ivs.map((iv) => ({ pc: (c.root + iv) % 12, colour: iv >= 12, root: iv === 0 }))
	const places = notes.map((n) => {
		const out = []
		for (let m = placeNear(n.pc, center - 14); m <= center + 14; m += 12) out.push(m)
		return out
	})
	let best = null
	let least = Infinity
	const pick = (k, chosen) => {
		if (k < notes.length) {
			for (const m of places[k]) pick(k + 1, [...chosen, m])
			return
		}
		const root = notes.some((n) => n.root) ? chosen[notes.findIndex((n) => n.root)] : null
		if (root != null && notes.some((n, i) => n.colour && chosen[i] <= root + 12)) return
		const sorted = [...chosen].sort((a, b) => a - b)
		let cost = 0
		for (let i = 1; i < sorted.length; i++) {
			const gap = sorted[i] - sorted[i - 1]
			if (gap < 1) return
			cost += gap === 1 ? 4 : 3 * Math.max(0, gap - 5)
		}
		const middle = (sorted[0] + sorted.at(-1)) / 2
		if (prev?.length) {
			const near = (a, list) => Math.min(...list.map((b) => Math.abs(a - b)))
			cost += sorted.reduce((n, a) => n + near(a, prev), 0) + prev.reduce((n, b) => n + near(b, sorted), 0)
			cost += 0.3 * Math.abs(middle - center)
		} else cost += Math.abs(middle - center) + (root == null || sorted[0] === root ? 0 : 6)
		if (cost < least) [best, least] = [sorted, cost]
	}
	pick(0, [])
	if (!best) {
		const lo = center - 6
		best = [...new Set(c.ivs.map((iv) => placeNear((c.root + iv) % 12, lo) + (iv >= 12 ? 12 : 0)))].sort((a, b) => a - b)
	}
	if (c.bass != null && c.bass !== best[0] % 12) best = [placeNear(c.bass, best[0] - 12), ...best]
	return best
}

const T_HOLD = /^-+$/
const T_REST = /^(\.+)(-*)$/
const NOTE_SRC = '[A-Ga-g](?:##|bb|#|b|q)?[0-8]'
const T_NOTE = new RegExp('^(~?)(\\[[^\\]]+\\]|' + NOTE_SRC + '(?:\\+' + NOTE_SRC + ')*)([!?]*)(-*)([!?]*)$')

// A bar of steps like a drum lane's, x... ..x. x---, on a voice that takes
// notes: it plays the chord row's chord in that rhythm, - holding.
const T_FOLLOW = /^[xXo.\-\s]*[xXo][xXo.\-\s]*$/
const HIT = { x: 0.8, X: 1.05, o: 0.42 }

// What's wrong with a word that should be a note.
const noteMsg = (s) => (/^[A-Ga-g](##|bb|#|b|q)?$/.test(s) ? 'Needs an octave, like C4' : `No note called ${s}`)

const steps = (n) => (n === 1 ? '1 step' : `${n} steps`)

function velFrom(marks) {
	let v = 0.8
	for (const ch of marks) v *= ch === '!' ? 1.25 : 0.6
	return Math.min(1.35, v)
}

function num(s, lo, hi, def) {
	const n = parseFloat(s)
	if (!isFinite(n)) return def
	return Math.max(lo, Math.min(hi, n))
}

/* ------------------------------------------------------------------ parse */
function parse(text) {
	const errors = []
	// Each error says what kind it is and, when it can, the `word` it's about
	// and which `bar` on the line, from 0, so the page can point at it and fix it.
	const err = (ln, msg, about) => errors.push({ line: ln, msg, ...about })
	// An option that errors rather than clamps when it's out of range.
	const inRange = (ln, name, val, lo, hi, def, what) => {
		const n = Number(val)
		if (val !== '' && isFinite(n) && n >= lo && n <= hi) return n
		err(ln, `${name} takes ${what}`, { kind: 'value', word: val })
		return def
	}
	const song = {
		title: 'Untitled',
		composer: '',
		about: '',
		street: '',
		at: [],
		game: '',
		tags: [],
		tempo: 120,
		beats: 4,
		steps: 4,
		swing: 0,
		reverb: 0.3,
		key: null,
		voices: [],
		voiceMap: {},
		patterns: {},
		patternOrder: [],
		play: [],
		loop: [],
	}
	let cur = null
	const lines = String(text).split(/\r?\n/)

	lines.forEach((raw, i) => {
		const ln = i + 1
		const line = raw.replace(/(^|\s)#.*$/, '').trim()
		if (!line) return

		const pm = /^([A-Za-z_]\w*)(?:@(\d+))?\s*\|(.*)$/.exec(line)
		if (pm) {
			if (!cur) {
				err(ln, 'No pattern above', { kind: 'outside' })
				return
			}
			const parts = pm[3].split('|').map((s) => s.trim())
			while (parts.length && parts[parts.length - 1] === '') parts.pop()
			const bars = []
			parts.forEach((b, k) => {
				if (b === '') err(ln, 'Empty bar', { kind: 'empty-bar', bar: k })
				else bars.push(b)
			})
			const at = pm[2] ? +pm[2] : 0
			if (pm[2] && at < 1) err(ln, 'Bars start at 1', { kind: 'at0', word: `${pm[1]}@${pm[2]}` })
			if (pm[1] === 'chords') {
				cur.chords.push({ bars, ln, at })
				return
			}
			;(cur.raw[pm[1]] = cur.raw[pm[1]] || []).push({ bars, ln, at })
			if (!cur.voiceOrder.includes(pm[1])) cur.voiceOrder.push(pm[1])
			return
		}

		const words = line.split(/\s+/)
		const kw = words[0].toLowerCase()
		const restStr = line.slice(words[0].length).trim()
		const target = cur ? cur.opts : song

		switch (kw) {
			case 'title':
				song.title = restStr || song.title
				break
			case 'composer':
			case 'by':
				song.composer = restStr
				break
			case 'about':
				song.about = restStr
				break
			case 'street':
				song.street = restStr
				break
			case 'game':
				song.game = restStr.toLowerCase()
				break
			case 'tags':
				song.tags = restStr.toLowerCase().split(/\s+/).filter(Boolean)
				break
			case 'at':
				song.at = restStr.toLowerCase().split(/\s+/).filter(Boolean)
				break
			case 'tempo':
				target.tempo = num(restStr, 20, 400, 120)
				break
			case 'beats':
				target.beats = Math.round(num(restStr, 1, 16, 4))
				break
			case 'steps':
				target.steps = Math.round(num(restStr, 1, 12, 4))
				break
			case 'swing':
				target.swing = num(restStr, 0, 0.75, 0)
				break
			case 'reverb':
				song.reverb = num(restStr, 0, 1, 0.3)
				break
			case 'key': {
				const k = parseKey(restStr)
				if (!k) err(ln, restStr ? `No key called ${restStr}` : 'Needs a key, like Dm', { kind: 'key', word: restStr || 'key' })
				else song.key = k
				break
			}
			case 'voice':
				parseVoice(words.slice(1), ln)
				break
			case 'pattern': {
				const name = words[1]
				if (!name || !/^[A-Za-z_]\w*$/.test(name)) {
					err(ln, name ? 'Names use letters, digits and _' : 'Needs a name', { kind: 'pattern-name', word: name ?? 'pattern' })
					cur = null
					return
				}
				if (song.patterns[name]) err(ln, `${name} is already a pattern`, { kind: 'pattern-twice', word: name })
				cur = { name, ln, from: null, opts: {}, raw: {}, chords: [], voiceOrder: [], mute: new Set() }
				for (let k = 2; k < words.length; k++) {
					const w = words[k]
					if (w.toLowerCase() === 'from') {
						cur.from = words[++k]
						continue
					}
					const kv = /^(\w+)=(.+)$/.exec(w)
					if (!kv) {
						const bare = /^(\w+)\W?/.exec(w)?.[1].toLowerCase()
						const lone = PATTERN_OPTIONS.includes(bare) && w === bare && words[k + 1]
						err(ln, PATTERN_OPTIONS.includes(bare) ? 'Missing =' : `No option called ${w}`, { kind: 'pattern-word', word: w })
						if (lone) k++
						continue
					}
					const key = kv[1].toLowerCase()
					if (key === 'tempo') cur.opts.tempo = num(kv[2], 20, 400, 120)
					else if (key === 'beats') cur.opts.beats = Math.round(num(kv[2], 1, 16, 4))
					else if (key === 'steps') cur.opts.steps = Math.round(num(kv[2], 1, 12, 4))
					else if (key === 'swing') cur.opts.swing = num(kv[2], 0, 0.75, 0)
					else err(ln, `No option called ${kv[1]}`, { kind: 'pattern-opt', word: kv[1] })
				}
				song.patterns[name] = cur
				if (!song.patternOrder.includes(name)) song.patternOrder.push(name)
				break
			}
			case 'mute':
				if (!cur) err(ln, 'No pattern above', { kind: 'outside' })
				else words.slice(1).forEach((w) => cur.mute.add(w))
				break
			case 'play':
			case 'loop': {
				cur = null
				const list = kw === 'play' ? song.play : song.loop
				for (const w of words.slice(1)) {
					const m = /^([A-Za-z_]\w*?)([+-]\d+)?(?:\*(\d+))?$/.exec(w)
					if (!m) {
						err(ln, 'Like A, A*2 or A+5', { kind: 'refs', word: w })
						continue
					}
					list.push({ name: m[1], trans: m[2] ? parseInt(m[2], 10) : 0, times: m[3] ? Math.min(64, parseInt(m[3], 10)) : 1, ln })
				}
				break
			}
			default:
				// Inside a pattern, a word on its own is most likely a voice.
				if (!cur) err(ln, `No setting called ${words[0]}`, { kind: 'line', word: words[0] })
				else if (song.voiceMap[words[0]]) err(ln, 'Missing |', { kind: 'bars', word: words[0] })
				else err(ln, `No voice called ${words[0]}`, { kind: 'line', word: words[0], music: true })
		}
	})

	function parseVoice(w, ln) {
		const [name, inst] = w
		if (!name || !inst) {
			err(ln, name ? 'No instrument' : 'Needs a name and an instrument', { kind: 'voice-line', word: name ?? 'voice' })
			return
		}
		if (!/^[A-Za-z_]\w*$/.test(name)) {
			err(ln, 'Names use letters, digits and _', { kind: 'name', word: name })
			return
		}
		const instL = inst.toLowerCase()
		const isDrum = DRUMS.includes(instL)
		if (!isDrum && !MELODIC.includes(instL)) {
			err(ln, `No instrument called ${inst}`, { kind: 'inst', word: inst })
			return
		}
		const v = {
			name,
			inst: instL,
			drum: isDrum,
			vol: 0.8,
			pan: 0,
			rev: null,
			trans: 0,
			glide: 0.07,
			gate: 1,
			center: LOW.has(instL) ? 38 : 62,
			part: 'chord',
			bright: 1,
			att: null,
			rel: null,
			drive: 0,
			echo: 0,
			tail: 0.5,
			ln,
		}
		for (let i = 2; i < w.length; i++) {
			const opt = w[i]
			const kv = /^(\w+)=(.+)$/.exec(opt)
			if (!kv) {
				// vol 0.8 or vol:0.8: one slip, not two.
				const bare = /^(\w+)\W?/.exec(opt)?.[1].toLowerCase()
				err(ln, OPTIONS.includes(bare) ? 'Missing =' : `No option called ${opt}`, { kind: 'opt-form', word: opt })
				if (OPTIONS.includes(bare) && opt === bare && w[i + 1]) i++
				continue
			}
			const k = kv[1].toLowerCase(),
				val = kv[2]
			switch (k) {
				case 'vol':
					v.vol = num(val, 0, 2, 0.8)
					break
				case 'pan':
					v.pan = num(val, -1, 1, 0)
					break
				case 'rev':
					v.rev = num(val, 0, 1, 0.2)
					break
				case 'trans':
					v.trans = Math.round(num(val, -48, 48, 0))
					break
				case 'oct':
					v.trans += 12 * Math.round(num(val, -4, 4, 0))
					break
				case 'glide':
					v.glide = num(val, 0.005, 2, 0.07)
					break
				case 'gate':
					v.gate = num(val, 0.05, 1, 1)
					break
				case 'bright':
					v.bright = num(val, 0.1, 4, 1)
					break
				case 'att':
					v.att = num(val, 0.001, 4, 0.01)
					break
				case 'rel':
					v.rel = num(val, 0.005, 6, 0.1)
					break
				case 'drive':
					v.drive = num(val, 0, 4, 0)
					break
				case 'echo':
					v.echo = inRange(ln, k, val, 0, 16, 0, '0 to 16 steps, like echo=3')
					break
				case 'tail':
					v.tail = inRange(ln, k, val, 0, 0.9, 0.5, '0 to 0.9, how much of each echo comes back')
					break
				case 'part':
					if (PARTS.includes(val.toLowerCase())) v.part = val.toLowerCase()
					else err(ln, 'part takes chord, root, rootless, top or up', { kind: 'part', word: val })
					break
				case 'center': {
					const m = noteToMidi(val)
					if (m == null) err(ln, noteMsg(val), { kind: 'center', word: val })
					else v.center = m
					break
				}
				default:
					err(ln, `No option called ${kv[1]}`, { kind: 'opt', word: kv[1] })
			}
		}
		if (name === 'chords') err(ln, 'chords is the chord row', { kind: 'twice', word: name })
		else if (song.voiceMap[name]) err(ln, `${name} is already a voice`, { kind: 'twice', word: name })
		else {
			song.voiceMap[name] = v
			song.voices.push(v)
		}
	}

	return { song, errors }
}

/* ------------------------------------------------------- pattern bodies */
function parseMelodicBars(bars, barSteps, voice, ctx) {
	const events = []
	let last = null
	const out = []
	bars.forEach((barSrc, bi) => {
		const start = bi * barSteps
		const err = (msg, about) => ctx.err(msg, { bar: bi, ...about })
		const trimmed = barSrc.trim()
		if (trimmed === '%') {
			const prev = events.filter((e) => e.step >= start - barSteps && e.step < start)
			if (bi === 0) err('No bar to repeat', { kind: 'repeat', word: '%' })
			prev.forEach((e) => events.push(Object.assign({}, e, { step: e.step + barSteps })))
			last = events.length ? events[events.length - 1] : null
			return
		}
		if (trimmed === '_') {
			last = null
			return
		}
		if (trimmed === '=') {
			if (last && last.step + last.len === start) last.len += barSteps
			else err('No note to hold', { kind: 'hold', word: '=' })
			return
		}
		if (T_FOLLOW.test(trimmed)) {
			if (!ctx.chords) err('No chords to follow', { kind: 'nochords' })
			let k = 0
			for (const ch of trimmed.replace(/\s+/g, '')) {
				if (ch === '-') {
					if (last && last.step + last.len === start + k) last.len++
				} else if (ch === '.') last = null
				else events.push((last = { step: start + k, len: 1, vel: HIT[ch], follow: true }))
				k++
			}
			if (k !== barSteps) {
				err(`${steps(k)}, needs ${barSteps}`, { kind: 'steps', used: k, need: barSteps })
				for (const e of events) if (e.step >= start + barSteps) e.len = 0
				if (last && last.step + last.len > start + barSteps) last.len = Math.max(1, start + barSteps - last.step)
			}
			return
		}
		let pos = start
		for (const tok of trimmed.split(/\s+/)) {
			let m
			if (T_HOLD.test(tok)) {
				if (last && last.step + last.len === pos) last.len += tok.length
				pos += tok.length
			} else if ((m = T_REST.exec(tok))) {
				pos += m[1].length + m[2].length
				last = null
			} else if ((m = T_NOTE.exec(tok))) {
				const head = m[2]
				let notes
				if (head[0] === '[') {
					notes = chordToMidis(head.slice(1, -1), voice.center)
					if (!notes) {
						err(`No chord called ${head.slice(1, -1)}`, { kind: 'chord', word: head })
						notes = []
					}
				} else {
					notes = head.split('+').map(noteToMidi)
				}
				const len = 1 + m[4].length
				last = { step: pos, len, notes, vel: velFrom(m[3] + m[5]), glide: m[1] === '~' }
				if (notes.length) events.push(last)
				pos += len
			} else if (tok === '%' || tok === '_' || tok === '=') {
				err(`${tok} needs a bar of its own`, { kind: 'alone', word: tok })
			} else if (T_FOLLOW.test(tok)) {
				err('x steps need a bar of their own', { kind: 'alone', word: tok })
			} else {
				err(noteMsg(tok), { kind: 'note', word: tok })
			}
		}
		const used = pos - start
		if (used !== barSteps) {
			err(`${steps(used)}, needs ${barSteps}`, { kind: 'steps', used, need: barSteps })
			// clip anything spilling into the next bar so later bars stay aligned
			for (const e of events) if (e.step >= start + barSteps) e.len = 0
			if (last && last.step + last.len > start + barSteps && used > barSteps) last.len = Math.max(1, start + barSteps - last.step)
		}
	})
	for (const e of events) if (e.len > 0) out.push(...(e.follow ? follow(e, voice, ctx) : [e]))
	return out
}

// A hit on an x step, as the notes of the chord row's chord: struck again
// where the chord changes while it's held, silent where there is none.
function follow(e, voice, ctx) {
	const at = ctx.chords
	if (!at) return []
	const out = []
	for (let s = e.step; s < e.step + e.len; s++) {
		const sym = at[Math.min(s, at.length - 1)]
		const held = out.at(-1)
		if (held && held.sym === sym && held.step + held.len === s) held.len++
		else if (sym) out.push({ step: s, len: 1, vel: e.vel, sym, notes: part(sym, voice, ctx.played, s === e.step) })
	}
	return out
}

// The notes of chord `sym` that `voice` plays, moving as little as it can
// from what it played before (`played`, kept per voice).
function part(sym, voice, played, struck) {
	const c = parseChord(sym)
	const before = played[voice.name]
	const rootless = voice.part === 'rootless' && c.ivs.length > 2 ? { root: c.root, ivs: c.ivs.filter((iv) => iv % 12), bass: null } : c
	const notes = before?.sym === sym ? before.notes : voicing(rootless, voice.center, before?.notes)
	const up = before?.sym === sym && struck ? (before.up + 1) % notes.length : 0
	played[voice.name] = { sym, notes, up }
	if (voice.part === 'root') return [placeNear(c.bass ?? c.root, voice.center - 7)]
	if (voice.part === 'top') return [notes.at(-1)]
	if (voice.part === 'up') return [notes[up]]
	return notes
}

// The chord row: which chord sounds on each step, null where none does.
// Chords in a bar share it evenly; - holds the one before a share longer,
// . is a share with none. The last chord rings on to the pattern's end.
function parseChordBars(bars, barSteps, ctx) {
	const at = []
	bars.forEach((barSrc, bi) => {
		const err = (msg, about) => ctx.err(msg, { bar: bi, ...about })
		const toks = barSrc.trim().split(/\s+/)
		const start = bi * barSteps
		if (toks.length === 1 && toks[0] === '%') {
			if (bi === 0) err('No bar to repeat', { kind: 'repeat', word: '%' })
			for (let k = 0; k < barSteps; k++) at.push(at[start - barSteps + k] ?? null)
			return
		}
		if (toks.length === 1 && toks[0] === '_') {
			for (let k = 0; k < barSteps; k++) at.push(null)
			return
		}
		let sym = null
		toks.forEach((tok, i) => {
			if (tok === '.') sym = null
			else if (tok !== '-') {
				sym = parseChord(tok) ? tok : null
				if (!sym) err(`No chord called ${tok}`, { kind: 'chord', word: tok, row: true })
			}
			const to = start + Math.round(((i + 1) * barSteps) / toks.length)
			while (at.length < to) at.push(sym)
		})
	})
	return at
}

function parseDrumBars(bars, barSteps, voice, ctx) {
	const events = []
	bars.forEach((barSrc, bi) => {
		const start = bi * barSteps
		const err = (msg, about) => ctx.err(msg, { bar: bi, ...about })
		const s = barSrc.replace(/\s+/g, '')
		if (s === '%') {
			if (bi === 0) err('No bar to repeat', { kind: 'repeat', word: '%' })
			events
				.filter((e) => e.step >= start - barSteps && e.step < start)
				.forEach((e) => events.push({ step: e.step + barSteps, len: 1, vel: e.vel }))
			return
		}
		if (s === '_') return
		let k = 0
		for (const ch of s) {
			if (k < barSteps) {
				if (ch === 'x') events.push({ step: start + k, len: 1, vel: 0.8 })
				else if (ch === 'X') events.push({ step: start + k, len: 1, vel: 1.05 })
				else if (ch === 'o') events.push({ step: start + k, len: 1, vel: 0.42 })
				else if (ch !== '.' && ch !== '-') err('Steps are x X o .', { kind: 'hit', word: ch })
			}
			k++
		}
		if (k !== barSteps) err(`${steps(k)}, needs ${barSteps}`, { kind: 'steps', used: k, need: barSteps })
	})
	return events
}

/* ---------------------------------------------------------------- compile */
// With `only`, the song loops that one pattern.
function compile(text, only) {
	const { song, errors } = parse(text)
	const err = (ln, msg, about) => errors.push({ line: ln, msg, ...about })

	const resolved = {}
	function resolve(name, stack) {
		if (resolved[name]) return resolved[name]
		const p = song.patterns[name]
		if (!p) return null
		let raw = {},
			opts = {},
			order = [],
			chords = [],
			mute = new Set()
		if (p.from) {
			if (stack.includes(p.from)) {
				err(p.ln, `${name} builds on itself`, { kind: 'self', word: p.from })
			} else {
				const base = resolve(p.from, stack.concat(name))
				if (!base) err(p.ln, `No pattern called ${p.from}`, { kind: 'nopattern', word: p.from, from: true })
				else {
					raw = Object.assign({}, base.raw)
					opts = Object.assign({}, base.opts)
					order = base.order.slice()
					chords = base.chords
					mute = new Set(base.mute)
				}
			}
		}
		for (const v of p.voiceOrder) {
			raw[v] = patch(p.raw[v], raw[v])
			mute.delete(v)
			if (!order.includes(v)) order.push(v)
		}
		if (p.chords.length) chords = patch(p.chords, chords)
		p.mute.forEach((v) => mute.add(v))
		Object.assign(opts, p.opts)
		return (resolved[name] = { name, ln: p.ln, raw, opts, order, chords, mute })
	}

	// A line written voice@N | … | replaces bars from N on and keeps the rest,
	// from this pattern's plain lines if it has any, else from the base pattern.
	function patch(lines, inherited) {
		const whole = lines.filter((l) => !l.at)
		const patches = lines.filter((l) => l.at)
		if (!patches.length) return lines
		const base = whole.length ? whole : inherited || []
		const bars = base.flatMap((l) => l.bars.map((b, k) => ({ bars: [b], ln: l.ln, k: (l.k ?? 0) + k })))
		for (const l of patches)
			l.bars.forEach((b, k) => {
				for (let i = bars.length; i < l.at - 1 + k; i++) bars.push({ bars: ['_'], ln: l.ln, k: -1 })
				bars[l.at - 1 + k] = { bars: [b], ln: l.ln, k }
			})
		return bars
	}

	const compiled = {}
	function compilePattern(name) {
		if (compiled[name]) return compiled[name]
		const r = resolve(name, [])
		if (!r) return null
		const tempo = r.opts.tempo || song.tempo
		const beats = r.opts.beats || song.beats
		const steps = r.opts.steps || song.steps
		const swing = r.opts.swing != null ? r.opts.swing : song.swing
		const barSteps = beats * steps
		const perVoice = {}
		// Where each voice's bars are written: the line, and which bar on it.
		const where = {}
		let nBars = 0
		// Each bar's error goes on the line that holds the bar.
		const placed = (name, lines) => ({
			err: (m, about) => {
				const w = where[name][about.bar]
				err(w ? w.ln : lines[0].ln, m, { ...about, bar: w?.k })
			},
		})
		let chords = null
		if (r.chords.length) {
			const bars = r.chords.flatMap((l) => l.bars)
			where.chords = r.chords.flatMap((l) => l.bars.map((_, k) => ({ ln: l.ln, k: (l.k ?? 0) + k })))
			chords = parseChordBars(bars, barSteps, placed('chords', r.chords))
			nBars = bars.length
		}
		const played = {}
		for (const vName of r.order) {
			if (r.mute.has(vName)) continue
			const voice = song.voiceMap[vName]
			const lines = r.raw[vName]
			if (!voice) {
				err(lines[0].ln, `No voice called ${vName}`, { kind: 'novoice', word: vName })
				continue
			}
			const bars = [].concat(...lines.map((l) => l.bars))
			where[vName] = lines.flatMap((l) => l.bars.map((_, k) => ({ ln: l.ln, k: (l.k ?? 0) + k })))
			const ctx = { ...placed(vName, lines), chords, played }
			perVoice[vName] = voice.drum ? parseDrumBars(bars, barSteps, voice, ctx) : parseMelodicBars(bars, barSteps, voice, ctx)
			nBars = Math.max(nBars, bars.length)
		}
		if (!nBars) err(r.ln, 'Empty pattern', { kind: 'empty', word: name })
		const row = []
		if (chords)
			for (let k = 0; k < Math.max(1, nBars) * barSteps; k++) {
				const sym = chords[Math.min(k, chords.length - 1)]
				const held = row.at(-1)
				if (held && held.sym === sym && held.step + held.len === k) held.len++
				else if (sym) row.push({ step: k, len: 1, sym })
			}
		return (compiled[name] = {
			name,
			tempo,
			beats,
			steps,
			swing,
			barSteps,
			bars: Math.max(1, nBars),
			perVoice,
			where,
			chords: row,
			ln: r.ln,
		})
	}

	const voices = song.voices
	const vIndex = {}
	voices.forEach((v, i) => {
		vIndex[v.name] = i
	})
	const lastMidi = {}

	function timeline(refs) {
		const events = [],
			sections = []
		let t = 0
		for (const ref of refs) {
			const p = compilePattern(ref.name)
			if (!p) {
				err(ref.ln, `No pattern called ${ref.name}`, { kind: 'nopattern', word: ref.name })
				continue
			}
			const stepDur = 60 / p.tempo / p.steps
			const sw = p.steps % 2 === 0 ? p.swing : 0
			const timeOf = (s) => (s + (s % 2 === 1 ? sw : 0)) * stepDur
			const total = p.bars * p.barSteps
			for (let rep = 0; rep < ref.times; rep++) {
				const sIdx = sections.length
				sections.push({
					name: ref.name,
					trans: ref.trans,
					start: t,
					dur: total * stepDur,
					bars: p.bars,
					barDur: p.barSteps * stepDur,
					tempo: p.tempo,
					beats: p.beats,
					steps: p.steps,
					where: p.where,
					// The chord row: each chord's step in the pattern, its length and name.
					chords: p.chords,
					ln: p.ln,
				})
				const evs = []
				for (const vName in p.perVoice) {
					const voice = song.voiceMap[vName]
					const vi = vIndex[vName]
					// a glide slides from this voice's previous note
					let prev = lastMidi[vi]
					for (const e of p.perVoice[vName]) {
						if (e.step >= total) continue
						const t0 = timeOf(e.step)
						let d = timeOf(Math.min(total, e.step + e.len)) - t0
						// b and st: the bar in the pattern, and the step in it
						const ev = { t: t + t0, d, v: vi, vel: e.vel, s: sIdx, b: Math.floor(e.step / p.barSteps), st: e.step % p.barSteps }
						if (voice.echo) ev.sd = stepDur
						if (!voice.drum) {
							ev.m = e.notes.map((n) => n + voice.trans + ref.trans)
							ev.d = Math.max(0.02, d * voice.gate)
							if (e.glide && prev != null) ev.g = prev
							prev = ev.m[ev.m.length - 1]
						}
						evs.push(ev)
					}
				}
				evs.sort((a, b) => a.t - b.t || a.v - b.v)
				for (const ev of evs) {
					if (ev.m) lastMidi[ev.v] = ev.m[ev.m.length - 1]
					events.push(ev)
				}
				t += total * stepDur
			}
		}
		return { events, sections, dur: t }
	}

	let playRefs = song.play,
		loopRefs = song.loop
	if (!playRefs.length && !loopRefs.length) {
		loopRefs = song.patternOrder.map((n) => ({ name: n, trans: 0, times: 1, ln: song.patterns[n].ln }))
	}
	if (only && song.patterns[only]) {
		playRefs = []
		loopRefs = [{ name: only, trans: 0, times: 1, ln: song.patterns[only].ln }]
	}
	const intro = timeline(playRefs)
	const loop = timeline(loopRefs)
	const empty = !intro.dur && !loop.dur
	if (empty && !errors.length) errors.push({ line: 1, msg: 'Nothing to play yet', kind: 'nothing' })

	errors.sort((a, b) => a.line - b.line)
	return {
		title: song.title,
		composer: song.composer,
		about: song.about,
		street: song.street,
		at: song.at,
		game: song.game,
		tags: song.tags,
		// Nothing to play yet: a new song, before its first pattern.
		empty,
		tempo: song.tempo,
		beats: song.beats,
		steps: song.steps,
		reverb: song.reverb,
		key: song.key,
		voices,
		intro,
		loop,
		errors,
		patternCount: song.patternOrder.length,
	}
}

export {
	parse,
	compile,
	noteToMidi,
	chordToMidis,
	parseChord,
	voicing,
	CHORD_RE,
	MELODIC,
	DRUMS,
	LOW,
	CHORDS,
	PARTS,
	OPTIONS,
	SETTINGS,
	PATTERN_OPTIONS,
}
