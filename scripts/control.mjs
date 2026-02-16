import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const command = process.argv[2];
const args = process.argv.slice(3);
const isWin = process.platform === "win32";

const NPX = isWin ? "npx.cmd" : "npx";
const SUPABASE_GLOBAL = isWin ? "supabase.exe" : "supabase";

const LOCAL_ENV_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_GEMINI_API_KEY",
];

const SERVER_ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_OTP_TEMPLATE",
  "WHATSAPP_CONFIRM_TEMPLATE",
];

function readDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, "utf8");
  const map = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    map[key] = value;
  }
  return map;
}

const fileEnv = {
  ...readDotEnv(".env"),
  ...readDotEnv(".env.local"),
};

function useShellFor(bin) {
  return isWin && /\.(cmd|bat)$/i.test(bin);
}

function run(bin, runArgs, options = {}) {
  const result = spawnSync(bin, runArgs, {
    stdio: "inherit",
    shell: useShellFor(bin),
    ...options,
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function commandExists(bin, runArgs = ["--version"]) {
  const result = spawnSync(bin, runArgs, {
    stdio: "ignore",
    shell: useShellFor(bin),
  });

  if (result.error) return false;
  return result.status === 0;
}

function resolveSupabaseCommand() {
  if (commandExists(SUPABASE_GLOBAL)) {
    return { bin: SUPABASE_GLOBAL, prefix: [], source: "global" };
  }

  // Fallback: run Supabase CLI through npx without global install.
  return { bin: NPX, prefix: ["supabase"], source: "npx" };
}

const SUPABASE_CMD = resolveSupabaseCommand();

function runSupabase(runArgs) {
  run(SUPABASE_CMD.bin, [...SUPABASE_CMD.prefix, ...runArgs]);
}

function getSupabaseOutput(runArgs) {
  return getOutput(SUPABASE_CMD.bin, [...SUPABASE_CMD.prefix, ...runArgs]);
}

function getOutput(bin, runArgs) {
  const result = spawnSync(bin, runArgs, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: useShellFor(bin),
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (typeof result.status === "number" && result.status !== 0) {
    const stderr = result.stderr?.toString("utf8") || "";
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
    process.exit(result.status);
  }

  return result.stdout?.toString("utf8") || "";
}

function envStatus(key) {
  if (process.env[key]) return "OK (shell)";
  if (fileEnv[key]) return "OK (.env.local)";
  return "MISSING";
}

function printStatus() {
  console.log("=== Control Status ===");
  console.log("");
  console.log(`Supabase CLI source: ${SUPABASE_CMD.source}`);
  console.log("");

  console.log("Local env (.env.local):");
  for (const key of LOCAL_ENV_KEYS) {
    console.log(`- ${key}: ${envStatus(key)}`);
  }

  console.log("");
  console.log("Server env (Vercel Project Settings):");
  for (const key of SERVER_ENV_KEYS) {
    console.log(`- ${key}: ${envStatus(key)}`);
  }

  console.log("");
  console.log("Project files:");
  console.log(`- vercel.json: ${fs.existsSync("vercel.json") ? "OK" : "MISSING"}`);
  console.log(
    `- supabase/migrations: ${fs.existsSync(path.join("supabase", "migrations")) ? "OK" : "MISSING"}`
  );
}

function ensureProjectRef() {
  const projectRef = args[0] || process.env.SUPABASE_PROJECT_REF;
  if (!projectRef) {
    console.error(
      "Missing SUPABASE_PROJECT_REF. Set env var or pass it explicitly:\n" +
        "npm run supabase:link -- <project_ref>"
    );
    process.exit(1);
  }
  return projectRef;
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

switch (command) {
  case "status": {
    printStatus();
    break;
  }
  case "vercel:pull": {
    const envName = args[0] || "production";
    run(NPX, ["vercel", "pull", "--yes", "--environment", envName]);
    break;
  }
  case "vercel:deploy": {
    run(NPX, ["vercel", "deploy", "--prod"]);
    break;
  }
  case "vercel:logs": {
    run(NPX, ["vercel", "logs", "--prod", ...args]);
    break;
  }
  case "vercel:env:ls": {
    run(NPX, ["vercel", "env", "ls"]);
    break;
  }
  case "supabase:link": {
    const projectRef = ensureProjectRef();
    runSupabase(["link", "--project-ref", projectRef]);
    break;
  }
  case "supabase:push": {
    runSupabase(["db", "push"]);
    break;
  }
  case "supabase:types": {
    const outputPath = args[0] || "types/supabase.generated.ts";
    const output = getSupabaseOutput(["gen", "types", "typescript", "--linked"]);
    ensureDirForFile(outputPath);
    fs.writeFileSync(outputPath, output, "utf8");
    console.log(`Wrote ${outputPath}`);
    break;
  }
  default: {
    console.log("Usage: node scripts/control.mjs <command>");
    console.log("");
    console.log("Commands:");
    console.log("- status");
    console.log("- vercel:pull [production|preview|development]");
    console.log("- vercel:deploy");
    console.log("- vercel:logs [--since ...]");
    console.log("- vercel:env:ls");
    console.log("- supabase:link [project_ref]");
    console.log("- supabase:push");
    console.log("- supabase:types [output_path]");
    process.exit(1);
  }
}
