import crypto from "node:crypto";

export function slugify(input) {
  return String(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function truncate(text, max = 180) {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > 0 ? at : max).trim()}…`;
}

export function id() {
  return crypto.randomBytes(6).toString("hex");
}

export function nowIso() {
  return new Date().toISOString();
}

export function wordCount(text) {
  return String(text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

// A deliberately small markdown subset: paragraphs, emphasis, blockquotes,
// and line breaks. Everything is escaped first, so a memory can never inject
// markup into the altar.
export function renderProse(markdown) {
  const blocks = String(markdown ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/);

  return blocks
    .map((block) => {
      const escaped = escapeHtml(block).replace(
        /\*\*([^*]+)\*\*/g,
        "<strong>$1</strong>",
      );
      if (escaped.startsWith("&gt; ")) {
        return `<blockquote><p>${escaped.slice(5).replace(/\n/g, "<br>")}</p></blockquote>`;
      }
      return `<p>${escaped.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

export function safeFilename(name) {
  return String(name ?? "").replace(/[^a-zA-Z0-9._-]/g, "").replace(/^\.+/, "");
}
