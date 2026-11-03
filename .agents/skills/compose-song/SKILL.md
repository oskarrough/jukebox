---
name: compose-song
description: Write or compose a song for the jukebox, NK GTA (nkgta) or Dodgethis, as a plain-text .song file in music/ played by the jukebox's Web Audio synth. Use for "write a song for the jukebox", "compose a track for nkgta", "a song for Sonnenallee", or reworking an existing .song.
---

# Compose a song

Songs live in `music/<name>.song`, one per file; the page and `bun test` find new ones on their own. Everything the format can say is in [reference.md](reference.md); every instrument, with a line on how it sounds, is in `src/instruments.js`. Then read one or two of the examples below, nearest your style first: they show how much goes in a bar.

```
title    Weserstraße bei Nacht
about    One line: what it is, where it plays, what music it's after.
key      Am
tempo    96
street   Weserstraße
at       bar
tags     nkgta

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

Use the real instrument. If your style needs one that isn't there, say so rather than faking it with square waves.

## Examples by style

| Style                              | Read                                          |
| ---------------------------------- | --------------------------------------------- |
| Techno, dub, anything kick and sub | `hermannstrasse-um-drei`, `wriezener-bahnhof` |
| Trap, phonk                        | `tempo-30`                                    |
| Amapiano                           | `schiller-amapiano`                           |
| Cumbia, reggaeton                  | `doble-fila`                                  |
| Boom bap                           | `same-hand`                                   |
| Maqam: Turkish, Arabic             | `maybachufer`, `karl-marx-strasse`            |
| Jazz-funk, samba                   | `overthrow`, `flagfall`, `dodgethis-theme`    |
| Arcade pop                         | `close-shave`                                 |
| Orchestral                         | `tempelhofer-feld`, `luftbruecke`             |
| Folk, acoustic                     | `altamesa`, `buschkrugallee`                  |
| Rock                               | `grenzallee`, `a100`                          |

Some older songs came before the advice below: `a100`, `buschkrugallee`, `grenzallee`, `karl-marx-strasse`, `richardstr` and `weichselplatz` have no intro; `hasenheide`, `hermannplatz`, `konvoi`, `ringbahn`, `sonnenallee`, `sonnenallee-bei-nacht` and `weserstrasse` loop in about 30 seconds. Learn their bars, not their shape.

## What makes a good game loop

- The hook in the first bar or two: a player walks past a radio in seconds.
- Games join songs mid-loop, since radios don't wait for you, so the loop has to stand alone. The intro is a treat for whoever hears the start.
- It has to survive a hundred repeats: vary it with `from` patterns (a fill, a break, a voice dropping out), and no big ending at the seam back to the top.
- One to two minutes of loop: bars × beats × 60 / tempo seconds.
- Heard through distance and walls, a clear bass and a clear tune beat a dense middle.

## Balance

Read the energy shares and solo RMS from `bun run render <name> --voices`.

- With a kick and a sub (techno, trap, amapiano, reggaeton), bass and kick take the biggest shares. In Hermannstraße um drei the bass is about half and the kick a fifth. That's the style; leave it.
- The tune still has to carry through a wall. A starting point: the hook voice 4 to 6 dB under the bass in solo RMS. Earlier composers settled on that without ears, so treat it as a guess.
- The finished mixes here sit around −14 to −18 dBFS RMS with no clipping. A song far off that jumps out of the radio next to the others.

## Placing it in NK GTA

- No `game` line means NK GTA. `tags nkgta`: every song has a tag, to find it by in the list.
- `street Sonnenallee`: Spätis, bars, windows and cars on that street usually play it.
- `at spaeti bar doener imbiss cafe feld autoradio`: kinds of place. `autoradio` is your own car radio, `feld` an open field like Tempelhof. Words the game doesn't know yet, like `markt`, wait harmlessly.

## A song for Dodgethis

- `game dodgethis` and `tags dodgethis`.
- The game plays one song per scene and starts it from the top, so its intro is heard: `dodgethis-theme` on the splash and in the lobby, and each map's own song during a match. A new song only plays once Dodgethis names it, so say in `about` which scene or map it's for.
- It plays quietly under the sound effects, and fights duck it: in a match, sound is information. Keep the tune and groove clear and leave hits, casts and rising swooshes to the game.
- The sound, from Dodgethis's `docs/sound.md`: warm and analog with toy sparkle, after Azymuth and Yellow Magic Orchestra (Rhodes, fretless, moog, real-feeling drums, chip arpeggios, vibes). Anticipation, not tension. Never cheap-cute. Lobby about 112 BPM, match about 120, clutch about 138.
- The four in the game have an intro of 7 to 17 seconds and a loop of 70 to 85 from four to six patterns (`loop A A2 B A2 C`); the map songs bring the main theme back in their break.
- Clutch, victory and defeat have no songs yet; the game still plays its old built-in tunes there. Victory and defeat want stings under 10 seconds; nothing more is decided.

## Check it

- `bun test`: every song compiles without errors and loops; a failure names its song file.
- `bun run render <name>`: render the intro and one loop to `music/renders/<name>.wav` (gitignored), and read the levels as they arrive. Use `--seconds 20` for a short check; it repeats the loop as needed. Add `--from drop` to start at the first played `drop`, without earlier notes or reverb tails; it continues in play order, and combines with `--seconds`. Add `--voices` for the slower per-voice solo measurements; otherwise only the mix is rendered. Node 22+ is required; no audio device is needed.
- Check the overall peak/RMS and clipping, each pattern's RMS in play order, intro vs loop RMS, and the loudness strip (one character per bar). With `--voices`, also check each voice's peak/RMS and energy share. Voice measurements are solo, roughly K-weighted and before shared compression; overall measurements are the finished mix. Shares estimate balance, not exact contributions to the compressed mix. Lower `vol=` for a voice that dominates or clips; render again. A short check labels partial patterns and may not reach the loop or may cover only part of it; `--from` skips the intro comparison when starting later. Use the default render for the full comparison.
- `bun run dev`, then `http://localhost:5173/?song=<name>`: errors show under the score, their line numbers in red. Add `&kind=radio&d=10` to hear it the way a game places it. Stop the dev server when you're done.
- Watch the piano roll: it shows the shape of the hook, voices crowding one register, a bar left empty by mistake.

## You can't hear it

Render it and use the numbers to check levels between voices. Describe the song from the score and measurements, honestly: which instruments, rhythms and harmony are there, not that it "slaps" or "sits well in the mix". RMS isn't a listening judgment: tone, masking and musical feel still need ears.

To look at it in the page, use `agent-browser --session <your-name>`: the default session is shared with other agents. The page waits for a click on Play before it makes a sound.

The commit message is the song's title and one line of what it is, as in `git log`. Landing is in AGENTS.md.
