export class PlatformCapabilities {
    listeners = new Set();
    snapshotValue;
    coarseQuery = matchMedia("(pointer: coarse)");
    reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");
    handlers = [];
    safeAreaProbe;
    constructor() {
        this.safeAreaProbe = document.createElement("div");
        this.safeAreaProbe.setAttribute("aria-hidden", "true");
        this.safeAreaProbe.style.cssText = [
            "position:fixed",
            "left:-9999px",
            "top:-9999px",
            "width:0",
            "height:0",
            "visibility:hidden",
            "pointer-events:none",
            "padding-top:env(safe-area-inset-top,0px)",
            "padding-right:env(safe-area-inset-right,0px)",
            "padding-bottom:env(safe-area-inset-bottom,0px)",
            "padding-left:env(safe-area-inset-left,0px)"
        ].join(";");
        document.documentElement.appendChild(this.safeAreaProbe);
        this.snapshotValue = this.read();
        this.bind(window, "resize");
        this.bind(window, "orientationchange");
        this.bind(window, "gamepadconnected");
        this.bind(window, "gamepaddisconnected");
        this.bind(document, "visibilitychange");
        this.bind(this.coarseQuery, "change");
        this.bind(this.reducedMotionQuery, "change");
        window.visualViewport?.addEventListener("resize", this.refresh);
        window.visualViewport?.addEventListener("scroll", this.refresh);
        if (window.visualViewport) {
            this.handlers.push(() => window.visualViewport?.removeEventListener("resize", this.refresh));
            this.handlers.push(() => window.visualViewport?.removeEventListener("scroll", this.refresh));
        }
    }
    snapshot() {
        return { ...this.snapshotValue, safeArea: { ...this.snapshotValue.safeArea } };
    }
    subscribe(listener) {
        this.listeners.add(listener);
        listener(this.snapshot());
        return () => this.listeners.delete(listener);
    }
    dispose() {
        for (const unbind of this.handlers.splice(0))
            unbind();
        this.safeAreaProbe.remove();
        this.listeners.clear();
    }
    refresh = () => {
        const next = this.read();
        if (JSON.stringify(next) === JSON.stringify(this.snapshotValue))
            return;
        this.snapshotValue = next;
        for (const listener of [...this.listeners])
            listener(this.snapshot());
    };
    read() {
        const vv = window.visualViewport;
        const safe = getComputedStyle(this.safeAreaProbe);
        return {
            width: window.innerWidth,
            height: window.innerHeight,
            visualWidth: Math.round(vv?.width ?? window.innerWidth),
            visualHeight: Math.round(vv?.height ?? window.innerHeight),
            visualScale: Number((vv?.scale ?? 1).toFixed(3)),
            devicePixelRatio: Number(window.devicePixelRatio.toFixed(3)),
            orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
            touchCapable: navigator.maxTouchPoints > 0,
            coarsePointer: this.coarseQuery.matches,
            standalone: matchMedia("(display-mode: standalone)").matches || Boolean(navigator.standalone),
            visible: document.visibilityState === "visible",
            gamepadConnected: [...(navigator.getGamepads?.() ?? [])].some(Boolean),
            reducedMotion: this.reducedMotionQuery.matches,
            safeArea: {
                top: cssPx(safe.paddingTop),
                right: cssPx(safe.paddingRight),
                bottom: cssPx(safe.paddingBottom),
                left: cssPx(safe.paddingLeft)
            },
            userAgent: navigator.userAgent
        };
    }
    bind(target, event) {
        target.addEventListener(event, this.refresh);
        this.handlers.push(() => target.removeEventListener(event, this.refresh));
    }
}
function cssPx(value) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}
