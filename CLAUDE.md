# PRISM — project instructions

## Multi-session coordination (READ FIRST)

Multiple Claude Code sessions work on PRISM concurrently (the "PRISM 2" sidebar group). They do **not** see each other's conversations — the shared board is the only channel between them.

- **On start:** read `C:\Users\eugen\prism\docs\WORKSTREAMS.md` (absolute path — sessions run from different folders, including git worktrees) to learn the current state of every stream.
- **When your status changes** (start/pause/block/finish a chunk, or a cross-stream dependency changes): update *your own* row in that file — status emoji, `Last update` date, and one line on what changed. Edit only your own stream's section.
- **Before a large refactor** on the main working tree, check the board for other active sessions touching the same files (uncommitted changes can clobber each other); prefer a git worktree for parallel edits.

See the board's own Protocol section for full details.
