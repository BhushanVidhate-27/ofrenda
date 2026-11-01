import { escapeHtml, renderProse, truncate } from "./util.js";
import { years } from "./spirit.js";

const PAPEL_COLORS = ["#e0642f", "#d23f6b", "#e9a13b", "#8e4b8f", "#3f8c83"];

function asset(base, path) {
  return `${base}/${path}`.replace(/\/{2,}/g, "/");
}

function layout({ title, description, body, bodyClass = "", base = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta name="theme-color" content="#120d0b">
<link rel="stylesheet" href="${asset(base, "styles.css")}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌼</text></svg>">
</head>
<body class="${bodyClass}">
<div class="glow" aria-hidden="true"></div>
${body}
</body>
</html>`;
}

function papel(base) {
  const panels = Array.from({ length: 24 }, (_, index) => {
    const color = PAPEL_COLORS[index % PAPEL_COLORS.length];
    const x = index * 60;
    return `<g transform="translate(${x} 0)">
      <path d="M0 0h58v44L29 58 0 44Z" fill="${color}" opacity=".92"/>
      <circle cx="29" cy="20" r="6.5" fill="#120d0b"/>
      <path d="M17 33h24M24 38h10" stroke="#120d0b" stroke-width="2" stroke-linecap="round" opacity=".75"/>
    </g>`;
  }).join("");

  return `<div class="papel" aria-hidden="true">
    <svg viewBox="0 0 1440 62" preserveAspectRatio="none" focusable="false">${panels}</svg>
  </div>`;
}

function arch() {
  const dots = [];
  for (let i = 0; i <= 34; i += 1) {
    const angle = Math.PI + (i / 34) * Math.PI;
    const radius = 208;
    const cx = 240 + Math.cos(angle) * radius;
    const cy = 248 + Math.sin(angle) * radius;
    const r = 4 + ((i * 7) % 4);
    const color = i % 3 === 0 ? "#b8452c" : i % 3 === 1 ? "#e9a13b" : "#f3c15b";
    dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="${color}"/>`);
    if (i % 4 === 0) {
      const lx = 240 + Math.cos(angle) * (radius + 16);
      const ly = 248 + Math.sin(angle) * (radius + 16);
      dots.push(
        `<ellipse cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="7" ry="3.4" fill="#4f6b3a" transform="rotate(${((angle * 180) / Math.PI).toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})" opacity=".9"/>`,
      );
    }
  }

  return `<svg class="arch" viewBox="0 0 480 270" aria-hidden="true" focusable="false">
    <path d="M40 248a200 200 0 0 1 400 0" fill="none" stroke="#e9a13b" stroke-opacity=".18" stroke-width="1.5"/>
    ${dots.join("")}
  </svg>`;
}

function candle(modifier = "") {
  return `<div class="candle ${modifier}" aria-hidden="true">
    <span class="candle__glow"></span>
    <span class="candle__flame"></span>
    <span class="candle__wax"></span>
  </div>`;
}

function badge(status) {
  const lit = status.mode === "model";
  return `<span class="badge ${lit ? "badge--model" : "badge--extract"}" title="${escapeHtml(status.detail)}">
    <span class="badge__dot"></span>${escapeHtml(status.label)}
    <span class="badge__sub">${lit ? "local" : "no model"}</span>
  </span>`;
}

function topbar({ base, status, home = "/" }) {
  return `<header class="topbar">
    <div class="topbar__inner wrap">
      <a class="wordmark" href="${home}">Ofrenda<span class="wordmark__dot">·</span></a>
      <span class="topbar__meta">a local-first archive</span>
      ${badge(status)}
    </div>
  </header>`;
}

function siteFoot({ base }) {
  const repo = process.env.OFRENDA_REPO || "https://github.com/BhushanVidhate-27/ofrenda";
  return `<footer class="site-foot wrap">
    <p><strong>Ofrenda</strong> keeps family stories on the machine that holds them. No account, no upload, no analytics.</p>
    <p class="site-foot__fine">Open-weight model via <a href="https://ollama.com">Ollama</a> · <a href="https://ai.google.dev/gemma">Gemma</a> · MIT licensed · <a href="${repo}#how-it-works">How it works</a></p>
  </footer>`;
}

