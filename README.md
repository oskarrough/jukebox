# Jukebox

Oskar's jukebox: the place to compose music for his games. Songs are plain-text `.song` files in `music/`, played live by a small Web Audio synth (no samples). The page lists every song, plays it, and lets you edit it while it plays: it replays as you type, shows what doesn't parse, draws a scrolling piano roll, and lets you switch voices off and on. Loop bricks (after Dance eJay) drop a bar of drums, bass, chords or melody into the song as a new voice: drag one in or tap it. You can also hear a song the way a game would place it: as a Späti radio, a bar door, an open window, a passing car, a wedding convoy or your own car radio, at any distance.

It started as the jukebox in [NK GTA](https://github.com/oskarrough/nkgta), with its history carried over.

## Run it

```sh
bun install
bun run dev      # the jukebox at http://localhost:5173
bun run build    # lint + format check, then a static build in dist/
bun test         # every song compiles and loops, plus the format and playback rules
```

Links play straight away: `/?song=konvoi&kind=convoy&d=20&car=1`. The address bar always links to what's playing.

## Writing songs

The format is Simon Willison's [Scrimshaw](https://tools.simonwillison.net/scrimshaw-jukebox), with some additions: quarter tones (`Eq4`), an oud, qanun, ney, 808, overdriven guitar (`drive`), electric bass (`ebass`), darbuka drums (`dum`, `tek`, `riq`), a Rhodes (`rhodes`), a Minimoog-style lead (`moog`), a cuíca (`cuica`), a saz (`saz`), a wah guitar (`wah`), an amapiano log drum (`logdrum`), the 808 cowbell as notes (`cowbell808`) and a vocal chop (`chop`). `drive=` dirties an 808, a log drum or a guitar, and `lead@3 | … |` in a `from` pattern patches one bar. The page's "Guide" lists every instrument and option. A `key G` or `key Dm` line in the head sets the song's key; the key switch transposes what you wrote, and loop bricks land in that key.

To add a song, click "New", write it, click "Export" (downloads the current song as a `.song` file, the same format `music/` and `bun test` already use), and put it in `music/`. It shows up on its own, and `bun test` checks it compiles and loops.

A song's head can also say which game it's for, `game dodgethis` (no `game` means NK GTA), and where it belongs in that game: `street Sonnenallee`, `at doener cafe`, `at feld`, `at autoradio`. The jukebox only parses these; it's up to the game what they mean.

## Code

- `src/score.js`: parses a `.song` text into a song: voices, a timeline of notes for the intro and the loop, and any errors. `compile(text)`.
- `src/synth.js`: the Web Audio synth that plays them. `createSynth(context, destination)`.
- `src/player.js`: plays a compiled song as a source of some kind at some distance, picked up wherever it has got to: `begin`, `feed`, `tune`, `shape`, `end`, `synthFor`.
- `src/effects.js`: the Ableton-style device chain (Source, Distance, Inferno). `runChain(state)` is what `shape()` uses; add a device by appending to `EFFECTS`.
- `src/key.js`: song key, transposing a score, and writing a new song or brick in that key.
- `src/roll.js`: the scrolling piano roll.
- `src/bricks.js`: the loop bricks, and `addBrick(text, brick)`, which adds one to a song's text in the song's key.
- `src/songs.js`: every song in `music/` as text, via Vite's `import.meta.glob`.
- `src/page.js`, `src/page.css` and `index.html`: the jukebox page. Plain HTML, CSS and JS: Teenage Engineering meets Ableton meets Dance eJay, a light machine with a black screen, a session grid of clips, track buttons and loop bricks.

No runtime dependencies; Vite, oxlint and oxfmt are dev tools.

## Using it in a game

Add the repo as a git dependency (it's private, so the machine installing it needs GitHub access):

```sh
bun add github:oskarrough/jukebox
```

Then, in a Vite game:

```js
import { compile } from 'jukebox/score'
import { AHEAD, begin, feed, shape, synthFor, tune } from 'jukebox/player'
import { SONGS } from 'jukebox/songs' // { konvoi: '…song text…', … }, bundled by Vite

const context = new AudioContext()
const synth = synthFor(context, context.destination)
const song = compile(SONGS.konvoi)
const p = begin(synth, context, { kind: 'radio', since: 0 }, song)

function frame() {
	const now = context.currentTime
	tune(p, shape('radio', distanceInTiles), pan, now)
	feed(p, now + AHEAD, now) // schedule the next notes; call every frame
	requestAnimationFrame(frame)
}
```

`jukebox/songs` needs Vite (it uses `import.meta.glob`). Without Vite, fetch or read the files from `jukebox/music/*.song` and `compile` the text yourself. Distances are in the game's tiles; `HEAR` and `KINDS` in `src/player.js` say how far each kind of source carries and how it sounds.

## How nkgta could switch to this repo

nkgta still has its own copy, untouched: `src/jukebox/` (score, synth, roll, page), `src/music.js`, `jukebox.html`, `public/music/*.song` and `tests/music.test.js`. To switch:

1. `bun add github:oskarrough/jukebox` in nkgta.
2. In `src/music.js`, import `compile` from `jukebox/score` and `cueAt`, `join`, `feed`, `synthFor`, `shape`, `begin`, `tune`, `end`, `HEAR`, `KINDS` from `jukebox/player` instead of defining them, keeping the game-only parts there: placing sources on the map, `pickScore`, the open field, the car radio station, the convoy.
3. Load songs with `SONGS` from `jukebox/songs` instead of fetching `/music/*.song`, and drop `public/music/` and the hardcoded `SCORES` list (it becomes `Object.keys(SONGS)`; the wedding convoy's song is still `konvoi`).
4. Replace `jukebox.html` and `src/jukebox/` with a link to wherever this jukebox is hosted, or keep a thin `jukebox.html` that loads `jukebox`'s page code.
5. Move the score and playback tests out of `tests/music.test.js` (they live here now in `tests/jukebox.test.js`) and keep the game ones.

Then composing happens here, and nkgta picks up new songs with `bun update jukebox`.

## Licence and credits

- The score format, synth and piano roll started from Simon Willison's [Scrimshaw Jukebox](https://tools.simonwillison.net/scrimshaw-jukebox), under the Apache License 2.0. `LICENSE` is that licence, and it covers this repo; the changes since are Oskar's.
- Most songs in `music/` were written for NK GTA; `dodgethis-theme`, `altamesa`, `overthrow` and `flagfall` are for Dodgethis. Some say in their `about` line which music they're after. There are no audio samples here: every sound is synthesised.
- NK GTA's sound effects (`public/sfx/`) did not come over; their source isn't recorded.
