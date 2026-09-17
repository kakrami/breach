// The session's active surface is shared by keyboard focus and controller routing.
export function createUiFocusScope({root,surfaces,getSurface,onKeyboard=()=>{}}) {
  let current=null;
  const remembered=new WeakMap();
  const usable=el=>el&&!el.disabled&&!el.closest('.hide,[hidden],[inert],[aria-disabled="true"]')&&el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden';
  const controls=surface=>[...surface.querySelectorAll('button,a[href],[tabindex]')].filter(el=>el.tabIndex>=0&&usable(el));
  function focusSurface(surface){
    const saved=remembered.get(surface),next=usable(saved)?saved:controls(surface)[0];
    next?.focus({preventScroll:true});
  }
  function sync(){
    const next=getSurface(),changed=next!==current,previous=current;
    current=next;
    for(const surface of surfaces){const inert=!!next&&surface!==next&&!surface.contains(next);if(surface.inert!==inert)surface.inert=inert;}
    if(changed&&previous&&next&&!next.contains(document.activeElement))focusSurface(next);
  }
  function keydown(event){
    if(event.key!=='Tab')return;
    sync();if(!current)return;
    onKeyboard();const list=controls(current);
    event.preventDefault();event.stopImmediatePropagation();
    if(!list.length)return;
    const index=list.indexOf(document.activeElement),next=index<0?(event.shiftKey?list.length-1:0):(index+(event.shiftKey?-1:1)+list.length)%list.length;
    list[next].focus();
  }
  function focusin(event){if(current?.contains(event.target))remembered.set(current,event.target);}
  const observer=new MutationObserver(sync);
  // Surface visibility changes, not rendering details, drive modality.
  for(const surface of surfaces)observer.observe(surface,{attributes:true,attributeFilter:['class','hidden']});
  document.addEventListener('keydown',keydown,true);root.addEventListener('focusin',focusin);
  queueMicrotask(sync);
  return {sync,destroy(){observer.disconnect();document.removeEventListener('keydown',keydown,true);root.removeEventListener('focusin',focusin);for(const surface of surfaces)surface.inert=false;}};
}
