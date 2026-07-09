#!/usr/bin/env node
/**
 * Capacitor static-shell builder.
 *
 * TanStack Start's normal `vite build` emits an SSR worker in `dist/server`
 * plus static client assets in `dist/client` — but no `index.html` shell,
 * because the shell is rendered per-request by the worker. Capacitor's
 * WebView loads files from disk and needs an actual `index.html`.
 *
 * This script:
 *   1. Runs `vite build` (unchanged production build — server, security,
 *      Supabase, Google Maps functions all still emitted for Cloudflare).
 *   2. Boots the built worker locally with wrangler.
 *   3. Fetches `/` to capture the fully SSR-rendered HTML shell — including
 *      correct hashed `<link>` / `<script>` refs to `/assets/*`.
 *   4. Writes that shell to `dist/client/index.html` (SPA entry) and copies
 *      it to `dist/client/200.html` (deep-link fallback). The client-side
 *      router takes over from there.
 *
 * The captured HTML embeds SSR markup for `/`, but the client bundle
 * hydrates on mount and TanStack Router replaces the tree on any real
 * navigation — good enough as a launch screen.
 *
 * Capacitor `webDir` = `dist/client`.
 */
import { spawn } from "node:child_process";
import { rm, cp, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT_DIR = path.join(ROOT, "dist", "client");
const SERVER_DIR = path.join(ROOT, "dist", "server");
const PORT = 8791;

// On Windows, Node's spawn (without shell:true) can't resolve shim scripts
// like `npx` — it needs the actual `npx.cmd`. On POSIX, `npx` is the real
// executable. Resolve once, cross-platform, without using shell:true.
const IS_WINDOWS = process.platform === "win32";
const NPX = IS_WINDOWS ? "npx.cmd" : "npx";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", shell: false, ...opts });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    p.on("error", reject);
  });
}

async function waitForOk(url, timeoutMs = 40_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  console.log("→ vite build");
  await run(NPX, ["vite", "build"]);

  if (!existsSync(SERVER_DIR)) throw new Error("dist/server missing after build");

  // wrangler complains if a stray .wrangler/deploy/config.json exists at a
  // different base path than dist/server/wrangler.json.
  await rm(path.join(ROOT, ".wrangler"), { recursive: true, force: true });

  console.log("→ booting wrangler to snapshot SSR shell");
  const wr = spawn(
    NPX,
    ["wrangler", "--cwd", SERVER_DIR, "dev", "--port", String(PORT), "--local"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  wr.stdout.on("data", (b) => process.stdout.write(`[wrangler] ${b}`));
  wr.stderr.on("data", (b) => process.stderr.write(`[wrangler] ${b}`));

  try {
    const res = await waitForOk(`http://127.0.0.1:${PORT}/`);
    const html = await res.text();
    if (!html.includes("<html")) throw new Error("SSR response was not HTML");
    await mkdir(CLIENT_DIR, { recursive: true });
    await writeFile(path.join(CLIENT_DIR, "index.html"), html, "utf8");
    await cp(path.join(CLIENT_DIR, "index.html"), path.join(CLIENT_DIR, "200.html"));
    console.log(`✓ wrote ${path.relative(ROOT, path.join(CLIENT_DIR, "index.html"))} (${html.length} bytes)`);
  } finally {
    wr.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 300));
    if (!wr.killed) wr.kill("SIGKILL");
  }

  console.log("\n✓ Capacitor bundle ready.");
  console.log("  webDir: dist/client");
  console.log("  entry:  dist/client/index.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
