// Lays graphs out with Graphviz, in a worker, so laying out a large graph (a
// second or more for a few hundred nodes) doesn't hold up the page.
//
// Graphviz is a megabyte of WebAssembly, in a chunk of its own
// (graphviz.worker.js) that loads when the first graph renders. The worker
// loads that same chunk, from where it says it was loaded. Where no worker can
// start, or it fails, graphs are laid out on the page instead.

let ready;

export function renderSvg(graph) {
  ready ||= import("./graphviz.worker.js")
    .then(({ url, instance }) => inWorker(url, () => onPage(instance)) ?? onPage(instance))
    .catch((error) => {
      ready = null;
      throw error;
    });

  return ready.then((render) => render(graph));
}

function onPage(instance) {
  const viz = instance();
  return async (graph) => (await viz).renderString(graph, { format: "svg" });
}

function inWorker(url, fallback) {
  if (typeof Worker === "undefined") return null;

  let worker;
  try {
    worker = new Worker(url, { type: "module" });
  } catch {
    return null;
  }

  const pending = new Map();
  let nextId = 0;

  worker.addEventListener("message", ({ data: { id, svg, error } }) => {
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    if (error) request.reject(new Error(error));
    else request.resolve(svg);
  });

  // The worker itself failed, as when its script can't load: the graphs
  // waiting on it, and those after, are laid out on the page.
  worker.addEventListener("error", (event) => {
    event.preventDefault?.();
    worker.terminate();
    const render = fallback();
    ready = Promise.resolve(render);
    for (const { graph, resolve, reject } of pending.values()) render(graph).then(resolve, reject);
    pending.clear();
  });

  return (graph) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { graph, resolve, reject });
      worker.postMessage({ id, graph });
    });
}
