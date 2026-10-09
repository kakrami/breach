// One heartbeat owner follows the open connection, including lobbies and
// background tabs. Rendering and simulation do not own connection liveness.
export function createSessionNetworkOwner({ heartbeat, intervalMs = () => 10000,
  now = () => Date.now(), schedule = setTimeout, cancel = clearTimeout,
  visibilityTarget = globalThis.document, pageTarget = globalThis.window } = {}) {
  let socket = null, timer = null, lastSentAt = -Infinity, disposed = false;
  const cadence = () => Math.max(2000, Math.min(10000, Number(intervalMs()) || 10000));
  function clear() { if (timer !== null) cancel(timer); timer = null; }
  function stop(expectedSocket) {
    if (expectedSocket && expectedSocket !== socket) return;
    clear(); socket = null; lastSentAt = -Infinity;
  }
  function pulse() {
    clear();
    const owner = socket;
    if (disposed || !owner || owner.readyState !== 1) { stop(); return; }
    const elapsed = now() - lastSentAt;
    if (elapsed >= 1000 || elapsed < 0) {
      lastSentAt = now();
      try { heartbeat(owner); } catch { /* A later close/reconnect owns recovery. */ }
    }
    if (owner === socket && !disposed) timer = schedule(pulse, cadence());
  }
  function start(nextSocket) {
    if (disposed || nextSocket?.readyState !== 1) return;
    if (nextSocket === socket) return;
    stop(); socket = nextSocket; pulse();
  }
  function visible() { if (!visibilityTarget?.hidden && socket) pulse(); }
  function resumed() { if (socket) pulse(); }
  visibilityTarget?.addEventListener?.('visibilitychange', visible);
  pageTarget?.addEventListener?.('pageshow', resumed);
  return { start, stop, resume: resumed,
    dispose() { stop(); disposed = true; visibilityTarget?.removeEventListener?.('visibilitychange', visible); pageTarget?.removeEventListener?.('pageshow', resumed); },
  };
}
