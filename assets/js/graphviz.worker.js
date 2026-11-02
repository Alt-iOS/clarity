// Graphviz, run in a worker by graphviz.js. It is a chunk like any other (see
// graphviz.js), so it says where it was loaded from for the worker to load it
// again; in a worker, it lays out each graph it is sent and replies with its SVG.

import { instance } from "@viz-js/viz";

export { instance };

export const url = import.meta.url;

if (typeof document === "undefined" && typeof self.postMessage === "function") {
  const viz = instance();

  self.addEventListener("message", async ({ data: { id, graph } }) => {
    try {
      self.postMessage({ id, svg: (await viz).renderString(graph, { format: "svg" }) });
    } catch (error) {
      self.postMessage({ id, error: String(error?.message ?? error) });
    }
  });
}
