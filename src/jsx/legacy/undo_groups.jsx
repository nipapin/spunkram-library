var xLib = new ExternalObject("lib:\PlugPlugExternalObject");

if (typeof $ === 'undefined') {
    $ = {};
}

var PremiereUndoGroups = (function () {
    if (typeof app.enableQE === "function") {
        try {
            app.enableQE();
        } catch (eQE) {}
    }

    var MAX_GROUPS = 32;
    var MAX_STEPS = 64;

    /** @type {{ documentID: string, start: number, end: number }[]} */
    var groups = [];

    /** @type {{ documentID: string, start: number } | null} */
    var active = null;

    var processing = false;

    function projectByDocumentId(documentID) {
        var i;
        if (app.project && app.project.documentID === documentID) {
            return app.project;
        }
        for (i = 0; i < app.projects.numProjects; i++) {
            if (app.projects[i].documentID === documentID) {
                return app.projects[i];
            }
        }
        return null;
    }

    function ensureQeProject(project) {
        try {
            if (qe.project && qe.project.path === project.path) {
                return qe.project;
            }
        } catch (e) { }

        // qe.open(project.path);
        return qe.project;
    }

    function dispatchStackEvent() {
        if (!xLib) return;
        try {
            var ev = new CSXSEvent();
            ev.type = "onProjectChanged";
            ev.data = qe.project.undoStackIndex();
            ev.dispatch();
        } catch (e) { }
    }

    /**
     * Начать группу. Пока группа открыта, onProjectChanged не трогает стек.
     * @returns {string} "OK" | "ERROR:..."
     */
    function start() {
        if (active !== null) {
            active = null;
            return "ERROR:previous group was not closed";
        }
        if (!app.project) {
            return "ERROR:no open project";
        }

        try {
            var proj = app.project;
            var qeProj = ensureQeProject(proj);

            active = {
                documentID: proj.documentID,
                start: qeProj.undoStackIndex(),
            };
            return "OK";
        } catch (e) {
            active = null;
            return "ERROR:" + e.message;
        }
    }

    /**
     * Закончить группу и записать интервал [start, end] в историю.
     * @returns {string} "OK" | "ERROR:..."
     */
    function end() {
        if (active === null) {
            return "ERROR:no open group";
        }
        if (!app.project || app.project.documentID !== active.documentID) {
            active = null;
            return "ERROR:project changed before end()";
        }

        try {
            var qeProj = ensureQeProject(app.project);
            var endIndex = qeProj.undoStackIndex();
            var startIndex = active.start;

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
        } catch (e) {
            active = null;
            return "ERROR:" + e.message;
        }
    }

    /**
     * Отменить открытую группу и откатить изменения (до MAX_STEPS шагов).
     * @returns {string} "OK" | "ERROR:..."
     */
    function abort() {
        if (active === null) {
            return "OK";
        }
        var saved = active;
        active = null;

        try {
            var proj = projectByDocumentId(saved.documentID);
            if (!proj) proj = app.project;
            if (!proj) return "OK";

            var qeProj = ensureQeProject(proj);
            var i;
            for (i = 0; i < MAX_STEPS; i++) {
                if (qeProj.undoStackIndex() <= saved.start) {
                    break;
                }
                qeProj.undo();
            }
            return "OK";
        } catch (e) {
            return "ERROR:" + e.message;
        }
    }

    function onProjectChanged(documentID) {
        try {
            if (processing || active !== null) {
                return;
            }

            var proj = documentID ? projectByDocumentId(documentID) : null;
            if (!proj) {
                proj = app.project;
            }
            if (!proj) {
                return;
            }

            var qeProj;
            try {
                qeProj = ensureQeProject(proj);
            } catch (e) {
                return;
            }

            var stackIndex = qeProj.undoStackIndex();
            var steps = 0;
            var gi;
            var g;
            var closerToStart;

            for (gi = 0; gi < groups.length; gi++) {
                g = groups[gi];
                if (g.documentID !== proj.documentID) {
                    continue;
                }
                if (stackIndex < g.start || stackIndex > g.end) {
                    continue;
                }

                if (stackIndex === g.start || stackIndex === g.end) {
                    continue;
                }

                closerToStart = (stackIndex - g.start) < (g.end - stackIndex);

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
        } catch (er) {
            processing = false;
            alert(er.message + " " + er.line);
        }
    }

    return {
        start: start,
        end: end,
        abort: abort,
        onProjectChanged: onProjectChanged,
        /** для отладки */
        getGroups: function () { return groups; },
    };
})();

// ExtendScript: $ — не jQuery; в CEP из браузера evalScript всё равно JSX, но на всякий случай:
$.undoGroups = PremiereUndoGroups;
if (typeof $.global !== 'undefined') {
    $.global.undoGroups = PremiereUndoGroups;
    $.global.PremiereUndoGroups = PremiereUndoGroups;
}


if (typeof app.bind === "function") {
    try {
        app.bind("onProjectChanged", PremiereUndoGroups.onProjectChanged);
    } catch (err) {
        alert(err.message + " " + err.line);
    }
}

