import { createInterface } from "node:readline";
import {
  type Config,
  getConfig,
  getDbPath,
  getReplicaPath,
  updateConfig,
} from "./db";

function createPrompt(): {
  ask: (question: string) => Promise<string>;
  close: () => void;
} {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask: (question: string) =>
      new Promise((resolve) =>
        rl.question(question, (answer) => resolve(answer.trim())),
      ),
    close: () => rl.close(),
  };
}

async function testTursoConnection(
  url: string,
  authToken: string,
): Promise<boolean> {
  try {
    const { createClient } = await import("@libsql/client");
    const client = createClient({ url, authToken });
    await client.execute("SELECT 1");
    client.close();
    return true;
  } catch (err: any) {
    console.error(`\n  Connection failed: ${err.message}`);
    return false;
  }
}

export async function runSetup() {
  const config = getConfig();
  const prompt = createPrompt();

  console.log(`
╔══════════════════════════════════════╗
║         habits setup wizard          ║
╚══════════════════════════════════════╝

This will configure where your habit data is stored.
`);

  if (config.backend) {
    console.log(`Current backend: ${config.backend}`);
    if (config.backend === "turso" && config.turso?.url) {
      console.log(`Turso URL: ${config.turso.url}\n`);
    }
  }

  console.log("Choose a storage backend:\n");
  console.log("  1. Local SQLite (default)");
  console.log(`     Data stays on this machine at ${getDbPath()}`);
  console.log("");
  console.log("  2. Turso Cloud");
  console.log(
    "     SQLite hosted in the cloud with local replica for offline use",
  );
  console.log("");

  const choice = await prompt.ask("Enter 1 or 2: ");

  if (choice === "2") {
    await setupTurso(prompt, config);
  } else {
    await setupLocal(prompt, config);
  }

  prompt.close();
}

async function setupLocal(
  prompt: { ask: (q: string) => Promise<string> },
  config: Config,
) {
  const wasOnTurso = config.backend === "turso";

  updateConfig({ backend: "local" });
  console.log("\n  Backend set to: local");
  console.log(`  Database path: ${getDbPath()}`);

  if (wasOnTurso) {
    console.log("\n  Switched from Turso to local.");
    console.log("  Your Turso credentials are still saved in config.");
    console.log("  Run `habits setup` again to switch back anytime.\n");

    const migrate = await prompt.ask(
      "Migrate data from Turso to local? (y/n): ",
    );
    if (migrate.toLowerCase() === "y") {
      const { migrateTursoToLocal } = await import("./migrate");
      await migrateTursoToLocal();
    }
  }

  console.log("\n  Setup complete!\n");
}

async function setupTurso(
  prompt: { ask: (q: string) => Promise<string> },
  config: Config,
) {
  const hasCreds = config.turso?.url && config.turso?.authToken;

  if (!hasCreds) {
    console.log(`
To use Turso, you need a Turso account and database.

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

You can also set these as environment variables instead:
  export TURSO_DATABASE_URL="libsql://..."
  export TURSO_AUTH_TOKEN="eyJ..."
`);
  }

  const envUrl = process.env.TURSO_DATABASE_URL;
  const envToken = process.env.TURSO_AUTH_TOKEN;

  let url: string;
  let authToken: string;

  if (envUrl && envToken) {
    console.log("  Found credentials in environment variables.");
    console.log(`  URL: ${envUrl}\n`);
    const useEnv = await prompt.ask("Use these credentials? (y/n): ");
    if (useEnv.toLowerCase() === "y") {
      url = envUrl;
      authToken = envToken;
    } else {
      url = await prompt.ask("Turso database URL: ");
      authToken = await prompt.ask("Turso auth token: ");
    }
  } else if (hasCreds) {
    console.log(`  Existing Turso config found: ${config.turso!.url}\n`);
    const reuse = await prompt.ask("Use existing credentials? (y/n): ");
    if (reuse.toLowerCase() === "y") {
      url = config.turso!.url;
      authToken = config.turso!.authToken;
    } else {
      url = await prompt.ask("Turso database URL: ");
      authToken = await prompt.ask("Turso auth token: ");
    }
  } else {
    url = await prompt.ask("Turso database URL: ");
    authToken = await prompt.ask("Turso auth token: ");
  }

  if (!url || !authToken) {
    console.error("\n  URL and auth token are required. Aborting.\n");
    return;
  }

  console.log("\n  Testing connection...");
  const ok = await testTursoConnection(url, authToken);
  if (!ok) {
    const retry = await prompt.ask(
      "\nRetry with different credentials? (y/n): ",
    );
    if (retry.toLowerCase() === "y") {
      return setupTurso(prompt, config);
    }
    console.log("  Setup aborted. Backend unchanged.\n");
    return;
  }
  console.log("  Connection successful!\n");

  const wasLocal = config.backend !== "turso";

  updateConfig({
    backend: "turso",
    turso: { url, authToken },
  });

  console.log("  Backend set to: turso (embedded replica)");
  console.log(`  Remote: ${url}`);
  console.log(`  Local replica: ${getReplicaPath()}`);

  if (wasLocal) {
    const migrate = await prompt.ask(
      "\nMigrate existing local data to Turso? (y/n): ",
    );
    if (migrate.toLowerCase() === "y") {
      const { migrateLocalToTurso } = await import("./migrate");
      await migrateLocalToTurso();
    }
  }

  console.log("\n  Setup complete!\n");
}
