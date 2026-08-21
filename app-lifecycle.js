export const SHELL_PANEL = Object.freeze({ NONE: '', SETTINGS: 'settings', ADMIN: 'admin' });

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
}

function isStandalone() {
  return navigator.standalone === true
    || matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: fullscreen)').matches;
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
  return Object.freeze({
    touchControls: touchPoints && (coarse || noHover),
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
  if (!root || !stage || !canvas) throw new Error('Session shell requires root, stage, and canvas.');

  const state = {
    location: 'menu',
    paused: true,
    pauseReason: '',
    panel: SHELL_PANEL.NONE,
    connecting: false,
    connectionText: '',
  };

  let viewport = measure(stage);
  let lastCanPlay = false;

  root.classList.toggle('touch', platform.touchControls);
  root.classList.toggle('desktop', !platform.touchControls);

  const inMatch = () => state.location === 'match';
  const fullscreen = () => !!fullscreenElement();
  const immersive = () => platform.standalone || fullscreen();
  const pointerLocked = () => document.pointerLockElement === canvas;
  const landscapeReady = () => !platform.touchControls || viewport.w >= viewport.h;

  function fullscreenSupported() {
    if (platform.standalone) return true;
    const enabled = document.fullscreenEnabled ?? document.webkitFullscreenEnabled;
    return enabled !== false && !!(root.requestFullscreen || root.webkitRequestFullscreen);
  }

  function snapshot() {
    const match = inMatch();
    const entered = immersive();
    const landscape = landscapeReady();
    const blocked = entered && platform.touchControls && !landscape;
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
      immersive: entered,
      fullscreen: fullscreen(),
      fullscreenSupported: fullscreenSupported(),
      standalone: platform.standalone,
      touchControls: platform.touchControls,
      landscapeReady: landscape,
      orientationBlocked: blocked,
      inputReady,
      canPlay: entered && landscape && match && !state.paused && !state.panel && !state.connecting && !document.hidden && inputReady,
      viewport: Object.freeze({ ...viewport }),
    });
  }

  function setVisible(element, visible) {
    element?.classList.toggle('hide', !visible);
  }

  function render(reason = 'sync') {
    const s = snapshot();
    const showEntry = !s.immersive;
    const showRotate = s.immersive && s.orientationBlocked;
    const usable = s.immersive && !s.orientationBlocked;

    setVisible(elements.entry, showEntry);
    setVisible(elements.rotate, showRotate);
    setVisible(elements.menu, usable && s.location === 'menu' && !s.panel);
    setVisible(elements.pause, usable && s.inMatch && s.paused && !s.panel);
    setVisible(elements.settings, usable && s.panel === SHELL_PANEL.SETTINGS);
    setVisible(elements.admin, usable && s.panel === SHELL_PANEL.ADMIN);
    setVisible(elements.connection, usable && s.connecting);

    if (elements.connectionText) elements.connectionText.textContent = s.connectionText || 'Connecting…';
    if (elements.entryButton) {
      const label = elements.entryButton.querySelector('span');
      if (label) label.textContent = platform.standalone ? 'ENTER BREACH' : 'ENTER FULLSCREEN';
      elements.entryButton.disabled = !platform.standalone && !s.fullscreenSupported;
    }
    if (elements.entryStatus && !s.fullscreenSupported && !platform.standalone) {
      elements.entryStatus.textContent = 'Fullscreen is not available in this browser.';
      elements.entryStatus.classList.add('error');
    }
    if (elements.fullscreenButton) {
      const label = elements.fullscreenButton.querySelector('span');
      if (label) label.textContent = 'Exit Fullscreen';
      elements.fullscreenButton.disabled = platform.standalone || !s.fullscreen;
    }

    root.dataset.location = s.location;
    root.dataset.immersive = String(s.immersive);
    root.dataset.paused = String(s.paused);

    if (lastCanPlay && !s.canPlay) onSuspend(reason, s);
    lastCanPlay = s.canPlay;
    onStateChange(s, reason);
    return s;
  }

  function syncViewport() {
    const next = measure(stage);
    const changed = next.w !== viewport.w || next.h !== viewport.h;
    if (!changed) return false;

    viewport = next;
    onViewport({ ...viewport });
    if (platform.touchControls && immersive() && !landscapeReady() && inMatch() && !state.paused) {
      state.paused = true;
      state.pauseReason = 'orientation';
      state.panel = SHELL_PANEL.NONE;
    }
    return true;
  }

  const viewportChanged = () => { if (syncViewport()) render('viewport'); };
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(viewportChanged) : null;
  resizeObserver?.observe(stage);
  if (!resizeObserver) addEventListener('resize', viewportChanged);

  async function requestFullscreen() {
    if (platform.standalone || fullscreen()) return true;
    if (!fullscreenSupported()) return false;
    const fn = root.requestFullscreen || root.webkitRequestFullscreen;
    try {
      const result = fn.call(root, { navigationUI: 'hide' });
      if (result?.then) await result;
      return fullscreen();
    } catch {
      return false;
    }
  }

  async function exitFullscreen() {
    if (platform.standalone || !fullscreen()) return false;
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
    if (!platform.touchControls || !screen.orientation?.lock) return false;
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

  async function enterFullscreenFromGesture() {
    if (platform.standalone) {
      await lockLandscape();
      render('standalone-enter');
      return true;
    }
    const ok = await requestFullscreen();
    if (!ok) {
      if (elements.entryStatus) {
        elements.entryStatus.textContent = 'Could not enter fullscreen. Tap the button and try again.';
        elements.entryStatus.classList.add('error');
      }
      render('fullscreen-failed');
      return false;
    }
    await lockLandscape();
    return true;
  }

  async function exitFullscreenFromGesture() {
    if (inMatch() && !state.paused) {
      state.paused = true;
      state.pauseReason = 'fullscreen';
      state.panel = SHELL_PANEL.NONE;
    }
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    unlockLandscape();
    const exited = await exitFullscreen();
    if (!exited && immersive()) render('fullscreen-exit-failed');
    return exited;
  }

  function beginConnection(text = 'Preparing game…') {
    if (!immersive() || state.location !== 'menu') return snapshot();
    state.connecting = true;
    state.connectionText = String(text || 'Connecting…');
    state.panel = SHELL_PANEL.NONE;
    return render('connection-start');
  }

  function updateConnection(text) {
    state.connectionText = String(text || 'Connecting…');
    if (elements.connectionText) elements.connectionText.textContent = state.connectionText;
  }

  function endConnection() {
    if (!state.connecting) return snapshot();
    state.connecting = false;
    state.connectionText = '';
    return render('connection-end');
  }

  function prepareInputFromGesture() {
    if (platform.touchControls) return Promise.resolve(true);
    return requestPointerLock();
  }

  function cancelConnection() {
    state.connecting = false;
    state.connectionText = '';
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    return render('connection-cancel');
  }

  async function enterMatch() {
    state.location = 'match';
    state.connecting = false;
    state.connectionText = '';
    state.panel = SHELL_PANEL.NONE;
    if (!immersive() || !landscapeReady()) {
      state.paused = true;
      state.pauseReason = !immersive() ? 'fullscreen' : 'orientation';
    } else if (!platform.touchControls && !pointerLocked()) {
      state.paused = true;
      state.pauseReason = 'pointer';
    } else {
      state.paused = false;
      state.pauseReason = '';
    }
    return render('match-enter');
  }

  function pause(reason = 'pause') {
    if (!inMatch() || state.paused) return snapshot();
    state.paused = true;
    state.pauseReason = reason;
    state.panel = SHELL_PANEL.NONE;
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    return render(reason);
  }

  async function resumeFromGesture() {
    if (!inMatch() || state.panel || !immersive() || !landscapeReady()) return false;
    if (!platform.touchControls && !(await requestPointerLock())) return false;
    state.paused = false;
    state.pauseReason = '';
    render('resume');
    return true;
  }

  function openPanel(name) {
    if (name !== SHELL_PANEL.SETTINGS && name !== SHELL_PANEL.ADMIN) return snapshot();
    if (inMatch() && !state.paused) {
      state.paused = true;
      state.pauseReason = 'panel';
      if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    }
    state.panel = name;
    return render(`panel-open:${name}`);
  }

  function closePanel(name = '') {
    if (!name || state.panel === name) state.panel = SHELL_PANEL.NONE;
    return render(`panel-close:${name || 'current'}`);
  }

  function leaveToMenu() {
    state.location = 'menu';
    state.paused = true;
    state.pauseReason = '';
    state.panel = SHELL_PANEL.NONE;
    state.connecting = false;
    state.connectionText = '';
    if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
    return render('menu');
  }

  function fullscreenChanged() {
    if (!immersive()) {
      if (inMatch() && !state.paused) {
        state.paused = true;
        state.pauseReason = 'fullscreen';
        state.panel = SHELL_PANEL.NONE;
      }
      if (!platform.touchControls && pointerLocked()) document.exitPointerLock?.();
      unlockLandscape();
    }
    syncViewport();
    render('fullscreen');
  }

  function pointerLockChanged() {
    if (platform.touchControls || !inMatch() || state.paused) return;
    if (!pointerLocked()) pause('pointer');
  }

  function visibilityChanged() {
    if (document.hidden && inMatch() && !state.paused) pause('background');
  }

  const fullscreenEvent = ('fullscreenEnabled' in document || 'fullscreenElement' in document) ? 'fullscreenchange' : 'webkitfullscreenchange';
  document.addEventListener(fullscreenEvent, fullscreenChanged);
  document.addEventListener('pointerlockchange', pointerLockChanged);
  document.addEventListener('pointerlockerror', () => {
    if (!platform.touchControls && inMatch() && !state.paused) pause('pointer');
    onPointerLockUnavailable();
  });
  document.addEventListener('visibilitychange', visibilityChanged);
  addEventListener('pagehide', visibilityChanged);

  function start() {
    syncViewport();
    return render('start');
  }

  return {
    platform,
    get inMatch() { return inMatch(); },
    get paused() { return inMatch() ? state.paused : false; },
    get panel() { return state.panel; },
    get canPlay() { return snapshot().canPlay; },
    get viewport() { return { ...viewport }; },
    get fullscreen() { return fullscreen(); },
    get immersive() { return immersive(); },
    get connecting() { return state.connecting; },
    snapshot,
    render,
    start,
    enterFullscreenFromGesture,
    exitFullscreenFromGesture,
    beginConnection,
    updateConnection,
    endConnection,
    prepareInputFromGesture,
    cancelConnection,
    enterMatch,
    pause,
    resumeFromGesture,
    openPanel,
    closePanel,
    leaveToMenu,
    destroy() {
      resizeObserver?.disconnect();
      if (!resizeObserver) removeEventListener('resize', viewportChanged);
      document.removeEventListener(fullscreenEvent, fullscreenChanged);
      document.removeEventListener('pointerlockchange', pointerLockChanged);
      document.removeEventListener('visibilitychange', visibilityChanged);
      removeEventListener('pagehide', visibilityChanged);
    },
  };
}
