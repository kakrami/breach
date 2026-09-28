// Presentation and hit testing only. All edits go through the builder's command stack.
// Layout is shared by painting, pointer input, keyboard focus and controller focus.
import {GAMEPAD_BUTTON as B} from './gamepad-input.js?v=1.73.0';
const inside=(p,r)=>p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h;
export function hudLayout(w,h,model,insets={}){
 const left=insets.left||0,right=insets.right||0,topInset=insets.top||0,bottom=insets.bottom||0;
 if(left||right||topInset||bottom){const l=hudLayout(w-left-right,h-topInset-bottom,model);for(const list of [l.buttons,l.panels,l.labels])for(const r of list){r.x+=left;r.y+=topInset;}return l;}
 const m=12,gap=5,small=w<620,top=12,buttons=[],panels=[],labels=[];
 const add=(id,label,x,y,bw=44,bh=44,extra={})=>buttons.push({id,label,x,y,w:bw,h:bh,...extra});
 add('menu','☰',m,top,44,44,{aria:'Map menu'});
 add('undo','↶',m+49,top,44,44,{aria:'Undo',disabled:!model.undo});
 add('redo','↷',m+98,top,44,44,{aria:'Redo',disabled:!model.redo});
 const modeX=small?w-m-117:(w-117)/2;
 add('build','Build',modeX,top,56,44,{selected:model.building});
 add('playtest','Test',modeX+61,top,56,44,{selected:!model.building&&!model.overview});
 const viewY=small?66:top;
 add('overview',model.overview?'3D view':'Top view',w-m-149,viewY,78);
 add('snap-toggle','Snap',w-m-66,viewY,66,44,{selected:model.snap});
 if(model.building&&!model.overview){
  const railY=Math.min(small?120:76,h-208);
  [['select','Select'],['move','Move'],['rotate-tool','Rotate'],model.selected&&model.resizable?['scale-tool','Size']:['terrain','Terrain']].forEach(([id,label],i)=>add(id,label,m,railY+i*49,66,44,{selected:model.tool===id,disabled:(id==='move'||id==='rotate-tool')&&!model.selected}));
  // Leave the lower-left joystick and right-hand look zone to the game.
  const compact=h<450,liftY=compact?(small?120:76):Math.max(small?120:80,Math.min(h*.38,h-212));
  add('up','↑',w-m-(compact?101:48),liftY,48,48,{aria:'Fly up',hold:1});
  add('down','↓',w-m-48,liftY+(compact?0:53),48,48,{aria:'Fly down',hold:-1});
  if(!model.selected&&!model.pending)add('place',model.primary||'Place',w-m-78,h-150,78,56,{accent:true,disabled:!model.valid});
  const count=small?2:5,bw=small?58:64,total=(count+1)*bw+count*gap,x=(w-total)/2,y=h-76;
  add('pick','Objects',x,y,bw,64,{aria:'Object library'});
  (model.hotbar||[]).slice(0,count).forEach((item,i)=>add('item:'+item.key,item.label,x+(i+1)*(bw+gap),y,bw,64,{selected:model.item===item.key,thumbnail:item.thumbnail}));
  if(model.selected||model.pending){
   const options=model.pending?[['place','Apply'],['cancel','Cancel']]:[['edit','Properties'],['copy','Copy'],['erase','Delete'],...(model.vertical===false?[]:[['raise-object','Object ↑'],['lower-object','Object ↓']])];
   // One compact row, never a wrapped toolbar over the crosshair.
   const bw2=small?56:78,rowW=options.length*bw2+(options.length-1)*gap;
   options.forEach(([id,label],i)=>add(id,label,(w-rowW)/2+i*(bw2+gap),h-129,bw2,44,{disabled:id==='place'&&!model.valid,accent:id==='place'}));
  }
  const tipY=model.selected||model.pending?h-147:h-91;
  if(model.tip)labels.push({text:model.tip,x:w/2,y:tipY,maxWidth:Math.max(100,w-190)});
 }
 if(model.overview&&!model.panel){
  const bw=Math.min(90,(w-44)/5),x=(w-(bw*5+20))/2;
  [['select','Select'],['pick','Objects'],['terrain','Terrain'],['edit','Properties'],['multi','Multi']].forEach(([id,label],i)=>add(id,label,x+(bw+5)*i,h-56,bw,44,{disabled:id==='edit'&&!model.selected,selected:id==='multi'&&model.multi}));
  if(model.selected){const opts=[['copy','Copy'],['erase','Delete'],['raise-object','Object ↑'],['lower-object','Object ↓']];opts.forEach(([id,label],i)=>add(id,label,(w-249)/2+i*64,h-105,59,44));}
  if(model.tip)labels.push({text:model.tip,x:w/2,y:h-(model.selected?121:72),maxWidth:w-40});
 }

 if(model.panel){
  buttons.length=0;labels.length=0;
  const keyboard=model.panel.kind==='keyboard',pw=keyboard?Math.min(640,w-24):Math.min(380,w-24),px=keyboard?(w-pw)/2:w-m-pw,py=12,ph=h-24;
  panels.push({x:px,y:py,w:pw,h:ph});
  labels.push({text:model.panel.title,x:px+16,y:py+25,align:'left',maxWidth:pw-80});
  if(keyboard){
   labels.push({text:(model.panel.value||'')+'│',x:px+16,y:py+62,align:'left',maxWidth:pw-32});
   const numeric=model.panel.numeric,digits=numeric||model.panel.digits,chars=digits?'1234567890.-_':'qwertyuiopasdfghjklzxcvbnm';
   const keys=[...chars].map(ch=>({id:'text:'+(model.panel.caps?ch.toUpperCase():ch),label:model.panel.caps?ch.toUpperCase():ch}));
   if(!numeric)keys.push({id:'text:digits',label:digits?'ABC':'123'},{id:'text:caps',label:'Shift'},{id:'text:space',label:'Space'});
   keys.push({id:'text:back',label:'Back',aria:'Backspace'},{id:'text:clear',label:'Clear'},{id:'text:cancel',label:'Cancel'},{id:'text:done',label:'Done',accent:true});
   const cols=Math.max(1,Math.floor((pw-19)/49)),bw=(pw-24-(cols-1)*5)/cols;
   keys.forEach((it,i)=>add(it.id,it.label,px+12+(i%cols)*(bw+5),py+78+Math.floor(i/cols)*49,bw,44,it));
  }else{
   add('close','×',px+pw-52,py+4,44,44,{aria:'Close panel',disabled:model.panel.title==='Working…'});
   const lines=[],words=(model.panel.description||'').split(/\s+/),limit=Math.max(12,Math.floor((pw-32)/7));let line='';
   for(const word of words){if((line+' '+word).length>limit&&line){lines.push(line);line=word;}else line+=(line?' ':'')+word;}if(line)lines.push(line);
   const maxLines=Math.max(1,Math.floor((ph-160)/18)),textPages=Math.max(1,Math.ceil(lines.length/maxLines));
   const lastLines=lines.slice((textPages-1)*maxLines),offsetLast=lastLines.length?74+lastLines.length*18:56;
   const rows=Math.max(1,Math.floor((ph-offsetLast-56)/54)),pageSize=rows*2,items=model.panel.items||[];
   const pages=textPages-1+Math.max(1,Math.ceil(items.length/pageSize)),page=Math.min(model.page||0,pages-1),textPage=Math.min(page,textPages-1),shown=lines.slice(textPage*maxLines,(textPage+1)*maxLines);
   shown.forEach((text,i)=>labels.push({text,x:px+16,y:py+63+i*18,align:'left',maxWidth:pw-32}));
   if(page>=textPages-1){const offset=shown.length?74+shown.length*18:56,itemPage=page-(textPages-1);items.slice(itemPage*pageSize,(itemPage+1)*pageSize).forEach((it,i)=>add(it.id,it.label,px+12+(i%2)*(pw-19)/2,py+offset+Math.floor(i/2)*54,(pw-29)/2,49,it));}
   if(pages>1){add('previous','‹',px+12,py+ph-51,44,44,{disabled:page===0});add('next','›',px+pw-56,py+ph-51,44,44,{disabled:page===pages-1});labels.push({text:`${page+1} / ${pages}`,x:px+pw/2,y:py+ph-28,maxWidth:120});}

  }
 }

 return {buttons,panels,labels};
}
function box(c,r,fill,stroke){c.beginPath();c.roundRect(r.x,r.y,r.w,r.h,7);c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}
function icon(c,id,x,y){
 if(!['menu','undo','redo','up','down','close','previous','next'].includes(id))return false;
 c.save();c.translate(x,y);c.strokeStyle=c.fillStyle;c.lineWidth=2;c.lineCap='round';c.lineJoin='round';c.beginPath();
 if(id==='menu'){for(const yy of [-6,0,6]){c.moveTo(-8,yy);c.lineTo(8,yy);}}
 else if(id==='close'){c.moveTo(-6,-6);c.lineTo(6,6);c.moveTo(6,-6);c.lineTo(-6,6);}
 else if(id==='undo'||id==='redo'){if(id==='redo')c.scale(-1,1);c.moveTo(-8,-4);c.lineTo(2,-4);c.bezierCurveTo(12,-4,12,8,2,8);c.moveTo(-3,-9);c.lineTo(-8,-4);c.lineTo(-3,1);}
 else if(id==='up'||id==='down'){if(id==='down')c.scale(1,-1);c.moveTo(0,9);c.lineTo(0,-9);c.moveTo(-6,-3);c.lineTo(0,-9);c.lineTo(6,-3);}
 else{if(id==='next')c.scale(-1,1);c.moveTo(3,-7);c.lineTo(-4,0);c.lineTo(3,7);}
 c.stroke();c.restore();return true;
}
export function paintHUD(c,layout,{focus='',pressed='',images=new Map()}={}){
 for(const line of layout.lines||[]){c.strokeStyle=line.color;c.lineWidth=3;c.beginPath();c.moveTo(line.x,line.y);c.lineTo(line.x2,line.y2);c.stroke();}
 for(const panel of layout.panels)box(c,panel,'rgba(13,18,21,.97)','#4c585e');
 c.textBaseline='middle';c.textAlign='center';
 for(const b of layout.buttons){
  c.globalAlpha=b.disabled?.42:1;
  const active=b.selected||b.accent;
  box(c,b,active?'#d7ff58':'rgba(13,18,21,.9)',focus===b.id||pressed===b.id?'#ffffff':'#596268');
  if(focus===b.id){c.strokeStyle='#fff';c.lineWidth=2;c.stroke();}
  const img=b.thumbnail&&images.get(b.thumbnail);
  if(img)c.drawImage(img,b.x+7,b.y+3,b.w-14,b.h-22);
  c.fillStyle=active?'#11170d':'#edf1f2';c.font=`600 ${b.label.length>10?11:12}px system-ui, sans-serif`;
  if(!icon(c,b.id,b.x+b.w/2,b.y+b.h/2))c.fillText(b.label,b.x+b.w/2,b.y+(img?b.h-10:b.h/2),b.w-10);
 }
 c.globalAlpha=1;
 for(const l of layout.labels){c.font='600 12px system-ui, sans-serif';c.textAlign=l.align||'center';c.fillStyle='#f0f3f4';c.shadowColor='#000';c.shadowBlur=5;c.fillText(l.text,l.x,l.y,l.maxWidth);c.shadowBlur=0;}
}
export function createBuilderHUD({stage,active,model,action,lift,pause,transform}){
 const canvas=document.createElement('canvas');canvas.id='builderHUD';canvas.setAttribute('aria-hidden','true');stage.appendChild(canvas);
 const access=document.createElement('div');access.className='builder-access';access.setAttribute('role','toolbar');access.setAttribute('aria-label','Map builder tools');stage.appendChild(access);
 const status=document.createElement('span');status.className='builder-access';status.setAttribute('role','status');status.setAttribute('aria-live','polite');stage.appendChild(status);
 const ctx=canvas.getContext('2d'),images=new Map();let layout={buttons:[],panels:[],labels:[]},paintSignature='',imageVersion=0,signature='',focus='',pressed=null,visible=true,w=0,h=0;
 function render(){
  visible=active();canvas.hidden=access.hidden=status.hidden=!visible;if(!visible)return;
  const rect=stage.getBoundingClientRect();w=rect.width;h=rect.height;if(w<1||h<1)return;
  const scale=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(w*scale)||canvas.height!==Math.round(h*scale)){canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);}
  const m=model(),style=getComputedStyle(stage),insets=Object.fromEntries(['left','right','top','bottom'].map(k=>[k,parseFloat(style.getPropertyValue('--builder-safe-'+k))||0]));layout=hudLayout(w,h,m,insets);
  if(m.gizmo&&!m.panel){layout.lines=[];const {origin,axes}=m.gizmo;for(const a of axes){const b={id:'axis-'+a.axis,label:a.label,x:a.end.x-22,y:a.end.y-22,w:44,h:44,axis:a.axis,origin,dx:a.end.x-origin.x,dy:a.end.y-origin.y,length:a.length};if(b.x<80||b.x+b.w>w-100||b.y<70||b.y+b.h>h-160||layout.buttons.some(r=>b.x<r.x+r.w&&b.x+b.w>r.x&&b.y<r.y+r.h&&b.y+b.h>r.y))continue;layout.lines.push({x:origin.x,y:origin.y,x2:a.end.x,y2:a.end.y,color:a.color});layout.buttons.push(b);}}
  for(const b of layout.buttons)if(b.thumbnail&&!images.has(b.thumbnail)){const img=new Image();images.set(b.thumbnail,img);img.onload=()=>{imageVersion++;render();};img.src=b.thumbnail;}
  const paintKey=JSON.stringify([w,h,scale,layout,focus,pressed?.id,imageVersion]);if(paintKey===paintSignature)return;paintSignature=paintKey;ctx.setTransform(scale,0,0,scale,0,0);ctx.clearRect(0,0,w,h);paintHUD(ctx,layout,{focus,pressed:pressed?.id,images});
  const announcement=m.panel?[m.panel.title,m.panel.description,m.panel.value].filter(Boolean).join('. '):m.tip||'';if(status.textContent!==announcement)status.textContent=announcement;
  if(!layout.buttons.some(b=>b.id===focus&&!b.disabled))focus='';
  const sig=layout.buttons.map(b=>[b.id,b.label,!!b.disabled,!!b.selected].join(':')).join('|');
  if(signature!==sig){signature=sig;const hadFocus=access.contains(stage.getRootNode().activeElement);access.replaceChildren(...layout.buttons.map(b=>{const el=document.createElement('button');el.textContent=b.aria||b.label;el.dataset.hud=b.id;el.disabled=!!b.disabled;el.setAttribute('aria-pressed',String(!!b.selected));el.onclick=()=>{if(b.hold)action(b.hold>0?'fly-step-up':'fly-step-down');else action(b.id);render();};el.onfocus=()=>{focus=b.id;pause?.();render();};return el;}));if(hadFocus)access.querySelector(`[data-hud="${focus}"]`)?.focus();}
 }
 function point(ev){const r=stage.getBoundingClientRect();return{x:ev.clientX-r.left,y:ev.clientY-r.top};}
 function stop(ev){ev.preventDefault();ev.stopImmediatePropagation();}
 function down(ev){
  if(!active()||ev.button>0||ev.composedPath().some(n=>n!==canvas&&n!==stage&&n?.matches?.('button,input')))return;
  // A locked mouse controls the crosshair, never buttons underneath it.
  if(stage.getRootNode().pointerLockElement||document.pointerLockElement)return;
  render();const p=point(ev),b=[...layout.buttons].reverse().find(b=>inside(p,b));
  if(!b&&!model().panel)return;stop(ev);if(pressed||b?.disabled)return;
  pressed={id:b?.id||'',pointer:ev.pointerId,hold:b?.hold||0,start:p,handle:b?.axis?b:null};stage.setPointerCapture(ev.pointerId);if(b?.hold)lift(b.hold);else pause?.();if(b?.axis)transform?.('start',b.axis,0);render();
 }
 function release(ev,cancel=false){if(!pressed||ev.pointerId!==pressed.pointer)return;stop(ev);const p=pressed;pressed=null;lift(0);if(stage.hasPointerCapture?.(ev.pointerId))stage.releasePointerCapture(ev.pointerId);if(p.handle)transform?.(cancel?'cancel':'end',p.handle.axis,0);else if(!cancel&&!p.hold){const b=layout.buttons.find(b=>b.id===p.id);if(b&&!b.disabled&&inside(point(ev),b))action(p.id);}render();}
 function move(ev){if(pressed?.pointer!==ev.pointerId)return;stop(ev);const b=pressed.handle;if(!b)return;const p=point(ev),dx=p.x-pressed.start.x,dy=p.y-pressed.start.y;const delta=b.axis==='rotation'?dx*.75:(dx*b.dx+dy*b.dy)/Math.max(1,b.dx*b.dx+b.dy*b.dy)*b.length;transform?.('move',b.axis,delta);render();}
 const up=ev=>release(ev),cancel=ev=>release(ev,true);
 stage.addEventListener('pointerdown',down,true);stage.addEventListener('pointermove',move,true);stage.addEventListener('pointerup',up,true);stage.addEventListener('pointercancel',cancel,true);stage.addEventListener('lostpointercapture',cancel,true);
 const reset=()=>{if(pressed?.handle)transform?.('cancel',pressed.handle.axis,0);pressed=null;lift(0);render();};window.addEventListener('blur',reset);
 const observer=new ResizeObserver(render);observer.observe(stage);
 function controller(frame){
  const p=frame.pressed||[];if(!model().panel)return false;
  render();const list=layout.buttons.filter(b=>!b.disabled);let i=list.findIndex(b=>b.id===focus);if(i<0)i=list[0]?.id==='close'&&list.length>1?1:0;
  if(p[B.B]||p[B.MENU])action('close');else if(p[B.A])action(list[i]?.id);else{
   const dx=p[B.DPAD_RIGHT]?1:p[B.DPAD_LEFT]?-1:0,dy=p[B.DPAD_DOWN]?1:p[B.DPAD_UP]?-1:0;
   if((dx||dy)&&list[i]){const a=list[i],ax=a.x+a.w/2,ay=a.y+a.h/2;let best=null,score=Infinity;
    for(const b of list){const x=b.x+b.w/2-ax,y=b.y+b.h/2-ay;if(dx*x+dy*y<=1)continue;const n=Math.hypot(x,y)+Math.abs(dx?y:x)*2;if(n<score){score=n;best=b;}}if(best)i=list.indexOf(best);
   }focus=list[i]?.id||'';
  }render();return true;
 }
 function key(ev){const map={ArrowLeft:B.DPAD_LEFT,ArrowRight:B.DPAD_RIGHT,ArrowUp:B.DPAD_UP,ArrowDown:B.DPAD_DOWN,Enter:B.A,Escape:B.B};if(!(ev.key in map))return false;const pressed=[];pressed[map[ev.key]]=true;return controller({pressed});}

 return {render,controller,key,reset,get layout(){return layout;},destroy(){observer.disconnect();window.removeEventListener('blur',reset);for(const [event,fn]of [['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',cancel],['lostpointercapture',cancel]])stage.removeEventListener(event,fn,true);canvas.remove();access.remove();status.remove();}};
}
