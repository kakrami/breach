export function createAudioEngine({ cues, getVolumes = () => ({ master: 1, sfx: 1, music: 1 }) }) {
  let ctx = null;
  let unlocked = false;
  const encoded = new Map();
  const fetching = new Map();
  const buffers = new Map();
  const decoding = new Map();
  const unlockWaiters = new Set();

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

  function existingContext() { return ctx; }

  function createContextFromGesture() {
    if (ctx?.state === 'closed') { ctx = null; unlocked = false; buffers.clear(); decoding.clear(); }
    if (ctx) return ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try { ctx = new AudioContext({ latencyHint: 'interactive' }); }
    catch { try { ctx = new AudioContext(); } catch { ctx = null; } }
    return ctx;
  }

  function resolveUnlockWaiters(value) {
    if (!value) return;
    for (const resolve of unlockWaiters) resolve(true);
    unlockWaiters.clear();
  }

  function waitForUnlock() {
    if (unlocked && ctx?.state === 'running') return Promise.resolve(true);
    return new Promise(resolve => unlockWaiters.add(resolve));
  }

  async function resumeExisting() {
    if (!ctx) return false;
    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') await ctx.resume();
    } catch {}
    if (ctx.state === 'running') {
      unlocked = true;
      resolveUnlockWaiters(true);
      return true;
    }
    return false;
  }

  async function unlock() {
    const audio = createContextFromGesture();
    if (!audio) return false;
    if (unlocked && audio.state === 'running') { resolveUnlockWaiters(true); return true; }
    try {
      if (audio.state !== 'running') await audio.resume();
      // A one-frame silent source makes the unlock explicit on mobile WebKit.
      // It is created only from the user's gesture, never during page load.
      const silent = audio.createBuffer(1, 1, Math.max(8000, audio.sampleRate || 22050));
      const source = audio.createBufferSource();
      const gain = audio.createGain();
      gain.gain.value = 0;
      source.buffer = silent;
      source.connect(gain).connect(audio.destination);
      source.start(0);
      try { source.stop(audio.currentTime + .01); } catch {}
      if (audio.state !== 'running') await audio.resume();
    } catch {}
    unlocked = audio.state === 'running';
    if (unlocked) resolveUnlockWaiters(true);
    return unlocked;
  }

  async function fetchEncoded(id) {
    if (encoded.has(id)) return encoded.get(id);
    if (fetching.has(id)) return fetching.get(id);
    const cue = cues[id];
    if (!cue) return null;
    const promise = (async () => {
      const response = await fetch(cue.url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Audio ${id}: HTTP ${response.status}`);
      const bytes = await response.arrayBuffer();
      if (!bytes.byteLength) throw new Error(`Audio ${id}: empty response`);
      encoded.set(id, bytes);
      return bytes;
    })().catch(error => {
      console.warn(error);
      return null;
    }).finally(() => fetching.delete(id));
    fetching.set(id, promise);
    return promise;
  }

  async function decode(id) {
    if (buffers.has(id)) return buffers.get(id);
    if (decoding.has(id)) return decoding.get(id);
    const cue = cues[id];
    if (!cue) return null;
    const promise = (async () => {
      const bytes = await fetchEncoded(id);
      if (!bytes) return null;
      const ready = await waitForUnlock();
      if (!ready || !ctx) return null;
      // decodeAudioData may detach its input buffer on WebKit, so decode a copy.
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      buffers.set(id, decoded);
      return decoded;
    })().catch(error => {
      console.warn(`Audio ${id}: decode failed`, error);
      return null;
    }).finally(() => decoding.delete(id));
    decoding.set(id, promise);
    return promise;
  }

  // Preloading is intentionally fetch-only. It is safe before user activation
  // and cannot create/suspend the shared AudioContext.
  async function preloadAll(onProgress) {
    const ids = Object.keys(cues);
    let done = 0, failed = 0, cursor = 0;
    const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        if (!(await fetchEncoded(id))) failed += 1;
        done += 1;
        onProgress?.(done, ids.length);
      }
    });
    await Promise.all(workers);
    return { total: ids.length, fetched: ids.length - failed, failed };
  }

  async function prepareAll(onProgress) {
    await preloadAll();
    const ids = Object.keys(cues);
    let done = 0, failed = 0, cursor = 0;
    const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        if (!(await decode(id))) failed += 1;
        done += 1;
        onProgress?.(done, ids.length);
      }
    });
    await Promise.all(workers);
    return { total: ids.length, decoded: ids.length - failed, failed };
  }

  function startDecoded(handle, cue, buffer, volume, options) {
    if (handle.cancelled || !ctx || ctx.state !== 'running' || !buffer) return false;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const volumes = getVolumes() || {};
    const category = cue.group === 'Music' ? Number(volumes.music ?? 1) : Number(volumes.sfx ?? 1);
    const base = clamp01(Number(volumes.master ?? 1) * category * Number(cue.gain ?? 1) * Number(volume ?? 1));
    source.buffer = buffer;
    source.loop = !!(options.loop ?? cue.loop);
    source.playbackRate.value = Math.max(0.5, Math.min(2, Number(options.rate ?? options.playbackRate ?? cue.rate ?? 1)));
    gain.gain.value = handle.volumeOverride == null ? base : clamp01(handle.volumeOverride);
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, Number(options.pan ?? 0)));
      source.connect(gain).connect(pan).connect(ctx.destination);
    } else source.connect(gain).connect(ctx.destination);
    handle.source = source;
    handle.gain = gain;
    try {
      source.start();
      if (!source.loop && Number.isFinite(Number(options.maxDuration))) {
        const duration = Math.max(.02, Number(options.maxDuration));
        try { source.stop(ctx.currentTime + duration); } catch {}
      }
    } catch { return false; }
    source.onended = () => {
      handle.source = null;
      if (!handle.cancelled) options.onended?.();
    };
    return true;
  }

  function play(id, volume = 1, options = {}) {
    const cue = cues[id];
    if (!cue) return null;
    const handle = {
      source: null,
      gain: null,
      cancelled: false,
      volumeOverride: null,
      stop() {
        this.cancelled = true;
        try { this.source?.stop(); } catch {}
      },
      setVolume(next) {
        this.volumeOverride = clamp01(next);
        if (this.gain && ctx) this.gain.gain.setTargetAtTime(this.volumeOverride, ctx.currentTime, .02);
      },
    };

    const readyBuffer = buffers.get(id);
    if (unlocked && ctx?.state === 'running' && readyBuffer) {
      startDecoded(handle, cue, readyBuffer, volume, options);
      return handle;
    }

    // Do not drop a cue just because its buffer is still being fetched/decoded.
    // It will start after the next successful user-gesture unlock.
    void (async () => {
      if (!unlocked || ctx?.state !== 'running') await waitForUnlock();
      const buffer = await decode(id);
      if (ctx?.state !== 'running') await resumeExisting();
      startDecoded(handle, cue, buffer, volume, options);
    })();
    return handle;
  }

  function status() {
    return {
      contextCreated: !!ctx,
      contextState: ctx?.state || 'none',
      unlocked,
      fetched: encoded.size,
      decoded: buffers.size,
      total: Object.keys(cues).length,
    };
  }

  return { context: existingContext, unlock, resume: resumeExisting, load: decode, preloadAll, prepareAll, play, status };
}
