export const SHELL_PANEL = Object.freeze({ NONE: '', SETTINGS: 'settings', ADMIN: 'admin' });

function isStandalone() {
  return navigator.standalone === true
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
}

function fullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.webkitCurrentFullScreenElement
    || null;
}

function measure(element) {
  const rect = element.getBoundingClientRect();
  return {
    w: Math.max(1, Math.round(rect.width || innerWidth || 1)),
    h: Math.max(1, Math.round(rect.height || innerHeight || 1)),
  };
}

export function detectInputPlatform() {
  const touchPoints = Number(navigator.maxTouchPoints) > 0;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const noHover = matchMedia('(hover: none)').matches;
  const touchControls = touchPoints && (coarse || noHover);
  return Object.freeze({
    touchControls,
    requiresLandscape: touchControls,
    standalone: isStandalone(),
  });
}

export function createSessionShell({
  root,
  stage,
  canvas,
  platform = detectInputPlatform(),
  elements = {},
  onSuspend = () => {},
  onStateChange = () => {},
  onViewport = () => {},
  onPointerLockUnavailable = () => {},
} = {}) {
  if (!root || !stage || !canvas) throw new Error('Session shell requires root, stage, and canvas elements.');

  const state = {
    location: 'startup',
    paused: true,
    pauseReason: '',
    panel: SHELL_PANEL.NONE,
    connecting: false,
    connectionText: '',
  };

  let viewport = measure(stage);
  let lastCanPlay = false;
  let launchGeneration = 0;
  let launchPromise = Promise.resolve(false);
  let lastFullscreen = !!fullscreenElement();

  root.classList.toggle('touch', platform.touchControls);
  root.classList.toggle('desktop', !platform.touchControls);

  const inMatch = () => state.location === 'match';
  const fullscreen = () => !!fullscreenElement();
  const pointerLocked = () => document.pointerLockElement === canvas;
  const portrait = () => viewport.h > viewport.w;
  const orientationBlocked = () => state.location !== 'startup' && platform.requiresLandscape && portrait();

  function fullscreenSupported() {
    if (platform.standalone) return false;
    const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
    return enabled !== false && !!(root.requestFullscreen || root.webkitRequestFullscreen);
  }

  function snapshot() {
    const match = inMatch();
    const blocked = orientationBlocked();
    const inputReady = platform.touchControls || pointerLocked();
    return Object.freeze({
      location: state.location,
      inMatch: match,
      paused: match ? state.paused : false,
      pauseReason: match ? state.pauseReason : '',
      panel: state.panel,
      connecting: state.connecting,
      connectionText: state.connectionText,
      hidden: document.hidden,
      portrait: portrait(),
      orientationBlocked: blocked,
      inputReady,
      canPlay: match && !state.paused && !state.panel && !document.hidden && !blocked && inputReady,
      fullscreen: fullscreen(),
      fullscreenSupported: fullscreenSupported(),
      standalone: platform.standalone,
      touchControls: platform.touchControls,
      viewport: Object.freeze({ ...viewport }),
    });
  }

  function updateConnectionUi(s) {
    if (elements.connectionText) elements.connectionText.textContent = s.connectionText || 'Connecting…';
  }

  function render(reason = 'sync') {
    const s = snapshot();
    const blocked = s.orientationBlocked;

    elements.startup?.classList.toggle('hide', s.location !== 'startup');
    elements.rotate?.classList.toggle('hide', !blocked);
    elements.menu?.classList.toggle('hide', s.location !== 'menu' || blocked);
    elements.pause?.classList.toggle('hide', !s.inMatch || !s.paused || !!s.panel || blocked);
    elements.settings?.classList.toggle('hide', s.panel !== SHELL_PANEL.SETTINGS || blocked);
    elements.admin?.classList.toggle('hide', s.panel !== SHELL_PANEL.ADMIN || blocked);
    elements.connection?.classList.toggle('hide', !s.connecting || s.location !== 'menu' || blocked);
    updateConnectionUi(s);

    if (elements.rotateText) {
      elements.rotateText.textContent = s.inMatch
        ? 'Your match is paused. Rotate back to landscape to continue.'
        : 'Breach uses landscape on phones and tablets. Rotate your device to continue.';
    }

    const fullButton = elements.fullscreenButton;
    const fullLabel = fullButton?.querySelector('span');
    if (fullButton) {
      if (platform.touchControls || s.standalone) {
        fullButton.classList.add('hide');
      } else {
        fullButton.classList.remove('hide');
        if (fullLabel) fullLabel.textContent = s.fullscreen ? 'Exit Fullscreen' : 'Fullscreen';
        fullButton.disabled = !s.fullscreen && !s.fullscreenSupported;
      }
    }

    root.dataset.location = s.location;
    root.dataset.paused = String(s.paused);

    if (lastCanPlay && !s.canPlay) onSuspend(reason, s);
    lastCanPlay = s.canPlay;
    onStateChange(s, reason);
    return s;
  }

  function mutate(reason, change) {
    change(state);
    return render(reason);
  }

  function setMenuView(view) {
    const next = view === 'operator' ? 'operator' : 'play';
    if (elements.menuShell) elements.menuShell.dataset.mobileView = next;
    for (const tab of elements.menuTabs || []) {
      const active = tab.dataset.menuTab === next;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    }
  }

  function bindMenuTabs() {
    for (const tab of elements.menuTabs || []) {
      tab.addEventListener('click', () => setMenuView(tab.dataset.menuTab));
    }
    setMenuView('play');
  }

  function syncViewport(renderOrientation = true) {
    const wasBlocked = orientationBlocked();
    const next = measure(stage);
    const changed = next.w !== viewport.w || next.h !== viewport.h;
    if (changed) {
      viewport = next;
      onViewport({ ...viewport });
    }

    if (inMatch() && !state.paused && platform.requiresLandscape && portrait()) {
      state.paused = true;
      state.pauseReason = 'orientation';
      state.panel = SHELL_PANEL.NONE;
      return render('orientation');
    }
    if (renderOrientation && wasBlocked !== orientationBlocked()) return render('orientation');
    return snapshot();
  }

  const resizeObserver = typeof ResizeObserver === 'function'
    ? new ResizeObserver(syncViewport)
    : null;
  resizeObserver?.observe(stage);
  if (!resizeObserver) addEventListener('resize', syncViewport);

  async function enterFullscreen() {
    if (fullscreen()) return true;
    if (!fullscreenSupported()) return false;
    const fn = root.requestFullscreen || root.webkitRequestFullscreen;
    try {
      const result = fn.call(root);
      if (result?.then) await result;
      return fullscreen();
    } catch {
      return false;
    }
  }

  async function leaveFullscreen() {
    if (!fullscreen()) return true;
    const fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen;
    if (!fn) return false;
    try {
      const result = fn.call(document);
      if (result?.then) await result;
      return !fullscreen();
    } catch {
      return false;
    }
  }

  async function lockLandscape() {
    if (!platform.requiresLandscape || !screen.orientation?.lock) return false;
    try {
      await screen.orientation.lock('landscape');
      return true;
    } catch {
      return false;
    }
  }

  function unlockLandscape() {
    try { screen.orientation?.unlock?.(); } catch {}
  }

  async function requestPointerLock() {
    if (platform.touchControls || pointerLocked()) return true;
    if (!canvas.requestPointerLock) {
      onPointerLockUnavailable();
      return false;
    }
    try {
      const result = canvas.requestPointerLock();
      if (result?.then) await result;
      return pointerLocked();
    } catch {
      onPointerLockUnavailable();
      return false;
    }
  }

  function beginConnection(text = 'Preparing game…') {
    return mutate('connection-start', s => {
      if (s.location !== 'menu') return;
      s.connecting = true;
      s.connectionText = text;
      s.panel = SHELL_PANEL.NONE;
    });
  }

  function updateConnection(text) {
    state.connectionText = String(text || 'Connecting…');
    updateConnectionUi(snapshot());
  }

  function endConnection() {
    if (!state.connecting) return snapshot();
    return mutate('connection-end', s => {
      s.connecting = false;
      s.connectionText = '';
    });
  }

  function prepareMatchFromGesture() {
    const generation = ++launchGeneration;
    if (platform.touchControls) {
      launchPromise = (async () => {
        if (!platform.standalone && !fullscreen() && fullscreenSupported()) await enterFullscreen();
        if (generation !== launchGeneration) return false;
        await lockLandscape();
        syncViewport();
        return generation === launchGeneration;
      })();
    } else {
      launchPromise = requestPointerLock().then(() => generation === launchGeneration);
    }
    return launchPromise;
  }

  function cancelPreparedMatch() {
    ++launchGeneration;
    state.connecting = false;
    state.connectionText = '';
    if (pointerLocked()) document.exitPointerLock?.();
    unlockLandscape();
    if (fullscreen() && !platform.standalone) void leaveFullscreen();
    return render('launch-cancel');
  }

  async function enterMatch() {
    await launchPromise.catch(() => false);
    syncViewport();
    return mutate('match-enter', s => {
      s.location = 'match';
      s.connecting = false;
      s.connectionText = '';
      s.panel = SHELL_PANEL.NONE;
      if (platform.requiresLandscape && portrait()) {
        s.paused = true;
        s.pauseReason = 'orientation';
      } else if (!platform.touchControls && !pointerLocked()) {
        s.paused = true;
        s.pauseReason = 'pointer';
      } else {
        s.paused = false;
        s.pauseReason = '';
      }
    });
  }

  function pause(reason = 'pause') {
    if (!inMatch() || state.paused) return snapshot();
    const result = mutate(reason, s => {
      s.paused = true;
      s.pauseReason = reason;
      s.panel = SHELL_PANEL.NONE;
    });
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    return result;
  }

  function showPauseMenu() {
    if (!inMatch()) return snapshot();
    const result = mutate('pause-menu', s => {
      s.paused = true;
      s.pauseReason = 'user';
      s.panel = SHELL_PANEL.NONE;
    });
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    return result;
  }

  async function resumeFromGesture() {
    if (!inMatch() || state.panel) return false;

    if (platform.touchControls) {
      if (!platform.standalone && !fullscreen() && fullscreenSupported()) await enterFullscreen();
      await lockLandscape();
      syncViewport();
      if (portrait()) {
        mutate('resume-orientation', s => {
          s.paused = true;
          s.pauseReason = 'orientation';
        });
        return false;
      }
      mutate('resume', s => {
        s.paused = false;
        s.pauseReason = '';
      });
      return true;
    }

    const locked = await requestPointerLock();
    if (!locked) return false;
    mutate('resume', s => {
      s.paused = false;
      s.pauseReason = '';
    });
    return true;
  }

  function openPanel(name) {
    if (name !== SHELL_PANEL.SETTINGS && name !== SHELL_PANEL.ADMIN) return snapshot();
    const result = mutate(`panel-open:${name}`, s => {
      if (s.location === 'match') {
        s.paused = true;
        s.pauseReason = 'panel';
      }
      s.panel = name;
    });
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    return result;
  }

  function closePanel(name = '') {
    return mutate(`panel-close:${name || 'current'}`, s => {
      if (!name || s.panel === name) s.panel = SHELL_PANEL.NONE;
    });
  }

  async function toggleFullscreenFromGesture() {
    if (platform.touchControls || platform.standalone) return false;
    return fullscreen() ? leaveFullscreen() : enterFullscreen();
  }

  function leaveToMenu() {
    ++launchGeneration;
    mutate('menu', s => {
      s.location = 'menu';
      s.paused = true;
      s.pauseReason = '';
      s.panel = SHELL_PANEL.NONE;
      s.connecting = false;
      s.connectionText = '';
    });
    if (pointerLocked()) document.exitPointerLock?.();
    unlockLandscape();
    if (fullscreen() && !platform.standalone) void leaveFullscreen();
  }

  function pointerLockChanged() {
    if (platform.touchControls || !inMatch()) return;
    if (!pointerLocked() && !state.paused) pause('pointer');
  }

  function visibilityChanged() {
    if (document.hidden && inMatch() && !state.paused) pause('background');
  }

  function fullscreenChanged() {
    const active = fullscreen();
    if (active === lastFullscreen) return;
    const exited = lastFullscreen && !active;
    lastFullscreen = active;
    syncViewport(false);
    if (exited && platform.touchControls && inMatch() && !state.paused) pause('fullscreen');
    else render('fullscreen');
  }

  document.addEventListener('pointerlockchange', pointerLockChanged);
  document.addEventListener('pointerlockerror', () => {
    if (!platform.touchControls && inMatch() && !state.paused) pause('pointer');
    onPointerLockUnavailable();
  });
  document.addEventListener('visibilitychange', visibilityChanged);
  document.addEventListener('fullscreenchange', fullscreenChanged);
  document.addEventListener('webkitfullscreenchange', fullscreenChanged);
  addEventListener('pagehide', visibilityChanged);

  function start() {
    bindMenuTabs();
    state.location = 'menu';
    syncViewport();
    return render('start');
  }

  return {
    platform,
    get inMatch() { return inMatch(); },
    get paused() { return inMatch() ? state.paused : false; },
    get panel() { return state.panel; },
    get canPlay() { return snapshot().canPlay; },
    get orientationBlocked() { return snapshot().orientationBlocked; },
    get viewport() { return { ...viewport }; },
    get fullscreen() { return fullscreen(); },
    get connecting() { return state.connecting; },
    snapshot,
    render,
    start,
    beginConnection,
    updateConnection,
    endConnection,
    prepareMatchFromGesture,
    cancelPreparedMatch,
    enterMatch,
    pause,
    showPauseMenu,
    resumeFromGesture,
    openPanel,
    closePanel,
    toggleFullscreenFromGesture,
    leaveToMenu,
  };
}
