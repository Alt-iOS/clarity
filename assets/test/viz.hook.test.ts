import { beforeEach, describe, expect, it, vi } from "vitest";

// Graphviz (graphviz.test.ts) needs WebAssembly, so stand in for it: the graph
// renders as one linked node, unless a test makes it fail. Panning and zooming
// has tests of its own (pan-zoom.test.ts).
const { panZoom, failure } = vi.hoisted(() => ({
  panZoom: vi.fn(() => ({ resize: vi.fn() })),
  failure: { error: null as Error | null },
}));

vi.mock("../js/pan-zoom.js", () => ({ panZoom }));
vi.mock("../js/graphviz.js", () => ({
  renderSvg: async () => {
    if (failure.error) throw failure.error;
    return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="80pt" height="40pt"><a xlink:href="#ash-attribute:demo-x:y"><text>y</text></a></svg>';
  },
}));

import Viz from "../js/viz.hook.js";

// A hook on a <pre> holding a graph, with the given data attributes.
function hookFor(id: string, data: Record<string, string> = {}) {
  const el = document.createElement("pre");
  el.id = id;
  Object.assign(el.dataset, { graph: `digraph { "${id}" }` }, data);
  return Object.assign(Object.create(Viz), { el, pushEvent: vi.fn() });
}

beforeEach(() => {
  panZoom.mockClear();
  failure.error = null;
});

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

describe("a graph that can't be drawn", () => {
  // What Chrome reports when the page's policy refuses Graphviz's WebAssembly.
  const blocked = new Error(
    "Aborted(CompileError: WebAssembly.instantiate(): Compiling or instantiating WebAssembly module violates the following Content Security policy directive because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: \"script-src 'self'\")",
  );

  it("says the Content Security Policy blocks it, rather than rendering forever", async () => {
    failure.error = blocked;
    const hook = hookFor("blocked");

    await hook.render();

    const error = hook.el.querySelector(".diagram-error[role=alert]");
    expect(error.textContent).toContain("couldn't be drawn");
    expect(error.textContent).toContain("'wasm-unsafe-eval'");
    expect(hook.el.querySelector("svg")).toBeNull();
    expect(panZoom).not.toHaveBeenCalled();
  });

  it("draws the next graph once Graphviz can", async () => {
    failure.error = blocked;
    const hook = hookFor("retried");
    await hook.render();

    failure.error = null;
    hook.el.dataset.graph = 'digraph { "retried" -> "again" }';
    await hook.render();

    expect(hook.el.querySelector(".diagram-error")).toBeNull();
    expect(hook.el.querySelector("svg")).not.toBeNull();
  });
});
