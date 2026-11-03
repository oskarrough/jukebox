// The jukebox page: every song in music/, to write, edit and replay, and to
// hear the way the game places it. The address bar always links to what's
// playing: ?song=sonnenallee&kind=bar&d=6. State and actions live in
// ui/state.js; each part of the page is a component in ui/.
import { onSettled } from 'solid-js'
import { jb } from './ui/state.js'
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
		// Space plays and stops, unless you're typing; ⌘↩ plays and stops
		// anywhere, ⌘L loops the pattern you're writing, ⌘K plays notes from the
		// keyboard, ⌘J opens the chord pad, ⌘S saves the song.
		const commands = { s: jb.save, l: jb.toggleLoop, k: jb.togglePiano, j: jb.togglePad, Enter: jb.toggle }
		const keys = (e) => {
			const command = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && commands[e.key]
			if (command) {
				e.preventDefault()
				command()
				return
			}
			const typing = e.target.closest?.('textarea, input, select')
			if (e.key === ' ' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault()
				jb.toggle()
			}
		}
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
