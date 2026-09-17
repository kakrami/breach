// The session's active surface is shared by keyboard focus and controller routing.
export function createUiFocusScope({root,surfaces,getSurface,onKeyboard=()=>{}}) {
  let current=null;
  const pointerSurfaces=new Map();
  let releasedPointer=null;
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
  // A pointer gesture belongs to the surface where it began. Canvas release
  // handlers may open a menu before the browser dispatches the native click.
  // Keep that click from activating a control on the newly opened surface.
  function pointerdown(event){releasedPointer=null;pointerSurfaces.set(event.pointerId,getSurface());}
  function pointerup(event){
    releasedPointer=pointerSurfaces.has(event.pointerId)?{id:event.pointerId,surface:pointerSurfaces.get(event.pointerId)}:null;
    pointerSurfaces.delete(event.pointerId);
  }
  function pointercancel(event){pointerSurfaces.delete(event.pointerId);if(releasedPointer?.id===event.pointerId)releasedPointer=null;}
  function click(event){
    const origin=releasedPointer;releasedPointer=null;
    if(!event.detail||!origin)return;
    if(typeof event.pointerId==='number'&&event.pointerId!==origin.id)return;
    if(origin.surface!==getSurface()){event.preventDefault();event.stopImmediatePropagation();}
  }
  function clearPointers(){pointerSurfaces.clear();releasedPointer=null;}
  const pointerListeners=[['pointerdown',pointerdown],['pointerup',pointerup],['pointercancel',pointercancel],['click',click]];
  for(const [type,handler] of pointerListeners)document.addEventListener(type,handler,true);
  globalThis.addEventListener('blur',clearPointers);
  const observer=new MutationObserver(sync);
  // Surface visibility changes, not rendering details, drive modality.
  for(const surface of surfaces)observer.observe(surface,{attributes:true,attributeFilter:['class','hidden']});
  document.addEventListener('keydown',keydown,true);root.addEventListener('focusin',focusin);
  queueMicrotask(sync);
  return {sync,destroy(){observer.disconnect();document.removeEventListener('keydown',keydown,true);root.removeEventListener('focusin',focusin);for(const [type,handler] of pointerListeners)document.removeEventListener(type,handler,true);globalThis.removeEventListener('blur',clearPointers);clearPointers();for(const surface of surfaces)surface.inert=false;}};
}
