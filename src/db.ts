import { Database } from "bun:sqlite";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const isTest = process.env.HABITS_TEST === "1";
const DATA_DIR = isTest ? "/tmp/habits-test" : join(homedir(), ".habits");
const DB_PATH = isTest ? ":memory:" : join(DATA_DIR, "habits.db");
const REPLICA_PATH = join(DATA_DIR, "replica.db");
const CONFIG_PATH = join(DATA_DIR, "config.json");

export interface Config {
  timezone?: string;
  backend?: "local" | "turso";
  turso?: {
    url: string;
    authToken: string;
  };
}

export function loadConfig(): Config {
  try {
    if (existsSync(CONFIG_PATH)) {
      return JSON.parse(readFileSync(CONFIG_PATH, "utf-8"));
    }
  } catch {
    // Ignore parse errors
  }
  return {};
}

export function saveConfig(config: Config): void {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  if (config.turso?.authToken) {
    chmodSync(CONFIG_PATH, 0o600);
  }
}

let _config: Config | null = null;
export function getConfig(): Config {
  if (_config === null) {
    _config = loadConfig();
  }
  return _config;
}

export function updateConfig(updates: Partial<Config>): Config {
  const config = { ...loadConfig(), ...updates };
  saveConfig(config);
  _config = config;
  return config;
}

if (DB_PATH !== ":memory:" && !existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// --- DbClient abstraction ---

export interface DbClient {
  run(sql: string, ...params: any[]): Promise<void>;
  get<T = any>(sql: string, ...params: any[]): Promise<T | null>;
  all<T = any>(sql: string, ...params: any[]): Promise<T[]>;
  close(): void;
}

class LocalDbClient implements DbClient {
  private db: Database;

  constructor(path: string) {
    this.db = new Database(path);
  }

  async run(sql: string, ...params: any[]): Promise<void> {
    if (params.length === 0) {
      this.db.run(sql);
    } else {
      this.db.prepare(sql).run(...params);
    }
  }

  async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T) ?? null;
  }

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    return this.db.query(sql).all(...params) as T[];
  }

  close(): void {
    this.db.close();
  }
}

class TursoDbClient implements DbClient {
  private client: import("@libsql/client").Client;

  constructor(client: import("@libsql/client").Client) {
    this.client = client;
  }

  async run(sql: string, ...params: any[]): Promise<void> {
    await this.client.execute({ sql, args: params });
  }

  async get<T = any>(sql: string, ...params: any[]): Promise<T | null> {
    const result = await this.client.execute({ sql, args: params });
    if (result.rows.length === 0) return null;
    return rowToObject<T>(result.rows[0]!, result.columns);
  }

  async all<T = any>(sql: string, ...params: any[]): Promise<T[]> {
    const result = await this.client.execute({ sql, args: params });
    return result.rows.map((row) => rowToObject<T>(row, result.columns));
  }

  close(): void {
    this.client.close();
  }
}

function rowToObject<T>(
  row: import("@libsql/client").Row,
  columns: string[],
): T {
  const obj: any = {};
  for (let i = 0; i < columns.length; i++) {
    obj[columns[i]!] = row[i];
  }
  return obj as T;
}

// --- Singleton ---

let _db: DbClient | null = null;

export function getTursoCredentials(): {
  url: string;
  authToken: string;
} | null {
  const envUrl = process.env.TURSO_DATABASE_URL;
  const envToken = process.env.TURSO_AUTH_TOKEN;
  if (envUrl && envToken) {
    return { url: envUrl, authToken: envToken };
  }

  const config = getConfig();
  if (config.turso?.url && config.turso?.authToken) {
    return config.turso;
  }

  return null;
}

export async function getDb(): Promise<DbClient> {
  if (_db) return _db;

  const config = getConfig();
  const backend = isTest ? "local" : config.backend || "local";

  if (backend === "turso") {
    const creds = getTursoCredentials();
    if (!creds) {
      console.error("Turso backend configured but no credentials found.");
      console.error(
        "Run `habits setup` or set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars.",
      );
      process.exit(1);
    }

    const { createClient } = await import("@libsql/client");
    const client = createClient({
      url: `file:${REPLICA_PATH}`,
      syncUrl: creds.url,
      authToken: creds.authToken,
      syncInterval: 60,
    });
    _db = new TursoDbClient(client);
  } else {
    _db = new LocalDbClient(DB_PATH);
  }

  return _db;
}

// For tests that need direct access to reset state
export async function getRawDb(): Promise<Database | null> {
  const config = getConfig();
  const backend = isTest ? "local" : config.backend || "local";
  if (backend === "local" || isTest) {
    const db = await getDb();
    return (db as any).db as Database;
  }
  return null;
}

export async function initDb() {
  const db = await getDb();

  await db.run(`
    CREATE TABLE IF NOT EXISTS habits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      emoji TEXT,
      frequency TEXT DEFAULT 'daily',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS habit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      habit_id INTEGER NOT NULL,
      logged_at TEXT NOT NULL,
      notes TEXT,
      FOREIGN KEY (habit_id) REFERENCES habits(id),
      UNIQUE(habit_id, logged_at)
    )
  `);

  await db.run(`
    CREATE TABLE IF NOT EXISTS journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      content TEXT,
      mood INTEGER,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.run(
    `CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs(logged_at)`,
  );
  await db.run(`CREATE INDEX IF NOT EXISTS idx_journal_date ON journal(date)`);
}

export function getDbPath(): string {
  return DB_PATH;
}

export function getReplicaPath(): string {
  return REPLICA_PATH;
}
