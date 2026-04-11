import { describe, expect, test } from "bun:test";
import { $ } from "bun";

describe("CLI", () => {
  test("shows help", async () => {
    const result = await $`bun run src/index.ts --help`.text();
    expect(result).toContain("habits");
    expect(result).toContain("add");
    expect(result).toContain("log");
    expect(result).toContain("streak");
  });

  test("shows usage on no command", async () => {
    const result = await $`bun run src/index.ts`.text();
    expect(result).toContain("USAGE");
  });

  test("db command shows path in production mode", async () => {
    const result = await $`HABITS_TEST= bun run src/index.ts db`.text();
    expect(result).toContain("habits.db");
  });

  test("db command in test mode shows :memory:", async () => {
    const result = await $`HABITS_TEST=1 bun run src/index.ts db`.text();
    expect(result).toContain(":memory:");
  });

  test("list command runs without error", async () => {
    const result = await $`HABITS_TEST=1 bun run src/index.ts list`.text();
    expect(result).toBeDefined();
  });
});
