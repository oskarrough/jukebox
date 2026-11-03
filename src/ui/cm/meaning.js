// What the score's shorthand stands for, read from the text without touching
// it: the lines a pattern gets from the one it starts from, and what a % or _
// bar plays.
const MUSIC = /^\s*([A-Za-z_]\w*)(@\d+)?\s*\|/
const HEAD = /^\s*pattern\s+(\S+)(?:\s+from\s+(\S+))?/i

// The lines each `pattern X from Y` gets from Y and doesn't write itself, as
// [{ at, name, lines: [{ voice, text }] }]: `at` is where its block ends, the
// end of its last line that isn't blank, and where an inherited line goes if
// it becomes a real one. A voice the pattern writes a plain line for, or mutes,
// is its own; a voice it only patches (lead@2 | …) still has its line.
export function inherited(text) {
	const lines = text.split('\n')
	const blocks = new Map()
	let at = 0
	let cur = null
	let last = 0
	const close = () => cur && (cur.end = last)
	for (const line of lines) {
		const start = at
		at += line.length + 1
		const head = HEAD.exec(line)
		if (head || /^\s*(play|loop)\b/i.test(line)) {
			close()
			cur = null
		}
		if (head) {
			cur = { name: head[1], from: head[2], own: [], mute: new Set(), end: start + line.length }
			blocks.set(head[1], cur)
			last = start + line.length
			continue
		}
		if (!cur) continue
		const m = MUSIC.exec(line)
		if (m) cur.own.push({ voice: m[1], patch: !!m[2], text: line })
		const mute = /^\s*mute\s+(.*?)\s*(?:(?:^|\s)#.*)?$/i.exec(line)
		if (mute) mute[1].split(/\s+/).forEach((v) => cur.mute.add(v))
		if (line.trim() && !/^\s*#/.test(line)) last = start + line.length
	}
	close()
	// What `name` has: what it lends from its base, then its own lines.
	const lent = (name, stack) => {
		const b = blocks.get(name)
		if (!b?.from || stack.includes(name) || !blocks.has(b.from)) return []
		const plain = new Set(b.own.filter((l) => !l.patch).map((l) => l.voice))
		return has(b.from, [...stack, name]).filter((l) => !plain.has(l.voice) && !b.mute.has(l.voice))
	}
	const has = (name, stack) => [...lent(name, stack), ...blocks.get(name).own]
	return [...blocks.values()]
		.map((b) => ({ at: b.end, name: b.name, lines: lent(b.name, []).map(({ voice, text }) => ({ voice, text })) }))
		.filter((b) => b.lines.length)
}

// The bars that are a % (again) or a _ (silence) in `text`, each { from, to,
// silent, bar, voice }: the character, and `bar`, the text of the bar before
// it that it copies, or the width a silent bar takes.
export function repeats(text) {
	const out = []
	let at = 0
	let music = false
	let prev = null
	let voice = null
	for (const line of text.split('\n')) {
		const start = at
		at += line.length + 1
		const m = MUSIC.exec(line)
		if (m) {
			music = true
			prev = null
			voice = m[1]
		} else if (!(music && /^\s*\|/.test(line))) {
			music = false
			continue
		}
		const hash = line.search(/(^|\s)#/)
		const body = hash < 0 ? line : line.slice(0, hash)
		let from = m ? body.indexOf('|') + 1 : 0
		for (const seg of body.slice(from).split('|')) {
			const t = seg.trim()
			const col = from + seg.search(/\S|$/)
			from += seg.length + 1
			if (!t) continue
			let bar = { text: t, silent: false }
			if (t === '%' && prev) bar = prev
			else if (t === '_') bar = { text: prev?.text ?? '', silent: true }
			else if (t === '%') continue
			if (t === '%' || t === '_') out.push({ from: start + col, to: start + col + 1, silent: bar.silent, bar: bar.text, voice })
			prev = bar
		}
	}
	return out
}
