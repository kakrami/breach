export const SHELL_PANEL=Object.freeze({NONE:'',SETTINGS:'settings',ADMIN:'admin'});

function standalone(){
  return navigator.standalone===true
    ||matchMedia('(display-mode: standalone)').matches
    ||matchMedia('(display-mode: fullscreen)').matches;
}
function fullscreenElement(){
  return document.fullscreenElement||document.webkitFullscreenElement||document.webkitCurrentFullScreenElement||null;
}
function elementSize(element){
  const rect=element.getBoundingClientRect();
  return{
    w:Math.max(1,Math.round(rect.width||element.clientWidth||innerWidth||1)),
    h:Math.max(1,Math.round(rect.height||element.clientHeight||innerHeight||1)),
  };
}

export function detectInputPlatform(){
  const coarse=matchMedia('(pointer: coarse)').matches;
  const touchOnly=navigator.maxTouchPoints>0&&matchMedia('(hover: none)').matches;
  const touchControls=coarse||touchOnly;
  return Object.freeze({touchControls,requiresLandscape:touchControls,standalone:standalone()});
}

export function createSessionShell({canvas,platform=detectInputPlatform(),elements,onSuspend=()=>{},onStateChange=()=>{},onViewport=()=>{},onPointerLockUnavailable=()=>{}}={}){
  if(!canvas)throw new Error('Session shell requires a gameplay canvas.');

  const state={location:'menu',paused:true,panel:SHELL_PANEL.NONE,activated:false};
  let viewport=elementSize(canvas),lastCanPlay=false,lastFullscreen=false;
  const root=document.documentElement;
  root.classList.toggle('touch',platform.touchControls);

  const inMatch=()=>state.location==='match';
  const fullscreen=()=>!!fullscreenElement();
  lastFullscreen=fullscreen();
  const pointerLocked=()=>document.pointerLockElement===canvas;
  const portrait=()=>viewport.h>viewport.w;
  const fullscreenSupported=()=>{
    if(platform.standalone)return false;
    const enabled=document.fullscreenEnabled??document.webkitFullscreenEnabled;
    return enabled!==false&&!!(root.requestFullscreen||root.webkitRequestFullscreen);
  };

  function snapshot(){
    const match=inMatch();
    const orientationBlocked=match&&!state.paused&&!state.panel&&platform.requiresLandscape&&portrait();
    const inputReady=platform.touchControls||pointerLocked();
    return Object.freeze({
      location:state.location,inMatch:match,paused:match?state.paused:false,panel:state.panel,
      activated:match?state.activated:false,hidden:document.hidden,portrait:portrait(),orientationBlocked,inputReady,
      canPlay:match&&!state.paused&&!state.panel&&!document.hidden&&!orientationBlocked&&inputReady,
      fullscreen:fullscreen(),fullscreenSupported:fullscreenSupported(),standalone:platform.standalone,
      touchControls:platform.touchControls,viewport:Object.freeze({...viewport}),
    });
  }

  function render(reason='sync'){
    const s=snapshot();
    elements.menu?.classList.toggle('hide',s.location!=='menu');
    elements.pause?.classList.toggle('hide',!s.inMatch||!s.paused||!!s.panel);
    elements.rotate?.classList.toggle('hide',!s.orientationBlocked);
    elements.settings?.classList.toggle('hide',s.panel!==SHELL_PANEL.SETTINGS);
    elements.admin?.classList.toggle('hide',s.panel!==SHELL_PANEL.ADMIN);

    const full=elements.fullscreenButton,fullLabel=full?.querySelector('span');
    if(full){
      if(s.standalone){if(fullLabel)fullLabel.textContent='App Mode';full.disabled=true;full.title='Already running as an installed app.';}
      else{if(fullLabel)fullLabel.textContent=s.fullscreen?'Exit Full':'Fullscreen';full.disabled=!s.fullscreen&&!s.fullscreenSupported;full.title=full.disabled?'Fullscreen is not supported by this browser.':s.fullscreen?'Exit Fullscreen':'Enter Fullscreen';}
    }
    const resumeLabel=elements.resumeButton?.querySelector('span');
    if(resumeLabel)resumeLabel.textContent=s.inMatch&&!s.activated?'Enter Match':'Resume';

    if(lastCanPlay&&!s.canPlay)onSuspend(reason,s);
    lastCanPlay=s.canPlay;
    onStateChange(s,reason);
    return s;
  }

  function change(reason,fn){
    const before=`${state.location}|${state.paused}|${state.panel}|${state.activated}`;
    fn(state);
    return before===`${state.location}|${state.paused}|${state.panel}|${state.activated}`?snapshot():render(reason);
  }

  function syncViewport(size=elementSize(canvas)){
    const next={w:Math.max(1,Math.round(size.w)),h:Math.max(1,Math.round(size.h))};
    if(next.w===viewport.w&&next.h===viewport.h)return snapshot();
    viewport=next;
    onViewport({...viewport});
    return render('viewport');
  }

  const resizeObserver=typeof ResizeObserver==='function'
    ?new ResizeObserver(entries=>{
      const entry=entries.find(item=>item.target===canvas)||entries[0];
      const box=entry?.contentRect;
      syncViewport(box?{w:box.width,h:box.height}:elementSize(canvas));
    })
    :null;
  resizeObserver?.observe(canvas);
  const fallbackResize=()=>syncViewport();
  if(!resizeObserver)addEventListener('resize',fallbackResize);

  async function enterFullscreen(){
    if(fullscreen())return true;
    const fn=root.requestFullscreen||root.webkitRequestFullscreen;
    if(!fullscreenSupported()||!fn)return false;
    try{const result=fn.call(root);if(result?.then)await result;return fullscreen();}
    catch{return false;}
  }
  async function leaveFullscreen(){
    if(!fullscreen())return true;
    const fn=document.exitFullscreen||document.webkitExitFullscreen||document.webkitCancelFullScreen;
    if(!fn)return false;
    try{const result=fn.call(document);if(result?.then)await result;return !fullscreen();}
    catch{return false;}
  }
  async function lockLandscape(){
    if(!platform.requiresLandscape||!screen.orientation?.lock)return false;
    try{await screen.orientation.lock('landscape');return true;}catch{return false;}
  }
  function unlockLandscape(){try{screen.orientation?.unlock?.();}catch{}}

  async function toggleFullscreenFromGesture(){
    if(platform.standalone)return false;
    return fullscreen()?leaveFullscreen():enterFullscreen();
  }

  function requestPointerLock(){
    if(platform.touchControls||pointerLocked())return true;
    if(!canvas.requestPointerLock){onPointerLockUnavailable();return false;}
    try{
      const result=canvas.requestPointerLock();
      if(result?.catch)result.catch(()=>{if(inMatch())change('pointer-lock-error',s=>{s.paused=true;});onPointerLockUnavailable();});
      return true;
    }catch{onPointerLockUnavailable();return false;}
  }

  function enterMatch(){
    change('match',s=>{s.location='match';s.paused=true;s.panel=SHELL_PANEL.NONE;s.activated=false;});
  }
  function pause(reason='pause'){
    const result=change(reason,s=>{if(s.location==='match')s.paused=true;});
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();
    return result;
  }
  async function resumeFromGesture(){
    if(!inMatch()||state.panel)return false;
    if(platform.touchControls){
      if(!state.activated&&!platform.standalone&&!fullscreen()&&fullscreenSupported())await enterFullscreen();
      if(fullscreen()||platform.standalone)await lockLandscape();
      change('resume',s=>{s.paused=false;s.activated=true;});
      return true;
    }
    if(pointerLocked()){change('resume',s=>{s.paused=false;s.activated=true;});return true;}
    return requestPointerLock();
  }
  function openPanel(name){
    if(name!==SHELL_PANEL.SETTINGS&&name!==SHELL_PANEL.ADMIN)return;
    change(`panel-open:${name}`,s=>{if(s.location==='match')s.paused=true;s.panel=name;});
    if(!platform.touchControls&&pointerLocked())document.exitPointerLock?.();
  }
  function closePanel(name=''){
    change(`panel-close:${name||'current'}`,s=>{if(!name||s.panel===name)s.panel=SHELL_PANEL.NONE;});
  }
  function leaveToMenu(){
    change('menu',s=>{s.location='menu';s.paused=true;s.panel=SHELL_PANEL.NONE;s.activated=false;});
    if(pointerLocked())document.exitPointerLock?.();
    unlockLandscape();
    if(fullscreen()&&!platform.standalone)void leaveFullscreen();
  }

  function pointerLockChanged(){
    if(platform.touchControls)return;
    if(pointerLocked()){
      if(inMatch()&&state.paused&&!state.panel)change('pointer-lock-acquired',s=>{s.paused=false;s.activated=true;});
      else render('pointer-lock-acquired');
    }else if(inMatch()&&!state.paused)change('pointer-lock-lost',s=>{s.paused=true;});
    else render('pointer-lock-lost');
  }
  function visibilityChanged(){
    if(document.hidden&&inMatch()&&!state.paused)pause('background');
    else render(document.hidden?'background':'foreground');
  }

  function fullscreenChanged(){
    const next=fullscreen();
    if(next===lastFullscreen)return;
    lastFullscreen=next;
    render('fullscreen-change');
  }
  document.addEventListener('fullscreenchange',fullscreenChanged);
  document.addEventListener('webkitfullscreenchange',fullscreenChanged);
  document.addEventListener('pointerlockchange',pointerLockChanged);
  document.addEventListener('pointerlockerror',()=>{if(inMatch())change('pointer-lock-error',s=>{s.paused=true;});onPointerLockUnavailable();});
  document.addEventListener('visibilitychange',visibilityChanged);
  addEventListener('pagehide',()=>{if(inMatch()&&!state.paused)pause('pagehide');});

  function start(){return render('init');}

  return{
    platform,
    get inMatch(){return inMatch();},get paused(){return inMatch()?state.paused:false;},get panel(){return state.panel;},
    get canPlay(){return snapshot().canPlay;},get orientationBlocked(){return snapshot().orientationBlocked;},
    get viewport(){return{...viewport};},get fullscreen(){return fullscreen();},snapshot,render,start,
    enterMatch,pause,resumeFromGesture,openPanel,closePanel,toggleFullscreenFromGesture,leaveToMenu,
  };
}
