"use strict";

const obsidian = require("obsidian");

// Flow Planner as an Obsidian Bases view (needs Obsidian 1.10+).
//
// The base does the filtering and sorting. This file only turns the rows it
// hands us into deadlines for the planner, working out which property means
// what. Anything auto-detected can be overridden in the view's options menu.

const BASES_VIEW_TYPE = "flow-planner";

// Used until the user edits the "Course colors" option. Unknown courses get
// an automatic colour from FALLBACK_PALETTE, so nothing here is required.
const DEFAULT_COURSE_COLORS =
  "cc=#c8f7c5, anpc=#ffddff, mt=#e08283, tbw=#a0c2c8, ppm=#ffe37d, wrie=#eeb28c";

const FALLBACK_PALETTE = [
  "#e08283",
  "#eeb28c",
  "#ffe37d",
  "#c8f7c5",
  "#a0c2c8",
  "#ffddff",
  "#928bcc",
  "#c3ecf4",
];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

const pad = (n) => String(n).padStart(2, "0");

// How long to wait after a note is created before checking whether this
// view shows it (the base needs a moment to refresh).
const TUNING = { newNoteCheckMs: 2500 };

// "note.due" -> { type: "note", name: "due" }
function splitPropId(id) {
  const s = String(id);
  const i = s.indexOf(".");
  return i < 0
    ? { type: "note", name: s }
    : { type: s.slice(0, i), name: s.slice(i + 1) };
}

// One property of one row as a plain JS value. Note properties are read
// from the note's cached frontmatter (the raw value, exactly as stored).
// Formulas and file properties go through Bases' own value and come back
// as text.
function readProp(app, entry, propId) {
  if (!propId) return undefined;
  const { type, name } = splitPropId(propId);
  if (type === "note") {
    const cache = app.metadataCache.getFileCache(entry.file);
    const fm = cache && cache.frontmatter;
    return fm ? fm[name] : undefined;
  }
  const v = entry.getValue(propId);
  return v && v.isTruthy() ? v.toString() : undefined;
}

