# How we run this build with Claude Code

- Create the new repo, commit `CLAUDE.md` at the root and `docs/SPEC.md` + this file in `docs/`.
- For each prompt: start a fresh Claude Code session in the repo root, on a new branch, and paste the prompt exactly.
- When it finishes: read the diff, run `pnpm typecheck && pnpm lint && pnpm test`, try the thing by hand, then merge the PR.
- If Claude Code stops with a question, answer it, and make sure any decision lands in `docs/SPEC.md`.
