import { createPointerSessions } from './pointer-sessions.js?v=2.11.0';
import { createCanvasInputOwner } from './canvas-input.js?v=2.11.0';

// Holds/drags use the same context barrier as canvas hits and keyboard focus.
export function createUiGestures({
  root=globalThis.document?.body,getScope=()=>'',ownerDocument=root?.ownerDocument||globalThis.document,
  eventTarget=globalThis,inputOwner=null,
}={}) {
  const bindings=new Set(),active=new Set(),ownsInput=!inputOwner;
  const owner=inputOwner||createCanvasInputOwner({getContext:getScope});
  const raf=eventTarget.requestAnimationFrame?.bind(eventTarget)||((fn)=>setTimeout(()=>fn(Date.now()),16));
  const caf=eventTarget.cancelAnimationFrame?.bind(eventTarget)||clearTimeout;
  let frame=0,observer=null,unsubscribeGraph=null;
  function usable(binding){
    const el=binding.target;
    return el.isConnected!==false&&!el.disabled&&!el.closest?.('.hide,[hidden],[inert],[aria-disabled="true"],:disabled')&&(!el.getClientRects||el.getClientRects().length>0);
  }
  function valid(binding){const state=binding.sessions.current;return !!state&&usable(binding)&&state.scope===getScope()&&owner.valid(state.ownership);}
  function validate(){owner.sync('gesture-scope');for(const binding of [...active])if(!valid(binding))binding.sessions.cancelAll();}
  function watch(){
    if(unsubscribeGraph||observer)return;
    if(typeof ownerDocument?.subscribe==='function')unsubscribeGraph=ownerDocument.subscribe(validate);
    else if(root?.nodeType===1&&typeof globalThis.MutationObserver==='function'){
      observer=new globalThis.MutationObserver(validate);
      observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','inert','disabled','aria-disabled']});
    }
  }
  function tick(now){
    frame=0;validate();
    for(const binding of [...active]){
      try{binding.handlers.tick?.(binding.sessions.current,now);}
      catch(error){binding.sessions.cancelAll();if(typeof eventTarget.reportError==='function')eventTarget.reportError(error);else setTimeout(()=>{throw error;},0);}
    }
    if([...active].some(b=>b.handlers.tick))frame=raf(tick);
  }
  function deactivate(binding){
    active.delete(binding);
    if(!active.size){observer?.disconnect();observer=null;unsubscribeGraph?.();unsubscribeGraph=null;if(frame)caf(frame);frame=0;}
  }
  function bind(target,handlers){
    const binding={target,handlers,sessions:null,listeners:[]};
    const sessions=createPointerSessions(target,{limit:1,onCancel:state=>{
      owner.cancel(state.id,'gesture-cancel');deactivate(binding);handlers.cancel?.(state);
    }});
    binding.sessions=sessions;
    const listen=(type,fn)=>{target.addEventListener(type,fn);binding.listeners.push(()=>target.removeEventListener(type,fn));};
    listen('pointerdown',event=>{
      if((event.pointerType==='mouse'&&event.button!==0)||sessions.size||!usable(binding))return;
      const ownership=owner.begin(event,{target});if(!ownership||!owner.valid(ownership))return;
      event.preventDefault();event.stopPropagation();
      const state=sessions.begin(event,{scope:getScope(),ownership});if(!state)return;
      active.add(binding);watch();owner.focus(target);
      try{handlers.start?.(state,event);}catch(error){sessions.cancelAll();throw error;}
      // A start callback can open another layer; cancel before a held action can
      // tick or commit in that newly active context.
      if(!valid(binding)){sessions.cancelAll();return;}
      if(handlers.tick&&!frame)frame=raf(tick);
    });
    listen('pointermove',event=>{const state=sessions.move(event);if(!state)return;event.preventDefault();if(!valid(binding)){sessions.cancelAll();return;}try{handlers.move?.(state,event);}catch(error){sessions.cancelAll();throw error;}});
    listen('pointerup',event=>{
      if(!sessions.get(event.pointerId))return;event.preventDefault();
      if(!valid(binding)){sessions.cancelAll();return;}
      const state=sessions.end(event);owner.end(event);deactivate(binding);handlers.finish?.(state,event);
    });
    for(const type of ['pointercancel','lostpointercapture'])listen(type,event=>sessions.cancel(event.pointerId));
    bindings.add(binding);
    return ()=>{sessions.cancelAll();for(const remove of binding.listeners)remove();bindings.delete(binding);};
  }
  function cancel(reason='cancel'){for(const binding of [...active])binding.sessions.cancelAll();}
  const unsubscribeOwner=owner.subscribe(cancel);
  const visibility=()=>{if(ownerDocument?.hidden)cancel('background');};
  const listeners=[[eventTarget,'blur',cancel],[eventTarget,'pagehide',cancel],[eventTarget,'resize',cancel],[eventTarget,'orientationchange',cancel],[ownerDocument,'visibilitychange',visibility]];
  for(const [target,type,fn] of listeners)target?.addEventListener?.(type,fn);
  return {
    bind,cancel,get active(){return active.size;},get inputOwner(){return owner;},
    destroy(){cancel();unsubscribeOwner();for(const b of bindings)for(const remove of b.listeners)remove();bindings.clear();for(const [target,type,fn] of listeners)target?.removeEventListener?.(type,fn);if(ownsInput)owner.destroy();},
  };
}
