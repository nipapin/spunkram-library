(function () {
  const STORAGE_KEY = "spunkram-cep-qa-v1";

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("qa-state-changed"));
  }

  function getState() {
    return loadState();
  }

  function setChecked(id, host, checked) {
    const state = loadState();
    const key = host ? `${id}:${host}` : id;
    if (checked) state[key] = true;
    else delete state[key];
    saveState(state);
  }

  function setNote(id, value) {
    const state = loadState();
    const key = `note:${id}`;
    if (value.trim()) state[key] = value;
    else delete state[key];
    saveState(state);
  }

  function bindPage() {
    const state = loadState();

    document.querySelectorAll('input[type="checkbox"][data-id]').forEach((el) => {
      const id = el.dataset.id;
      const host = el.dataset.host || "";
      const key = host ? `${id}:${host}` : id;
      el.checked = !!state[key];
      el.addEventListener("change", () => setChecked(id, host, el.checked));
    });

    document.querySelectorAll('input[type="text"][data-note-for]').forEach((el) => {
      const id = el.dataset.noteFor;
      el.value = state[`note:${id}`] || "";
      el.addEventListener("input", () => setNote(id, el.value));
    });

    updateProgress();
  }

  function countOnPage() {
    const boxes = document.querySelectorAll('input[type="checkbox"][data-id]');
    let total = 0;
    let done = 0;
    const state = loadState();
    boxes.forEach((el) => {
      total++;
      const key = el.dataset.host ? `${el.dataset.id}:${el.dataset.host}` : el.dataset.id;
      if (state[key]) done++;
    });
    return { total, done };
  }

  function countGlobal() {
    const state = loadState();
    let total = 0;
    let done = 0;
    for (const el of document.querySelectorAll("[data-qa-total]")) {
      total += Number(el.dataset.qaTotal || 0);
    }
    // Count all checkbox keys defined in meta (set on index)
    if (window.QA_TOTAL_ITEMS) total = window.QA_TOTAL_ITEMS;
    Object.keys(state).forEach((k) => {
      if (k.startsWith("note:")) return;
      done++;
    });
    return { total, done: Math.min(done, total) };
  }

  function updateProgress() {
    const page = countOnPage();
    const pct = page.total ? Math.round((page.done / page.total) * 100) : 0;
    const label = document.getElementById("page-progress-label");
    const bar = document.getElementById("page-progress-bar");
    if (label) label.textContent = `${page.done} / ${page.total} (${pct}%)`;
    if (bar) bar.style.width = `${pct}%`;

    document.querySelectorAll("[data-section-progress]").forEach((el) => {
      const section = el.closest("section");
      if (!section) return;
      const boxes = section.querySelectorAll('input[type="checkbox"][data-id]');
      let t = 0;
      let d = 0;
      const state = loadState();
      boxes.forEach((box) => {
        t++;
        const key = box.dataset.host ? `${box.dataset.id}:${box.dataset.host}` : box.dataset.id;
        if (state[key]) d++;
      });
      el.textContent = t ? `${d}/${t}` : "";
    });
  }

  function updateIndexCards() {
    const state = loadState();
    document.querySelectorAll("[data-page-key]").forEach((card) => {
      const keys = (card.dataset.pageKey || "").split(",").filter(Boolean);
      let done = 0;
      keys.forEach((k) => {
        if (state[k]) done++;
      });
      const pctEl = card.querySelector(".pct");
      if (pctEl && keys.length) {
        pctEl.textContent = `${done} / ${keys.length} checked`;
      }
    });

    const globalLabel = document.getElementById("global-progress-label");
    const globalBar = document.getElementById("global-progress-bar");
    if (globalLabel && window.QA_ALL_KEYS) {
      let done = 0;
      window.QA_ALL_KEYS.forEach((k) => {
        if (state[k]) done++;
      });
      const total = window.QA_ALL_KEYS.length;
      const pct = total ? Math.round((done / total) * 100) : 0;
      globalLabel.textContent = `${done} / ${total} (${pct}%)`;
      if (globalBar) globalBar.style.width = `${pct}%`;
    }
  }

  function resetPage() {
    if (!confirm("Сбросить отметки на этой странице?")) return;
    const state = loadState();
    document.querySelectorAll('input[type="checkbox"][data-id]').forEach((el) => {
      const key = el.dataset.host ? `${el.dataset.id}:${el.dataset.host}` : el.dataset.id;
      delete state[key];
      el.checked = false;
    });
    saveState(state);
    updateProgress();
  }

  function resetAll() {
    if (!confirm("Сбросить ВЕСЬ прогресс QA?")) return;
    localStorage.removeItem(STORAGE_KEY);
    document.querySelectorAll('input[type="checkbox"][data-id]').forEach((el) => {
      el.checked = false;
    });
    document.querySelectorAll('input[type="text"][data-note-for]').forEach((el) => {
      el.value = "";
    });
    window.dispatchEvent(new CustomEvent("qa-state-changed"));
    updateProgress();
    updateIndexCards();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(loadState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `spunkram-qa-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  }

  window.QA = {
    bindPage,
    updateIndexCards,
    resetPage,
    resetAll,
    exportJson,
    getState,
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindPage();
    updateIndexCards();
    window.addEventListener("qa-state-changed", () => {
      updateProgress();
      updateIndexCards();
    });

    document.getElementById("btn-reset-page")?.addEventListener("click", resetPage);
    document.getElementById("btn-reset-all")?.addEventListener("click", resetAll);
    document.getElementById("btn-export")?.addEventListener("click", exportJson);
  });
})();

/** Build table rows helper — used inline in HTML generation pattern */
function qaRow(id, text, hosts, tag) {
  const tagHtml = tag ? `<span class="tag ${tag}">${tag.toUpperCase()}</span>` : "";
  const ae =
    hosts === "ae" || hosts === "both"
      ? `<td class="check-col ae"><input type="checkbox" data-id="${id}" data-host="ae" aria-label="AE ${id}"></td>`
      : `<td class="check-col"></td>`;
  const pr =
    hosts === "pr" || hosts === "both"
      ? `<td class="check-col pr"><input type="checkbox" data-id="${id}" data-host="pr" aria-label="PR ${id}"></td>`
      : `<td class="check-col"></td>`;
  return `<tr>
    <td class="id-col">${id}</td>
    <td>${text}${tagHtml}</td>
    ${ae}
    ${pr}
    <td class="notes-col"><input type="text" data-note-for="${id}" placeholder="заметка…"></td>
  </tr>`;
}
