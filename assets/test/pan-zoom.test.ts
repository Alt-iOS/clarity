import { beforeEach, describe, expect, it, vi } from "vitest";

import { contain, fit, panZoom, zoomAt } from "../js/pan-zoom.js";

// A 400×300 diagram's container, 800×600 on the page, holding its SVG.
function diagram() {
  const container = document.createElement("pre");
  container.innerHTML =
    '<svg viewBox="0 0 400 300"><g transform="translate(4 4)"><a href="#v"><text>v</text></a></g></svg>';
  Object.defineProperty(container, "clientWidth", { value: 800 });
  Object.defineProperty(container, "clientHeight", { value: 600 });
  document.body.replaceChildren(container);
  return { container, svg: container.querySelector("svg")! };
}

const button = (container: Element, label: string) =>
  container.querySelector<HTMLButtonElement>(`.diagram-controls button[aria-label="${label}"]`);

// The diagram's transform once the next frame has painted it.
async function transform(svg: SVGSVGElement) {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  return svg.style.transform;
}

const pointer = (type: string, x: number, y: number, pointerId = 1) =>
  new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId });

// happy-dom leaves a WheelEvent without its pointer position.
function wheel(deltaY: number, clientX: number, clientY: number) {
  const event = new WheelEvent("wheel", { deltaY, cancelable: true });
  Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } });
  return event;
}

beforeEach(() => vi.useRealTimers());

describe("panZoom", () => {
  // Drawn at its own size, a large diagram would make a layer far larger than
  // the page, slow to paint.
  it("draws the diagram fitted to its container", () => {
    const { container, svg } = diagram();

    panZoom(container, svg);

    expect(svg.getAttribute("width")).toBe("800");
    expect(svg.getAttribute("height")).toBe("600");
    expect(svg.style.transform).toBe("translate(0px, 0px) scale(1)");
  });

  // svg-pan-zoom set the SVG's own transform, which has the browser lay out
  // and paint the whole diagram on every frame of a pan or zoom.
  it("zooms by moving the diagram's layer, leaving the SVG's own transform alone", async () => {
    const { container, svg } = diagram();
    panZoom(container, svg);

    container.dispatchEvent(wheel(-100, 400, 300));

    expect(svg.style.willChange).toBe("transform");
    // Zoomed by e^0.2 about the point under the pointer, the viewport's centre.
    const scale = 2 * Math.exp(0.2);
    expect(await transform(svg)).toBe(
      `translate(${400 - 400 * (scale / 2)}px, ${300 - 300 * (scale / 2)}px) scale(${scale / 2})`,
    );
    expect(svg.querySelector("g")!.getAttribute("transform")).toBe("translate(4 4)");
  });

  it("paints the diagram afresh once a gesture settles, so it stays sharp", () => {
    vi.useFakeTimers();
    const { container, svg } = diagram();
    panZoom(container, svg);

    button(container, "Zoom in")!.click();
    expect(svg.style.willChange).toBe("transform");

    vi.advanceTimersByTime(200);
    expect(svg.style.willChange).toBe("");
  });

  it("pans by dragging, and a drag doesn't click what it started on", async () => {
    const { container, svg } = diagram();
    panZoom(container, svg);
    button(container, "Zoom in")!.click();
    const zoomed = await transform(svg);
    const clicked = vi.fn();
    svg.querySelector("a")!.addEventListener("click", clicked);

    const link = svg.querySelector("text")!;
    link.dispatchEvent(pointer("pointerdown", 400, 300));
    link.dispatchEvent(pointer("pointermove", 380, 290));
    link.dispatchEvent(pointer("pointerup", 380, 290));
    link.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(await transform(svg)).not.toBe(zoomed);
    expect(clicked).not.toHaveBeenCalled();
  });

  it("lets the next click through after a pan that ended without one", async () => {
    const { container, svg } = diagram();
    panZoom(container, svg);
    button(container, "Zoom in")!.click();
    const clicked = vi.fn();
    svg.querySelector("a")!.addEventListener("click", clicked);

    // Released over something else, the pan ends with no click.
    const text = svg.querySelector("text")!;
    text.dispatchEvent(pointer("pointerdown", 400, 300));
    text.dispatchEvent(pointer("pointermove", 300, 250));
    container.dispatchEvent(pointer("pointerup", 300, 250));
    await new Promise((resolve) => setTimeout(resolve));

    button(container, "Fit to view")!.click();
    text.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(await transform(svg)).toBe("translate(0px, 0px) scale(1)");
    expect(clicked).toHaveBeenCalledOnce();
  });

  it("lets a press that doesn't move click what it's on", () => {
    const { container, svg } = diagram();
    panZoom(container, svg);
    const clicked = vi.fn();
    svg.querySelector("a")!.addEventListener("click", clicked);

    const link = svg.querySelector("text")!;
    link.dispatchEvent(pointer("pointerdown", 400, 300));
    link.dispatchEvent(pointer("pointermove", 401, 300));
    link.dispatchEvent(pointer("pointerup", 401, 300));
    link.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(clicked).toHaveBeenCalledOnce();
  });

  it("adds named buttons, with hover hints, that zoom in, zoom out and fit the diagram", async () => {
    const { container, svg } = diagram();
    panZoom(container, svg);

    button(container, "Zoom in")!.click();
    expect(await transform(svg)).toBe("translate(-100px, -75px) scale(1.25)");

    button(container, "Zoom out")!.click();
    expect(await transform(svg)).toBe("translate(0px, 0px) scale(1)");

    button(container, "Zoom in")!.click();
    button(container, "Fit to view")!.click();
    expect(await transform(svg)).toBe("translate(0px, 0px) scale(1)");

    for (const label of ["Zoom in", "Zoom out", "Fit to view"]) {
      expect(button(container, label)!.dataset.tooltipText).toBe(label);
    }
  });

  it("keeps one set of controls, and one set of listeners, when the diagram renders again", async () => {
    const { container, svg } = diagram();

    panZoom(container, svg);
    panZoom(container, svg);
    container.dispatchEvent(wheel(-500, 0, 0));

    expect(container.querySelectorAll(".diagram-controls")).toHaveLength(1);
    // One listener zooms by e: two would have zoomed by e².
    expect(await transform(svg)).toBe(`translate(0px, 0px) scale(${Math.E})`);
  });
});

