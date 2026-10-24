// Ableton-style device chain. Each effect is a bypassable device; the three the
// jukebox already had (source colouring, distance, in-car muffling) live here as
// Source, Distance and Inferno. Append to EFFECTS to add another.
export const HEAR = 18 // tiles, how far music carries

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

export const reach = (kind) => KINDS[kind]?.hear ?? HEAR

// Hearing the song with every device bypassed: full level, open filter.
export const DRY = { level: 1, wet: 0.3, cutoff: 12000 }

export const SOURCES = [
	{ id: 'radio', label: 'Späti' },
	{ id: 'bar', label: 'Bar' },
	{ id: 'window', label: 'Window' },
	{ id: 'car', label: 'Car' },
	{ id: 'convoy', label: 'Convoy' },
	{ id: 'own', label: 'My car' },
]

function kindOf(p) {
	const own = p.own || p.kind === 'own'
	const kind = own ? 'car' : KINDS[p.kind] ? p.kind : 'radio'
	return { kind, own }
}

export const EFFECTS = [
	{
		id: 'source',
		title: 'Source',
		blurb: 'how it colours the room',
		defaults: { on: true, kind: 'radio' },
		apply(sound, p) {
			const { kind, own } = kindOf(p)
			const k = KINDS[kind]
			return {
				...sound,
				level: k.level,
				wet: k.wet,
				cutoff: own ? 6000 : k.cutoff,
				kind,
				own,
				hear: reach(kind),
			}
		},
	},
	{
		id: 'distance',
		title: 'Distance',
		blurb: 'tiles away',
		defaults: { on: true, d: 4 },
		apply(sound, p) {
			if (sound.own) return sound
			const hear = sound.hear ?? HEAR
			const near = 1 - Math.min(1, Number(p.d) / hear)
			return {
				...sound,
				level: sound.level * near * near,
				wet: sound.wet * near,
				cutoff: sound.cutoff * (0.35 + 0.65 * near),
			}
		},
	},
	{
		id: 'inferno',
		title: 'Inferno',
		blurb: 'muffled from a car',
		defaults: { on: true, inCar: false },
		apply(sound, p) {
			const shut = p.inCar && !sound.own ? 0.45 : 1
			return {
				...sound,
				level: sound.level * shut,
				wet: sound.wet * shut,
				cutoff: sound.cutoff * shut,
			}
		},
	},
]

export function effectState() {
	return Object.fromEntries(EFFECTS.map((fx) => [fx.id, { ...fx.defaults }]))
}

export function runChain(state) {
	let sound = { ...DRY, own: false, kind: 'radio', hear: HEAR }
	for (const fx of EFFECTS) {
		const p = state[fx.id] ?? fx.defaults
		if (p.on !== false) sound = fx.apply(sound, p)
	}
	return sound
}

// Same numbers as before, for the game and for tests: all three devices on.
export function shape(kind, d, own = false, inCar = false) {
	return runChain({
		source: { on: true, kind, own },
		distance: { on: true, d },
		inferno: { on: true, inCar },
	})
}
