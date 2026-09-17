// Pointer identity and capture belong to a gesture, never to the next screen.
export function createPointerSessions(target, {limit=Infinity,onCancel=()=>{}}={}) {
  const sessions=new Map();
  function release(state){try{if(target.hasPointerCapture?.(state.id))target.releasePointerCapture(state.id);}catch{}}
  function begin(event,data={}){
    if(sessions.has(event.pointerId)||sessions.size>=limit)return null;
    const state={...data,id:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,distance:0,event};
    sessions.set(state.id,state);
    try{if(data.capture!==false&&event.isTrusted)target.setPointerCapture?.(state.id);}catch{}
    return state;
  }
  function move(event){
    const state=sessions.get(event.pointerId);if(!state)return null;
    state.dx=event.clientX-state.x;state.dy=event.clientY-state.y;
    state.x=event.clientX;state.y=event.clientY;state.event=event;
    state.distance=Math.max(state.distance,Math.hypot(state.x-state.startX,state.y-state.startY));
    return state;
  }
  function end(event){const state=move(event);if(!state)return null;sessions.delete(state.id);release(state);return state;}
  function cancel(id){const state=sessions.get(id);if(!state)return;sessions.delete(id);release(state);onCancel(state);}
  function cancelAll(){for(const id of [...sessions.keys()])cancel(id);}
  return {begin,move,end,cancel,cancelAll,get:id=>sessions.get(id),get current(){return sessions.values().next().value;},get size(){return sessions.size;}};
}
