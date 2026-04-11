# CLAUDE.md

Habit tracking and journaling CLI with SQLite backend.

## ⚠️ Data Safety

**Backup before destructive operations:**
```bash
cp ~/.habits/habits.db ~/.habits/habits.db.bak
```

## Release Process

When releasing a new version:

```bash
# 1. Bump version (creates commit + tag)
npm version patch|minor|major -m "Release %s - description"

# 2. Push (GitHub Actions publishes to npm)
git push && git push --tags

# 3. UPDATE GLOBAL INSTALL (don't forget!)
npm install -g @vigneshrajsb/habits-cli@latest

# 4. Verify
npm list -g @vigneshrajsb/habits-cli
```

> ⚠️ Step 3 is critical! Dashboard uses the global `habits` command.

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
