import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { modelStatus } from "./model.js";
import { askSpirit, writeRemembrance } from "./spirit.js";
import {
  addMemory,
  createPerson,
  dataDir,
  listPeople,
  loadPerson,
  personDir,
  saveRemembrance,
} from "./store.js";
import { errorPage, landingPage, newPage, ofrendaPage } from "./render.js";
import { safeFilename, slugify } from "./util.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY = 256 * 1024;

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "x-frame-options": "DENY",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "cache-control": "no-store",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), {
    "content-type": "application/json; charset=utf-8",
  });
}

function html(res, status, markup) {
  send(res, status, markup, { "content-type": "text/html; charset=utf-8" });
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) {
      const error = new Error("That request is too large.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseBody(raw, contentType = "") {
  if (!raw) return {};
  if (contentType.includes("application/json")) return JSON.parse(raw);
  return Object.fromEntries(new URLSearchParams(raw));
}

function wantsJson(req) {
  return (
    (req.headers["content-type"] || "").includes("application/json") ||
    (req.headers.accept || "").includes("application/json")
  );
}

async function serveStatic(res, relative, cache = "public, max-age=300") {
  const resolved = path.resolve(PUBLIC, relative);
  if (!resolved.startsWith(`${PUBLIC}${path.sep}`) || !fs.existsSync(resolved)) {
    return false;
  }
  const stat = fs.statSync(resolved);
  if (!stat.isFile()) return false;

  send(res, 200, fs.readFileSync(resolved), {
    "content-type": CONTENT_TYPES[path.extname(resolved)] || "application/octet-stream",
    "cache-control": cache,
  });
  return true;
}

async function pageFor(slug) {
  const person = loadPerson(slug);
  if (!person) return null;

  let remembrance = person.profile.remembrance;
  if (!remembrance?.text) {
    remembrance = await writeRemembrance({
      person: person.profile,
      memories: person.memories,
    });
    saveRemembrance(slug, remembrance);
  }

  return { ...person, remembrance };
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = url;
  const method = req.method || "GET";

  if (method === "GET" && pathname === "/styles.css") {
    if (await serveStatic(res, "styles.css")) return;
  }

  if (method === "GET" && pathname === "/app.js") {
    if (await serveStatic(res, "app.js")) return;
  }

  if (method === "GET" && pathname.startsWith("/assets/")) {
    if (await serveStatic(res, pathname.slice(1), "public, max-age=86400")) return;
  }

  if (method === "GET" && pathname.startsWith("/media/")) {
    const [, , rawSlug, rawFile] = pathname.split("/");
    const slug = decodeURIComponent(rawSlug || "");
    const file = safeFilename(decodeURIComponent(rawFile || ""));
    const person = slug && file ? loadPerson(slug) : null;

    if (person && person.profile.photo === file) {
      const resolved = path.join(personDir(slug), file);
      if (fs.existsSync(resolved)) {
        send(res, 200, fs.readFileSync(resolved), {
          "content-type": CONTENT_TYPES[path.extname(resolved)] || "application/octet-stream",
          "cache-control": "public, max-age=3600",
        });
        return;
      }
    }

    return send(res, 404, "Not found", { "content-type": "text/plain; charset=utf-8" });
  }

  if (method === "GET" && pathname === "/api/health") {
    const status = await modelStatus();
    return sendJson(res, 200, {
      ok: true,
      uptimeSeconds: Math.round(process.uptime()),
      dataDir: dataDir(),
      people: listPeople().length,
      model: status,
    });
  }

  if (method === "GET" && (pathname === "/" || pathname === "")) {
    const status = await modelStatus();
    return html(
      res,
      200,
      landingPage({ people: listPeople(), status, base: "" }),
    );
  }

  if (method === "GET" && pathname === "/new") {
    const status = await modelStatus();
    return html(res, 200, newPage({ status, base: "" }));
  }

  if (method === "GET" && pathname.startsWith("/p/")) {
    const slug = decodeURIComponent(pathname.slice(3).replace(/\/+$/, ""));
    const data = await pageFor(slug);
    const status = await modelStatus();

    if (!data) {
      return html(
        res,
        404,
        errorPage({
          code: 404,
          message: "That altar is not on this machine.",
          status,
          base: "",
          home: "/",
        }),
      );
    }

    return html(
      res,
      200,
      ofrendaPage({
        person: data.profile,
        memories: data.memories,
        remembrance: data.remembrance,
        status,
        base: "",
        home: "/",
      }),
    );
  }

  if (method === "POST" && pathname === "/api/people") {
    const raw = await readBody(req);
    const body = parseBody(raw, req.headers["content-type"]);
    const profile = createPerson(body);
    if (body.memory && String(body.memory).trim()) {
      addMemory(profile.slug, {
        title: body.memoryTitle || "The first memory",
        year: body.born || "",
        body: body.memory,
      });
    }

    if (wantsJson(req)) return sendJson(res, 201, { person: profile });
    return send(res, 303, "", { location: `/p/${encodeURIComponent(profile.slug)}` });
  }

  if (method === "POST" && pathname.startsWith("/api/p/")) {
    const parts = pathname.split("/").filter(Boolean); // api, p, slug, action
    const slug = decodeURIComponent(parts[2] || "");
    const action = parts[3];
    const person = loadPerson(slug);

    if (!person) return sendJson(res, 404, { error: "No such altar." });

    const raw = await readBody(req);
    const body = parseBody(raw, req.headers["content-type"]);

    if (action === "ask") {
      const result = await askSpirit({
        person: person.profile,
        memories: person.memories,
        question: body.question,
      });
      return sendJson(res, 200, result);
    }

    if (action === "remembrance") {
      if (person.memories.length === 0) {
        return sendJson(res, 400, {
          error: "Add a memory before asking for a remembrance.",
        });
      }
      const remembrance = await writeRemembrance({
        person: person.profile,
        memories: person.memories,
        force: true,
      });
      saveRemembrance(slug, remembrance);
      return sendJson(res, 200, { remembrance });
    }

    if (action === "memories") {
      if (!String(body.body || "").trim()) {
        return sendJson(res, 400, { error: "A memory needs some words in it." });
      }
      const memory = addMemory(slug, {
        title: body.title,
        year: body.year,
        body: body.body,
      });
      return sendJson(res, 201, { memory });
    }

    return sendJson(res, 404, { error: "Unknown action." });
  }

  if (method === "POST" && pathname === "/api/slug") {
    const body = parseBody(await readBody(req), req.headers["content-type"]);
    return sendJson(res, 200, { slug: slugify(body.name || "") });
  }

  return html(
    res,
    404,
    errorPage({
      code: 404,
      message: "This page is not part of the archive.",
      status: await modelStatus(),
      base: "",
      home: "/",
    }),
  );
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  handle(req, res)
    .catch((error) => {
      console.error(`[ofrenda] ${req.method} ${req.url}`, error);
      if (res.headersSent) return res.end();
      const status = error.status || 500;
      if ((req.headers.accept || "").includes("application/json")) {
        return sendJson(res, status, { error: error.message });
      }
      return html(
        res,
        status,
        errorPage({
          code: status,
          message:
            status === 500
              ? "Something in the archive went quiet. The error is in your terminal."
              : error.message,
          status: { label: "Candlelight mode", mode: "extract", detail: "" },
          base: "",
          home: "/",
        }),
      );
    })
    .finally(() => {
      if (process.env.OFRENDA_LOG !== "off") {
        console.log(
          `[ofrenda] ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`,
        );
      }
    });
});

server.listen(PORT, HOST, () => {
  console.log(`Ofrenda is lit at http://localhost:${PORT}`);
  console.log(`Archive: ${dataDir()}`);
});

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
