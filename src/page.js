// The jukebox: every song in music/, to hear, edit and replay through a rack of
// devices (source, distance, inferno) the same way the street hears them. The
// address bar always links to what's playing: ?song=sonnenallee&kind=bar&d=6.
import { BRICKS, addBrick } from './bricks.js'
import { EFFECTS, SOURCES, effectState, runChain } from './effects.js'
import { KEY_ROOTS, inferKey, setSongKey, starter } from './key.js'
import { compile, parseKey } from './score.js'
import { drawRoll, voiceColors } from './roll.js'
import { AHEAD, begin, end, feed, synthFor, tune } from './player.js'
import { NAMES as SCORES, SONGS } from './songs.js'

export { starter as STARTER }

const $ = (id) => document.getElementById(id)
const texts = new Map()
const songs = new Map()
// Songs made here, which live only on this page until exported.
const made = []
const names = () => SCORES.concat(made)
let name = SCORES[0]
let context = null
let synth = null
let playing = null
// When the song started on the audio clock; kept across edits so a change
// replays from where you are.
let since = 0
// Where the next Play starts, in seconds into the song.
let from = 0
let seeking = false
let pickingKey = false
const fx = effectState()
// Voices switched off, per song, by name.
const muted = new Map()
const mutedIn = (n) => muted.get(n) ?? muted.set(n, new Set()).get(n)

async function text(n) {
	if (!texts.has(n)) texts.set(n, SONGS[n])
	return texts.get(n)
}

function srcOf() {
	return fx.source.kind === 'own' ? { kind: 'car', own: true } : { kind: fx.source.kind, own: false }
}

function listScores() {
	const song = songs.get(name)
	$('sessionTitle').textContent = song?.title ?? name
	$('sessionFile').textContent = `${name}.song`
	$('scores').replaceChildren(
		...names().map((n) => {
			const button = document.createElement('button')
			const s = songs.get(n)
			button.className = n === name ? 'clip on' : 'clip'
			const tri = document.createElement('span')
			tri.className = 'tri'
			const title = document.createElement('b')
			title.textContent = s?.title ?? n
			const small = document.createElement('small')
			small.textContent = [`${n}.song`, s?.street, s?.at?.join(' '), s?.about].filter(Boolean).join(' · ')
			button.append(tri, title, small)
			button.onclick = () => pick(n).then(() => playing || play())
			return button
		}),
	)
}

// The song, how it plays and from how far, as the page's address.
function remember() {
	const q = new URLSearchParams({ song: name })
	if (fx.source.kind !== 'radio') q.set('kind', fx.source.kind)
	if (String(fx.distance.d) !== '4') q.set('d', String(fx.distance.d))
	if (fx.inferno.inCar) q.set('car', '1')
	const off = EFFECTS.filter((d) => fx[d.id].on === false).map((d) => d.id)
	if (off.length) q.set('off', off.join(','))
	history.replaceState(null, '', `?${q}`)
}

async function pick(n) {
	name = n
	from = 0
	$('score').value = await text(n)
	if (playing) since = -(context.currentTime + 0.05)
	remember()
	edited()
}

function showKey(song) {
	const key = song.key || inferKey(song)
	pickingKey = true
	$('keyRoot').value = KEY_ROOTS.includes(key.letter + key.acc) ? key.letter + key.acc : KEY_ROOTS[key.pc]
	$('keyMode').value = key.minor ? 'min' : 'maj'
	pickingKey = false
}

function readKey() {
	return parseKey($('keyRoot').value + ($('keyMode').value === 'min' ? 'm' : ''))
}

// Compiles the score in the editor, shows its errors and, if it plays, swaps it in.
function edited() {
	texts.set(name, $('score').value)
	const song = compile($('score').value)
	$('errors').textContent = song.errors.map((e) => `Line ${e.line}: ${e.msg}`).join('\n')
	if (song.errors.length) return
	songs.set(name, song)
	$('lcdTitle').textContent = song.title
	showKey(song)
	listScores()
	listVoices(song)
	$('pos').max = length(song)
	$('loopStart').value = song.intro.dur
	if (playing) start(song)
	else showPosition(from)
}

const length = (song) => song.intro.dur + song.loop.dur

// Seconds since the start, folded into the song: past the intro, round the loop.
function folded(song, at) {
	if (at < song.intro.dur || !song.loop.dur) return Math.min(at, length(song))
	return song.intro.dur + ((at - song.intro.dur) % song.loop.dur)
}

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function showPosition(at) {
	const song = songs.get(name)
	if (!song) return
	if (!seeking) $('pos').value = at
	const part = at < song.intro.dur ? 'Intro' : 'Loop'
	$('time').textContent = `${part} ${clock(at)} / ${clock(length(song))}`
}

function start(song) {
	if (playing) end(playing, context)
	playing = begin(synth, context, { kind: srcOf().kind, since }, song)
	hush(playing)
}

// Turns the muted voices of what's playing down and the others back up.
function hush(p) {
	const off = mutedIn(name)
	for (const c of p.session.ch) c.input.gain.setTargetAtTime(off.has(c.v.name) ? 0 : c.v.vol * c.def.level, context.currentTime, 0.02)
}

