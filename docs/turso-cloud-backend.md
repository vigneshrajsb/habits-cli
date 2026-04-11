# Turso Cloud Backend Integration

## Overview

Add optional cloud-hosted SQLite via Turso as an alternative to the existing local-only SQLite backend. Users choose between local and Turso during an interactive setup wizard. Turso mode uses embedded replicas for offline support and fast reads.

## Design Decisions

- **One database** — the CLI continues to use a single DB; this just changes where it's hosted
- **Embedded replica** — Turso mode keeps a local SQLite copy at `~/.habits/replica.db` that syncs to the cloud. Works offline, fast reads, syncs when online
- **Credential storage** — env vars (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`) take precedence, falls back to `~/.habits/config.json` with `0600` file permissions
- **Data migration** — switching backends offers to copy existing data to the new backend
- **Interactive wizard** — `habits setup` walks users through backend choice and Turso setup with step-by-step guidance

## Config Changes

`~/.habits/config.json` gains new fields:

```json
{
  "timezone": "America/Los_Angeles",
  "backend": "local",
  "turso": {
    "url": "libsql://my-db-username.turso.io",
    "authToken": "eyJ..."
  }
}
```

- `backend`: `"local"` (default) or `"turso"`
- `turso.url` / `turso.authToken`: stored only if user opts into config file storage
- File permissions set to `0600` after writing when turso credentials are present

## New Dependency

```
@libsql/client
```

This is the official Turso SDK. It provides:
- `createClient()` for remote-only connections
- Embedded replica mode (local SQLite file + remote sync)
- API compatible with typical SQLite query patterns

## File Changes

### `src/db.ts` — Database layer refactor

**Current**: directly creates `bun:sqlite` Database instance at module level.

**New**:
- Export a `getDb()` function that returns the active database client
- On first call, reads config to determine backend:
  - `local` → use `bun:sqlite` as today (no changes to behavior)
  - `turso` → use `@libsql/client` with embedded replica config
- Turso client creation:
  ```ts
  import { createClient } from "@libsql/client";

  const client = createClient({
    url: "file:///Users/<user>/.habits/replica.db",
    syncUrl: tursoUrl,
    authToken: tursoToken,
    syncInterval: 60, // sync every 60 seconds
  });
  ```
- Credential resolution order:
  1. `process.env.TURSO_DATABASE_URL` / `process.env.TURSO_AUTH_TOKEN`
  2. `config.turso.url` / `config.turso.authToken`
- After writing config with Turso credentials, set file permissions to `0600`

**Interface abstraction**: Since `bun:sqlite` and `@libsql/client` have different APIs, create a thin wrapper:

```ts
interface DbClient {
  execute(sql: string, params?: any[]): any;
  executeMany(statements: string[]): void;
  close(): void;
}
```

- `LocalDbClient` wraps `bun:sqlite` `Database`
- `TursoDbClient` wraps `@libsql/client` client
- All existing queries in `habits.ts` and `journal.ts` go through this interface

### `src/setup.ts` — New file: interactive setup wizard

The `habits setup` command flow:

1. **Welcome message** — explains what the setup does
2. **Backend choice** — prompt: local or Turso?
3. **If Turso selected**:
   a. Print step-by-step Turso setup instructions:
      - Install Turso CLI: `curl -sSfL https://get.tur.so/install.sh | bash`
      - Sign up: `turso auth signup`
      - Create database: `turso db create habits`
      - Get URL: `turso db show habits --url`
      - Get token: `turso db tokens create habits`
   b. Prompt user to paste their DB URL
   c. Prompt user to paste their auth token
   d. Test connection (attempt to connect and run a simple query)
   e. If test passes, save to config
   f. If existing local data found, offer to migrate
4. **If local selected**:
   - Set `backend: "local"` in config
   - If switching from Turso with existing cloud data, offer to migrate down
5. **Confirmation** — print summary of configuration

Uses Bun's built-in `prompt()` or reads from stdin for interactive input.

### `src/migrate.ts` — New file: data migration

Handles copying data between backends:

- `migrateLocalToTurso()`: reads all rows from local `habits.db`, inserts into Turso
- `migrateTursoToLocal()`: reads all rows from Turso, inserts into local `habits.db`
- Tables to migrate: `habits`, `habit_logs`, `journal`
- Uses transactions for atomicity
- Prints progress: "Migrating X habits, Y logs, Z journal entries..."

### `src/index.ts` — CLI changes

- Add `setup` command that invokes the wizard
- Add `config backend` subcommand to show current backend
- Change `initDb()` call to work with the new `getDb()` abstraction
- Update `db` command to show backend type alongside path:
  ```
  Backend: turso (embedded replica)
  Local replica: ~/.habits/replica.db
  Remote: libsql://my-db-username.turso.io
  ```

### `src/habits.ts` and `src/journal.ts`

- Replace direct `db` import with `getDb()` calls
- Update query calls to use the `DbClient` interface methods instead of `bun:sqlite`-specific APIs

## CLI Commands (new/changed)

| Command | Description |
|---|---|
| `habits setup` | Interactive setup wizard |
| `habits config backend` | Show current backend type |
| `habits db` | Enhanced: shows backend type + paths |

## Turso Setup Instructions (printed by wizard)

```
To use Turso cloud backend, you'll need a Turso account and database.

1. Install the Turso CLI:
   curl -sSfL https://get.tur.so/install.sh | bash

2. Sign up (or log in):
   turso auth signup

3. Create a database:
   turso db create habits

4. Get your database URL:
   turso db show habits --url
   (looks like: libsql://habits-username.turso.io)

5. Create an auth token:
   turso db tokens create habits

Paste these values below, or set them as environment variables:
   export TURSO_DATABASE_URL="libsql://..."
   export TURSO_AUTH_TOKEN="eyJ..."
```

## Error Handling

- **No internet + Turso remote-only**: N/A — we use embedded replicas, so reads always work locally
- **Sync failures**: log a warning but don't fail the command. Data is safe in the local replica
- **Invalid credentials during setup**: test connection before saving, prompt to retry
- **Missing credentials at runtime**: clear error message pointing to `habits setup` or env vars

## Testing Strategy

- Existing tests continue to work (they use `HABITS_TEST=1` which stays on local/in-memory)
- New tests for:
  - `DbClient` interface with both implementations
  - Config credential resolution (env var precedence)
  - Migration logic (mock both clients)
  - Setup wizard flow (mock stdin)

## Implementation Progress

- [x] Refactor `db.ts` — `DbClient` interface + `getDb()` factory
- [x] Update `habits.ts` to use `DbClient` interface
- [x] Update `journal.ts` to use `DbClient` interface
- [x] Create `setup.ts` — interactive wizard
- [x] Create `migrate.ts` — data migration
- [x] Update `index.ts` — new commands + updated `db` output
- [x] Add `@libsql/client` dependency
- [x] File permission handling for config with credentials
- [x] Tests (25/25 passing)
- [x] Update AGENTS.md and CLAUDE.md with new commands
