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
  const touch=Number(navigator.maxTouchPoints)>0;
  return Object.freeze({touchControls:touch&&(matchMedia('(pointer: coarse)').matches||matchMedia('(hover: none)').matches),standalone:standaloneMode()});
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

  root.classList.toggle('touch',platform.touchControls);
  root.classList.toggle('desktop',!platform.touchControls);

  const inMatch=()=>location==='match';
  const inLobby=()=>location==='lobby';
  const fullscreen=()=>!!fullscreenElement();
  const immersive=()=>platform.standalone||fullscreen();
  const pointerLocked=()=>document.pointerLockElement===canvas;
  const landscapeReady=()=>!platform.touchControls||viewport.w>=viewport.h;
  const fullscreenSupported=()=>platform.standalone||((document.fullscreenEnabled??document.webkitFullscreenEnabled)!==false&&!!(root.requestFullscreen||root.webkitRequestFullscreen));

  function snapshot(){
    const entered=immersive(),landscape=landscapeReady(),match=inMatch(),blocked=entered&&platform.touchControls&&!landscape;
    const inputReady=platform.touchControls||pointerLocked();
    return Object.freeze({
      location,inMatch:match,inLobby:inLobby(),paused:match?paused:false,pauseReason:match?pauseReason:'',panel,connecting,connectionText,
      immersive:entered,fullscreen:fullscreen(),standalone:platform.standalone,touchControls:platform.touchControls,landscapeReady:landscape,orientationBlocked:blocked,
      hidden:document.hidden,inputReady,canPlay:entered&&landscape&&match&&!paused&&!panel&&!connecting&&!document.hidden&&inputReady,
      viewport:Object.freeze({...viewport}),fullscreenSupported:fullscreenSupported(),
    });
  }
  const visible=(el,show)=>el?.classList.toggle('hide',!show);

  function render(reason='sync'){
    const s=snapshot(),usable=s.immersive&&!s.orientationBlocked;
    visible(elements.entry,!s.immersive);
    visible(elements.rotate,s.immersive&&s.orientationBlocked);
    visible(elements.menu,usable&&s.location==='menu'&&!s.panel&&!s.connecting);
    visible(elements.lobby,usable&&s.location==='lobby'&&!s.panel&&!s.connecting);
    visible(elements.pause,usable&&s.inMatch&&s.paused&&!s.panel&&!s.connecting);
    visible(elements.settings,usable&&s.panel===SHELL_PANEL.SETTINGS);
    visible(elements.admin,usable&&s.panel===SHELL_PANEL.ADMIN);
    visible(elements.connection,usable&&s.connecting);
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
  async function prepareInputFromGesture(){return platform.touchControls?true:requestPointerLock();}
  async function enterMatch(){
    location='match';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(!immersive()||!landscapeReady()){paused=true;pauseReason=!immersive()?'fullscreen':'orientation';return render('match-blocked');}
    if(!platform.touchControls&&!pointerLocked()){paused=true;pauseReason='pointer';return render('match-pointer');}
    paused=false;pauseReason='';return render('match-enter');
  }
  function pause(reason='pause'){
    if(!inMatch()||paused)return snapshot();paused=true;pauseReason=reason;panel=SHELL_PANEL.NONE;
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();return render(reason);
  }
  async function resumeFromGesture(){
    if(!inMatch()||panel||!immersive()||!landscapeReady())return false;
    if(!platform.touchControls&&!(await requestPointerLock()))return false;
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
  function pointerLockChanged(){if(platform.touchControls||!inMatch()||paused)return;if(!pointerLocked())pause('pointer');}
  function visibilityChanged(){if(document.hidden&&inMatch()&&!paused)pause('background');}
  const fullscreenEvent=('fullscreenEnabled'in document||'fullscreenElement'in document)?'fullscreenchange':'webkitfullscreenchange';
  document.addEventListener(fullscreenEvent,fullscreenChanged);document.addEventListener('pointerlockchange',pointerLockChanged);document.addEventListener('pointerlockerror',()=>{if(!platform.touchControls&&inMatch()&&!paused)pause('pointer');onPointerLockUnavailable();});document.addEventListener('visibilitychange',visibilityChanged);addEventListener('pagehide',visibilityChanged);

  function start(){syncViewport();onViewport({...viewport});return render('start');}
  return {
    platform,get location(){return location;},get inMatch(){return inMatch();},get inLobby(){return inLobby();},get paused(){return inMatch()?paused:false;},get panel(){return panel;},get canPlay(){return snapshot().canPlay;},get viewport(){return {...viewport};},get fullscreen(){return fullscreen();},get immersive(){return immersive();},get connecting(){return connecting;},snapshot,render,start,
    enterFullscreenFromGesture,exitFullscreenFromGesture,beginConnection,updateConnection,endConnection,cancelConnection,enterLobby,prepareInputFromGesture,enterMatch,pause,resumeFromGesture,openPanel,closePanel,leaveToMenu,
    destroy(){resizeObserver?.disconnect();if(!resizeObserver)removeEventListener('resize',viewportChanged);document.removeEventListener(fullscreenEvent,fullscreenChanged);document.removeEventListener('pointerlockchange',pointerLockChanged);document.removeEventListener('visibilitychange',visibilityChanged);removeEventListener('pagehide',visibilityChanged);}
  };
}
