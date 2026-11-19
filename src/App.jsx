// The jukebox page: every song in music/, to write, edit and replay, and to
// hear the way the game places it. The address bar always links to what's
// playing: ?song=sonnenallee&kind=bar&d=6. State and actions live in
// ui/state.js; each part of the page is a component in ui/.
import { onSettled } from 'solid-js'
import { jb } from './ui/state.js'
import { pageKeydown } from './ui/shortcuts.js'
import { TopBar } from './ui/TopBar.jsx'
import { SongList } from './ui/SongList.jsx'
import { Roll } from './ui/Roll.jsx'
import { Editor } from './ui/Editor.jsx'
import { GamePanel } from './ui/GamePanel.jsx'
import { Guide } from './ui/Guide.jsx'
import { Feedback } from './ui/Feedback.jsx'
import '@fontsource-variable/inter'
import '@fontsource/ia-writer-mono/400.css'
import '@fontsource/ia-writer-mono/400-italic.css'
import '@fontsource/ia-writer-mono/700.css'
import './App.css'
import './ui/kit.css'

export default function App() {
	onSettled(() => {
		const stopBoot = jb.boot()
		// Space plays outside inputs; ⌘↩ plays anywhere.
		const keys = (e) => pageKeydown(e, jb.toggle)
		// A brick dropped anywhere on the machine goes into the song.
		const over = (e) => {
			if (e.dataTransfer.types.includes('application/x-brick')) e.preventDefault()
		}
		const dropped = (e) => {
			const id = e.dataTransfer.getData('application/x-brick')
			jb.setDragging(false)
			if (!id) return
			e.preventDefault()
			jb.drop(id)
		}
		document.addEventListener('keydown', keys)
		document.addEventListener('dragover', over)
		document.addEventListener('drop', dropped)
		return () => {
			stopBoot()
			document.removeEventListener('keydown', keys)
			document.removeEventListener('dragover', over)
			document.removeEventListener('drop', dropped)
		}
	})

	return (
		<main
			class={{
				app: true,
				'songs-open': jb.songsOpen(),
				live: jb.live(),
				dragging: jb.dragging(),
			}}
		>
			<TopBar />
			<SongList />
			<Roll />
			<Editor />
			<GamePanel />
			<Guide />
			<Feedback />
		</main>
	)
}