// A button per voice in its colour, to switch it off and on while it plays.
function listVoices(song) {
	const off = mutedIn(name)
	const colors = voiceColors(song)
	$('voices').replaceChildren(
		...song.voices.map((v, i) => {
			const button = document.createElement('button')
			const dot = document.createElement('i')
			const inst = document.createElement('small')
			dot.style.background = colors[i]
			button.style.setProperty('--c', colors[i])
			if (v.name === fresh) button.classList.add('fresh')
			inst.textContent = v.inst
			button.append(dot, v.name, inst)
			button.setAttribute('aria-pressed', String(!off.has(v.name)))
			button.title = off.has(v.name) ? `${v.name} on` : `${v.name} off`
			button.onclick = () => {
				if (off.has(v.name)) off.delete(v.name)
				else off.add(v.name)
				if (playing) hush(playing)
				listVoices(song)
			}
			return button
		}),
	)
}

function draw() {
	requestAnimationFrame(draw)
	const song = playing?.song ?? songs.get(name)
	if (song) drawRoll($('roll'), song, playing ? context.currentTime - playing.start : from, mutedIn(name))
}

function play() {
	const song = songs.get(name)
	if (!song) return
	context ??= new AudioContext()
	synth ??= synthFor(context, context.destination)
	context.resume()
	since = from - (context.currentTime + 0.05)
	start(song)
	$('play').textContent = 'Stop'
	document.body.classList.add('live')
}

function stop() {
	from = folded(playing.song, context.currentTime - playing.start)
	end(playing, context)
	playing = null
	$('play').textContent = 'Play'
	document.body.classList.remove('live')
}

// Jumps to `at` seconds into the song, playing or not.
function seek(at) {
	from = at
	showPosition(at)
	if (!playing) return
	since = at - (context.currentTime + 0.05)
	start(playing.song)
}

function tick() {
	const own = srcOf().own
	const dFar = $('fx-distance')
	if (dFar) dFar.disabled = own
	const metres = $('fx-metres')
	if (metres) metres.textContent = own ? 'inside' : `${Math.round(fx.distance.d * 3)} m`
	$('unblock').hidden = !(playing && context.state !== 'running')
	if (!playing) return
	const now = context.currentTime
	if (playing.src.kind !== srcOf().kind) start(playing.song)
	const sound = runChain(fx)
	tune(playing, sound, 0, now)
	feed(playing, now + AHEAD, now)
	showPosition(folded(playing.song, Math.max(0, now - playing.start)))
	$('where').textContent = `${Math.round(sound.cutoff)} Hz`
}

function listDevices() {
	$('devices').replaceChildren(
		...EFFECTS.map((def) => {
			const p = fx[def.id]
			const article = document.createElement('article')
			article.className = 'fx'
			article.dataset.on = String(p.on !== false)
			article.dataset.id = def.id
			const head = document.createElement('header')
			head.className = 'fx-head'
			const power = document.createElement('button')
			power.type = 'button'
			power.className = 'power'
			power.setAttribute('aria-pressed', String(p.on !== false))
			power.title = p.on !== false ? `${def.title} on` : `${def.title} bypassed`
			power.onclick = () => {
				p.on = p.on === false
				remember()
				listDevices()
			}
			const title = document.createElement('h3')
			title.textContent = def.title
			const blurb = document.createElement('small')
			blurb.textContent = def.blurb
			head.append(power, title, blurb)
			const body = document.createElement('div')
			body.className = 'fx-body'
			if (def.id === 'source') {
				const pads = document.createElement('div')
				pads.className = 'pads'
				for (const src of SOURCES) {
					const button = document.createElement('button')
					button.type = 'button'
					button.className = src.id === p.kind ? 'pad on' : 'pad'
					button.textContent = src.label
					button.onclick = () => {
						p.kind = src.id
						remember()
						listDevices()
					}
					pads.append(button)
				}
				body.append(pads)
			} else if (def.id === 'distance') {
				const label = document.createElement('label')
				label.className = 'fader'
				const nameEl = document.createElement('span')
				nameEl.textContent = 'Away'
				const out = document.createElement('output')
				out.id = 'fx-metres'
				out.textContent = srcOf().own ? 'inside' : `${Math.round(p.d * 3)} m`
				const input = document.createElement('input')
				input.id = 'fx-distance'
				input.type = 'range'
				input.min = '0'
				input.max = '45'
				input.step = '0.5'
				input.value = String(p.d)
				input.disabled = srcOf().own
				input.oninput = () => {
					p.d = Number(input.value)
					out.textContent = srcOf().own ? 'inside' : `${Math.round(p.d * 3)} m`
				}
				input.onchange = remember
				label.append(nameEl, out, input)
				body.append(label)
			} else if (def.id === 'inferno') {
				const label = document.createElement('label')
				label.className = 'toggle'
				const input = document.createElement('input')
				input.type = 'checkbox'
				input.checked = !!p.inCar
				input.onchange = () => {
					p.inCar = input.checked
					remember()
				}
				label.append(input, 'in the car')
				body.append(label)
			}
			article.append(head, body)
			return article
		}),
	)
}

