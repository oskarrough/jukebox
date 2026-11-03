// The top bar: songs toggle, play, loop one pattern, then the piano, the chord pad and the loop bricks (one open at a time), the display with title, sections and time,
// the key, download, the game's sound and the guide. On a phone the display is on top and the
// controls in a row at the bottom, the key, download, guide and feedback behind ⋯.
import { For, flush } from 'solid-js'
import { KEY_ROOTS } from '../key.js'
import { jb } from './state.js'
import { Sections } from './Sections.jsx'
import {
	BricksIcon,
	DownloadIcon,
	FeedbackIcon,
	GuideIcon,
	LoopIcon,
	PianoIcon,
	PlayIcon,
	SidebarIcon,
	SpeakerIcon,
	StopIcon,
} from './Icons.jsx'

const MoreIcon = () => (
	<svg viewBox="0 0 20 20">
		<path d="M4.5 10h.01M10 10h.01M15.5 10h.01" />
	</svg>
)

// The chord pad: a wheel with a triad on it.
const ChordIcon = () => (
	<svg viewBox="0 0 20 20">
		<circle cx="10" cy="10" r="6.5" />
		<path d="M10 3.5h.01M15.6 13.2h.01M4.4 13.2h.01" stroke-width="3.6" />
	</svg>
)

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function TopBar() {
	return (
		<header class="top">
			<span class="k songs-toggle">
				<button
					type="button"
					aria-controls="songs"
					aria-pressed={String(jb.songsOpen())}
					title={jb.songsOpen() ? 'Hide songs' : 'Show songs'}
					onClick={() => jb.setSongsOpen((open) => !open)}
				>
					<SidebarIcon />
				</button>
			</span>
			<span class="k play">
				<button id="play" class="go" type="button" title={jb.live() ? 'Stop (Space, ⌘↩)' : 'Play (Space, ⌘↩)'} onClick={jb.toggle}>
					{jb.live() ? <StopIcon /> : <PlayIcon />}
				</button>
			</span>
			<span class="k loop-toggle">
				<button
					type="button"
					aria-pressed={String(jb.looping())}
					title={jb.looping() ? 'Play the whole song again (⌘L)' : 'Loop the pattern you’re writing (⌘L)'}
					onClick={jb.toggleLoop}
				>
					<LoopIcon />
				</button>
			</span>
			<span class="k piano-toggle">
				<button
					type="button"
					aria-pressed={String(jb.piano())}
					aria-controls="piano"
					aria-expanded={String(jb.piano())}
					title={jb.piano() ? 'Hide the piano (⌘K)' : 'Play and write notes on the piano (⌘K)'}
					onClick={jb.togglePiano}
				>
					<PianoIcon />
				</button>
			</span>
			<span class="k pad-toggle">
				<button
					type="button"
					aria-pressed={String(jb.padOpen())}
					title={jb.padOpen() ? 'Hide the chord pad (⌘J)' : 'Tap chords into the pattern you’re in (⌘J)'}
					onClick={jb.togglePad}
				>
					<ChordIcon />
				</button>
			</span>
			<span class="k bricks-toggle">
				<button
					type="button"
					aria-pressed={String(jb.bricksOpen())}
					title={jb.bricksOpen() ? 'Hide the loop bricks' : 'Drop loop bricks into the song'}
					onClick={jb.toggleBricks}
				>
					<BricksIcon />
				</button>
			</span>
			<Display />
			<span class="k more-toggle">
				<button type="button" popovertarget="more" title="Open key, download, guide and feedback">
					<MoreIcon />
				</button>
			</span>
			<div id="more" class="more pop" popover>
				<KeyPicker />
				<span class="k">
					<button
						class={{ unsaved: jb.unsaved(jb.name()) }}
						type="button"
						title={jb.canSave ? 'Save to music/ (⌘S)' : 'Download as a .song file (⌘S)'}
						onClick={jb.save}
					>
						<DownloadIcon />
					</button>
				</span>
				<span class="k guide-toggle">
					<button type="button" popovertarget="guide" title="Open the song format guide">
						<GuideIcon />
					</button>
				</span>
				<span class="k feedback-toggle">
					<button type="button" popovertarget="feedback" title="Send feedback">
						<FeedbackIcon />
					</button>
				</span>
			</div>
			<span class="k game-toggle">
				<button class={{ on: jb.inGame() }} type="button" popovertarget="game" title="Hear it the way the game places it">
					<SpeakerIcon />
				</button>
			</span>
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

// The key: its root behind one key, a tray of all twelve, and major or minor beside it.
function KeyPicker() {
	const root = () => {
		const k = jb.key()
		return KEY_ROOTS.includes(k.letter + k.acc) ? k.letter + k.acc : KEY_ROOTS[k.pc]
	}
	const mode = () => (jb.key().minor ? 'min' : 'maj')
	return (
		<>
			<span class="k key-root">
				<button type="button" popovertarget="roots" title="Change key and transpose the song">
					{root()}
				</button>
			</span>
			<div id="roots" class="seg" popover>
				<For each={KEY_ROOTS}>
					{(r) => (
						<button
							type="button"
							aria-pressed={String(r === root())}
							title={`Transpose to ${r}`}
							onClick={(e) => {
								e.currentTarget.parentElement.hidePopover()
								jb.changeKey(r, mode())
							}}
						>
							{r}
						</button>
					)}
				</For>
			</div>
			<span class="seg key-mode">
				<For each={['maj', 'min']}>
					{(m) => (
						<button
							type="button"
							aria-pressed={String(m === mode())}
							title={m === 'maj' ? 'Switch to major' : 'Switch to minor'}
							onClick={() => jb.changeKey(root(), m)}
						>
							{m}
						</button>
					)}
				</For>
			</span>
		</>
	)
}
