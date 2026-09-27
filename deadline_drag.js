"use strict";

// Deadline drag-create.
//
// Lets the user draw a new deadline by dragging between two lattice
// points on the calendar grid. The lattice is (column boundary) ×
// (30-min slot boundary). A drag from point A to point B creates a
// deadline whose start and due are those two points.
//
// Mouse only, for now. Touch and pen come later.

const { DL, _squigglePath } = require("./deadline");

class DeadlineDragCreate {
  constructor(view, scrollEl, geom) {
    this.view = view;
    this.scrollEl = scrollEl;
    this.geom = geom;
    this.draft = null;

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    this.attach();
  }

  attach() {
    this.scrollEl.addEventListener("mousedown", this._onMouseDown);
  }

  detach() {
    if (this.scrollEl) {
      this.scrollEl.removeEventListener("mousedown", this._onMouseDown);
    }
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
  }

  setGrid(scrollEl, geom) {
    this.detach();
    this.scrollEl = scrollEl;
    this.geom = geom;
    this.attach();
  }

  // ── Mouse handlers ───────────────────────────────────────────────────────

  _onMouseDown(e) {
    if (e.button !== 0 || this.draft) return;

    const anchor = this._hitTestLattice(e);
    if (!anchor) return;

    // Don't start a create-drag if the user clicked on an event block or
    // an existing deadline cap. Those have their own handlers.
    if (e.target.closest && e.target.closest(".tl-ev")) return;
    if (e.target.closest && e.target.closest(".tl-dl-group")) return;

    e.preventDefault();
    this.draft = {
      anchor,
      current: anchor,
      moved: false,
      layer: this._createGhostLayer(),
    };
    this._drawGhost();

    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
  }

  _onMouseMove(e) {
    if (!this.draft) return;
    const p = this._hitTestLattice(e);
    if (!p) return;

    const cur = this.draft.current;
    if (p.day === cur.day && p.slot === cur.slot && p.allDay === cur.allDay) {
      return;
    }

    this.draft.current = p;
    this.draft.moved = true;
    this._drawGhost();
  }

  _onMouseUp(e) {
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);

    const draft = this.draft;
    this.draft = null;
    if (!draft) return;

    if (draft.layer && draft.layer.parentNode) {
      draft.layer.parentNode.removeChild(draft.layer);
    }

    const [a, b] = this._sortEndpoints(draft.anchor, draft.current);
    const start = this._latticeToDate(a);
    const due = this._latticeToDate(b);

    this.view.openDeadlineModal(null, { start, due });
  }

  // ── Ghost squiggle ──────────────────────────────────────────────────────

  _createGhostLayer() {
    const {
      colW, numDays, slotHeight, totalSlots, dayHeaderHeight, allDayRowHeight,
    } = this.geom;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "tl-dl-ghost-layer");
    svg.setAttribute("width", colW * numDays);
    svg.setAttribute(
      "height",
      dayHeaderHeight + allDayRowHeight + slotHeight * totalSlots,
    );
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";
    svg.style.zIndex = "20";

    this.scrollEl.appendChild(svg);
    return svg;
  }

  _drawGhost() {
    const draft = this.draft;
    if (!draft || !draft.layer) return;

    while (draft.layer.firstChild) {
      draft.layer.removeChild(draft.layer.firstChild);
    }

    const a = this._latticeToPixel(draft.anchor);
    const b = this._latticeToPixel(draft.current);
    if (!a || !b) return;

    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "tl-dl-draft");

    const d = _squigglePath(a.x, a.y, b.x, b.y, false);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "#a0c2c8");
    path.setAttribute("stroke-width", DL.STROKE);
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    g.appendChild(path);

    // Hollow cap at anchor.
    const c1 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c1.setAttribute("cx", a.x);
    c1.setAttribute("cy", a.y);
    c1.setAttribute("r", DL.HEAD_R);
    c1.setAttribute("fill", "var(--background-primary)");
    c1.setAttribute("stroke", "#a0c2c8");
    c1.setAttribute("stroke-width", DL.STROKE);
    g.appendChild(c1);

    // Filled cap at current.
    const c2 = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c2.setAttribute("cx", b.x);
    c2.setAttribute("cy", b.y);
    c2.setAttribute("r", DL.HEAD_R);
    c2.setAttribute("fill", "#a0c2c8");
    c2.setAttribute("stroke", "#a0c2c8");
    c2.setAttribute("stroke-width", DL.STROKE);
    g.appendChild(c2);

    draft.layer.appendChild(g);
  }

  // ── Lattice math ────────────────────────────────────────────────────────

  /**
   * Given a mouse event, return the nearest lattice point if the cursor
   * is within HIT pixels of it, else null.
   *
   * Lattice point shape: { day: int, slot: int|null, allDay: bool }
   */
  _hitTestLattice(e) {
    const rect = this.scrollEl.getBoundingClientRect();
    const scrollTop = this.scrollEl.scrollTop;

    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top + scrollTop;

    const {
      colW, numDays, slotHeight, totalSlots,
      dayHeaderHeight, allDayRowHeight,
    } = this.geom;

    const HIT = 12;
    const allDayTop = dayHeaderHeight;
    const allDayBottom = dayHeaderHeight + allDayRowHeight;
    const gridTop = allDayBottom;

    // Nearest column boundary. Boundaries are at x = 0, colW, 2*colW, ...
    const dayIdx = Math.round(localX / colW);
    if (dayIdx < 0 || dayIdx > numDays) return null;
    const dayX = dayIdx * colW;
    if (Math.abs(localX - dayX) > HIT) return null;

    // All-day row?
    if (localY >= allDayTop && localY < allDayBottom) {
      return { day: dayIdx, slot: null, allDay: true };
    }

    // Grid area?
    if (localY >= gridTop && localY < gridTop + slotHeight * totalSlots) {
      const relY = localY - gridTop;
      const slotIdx = Math.round(relY / slotHeight);
      if (slotIdx < 0 || slotIdx > totalSlots) return null;
      const slotY = slotIdx * slotHeight;
      if (Math.abs(relY - slotY) > HIT) return null;

      // Clamp the last boundary to a real slot.
      const s = Math.min(slotIdx, totalSlots - 1);
      return { day: dayIdx, slot: s, allDay: false };
    }

    return null;
  }

  _latticeToPixel(p) {
    const { colW, slotHeight, dayHeaderHeight, allDayRowHeight } = this.geom;
    const x = p.day * colW;
    const y = p.allDay
      ? dayHeaderHeight + allDayRowHeight / 2
      : dayHeaderHeight + allDayRowHeight + p.slot * slotHeight;
    return { x, y };
  }

  _latticeToDate(p) {
    const { weekStart, helpers } = this.geom;
    const { addDays, dateKey, slotToTime } = helpers;

    const d = addDays(weekStart, p.day);
    const date = dateKey(d);
    const time = p.allDay ? null : slotToTime(p.slot);
    return { date, time };
  }

  _sortEndpoints(a, b) {
    const key = (p) => [p.day, p.allDay ? -1 : p.slot];
    const ka = key(a);
    const kb = key(b);
    if (ka[0] !== kb[0]) return ka[0] < kb[0] ? [a, b] : [b, a];
    if (ka[1] !== kb[1]) return ka[1] < kb[1] ? [a, b] : [b, a];
    return [a, b];
  }
}

module.exports = { DeadlineDragCreate };