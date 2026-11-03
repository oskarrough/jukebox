// Colours for the score: splits a line of a .song into pieces, each with a
// kind the page paints, and the voice it belongs to when it has one. The
// pieces always join back into the line, character for character.
import { SETTINGS } from '../score.js'

const HEAD = new RegExp(`^(${SETTINGS.join('|')})\\b`, 'i')

// [kind, text, voice?] for each piece of `line`, with `voices` the names in
// the song.
export function paint(line, voices) {
	const out = []
	const push = (kind, text, voice) => text && out.push([kind, text, voice])
	// A # starts a comment at the start of a line or after a space; in C#4 it's a sharp.
	const found = line.match(/(^|\s)#/)
	const hash = found ? found.index + found[1].length : -1
	const body = hash < 0 ? line : line.slice(0, hash)
	const comment = hash < 0 ? '' : line.slice(hash)
	const words = (s, kind, voice) => {
		for (const m of s.matchAll(/(\s+)|(\S+)/g)) push(m[1] ? 'space' : kind, m[0], voice)
	}
	let m
	if ((m = body.match(/^(\s*)(voice)(\s+)(\S+)(\s+)(\S+)(.*)$/i))) {
		push('space', m[1])
		push('word', m[2])
		push('space', m[3])
		push('name', m[4], m[4])
		push('space', m[5])
		push('inst', m[6])
		for (const o of m[7].matchAll(/(\s+)|(\w+)(=)(\S*)|(\S+)/g)) {
			if (o[1]) push('space', o[1])
			else if (o[2]) {
				push('opt', o[2] + o[3])
				push('value', o[4])
			} else push('value', o[5])
		}
	} else if ((m = body.match(/^(\s*)(pattern|loop|play|mute)\b(.*)$/i))) {
		push('space', m[1])
		push('word', m[2])
		words(m[3], m[2].toLowerCase() === 'mute' ? 'name' : 'part')
	} else if ((m = body.match(/^(\s*)(\S+?)(@\d+)?(\s*)(\|.*)$/))) {
		const voice = voices.includes(m[2]) ? m[2] : null
		push('space', m[1])
		push('name', m[2], voice)
		push('opt', m[3])
		push('space', m[4])
		for (const n of m[5].matchAll(/(\|)|(\s+)|(\[[^\]]*\][-]*)|([%_=])|(\.+)|([^\s|.]+)/g)) {
			if (n[1]) push('bar', n[1])
			else if (n[2]) push('space', n[2])
			else if (n[3]) push('chord', n[3], voice)
			else if (n[4]) push('same', n[4])
			else if (n[5]) push('rest', n[5])
			else push('note', n[6], voice)
		}
	} else if ((m = body.match(HEAD)) && !/^\s/.test(body)) {
		push('word', m[0])
		push('value', body.slice(m[0].length))
	} else push('value', body)
	push('comment', comment)
	return out
}

// The pieces again as [kind, text, voice, marks, col], cut where `marks`
// start and end so each piece names the marks it lies in. A mark with `text`
// isn't over the line but put into it at `start`, with no col.
export function mark(pieces, marks) {
	const out = []
	const cuts = [...new Set(marks.flatMap((m) => [m.start, m.end ?? m.start]))].sort((a, b) => a - b)
	const over = (a, b) => marks.filter((m) => m.text == null && m.start <= a && b <= m.end).map((m) => m.cls)
	const put = (col) => {
		for (const m of marks) if (m.text != null && m.start === col) out.push([m.cls, m.text, null, [], null])
	}
	let col = 0
	for (const [kind, text, voice] of pieces) {
		let from = 0
		for (const c of cuts) {
			if (c < col + from || c > col + text.length) continue
			if (c > col + from) out.push([kind, text.slice(from, c - col), voice, over(col + from, c), col + from])
			from = c - col
			if (c < col + text.length) put(c)
		}
		if (from < text.length) out.push([kind, text.slice(from), voice, over(col + from, col + text.length), col + from])
		col += text.length
	}
	put(col)
	return out
}
