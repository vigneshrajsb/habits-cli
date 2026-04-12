# habits-cli 🦊

A simple CLI for tracking habits and journaling, built with Bun and SQLite.

## Install

```bash
npm install -g @vigneshrajsb/habits-cli
# or
pnpm add -g @vigneshrajsb/habits-cli
# or
bun add -g @vigneshrajsb/habits-cli

# one-shot (no install)
bunx @vigneshrajsb/habits-cli --help
npx @vigneshrajsb/habits-cli --help
```

**Requires:** [Bun](https://bun.sh) runtime (`curl -fsSL https://bun.sh/install | bash`)

## Usage

### Daily Overview

```bash
habits today              # today's habits, mood, journal
habits week               # last 7 days
habits history            # current month
habits history 0226       # Feb 2026 (mmyy format)
```

### Habits

```bash
habits add "Workout" --emoji 💪
habits list
habits log workout        # by name
habits log 1              # by number
habits done 1,2,4         # multiple at once
habits unlog 1            # remove log

# Streaks (visual!)
habits streak             # all habits, 7 days
habits streak 14          # all habits, 14 days  
habits streak gym         # single habit, 7 days
habits streak gym 30      # single habit, 30 days

habits deactivate workout
habits activate workout
```

### Journal

```bash
habits journal write "Had a great day"
habits journal read
habits journal read --last 7
habits journal search "interview"
```

### Mood

```bash
habits mood 4             # 1=😞 2=😕 3=😐 4=🙂 5=😄
habits mood history       # last 7 days
habits mood history 30    # last 30 days
```

### Options

```bash
--date YYYY-MM-DD         # specify date (validated: must be real calendar date)
--json                    # JSON output
```

## Data Storage

Data stored in `~/.habits/habits.db` (SQLite). The data directory is created with `0o700` and config file with `0o600` permissions (owner-only access).

```bash
habits db                 # show path
```

## AI Agent Integration

See **AGENTS.md** for detailed agent usage.

## Development

### Release Process

1. **Bump version & tag:**
   ```bash
   npm version patch|minor|major -m "Release %s - description"
   ```

2. **Push to GitHub (triggers npm publish):**
   ```bash
   git push && git push --tags
   ```

3. **Update global install on this machine:**
   ```bash
   npm install -g @vigneshrajsb/habits-cli@latest
   ```

4. **Verify:**
   ```bash
   npm list -g @vigneshrajsb/habits-cli
   ```

> ⚠️ **Don't forget step 3!** The dashboard uses the global `habits` command.

## License

MIT
