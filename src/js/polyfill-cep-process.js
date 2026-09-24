try {
    if (typeof window !== "undefined" &&
        typeof window.process === "undefined" &&
        window.cep_node?.process) {
        window.process = window.cep_node.process;
    }
}
catch {
    /* ignore */
}
export {};
