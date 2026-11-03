# The song format

Everything a `.song` file can say. The page's Guide says the same for people; change both together. Instruments, with a line on how each sounds, are in `src/instruments.js`.

A song is a head, some voices, some patterns and a `loop` line. Anything after `#` is a comment.

## Head

One setting a line, before the first pattern.

- `title`: the song's name; the file name is its slug (`Hermannstraße um drei` → `hermannstrasse-um-drei.song`).
- `about`: one line on what it is, where it plays, what music it's after.
- `composer` (or `by`).
- `key G`, `key Dm`: the key. The page's key switch transposes from it, and loop bricks land in it.
- `tempo 120`: beats a minute, 20 to 400.
- `beats 4`: beats to a bar, 1 to 16. `steps 4`: steps to a beat, 1 to 12. A bar is beats × steps steps (16 by default; `beats 3` `steps 2` is 6).
- `swing 0.1`: 0 to 0.75, delays every other step. Only with an even `steps`.
- `reverb 0.3`: how loud the shared room is, 0 to 1.
- `tags nkgta wip`: any words, to find the song by in the list.
- `game dodgethis`: which game it's for; none means NK GTA.
- `street Sonnenallee`, `at bar cafe`: where it plays in NK GTA (see the skill).

## Voices

`voice <name> <instrument> <options>`, for example `voice lead flute vol=0.6 pan=-0.3`.

| Option   | Range, default   | What it does                                                                            |
| -------- | ---------------- | --------------------------------------------------------------------------------------- |
| `vol`    | 0 to 2, 0.8      | volume                                                                                  |
| `pan`    | -1 to 1, 0       | left to right                                                                           |
| `rev`    | 0 to 1           | send to the shared room; each instrument has its own default (808 0.04, pipe 0.55)      |
| `oct`    | -4 to 4          | shifts octaves                                                                          |
| `trans`  | -48 to 48        | shifts semitones                                                                        |
| `gate`   | 0.05 to 1, 1     | how much of each note sounds; 0.5 is staccato                                           |
| `glide`  | 0.005 to 2, 0.07 | seconds a `~` slide takes                                                               |
| `bright` | 0.1 to 4, 1      | dark to bright                                                                          |
| `att`    | 0.001 to 4       | attack in seconds; each instrument has its own default                                  |
| `rel`    | 0.005 to 6       | release in seconds; each instrument has its own default                                 |
| `center` | a note, D4       | where chords are voiced; D2 on the low instruments (808, basses, tuba …)                |
| `drive`  | 0 to 4, 0        | dirt, only on `808`, `logdrum` and `drive`                                              |
| `echo`   | 0 to 16, 0       | repeats the sound every so many steps, in time with the song                            |
| `tail`   | 0 to 0.9, 0.5    | how much of each echo comes back; repeats get darker and bounce left and right          |
| `pump`   | 0 to 1, 0        | ducks the voice on every hit of a `kick` voice and swells back over a beat; 1 is silent |
| `part`   | a word, `chord`  | what x steps play of the chord row: `chord`, `root`, `rootless`, `top` or `up`          |

Drum instruments (the Drums group) take drum lanes; every other instrument takes notes.

## Notes

- Each word is one step. `A4` is one step; each dash holds it one more (`A4-` two, `A4---` four). Each dot is a step of rest (`....` four). Bars are split by `|`, and every bar adds up to exactly beats × steps.
- `[Am7]`, `[C/E]`, `[D5]` are chords; `C4+E4+G4` stacks notes yourself.
- `~D4` slides into D4 from the voice's last note. `D4!` is louder, `D4?` softer; marks stack.
- `Eq4` is a quarter tone flat (the E of maqam Rast and Bayati); `~` slides into quarter tones too.
- Alone in a bar: `%` repeats the bar before, `_` is silence, `=` holds the last note through.
- Two lines for the same voice in one pattern run on: the second's bars follow the first's.

## The chord row

`chords | Dm9 | % | Gm9 | Bbmaj9 C6/9 |` in a pattern gives the chords, a bar at a time; voices play them in their own rhythm. Chords in a bar share it evenly; `-` holds the one before a share longer (`Am - - G` is Am for three beats), `.` is a share with no chord. `%` and `_` work as in notes. The last chord rings on to the pattern's end. A `from` pattern inherits the row, `chords@3 | … |` patches it, and `+5` on the loop line and the key switch move it.

A voice that takes notes follows the row when a bar is written in steps, like a drum lane: `pad | x--------------- |`, `bass | x... ..x. x... .... |`. `-` holds; a held chord is struck again where the row changes. `part=` says what it plays: `chord` (the default) the whole chord, `rootless` without its root (when a bass has it), `root` the root (or the note after `/`), `top` the top note, `up` the next note up on each hit. Chords move to the nearest voicing around `center=`. Note bars and step bars mix freely, even on one line.

Chord kinds: none (major), `m`, `5`, `6`, `m6`, `7`, `m7`, `maj7`, `mmaj7`, `9`, `m9`, `maj9`, `add9`, `madd9`, `6/9`, `m6/9`, `11`, `m11`, `13`, `m13`, `maj13`, `sus2`, `sus4`, `7sus4`, `9sus4`, `dim`, `dim7`, `m7b5`, `aug`, `7b9`, `7#9`, `maj7#11`, and `/E` after any of them for another bass note. Their 9ths, 11ths and 13ths sit above the octave, as a pianist plays them.

## Drum lanes

One character a step: `x` a hit, `X` an accent, `o` a soft hit, `.` a rest. Spaces don't count: `x... x... x... x...` is four on the floor. Some drums play the accent differently: congas and bongos slap on `X`, the cuíca sings high on `X` and low on `o`.

## Patterns and the loop

- `pattern A` starts a pattern; its lines follow as `name | bar | bar |`. It lasts as long as its longest voice. `pattern A tempo=90 beats=3` changes timing for that pattern alone; `tempo`, `beats`, `steps` and `swing` also work as lines inside it.
- `pattern B from A` starts as a copy of A. A voice line in B replaces A's whole line; `lead@3 | … |` replaces bar 3 onwards, as many bars as you write, and keeps the rest. `mute hat snare` drops voices.
- `play intro` plays once. `loop A A2 B*2 C+5` repeats forever: `*2` twice, `+5` or `-2` transposes. With no `play` or `loop`, every pattern loops in order.

## Effects

- One shared room reverb. `reverb` in the head sets how loud it is; each voice's `rev=` sets how much it sends.
- Per voice: `bright=` darkens or opens the tone, `drive=` dirties `808`, `logdrum` and `drive`, `att=` and `rel=` shape each note, `gate=` shortens it.
- The whole mix then runs through a gentle bass lift, a slight top cut, a compressor and a limiter. Nothing to set.
- `echo=3` on a voice repeats it every 3 steps, in time with the song; `tail=` sets how much of each repeat comes back. `music/hermannstrasse-um-drei.song` uses it on its stab.
- `pump=0.6` on pads, chords or bass makes the mix breathe with the kick, as in house; the song needs a voice that plays `kick`. `0.3` is a nudge, `0.6` is house, `1` cuts the voice on every hit.
