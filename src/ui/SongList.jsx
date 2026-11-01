// The songs: tag chips to narrow the list, a line per song, and a blank one.
import { For } from 'solid-js'
import { jb } from './state.js'
import { PlusIcon } from './Icons.jsx'

export function SongList() {
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
							}}
						>
							<i />
							<span>{s().song?.title || s().name}</span>
						</button>
					)}
				</For>
			</div>
			<button class="icon add" type="button" title="Start a blank song" onClick={jb.create}>
				<PlusIcon />
			</button>
		</nav>
	)
}
