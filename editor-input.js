import { GAMEPAD_BUTTON as B } from "./gamepad-input.js?v=2.5.0";
import { clamp } from "./builder-model.js?v=2.5.0";
// Screen navigation is independent of document tools. Editing actions share one dispatcher.
export function createEditorInput(e, active, panels) {
  const pointers = new Map();
  let gesture = null,
    pinch = null;
  const point = (ev) => {
    const r = e.stage.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };
  const stop = (ev) => {
    ev.preventDefault();
    ev.stopImmediatePropagation();
  };
  const overChrome=p=>(e.hud?.layout?.panels||[]).some(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h)||(e.hud?.layout?.buttons||[]).some(r=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h);
  function pan(v,dx,dy){const u=v.span/e.stage.getBoundingClientRect().height,a=e.state.camera==='top'?0:(v.yaw??.65);e.camera.x=v.x-(dx*Math.cos(a)+dy*Math.sin(a))*u;e.camera.z=v.z+(dx*Math.sin(a)-dy*Math.cos(a))*u;}
  function planeAt(p,y){const r=e.gameRuntime.ray(p);if(!r||Math.abs(r.dir.y)<1e-5)return null;const t=(y-r.origin.y)/r.dir.y;return t>0?{x:r.origin.x+r.dir.x*t,z:r.origin.z+r.dir.z*t}:null;}
  function cancel() {
    if(gesture?.roadBefore)e.roadPoints=gesture.roadBefore;e.roadNodeDragging=false;
    e.endBrush?.(false);if(e.dragging){e.gameRuntime.cancelTransform?.();e.cancel();}
    pointers.clear();gesture=null;pinch=null;e.state.lift=e.state.controllerLift=0;e.gameRuntime.pauseInput();
  }
  function down(ev) {
    if(!active()||e.panel||e.state.phase!=='edit')return;
    e.controllerAiming=false;stop(ev);const p=point(ev);if(overChrome(p))return;pointers.set(ev.pointerId,p);e.stage.setPointerCapture(ev.pointerId);
    if(pointers.size>=2){
      if(gesture?.roadBefore)e.roadPoints=gesture.roadBefore;e.roadNodeDragging=false;
      e.endBrush(false);if(e.dragging){e.gameRuntime.cancelTransform?.();e.cancel();}
      const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      gesture=null;pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),...mid,camera:{...e.camera},anchor:e.pick(e.gameRuntime.ray(mid))};return;
    }
    e.pointer=p;
    gesture={id:ev.pointerId,start:p,last:p,moved:false,pan:ev.button===2||ev.button===1||ev.shiftKey,camera:{...e.camera}};
    if(ev.button===0){const h=e.roadHandles?.().find(h=>Math.hypot(h.x-p.x,h.y-p.y)<22);if(h){gesture.roadBefore=e.roadPoints.map(p=>({...p}));if(!Number.isInteger(h.index)){e.roadPoints.splice(Math.ceil(h.index),0,h.point);h.index=Math.ceil(h.index);}gesture.roadIndex=h.index;e.roadNodeDragging=true;return;}}
    if(ev.button===0 && e.gameRuntime.transformPointer?.('down',ev)){gesture.handle=true;return;}
    if(ev.button===0 && ['terrain','paint'].includes(e.state.tool)){
      const hit=e.pick(e.gameRuntime.ray(p));if(hit&&!hit.object){e.beginBrush(hit);gesture.brush=true;}
      else gesture.blocked=true;
    }else if(ev.button===0&&e.state.tool==='place'){
      gesture.placing=true;e.placementHit=e.pick(e.gameRuntime.ray(p));e.update();
      if(e.item?.type==='buildingFootprint'&&!e.footprintStart&&e.valid){e.primary();gesture.footprintStarted=true;}
    }
  }
  function move(ev) {
    if(!active()||e.panel||e.state.phase!=='edit')return;
    const p=point(ev);if(overChrome(p)&&!pinch){if(gesture?.brush){e.endBrush(true);gesture.brush=false;gesture.blocked=true;}return;}e.controllerAiming=false;e.pointer=p;
    if(pointers.has(ev.pointerId)){stop(ev);pointers.set(ev.pointerId,p);}
    if(pinch&&pointers.size>=2){
      const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      e.camera.span=clamp(pinch.camera.span*pinch.distance/Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),8,700);
      pan(pinch.camera,mid.x-pinch.x,mid.y-pinch.y);
      if(pinch.anchor){const q=planeAt(mid,pinch.anchor.y);if(q){e.camera.x+=pinch.anchor.x-q.x;e.camera.z+=pinch.anchor.z-q.z;}}return;
    }
    if(pinch)return;
    if(gesture?.id===ev.pointerId){
      if(gesture.roadIndex!=null){const hit=e.pick(e.gameRuntime.ray(p));if(hit){const q=e.snapPoint(hit.x,hit.z);e.roadPoints[gesture.roadIndex]={x:q.x,z:q.z};e.previewKey='';e.update();}return;}
      if(gesture.handle){e.gameRuntime.transformPointer?.('move',ev);return;}
      gesture.moved ||= Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>6;
      if(gesture.brush){const hit=e.pick(e.gameRuntime.ray(p));if(hit&&!hit.object)e.extendBrush(hit);return;}
      if(gesture.blocked)return;
      if(gesture.placing){e.placementHit=e.pick(e.gameRuntime.ray(p));e.update();return;}
      if(gesture.moved){if(gesture.pan||e.state.camera==='top')pan(gesture.camera,p.x-gesture.start.x,p.y-gesture.start.y);else{e.camera.yaw=(gesture.camera.yaw??.65)-(p.x-gesture.start.x)*.008;e.camera.pitch=clamp((gesture.camera.pitch??.85)+(p.y-gesture.start.y)*.008,.12,1.48);}}
    }else if(ev.pointerType==='mouse'&&e.state.tool==='place'){e.placementHit=e.pick(e.gameRuntime.ray(p));e.update();}
  }
  function up(ev) {
    if(!pointers.has(ev.pointerId))return;
    stop(ev);const g=gesture;pointers.delete(ev.pointerId);
    if(g?.id===ev.pointerId){
      if(g.roadIndex!=null){e.roadNodeDragging=false;e.previewKey='';e.update();}
      else if(g.handle)e.gameRuntime.transformPointer?.('up',ev);
      else if(g.brush)e.endBrush(true);
      else if(!pinch&&!g.pan&&!g.blocked&&!(g.footprintStarted&&!g.moved)&&(!g.moved||g.placing&&e.item?.type==='buildingFootprint'&&e.footprintStart)){
        e.pointer=point(ev);
        if(!g.placing||['road','roadcurve','buildingFootprint'].includes(e.item?.type)){const multi=e.multiSelect;e.multiSelect=multi||!!ev.shiftKey;e.primary();e.multiSelect=multi;}
      }
    }
    gesture=null;if(!pointers.size)pinch=null;
    if(e.stage.hasPointerCapture?.(ev.pointerId))e.stage.releasePointerCapture(ev.pointerId);
  }
  function cancelled(ev){if(!pointers.has(ev.pointerId))return;stop(ev);cancel();}
  function wheel(ev){if(!active()||e.panel||e.state.phase!=='edit')return;stop(ev);const p=point(ev);if(overChrome(p))return;const anchor=e.pick(e.gameRuntime.ray(p));e.camera.span=clamp(e.camera.span*Math.exp(ev.deltaY*.001),8,700);if(anchor){const q=planeAt(p,anchor.y);if(q){e.camera.x+=anchor.x-q.x;e.camera.z+=anchor.z-q.z;}}}
  function key(ev) {
    if (!active()) return;
    if (panels.key(ev) || e.hud.key(ev)) {
      stop(ev);
      return;
    }
    if (e.panel) return;
    const k = ev.key.toLowerCase(),
      cmd = ev.ctrlKey || ev.metaKey;
    let action = null;
    if (cmd && k === "z") action = ev.shiftKey ? "redo" : "undo";
    else if (cmd && k === "s") action = "save";
    else if (cmd && k === "d") action = "copy";
    else if (k === "escape")
      action = e.transaction || e.roadPoints.length ? "cancel" : "menu";
    else if (k === "tab") action = "menu";
    else if (k === "e") action = "place";
    else if (k === "q") action = "pick";
    else if (k === "v") action = "select";
    else if (k === "r") action = "rotate";
    else if (k === "delete" || k === "backspace") action = "erase";
    else if (k === "pageup") action = "raise-object";
    else if (k === "pagedown") action = "lower-object";
    else if (k === "f") action = "focus";
    else if(k === "enter" && e.roadPoints.length>1)action="road-finish";
    if (action) {
      stop(ev);
      if (!ev.repeat) e.action(action);
    }
  }
  function controller(frame, dt) {
    if (!active())return false;
    if(!frame?.connected){if(e.controllerAiming)e.endBrush(false);e.controllerAiming=false;return false;}
    if(!frame.meaningful&&!frame.pressed?.some(Boolean)&&!frame.released?.some(Boolean)&&!frame.held?.some(Boolean)&&!frame.moveX&&!frame.moveY&&!frame.lookX&&!frame.lookY)return true;
    e.controllerAiming=true;
    if (e.hud.controller(frame)) {
      if(e.brushStroke)e.endBrush(false);
      e.state.controllerLift = 0;
      return true;
    }
    const p = frame.pressed || [],
      s = e.state;
    s.controllerLift =
      s.phase === "edit" && !e.panel
        ? (frame.held?.[B.RB] ? 1 : 0) - (frame.held?.[B.LB] ? 1 : 0)
        : 0;
    if (p[B.MENU]) e.action("menu");
    else if (p[B.VIEW]) e.action("playtest");
    if (s.phase === "test") {
      if (p[B.RT]) e.primary();
      return true;
    }
    if(frame.held?.[B.LB]||frame.held?.[B.RB])e.camera.span=clamp(e.camera.span*Math.exp(((frame.held?.[B.LB]?1:0)-(frame.held?.[B.RB]?1:0))*dt),8,700);
    const a=s.camera==='top'?0:e.camera.yaw||0,speed=e.camera.span*.5*dt;
    e.camera.x+=((frame.moveX||0)*Math.cos(a)+(frame.moveY||0)*Math.sin(a))*speed;
    e.camera.z+=(-(frame.moveX||0)*Math.sin(a)+(frame.moveY||0)*Math.cos(a))*speed;
    if(s.camera!=='top'){e.camera.yaw=(e.camera.yaw||0)-(frame.lookX||0)*dt*2;e.camera.pitch=clamp((e.camera.pitch||.85)+(frame.lookY||0)*dt*2,.12,1.48);}
    e.pointer=null;e.placementHit=null;
    if(['terrain','paint'].includes(s.tool)){
      if(frame.held?.[B.RT]){const hit=e.pick(e.gameRuntime.ray(null));if(hit&&!hit.object){if(!e.brushStroke)e.beginBrush(hit);else e.extendBrush(hit);}}
      else if(e.brushStroke)e.endBrush(true);
      if(p[B.A])e.action("place");
    }else if (p[B.RT] || p[B.A]) e.action("place");
    if (p[B.Y]) e.action(e.selected.size ? "edit" : "pick");
    if (p[B.B]) e.action("cancel");
    if (p[B.X]) e.action("rotate");
    if (p[B.DPAD_LEFT]) e.action(e.selected.size ? "nudge:x:-1" : "select");
    if (p[B.DPAD_RIGHT]) e.action(e.selected.size ? "nudge:x:1" : "pick");
    if (p[B.DPAD_UP]) e.action("raise-object");
    if (p[B.DPAD_DOWN]) e.action("lower-object");
    return true;
  }
  const listeners = [
    ["pointerdown", down],
    ["pointermove", move],
    ["pointerup", up],
    ["pointercancel", cancelled],
    ["lostpointercapture", cancelled],
    ["wheel", wheel],
  ];
  for (const [n, f] of listeners)
    e.stage.addEventListener(n, f, { capture: true, passive: false });
  window.addEventListener("keydown", key, true);
  window.addEventListener("blur", cancel);
  window.addEventListener("pagehide", cancel);
  const visibility=()=>{if(globalThis.document?.hidden)cancel();};
  globalThis.document?.addEventListener?.("visibilitychange",visibility);
  return {
    cancel,
    controller,
    destroy() {
      cancel();
      for (const [n, f] of listeners) e.stage.removeEventListener(n, f, true);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pagehide", cancel);
      globalThis.document?.removeEventListener?.("visibilitychange",visibility);
    },
  };
}
