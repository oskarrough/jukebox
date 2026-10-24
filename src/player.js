// Playing a compiled song live: as a source of some kind (a Späti radio, a bar
// door, an open window, a passing car, a wedding convoy, an open field), quieter
// and duller the further away it is, picked up wherever it has got to.
// Started as the playback half of NK GTA's src/music.js; the game-only parts
// (where sources are on the map, which plays where) stayed in the game.
import { createSynth } from './synth.js'

export const HEAR = 18 // tiles, how far music carries
export const AHEAD = 0.3 // seconds of notes scheduled ahead

// How each kind of source sounds: level, brightest cutoff in Hz, reverb send,
// and how many tiles it carries if further than HEAR.
export const KINDS = {
	radio: { level: 0.55, cutoff: 3200, wet: 0.25 },
	bar: { level: 0.8, cutoff: 1400, wet: 0.5 },
	window: { level: 0.7, cutoff: 2200, wet: 0.6 },
	car: { level: 1, cutoff: 900, wet: 0.15 },
	field: { level: 0.4, cutoff: 5000, wet: 0.8 },
	convoy: { level: 1.2, cutoff: 4200, wet: 0.2, hear: 45 }, // windows down, all of it
}
export const reach = (kind) => KINDS[kind].hear ?? HEAR

// Where a song has got to after `elapsed` seconds: which timeline, the index of
// the next note and that timeline's start, in seconds from the song's start.
export function cueAt(song, elapsed) {
	let list = 'intro'
	let offset = 0
	if (elapsed >= song.intro.dur && song.loop.dur > 0) {
		list = 'loop'
		offset = song.intro.dur + Math.floor((elapsed - song.intro.dur) / song.loop.dur) * song.loop.dur
	}
	const events = song[list].events
	let i = events.findIndex((e) => offset + e.t >= elapsed)
	if (i < 0) i = events.length
	return { list, i, offset }
}

// Radios don't wait for you: a source's song started `since` seconds before the
// audio clock did, so joining at `now` picks it up wherever it has got to.
export function join(song, since, now) {
	const start = -since
	return { start, cue: cueAt(song, now - start) }
}

// Schedules a session's notes up to `horizon`, looping forever.
export function feed(p, horizon, now) {
	const song = p.song
	for (let guard = 0; guard < 5000; guard++) {
		const events = song[p.cue.list].events
		if (p.cue.i >= events.length) {
			if (!song.loop.dur) return
			const next = p.cue.list === 'intro' ? song.intro.dur : p.cue.offset + song.loop.dur
			if (p.start + next > horizon) return
			p.cue = { list: 'loop', i: 0, offset: next }
			continue
		}
		const ev = events[p.cue.i]
		const t = p.start + p.cue.offset + ev.t
		if (t > horizon) return
		if (t >= now - 0.03) p.session.play(ev, Math.max(t, now + 0.005))
		p.cue.i++
	}
}

// One synth for all the music, into `master`.
export function synthFor(context, master) {
	const synth = createSynth(context, master)
	synth.out.gain.value = 0.6
	return synth
}

// How a source of `kind` sounds `d` tiles away: level, reverb send and
// lowpass cutoff. Your own car's radio plays clear; sitting in a car muffles
// everyone else's.
export function shape(kind, d, own = false, inCar = false) {
	const k = KINDS[kind]
	const near = 1 - Math.min(1, d / reach(kind))
	const shut = inCar && !own ? 0.45 : 1
	return { level: k.level * near * near * shut, wet: k.wet * near * shut, cutoff: own ? 6000 : k.cutoff * (0.35 + 0.65 * near) * shut }
}

// Starts a source's song through its own level, lowpass and pan, silent until
// tuned, picking it up wherever it has got to.
export function begin(synth, context, src, song) {
	const kind = KINDS[src.kind]
	const level = context.createGain()
	level.gain.value = 0
	const tone = context.createBiquadFilter()
	tone.type = 'lowpass'
	tone.frequency.value = kind.cutoff
	const pan = context.createStereoPanner()
	level.connect(tone).connect(pan).connect(synth.master)
	const wet = context.createGain()
	wet.gain.value = 0
	wet.connect(synth.verbIn)
	synth.warm(song)
	const now = context.currentTime
	return { src, song, level, tone, pan, wet, session: synth.session(song, level, wet), ...join(song, src.since, now + 0.05) }
}

export function tune(p, { level, wet, cutoff }, pan, now) {
	p.level.gain.setTargetAtTime(level, now, 0.15)
	p.wet.gain.setTargetAtTime(wet, now, 0.15)
	p.tone.frequency.setTargetAtTime(cutoff, now, 0.15)
	p.pan.pan.setTargetAtTime(pan, now, 0.1)
}

// Fades a source out and lets go of its nodes.
export function end(p, context) {
	p.level.gain.setTargetAtTime(0, context.currentTime, 0.3)
	p.wet.gain.setTargetAtTime(0, context.currentTime, 0.3)
	setTimeout(() => {
		p.session.stop(0.01)
		for (const node of [p.level, p.tone, p.pan, p.wet]) node.disconnect()
	}, 2000)
}
