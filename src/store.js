import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { id, nowIso, slugify } from "./util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function dataDir() {
  const configured = process.env.OFRENDA_DATA_DIR || "./data";
  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd() || ROOT, configured);
}

export function personDir(slug) {
  return path.join(dataDir(), "people", slug);
}

function ensurePerson(slug) {
  fs.mkdirSync(path.join(personDir(slug), "memories"), { recursive: true });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Frontmatter is only ever flat `key: value` pairs. Keeping the parser small
// means the archive format stays readable in any text editor, forever.
export function parseMemory(raw, fallbackId) {
  const text = String(raw).replace(/\r\n/g, "\n");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  let body = text.trim();

  if (match) {
    body = text.slice(match[0].length).trim();
    for (const line of match[1].split("\n")) {
      const pair = line.match(/^([a-zA-Z][\w-]*)\s*:\s*(.*)$/);
      if (!pair) continue;
      const [, key, rawValue] = pair;
      let value = rawValue.trim();
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value
          .slice(1, -1)
          .split(",")
          .map((part) => part.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else {
        value = value.replace(/^["']|["']$/g, "");
      }
      meta[key] = value;
    }
  }

  return {
    id: meta.id || fallbackId,
    title: meta.title || "Untitled memory",
    year: meta.year ? String(meta.year) : "",
    people: Array.isArray(meta.people) ? meta.people : [],
    body: body.trim(),
  };
}

export function listPeople() {
  const peopleRoot = path.join(dataDir(), "people");
  if (!fs.existsSync(peopleRoot)) return [];

  return fs
    .readdirSync(peopleRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadPerson(entry.name))
    .filter(Boolean)
    .sort((a, b) => a.profile.name.localeCompare(b.profile.name));
}

export function loadPerson(slug) {
  const file = path.join(personDir(slug), "profile.json");
  if (!fs.existsSync(file)) return null;

  const profile = JSON.parse(fs.readFileSync(file, "utf8"));
  const memories = loadMemories(slug);
  return { profile, memories };
}

export function loadMemories(slug) {
  const dir = path.join(personDir(slug), "memories");
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      return parseMemory(raw, path.basename(file, ".md"));
    })
    .sort((a, b) => String(a.year).localeCompare(String(b.year)));
}

export function createPerson(input) {
  const name = String(input.name || "").trim();
  if (!name) throw new Error("A name is required.");

  const slug = slugify(input.slug || name) || `ofrenda-${id()}`;
  ensurePerson(slug);

  const profile = {
    slug,
    name,
    born: String(input.born || "").trim(),
    died: String(input.died || "").trim(),
    relationship: String(input.relationship || "").trim(),
    epithet: String(input.epithet || "").trim(),
    photo: input.photo || null,
    offerings: {
      foods: toList(input.foods),
      songs: toList(input.songs),
      places: toList(input.places),
      phrases: toList(input.phrases),
    },
    remembrance: null,
    createdAt: nowIso(),
  };

  writeJson(path.join(personDir(slug), "profile.json"), profile);
  return profile;
}

export function updatePerson(slug, patch) {
  const existing = loadPerson(slug);
  if (!existing) throw new Error(`No ofrenda named ${slug}.`);
  const profile = { ...existing.profile, ...patch };
  writeJson(path.join(personDir(slug), "profile.json"), profile);
  return profile;
}

export function addMemory(slug, { title, body, year, people }) {
  const existing = loadPerson(slug);
  if (!existing) throw new Error(`No ofrenda named ${slug}.`);

  const memoryId = id();
  const safeTitle = String(title || "").trim() || "Untitled memory";
  const lines = [
    "---",
    `id: ${memoryId}`,
    `title: ${safeTitle}`,
    `year: ${String(year || "").trim()}`,
  ];
  if (Array.isArray(people) && people.length) {
    lines.push(`people: [${people.join(", ")}]`);
  }
  lines.push("---", "", String(body || "").trim(), "");

  fs.writeFileSync(
    path.join(personDir(slug), "memories", `${memoryId}.md`),
    lines.join("\n"),
    "utf8",
  );

  return parseMemory(lines.join("\n"), memoryId);
}

export function saveRemembrance(slug, remembrance) {
  return updatePerson(slug, { remembrance });
}

export function copyMedia(slug, sourceFile, preferredName) {
  ensurePerson(slug);
  const name = preferredName || path.basename(sourceFile);
  const target = path.join(personDir(slug), name);
  fs.copyFileSync(sourceFile, target);
  return name;
}

export function exportSeed(sourceDir, { overwrite = false } = {}) {
  const profileFile = path.join(sourceDir, "profile.json");
  if (!fs.existsSync(profileFile)) {
    throw new Error(`No profile.json in ${sourceDir}`);
  }

  const profile = JSON.parse(fs.readFileSync(profileFile, "utf8"));
  const slug = profile.slug || slugify(profile.name);
  const destination = personDir(slug);

  if (fs.existsSync(destination) && !overwrite) {
    return { slug, skipped: true };
  }

  fs.rmSync(destination, { recursive: true, force: true });
  ensurePerson(slug);

  const memoriesDir = path.join(sourceDir, "memories");
  if (fs.existsSync(memoriesDir)) {
    for (const file of fs.readdirSync(memoriesDir)) {
      if (!file.endsWith(".md")) continue;
      fs.copyFileSync(
        path.join(memoriesDir, file),
        path.join(destination, "memories", file),
      );
    }
  }

  for (const file of fs.readdirSync(sourceDir)) {
    if (file === "profile.json" || file === "memories") continue;
    fs.copyFileSync(path.join(sourceDir, file), path.join(destination, file));
  }

  writeJson(path.join(destination, "profile.json"), {
    ...profile,
    slug,
    remembrance: null,
  });

  return { slug, skipped: false };
}

function toList(value) {
  const raw = Array.isArray(value) ? value : [value];
  return raw
    .flatMap((item) => String(item ?? "").split("\n"))
    .map((item) => item.trim())
    .filter(Boolean);
}
