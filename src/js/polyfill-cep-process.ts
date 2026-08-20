/**
 * CEP Chromium has no global `process`; Node exposes it on `window.cep_node.process`.
 * Must run before any panel module touches bare `process` (dev Vite + some deps).
 */
declare global {
  interface Window {
    process?: { env?: Record<string, string>; abort?: () => void };
  }
}

try {
  if (
    typeof window !== "undefined" &&
    typeof window.process === "undefined" &&
    window.cep_node?.process
  ) {
    window.process = window.cep_node.process;
  }
} catch {
  /* ignore */
}

export {};
