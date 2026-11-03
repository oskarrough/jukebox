import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { compile, noteToMidi, parseKey, MELODIC, DRUMS } from '../src/score.js'
import { mtof } from '../src/synth.js'
import { HEAR, cueAt, join, shape, runChain, effectState, EFFECTS } from '../src/player.js'
import { BRICKS, addBrick, brickInto } from '../src/bricks.js'
import { addSection, moveSection, removeSection, repeatSection, sectionsOf } from '../src/ui/arrange.js'
import { paint } from '../src/ui/paint.js'
import { caretAt, columnOf, marksFor } from '../src/ui/link.js'
import { nudge, stepsOf, toggleStep } from '../src/ui/nudge.js'
import { suggest } from '../src/ui/complete.js'
import { noteOf, octaveAt } from '../src/ui/keyboard.js'
import { inferKey, keyOf, setSongKey, starter, transposeScore } from '../src/key.js'

const STARTER_ISH = 'voice kick kick\npattern A\nkick | x... x... x... x... |\nloop A'

const dir = new URL('../music/', import.meta.url)
const SCORES = readdirSync(dir)
	.filter((f) => f.endsWith('.song'))
	.map((f) => f.slice(0, -'.song'.length))
const score = (name) => compile(readFileSync(new URL(`${name}.song`, dir), 'utf8'))

describe('scores', () => {
	test('there are songs', () => expect(SCORES.length).toBeGreaterThan(0))
	for (const name of SCORES) {
		test(`${name} plays without errors and loops`, () => {
			const song = score(name)
			expect(song.errors).toEqual([])
			expect(song.loop.dur).toBeGreaterThan(10)
		})
	}
})

describe('quarter tones', () => {
	test('q is a half-flat, a quarter tone under the note', () => {
		expect(noteToMidi('Eq4')).toBe(63.5)
		expect(noteToMidi('Bq3')).toBe(58.5)
		expect(mtof(63.5) / mtof(63)).toBeCloseTo(2 ** (1 / 24))
	})

	test('half-flats play, in melodies and glides', () => {
		const song = compile(`voice oud oud
pattern A
oud | D4- Eq4- F4- ~Eq4- D4------- |`)
		expect(song.errors).toEqual([])
		const notes = song.loop.events.map((e) => e.m[0])
		expect(notes).toEqual([62, 63.5, 65, 63.5, 62])
		expect(song.loop.events[3].g).toBe(65)
	})

	test('the Sonnenallee songs are in a maqam with quarter tones', () => {
		for (const name of ['sonnenallee', 'sonnenallee-bei-nacht']) {
			const song = score(name)
			expect(song.street).toBe('Sonnenallee')
			expect(song.loop.events.some((e) => e.m?.some((m) => m % 1))).toBe(true)
		}
	})
})

describe('songs say where they belong', () => {
	test('street and at in the head', () => {
		expect(score('konvoi').at).toEqual([])
		expect(score('hasenheide').at).toEqual(['cafe'])
		for (const name of ['tempelhofer-feld', 'luftbruecke']) expect(score(name).at).toEqual(['feld'])
		expect(compile('at Doener  cafe\nvoice a sine\npattern A\na | C4 |').at).toEqual(['doener', 'cafe'])
	})
	test("game names the game a song is for; without it a song is NK GTA's", () => {
		for (const name of ['dodgethis-theme', 'altamesa', 'overthrow', 'flagfall']) expect(score(name).game).toBe('dodgethis')
		expect(score('konvoi').game).toBe('')
	})
})

describe('playing from a distance', () => {
	test('a wedding convoy carries much further than a car radio, and louder', () => {
		const far = shape('convoy', HEAR * 1.5)
		const near = shape('convoy', 5)
		expect(far.level).toBeGreaterThan(0)
		expect(shape('car', HEAR * 1.5).level).toBe(0)
		expect(near.level).toBeGreaterThan(far.level)
		expect(near.cutoff).toBeGreaterThan(far.cutoff)
		expect(near.level).toBeGreaterThan(shape('car', 5).level)
	})

	test('coming back, a source carries on where its song had got to', () => {
		const song = score('hermannplatz')
		expect(cueAt(song, 0)).toEqual({ list: 'intro', i: 0, offset: 0 })
		const later = song.intro.dur + song.loop.dur * 3 + 5
		const cue = cueAt(song, later)
		expect(cue.list).toBe('loop')
		expect(cue.offset).toBeCloseTo(song.intro.dur + song.loop.dur * 3)
		const next = song.loop.events[cue.i]
		expect(cue.offset + next.t).toBeGreaterThanOrEqual(later)
		expect(cue.offset + song.loop.events[cue.i - 1].t).toBeLessThan(later)
	})

	test('a source joined later is further on in its song', () => {
		const song = score('hermannplatz')
		const first = join(song, 100, 5)
		const again = join(song, 100, 5 + 25)
		expect(first.start).toBe(again.start)
		const at = (j) => j.cue.offset + song[j.cue.list].events[j.cue.i].t
		expect(at(again)).toBeGreaterThan(at(first) + 20)
		expect(first.start + at(first)).toBeGreaterThanOrEqual(5)
	})
})

