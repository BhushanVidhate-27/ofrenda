import fs from "node:fs";
import path from "node:path";
import { ofrendaPage } from "./render.js";
import { loadPerson, personDir, saveRemembrance } from "./store.js";
import { writeRemembrance } from "./spirit.js";

/**
 * Write a self-contained keepsake: one HTML file, the stylesheet, the paper
 * portrait, and the photograph. It opens from a USB stick, with no server and
 * no network, which is the whole point.
 */
export async function exportOfrenda(slug, outDir) {
  const person = loadPerson(slug);
  if (!person) throw new Error(`No ofrenda named ${slug}.`);

  let remembrance = person.profile.remembrance;
  if (!remembrance?.text) {
    remembrance = await writeRemembrance({
      person: person.profile,
      memories: person.memories,
    });
    saveRemembrance(slug, remembrance);
  }

  const destination = path.resolve(outDir);
  fs.mkdirSync(destination, { recursive: true });

  const markup = ofrendaPage({
    person: person.profile,
    memories: person.memories,
    remembrance,
    status: {
      label: "Static keepsake",
      mode: "extract",
      detail: "Exported from Ofrenda. No model is attached to this file.",
    },
    base: ".",
    staticMode: true,
    home: "./",
  });

  fs.writeFileSync(path.join(destination, "index.html"), markup, "utf8");
  fs.copyFileSync(
    path.resolve(import.meta.dirname, "..", "public", "styles.css"),
    path.join(destination, "styles.css"),
  );

  const assetsSource = path.resolve(import.meta.dirname, "..", "public", "assets");
  const assetsTarget = path.join(destination, "assets");
  fs.mkdirSync(assetsTarget, { recursive: true });
  for (const file of fs.readdirSync(assetsSource)) {
    fs.copyFileSync(path.join(assetsSource, file), path.join(assetsTarget, file));
  }

  if (person.profile.photo) {
    const photoSource = path.join(personDir(slug), person.profile.photo);
    if (fs.existsSync(photoSource)) {
      const photoTarget = path.join(destination, "media", slug);
      fs.mkdirSync(photoTarget, { recursive: true });
      fs.copyFileSync(photoSource, path.join(photoTarget, person.profile.photo));
    }
  }

  return { destination, file: path.join(destination, "index.html") };
}
