import { beforeEach, describe, expect, it, vi } from "vitest";

// Mermaid needs real layout, so stand in for it, and for panning and zooming
// (see pan-zoom.test.ts).
const { panZoom } = vi.hoisted(() => ({
  panZoom: vi.fn(() => ({ resize: vi.fn() })),
}));

vi.mock("../js/pan-zoom.js", () => ({ panZoom }));
vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 10 10"></svg>' })),
  },
}));

import Mermaid from "../js/mermaid.hook.js";

// A hook on a <pre> holding a diagram, with the given data attributes.
function hookFor(id: string, data: Record<string, string> = {}) {
  const el = document.createElement("pre");
  el.id = id;
  Object.assign(el.dataset, { graph: "stateDiagram-v2\n  [*] --> a" }, data);
  return Object.assign(Object.create(Mermaid), { el });
}

beforeEach(() => panZoom.mockClear());

describe("render", () => {
  it("lets the user pan and zoom a diagram", async () => {
    const hook = hookFor("pannable");

    await hook.render();

    expect(panZoom).toHaveBeenCalledExactlyOnceWith(hook.el, hook.el.querySelector("svg"));
  });

  it("fits a diagram that opts out of pan and zoom to its box", async () => {
    const hook = hookFor("fitted", { panZoom: "false" });

    await hook.render();

    expect(panZoom).not.toHaveBeenCalled();
    expect(hook.el.querySelector("svg").getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
  });
});
