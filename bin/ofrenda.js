#!/usr/bin/env node
import fs from "node:fs";
import { parseArgs } from "node:util";
import { modelStatus } from "../src/model.js";
import { askSpirit, writeRemembrance } from "../src/spirit.js";
import {
  addMemory,
  createPerson,
  dataDir,
  exportSeed,
  listPeople,
  loadPerson,
  saveRemembrance,
  updatePerson,
} from "../src/store.js";
import { exportOfrenda } from "../src/export.js";

const HELP = `Ofrenda — a local-first remembrance archive

Usage
  ofrenda seed <folder> [--force]        Copy an example altar into ./data
  ofrenda list                           Show the altars on this machine
  ofrenda new "<name>" [options]         Begin an altar
      --born 1938 --died 2019 --relationship "my grandmother"
      --epithet "one line" --food "mole" --song "Amorcito corazón"
      --place "the kitchen" --phrase "¿Ya comiste?"
  ofrenda add <slug> --title "..." --body "..." [--year 1997]
  ofrenda write <slug>                   Write (or rewrite) the remembrance
  ofrenda ask <slug> "question"          Ask the archive a question
  ofrenda export <slug> <folder>         Write a static keepsake
  ofrenda photo <slug> <file.jpg>        Attach a photograph
  ofrenda status                         Is Ollama up? Is the model pulled?

Environment
  OLLAMA_URL          default http://127.0.0.1:11434
  OFRENDA_MODEL       default gemma3:4b (gemma3:1b fits smaller laptops)
  OFRENDA_INFERENCE   local | extract
  OFRENDA_DATA_DIR    default ./data
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    force: { type: "boolean", default: false },
    born: { type: "string" },
    died: { type: "string" },
    relationship: { type: "string" },
    epithet: { type: "string" },
    food: { type: "string", multiple: true },
    song: { type: "string", multiple: true },
    place: { type: "string", multiple: true },
    phrase: { type: "string", multiple: true },
    title: { type: "string" },
    year: { type: "string" },
    body: { type: "string" },
    file: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

const [command, ...rest] = positionals;

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function requirePerson(slug) {
  if (!slug) fail("Which altar? Try `ofrenda list`.");
  const person = loadPerson(slug);
  if (!person) fail(`No altar named "${slug}". Try \`ofrenda list\`.`);
  return person;
}

async function main() {
  if (values.help || !command || command === "help") {
    console.log(HELP);
    return;
  }

  if (command === "status") {
    const status = await modelStatus();
    console.log(`\n  ${status.label}  ${status.available ? "· ready" : "· quoting only"}`);
    console.log(`  ${status.detail}\n`);
    console.log(`  Archive: ${dataDir()}\n`);
    return;
  }

  if (command === "seed") {
    const source = rest[0];
    if (!source) fail("Point me at a folder, e.g. `ofrenda seed examples/elena`.");
    const result = exportSeed(source, { overwrite: values.force });
    if (result.skipped) {
      console.log(`\n  The altar "${result.slug}" already exists. Use --force to replace it.\n`);
      return;
    }
    console.log(`\n  Lit "${result.slug}". Run \`npm start\` and open /p/${result.slug}.\n`);
    return;
  }

  if (command === "list") {
    const people = listPeople();
    if (!people.length) {
      console.log("\n  No altars yet. Try `ofrenda seed examples/elena`.\n");
      return;
    }
    console.log("");
    for (const { profile, memories } of people) {
      const years = [profile.born, profile.died].filter(Boolean).join("–");
      console.log(
        `  ${profile.slug.padEnd(16)} ${profile.name}${years ? `  (${years})` : ""}  · ${memories.length} memories`,
      );
    }
    console.log("");
    return;
  }

  if (command === "new") {
    const name = rest.join(" ").trim();
    if (!name) fail('Give the altar a name: `ofrenda new "Elena Marisol Reyes"`.');
    const profile = createPerson({
      name,
      born: values.born,
      died: values.died,
      relationship: values.relationship,
      epithet: values.epithet,
      foods: values.food,
      songs: values.song,
      places: values.place,
      phrases: values.phrase,
    });
    console.log(`\n  Lit "${profile.slug}". Add a memory:\n`);
    console.log(`    ofrenda add ${profile.slug} --title "The kitchen" --year 1997 --body "..."\n`);
    return;
  }

  if (command === "add") {
    const slug = rest[0];
    requirePerson(slug);
    const body = values.body || (values.file ? fs.readFileSync(values.file, "utf8") : "");
    if (!body.trim()) fail("A memory needs words: --body \"...\" or --file memory.md");
    if (!values.title) fail("Give it a title: --title \"The mole, 1997\".");
    const memory = addMemory(slug, { title: values.title, year: values.year, body });
    console.log(`\n  Kept "${memory.title}" (${memory.id}).\n`);
    return;
  }

  if (command === "write") {
    const slug = rest[0];
    const person = requirePerson(slug);
    if (!person.memories.length) fail("Add a memory first.");
    const remembrance = await writeRemembrance({
      person: person.profile,
      memories: person.memories,
      force: true,
    });
    saveRemembrance(slug, remembrance);
    console.log(`\n${remembrance.text}\n`);
    console.log(`  ${remembrance.mode === "model" ? remembrance.model : "candlelight"} · ${remembrance.sources.length} sources\n`);
    return;
  }

  if (command === "ask") {
    const slug = rest[0];
    const question = rest.slice(1).join(" ");
    const person = requirePerson(slug);
    if (!question) fail(`Ask something: \`ofrenda ask ${slug} "What did she cook?"\``);

    const result = await askSpirit({
      person: person.profile,
      memories: person.memories,
      question,
    });
    console.log(`\n${result.answer}\n`);
    if (result.cites.length) {
      console.log(`  from: ${result.cites.map((cite) => cite.title).join(" · ")}`);
    }
    console.log(`  ${result.confidence} · ${result.label}\n`);
    return;
  }

  if (command === "export") {
    const slug = rest[0];
    const outDir = rest[1];
    requirePerson(slug);
    if (!outDir) fail("Where should it go? e.g. `ofrenda export elena dist/elena`.");
    const result = await exportOfrenda(slug, outDir);
    console.log(`\n  Keepsake written to ${result.file}\n`);
    return;
  }

  if (command === "photo") {
    const slug = rest[0];
    const file = rest[1];
    requirePerson(slug);
    if (!file || !fs.existsSync(file)) fail("Give me a photo that exists.");
    const extension = (file.split(".").pop() || "jpg").toLowerCase();
    const name = `portrait.${extension}`;
    fs.copyFileSync(file, `${dataDir()}/people/${slug}/${name}`);
    updatePerson(slug, { photo: name });
    console.log(`\n  Photo attached to "${slug}".\n`);
    return;
  }

  fail(`Unknown command "${command}". Try \`ofrenda --help\`.`);
}

main().catch((error) => fail(error.message));
