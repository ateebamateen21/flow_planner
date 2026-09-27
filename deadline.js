"use strict";

// ─── Deadline layer ───────────────────────────────────────────────────────────
//
// Renders "runway" squiggles over the timeline grid.
// - Hollow circle = start endpoint.
// - Filled circle = due endpoint.
// - Straight line if the deadline is done, otherwise squiggle.
// - Each endpoint has its own y: its time if timed, else y=0 (all-day row).
// - Long runways are clipped to the visible week; a clickable chevron at
//   each cut jumps to the week containing the off-screen endpoint.
//
// All rendering is done into a single absolutely-positioned layer inserted
// into the day-columns container, so it scrolls with the grid and shares
// the same column x-coordinates.

const DL = {
  // Tunables — tweak freely.
  WAVELENGTH: 10, // px per full wave
  AMPLITUDE: 2.2, // px above/below centreline
  STROKE: 1.6, // px
  HEAD_R: 5, // filled/hollow circle radius
  HIT_PAD: 6, // px of extra clickable width around the stroke
  HOVER_STROKE: 2.6, // stroke on hover
  OVERDUE_RING: 1.6, // stroke width of the red ring around the due cap
  CAP_DAYS: 30, // hide tails whose due date is more than N days past
  GLOW_MS: 24 * 3600 * 1000, // glow the due cap when <= 24h remain
  CHEVRON_SIZE: 9,
  CHEVRON_GAP: 4,
};

function _svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function _daysBetween(a, b) {
  // a, b are Date at midnight. Returns integer day count (b - a).
  return Math.round((b - a) / 86400000);
}

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

