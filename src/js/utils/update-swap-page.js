import { NATIVE_BACKUP_DIR, PENDING_SUFFIX } from "./update-backup-path";
export const SWAP_PAGE_NAME = "_mf_swap.html";
export const PENDING_MARKER = "pending-native-update.json";
export const INSTALLED_UPDATE_FILE = "installed-update.json";
/** CEP `getSystemPath("extension")` is a filesystem path; CEF needs file://. */
export function pathToFileUrl(absPath) {
    const normalized = absPath.replace(/\\/g, "/");
    const withRoot = /^[A-Za-z]:/.test(normalized)
        ? `/${normalized}`
        : normalized.startsWith("/")
            ? normalized
            : `/${normalized}`;
    return encodeURI(`file://${withRoot}`);
}
/**
 * Tiny Node-enabled page: CEF has left the old index.html, so HTML/JS can
 * be overwritten. Copies the extracted payload, then loads the real panel.
 */
export function buildSwapHtml(extRootOrOpts, destRelArg) {
    const opts = typeof extRootOrOpts === "string"
        ? { extRoot: extRootOrOpts, destRel: destRelArg || "index.html" }
        : extRootOrOpts;
    const destAbs = opts.extRoot.replace(/[\\/]+$/, "") +
        "/" +
        opts.destRel.replace(/^[./\\]+/, "").replace(/\\/g, "/");
    const destUrl = pathToFileUrl(destAbs);
    const rootJson = JSON.stringify(opts.extRoot);
    const destJson = JSON.stringify(destUrl);
    const pendingJson = JSON.stringify(PENDING_SUFFIX);
    const trashJson = JSON.stringify(NATIVE_BACKUP_DIR);
    const swapJson = JSON.stringify(SWAP_PAGE_NAME);
    const markerJson = JSON.stringify(PENDING_MARKER);
    const stampJson = JSON.stringify(INSTALLED_UPDATE_FILE);
    const payloadJson = JSON.stringify(opts.payloadRoot || "");
    const workJson = JSON.stringify(opts.workDir || "");
    const versionJson = JSON.stringify(opts.appliedVersion || "");
    const appliedStampJson = JSON.stringify(opts.appliedStampPath || "");
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
  var SWAP = ${swapJson};
  var MARKER = ${markerJson};
  var STAMP = ${stampJson};
  var payload = ${payloadJson};
  var workDir = ${workJson};
  var version = ${versionJson};
  var appliedStampPath = ${appliedStampJson};
  function go() {
    try {
      var u = dest + (dest.indexOf("?") >= 0 ? "&" : "?") + "_cep_upd=" + Date.now();
      window.location.replace(u);
    } catch (e) {
      try { window.location.href = dest; } catch (e2) {}
    }
  }
  function busy(err) {
    if (!err) return false;
    var code = String(err.code || "");
    if (code === "EBUSY" || code === "EPERM" || code === "EACCES") return true;
    var n = Number(err.errno);
    if (n === -4048 || n === -4082 || n === -4092 || n === 4058) return true;
    var msg = String(err.message || err);
    return /EPERM|EBUSY|EACCES|not permitted|resource busy|being used by another process|locked/i.test(msg);
  }
  function skipName(name) {
    if (!name) return true;
    if (name === TRASH || name === SWAP || name === MARKER || name === STAMP) return true;
    if (name.indexOf(".update-old") >= 0) return true;
    if (name.length >= PENDING.length && name.slice(-PENDING.length) === PENDING) return true;
    return false;
  }
  try {
    var req = typeof require === "function"
      ? require
      : (window.cep_node && window.cep_node.require);
    var fs = req("fs");
    var path = req("path");
    function exists(p) {
      try { return fs.existsSync(p); } catch (e) { return false; }
    }
    function rm(p) {
      if (!exists(p)) return;
      try { fs.rmSync(p, { recursive: true, force: true }); return; } catch (e) {}
      try {
        var st = fs.statSync(p);
        if (st.isDirectory()) {
          var names = fs.readdirSync(p);
          for (var i = 0; i < names.length; i++) rm(path.join(p, names[i]));
          try { fs.rmdirSync(p); } catch (e2) {}
        } else {
          try { fs.unlinkSync(p); } catch (e3) {}
        }
      } catch (e4) {}
    }
    function unlink(p) {
      try { if (exists(p)) fs.unlinkSync(p); } catch (e) {}
    }
    function copyOne(from, to) {
      try {
        fs.copyFileSync(from, to);
        return false;
      } catch (err) {
        if (!busy(err) || !exists(to)) throw err;
      }
      var trashDir = path.join(path.dirname(to), TRASH);
      try { fs.mkdirSync(trashDir, { recursive: true }); } catch (e) {}
      var backup = path.join(trashDir, path.basename(to) + "." + Date.now());
      try {
        fs.renameSync(to, backup);
        try {
          fs.copyFileSync(from, to);
          unlink(backup);
          return false;
        } catch (copyErr) {
          try {
            if (!exists(to) && exists(backup)) fs.renameSync(backup, to);
          } catch (e2) {}
          if (!busy(copyErr)) throw copyErr;
        }
      } catch (renameErr) {
        if (!busy(renameErr)) throw renameErr;
      }
      var pendingPath = to + PENDING;
      unlink(pendingPath);
      fs.copyFileSync(from, pendingPath);
      return true;
    }
    function copyTree(src, dest, pending) {
      if (!exists(dest)) fs.mkdirSync(dest, { recursive: true });
      var names = fs.readdirSync(src);
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (skipName(name)) continue;
        var from = path.join(src, name);
        var to = path.join(dest, name);
        var st;
        try { st = fs.statSync(from); } catch (e) { continue; }
        if (st.isDirectory()) copyTree(from, to, pending);
        else if (copyOne(from, to)) {
          var rel = path.relative(root, to).replace(/\\\\/g, "/");
          pending.push(rel || name);
        }
      }
    }
    function walkPending(dir, out) {
      var names;
      try { names = fs.readdirSync(dir); } catch (e) { return; }
      for (var i = 0; i < names.length; i++) {
        var name = names[i];
        if (name === TRASH) continue;
        var full = path.join(dir, name);
        var st;
        try { st = fs.statSync(full); } catch (e) { continue; }
        if (st.isDirectory()) walkPending(full, out);
        else if (name.length > PENDING.length && name.slice(-PENDING.length) === PENDING) {
          out.push(full.slice(0, -PENDING.length));
        }
      }
    }
    function promote(lives) {
      for (var j = 0; j < lives.length; j++) {
        var live = lives[j];
        var pending = live + PENDING;
        if (!exists(pending)) continue;
        try {
          if (exists(live)) {
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
    }
    function apply() {
      var pending = [];
      if (payload && exists(payload)) {
        copyTree(payload, root, pending);
      }
      var lives = [];
      walkPending(root, lives);
      promote(lives);
      try {
        var markerPath = path.join(root, MARKER);
        if (pending.length) {
          fs.writeFileSync(markerPath, JSON.stringify({ files: pending, updatedAt: new Date().toISOString() }, null, 2), "utf8");
        } else {
          unlink(markerPath);
        }
      } catch (e) {}
      if (version) {
        var stampBody = JSON.stringify({ version: version, appliedAt: new Date().toISOString() }, null, 2);
        try {
          fs.writeFileSync(path.join(root, STAMP), stampBody, "utf8");
        } catch (e) {}
        if (appliedStampPath) {
          try {
            var stampDir = path.dirname(appliedStampPath);
            if (!exists(stampDir)) fs.mkdirSync(stampDir, { recursive: true });
            fs.writeFileSync(appliedStampPath, stampBody, "utf8");
          } catch (e2) {}
        }
      }
      if (workDir) rm(workDir);
      go();
    }
    setTimeout(apply, 400);
  } catch (e) {
    go();
  }
})();
</script>
</body>
</html>
`;
}
