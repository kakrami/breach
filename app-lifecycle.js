export const SHELL_PANEL = Object.freeze({ NONE:'', SETTINGS:'settings', ADMIN:'admin', LOADOUT:'loadout' });

function fullscreenElement(ownerDocument){
  return ownerDocument.fullscreenElement || ownerDocument.webkitFullscreenElement || ownerDocument.webkitCurrentFullScreenElement || null;
}
function standaloneMode(environment=globalThis){
  const navigator=environment.navigator||{},media=query=>environment.matchMedia?.(query)?.matches===true;
  return navigator.standalone===true || media('(display-mode: standalone)') || media('(display-mode: fullscreen)');
}
function measure(el,environment=globalThis){
  const r=el?.getBoundingClientRect?.()||{},vv=environment.visualViewport;
  const w=r.width||el?.clientWidth||vv?.width||environment.innerWidth||1,h=r.height||el?.clientHeight||vv?.height||environment.innerHeight||1;
  return {w:Math.max(1,Math.round(w)),h:Math.max(1,Math.round(h)),dpr:Math.max(.5,Math.min(4,Number(environment.devicePixelRatio)||1))};
}
export function detectInputPlatform(environment=globalThis){
  const navigator=environment.navigator||{},touchPoints=Math.max(0,Number(navigator.maxTouchPoints)||0),touchCapable=touchPoints>0;
  const media=query=>environment.matchMedia?.(query)?.matches===true;
  const ua=String(navigator.userAgent||''),platformName=String(navigator.platform||'');
  const mobileUa=navigator.userAgentData?.mobile===true||/Android|iPhone|iPod|Mobile/i.test(ua);
  const ipadDesktopUa=touchPoints>1&&(/iPad/i.test(ua)||(/Macintosh|MacIntel/i.test(`${ua} ${platformName}`)));
  const ios=/iPhone|iPad|iPod/i.test(ua)||ipadDesktopUa;
  const apple=/Macintosh|MacIntel|iPhone|iPad|iPod/i.test(`${ua} ${platformName}`);
  const safari=/Safari/i.test(ua)&&!/Chrome|CriOS|Chromium|Edg|EdgiOS|FxiOS|OPiOS|Android/i.test(ua);
  const touchControls=touchCapable&&(media('(pointer: coarse)')||media('(hover: none)')||mobileUa||ipadDesktopUa);
  return Object.freeze({touchControls,touchCapable,standalone:standaloneMode(environment),apple,safari,ios});
}

