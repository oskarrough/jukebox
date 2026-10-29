---
name: compose-song
description: Write or compose a song for the jukebox, NK GTA (nkgta) or Dodgethis, as a plain-text .song file in music/ played by the jukebox's Web Audio synth. Use for "write a song for the jukebox", "compose a track for nkgta", "a song for Sonnenallee", or reworking an existing .song.
---

# Compose a song

Songs live in `music/<name>.song`, one per file; the page and `bun test` find new ones on their own. Read two or three existing songs near your genre first: they are the best reference for how much goes in a bar.

## The format

```
title    Weserstraße bei Nacht
about    One line: what it is, where it plays, what music it's after.
key      Am
tempo    96
street   Weserstraße
at       bar

voice lead  rhodes vol=0.5 pan=-0.2
voice bass  808    vol=0.9 drive=0.5
voice kick  kick
voice hat   hat    vol=0.4

pattern A
lead | A4- C5- E5--- .... D5- C5- | [Am7]--------------- |
bass | A1------- .. A1- ~E2--- | F1------- .. F1- ~G1--- |
kick | X... .... X.x. .... | % |
hat  | x.x. x.x. x.x. x.x. | % |

# B is A with a new second bar for the lead
pattern B from A
lead@2 | E5--- D5--- C5------- |

pattern intro from A
mute bass kick

play intro
loop A B A B*2
```

- Each word is one step; dashes hold a note (`D4-` is 2 steps, `D4---` 4), dots rest. Every bar must add up to beats × steps (16 by default). Drum lanes are one character a step: `x` hit, `X` accent, `o` soft, `.` rest.
- Alone in a bar: `%` repeats the last bar, `_` is silence, `=` holds the last note through. `[Am7]` and `C4+E4+G4` are chords, `~D4` slides from the previous note, `D4!` and `D4?` are louder and softer, `Eq4` is a quarter tone flat.
- `pattern B from A` copies A. A voice line in B replaces A's line; `lead@3 | … |` replaces bar 3 on and keeps the rest; `mute` drops voices.
- `play intro` plays once, `loop A B*2 C+5` repeats forever (`*2` twice, `+5` up five semitones).

Every instrument and voice option (`vol pan rev oct trans gate glide bright att rel center drive`) is in the page's Guide, `index.html`; `src/synth.js` comments how each instrument sounds. Use the real instrument: if your genre needs one that's missing, add it to `src/synth.js` and `src/score.js` rather than faking it with square waves.

## Placing it in a game

- No `game` line means NK GTA; `game dodgethis` is for Dodgethis.
- `street Sonnenallee`: Spätis, bars, windows and cars on that street usually play it.
- `at spaeti bar doener imbiss cafe feld autoradio`: kinds of place. `autoradio` is your own car radio, `feld` an open field like Tempelhof. Words the game doesn't know yet, like `markt`, wait harmlessly.

## What makes a good game loop

- The hook in the first bar or two: a player walks past a radio in seconds.
- Games join songs mid-loop, since radios don't wait for you, so the loop has to stand alone. The intro is a treat for whoever hears the start.
- It has to survive a hundred repeats: vary it with `from` patterns (a fill, a break, a voice dropping out), and no big ending at the seam back to the top.
- One to two minutes of loop: bars × beats × 60 / tempo seconds.
- Heard through distance and walls, a clear bass and a clear tune beat a dense middle.

## Check it

- `bun test`: every song compiles without errors and loops.
- `bun run render <name>`: render the intro and one loop to `music/renders/<name>.wav` (gitignored), and read the levels. Use `--seconds 20` for a short check; it repeats the loop as needed. Node 22+ is required; no audio device is needed.
- Check the overall peak/RMS and clipping, each voice's peak/RMS and energy share, intro vs loop RMS, and the loudness strip (one character per bar). Voice measurements are solo, roughly K-weighted and before shared compression; overall measurements are the finished mix. Shares estimate balance, not exact contributions to the compressed mix. Lower `vol=` for a voice that dominates or clips; render again. A short check may not reach the loop or may cover only part of it; use the default render for the full comparison.
- `bun run dev`, then `http://localhost:5173/?song=<name>`: the score panel says "Playable." or lists errors by line. Add `&kind=radio&d=10` to hear it as a game places it. Stop the dev server when you're done.
- Watch the piano roll: it shows the shape of the hook, voices crowding one register, a bar left empty by mistake.

## You can't hear it

Render it and use the numbers to check levels between voices. Describe the song from the score and measurements, honestly: which instruments, rhythms and harmony are there, not that it "slaps" or "sits well in the mix". RMS isn't a listening judgment: tone, masking and musical feel still need ears. The commit message is the song's title and one line of what it is, as in `git log`. Land it the way AGENTS.md says.
