import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Graphviz needs WebAssembly, so stand in for it: it "lays out" a graph as
// an SVG naming it. The worker module says where it was loaded from.
const { renderString } = vi.hoisted(() => ({
  renderString: vi.fn((graph: string) => `<svg>${graph}</svg>`),
}));

vi.mock("../js/graphviz.worker.js", () => ({
  url: "https://example.test/assets/chunks/graphviz.worker-ABC.js",
  instance: async () => ({ renderString }),
}));

// A worker that answers like graphviz.worker.js, or fails as told.
class FakeWorker extends EventTarget {
  static started: FakeWorker[] = [];
  static failing: "load" | "graph" | null = null;

  constructor(
    readonly url: string,
    readonly options: WorkerOptions,
  ) {
    super();
    FakeWorker.started.push(this);
  }

  postMessage({ id, graph }: { id: number; graph: string }) {
    queueMicrotask(() => {
      if (FakeWorker.failing === "load") {
        this.dispatchEvent(Object.assign(new Event("error"), { message: "no worker" }));
      } else if (FakeWorker.failing === "graph") {
        this.dispatchEvent(new MessageEvent("message", { data: { id, error: "syntax error in line 1" } }));
      } else {
        this.dispatchEvent(new MessageEvent("message", { data: { id, svg: `<svg>worker: ${graph}</svg>` } }));
      }
    });
  }

  terminate() {}
}

// The module keeps the worker it started, so each test loads its own.
async function load() {
  vi.resetModules();
  return import("../js/graphviz.js");
}

beforeEach(() => {
  FakeWorker.started = [];
  FakeWorker.failing = null;
  renderString.mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("renderSvg", () => {
  it("lays graphs out in one worker, started from Graphviz's own chunk, off the page", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    const { renderSvg } = await load();

    expect(await renderSvg("digraph { a }")).toBe("<svg>worker: digraph { a }</svg>");
    expect(await renderSvg("digraph { b }")).toBe("<svg>worker: digraph { b }</svg>");

    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0].url).toBe("https://example.test/assets/chunks/graphviz.worker-ABC.js");
    expect(FakeWorker.started[0].options).toEqual({ type: "module" });
    expect(renderString).not.toHaveBeenCalled();
  });

  it("passes on what Graphviz says is wrong with a graph", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.failing = "graph";
    const { renderSvg } = await load();

    await expect(renderSvg("digraph {")).rejects.toThrow("syntax error in line 1");
  });

  it("lays graphs out on the page when the worker can't run", async () => {
    vi.stubGlobal("Worker", FakeWorker);
    FakeWorker.failing = "load";
    const { renderSvg } = await load();

    expect(await renderSvg("digraph { a }")).toBe("<svg>digraph { a }</svg>");
    expect(await renderSvg("digraph { b }")).toBe("<svg>digraph { b }</svg>");
    expect(FakeWorker.started).toHaveLength(1);
  });

  it("lays graphs out on the page where there are no workers", async () => {
    vi.stubGlobal("Worker", undefined);
    const { renderSvg } = await load();

    expect(await renderSvg("digraph { a }")).toBe("<svg>digraph { a }</svg>");
  });
});
