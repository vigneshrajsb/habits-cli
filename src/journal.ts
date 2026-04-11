import { getConfig, getDb } from "./db";

export interface JournalEntry {
  id: number;
  date: string;
  content: string | null;
  mood: number | null;
  updated_at: string;
}

export const MOOD_EMOJIS: Record<number, string> = {
  1: "😞",
  2: "😕",
  3: "😐",
  4: "🙂",
  5: "😄",
};

export function moodToEmoji(mood: number | null): string {
  if (mood === null) return "";
  return MOOD_EMOJIS[mood] || "";
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

export async function getEntry(date?: string): Promise<JournalEntry | null> {
  const db = await getDb();
  const targetDate = date || today();
  return db.get<JournalEntry>(
    "SELECT * FROM journal WHERE date = ?",
    targetDate,
  );
}

export async function writeJournal(
  content: string,
  date?: string,
): Promise<JournalEntry> {
  const db = await getDb();
  const targetDate = date || today();
  const existing = await getEntry(targetDate);

  if (existing) {
    await db.run(
      "UPDATE journal SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE date = ?",
      content,
      targetDate,
    );
  } else {
    await db.run(
      "INSERT INTO journal (date, content) VALUES (?, ?)",
      targetDate,
      content,
    );
  }

  return (await getEntry(targetDate))!;
}

export async function appendJournal(
  content: string,
  date?: string,
): Promise<JournalEntry> {
  const db = await getDb();
  const targetDate = date || today();
  const existing = await getEntry(targetDate);

  if (existing) {
    const newContent = existing.content
      ? `${existing.content}\n\n${content}`
      : content;
    await db.run(
      "UPDATE journal SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE date = ?",
      newContent,
      targetDate,
    );
  } else {
    await db.run(
      "INSERT INTO journal (date, content) VALUES (?, ?)",
      targetDate,
      content,
    );
  }

  return (await getEntry(targetDate))!;
}

export async function setMood(
  mood: number,
  date?: string,
): Promise<JournalEntry> {
  if (mood < 1 || mood > 5) {
    throw new Error("Mood must be between 1 and 5");
  }

  const db = await getDb();
  const targetDate = date || today();
  const existing = await getEntry(targetDate);

  if (existing) {
    await db.run(
      "UPDATE journal SET mood = ?, updated_at = CURRENT_TIMESTAMP WHERE date = ?",
      mood,
      targetDate,
    );
  } else {
    await db.run(
      "INSERT INTO journal (date, mood) VALUES (?, ?)",
      targetDate,
      mood,
    );
  }

  return (await getEntry(targetDate))!;
}

export async function replaceJournal(
  content: string,
  date?: string,
): Promise<JournalEntry> {
  const db = await getDb();
  const targetDate = date || today();
  const existing = await getEntry(targetDate);

  if (existing) {
    await db.run(
      "UPDATE journal SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE date = ?",
      content,
      targetDate,
    );
  } else {
    await db.run(
      "INSERT INTO journal (date, content) VALUES (?, ?)",
      targetDate,
      content,
    );
  }

  return (await getEntry(targetDate))!;
}

export async function getRecentEntries(
  limit: number = 7,
): Promise<JournalEntry[]> {
  const db = await getDb();
  return db.all<JournalEntry>(
    "SELECT * FROM journal ORDER BY date DESC LIMIT ?",
    limit,
  );
}

export async function searchJournal(
  query: string,
  limit: number = 10,
): Promise<JournalEntry[]> {
  const db = await getDb();
  return db.all<JournalEntry>(
    "SELECT * FROM journal WHERE content LIKE ? ORDER BY date DESC LIMIT ?",
    `%${query}%`,
    limit,
  );
}

export async function getEntriesInRange(
  startDate: string,
  endDate: string,
): Promise<JournalEntry[]> {
  const db = await getDb();
  return db.all<JournalEntry>(
    "SELECT * FROM journal WHERE date >= ? AND date <= ? ORDER BY date",
    startDate,
    endDate,
  );
}
