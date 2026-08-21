/**
 * Generate QA HTML section pages. Run: node docs/qa/build-pages.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function row(id, text, hosts) {
  const ae =
    hosts === "ae" || hosts === "both"
      ? `<td class="check-col"><input type="checkbox" data-id="${id}" data-host="ae"></td>`
      : `<td class="check-col"></td>`;
  const pr =
    hosts === "pr" || hosts === "both"
      ? `<td class="check-col"><input type="checkbox" data-id="${id}" data-host="pr"></td>`
      : `<td class="check-col"></td>`;
  const tag =
    hosts === "ae"
      ? ' <span class="tag ae">AE</span>'
      : hosts === "pr"
        ? ' <span class="tag pr">PR</span>'
        : "";
  return `<tr><td class="id-col">${id}</td><td>${text}${tag}</td>${ae}${pr}<td class="notes-col"><input type="text" data-note-for="${id}"></td></tr>`;
}

function section(title, items) {
  const body = items.map(([id, text, hosts = "both"]) => row(id, text, hosts)).join("\n          ");
  return `<section>
      <h2>${title} <span data-section-progress></span></h2>
      <table class="qa">
        <thead><tr><th>ID</th><th>Тест</th><th class="check-col ae">AE</th><th class="check-col pr">PR</th><th>Заметки</th></tr></thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    </section>`;
}

function page(filename, title, sections) {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>QA — ${title}</title>
  <link rel="stylesheet" href="assets/qa.css">
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div>
        <h1><a href="index.html">← QA</a> · ${title}</h1>
        <p class="meta" id="page-progress-label">0 / 0</p>
        <div class="progress-bar"><span id="page-progress-bar"></span></div>
      </div>
      <div class="actions">
        <button type="button" id="btn-reset-page">Сброс страницы</button>
      </div>
    </header>
    ${sections.join("\n\n    ")}
  </div>
  <script src="assets/qa-keys.js"></script>
  <script src="assets/qa.js"></script>
</body>
</html>`;
  fs.writeFileSync(path.join(__dirname, filename), html, "utf8");
  console.log("wrote", filename);
}

page("market.html", "Market", [
  section("Каталог", [
    ["M-01", "Загрузка GET /api/cep/market?host= — только паки своего хоста"],
    ["M-02", "Loading spinner"],
    ["M-03", "Error + Retry"],
    ["M-04", "Empty state для хоста"],
    ["M-05", "Subscribe banner ($9.9/mo)"],
    ["M-06", "Card: Owned / Free / In subscription"],
    ["M-07", "Version badge, installed badge, active ring"],
    ["M-08", "Play preview (YouTube video_id)"],
    ["M-09", "Details → details_url в браузере"],
    ["M-10", "Web store footer link"],
  ]),
  section("Действия на карточке", [
    ["M-20", "Install / Get Free (action с сервера)"],
    ["M-21", "Buy → buy_url или subscribe"],
    ["M-22", "Update когда version &lt; market"],
    ["M-23", "Switch → select pack"],
    ["M-24", "Active disabled для текущего пака"],
    ["M-25", "Remove (uninstall + clear active)"],
    ["M-26", "Install progress + cancel (X)"],
    ["M-27", "Failed job: error + Retry"],
  ]),
  section("Install flow", [
    ["M-30", "Packages path dialog на первом install"],
    ["M-31", "Install в {root}/AE/ или {root}/PR/"],
    ["M-32", "Bearer download → zip → install; 403 NOT_OWNED"],
    ["M-33", "useWhenReady: register + select pack"],
    ["M-34", "Wrong-host pack rejected"],
    ["M-35", "WSS pack.created/updated → refresh + toast"],
    ["M-36", "Manual folder scan в Settings"],
  ]),
]);

page("editing.html", "Editing", [
  section("Entitlement", [
    ["E-01", "Purchase gate → Upgrade Account"],
    ["E-02", "Free plan banner"],
    ["E-03", "Premium lock на items без subscription"],
  ]),
  section("Toolbar & Sidebar", [
    ["E-10", "Active pack name"],
    ["E-11", "Find items search (global)"],
    ["E-12", "Favorites filter"],
    ["E-20", "Category tree + icons"],
    ["E-21", "Expand/collapse folders"],
    ["E-22", "Select category → filter grid"],
    ["E-23", "Resizable sidebar (persisted)"],
    ["E-24", "Last category per pack persisted"],
    ["E-25", "Focus mode hides sidebar"],
  ]),
  section("Footage grid", [
    ["E-30", "Thumbnail grid + aspect ratio"],
    ["E-31", "Hover preview webm/mp4/gif"],
    ["E-32", "AutoPlay all in-view (muted)"],
    ["E-33", "Hover-only preview when AutoPlay off"],
    ["E-34", "Audio items: hover preview + audio toggle"],
    ["E-35", "Favorite star persisted"],
    ["E-36", "NEW badge toggle"],
    ["E-37", "Double-click / Enter / Space → apply"],
    ["E-38", "Apply spinner on card"],
    ["E-39", "Success toast Applied"],
    ["E-40", "Errors: no seq/comp, missing file, wrong host"],
    ["E-41", "Skeleton for 64+ items"],
    ["E-42", "Leave panel stops hover playback"],
  ]),
  section("Footer", [
    ["E-50", "Play preview toggle"],
    ["E-51", "Audio toggle"],
    ["E-52", "NEW badges switch"],
    ["E-53", "Hovered item name hint"],
    ["E-54", "Fit thumbnails"],
    ["E-55", "Focus mode toggle"],
    ["E-56", "Thumbnail size slider"],
  ]),
  section("Pack errors", [
    ["E-60", "Corrupt/missing pack error"],
    ["E-61", "Uninstall last pack → Market tab"],
    ["E-62", "Rescan on auth/purchase change"],
  ]),
  section("Apply by type", [
    ["M-40", "FULL_PROJECT (.prproj) copy-paste + Motionflow.dll", "pr"],
    ["M-41", "MOGRT importMGT", "pr"],
    ["M-41", "MOGRT blocked in AE (MOGRT_NOT_SUPPORTED)", "ae"],
    ["M-42", "AEP/PROJECT applyComp pipeline", "ae"],
    ["M-43", "AUDIO import + place timeline", "both"],
    ["M-44", "FOOTAGE import + place", "both"],
    ["M-45", "FULL_PROJECT requires active sequence", "pr"],
    ["M-46", "AEP requires active composition", "ae"],
    ["M-47", "MOGRT at playhead on timeline", "pr"],
    ["M-48", "software_id mismatch → NO_SUPPORT_APP"],
  ]),
]);

page("captions.html", "Captions", [
  section("AI Tools hub", [
    ["AI-01", "Generations left counter + bar"],
    ["AI-04", "Tool cards: Captions / Chapters / Voiceover"],
    ["AI-05", "Tools disabled when totalLeft &lt;= 0"],
    ["AI-06", "Sub-shell: Back, title, gens count"],
    ["AI-08", "Credits refresh after generation event"],
  ]),
  section("Landing", [
    ["CAP-01", "PresetGrid browse/select"],
    ["CAP-02", "Source language"],
    ["CAP-03", "Translate-to (off = none)"],
    ["CAP-04", "Transcribe (N) — cost from In/Out / Work Area"],
    ["CAP-05", "Load from existing caption on timeline"],
    ["CAP-06", "Progress: Rendering → Converting → Transcribing → Creating"],
    ["CAP-07", "Cancel transcribe (quiet)"],
    ["CAP-08", "No generations left error"],
    ["CAP-09", "No speech in range error"],
  ]),
  section("Editor", [
    ["CAP-10", "Tabs Transcribe | Styles"],
    ["CAP-11", "Back → landing (data kept)"],
    ["CAP-12", "Caption list timestamps"],
    ["CAP-13", "Click caption → seek playhead"],
    ["CAP-14", "Auto-sync highlight with playhead"],
    ["CAP-15", "Edit text → live update on timeline"],
    ["CAP-16", "Word menu: split, merge, move"],
    ["CAP-17", "Re-segment Words / Custom"],
    ["CAP-18", "Custom: Lines + Chars sliders"],
    ["CAP-19", "Update → resegment on host"],
    ["CAP-20", "Session JSON → marker (debounced)"],
  ]),
  section("Host-specific", [
    ["CAP-AE-01", "Captions on comp layer (compId)", "ae"],
    ["CAP-AE-02", "Sync only in source comp", "ae"],
    ["CAP-AE-03", "Style .aep path", "ae"],
    ["CAP-PR-01", "Captions on video track", "pr"],
    ["CAP-PR-02", "Requires .mogrt style — clear error", "pr"],
    ["CAP-PR-03", "Audio export: .epr preset or bundled WAV", "pr"],
    ["CAP-PR-04", "Load single caption MOGRT from timeline", "pr"],
  ]),
]);

page("styles.html", "Captions Styles", [
  section("Preset grid", [
    ["ST-01", "Catalog sync from CDN/API"],
    ["ST-02", "Sections + Users custom presets"],
    ["ST-03", "Search, favorites, tag chips"],
    ["ST-04", "Select → download on Transcribe"],
    ["ST-05", "Card: thumb, video, favorite, delete user preset"],
    ["ST-06", "Refresh catalog & project files"],
    ["ST-07", "Loading / error states"],
    ["ST-08", "Update available pill on version bump"],
  ]),
  section("Styles tab", [
    ["ST-10", "Change Preset dialog"],
    ["ST-11", "PresetFields: sliders, colors, FontPicker"],
    ["ST-12", "Live apply to host MOGRT/AEP"],
    ["ST-13", "Reset to origin"],
    ["ST-14", "Save as new user preset"],
    ["ST-15", "Rename when dirty"],
    ["ST-16", "Style undo coalescing on sliders"],
    ["ST-17", "Download pipeline on Transcribe"],
    ["ST-18", "Auth errors on style download"],
  ]),
  section("Host assets", [
    ["ST-AE-01", "Prefers .aep for apply/create", "ae"],
    ["ST-PR-01", "Requires .mogrt", "pr"],
    ["ST-PR-02", "Re-download if host file missing", "pr"],
  ]),
]);

page("chapters.html", "Chapters", [
  section("Landing", [
    ["CH-01", "Intro when no history"],
    ["CH-02", "History list (max 20): open, delete"],
    ["CH-03", "Language + translate"],
    ["CH-04", "Generate (N) — work range cost"],
    ["CH-05", "Progress through Summarizing"],
  ]),
  section("Results", [
    ["CH-10", "Titles: edit + regenerate"],
    ["CH-11", "Description: edit + regenerate"],
    ["CH-12", "Tags: edit, #normalize, regenerate"],
    ["CH-13", "Chapters: edit time/title, add, delete"],
    ["CH-14", "YouTube min chapters warning"],
    ["CH-15", "Copy chapters (timestamps only)"],
    ["CH-16", "Copy Description (full block)"],
    ["CH-17", "Add Markers on timeline/comp"],
    ["CH-18", "Back / Close preserves history"],
    ["CH-19", "Regenerate disabled without gens"],
  ]),
]);

page("voiceover.html", "Voiceover", [
  section("Generate", [
    ["VO-01", "Script textarea"],
    ["VO-02", "Language dropdown"],
    ["VO-03", "Voice dropdown + sample preview"],
    ["VO-04", "Emotion dropdown"],
    ["VO-05", "Speed / Volume / Pitch sliders"],
    ["VO-06", "Generate (N) — cost by text length"],
    ["VO-07", "Out-of-credits disabled state"],
  ]),
  section("History & import", [
    ["VO-08", "History overlay (max 30) + waveform"],
    ["VO-09", "Add to timeline"],
    ["VO-10", "Add to project bin"],
    ["VO-11", "Re-download if file missing"],
    ["VO-12", "NO_ACTIVE_SEQUENCE / NO_ACTIVE_COMP errors"],
  ]),
]);

page("footages.html", "Footages", [
  section("Browse & search", [
    ["F-01", "Type: Image / Video"],
    ["F-02", "Import to: Timeline / Project"],
    ["F-03", "Orientation filter"],
    ["F-04", "Search (debounced)"],
    ["F-05", "Infinite scroll (max 10 pages)"],
    ["F-06", "Skeleton on first load"],
    ["F-07", "Error + retry"],
    ["F-08", "Hover video preview (Pexels)"],
  ]),
  section("Import", [
    ["F-09", "Import → /api/stock/download Bearer"],
    ["F-10", "Quality menu (image/video resolutions)"],
    ["F-11", "Cached file skip re-download"],
    ["F-12", "Assets path or picker on first download"],
    ["F-13", "Use project location override"],
    ["F-14", "Media preview dialog"],
    ["F-15", "Author attribution"],
    ["F-16", "Download progress bar"],
    ["F-17", "importMedia success in host"],
  ]),
]);

console.log("Done.");
