export const SHELL_PANEL = Object.freeze({ NONE:'', SETTINGS:'settings', ADMIN:'admin' });

function fullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
}
function standaloneMode(){
  return navigator.standalone===true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}
function measure(el){
  const r=el.getBoundingClientRect();
  return {w:Math.max(1,Math.round(r.width||innerWidth||1)),h:Math.max(1,Math.round(r.height||innerHeight||1))};
}
export function detectInputPlatform(){
  const touchPoints=Math.max(0,Number(navigator.maxTouchPoints)||0),touchCapable=touchPoints>0;
  const media=query=>typeof matchMedia==='function'&&matchMedia(query).matches;
  const ua=String(navigator.userAgent||''),platformName=String(navigator.platform||'');
  const mobileUa=navigator.userAgentData?.mobile===true||/Android|iPhone|iPod|Mobile/i.test(ua);
  const ipadDesktopUa=touchPoints>1&&(/iPad/i.test(ua)||(/Macintosh|MacIntel/i.test(`${ua} ${platformName}`)));
  const touchControls=touchCapable&&(media('(pointer: coarse)')||media('(hover: none)')||mobileUa||ipadDesktopUa);
  return Object.freeze({touchControls,touchCapable,standalone:standaloneMode()});
}

export function createSessionShell({
  root,stage,canvas,platform=detectInputPlatform(),elements={},
  onSuspend=()=>{},onStateChange=()=>{},onViewport=()=>{},onPointerLockUnavailable=()=>{},
}={}){
  if(!root||!stage||!canvas)throw new Error('Session shell requires root, stage, and canvas.');

  let location='menu'; // menu | lobby | match
  let paused=false;
  let pauseReason='';
  let panel=SHELL_PANEL.NONE;
  let connecting=false;
  let connectionText='';
  let viewport=measure(stage);
  let lastCanPlay=false;
  let hadPointerLock=false;

  root.classList.toggle('touch',platform.touchControls);
  root.classList.toggle('desktop',!platform.touchControls);

  const inMatch=()=>location==='match';
  const inLobby=()=>location==='lobby';
  const fullscreen=()=>!!fullscreenElement();
  const immersive=()=>platform.standalone||fullscreen();
  const pointerLocked=()=>document.pointerLockElement===canvas;
  hadPointerLock=pointerLocked();
  const landscapeReady=()=>!platform.touchControls||viewport.w>=viewport.h;
  const fullscreenSupported=()=>platform.standalone||((document.fullscreenEnabled??document.webkitFullscreenEnabled)!==false&&!!(root.requestFullscreen||root.webkitRequestFullscreen));

  function snapshot(){
    const entered=immersive(),landscape=landscapeReady(),match=inMatch(),blocked=entered&&platform.touchControls&&!landscape;
    const inputReady=platform.touchControls||pointerLocked();
    const playSurfaceReady=platform.touchControls?(entered&&landscape):true;
    return Object.freeze({
      location,inMatch:match,inLobby:inLobby(),paused:match?paused:false,pauseReason:match?pauseReason:'',panel,connecting,connectionText,
      immersive:entered,fullscreen:fullscreen(),standalone:platform.standalone,touchControls:platform.touchControls,landscapeReady:landscape,orientationBlocked:blocked,
      hidden:document.hidden,inputReady,canPlay:playSurfaceReady&&match&&!paused&&!panel&&!connecting&&!document.hidden,
      viewport:Object.freeze({...viewport}),fullscreenSupported:fullscreenSupported(),
    });
  }
  const visible=(el,show)=>el?.classList.toggle('hide',!show);

  function render(reason='sync'){
    const s=snapshot(),matchUsable=platform.touchControls?(s.immersive&&!s.orientationBlocked):true,frontUsable=platform.touchControls?matchUsable:true;
    visible(elements.entry,platform.touchControls&&!s.immersive);
    visible(elements.rotate,platform.touchControls&&s.immersive&&s.orientationBlocked);
    visible(elements.menu,frontUsable&&s.location==='menu'&&!s.panel&&!s.connecting);
    visible(elements.lobby,frontUsable&&s.location==='lobby'&&!s.panel&&!s.connecting);
    visible(elements.pause,matchUsable&&s.inMatch&&s.paused&&!s.panel&&!s.connecting);
    visible(elements.settings,(s.inMatch?matchUsable:frontUsable)&&s.panel===SHELL_PANEL.SETTINGS);
    visible(elements.admin,(s.inMatch?matchUsable:frontUsable)&&s.panel===SHELL_PANEL.ADMIN);
    visible(elements.connection,(s.inMatch?matchUsable:frontUsable)&&s.connecting);
    if(elements.connectionText)elements.connectionText.textContent=s.connectionText||'Connecting…';
    if(elements.entryButton){
      const label=elements.entryButton.querySelector('span');
      if(label)label.textContent=platform.standalone?'ENTER BREACH':'ENTER FULLSCREEN';
      elements.entryButton.disabled=!platform.standalone&&!s.fullscreenSupported;
    }
    if(elements.entryStatus&&!s.fullscreenSupported&&!platform.standalone){elements.entryStatus.textContent='Fullscreen is not available in this browser.';elements.entryStatus.classList.add('error');}
    if(elements.fullscreenButton)elements.fullscreenButton.disabled=platform.standalone||!s.fullscreen;
    root.dataset.location=s.location;root.dataset.paused=String(s.paused);root.dataset.immersive=String(s.immersive);
    if(lastCanPlay&&!s.canPlay)onSuspend(reason,s);lastCanPlay=s.canPlay;onStateChange(s,reason);return s;
  }

  function syncViewport(){
    const next=measure(stage);if(next.w===viewport.w&&next.h===viewport.h)return false;
    viewport=next;onViewport({...viewport});
    if(platform.touchControls&&immersive()&&!landscapeReady()&&inMatch()&&!paused){paused=true;pauseReason='orientation';panel=SHELL_PANEL.NONE;}
    return true;
  }
  const viewportChanged=()=>{if(syncViewport())render('viewport');};
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(viewportChanged):null;
  resizeObserver?.observe(stage);if(!resizeObserver)addEventListener('resize',viewportChanged);

  async function requestFullscreen(){
    if(platform.standalone||fullscreen())return true;if(!fullscreenSupported())return false;
    const fn=root.requestFullscreen||root.webkitRequestFullscreen;
    try{const result=fn.call(root,{navigationUI:'hide'});if(result?.then)await result;return fullscreen();}catch{return false;}
  }
  async function exitFullscreen(){
    if(platform.standalone||!fullscreen())return false;
    const fn=document.exitFullscreen||document.webkitExitFullscreen||document.webkitCancelFullScreen;if(!fn)return false;
    try{const result=fn.call(document);if(result?.then)await result;return !fullscreen();}catch{return false;}
  }
  async function lockLandscape(){
    if(!platform.touchControls||!screen.orientation?.lock)return false;
    try{await screen.orientation.lock('landscape');return true;}catch{return false;}
  }
  function unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}}
  async function requestPointerLock(){
    if(platform.touchControls||pointerLocked())return true;
    if(!canvas.requestPointerLock){onPointerLockUnavailable();return false;}
    try{const result=canvas.requestPointerLock();if(result?.then)await result;return pointerLocked();}catch{onPointerLockUnavailable();return false;}
  }

  async function enterFullscreenFromGesture(){
    if(platform.standalone){await lockLandscape();syncViewport();render('standalone-enter');return true;}
    const ok=await requestFullscreen();if(!ok){if(elements.entryStatus){elements.entryStatus.textContent='Could not enter fullscreen. Tap the button and try again.';elements.entryStatus.classList.add('error');}render('fullscreen-failed');return false;}
    await lockLandscape();return true;
  }
  async function exitFullscreenFromGesture(){
    if(inMatch()&&!paused){paused=true;pauseReason='fullscreen';panel=SHELL_PANEL.NONE;}
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();unlockLandscape();
    const exited=await exitFullscreen();if(!exited&&immersive())render('fullscreen-exit-failed');return exited;
  }

  function beginConnection(text='Connecting…'){connecting=true;connectionText=String(text||'Connecting…');panel=SHELL_PANEL.NONE;return render('connection-start');}
  function updateConnection(text){connectionText=String(text||'Connecting…');if(elements.connectionText)elements.connectionText.textContent=connectionText;}
  function cancelConnection(){connecting=false;connectionText='';return render('connection-cancel');}
  function endConnection(){connecting=false;connectionText='';return render('connection-end');}

  function enterLobby(){
    location='lobby';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();
    return render('lobby');
  }
  async function prepareInputFromGesture(){
    if(!immersive()){
      if(!(await requestFullscreen()))return false;
      await lockLandscape();syncViewport();render('input-fullscreen');
    }
    return platform.touchControls?true:requestPointerLock();
  }
  async function capturePointerFromGesture(){return platform.touchControls?true:requestPointerLock();}
  async function enterMatch(){
    location='match';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    // Touch play still requires the immersive landscape surface. Desktop play
    // must not depend on browser-gated fullscreen/pointer-lock because remote
    // players enter the match from a WebSocket event, not a user gesture.
    if(platform.touchControls&&(!immersive()||!landscapeReady())){paused=true;pauseReason=!immersive()?'fullscreen':'orientation';return render('match-blocked');}
    paused=false;pauseReason='';return render('match-enter');
  }
  function pause(reason='pause'){
    if(!inMatch()||paused)return snapshot();paused=true;pauseReason=reason;panel=SHELL_PANEL.NONE;
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();return render(reason);
  }
  async function resumeFromGesture(){
    if(!inMatch()||panel)return false;
    if(platform.touchControls){
      if(!immersive()){
        if(!(await requestFullscreen()))return false;
        await lockLandscape();syncViewport();
      }
      if(!landscapeReady())return false;
    }else if(!(await requestPointerLock()))return false;
    paused=false;pauseReason='';render('resume');return true;
  }
  function openPanel(name){
    if(name!==SHELL_PANEL.SETTINGS&&name!==SHELL_PANEL.ADMIN)return snapshot();
    if(inMatch()&&!paused){paused=true;pauseReason='panel';if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();}
    panel=name;return render(`panel-open:${name}`);
  }
  function closePanel(){panel=SHELL_PANEL.NONE;return render('panel-close');}
  function leaveToMenu(){
    location='menu';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();return render('menu');
  }

  function fullscreenChanged(){
    if(!immersive()){if(inMatch()&&!paused){paused=true;pauseReason='fullscreen';panel=SHELL_PANEL.NONE;}if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();unlockLandscape();}
    syncViewport();render('fullscreen');
  }
  function pointerLockChanged(){
    if(platform.touchControls)return;
    const locked=pointerLocked();
    if(locked){hadPointerLock=true;return;}
    const lostOwnedPointer=hadPointerLock;hadPointerLock=false;
    if(lostOwnedPointer&&inMatch()&&!paused)pause('pointer');
  }
  function visibilityChanged(){if(document.hidden&&inMatch()&&!paused)pause('background');}
  const fullscreenEvent=('fullscreenEnabled'in document||'fullscreenElement'in document)?'fullscreenchange':'webkitfullscreenchange';
  document.addEventListener(fullscreenEvent,fullscreenChanged);document.addEventListener('pointerlockchange',pointerLockChanged);document.addEventListener('pointerlockerror',()=>{onPointerLockUnavailable();});document.addEventListener('visibilitychange',visibilityChanged);addEventListener('pagehide',visibilityChanged);

  function start(){syncViewport();onViewport({...viewport});return render('start');}
  return {
    platform,get location(){return location;},get inMatch(){return inMatch();},get inLobby(){return inLobby();},get paused(){return inMatch()?paused:false;},get panel(){return panel;},get canPlay(){return snapshot().canPlay;},get viewport(){return {...viewport};},get fullscreen(){return fullscreen();},get immersive(){return immersive();},get connecting(){return connecting;},snapshot,render,start,
    enterFullscreenFromGesture,exitFullscreenFromGesture,beginConnection,updateConnection,endConnection,cancelConnection,enterLobby,prepareInputFromGesture,capturePointerFromGesture,enterMatch,pause,resumeFromGesture,openPanel,closePanel,leaveToMenu,
    destroy(){resizeObserver?.disconnect();if(!resizeObserver)removeEventListener('resize',viewportChanged);document.removeEventListener(fullscreenEvent,fullscreenChanged);document.removeEventListener('pointerlockchange',pointerLockChanged);document.removeEventListener('visibilitychange',visibilityChanged);removeEventListener('pagehide',visibilityChanged);}
  };
}
