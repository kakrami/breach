export const SHELL_PANEL = Object.freeze({ NONE:'', SETTINGS:'settings', ADMIN:'admin', LOADOUT:'loadout' });

function fullscreenElement(){
  return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || null;
}
function standaloneMode(){
  return navigator.standalone===true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
}
function measure(el){
  const r=el.getBoundingClientRect(),vv=globalThis.visualViewport;
  const w=r.width||el.clientWidth||vv?.width||globalThis.innerWidth||1,h=r.height||el.clientHeight||vv?.height||globalThis.innerHeight||1;
  return {w:Math.max(1,Math.round(w)),h:Math.max(1,Math.round(h)),dpr:Math.max(.5,Math.min(4,Number(globalThis.devicePixelRatio)||1))};
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
  onSuspend=()=>{},onStateChange=()=>{},onViewport=()=>{},onPointerLockUnavailable=()=>{},alternateInputReady=()=>false,pointerInputRequired=()=>!platform.touchControls,gameplayAvailable=()=>true,
}={}){
  if(!root||!stage||!canvas)throw new Error('Session shell requires root, stage, and canvas.');

  let location='menu'; // menu | lobby | match
  let paused=false;
  let pauseReason='';
  let panel=SHELL_PANEL.NONE;
  let connecting=false;
  let connectionText='';
  function sizeSurface(){const vv=globalThis.visualViewport;root.style.setProperty('--app-width',`${vv?.width||innerWidth}px`);root.style.setProperty('--app-height',`${vv?.height||innerHeight}px`);}
  sizeSurface();
  let viewport=measure(stage);
  let lastCanPlay=false;
  let entered=platform.standalone||!platform.touchControls;
  let focused=document.hasFocus?.()!==false;
  let destroyed=false,revision=0;
  const pending=new Set();
  let hadPointerLock=false;

  root.classList.toggle('touch',platform.touchControls);
  root.classList.toggle('desktop',!platform.touchControls);

  const inMatch=()=>location==='match';
  const inLobby=()=>location==='lobby';
  const fullscreen=()=>!!fullscreenElement();
  const immersive=()=>platform.standalone||fullscreen();
  const pointerLocked=()=>document.pointerLockElement===canvas;
  const alternateReady=()=>{try{return !!alternateInputReady();}catch{return false;}};
  hadPointerLock=pointerLocked();
  const landscapeReady=()=>!platform.touchControls||viewport.w>=viewport.h;
  const fullscreenSupported=()=>platform.standalone||((document.fullscreenEnabled??document.webkitFullscreenEnabled)!==false&&!!(root.requestFullscreen||root.webkitRequestFullscreen));

  function snapshot(){
    const surfaceReady=entered||immersive(),landscape=landscapeReady(),match=inMatch(),blocked=surfaceReady&&platform.touchControls&&!landscape;
    const inputReady=!pointerInputRequired()||pointerLocked()||alternateReady();
    const playSurfaceReady=platform.touchControls?(surfaceReady&&landscape):true;
    return Object.freeze({
      location,inMatch:match,inLobby:inLobby(),paused:match?paused:false,pauseReason:match?pauseReason:'',panel,connecting,connectionText,
      surfaceReady,immersive:immersive(),fullscreen:fullscreen(),standalone:platform.standalone,touchControls:platform.touchControls,landscapeReady:landscape,orientationBlocked:blocked,
      hidden:document.hidden,focused,inputReady,canPlay:gameplayAvailable()&&playSurfaceReady&&match&&!paused&&!panel&&!connecting&&!document.hidden&&focused,
      viewport:Object.freeze({...viewport}),fullscreenSupported:fullscreenSupported(),
    });
  }
  const visible=(el,show)=>el?.classList.toggle('hide',!show);

  function render(reason='sync'){
    const s=snapshot(),matchUsable=platform.touchControls?(s.surfaceReady&&!s.orientationBlocked):true,frontUsable=platform.touchControls?matchUsable:true;
    visible(elements.entry,platform.touchControls&&!s.surfaceReady);
    visible(elements.rotate,platform.touchControls&&s.surfaceReady&&s.orientationBlocked);
    visible(elements.menu,frontUsable&&s.location==='menu'&&!s.panel&&!s.connecting);
    visible(elements.lobby,frontUsable&&s.location==='lobby'&&!s.panel&&!s.connecting);
    visible(elements.pause,matchUsable&&s.inMatch&&s.paused&&!s.panel&&!s.connecting);
    visible(elements.settings,(s.inMatch?matchUsable:frontUsable)&&s.panel===SHELL_PANEL.SETTINGS);
    visible(elements.admin,(s.inMatch?matchUsable:frontUsable)&&s.panel===SHELL_PANEL.ADMIN);
    visible(elements.loadout,(s.inMatch?matchUsable:frontUsable)&&s.panel===SHELL_PANEL.LOADOUT);
    visible(elements.connection,(s.inMatch?matchUsable:frontUsable)&&s.connecting);
    if(elements.connectionText)elements.connectionText.textContent=s.connectionText||'Connecting…';
    if(elements.entryButton){
      const label=elements.entryButton.querySelector('span');
      if(label)label.textContent='ENTER BREACH';
      elements.entryButton.disabled=false;
    }
    
    if(elements.fullscreenButton)elements.fullscreenButton.disabled=platform.standalone||!s.fullscreen;
    root.dataset.location=s.location;root.dataset.paused=String(s.paused);root.dataset.immersive=String(s.immersive);
    if(lastCanPlay&&!s.canPlay)onSuspend(reason,s);lastCanPlay=s.canPlay;onStateChange(s,reason);return s;
  }

  function syncViewport(force=false){
    sizeSurface();
    const next=measure(stage),changed=next.w!==viewport.w||next.h!==viewport.h||Math.abs(next.dpr-viewport.dpr)>.001;
    if(!changed&&!force)return false;
    viewport=next;onViewport({...viewport});
    if(platform.touchControls&&entered&&!landscapeReady()&&inMatch()&&!paused){paused=true;pauseReason='orientation';panel=SHELL_PANEL.NONE;}
    return true;
  }
  const raf=globalThis.requestAnimationFrame?.bind(globalThis)||((fn)=>setTimeout(fn,0));
  const caf=globalThis.cancelAnimationFrame?.bind(globalThis)||clearTimeout;
  let viewportFrame=0;
  function scheduleViewport(reason='viewport'){
    if(!viewportFrame)viewportFrame=raf(()=>{viewportFrame=0;if(syncViewport())render(reason);});
  }
  const viewportChanged=()=>scheduleViewport('viewport');
  const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(viewportChanged):null;
  resizeObserver?.observe(stage);
  addEventListener('resize',viewportChanged,{passive:true});
  addEventListener('orientationchange',viewportChanged,{passive:true});
  globalThis.visualViewport?.addEventListener?.('resize',viewportChanged,{passive:true});

  // Both promise and legacy void APIs complete through browser events. Subscribe
  // before requesting; never assume the void return means success or failure.
  function browserRequest(invoke,ready,events,errors){
    if(ready())return Promise.resolve(true);
    return new Promise(resolve=>{
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;for(const e of events)document.removeEventListener(e,changed);for(const e of errors)document.removeEventListener(e,failed);pending.delete(cancel);resolve(ok&&!destroyed);};
      const changed=()=>{if(ready())finish(true);},failed=()=>finish(false),cancel=()=>finish(false);
      pending.add(cancel);
      for(const e of events)document.addEventListener(e,changed);
      for(const e of errors)document.addEventListener(e,failed);
      try{const result=invoke();if(result?.then)result.then(()=>finish(ready()),failed);changed();}catch{failed();}
    });
  }
  function requestFullscreen(){
    if(platform.standalone||fullscreen())return Promise.resolve(true);
    if(!fullscreenSupported())return Promise.resolve(false);
    return browserRequest(()=>root.requestFullscreen?root.requestFullscreen({navigationUI:'hide'}):root.webkitRequestFullscreen(),fullscreen,['fullscreenchange','webkitfullscreenchange'],['fullscreenerror','webkitfullscreenerror']);
  }
  function exitFullscreen(){
    if(platform.standalone||!fullscreen())return Promise.resolve(false);
    const fn=document.exitFullscreen||document.webkitExitFullscreen||document.webkitCancelFullScreen;
    if(!fn)return Promise.resolve(false);
    return browserRequest(()=>fn.call(document),()=>!fullscreen(),['fullscreenchange','webkitfullscreenchange'],['fullscreenerror','webkitfullscreenerror']);
  }
  async function lockLandscape(){
    if(!platform.touchControls||!screen.orientation?.lock)return false;
    try{await screen.orientation.lock('landscape');return true;}catch{return false;}
  }
  function unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}}
  async function requestPointerLock(){
    if(pointerLocked())return true;
    if(!canvas.requestPointerLock){onPointerLockUnavailable();return false;}
    const ok=await browserRequest(()=>canvas.requestPointerLock(),pointerLocked,['pointerlockchange'],['pointerlockerror']);
    if(!ok)onPointerLockUnavailable();return ok;
  }
  async function enterFullscreenFromGesture(){
    // Fullscreen is an enhancement. iPhone/browser policy cannot block entry.
    entered=true;
    const epoch=revision,request=requestFullscreen();
    syncViewport();render('enter');
    const ok=await request;
    if(destroyed||epoch!==revision)return false;
    if(ok)await lockLandscape();
    syncViewport(true);render(ok?'fullscreen-enter':'browser-enter');return true;
  }
  async function exitFullscreenFromGesture(){
    if(inMatch()&&!paused){paused=true;pauseReason='fullscreen';panel=SHELL_PANEL.NONE;}
    if(pointerLocked())document.exitPointerLock?.();unlockLandscape();
    const exited=await exitFullscreen();if(!exited&&immersive())render('fullscreen-exit-failed');return exited;
  }

  function beginConnection(text='Connecting…'){connecting=true;connectionText=String(text||'Connecting…');panel=SHELL_PANEL.NONE;return render('connection-start');}
  function updateConnection(text){connectionText=String(text||'Connecting…');if(elements.connectionText)elements.connectionText.textContent=connectionText;}
  function cancelConnection(){connecting=false;connectionText='';return render('connection-cancel');}
  function endConnection(){connecting=false;connectionText='';return render('connection-end');}

  function enterLobby(){
    location='lobby';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(pointerLocked())document.exitPointerLock?.();
    return render('lobby');
  }
  async function prepareInputFromGesture(){
    if(platform.touchControls){entered=true;syncViewport();render('input-ready');}
    return !pointerInputRequired()||alternateReady()?true:requestPointerLock();
  }
  async function capturePointerFromGesture(){return requestPointerLock();}
  async function enterMatch(){
    location='match';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    // Network-driven match entry cannot request browser-gated capabilities.
    if(platform.touchControls&&(!entered||!landscapeReady())){paused=true;pauseReason=!entered?'entry':'orientation';return render('match-blocked');}
    paused=false;pauseReason='';return render('match-enter');
  }
  function showMatchPresentation(){
    if(!inMatch())return snapshot();
    // Match-end presentation is read-only gameplay. Close any modal/pause layer
    // without requesting pointer lock so victory/final standings always own the screen.
    paused=false;pauseReason='';panel=SHELL_PANEL.NONE;return render('match-presentation');
  }
  function pause(reason='pause'){
    revision++;if(!inMatch()||paused){onSuspend(reason,snapshot());return snapshot();}paused=true;pauseReason=reason;panel=SHELL_PANEL.NONE;
    if(pointerLocked())document.exitPointerLock?.();return render(reason);
  }
  async function resumeFromGesture(){
    if(!inMatch()||panel||document.hidden||!focused||!gameplayAvailable())return false;
    const epoch=revision;
    if(platform.touchControls){entered=true;syncViewport();if(!landscapeReady())return false;}
    if(pointerInputRequired()&&!alternateReady()&&!(await requestPointerLock()))return false;
    if(destroyed||epoch!==revision||!inMatch()||panel||document.hidden||!focused)return false;
    paused=false;pauseReason='';render('resume');return true;
  }
  function resumeFromAlternateInput(){
    if(!inMatch()||panel||!alternateReady()||document.hidden||!focused||!gameplayAvailable())return false;
    if(platform.touchControls&&(!entered||!landscapeReady()))return false;
    paused=false;pauseReason='';render('resume-alternate');return true;
  }
  function openPanel(name){
    revision++;
    if(name!==SHELL_PANEL.SETTINGS&&name!==SHELL_PANEL.ADMIN&&name!==SHELL_PANEL.LOADOUT)return snapshot();
    if(inMatch()&&!paused){paused=true;pauseReason='panel';if(pointerLocked())document.exitPointerLock?.();}
    panel=name;return render(`panel-open:${name}`);
  }
  function closePanel(){panel=SHELL_PANEL.NONE;return render('panel-close');}
  function leaveToMenu(){
    revision++;
    location='menu';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(pointerLocked())document.exitPointerLock?.();return render('menu');
  }

  function fullscreenChanged(){
    if(!immersive()){if(inMatch()&&!paused){paused=true;pauseReason='fullscreen';panel=SHELL_PANEL.NONE;}if(pointerLocked())document.exitPointerLock?.();unlockLandscape();}
    syncViewport(true);scheduleViewport('fullscreen');render('fullscreen');
  }
  function pointerLockChanged(){
    const locked=pointerLocked();
    if(locked){hadPointerLock=true;render('pointer-acquired');return;}
    const lostOwnedPointer=hadPointerLock;hadPointerLock=false;
    if(lostOwnedPointer&&inMatch()&&!paused&&!alternateReady())pause('pointer');
  }
  function suspend(reason){focused=false;pause(reason);render(reason);}
  function visibilityChanged(){if(document.hidden)suspend('background');else{focused=document.hasFocus?.()!==false;syncViewport(true);render('foreground');}}
  const blurred=()=>suspend('blur'),pageHidden=()=>suspend('pagehide');
  const gainedFocus=()=>{focused=true;syncViewport(true);render('focus');};
  const listeners=[[document,'fullscreenchange',fullscreenChanged],[document,'webkitfullscreenchange',fullscreenChanged],[document,'pointerlockchange',pointerLockChanged],[document,'visibilitychange',visibilityChanged],[globalThis,'blur',blurred],[globalThis,'focus',gainedFocus],[globalThis,'pagehide',pageHidden],[globalThis,'pageshow',gainedFocus]];
  for(const [target,type,fn] of listeners)target.addEventListener(type,fn);

  function start(){syncViewport(true);return render('start');}
  return {
    platform,get location(){return location;},get inMatch(){return inMatch();},get inLobby(){return inLobby();},get paused(){return inMatch()?paused:false;},get panel(){return panel;},get canPlay(){return snapshot().canPlay;},get viewport(){return {...viewport};},get fullscreen(){return fullscreen();},get immersive(){return immersive();},get connecting(){return connecting;},snapshot,render,start,
    enterFullscreenFromGesture,exitFullscreenFromGesture,beginConnection,updateConnection,endConnection,cancelConnection,enterLobby,prepareInputFromGesture,capturePointerFromGesture,enterMatch,showMatchPresentation,pause,resumeFromGesture,resumeFromAlternateInput,openPanel,closePanel,leaveToMenu,
    destroy(){destroyed=true;for(const cancel of [...pending])cancel();resizeObserver?.disconnect();if(viewportFrame)caf(viewportFrame);removeEventListener('resize',viewportChanged);removeEventListener('orientationchange',viewportChanged);globalThis.visualViewport?.removeEventListener?.('resize',viewportChanged);for(const [target,type,fn] of listeners)target.removeEventListener(type,fn);}
  };
}
