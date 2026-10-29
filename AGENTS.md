# Agents

See README.md for what the jukebox is and where the code lives.

- Oskar values speed over certainty: verify once and stop.
- `bun run check` lints and checks formatting; `bun run format` fixes it. `bun test` checks every song.
- jj and git both work here (jj is colocated); bb worktrees are plain git. Commit messages say what changed for whoever plays or composes, not how.
- Writing a song: see `.claude/skills/compose-song/SKILL.md`.

## Landing on main

1. `git fetch && git rebase origin/main`.
2. `bun test` and `bun run check` pass; `bun run format` fixes formatting.
3. `git push origin HEAD:main`. No PR unless asked.
4. Stop any dev server you started.