// Characters Obsidian does not allow in a note's file name.
function sanitizeFileName(name) {
  return String(name || "")
    .replace(/[\\/:*?"<>|#^\[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ["Quiz_01", "Quiz_05"] -> "Quiz_06": the folder's most common prefix and
// number width, one past the highest number. "" when nothing is numbered.
function suggestNextName(names) {
  const groups = new Map();
  for (const n of names) {
    const m = /^(.*?)(\d+)$/.exec(n);
    if (!m) continue;
    const v = parseInt(m[2], 10);
    const g = groups.get(m[1]) || { count: 0, max: -1, width: 0 };
    g.count++;
    if (v > g.max) {
      g.max = v;
      g.width = m[2].length;
    }
    groups.set(m[1], g);
  }
  let best = null;
  let bestPrefix = "";
  for (const [prefix, g] of groups) {
    if (!best || g.count > best.count || (g.count === best.count && g.max > best.max)) {
      best = g;
      bestPrefix = prefix;
    }
  }
  return best ? bestPrefix + String(best.max + 1).padStart(best.width, "0") : "";
}

// "TBW/Quizzes/Quiz_02.md" -> "TBW/Quizzes" ; a file in the vault root -> "/"
function folderOf(path) {
  const i = path.lastIndexOf("/");
  return i < 0 ? "/" : path.slice(0, i);
}

function folderLabel(path) {
  return path === "/" ? "(vault root)" : path.split("/").join(" / ");
}

// "2026-12-15T13:18" -> { date, time } ; "2026-12-15" -> { date, time: null }
function parseDateTime(raw) {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date && !isNaN(raw)) {
    return {
      date: `${raw.getFullYear()}-${pad(raw.getMonth() + 1)}-${pad(raw.getDate())}`,
      time: `${pad(raw.getHours())}:${pad(raw.getMinutes())}`,
    };
  }
  const s = String(raw).trim();
  const m = DATE_RE.exec(s);
  if (m) {
    return {
      date: `${m[1]}-${m[2]}-${m[3]}`,
      time: m[4] ? `${m[4]}:${m[5]}` : null,
    };
  }
  const d = new Date(s);
  if (isNaN(d)) return null;
  return parseDateTime(d);
}

const toBool = (raw) => raw === true || String(raw).toLowerCase() === "true";

// ["#ppm"] / "ppm" / "#ppm" -> "ppm"
function firstCourse(raw) {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v == null) return "";
  return String(v).replace(/^#/, "").trim();
}

// "ppm=#ffe37d, mt=#e08283" -> { ppm: "#ffe37d", mt: "#e08283" }
function parseCourseColors(text) {
  const map = {};
  String(text || "")
    .split(/[,;\n]+/)
    .forEach((part) => {
      const m = /^\s*([^=:\s][^=:]*?)\s*[=:]\s*(#[0-9a-fA-F]{3,8})\s*$/.exec(part);
      if (m) map[m[1].toLowerCase()] = m[2];
    });
  return map;
}

function colorFor(course, map) {
  const key = course.toLowerCase();
  if (map[key]) return map[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

// Look at a sample of rows and guess which property is the due date, the
// optional start date, the done checkbox and the course. Only note
// properties are guessed; anything else can be picked in the view options.
function detectMapping(app, entries, candidates) {
  const sample = entries.slice(0, 30);
  const stats = {};
  for (const p of candidates) {
    if (splitPropId(p).type !== "note") continue;
    const s = { n: 0, date: 0, bool: 0, text: 0 };
    for (const e of sample) {
      const raw = readProp(app, e, p);
      if (raw == null || raw === "") continue;
      s.n++;
      if (typeof raw === "boolean") s.bool++;
      else if (typeof raw === "string" && DATE_RE.test(raw.trim())) s.date++;
      else if (Array.isArray(raw) || typeof raw === "string") s.text++;
    }
    if (s.n > 0) stats[p] = s;
  }
  const props = Object.keys(stats);
  const mostly = (p, k) => stats[p][k] >= stats[p].n * 0.6;
  const dateLike = props.filter((p) => mostly(p, "date"));
  const boolLike = props.filter((p) => mostly(p, "bool"));
  const textLike = props.filter((p) => mostly(p, "text") && stats[p].date === 0);
  const named = (list, re) => list.find((p) => re.test(splitPropId(p).name));

  const dateProp = named(dateLike, /due|deadline|end/i) || dateLike[0] || null;
  const startProp =
    named(
      dateLike.filter((p) => p !== dateProp),
      /start|begin|from/i,
    ) || null;
  const doneProp = named(boolLike, /done|complete|finish/i) || boolLike[0] || null;
  const courseProp = named(textLike, /^(course|subject|class|module|tags?)$/i) || null;
  return { dateProp, startProp, doneProp, courseProp };
}

// Rows -> deadline objects in the planner's own format.
function entriesToDeadlines(app, entries, mapping, courseColors) {
  const list = [];
  let skipped = 0;
  for (const entry of entries) {
    const due = parseDateTime(readProp(app, entry, mapping.dateProp));
    if (!due) {
      skipped++;
      continue;
    }
    const start = mapping.startProp
      ? parseDateTime(readProp(app, entry, mapping.startProp))
      : null;
    const course = firstCourse(readProp(app, entry, mapping.courseProp));
    list.push({
      id: "base:" + entry.file.path,
      title: entry.file.basename,
      due,
      start,
      color: colorFor(course, courseColors),
      notes: "",
      noteLink: entry.file.path,
      tags: course,
      done: toBool(readProp(app, entry, mapping.doneProp)),
      source: "base",
    });
  }
  return { list, skipped };
}

function makeBasesView(obsidian, Planner, plugin) {
  return class PlannerBasesView extends obsidian.BasesView {
    constructor(controller, parentEl) {
      super(controller);
      this.type = BASES_VIEW_TYPE;
      this.hostEl = parentEl.createDiv({ cls: "flow-planner-bases-host" });
      this.plannerEl = this.hostEl.createDiv({ cls: "fp-bases-planner" });
      this.statusEl = this.hostEl.createDiv({ cls: "fp-bases-status" });
      this.planner = new Planner(plugin);
      this.planner.baseOnly = true;
      this.planner.createDeadline = (draft) => this._createDeadlineNote(draft);
      this.planner.deadlineCreator = {
        folders: () => this._knownFolders(),
        suggestName: (folder) =>
          suggestNextName(this._rowsIn(folder).map((e) => e.file.basename)),
        pickFolder: () => this._pickFolder(),
        lastFolder: () => plugin.data.lastDeadlineFolder || "",
      };
      this.rows = []; // the rows of this view that became deadlines
      this.mapping = null;
      this.pendingWatch = null;
      this.gone = false;
      this.ready = this.planner
        .mount(this.plannerEl)
        .catch((e) => console.error("[flow-planner] mount failed", e));
    }

    onunload() {
      this.gone = true;
      if (this.pendingWatch) this.pendingWatch();
      this.ready.then(() => this.planner.unmount());
    }

    onDataUpdated() {
      this.ready.then(() => {
        if (!this.gone) this._sync();
      });
    }

    // The rows of this view that live in a folder.
    _rowsIn(folder) {
      return this.rows.filter((e) => folderOf(e.file.path) === folder);
    }

    // Folders to offer for a new note: wherever the rows this view shows
    // live (Obsidian already applied the filters), plus the last one used.
    _knownFolders() {
      const set = new Set(this.rows.map((e) => folderOf(e.file.path)));
      const last = plugin.data.lastDeadlineFolder;
      if (last && (last === "/" || this.app.vault.getAbstractFileByPath(last))) {
        set.add(last);
      }
      return [...set]
        .sort((a, b) => a.localeCompare(b))
        .map((path) => ({ path, label: folderLabel(path) }));
    }

    // Any folder in the vault, picked from a search list. null = cancelled.
    _pickFolder() {
      const app = this.app;
      const folders = app.vault.getAllFolders
        ? app.vault.getAllFolders(true)
        : app.vault.getAllLoadedFiles().filter((f) => f instanceof obsidian.TFolder);
      return new Promise((resolve) => {
        let chosen = false;
        class FolderPicker extends obsidian.FuzzySuggestModal {
          getItems() {
            return folders;
          }
          getItemText(f) {
            return folderLabel(f.path || "/");
          }
          onChooseItem(f) {
            chosen = true;
            resolve(f.path || "/");
          }
          onClose() {
            // Choosing closes the dialog first, so give onChooseItem a turn.
            setTimeout(() => {
              if (!chosen) resolve(null);
            }, 0);
          }
        }
        const picker = new FolderPicker(app);
        picker.setPlaceholder("Choose a folder for the new note");
        picker.open();
      });
    }

    // Create the note for a deadline drawn or typed into the planner, in
    // the folder chosen in the form. It copies the other properties (kind,
    // course, tags...) from the newest note already in that folder, so it
    // matches the same filters, then fills in the dates.
    async _createDeadlineNote(draft) {
      const app = this.app;
      const key = (id) =>
        id && splitPropId(id).type === "note" ? splitPropId(id).name : null;
      const m = this.mapping || {};
      const dueKey = key(m.dateProp);
      if (!dueKey) {
        new obsidian.Notice(
          "Pick a due date property in this view's options before creating deadlines.",
        );
        return;
      }
      const startKey = key(m.startProp);
      const doneKey = key(m.doneProp);
      const courseKey = key(m.courseProp);
      const stamp = (dt) => (dt.time ? `${dt.date}T${dt.time}` : dt.date);

      const folder = draft.folder || "/";
      const name = sanitizeFileName(draft.title);
      if (!name) {
        new obsidian.Notice("Give the deadline a name.");
        return;
      }
      const path = folder === "/" ? `${name}.md` : `${folder}/${name}.md`;
      if (app.vault.getAbstractFileByPath(path)) {
        new obsidian.Notice(`"${path}" already exists. Choose another name.`);
        return;
      }

      const mtime = (e) => (e.file.stat && e.file.stat.mtime) || 0;
      const neighbor = this._rowsIn(folder)
        .slice()
        .sort((a, b) => mtime(b) - mtime(a))[0];
      const cache = neighbor ? app.metadataCache.getFileCache(neighbor.file) : null;
      const nfm = cache && cache.frontmatter;

      let file;
      try {
        file = await app.vault.create(path, draft.notes ? draft.notes.trim() + "\n" : "");
        await app.fileManager.processFrontMatter(file, (fm) => {
          if (nfm) {
            for (const k of Object.keys(nfm)) {
              if (k === "position" || k === dueKey || k === startKey || k === doneKey) continue;
              fm[k] = JSON.parse(JSON.stringify(nfm[k]));
            }
          }
          fm[dueKey] = stamp(draft.due || draft.start);
          if (startKey && draft.start && draft.due) fm[startKey] = stamp(draft.start);
          if (doneKey) fm[doneKey] = false;
          if (courseKey && draft.course) {
            const c = draft.course.replace(/^#/, "");
            fm[courseKey] = courseKey === "tags" ? [c] : c;
          }
        });
      } catch (e) {
        console.error("[flow-planner] could not create the deadline note", e);
        new obsidian.Notice("Could not create the note: " + (e && e.message));
        return;
      }

      plugin.data.lastDeadlineFolder = folder;
      plugin.saveAll();
      this._checkLanding(file);
    }

    // A moment after a note is created, say where it landed and whether this
    // view shows it. Obsidian applies the filters, so we only look at the
    // rows it gives us.
    _checkLanding(file) {
      if (this.pendingWatch) this.pendingWatch();
      const timer = setTimeout(() => {
        this.pendingWatch = null;
        if (this.gone) return;
        const shown = this.data.data.some((e) => e.file.path === file.path);
        new obsidian.Notice(
          shown
            ? `Created "${file.path}".`
            : `Created "${file.path}", but this view's filter hides it. Check its folder and properties.`,
          shown ? 4000 : 10000,
        );
      }, TUNING.newNoteCheckMs);
      this.pendingWatch = () => clearTimeout(timer);
    }

    _sync() {
      const app = this.app;
      const cfg = this.config;
      const entries = this.data.data;

      const chosen = {
        dateProp: cfg.getAsPropertyId("dateProp"),
        startProp: cfg.getAsPropertyId("startProp"),
        doneProp: cfg.getAsPropertyId("doneProp"),
        courseProp: cfg.getAsPropertyId("courseProp"),
      };
      let mapping = chosen;
      if (!chosen.dateProp || !chosen.doneProp || !chosen.courseProp || !chosen.startProp) {
        const candidates = [
          ...new Set([...(cfg.getOrder() || []), ...(this.allProperties || [])]),
        ];
        const auto = detectMapping(app, entries, candidates);
        mapping = {
          dateProp: chosen.dateProp || auto.dateProp,
          startProp: chosen.startProp || auto.startProp,
          doneProp: chosen.doneProp || auto.doneProp,
          courseProp: chosen.courseProp || auto.courseProp,
        };
      }

      // Obsidian may hand back nothing for an option the user never touched,
      // so apply the default here as well.
      const colorText = cfg.get("courseColors");
      const colors = parseCourseColors(
        colorText == null ? DEFAULT_COURSE_COLORS : colorText,
      );
      const { list, skipped } = entriesToDeadlines(app, entries, mapping, colors);
      this.mapping = mapping;
      const shown = new Set(list.map((d) => d.noteLink));
      this.rows = entries.filter((e) => shown.has(e.file.path));
      this.planner.setBaseDeadlines(list);

      const short = (p) => (p ? splitPropId(p).name : "none");
      this.statusEl.setText(
        mapping.dateProp
          ? `${list.length} deadlines from this view · due: ${short(mapping.dateProp)} · done: ${short(mapping.doneProp)} · course: ${short(mapping.courseProp)}` +
              (skipped ? ` · ${skipped} skipped (no valid date)` : "")
          : "No date property found: pick one in this view's options.",
      );
    }
  };
}

function registerPlannerBasesView(plugin, Planner) {
  // Older Obsidian versions have no Bases API: skip quietly.
  if (typeof plugin.registerBasesView !== "function" || !obsidian.BasesView) {
    return false;
  }
  const View = makeBasesView(obsidian, Planner, plugin);
  try {
    plugin.registerBasesView(BASES_VIEW_TYPE, {
      name: "Flow Planner",
      icon: "lucide-calendar-days",
      factory: (controller, containerEl) => new View(controller, containerEl),
      options: () => [
        {
          type: "property",
          key: "dateProp",
          displayName: "Due date property",
          placeholder: "Auto-detect",
        },
        {
          type: "property",
          key: "startProp",
          displayName: "Start date property (optional)",
          placeholder: "Auto-detect",
        },
        {
          type: "property",
          key: "doneProp",
          displayName: "Done property",
          placeholder: "Auto-detect",
        },
        {
          type: "property",
          key: "courseProp",
          displayName: "Course property",
          placeholder: "Auto-detect",
        },
        {
          type: "text",
          key: "courseColors",
          displayName: "Course colors",
          placeholder: "ppm=#ffe37d, mt=#e08283",
          default: DEFAULT_COURSE_COLORS,
        },
      ],
    });
    return true;
  } catch (e) {
    console.warn("[flow-planner] could not register the Bases view", e);
    return false;
  }
}

module.exports = {
  registerPlannerBasesView,
  makeBasesView,
  detectMapping,
  entriesToDeadlines,
  parseDateTime,
  parseCourseColors,
  colorFor,
  splitPropId,
  readProp,
  BASES_VIEW_TYPE,
  TUNING,
  suggestNextName,
  sanitizeFileName,
  folderOf,
  folderLabel,
};
