export const GAMEPAD_BUTTON=Object.freeze({A:0,B:1,X:2,Y:3,LB:4,RB:5,LT:6,RT:7,VIEW:8,MENU:9,LS:10,RS:11,DPAD_UP:12,DPAD_DOWN:13,DPAD_LEFT:14,DPAD_RIGHT:15,HOME:16});
const zero=()=>Array(18).fill(0),off=()=>Array(18).fill(false);
const EMPTY_FRAME=Object.freeze({connected:false,index:-1,id:'',mapping:'',moveX:0,moveY:0,lookX:0,lookY:0,rawMoveX:0,rawMoveY:0,rawLookX:0,rawLookY:0,physicalHeld:Object.freeze(off()),buttons:Object.freeze(zero()),held:Object.freeze(off()),pressed:Object.freeze(off()),released:Object.freeze(off()),meaningful:false});
const clamp=(v,min,max)=>Math.max(min,Math.min(max,Number.isFinite(Number(v))?Number(v):0));
function value(b){return clamp(typeof b==='number'?b:b?.value??(b?.pressed?1:0),0,1);}
function supported(p){return p?.connected&&p.mapping==='standard'&&p.axes?.length>=4&&p.buttons?.length>=16;}
function pads(){try{return Array.from(globalThis.navigator?.getGamepads?.()||[]).filter(Boolean);}catch{return[];}}
function radial(x,y,dz,curve){const length=Math.hypot(x,y);if(length<=dz)return{x:0,y:0};const scale=Math.pow(Math.min(1,(length-dz)/(1-dz)),curve)/length;return{x:x*scale,y:y*scale};}
function active(p){return p.buttons.some(b=>value(b)>.5)||p.axes.slice(0,4).some(a=>Math.abs(a)>.35);}

export function createGamepadInput({stickDeadzone=.16,lookDeadzone=.14,lookCurve=1.45,buttonThreshold=.5}={}){
  stickDeadzone=clamp(stickDeadzone,.02,.45);lookDeadzone=clamp(lookDeadzone,.02,.45);lookCurve=clamp(lookCurve,1,2.5);buttonThreshold=clamp(buttonThreshold,.2,.9);
  let selected=-1,key='',scope=null,previous=off(),blocked=off(),axisBlocked=[false,false],needsBaseline=true,destroyed=false;
  let activity=new Map(),lastButtons=zero(),lastAxes=[0,0,0,0];
  const disconnected=event=>{if(event.gamepad?.index===selected){key='';reset();}activity.delete(event.gamepad?.index);};
  globalThis.addEventListener?.('gamepaddisconnected',disconnected);
  function select(){
    const available=pads().filter(supported),current=available.find(p=>p.index===selected);
    // Connecting an idle pad does not steal an in-use controller. A deliberate
    // input on another pad transfers ownership, with a fresh release barrier.
    const next=available.find(p=>p.index!==selected&&active(p)&&!activity.get(p.index));
    activity=new Map(available.map(p=>[p.index,active(p)]));
    const pad=next||current||available[0];selected=pad?.index??-1;return pad;
  }
  function reset(){needsBaseline=true;previous=off();blocked=off();axisBlocked=[false,false];scope=null;}
  function poll({context='default',enabled=true}={}){
    if(destroyed)return EMPTY_FRAME;
    const pad=select();if(!pad){key='';reset();return EMPTY_FRAME;}
    const nextKey=`${pad.index}:${pad.id}`;
    const rawButtons=Array.from({length:18},(_,i)=>value(pad.buttons[i]));
    const axes=Array.from({length:4},(_,i)=>clamp(pad.axes[i],-1,1));
    const changed=needsBaseline||key!==nextKey||scope!==context;
    if(changed){
      blocked=rawButtons.map(v=>v>.12);previous=off();
      axisBlocked=[Math.hypot(axes[0],axes[1])>stickDeadzone,Math.hypot(axes[2],axes[3])>lookDeadzone];
      key=nextKey;scope=context;needsBaseline=false;
    }
    const meaningful=!changed&&(rawButtons.some((v,i)=>v>=buttonThreshold&&lastButtons[i]<buttonThreshold)||axes.some((v,i)=>Math.abs(v)>.3&&Math.abs(v-lastAxes[i])>.08));
    lastButtons=rawButtons.slice();lastAxes=axes.slice();
    const buttons=rawButtons.map((v,i)=>{if(blocked[i]&&v<=.12)blocked[i]=false;return blocked[i]?0:v;});
    for(let s=0;s<2;s++){if(Math.hypot(axes[s*2],axes[s*2+1])<=(s?lookDeadzone:stickDeadzone))axisBlocked[s]=false;if(axisBlocked[s])axes[s*2]=axes[s*2+1]=0;}
    if(!enabled){reset();return Object.freeze({...EMPTY_FRAME,connected:true,index:pad.index,id:String(pad.id),mapping:pad.mapping});}
    const held=buttons.map((v,i)=>v>=(previous[i]?buttonThreshold*.75:buttonThreshold));
    const pressed=held.map((v,i)=>v&&!previous[i]),released=held.map((v,i)=>!v&&previous[i]);previous=held;
    const move=radial(axes[0],axes[1],stickDeadzone,1),look=radial(axes[2],axes[3],lookDeadzone,lookCurve);
    return Object.freeze({connected:true,index:pad.index,id:String(pad.id),mapping:pad.mapping,moveX:move.x,moveY:move.y,lookX:look.x,lookY:look.y,rawMoveX:axes[0],rawMoveY:axes[1],rawLookX:axes[2],rawLookY:axes[3],physicalHeld:Object.freeze(rawButtons.map(v=>v>=buttonThreshold)),buttons:Object.freeze(buttons),held:Object.freeze(held),pressed:Object.freeze(pressed),released:Object.freeze(released),meaningful});
  }
  function hasConnected(){return !destroyed&&pads().some(supported);}
  function unsupported(){return pads().filter(p=>p.connected&&!supported(p)).map(p=>String(p.id||'Controller'));}
  function destroy(){destroyed=true;reset();activity.clear();globalThis.removeEventListener?.('gamepaddisconnected',disconnected);}
  return Object.freeze({poll,hasConnected,unsupported,reset,destroy});
}
