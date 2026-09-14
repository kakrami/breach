import { GameClient } from "./GameClient.js";
let client = null;
try {
    client = new GameClient();
    window.__BREACH_PHASE4_1__ = client;
}
catch (error) {
    console.error("Breach Phase 4.1 bootstrap failed", error);
    const fatal = document.getElementById("fatalError");
    if (fatal) {
        fatal.hidden = false;
        fatal.textContent = error instanceof Error ? error.message : String(error);
    }
}
window.addEventListener("pagehide", () => client?.dispose(), { once: true });
