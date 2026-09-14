export const CANONICAL_SERVER_BASE = "https://breach-online.kiadesignenterprise.workers.dev";
export const OBSOLETE_ALPHA_SERVER_BASE = "https://breach-online-alpha.kiadesignenterprise.workers.dev";
export function normalizeServerBase(value) {
    const trimmed = String(value ?? "").trim().replace(/\/$/, "");
    if (!trimmed || trimmed === OBSOLETE_ALPHA_SERVER_BASE)
        return CANONICAL_SERVER_BASE;
    return trimmed;
}
