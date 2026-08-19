/**
 * Premiere undo-group stack — pure TS port of legacy `undo_groups.jsx`.
 * Groups multiple undo steps so FULL_PROJECT paste can be reverted as one action.
 */

type UndoGroupRecord = {
  documentID: string;
  start: number;
  end: number;
};

type ActiveGroup = {
  documentID: string;
  start: number;
};

const MAX_GROUPS = 32;
const MAX_STEPS = 64;

let groups: UndoGroupRecord[] = [];
let active: ActiveGroup | null = null;
let processing = false;
let initialized = false;

let plugPlug: ExternalObject | null = null;

function ensurePlugPlug(): ExternalObject | null {
  if (plugPlug) return plugPlug;
  try {
    plugPlug = new ExternalObject("lib:PlugPlugExternalObject");
  } catch {
    plugPlug = null;
  }
  return plugPlug;
}

function projectByDocumentId(documentID: string): Project | null {
  if (app.project && app.project.documentID === documentID) {
    return app.project;
  }
  for (let i = 0; i < app.projects.numProjects; i++) {
    if (app.projects[i].documentID === documentID) {
      return app.projects[i];
    }
  }
  return null;
}

function ensureQeProject(project: Project): any {
  try {
    if (qe.project && qe.project.path === project.path) {
      return qe.project;
    }
  } catch {
    // ignore
  }
  return qe.project;
}

function dispatchStackEvent(): void {
  const lib = ensurePlugPlug();
  if (!lib) return;
  try {
    const ev = new CSXSEvent();
    ev.type = "onProjectChanged";
    ev.data = String(qe.project.undoStackIndex());
    ev.dispatch();
  } catch {
    // ignore
  }
}

function onProjectChanged(documentID?: string): void {
  try {
    if (processing || active !== null) {
      return;
    }

    let proj = documentID ? projectByDocumentId(documentID) : null;
    if (!proj) {
      proj = app.project;
    }
    if (!proj) {
      return;
    }

    let qeProj: any;
    try {
      qeProj = ensureQeProject(proj);
    } catch {
      return;
    }

    const stackIndex = qeProj.undoStackIndex();
    let steps = 0;

    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      if (g.documentID !== proj.documentID) {
        continue;
      }
      if (stackIndex < g.start || stackIndex > g.end) {
        continue;
      }
      if (stackIndex === g.start || stackIndex === g.end) {
        continue;
      }

      const closerToStart = stackIndex - g.start < g.end - stackIndex;

      processing = true;
      try {
        if (closerToStart) {
          while (qeProj.undoStackIndex() < g.end && steps < MAX_STEPS) {
            qeProj.redo();
            steps++;
          }
        } else {
          while (qeProj.undoStackIndex() > g.start && steps < MAX_STEPS) {
            qeProj.undo();
            steps++;
          }
        }
      } finally {
        processing = false;
      }
    }

    if (steps >= MAX_STEPS) {
      groups = [];
    }

    dispatchStackEvent();
  } catch (er: any) {
    processing = false;
    alert(String(er && er.message ? er.message : er));
  }
}

function ensureInitialized(): void {
  if (initialized) return;
  initialized = true;

  if (typeof app.enableQE === "function") {
    try {
      app.enableQE();
    } catch {
      // ignore
    }
  }

  if (typeof app.bind === "function") {
    try {
      app.bind("onProjectChanged", onProjectChanged);
    } catch {
      // ignore
    }
  }
}

function undoStart(): string {
  ensureInitialized();
  if (active !== null) {
    active = null;
    return "ERROR:previous group was not closed";
  }
  if (!app.project) {
    return "ERROR:no open project";
  }

  try {
    const proj = app.project;
    const qeProj = ensureQeProject(proj);
    active = {
      documentID: proj.documentID,
      start: qeProj.undoStackIndex(),
    };
    return "OK";
  } catch (e: any) {
    active = null;
    return "ERROR:" + (e && e.message ? e.message : String(e));
  }
}

function undoEnd(): string {
  ensureInitialized();
  if (active === null) {
    return "ERROR:no open group";
  }
  if (!app.project || app.project.documentID !== active.documentID) {
    active = null;
    return "ERROR:project changed before end()";
  }

  try {
    const qeProj = ensureQeProject(app.project);
    const endIndex = qeProj.undoStackIndex();
    const startIndex = active.start;
    active = null;

    if (endIndex > startIndex) {
      groups.push({
        documentID: app.project.documentID,
        start: startIndex,
        end: endIndex,
      });
      if (groups.length > MAX_GROUPS) {
        groups = groups.slice(-MAX_GROUPS);
      }
    }
    return "OK";
  } catch (e: any) {
    active = null;
    return "ERROR:" + (e && e.message ? e.message : String(e));
  }
}

function undoAbort(): string {
  ensureInitialized();
  if (active === null) {
    return "OK";
  }
  const saved = active;
  active = null;

  try {
    let proj = projectByDocumentId(saved.documentID);
    if (!proj) proj = app.project;
    if (!proj) return "OK";

    const qeProj = ensureQeProject(proj);
    for (let i = 0; i < MAX_STEPS; i++) {
      if (qeProj.undoStackIndex() <= saved.start) {
        break;
      }
      qeProj.undo();
    }
    return "OK";
  } catch (e: any) {
    return "ERROR:" + (e && e.message ? e.message : String(e));
  }
}

export const undoGroupStart = (): { ok: boolean; status: string } => {
  const status = undoStart();
  return { ok: status === "OK", status };
};

export const undoGroupEnd = (): { ok: boolean; status: string } => {
  const status = undoEnd();
  return { ok: status === "OK", status };
};

export const undoGroupAbort = (): { ok: boolean; status: string } => {
  const status = undoAbort();
  return { ok: status === "OK", status };
};
