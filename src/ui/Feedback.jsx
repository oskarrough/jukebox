// A postcard from the jukebox: one text box, sent to the public inkast list.
import { createSignal } from 'solid-js'
import { INKAST, MAX_TEXT, effectsLine, feedbackText, shortAgent } from '../feedback.js'
import { jb } from './state.js'

const VERSION = typeof __JUKEBOX_VERSION__ === 'undefined' ? 'dev' : __JUKEBOX_VERSION__

export function Feedback() {
	let page
	let field
	const [note, setNote] = createSignal('')

	function send(e) {
		e.preventDefault()
		const text = field.value.trim()
		if (!text) return field.focus()
		const body = feedbackText(text, {
			url: location.href,
			song: jb.name(),
			key: jb.key().name,
			effects: effectsLine(jb.inGame(), jb.fx),
			agent: shortAgent(navigator.userAgent, navigator.maxTouchPoints > 0),
			version: VERSION,
		})
		field.value = ''
		field.blur()
		setNote('Sending…')
		fetch(INKAST, { method: 'POST', body })
			.then((res) => setNote(res.ok ? 'Thanks' : "Couldn't send"))
			.catch(() => setNote("Couldn't send"))
	}

	return (
		<form
			id="feedback"
			ref={page}
			class="pop post"
			popover
			autocomplete="off"
			onSubmit={send}
			onToggle={(e) => {
				if (e.newState === 'open') field.focus()
			}}
			onKeyDown={(e) => {
				e.stopPropagation()
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) page.requestSubmit()
				if (e.key === 'Escape') {
					e.preventDefault()
					field.blur()
				}
			}}
			onKeyUp={(e) => e.stopPropagation()}
		>
			<textarea
				id="feedback-text"
				ref={field}
				name="feedback"
				maxlength={MAX_TEXT}
				autocomplete="off"
				placeholder="What stands out? What's missing, what nags?"
				aria-label="Feedback"
				onInput={() => setNote('')}
			/>
			<p class="public">This is a postcard: anyone can read it. Don't write anything private. It ends up publicly on GitHub.</p>
			<div>
				<small>{note()}</small>
				<button type="submit">Send</button>
			</div>
		</form>
	)
}
