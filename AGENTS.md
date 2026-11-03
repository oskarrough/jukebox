# Agents

See README.md for what the jukebox is and where the code lives.

- Oskar values speed over certainty: verify once and stop.
- `bun run check` lints and checks formatting; `bun run format` fixes it. `bun test` checks every song.
- jj and git both work here (jj is colocated); bb worktrees are plain git. Commit messages say what changed for whoever plays or composes, not how.
- The page is Solid 2, not React and not Solid 1: read `node_modules/solid-js/CHEATSHEET.md` before changing `src/App.jsx` or `src/ui/`. In dev, the browser console names any reactivity mistake; fix it, don't silence it.
- A song's file name is the slug of its title (`src/ui/slug.js`), checked by `bun run check`. Renaming one means adding the old name to `src/aliases.js` so old links keep working; games that load `music/<name>.song` by name need the new name too.
- `src/songs.js` uses Vite's `import.meta.glob`, so scripts and tests run by bun can't import it; keep shared pieces in their own file.
- Writing a song: see `.agents/skills/compose-song/SKILL.md`.

## Landing on main

1. `git fetch && git rebase origin/main`.
2. `bun test` and `bun run check` pass; `bun run format` fixes formatting.
3. `git push origin HEAD:main`. No PR unless asked.
4. Stop any dev server you started.
