"use strict";

const { Plugin, ItemView, Notice } = require("obsidian");
const { DeadlineLayer, DL, deadlineIsValid } = require("./deadline");
const { DeadlineDragCreate } = require("./deadline_drag");

const VIEW_TYPE = "timeline-calendar";

// ─── i18n ─────────────────────────────────────────────────────────────────
const STRINGS = {
  pt: {
    title: "📅 Planner",
    allDay: "Dia todo",
    today: "Hoje",
    week1: "1sem",
    week2: "2sem",
    month1: "Mês",
    month2: "2 meses",
    addBtn: "+ Novo",
    modalNew: "Novo evento",
    modalEdit: "Editar evento",
    fieldTitle: "Título",
    fieldDate: "Data",
    fieldAllDay: "Dia todo",
    fieldStart: "Início",
    fieldEnd: "Fim",
    fieldNotes: "Notas",
    fieldNoteLink: "Nota vinculada",
    fieldTags: "Tags",
    fieldColor: "Cor",
    fieldDone: "Concluído",
    btnDelete: "Excluir",
    btnCancel: "Cancelar",
    btnCreate: "Criar",
    btnSave: "Salvar",
    btnOpenNote: "Abrir nota",
    placeholder: "Nome do evento...",
    placeholderNote: "pasta/nota.md",
    placeholderTags: "estudo, academia, trabalho",
    tipAllDay: "📅 Dia todo",
    readonlyNotice: "📄 Evento da nota (somente leitura)",
    studyModeOn: "🎓 Modo Estudo",
    studyModeOff: "📅 Modo Normal",
    months: [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ],
    days: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    ribbonTitle: "Study Flow Planner",
    commandName: "Abrir Study Flow Planner",
    viewTitle: "Study Flow",
  },
  en: {
    title: "📅 Planner",
    allDay: "All day",
    today: "Today",
    week1: "1wk",
    week2: "2wks",
    month1: "Month",
    month2: "2 months",
    addBtn: "+ New",
    modalNew: "New event",
    modalEdit: "Edit event",
    fieldTitle: "Title",
    fieldDate: "Date",
    fieldAllDay: "All day",
    fieldStart: "Start",
    fieldEnd: "End",
    fieldNotes: "Notes",
    fieldNoteLink: "Linked note",
    fieldTags: "Tags",
    fieldColor: "Color",
    fieldDone: "Done",
    btnDelete: "Delete",
    btnCancel: "Cancel",
    btnCreate: "Create",
    btnSave: "Save",
    btnOpenNote: "Open note",
    placeholder: "Event name...",
    placeholderNote: "folder/note.md",
    placeholderTags: "study, gym, work",
    tipAllDay: "📅 All day",
    readonlyNotice: "📄 Event from note (read-only)",
    studyModeOn: "🎓 Study Mode",
    studyModeOff: "📅 Normal Mode",
    months: [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ],
    days: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    ribbonTitle: "Study Flow Planner",
    commandName: "Open Study Flow Planner",
    viewTitle: "Study Flow",
  },
};

// helper functions

function detectLang() {
  try {
    const loc =
      typeof window !== "undefined" && window.moment
        ? window.moment.locale()
        : navigator.language;
    return loc && loc.toLowerCase().startsWith("pt") ? "pt" : "en";
  } catch (_) {
    return "en";
  }
}

function lineHasTag(line, tag) {
  const re = new RegExp(
    `#${tag}(?:/[A-Za-z0-9_/-]*)?(?=$|[^A-Za-z0-9_-])`,
    "i",
  );
  return re.test(line);
}

// ─── constants ────────────────────────────────────────────────────────────────

const COLORS = [
  "#ffe37d", // Project Planning & Management
  "#ffddff", // Air & Noise Pollution Control
  "#a0c2c8", // Technical and Business Writing
  "#c8f7c5", // Climate Change
  "#928bcc", // Final Year Project-II
  "#e08283", // Membrane Technology
  "#eeb28c", // Water Resources & Irrigation Engineering
  "#cbc4c1", // Tutorial/Mentoring
];

const TASK_MODE_TAGS = ["quiz", "assignment", "presentation", "task"];
const CONCEPT_MODE_TAGS = ["self"];

// ─── study planner ────────────────────────────────────────────────────────────

const STUDY_KEYWORDS = [
  "study",
  "revision",
  "review",
  "biology",
  "chemistry",
  "physics",
  "math",
  "mathematics",
  "english",
  "history",
  "geography",
  "science",
  "literature",
  "grammar",
  "vocabulary",
  "exercise",
  "practice",
  "homework",
  "reading",
  "lecture",
  "exam",
  "test",
  "quiz",
  "class",
  "estudo",
  "estudar",
  "revisão",
  "revisao",
  "biologia",
  "química",
  "quimica",
  "física",
  "fisica",
  "matemática",
  "matematica",
  "inglês",
  "ingles",
  "história",
  "historia",
  "geografia",
  "ciência",
  "ciencia",
  "literatura",
  "gramática",
  "gramatica",
  "vocabulário",
  "vocabulario",
  "exercício",
  "exercicio",
  "prática",
  "pratica",
  "tarefa",
  "leitura",
  "aula",
  "prova",
  "teste",
  "redação",
  "redacao",
  "portugues",
  "português",
];

function isStudyEvent(title) {
  const lower = title.toLowerCase();
  return STUDY_KEYWORDS.some((kw) => lower.includes(kw));
}

function studyColor(title) {
  const t = title.toLowerCase();
  if (/biolog/.test(t)) return "#3aaa6e";
  if (/quím|chem|quim/.test(t)) return "#e07c3a";
  if (/físic|physic|fisic/.test(t)) return "#4a7fe8";
  if (/mat(h|em)/.test(t)) return "#7c5cbf";
  if (/ingl|engl/.test(t)) return "#2bbfc9";
  if (/hist/.test(t)) return "#c9722b";
  if (/geo/.test(t)) return "#5a7fa8";
  if (/portugu|liter|redaç|redac/.test(t)) return "#c94f7c";
  if (/revis|review/.test(t)) return "#e05c5c";
  if (/chem/.test(t)) return "#e07c3a";
  return "#4a7fe8";
}

const START_H = 0;
const END_H = 24;
const SLOT_MINS = 30;
const TOTAL = ((END_H - START_H) * 60) / SLOT_MINS; // 36 slots (5:00→23:00)
const SH = 30; // slot height px

const COL = { 1: 220, 7: 110, 14: 78, 30: 52, 60: 28 };

// ─── pure helpers ─────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// -------------- self helpers ------------------

function _parseDate(s) {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d) ? null : d;
}
function _fmtDate(s, months) {
  const d = _parseDate(s);
  if (!d) return "";
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}
function _daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayKey() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return dateKey(t);
}

function dayOff(n) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  t.setDate(t.getDate() + n);
  return dateKey(t);
}

