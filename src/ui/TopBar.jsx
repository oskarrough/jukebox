// The top bar: songs toggle, play, loop one pattern, the display with title, position and time,
// the key, download, the game's sound and the guide.
import { For, createMemo, createSignal } from 'solid-js'
import { KEY_ROOTS } from '../key.js'
import { jb } from './state.js'
import { DownloadIcon, GuideIcon, LoopIcon, PianoIcon, SidebarIcon, SpeakerIcon } from './Icons.jsx'

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function TopBar() {
	return (
		<header class="top">
			<button
				class="icon"
				type="button"
				aria-controls="songs"
				aria-pressed={String(jb.songsOpen())}
				title={jb.songsOpen() ? 'Hide songs' : 'Show songs'}
				onClick={() => jb.setSongsOpen((open) => !open)}
			>
				<SidebarIcon />
			</button>
			<b class="brand">jukebox</b>
			<button id="play" type="button" title={jb.live() ? 'Stop (Space, ⌘↩)' : 'Play (Space, ⌘↩)'} onClick={jb.toggle} />
			<button
				class="icon"
				type="button"
				aria-pressed={String(jb.looping())}
				title={jb.looping() ? 'Play the whole song again (⌘L)' : 'Loop the pattern you’re writing (⌘L)'}
				onClick={jb.toggleLoop}
			>
				<LoopIcon />
			</button>
			<button
				class="icon"
				type="button"
				aria-pressed={String(jb.piano())}
				title={jb.piano() ? 'Type text again (⌘K)' : 'Play and write notes from the keyboard, Z X for octaves (⌘K)'}
				onClick={jb.togglePiano}
			>
				<PianoIcon />
			</button>
			<Display />
			<KeyPicker />
			<button
				class={{ icon: true, unsaved: jb.unsaved(jb.name()) }}
				type="button"
				title={jb.canSave ? 'Save to music/ (⌘S)' : 'Download as a .song file (⌘S)'}
				onClick={jb.save}
			>
				<DownloadIcon />
			</button>
			<button class={{ icon: true, on: jb.inGame() }} type="button" popovertarget="game" title="Hear it the way the game places it">
				<SpeakerIcon />
			</button>
			<button class="icon" type="button" popovertarget="guide" title="Open the song format guide">
				<GuideIcon />
			</button>
		</header>
	)
}

// The black display: the song's title, where it's got to, and how long it is.
function Display() {
	// Where you're dragging the position to, until you let go.
	const [dragging, setDragging] = createSignal(null)
	const at = () => dragging() ?? jb.pos()
	const total = () => jb.length(jb.song())
	// A tick where each part of the song starts, a bright one where the loop
	// comes back to.
	const marks = createMemo(() => {
		const s = jb.song()
		if (!s) return []
		const len = total() || 1
		return [s.intro, s.loop].flatMap((tl, k) =>
			tl.sections.map((sec) => ({
				left: `${(((k ? s.intro.dur : 0) + sec.start) / len) * 100}%`,
				loop: !!(k && !sec.start && s.intro.dur),
			})),
		)
	})
	return (
		<div class="lcd">
			<b>{jb.song()?.title || jb.name()}</b>
			<div class="seek">
				<div id="marks">
					<For each={marks()} keyed={false}>
						{(m) => <i class={{ loop: m().loop }} style={{ left: m().left }} />}
					</For>
				</div>
				{/* From 0 to 1, so a song getting shorter never clamps it. */}
				<input
					type="range"
					min="0"
					max="1"
					step="0.0001"
					value={total() ? at() / total() : 0}
					aria-label="Position"
					title="Jump to a moment in the song"
					onInput={(e) => setDragging(Number(e.currentTarget.value) * total())}
					onChange={(e) => {
						jb.seek(Number(e.currentTarget.value) * total())
						setDragging(null)
					}}
				/>
			</div>
			<span id="time">
				{clock(at())} / {clock(total())}
			</span>
		</div>
	)
}

function KeyPicker() {
	const root = () => {
		const k = jb.key()
		return KEY_ROOTS.includes(k.letter + k.acc) ? k.letter + k.acc : KEY_ROOTS[k.pc]
	}
	const mode = () => (jb.key().minor ? 'min' : 'maj')
	return (
		<div class="key-picker">
			<select
				aria-label="Key"
				title="Change key and transpose the song"
				value={root()}
				onChange={(e) => jb.changeKey(e.currentTarget.value, mode())}
			>
				<For each={KEY_ROOTS}>{(r) => <option value={r}>{r}</option>}</For>
			</select>
			<select
				aria-label="Major or minor"
				title="Switch between major and minor"
				value={mode()}
				onChange={(e) => jb.changeKey(root(), e.currentTarget.value)}
			>
				<option value="maj">maj</option>
				<option value="min">min</option>
			</select>
		</div>
	)
}