describe('loop bricks', () => {
	test('every brick drops into every song and plays', () => {
		for (const name of SCORES) {
			const text = readFileSync(new URL(`${name}.song`, dir), 'utf8')
			for (const brick of BRICKS) {
				const { text: next, voice } = addBrick(text, brick)
				const song = compile(next)
				expect(song.errors).toEqual([])
				expect(song.voices.map((v) => v.name)).toContain(voice)
			}
		}
	})

	test('a brick stretches to a bar of three beats', () => {
		const text = 'beats 3\nvoice a sine\npattern A\na | C4----------- |\nloop A'
		for (const brick of BRICKS) expect(compile(addBrick(text, brick).text).errors).toEqual([])
	})

	test('a brick for a part the song has replaces it instead of piling up', () => {
		const pulse = BRICKS.find((b) => b.id === 'pulse')
		const bass = addBrick('voice a sine\npattern A\na | C4 |\nloop A', pulse).text
		const again = addBrick(bass, pulse)
		expect(again.voice).toBe('bass')
		expect(again.text).toBe(bass)
		const brk = addBrick(
			STARTER_ISH,
			BRICKS.find((b) => b.id === 'break'),
		)
		expect(brk.voice).toBe('kick')
		expect(brk.text).not.toMatch(/kick2/)
		expect(brk.text.match(/^kick\s*\|/gm)).toHaveLength(1)
		expect(brk.text).toMatch(/x\.\.\. \.\.\.\. \.\.x\. \.x\.\./)
		const other = addBrick(
			bass,
			BRICKS.find((b) => b.id === '808'),
		)
		expect(other.voice).toBe('b808')
		expect(other.text).toMatch(/^voice bass /m)
		const bounce = addBrick(
			bass,
			BRICKS.find((b) => b.id === 'bounce'),
		).text
		expect(compile(bounce).voices.find((v) => v.name === 'bass').inst).toBe('ebass')
	})

	test('a brick in a major key sounds major', () => {
		const song = (key) => `key ${key}\nvoice a sine\npattern A\na | C4 |\nloop A`
		const pad = BRICKS.find((b) => b.id === 'pad')
		const arp = BRICKS.find((b) => b.id === 'arp')
		expect(addBrick(song('E'), pad).text).toMatch(/\[E\]/)
		expect(addBrick(song('E'), pad).text).not.toMatch(/\[Em\]/)
		expect(addBrick(song('Em'), pad).text).toMatch(/\[Em\]/)
		expect(addBrick(song('C'), pad).text).toMatch(/\[C\]/)
		const third = (text) => /^arp\s*\|\s*(\S+) (\S+) (\S+)/m.exec(text).slice(1, 4)
		expect(third(addBrick(song('E'), arp).text)).toEqual(['E5', 'G#5', 'B5'])
		expect(third(addBrick(song('Em'), arp).text)).toEqual(['E5', 'G5', 'B5'])
	})
})

