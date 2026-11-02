// Quick feedback from the jukebox: one text box, sent to the inkast list.
// The write URL is public by design; anyone can add to the list, nobody can read it.
export const INKAST = 'https://inkast.0sk.ar/bje7gakd'
export const MAX_TEXT = 2000

export function shortAgent(ua, touch = false) {
	const browser = /(Firefox|Edg|OPR|Chrome|Version)\/(\d+)/.exec(ua)
	const name = !browser ? 'browser' : ({ Edg: 'Edge', OPR: 'Opera', Version: 'Safari' }[browser[1]] ?? browser[1])
	const os = /Android|iPhone|iPad|Windows|Mac OS X|Linux/.exec(ua)?.[0] ?? 'unknown'
	return `${name}${browser ? ` ${browser[2]}` : ''} · ${os}${touch ? ' · touch' : ''}`
}

// Which devices in the game chain are actually colouring the sound.
export function effectsLine(inGame, fx) {
	if (!inGame) return 'off'
	const parts = []
	if (fx.source?.on !== false) parts.push(`Source ${fx.source.kind}`)
	if (fx.distance?.on !== false) parts.push(`Distance ${fx.distance.d}`)
	if (fx.inferno?.on !== false) parts.push(fx.inferno.inCar ? 'Inferno in car' : 'Inferno')
	return parts.join(', ') || 'off'
}

export function feedbackText(text, c) {
	const lines = [
		`url: ${c.url}`,
		`song: ${c.song}`,
		`key: ${c.key}`,
		`effects: ${c.effects}`,
		`browser: ${c.agent}`,
		`version: ${c.version}`,
	]
	return `${text.trim().slice(0, MAX_TEXT)}\n\n${lines.join('\n')}`
}
