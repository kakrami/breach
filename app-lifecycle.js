export const APP_SCREEN = Object.freeze({
  BOOT:'boot',
  MENU:'menu',
  MATCH:'match',
});

export const APP_OVERLAY = Object.freeze({
  NONE:'',
  SETTINGS:'settings',
  ADMIN:'admin',
});

export function createAppSession({requireLandscape=false,onChange=()=>{}}={}){
  const state={screen:APP_SCREEN.BOOT,paused:false,overlay:APP_OVERLAY.NONE,portrait:false};

  const snapshot=()=>{
    const inMatch=state.screen===APP_SCREEN.MATCH;
    const orientationBlocked=inMatch&&requireLandscape&&state.portrait&&!state.paused&&state.overlay===APP_OVERLAY.NONE;
    const interactive=inMatch&&!state.paused&&state.overlay===APP_OVERLAY.NONE&&!orientationBlocked;
    return Object.freeze({...state,inMatch,orientationBlocked,interactive,entered:state.screen!==APP_SCREEN.BOOT});
  };
  const update=(reason,mutate)=>{
    const before=`${state.screen}|${state.paused}|${state.overlay}|${state.portrait}`;
    mutate(state);
    if(before!==`${state.screen}|${state.paused}|${state.overlay}|${state.portrait}`)onChange(snapshot(),reason);
  };

  return {
    get screen(){return state.screen;},
    get entered(){return state.screen!==APP_SCREEN.BOOT;},
    get inMatch(){return state.screen===APP_SCREEN.MATCH;},
    get paused(){return state.paused;},
    get overlay(){return state.overlay;},
    get orientationBlocked(){return snapshot().orientationBlocked;},
    get interactive(){return snapshot().interactive;},
    snapshot,
    enterMenu(){update('menu',s=>{s.screen=APP_SCREEN.MENU;s.paused=false;s.overlay=APP_OVERLAY.NONE;});},
    enterMatch({paused=false}={}){update('match',s=>{s.screen=APP_SCREEN.MATCH;s.paused=!!paused;s.overlay=APP_OVERLAY.NONE;});},
    leaveMatch(){update('leave',s=>{s.screen=APP_SCREEN.MENU;s.paused=false;s.overlay=APP_OVERLAY.NONE;});},
    pause(reason='pause'){update(reason,s=>{if(s.screen===APP_SCREEN.MATCH)s.paused=true;});},
    resume(){update('resume',s=>{if(s.screen===APP_SCREEN.MATCH&&s.overlay===APP_OVERLAY.NONE)s.paused=false;});},
    setPortrait(portrait){update('orientation',s=>{s.portrait=!!portrait;});},
    openOverlay(name){if(!Object.values(APP_OVERLAY).includes(name)||!name)return;update(`overlay-open:${name}`,s=>{if(s.screen===APP_SCREEN.MATCH)s.paused=true;s.overlay=name;});},
    closeOverlay(name=''){update(`overlay-close:${name||'current'}`,s=>{if(!name||s.overlay===name)s.overlay=APP_OVERLAY.NONE;});},
    background(){update('background',s=>{if(s.screen===APP_SCREEN.MATCH)s.paused=true;});},
  };
}
