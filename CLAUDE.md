# CLAUDE.md

Habit tracking and journaling CLI with SQLite backend.

## ⚠️ Data Safety

**Backup before destructive operations:**
```bash
cp ~/.habits/habits.db ~/.habits/habits.db.bak
```

## Release Process

Use conventional commit prefixes (`feat:`, `fix:`, `chore:`, `docs:`) — these are parsed to auto-generate release notes.

```bash
# One-command release (bumps, commits, pushes tag)
bun run release:patch   # bug fixes
bun run release:minor   # new features
bun run release:major   # breaking changes

# GitHub Actions will: publish to npm + create GitHub Release with changelog

# UPDATE GLOBAL INSTALL (don't forget!)
npm install -g @vigneshrajsb/habits-cli@latest
```

> ⚠️ Global install update is critical! Dashboard uses the global `habits` command.

## For Agents

Read **AGENTS.md** for complete usage.

## Quick Commands

```bash
habits today              # show today's status
habits done 1,3           # log habits by number
habits mood 4             # set mood (1-5)
habits journal write "x"  # add journal entry
habits streak             # visual streak (7 days)
habits history            # monthly view
habits setup              # configure storage backend
habits config             # show config
habits db                 # show database info
```

## Key Points

- Use `--json` for programmatic access
- Data lives in `~/.habits/habits.db` (local) or Turso cloud with local replica
- Supports local SQLite and Turso cloud backends (run `habits setup` to configure)
- You orchestrate; the CLI manages data
