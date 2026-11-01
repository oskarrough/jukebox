// The computer keyboard as a piano, by where the keys are rather than what's
// printed on them: A W S E D F T G Y H U J K O L P ; from C up, Z and X an
// octave down and up.
import { prefersFlats, transposeNoteName } from '../key.js'

const KEYS = [
	'KeyA',
	'KeyW',
	'KeyS',
	'KeyE',
	'KeyD',
	'KeyF',
	'KeyT',
	'KeyG',
	'KeyY',
	'KeyH',
	'KeyU',
	'KeyJ',
	'KeyK',
	'KeyO',
	'KeyL',
	'KeyP',
	'Semicolon',
]
export const OCTAVE_KEYS = { KeyZ: -1, KeyX: 1 }

// The note key `code` plays from C in `octave`, spelled for `key`; or null.
export function noteOf(code, octave, key) {
	const i = KEYS.indexOf(code)
	return i < 0 ? null : transposeNoteName(`C${octave}`, i, prefersFlats(key))
}

// The octave of the last note written before `pos` on its line, or null.
export function octaveAt(text, pos) {
	const line = text.slice(text.lastIndexOf('\n', pos - 1) + 1, pos)
	const notes = [...line.matchAll(/[A-G](?:##|bb|#|b|q)?(\d)/g)]
	return notes.length ? Number(notes.at(-1)[1]) : null
}