function offeringIcon(kind) {
  const icons = {
    food: `<path d="M6 20h20M9 20a7 7 0 0 1 14 0M12 8c0-2 2-2 2-4M18 9c0-1.6 1.6-1.6 1.6-3.2"/>`,
    song: `<path d="M14 22V8l10-2v14"/><circle cx="11" cy="22" r="3"/><circle cx="21" cy="20" r="3"/>`,
    place: `<path d="M20 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="20" cy="10" r="2.6"/>`,
    phrase: `<path d="M9 11H5.5A2.5 2.5 0 0 0 3 13.5V18h5v-4H6m16-3h-3.5A2.5 2.5 0 0 0 16 13.5V18h5v-4h-2"/>`,
  };
  return `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[kind]}</svg>`;
}

function offeringCards(person) {
  const offerings = person.offerings || {};
  const groups = [
    { kind: "food", label: "Comida", items: offerings.foods },
    { kind: "song", label: "Canción", items: offerings.songs },
    { kind: "place", label: "Lugar", items: offerings.places },
    { kind: "phrase", label: "Palabra", items: offerings.phrases },
  ].filter((group) => group.items?.length);

  if (!groups.length) return "";

  return `<ul class="offerings">
    ${groups
      .map(
        (group) => `<li class="offering">
          <span class="offering__icon">${offeringIcon(group.kind)}</span>
          <span class="offering__label">${group.label}</span>
          <span class="offering__value">${group.items.map((item) => escapeHtml(item)).join("<br>")}</span>
        </li>`,
      )
      .join("")}
  </ul>`;
}

function chipList(sources) {
  if (!sources?.length) return "";
  return `<ul class="chips">${sources
    .map(
      (source) =>
        `<li class="chip">${escapeHtml(source.title)}${source.year ? `<span>${escapeHtml(source.year)}</span>` : ""}</li>`,
    )
    .join("")}</ul>`;
}

function remembranceSection(person, remembrance, { staticMode }) {
  const body = remembrance?.text
    ? String(remembrance.text)
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("")
    : "<p>The remembrance has not been written yet.</p>";

  const modeLabel =
    remembrance?.mode === "model"
      ? `Written by ${remembrance.model || "a local model"} on this machine`
      : remembrance?.mode === "template"
        ? "Assembled by candlelight — no model was available"
        : "";

  return `<section class="section wrap" id="remembrance">
    <div class="section-head">
      <p class="eyebrow">La remembranza</p>
      <h2>What the archive remembers</h2>
    </div>
    <article class="paper">
      <div class="remembrance__text">${body}</div>
      ${
        remembrance?.sources?.length
          ? `<div class="remembrance__sources"><span class="meta-label">Built from</span>${chipList(remembrance.sources)}</div>`
          : ""
      }
      <div class="remembrance__foot">
        <span class="gen-meta">${escapeHtml(modeLabel)}</span>
        ${staticMode ? "" : `<button class="btn btn--ghost" type="button" data-rewrite="${escapeHtml(person.slug)}">Write it again</button>`}
      </div>
    </article>
  </section>`;
}

function askSection(person, { staticMode, status }) {
  if (staticMode) {
    return `<section class="section wrap" id="ask">
      <div class="section-head">
        <p class="eyebrow">Pregúntale al archivo</p>
        <h2>Ask the archive</h2>
      </div>
      <div class="notice">This is a static keepsake. Run <code>npm start</code> with Ollama to ask the archive questions; it answers from these memories only.</div>
    </section>`;
  }

  return `<section class="section wrap" id="ask">
    <div class="section-head">
      <p class="eyebrow">Pregúntale al archivo</p>
      <h2>Ask the archive</h2>
      <p class="section-lede">It speaks from these memories, not from beyond them. If the answer is not written down, it says so.</p>
    </div>
    <div class="ask">
      <form class="ask__form" data-ask="${escapeHtml(person.slug)}">
        <label class="sr-only" for="question">Your question</label>
        <input id="question" name="question" class="ask__input" type="text" maxlength="500" autocomplete="off"
          placeholder="What did she cook when the power went out?" required>
        <button class="btn btn--primary" type="submit">Ask</button>
      </form>
      <div class="suggestions" aria-label="Example questions">
        <button type="button" class="suggestion" data-q="What did she cook when the power went out?">What did she cook?</button>
        <button type="button" class="suggestion" data-q="What did she say about sorrow?">What did she say about sorrow?</button>
        <button type="button" class="suggestion" data-q="Where did the marigolds come from?">Where did the marigolds come from?</button>
      </div>
      <div class="answer" data-answer hidden aria-live="polite">
        <p class="answer__text"></p>
        <div class="answer__meta"></div>
      </div>
      <p class="ask__note">${escapeHtml(status.detail)}</p>
    </div>
  </section>`;
}

