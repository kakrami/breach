export const GAMEPAD_BUTTON = Object.freeze({
  A:0,B:1,X:2,Y:3,LB:4,RB:5,LT:6,RT:7,VIEW:8,MENU:9,LS:10,RS:11,
  DPAD_UP:12,DPAD_DOWN:13,DPAD_LEFT:14,DPAD_RIGHT:15,HOME:16,
});

const EMPTY_BUTTONS=Object.freeze(Array.from({length:18},()=>0));
const EMPTY_HELD=Object.freeze(Array.from({length:18},()=>false));
const EMPTY_FRAME=Object.freeze({
  connected:false,index:-1,id:'',mapping:'',moveX:0,moveY:0,lookX:0,lookY:0,rawMoveX:0,rawMoveY:0,rawLookX:0,rawLookY:0,
  buttons:EMPTY_BUTTONS,held:EMPTY_HELD,pressed:EMPTY_HELD,released:EMPTY_HELD,meaningful:false,
});

function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
function buttonValue(button){
  if(button==null)return 0;
  if(typeof button==='number')return clamp(Number(button)||0,0,1);
  const value=Number(button.value);
  if(Number.isFinite(value))return clamp(value,0,1);
  return button.pressed?1:0;
}
function radialDeadzone(x,y,deadzone,curve=1){
  x=clamp(Number(x)||0,-1,1);y=clamp(Number(y)||0,-1,1);
  const length=Math.hypot(x,y);
  if(length<=deadzone)return{x:0,y:0,length:0};
  const normalized=Math.min(1,(length-deadzone)/(1-deadzone));
  const shaped=Math.pow(normalized,curve),scale=shaped/Math.max(length,1e-6);
  return{x:x*scale,y:y*scale,length:shaped};
}
function candidateScore(gamepad){
  if(!gamepad?.connected)return-1;
  const axes=Number(gamepad.axes?.length)||0,buttons=Number(gamepad.buttons?.length)||0;
  if(axes<4||buttons<10)return-1;
  return(gamepad.mapping==='standard'?1000:0)+Math.min(buttons,20)*2+Math.min(axes,8);
}
function safeGamepads(){
  try{return typeof navigator!=='undefined'&&typeof navigator.getGamepads==='function'?[...navigator.getGamepads()].filter(Boolean):[];}catch{return[];}
}

export function createGamepadInput({stickDeadzone=.16,lookDeadzone=.14,lookCurve=1.45,buttonThreshold=.5}={}){
  stickDeadzone=clamp(Number(stickDeadzone)||.16,.02,.45);
  lookDeadzone=clamp(Number(lookDeadzone)||.14,.02,.45);
  lookCurve=clamp(Number(lookCurve)||1.45,1,2.5);
  buttonThreshold=clamp(Number(buttonThreshold)||.5,.2,.9);
  let preferredIndex=null,lastKey='',lastHeld=Array.from({length:18},()=>false),lastConnected=false,destroyed=false;

  const connected=e=>{if(Number.isInteger(e?.gamepad?.index))preferredIndex=e.gamepad.index;};
  const disconnected=e=>{if(e?.gamepad?.index===preferredIndex)preferredIndex=null;};
  if(typeof window!=='undefined'){
    window.addEventListener?.('gamepadconnected',connected);
    window.addEventListener?.('gamepaddisconnected',disconnected);
  }

  function selectGamepad(){
    const pads=safeGamepads();
    if(preferredIndex!=null){const preferred=pads.find(p=>p.index===preferredIndex&&candidateScore(p)>=0);if(preferred)return preferred;}
    let best=null,bestScore=-1;
    for(const pad of pads){const score=candidateScore(pad);if(score>bestScore){best=pad;bestScore=score;}}
    if(best)preferredIndex=best.index;
    return best;
  }
  function hasConnected(){return!!selectGamepad();}
  function reset(){lastHeld.fill(false);lastKey='';lastConnected=false;}
  function poll(){
    if(destroyed)return EMPTY_FRAME;
    const pad=selectGamepad();
    if(!pad){lastHeld.fill(false);lastKey='';lastConnected=false;return EMPTY_FRAME;}
    const key=`${pad.index}:${pad.id||'gamepad'}`;
    if(key!==lastKey||!lastConnected){lastHeld.fill(false);lastKey=key;lastConnected=true;}
    const buttons=Array.from({length:18},(_,i)=>buttonValue(pad.buttons?.[i]));
    const held=buttons.map(value=>value>=buttonThreshold),pressed=held.map((value,i)=>value&&!lastHeld[i]),released=held.map((value,i)=>!value&&lastHeld[i]);
    lastHeld=held.slice();
    const rawMoveX=clamp(Number(pad.axes?.[0])||0,-1,1),rawMoveY=clamp(Number(pad.axes?.[1])||0,-1,1);
    const rawLookX=clamp(Number(pad.axes?.[2])||0,-1,1),rawLookY=clamp(Number(pad.axes?.[3])||0,-1,1);
    const move=radialDeadzone(rawMoveX,rawMoveY,stickDeadzone,1),look=radialDeadzone(rawLookX,rawLookY,lookDeadzone,lookCurve);
    const meaningful=move.length>.015||look.length>.015||buttons.some(value=>value>.12);
    return Object.freeze({connected:true,index:pad.index,id:String(pad.id||'Gamepad'),mapping:String(pad.mapping||''),moveX:move.x,moveY:move.y,lookX:look.x,lookY:look.y,rawMoveX,rawMoveY,rawLookX,rawLookY,buttons:Object.freeze(buttons),held:Object.freeze(held),pressed:Object.freeze(pressed),released:Object.freeze(released),meaningful});
  }
  function destroy(){destroyed=true;if(typeof window!=='undefined'){window.removeEventListener?.('gamepadconnected',connected);window.removeEventListener?.('gamepaddisconnected',disconnected);}reset();}
  return Object.freeze({poll,hasConnected,reset,destroy});
}