function fmtShort(k, months) {
  const d = new Date(k + "T12:00");
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function slotLabel(i) {
  const mS = START_H * 60 + i * SLOT_MINS;
  const mE = mS + SLOT_MINS;
  const fmt = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  if (i === TOTAL - 1) return `${fmt(mS)}-00:00`;
  return `${fmt(mS)}-${fmt(mE)}`;
}

function timeToSlot(t) {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return Math.floor(((h - START_H) * 60 + m) / SLOT_MINS);
}

function slotToTime(i) {
  const m = START_H * 60 + i * SLOT_MINS;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function slotEndTime(i) {
  if (i >= TOTAL - 1) return "23:59";
  return slotToTime(i + 1);
}

// ─── VIEW ─────────────────────────────────────────────────────────────────────

class TimelineView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.state = {
      zoom: 7,
      offset: 0,
      events: [], // user-created events (persisted)
      noteEvents: [], // auto-detected from notes (never persisted)
      studyMode: false,
      taskMode: false,
      conceptMode: false,
      deadlines: [],
      deadlineMode: false,
    };
    this._tip = null;
    this._deadlineTip = null;
    this._deadlineTipPinned = false;
    this._navEl = null;
    this._periodEl = null;
    this._gutterSlots = null;
    this._scroll = null;
    this._lang = "en";
    this._vaultRefs = [];
    this._taskStateCache = new Map();
    this._conceptStateCache = new Map();
  }

  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return this._t ? this._t.viewTitle : "Timeline";
  }
  getIcon() {
    return "calendar-days";
  }

  get _t() {
    return STRINGS[this._lang];
  }

  // Returns all events (user-created + note-detected) for rendering
  _allEvents() {
    return [...this.state.events, ...this.state.noteEvents];
  }

  _getContrastColor(hex) {
    const color = hex.replace("#", "");

    const r = parseInt(color.slice(0, 2), 16);
    const g = parseInt(color.slice(2, 4), 16);
    const b = parseInt(color.slice(4, 6), 16);

    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    return brightness > 160 ? "#000" : "#fff";
  }

  async onOpen() {
    this._lang = detectLang();

    await this._loadData();
    await this._loadNoteEvents();
    if (this.state.taskMode) {
      await this._refreshTaskStates();
    }
    if (this.state.conceptMode) {
      await this._refreshConceptStates();
    }

    const container = this.containerEl.children[1];
    container.empty();
    container.style.padding = "0";
    container.style.overflow = "hidden";

    this.root = container.createDiv({ cls: "timeline-view" });
    this._buildToolbar();
    this._buildBody();
    this._tip = this.root.createDiv({ cls: "tl-tip" });

    this._registerVaultListeners();

    this._docClickRef = (e) => {
      if (!this._deadlineTipPinned) return;
      const tip = this._deadlineTip;
      if (!tip) return;
      if (tip.contains(e.target)) return;
      if (e.target.closest && e.target.closest(".tl-dl-group")) return;
      tip.style.display = "none";
      this._deadlineTipPinned = false;
    };
    document.addEventListener("mousedown", this._docClickRef);
    this.render();
  }

  async onClose() {
    this._unregisterVaultListeners();
    if (this._docClickRef) {
      document.removeEventListener("mousedown", this._docClickRef);
      this._docClickRef = null;
    }
    if (this._deadlineDrag) {
      this._deadlineDrag.detach();
      this._deadlineDrag = null;
    }
    await this._saveData();
  }

  // ── persistence ─────────────────────────────────────────────────────────

  // async _loadData() {
  //   const saved = await this.plugin.loadData();
  //   if (saved && Array.isArray(saved.events) && saved.events.length > 0) {
  //     this.state.events = saved.events;
  //   } else {
  //     this.state.events = this._sampleEvents();
  //   }
  //   this.state.studyMode = saved && saved.studyMode === true;
  //   this.state.taskMode = saved && saved.taskMode === true;
  //   this.state.conceptMode = saved && saved.conceptMode === true;
  // }

  async _loadData() {
    const saved = await this.plugin.loadData();
    if (saved && Array.isArray(saved.events) && saved.events.length > 0) {
      this.state.events = saved.events;
    } else {
      this.state.events = this._sampleEvents();
    }
    this.state.deadlines =
      saved && Array.isArray(saved.deadlines) ? saved.deadlines : [];
    this.state.studyMode = saved && saved.studyMode === true;
    this.state.taskMode = saved && saved.taskMode === true;
    this.state.conceptMode = saved && saved.conceptMode === true;
    this.state.deadlineMode = saved && saved.deadlineMode === true;
  }

  // async _saveData() {
  //   // Only persist user-created events; note events are always re-parsed
  //   await this.plugin.saveData({
  //     events: this.state.events,
  //     studyMode: this.state.studyMode,
  //     taskMode: this.state.taskMode,
  //     conceptMode: this.state.conceptMode,
  //   });
  // }

  async _saveData() {
    await this.plugin.saveData({
      events: this.state.events,
      deadlines: this.state.deadlines,
      studyMode: this.state.studyMode,
      taskMode: this.state.taskMode,
      conceptMode: this.state.conceptMode,
      deadlineMode: this.state.deadlineMode,
    });
  }

  _sampleEvents() {
    return [
      {
        id: "a",
        date: dayOff(0),
        allDay: false,
        startTime: "09:00",
        endTime: "10:00",
        title: this._lang === "pt" ? "Reunião equipe" : "Team meeting",
        color: "#4a7fe8",
        notes: "Stand-up",
        done: false,
        noteLink: "",
        tags: "",
      },
      {
        id: "b",
        date: dayOff(1),
        allDay: false,
        startTime: "14:00",
        endTime: "15:30",
        title: this._lang === "pt" ? "Apresentação Q2" : "Q2 Presentation",
        color: "#e05c5c",
        notes: "",
        done: false,
        noteLink: "",
        tags: "",
      },
      {
        id: "c",
        date: dayOff(-1),
        allDay: false,
        startTime: "08:00",
        endTime: "08:30",
        title: this._lang === "pt" ? "Academia" : "Gym",
        color: "#3aaa6e",
        notes: "",
        done: true,
        noteLink: "",
        tags: "",
      },
      {
        id: "d",
        date: dayOff(3),
        allDay: true,
        title: this._lang === "pt" ? "Feriado" : "Holiday",
        color: "#c9722b",
        notes: "",
        done: false,
        noteLink: "",
        tags: "",
      },
      {
        id: "e",
        date: dayOff(0),
        allDay: false,
        startTime: "11:00",
        endTime: "12:00",
        title: this._lang === "pt" ? "Almoço cliente" : "Client lunch",
        color: "#7c5cbf",
        notes: "",
        done: false,
        noteLink: "",
        tags: "",
      },
      {
        id: "f",
        date: dayOff(5),
        allDay: false,
        startTime: "15:00",
        endTime: "16:00",
        title: this._lang === "pt" ? "Dentista" : "Dentist",
        color: "#2bbfc9",
        notes: "",
        done: false,
        noteLink: "",
        tags: "",
      },
    ];
  }

  // ── note event scanning ──────────────────────────────────────────────────

  /**
   * Scans all markdown files in the vault.
   * Files whose base name contains YYYY-MM-DD are parsed for time events.
   * Pattern matched per line: optional bullet/checkbox, then H:MM or HH:MM, then title.
   * Example: "09:00 Study English" → event at 09:00 titled "Study English".
   */
  async _loadNoteEvents() {
    this.state.noteEvents = [];
    const vault = this.plugin.app.vault;
    const files = vault.getMarkdownFiles();

    for (const file of files) {
      const match = file.basename.match(/(\d{4}-\d{2}-\d{2})/);
      if (!match) continue;
      const dateStr = match[1];

      try {
        const content = await vault.read(file);
        const evs = this._parseNoteEvents(file.path, dateStr, content);
        this.state.noteEvents.push(...evs);
      } catch (_) {
        // Skip unreadable files silently
      }
    }
  }

  _parseNoteEvents(filePath, dateStr, content) {
    const evs = [];
    // Matches optional list markers/checkboxes, then H:MM or HH:MM, then any title text
    const re = /^(?:[-*+]\s+(?:\[.\]\s+)?)?(\d{1,2}):(\d{2})\s+(.+)$/;
    const lines = content.split("\n");

    lines.forEach((raw) => {
      const m = raw.trim().match(re);
      if (!m) return;
      const h = parseInt(m[1], 10);
      const min = parseInt(m[2], 10);
      if (h < START_H || h >= END_H) return;
      const title = m[3].trim();
      if (!title) return;

      const startTime = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      evs.push({
        id: `note::${filePath}::${startTime}`,
        date: dateStr,
        allDay: false,
        startTime,
        endTime: "",
        title,
        color: "#888888",
        notes: "",
        done: false,
        tags: "",
        noteLink: "",
        _source: "note",
        _sourcePath: filePath,
      });
    });

    return evs;
  }

  // ── vault listeners ──────────────────────────────────────────────────────

  _registerVaultListeners() {
    const vault = this.plugin.app.vault;

    const refresh = async () => {
      this._taskStateCache.clear();
      this._conceptStateCache.clear();
      await this._loadNoteEvents();
      if (this.state.taskMode) {
        await this._refreshTaskStates();
      }
      if (this.state.conceptMode) {
        await this._refreshConceptStates();
      }
      this.render();
    };

    this._vaultRefs = [
      vault.on("modify", refresh),
      vault.on("create", refresh),
      vault.on("delete", refresh),
      vault.on("rename", refresh),
    ];
  }

  _unregisterVaultListeners() {
    const vault = this.plugin.app.vault;
    this._vaultRefs.forEach((ref) => vault.offref(ref));
    this._vaultRefs = [];
  }

  // ── toolbar ──────────────────────────────────────────────────────────────

  _buildToolbar() {
    const t = this._t;
    const tb = this.root.createDiv({ cls: "timeline-toolbar" });
    tb.createSpan({ cls: "timeline-toolbar-title", text: t.title });

    const nav = tb.createDiv({ cls: "timeline-nav" });
    this._navEl = nav;

    const prev = nav.createEl("button", { cls: "tl-btn", text: "‹" });
    prev.onclick = () => {
      this.state.offset -= this.state.zoom;
      this.render();
    };

    this._periodEl = nav.createSpan({ cls: "tl-period" });

    const next = nav.createEl("button", { cls: "tl-btn", text: "›" });
    next.onclick = () => {
      this.state.offset += this.state.zoom;
      this.render();
    };

    const zg = tb.createDiv({ cls: "tl-zoom-group" });
    [
      [1, t.today],
      [7, t.week1],
      [14, t.week2],
      [30, t.month1],
      [60, t.month2],
    ].forEach(([z, label]) => {
      const b = zg.createEl("button", {
        cls: "tl-zbtn" + (z === 7 ? " active" : ""),
        text: label,
      });
      b.dataset.z = String(z);
      b.onclick = () => {
        zg.querySelectorAll(".tl-zbtn").forEach((x) =>
          x.classList.remove("active"),
        );
        b.classList.add("active");
        this.state.zoom = z;
        if (z === 1) this.state.offset = 0;
        this.render();
      };
    });

    const studyBtn = tb.createEl("button", {
      cls: "tl-study-btn" + (this.state.studyMode ? " active" : ""),
      text: this.state.studyMode ? t.studyModeOn : t.studyModeOff,
    });
    this._studyBtn = studyBtn;
    studyBtn.onclick = () => {
      this.state.studyMode = !this.state.studyMode;
      studyBtn.textContent = this.state.studyMode
        ? t.studyModeOn
        : t.studyModeOff;
      studyBtn.classList.toggle("active", this.state.studyMode);
      this.root.classList.toggle("study-mode", this.state.studyMode);
      this._saveData();
      this.render();
    };

    const taskBtn = tb.createEl("button", {
      cls: "tl-task-btn" + (this.state.taskMode ? " active" : ""),
      text: this.state.taskMode ? "✓ Task Mode" : "☐ Task Mode",
    });
    this._taskBtn = taskBtn;

    const conceptBtn = tb.createEl("button", {
      cls: "tl-concept-btn" + (this.state.conceptMode ? " active" : ""),
      text: this.state.conceptMode ? "★ Concept Mode" : "☆ Concept Mode",
    });
    this._conceptBtn = conceptBtn;

    taskBtn.onclick = async () => {
      this.state.taskMode = !this.state.taskMode;
      if (this.state.taskMode && this.state.conceptMode) {
        this.state.conceptMode = false;
        conceptBtn.textContent = "☆ Concept Mode";
        conceptBtn.classList.remove("active");
      }

      taskBtn.textContent = this.state.taskMode ? "✓ Task Mode" : "☐ Task Mode";
      taskBtn.classList.toggle("active", this.state.taskMode);
      this.root.classList.toggle("task-mode", this.state.taskMode);
      this.root.classList.toggle("concept-mode", this.state.conceptMode);

      await this._saveData();
      if (this.state.taskMode) {
        await this._refreshTaskStates();
      }
      this.render();
    };

    conceptBtn.onclick = async () => {
      this.state.conceptMode = !this.state.conceptMode;
      if (this.state.conceptMode && this.state.taskMode) {
        this.state.taskMode = false;
        taskBtn.textContent = "☐ Task Mode";
        taskBtn.classList.remove("active");
      }

      conceptBtn.textContent = this.state.conceptMode
        ? "★ Concept Mode"
        : "☆ Concept Mode";
      conceptBtn.classList.toggle("active", this.state.conceptMode);
      this.root.classList.toggle("task-mode", this.state.taskMode);
      this.root.classList.toggle("concept-mode", this.state.conceptMode);

      await this._saveData();
      if (this.state.conceptMode) {
        await this._refreshConceptStates();
      }
      this.render();
    };

    // Deadline Button Functions
    const dlBtn = tb.createEl("button", {
      cls: "tl-deadline-btn" + (this.state.deadlineMode ? " active" : ""),
      text: this.state.deadlineMode ? "⏱ Deadline Mode" : "⏱ Deadline Mode",
    });
    this._deadlineBtn = dlBtn;
    dlBtn.onclick = async () => {
      this.state.deadlineMode = !this.state.deadlineMode;
      dlBtn.classList.toggle("active", this.state.deadlineMode);
      this.root.classList.toggle("deadline-mode", this.state.deadlineMode);
      await this._saveData();
      if (this._addDlBtn) {
        this._addDlBtn.style.display = this.state.deadlineMode
          ? "inline-flex"
          : "none";
      }
      this.render();
    };

    const addDlBtn = tb.createEl("button", {
      cls: "tl-add-deadline-btn",
      text: "+ Deadline",
    });
    addDlBtn.style.display = this.state.deadlineMode ? "inline-flex" : "none";
    this._addDlBtn = addDlBtn;
    addDlBtn.onclick = () => this.openDeadlineModal(null);

    const addBtn = tb.createEl("button", { cls: "tl-add-btn", text: t.addBtn });
    addBtn.onclick = () => this.openModal(null);
  }

  // ── body ─────────────────────────────────────────────────────────────────

  _buildBody() {
    const body = this.root.createDiv({ cls: "timeline-body" });

    const gutter = body.createDiv({ cls: "tl-gutter" });
    gutter.createDiv({ cls: "tl-gutter-corner" });
    gutter.createDiv({ cls: "tl-gutter-allday", text: this._t.allDay });

    const gutterMask = gutter.createDiv({ cls: "tl-gutter-scroll-mask" });
    this._gutterSlots = gutterMask.createDiv({ cls: "tl-gutter-slots" });
    this._gutterSlots.style.height = TOTAL * SH + "px";

    for (let i = 0; i < TOTAL; i++) {
      const s = this._gutterSlots.createDiv({
        cls: "tl-gutter-slot" + (i % 2 === 0 ? " on-hour" : ""),
        text: slotLabel(i),
      });
      s.style.height = SH + "px";
    }

    this._scroll = body.createDiv({ cls: "tl-scroll" });
    this._scroll.onscroll = () => this._syncGutter();
  }
  // ———-—------------------------ Rendering Deadlines -----------------------
  _renderDeadlines(scroll, grid, weekStart) {
    if (!this.state.deadlineMode) return;

    const geom = {
      colW: this.colW(),
      numDays: this.state.zoom,
      weekStart: weekStart,
      slotHeight: SH,
      totalSlots: TOTAL,
      dayHeaderHeight: 56,
      allDayRowHeight: 32,
      helpers: { addDays, dateKey, slotToTime },
    };

    if (!this._deadlineDrag) {
      this._deadlineDrag = new DeadlineDragCreate(this, scroll, geom);
    } else {
      this._deadlineDrag.setGrid(scroll, geom);
    }

    if (!this.state.deadlines.length) return;

    const layer = new DeadlineLayer(
      this,
      grid,
      this.colW(),
      weekStart,
      this.state.zoom,
    );
    layer.setHeight(TOTAL * 30);
    layer.render(this.state.deadlines);
  }
  _showDeadlineTip(e, dl, pin = false) {
    const t = this._t;

    // Get or create the single shared deadline tooltip element.
    let tip = this._deadlineTip;
    if (!tip) {
      tip = this.root.createDiv({ cls: "tl-tip tl-dl-tip" });
      this._deadlineTip = tip;
    }
    tip.style.display = "block";
    tip.style.pointerEvents = pin ? "auto" : "none";

    // Build the body lines.
    const lines = [];
    if (dl.start && dl.start.date) {
      lines.push(
        `▶ ${_fmtDate(dl.start.date, t.months)}${dl.start.time ? " " + dl.start.time : ""}`,
      );
    }
    if (dl.due && dl.due.date) {
      lines.push(
        `⏹ ${_fmtDate(dl.due.date, t.months)}${dl.due.time ? " " + dl.due.time : ""}`,
      );
    }
    if (dl.notes) lines.push(`📝 ${dl.notes}`);
    if (dl.tags) lines.push(`🏷 ${dl.tags}`);
    if (dl.noteLink) lines.push(`🔗 ${dl.noteLink}`);
    if (dl.done) lines.push(`✓ ${t.fieldDone}`);

    // Set the header + meta. This wipes any button we appended last time.
    tip.innerHTML =
      `<div class="tl-tip-title">${dl.title}</div>` +
      `<div class="tl-tip-meta">${lines.join("\n")}</div>`;

    // Remember which deadline this tip is currently describing, so the
    // Edit button's click handler knows what to open.
    tip._currentDl = dl;

    // If we're pinning (i.e. user clicked/tapped the squiggle), add an
    // Edit button under the meta block. Always rebuild it, since the
    // innerHTML assignment above wiped the previous one.
    if (pin) {
      const editBtn = document.createElement("button");
      editBtn.className = "tl-dl-edit";
      editBtn.textContent = "✏ Edit";
      editBtn.onclick = (ev) => {
        ev.stopPropagation();
        tip.style.display = "none";
        this._deadlineTipPinned = false;
        this.openDeadlineModal(tip._currentDl);
      };
      tip.appendChild(editBtn);
    }

    // Position and pin state.
    this._moveDeadlineTip(e);
    if (pin) this._deadlineTipPinned = true;
  }

  _moveDeadlineTip(e) {
    if (this._deadlineTipPinned) return;
    const tip = this._deadlineTip;
    if (!tip || !this.root) return;
    const rect = this.root.getBoundingClientRect();
    tip.style.left =
      Math.min(e.clientX - rect.left + 10, rect.width - 240) + "px";
    tip.style.top = Math.max(4, e.clientY - rect.top - 60) + "px";
  }

  _hideDeadlineTipIfNotPinned() {
    if (this._deadlineTipPinned) return;
    if (this._deadlineTip) this._deadlineTip.style.display = "none";
  }

  _hideDeadlineTipForced() {
    if (this._deadlineTip) this._deadlineTip.style.display = "none";
    this._deadlineTipPinned = false;
  }
  _middleClickDeadline(dl) {
    // Placeholder — decide action later.
    // Currently: opens noteLink if present, in a new tab.
    if (dl.noteLink && dl.noteLink.trim()) {
      this.plugin.app.workspace.openLinkText(dl.noteLink.trim(), "", "tab");
    } else {
      new Notice("No note link exists for this deadline.");
    }
  }

  _jumpToDeadlineEndpoint(dl, which) {
    const target =
      which === "due" && dl.due
        ? dl.due.date
        : which === "start" && dl.start
          ? dl.start.date
          : null;
    if (!target) return;
    const t = _parseDate(target);
    if (!t) return;
    // Snap the view's offset so the target date falls inside the visible span.
    const currentStart = this.getStart();
    const diff = _daysBetween(currentStart, t);
    // Center it roughly.
    const targetOffset = diff - Math.floor(this.state.zoom / 2);
    this.state.offset += targetOffset;
    this.render();
  }

  // Openin deadline modals

  openDeadlineModal(dl, prefill = null) {
    const t = this._t;
    const isNew = !dl;
    const d = dl
      ? JSON.parse(JSON.stringify(dl))
      : {
          id: "dl-" + uid(),
          title: "",
          due: prefill?.due || null,
          start: prefill?.start || null,
          color: COLORS[0],
          notes: "",
          noteLink: "",
          tags: "",
          done: false,
        };

    let selColor = d.color || COLORS[0];

    this.root.querySelector(".tl-overlay")?.remove();
    const ov = this.root.createDiv({ cls: "tl-overlay open" });
    ov.onclick = (e) => {
      if (e.target === ov) ov.remove();
    };

    const modal = ov.createDiv({ cls: "tl-modal" });
    modal.onclick = (e) => e.stopPropagation();

    modal.createEl("h3", { text: isNew ? "New deadline" : "Edit deadline" });

    // Title
    const mfTitle = modal.createDiv({ cls: "tl-mf" });
    mfTitle.createEl("label", { text: t.fieldTitle });
    const inputTitle = mfTitle.createEl("input", {
      type: "text",
      placeholder: t.placeholder,
      placeholderDeadline: "Deadline name...",
    });
    inputTitle.value = d.title;

    // Due row
    const mfDue = modal.createDiv({ cls: "tl-mf" });
    mfDue.createEl("label", { text: "Due" });
    const dueRow = mfDue.createDiv({ cls: "tl-mrow" });
    const dueDate = dueRow.createEl("input", { type: "date" });
    dueDate.value = d.due?.date || "";
    const dueTime = dueRow.createEl("input", { type: "time" });
    dueTime.value = d.due?.time || "";

    // Start row
    const mfStart = modal.createDiv({ cls: "tl-mf" });
    mfStart.createEl("label", { text: "Start (optional)" });
    const startRow = mfStart.createDiv({ cls: "tl-mrow" });
    const startDate = startRow.createEl("input", { type: "date" });
    startDate.value = d.start?.date || "";
    const startTime = startRow.createEl("input", { type: "time" });
    startTime.value = d.start?.time || "";

    // Notes
    const mfNotes = modal.createDiv({ cls: "tl-mf" });
    mfNotes.createEl("label", { text: t.fieldNotes });
    const inputNotes = mfNotes.createEl("textarea");
    inputNotes.rows = 2;
    inputNotes.value = d.notes || "";

    // Note link
    const mfNote = modal.createDiv({ cls: "tl-mf" });
    mfNote.createEl("label", { text: t.fieldNoteLink });
    const inputNote = mfNote.createEl("input", {
      type: "text",
      placeholder: t.placeholderNote,
    });
    inputNote.value = d.noteLink || "";

    // Tags
    const mfTags = modal.createDiv({ cls: "tl-mf" });
    mfTags.createEl("label", { text: t.fieldTags });
    const inputTags = mfTags.createEl("input", {
      type: "text",
      placeholder: t.placeholderTags,
    });
    inputTags.value = d.tags || "";

    // Color
    const mfColor = modal.createDiv({ cls: "tl-mf" });
    mfColor.createEl("label", { text: t.fieldColor });
    const crow = mfColor.createDiv({ cls: "tl-crow" });
    COLORS.forEach((c) => {
      const sw = crow.createSpan({
        cls: "tl-sw" + (selColor === c ? " sel" : ""),
      });
      sw.style.background = c;
      sw.onclick = () => {
        crow
          .querySelectorAll(".tl-sw")
          .forEach((s) => s.classList.remove("sel"));
        sw.classList.add("sel");
        selColor = c;
      };
    });

    // Done
    let chkDone = null;
    if (!isNew) {
      const mfDone = modal.createDiv({ cls: "tl-mf tl-mf-check" });
      chkDone = mfDone.createEl("input", { type: "checkbox" });
      chkDone.id = "tl-dl-done-chk";
      chkDone.checked = !!d.done;
      const lblDone = mfDone.createEl("label", { text: t.fieldDone });
      lblDone.htmlFor = "tl-dl-done-chk";
    }

    // Buttons
    const mact = modal.createDiv({ cls: "tl-mact" });

    if (!isNew) {
      const delBtn = mact.createEl("button", {
        cls: "tl-mbtn danger",
        text: t.btnDelete,
      });
      delBtn.onclick = () => {
        this.state.deadlines = this.state.deadlines.filter(
          (x) => x.id !== d.id,
        );
        ov.remove();
        this._saveData();
        this.render();
      };
    }

    const cancelBtn = mact.createEl("button", {
      cls: "tl-mbtn secondary",
      text: t.btnCancel,
    });
    cancelBtn.onclick = () => ov.remove();

    const saveBtn = mact.createEl("button", {
      cls: "tl-mbtn primary",
      text: isNew ? t.btnCreate : t.btnSave,
    });
    saveBtn.onclick = () => {
      // Clear any red borders from a previous failed attempt.
      [inputTitle, startDate, startTime, dueDate, dueTime].forEach((el) => {
        el.style.borderColor = "";
      });

      const title = inputTitle.value.trim();
      const due = dueDate.value
        ? { date: dueDate.value, time: dueTime.value || null }
        : null;
      const start = startDate.value
        ? { date: startDate.value, time: startTime.value || null }
        : null;

      if (!title) {
        inputTitle.style.borderColor = "#c0392b";
        return;
      }
      if (!due && !start) {
        dueDate.style.borderColor = "#c0392b";
        startDate.style.borderColor = "#c0392b";
        return;
      }
      if (due && start && !deadlineIsValid(start, due)) {
        startDate.style.borderColor = "#c0392b";
        startTime.style.borderColor = "#c0392b";
        dueDate.style.borderColor = "#c0392b";
        dueTime.style.borderColor = "#c0392b";
        new Notice("Start can't be after the due date.");
        return;
      }

      d.title = title;
      d.due = due;
      d.start = start;
      d.notes = inputNotes.value;
      d.noteLink = inputNote.value.trim();
      d.tags = inputTags.value.trim();
      d.color = selColor;
      if (!isNew && chkDone) d.done = chkDone.checked;

      if (isNew) this.state.deadlines.push(d);
      else {
        const idx = this.state.deadlines.findIndex((x) => x.id === d.id);
        if (idx >= 0) this.state.deadlines[idx] = d;
      }

      ov.remove();
      this._saveData();
      this.render();
    };

    setTimeout(() => inputTitle.focus(), 50);
  }
  // ── render ────────────────────────────────────────────────────────────────

  colW() {
    return COL[this.state.zoom] || 78;
  }

  getStart() {
    if (this.state.zoom === 1) {
      const t = new Date();
      t.setHours(0, 0, 0, 0);
      return t;
    }

    const t = new Date();
    t.setHours(0, 0, 0, 0);

    // Start the week on Monday, not on today's date.
    const daysSinceMonday = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - daysSinceMonday + this.state.offset);

    return t;
  }

  render() {
    const t = this._t;
    this._updatePeriod();
    this._navEl.style.display = this.state.zoom === 1 ? "none" : "flex";
    this.root.classList.toggle("study-mode", this.state.studyMode);

    const scroll = this._scroll;
    const savedTop = scroll.scrollTop;
    scroll.empty();

    const n = this.state.zoom,
      cw = this.colW(),
      start = this.getStart();
    const tk = todayKey(),
      tw = n * cw;

    // ── Day headers ──
    const dhr = scroll.createDiv({ cls: "tl-day-header-row" });
    dhr.style.minWidth = tw + "px";

    for (let i = 0; i < n; i++) {
      const d = addDays(start, i),
        key = dateKey(d);
      const isTod = key === tk;
      const isWe = d.getDay() === 0 || d.getDay() === 6;
      const isFirst = d.getDate() === 1 || i === 0;

      const col = dhr.createDiv({
        cls: "tl-dh" + (isTod ? " today" : "") + (isWe ? " weekend" : ""),
      });
      col.style.width = cw + "px";

      if (isFirst || this.state.zoom <= 7) {
        col.createSpan({ cls: "tl-dh-mo", text: t.months[d.getMonth()] });
      }
      col.createSpan({ cls: "tl-dh-wd", text: t.days[d.getDay()] });

      const num = col.createSpan({
        cls: "tl-dh-num",
        text: String(d.getDate()),
      });
      if (isTod) {
        num.style.cssText =
          "background:var(--interactive-accent);color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;";
      }
      col.onclick = () => this.openModal(null, key, true);
    }

    // ── All-day row (user events only — note events are never all-day) ──
    const adr = scroll.createDiv({ cls: "tl-allday-row" });
    adr.style.minWidth = tw + "px";

    for (let i = 0; i < n; i++) {
      const d = addDays(start, i),
        key = dateKey(d);
      const cell = adr.createDiv({
        cls: "tl-allday-cell" + (key === tk ? " today" : ""),
      });
      cell.style.width = cw + "px";
      cell.style.height = "32px";
      cell.onclick = () => this.openModal(null, key, true);

      this.state.events
        .filter((ev) => ev.allDay && ev.date === key)
        .forEach((ev) => {
          const el = cell.createDiv({ cls: "tl-allday-ev", text: ev.title });
          el.style.background = ev.color;
          el.style.color = this._getContrastColor(ev.color);
          el.onclick = (e) => {
            e.stopPropagation();
            this.openModal(ev);
          };
        });
    }

    // ── Time grid (user events + note events combined) ──
    const grid = scroll.createDiv({ cls: "tl-grid" });
    grid.style.minWidth = tw + "px";

    for (let i = 0; i < n; i++) {
      const d = addDays(start, i),
        key = dateKey(d);
      const isTod = key === tk,
        isWe = d.getDay() === 0 || d.getDay() === 6;

      const col = grid.createDiv({
        cls: "tl-day-col" + (isTod ? " today" : "") + (isWe ? " weekend" : ""),
      });
      col.style.width = cw + "px";
      col.dataset.date = key;

      for (let s = 0; s < TOTAL; s++) {
        const slot = col.createDiv({
          cls: "tl-slot" + (s % 2 === 0 ? " on-hour" : ""),
        });
        slot.style.height = SH + "px";
        slot.onclick = (
          (si) => () =>
            this.openModal(null, key, false, si)
        )(s);
      }

      // Render all events for this day (user + note)
      this._allEvents()
        .filter((ev) => !ev.allDay && ev.date === key)
        .forEach((ev) => this._renderEv(col, ev));

      if (isTod) {
        const now = new Date();
        const mins = (now.getHours() - START_H) * 60 + now.getMinutes();
        if (mins >= 0 && mins < TOTAL * SLOT_MINS) {
          const line = col.createDiv({ cls: "tl-now-line" });
          line.style.top = (mins / SLOT_MINS) * SH + "px";
        }
      }
    }

    if (savedTop > 0) {
      scroll.scrollTop = savedTop;
    } else {
      requestAnimationFrame(() => {
        scroll.scrollTop = (((7 - START_H) * 60) / SLOT_MINS) * SH;
        this._syncGutter();
      });
    }
    this._syncGutter();
    this._renderDeadlines(scroll, grid, start);
  }

  _syncGutter() {
    if (this._gutterSlots && this._scroll) {
      this._gutterSlots.style.transform = `translateY(-${this._scroll.scrollTop}px)`;
    }
  }

  // ── Period label ─────────────────────────────────────────────────────────

  _updatePeriod() {
    const t = this._t;
    const s = this.getStart(),
      e = addDays(s, this.state.zoom - 1);
    if (this.state.zoom === 1) {
      this._periodEl.textContent = `${t.days[s.getDay()]}, ${s.getDate()} ${t.months[s.getMonth()]} ${s.getFullYear()}`;
    } else {
      this._periodEl.textContent = `${fmtShort(dateKey(s), t.months)} – ${fmtShort(dateKey(e), t.months)} ${e.getFullYear()}`;
    }
  }

  // ── Render event block ───────────────────────────────────────────────────

  // ── Task state ───────────────────────────────────────────────────────────

  _getEventNotePath(ev) {
    if (ev._source === "note") {
      return ev._sourcePath || "";
    }

    return ev.noteLink?.trim() || "";
  }

  async _scanSectionForTags(ev, tags, cache) {
    const rawPath = this._getEventNotePath(ev);

    if (!rawPath) {
      return "no-link";
    }

    const hashIndex = rawPath.indexOf("#");
    const path = hashIndex === -1 ? rawPath : rawPath.slice(0, hashIndex);
    const section = hashIndex === -1 ? "" : rawPath.slice(hashIndex + 1).trim();
    const cacheKey = rawPath;

    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }

    const file = this.plugin.app.vault
      .getMarkdownFiles()
      .find((f) => f.path === path);

    if (!file) {
      cache.set(cacheKey, "missing");
      return "missing";
    }

    try {
      let content = await this.plugin.app.vault.cachedRead(file);

      if (section) {
        const lines = content.split("\n");
        const escapedSection = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const headingRegex = new RegExp(
          "^(#{1,6})\\s+" + escapedSection + "\\s*$",
        );

        let start = -1;
        let level = 0;

        for (let i = 0; i < lines.length; i++) {
          const match = lines[i].match(headingRegex);
          if (match) {
            start = i + 1;
            level = match[1].length;
            break;
          }
        }

        if (start === -1) {
          cache.set(cacheKey, "missing");
          return "missing";
        }

        let end = lines.length;
        for (let i = start; i < lines.length; i++) {
          const match = lines[i].match(/^(#{1,6})\s+/);
          if (match && match[1].length <= level) {
            end = i;
            break;
          }
        }

        content = lines.slice(start, end).join("\n");
      }

      const lines = content.split("\n");
      const hasAnyTag = (line) => tags.some((t) => lineHasTag(line, t));

      let unchecked = 0;
      let checked = 0;

      lines.forEach((line) => {
        if (/^\s*[-*+]\s+\[\s\]\s+/.test(line) && hasAnyTag(line)) {
          unchecked++;
        } else if (/^\s*[-*+]\s+\[[xX]\]\s+/.test(line) && hasAnyTag(line)) {
          checked++;
        }
      });

      let state = "none";
      if (unchecked > 0 && checked === 0) {
        state = "all-pending";
      } else if (unchecked > 0 && checked > 0) {
        state = "mixed";
      } else if (unchecked === 0 && checked > 0) {
        state = "all-done";
      }

      cache.set(cacheKey, state);
      return state;
    } catch (_) {
      cache.set(cacheKey, "missing");
      return "missing";
    }
  }

  async _getTaskState(ev) {
    return this._scanSectionForTags(ev, TASK_MODE_TAGS, this._taskStateCache);
  }

  async _getConceptState(ev) {
    const state = await this._scanSectionForTags(
      ev,
      CONCEPT_MODE_TAGS,
      this._conceptStateCache,
    );
    if (state === "all-pending" || state === "mixed") return "incomplete";
    if (state === "all-done") return "complete";
    return state;
  }

  async _refreshTaskStates() {
    this._taskStateCache.clear();
    const events = this._allEvents();
    await Promise.all(events.map((ev) => this._getTaskState(ev)));
  }

  async _refreshConceptStates() {
    this._conceptStateCache.clear();
    const events = this._allEvents();
    await Promise.all(events.map((ev) => this._getConceptState(ev)));
  }
  _renderEv(col, ev) {
    const ss = timeToSlot(ev.startTime);
    const es = timeToSlot(ev.endTime);
    const dur = Math.max(1, es - ss);
    if (ss < 0 || ss >= TOTAL) return;

    const isNote = ev._source === "note";
    const isStudy = this.state.studyMode && isStudyEvent(ev.title);

    const el = col.createDiv({
      cls:
        "tl-ev" +
        (ev.done ? " done" : "") +
        (isNote ? " tl-ev-note" : "") +
        (isStudy ? " tl-ev-study" : ""),
    });
    el.style.top = ss * SH + 1 + "px";
    el.style.height = dur * SH - 2 + "px";

    // In task mode, add these related icons based on linked notes' task completion

    if (this.state.taskMode) {
      const notePath = this._getEventNotePath(ev);

      if (!notePath) {
        el.style.opacity = "0.45";
      } else {
        const taskState = this._taskStateCache.get(notePath) ?? "missing";
        if (taskState === "missing") {
          el.style.opacity = "0.45";
        } else if (taskState === "all-pending") {
          const indicator = el.createDiv({ cls: "tl-task-indicator pending" });
          indicator.textContent = "•";
          indicator.style.position = "absolute";
          indicator.style.right = "5px";
          indicator.style.bottom = "2px";
          indicator.style.border = "1px solid black";
          indicator.style.borderRadius = "20px";
          indicator.style.color = "#ff3b30";
          indicator.style.fontSize = "30px";
          indicator.style.fontWeight = "900";
          indicator.style.lineHeight = "10px";
          indicator.style.zIndex = "5";
        } else if (taskState === "mixed") {
          const indicator = el.createDiv({ cls: "tl-task-indicator mixed" });
          indicator.textContent = "•";
          indicator.style.position = "absolute";
          indicator.style.right = "5px";
          indicator.style.bottom = "2px";
          indicator.style.border = "1px solid black";
          indicator.style.borderRadius = "20px";
          indicator.style.color = "#ffd43b";
          indicator.style.fontSize = "30px";
          indicator.style.fontWeight = "900";
          indicator.style.lineHeight = "10px";
          indicator.style.zIndex = "5";
        } else if (taskState === "all-done") {
          const indicator = el.createDiv({ cls: "tl-task-indicator done" });
          indicator.textContent = "•";
          indicator.style.position = "absolute";
          indicator.style.right = "5px";
          indicator.style.bottom = "2px";
          indicator.style.border = "1px solid black";
          indicator.style.borderRadius = "20px";
          indicator.style.color = "#3ddc84";
          indicator.style.fontSize = "30px";
          indicator.style.fontWeight = "900";
          indicator.style.lineHeight = "10px";
          indicator.style.zIndex = "5";
        }
      }
    } else if (this.state.conceptMode) {
      const notePath = this._getEventNotePath(ev);

      if (!notePath) {
        el.style.opacity = "0.45";
      } else {
        const rawState = this._conceptStateCache.get(notePath) ?? "missing";
        const conceptState =
          rawState === "all-pending" || rawState === "mixed"
            ? "incomplete"
            : rawState === "all-done"
              ? "complete"
              : rawState; // no-link / missing / none pass through unchanged

        if (conceptState === "missing" || conceptState === "none") {
          el.style.opacity = "0.45";
        } else if (conceptState === "incomplete") {
          const indicator = el.createDiv({
            cls: "tl-concept-indicator incomplete",
          });
          indicator.textContent = "★";
          indicator.style.position = "absolute";
          indicator.style.right = "5px";
          indicator.style.bottom = "5px";
          // indicator.style.border = "1px solid black";
          indicator.style.borderRadius = "20px";
          indicator.style.color = "#ff2e7e";
          indicator.style.fontSize = "18px";
          indicator.style.lineHeight = "10px";
          indicator.style.zIndex = "5";
        } else if (conceptState === "complete") {
          el.style.opacity = "0.75";
          const indicator = el.createDiv({
            cls: "tl-concept-indicator complete",
          });
          indicator.textContent = "★";
          indicator.style.position = "absolute";
          indicator.style.right = "5px";
          indicator.style.bottom = "5px";
          // indicator.style.border = "1px solid black";
          indicator.style.borderRadius = "20px";
          indicator.style.color = "#8a4fff";
          indicator.style.fontSize = "18px";
          indicator.style.lineHeight = "10px";
          indicator.style.zIndex = "5";
        }
      }
    }
    // In study mode, note events get a subject-based colour
    if (isNote && this.state.studyMode) {
      el.style.background = studyColor(ev.title);
    } else {
      el.style.background = ev.color;
      el.style.color = this._getContrastColor(ev.color);
    }

    el.createDiv({ cls: "tl-ev-title", text: ev.title });
    if (ev.startTime) {
      el.createDiv({
        cls: "tl-ev-time",
        text: ev.startTime + (ev.endTime ? " – " + ev.endTime : ""),
      });
    }

    // Click behaviour:
    //   • Note-sourced events → open the source note (read-only)
    //   • User events → open edit modal (existing behaviour preserved)
    el.onmousedown = (e) => {
      if (e.button === 1) {
        e.preventDefault();

        const notePath = this._getEventNotePath(ev);
        if (notePath) {
          this.plugin.app.workspace.openLinkText(notePath, "", false);
        }
      }
    };
    el.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;

      this._longPressTimer = setTimeout(() => {
        const notePath = this._getEventNotePath(ev);

        if (notePath) {
          this.plugin.app.workspace.openLinkText(notePath, "", "tab");
        }
      }, 500);
    });

    el.addEventListener("touchend", () => {
      clearTimeout(this._longPressTimer);
    });

    el.addEventListener("touchmove", () => {
      clearTimeout(this._longPressTimer);
    });
    el.onclick = () => {
      if (isNote) {
        this.plugin.app.workspace.openLinkText(ev._sourcePath, "", false);
      } else {
        this.openModal(ev);
      }
    };

    el.onmouseenter = (e) => this._showTip(e, ev);
    el.onmouseleave = () => this._hideTip();
  }
  // ── Tooltip ──────────────────────────────────────────────────────────────

  _showTip(e, ev) {
    const tip = this._tip;
    if (!tip || !this.root) return;
    tip.style.display = "block";

    const isNote = ev._source === "note";
    const meta = ev.allDay
      ? this._t.tipAllDay
      : `⏰ ${ev.startTime || ""}${ev.endTime ? " – " + ev.endTime : ""}`;

    let extra = ev.notes ? `\n📝 ${ev.notes}` : "";
    if (ev.tags && ev.tags.trim()) extra += `\n🏷 ${ev.tags.trim()}`;
    if (ev.noteLink && ev.noteLink.trim())
      extra += `\n🔗 ${ev.noteLink.trim()}`;
    if (isNote) extra += `\n${this._t.readonlyNotice}`;

    tip.innerHTML =
      `<div class="tl-tip-title">${ev.title}</div>` +
      `<div class="tl-tip-meta">${meta}${extra}</div>`;

    const rect = this.root.getBoundingClientRect();
    tip.style.left =
      Math.min(e.clientX - rect.left + 10, rect.width - 230) + "px";
    tip.style.top = Math.max(4, e.clientY - rect.top - 60) + "px";
  }

  _hideTip() {
    if (this._tip) this._tip.style.display = "none";
  }

  // ── Modal ────────────────────────────────────────────────────────────────

  openModal(ev, defDate, defAllDay = false, defSlot = null) {
    const t = this._t;
    const isNew = !ev;

    // Note-source events are read-only: clicking opens the source note instead
    if (ev && ev._source === "note") {
      this.plugin.app.workspace.openLinkText(ev._sourcePath, "", false);
      return;
    }

    const ds = defSlot != null ? slotToTime(defSlot) : "09:00";
    const de = defSlot != null ? slotEndTime(defSlot) : "09:30";
    const d = ev
      ? { ...ev }
      : {
          id: uid(),
          title: "",
          date: defDate || dayOff(0),
          allDay: defAllDay,
          startTime: ds,
          endTime: de,
          color: COLORS[0],
          notes: "",
          done: false,
          noteLink: "",
          tags: "",
        };

    // Ensure new fields exist on old saved events
    if (d.noteLink === undefined) d.noteLink = "";
    if (d.tags === undefined) d.tags = "";

    let selColor = d.color || COLORS[0];

    this.root.querySelector(".tl-overlay")?.remove();

    const ov = this.root.createDiv({ cls: "tl-overlay open" });
    ov.onclick = (e) => {
      if (e.target === ov) ov.remove();
    };

    const modal = ov.createDiv({ cls: "tl-modal" });
    modal.onclick = (e) => e.stopPropagation();

    modal.createEl("h3", { text: isNew ? t.modalNew : t.modalEdit });

    // ── Title ──
    const mfTitle = modal.createDiv({ cls: "tl-mf" });
    mfTitle.createEl("label", { text: t.fieldTitle });
    const inputTitle = mfTitle.createEl("input", {
      type: "text",
      placeholder: t.placeholder,
      placeholderDeadline: "Deadline name...",
    });
    inputTitle.value = d.title;

    // ── Date ──
    const mfDate = modal.createDiv({ cls: "tl-mf" });
    mfDate.createEl("label", { text: t.fieldDate });
    const inputDate = mfDate.createEl("input", { type: "date" });
    inputDate.value = d.date;

    // ── Time row (hidden for all-day events; user cannot toggle here) ──
    const timeRow = modal.createDiv({ cls: "tl-mrow" });
    if (d.allDay) timeRow.style.display = "none";

    const mfStart = timeRow.createDiv({ cls: "tl-mf" });
    mfStart.createEl("label", { text: t.fieldStart });
    const inputStart = mfStart.createEl("input", { type: "time" });
    inputStart.value = d.startTime || "";

    const mfEnd = timeRow.createDiv({ cls: "tl-mf" });
    mfEnd.createEl("label", { text: t.fieldEnd });
    const inputEnd = mfEnd.createEl("input", { type: "time" });
    inputEnd.value = d.endTime || "";

    // ── Notes ──
    const mfNotes = modal.createDiv({ cls: "tl-mf" });
    mfNotes.createEl("label", { text: t.fieldNotes });
    const inputNotes = mfNotes.createEl("textarea");
    inputNotes.rows = 2;
    inputNotes.value = d.notes || "";

    // ── Linked note (NEW) ──
    const mfNote = modal.createDiv({ cls: "tl-mf" });
    mfNote.createEl("label", { text: t.fieldNoteLink });
    const noteRow = mfNote.createDiv({ cls: "tl-mrow" });
    noteRow.style.gap = "6px";

    const inputNote = noteRow.createEl("input", {
      type: "text",
      placeholder: t.placeholderNote,
    });
    inputNote.value = d.noteLink || "";
    inputNote.style.flex = "1";

    const openNoteBtn = noteRow.createEl("button", {
      cls: "tl-mbtn secondary",
      text: t.btnOpenNote,
    });
    openNoteBtn.style.display =
      d.noteLink && d.noteLink.trim() ? "inline-flex" : "none";
    openNoteBtn.onclick = async (e) => {
      e.preventDefault();

      const path = inputNote.value.trim();
      if (!path) return;

      const vault = this.plugin.app.vault;
      const existingFile = vault.getAbstractFileByPath(path.split("#")[0]);

      // Note already exists → open it normally, including #section links.
      if (existingFile) {
        this.plugin.app.workspace.openLinkText(path, "", "tab");
        return;
      }

      // Note doesn't exist → create it from the Daily_Note template.
      const templaterPlugin =
        this.plugin.app.plugins.getPlugin("templater-obsidian");

      if (!templaterPlugin) {
        new Notice("Templater is not enabled.");
        return;
      }

      const template = vault.getAbstractFileByPath("Templates/Daily_Note.md");

      if (!template) {
        new Notice("Templates/Daily_Note.md not found.");
        return;
      }

      // Remove #section from the filename, if the link contains one.
      const notePath = path.split("#")[0];

      // Split the destination into folder + filename.
      const lastSlash = notePath.lastIndexOf("/");
      const folderPath = lastSlash >= 0 ? notePath.slice(0, lastSlash) : "";
      const filename =
        lastSlash >= 0
          ? notePath.slice(lastSlash + 1).replace(/\.md$/, "")
          : notePath.replace(/\.md$/, "");

      const createdFile =
        await templaterPlugin.templater.create_new_note_from_template(
          template,
          folderPath,
          filename,
          false,
        );

      if (createdFile) {
        this.plugin.app.workspace.openLinkText(path, "", "tab");
      }
    };

    // ── Note autocomplete suggestions ──
    const suggestBox = mfNote.createDiv({ cls: "tl-note-suggestions" });
    suggestBox.style.display = "none";

    const updateSuggestions = (query) => {
      suggestBox.empty();
      if (!query) {
        suggestBox.style.display = "none";
        return;
      }
      const files = this.plugin.app.vault.getMarkdownFiles();
      const matches = files
        .map((f) => f.path)
        .filter((p) => p.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8);
      if (!matches.length) {
        suggestBox.style.display = "none";
        return;
      }
      suggestBox.style.display = "block";
      matches.forEach((p) => {
        const item = suggestBox.createDiv({
          cls: "tl-note-suggestion-item",
          text: p,
        });
        item.onmousedown = (e) => {
          e.preventDefault();
          inputNote.value = p;
          openNoteBtn.style.display = "inline-flex";
          suggestBox.style.display = "none";
        };
      });
    };

    inputNote.oninput = () => {
      openNoteBtn.style.display = inputNote.value.trim()
        ? "inline-flex"
        : "none";
      updateSuggestions(inputNote.value.trim());
    };
    inputNote.onfocus = () => {
      if (inputNote.value.trim()) updateSuggestions(inputNote.value.trim());
    };
    inputNote.onblur = () => {
      setTimeout(() => {
        suggestBox.style.display = "none";
      }, 150);
    };

    // ── Tags (NEW) ──
    const mfTags = modal.createDiv({ cls: "tl-mf" });
    mfTags.createEl("label", { text: t.fieldTags });
    const inputTags = mfTags.createEl("input", {
      type: "text",
      placeholder: t.placeholderTags,
    });
    inputTags.value = d.tags || "";

    // ── Color swatches ──
    const mfColor = modal.createDiv({ cls: "tl-mf" });
    mfColor.createEl("label", { text: t.fieldColor });
    const crow = mfColor.createDiv({ cls: "tl-crow" });
    COLORS.forEach((c) => {
      const sw = crow.createSpan({
        cls: "tl-sw" + (selColor === c ? " sel" : ""),
      });
      sw.style.background = c;
      sw.onclick = () => {
        crow
          .querySelectorAll(".tl-sw")
          .forEach((s) => s.classList.remove("sel"));
        sw.classList.add("sel");
        selColor = c;
      };
    });

    // ── Done (edit only) ──
    let chkDone = null;
    if (!isNew) {
      const mfDone = modal.createDiv({ cls: "tl-mf tl-mf-check" });
      chkDone = mfDone.createEl("input", { type: "checkbox" });
      chkDone.id = "tl-done-chk";
      chkDone.checked = !!d.done;
      const lblDone = mfDone.createEl("label", { text: t.fieldDone });
      lblDone.htmlFor = "tl-done-chk";
    }

    // ── Buttons ──
    const mact = modal.createDiv({ cls: "tl-mact" });

    if (!isNew) {
      const delBtn = mact.createEl("button", {
        cls: "tl-mbtn danger",
        text: t.btnDelete,
      });
      delBtn.onclick = () => {
        this.state.events = this.state.events.filter((e) => e.id !== d.id);
        ov.remove();
        this._saveData();
        this.render();
      };
    }

    const cancelBtn = mact.createEl("button", {
      cls: "tl-mbtn secondary",
      text: t.btnCancel,
    });
    cancelBtn.onclick = () => ov.remove();

    const saveBtn = mact.createEl("button", {
      cls: "tl-mbtn primary",
      text: isNew ? t.btnCreate : t.btnSave,
    });
    saveBtn.onclick = () => {
      const title = inputTitle.value.trim();
      if (!title) {
        inputTitle.style.borderColor = "#c0392b";
        return;
      }

      d.title = title;
      d.date = inputDate.value;
      d.startTime = inputStart.value || "";
      d.endTime = inputEnd.value || "";
      d.notes = inputNotes.value;
      d.noteLink = inputNote.value.trim();
      d.tags = inputTags.value.trim();
      d.color = selColor;
      if (!isNew && chkDone) d.done = chkDone.checked;

      if (isNew) {
        this.state.events.push(d);
      } else {
        const idx = this.state.events.findIndex((e) => e.id === d.id);
        if (idx >= 0) this.state.events[idx] = d;
      }

      ov.remove();
      this._saveData();
      this.render();
    };

    setTimeout(() => inputTitle.focus(), 50);
  }
}

// ─── PLUGIN ───────────────────────────────────────────────────────────────────

class TimelinePlugin extends Plugin {
  async onload() {
    this.registerView(VIEW_TYPE, (leaf) => new TimelineView(leaf, this));

    const lang = detectLang();
    const t = STRINGS[lang];

    this.addRibbonIcon("calendar-days", t.ribbonTitle, () =>
      this.activateView(),
    );

    this.addCommand({
      id: "open-timeline-calendar",
      name: t.commandName,
      callback: () => this.activateView(),
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE);
  }

  async activateView() {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE);

    if (leaves.length > 0) {
      workspace.revealLeaf(leaves[0]);
      return;
    }

    const leaf = workspace.getLeaf(false);
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    workspace.revealLeaf(leaf);
  }
}

module.exports = TimelinePlugin;

/* nosourcemap */
