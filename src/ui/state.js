// The jukebox page's state and what you can do with it: which song is open,
// its text as you edit it, what's muted, how the game would place it, and
// the audio playing it. Components read the signals and call the actions.
import { createEffect, createMemo, createRoot, createSignal, createStore, flush, untrack } from 'solid-js'
import { BRICKS, addBrick, brickBar, brickInto, brickVoice, growRepeats, tonic } from '../bricks.js'
import { EFFECTS, SOURCES, effectState, runChain } from '../effects.js'
import { inferKey, newTitle, setSongKey, starter } from '../key.js'
import { chordToMidis, compile, noteToMidi, parse, parseKey } from '../score.js'
import { addSection as addPattern, moveSection, removeSection, repeatSection, sectionsOf } from './arrange.js'
import { fate, neighbour, reinsert } from './discard.js'
import { columnOf, marksFor } from './link.js'
import { addPad, barsIn, harmonyVoice, writeChord } from './pad.js'
import { slug } from './slug.js'
import { voiceColors } from '../roll.js'
import { AHEAD, begin, end, feed, synthFor, tune } from '../player.js'
import { NAMES, SONGS } from '../songs.js'

// Hearing the song as written: every device bypassed.
const DRY = Object.fromEntries(EFFECTS.map((d) => [d.id, { on: false }]))

// How much of a starter style you hear when you point at it, in seconds.
const TASTE = 4

// Compiling is the slow part; the same text compiles once, and once more
// looping just its pattern `only`.
const compiled = new Map()
function compileText(t, only) {
	const id = only ? `${only}\0${t}` : t
	if (!compiled.has(id)) {
		if (compiled.size > 300) compiled.clear()
		compiled.set(id, compile(t, only))
	}
	return compiled.get(id)
}

// Drafts: what you've written here and not saved yet, kept in the browser so
// a reload doesn't lose it.
const DRAFTS = 'jukebox:drafts'
const MADE = 'jukebox:made'
function load(key, fallback) {
	try {
		return JSON.parse(localStorage.getItem(key)) ?? fallback
	} catch {
		return fallback
	}
}
function store(key, value) {
	try {
		localStorage.setItem(key, JSON.stringify(value))
	} catch {}
}

// The score's editor, once it's on the page: { value(), replace(from, to,
// insert) as one edit ⌘Z undoes, focus(atEnd) }.
let editor = null
export const useEditor = (e) => (editor = e)

