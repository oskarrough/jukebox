// The songs: tag chips to narrow the list, a line per song, and a key to start a new one.
import { createEffect, For, Show } from 'solid-js'
import { jb } from './state.js'
import { PlusIcon } from './Icons.jsx'

// On a phone the list covers the page: choosing a song leaves it.
const leave = () => {
	if (matchMedia('(max-width: 720px)').matches) jb.setSongsOpen(false)
}

// Sends a song away, and leaves the focus in the list for ⌘Z.
function discard(name) {
	const to = jb.discard(name)
	if (to) requestAnimationFrame(() => document.querySelector(`#songs [data-name="${to}"] .song`)?.focus())
}

// Makes a blank song, with the bricks open to start it.
function make() {
	jb.create()
	leave()
}

export function SongList() {
	// Opened, the list shows the song that plays.
	createEffect(
		() => jb.songsOpen(),
		(open) => {
			if (open) requestAnimationFrame(() => document.querySelector('#songs .on')?.scrollIntoView({ block: 'center' }))
		},
	)
	return (
		<nav
			id="songs"
			class="songs"
			onKeyDown={(e) => {
				if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key !== 'z' || !jb.gone()) return
				e.preventDefault()
				jb.undo()
			}}
		>
			<span class="k add">
				<button type="button" title="Start a new song" onClick={make}>
					<PlusIcon />
				</button>
			</span>
			<div class="tags seg">
				<For each={jb.tags()}>
					{(t) => (
						<button
							type="button"
							aria-pressed={String(t === jb.tag())}
							title={t === jb.tag() ? 'Show all songs' : `Show only songs tagged ${t}`}
							onClick={() => jb.setTag((now) => (now === t ? null : t))}
						>
							{t}
						</button>
					)}
				</For>
			</div>
			<div class="list">
				<For each={jb.shown()} keyed={(s) => s.name}>
					{(s) => (
						<div
							class="entry"
							data-name={s().name}
							onKeyDown={(e) => {
								if (e.key !== 'Backspace' && e.key !== 'Delete') return
								e.preventDefault()
								discard(s().name)
							}}
						>
							<button
								type="button"
								class={{ song: true, on: s().name === jb.name(), unsaved: jb.unsaved(s().name) }}
								title={s().song?.about || `Open ${s().name}`}
								onClick={(e) => {
									e.currentTarget.focus()
									jb.pick(s().name)
									if (!jb.live()) jb.play()
									leave()
								}}
							>
								<i />
								<span>{s().song?.title || s().name}</span>
							</button>
							<Show when={jb.fateOf(s().name)}>
								<button
									type="button"
									class="drop"
									title={jb.fateOf(s().name) === 'revert' ? 'Discard unsaved changes (⌫)' : 'Delete song (⌫)'}
									onClick={() => discard(s().name)}
								>
									×
								</button>
							</Show>
						</div>
					)}
				</For>
			</div>
			<Show when={jb.gone()}>
				<span class="k undo">
					<button type="button" title="Bring the song back (⌘Z)" onClick={jb.undo}>
						Undo
					</button>
				</span>
			</Show>
		</nav>
	)
}