describe('effects rack', () => {
	test('Source, Distance and Inferno are devices in the chain', () => {
		expect(EFFECTS.map((fx) => fx.id)).toEqual(['source', 'distance', 'inferno'])
	})

	test('all on with the current settings matches the old shape()', () => {
		const fx = effectState()
		for (const kind of ['radio', 'bar', 'window', 'car', 'convoy']) {
			for (const d of [0, 4, 18, 40]) {
				fx.source.kind = kind
				fx.distance.d = d
				fx.inferno.inCar = false
				const a = shape(kind, d)
				const b = runChain(fx)
				expect(b.level).toBeCloseTo(a.level)
				expect(b.wet).toBeCloseTo(a.wet)
				expect(b.cutoff).toBeCloseTo(a.cutoff)
			}
		}
		const muffled = runChain({ ...effectState(), inferno: { on: true, inCar: true } })
		const old = shape('radio', 4, false, true)
		expect(muffled.level).toBeCloseTo(old.level)
		expect(muffled.cutoff).toBeCloseTo(old.cutoff)
	})

	test('each device can be bypassed on its own', () => {
		const far = runChain({ source: { on: true, kind: 'bar' }, distance: { on: false, d: 20 }, inferno: { on: true, inCar: false } })
		expect(far.level).toBeCloseTo(shape('bar', 0).level)
		expect(far.cutoff).toBeCloseTo(shape('bar', 0).cutoff)

		const cabin = runChain({ source: { on: true, kind: 'radio' }, distance: { on: true, d: 4 }, inferno: { on: false, inCar: true } })
		expect(cabin.level).toBeCloseTo(shape('radio', 4, false, false).level)

		const dry = runChain({ source: { on: false, kind: 'car' }, distance: { on: false, d: 20 }, inferno: { on: false, inCar: true } })
		expect(dry.level).toBeCloseTo(1)
		expect(dry.cutoff).toBeGreaterThan(8000)
	})
})