export const jb = createRoot(() => {
	// What's in music/, as last saved; the page's edits are drafts on top.
	const [files, setFiles] = createSignal({ ...SONGS })
	const fileNames = createMemo(() => Object.keys(files()))
	const drafts = load(DRAFTS, {})
	const [name, setName] = createSignal(NAMES[0])
	const [texts, setTexts] = createStore({ ...SONGS, ...drafts })
	// Songs made here, which live only on this page until saved. A draft that
	// is a song in music/ already was saved just as the page reloaded.
	const saved = new Set(Object.values(SONGS).map((t) => t.trim()))
	const [made, setMade] = createSignal(load(MADE, []).filter((n) => n in drafts && !(n in SONGS) && !saved.has(drafts[n].trim())))
	const names = createMemo(() => fileNames().concat(made()))
	const text = () => texts[name()] ?? ''
	// Whether a song has changes that aren't in music/ yet.
	const unsaved = (n) => texts[n] !== files()[n]
	// After the edit has settled, so it stores the new text.
	const keepDrafts = () => setTimeout(storeDrafts)
	function storeDrafts() {
		const out = {}
		for (const n of untrack(names)) if (texts[n] !== untrack(files)[n]) out[n] = texts[n]
		store(DRAFTS, out)
		store(MADE, untrack(made))
	}
	const setText = (t) => {
		setTexts((s) => void (s[name()] = t))
		keepDrafts()
	}

	// Where the caret is in the score (from caretAt), and the pattern the song
	// loops, if it loops one: the one the caret was in when you asked.
	const [caret, setCaret] = createSignal(null)
	const [only, setOnly] = createSignal(null)
	const looping = () => !!only()

	// The score as it stands, errors and all, and each song as it last played.
	const parsed = createMemo(() => compileText(text()))
	const lastGood = new Map()
	function songOf(n, only) {
		const s = compileText(texts[n] ?? '', only)
		// A song with nothing in it yet is still the song: an empty roll, its own title and key.
		if (s.errors.length && !s.empty) return lastGood.get(n) ?? null
		if (!only) lastGood.set(n, s)
		return s
	}
	const song = createMemo(() => songOf(name(), only()))
	// The whole song, even while one pattern loops, and its sections in play order.
	const whole = createMemo(() => songOf(name()))
	const sections = createMemo(() => sectionsOf(text(), whole()))
	// The bars on the roll the caret is in.
	const marks = createMemo(() => marksFor(song(), caret()))
	const songs = createMemo(() => names().map((n) => ({ name: n, song: songOf(n), made: made().includes(n) })))
	const colors = createMemo(() => (song() ? voiceColors(song()) : []))
	// The voice the piano and the tape's brush play into: the one you chose,
	// else the song's first melodic voice.
	const [chosenVoice, chooseVoice] = createSignal(null)
	const activeVoice = createMemo(() => {
		const voices = song()?.voices ?? []
		return (voices.find((v) => v.name === chosenVoice() && !v.drum) ?? voices.find((v) => !v.drum))?.name ?? null
	})
	const key = createMemo(() => {
		const s = song()
		return (s && (s.key || inferKey(s))) || parseKey('C')
	})

	// The song list shows only songs with this tag, if any.
	const [tag, setTag] = createSignal(null)
	// The words on a song's tags line, whatever its composer chose.
	const tagsOf = (s) => s.song?.tags ?? []
	const tags = createMemo(() => [...new Set(songs().flatMap(tagsOf))])
	const shown = createMemo(() => songs().filter((s) => !tag() || s.name === name() || tagsOf(s).includes(tag())))

	// Voices switched off, per song, by name.
	const [muted, setMuted] = createStore({})
	const isMuted = (v) => !!muted[name()]?.[v]
	const mutedSet = () => new Set(Object.keys(muted[name()] ?? {}).filter((v) => muted[name()][v]))
	// Click switches a voice off and on; with ⌥ it plays alone, or everything
	// plays again if it already was.
	function toggleVoice(v, alone) {
		const n = name()
		const others = (song()?.voices ?? []).map((w) => w.name).filter((w) => w !== v)
		setMuted((s) => {
			const m = (s[n] ??= {})
			if (!alone) m[v] = !m[v]
			else {
				const solo = !m[v] && others.every((w) => m[w])
				for (const w of Object.keys(m)) m[w] = false
				if (!solo) for (const w of others) m[w] = true
			}
		})
	}

	// How the game would place it; off, the song plays as written.
	const [inGame, setInGame] = createSignal(false)
	const [fx, setFx] = createStore(effectState())
	const own = () => fx.source.kind === 'own'
	const srcKind = () => (!inGame() ? 'radio' : own() ? 'car' : fx.source.kind)
	function pickSource(id) {
		const lit = inGame() && fx.source.kind === id
		setInGame(!lit)
		setFx((s) => void (s.source.kind = id))
	}

	const [songsOpen, setSongsOpen] = createSignal(true)
	// The one way in that's open beside the score, OP-1 style: the piano,
	// the chord pad or the loop bricks; or none.
	const [tool, setTool] = createSignal(null)
	const toggleTool = (t) => setTool((on) => (on === t ? null : t))
	const bricksOpen = () => tool() === 'bricks'
	const toggleBricks = () => toggleTool('bricks')
	// The voice a brick just added, to make it pop once.
	const [fresh, setFresh] = createSignal(null)
	const [dragging, setDragging] = createSignal(false)

	// Playing. The audio runs on its own clock; `pos` follows it for the page.
	let context = null
	let synth = null
	let playing = null
	// When the song started on the audio clock, kept across edits so a change
	// replays from where you are.
	let since = 0
	// Where the next Play starts, in seconds into the song.
	let from = 0
	const [live, setLive] = createSignal(false)
	const [pos, setPos] = createSignal(0)
	// How loud each voice looks right now, by index, for the meters.
	const [levels, setLevels] = createSignal([])

	const length = (s) => (s ? s.intro.dur + s.loop.dur : 0)
	// Seconds since the start, folded into the song: past the intro, round the loop.
	function folded(s, at) {
		at = Math.max(0, at)
		if (at < s.intro.dur || !s.loop.dur) return Math.min(at, length(s))
		return s.intro.dur + ((at - s.intro.dur) % s.loop.dur)
	}
	// Seconds into the song, unfolded, for the piano roll.
	const elapsed = () => (playing ? context.currentTime - playing.start : from)
	const nowPlaying = () => playing?.song ?? song()

	function hush() {
		const off = untrack(mutedSet)
		for (const c of playing.session.ch)
			c.input.gain.setTargetAtTime(off.has(c.v.name) ? 0 : c.v.vol * c.def.level, context.currentTime, 0.02)
	}

	function start(s) {
		if (playing) end(playing, context)
		playing = begin(synth, context, { kind: untrack(srcKind), since }, s)
		hush()
	}

	function play() {
		const s = song()
		if (!s || parsed().errors.length) return
		context ??= new AudioContext()
		synth ??= synthFor(context, context.destination)
		context.resume()
		since = from - (context.currentTime + 0.05)
		start(s)
		setLive(true)
	}

	function stop() {
		from = folded(playing.song, context.currentTime - playing.start)
		end(playing, context, 0.005)
		synth.cut()
		playing = null
		setLive(false)
		setPos(from)
	}

	const toggle = () => (playing ? stop() : play())

	// Jumps to `at` seconds into the song, playing or not; past its end is
	// another turn of the loop.
	function seek(at) {
		const s = untrack(nowPlaying)
		if (s) at = folded(s, at)
		from = at
		setPos(at)
		if (!playing) return
		since = at - (context.currentTime + 0.05)
		start(playing.song)
	}

	function tick() {
		if (!playing) return
		const now = context.currentTime
		if (playing.src.kind !== srcKind()) start(playing.song)
		tune(playing, runChain(inGame() ? fx : DRY), 0, now)
		feed(playing, now + AHEAD, now)
		setPos(folded(playing.song, Math.max(0, now - playing.start)))
	}

	// An edit or another song swaps in what plays; muting turns voices down.
	createEffect(
		() => song(),
		(s) => {
			if (!s) {
				if (playing) stop()
				return
			}
			if (playing && s !== playing.song) start(s)
			if (!playing) setPos(Math.min(from, length(s)))
		},
	)
	// Looping another pattern plays it from its top.
	createEffect(
		() => only(),
		(o) => {
			if (o) seek(0)
		},
	)
	createEffect(
		() => mutedSet().size + name(),
		() => {
			if (playing) hush()
		},
	)

	// The caret moved to `at`. Playing stays where it is: only Play, a
	// section or the tape moves it.
	const follow = (at) => setCaret(at)
	// Where the score's caret should go next: { ln, col }.
	const [wanted, setWanted] = createSignal(null)
	const reveal = (ln, col = 0) => setWanted({ ln, col })
	// Puts the caret on the note `e` of `section`, from the roll.
	function showNote(e, section) {
		const v = nowPlaying().voices[e.v]
		const w = section.where?.[v.name]?.[e.b]
		if (!w) return
		const line = text().split('\n')[w.ln - 1] ?? ''
		reveal(w.ln, columnOf(line, w.k, e.st, v.drum))
	}
	// Plays `token` on voice `name` to hear an edit: a note, a chord, or a drum
	// step (o, x, X). The voices come from `score`, the text as it is now, so a
	// voice heard before the song compiles. Through the song if it's playing.
	let preview = null
	function audition(score, name, token) {
		const voices = parse(score).song.voices
		const i = voices.findIndex((v) => v.name === name)
		if (i < 0) return
		const v = voices[i]
		let ev = { v: i, vel: { o: 0.42, x: 0.8, X: 1.05 }[token] ?? 0.9, d: 0.35 }
		if (!v.drum) {
			const body = token.replace(/^~/, '').replace(/[!?-]+$/, '')
			const m = body.startsWith('[') ? chordToMidis(body.slice(1, -1), v.center) : body.split('+').map(noteToMidi)
			if (!m?.length || m.some((n) => n == null)) return
			ev.m = m.map((n) => n + v.trans)
		}
		context ??= new AudioContext()
		synth ??= synthFor(context, context.destination)
		context.resume()
		const at = context.currentTime + 0.01
		const live = playing?.song.voices[i]
		if (live?.name === name && live.inst === v.inst) return playing.session.play(ev, at)
		const id = JSON.stringify(voices)
		if (preview?.id !== id) {
			if (preview) end(preview, context)
			const quiet = { events: [], sections: [], dur: 0 }
			preview = begin(synth, context, { kind: 'radio', since: 0 }, { voices, intro: quiet, loop: quiet })
			preview.id = id
			const { level, wet, cutoff } = runChain(DRY)
			preview.level.gain.value = level
			preview.wet.gain.value = wet
			preview.tone.frequency.value = cutoff
		}
		preview.session.play(ev, at)
	}

	// A short phrase on some voices, to hear an instrument, a brick or a style
	// before choosing it: quieter over the song if it's playing. A new one cuts
	// the last.
	let sampling = null
	function sample(voices, events, reverb = nowPlaying()?.reverb) {
		context ??= new AudioContext()
		synth ??= synthFor(context, context.destination)
		context.resume()
		stopSample()
		const notes = { events, sections: [], dur: 0 }
		const quiet = { events: [], sections: [], dur: 0 }
		sampling = begin(synth, context, { kind: 'radio', since: 0 }, { voices, intro: notes, loop: quiet, reverb })
		const { level, wet, cutoff } = runChain(DRY)
		const down = playing ? 0.4 : 0.6
		sampling.level.gain.value = level * down
		sampling.wet.gain.value = wet * down
		sampling.tone.frequency.value = cutoff
		const at = context.currentTime + 0.02
		for (const e of events) sampling.session.play({ ...e, v: e.v ?? 0 }, at + e.t)
	}
	function stopSample() {
		if (sampling) end(sampling, context, 0.02)
		sampling = null
	}

	// Plays loop brick `id` once, in the song's key and tempo.
	function hearBrick(id) {
		const brick = BRICKS.find((b) => b.id === id)
		const s = song()
		if (!brick) return
		const [tempo, beats, steps] = [s?.tempo ?? 120, s?.beats ?? 4, s?.steps ?? 4]
		// A melodic brick on the chord sounding now, or the key's own.
		const row = brick.part ? `chords | ${untrack(chordNow) ?? tonic(key())} |\n` : ''
		const one = compileText(
			`tempo ${tempo}\nbeats ${beats}\nsteps ${steps}\n${brickVoice(brick)}\npattern A\n${row}${brick.voice} | ${brickBar(brick, beats * steps)} |\nloop A`,
		)
		if (one.voices[0]) sample([one.voices[0]], one.loop.events)
	}

	// The score as it stands in the editor, a keystroke ahead of `text`.
	const score = () => editor?.value() ?? text()
	// Writes `next` over the score the way typing would, as one edit, so ⌘Z
	// undoes it.
	function rewrite(next) {
		const t = score()
		if (next === t) return
		if (editor) {
			let a = 0
			while (a < t.length && t[a] === next[a]) a++
			let z = 0
			while (z < t.length - a && z < next.length - a && t[t.length - 1 - z] === next[next.length - 1 - z]) z++
			editor.replace(a, t.length - z, next.slice(a, next.length - z))
		}
		setText(next)
	}
	// What you typed: a pattern it made longer takes its bricks along, as an
	// edit of its own.
	function typed(t) {
		const was = text()
		setText(t)
		if (compileText(t).errors.length) return
		const grown = growRepeats(t, was)
		if (grown !== t) rewrite(grown)
	}

	// Writes a change drawn on the roll into the score as one edit, and puts
	// the caret on line `ln` at `col`, where it landed.
	function draw(next, ln, col) {
		rewrite(next)
		flush()
		reveal(ln, col)
	}

	// Plays the song from section `s` (from sections), its pattern where the
	// caret is; looping, it loops that one instead.
	function playSection(s) {
		reveal(s.ln)
		if (!untrack(only)) seek(s.start)
		else if (untrack(only) !== s.name) setOnly(s.name)
		else seek(0)
		if (!playing) play()
	}
	// Moves section `from` to the gap before `to`, or copies it there.
	const moveTo = (from, to, copy) => rewrite(moveSection(score(), from, to, copy))
	const remove = (i) => rewrite(removeSection(score(), i))
	const repeat = (i, times) => rewrite(repeatSection(score(), i, times))
	// A new pattern from the one you're in (or hearing), at the end of the loop,
	// and there you are.
	function addSection() {
		const all = untrack(sections).all
		const at = untrack(caret)?.pattern
		const here = all.find((s) => s.name === at) ?? all.find((s) => untrack(pos) < s.start + s.dur) ?? all.at(-1)
		if (!here) return
		const { text: next, name: added } = addPattern(score(), here.name)
		if (!added) return
		rewrite(next)
		flush()
		const s = untrack(sections).all.findLast((s) => s.name === added)
		if (s) reveal(s.ln)
	}

	// The chord pad: open or not, what its modifier makes of a chord, and a bar
	// picked for its next tap ({ pattern, bar }), on the tape or by the last tap.
	const padOpen = () => tool() === 'pad'
	const [mod, setMod] = createSignal(null)
	const [picked, setPicked] = createSignal(null)
	const togglePad = () => toggleTool('pad')
	function pickBar(pattern, bar) {
		setPicked({ pattern, bar })
		setTool('pad')
	}
	// The voice that plays the chord row, if any.
	const harmony = createMemo(() => harmonyVoice(text()))
	// Where `pos` is in what's playing: its section, the bar and the step in the pattern.
	function sectionAt(s, at) {
		if (!s) return null
		const tl = at < s.intro.dur ? s.intro : s.loop
		const t = at < s.intro.dur ? at : at - s.intro.dur
		const sec = tl.sections.find((x) => t >= x.start && t < x.start + x.dur)
		if (!sec) return null
		const step = Math.floor(((t - sec.start) / sec.barDur) * sec.beats * sec.steps)
		return { sec, bar: Math.floor((t - sec.start) / sec.barDur), step }
	}
	// The chord sounding now.
	const chordNow = createMemo(() => {
		const here = sectionAt(nowPlaying(), pos())
		return here?.sec.chords?.find((c) => here.step >= c.step && here.step < c.step + c.len)?.sym ?? null
	})
	// Where the next chord tapped goes: { pattern, bar }. A bar picked first;
	// playing, the bar playing; stopped, the bar after the pattern's last
	// chord, round to its first when the row is as long as its voices.
	const patternNames = createMemo(() => parse(text()).song.patternOrder)
	const target = createMemo(() => {
		const names = patternNames()
		if (!names.length) return { pattern: null, bar: 0 }
		const here = live() ? sectionAt(nowPlaying(), pos()) : null
		const pattern =
			here?.sec.name ?? [caret()?.pattern, sectionAt(nowPlaying(), pos())?.sec.name].find((n) => names.includes(n)) ?? names[0]
		// A bar the last tap left, while you keep tapping: two bars' wait and
		// it goes back to the bar playing.
		const pick = picked()
		const stale = here && pick?.at != null && performance.now() - pick.at > 2000 * here.sec.barDur
		if (pick?.pattern === pattern && !stale) return pick
		if (here) return { pattern, bar: here.bar }
		const { row, voices } = barsIn(compileText(text(), pattern).loop.sections[0])
		return { pattern, bar: voices && row >= voices ? 0 : row }
	})
	// Plays chord `sym` on the voice that plays the chord row, or a pad.
	const PAD = parse('voice pad pad vol=0.35').song.voices[0]
	function hearChord(sym) {
		const s = song()
		const voice = s?.voices.find((v) => v.name === untrack(harmony)) ?? PAD
		const m = chordToMidis(sym, voice.center)
		if (!m) return
		const beat = 60 / (s?.tempo ?? 100)
		sample([voice], [{ t: 0, d: 4 * beat * voice.gate, vel: 0.8, m: m.map((n) => n + voice.trans) }])
	}
	// Writes chord `sym` where the next chord goes, as one edit, and the
	// pattern's bricks grow with it. The tap after goes in the bar after it.
	function tapChord(sym) {
		const at = untrack(target)
		const was = score()
		const out = writeChord(was, at.pattern, at.bar, sym)
		if (!out) return
		draw(growRepeats(out.text, was), out.ln, out.col)
		const pattern = at.pattern ?? parse(out.text).song.patternOrder[0]
		setPicked({ pattern, bar: at.bar + 1, at: playing ? performance.now() : null })
	}
	// A pad that plays the chord row, in every pattern.
	function addChordVoice() {
		const { text: next, voice } = addPad(score())
		rewrite(next)
		setFresh(voice)
		setTimeout(() => setFresh(null), 600)
	}

	// The piano: the computer keyboard plays notes into the score.
	const piano = () => tool() === 'piano'
	function togglePiano() {
		toggleTool('piano')
		editor?.focus()
	}

	// Looping one pattern starts it from the top; back to the song, playing
	// goes on from where that pattern first comes.
	function toggleLoop() {
		const was = untrack(only)
		setOnly(was ? null : (untrack(caret)?.pattern ?? sectionAt(untrack(nowPlaying), untrack(pos))?.sec.name ?? null))
		flush()
		const first = was ? marksFor(untrack(song), { pattern: was, k: -1 }).first : 0
		seek(first ?? 0)
	}

	function pick(n) {
		setName(n)
		chooseVoice(null)
		setPicked(null)
		from = 0
		setPos(0)
		if (playing) since = -(context.currentTime + 0.05)
		setCaret(null)
		flush()
	}

	// The first few seconds of a style, quietly, to choose by ear.
	let tasting = null
	function hearStyle(id) {
		const made = compileText(starter('C', { style: id }))
		const events = made.loop.events.filter((e) => e.t < TASTE)
		sample(made.voices, events, made.reverb)
		clearTimeout(tasting)
		tasting = setTimeout(stopSample, TASTE * 1000 + 600)
	}
	function stopStyle() {
		clearTimeout(tasting)
		stopSample()
	}

	// A new song, blank or in one of the starter styles.
	function create(style = '') {
		stopStyle()
		let n = 'new'
		for (let i = 2; names().includes(n); i++) n = `new-${i}`
		// Filtered by a tag, the song starts with it.
		const title = newTitle(songs().map((s) => s.song?.title ?? s.name))
		const blank = starter('C', { title, tag: untrack(tag) ?? '', style })
		if (playing) stop()
		setMade((m) => [...m, n])
		setTexts((s) => void (s[n] = blank))
		keepDrafts()
		setTool('bricks')
		pick(n)
		requestAnimationFrame(() => editor?.focus(true))
	}

	// Drops a loop brick into the song: a new voice playing it in every
	// pattern, or only in `pattern`.
	function drop(id, pattern) {
		const brick = BRICKS.find((b) => b.id === id)
		if (!brick) return
		stopSample()
		const { text: next, voice } = pattern ? brickInto(score(), brick, pattern) : addBrick(score(), brick)
		rewrite(next)
		setFresh(voice)
		setTimeout(() => setFresh(null), 600)
	}

	// Gives the song a new title, as one edit in the score.
	function rename(title) {
		title = title.trim().replace(/\s+/g, ' ')
		const t = score()
		if (!title || title === parse(t).song.title) return
		rewrite(/^title\b.*$/im.test(t) ? t.replace(/^title\b.*$/im, `title    ${title}`) : `title    ${title}\n${t}`)
	}

	function changeKey(root, mode) {
		const next = parseKey(root + (mode === 'min' ? 'm' : ''))
		if (next) setText(setSongKey(text(), next))
	}

	function download() {
		const a = document.createElement('a')
		a.href = URL.createObjectURL(new Blob([text()], { type: 'text/plain' }))
		a.download = `${name()}.song`
		a.click()
		setTimeout(() => URL.revokeObjectURL(a.href), 1000)
	}

	// Saves the song into music/ while composing (the dev server), or downloads
	// it on the built site. A song made here gets its file name from its title.
	const canSave = import.meta.env.DEV
	async function save() {
		if (!canSave) return download()
		const from = name()
		const body = text()
		let to = from
		if (made().includes(from)) {
			to = slug(song()?.title ?? from)
			for (let i = 2; fileNames().includes(to); i++) to = `${slug(song()?.title ?? from)}-${i}`
		}
		const res = await fetch(`/__save?name=${to}`, { method: 'POST', body }).catch(() => null)
		if (!res?.ok) return download()
		const kept = body.endsWith('\n') ? body : `${body}\n`
		setFiles((f) => ({ ...f, [to]: kept }))
		setTexts((s) => void (s[to] = kept))
		if (to !== from) {
			setMade((m) => m.filter((n) => n !== from))
			setName(to)
		}
		flush()
		keepDrafts()
	}

	// What the × on song `n` does, if anything (see discard.js).
	const fateOf = (n) => fate({ made: made().includes(n), unsaved: unsaved(n), canDelete: canSave })
	// The song just sent away, kept a few seconds to bring back.
	const [gone, setGone] = createSignal(null)
	let goneTimer
	// Sends song `n` away: a new song is forgotten, a saved one's edits are
	// dropped, then its file is removed. The song open goes to the next one,
	// stopped. Returns the song to leave the focus on.
	function discard(n) {
		const what = untrack(() => fateOf(n))
		if (!what) return null
		const open = n === untrack(name)
		const next = neighbour(
			untrack(shown).map((s) => s.name),
			n,
		)
		const g = { what, name: n, text: texts[n], order: untrack(fileNames), at: untrack(made).indexOf(n) }
		if (what === 'revert') setTexts((s) => void (s[n] = files()[n]))
		else {
			if (open && playing) stop()
			if (what === 'forget') setMade((m) => m.filter((x) => x !== n))
			else {
				setFiles((f) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== n)))
				fetch(`/__delete?name=${n}`, { method: 'POST' }).catch(() => null)
			}
			setTexts((s) => void delete s[n])
			lastGood.delete(n)
			if (open && next) {
				g.next = next
				pick(next)
			}
		}
		keepDrafts()
		clearTimeout(goneTimer)
		setGone(g)
		goneTimer = setTimeout(() => setGone(null), 6000)
		return what === 'revert' ? n : next
	}
	// Brings back what discard sent away, as it was; the song that opened in
	// its place gives way if nothing else was chosen since.
	function undo() {
		const g = untrack(gone)
		if (!g) return
		clearTimeout(goneTimer)
		setGone(null)
		if (g.what === 'forget') setMade((m) => m.toSpliced(g.at, 0, g.name))
		if (g.what === 'delete') {
			setFiles((f) => reinsert(f, g.name, g.text, g.order))
			fetch(`/__save?name=${g.name}`, { method: 'POST', body: g.text }).catch(() => null)
		}
		setTexts((s) => void (s[g.name] = g.text))
		if (g.next && untrack(name) === g.next) {
			if (playing) stop()
			pick(g.name)
		}
		keepDrafts()
	}

	// A song saved into music/, or changed there by anything else, comes back
	// from Vite as a new songs.js; take its files without reloading the page.
	// A song with no edits here plays the new text; one with edits keeps them.
	if (import.meta.hot)
		import.meta.hot.accept('../songs.js', (mod) => {
			if (!mod) return
			const was = untrack(files)
			setFiles({ ...mod.SONGS })
			setTexts((s) => {
				for (const [n, t] of Object.entries(mod.SONGS)) if (s[n] === undefined || s[n] === was[n]) s[n] = t
			})
			flush()
			keepDrafts()
		})

	// Whether the page has read its address yet; until then it mustn't write it.
	const [booted, setBooted] = createSignal(false)

	// The address bar links to what's playing: ?song=konvoi&kind=convoy&d=20&car=1.
	createEffect(
		() => [booted(), name(), inGame(), fx.source.kind, fx.distance.d, fx.inferno.inCar],
		([ready, n, game, kind, d, car]) => {
			if (!ready) return
			const q = new URLSearchParams({ song: n })
			if (game) {
				q.set('kind', kind)
				if (String(d) !== '4') q.set('d', String(d))
				if (car) q.set('car', '1')
			}
			history.replaceState(null, '', `?${q}`)
		},
	)

	// Starts the page: reads the address, plays what it asks for, and keeps
	// the audio fed. Returns the cleanup.
	function boot() {
		const asked = new URLSearchParams(location.search)
		setFx((s) => {
			if (SOURCES.some((src) => src.id === asked.get('kind'))) s.source.kind = asked.get('kind')
			if (asked.has('d')) s.distance.d = Number(asked.get('d'))
			s.inferno.inCar = asked.get('car') === '1'
		})
		setInGame(asked.has('kind') || asked.has('d') || asked.has('car'))
		const narrow = window.matchMedia('(max-width: 720px)')
		const fit = () => setSongsOpen(!narrow.matches)
		fit()
		narrow.addEventListener('change', fit)
		const wanted = names().includes(asked.get('song')) ? asked.get('song') : null
		// After the page has settled: picking a song flushes, which can't happen
		// while it settles. It only plays if the browser lets sound start
		// before a click; otherwise it waits on the play button.
		if (wanted)
			queueMicrotask(() => {
				pick(wanted)
				context ??= new AudioContext()
				if (context.state === 'running') play()
			})
		setBooted(true)
		const timer = setInterval(tick, 50)
		return () => {
			clearInterval(timer)
			narrow.removeEventListener('change', fit)
			if (playing) stop()
		}
	}

	return {
		name,
		text,
		setText: typed,
		parsed,
		song,
		whole,
		sections,
		only,
		playSection,
		moveTo,
		remove,
		repeat,
		addSection,
		shown,
		colors,
		activeVoice,
		chooseVoice,
		score,
		key,
		tag,
		setTag,
		tags,
		isMuted,
		mutedSet,
		toggleVoice,
		caret,
		follow,
		marks,
		wanted,
		reveal,
		showNote,
		looping,
		toggleLoop,
		audition,
		draw,
		hearBrick,
		hearStyle,
		stopStyle,
		stopSample,
		piano,
		togglePiano,
		padOpen,
		togglePad,
		mod,
		setMod,
		target,
		pickBar,
		harmony,
		chordNow,
		hearChord,
		tapChord,
		addChordVoice,
		inGame,
		fx,
		setFx,
		own,
		pickSource,
		songsOpen,
		setSongsOpen,
		bricksOpen,
		toggleBricks,
		fresh,
		dragging,
		setDragging,
		live,
		pos,
		levels,
		setLevels,
		length,
		elapsed,
		nowPlaying,
		play,
		toggle,
		seek,
		pick,
		create,
		drop,
		rename,
		changeKey,
		save,
		canSave,
		unsaved,
		fateOf,
		discard,
		undo,
		gone,
		boot,
	}
})
