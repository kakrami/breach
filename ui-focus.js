import { createCanvasInputOwner } from './canvas-input.js?v=2.19.0';

// Keyboard, controller and pointer focus all point at the graph's activeElement.
// The owner document may be a native widget graph or a real document.
export function createUiFocusScope({
  root,surfaces=[],getSurface,onKeyboard=()=>{},ownerDocument=root?.ownerDocument||globalThis.document,
  eventTarget=globalThis,inputOwner=null,getStyle=null,onNavigate=null,
  isTextScope=surface=>surface?.id==='chatComposer'||surface?.id==='gameTextEditor',
}) {
  const ownsInput=!inputOwner,owner=inputOwner||createCanvasInputOwner({getContext:getSurface});
  let current=null,syncing=false,destroyed=false,retryFrame=0;
  const raf=eventTarget.requestAnimationFrame?.bind(eventTarget)||((fn)=>setTimeout(fn,0));
  const caf=eventTarget.cancelAnimationFrame?.bind(eventTarget)||clearTimeout;
  const surfaceList=()=>surfaces.filter(Boolean);
  const usable=el=>{
    if(!el||el.isConnected===false||el.disabled||el.closest?.('.hide,[hidden],[inert],[aria-disabled="true"]'))return false;
    if(el.getClientRects&&!el.getClientRects().length)return false;
    const style=getStyle?.(el)||el.style;
    return style?.visibility!=='hidden'&&style?.display!=='none';
  };
  const controls=surface=>[...(surface?.querySelectorAll?.('button,a[href],[tabindex]')||[])].filter(el=>el.tabIndex>=0&&usable(el));
  function focusControl(el){if(!usable(el)||!owner.focus(el))return false;el.scrollIntoView?.({block:'nearest',inline:'nearest'});return true;}
  function focusSurface(surface){
    const saved=owner.rememberedFocus(surface),next=surface?.contains(saved)&&usable(saved)?saved:controls(surface)[0];
    return next?focusControl(next):false;
  }
  function sync(allowRetry=true){
    if(syncing||destroyed)return current;
    syncing=true;
    try{
      const next=getSurface(),previous=current,active=ownerDocument?.activeElement;
      if(previous?.contains(active))owner.rememberFocus(previous,active);
      current=next;owner.sync('surface');
      for(const surface of surfaceList()){
        // A nested modal keeps its ancestors available as layout containers;
        // focus containment below still excludes their sibling controls.
        const inert=!!next&&surface!==next&&!surface.contains(next);
        if(surface.inert!==inert)surface.inert=inert;
      }
      if(next&&(!next.contains(active)||!usable(active))&&!focusSurface(next)&&allowRetry!==false&&!retryFrame){
        // A newly shown graph surface can be notified before the next canvas
        // layout has assigned its rectangles. Retry after that frame once.
        retryFrame=raf(()=>{retryFrame=0;sync(false);});
      }
      return current;
    }finally{syncing=false;}
  }
  function keydown(event){
    const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
    if(event.defaultPrevented||event.altKey||event.ctrlKey||event.metaKey||event.key!=='Tab'&&!direction)return;
    sync();if(!current)return;
    if(direction){
      if(!onNavigate||isTextScope(current)||event.target?.closest?.('[data-game-control="slider"],[data-game-control="stepper"],[data-game-control="cycle"],input,textarea,select,[contenteditable="true"]'))return;
      onKeyboard();onNavigate(...direction,event);event.preventDefault();event.stopImmediatePropagation();return;
    }
    onKeyboard();const list=controls(current);
    event.preventDefault();event.stopImmediatePropagation();
    if(!list.length)return;
    const index=list.indexOf(ownerDocument.activeElement),next=index<0?(event.shiftKey?list.length-1:0):(index+(event.shiftKey?-1:1)+list.length)%list.length;
    focusControl(list[next]);
  }
  function focusin(event){
    if(current?.contains(event.target)&&usable(event.target))owner.rememberFocus(current,event.target);
    else if(current&&!syncing)focusSurface(current);
  }
  const pointerdown=event=>owner.begin(event);
  const pointerup=event=>owner.end(event);
  const pointercancel=event=>owner.cancel(event.pointerId,event.type);
  function click(event){if(!owner.allowsClick(event)){event.preventDefault();event.stopImmediatePropagation();}}
  const listeners=[['pointerdown',pointerdown],['pointerup',pointerup],['pointercancel',pointercancel],['lostpointercapture',pointercancel],['click',click],['keydown',keydown]];
  for(const [type,handler] of listeners)ownerDocument?.addEventListener(type,handler,true);
  const clearPointers=()=>owner.cancelAll('blur');
  eventTarget.addEventListener?.('blur',clearPointers);
  root.addEventListener('focusin',focusin);
  // Graph state notifications replace DOM mutation observation. DOM support is
  // retained for standalone legacy shells only, never applied to graph widgets.
  let observer=null;
  const unsubscribe=typeof ownerDocument?.subscribe==='function'?ownerDocument.subscribe(sync):null;
  if(typeof ownerDocument?.subscribe!=='function'&&typeof globalThis.MutationObserver==='function'){
    observer=new globalThis.MutationObserver(sync);
    for(const surface of surfaceList())if(surface.nodeType===1)observer.observe(surface,{attributes:true,attributeFilter:['class','hidden','inert','disabled']});
  }
  queueMicrotask(sync);
  return {
    sync,focus:focusControl,get current(){return current;},get inputOwner(){return owner;},
    destroy(){
      destroyed=true;if(retryFrame)caf(retryFrame);retryFrame=0;unsubscribe?.();observer?.disconnect();root.removeEventListener('focusin',focusin);
      for(const [type,handler] of listeners)ownerDocument?.removeEventListener(type,handler,true);
      eventTarget.removeEventListener?.('blur',clearPointers);
      for(const surface of surfaceList())surface.inert=false;
      if(ownsInput)owner.destroy();
    },
  };
}