function memoryCard(memory) {
  return `<article class="memory" id="memory-${escapeHtml(memory.id)}">
    <div class="memory__top">
      <span class="memory__year">${escapeHtml(memory.year || "undated")}</span>
      <span class="memory__mark" aria-hidden="true">✦</span>
    </div>
    <h3 class="memory__title">${escapeHtml(memory.title)}</h3>
    <div class="memory__body">${renderProse(memory.body)}</div>
  </article>`;
}

function memoriesSection(person, memories, { staticMode }) {
  return `<section class="section wrap" id="memories">
    <div class="section-head section-head--row">
      <div>
        <p class="eyebrow">Las memorias</p>
        <h2>${memories.length} ${memories.length === 1 ? "memory" : "memories"}, kept here</h2>
      </div>
      ${
        staticMode
          ? ""
          : `<button class="btn btn--ghost" type="button" data-open-memory>Add a memory</button>`
      }
    </div>
    ${
      staticMode
        ? ""
        : `<form class="memory-form" data-memory="${escapeHtml(person.slug)}" hidden>
      <div class="memory-form__grid">
        <label class="field"><span>Title</span><input name="title" maxlength="120" required placeholder="The mole, 1997"></label>
        <label class="field field--year"><span>Year</span><input name="year" maxlength="12" placeholder="1997"></label>
      </div>
      <label class="field"><span>The memory</span><textarea name="body" rows="5" required placeholder="One specific thing. What was said, what it smelled like, who was there."></textarea></label>
      <div class="memory-form__foot">
        <button class="btn btn--primary" type="submit">Keep it</button>
        <span class="form-note" data-form-note>Saved to this machine only.</span>
      </div>
    </form>`
    }
    ${
      memories.length
        ? `<div class="memories">${memories.map(memoryCard).join("")}</div>`
        : `<div class="notice">No memories yet. The altar is patient.</div>`
    }
  </section>`;
}

export function ofrendaPage({ person, memories, remembrance, status, base = "", staticMode = false, home = "/" }) {
  const yearsLabel = years(person);
  const epithet = person.epithet || remembrance?.epithet || "";
  const photo = person.photo
    ? `${base}/media/${encodeURIComponent(person.slug)}/${encodeURIComponent(person.photo)}`
    : asset(base, "assets/portrait.svg");

  const body = `${papel(base)}
  ${topbar({ base, status, home })}
  <main>
    <section class="hero wrap">
      <p class="eyebrow">${escapeHtml(person.relationship || "an altar")}</p>
      <h1>${escapeHtml(person.name)}</h1>
      ${yearsLabel ? `<p class="years">${escapeHtml(yearsLabel)}</p>` : ""}
      ${epithet ? `<p class="epithet">“${escapeHtml(epithet)}”</p>` : ""}
    </section>

    <section class="altar-section" aria-label="The ofrenda">
      <div class="altar">
        ${arch()}
        <div class="altar__row">
          ${candle("candle--tall")}
          <figure class="portrait">
            <span class="portrait__frame">
              <img src="${photo}" alt="${person.photo ? `Photograph of ${escapeHtml(person.name)}` : "A paper portrait placeholder"}" loading="eager">
            </span>
            ${yearsLabel ? `<figcaption>${escapeHtml(yearsLabel)}</figcaption>` : ""}
          </figure>
          ${candle("candle--tall")}
        </div>
        ${offeringCards(person)}
        <p class="altar__whisper" aria-hidden="true">la luz se queda encendida</p>
      </div>
    </section>

    ${remembranceSection(person, remembrance, { staticMode })}
    ${askSection(person, { staticMode, status })}
    ${memoriesSection(person, memories, { staticMode })}
  </main>
  ${siteFoot({ base })}
  ${staticMode ? "" : `<script src="${asset(base, "app.js")}" defer></script>`}`;

  return layout({
    title: `${person.name} · Ofrenda`,
    description: truncate(epithet || `A local-first remembrance archive for ${person.name}.`, 150),
    body,
    bodyClass: "page-altar",
    base,
  });
}

