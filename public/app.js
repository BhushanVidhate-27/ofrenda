const $ = (selector, root = document) => root.querySelector(selector);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function chip(cite) {
  return `<li class="chip">${escapeHtml(cite.title)}${
    cite.year ? `<span>${escapeHtml(cite.year)}</span>` : ""
  }</li>`;
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return body;
}

/* ---------- ask the archive ---------- */

const askForm = document.querySelector("[data-ask]");
if (askForm) {
  const slug = askForm.dataset.ask;
  const input = $(".ask__input", askForm);
  const button = $('button[type="submit"]', askForm);
  const panel = $(".answer");
  const textNode = $(".answer__text", panel);
  const meta = $(".answer__meta", panel);

  const ask = async (question) => {
    if (!question.trim()) return;
    input.value = question;
    panel.hidden = false;
    panel.classList.add("is-thinking");
    textNode.textContent = "The archive is listening…";
    meta.innerHTML = "";
    button.disabled = true;
    input.setAttribute("aria-busy", "true");

    try {
      const result = await postJson(`/api/p/${encodeURIComponent(slug)}/ask`, {
        question,
      });
      panel.classList.remove("is-thinking");
      textNode.textContent = result.answer;
      const confidence =
        result.confidence === "unknown"
          ? "not in the archive"
          : result.confidence === "partial"
            ? "partly grounded"
            : "from the archive";
      meta.innerHTML = `
        <span class="confidence ${result.confidence === "unknown" ? "confidence--unknown" : ""}">${confidence}</span>
        ${result.cites?.length ? `<ul class="chips">${result.cites.map(chip).join("")}</ul>` : ""}
        <span class="answer__model">${escapeHtml(result.label || "candlelight")}${result.mode === "extract" ? " · quoted" : ""}</span>
      `;
    } catch (error) {
      panel.classList.remove("is-thinking");
      textNode.textContent = `The archive could not answer: ${error.message}`;
      meta.innerHTML = "";
    } finally {
      button.disabled = false;
      input.removeAttribute("aria-busy");
      input.focus({ preventScroll: true });
    }
  };

  askForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });

  document.querySelectorAll(".suggestion").forEach((suggestion) => {
    suggestion.addEventListener("click", () => ask(suggestion.dataset.q || suggestion.textContent));
  });
}

/* ---------- write the remembrance again ---------- */

const rewrite = document.querySelector("[data-rewrite]");
if (rewrite) {
  rewrite.addEventListener("click", async () => {
    const slug = rewrite.dataset.rewrite;
    const paper = $(".paper");
    const textNode = $(".remembrance__text", paper);
    const foot = $(".gen-meta", paper);
    rewrite.disabled = true;
    rewrite.textContent = "Listening…";

    try {
      const { remembrance } = await postJson(
        `/api/p/${encodeURIComponent(slug)}/remembrance`,
        { force: true },
      );
      textNode.innerHTML = String(remembrance.text)
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
        .join("");

      const sources = $(".remembrance__sources", paper);
      if (remembrance.sources?.length) {
        const chips = `<span class="meta-label">Built from</span><ul class="chips">${remembrance.sources.map(chip).join("")}</ul>`;
        if (sources) sources.innerHTML = chips;
      } else if (sources) {
        sources.remove();
      }

      if (foot) {
        foot.textContent =
          remembrance.mode === "model"
            ? `Written by ${remembrance.model || "a local model"} on this machine`
            : "Assembled by candlelight — no model was available";
      }

      const epithet = $(".epithet");
      if (epithet && remembrance.epithet) epithet.textContent = `“${remembrance.epithet}”`;
    } catch (error) {
      if (foot) foot.textContent = `Could not write it again: ${error.message}`;
    } finally {
      rewrite.disabled = false;
      rewrite.textContent = "Write it again";
    }
  });
}

/* ---------- keep a new memory ---------- */

const memoryForm = document.querySelector("[data-memory]");
const openMemory = document.querySelector("[data-open-memory]");
if (memoryForm) {
  if (openMemory) {
    openMemory.addEventListener("click", () => {
      memoryForm.hidden = !memoryForm.hidden;
      if (!memoryForm.hidden) $('input[name="title"]', memoryForm)?.focus();
    });
  }

  memoryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const slug = memoryForm.dataset.memory;
    const note = $("[data-form-note]", memoryForm);
    const button = $('button[type="submit"]', memoryForm);
    const data = new FormData(memoryForm);

    button.disabled = true;
    if (note) {
      note.classList.remove("is-error");
      note.textContent = "Keeping it…";
    }

    try {
      await postJson(`/api/p/${encodeURIComponent(slug)}/memories`, {
        title: data.get("title"),
        year: data.get("year"),
        body: data.get("body"),
      });
      if (note) note.textContent = "Kept. The archive is learning.";
      window.location.hash = "memories";
      window.location.reload();
    } catch (error) {
      if (note) {
        note.classList.add("is-error");
        note.textContent = error.message;
      }
      button.disabled = false;
    }
  });
}
