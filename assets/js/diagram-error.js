// What a diagram shows in place of itself when it can't be drawn, so a failure
// reads as one rather than as "Rendering diagram…" forever.

// Graphviz is WebAssembly, which a Content Security Policy without
// 'wasm-unsafe-eval' (or 'unsafe-eval') in script-src refuses to compile.
const BLOCKED_WASM = /Content Security Policy|wasm-unsafe-eval|unsafe-eval/i;

export function explain(error) {
  const message = String(error?.message ?? error ?? "");

  if (BLOCKED_WASM.test(message)) {
    return "The page's Content Security Policy blocks WebAssembly, which drawing this diagram needs. Allow it with 'wasm-unsafe-eval' in the policy's script-src.";
  }

  return message || "Something went wrong drawing it.";
}

// Replaces the container's content with the error, keeping the container so
// a later update can render into it again.
export function showError(container, error) {
  const box = document.createElement("div");
  box.className = "diagram-error";
  box.setAttribute("role", "alert");

  const title = document.createElement("p");
  title.className = "diagram-error-title";
  title.textContent = "This diagram couldn't be drawn.";

  const detail = document.createElement("p");
  detail.textContent = explain(error);

  box.append(title, detail);
  container.replaceChildren(box);
}