// The voice a brick just added, to make it pop once.
let fresh = null

// Drops a loop brick into the song: a new voice playing it in every pattern.
function drop(id) {
	const brick = BRICKS.find((b) => b.id === id)
	if (!brick) return
	const { text, voice } = addBrick($('score').value, brick)
	$('score').value = text
	fresh = voice
	edited()
	fresh = null
	if (!playing && songs.get(name)) play()
}

function listBricks() {
	const shelves = Map.groupBy(BRICKS, (b) => b.shelf)
	$('bricks').replaceChildren(
		...[...shelves].map(([shelf, bricks]) => {
			const row = document.createElement('div')
			row.className = 'shelf'
			const label = document.createElement('span')
			label.textContent = shelf
			const wrap = document.createElement('div')
			row.append(label, wrap)
			wrap.append(
				...bricks.map((b) => {
					const button = document.createElement('button')
					button.className = 'brick'
					button.dataset.shelf = shelf
					button.draggable = true
					button.title = `${b.label}: ${b.inst}, drag me into the song`
					const steps = document.createElement('span')
					steps.className = 'steps'
					const cells = b.steps ? b.steps.replace(/\s+/g, '').split('') : b.notes
					steps.append(
						...cells.map((c) => {
							const cell = document.createElement('i')
							cell.className = c === '.' ? '' : c === '-' ? 'h' : 'x'
							return cell
						}),
					)
					button.append(b.label, steps)
					button.onclick = () => drop(b.id)
					button.ondragstart = (e) => {
						e.dataTransfer.setData('application/x-brick', b.id)
						e.dataTransfer.effectAllowed = 'copy'
						document.body.classList.add('dragging')
					}
					button.ondragend = () => document.body.classList.remove('dragging')
					return button
				}),
			)
			return row
		}),
	)
}

// A brick dropped anywhere on the machine goes into the song.
document.addEventListener('dragover', (e) => {
	if (e.dataTransfer.types.includes('application/x-brick')) e.preventDefault()
})
document.addEventListener('drop', (e) => {
	const id = e.dataTransfer.getData('application/x-brick')
	document.body.classList.remove('dragging')
	if (!id) return
	e.preventDefault()
	drop(id)
})

function download() {
	const a = document.createElement('a')
	a.href = URL.createObjectURL(new Blob([$('score').value], { type: 'text/plain' }))
	a.download = `${name}.song`
	a.click()
	setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function create() {
	let n = 'new'
	for (let i = 2; names().includes(n); i++) n = `new-${i}`
	made.push(n)
	texts.set(n, starter(readKey()))
	pick(n).then(() => playing || play())
}

function changeKey() {
	if (pickingKey) return
	const next = readKey()
	if (!next) return
	$('score').value = setSongKey($('score').value, next)
	edited()
}

function listKeyRoots() {
	$('keyRoot').replaceChildren(
		...KEY_ROOTS.map((r) => {
			const o = document.createElement('option')
			o.value = r
			o.textContent = r
			return o
		}),
	)
}

const narrow = window.matchMedia('(max-width: 720px)')
function setSessionOpen(open) {
	document.body.classList.toggle('session-open', open)
	$('sessionToggle').setAttribute('aria-expanded', String(open))
}
setSessionOpen(!narrow.matches)
narrow.addEventListener('change', () => setSessionOpen(!narrow.matches))

$('play').onclick = () => (playing ? stop() : play())
$('unblock').onclick = () => context.resume()
$('new').onclick = create
$('download').onclick = download
$('sessionToggle').onclick = () => setSessionOpen(!document.body.classList.contains('session-open'))
$('keyRoot').onchange = changeKey
$('keyMode').onchange = changeKey
$('pos').onpointerdown = () => (seeking = true)
$('pos').oninput = () => showPosition(Number($('pos').value))
$('pos').onchange = () => {
	seeking = false
	seek(Number($('pos').value))
}
let typing = 0
$('score').oninput = () => {
	clearTimeout(typing)
	typing = setTimeout(edited, 400)
}

// The address says what to play: ?song=konvoi&kind=convoy&d=20&car=1.
const asked = new URLSearchParams(location.search)
if (SOURCES.some((s) => s.id === asked.get('kind'))) fx.source.kind = asked.get('kind')
if (asked.has('d')) fx.distance.d = Number(asked.get('d'))
fx.inferno.inCar = asked.get('car') === '1'
for (const id of (asked.get('off') || '').split(',').filter(Boolean)) {
	if (fx[id]) fx[id].on = false
}
const wanted = SCORES.includes(asked.get('song')) ? asked.get('song') : null
for (const n of SCORES)
	text(n).then((t) => {
		if (!songs.has(n)) songs.set(n, compile(t))
		listScores()
	})
listKeyRoots()
listDevices()
listBricks()
pick(wanted ?? name).then(() => wanted && play())
setInterval(tick, 50)
requestAnimationFrame(draw)
