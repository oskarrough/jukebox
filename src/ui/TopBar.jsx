// The top bar: songs toggle, play, loop one pattern, the display with title, sections and time,
// the key, download, the game's sound and the guide.
import { For, flush } from 'solid-js'
import { KEY_ROOTS } from '../key.js'
import { jb } from './state.js'
import { Sections } from './Sections.jsx'
import { DownloadIcon, FeedbackIcon, GuideIcon, LoopIcon, PianoIcon, SidebarIcon, SpeakerIcon } from './Icons.jsx'

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
			<button class="icon" type="button" popovertarget="feedback" title="Send feedback">
				<FeedbackIcon />
			</button>
		</header>
	)
}

// The black display: the song's title, its sections as they play, and how
// long it is.
function Display() {
	return (
		<div class="lcd">
			<Title />
			<Sections />
			<span id="time">
				{clock(jb.pos())} / {clock(jb.length(jb.song()))}
			</span>
		</div>
	)
}

// The song's title, written in place: click, type, Enter or click away to keep
// it, Esc to leave it as it was.
function Title() {
	const shown = () => jb.song()?.title || jb.name()
	return (
		<input
			class="title"
			aria-label="Title"
			title="Rename the song"
			spellcheck="false"
			value={shown()}
			onKeyDown={(e) => {
				if (e.key === 'Escape') e.currentTarget.value = shown()
				if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
			}}
			onBlur={(e) => {
				jb.rename(e.currentTarget.value)
				flush()
				e.currentTarget.value = shown()
			}}
		/>
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
