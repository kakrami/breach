import { createSafeStorage } from './browser-storage.js?v=1.45.0';

const STORAGE_KEY='breachControllerRecording';
const MAX_EVENTS=384;
const NAVIGATION_KEYS=new Set(['Tab','PageUp','PageDown','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','BrowserBack','BrowserForward','GoBack','GoForward','Unidentified']);
const number=value=>Number.isFinite(Number(value))?Number(Number(value).toFixed(3)):0;

// Observe the existing gamepad poll and browser lifecycle. This recorder never
// polls hardware, moves focus, prevents events, or changes controller ownership.
export function createControllerRecording({version,build,enabled=false,readContext=()=>({}),storage=createSafeStorage('sessionStorage'),windowTarget=globalThis,documentTarget=globalThis.document,now=Date.now}={}){
  let recording=false,destroyed=false,lastState='',lastPollAt=0,lastPoll=null;
  let events=[],savedAt=null,saveError=null;
  const pageId=`${now()}-${Math.random().toString(36).slice(2,8)}`;
  try{
    const saved=JSON.parse(storage.getItem(STORAGE_KEY)||'null');
    if(saved?.format==='breach-controller-input-v1'&&Array.isArray(saved.events)){
      events=saved.events.slice(-MAX_EVENTS);savedAt=saved.savedAt??null;
    }
  }catch{}
  function context(){
    try{
      const active=documentTarget?.activeElement;
      return{...readContext(),hidden:!!documentTarget?.hidden,documentFocused:documentTarget?.hasFocus?.()??null,focusedElement:active?{tag:active.tagName,id:active.id||'',role:active.getAttribute?.('role')||''}:null,fullscreen:!!(documentTarget?.fullscreenElement||documentTarget?.webkitFullscreenElement),secureContext:windowTarget.isSecureContext??null};
    }catch(error){return{contextError:String(error?.name||'Error')};}
  }
  function add(type,data={}){
    if(!recording||destroyed)return;
    events.push({at:now(),pageId,version,build,type,...data});
    if(events.length>MAX_EVENTS)events.splice(0,events.length-MAX_EVENTS);
  }
  function save(){
    if(destroyed||!events.length)return;
    savedAt=now();
    try{storage.setItem(STORAGE_KEY,JSON.stringify({format:'breach-controller-input-v1',savedAt,events}));saveError=null;}catch(error){saveError=String(error?.name||'Error');}
  }
  function lifecycle(event){
    if(!recording)return;
    add(event.type,{context:context(),lastPoll,pollAgeMs:lastPollAt?Math.max(0,now()-lastPollAt):null,...('persisted'in event?{persisted:!!event.persisted}:{})});
    // Save before tab suspension; no interval or extra hardware read is needed.
    if(['blur','pagehide','visibilitychange'].includes(event.type))save();
  }
  function keyboard(event){
    if(!recording||event.repeat||!NAVIGATION_KEYS.has(event.key))return;
    add('navigation_key',{event:event.type,key:event.key,code:/^(Tab|PageUp|PageDown|Escape|Arrow\w+|Browser\w+|Unidentified)$/.test(event.code)?event.code:'',keyCode:Number(event.keyCode)||0,ctrl:!!event.ctrlKey,alt:!!event.altKey,shift:!!event.shiftKey,meta:!!event.metaKey,cancelable:!!event.cancelable,defaultPreventedAtCapture:!!event.defaultPrevented,trusted:!!event.isTrusted,context:context()});
  }
  const listeners=[];
  function runtimeError(event){
    const cause=event.error||event.reason;
    add(event.type,{errorName:String(cause?.name||'Error'),source:String(event.filename||'').split(/[?#]/)[0].split('/').pop(),line:Number(event.lineno)||null,column:Number(event.colno)||null,context:context()});
    if(recording)save();
  }
  function listen(target,type,handler){if(target?.addEventListener){target.addEventListener(type,handler,true);listeners.push([target,type,handler]);}}
  for(const type of ['blur','focus','pagehide','pageshow'])listen(windowTarget,type,lifecycle);
  for(const type of ['visibilitychange','fullscreenchange','webkitfullscreenchange','focusin','focusout'])listen(documentTarget,type,lifecycle);
  for(const type of ['keydown','keyup'])listen(documentTarget,type,keyboard);
  for(const type of ['error','unhandledrejection'])listen(windowTarget,type,runtimeError);
  function sample({pads=[],apiAvailable,error=null}){
    if(!recording||destroyed)return;
    const at=now(),gapMs=lastPollAt?Math.max(0,at-lastPollAt):null;
    const devices=pads.map(p=>({index:p.index,id:String(p.id||''),mapping:String(p.mapping||''),connected:!!p.connected,axes:Array.from(p.axes||[],number),buttonCount:p.buttons?.length||0,down:Array.from(p.buttons||[],(b,i)=>(typeof b==='number'?b:b?.value??(b?.pressed?1:0))>=.5?i:-1).filter(i=>i>=0),timestamp:number(p.timestamp)}));
    const currentContext=context();
    // Record edges, mode/screen changes, API errors and sampling gaps. Stick
    // motion alone is reduced to active/neutral to keep the trace bounded.
    const signature=JSON.stringify({apiAvailable,error,context:currentContext,devices:devices.map(({axes,timestamp,...p})=>({...p,axesActive:axes.some(v=>Math.abs(v)>.3)}))});
    lastPoll={at,apiAvailable,error,devices,context:currentContext};lastPollAt=at;
    if(signature!==lastState||gapMs>1000){lastState=signature;add('gamepad_sample',{...lastPoll,gapMs});}
  }
  function setEnabled(value){
    if(destroyed||recording===!!value)return;
    if(value){recording=true;lastState='';lastPollAt=0;lastPoll=null;add('recording_start',{context:context()});}
    else{add('recording_stop',{context:context()});recording=false;}
    save();
  }
  function clear(){
    events=[];lastState='';lastPollAt=0;lastPoll=null;savedAt=null;
    try{storage.removeItem(STORAGE_KEY);}catch{}
    if(recording){add('recording_start',{context:context(),cleared:true});save();}
  }
  function exportData(){
    save();
    return JSON.parse(JSON.stringify({format:'breach-controller-input-v1',recording,maxEvents:MAX_EVENTS,savedAt,saveError,events,limitations:['Chrome native shortcut consumption and internal Gamepad API active state are not exposed to the page.','No observed bumper event does not prove the bumper was not pressed.','Recovery after reload requires available session storage.']}));
  }
  function destroy(){if(destroyed)return;setEnabled(false);for(const [target,type,handler]of listeners)target.removeEventListener(type,handler,true);destroyed=true;}
  setEnabled(enabled);
  return Object.freeze({sample,setEnabled,clear,exportData,destroy,get count(){return events.length;}});
}
