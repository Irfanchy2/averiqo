#!/usr/bin/env node
/**
 * One-command local runner for Windows, macOS and Linux.
 *
 *   npm run dev      → installs anything missing, then starts
 *                      quant service  http://127.0.0.1:8000
 *                      web terminal   http://localhost:3000
 *   npm run setup    → install only
 *   npm run test     → backend tests
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const QUANT = path.join(ROOT, "services", "quant");
const WEB = path.join(ROOT, "apps", "web");
const WIN = process.platform === "win32";
const args = new Set(process.argv.slice(2));
const c = (n, s) => (process.stdout.isTTY ? `\x1b[${n}m${s}\x1b[0m` : s);
const info = (s) => console.log(c(36, "▸ ") + s);
const fail = (s) => { console.error(c(31, "✖ ") + s); process.exit(1); };

function run(cmd, argv, cwd, label) {
  info(`${label}: ${cmd} ${argv.join(" ")}`);
  const r = spawnSync(cmd, argv, { cwd, stdio: "inherit", shell: WIN });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status}). Scroll up for the error.`);
}

// ---- Node version
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 20 || (maj === 20 && min < 9)) fail(`Node ${process.versions.node} found; Next.js 16 needs Node ≥ 20.9. Install the LTS from https://nodejs.org`);

// ---- find Python ≥ 3.11
function findPython() {
  // explicit override: TP_PYTHON=/path/to/python3.12 npm run dev
  const cands = [];
  if (process.env.TP_PYTHON) cands.push([process.env.TP_PYTHON, []]);
  if (WIN) {
    cands.push(["py", ["-3"]], ["python", []], ["python3", []]);
  } else {
    // macOS ships python3 3.9 via Xcode tools, so look for versioned binaries first, including the
    // absolute install locations used by python.org (Frameworks) and Homebrew (Apple Silicon / Intel),
    // which may not be on PATH yet in an already-open terminal.
    const vers = ["3.13", "3.12", "3.11", "3.14"];
    for (const v of vers) cands.push([`python${v}`, []]);
    if (process.platform === "darwin") {
      for (const v of vers) {
        cands.push([`/Library/Frameworks/Python.framework/Versions/${v}/bin/python3`, []]);
        cands.push([`/opt/homebrew/bin/python${v}`, []]);
        cands.push([`/usr/local/bin/python${v}`, []]);
      }
      cands.push(["/opt/homebrew/bin/python3", []], ["/usr/local/bin/python3", []]);
    }
    cands.push(["python3", []], ["python", []]);
  }
  const seen = [];
  for (const [cmd, pre] of cands) {
    if (cmd.startsWith("/") && !existsSync(cmd)) continue;
    const r = spawnSync(cmd, [...pre, "-c", "import sys;print(sys.version_info[0],sys.version_info[1])"], { encoding: "utf8", shell: WIN });
    if (r.status === 0 && r.stdout.trim()) {
      const [a, b] = r.stdout.trim().split(" ").map(Number);
      if (a === 3 && b >= 11) {
        info(`Using ${cmd} (Python ${a}.${b})`);
        return [cmd, pre];
      }
      seen.push(`${cmd} → ${a}.${b}`);
    }
  }
  fail("Python ≥ 3.11 not found" + (seen.length ? ` (found only: ${seen.join(", ")})` : "") + ".\n" +
       "  macOS: install Python 3.12 from https://www.python.org/downloads/macos/ (or `brew install python@3.12`),\n" +
       "         then run `python3.12 --version` in a NEW terminal window.\n" +
       "  Already installed somewhere else? Run: TP_PYTHON=/full/path/to/python3.12 npm run dev\n" +
       "  Windows: https://www.python.org/downloads/ and tick “Add python.exe to PATH”.");
}

const venvPy = path.join(QUANT, ".venv", WIN ? "Scripts/python.exe" : "bin/python");

function setup() {
  if (!existsSync(venvPy)) {
    const [py, pre] = findPython();
    run(py, [...pre, "-m", "venv", ".venv"], QUANT, "create Python virtualenv");
  }
  const ok = spawnSync(venvPy, ["-c", "import fastapi, numpy, sqlalchemy, uvicorn, cryptography"], { cwd: QUANT });
  if (ok.status !== 0) {
    run(venvPy, ["-m", "pip", "install", "--upgrade", "pip"], QUANT, "upgrade pip");
    run(venvPy, ["-m", "pip", "install", "-r", "requirements-dev.txt"], QUANT, "install Python packages");
  }
  if (!existsSync(path.join(WEB, "node_modules", "next"))) run("npm", ["install"], WEB, "install web packages");
  // optional: defaults work without it
  const envLocal = path.join(WEB, ".env.local");
  const envExample = path.join(WEB, ".env.example");
  if (!existsSync(envLocal) && existsSync(envExample)) copyFileSync(envExample, envLocal);
}

function portFree(port) {
  return new Promise((res) => {
    const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true)));
    s.listen(port, "127.0.0.1");
  });
}

setup();
if (args.has("--setup-only")) { info("Setup complete. Start with: npm run dev"); process.exit(0); }
if (args.has("--test")) { run(venvPy, ["-m", "pytest", "-q"], QUANT, "backend tests"); process.exit(0); }

for (const [p, what] of [[8000, "quant service"], [3000, "web terminal"]]) {
  if (!(await portFree(p))) fail(`Port ${p} (${what}) is already in use. Close the other program (or an older TradePilot window) and retry.`);
}

const procs = [];
function start(label, color, cmd, argv, cwd, env = {}) {
  const p = spawn(cmd, argv, { cwd, shell: WIN, env: { ...process.env, ...env } });
  const tag = c(color, `[${label}]`);
  const pipe = (stream) => stream.on("data", (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((l) => console.log(`${tag} ${l}`)));
  pipe(p.stdout); pipe(p.stderr);
  p.on("exit", (code) => { console.log(`${tag} exited (${code}). Stopping everything.`); shutdown(code ?? 1); });
  procs.push(p);
}
function shutdown(code = 0) {
  for (const p of procs) if (!p.killed) { try { WIN ? spawnSync("taskkill", ["/pid", String(p.pid), "/T", "/F"]) : p.kill("SIGINT"); } catch {} }
  setTimeout(() => process.exit(code), 300);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

start("quant", 35, venvPy, ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"], QUANT);
start("web", 32, "npm", ["run", "dev", "--", "-p", "3000"], WEB, { QUANT_API_URL: "http://127.0.0.1:8000" });
setTimeout(() => console.log("\n" + c(32, "  ✔ TradePilot AI is starting →  open http://localhost:3000") + c(90, "   (Ctrl+C to stop)\n")), 4000);
