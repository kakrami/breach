import { validationProfileLabel } from "./HardwareValidation.js";
export class HardwareValidationPanel {
    validation;
    callbacks;
    root;
    profile;
    stateText;
    progressText;
    instructionText;
    list;
    startButton;
    stopButton;
    resetButton;
    exportButton;
    closeButton;
    report = null;
    constructor(validation, callbacks) {
        this.validation = validation;
        this.callbacks = callbacks;
        this.root = document.createElement("section");
        this.root.className = "validation-panel glass";
        this.root.hidden = true;
        this.root.innerHTML = `
      <div class="validation-head">
        <div><span class="eyebrow">PHASE 4.1</span><strong>Hardware Validation</strong></div>
        <button class="compact validation-close" type="button" aria-label="Close hardware validation">×</button>
      </div>
      <div class="validation-toolbar">
        <label><span>Test profile</span><select class="validation-profile"></select></label>
        <button class="primary compact validation-start" type="button">Start Test</button>
        <button class="compact validation-stop" type="button">Stop & Evaluate</button>
        <button class="compact validation-reset" type="button">Reset</button>
        <button class="compact validation-export" type="button">Export JSON</button>
      </div>
      <div class="validation-summary">
        <div><span>Status</span><strong class="validation-state">IDLE</strong></div>
        <div><span>Progress</span><strong class="validation-progress">0 / 0</strong></div>
      </div>
      <div class="validation-next"><span>Next</span><strong class="validation-instruction">Choose a profile and start.</strong></div>
      <div class="validation-list"></div>`;
        document.body.appendChild(this.root);
        this.profile = this.must(".validation-profile");
        this.stateText = this.must(".validation-state");
        this.progressText = this.must(".validation-progress");
        this.instructionText = this.must(".validation-instruction");
        this.list = this.must(".validation-list");
        this.startButton = this.must(".validation-start");
        this.stopButton = this.must(".validation-stop");
        this.resetButton = this.must(".validation-reset");
        this.exportButton = this.must(".validation-export");
        this.closeButton = this.must(".validation-close");
        for (const value of ["desktop-kbm", "desktop-controller", "iphone-touch", "iphone-controller"]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = validationProfileLabel(value);
            this.profile.appendChild(option);
        }
        this.profile.addEventListener("change", () => this.validation.setProfile(this.profile.value));
        this.startButton.addEventListener("click", () => this.callbacks.onStart(this.profile.value));
        this.stopButton.addEventListener("click", this.callbacks.onStop);
        this.resetButton.addEventListener("click", this.callbacks.onReset);
        this.exportButton.addEventListener("click", this.callbacks.onExport);
        this.closeButton.addEventListener("click", () => this.hide());
        this.validation.subscribe((report) => this.render(report));
    }
    show(suggested) {
        if (suggested && !this.validation.isRunning() && this.validation.status() === "idle") {
            this.validation.setProfile(suggested);
            this.profile.value = suggested;
        }
        this.root.hidden = false;
    }
    hide() { this.root.hidden = true; }
    dispose() { this.root.remove(); }
    render(report) {
        this.report = report;
        this.profile.value = report.profile;
        this.profile.disabled = report.status === "running";
        this.startButton.disabled = report.status === "running";
        this.stopButton.disabled = report.status !== "running";
        this.resetButton.disabled = report.status === "running";
        this.exportButton.disabled = report.status === "idle";
        this.stateText.textContent = report.status.toUpperCase();
        this.stateText.dataset.state = report.status;
        const required = report.checks.filter((check) => check.required && check.status !== "na");
        const passed = required.filter((check) => check.status === "pass").length;
        this.progressText.textContent = `${passed} / ${required.length}`;
        const next = required.find((check) => check.status === "fail") ?? required.find((check) => check.status === "pending");
        this.instructionText.textContent = next ? `${next.label}: ${next.instruction}` : report.status === "pass" ? "All required checks passed. Export this report." : "No pending checks.";
        this.list.replaceChildren(...report.checks.map((check) => {
            const row = document.createElement("div");
            row.className = "validation-row";
            row.dataset.state = check.status;
            const body = document.createElement("div");
            body.innerHTML = `<span>${escapeHtml(check.category)}</span><strong>${escapeHtml(check.label)}</strong><small>${escapeHtml(check.detail)}</small>`;
            const result = document.createElement("div");
            result.className = "validation-result";
            result.textContent = check.status === "pending" ? "WAIT" : check.status.toUpperCase();
            row.append(body, result);
            if ((check.id === "safe-area" || check.id === "touch-gestures") && report.status === "running") {
                const actions = document.createElement("div");
                actions.className = "validation-manual";
                const pass = document.createElement("button");
                pass.className = "compact";
                pass.type = "button";
                pass.textContent = "Looks Good";
                pass.addEventListener("click", () => this.callbacks.onManual(check.id, "pass"));
                const fail = document.createElement("button");
                fail.className = "compact danger";
                fail.type = "button";
                fail.textContent = "Fail";
                fail.addEventListener("click", () => this.callbacks.onManual(check.id, "fail"));
                actions.append(pass, fail);
                row.appendChild(actions);
            }
            return row;
        }));
    }
    must(selector) {
        const found = this.root.querySelector(selector);
        if (!found)
            throw new Error(`Missing validation panel element ${selector}`);
        return found;
    }
}
function escapeHtml(value) {
    return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}
