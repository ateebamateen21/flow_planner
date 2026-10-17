"use strict";

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
    const base = entry.file.basename;
    const title = !course
      ? base
      : base.toLowerCase().startsWith(course.toLowerCase() + "_")
        ? base
        : `${course.toUpperCase()}_${base}`;
    list.push({
      id: "base:" + entry.file.path,
      title,
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
      this.gone = false;
      this.ready = this.planner
        .mount(this.plannerEl)
        .catch((e) => console.error("[flow-planner] mount failed", e));
    }

    onunload() {
      this.gone = true;
      this.ready.then(() => this.planner.unmount());
    }

    onDataUpdated() {
      this.ready.then(() => {
        if (!this.gone) this._sync();
      });
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
      const showManual = cfg.get("showManual") !== false;
      this.planner.setBaseDeadlines(list, { showManual });

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
  const obsidian = require("obsidian");
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
        {
          type: "toggle",
          key: "showManual",
          displayName: "Show hand-made deadlines",
          default: true,
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
};
