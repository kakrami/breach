import { BREACH_VERSION, PROTOCOL_VERSION } from "../../../../packages/shared/src/version.js";
export class DiagnosticsRecorder {
    entries = [];
    maxEntries = 2000;
    invariantFailures = 0;
    record(kind, data = null) {
        this.entries.push({ at: new Date().toISOString(), kind, data: sanitize(data) });
        if (this.entries.length > this.maxEntries)
            this.entries.splice(0, this.entries.length - this.maxEntries);
    }
    recordViolations(violations) {
        if (violations.length === 0)
            return;
        this.invariantFailures += violations.length;
        this.record("invariant.violation", violations);
    }
    countInvariantFailures() {
        return this.invariantFailures;
    }
    export(state, platform, input, hardwareValidation) {
        const payload = {
            schema: "breach-rebuild-diagnostics-v3",
            exportedAt: new Date().toISOString(),
            version: BREACH_VERSION,
            protocol: PROTOCOL_VERSION,
            invariantFailures: this.invariantFailures,
            platform: sanitize(platform),
            input: sanitize(input),
            state: sanitize(state),
            hardwareValidation: hardwareValidation ? sanitize(hardwareValidation) : null,
            entries: this.entries
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        const kind = hardwareValidation ? `hardware-${hardwareValidation.profile}` : "diagnostics";
        anchor.download = `breach-phase4-1-${kind}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
}
function sanitize(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return String(value);
    }
}
