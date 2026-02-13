import fs from "fs";
import { spawn } from "child_process";
import path from "path";

const logFile = path.resolve("output.log");
const pidFile = path.resolve("nrpc.pid");

// --- Daemonize mode ---
if (process.argv.includes("-d")) {
  const out = fs.openSync(logFile, "a");
  const err = fs.openSync(logFile, "a");

  const subprocess = spawn(
    process.execPath,
    process.argv.slice(1).filter((a) => a !== "-d"),
    {
      detached: true,
      stdio: ["ignore", out, err],
    }
  );

  subprocess.unref();

  // Write child PID to pid file
  fs.writeFileSync(pidFile, String(subprocess.pid));
  console.log(`NRPC server daemonized (PID ${subprocess.pid})`);
  console.log(`Logs: ${logFile}`);
  console.log(`PID file: ${pidFile}`);
  process.exit(0);
}

// Catch unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "\nReason:", reason);
});

// Catch uncaught exceptions
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

// Optional: log when process is about to exit
process.on("exit", (code) => {
  console.log("Process exiting with code:", code);
});

import "dotenv/config";

import { CONFIG } from "./config.js";
import { Methods as Registry } from "./registry.js";
import { ReminderController } from "./controllers/ReminderController.js";
import { NostrService } from "./services/nostr.js";
import { assertServerKeys } from "./utils.js";
import { SchedulePostController } from "./controllers/SchedulePostController.js";
import { AIController } from "./controllers/AIController.js";

async function main() {
  try {
    assertServerKeys();
  } catch (err: any) {
    console.error(err);
    process.exit(1);
  }

  new ReminderController(Registry);
  // new DMController(Registry);
  // new ErrorController(Registry);
  new SchedulePostController(Registry);
  new AIController(Registry);

  const nostr = new NostrService(CONFIG.relays);
  try {
    await nostr.connect();
  } catch (err) {
    console.error("❌ NostrService.connect() failed:");
    console.error(err);
    console.error(new Error().stack); // 👈 adds *your call stack*
    throw err; // rethrow to main() for consistency
  }
  console.log("NRPC server started and connected to relays.");

  // 👇 Keep process alive indefinitely
  await new Promise(() => { });
}

main().catch((err) => {
  console.error("❌ Unhandled error in main():");

  if (err instanceof Error) {
    console.error(err.stack); // full traceback
  } else {
    console.error("Non-Error rejection:", err, typeof err);
  }

  process.exit(1);
});