describe('song key', () => {
	test('key in the head is parsed, and songs in music/ still play without one', () => {
		expect(parseKey('C').pc).toBe(0)
		expect(parseKey('Dm')).toEqual({ letter: 'D', acc: '', minor: true, pc: 2, name: 'Dm' })
		expect(parseKey('F#').name).toBe('F#')
		expect(compile('key G\nvoice a sine\npattern A\na | G4 |\nloop A').key.name).toBe('G')
		for (const name of SCORES) {
			const text = readFileSync(new URL(`${name}.song`, dir), 'utf8')
			if (!/^key\s/m.test(text)) expect(compile(text).key).toBeNull()
		}
	})

	test('the painted score is the score, character for character, and a sharp is not a comment', () => {
		for (const name of SCORES)
			for (const line of readFileSync(new URL(`${name}.song`, dir), 'utf8').split('\n'))
				expect(
					paint(line, [])
						.map((p) => p[1])
						.join(''),
				).toBe(line)
		expect(paint('a | C#4 # x |', ['a']).find((p) => p[0] === 'comment')[1]).toBe('# x |')
	})

	test('every song is tagged, and tags are any words', () => {
		expect(compile('title X\ntags NKGTA wip\nvoice a sine\npattern A\na | C4 |\nloop A').tags).toEqual(['nkgta', 'wip'])
		for (const name of SCORES) expect(compile(readFileSync(new URL(`${name}.song`, dir), 'utf8')).tags.length).toBeGreaterThan(0)
	})

	test('new songs and bricks follow the key, instead of always landing in C', () => {
		const inG = starter('G')
		expect(inG).toMatch(/^key\s+G$/m)
		expect(inG).not.toMatch(/^(voice|pattern)\s/m)
		const pulse = BRICKS.find((b) => b.id === 'pulse')
		const { text } = addBrick('key G\nvoice a sine\npattern A\na | G4 |\nloop A', pulse)
		expect(text).toMatch(/G2/)
		expect(text).not.toMatch(/C2/)
		const { text: inC } = addBrick('key C\nvoice a sine\npattern A\na | C4 |\nloop A', pulse)
		expect(inC).toMatch(/C2/)
	})

	test('changing key transposes notes and chords in the score', () => {
		const moved = setSongKey('key C\nvoice pad strings center=E4\npattern A\npad | [C] [Am] C4 |\nloop A', 'D')
		expect(moved).toMatch(/^key\s+D$/m)
		expect(moved).toMatch(/\[D\].*\[Bm\].*D4/)
		expect(moved).toMatch(/center=F#4/)
		expect(transposeScore('lead | C5- Eq4- |', 5, parseKey('F'))).toMatch(/F5-.*Aq4-/)
		expect(keyOf('voice a sine\npattern A\na | G4 G4 D5 |\nloop A').pc).toBe(7)
		expect(inferKey(compile('voice a sine\npattern A\na | G4 G4 D5 B4 |\nloop A')).name).toMatch(/^G/)
	})
})

describe('patching bars with from', () => {
	const base = 'beats 1\nsteps 4\nvoice a sine\nvoice k kick\npattern A\na | C4--- | D4--- | E4--- | F4--- |\nk | x... | % | % | % |\n'
	const notes = (song) => song.loop.events.filter((e) => e.m).map((e) => e.m[0])
	test('voice@N replaces bars from N on and keeps the rest', () => {
		const song = compile(base + 'pattern B from A\na@3 | G4--- |\nloop B')
		expect(song.errors).toEqual([])
		expect(notes(song)).toEqual([60, 62, 67, 65])
		expect(song.loop.events.filter((e) => !e.m).length).toBe(4)
	})
	test('a patch past the end, or with nothing to patch, fills the gap with silence', () => {
		expect(notes(compile(base + 'pattern B from A\na@6 | G4--- |\nloop B'))).toEqual([60, 62, 64, 65, 67])
		const song = compile('beats 1\nsteps 4\nvoice a sine\npattern A\na@2 | G4--- |\nloop A')
		expect(song.errors).toEqual([])
		expect(song.loop.events.map((e) => e.t)).toEqual([0.5])
	})
	test('patched lines transpose with the key', () => {
		expect(transposeScore('a@3 | C4--- |', 2, parseKey('D'))).toMatch(/^a@3 \| D4---/)
	})
})

describe('the Guide', () => {
	test('names every instrument', () => {
		const html = readFileSync(new URL('../src/ui/Guide.jsx', import.meta.url), 'utf8')
		const guide = html.slice(html.indexOf('id="guide"'))
		const missing = [...MELODIC, ...DRUMS].filter((name) => !guide.includes(`<code>${name}</code>`))
		expect(missing).toEqual([])
	})
})

describe('the score and the roll', () => {
	const text = `tempo 120
voice lead square
voice kick kick
pattern A
lead | C4- D4- E4--- ........ | G4--------------- |
kick | x...x...x...x... | % |
pattern B from A
lead@2 | A4--------------- |
loop A B`
	const song = compile(text)
	const at = (line, col) =>
		caretAt(
			text,
			text
				.split('\n')
				.slice(0, line - 1)
				.join('\n').length +
				1 +
				col,
		)

	test('the caret knows its pattern, voice and bar', () => {
		expect(at(5, 7)).toEqual({ ln: 5, k: 0, voice: 'lead', pattern: 'A' })
		expect(at(5, 36)).toEqual({ ln: 5, k: 1, voice: 'lead', pattern: 'A' })
		expect(at(4, 3)).toEqual({ ln: 4, k: -1, voice: null, pattern: 'A' })
		expect(at(9, 7).pattern).toBe('B')
	})

	test("a bar lights wherever it plays, B's copy of A included", () => {
		const m = marksFor(song, at(5, 7))
		expect([...m.bars]).toEqual(['A:0', 'B:0'])
		expect(m.first).toBe(0)
		expect([...marksFor(song, at(8, 10)).bars]).toEqual(['B:1'])
		expect([...marksFor(song, at(7, 3)).whole]).toEqual(['B'])
	})

	test('a note on the roll finds its column', () => {
		const lead = text.split('\n')[4]
		expect(lead.slice(columnOf(lead, 0, 2, false))).toStartWith('D4-')
		expect(lead.slice(columnOf(lead, 0, 13, false))).toStartWith('..')
		expect(lead.slice(columnOf(lead, 1, 0, false))).toStartWith('G4')
		const kick = text.split('\n')[5]
		expect(columnOf(kick, 0, 4, true)).toBe(kick.indexOf('x', 8))
		expect(song.loop.events.find((e) => e.v === 0 && e.st === 2).b).toBe(0)
	})

	test('a song can loop one pattern', () => {
		const one = compile(text, 'B')
		expect(one.loop.sections.map((s) => s.name)).toEqual(['B'])
		expect(one.intro.dur).toBe(0)
	})
})

describe('nudging', () => {
	const text = `tempo 112
voice lead square vol=0.5 pan=-0.1 center=E4
pattern A
lead | C4- D#4- [Am7]------------ |
kick | x... .o.. X... .... |`
	const drums = new Set(['kick'])
	const key = parseKey('C')
	const go = (find, dir, big = false, nth = 0) => {
		const pos = text.indexOf(find) + nth
		const r = nudge(text, pos, dir, big, drums, key)
		return r && text.slice(0, r.start) + r.to + text.slice(r.end)
	}

	test('notes move by a semitone, or an octave', () => {
		expect(go('C4-', 1)).toContain('lead | C#4- D#4-')
		expect(go('D#4-', -1, true)).toContain('C4- D#3-')
		expect(go('[Am7]', 1)).toContain('[A#m7]---')
		expect(go('center=E4', 1, false, 8)).toContain('center=F4')
	})

	test('numbers move by their last digit', () => {
		expect(go('112', 1)).toContain('tempo 113')
		expect(go('112', -1, true)).toContain('tempo 102')
		expect(go('0.5', 1)).toContain('vol=0.6')
		expect(go('-0.1', 1, false, 1)).toContain('pan=0.0')
	})

	test('drum steps go . o x X', () => {
		expect(go('x... .o', 1)).toContain('kick | X...')
		expect(go('.o..', 1, false, 1)).toContain('.x..')
		expect(go('X...', 1)).toBeNull()
	})

	test('pads switch steps, keeping the spacing or writing out % and _', () => {
		const line = 'kick | x... .... | % | _ |'
		expect(stepsOf(line, 1, 8)).toEqual([...'x.......'])
		const r = toggleStep(line, 0, 4, 8)
		expect(line.slice(0, r.start) + r.to + line.slice(r.end)).toBe('kick | x... x... | % | _ |')
		expect(toggleStep(line, 2, 0, 8).to).toBe(' x....... ')
	})
})

describe('suggestions and the piano', () => {
	const text = `tempo 100
voice lead squ
voice kick kick vol=0.8 pa
pattern A
le
loop A
mute ki`
	const at = (find, extra = 0) => suggest(text, text.indexOf(find) + find.length + extra)

	test('instruments, options, voices and patterns', () => {
		expect(at('voice lead squ').items[0]).toMatchObject({ word: 'square', insert: 'square ' })
		expect(at('vol=0.8 pa').items.map((i) => i.word)).toEqual(['pan'])
		expect(at('\nle').items[0].insert).toBe('lead | ')
		expect(at('mute ki').items[0].word).toBe('kick')
		expect(suggest(text, text.indexOf('tempo') + 3)).toBeNull()
	})

	test('every line start, and a ghost of what comes next', () => {
		const next = (t) => suggest(t, t.length, parseKey('C'))
		expect(next('tempo 100\nt').items.map((i) => i.word)).toEqual(['title', 'tags'])
		expect(next('tempo 100\n')).toMatchObject({ quiet: true, items: [{ insert: 'voice ' }] })
		expect(next('voice kick kick\n\n').items[0].insert).toBe('pattern ')
		expect(next('voice kick kick\npattern A\n').items[0].insert).toBe('kick | ')
		expect(next('voice kick kick\npattern A\nkick | ').items[0].insert).toBe('x... x... x... x... |')
		expect(next('voice lead square\npattern A\nlead | ').items[0].insert).toBe('C4--- E4--- G4--- E4--- |')
		expect(next('pattern A\npattern B\n\nloop A ').items[0].insert).toBe('B')
	})

	test('keys play from C by where they sit', () => {
		expect(noteOf('KeyA', 4, parseKey('C'))).toBe('C4')
		expect(noteOf('KeyW', 4, parseKey('F'))).toBe('Db4')
		expect(noteOf('KeyK', 3, parseKey('C'))).toBe('C4')
		expect(noteOf('KeyQ', 4, parseKey('C'))).toBeNull()
		expect(octaveAt('lead | A2- C3 ', 14)).toBe(3)
	})
})

describe('arranging sections', () => {
	const KONVOI = readFileSync(new URL('konvoi.song', dir), 'utf8')
	const order = (t) => t.match(/^(play|loop)\b.*$/gm)
	const brick = (id) => BRICKS.find((b) => b.id === id)
	// Which voices each pattern plays, by name.
	const heard = (t) => {
		const out = {}
		for (const [name, s] of Object.entries(compile(t).loop.sections.reduce((m, s) => ({ ...m, [s.name]: s }), {})))
			out[name] = Object.keys(s.where).sort()
		return out
	}

	test('a section is each play and loop word, as long as it plays', () => {
		const { all, fixed } = sectionsOf(KONVOI, compile(KONVOI))
		expect(fixed).toBe(false)
		expect(all.map((s) => s.word)).toEqual(['intro', 'A', 'A2', 'A', 'A+5'])
		const twice = KONVOI.replace('loop A A2 A A+5', 'loop A*2 A2')
		const [, a, a2] = sectionsOf(twice, compile(twice)).all
		expect(a.dur).toBeCloseTo(a2.dur * 2)
		expect(a2.start).toBeCloseTo(a.start + a.dur)
	})

	test('moving a section reorders its line, and into the other line only well inside it', () => {
		expect(order(moveSection(KONVOI, 4, 1))).toEqual(['play intro', 'loop A+5 A A2 A'])
		expect(order(moveSection(KONVOI, 2, 1))).toEqual(['play intro', 'loop A2 A A A+5'])
		expect(order(moveSection(KONVOI, 0, 3))).toEqual(['loop A A2 intro A A+5'])
		expect(order(moveSection(KONVOI, 4, 0))).toEqual(['play A+5 intro', 'loop A A2 A'])
	})

	test('copying, repeating and removing a section', () => {
		expect(order(moveSection(KONVOI, 2, 5, true))).toEqual(['play intro', 'loop A A2 A A+5 A2'])
		expect(order(repeatSection(KONVOI, 4, 3))).toEqual(['play intro', 'loop A A2 A A+5*3'])
		expect(order(repeatSection(repeatSection(KONVOI, 4, 3), 4, 1))).toEqual(['play intro', 'loop A A2 A A+5'])
		expect(order(removeSection(KONVOI, 2))).toEqual(['play intro', 'loop A A A+5'])
		expect(order(removeSection(KONVOI, 0))).toEqual(['loop A A2 A A+5'])
		const one = 'voice a sine\npattern A\na | C4 |\nloop A # the end'
		expect(removeSection(one, 0)).toBe(one)
		expect(moveSection(one, 0, 1, true)).toBe('voice a sine\npattern A\na | C4 |\nloop A A # the end')
	})

	test('adding a section builds a pattern on the one you are in', () => {
		const { text, name } = addSection(KONVOI, 'A2')
		expect(name).toBe('A3')
		expect(text).toContain('mute clar\n\npattern A3 from A2\n')
		expect(order(text)).toEqual(['play intro', 'loop A A2 A A+5 A3'])
		expect(compile(text).errors).toEqual([])
		const bare = 'voice a sine\npattern A\na | C4 |'
		expect(order(addSection(bare, 'A').text)).toEqual(['loop A A2'])
	})

	test('a brick dropped on a section plays there only', () => {
		let t = 'key C\nvoice kick kick\npattern A\nkick | x... x... x... x... |\npattern A2 from A\npattern A3 from A2\nloop A A2 A3'
		t = brickInto(t, brick('hats'), 'A2').text
		expect(heard(t)).toEqual({ A: ['kick'], A2: ['hat', 'kick'], A3: ['kick'] })
		// A pattern built on it keeps the part it had.
		t = brickInto(t, brick('break'), 'A').text
		expect(compile(t).errors).toEqual([])
		const kick = (name) => /\n(kick[^\n]*)/.exec(t.slice(t.indexOf(`pattern ${name}`)))?.[1]
		expect(kick('A')).toContain('..x. .x..')
		expect(kick('A2')).toContain('x... x... x... x...')
		// Another instrument for the same part gets its own voice, in place of the old one there.
		t = brickInto(t, brick('pulse'), 'A3').text
		t = brickInto(t, brick('bounce'), 'A3').text
		expect(heard(t).A3).toEqual(['bass2', 'kick'])
		expect(compile(t).voices.find((v) => v.name === 'bass2').inst).toBe('ebass')
		// A mute of the brick's voice in that pattern goes.
		expect(heard(brickInto(KONVOI, brick('arp'), 'A2').text).A2).toContain('arp')
		expect(heard(brickInto(KONVOI, brick('bells'), 'A').text).A2).not.toContain('bell')
		const clar = KONVOI.replace(/voice clar\s+clarinet/, 'voice clar  marimba')
		expect(heard(brickInto(clar, { ...brick('arp'), voice: 'clar' }, 'A2').text).A2).toContain('clar')
	})

	test('every brick drops into every section of every song', () => {
		for (const name of ['konvoi', 'maybachufer', 'buschkrugallee']) {
			const text = readFileSync(new URL(`${name}.song`, dir), 'utf8')
			for (const s of sectionsOf(text, compile(text)).all)
				for (const b of BRICKS) expect(compile(brickInto(text, b, s.name).text).errors).toEqual([])
		}
	})
})
