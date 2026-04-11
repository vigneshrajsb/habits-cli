import { describe, test, expect, beforeEach, beforeAll } from "bun:test";

process.env.HABITS_TEST = "1";

import { initDb, getDb } from "../src/db";
import {
  addHabit,
  listHabits,
  getHabit,
  logHabit,
  unlogHabit,
  getLogsForDate,
  getStreak,
  deactivateHabit,
  activateHabit,
  updateHabit,
} from "../src/habits";

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  const db = await getDb();
  await db.run("DELETE FROM habit_logs");
  await db.run("DELETE FROM habits");
});

describe("addHabit", () => {
  test("adds a habit with name only", async () => {
    const habit = await addHabit("Exercise");

    expect(habit.id).toBeGreaterThan(0);
    expect(habit.name).toBe("Exercise");
    expect(habit.frequency).toBe("daily");
    expect(habit.active).toBe(1);
  });

  test("adds a habit with emoji", async () => {
    const habit = await addHabit("Meditate", "🧘");

    expect(habit.name).toBe("Meditate");
    expect(habit.emoji).toBe("🧘");
  });

  test("adds a habit with custom frequency", async () => {
    const habit = await addHabit("Weekly Review", "📝", "weekly");

    expect(habit.frequency).toBe("weekly");
  });
});

describe("listHabits", () => {
  test("lists active habits", async () => {
    await addHabit("Habit 1");
    await addHabit("Habit 2");
    const habit3 = await addHabit("Habit 3");
    await deactivateHabit(habit3.id);

    const habits = await listHabits();
    expect(habits.length).toBe(2);
  });

  test("includes inactive when requested", async () => {
    await addHabit("Habit 1");
    const habit2 = await addHabit("Habit 2");
    await deactivateHabit(habit2.id);

    const habits = await listHabits(true);
    expect(habits.length).toBe(2);
  });
});

describe("getHabit", () => {
  test("gets habit by id", async () => {
    const added = await addHabit("Test Habit");
    const habit = await getHabit(added.id);

    expect(habit).not.toBeNull();
    expect(habit!.id).toBe(added.id);
  });

  test("gets habit by name (case insensitive)", async () => {
    await addHabit("Reading");

    const habit = await getHabit("reading");
    expect(habit).not.toBeNull();
    expect(habit!.name).toBe("Reading");
  });

  test("returns null for non-existent habit", async () => {
    const habit = await getHabit(99999);
    expect(habit).toBeNull();
  });
});

describe("logHabit / unlogHabit", () => {
  test("logs a habit for today", async () => {
    const habit = await addHabit("Exercise");

    const result = await logHabit(habit.id);
    expect(result).toBe(true);

    const logs = await getLogsForDate();
    const exerciseLog = logs.find(l => l.habit.id === habit.id);
    expect(exerciseLog?.logged).toBe(true);
  });

  test("logs a habit for specific date", async () => {
    const habit = await addHabit("Exercise");

    const result = await logHabit(habit.id, "2026-01-15");
    expect(result).toBe(true);

    const logs = await getLogsForDate("2026-01-15");
    const exerciseLog = logs.find(l => l.habit.id === habit.id);
    expect(exerciseLog?.logged).toBe(true);
  });

  test("unlogs a habit", async () => {
    const habit = await addHabit("Exercise");
    await logHabit(habit.id, "2026-01-15");

    const result = await unlogHabit(habit.id, "2026-01-15");
    expect(result).toBe(true);

    const logs = await getLogsForDate("2026-01-15");
    const exerciseLog = logs.find(l => l.habit.id === habit.id);
    expect(exerciseLog?.logged).toBe(false);
  });

  test("returns false for non-existent habit", async () => {
    expect(await logHabit(99999)).toBe(false);
    expect(await unlogHabit(99999)).toBe(false);
  });
});

describe("getLogsForDate", () => {
  test("returns all habits with log status", async () => {
    const h1 = await addHabit("Habit 1");
    const h2 = await addHabit("Habit 2");
    await logHabit(h1.id, "2026-01-15");

    const logs = await getLogsForDate("2026-01-15");

    expect(logs.length).toBe(2);
    expect(logs.find(l => l.habit.id === h1.id)?.logged).toBe(true);
    expect(logs.find(l => l.habit.id === h2.id)?.logged).toBe(false);
  });
});

describe("getStreak", () => {
  test("returns 0 for no logs", async () => {
    const habit = await addHabit("Exercise");
    expect(await getStreak(habit.id)).toBe(0);
  });

  test("calculates streak for consecutive days", async () => {
    const habit = await addHabit("Exercise");
    const today = new Date();

    for (let i = 0; i < 3; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      await logHabit(habit.id, date.toISOString().split("T")[0]);
    }

    expect(await getStreak(habit.id)).toBe(3);
  });

  test("breaks streak on gap", async () => {
    const habit = await addHabit("Exercise");
    const today = new Date();

    await logHabit(habit.id, today.toISOString().split("T")[0]);

    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    await logHabit(habit.id, threeDaysAgo.toISOString().split("T")[0]);

    expect(await getStreak(habit.id)).toBe(1);
  });
});

describe("deactivateHabit / activateHabit", () => {
  test("deactivates a habit", async () => {
    const habit = await addHabit("Exercise");

    await deactivateHabit(habit.id);

    const updated = await getHabit(habit.id);
    expect(updated!.active).toBe(0);
  });

  test("activates a habit", async () => {
    const habit = await addHabit("Exercise");
    await deactivateHabit(habit.id);

    await activateHabit(habit.id);

    const updated = await getHabit(habit.id);
    expect(updated!.active).toBe(1);
  });
});

describe("updateHabit", () => {
  test("updates habit name", async () => {
    const habit = await addHabit("Old Name");

    await updateHabit(habit.id, { name: "New Name" });

    const updated = await getHabit(habit.id);
    expect(updated!.name).toBe("New Name");
  });

  test("updates habit emoji", async () => {
    const habit = await addHabit("Exercise");

    await updateHabit(habit.id, { emoji: "💪" });

    const updated = await getHabit(habit.id);
    expect(updated!.emoji).toBe("💪");
  });
});
