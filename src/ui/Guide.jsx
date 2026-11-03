// The song format guide, opened from the top bar's "?". Its words for agents
// are in .agents/skills/compose-song/reference.md: change both together.
import { For } from 'solid-js'
import { GROUPS } from '../instruments.js'

export function Guide() {
	return (
		<div id="guide" class="pop guide" popover>
			<p>
				The format started as Simon Willison's <a href="https://tools.simonwillison.net/scrimshaw-jukebox">Scrimshaw</a>. A song is a head,
				some voices, some patterns and a <code>loop</code> line. Anything after <code>#</code> is a comment.
			</p>
			<h3>Writing</h3>
			<p>
				<kbd>⌥↑</kbd> <kbd>⌥↓</kbd>, or <kbd>⌥</kbd>-drag, nudges what's under the caret: a note by a semitone (<kbd>⇧</kbd> an octave), a
				number by its last digit, a drum step from <code>.</code> to <code>o</code> <code>x</code> <code>X</code>. On a drum line, the pads
				under the score switch its steps. Click the roll to find a note in the score; <kbd>⌘L</kbd> loops the pattern you're in,{' '}
				<kbd>⌘↩</kbd> plays and stops, <kbd>⌘S</kbd> saves. Instruments, options, voices and patterns are suggested as you type:{' '}
				<kbd>Tab</kbd> takes one. <kbd>⌘K</kbd> makes the keyboard a piano: <kbd>A</kbd> is C, <kbd>W</kbd> C#, on along the row,{' '}
				<kbd>Z</kbd> <kbd>X</kbd> an octave down and up, and on a voice's line each note is written in.
			</p>
			<h3>Head</h3>
			<p>
				<code>title</code>, <code>about</code>, <code>composer</code>, <code>tags nkgta wip</code> (any words, to find the song by in the
				list), <code>tempo 120</code>, <code>beats 4</code> (beats to a bar), <code>steps 4</code> (steps to a beat),
				<code>swing 0.1</code> (0 to 0.75, delays every other step), <code>reverb 0.3</code> (0 to 1). <code>key G</code> or
				<code>key Dm</code> sets the song's key: the key switch transposes what you wrote, loop bricks land in that key, and new songs start
				in whatever key is selected.
			</p>
			<h3>Notes</h3>
			<p>
				With <code>beats 4</code> and <code>steps 4</code>, each bar holds 16 steps, and every bar has to add up to exactly that; the error
				says which bar is off. Each word is a step. A note like <code>A4</code> uses one; each dash holds it a step longer, so
				<code>A4-</code> is two steps and <code>A4---</code> four. Each dot is a step of rest, <code>...</code> three. Separate bars with
				<code>|</code>.
			</p>
			<p>
				Chords: <code>[Am7]</code>, <code>[C/E]</code>, <code>[D5]</code>, or stack notes yourself with <code>C4+E4+G4</code>.
				<code>~D4</code> slides into D4 from the voice's previous note. <code>D4!</code> is louder, <code>D4?</code> softer; marks stack.
				<code>q</code> is a half-flat, a quarter tone down: <code>Eq4</code> is the E of maqamat Rast and Bayati, <code>Bq3</code> the B of
				Rast, and <code>~</code> slides into quarter tones too.
			</p>
			<p>
				Alone in a bar, <code>%</code> repeats the previous bar, <code>_</code> leaves it silent and <code>=</code> holds the last note
				through it. Two lines for the same voice in one pattern run on: the second line's bars follow the first's.
			</p>
			<h3>Drums</h3>
			<p>
				Drum lanes are one character a step: <code>x</code> a hit, <code>X</code> an accent, <code>o</code> a soft hit, <code>.</code> a
				rest. Spaces don't count, so <code>x... x... x... x...</code> is a bar of four on the floor.
			</p>
			<h3>Voices</h3>
			<p>
				<code>voice lead flute vol=0.6 pan=-0.3</code>: a name, an instrument, then options. <code>vol</code> 0 to 2 (0.8);
				<code>pan</code> -1 left to 1 right; <code>rev</code> reverb send 0 to 1 (each instrument has its own); <code>oct=1</code> shifts
				octaves, <code>trans=-2</code> semitones; <code>gate</code> how much of each note sounds, 0.05 to 1 (0.5 is staccato);
				<code>glide</code> seconds a <code>~</code> slide takes (0.07); <code>bright</code> 0.1 dark to 4 bright (1); <code>att</code> and
				<code>rel</code> attack and release in seconds; <code>center=E4</code> where chords are voiced; <code>drive</code> 0 to 4, dirt for
				<code>808</code>, <code>logdrum</code> and <code>drive</code>.
			</p>
			<h3>Patterns and the loop</h3>
			<p>
				<code>pattern A</code> starts a pattern; its music lines follow, <code>name | bar | bar |</code>. A pattern lasts as long as its
				longest voice. <code>pattern A tempo=90 beats=3</code> changes timing for that pattern alone.
			</p>
			<p>
				<code>pattern B from A</code> starts as a copy of A. A voice you write in B replaces A's whole line for that voice;
				<code>lead@3 | … |</code> replaces only bar 3 onwards, as many bars as you write, and keeps the rest.
				<code>mute hat snare</code>
				drops voices.
			</p>
			<p>
				<code>loop A A2 B*2 C+5</code> repeats forever: <code>*2</code> plays a pattern twice, <code>+5</code> or <code>-2</code> transposes
				it. Put <code>play intro</code> before it to play the intro once first; a pattern called <code>intro</code> on the loop line repeats
				with everything else. Games join most songs mid-loop, since a radio doesn't wait for you, so the loop has to stand on its own and
				the intro is a treat for whoever hears the start. With no <code>play</code> or <code>loop</code>, every pattern loops in order.
			</p>
			<h3>Placing it in a game</h3>
			<p>
				<code>game dodgethis</code> in the head says which game a song is for; a song without one is NK GTA's, and NK GTA skips songs for
				other games. In NK GTA, <code>street Sonnenallee</code> in the head makes the song the song of that street: Spätis, bars, windows
				and cars there usually play one of its songs. <code>at doener cafe</code> does the same for kinds of place: <code>spaeti</code>,
				<code>bar</code>, <code>doener</code>, <code>imbiss</code>, <code>cafe</code>, and <code>feld</code> for a wide open field like
				Tempelhof. <code>at autoradio</code> puts the song on your own car radio: it always runs once you sit in a car, and plays its songs
				one after another. Konvoi belongs to the wedding convoy alone and plays nowhere else. <code>at</code> takes any words; kinds the
				game doesn't know yet, like <code>markt</code> for a market, wait harmlessly until it does.
			</p>
			<p>
				Links open on a song, as a game places it: <code>?song=konvoi&amp;kind=convoy&amp;d=20</code>. The address bar always shows what is
				playing.
			</p>
			<h3>Instruments</h3>
			<For each={GROUPS}>
				{([group, list]) => (
					<p>
						{group}:{' '}
						<For each={list}>
							{([inst, sound], i) => (
								<>
									<code title={sound}>{inst}</code>
									{i() < list.length - 1 ? ', ' : '.'}
								</>
							)}
						</For>
					</p>
				)}
			</For>
		</div>
	)
}
