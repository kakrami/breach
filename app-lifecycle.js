export const APP_PHASE = Object.freeze({
  BOOT:'boot',
  LOBBY:'lobby',
  PLAYING:'playing',
  PAUSED:'paused',
  ORIENTATION:'orientation',
});

export const APP_OVERLAY = Object.freeze({
  NONE:'',
  SETTINGS:'settings',
  ADMIN:'admin',
});

export function createAppLifecycle({requireLandscape=false,onChange=()=>{}}={}){
  const state={
    entered:false,
    inMatch:false,
    pauseRequested:false,
    orientationBlocked:false,
    overlay:APP_OVERLAY.NONE,
  };

  const phase=()=>{
    if(!state.entered)return APP_PHASE.BOOT;
    if(!state.inMatch)return APP_PHASE.LOBBY;
    if(requireLandscape&&state.orientationBlocked)return APP_PHASE.ORIENTATION;
    if(state.pauseRequested||state.overlay!==APP_OVERLAY.NONE)return APP_PHASE.PAUSED;
    return APP_PHASE.PLAYING;
  };

  const snapshot=()=>Object.freeze({...state,phase:phase(),interactive:phase()===APP_PHASE.PLAYING&&state.overlay===APP_OVERLAY.NONE});
  const notify=(reason)=>onChange(snapshot(),reason);
  const update=(reason,mutate)=>{
    const before=[state.entered,state.inMatch,state.pauseRequested,state.orientationBlocked,state.overlay];
    mutate(state);
    if(before[0]!==state.entered||before[1]!==state.inMatch||before[2]!==state.pauseRequested||before[3]!==state.orientationBlocked||before[4]!==state.overlay)notify(reason);
  };

  return {
    get entered(){return state.entered;},
    get inMatch(){return state.inMatch;},
    get paused(){return state.pauseRequested;},
    get orientationBlocked(){return requireLandscape&&state.orientationBlocked;},
    get overlay(){return state.overlay;},
    get phase(){return phase();},
    get interactive(){return phase()===APP_PHASE.PLAYING&&state.overlay===APP_OVERLAY.NONE;},
    snapshot,
    enter(){update('enter',s=>{s.entered=true;});},
    startMatch(){update('match-start',s=>{s.entered=true;s.inMatch=true;s.pauseRequested=false;s.overlay=APP_OVERLAY.NONE;});},
    leaveMatch(){update('match-leave',s=>{s.inMatch=false;s.pauseRequested=false;s.overlay=APP_OVERLAY.NONE;});},
    pause(reason='pause'){update(reason,s=>{if(s.inMatch)s.pauseRequested=true;});},
    resume(){update('resume',s=>{if(s.inMatch&&!s.orientationBlocked&&s.overlay===APP_OVERLAY.NONE)s.pauseRequested=false;});},
    setOrientationBlocked(blocked){update('orientation',s=>{s.orientationBlocked=requireLandscape&&!!blocked;if(s.orientationBlocked&&s.inMatch)s.pauseRequested=true;});},
    openOverlay(name){if(!Object.values(APP_OVERLAY).includes(name)||!name)return;update(`overlay-open:${name}`,s=>{s.overlay=name;if(s.inMatch)s.pauseRequested=true;});},
    closeOverlay(name=''){update(`overlay-close:${name||'current'}`,s=>{if(!name||s.overlay===name)s.overlay=APP_OVERLAY.NONE;});},
    background(){update('background',s=>{if(s.inMatch)s.pauseRequested=true;});},
  };
}
