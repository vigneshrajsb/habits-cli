import { getDb, getConfig } from "./db";

export interface Habit {
  id: number;
  name: string;
  emoji: string | null;
  frequency: string;
  active: number;
  created_at: string;
}

export interface HabitLog {
  id: number;
  habit_id: number;
  logged_at: string;
  notes: string | null;
}

function today(): string {
  const config = getConfig();
  const now = new Date();

  if (config.timezone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function addHabit(name: string, emoji?: string, frequency: string = "daily"): Promise<Habit> {
  const db = await getDb();
  return (await db.get<Habit>(
    "INSERT INTO habits (name, emoji, frequency) VALUES (?, ?, ?) RETURNING *",
    name, emoji || null, frequency
  ))!;
}

export async function listHabits(includeInactive: boolean = false): Promise<Habit[]> {
  const db = await getDb();
  const query = includeInactive
    ? "SELECT * FROM habits ORDER BY created_at"
    : "SELECT * FROM habits WHERE active = 1 ORDER BY created_at";
  return db.all<Habit>(query);
}

export async function getHabit(nameOrId: string | number): Promise<Habit | null> {
  const db = await getDb();
  return db.get<Habit>(
    "SELECT * FROM habits WHERE id = ? OR LOWER(name) = LOWER(?)",
    nameOrId, nameOrId
  );
}

export async function logHabit(nameOrId: string | number, date?: string, notes?: string): Promise<boolean> {
  const habit = await getHabit(nameOrId);
  if (!habit) return false;

  const db = await getDb();
  const logDate = date || today();
  await db.run(
    "INSERT OR REPLACE INTO habit_logs (habit_id, logged_at, notes) VALUES (?, ?, ?)",
    habit.id, logDate, notes || null
  );
  return true;
}

export async function unlogHabit(nameOrId: string | number, date?: string): Promise<boolean> {
  const habit = await getHabit(nameOrId);
  if (!habit) return false;

  const db = await getDb();
  const logDate = date || today();
  await db.run("DELETE FROM habit_logs WHERE habit_id = ? AND logged_at = ?", habit.id, logDate);
  return true;
}

export async function getLogsForDate(date?: string): Promise<{ habit: Habit; logged: boolean; notes: string | null }[]> {
  const db = await getDb();
  const targetDate = date || today();
  const habits = await listHabits();

  const results: { habit: Habit; logged: boolean; notes: string | null }[] = [];
  for (const habit of habits) {
    const log = await db.get<HabitLog>(
      "SELECT * FROM habit_logs WHERE habit_id = ? AND logged_at = ?",
      habit.id, targetDate
    );
    results.push({
      habit,
      logged: !!log,
      notes: log?.notes || null,
    });
  }
  return results;
}

export async function logMultiple(indices: number[], date?: string): Promise<{ logged: string[]; failed: string[] }> {
  const habits = await listHabits();
  const logged: string[] = [];
  const failed: string[] = [];

  for (const idx of indices) {
    if (idx >= 1 && idx <= habits.length) {
      const habit = habits[idx - 1]!;
      if (await logHabit(habit.id, date)) {
        logged.push(habit.name);
      } else {
        failed.push(habit.name);
      }
    }
  }

  return { logged, failed };
}

function getDateOffset(daysAgo: number): string {
  const config = getConfig();
  const now = new Date();
  now.setDate(now.getDate() - daysAgo);

  if (config.timezone) {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: config.timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(now);
  }

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export async function getStreak(nameOrId: string | number): Promise<number> {
  const habit = await getHabit(nameOrId);
  if (!habit) return 0;

  const db = await getDb();
  const logs = await db.all<{ logged_at: string }>(
    "SELECT logged_at FROM habit_logs WHERE habit_id = ? ORDER BY logged_at DESC",
    habit.id
  );

  if (logs.length === 0) return 0;

  let streak = 0;
  const todayStr = getDateOffset(0);

  let daysBack = logs[0]!.logged_at === todayStr ? 0 : 1;

  for (const log of logs) {
    const expectedDate = getDateOffset(daysBack);
    if (log.logged_at === expectedDate) {
      streak++;
      daysBack++;
    } else if (log.logged_at < expectedDate) {
      break;
    }
  }

  return streak;
}

export async function deactivateHabit(nameOrId: string | number): Promise<boolean> {
  const habit = await getHabit(nameOrId);
  if (!habit) return false;

  const db = await getDb();
  await db.run("UPDATE habits SET active = 0 WHERE id = ?", habit.id);
  return true;
}

export async function activateHabit(nameOrId: string | number): Promise<boolean> {
  const habit = await getHabit(nameOrId);
  if (!habit) return false;

  const db = await getDb();
  await db.run("UPDATE habits SET active = 1 WHERE id = ?", habit.id);
  return true;
}

export async function updateHabit(nameOrId: string | number, updates: { name?: string; emoji?: string }): Promise<boolean> {
  const habit = await getHabit(nameOrId);
  if (!habit) return false;

  const db = await getDb();
  if (updates.name) {
    await db.run("UPDATE habits SET name = ? WHERE id = ?", updates.name, habit.id);
  }
  if (updates.emoji) {
    await db.run("UPDATE habits SET emoji = ? WHERE id = ?", updates.emoji, habit.id);
  }
  return true;
}
