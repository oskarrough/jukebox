// A few words on what a setting, option or line does, shown when you point
// at it in the score. In the guide's words, where it has them.

export const DRUM_STEPS = 'x a hit, X an accent, o a soft hit, . a rest'

export const HINTS = {
	// voice options
	vol: 'Volume, 0 to 2 (0.8)',
	pan: '-1 left to 1 right',
	rev: 'Reverb send, 0 to 1',
	oct: 'Shifts octaves',
	trans: 'Shifts semitones',
	gate: 'How much of each note sounds, 0.05 to 1 (0.5 is staccato)',
	glide: 'Seconds a ~ slide takes (0.07)',
	bright: '0.1 dark to 4 bright (1)',
	att: 'Attack in seconds',
	rel: 'Release in seconds',
	center: 'Where chords are voiced',
	drive: '0 to 4, dirt for 808, logdrum and drive',
	echo: 'Steps between echoes, 0 to 16 (off)',
	tail: 'How much of each echo comes back, 0 to 0.9 (0.5)',
	// settings, in the head or on a pattern
	tempo: 'Beats a minute',
	beats: 'Beats to a bar',
	steps: 'Steps to a beat',
	swing: '0 to 0.75, delays every other step',
	reverb: '0 to 1',
	key: "The song's key",
	tags: 'Any words, to find the song by in the list',
	// lines
	from: 'Starts as a copy of that pattern',
	mute: 'Drops voices',
	play: 'Plays once, before the loop',
	loop: 'Repeats forever: *2 plays a pattern twice, +5 or -2 transposes it',
}
