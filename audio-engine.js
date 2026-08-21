export function createAudioEngine({ cues, getVolumes = () => ({ master: 1, sfx: 1, music: 1 }) }) {
  let ctx = null;
  const buffers = new Map();
  const loading = new Map();

  const context = () => {
    if (!ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      try { ctx = new AudioContext({ latencyHint: 'interactive' }); }
      catch { ctx = new AudioContext(); }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  };

  async function load(id) {
    if (buffers.has(id)) return buffers.get(id);
    if (loading.has(id)) return loading.get(id);
    const cue = cues[id];
    if (!cue) return null;
    const promise = (async () => {
      const audio = context();
      if (!audio) return null;
      const response = await fetch(cue.url, { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Audio ${id}: HTTP ${response.status}`);
      const decoded = await audio.decodeAudioData(await response.arrayBuffer());
      buffers.set(id, decoded);
      return decoded;
    })().catch(error => {
      console.warn(error);
      return null;
    }).finally(() => loading.delete(id));
    loading.set(id, promise);
    return promise;
  }

  async function preloadAll(onProgress) {
    const ids = Object.keys(cues);
    let done = 0;
    let cursor = 0;
    const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
      while (cursor < ids.length) {
        const id = ids[cursor++];
        await load(id);
        done += 1;
        onProgress?.(done, ids.length);
      }
    });
    await Promise.all(workers);
    return true;
  }

  function play(id, volume = 1, options = {}) {
    const cue = cues[id];
    const audio = context();
    const buffer = buffers.get(id);
    if (!cue || !audio || !buffer) {
      if (cue && !loading.has(id)) load(id);
      return null;
    }
    const source = audio.createBufferSource();
    const gain = audio.createGain();
    const pan = audio.createStereoPanner ? audio.createStereoPanner() : null;
    const volumes = getVolumes() || {};
    const category = cue.group === 'Music' ? Number(volumes.music ?? 1) : Number(volumes.sfx ?? 1);
    const base = Math.max(0, Math.min(1,
      Number(volumes.master ?? 1) * category * Number(cue.gain ?? 1) * Number(volume ?? 1)
    ));
    source.buffer = buffer;
    source.loop = !!(options.loop ?? cue.loop);
    source.playbackRate.value = Math.max(0.5, Math.min(2, Number(options.rate ?? options.playbackRate ?? cue.rate ?? 1)));
    gain.gain.value = base;
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, Number(options.pan ?? 0)));
      source.connect(gain).connect(pan).connect(audio.destination);
    } else source.connect(gain).connect(audio.destination);
    source.start();
    if (!source.loop && Number.isFinite(Number(options.maxDuration))) {
      const duration = Math.max(.02, Number(options.maxDuration));
      try { source.stop(audio.currentTime + duration); } catch {}
    }
    const handle = {
      source,
      stop() { try { source.stop(); } catch {} },
      setVolume(next) { gain.gain.setTargetAtTime(Math.max(0, Math.min(1, next)), audio.currentTime, .02); },
    };
    source.onended = () => options.onended?.();
    return handle;
  }

  return { context, load, preloadAll, play };
}
