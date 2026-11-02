// Lets the user pan and zoom a rendered diagram inside its container.
//
// The diagram is drawn once, fitted to the container, and moved and scaled
// with a CSS transform, so the browser only recomposites it while panning and
// zooming: changing the SVG's own transform instead, as svg-pan-zoom did, lays
// out and paints every element of the diagram again on each frame. Once a
// gesture settles, the diagram is painted afresh at the new scale, so text
// stays sharp.

// Lucide-style strokes, drawn in the button's text colour.
const icon = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const CONTROLS = [
  ["Zoom in", (zoom) => zoom.zoomIn(), icon('<path d="M12 5v14M5 12h14"/>')],
  ["Zoom out", (zoom) => zoom.zoomOut(), icon('<path d="M5 12h14"/>')],
  [
    "Fit to view",
    (zoom) => zoom.reset(),
    icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  ],
];

// How far one button press zooms, and how far zooming may go out from and in
// on the fitted diagram.
const STEP = 1.25;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 100;
// A press that moves less than this (in px) is a click, not a pan.
const DRAG_DISTANCE = 4;
// How long after the last movement a gesture counts as settled.
const SETTLE_DELAY = 150;

const instances = new WeakMap();

const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

// The diagram's own size: its viewBox, or else its rendered box.
function naturalSize(svg) {
  const box = svg.viewBox?.baseVal;
  if (box && box.width > 0 && box.height > 0) return { width: box.width, height: box.height };
  const rect = svg.getBoundingClientRect();
  return { width: rect.width || 1, height: rect.height || 1 };
}

// The scale and offset that fit content of `size` inside `viewport`, centred.
export function fit(size, viewport) {
  const scale = Math.min(viewport.width / size.width, viewport.height / size.height) || 1;
  return {
    scale,
    x: (viewport.width - size.width * scale) / 2,
    y: (viewport.height - size.height * scale) / 2,
  };
}

// Keeps content of `size`, at `view`'s scale, from leaving `viewport`: larger
// than the viewport, it covers it; smaller, it stays inside.
export function contain(view, size, viewport) {
  const limit = (offset, extent, space) =>
    extent > space ? clamp(offset, space - extent, 0) : clamp(offset, 0, space - extent);

  return {
    scale: view.scale,
    x: limit(view.x, size.width * view.scale, viewport.width),
    y: limit(view.y, size.height * view.scale, viewport.height),
  };
}

// `view` zoomed by `factor` about the point (px, py) of the viewport, which
// stays where it is, within the zoom limits around `fitted`'s scale.
export function zoomAt(view, factor, px, py, fitted) {
  const scale = clamp(view.scale * factor, fitted.scale * MIN_ZOOM, fitted.scale * MAX_ZOOM);
  const ratio = scale / view.scale;
  return { scale, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}

// A wheel's movement in pixels, whatever unit the device reports it in.
const wheelPixels = (event) =>
  event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);

