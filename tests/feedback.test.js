import { expect, test } from 'bun:test'
import { MAX_TEXT, effectsLine, feedbackText, shortAgent } from '../src/feedback.js'

test('feedback is the player text, a blank line, then what was playing', () => {
	const text = feedbackText('  The roll jumps  ', {
		url: 'https://jukebox.0sk.ar/?song=konvoi&kind=convoy&d=20&car=1',
		song: 'konvoi',
		key: 'Dm',
		effects: 'Source convoy, Distance 20, Inferno in car',
		agent: 'Chrome 126 · Linux',
		version: 'abc1234',
	})
	expect(text.startsWith('The roll jumps\n\nurl: https://jukebox.0sk.ar/?song=konvoi&kind=convoy&d=20&car=1\n')).toBe(true)
	expect(text).toContain('song: konvoi\nkey: Dm\neffects: Source convoy, Distance 20, Inferno in car')
	expect(text).toContain('browser: Chrome 126 · Linux\nversion: abc1234')
})

test('the message is trimmed and cut at 2000 characters', () => {
	const long = `${'x'.repeat(MAX_TEXT + 40)}   `
	const text = feedbackText(long, {
		url: 'https://jukebox.0sk.ar/',
		song: 'feld',
		key: 'C',
		effects: 'off',
		agent: 'Safari 17 · Mac OS X',
		version: 'dev',
	})
	expect(text.startsWith(`${'x'.repeat(MAX_TEXT)}\n\nurl: `)).toBe(true)
	expect(text.indexOf('\n\n')).toBe(MAX_TEXT)
})

test('the browser is named short', () => {
	const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
	expect(shortAgent(chrome)).toBe('Chrome 126 · Linux')
	expect(shortAgent(chrome, true)).toBe('Chrome 126 · Linux · touch')
	expect(
		shortAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'),
	).toBe('Safari 17 · Mac OS X')
	expect(shortAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0')).toBe('Firefox 126 · Windows')
	expect(shortAgent('mystery-client/1.0')).toBe('browser · unknown')
})

test('effects name the devices that are on', () => {
	const fx = {
		source: { on: true, kind: 'bar' },
		distance: { on: true, d: 6 },
		inferno: { on: true, inCar: false },
	}
	expect(effectsLine(false, fx)).toBe('off')
	expect(effectsLine(true, fx)).toBe('Source bar, Distance 6, Inferno')
	expect(effectsLine(true, { ...fx, inferno: { on: true, inCar: true } })).toBe('Source bar, Distance 6, Inferno in car')
	expect(effectsLine(true, { ...fx, distance: { on: false, d: 6 } })).toBe('Source bar, Inferno')
})