// Build a wavy (or straight) path between two points.
// Returns an SVG path 'd' string.
function _squigglePath(x1, y1, x2, y2, straight) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;

  // Unit vector along the line.
  const ux = dx / len;
  const uy = dy / len;
  // Perpendicular unit vector.
  const px = -uy;
  const py = ux;

  if (straight) return `M ${x1} ${y1} L ${x2} ${y2}`;

  // Build a sine wave along the line.
  const half = DL.WAVELENGTH / 2;
  const steps = Math.max(2, Math.floor(len / half));
  let d = `M ${x1} ${y1}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const cx = x1 + dx * t;
    const cy = y1 + dy * t;
    // Amplitude alternates sign per half-wavelength.
    const sign = i % 2 === 0 ? -1 : 1;
    const off = sign * DL.AMPLITUDE;
    const nx = cx + px * off;
    const ny = cy + py * off;
    // Quadratic control point pulls the curve toward the perpendicular.
    const qx = cx + px * off * 2;
    const qy = cy + py * off * 2;
    d += ` Q ${qx.toFixed(2)} ${qy.toFixed(2)} ${nx.toFixed(2)} ${ny.toFixed(2)}`;
  }
  // Finish at the exact endpoint.
  d += ` L ${x2} ${y2}`;
  return d;
}

class DeadlineLayer {
  /**
   * @param {object} view  The TimelineView instance.
   * @param {HTMLElement} host  The .tl-grid element (columns container).
   * @param {number} colW  Column width in px.
   * @param {Date} weekStart  Monday of the visible week.
   * @param {number} numDays  Number of visible days.
   */
  constructor(view, host, colW, weekStart, numDays) {
    this.view = view;
    this.host = host;
    this.colW = colW;
    this.weekStart = weekStart;
    this.numDays = numDays;
    this.width = colW * numDays;
    this.height = ((24 * 60) / 30) * 30; // SH*TOTAL, filled by caller below
  }

  setHeight(h) {
    this.height = h;
  }

  render(deadlines) {
    // Remove previous layer.
    const prev = this.host.querySelector(".tl-deadline-layer");
    if (prev) prev.remove();

    //Fix the due circle of the squiggle getting cut off.
    const PAD = 32;
    const svg = _svgEl("svg", {
      class: "tl-deadline-layer",
      width: this.width + 2 * PAD,
      height: this.height + 2 * PAD,
      viewBox: `${-PAD} ${-PAD} ${this.width + 2 * PAD} ${this.height + 2 * PAD}`,
    });
    svg.style.position = "absolute";
    svg.style.left = `${-PAD}px`;
    svg.style.top = `${-PAD}px`;
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "15"; // above events (5), below modals (200)

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group deadlines by horizontal offset bucket to nudge overlapping
    // heads apart. Cheap approach: for each deadline, look at ones whose
    // due day matches and shift by index * 4px.
    const byDueDay = new Map();
    deadlines.forEach((dl) => {
      if (!dl.due || !dl.due.date) return;
      const k = dl.due.date;
      if (!byDueDay.has(k)) byDueDay.set(k, []);
      byDueDay.get(k).push(dl);
    });

    deadlines.forEach((dl) => {
      try {
        this._renderOne(svg, dl, byDueDay, today);
      } catch (e) {
        console.error("[deadline] render failed", dl, e);
      }
    });

    this.host.style.position = this.host.style.position || "relative";
    this.host.appendChild(svg);
  }

  _dayIndex(dateStr) {
    const d = _parseDate(dateStr);
    if (!d) return null;
    return _daysBetween(this.weekStart, d);
  }

  _yFor(endpoint) {
    if (!endpoint || !endpoint.date) return null;
    if (endpoint.time) {
      // Match main.js slot math: (h - START_H)*60 + m, /30, *SH.
      const [h, m] = endpoint.time.split(":").map(Number);
      return h * 60 + m; // one minute = one pixel
    }

    // return 0 //this was clipping our deadline squiggles from the top so—
    return -16; // all-day row top
  }

  _renderOne(svg, dl, byDueDay, today) {
    const color = dl.color || "#a0c2c8";
    const straight = !!dl.done;

    // Resolve endpoint day indices. Either may be null.
    const startIdx =
      dl.start && dl.start.date ? this._dayIndex(dl.start.date) : null;
    const dueIdx = dl.due && dl.due.date ? this._dayIndex(dl.due.date) : null;

    // Clamp: if both endpoints are off-screen on the same side, skip.
    const startOff =
      startIdx != null && (startIdx < 0 || startIdx >= this.numDays);
    const dueOff = dueIdx != null && (dueIdx < 0 || dueIdx >= this.numDays);
    if (startOff && dueOff) {
      if (
        (startIdx < 0 && dueIdx < 0) ||
        (startIdx >= this.numDays && dueIdx >= this.numDays)
      )
        return;
    }

    // Determine x for each endpoint. If day is off-screen, clamp to edge
    // and mark that side as clipped.
    const rawX = (i) => i * this.colW + this.colW / 2;
    // x for a start endpoint: left edge of its column
    const startX = (i) => i * this.colW;

    // x for a due endpoint: right edge of its column
    const dueX = (i) => i * this.colW + this.colW;

    let x1, y1, x2, y2;
    let clipStart = false;
    let clipDue = false;

    // Cases ---------------------------------------------------------------
    if (startIdx != null && dueIdx != null) {
      // Both endpoints exist.
      let sx = startX(startIdx); // left edge of start column
      let dx = dueX(dueIdx); // right edge of due column
      if (sx < 0) {
        sx = 0;
        clipStart = true;
      }
      if (sx > this.width) {
        sx = this.width;
        clipStart = true;
      }
      if (dx < 0) {
        dx = 0;
        clipDue = true;
      }
      if (dx > this.width) {
        dx = this.width;
        clipDue = true;
      }
      x1 = sx;
      y1 = this._yFor(dl.start);
      x2 = dx;
      y2 = this._yFor(dl.due);
    } else if (startIdx != null) {
      // Start only. Line runs from left edge of start column to its right edge.
      let sx = startX(startIdx);
      if (sx < 0) {
        sx = 0;
        clipStart = true;
      }
      if (sx > this.width) {
        sx = this.width;
        clipStart = true;
      }
      x1 = sx;
      y1 = this._yFor(dl.start);
      x2 = sx + this.colW; // right edge of same column
      y2 = y1;
      if (x2 > this.width) {
        x2 = this.width;
        clipDue = true;
      }
    } else if (dueIdx != null) {
      // Due only. Line runs from left edge of due column to its right edge.
      let dx = dueX(dueIdx);
      if (dx < 0) {
        dx = 0;
        clipDue = true;
      }
      if (dx > this.width) {
        dx = this.width;
        clipDue = true;
      }
      x2 = dx;
      y2 = this._yFor(dl.due);
      x1 = dx - this.colW; // left edge of same column
      y1 = y2;
      if (x1 < 0) {
        x1 = 0;
        clipStart = true;
      }
    } else {
      return;
    }

    // Overdue ring check (only when due exists and is in the past).
    let overdue = false;
    if (dl.due && dl.due.date && !dl.done) {
      const dd = _parseDate(dl.due.date);
      if (dd) {
        const endOfDue = new Date(dd);
        if (dl.due.time) {
          const [h, m] = dl.due.time.split(":").map(Number);
          endOfDue.setHours(h, m, 0, 0);
        } else {
          endOfDue.setHours(23, 59, 59, 0);
        }
        if (endOfDue.getTime() < Date.now()) overdue = true;
      }
    }

    // Glow check (only when due exists, is in the future, and within 24h).
    let glow = false;
    if (dl.due && dl.due.date && !dl.done && !overdue) {
      const dd = _parseDate(dl.due.date);
      if (dd) {
        const t = new Date(dd);
        if (dl.due.time) {
          const [h, m] = dl.due.time.split(":").map(Number);
          t.setHours(h, m, 0, 0);
        } else {
          t.setHours(23, 59, 0, 0);
        }
        const remain = t.getTime() - Date.now();
        if (remain > 0 && remain <= DL.GLOW_MS) glow = true;
      }
    }

    // Clutter cap: if due exists and is more than CAP_DAYS in the past, skip.
    if (dl.due && dl.due.date && overdue) {
      const dd = _parseDate(dl.due.date);
      if (dd && _daysBetween(dd, today) > DL.CAP_DAYS) return;
    }

    // Offset overlapping heads on the same due day.
    let headOffset = 0;
    if (dl.due && dl.due.date && byDueDay.has(dl.due.date)) {
      const myY = this._yFor(dl.due);
      const CLOSE_PX = 20; // roughly one line-height in your current SH/scale
      const group = byDueDay
        .get(dl.due.date)
        .filter((other) => Math.abs(this._yFor(other.due) - myY) <= CLOSE_PX);
      const i = group.indexOf(dl);
      headOffset =
        i >= 0 ? (i % 2 === 0 ? -1 : 1) * Math.ceil((i + 1) / 2) * 3 : 0;
    }
    if (dl.due && dl.due.date) {
      x2 += headOffset;
    }

    // ── Path ──
    const g = _svgEl("g", { class: "tl-dl-group" });
    g.style.pointerEvents = "auto";
    g.style.cursor = "pointer";
    if (glow) g.classList.add("tl-dl-glow");

    const pathD = _squigglePath(x1, y1, x2, y2, straight);

    // Hit path (wider, transparent, catches clicks/hover).
    const hit = _svgEl("path", {
      d: pathD,
      fill: "none",
      stroke: "transparent",
      "stroke-width": DL.STROKE + DL.HIT_PAD * 2,
      "stroke-linecap": "round",
    });
    g.appendChild(hit);

    // Visible path.
    const stroke = _svgEl("path", {
      d: pathD,
      fill: "none",
      stroke: color,
      "stroke-width": DL.STROKE,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "tl-dl-stroke",
    });
    g.appendChild(stroke);

    // ── Caps ──
    if (startIdx != null) {
      const c = _svgEl("circle", {
        cx: x1,
        cy: y1,
        r: DL.HEAD_R,
        fill: "var(--background-primary)",
        stroke: color,
        "stroke-width": DL.STROKE,
        class: "tl-dl-cap-start",
      });
      g.appendChild(c);
    }
    if (dueIdx != null) {
      const c = _svgEl("circle", {
        cx: x2,
        cy: y2,
        r: DL.HEAD_R,
        fill: color,
        stroke: overdue ? "#c0392b" : color,
        "stroke-width": overdue ? DL.OVERDUE_RING : DL.STROKE,
        class: "tl-dl-cap-due",
      });
      g.appendChild(c);
      if (glow) {
        const pulse = _svgEl("circle", {
          cx: x2,
          cy: y2,
          r: DL.HEAD_R + 3,
          fill: "none",
          stroke: color,
          "stroke-width": 1,
          class: "tl-dl-pulse",
        });
        g.appendChild(pulse);
      }
    }

    // ── Chevrons ──
    if (clipStart) {
      const atLeft = x1 <= 1;
      this._addChevron(g, x1, y1, atLeft ? -1 : 1, color, "start", dl);
    }
    if (clipDue) {
      const atLeft = x2 <= 1;
      this._addChevron(g, x2, y2, atLeft ? -1 : 1, color, "due", dl);
    }

    // ── Interaction ──
    g.addEventListener("mouseenter", (e) => {
      stroke.setAttribute("stroke-width", DL.HOVER_STROKE);
      this.view._showDeadlineTip(e, dl);
    });
    g.addEventListener("mousemove", (e) => {
      this.view._moveDeadlineTip(e);
    });
    g.addEventListener("mouseleave", () => {
      stroke.setAttribute("stroke-width", DL.STROKE);
      this.view._hideDeadlineTipIfNotPinned();
    });
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      this.view._showDeadlineTip(e, dl, true);
    });
    g.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.view.openDeadlineModal(dl);
    });
    g.addEventListener("mousedown", (e) => {
      if (e.button === 1) {
        e.preventDefault();
        this.view._middleClickDeadline(dl);
      }
    });
    let touchTimer = null;
    g.addEventListener("touchstart", (e) => {
      console.log("long press starting to get registered.");
      if (e.touches.length !== 1) return;
      touchTimer = setTimeout(() => {
        this.view._middleClickDeadline(dl);
      }, 500);
    });
    g.addEventListener("touchend", () => clearTimeout(touchTimer));
    g.addEventListener("touchmove", () => clearTimeout(touchTimer));

    svg.appendChild(g);
  }

  _addChevron(g, x, y, dir, color, which, dl) {
    const c = _svgEl("path", {
      d:
        dir < 0
          ? `M ${x + DL.CHEVRON_SIZE} ${y - DL.CHEVRON_SIZE} L ${x} ${y} L ${x + DL.CHEVRON_SIZE} ${y + DL.CHEVRON_SIZE}`
          : `M ${x - DL.CHEVRON_SIZE} ${y - DL.CHEVRON_SIZE} L ${x} ${y} L ${x - DL.CHEVRON_SIZE} ${y + DL.CHEVRON_SIZE}`,
      fill: "none",
      stroke: color,
      "stroke-width": 2,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      class: "tl-dl-chevron",
      cursor: "pointer",
    });
    c.addEventListener("click", (e) => {
      e.stopPropagation();
      this.view._jumpToDeadlineEndpoint(dl, which);
    });
    g.appendChild(c);
  }
}

// Is this deadline valid? e.g; don't let the users create a deadline where due date comes before start date (that would be a disaster lmao)
function deadlineIsValid(start, due) {
  if (!start || !due) return true;
  const s = new Date(start.date + "T" + (start.time || "00:00"));
  const d = new Date(due.date + "T" + (due.time || "23:59"));
  return s.getTime() <= d.getTime();
}

module.exports = { DeadlineLayer, DL, deadlineIsValid, _squigglePath };
