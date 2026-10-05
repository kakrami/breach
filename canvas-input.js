// One input context owns a contact from press through release/click. A menu
// transition invalidates the contact, including when the previous menu reopens.
export function createCanvasInputOwner({getContext=()=>null,onCancel=()=>{}}={}) {
  let context,initialized=false,epoch=0,lastReleased=null,destroyed=false;
  const pointers=new Map(),released=new Map(),listeners=new Set(),focusMemory=new WeakMap();
  function notify(reason){const update={reason,context,epoch};onCancel(update);for(const listener of [...listeners])listener(update);}
  function sync(reason='context'){
    if(destroyed)return false;
    const next=getContext();
    if(!initialized){initialized=true;context=next;return false;}
    if(Object.is(next,context))return false;
    context=next;epoch++;
    for(const state of pointers.values())state.cancelled=true;
    notify(reason);return true;
  }
  function valid(value){sync();const state=typeof value==='object'?value:pointers.get(value)||released.get(value);return !!state&&!state.cancelled&&state.epoch===epoch&&Object.is(state.context,context);}
  function rememberRelease(state){
    if(!state)return;
    released.set(state.id,state);lastReleased=state;
    // Browsers may use a new pointer ID for every touch. Keep only recent click
    // barriers, never an unbounded history of ended contacts.
    while(released.size>32)released.delete(released.keys().next().value);
  }
  function begin(event,{target=event?.target}={}){
    sync();if(destroyed||event?.pointerId==null)return null;
    const existing=pointers.get(event.pointerId);if(existing)return existing;
    released.delete(event.pointerId);lastReleased=null;
    const state={id:event.pointerId,context,epoch,target,cancelled:false};
    pointers.set(state.id,state);return state;
  }
  function end(event){
    sync();const id=typeof event==='number'?event:event?.pointerId,state=pointers.get(id)||released.get(id);
    if(!state)return null;
    pointers.delete(id);rememberRelease(state);return {...state,valid:valid(state)};
  }
  function cancel(id,reason='cancel'){
    const state=pointers.get(id);if(!state)return false;
    state.cancelled=true;state.reason=reason;pointers.delete(id);rememberRelease(state);return true;
  }
  function cancelAll(reason='cancel'){
    epoch++;
    for(const state of pointers.values()){state.cancelled=true;state.reason=reason;rememberRelease(state);}
    pointers.clear();notify(reason);
  }
  function allowsClick(event){
    sync();
    // Programmatic/keyboard/controller activation has no physical contact.
    if(!event?.detail)return true;
    const id=event.pointerId,state=id!=null&&id>=0?released.get(id)||pointers.get(id):lastReleased;
    return !state||valid(state);
  }
  function focus(widget){if(!widget)return false;try{widget.focus({preventScroll:true});return true;}catch{try{widget.focus();return true;}catch{return false;}}}
  return {
    sync,begin,end,cancel,cancelAll,valid,allowsClick,focus,
    get:id=>pointers.get(id)||released.get(id),
    get context(){sync();return context;},get epoch(){return epoch;},get active(){return pointers.size;},
    subscribe(listener){listeners.add(listener);return()=>listeners.delete(listener);},
    rememberFocus(surface,widget){if(surface&&widget)focusMemory.set(surface,widget);},
    rememberedFocus:surface=>surface&&focusMemory.get(surface),
    destroy(){cancelAll('destroy');destroyed=true;listeners.clear();pointers.clear();released.clear();lastReleased=null;},
  };
}

// Canvas-only native interaction guards. Do not stop pointer delivery: shooting,
// brush holds, sliders and simultaneous movement/look still use Pointer Events.
// Apple documents -webkit-user-select and -webkit-touch-callout in Safari CSS
// Reference; the real canvas/root stylesheet supplies both as a first barrier.
export function installCanvasInteractionGuards({
  canvases=[],ownerDocument=globalThis.document,eventTarget=globalThis,inputOwner=null,onCancel=()=>{},
}={}) {
  const targets=new Set(canvases.filter(Boolean)),removers=[];
  const owned=event=>{
    const path=event.composedPath?.()||[event.target];
    return path.some(node=>targets.has(node))||[...targets].some(canvas=>canvas.contains?.(event.target));
  };
  const listen=(target,type,fn,options)=>{if(!target?.addEventListener)return;target.addEventListener(type,fn,options);removers.push(()=>target.removeEventListener(type,fn,options));};
  const suppress=event=>{if(!owned(event))return;if(event.cancelable!==false)event.preventDefault();event.stopPropagation?.();};
  for(const type of ['selectstart','contextmenu','dragstart','gesturestart','gesturechange','gestureend'])listen(ownerDocument,type,suppress,{capture:true,passive:false});
  // Explicitly non-passive for WebKit: document-level touch listeners otherwise
  // default to passive. Prevent only native scrolling/zoom, not pointer events.
  const suppressTouch=event=>{if(owned(event)&&event.cancelable!==false)event.preventDefault();};
  for(const type of ['touchstart','touchmove'])listen(ownerDocument,type,suppressTouch,{capture:true,passive:false});
  const cancel=reason=>{inputOwner?.cancelAll(reason);onCancel(reason);};
  for(const type of ['blur','pagehide','resize','orientationchange'])listen(eventTarget,type,()=>cancel(type));
  listen(ownerDocument,'visibilitychange',()=>{if(ownerDocument.hidden)cancel('background');});
  // Pointer cancellation is routed by its ID, so one cancelled finger does not
  // end another finger's movement/fire session.
  for(const type of ['pointercancel','lostpointercapture'])listen(ownerDocument,type,event=>{if(owned(event))inputOwner?.cancel(event.pointerId,type);},{capture:true});
  return {destroy(){for(const remove of removers)remove();},owns:owned};
}
