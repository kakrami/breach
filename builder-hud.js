// One canvas owns builder painting, hit testing, focus, text keys and scrolling.
// Document edits still go through EditorSession's command/preview pipeline.
import { GAMEPAD_BUTTON as B } from "./gamepad-input.js?v=2.7.0";
import { THEME, drawPanel, drawButton, drawLabel, directionNeighbor } from "./native-ui.js?v=2.7.0";
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const intersect = (a,b) => a.x < b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y;
const hit = (p,b) => inside(p,b) && (!b.clip || inside(p,b.clip));
const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
const sections = [["pick","Objects"],["ground","Ground"],["tools","Tools"],["edit","Properties"],["menu","Map"]];
export function hudLayout(width, height, model, insets = {}) {
  const left=insets.left||0, top=insets.top||0;
  const w=Math.max(1,width-left-(insets.right||0)), h=Math.max(1,height-top-(insets.bottom||0));
  const buttons=[], panels=[], labels=[];
  let scroll=null;
  const add=(id,label,x,y,bw=44,bh=44,extra={})=>{const b={id,label,x,y,w:bw,h:bh,...extra};buttons.push(b);return b;};
  const label=(text,x,y,maxWidth,align="left",extra={})=>labels.push({text:String(text||""),x,y,maxWidth,align,...extra});
  const row=(items,x,y,width,extra={})=>{const bw=(width-(items.length-1)*4)/items.length;items.forEach(([id,text,opts={}],i)=>add(id,text,x+i*(bw+4),y,bw,44,{...extra,...opts}));};
  const scrollBody=(id,viewport,contentHeight)=>{
    const max=Math.max(0,contentHeight-viewport.h), offset=clamp(Number(model.scroll)||0,0,max);
    scroll={id,viewport,max,offset,contentHeight};return offset;
  };
  const wrap=(text,chars)=>{
    const out=[];for(const paragraph of String(text||"").split("\n")){let line="";for(const word of paragraph.split(/\s+/)){if(line&&(line+" "+word).length>chars){out.push(line);line=word;}else line+=(line?" ":"")+word;}if(line)out.push(line);}return out;
  };
  if(!model.panel){
    const portrait=w<540, narrow=w<300, bottomY=h-80;
    panels.push({x:0,y:0,w,h:56,chrome:true});
    add("menu","Map",8,6,narrow?44:52,44);
    add("undo","Undo",narrow?56:64,6,narrow?44:52,44,{disabled:!model.undo});
    if(!narrow)add("redo","Redo",120,6,52,44,{disabled:!model.redo});
    add("overview",model.overview?"Orbit":"Top",w-132,6,60,44,{disabled:!model.building});
    add("playtest",model.building?"Test":"Edit",w-68,6,60,44,{accent:!model.building,disabled:!!model.pending});
    if(w>=760){label(model.mapName||"Map builder",184,28,w-468,"left",{weight:700,fontSize:16});add("save-map","Save",w-280,6,64,44,{disabled:model.pending||!model.building});add("check","Check",w-212,6,72,44,{disabled:model.pending||!model.building});}
    if(model.building){
      panels.push({x:0,y:bottomY-4,w,h:56,chrome:true});
      const navItems=sections.map(([id,text])=>["nav:"+id,w<360&&id==="edit"?"Props":text,{tab:true,command:id,aria:text,selected:id==="pick"&&model.placing||id==="ground"&&["terrain","paint"].includes(model.mode),disabled:!!model.pending}]);
      if(w>=360&&w<620){const widths=[64,64,52,88,44],extra=(w-32-widths.reduce((a,b)=>a+b,0))/5;let x=8;navItems.forEach(([id,text,options],i)=>{add(id,text,x,bottomY,widths[i]+extra,44,options);x+=widths[i]+extra+4;});}
      else row(navItems,narrow?4:8,bottomY,w-(narrow?8:16));
      const brushMode=["terrain","paint"].includes(model.mode), hasContext=model.selected||model.pending||model.placing||brushMode;
      if(!portrait||h>=344||!hasContext)row([["select","Select",{selected:["select","move","rotate","scale"].includes(model.tool),disabled:!!model.pending}],["multi","Multi",{selected:model.multi,disabled:model.pending||model.placing||["terrain","paint"].includes(model.mode)}],["snap-toggle","Snap",{selected:model.snap}]],8,64,200);
      if(hasContext){
        const iw=portrait?w-16:Math.min(328,w-232),ix=portrait?8:w-iw-8;
        const title=model.pending?"Transform preview":model.selected?(model.selectionLabel||"Selected object"):model.placing?(model.itemLabel||"Place object"):model.mode==="paint"?"Paint ground":"Shape ground";
        const content=[],footer=[];
        const queue=(items)=>content.push(items);
        if(model.selected||model.pending){
          queue([["move","Move",{selected:model.tool==="move",disabled:!!model.pending}],["rotate-tool","Rotate",{selected:model.tool==="rotate",disabled:!model.rotatable||model.pending}],["scale-tool","Size",{selected:model.tool==="scale",disabled:!model.resizable||model.pending}]]);
          queue(model.tool==="rotate"?[["turn-left","−15°"],["turn-right","+15°"]]:model.tool==="scale"?[["scale-down","Smaller"],["scale-up","Larger"]]:[["nudge:x:-1","←"],["nudge:z:-1","↑"],["nudge:z:1","↓"],["nudge:x:1","→"]]);
          queue([["raise-object","Lift",{disabled:!model.vertical}],["lower-object","Lower",{disabled:!model.vertical}],["focus","Focus",{disabled:!!model.pending}]]);
          footer.push(...(model.pending?[["cancel","Cancel"],["apply","Apply",{accent:true,disabled:!model.valid}]]:[["copy","Copy"],["erase","Delete"],[model.roadSelected?"road-edit":"edit",model.roadSelected?"Path":"Properties"]]));
        }else if(brushMode){
          const b=model.brush||{radius:6,rate:2,tool:"raise"};
          queue(model.mode==="terrain"?["raise","lower","smooth","level"].map(t=>["brush-tool:"+t,t==="level"?"Flatten":t[0].toUpperCase()+t.slice(1),{selected:b.tool===t}]):[["brush-material",model.materialLabel||"Choose material",{command:"brush-settings"}]]);
          queue([["brush-radius","Size",{slider:true,value:b.radius,min:model.brushMinRadius||2,max:30,step:2}]]);
          if(model.mode==="terrain")queue([["brush-rate","Rate",{slider:true,value:b.rate||2,min:.25,max:8,step:.25}]]);
          footer.push(["brush-settings","Options"],["done","Done"]);
        }else if(model.footprintMode){
          queue([["floor-down","−",{disabled:model.buildingLevels<=1}],["floor-count",`${model.buildingLevels} floors`,{disabled:true}],["floor-up","+",{disabled:model.buildingLevels>=5}]]);
          footer.push(["done","Cancel"],["place","Create",{accent:true,disabled:!model.footprintStarted||!model.valid}]);
        }else if(model.roadMode){
          queue([["road-smooth",model.roadSmooth?"Curve":"Straight",{selected:model.roadSmooth}],["road-reverse","Other end",{disabled:model.roadCount<2}]]);
          queue([["road-back","Remove point",{disabled:!model.roadCount}]]);
          footer.push(["done","Cancel"],["road-finish","Finish",{accent:true,disabled:model.roadCount<2}]);
        }else{
          queue([["rotate","Rotate"],["placement-lower","Lower"],["placement-raise","Lift"]]);
          queue([["pick","Change object"]]);
          footer.push(["done","Done"],["place","Place",{accent:true,disabled:!model.valid}]);
        }
        const maxHeight=bottomY-(portrait&&h>=344?116:64)-12, ih=Math.min(36+content.length*48+52,Math.max(132,maxHeight)), iy=portrait?bottomY-ih-8:64;
        panels.push({x:ix,y:iy,w:iw,h:ih,chrome:true});
        label(title,ix+12,iy+18,iw-24,"left",{weight:700});
        const viewport={x:ix+8,y:iy+36,w:iw-16,h:ih-92}, offset=scrollBody("workspace:"+model.mode+":"+!!model.pending,viewport,Math.max(0,content.length*48-4));
        content.forEach((items,i)=>row(items,viewport.x,viewport.y+i*48-offset,viewport.w,{clip:viewport}));
        row(footer,ix+8,iy+ih-52,iw-16);
      }
      panels.push({x:0,y:h-28,w,h:28,chrome:true});
      const status=(model.pending||model.placing)&&!model.valid?(model.tip||"Placement blocked"):model.pending?"Preview · Apply to keep changes":model.placing?(model.footprintMode?model.tip:model.roadMode?"Road · place points, then Finish":"Place · tap a surface, then Place"):brushMode?"Ground · drag to brush · two fingers navigate":model.selected?"Select · Move, Rotate or Size":"Select · tap object · drag to orbit · pinch to zoom";
      label(status,12,h-14,w-24,"left",{fontSize:12,color:THEME.muted});
    }else{add("place","Fire test",w-112,h-104,104,48,{accent:true});label("Test map · Map to return to editing",12,h-20,w-136,"left",{fontSize:12});}
    if(!model.building||model.controllerAiming)label("+",w/2,h/2,20,"center");
    for(const p of model.roadHandles||[])if(p.x>24&&p.x<w-24&&p.y>72&&p.y<h-88&&!panels.some(r=>inside(p,r)))label(p.label,p.x,p.y,30,"center",{node:true});
  }else{
    const p=model.panel, keyboard=p.kind==="keyboard", library=p.kind==="library";
    const pw=Math.min(keyboard?720:library?808:600,w-16),px=(w-pw)/2,py=8,ph=h-16;
    panels.push({x:0,y:0,w,h,backdrop:true},{x:px,y:py,w:pw,h:ph});
    label(p.title,px+12,py+26,pw-76,"left",{fontSize:16,weight:700});
    add("close",p.back?"Back":"Close",px+pw-64,py+4,56,44,{disabled:!!p.busy||p.title==="Working…"});
    if(keyboard){
      const wide=pw>=492,cols=p.numeric?3:wide?10:Math.min(8,Math.max(1,Math.floor((pw-16)/48)));
      const alphabet=p.caps?"QWERTYUIOPASDFGHJKLZXCVBNM":"qwertyuiopasdfghjklzxcvbnm";
      const chars=p.numeric?"1234567890.-":p.digits?'1234567890.-_@!?,:;()[]{}"/+=*#%&':alphabet;
      const groups=!p.numeric&&!p.digits&&wide?[chars.slice(0,10),chars.slice(10,19),chars.slice(19)]:Array.from({length:Math.ceil(chars.length/cols)},(_,i)=>chars.slice(i*cols,(i+1)*cols));
      const keyRows=groups.map(group=>[...group].map(ch=>["text:"+ch,ch]));
      const options=p.numeric?[["text:back","Back"],["text:clear","Clear"]]:[["text:digits",p.digits?"ABC":"123"],["text:caps","Shift"],["text:space","Space"],["text:back","Back"],["text:clear","Clear"]];
      for(let i=0;i<options.length;i+=cols)keyRows.push(options.slice(i,i+cols));
      const kw=Math.min(p.numeric?100:72,(pw-16-(cols-1)*4)/cols);
      label((p.value||"")+"│",px+12,py+74,pw-24,"left",{fontSize:16,field:true});
      const viewport={x:px+8,y:py+96,w:pw-16,h:Math.max(44,ph-156)}, offset=scrollBody(p.scope||"keyboard",viewport,keyRows.length*48-4);
      keyRows.forEach((keys,j)=>{const x=px+(pw-(keys.length*kw+(keys.length-1)*4))/2;keys.forEach(([id,text],i)=>add(id,text,x+i*(kw+4),viewport.y+j*48-offset,kw,44,{clip:viewport}));});
      row([["text:cancel","Cancel"],["text:done","Done",{accent:true}]],px+8,py+ph-52,pw-16);
    }else{
      const tabs=p.tabs||[], tc=Math.max(1,Math.floor((pw-16)/88)),tabRows=Math.ceil(tabs.length/tc),tw=(pw-16-(tc-1)*4)/tc;
      tabs.forEach((it,i)=>add(it.id,it.label,px+8+(i%tc)*(tw+4),py+52+Math.floor(i/tc)*48,tw,44,{...it,tab:true}));
      const primary=p.primaryPair?(p.items||[]).slice(0,2):[], items=p.primaryPair?(p.items||[]).slice(2):(p.items||[]),primaryH=primary.length?52:0;
      const bodyY=py+56+tabRows*48, footerY=py+ph-28-primaryH;
      const viewport={x:px+8,y:bodyY,w:pw-16,h:Math.max(44,footerY-bodyY-8)};
      const lines=wrap(p.description,Math.max(12,Math.floor((pw-32)/7.3))),descH=lines.length?lines.length*20+12:0;
      const cols=library?Math.max(2,Math.floor((pw-16)/132)):1,cw=(pw-16-(cols-1)*8)/cols,rowH=library?112:52;
      const offset=scrollBody(p.scope||p.title,viewport,descH+Math.ceil(items.length/cols)*rowH);
      lines.forEach((t,i)=>label(t,viewport.x+4,viewport.y+i*20+10-offset,viewport.w-8,"left",{color:THEME.muted,clip:viewport}));
      items.forEach((it,i)=>add(it.id,it.label,viewport.x+(i%cols)*(cw+8),viewport.y+descH+Math.floor(i/cols)*rowH-offset,cw,rowH-8,{...it,clip:viewport}));
      if(primary.length)row(primary.map(it=>[it.id,it.label,it]),px+8,footerY,pw-16);
      label("A Select   B Back   LB / RB Tabs",px+12,py+ph-12,pw-24,"left",{fontSize:12,color:THEME.muted});
    }
  }
  // Insets apply to exactly the same geometry used for painting, hits and focus.
  const clips=new Set();for(const list of [buttons,panels,labels])for(const r of list){r.x+=left;r.y+=top;if(r.clip)clips.add(r.clip);}if(scroll)clips.add(scroll.viewport);for(const r of clips){r.x+=left;r.y+=top;}
  return {buttons,panels,labels,scroll,scope:model.panel?.scope||model.panel?.title||"workspace",width,height};
}
function clipped(c,r,run){if(r.clip){if(!intersect({x:r.x,y:r.y-10,w:r.w||r.maxWidth,h:r.h||20},r.clip))return;c.save();c.beginPath();c.rect(r.clip.x,r.clip.y,r.clip.w,r.clip.h);c.clip();run();c.restore();}else run();}
function fitLabel(c,text,width,size=14,weight=500,tail=false){
  c.font=`${weight} ${size}px ${THEME.font}`;let value=String(text||"");if(c.measureText(value).width<=width)return value;
  while(value.length>1&&c.measureText(tail?"…"+value:value+"…").width>width)value=tail?value.slice(1):value.slice(0,-1);
  return tail?"…"+value:value+"…";
}
export function paintHUD(c,layout,{focus="",pressed="",images=new Map()}={}){
  for(const p of layout.panels)drawPanel(c,p,{fill:p.backdrop?"rgba(0,0,0,.55)":THEME.panel,stroke:p.backdrop?null:THEME.border,radius:p.chrome||p.backdrop?0:THEME.radius});
  for(const b of layout.buttons)clipped(c,b,()=>{
    drawButton(c,b,{text:"",active:!!b.selected,primary:!!b.accent,focused:focus===b.id,pressed:pressed===b.id,disabled:!!b.disabled,fontSize:14});
    const color=b.selected||b.accent?THEME.accentText:THEME.text;
    c.save();c.globalAlpha*=b.disabled?.42:1;
    if(!b.slider&&!b.thumbnail&&!b.subtitle)drawLabel(c,fitLabel(c,b.label,b.w-8,14,700),{x:b.x+4,y:b.y,w:b.w-8,h:b.h},{fontSize:14,weight:700,color,align:"center"});
    if(b.slider){
      const value=Number(b.value)||0,t=clamp((value-b.min)/(b.max-b.min),0,1);
      drawLabel(c,b.label,{x:b.x+10,y:b.y+2,w:b.w-76,h:24},{fontSize:14});
      drawLabel(c,String(Number(value.toFixed(2)))+(b.id==="brush-rate"?"×":""),{x:b.x+b.w-64,y:b.y+2,w:54,h:24},{align:"right",fontSize:14});
      c.fillStyle=THEME.border;c.fillRect(b.x+14,b.y+32,b.w-28,3);c.fillStyle=THEME.accent;c.fillRect(b.x+14,b.y+32,(b.w-28)*t,3);c.beginPath();c.arc(b.x+14+(b.w-28)*t,b.y+33,7,0,Math.PI*2);c.fill();
    }else if(b.thumbnail){const img=images.get(b.thumbnail);if(img?.width){const s=Math.min((b.w-16)/img.width,(b.h-30)/img.height);c.drawImage(img,b.x+(b.w-img.width*s)/2,b.y+4,img.width*s,img.height*s);}drawLabel(c,b.label,{x:b.x+6,y:b.y+b.h-26,w:b.w-12,h:24},{fontSize:14,color,align:"center"});
    }else if(b.subtitle){drawLabel(c,b.label,{x:b.x+10,y:b.y+2,w:b.w-20,h:20},{fontSize:14,color:b.tone==="bad"?THEME.danger:THEME.accent});drawLabel(c,b.subtitle,{x:b.x+10,y:b.y+23,w:b.w-20,h:18},{fontSize:12,color:THEME.muted});}
    c.restore();
  });
  for(const l of layout.labels)clipped(c,l,()=>{if(l.node){c.fillStyle=THEME.accent;c.beginPath();c.arc(l.x,l.y,14,0,Math.PI*2);c.fill();}const x=l.align==="center"?l.x-l.maxWidth/2:l.x;drawLabel(c,fitLabel(c,l.text,l.maxWidth,l.fontSize||14,l.weight||500,l.field),{x,y:l.y-12,w:l.maxWidth,h:24},{fontSize:l.fontSize||14,weight:l.weight||500,color:l.node?THEME.accentText:l.color||THEME.text,align:l.align||"left"});});
  const s=layout.scroll;if(s?.max){const track=s.viewport.h,thumb=Math.max(24,track*track/s.contentHeight),y=s.viewport.y+(track-thumb)*s.offset/s.max;c.fillStyle=THEME.border;c.fillRect(s.viewport.x+s.viewport.w-3,s.viewport.y,3,track);c.fillStyle=THEME.accent;c.fillRect(s.viewport.x+s.viewport.w-3,y,3,thumb);}
}
export function createBuilderHUD({stage,active,model,action,lift,pause,transform}){
  const canvas=stage.tagName?.toLowerCase()==="canvas"?stage:document.createElement("canvas");
  canvas.id="builderHUD";canvas.setAttribute("role","application");canvas.setAttribute("aria-label","Map builder. Canvas controls. Tab focuses tools; arrows move; Enter selects; Escape goes back.");canvas.tabIndex=0;
  if(canvas!==stage)stage.appendChild(canvas);
  const ctx=canvas.getContext("2d"),images=new Map(),scrolls=new Map(),focusMemory=new Map();
  let layout={buttons:[],panels:[],labels:[]},paintSignature="",imageVersion=0,focus="",pressed=null,toolbarFocus=false,scope="",w=0,h=0,lastSize="";
  function render(){
    const visible=active();canvas.hidden=!visible;if(!visible){pressed=null;return;}
    const rect=stage.getBoundingClientRect();w=rect.width;h=rect.height;if(w<1||h<1)return;
    const size=w+":"+h;if(lastSize&&size!==lastSize)cancelPress();lastSize=size;
    const scale=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}
    const m=model(),style=getComputedStyle(stage),insets=Object.fromEntries(["left","right","top","bottom"].map(k=>[k,parseFloat(style.getPropertyValue("--builder-safe-"+k))||0]));
    const nextScope=m.panel?.scope||m.panel?.title||"workspace";
    if(nextScope!==scope){if(scope)focusMemory.set(scope,focus);cancelPress();scope=nextScope;focus=focusMemory.get(scope)||"";}
    const first=hudLayout(w,h,m,insets);m.scroll=scrolls.get(first.scroll?.id)||0;layout=hudLayout(w,h,m,insets);
    if(pressed?.slider){const b=layout.buttons.find(b=>b.id===pressed.id);if(b)b.value=pressed.value;}
    const list=layout.buttons.filter(b=>!b.disabled);if(!list.some(b=>b.id===focus))focus=m.panel||toolbarFocus?(list.find(b=>b.tab&&b.selected)||list.find(b=>b.id!=="close"&&(!b.clip||intersect(b,b.clip)))||list[0])?.id||"":"";
    for(const b of layout.buttons)if(b.thumbnail&&!images.has(b.thumbnail)){const img=new Image();images.set(b.thumbnail,img);img.onload=()=>{imageVersion++;render();};img.src=b.thumbnail;}
    const key=JSON.stringify([w,h,scale,layout,focus,pressed?.id,imageVersion]);if(key===paintSignature)return;paintSignature=key;ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);paintHUD(ctx,layout,{focus,pressed:pressed?.id,images});
  }
  function point(ev){const r=stage.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
  function stop(ev){ev.preventDefault();ev.stopImmediatePropagation();}
  function cancelPress(){const p=pressed;pressed=null;if(p?.handle)transform?.("cancel",p.handle.axis,0);lift?.(0);if(p&&stage.hasPointerCapture?.(p.pointer))stage.releasePointerCapture(p.pointer);}
  function setScroll(n){if(!layout.scroll)return;scrolls.set(layout.scroll.id,clamp(n,0,layout.scroll.max));render();}
  function reveal(id){const b=layout.buttons.find(b=>b.id===id),s=layout.scroll;if(!b?.clip||!s)return;if(b.y<s.viewport.y)setScroll(s.offset+b.y-s.viewport.y);else if(b.y+b.h>s.viewport.y+s.viewport.h)setScroll(s.offset+b.y+b.h-s.viewport.y-s.viewport.h);}
  function down(ev){
    if(!active()||ev.button>0)return;if(document.pointerLockElement)return;render();
    const p=point(ev),b=[...layout.buttons].reverse().find(b=>hit(p,b));
    if(!b&&!model().panel&&!layout.panels.some(r=>inside(p,r)))return;
    stop(ev);if(pressed||b?.disabled)return;canvas.focus?.({preventScroll:true});
    pressed={id:b?.id||"",pointer:ev.pointerId,scope,start:p,hold:b?.hold||0,slider:b?.slider?{...b}:null,value:b?.value,scroll:layout.scroll&&inside(p,layout.scroll.viewport)?{...layout.scroll}:null,dragged:false};
    stage.setPointerCapture?.(ev.pointerId);if(b?.hold)lift?.(b.hold);else if(model().building||model().panel||b?.id!=="place")pause?.();if(b?.slider)pressed.value=sliderValue(b,p);if(b)focus=b.id;render();
  }
  function sliderValue(b,p){return clamp(Math.round((b.min+clamp((p.x-b.x-14)/(b.w-28),0,1)*(b.max-b.min))/b.step)*b.step,b.min,b.max);}
  function commitSlider(b,value){action((b.id.startsWith("ui:")?"value:":"")+b.id+":"+value);}
  function release(ev,cancel=false){if(pressed?.pointer!==ev.pointerId)return;stop(ev);const p=pressed;pressed=null;lift?.(0);if(stage.hasPointerCapture?.(ev.pointerId))stage.releasePointerCapture(ev.pointerId);
    if(!cancel&&p.scope===scope&&!p.dragged){if(p.slider)commitSlider(p.slider,p.value);else if(!p.hold){const b=layout.buttons.find(b=>b.id===p.id);if(b&&!b.disabled&&hit(point(ev),b))action(b.command||b.id);}}render();}
  function move(ev){if(pressed?.pointer!==ev.pointerId)return;stop(ev);const p=point(ev);if(pressed.scope!==scope){cancelPress();return;}const dx=p.x-pressed.start.x,dy=p.y-pressed.start.y;
    if(pressed.scroll&&Math.abs(dy)>8&&(!pressed.slider||Math.abs(dy)>Math.abs(dx))){pressed.slider=null;pressed.dragged=true;setScroll(pressed.scroll.offset-dy);return;}
    if(pressed.slider&&!pressed.dragged){pressed.value=sliderValue(pressed.slider,p);render();}
  }
  function wheel(ev){if(!active())return;render();if(layout.scroll&&inside(point(ev),layout.scroll.viewport)){stop(ev);setScroll(layout.scroll.offset+ev.deltaY);}}
  const up=ev=>release(ev),cancel=ev=>release(ev,true),reset=()=>{cancelPress();toolbarFocus=false;focus="";paintSignature="";render();};
  const listeners=[["pointerdown",down],["pointermove",move],["pointerup",up],["pointercancel",cancel],["lostpointercapture",cancel],["wheel",wheel]];for(const[n,f]of listeners)stage.addEventListener(n,f,{capture:true,passive:false});
  window.addEventListener("blur",reset);window.addEventListener("pagehide",reset);const visibility=()=>{if(document.hidden)reset();};document.addEventListener("visibilitychange",visibility);
  const observer=new ResizeObserver(render);observer.observe(stage);
  function controller(frame){
    if(frame.connected===false){reset();return false;}if(!active())return false;const p=frame.pressed||[];const m=model();
    if(!m.panel&&m.building&&p[B.LT]){toolbarFocus=!toolbarFocus;focus="";pause?.();render();return true;}
    if(!m.panel&&!toolbarFocus)return false;
    if(!m.panel&&(p[B.B]||!m.building)){toolbarFocus=false;focus="";render();return true;}
    render();const list=layout.buttons.filter(b=>!b.disabled);let current=list.find(b=>b.id===focus)||list.find(b=>b.id!=="close")||list[0];
    if(p[B.B]||p[B.MENU])action("close");
    else if(p[B.LB]||p[B.RB]){const tabs=list.filter(b=>b.tab);if(tabs.length){const selected=tabs.findIndex(b=>b.selected),i=tabs.findIndex(b=>b.id===focus),next=tabs[((i<0?Math.max(0,selected):i)+(p[B.LB]?-1:1)+tabs.length)%tabs.length];focus=next.id;action(next.command||next.id);}}
    else if(current?.slider&&(p[B.DPAD_LEFT]||p[B.DPAD_RIGHT]))commitSlider(current,clamp(current.value+(p[B.DPAD_LEFT]?-1:1)*current.step,current.min,current.max));
    else if(p[B.A]&&current){if(!current.slider)action(current.command||current.id);}
    else{const dx=p[B.DPAD_RIGHT]?1:p[B.DPAD_LEFT]?-1:0,dy=p[B.DPAD_DOWN]?1:p[B.DPAD_UP]?-1:0;if((dx||dy)&&current){const next=directionNeighbor(current,list,dx,dy);if(next)focus=next.id;}else focus=current?.id||"";}
    render();reveal(focus);return true;
  }
  function key(ev){
    if(!active())return false;
    if(ev.key==="Tab") {const previous=focus;pause?.();toolbarFocus=true;render();const list=layout.buttons.filter(b=>!b.disabled);const i=list.findIndex(b=>b.id===previous),next=list[(i<0?(ev.shiftKey?list.length-1:0):(i+(ev.shiftKey?-1:1)+list.length)%list.length)];focus=next?.id||"";render();reveal(focus);return true;}
    if(ev.key==="PageDown"||ev.key==="PageUp"){if(!model().panel&&!toolbarFocus)return false;setScroll((layout.scroll?.offset||0)+(ev.key==="PageDown"?1:-1)*(layout.scroll?.viewport.h||0));return true;}
    const map={ArrowLeft:B.DPAD_LEFT,ArrowRight:B.DPAD_RIGHT,ArrowUp:B.DPAD_UP,ArrowDown:B.DPAD_DOWN,Enter:B.A," ":B.A,Escape:B.B,"[":B.LB,"]":B.RB};if(!(ev.key in map))return false;const pressed=[];pressed[map[ev.key]]=true;return controller({pressed});
  }
  return{render,controller,key,reset,get focusActive(){return toolbarFocus;},get layout(){return layout;},destroy(){observer.disconnect();window.removeEventListener("blur",reset);window.removeEventListener("pagehide",reset);document.removeEventListener("visibilitychange",visibility);for(const[n,f]of listeners)stage.removeEventListener(n,f,true);canvas.remove();}};
}
