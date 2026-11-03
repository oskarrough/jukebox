// The songs: tag chips to narrow the list, a line per song, and a blank one.
import { createEffect, For } from 'solid-js'
import { jb } from './state.js'
import { PlusIcon } from './Icons.jsx'

// On a phone the list covers the page: choosing a song leaves it.
const leave = () => {
	if (matchMedia('(max-width: 720px)').matches) jb.setSongsOpen(false)
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
		<nav id="songs" class="songs">
			<div class="tags">
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
						<button
							type="button"
							class={{ on: s().name === jb.name(), unsaved: jb.unsaved(s().name) }}
							title={s().song?.about || `Open ${s().name}`}
							onClick={() => {
								jb.pick(s().name)
								if (!jb.live()) jb.play()
								leave()
							}}
						>
							<i />
							<span>{s().song?.title || s().name}</span>
						</button>
					)}
				</For>
			</div>
			<button
				class="icon add"
				type="button"
				title="Start a blank song"
				onClick={() => {
					jb.create()
					leave()
				}}
			>
				<PlusIcon />
			</button>
		</nav>
	)
}