export function panZoom(container, svg) {
  instances.get(container)?.destroy();

  const size = naturalSize(svg);
  svg.removeAttribute("preserveAspectRatio");
  svg.classList.add("diagram-canvas");
  container.classList.add("diagram-viewport");

  // The container's size, and while a gesture lasts, its place on the page:
  // measured when they may have changed, not on every event, since measuring
  // after a move would have the browser lay the page out again.
  let viewport;
  let origin = null;
  let fitted;
  let view;
  let moved = false; // whether the user has panned or zoomed since it was fitted
  let frame = null;
  let settleTimer = null;

  // The diagram is drawn at its fitted size, so its layer is about as large
  // as the container rather than as the diagram, and scaled from there.
  const measure = () => {
    viewport = { width: container.clientWidth, height: container.clientHeight };
    fitted = fit(size, viewport);
    svg.setAttribute("width", size.width * fitted.scale);
    svg.setAttribute("height", size.height * fitted.scale);
  };

  const paint = () => {
    frame = null;
    svg.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale / fitted.scale})`;
  };

  // While a gesture lasts, the diagram is a layer of its own, moved and scaled
  // without painting; once it settles, it is painted at its new scale.
  const show = (next) => {
    view = contain(next, size, viewport);
    svg.style.willChange = "transform";
    frame ||= requestAnimationFrame(paint);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      svg.style.willChange = "";
      origin = null;
    }, SETTLE_DELAY);
  };

  const zoomBy = (factor, px, py) => {
    moved = true;
    show(zoomAt(view, factor, px, py, fitted));
  };

  const centre = () => [viewport.width / 2, viewport.height / 2];

  const point = (event) => {
    origin ||= container.getBoundingClientRect();
    return [event.clientX - origin.left, event.clientY - origin.top];
  };

  const onWheel = (event) => {
    event.preventDefault();
    zoomBy(Math.exp(-wheelPixels(event) / 500), ...point(event));
  };

  const onDblClick = (event) => {
    if (event.target.closest?.("a, .diagram-controls")) return;
    zoomBy(event.shiftKey ? 1 / 2 : 2, ...point(event));
  };

  // Pointers pressed on the diagram: one pans, two pinch.
  const pointers = new Map();
  let dragged = false;
  let start = null;

  const onPointerDown = (event) => {
    if (event.button !== 0 || event.target.closest?.(".diagram-controls")) return;
    pointers.set(event.pointerId, point(event));
    if (pointers.size === 1) {
      dragged = false;
      start = point(event);
    }
  };

  const onPointerMove = (event) => {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const now = point(event);

    if (pointers.size === 1) {
      if (!dragged && Math.hypot(now[0] - start[0], now[1] - start[1]) < DRAG_DISTANCE) return;
      if (!dragged) container.setPointerCapture?.(event.pointerId);
      dragged = true;
      moved = true;
      container.classList.add("is-panning");
      show({ ...view, x: view.x + now[0] - last[0], y: view.y + now[1] - last[1] });
    } else if (pointers.size === 2) {
      const [, other] = [...pointers].find(([id]) => id !== event.pointerId);
      const before = Math.hypot(last[0] - other[0], last[1] - other[1]);
      const after = Math.hypot(now[0] - other[0], now[1] - other[1]);
      dragged = true;
      if (before > 0) zoomBy(after / before, (now[0] + other[0]) / 2, (now[1] + other[1]) / 2);
    }

    pointers.set(event.pointerId, now);
  };

  // The click a pan ends with, if any, comes right after the pointer is
  // released; a pan released elsewhere ends with none.
  const onPointerUp = (event) => {
    pointers.delete(event.pointerId);
    if (pointers.size > 0) return;
    container.classList.remove("is-panning");
    if (dragged) setTimeout(() => (dragged = false));
  };

  // A press that panned isn't a click on what it started over.
  const onClick = (event) => {
    if (!dragged || event.target.closest?.(".diagram-controls")) return;
    dragged = false;
    event.preventDefault();
    event.stopPropagation();
  };

  const listeners = [
    ["wheel", onWheel, { passive: false }],
    ["dblclick", onDblClick],
    ["pointerdown", onPointerDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["pointercancel", onPointerUp],
    ["click", onClick, { capture: true }],
  ];
  for (const [type, listener, options] of listeners)
    container.addEventListener(type, listener, options);

  // The pane can change size without the window: a drawer or panel opening.
  const resizeObserver =
    typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => zoom.resize());

  const zoom = {
    zoomIn: () => zoomBy(STEP, ...centre()),
    zoomOut: () => zoomBy(1 / STEP, ...centre()),
    reset() {
      moved = false;
      show(fitted);
    },
    // The container changed size: a diagram the user hasn't moved fits it
    // again; one they have stays where it is, within it.
    resize() {
      measure();
      origin = null;
      show(moved ? view : fitted);
    },
    destroy() {
      for (const [type, listener, options] of listeners)
        container.removeEventListener(type, listener, options);
      resizeObserver?.disconnect();
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer);
      instances.delete(container);
    },
  };

  const toolbar = document.createElement("div");
  toolbar.className = "diagram-controls";
  for (const [label, action, svgIcon] of CONTROLS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "icon-button";
    button.setAttribute("aria-label", label);
    button.dataset.tooltipText = label;
    button.innerHTML = svgIcon;
    button.addEventListener("click", () => action(zoom));
    toolbar.append(button);
  }

  container.querySelector(":scope > .diagram-controls")?.remove();
  container.append(toolbar);

  measure();
  view = fitted;
  instances.set(container, zoom);
  resizeObserver?.observe(container);
  paint();

  return zoom;
}
