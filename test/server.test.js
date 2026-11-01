import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { exportSeed } from "../src/store.js";

let child;
let baseUrl;
let dataDir;

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForHealth(attempts = 60) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return response.json();
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ofrenda-server-"));
  process.env.OFRENDA_DATA_DIR = dataDir;
  exportSeed(path.resolve(import.meta.dirname, "..", "examples", "elena"));

  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.resolve(import.meta.dirname, ".."),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: "127.0.0.1",
      OFRENDA_DATA_DIR: dataDir,
      OFRENDA_INFERENCE: "extract",
      OFRENDA_LOG: "off",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stderr.on("data", (chunk) => process.stderr.write(chunk));
  await waitForHealth();
});

after(() => {
  child?.kill("SIGTERM");
});

test("health reports the archive and the model", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.people, 1);
  assert.equal(body.model.mode, "extract");
  assert.match(body.dataDir, /ofrenda-server-/);
});

test("the landing page lists the altar", async () => {
  const response = await fetch(`${baseUrl}/`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Elena Marisol Reyes/);
  assert.match(html, /local-first/i);
});

test("an altar page writes its first remembrance on first light", async () => {
  const response = await fetch(`${baseUrl}/p/elena`);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /Elena Marisol Reyes/);
  assert.match(html, /La remembranza/);
  assert.match(html, /Candlelight mode/);
  assert.match(html, /8 memories/);

  const profile = JSON.parse(
    fs.readFileSync(path.join(dataDir, "people", "elena", "profile.json"), "utf8"),
  );
  assert.equal(profile.remembrance.mode, "template");
});

test("asking the archive returns grounded quotes", async () => {
  const response = await fetch(`${baseUrl}/api/p/elena/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "Where did the marigolds come from?" }),
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.mode, "extract");
  assert.equal(body.cites[0].title, "A sewing machine and a tin of seeds");
  assert.match(body.answer, /Oaxaca/);
});

test("a new memory is written to disk and appears on the page", async () => {
  const response = await fetch(`${baseUrl}/api/p/elena/memories`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "The blue cup",
      year: "2010",
      body: "She had one blue cup and would not let anyone else use it.",
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.memory.title, "The blue cup");

  const html = await (await fetch(`${baseUrl}/p/elena`)).text();
  assert.match(html, /The blue cup/);
  assert.match(html, /9 memories/);
});

test("a new altar can be created from the web form", async () => {
  const response = await fetch(`${baseUrl}/api/people`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      name: "Rosa Ibarra",
      born: "1940",
      relationship: "my aunt",
      memory: "She kept the kettle on all day.",
    }),
    redirect: "manual",
  });

  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/p/rosa-ibarra");

  const html = await (await fetch(`${baseUrl}/p/rosa-ibarra`)).text();
  assert.match(html, /Rosa Ibarra/);
  assert.match(html, /The first memory/);
});

test("missing altars are a quiet 404, not a stack trace", async () => {
  const response = await fetch(`${baseUrl}/p/nobody`);
  const html = await response.text();
  assert.equal(response.status, 404);
  assert.match(html, /not on this machine/);
});

test("media paths cannot climb out of the altar folder", async () => {
  const response = await fetch(`${baseUrl}/media/elena/..%2Fprofile.json`);
  assert.equal(response.status, 404);
});
