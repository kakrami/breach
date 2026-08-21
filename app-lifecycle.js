export const SHELL_PANEL=Object.freeze({NONE:'',SETTINGS:'settings',ADMIN:'admin'});

function isStandalone(){
  return navigator.standalone===true
    ||matchMedia('(display-mode: standalone)').matches
    ||matchMedia('(display-mode: fullscreen)').matches;
}

function fullscreenElement(){
  return document.fullscreenElement||document.webkitFullscreenElement||document.webkitCurrentFullScreenElement||null;
}

function canvasSize(canvas){
  const r=canvas.getBoundingClientRect();
  return{
    w:Math.max(1,Math.round(r.width||innerWidth||1)),
    h:Math.max(1,Math.round(r.height||innerHeight||1)),
  };
}

export function detectInputPlatform(){
  const coarse=matchMedia('(pointer: coarse)').matches;
  const touchOnly=navigator.maxTouchPoints>0&&matchMedia('(hover: none)').matches;
  const touchControls=coarse||touchOnly;
  return Object.freeze({touchControls,requiresLandscape:touchControls,standalone:isStandalone()});
}

export function createSessionShell({canvas,platform=detectInputPlatform(),elements,onSuspend=()=>{},onStateChange=()=>{},onViewport=()=>{},onPointerLockUnavailable=()=>{}}={}){
  if(!canvas)throw new Error('Session shell requires a gameplay canvas.');

  const state={mode:'menu',paused:true,pauseReason:'',panel:SHELL_PANEL.NONE,prepared:false};
  const root=document.documentElement;
  let viewport=canvasSize(canvas);
  let lastCanPlay=false;
  let lastFullscreen=!!fullscreenElement();
  let prepareToken=0;
  let preparePromise=Promise.resolve();

  root.classList.toggle('touch',platform.touchControls);

  const inMatch=()=>state.mode==='match';
  const fullscreen=()=>!!fullscreenElement();
  const pointerLocked=()=>document.pointerLockElement===canvas;
  const portrait=()=>viewport.h>viewport.w;
  const fullscreenSupported=()=>{
    if(platform.standalone)return false;
    const enabled=document.fullscreenEnabled??document.webkitFullscreenEnabled;
    return enabled!==false&&!!(root.requestFullscreen||root.webkitRequestFullscreen);
  };

  function snapshot(){
    const match=inMatch();
    const orientationBlocked=match&&state.paused&&state.pauseReason==='orientation'&&platform.requiresLandscape&&portrait()&&!state.panel;
    const inputReady=platform.touchControls||pointerLocked();
    return Object.freeze({
      location:state.mode,inMatch:match,paused:match?state.paused:false,pauseReason:match?state.pauseReason:'',panel:state.panel,
      prepared:state.prepared,hidden:document.hidden,portrait:portrait(),orientationBlocked,inputReady,
      canPlay:match&&!state.paused&&!state.panel&&!document.hidden&&(!platform.requiresLandscape||!portrait())&&inputReady,
      fullscreen:fullscreen(),fullscreenSupported:fullscreenSupported(),standalone:platform.standalone,
      touchControls:platform.touchControls,viewport:Object.freeze({...viewport}),
    });
  }

  function render(reason='sync'){
    const s=snapshot();
    elements.menu?.classList.toggle('hide',s.location!=='menu');
    elements.pause?.classList.toggle('hide',!s.inMatch||!s.paused||!!s.panel||s.orientationBlocked);
    elements.rotate?.classList.toggle('hide',!s.orientationBlocked);
    elements.settings?.classList.toggle('hide',s.panel!==SHELL_PANEL.SETTINGS);
    elements.admin?.classList.toggle('hide',s.panel!==SHELL_PANEL.ADMIN);

    const full=elements.fullscreenButton,fullLabel=full?.querySelector('span');
    if(full){
      if(s.standalone){if(fullLabel)fullLabel.textContent='App Mode';full.disabled=true;full.title='Already running as an installed app.';}
      else{if(fullLabel)fullLabel.textContent=s.fullscreen?'Exit Full':'Fullscreen';full.disabled=!s.fullscreen&&!s.fullscreenSupported;full.title=full.disabled?'Fullscreen is not supported by this browser.':s.fullscreen?'Exit Fullscreen':'Enter Fullscreen';}
    }
    const resumeLabel=elements.resumeButton?.querySelector('span');
    if(resumeLabel)resumeLabel.textContent='Resume';

    if(lastCanPlay&&!s.canPlay)onSuspend(reason,s);
    lastCanPlay=s.canPlay;
    onStateChange(s,reason);
    return s;
  }

  function update(reason,fn){
    const before=`${state.mode}|${state.paused}|${state.pauseReason}|${state.panel}|${state.prepared}`;
    fn(state);
    const after=`${state.mode}|${state.paused}|${state.pauseReason}|${state.panel}|${state.prepared}`;
    return before===after?snapshot():render(reason);
  }

  function pause(reason='pause'){
    if(!inMatch())return snapshot();
    const s=update(reason,x=>{x.paused=true;x.pauseReason=reason;x.panel=SHELL_PANEL.NONE;});
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();
    return s;
  }

  function syncViewport(size=canvasSize(canvas)){
    const next={w:Math.max(1,Math.round(size.w)),h:Math.max(1,Math.round(size.h))};
    if(next.w===viewport.w&&next.h===viewport.h)return snapshot();
    viewport=next;
    onViewport({...viewport});
    if(inMatch()&&!state.paused&&platform.requiresLandscape&&portrait())return pause('orientation');
    return render('viewport');
  }

  const resizeObserver=typeof ResizeObserver==='function'
    ?new ResizeObserver(()=>syncViewport(canvasSize(canvas)))
    :null;
  resizeObserver?.observe(canvas);
  const fallbackResize=()=>syncViewport();
  if(!resizeObserver)addEventListener('resize',fallbackResize);

  async function enterFullscreen(){
    if(fullscreen())return true;
    const fn=root.requestFullscreen||root.webkitRequestFullscreen;
    if(!fullscreenSupported()||!fn)return false;
    try{const result=fn.call(root);if(result?.then)await result;return fullscreen();}catch{return false;}
  }

  async function leaveFullscreen(){
    if(!fullscreen())return true;
    const fn=document.exitFullscreen||document.webkitExitFullscreen||document.webkitCancelFullScreen;
    if(!fn)return false;
    try{const result=fn.call(document);if(result?.then)await result;return !fullscreen();}catch{return false;}
  }

  async function lockLandscape(){
    if(!platform.requiresLandscape||!screen.orientation?.lock)return false;
    try{await screen.orientation.lock('landscape');return true;}catch{return false;}
  }

  function unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}}

  function requestPointerLock(){
    if(platform.touchControls||pointerLocked())return true;
    if(!canvas.requestPointerLock){onPointerLockUnavailable();return false;}
    try{
      const result=canvas.requestPointerLock();
      if(result?.catch)result.catch(onPointerLockUnavailable);
      return true;
    }catch{onPointerLockUnavailable();return false;}
  }

  function prepareMatchFromGesture(){
    const token=++prepareToken;
    state.prepared=true;
    if(platform.touchControls){
      preparePromise=(async()=>{
        if(!platform.standalone&&!fullscreen()&&fullscreenSupported())await enterFullscreen();
        if(token!==prepareToken||!state.prepared){if(fullscreen()&&!platform.standalone)await leaveFullscreen();return;}
        if(fullscreen()||platform.standalone)await lockLandscape();
      })();
    }else{
      requestPointerLock();
      preparePromise=Promise.resolve();
    }
    return preparePromise;
  }

  function cancelPreparedMatch(){
    ++prepareToken;
    state.prepared=false;
    if(pointerLocked())document.exitPointerLock?.();
    unlockLandscape();
    if(fullscreen()&&!platform.standalone)void leaveFullscreen();
    return render('prepare-cancel');
  }

  async function enterMatch(){
    if(state.prepared)await preparePromise;
    const ready=!platform.requiresLandscape||!portrait();
    update('match',s=>{
      s.mode='match';
      s.panel=SHELL_PANEL.NONE;
      s.prepared=false;
      if(!ready){s.paused=true;s.pauseReason='orientation';return;}
      if(!platform.touchControls&&!pointerLocked()){s.paused=true;s.pauseReason='pointer';return;}
      s.paused=false;s.pauseReason='';
    });
    return snapshot();
  }

  async function resumeFromGesture(){
    if(!inMatch()||state.panel)return false;
    if(platform.touchControls){
      if(!platform.standalone&&!fullscreen()&&fullscreenSupported())await enterFullscreen();
      if(fullscreen()||platform.standalone)await lockLandscape();
      syncViewport();
      if(platform.requiresLandscape&&portrait()){
        update('orientation',s=>{s.paused=true;s.pauseReason='orientation';});
        return false;
      }
      update('resume',s=>{s.paused=false;s.pauseReason='';});
      return true;
    }
    if(pointerLocked()){
      update('resume',s=>{s.paused=false;s.pauseReason='';});
      return true;
    }
    return requestPointerLock();
  }

  function showPauseMenu(){
    if(!inMatch())return snapshot();
    return update('pause-menu',s=>{s.paused=true;s.pauseReason='user';s.panel=SHELL_PANEL.NONE;});
  }

  function openPanel(name){
    if(name!==SHELL_PANEL.SETTINGS&&name!==SHELL_PANEL.ADMIN)return snapshot();
    const result=update(`panel-open:${name}`,s=>{if(s.mode==='match'){s.paused=true;s.pauseReason='panel';}s.panel=name;});
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();
    return result;
  }

  function closePanel(name=''){
    return update(`panel-close:${name||'current'}`,s=>{if(!name||s.panel===name)s.panel=SHELL_PANEL.NONE;});
  }

  async function toggleFullscreenFromGesture(){
    if(platform.standalone)return false;
    if(fullscreen()){
      const ok=await leaveFullscreen();
      unlockLandscape();
      return ok;
    }
    const ok=await enterFullscreen();
    if(ok&&platform.touchControls)await lockLandscape();
    return ok;
  }

  function leaveToMenu(){
    ++prepareToken;
    update('menu',s=>{s.mode='menu';s.paused=true;s.pauseReason='';s.panel=SHELL_PANEL.NONE;s.prepared=false;});
    if(pointerLocked())document.exitPointerLock?.();
    unlockLandscape();
    if(fullscreen()&&!platform.standalone)void leaveFullscreen();
  }

  function pointerLockChanged(){
    if(platform.touchControls)return;
    if(pointerLocked()){
      if(inMatch()&&state.paused&&!state.panel&&state.pauseReason==='pointer')update('pointer-lock-acquired',s=>{s.paused=false;s.pauseReason='';});
      else render('pointer-lock-acquired');
    }else if(inMatch()&&!state.paused)pause('pointer');
    else render('pointer-lock-lost');
  }

  function visibilityChanged(){
    if(document.hidden&&inMatch()&&!state.paused)pause('background');
    else render(document.hidden?'background':'foreground');
  }

  function fullscreenChanged(){
    const active=fullscreen();
    if(active===lastFullscreen)return;
    const exited=lastFullscreen&&!active;
    lastFullscreen=active;
    if(exited&&inMatch()&&!state.paused)pause('fullscreen');
    else render('fullscreen-change');
  }

  document.addEventListener('fullscreenchange',fullscreenChanged);
  document.addEventListener('webkitfullscreenchange',fullscreenChanged);
  document.addEventListener('pointerlockchange',pointerLockChanged);
  document.addEventListener('pointerlockerror',()=>{if(inMatch()&&!state.paused)pause('pointer');onPointerLockUnavailable();});
  document.addEventListener('visibilitychange',visibilityChanged);
  addEventListener('pagehide',()=>{if(inMatch()&&!state.paused)pause('background');});

  function start(){syncViewport();return render('init');}

  return{
    platform,
    get inMatch(){return inMatch();},get paused(){return inMatch()?state.paused:false;},get panel(){return state.panel;},
    get canPlay(){return snapshot().canPlay;},get orientationBlocked(){return snapshot().orientationBlocked;},
    get viewport(){return{...viewport};},get fullscreen(){return fullscreen();},snapshot,render,start,
    prepareMatchFromGesture,cancelPreparedMatch,enterMatch,pause,showPauseMenu,resumeFromGesture,
    openPanel,closePanel,toggleFullscreenFromGesture,leaveToMenu,
  };
}