describe("fit", () => {
  it("scales content to fit inside the viewport, centred", () => {
    expect(fit({ width: 400, height: 100 }, { width: 800, height: 600 })).toEqual({
      scale: 2,
      x: 0,
      y: 200,
    });
  });
});

describe("zoomAt", () => {
  const fitted = { scale: 1, x: 0, y: 0 };

  it("keeps the point zoomed about where it is", () => {
    const view = zoomAt({ scale: 1, x: 10, y: 20 }, 2, 110, 120, fitted);

    expect(view).toEqual({ scale: 2, x: -90, y: -80 });
    // The content under (110, 120) before is still under it.
    expect((110 - view.x) / view.scale).toBe(100);
  });

  it("zooms no further out than half the fitted scale, nor in than a hundred times it", () => {
    expect(zoomAt(fitted, 0.01, 0, 0, fitted).scale).toBe(0.5);
    expect(zoomAt(fitted, 1000, 0, 0, fitted).scale).toBe(100);
  });
});

describe("contain", () => {
  const viewport = { width: 100, height: 100 };

  it("keeps content larger than the viewport covering it", () => {
    expect(contain({ scale: 2, x: 50, y: -500 }, { width: 100, height: 100 }, viewport)).toEqual({
      scale: 2,
      x: 0,
      y: -100,
    });
  });

  it("keeps content smaller than the viewport inside it", () => {
    expect(contain({ scale: 1, x: -10, y: 90 }, { width: 50, height: 50 }, viewport)).toEqual({
      scale: 1,
      x: 0,
      y: 50,
    });
  });
});