export function createSessionShell({
  root,stage,canvas,platform=detectInputPlatform(),elements={},
  ownerDocument=root?.ownerDocument||canvas?.ownerDocument||globalThis.document,eventTarget=globalThis,
  viewportElement=stage?.ownerDocument?.subscribe?canvas:stage,
  fullscreenTarget=root?.ownerDocument?.subscribe?canvas:root,inputOwner=null,gameplayOrientationRequired=()=>true,
  onSuspend=()=>{},onStateChange=()=>{},onViewport=()=>{},onPointerLockUnavailable=()=>{},alternateInputReady=()=>false,pointerInputRequired=()=>!platform.touchControls,gameplayAvailable=()=>true,
}={}){
  if(!root||!stage||!canvas)throw new Error('Session shell requires root, stage, and canvas.');

  let location='menu',builderOrigin='menu'; // menu | lobby | builder | match
  let paused=false;
  let pauseReason='';
  let panel=SHELL_PANEL.NONE;
  let connecting=false;
  let connectionText='';
  function sizeSurface(){const vv=eventTarget.visualViewport;root.style?.setProperty('--app-width',`${vv?.width||eventTarget.innerWidth||1}px`);root.style?.setProperty('--app-height',`${vv?.height||eventTarget.innerHeight||1}px`);}
  sizeSurface();
  let viewport=measure(viewportElement,eventTarget);
  let lastCanPlay=false;
  let entered=platform.standalone||!platform.touchControls;
  let focused=ownerDocument.hasFocus?.()!==false;
  let destroyed=false,revision=0;
  const pending=new Set();
  let hadPointerLock=false,orientationLocked=false;

  root.classList.toggle('touch',platform.touchControls);
  root.classList.toggle('desktop',!platform.touchControls);
  root.classList.toggle('apple',!!platform.apple);
  root.classList.toggle('safari',!!platform.safari);
  root.classList.toggle('ios',!!platform.ios);

  const inMatch=()=>location==='match';
  const inLobby=()=>location==='lobby';
  const inBuilder=()=>location==='builder';
  const fullscreen=()=>!!fullscreenElement(ownerDocument);
  const immersive=()=>platform.standalone||fullscreen();
  const pointerLocked=()=>canvas.getRootNode?.()?.pointerLockElement===canvas||ownerDocument.pointerLockElement===canvas||ownerDocument.webkitPointerLockElement===canvas;
  const alternateReady=()=>{try{return !!alternateInputReady();}catch{return false;}};
  hadPointerLock=pointerLocked();
  const landscapeReady=()=>!platform.touchControls||viewport.w>=viewport.h;
  // Read raw match state here. A callback must not call shell.canPlay/snapshot.
  const requiresGameplayOrientation=()=>{if(!inMatch())return false;try{return !!gameplayOrientationRequired();}catch{return true;}};
  function pauseForOrientation(){
    if(platform.touchControls&&entered&&!landscapeReady()&&requiresGameplayOrientation()&&!paused&&!panel&&!connecting){
      revision++;paused=true;pauseReason='orientation';return true;
    }
    return false;
  }
  const fullscreenSupported=()=>platform.standalone||((ownerDocument.fullscreenEnabled??ownerDocument.webkitFullscreenEnabled)!==false&&!!(fullscreenTarget?.requestFullscreen||fullscreenTarget?.webkitRequestFullscreen));

  function snapshot(){
    const surfaceReady=entered||immersive(),landscape=landscapeReady(),match=inMatch(),orientationRequired=requiresGameplayOrientation();
    const resumeOrientationBlocked=match&&platform.touchControls&&orientationRequired&&!landscape,blocked=surfaceReady&&resumeOrientationBlocked&&!paused&&!panel&&!connecting;
    const inputReady=!pointerInputRequired()||pointerLocked()||alternateReady();
    const playSurfaceReady=platform.touchControls?(surfaceReady&&landscape):true;
    return Object.freeze({
      location,inMatch:match,inLobby:inLobby(),inBuilder:inBuilder(),paused:match?paused:false,pauseReason:match?pauseReason:'',panel,connecting,connectionText,
      surfaceReady,immersive:immersive(),fullscreen:fullscreen(),standalone:platform.standalone,touchControls:platform.touchControls,landscapeReady:landscape,orientationBlocked:blocked,resumeOrientationBlocked,gameplayOrientationRequired:orientationRequired,orientationMessage:resumeOrientationBlocked?'Rotate to landscape to resume gameplay.':'',
      hidden:ownerDocument.hidden,focused,inputReady,canPlay:gameplayAvailable()&&playSurfaceReady&&match&&!paused&&!panel&&!connecting&&!ownerDocument.hidden&&focused,
      viewport:Object.freeze({...viewport}),fullscreenSupported:fullscreenSupported(),
    });
  }
  const visible=(el,show)=>el?.classList.toggle('hide',!show);

  function render(reason='sync'){
    pauseForOrientation();
    const s=snapshot(),frontUsable=!platform.touchControls||s.surfaceReady;
    if(!s.inMatch||s.paused||s.panel||!s.gameplayOrientationRequired)unlockLandscape();
    visible(elements.entry,platform.touchControls&&!s.surfaceReady);
    visible(elements.rotate,s.orientationBlocked&&!s.panel&&!s.connecting);
    visible(elements.menu,frontUsable&&s.location==='menu'&&!s.panel&&!s.connecting);
    visible(elements.lobby,frontUsable&&s.location==='lobby'&&!s.panel&&!s.connecting);
    visible(elements.builder,frontUsable&&s.location==='builder'&&!s.panel&&!s.connecting);
    visible(elements.pause,frontUsable&&s.inMatch&&s.paused&&!s.panel&&!s.connecting);
    visible(elements.settings,frontUsable&&s.panel===SHELL_PANEL.SETTINGS);
    visible(elements.admin,frontUsable&&s.panel===SHELL_PANEL.ADMIN);
    visible(elements.loadout,frontUsable&&s.panel===SHELL_PANEL.LOADOUT);
    visible(elements.connection,frontUsable&&s.connecting);
    if(elements.connectionText)elements.connectionText.textContent=s.connectionText||'Connecting…';
    if(elements.orientationMessage)elements.orientationMessage.textContent=s.orientationMessage;
    if(elements.entryButton){
      const label=elements.entryButton.querySelector('span');
      if(label)label.textContent='ENTER BREACH';
      elements.entryButton.disabled=false;
    }
    
    if(elements.fullscreenButton)elements.fullscreenButton.disabled=platform.standalone||!s.fullscreen;
    root.dataset.location=s.location;root.dataset.paused=String(s.paused);root.dataset.immersive=String(s.immersive);
    inputOwner?.sync(reason);
    if(lastCanPlay&&!s.canPlay)onSuspend(reason,s);lastCanPlay=s.canPlay;onStateChange(s,reason);return s;
  }

  function syncViewport(force=false){
    sizeSurface();
    const next=measure(viewportElement,eventTarget),changed=next.w!==viewport.w||next.h!==viewport.h||Math.abs(next.dpr-viewport.dpr)>.001;
    if(!changed&&!force)return false;
    viewport=next;onViewport({...viewport});
    pauseForOrientation();
    return true;
  }
  const raf=eventTarget.requestAnimationFrame?.bind(eventTarget)||((fn)=>setTimeout(fn,0));
  const caf=eventTarget.cancelAnimationFrame?.bind(eventTarget)||clearTimeout;
  let viewportFrame=0;
  function scheduleViewport(reason='viewport'){
    if(!viewportFrame)viewportFrame=raf(()=>{viewportFrame=0;if(syncViewport())render(reason);});
  }
  const viewportChanged=()=>scheduleViewport('viewport');
  const resizeObserver=viewportElement?.nodeType===1&&typeof eventTarget.ResizeObserver==='function'?new eventTarget.ResizeObserver(viewportChanged):null;
  resizeObserver?.observe(viewportElement);
  eventTarget.addEventListener?.('resize',viewportChanged,{passive:true});
  eventTarget.addEventListener?.('orientationchange',viewportChanged,{passive:true});
  eventTarget.visualViewport?.addEventListener?.('resize',viewportChanged,{passive:true});
  eventTarget.visualViewport?.addEventListener?.('scroll',viewportChanged,{passive:true});

  // Both promise and legacy void APIs complete through browser events. Subscribe
  // before requesting; never assume the void return means success or failure.
  function browserRequest(invoke,ready,events,errors){
    if(ready())return Promise.resolve(true);
    return new Promise(resolve=>{
      let settled=false;
      const finish=ok=>{if(settled)return;settled=true;for(const e of events)ownerDocument.removeEventListener(e,changed);for(const e of errors)ownerDocument.removeEventListener(e,failed);pending.delete(cancel);resolve(ok&&!destroyed);};
      const changed=()=>{if(ready())finish(true);},failed=()=>finish(false),cancel=()=>finish(false);
      pending.add(cancel);
      for(const e of events)ownerDocument.addEventListener(e,changed);
      for(const e of errors)ownerDocument.addEventListener(e,failed);
      try{const result=invoke();if(result?.then)result.then(()=>finish(ready()),failed);changed();}catch{failed();}
    });
  }
  function requestFullscreen(){
    if(platform.standalone||fullscreen())return Promise.resolve(true);
    if(!fullscreenSupported())return Promise.resolve(false);
    return browserRequest(()=>{if(fullscreenTarget?.requestFullscreen){try{return fullscreenTarget?.requestFullscreen({navigationUI:'hide'});}catch{return fullscreenTarget?.requestFullscreen();}}return fullscreenTarget?.webkitRequestFullscreen?.();},fullscreen,['fullscreenchange','webkitfullscreenchange'],['fullscreenerror','webkitfullscreenerror']);
  }
  function exitFullscreen(){
    if(platform.standalone||!fullscreen())return Promise.resolve(false);
    const fn=ownerDocument.exitFullscreen||ownerDocument.webkitExitFullscreen||ownerDocument.webkitCancelFullScreen;
    if(!fn)return Promise.resolve(false);
    return browserRequest(()=>fn.call(ownerDocument),()=>!fullscreen(),['fullscreenchange','webkitfullscreenchange'],['fullscreenerror','webkitfullscreenerror']);
  }
  async function lockLandscape(){
    if(!platform.touchControls||!eventTarget.screen?.orientation?.lock)return false;
    try{await eventTarget.screen.orientation.lock('landscape');orientationLocked=true;return true;}catch{return false;}
  }
  function unlockLandscape(){if(!orientationLocked)return;orientationLocked=false;try{eventTarget.screen?.orientation?.unlock?.();}catch{}}
  async function requestPointerLock(){
    if(pointerLocked())return true;
    const fn=canvas.requestPointerLock||canvas.webkitRequestPointerLock;if(!fn){onPointerLockUnavailable();return false;}
    const ok=await browserRequest(()=>fn.call(canvas),pointerLocked,['pointerlockchange','webkitpointerlockchange'],['pointerlockerror','webkitpointerlockerror']);
    if(!ok)onPointerLockUnavailable();return ok;
  }
  async function enterFullscreenFromGesture(){
    // Fullscreen is an enhancement. iPhone/browser policy cannot block entry.
    entered=true;
    const epoch=revision,request=requestFullscreen();
    syncViewport();render('enter');
    const ok=await request;
    if(destroyed||epoch!==revision)return false;
    if(ok&&inMatch())await lockLandscape();
    syncViewport(true);render(ok?'fullscreen-enter':'browser-enter');return true;
  }
  async function exitFullscreenFromGesture(){
    if(inMatch()&&!paused){paused=true;pauseReason='fullscreen';panel=SHELL_PANEL.NONE;}
    if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);unlockLandscape();
    const exited=await exitFullscreen();if(!exited&&immersive())render('fullscreen-exit-failed');return exited;
  }

  function beginConnection(text='Connecting…'){connecting=true;connectionText=String(text||'Connecting…');panel=SHELL_PANEL.NONE;return render('connection-start');}
  function updateConnection(text){connectionText=String(text||'Connecting…');if(elements.connectionText)elements.connectionText.textContent=connectionText;}
  function cancelConnection(){connecting=false;connectionText='';return render('connection-cancel');}
  function endConnection(){connecting=false;connectionText='';return render('connection-end');}

  function enterLobby(){
    location='lobby';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);
    return render('lobby');
  }
  function enterBuilder(){
    revision++;if(!inBuilder())builderOrigin=inLobby()?'lobby':'menu';
    location='builder';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);
    return render('builder');
  }
  function exitBuilder(){
    if(!inBuilder())return snapshot();
    location=builderOrigin;paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    return render('builder-exit');
  }
  async function prepareInputFromGesture(){
    if(platform.touchControls){entered=true;syncViewport();render('input-ready');}
    return !pointerInputRequired()||alternateReady()?true:requestPointerLock();
  }
  async function capturePointerFromGesture(){return requestPointerLock();}
  async function enterMatch(){
    location='match';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    // Network-driven match entry cannot request browser-gated capabilities.
    if(platform.touchControls&&(!entered||(requiresGameplayOrientation()&&!landscapeReady()))){paused=true;pauseReason=!entered?'entry':'orientation';return render('match-blocked');}
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
    if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);return render(reason);
  }
  async function resumeFromGesture(){
    if(!inMatch()||panel||ownerDocument.hidden||!focused||!gameplayAvailable())return false;
    const epoch=revision;
    if(platform.touchControls){entered=true;syncViewport();if(requiresGameplayOrientation()&&!landscapeReady())return false;}
    if(pointerInputRequired()&&!alternateReady()&&!(await requestPointerLock()))return false;
    if(destroyed||epoch!==revision||!inMatch()||panel||ownerDocument.hidden||!focused)return false;
    paused=false;pauseReason='';render('resume');return true;
  }
  function resumeFromAlternateInput(){
    if(!inMatch()||panel||!alternateReady()||ownerDocument.hidden||!focused||!gameplayAvailable())return false;
    if(platform.touchControls&&(!entered||(requiresGameplayOrientation()&&!landscapeReady())))return false;
    paused=false;pauseReason='';render('resume-alternate');return true;
  }
  function openPanel(name){
    revision++;
    if(name!==SHELL_PANEL.SETTINGS&&name!==SHELL_PANEL.ADMIN&&name!==SHELL_PANEL.LOADOUT)return snapshot();
    if(inMatch()&&!paused){paused=true;pauseReason='panel';if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);}
    panel=name;return render(`panel-open:${name}`);
  }
  function closePanel(){revision++;panel=SHELL_PANEL.NONE;return render('panel-close');}
  function leaveToMenu(){
    revision++;
    location='menu';paused=false;pauseReason='';panel=SHELL_PANEL.NONE;connecting=false;connectionText='';
    if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);return render('menu');
  }

  function fullscreenChanged(){
    if(!immersive()){if(inMatch()&&!paused){paused=true;pauseReason='fullscreen';panel=SHELL_PANEL.NONE;}if(pointerLocked())(ownerDocument.exitPointerLock||ownerDocument.webkitExitPointerLock)?.call(ownerDocument);unlockLandscape();}
    syncViewport(true);scheduleViewport('fullscreen');render('fullscreen');
  }
  function pointerLockChanged(){
    const locked=pointerLocked();
    if(locked){hadPointerLock=true;render('pointer-acquired');return;}
    const lostOwnedPointer=hadPointerLock;hadPointerLock=false;
    if(lostOwnedPointer&&inMatch()&&!paused&&!alternateReady())pause('pointer');
  }
  function suspend(reason){focused=false;pause(reason);render(reason);}
  function visibilityChanged(){if(ownerDocument.hidden)suspend('background');else{focused=ownerDocument.hasFocus?.()!==false;syncViewport(true);render('foreground');}}
  const blurred=()=>suspend('blur'),pageHidden=()=>suspend('pagehide');
  const gainedFocus=()=>{focused=true;syncViewport(true);render('focus');};
  const listeners=[[ownerDocument,'fullscreenchange',fullscreenChanged],[ownerDocument,'webkitfullscreenchange',fullscreenChanged],[ownerDocument,'pointerlockchange',pointerLockChanged],[ownerDocument,'webkitpointerlockchange',pointerLockChanged],[ownerDocument,'visibilitychange',visibilityChanged],[eventTarget,'blur',blurred],[eventTarget,'focus',gainedFocus],[eventTarget,'pagehide',pageHidden],[eventTarget,'pageshow',gainedFocus]];
  for(const [target,type,fn] of listeners)target?.addEventListener?.(type,fn);

  function start(){syncViewport(true);return render('start');}
  return {
    platform,get location(){return location;},get inMatch(){return inMatch();},get inLobby(){return inLobby();},get inBuilder(){return inBuilder();},get paused(){return inMatch()?paused:false;},get panel(){return panel;},get canPlay(){return snapshot().canPlay;},get viewport(){return {...viewport};},get fullscreen(){return fullscreen();},get immersive(){return immersive();},get connecting(){return connecting;},snapshot,render,start,
    enterFullscreenFromGesture,exitFullscreenFromGesture,beginConnection,updateConnection,endConnection,cancelConnection,enterLobby,enterBuilder,exitBuilder,prepareInputFromGesture,capturePointerFromGesture,enterMatch,showMatchPresentation,pause,resumeFromGesture,resumeFromAlternateInput,openPanel,closePanel,leaveToMenu,
    destroy(){destroyed=true;for(const cancel of [...pending])cancel();resizeObserver?.disconnect();if(viewportFrame)caf(viewportFrame);eventTarget.removeEventListener?.('resize',viewportChanged);eventTarget.removeEventListener?.('orientationchange',viewportChanged);eventTarget.visualViewport?.removeEventListener?.('resize',viewportChanged);eventTarget.visualViewport?.removeEventListener?.('scroll',viewportChanged);for(const [target,type,fn] of listeners)target?.removeEventListener?.(type,fn);}
  };
}
