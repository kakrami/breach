export function createAudioEngine({ cues, getVolumes = () => ({ master: 1, sfx: 1, music: 1 }) }) {
  let ctx = null;
  let unlocked = false;
  let sfxBus = null;
  let sfxCompressor = null;
  let musicBus = null;
  const encoded = new Map();
  const fetching = new Map();
  const buffers = new Map();
  const decoding = new Map();
  const unlockWaiters = new Set();
  const activeVoices = new Set();

  const GROUP_VOICE_LIMITS = Object.freeze({
    Gunfire: 24,
    Explosions: 8,
    Feedback: 10,
    Impacts: 10,
    'Weapon Handling': 8,
    Movement: 12,
    Tactical: 10,
    Music: 2,
  });
  const GROUP_CUE_LIMITS = Object.freeze({
    Gunfire: 10,
    Explosions: 4,
    Feedback: 5,
    Impacts: 6,
    'Weapon Handling': 4,
    Movement: 6,
    Tactical: 6,
    Music: 1,
  });

  const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));

  function existingContext() { return ctx; }

  function resetGraph() {
    sfxBus = null;
    sfxCompressor = null;
    musicBus = null;
    activeVoices.clear();
  }

  function ensureGraph() {
    if (!ctx) return false;
    if (sfxBus && musicBus) return true;
    try {
      sfxBus = ctx.createGain();
      musicBus = ctx.createGain();
      if (ctx.createDynamicsCompressor) {
        sfxCompressor = ctx.createDynamicsCompressor();
        sfxCompressor.threshold.value = -10;
        sfxCompressor.knee.value = 12;
        sfxCompressor.ratio.value = 4;
        sfxCompressor.attack.value = .003;
        sfxCompressor.release.value = .16;
        sfxBus.connect(sfxCompressor).connect(ctx.destination);
      } else sfxBus.connect(ctx.destination);
      musicBus.connect(ctx.destination);
      return true;
    } catch {
      resetGraph();
      return false;
    }
  }

  function createContextFromGesture() {
    if (ctx?.state === 'closed') { ctx = null; unlocked = false; buffers.clear(); decoding.clear(); resetGraph(); }
    if (ctx) { ensureGraph(); return ctx; }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    try { ctx = new AudioContext({ latencyHint: 'interactive' }); }
    catch { try { ctx = new AudioContext(); } catch { ctx = null; } }
    ensureGraph();
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
      ensureGraph();
      resolveUnlockWaiters(true);
      return true;
    }
    return false;
  }

  async function unlock() {
    const audio = createContextFromGesture();
    if (!audio) return false;
    if (unlocked && audio.state === 'running') { ensureGraph(); resolveUnlockWaiters(true); return true; }
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
    if (unlocked) { ensureGraph(); resolveUnlockWaiters(true); }
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

  function finishVoice(voice) {
    if (!voice) return;
    activeVoices.delete(voice);
    if (voice.handle?.voice === voice) voice.handle.voice = null;
  }

  function stopVoice(voice) {
    if (!voice) return;
    try { voice.handle?.source?.stop(); } catch {}
    finishVoice(voice);
  }

  function lowestPriorityVoice(list) {
    return list.reduce((best, voice) => !best || voice.priority < best.priority || (voice.priority === best.priority && voice.startedAt < best.startedAt) ? voice : best, null);
  }

  function reserveVoice(handle, cueId, cue, options) {
    const group = cue.group || 'SFX', priority = Math.max(0, Math.min(10, Number(options.priority ?? 2) || 0)), now = performance.now();
    const cueLimit = Math.max(1, Math.floor(Number(cue.maxVoices) || GROUP_CUE_LIMITS[group] || 6));
    const groupLimit = Math.max(cueLimit, Math.floor(Number(GROUP_VOICE_LIMITS[group]) || 16));
    const sameCue = [...activeVoices].filter(voice => voice.cueId === cueId);
    if (sameCue.length >= cueLimit) {
      const victim = lowestPriorityVoice(sameCue);
      if (victim && priority < victim.priority) return null;
      stopVoice(victim);
    }
    const sameGroup = [...activeVoices].filter(voice => voice.group === group);
    if (sameGroup.length >= groupLimit) {
      const victim = lowestPriorityVoice(sameGroup);
      if (victim && priority < victim.priority) return null;
      stopVoice(victim);
    }
    const voice = { handle, cueId, group, priority, startedAt: now };
    activeVoices.add(voice);
    handle.voice = voice;
    return voice;
  }

  function startDecoded(handle, cueId, cue, buffer, volume, options) {
    if (handle.cancelled || !ctx || ctx.state !== 'running' || !buffer || !ensureGraph()) return false;
    const voice = reserveVoice(handle, cueId, cue, options);
    if (!voice) { handle.cancelled = true; return false; }
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const lowpassHz = Math.max(800, Math.min(22000, Number(options.lowpassHz ?? 22000) || 22000));
    const filter = lowpassHz < 20500 && ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
    const volumes = getVolumes() || {};
    const category = cue.group === 'Music' ? Number(volumes.music ?? 1) : Number(volumes.sfx ?? 1);
    const base = clamp01(Number(volumes.master ?? 1) * category * Number(cue.gain ?? 1) * Number(volume ?? 1));
    source.buffer = buffer;
    source.loop = !!(options.loop ?? cue.loop);
    source.playbackRate.value = Math.max(0.5, Math.min(2, Number(options.rate ?? options.playbackRate ?? cue.rate ?? 1)));
    gain.gain.value = handle.volumeOverride == null ? base : clamp01(handle.volumeOverride);
    if (filter) { filter.type = 'lowpass'; filter.frequency.value = lowpassHz; filter.Q.value = .36; }
    const bus = cue.group === 'Music' ? musicBus : sfxBus;
    source.connect(gain);
    let tail = gain;
    if (filter) { tail.connect(filter); tail = filter; }
    if (pan) { pan.pan.value = Math.max(-1, Math.min(1, Number(options.pan ?? 0))); tail.connect(pan); pan.connect(bus); }
    else tail.connect(bus);
    handle.source = source;
    handle.gain = gain;
    try {
      source.start();
      if (!source.loop && Number.isFinite(Number(options.maxDuration))) {
        const duration = Math.max(.02, Number(options.maxDuration));
        try { source.stop(ctx.currentTime + duration); } catch {}
      }
    } catch { finishVoice(voice); return false; }
    source.onended = () => {
      handle.source = null;
      finishVoice(voice);
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
      voice: null,
      cancelled: false,
      volumeOverride: null,
      stop() {
        this.cancelled = true;
        try { this.source?.stop(); } catch {}
        finishVoice(this.voice);
      },
      setVolume(next) {
        this.volumeOverride = clamp01(next);
        if (this.gain && ctx) this.gain.gain.setTargetAtTime(this.volumeOverride, ctx.currentTime, .02);
      },
    };

    const readyBuffer = buffers.get(id);
    if (unlocked && ctx?.state === 'running' && readyBuffer) {
      startDecoded(handle, id, cue, readyBuffer, volume, options);
      return handle;
    }

    void (async () => {
      if (!unlocked || ctx?.state !== 'running') await waitForUnlock();
      const buffer = await decode(id);
      if (ctx?.state !== 'running') await resumeExisting();
      startDecoded(handle, id, cue, buffer, volume, options);
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
      activeVoices: activeVoices.size,
      total: Object.keys(cues).length,
    };
  }

  return { context: existingContext, unlock, resume: resumeExisting, load: decode, preloadAll, prepareAll, play, status };
}
