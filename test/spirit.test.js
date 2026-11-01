import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { before, test } from "node:test";
import { askSpirit, extractiveAnswer, fallbackRemembrance, writeRemembrance } from "../src/spirit.js";
import { exportSeed, loadPerson } from "../src/store.js";
import { exportOfrenda } from "../src/export.js";

const person = {
  slug: "elena",
  name: "Elena Marisol Reyes",
  born: "1938",
  died: "2019",
  relationship: "my grandmother",
  epithet: "She kept the marigolds alive through a Chicago winter.",
  offerings: { foods: ["mole negro"], songs: ["Amorcito corazón"] },
};

const memories = [
  {
    id: "seeds",
    title: "A sewing machine and a tin of seeds",
    year: "1961",
    body: "She carried marigold seeds from Oaxaca in a sock and grew them on the windowsill in Chicago. The first winter killed half of them.",
  },
  {
    id: "mole",
    title: "The smoke was the point",
    year: "1997",
    body: "She burned the chiles until the kitchen was unbreathable. She said el humo es el punto. She never measured anything.",
  },
];

before(() => {
  process.env.OFRENDA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ofrenda-spirit-"));
  process.env.OFRENDA_INFERENCE = "extract";
});

test("candlelight mode quotes the archive instead of guessing", () => {
  const result = extractiveAnswer(person, memories, "Where did the marigolds come from?");
  assert.equal(result.mode, "extract");
  assert.equal(result.confidence, "partial");
  assert.equal(result.cites[0].title, "A sewing machine and a tin of seeds");
  assert.match(result.answer, /marigold seeds from Oaxaca/);
  assert.match(result.answer, /will not fill the rest in/);
});

test("an unsupported question gets an honest no", () => {
  const result = extractiveAnswer(person, memories, "What was her favorite football team?");
  assert.equal(result.confidence, "unknown");
  assert.deepEqual(result.cites, []);
  assert.match(result.answer, /does not hold that yet/);
});

test("no memories means no séance", async () => {
  const result = await askSpirit({ person, memories: [], question: "Anything?" });
  assert.equal(result.mode, "empty");
  assert.equal(result.confidence, "unknown");
});

test("askSpirit falls back to quotation when inference is off", async () => {
  const result = await askSpirit({
    person,
    memories,
    question: "What did she say about the smoke?",
  });
  assert.equal(result.mode, "extract");
  assert.ok(result.cites.length >= 1);
});

test("the template remembrance is built from real sentences", async () => {
  const remembrance = fallbackRemembrance(person, memories);
  assert.match(remembrance.text, /Elena Marisol Reyes lived 1938–2019/);
  assert.match(remembrance.text, /marigold|chiles/i);
  assert.equal(remembrance.mode, "template");
});

test("writeRemembrance never calls a model when inference is off", async () => {
  const remembrance = await writeRemembrance({ person, memories, force: true });
  assert.equal(remembrance.mode, "template");
  assert.ok(remembrance.text.length > 100);
});

test("the static keepsake is a folder you can open offline", async () => {
  process.env.OFRENDA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ofrenda-export-"));
  exportSeed(path.resolve(import.meta.dirname, "..", "examples", "elena"));
  loadPerson("elena");

  const out = path.join(process.env.OFRENDA_DATA_DIR, "..", "ofrenda-keepsake");
  const result = await exportOfrenda("elena", out);
  const html = fs.readFileSync(result.file, "utf8");

  assert.ok(fs.existsSync(path.join(out, "styles.css")));
  assert.ok(fs.existsSync(path.join(out, "assets", "portrait.svg")));
  assert.match(html, /Elena Marisol Reyes/);
  assert.match(html, /Static keepsake/);
  assert.doesNotMatch(html, /<script src="\.\/app\.js"/);
});
