import { createPointerSessions } from './pointer-sessions.js?v=1.46.0';

// Custom drags/holds only. Buttons, SVG hit testing and scrolling stay native.
export function createUiGestures({root=document.body,getScope=()=>''}={}) {
  const bindings=new Set(),active=new Set();
  let frame=0;
  function usable(binding){
    const el=binding.target;
    return el.isConnected&&!el.disabled&&!el.closest('.hide,[hidden],[inert],[aria-disabled="true"],:disabled')&&el.getClientRects().length>0;
  }
  function valid(binding){return usable(binding)&&binding.sessions.current?.scope===getScope();}
  function validate(){for(const binding of [...active])if(!valid(binding))binding.sessions.cancelAll();}
  const observer=new MutationObserver(validate);
  function tick(now){
    frame=0;validate();
    for(const binding of active)binding.handlers.tick?.(binding.sessions.current,now);
    if([...active].some(b=>b.handlers.tick))frame=requestAnimationFrame(tick);
  }
  function deactivate(binding){
    active.delete(binding);
    if(!active.size){observer.disconnect();if(frame)cancelAnimationFrame(frame);frame=0;}
  }
  function bind(target,handlers){
    const binding={target,handlers,sessions:null,listeners:[]};
    const sessions=createPointerSessions(target,{limit:1,onCancel:state=>{deactivate(binding);handlers.cancel?.(state);}});
    binding.sessions=sessions;
    const listen=(type,fn)=>{target.addEventListener(type,fn);binding.listeners.push(()=>target.removeEventListener(type,fn));};
    listen('pointerdown',event=>{
      if((event.pointerType==='mouse'&&event.button!==0)||active.size||!usable(binding))return;
      event.preventDefault();event.stopPropagation();
      const state=sessions.begin(event,{scope:getScope()});if(!state)return;
      active.add(binding);observer.observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden','inert','disabled','aria-disabled']});
      target.focus?.({preventScroll:true});handlers.start?.(state,event);
      if(handlers.tick&&!frame)frame=requestAnimationFrame(tick);
    });
    listen('pointermove',event=>{const state=sessions.move(event);if(!state)return;event.preventDefault();if(!valid(binding)){sessions.cancelAll();return;}handlers.move?.(state,event);});
    listen('pointerup',event=>{if(!sessions.get(event.pointerId))return;event.preventDefault();if(!valid(binding)){sessions.cancelAll();return;}const state=sessions.end(event);deactivate(binding);handlers.finish?.(state,event);});
    for(const type of ['pointercancel','lostpointercapture'])listen(type,event=>sessions.cancel(event.pointerId));
    bindings.add(binding);
    return ()=>{sessions.cancelAll();for(const remove of binding.listeners)remove();bindings.delete(binding);};
  }
  function cancel(){for(const binding of [...active])binding.sessions.cancelAll();}
  const visibility=()=>{if(document.hidden)cancel();};
  const listeners=[[globalThis,'blur',cancel],[globalThis,'pagehide',cancel],[globalThis,'resize',cancel],[document,'visibilitychange',visibility]];
  for(const [target,type,fn] of listeners)target.addEventListener(type,fn);
  return {bind,cancel,get active(){return active.size;},destroy(){cancel();for(const b of bindings)for(const remove of b.listeners)remove();bindings.clear();for(const [target,type,fn] of listeners)target.removeEventListener(type,fn);}};
}
