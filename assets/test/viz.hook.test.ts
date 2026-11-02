import { beforeEach, describe, expect, it, vi } from "vitest";

// Graphviz needs WebAssembly, so stand in for it: the graph renders as one
// linked node. Panning and zooming has tests of its own (pan-zoom.test.ts).
const { panZoom } = vi.hoisted(() => ({
  panZoom: vi.fn(() => ({ resize: vi.fn() })),
}));

vi.mock("../js/pan-zoom.js", () => ({ panZoom }));
vi.mock("@viz-js/viz", () => ({
  instance: async () => ({
    renderSVGElement: () =>
      new DOMParser().parseFromString(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80pt" height="40pt"><a xlink:href="#ash-attribute:demo-x:y"><text>y</text></a></svg>',
        "image/svg+xml",
      ).documentElement,
  }),
}));

import Viz from "../js/viz.hook.js";

// A hook on a <pre> holding a graph, with the given data attributes.
function hookFor(id: string, data: Record<string, string> = {}) {
  const el = document.createElement("pre");
  el.id = id;
  Object.assign(el.dataset, { graph: `digraph { "${id}" }` }, data);
  return Object.assign(Object.create(Viz), { el, pushEvent: vi.fn() });
}

beforeEach(() => panZoom.mockClear());

describe("render", () => {
  it("lets the user pan and zoom a graph, and opens a clicked vertex in the graph", async () => {
    const hook = hookFor("pannable");

    await hook.render();
    hook.el.querySelector("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(panZoom).toHaveBeenCalledExactlyOnceWith(hook.el, hook.el.querySelector("svg"));
    expect(hook.pushEvent).toHaveBeenCalledWith("viz:click", { id: "ash-attribute:demo-x:y" });
  });

  it("keeps a diagram among sections at its own size, and sends its own event", async () => {
    const hook = hookFor("fixed", { panZoom: "false", event: "viz:open" });

    await hook.render();
    hook.el.querySelector("a").dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const svg = hook.el.querySelector("svg");
    expect(panZoom).not.toHaveBeenCalled();
    expect(svg.getAttribute("width")).toBe("80pt");
    expect(svg.style.maxWidth).toBe("100%");
    expect(hook.pushEvent).toHaveBeenCalledWith("viz:open", { id: "ash-attribute:demo-x:y" });
  });
});