export function landingPage({ people, status, base = "", home = "/" }) {
  const list = people.length
    ? `<ul class="altar-list">${people
        .map(({ profile, memories }) => {
          const label = years(profile);
          return `<li class="altar-card">
            <a href="${home}p/${encodeURIComponent(profile.slug)}">
              <span class="altar-card__eyebrow">${escapeHtml(profile.relationship || "an altar")}</span>
              <span class="altar-card__name">${escapeHtml(profile.name)}</span>
              <span class="altar-card__years">${escapeHtml(label || "—")}</span>
              <span class="altar-card__count">${memories.length} ${memories.length === 1 ? "memory" : "memories"}</span>
              <span class="altar-card__arrow" aria-hidden="true">→</span>
            </a>
          </li>`;
        })
        .join("")}</ul>`
    : `<p class="landing__empty">No altars yet. The first one takes a name and one memory.</p>`;

  const body = `${papel(base)}
  ${topbar({ base, status, home })}
  <main class="landing wrap">
    <section class="landing__hero">
      <div>
        <p class="eyebrow">Ghost in the machine · a local archive</p>
        <h1 class="landing__title">The people you carry,<br>kept in their own words.</h1>
        <p class="landing__lede">Ofrenda is an altar you can run on a laptop. Write down the small, specific things. A local open-weight model helps you say them out loud — and answers only from what you wrote.</p>
        <div class="landing__actions">
          <a class="btn btn--primary" href="${home}new">Begin an ofrenda</a>
          <a class="btn btn--ghost" href="${home}p/elena">See the demo altar</a>
        </div>
        <ul class="facts">
          <li><strong>No account.</strong> The archive is a folder of Markdown and JSON.</li>
          <li><strong>No upload.</strong> Gemma runs through Ollama on your machine.</li>
          <li><strong>No guessing.</strong> The archive cites the memories it used.</li>
        </ul>
      </div>
      <div class="landing__altar" aria-hidden="true">
        ${arch()}
        <div class="landing__candles">${candle()}${candle()}${candle()}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-head section-head--row">
        <div>
          <p class="eyebrow">Los altares</p>
          <h2>Altars on this machine</h2>
        </div>
      </div>
      ${list}
    </section>
  </main>
  ${siteFoot({ base })}`;

  return layout({
    title: "Ofrenda · a local-first archive for the people you carry",
    description:
      "A local-first remembrance archive. Family stories live in Markdown on your machine; an open-weight Gemma model helps them speak.",
    body,
    bodyClass: "page-landing",
    base,
  });
}

export function newPage({ status, base = "", home = "/" }) {
  const body = `${papel(base)}
  ${topbar({ base, status, home })}
  <main class="wrap form-page">
    <p class="eyebrow">A new altar</p>
    <h1>Who are you keeping?</h1>
    <p class="section-lede">Start with a name. You can add memories, a photograph, and the offerings later. Everything is written to a folder on this machine.</p>
    <form class="form-card" method="post" action="${home}api/people">
      <label class="field"><span>Name</span><input name="name" required maxlength="120" placeholder="Elena Marisol Reyes" autofocus></label>
      <div class="form-card__row">
        <label class="field"><span>Born</span><input name="born" maxlength="20" placeholder="1938"></label>
        <label class="field"><span>Died</span><input name="died" maxlength="20" placeholder="2019"></label>
        <label class="field"><span>They were my…</span><input name="relationship" maxlength="60" placeholder="grandmother"></label>
      </div>
      <label class="field"><span>One line for the altar <em>(optional)</em></span><input name="epithet" maxlength="140" placeholder="She kept the marigolds alive in winter."></label>
      <label class="field"><span>First memory <em>(optional)</em></span><textarea name="memory" rows="5" placeholder="One specific thing. The mole she burned on purpose. The song she sang while ironing."></textarea></label>
      <div class="form-card__foot">
        <button class="btn btn--primary" type="submit">Light it</button>
        <a class="btn btn--ghost" href="${home}">Not yet</a>
      </div>
    </form>
  </main>
  ${siteFoot({ base })}`;

  return layout({
    title: "Begin an ofrenda · Ofrenda",
    description: "Start a private, local remembrance archive.",
    body,
    bodyClass: "page-form",
    base,
  });
}

export function errorPage({ message, status, base = "", home = "/", code = 404 }) {
  const body = `${topbar({ base, status, home })}
  <main class="wrap form-page">
    <p class="eyebrow">${code}</p>
    <h1>${escapeHtml(message)}</h1>
    <p class="section-lede">Nothing was lost. The archive is a folder; you can look inside it.</p>
    <a class="btn btn--primary" href="${home}">Back to the altars</a>
  </main>
  ${siteFoot({ base })}`;

  return layout({
    title: `${code} · Ofrenda`,
    description: message,
    body,
    bodyClass: "page-form",
    base,
  });
}

export { layout, papel, arch, candle, asset };
