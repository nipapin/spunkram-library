import { NATIVE_BACKUP_DIR, PENDING_SUFFIX } from "./update-backup-path";

export const SWAP_PAGE_NAME = "_mf_swap.html";

/** CEP `getSystemPath("extension")` is a filesystem path; CEF needs file://. */
export function pathToFileUrl(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const withRoot = /^[A-Za-z]:/.test(normalized)
    ? `/${normalized}`
    : normalized.startsWith("/")
      ? normalized
      : `/${normalized}`;
  return encodeURI(`file://${withRoot}`);
}

/**
 * Tiny Node-enabled page: CEF has left the old index.html, so pending
 * HTML/JS/CSS can be renamed into place, then we load the real panel.
 */
export function buildSwapHtml(extRoot: string, destRel: string): string {
  const destAbs = extRoot.replace(/[\\/]+$/, "") + "/" + destRel.replace(/^[./\\]+/, "").replace(/\\/g, "/");
  const destUrl = pathToFileUrl(destAbs);
  const rootJson = JSON.stringify(extRoot);
  const destJson = JSON.stringify(destUrl);
  const pendingJson = JSON.stringify(PENDING_SUFFIX);
  const trashJson = JSON.stringify(NATIVE_BACKUP_DIR);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Updating…</title>
</head>
<body>
<script>
(function () {
  var dest = ${destJson};
  var root = ${rootJson};
  var PENDING = ${pendingJson};
  var TRASH = ${trashJson};
  function go() {
    try {
      var u = dest + (dest.indexOf("?") >= 0 ? "&" : "?") + "_cep_upd=" + Date.now();
      window.location.replace(u);
    } catch (e) {
      try { window.location.href = dest; } catch (e2) {}
    }
  }
  try {
    var req = typeof require === "function"
      ? require
      : (window.cep_node && window.cep_node.require);
    var fs = req("fs");
    var path = req("path");
    function walk(dir, out) {
      var names;
      try { names = fs.readdirSync(dir); } catch (e) { return; }
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name === TRASH) continue;
        var full = path.join(dir, name);
        var st;
        try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) walk(full, out);
        else if (name.length > PENDING.length && name.slice(-PENDING.length) === PENDING) {
          out.push(full.slice(0, -PENDING.length));
        }
      }
    }
    var lives = [];
    walk(root, lives);
    for (var j = 0; j < lives.length; j++) {
      var live = lives[j];
      var pending = live + PENDING;
      if (!fs.existsSync(pending)) continue;
      try {
        if (fs.existsSync(live)) {
          var trashDir = path.join(path.dirname(live), TRASH);
          try { fs.mkdirSync(trashDir, { recursive: true }); } catch (e) {}
          var backup = path.join(trashDir, path.basename(live) + "." + Date.now());
          try { fs.renameSync(live, backup); } catch (e) { continue; }
          try { fs.unlinkSync(backup); } catch (e) {}
        }
        fs.renameSync(pending, live);
      } catch (e) {
        try {
          fs.copyFileSync(pending, live);
          try { fs.unlinkSync(pending); } catch (e2) {}
        } catch (e3) {}
      }
    }
  } catch (e) {}
  go();
})();
</script>
</body>
</html>
`;
}
