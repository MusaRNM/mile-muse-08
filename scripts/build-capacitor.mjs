#!/usr/bin/env node
/**
 * Capacitor static-shell builder.
 *
 * TanStack Start outputs:
 *   .output/server  = SSR worker
 *   .output/public  = static client assets
 *
 * Capacitor needs an actual index.html file inside the web directory.
 */

import { spawn } from "node:child_process";
import { rm, cp, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const CLIENT_DIR = path.join(ROOT, ".output", "public");
const SERVER_DIR = path.join(ROOT, ".output", "server");
const PORT = 8791;

const IS_WINDOWS = process.platform === "win32";
const NPX = IS_WINDOWS ? "npx.cmd" : "npx";

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      stdio: "inherit",
      shell: true,
      ...opts,
    });

    p.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exited ${code}`));
      }
    });

    p.on("error", reject);
  });
}

async function waitForOk(url, timeoutMs = 40000) {
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

  if (!existsSync(SERVER_DIR)) {
    throw new Error(".output/server missing after build");
  }

  await rm(path.join(ROOT, ".wrangler"), {
    recursive: true,
    force: true,
  });

  console.log("→ booting wrangler to snapshot SSR shell");

  const wr = spawn(
    NPX,
    [
      "wrangler",
      "--cwd",
      SERVER_DIR,
      "dev",
      "--port",
      String(PORT),
      "--local",
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    }
  );

  wr.stdout.on("data", (b) => {
    process.stdout.write(`[wrangler] ${b}`);
  });

  wr.stderr.on("data", (b) => {
    process.stderr.write(`[wrangler] ${b}`);
  });

  try {
    const res = await waitForOk(
      `http://127.0.0.1:${PORT}/`
    );

    const html = await res.text();

    if (!html.includes("<html")) {
      throw new Error("SSR response was not HTML");
    }

    await mkdir(CLIENT_DIR, {
      recursive: true,
    });

    await writeFile(
      path.join(CLIENT_DIR, "index.html"),
      html,
      "utf8"
    );

    await cp(
      path.join(CLIENT_DIR, "index.html"),
      path.join(CLIENT_DIR, "200.html")
    );

    console.log(
      `✓ wrote ${path.relative(
        ROOT,
        path.join(CLIENT_DIR, "index.html")
      )}`
    );
  } finally {
    wr.kill("SIGTERM");

    await new Promise((r) =>
      setTimeout(r, 300)
    );

    if (!wr.killed) {
      wr.kill("SIGKILL");
    }
  }

  console.log("\n✓ Capacitor bundle ready.");
  console.log("  webDir: .output/public");
  console.log("  entry:  .output/public/index.html");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});