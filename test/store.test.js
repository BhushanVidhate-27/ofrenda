import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  addMemory,
  createPerson,
  exportSeed,
  listPeople,
  loadMemories,
  loadPerson,
  parseMemory,
} from "../src/store.js";

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ofrenda-test-"));
  process.env.OFRENDA_DATA_DIR = dir;
  return dir;
}

test("an altar is a folder of readable files", () => {
  const dir = sandbox();
  const profile = createPerson({
    name: "Rosa Ibarra",
    born: "1940",
    died: "2020",
    relationship: "my aunt",
    foods: ["pozole\nchampurrado"],
  });

  assert.equal(profile.slug, "rosa-ibarra");
  assert.deepEqual(profile.offerings.foods, ["pozole", "champurrado"]);

  const memory = addMemory(profile.slug, {
    title: "The pozole",
    year: "1998",
    body: "She put the hominy in at dawn.",
  });

  const file = path.join(dir, "people", profile.slug, "memories", `${memory.id}.md`);
  assert.ok(fs.existsSync(file), "memory is a markdown file on disk");
  assert.match(fs.readFileSync(file, "utf8"), /title: The pozole/);

  const loaded = loadPerson(profile.slug);
  assert.equal(loaded.memories.length, 1);
  assert.equal(loaded.memories[0].title, "The pozole");
  assert.equal(loaded.memories[0].year, "1998");
  assert.equal(listPeople().length, 1);
});

test("frontmatter without frontmatter still loads as a memory", () => {
  const memory = parseMemory("Just a story with no metadata.", "fallback");
  assert.equal(memory.id, "fallback");
  assert.equal(memory.title, "Untitled memory");
  assert.equal(memory.body, "Just a story with no metadata.");
});

test("list and array frontmatter both parse", () => {
  const memory = parseMemory(
    `---
title: "The ledger"
year: 2003
people: [Elena, Tomás]
---

Pencil, so she could erase.`,
    "x",
  );

  assert.equal(memory.title, "The ledger");
  assert.deepEqual(memory.people, ["Elena", "Tomás"]);
});

test("the example altar seeds, and refuses to clobber itself", () => {
  sandbox();
  const source = path.resolve(import.meta.dirname, "..", "examples", "elena");

  const first = exportSeed(source);
  assert.equal(first.slug, "elena");
  assert.equal(first.skipped, false);

  const memories = loadMemories("elena");
  assert.equal(memories.length, 8);
  assert.ok(memories.every((memory) => memory.body.length > 80));

  const second = exportSeed(source);
  assert.equal(second.skipped, true);

  const third = exportSeed(source, { overwrite: true });
  assert.equal(third.skipped, false);
});
