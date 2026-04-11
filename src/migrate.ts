import { Database } from "bun:sqlite";
import { getConfig, getDbPath, getReplicaPath, initDb, type DbClient } from "./db";

interface HabitRow {
  id: number;
  name: string;
  emoji: string | null;
  frequency: string;
  active: number;
  created_at: string;
}

interface HabitLogRow {
  id: number;
  habit_id: number;
  logged_at: string;
  notes: string | null;
}

interface JournalRow {
  id: number;
  date: string;
  content: string | null;
  mood: number | null;
  updated_at: string;
}

async function createTursoClient(): Promise<DbClient> {
  const config = getConfig();
  const envUrl = process.env.TURSO_DATABASE_URL;
  const envToken = process.env.TURSO_AUTH_TOKEN;
  const url = envUrl || config.turso?.url;
  const authToken = envToken || config.turso?.authToken;

  if (!url || !authToken) {
    throw new Error("Turso credentials not found");
  }

  const { createClient } = await import("@libsql/client");
  const client = createClient({
    url: `file:${getReplicaPath()}`,
    syncUrl: url,
    authToken,
    syncInterval: 60,
  });

  const { TursoDbClient } = await getTursoWrapper();
  return new TursoDbClient(client);
}

async function getTursoWrapper() {
  class TursoDbClient implements DbClient {
    constructor(private client: import("@libsql/client").Client) {}

    async run(sql: string, ...params: any[]): Promise<void> {
      await this.client.execute({ sql, args: params });
    }

    async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
      const result = await this.client.execute({ sql, args: params });
      if (result.rows.length === 0) return null;
      const obj: any = {};
      for (let i = 0; i < result.columns.length; i++) {
        obj[result.columns[i]!] = result.rows[0]![i];
      }
      return obj as T;
    }

    async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
      const result = await this.client.execute({ sql, args: params });
      return result.rows.map((row) => {
        const obj: any = {};
        for (let i = 0; i < result.columns.length; i++) {
          obj[result.columns[i]!] = row[i];
        }
        return obj as T;
      });
    }

    close(): void {
      this.client.close();
    }
  }

  return { TursoDbClient };
}

function createLocalClient(): { all: <T>(sql: string) => T[]; run: (sql: string, ...params: any[]) => void; close: () => void } {
  const db = new Database(getDbPath());
  return {
    all: <T>(sql: string) => db.query(sql).all() as T[],
    run: (sql: string, ...params: any[]) => {
      if (params.length === 0) db.run(sql);
      else db.prepare(sql).run(...params);
    },
    close: () => db.close(),
  };
}

async function initSchema(target: DbClient) {
  await target.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT,
      frequency TEXT DEFAULT 'daily',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await target.run(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (habit_id) REFERENCES habits(id),
      UNIQUE(habit_id, logged_at)
    )
  `);
  await target.run(`
    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT,
      mood INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function migrateLocalToTurso() {
  console.log("\n  Migrating local data to Turso...\n");

  const local = createLocalClient();
  const turso = await createTursoClient();

  await initSchema(turso);

  const habits = local.all<HabitRow>("SELECT * FROM habits");
  const logs = local.all<HabitLogRow>("SELECT * FROM habit_logs");
  const entries = local.all<JournalRow>("SELECT * FROM journal");

  console.log(`  Found: ${habits.length} habits, ${logs.length} logs, ${entries.length} journal entries`);

  for (const h of habits) {
    await turso.run(
      "INSERT OR REPLACE INTO habits (id, name, emoji, frequency, active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      h.id, h.name, h.emoji, h.frequency, h.active, h.created_at
    );
  }

  for (const l of logs) {
    await turso.run(
      "INSERT OR REPLACE INTO habit_logs (id, habit_id, logged_at, notes) VALUES (?, ?, ?, ?)",
      l.id, l.habit_id, l.logged_at, l.notes
    );
  }

  for (const e of entries) {
    await turso.run(
      "INSERT OR REPLACE INTO journal (id, date, content, mood, updated_at) VALUES (?, ?, ?, ?, ?)",
      e.id, e.date, e.content, e.mood, e.updated_at
    );
  }

  local.close();
  turso.close();

  console.log("  Migration complete!\n");
}

export async function migrateTursoToLocal() {
  console.log("\n  Migrating Turso data to local...\n");

  const turso = await createTursoClient();
  const local = createLocalClient();

  local.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT,
      frequency TEXT DEFAULT 'daily',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  local.run(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (habit_id) REFERENCES habits(id),
      UNIQUE(habit_id, logged_at)
    )
  `);
  local.run(`
    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT,
      mood INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const habits = await turso.all<HabitRow>("SELECT * FROM habits");
  const logs = await turso.all<HabitLogRow>("SELECT * FROM habit_logs");
  const entries = await turso.all<JournalRow>("SELECT * FROM journal");

  console.log(`  Found: ${habits.length} habits, ${logs.length} logs, ${entries.length} journal entries`);

  for (const h of habits) {
    local.run(
      "INSERT OR REPLACE INTO habits (id, name, emoji, frequency, active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      h.id, h.name, h.emoji, h.frequency, h.active, h.created_at
    );
  }

  for (const l of logs) {
    local.run(
      "INSERT OR REPLACE INTO habit_logs (id, habit_id, logged_at, notes) VALUES (?, ?, ?, ?)",
      l.id, l.habit_id, l.logged_at, l.notes
    );
  }

  for (const e of entries) {
    local.run(
      "INSERT OR REPLACE INTO journal (id, date, content, mood, updated_at) VALUES (?, ?, ?, ?, ?)",
      e.id, e.date, e.content, e.mood, e.updated_at
    );
  }

  turso.close();
  local.close();

  console.log("  Migration complete!\n");
}
