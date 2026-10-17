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
  constructor(view, scrollEl, gridEl, allDayEl, geom) {
    this.view = view;
    this.scrollEl = scrollEl; // receives the mouse (the all-day row is outside the grid)
    this.gridEl = gridEl; // origin of all coordinates; also hosts the SVG sheets
    this.allDayEl = allDayEl; // measured, never assumed
    this.geom = geom;
    this.draft = null;
    this._hoverLayer = null; // persistent SVG for the hover ring
    this._hoverRing = null; // the <circle> element inside _hoverLayer
    this._lastHover = null; // last lattice point hovered (for change detection)

    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);

    // Added for the usability feature.
    this._onHoverMove = this._onHoverMove.bind(this);
    this._onHoverLeave = this._onHoverLeave.bind(this);
    this.attach();
  }

  attach() {
    this.scrollEl.addEventListener("mousedown", this._onMouseDown);
    this.scrollEl.addEventListener("mousemove", this._onHoverMove);
    this.scrollEl.addEventListener("mouseleave", this._onHoverLeave);
  }

  detach() {
    if (this.scrollEl) {
      this.scrollEl.removeEventListener("mousedown", this._onMouseDown);
      this.scrollEl.removeEventListener("mousemove", this._onHoverMove);
      this.scrollEl.removeEventListener("mouseleave", this._onHoverLeave);
    }
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
  }

  setGrid(scrollEl, gridEl, allDayEl, geom) {
    this.detach();
    this.scrollEl = scrollEl;
    this.gridEl = gridEl;
    this.allDayEl = allDayEl;
    this.geom = geom;
    this._hoverLayer = null;
    this._hoverRing = null;
    this._lastHover = null;
    this._onHoverMove = this._onHoverMove.bind(this);
    this._onHoverLeave = this._onHoverLeave.bind(this);
    this.attach();
  }

  // ── Mouse handlers ───────────────────────────────────────────────────────

  _onMouseDown(e) {
    console.log(
      "[drag] mousedown received",
      e.clientX,
      e.clientY,
      "button:",
      e.button,
      "target:",
      e.target,
    );

    if (e.button !== 0 || this.draft) return;

    const anchor = this._hitTestLattice(e);
    console.log("[drag] hitTest anchor:", anchor);
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
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);

    try {
      this._drawGhost();
    } catch (err) {
      console.error("[drag] ghost draw failed", err);
    }
  }

  _onMouseMove(e) {
    if (!this.draft) return;
    const p = this._hitTestLattice(e);
    // console.log("[drag] mousemove → lattice point:", p);
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
    // const start = this._latticeToDate(a);
    // const due = this._latticeToDate(b);

    const spanned = a.day !== b.day; // a real multi-day drag, not a single click

    const start = this._latticeToDate(a);
    const due = this._latticeToDate(spanned ? { ...b, day: b.day - 1 } : b);

    this.view.openDeadlineModal(null, { start, due });
  }

  // ── Ghost squiggle ───────────────────────────────────────────────────────

  // A transparent SVG sheet inside the grid whose (0, 0) is the grid's
  // top-left corner: the same padding trick as DeadlineLayer.render(), so
  // ghost, hover ring and saved deadlines all share one origin.
  _makeSheet(className, zIndex) {
    const PAD = 32;
    const w = this.geom.colW * this.geom.numDays;
    const h = this.geom.slotHeight * this.geom.totalSlots;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("width", w + 2 * PAD);
    svg.setAttribute("height", h + 2 * PAD);
    svg.setAttribute(
      "viewBox",
      `${-PAD} ${-PAD} ${w + 2 * PAD} ${h + 2 * PAD}`,
    );
    svg.style.position = "absolute";
    svg.style.left = `${-PAD}px`;
    svg.style.top = `${-PAD}px`;
    svg.style.pointerEvents = "none";
    svg.style.zIndex = zIndex; // below the sticky day header (20)
    this.gridEl.appendChild(svg);
    return svg;
  }

  _createGhostLayer() {
    return this._makeSheet("tl-dl-ghost-layer", 18);
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

  _ensureHoverLayer() {
    if (this._hoverLayer) return this._hoverLayer;

    const svg = this._makeSheet("tl-dl-hover-layer", 17);

    // Persistent ring element — created once, moved and toggled thereafter.
    const ring = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    ring.setAttribute("class", "tl-dl-hover-ring");
    ring.setAttribute("r", DL.HEAD_R + 2);
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "#a0c2c8");
    ring.setAttribute("stroke-width", 1.5);
    ring.style.opacity = "0";

    svg.appendChild(ring);

    this._hoverLayer = svg;
    this._hoverRing = ring;
    return svg;
  }

  // Note: the hover ring lives in its own SVG layer, separate from the ghost layer. The ghost layer is created and destroyed on every drag; the hover layer persists for the lifetime of the drag handler.

  _onHoverMove(e) {
    if (this.draft) return;

    const p = this._hitTestLattice(e);

    const last = this._lastHover;
    const same =
      p &&
      last &&
      p.day === last.day &&
      p.slot === last.slot &&
      p.allDay === last.allDay;

    if (same) return;
    if (!p && !last) return;

    this._lastHover = p;
    this._drawHover(p);
  }

  _onHoverLeave() {
    this._lastHover = null;
    if (this._hoverRing) this._hoverRing.style.opacity = "0";
  }

  _drawHover(p) {
    if (!this._hoverRing) this._ensureHoverLayer();
    if (!this._hoverRing) return;
    if (!p) {
      this._hoverRing.style.opacity = "0";
      return;
    }
    const px = this._latticeToPixel(p);
    this._hoverRing.setAttribute("cx", px.x);
    this._hoverRing.setAttribute("cy", px.y);
    this._hoverRing.style.opacity = "0.5";
  }

  // ── Lattice math ────────────────────────────────────────────────────────

  /**
   * Given a mouse event, return the nearest lattice point if the cursor
   * is within HIT pixels of it, else null.
   *
   * Lattice point shape: { day: int, slot: int|null, allDay: bool }
   */
  _hitTestLattice(e) {
    // Measure against the grid element. Its on-screen position already
    // moves with scrolling in both directions, so no scrollTop/scrollLeft
    // and no assumed header heights are needed.
    const rect = this.gridEl.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const { colW, numDays, slotHeight, totalSlots } = this.geom;

    const HIT = 12;

    // The all-day row's extent, in the same grid-relative coordinates.
    let allDayTop = 0;
    let allDayBottom = 0;
    if (this.allDayEl) {
      const ar = this.allDayEl.getBoundingClientRect();
      allDayTop = ar.top - rect.top;
      allDayBottom = ar.bottom - rect.top;
    }

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
    if (localY >= 0 && localY < slotHeight * totalSlots) {
      const relY = localY;
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

  _latticeToPixel(p, role = "start") {
    const { colW, slotHeight } = this.geom;
    const x = p.day * colW;
    // const x = role === "due" ? (p.day + 1) * colW : p.day * colW;
    // Same convention as the saved deadlines (DeadlineLayer._yFor).
    const y = p.allDay ? DL.ALL_DAY_Y : p.slot * slotHeight;
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
