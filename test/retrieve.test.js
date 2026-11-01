import assert from "node:assert/strict";
import { test } from "node:test";
import { retrieve, tokenize } from "../src/retrieve.js";

const memories = [
  {
    id: "mole",
    title: "The smoke was the point",
    year: "1997",
    body: "She burned the chiles until the kitchen was unbreathable. The mole took three hours. El humo es el punto.",
  },
  {
    id: "seeds",
    title: "A sewing machine and a tin of seeds",
    year: "1961",
    body: "She carried marigold seeds from Oaxaca in a sock and grew them on the windowsill in Chicago.",
  },
  {
    id: "radio",
    title: "Ironing with Pedro Infante",
    year: "1989",
    body: "She sang boleros into the iron and burned my father's shirt. The radio distracted her.",
  },
];

test("tokens are accent-folded, stopworded, and lightly stemmed", () => {
  const tokens = tokenize("¿Dónde están las flores de cempasúchil?");
  assert.ok(tokens.includes("donde"));
  assert.ok(tokens.includes("flor"));
  assert.ok(tokens.includes("cempasuchil"));
  assert.ok(!tokens.includes("las"));
  assert.ok(!tokens.includes("de"));
  assert.ok(tokenize("marigolds").includes("marigold"));
  assert.ok(tokenize("cooked").includes("cook"));
});

test("retrieval puts the memory that answers the question first", () => {
  const result = retrieve(memories, "Where did the marigolds come from?");
  assert.equal(result[0].id, "seeds");
  assert.ok(result[0].score > 0);
});

test("a Spanish question finds the Spanish phrase", () => {
  const result = retrieve(memories, "¿Qué decía del humo?");
  assert.equal(result[0].id, "mole");
});

test("no overlap means no invented context", () => {
  assert.deepEqual(retrieve(memories, "What was her password?"), []);
});
