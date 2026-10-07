/*
 * Breach native menu scene renderer.
 *
 * This module owns layout, paint, clipping, scrolling and hit geometry. The
 * widget graph is a semantic/control model; no DOM/CSS measurement is used.
 * All dimensions below are logical pixels. Browser canvas scaling is applied
 * once at the output boundary. Keep the same graph for touch, mouse, keyboard,
 * controller and accessibility rather than introducing parallel UI layouts.
 */
import { THEME, drawPanel, drawButton, drawLabel } from './native-ui.js?v=2.14.1';
import { NATIVE_SCREEN_IDS } from './native-screen-tree.js?v=2.14.1';
import { APP_VERSION } from './game-config.js?v=2.14.1';

const C = Object.freeze({
  bg:THEME.bg, surface:THEME.panel, raised:THEME.panelRaised, line:THEME.border,
  text:THEME.text, muted:THEME.muted, dim:'#657580', lime:THEME.accent,
  green:'#70e49a', blue:'#79baff', red:'#ff6973', selected:'#192016',
  ...(THEME?.native || {})
});
const ZERO = Object.freeze({x:0,y:0,left:0,top:0,width:0,height:0,right:0,bottom:0});
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const rect=(x,y,width,height)=>({x,y,left:x,top:y,width:Math.max(0,width),height:Math.max(0,height),right:x+Math.max(0,width),bottom:y+Math.max(0,height)});
const inside=(r,x,y)=>!!r&&x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;
const intersect=(a,b)=>{if(!a)return b;if(!b)return a;const x=Math.max(a.left,b.left),y=Math.max(a.top,b.top),r=Math.min(a.right,b.right),d=Math.min(a.bottom,b.bottom);return r>x&&d>y?rect(x,y,r-x,d-y):null;};
const cls=(n,c)=>!!n?.classList?.contains(c);
const attr=(n,k)=>n?.getAttribute?.(k);
const kind=n=>String(n?.kind||n?.localName||n?.tagName||'').toLowerCase();
const children=n=>Array.from(n?.children||[]);
const ownText=n=>Array.from(n?.childNodes||[]).filter(c=>c.nodeType===3).map(c=>c.textContent||c.data||'').join(' ').trim();
const text=n=>String(n?.textContent||'').replace(/\s+/g,' ').trim();
const shown=n=>!!n&&!n.hidden&&!cls(n,'hide')&&n.visible!==false&&n.style?.display!=='none';
const enabled=n=>shown(n)&&!n.disabled&&attr(n,'aria-disabled')!=='true';
const control=n=>!!n?.dataset?.gameControl;
const interactive=n=>['button','input','select','textarea'].includes(kind(n))||control(n)||['button','switch','slider','combobox','spinbutton','tab'].includes(attr(n,'role'))||n?.dataset?.controllerKey;
const hiddenDecoration=n=>['svg','use','path','circle','rect','defs','symbol','i'].includes(kind(n))||cls(n,'controller-menu-hint')||cls(n,'loadout-preview-hint')||cls(n,'chat-caret')||cls(n,'lobby-version')||cls(n,'native-host-actions')||cls(n,'native-pager-control');
const label=n=>text(n)||attr(n,'aria-label')||n?.dataset?.placeholder||'';
const visibleChildren=n=>children(n).filter(c=>shown(c)&&!hiddenDecoration(c));

/** Safe-area contract is injectable for hosts and deterministic QA. */
export function computeNativeViewport(width,height,safeArea={}) {
  const w=Math.max(240,num(width,1280)),h=Math.max(240,num(height,800));
  const portrait=w<h&&w<700,landscape=w>h&&h<540,compact=portrait||landscape;
  // Honor real cutout insets. Do not reserve a fictional notch on every phone.
  const safe={top:Math.max(num(safeArea.top),portrait?20:0),right:Math.max(0,num(safeArea.right)),bottom:Math.max(num(safeArea.bottom),compact?8:0),left:Math.max(0,num(safeArea.left))};
  const margin=portrait?16:landscape?0:32;
  const available=w-safe.left-safe.right-margin*2;
  const contentWidth=Math.min(1056,Math.max(200,available));
  return {width:w,height:h,portrait,landscape,compact,safe,content:rect(safe.left+(w-safe.left-safe.right-contentWidth)/2,safe.top,contentWidth,h-safe.top-safe.bottom),target:48,secondaryTarget:44};
}

export function createNativeRenderer({canvas,ui,onAfterAction=()=>{},inputOwner=null,safeArea={},menuScene=null,getNotice=()=>null}={}) {
  if(!canvas||!ui)throw new TypeError('Native renderer requires canvas and widget graph');
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw new Error('Canvas 2D is unavailable');
  let vp=computeNativeViewport(globalThis.innerWidth||canvas.width||1280,globalThis.innerHeight||canvas.height||800,safeArea);
  let dpr=1,dirty=true,disposed=false,frame=0,lastRevision=-1,lastScreen='',hover=null,lastNoticeKey='',lastMenuFrame=0;
  let hits=[],scrolls=[],painted=[],activeScreen=null,pointer=null,clip=null;
  const previewPointers=new Map();
  const artwork=new Map(),pages=new WeakMap(),details=new WeakMap();
  globalThis.document?.fonts?.load('700 28px "Breach Display"').then(()=>{dirty=true;}).catch(()=>{});
  const removers=[],allNodes=new Set(),expandedRows=new WeakSet(),previousRects=new WeakMap();
  const get=id=>ui.getElementById(id);
  const q=(selector,root=ui.root)=>root?.querySelector?.(selector);
  const qa=(selector,root=ui.root)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const viewRect=()=>rect(0,0,vp.width,vp.height);

  function mark(n,r,style={}) {
    if(!n)return;
    n.setRect?.(r);if(!n.setRect)n._rect=r;
    n.layoutClip=clip?{...clip}:viewRect();
    n.layoutStyle={display:'block',visibility:'visible',fontSize:'14px',lineHeight:'20px',...style};
    allNodes.add(n);painted.push(n);
  }
  function zero(n){if(!n)return;n.setRect?.(ZERO);if(!n.setRect)n._rect=ZERO;n.layoutClip=null;for(const c of children(n))zero(c);}
  function markAncestors(n,r){for(let a=n?.parentElement;a&&a!==ui.root;a=a.parentElement){const old=a._rect||ZERO;const union=old.width?rect(Math.min(old.left,r.left),Math.min(old.top,r.top),Math.max(old.right,r.right)-Math.min(old.left,r.left),Math.max(old.bottom,r.bottom)-Math.min(old.top,r.top)):r;mark(a,union);}}
  function round(r,radius=4){const k=Math.min(radius,r.width/2,r.height/2);ctx.beginPath();if(ctx.roundRect)ctx.roundRect(r.left,r.top,r.width,r.height,k);else{ctx.moveTo(r.left+k,r.top);ctx.lineTo(r.right-k,r.top);ctx.quadraticCurveTo(r.right,r.top,r.right,r.top+k);ctx.lineTo(r.right,r.bottom-k);ctx.quadraticCurveTo(r.right,r.bottom,r.right-k,r.bottom);ctx.lineTo(r.left+k,r.bottom);ctx.quadraticCurveTo(r.left,r.bottom,r.left,r.bottom-k);ctx.lineTo(r.left,r.top+k);ctx.quadraticCurveTo(r.left,r.top,r.left+k,r.top);}ctx.closePath();}
  function panel(r,fill=C.surface,stroke=null,radius=4){if(!r||r.width<=0||r.height<=0)return;drawPanel(ctx,r,{fill,stroke,radius});}
  function line(x,y,x2,y2,color=C.line,width=1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  function font(size=14,weight=500,mono=false){weight=Math.round(weight/100)*100;ctx.font=`${weight} ${size}px ${mono?'ui-monospace, SFMono-Regular, monospace':'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'}`;}
  function splitLines(value,width,size=14,weight=500,maxLines=99){font(size,weight);const words=String(value).split(/\s+/),out=[];let row='';for(const word of words){if(!word)continue;const candidate=row?`${row} ${word}`:word;if(ctx.measureText(candidate).width<=width){row=candidate;continue;}if(row){out.push(row);row='';}if(ctx.measureText(word).width<=width){row=word;continue;}for(const char of Array.from(word)){if(row&&ctx.measureText(row+char).width>width){out.push(row);row=char;}else row+=char;}}if(row)out.push(row);const visible=out.slice(0,maxLines);if(out.length>maxLines&&visible.length){let last=visible[visible.length-1];while(last&&ctx.measureText(last+'…').width>width)last=last.slice(0,-1);visible[visible.length-1]=last.trimEnd()+'…';}return visible;}
  function txt(value,x,y,width,size=14,color=C.text,weight=500,{maxLines=1,lineHeight=size*1.35,align='left',mono=false}={}) {
    const rows=splitLines(value,Math.max(1,width),size,weight,maxLines);font(size,weight,mono);ctx.fillStyle=color;ctx.textBaseline='top';ctx.textAlign=align;
    rows.forEach((row,i)=>drawLabel(ctx,row,rect(x,y+i*lineHeight,width,lineHeight),{fontSize:size,weight:Math.round(weight/100)*100,color,align,valign:'top',font:mono?'ui-monospace, SFMono-Regular, monospace':THEME.font}));
    ctx.textAlign='left';return rows.length*lineHeight;
  }
  function arrow(r,color=C.text){const x=r.right-24,y=r.top+r.height/2;line(x-10,y,x+4,y,color,2);line(x-2,y-6,x+4,y,color,2);line(x-2,y+6,x+4,y,color,2);}
  function icon(name,r,color=C.text){const x=r.left+r.width/2,y=r.top+r.height/2;ctx.strokeStyle=color;ctx.lineWidth=2;if(/settings/i.test(name)){ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;line(x+Math.cos(a)*9,y+Math.sin(a)*9,x+Math.cos(a)*12,y+Math.sin(a)*12,color,2);}}else if(/mute|sound|audio/i.test(name)){line(x-9,y-4,x-4,y-4,color,2);line(x-4,y-4,x+2,y-9,color,2);line(x+2,y-9,x+2,y+9,color,2);line(x+2,y+9,x-4,y+4,color,2);line(x-4,y+4,x-9,y+4,color,2);line(x-9,y+4,x-9,y-4,color,2);if(/mute/i.test(name)){line(x+6,y-4,x+12,y+4,color,2);line(x+6,y+4,x+12,y-4,color,2);}else{ctx.beginPath();ctx.arc(x+2,y,8,-.7,.7);ctx.stroke();}}else if(/close/i.test(name)){line(x-6,y-6,x+6,y+6,color,2);line(x-6,y+6,x+6,y-6,color,2);}else txt('›',r.left,r.top+7,r.width,25,color,500,{align:'center'});}
  function hit(n,r,{action=null,scroll=null,disabled=false}={}){const clipped=intersect(r,clip||viewRect());if(!n||!clipped||clipped.width<1||clipped.height<1||disabled||!enabled(n))return;hits.push({node:n,rect:clipped,fullRect:r,action,scroll,screen:activeScreen});}
  function focusRing(n,r){if(n===ui.activeElement&&get('appRoot')?.dataset.inputMode!=='touch')panel(rect(r.left-3,r.top-3,r.width+6,r.height+6),null,C.lime,6);}
  function button(n,r,options={}) {
    if(!n||!shown(n))return;mark(n,r);const primary=options.primary??(cls(n,'primary')||n.id==='enterFullscreenBtn'),active=options.active??(cls(n,'active')||attr(n,'aria-pressed')==='true'||attr(n,'aria-selected')==='true');const disabled=!enabled(n);
    const isTab=options.tab||attr(n,'role')==='tab';const fill=primary?C.lime:active?C.selected:C.raised;
    ctx.save();if(disabled)ctx.globalAlpha=.4;drawButton(ctx,r,{text:'',fill:isTab?'transparent':primary?C.lime:active?'#283326':C.raised,stroke:isTab||!active?null:C.lime,radius:0});if(!isTab&&active)panel(rect(r.left,r.top,2,r.height),C.lime,null,0);if(n===hover&&!disabled)panel(r,'rgba(255,255,255,.045)',null,2);const color=primary?'#111605':cls(n,'danger')?C.red:active?C.lime:C.text;
    const caption=options.label??label(n);const aria=attr(n,'aria-label')||'';
    if(options.iconOnly||(!text(n)&&aria&&r.width<=56))icon(aria,r,color);
    else if(options.compactCard&&q('strong',n)){txt(text(q('strong',n)),r.left+8,r.top+8,r.width-16,11,color,700);txt(text(q('small',n)),r.left+8,r.top+26,r.width-16,8,C.muted,500,{maxLines:3,lineHeight:11});}
    else if(!options.plain&&(cls(n,'class-item-card')||cls(n,'loadout-choice')||cls(n,'killstreak-choice')||cls(n,'loadout-class-main')||q('strong',n)&&q('small',n)))drawCardLabel(n,r,color);
    else {const size=options.fontSize||(isTab&&vp.compact?13:14),maxLines=options.maxLines||(isTab?1:2),padding=isTab||r.width<=72?4:12,available=Math.max(8,r.width-(options.arrow?56:padding*2)),rows=splitLines(caption,available,size,650,maxLines);const th=rows.length*size*1.2;txt(caption,r.left+padding,r.top+(r.height-th)/2,available,size,color,650,{maxLines,lineHeight:size*1.2,align:options.center||isTab?'center':'left'});}
    if(options.arrow)arrow(r,color);if(isTab&&active){line(r.left+8,r.bottom-1,r.right-8,r.bottom-1,C.lime,3);fade(r,'rgba(200,235,105,0)','rgba(200,235,105,.08)');};ctx.restore();focusRing(n,r);hit(n,r,{action:options.action});
    // Descendant labels share the button geometry for semantic focus anchors.
    for(const c of children(n))if(!interactive(c)&&kind(c)!=='canvas')mark(c,r);
  }
  function streakIcon(name,r,color){
    const x=r.left+r.width/2,y=r.top+r.height/2;ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1.6;
    ctx.globalAlpha=.12;ctx.beginPath();ctx.arc(x,y,26,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    if(/ufo/i.test(name)){ctx.beginPath();ctx.ellipse(x,y,23,7,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y-3,11,Math.PI,0);ctx.stroke();for(let i=-1;i<=1;i++)line(x+i*8,y+10,x+i*13,y+23,color,1);}
    else if(/lightning|storm/i.test(name)){ctx.beginPath();ctx.moveTo(x+5,y-22);ctx.lineTo(x-13,y+3);ctx.lineTo(x-2,y+3);ctx.lineTo(x-6,y+23);ctx.lineTo(x+15,y-6);ctx.lineTo(x+3,y-6);ctx.closePath();ctx.stroke();}
    else if(/asteroid/i.test(name)){ctx.beginPath();ctx.arc(x-6,y+7,11,0,Math.PI*2);ctx.stroke();for(let i=0;i<3;i++)line(x+i*8-5,y-8,x+i*8+9,y-23,color,1.6);}
    else if(/earth/i.test(name)){for(let j=-1;j<=1;j++){ctx.beginPath();ctx.moveTo(x-25,y+j*12);ctx.lineTo(x-9,y+j*12);ctx.lineTo(x-3,y+j*12-6);ctx.lineTo(x+5,y+j*12+6);ctx.lineTo(x+12,y+j*12);ctx.lineTo(x+25,y+j*12);ctx.stroke();}}
    else{ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;line(x+Math.cos(a)*16,y+Math.sin(a)*16,x+Math.cos(a)*24,y+Math.sin(a)*24,color,1.6);}}
    ctx.restore();
  }
  function drawCardLabel(n,r,color){
    if(cls(n,'killstreak-choice')){
      const selected=attr(n,'aria-pressed')==='true',head=q('strong',n),top=q('.killstreak-choice-top',n),sub=q('small',n);
      txt(text(top),r.left+12,r.top+10,r.width-24,9,selected?C.lime:C.muted,700);
      streakIcon(n.dataset.killstreakChoice,rect(r.left+12,r.top+33,r.width-24,44),selected?C.lime:C.muted);
      txt(text(head),r.left+12,r.top+86,r.width-24,12,C.text,800,{maxLines:2,lineHeight:15});
      txt(text(sub),r.left+12,r.top+121,r.width-24,10,C.muted,500,{maxLines:2,lineHeight:13});return;
    }
    const parts=visibleChildren(n).filter(c=>kind(c)!=='canvas'),headline=q('strong',n)||q('h3',n),sub=q('small',n),title=label(headline)||label(n),category=parts.find(c=>kind(c)==='span'&&c!==headline);
    if(cls(n,'loadout-class-main')){const state=q('.loadout-class-card-head span',n),weapons=q('.loadout-class-weapons',n);txt(title,r.left+14,r.top+12,r.width-(text(state)?104:28),15,color,700,{maxLines:1});if(text(state))txt(text(state),r.right-86,r.top+16,72,8,C.lime,700,{align:'right'});let y=r.top+44;for(const weapon of visibleChildren(weapons)){txt(text(weapon),r.left+14,y,r.width-28,11,C.muted,550,{maxLines:2});y+=20;}if(sub)txt(text(sub),r.left+14,r.bottom-24,r.width-28,11,C.muted,500,{maxLines:1});return;}
    const titleY=category&&headline?r.top+32:r.top+12;if(category&&headline)txt(text(category),r.left+14,r.top+12,r.width-28,10,C.muted,700);const lines=txt(title,r.left+14,titleY,r.width-28,15,color,700,{maxLines:2});if(sub&&shown(sub))txt(text(sub),r.left+14,titleY+lines+8,r.width-28,11,C.muted,500,{maxLines:6,lineHeight:15});const preview=q('canvas',n);if(preview)canvasNode(preview,rect(r.left+12,r.top+48,r.width-24,Math.max(36,r.height-62)));
  }
  function withClip(r,fn){const previous=clip;clip=intersect(previous||viewRect(),r);if(!clip){clip=previous;return;}ctx.save();ctx.beginPath();ctx.rect(clip.left,clip.top,clip.width,clip.height);ctx.clip();fn();ctx.restore();clip=previous;}
  function scroll(n,r,total,draw){if(!n)return;const max=Math.max(0,total-r.height),offset=clamp(num(n.scrollTop),0,max);if(offset!==num(n.scrollTop))n.scrollTop=offset;mark(n,r,{overflowY:'auto'});n.scrollHeight=total;n.scrollWidth=r.width;const item={node:n,rect:intersect(r,clip||viewRect()),max,total};scrolls.push(item);withClip(r,()=>draw(r.top-offset));mark(n,r,{overflowY:'auto'});if(max>0){const h=Math.max(28,r.height*r.height/total),y=r.top+(r.height-h)*(offset/max);panel(rect(r.right-3,y,3,h),C.dim,null,2);}}
  function canvasNode(n,r){if(!n||!shown(n))return;mark(n,r);const source=n.source||n.canvas||n;if(source&&source!==canvas){try{ctx.drawImage(source,r.left,r.top,r.width,r.height);}catch{panel(r,'#111a1c',C.line);}}const status=n.dataset?.previewStatus||source?.dataset?.previewStatus;if(status){panel(r,'#111a1c',C.line);txt(status,r.left+16,r.top+r.height/2-10,r.width-32,14,C.muted,500,{maxLines:2,align:'center'});}if(n.dataset?.loadoutPreview||n.dataset?.mapPreview)hit(n,r);}
  function simpleText(n,r,{size=14,color=C.muted,weight=500,maxLines=4}={}){if(!n||!shown(n))return;mark(n,r);txt(text(n),r.left,r.top,r.width,size,color,weight,{maxLines});}
  function brand(x,y,small=false){panel(rect(x,y,32,32),C.lime,null,3);txt('B',x+7,y+1,24,25,'#111605',850);txt('BREACH',x+44,y,220,small?23:24,C.text,800);if(!small)txt('TACTICAL MULTIPLAYER',x+44,y+32,220,10,C.muted,700);}
  function art(name,r,{cover=false,alpha=1}={}){
    let img=artwork.get(name);if(!img&&typeof Image!=='undefined'){img=new Image();artwork.set(name,img);img.onload=()=>{dirty=true;};img.src=new URL('./menu-assets/'+name,import.meta.url).href;}
    if(!img?.complete||!img.naturalWidth)return false;
    const scale=cover?Math.max(r.width/img.width,r.height/img.height):Math.min(r.width/img.width,r.height/img.height),w=img.width*scale,h=img.height*scale;
    ctx.save();ctx.globalAlpha*=alpha;withClip(r,()=>ctx.drawImage(img,r.left+(r.width-w)/2,r.top+(r.height-h)/2,w,h));ctx.restore();return true;
  }
  function heading(value,x,y,w,size=42,color=C.text){ctx.save();ctx.font=`700 ${size}px "Breach Display", "Arial Narrow", sans-serif`;ctx.fillStyle=color;ctx.textBaseline='top';ctx.fillText(String(value),x,y,w);ctx.restore();}
  function fade(r,from,to,horizontal=false){const g=ctx.createLinearGradient(r.left,r.top,horizontal?r.right:r.left,horizontal?r.top:r.bottom);g.addColorStop(0,from);g.addColorStop(1,to);ctx.fillStyle=g;ctx.fillRect(r.left,r.top,r.width,r.height);}
  function selectedMap(){return q('.lobby-map-choice.active')?.dataset?.lobbyMapChoice||'highlands';}
  function sceneArt(r,map=selectedMap(),alpha=1){if(['highlands','depot','yard','rig','moon'].includes(map))return art('world-'+map+'.jpg',r,{cover:true,alpha});const cv=get('lobbyMapPreview')?.source;if(cv){ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(cv,r.left,r.top,r.width,r.height);ctx.restore();return true;}return false;}
  function background(){
    ctx.fillStyle='#0a0e11';ctx.fillRect(0,0,vp.width,vp.height);sceneArt(viewRect(),selectedMap(),.22);
    fade(viewRect(),'rgba(5,9,12,.4)','#090d10');
  }

  function gameControl(n,r){
    mark(n,r);const type=n.dataset.gameControl,disabled=!enabled(n);ctx.save();if(disabled)ctx.globalAlpha=.4;
    if(type==='slider'){
      const track=q('[data-slider-track]',n),fill=q('[data-slider-fill]',n),knob=q('[data-slider-knob]',n);const tr=rect(r.left+12,r.top+r.height/2-3,r.width-24,6),a=num(n.dataset.min),b=num(n.dataset.max,1),v=num(n.value??n.dataset.value,a),ratio=clamp((v-a)/Math.max(.0001,b-a),0,1);panel(tr,C.line,null,3);panel(rect(tr.left,tr.top,tr.width*ratio,tr.height),C.lime,null,3);panel(rect(tr.left+tr.width*ratio-8,r.top+r.height/2-8,16,16),C.lime,null,8);if(track)mark(track,rect(r.left+12,r.top,r.width-24,r.height));if(fill)mark(fill,rect(tr.left,tr.top,tr.width*ratio,6));if(knob)mark(knob,rect(tr.left+tr.width*ratio-22,r.top,44,r.height));hit(n,r);
    }else if(type==='cycle'||type==='stepper'){
      panel(r,C.raised,C.line);hit(n,r);const arrows=qa('[data-control-step]',n),v=q('[data-control-value]',n),aw=Math.min(48,r.width/3);button(arrows[0],rect(r.left,r.top,aw,r.height),{center:true});button(arrows[1],rect(r.right-aw,r.top,aw,r.height),{center:true});if(v)simpleText(v,rect(r.left+aw,r.top+(r.height-18)/2,r.width-aw*2,20),{color:C.text,weight:650,maxLines:1});if(!v)txt(n.value??n.dataset.value??'',r.left+aw,r.top+15,r.width-aw*2,14,C.text,650,{align:'center'});
    }else button(n,r);
    ctx.restore();focusRing(n,r);
  }
  function toggle(n,r){mark(n,r);const yes=attr(n,'aria-checked')==='true'||n.checked||cls(n,'active');panel(r,C.raised,C.line);const tr=rect(r.right-52,r.top+(r.height-26)/2,42,26);panel(tr,yes?C.lime:C.line,null,13);panel(rect(tr.left+(yes?19:3),tr.top+3,20,20),yes?'#111605':C.muted,null,10);if(r.width>90)txt(text(n)||(yes?'On':'Off'),r.left+12,r.top+(r.height-18)/2,r.width-72,14,C.text,600);hit(n,r);focusRing(n,r);}

  // Explicit reusable native layout primitives. Class names below only select
  // semantic component types; no computed style or DOM rectangles are read.
  const GRID_CLASSES=['settings-grid','weapon-fields','lobby-setup-row','lobby-mode-picker','loadout-choice-grid','class-detail-grid','killstreak-choice-grid','lobby-map-choice-grid','admin-weapon-grid','gunsmith-attachment-options'];
  const ROW_CLASSES=['settings-tabs','admin-tabs','lobby-cheat-tabs','lobby-map-gallery-tabs','loadout-view-nav','killstreak-equipped-strip','lobby-map-gallery-actions','pause-actions','attachment-category-tabs','gunsmith-attachment-tabs'];
  function gridColumns(n,w){if(cls(n,'lobby-mode-picker'))return w>600?3:2;if(cls(n,'class-detail-grid'))return w>=330?2:1;if(cls(n,'settings-grid')||cls(n,'weapon-fields')||cls(n,'lobby-setup-row'))return w>650?2:1;if(cls(n,'lobby-map-choice-grid'))return w>780?3:w>470?2:1;if(cls(n,'killstreak-choice-grid'))return w>850?3:w>=330?2:1;if(cls(n,'loadout-choice-grid'))return w>800?3:w>420?2:1;return w>650?2:1;}
  function isRow(n){return ROW_CLASSES.some(c=>cls(n,c))||attr(n,'role')==='tablist';}
  function isGrid(n){return GRID_CLASSES.some(c=>cls(n,c));}
  function naturalHeight(n,w){
    if(!shown(n)||hiddenDecoration(n))return 0;
    if(cls(n,'killstreak-equipped-strip'))return 86;
    if(cls(n,'killstreak-equipped-slot'))return 86;
    if(control(n)||interactive(n)){if(cls(n,'class-item-card'))return 96;if(cls(n,'loadout-class-main'))return 124;if(cls(n,'killstreak-choice'))return 156;if(q('canvas',n))return 146;if(q('strong',n)&&q('small',n))return Math.max(84,56+splitLines(text(q('small',n)),w-28,11,500).length*15);return 48;}
    if(kind(n)==='canvas')return clamp(w*.5,140,280);
    if(cls(n,'setting')||kind(n)==='label'){const c=visibleChildren(n),field=c.find(x=>interactive(x));if(field)return attr(field,'role')==='switch'?64:88;}
    if(cls(n,'loadout-class-card'))return 112;
    if(cls(n,'loadout-class-list'))return Math.ceil(children(n).filter(shown).length/(w>850?3:w>580?2:1))*120;
    if(cls(n,'loadout-focus-stage')){const count=qa('[data-callout-slot]',n).length;return clamp(w*.55,180,310)+(count?Math.ceil(count/(w>650?3:2))*52+8:0);}if(cls(n,'loadout-stat-row'))return Math.ceil(visibleChildren(n).length/(w>600?3:2))*66;
    if(cls(n,'gunsmith-layout')){const c=visibleChildren(n);return w>740?Math.max(...c.map(x=>naturalHeight(x,(w-24)/2)),0):c.reduce((s,x)=>s+naturalHeight(x,w)+16,0);}
    if(isGrid(n)){const c=visibleChildren(n),cols=gridColumns(n,w),cw=(w-12*(cols-1))/cols;let h=0;for(let i=0;i<c.length;i+=cols)h+=Math.max(...c.slice(i,i+cols).map(x=>naturalHeight(x,cw)),0)+12;return Math.max(0,h-12);}
    if(isRow(n)){const c=visibleChildren(n);if(!c.length)return 0;const cols=Math.min(c.length,Math.max(1,Math.floor((w+8)/132))),cw=(w-8*(cols-1))/cols;let h=0;for(let i=0;i<c.length;i+=cols)h+=Math.max(44,...c.slice(i,i+cols).map(a=>interactive(a)?44:naturalHeight(a,cw)))+8;return Math.max(0,h-8);}
    const c=visibleChildren(n);if(!c.length){const t=text(n);if(!t)return 0;const size=/^h[1-6]$/.test(kind(n))?kind(n)==='h1'?28:20:kind(n)==='small'?11:14;return Math.max(size*1.4,splitLines(t,w,size,500).length*size*1.35)+8;}
    return c.reduce((h,x)=>h+naturalHeight(x,w)+(naturalHeight(x,w)?8:0),ownText(n)?28:0);
  }
  function flow(n,x,y,w){
    if(!shown(n)||hiddenDecoration(n))return 0;const h=naturalHeight(n,w),r=rect(x,y,w,h);mark(n,r);if(!h)return 0;
    if(control(n)){gameControl(n,r);return h;}if(attr(n,'role')==='switch'){toggle(n,r);return h;}
    if(interactive(n)){button(n,r);return h;}if(kind(n)==='canvas'){canvasNode(n,r);return h;}
    const c=visibleChildren(n);
    if(cls(n,'setting')||kind(n)==='label'){
      const field=c.find(x=>interactive(x));if(field){const caption=ownText(n)||text(c.find(x=>x!==field&&kind(x)!=='output'));const output=c.find(x=>kind(x)==='output');if(attr(field,'role')==='switch'){txt(caption,x,y+22,w-102,14,C.text,550,{maxLines:2});toggle(field,rect(x+w-84,y+8,84,48));}else{txt(caption,x,y+4,w-(output?76:0),14,C.text,550,{maxLines:1});if(output)simpleText(output,rect(x+w-72,y+4,72,20),{color:C.lime,weight:600,maxLines:1});flow(field,x,y+30,w);}for(const t of c)if(t!==field&&t!==output)mark(t,rect(x,y,w-90,24));return h;}
    }
    if(cls(n,'killstreak-equipped-strip')){const cw=(w-12)/3;c.forEach((a,i)=>flow(a,x+i*(cw+6),y,cw));return h;}
    if(cls(n,'killstreak-equipped-slot')){panel(r,C.surface,C.line,2);panel(rect(x,y,2,h),C.lime,null,0);txt(text(q('.kill-count',n)),x+10,y+8,w-20,22,C.lime,800);txt(text(q('strong',n)),x+10,y+38,w-20,10,C.text,700,{maxLines:2,lineHeight:13});txt('SLOT '+(n.dataset.slot||''),x+10,y+70,w-20,8,C.dim,700);return h;}
    if(cls(n,'loadout-class-list')){const cols=w>850?3:w>580?2:1,cw=(w-8*(cols-1))/cols;c.forEach((a,i)=>flow(a,x+i%cols*(cw+8),y+Math.floor(i/cols)*120,cw));return h;}
    if(cls(n,'loadout-class-card')){panel(r,C.surface,C.line);const main=q('.loadout-class-main',n),edit=q('.loadout-class-edit',n);if(main)button(main,rect(x,y,w-60,h));if(edit)button(edit,rect(x+w-52,y+(h-48)/2,44,48),{label:'Edit',fontSize:12,center:true});return h;}
    if(cls(n,'loadout-focus-stage')){
      const ch=clamp(w*.55,180,310),cv=q('canvas',n),cr=rect(x,y,w,ch);panel(cr,'#0b1114',C.line);canvasNode(cv,cr);txt('DRAG TO ROTATE',cr.left+12,cr.bottom-24,Math.max(50,cr.width-100),10,C.dim,650,{maxLines:1});const ads=q('[data-loadout-ads-preview]',n);if(ads)button(ads,rect(cr.right-68,cr.bottom-56,56,44),{center:true});const callouts=q('[data-gunsmith-callouts]',n);if(callouts){const controls=qa('[data-callout-slot]',callouts).filter(shown),cols=w>650?3:2,cw=(w-8*(cols-1))/cols;mark(callouts,rect(x,y+ch+8,w,Math.ceil(controls.length/cols)*52),{display:'grid',gridTemplateColumns:Array(cols).fill('1fr').join(' ')});if(!cls(callouts,'ads-hidden'))controls.forEach((b,i)=>button(b,rect(x+i%cols*(cw+8),y+ch+8+Math.floor(i/cols)*52,cw,44),{label:`${text(q('span',b))} · ${text(q('strong',b))}`,fontSize:12,center:true}));}return h;
    }
    if(cls(n,'loadout-stat-row')){const cols=w>600?3:2,cw=(w-12*(cols-1))/cols;mark(n,r,{display:'grid',gridTemplateColumns:Array(cols).fill('1fr').join(' ')});c.forEach((stat,i)=>{const sr=rect(x+(i%cols)*(cw+12),y+Math.floor(i/cols)*66,cw,58);mark(stat,sr);const head=q('.loadout-stat-head',stat),name=q('span',head),value=q('strong',head),change=q('.loadout-stat-delta',stat),bar=q('.loadout-stat-bar',stat),solid=q('.loadout-stat-bar-solid',bar),hatch=q('.loadout-stat-bar-hatch',bar),baseline=q('.loadout-stat-baseline-mark',bar);txt(text(name),sr.left,sr.top,sr.width-50,10,C.muted,700);txt(text(value),sr.right-50,sr.top,50,12,C.text,700,{align:'right'});if(text(change))txt(text(change),sr.left,sr.top+20,sr.width,10,cls(stat,'better')?C.green:C.red,700);const br=rect(sr.left,sr.bottom-8,sr.width,5);panel(br,C.line,null,1);if(solid)panel(rect(br.left,br.top,br.width*clamp(parseFloat(solid.style.width)/100,0,1),5),C.muted,null,1);if(hatch)panel(rect(br.left+br.width*parseFloat(hatch.style.left)/100,br.top,br.width*parseFloat(hatch.style.width)/100,5),cls(hatch,'gain')?C.green:C.red,null,1);if(baseline){const bx=br.left+br.width*parseFloat(baseline.style.left)/100;line(bx,br.top-2,bx,br.bottom+2,C.text);} });return h;}
    if(cls(n,'gunsmith-layout')&&w>740){const cw=(w-24)/2;c.forEach((a,i)=>flow(a,x+i*(cw+24),y,cw));return h;}
    if(isGrid(n)){const cols=gridColumns(n,w),cw=(w-12*(cols-1))/cols;mark(n,r,{display:'grid',gridTemplateColumns:Array(cols).fill('1fr').join(' ')});let yy=y;for(let i=0;i<c.length;i+=cols){const row=c.slice(i,i+cols),rh=Math.max(...row.map(a=>naturalHeight(a,cw)),0);row.forEach((a,j)=>flow(a,x+j*(cw+12),yy,cw));yy+=rh+12;}return h;}
    if(isRow(n)){const capacity=Math.max(1,Math.floor((w+8)/132)),cols=Math.min(capacity,c.length),cw=(w-8*(cols-1))/Math.max(1,cols);mark(n,r,{display:'grid',gridTemplateColumns:Array(cols).fill('1fr').join(' ')});let yy=y;for(let i=0;i<c.length;i+=cols){const row=c.slice(i,i+cols),rh=Math.max(44,...row.map(a=>interactive(a)?44:naturalHeight(a,cw)));row.forEach((a,j)=>{if(interactive(a))button(a,rect(x+j*(cw+8),yy,cw,44),{tab:attr(n,'role')==='tablist',center:true});else flow(a,x+j*(cw+8),yy,cw);});yy+=rh+8;}return h;}
    if(!c.length){const k=kind(n),size=/^h[1-6]$/.test(k)?k==='h1'?28:20:k==='small'?11:14;simpleText(n,r,{size,color:/^h|strong|b$/.test(k)?C.text:C.muted,weight:/^h|strong|b$/.test(k)?700:500,maxLines:99});return h;}
    let yy=y;if(ownText(n)){txt(ownText(n),x,yy,w,14,C.text,550,{maxLines:2});yy+=28;}for(const child of c){const ch=flow(child,x,yy,w);if(ch)yy+=ch+8;}return h;
  }

  function globalNav(r){const nav=get('nativeGlobalNav');if(!nav)return;mark(nav,r);const list=visibleChildren(nav),each=r.width/Math.max(1,list.length);list.forEach((n,i)=>button(n,rect(r.left+i*each,r.top,each,r.height),{tab:true,center:true,fontSize:vp.portrait?13:14}));}
  function menuScreen(n){
    background();mark(n,viewRect());const b=vp.content,top=vp.safe.top+8;heading('BREACH',b.left,top+6,132,34);const profile=get('nameInput');button(profile,rect(b.right-100,top,100,44),{label:profile?.value||'Player',center:true,fontSize:11});globalNav(rect(b.left+152,top,b.width-264,44));
    const body=rect(b.left,top+58,b.width,Math.max(1,vp.height-vp.safe.bottom-top-66)),leftW=body.width*.46,right=rect(body.left+leftW+24,body.top,body.width-leftW-24,body.height);sceneArt(rect(body.left,body.top,leftW,body.height));fade(rect(body.left,body.top,leftW,body.height),'rgba(6,10,14,.15)','rgba(6,10,14,.98)');
    heading('MULTIPLAYER',body.left+12,body.top+12,leftW-24,36);button(get('createBtn'),rect(body.left+12,body.top+66,leftW-24,48),{label:'HOST MATCH',primary:true,arrow:true,fontSize:14});txt('JOIN YOUR SQUAD',body.left+12,body.top+130,leftW-24,9,C.muted,700);button(get('codeInput'),rect(body.left+12,body.top+152,leftW-96,44),{label:get('codeInput')?.value||'ROOM CODE',fontSize:11});button(get('joinBtn'),rect(body.left+leftW-76,body.top+152,64,44),{label:'Join',center:true,fontSize:11});
    heading('OPEN ROOMS',right.left,right.top+10,right.width-100,25);button(get('refreshBtn'),rect(right.right-90,right.top,90,44),{label:'Refresh',center:true,fontSize:11});const list=get('matchList'),rows=visibleChildren(list),area=rect(right.left,right.top+54,right.width,Math.max(1,right.height-54)),capacity=Math.max(1,Math.floor((area.height-(rows.length*82>area.height?44:0))/82)),range=pageRange(list,area,rows.length,capacity);mark(list,area);rows.slice(range.start,range.end).forEach((row,i)=>{const rr=rect(area.left,area.top+i*82,area.width,74);if(cls(row,'match')){panel(rr,'rgba(18,27,33,.94)',null,0);txt(text(q('.match-code',row)),rr.left+12,rr.top+10,rr.width-24,16,C.text,700);txt(text(q('.match-meta',row)),rr.left+12,rr.top+36,rr.width-24,10,C.muted,500,{maxLines:2});const join=q('button',row);mark(join,rr);hit(join,rr);}else simpleText(row,rr,{size:12,maxLines:3});});
    const status=get('menuStatus');if(text(status))simpleText(status,rect(body.left+12,body.bottom-28,leftW-24,26),{size:10,color:C.muted,maxLines:2});
  }
  function matchListHeight(n){const rows=visibleChildren(n);return rows.length?rows.reduce((s,row)=>s+(cls(row,'match')?90:52),0):64;}
  function drawMatches(n,r){if(!n)return;mark(n,r);let y=r.top;for(const row of visibleChildren(n)){if(!cls(row,'match')){flow(row,r.left,y,r.width);y+=56;continue;}const rh=82,rr=rect(r.left,y,r.width,rh);mark(row,rr);panel(rr,C.surface,C.line);const code=q('.match-code',row),metas=qa('.match-meta',row),join=q('button',row),title=code?text(code):'Room';txt(title,r.left+16,y+11,r.width-94,15,C.text,700);if(metas[0])txt(text(metas[0]),r.left+16,y+36,r.width-58,11,C.muted,500,{maxLines:2,lineHeight:15});if(metas[1])txt(text(metas[1]),r.right-86,y+12,66,12,C.lime,650,{align:'right'});if(join){mark(join,rr);hit(join,rr);focusRing(join,rr);txt('›',r.right-32,y+41,22,23,C.muted);}for(const c of children(row))if(c!==join)mark(c,rr);y+=90;}n.scrollHeight=Math.max(0,y-r.top);}

  function lobbyTabs(r){const tabRoot=q('.lobby-side-tabs',get('lobbyScreen')),tabs=visibleChildren(tabRoot).filter(t=>!t.id||t.id!=='lobbyCheatsTab');mark(tabRoot,r);const count=tabs.length||1;tabs.forEach((t,i)=>button(t,rect(r.left+i*r.width/count,r.top,r.width/count,44),{tab:true,center:true,label:({players:'Players',match:'Match',map:'Maps',loadout:'Loadout'})[t.dataset?.lobbySideTab]||label(t),fontSize:vp.compact?13:14,active:t.dataset?.lobbySideTab===(activeLobbyTab()==='killstreaks'?'loadout':activeLobbyTab())}));}
  function activeLobbyTab(){const root=get('lobbyScreen');return root?.dataset?.page|| q('[data-lobby-side-tab].active',root)?.dataset?.lobbySideTab||q('[data-lobby-side-view]:not([hidden])',root)?.dataset?.lobbySideView||'players';}
  function lobbyScreen(n){
    background();mark(n,viewRect());const {content:b,portrait,landscape}=vp,active=activeLobbyTab(),players=active==='players',host=shown(get('lobbyStartBtn'));
    const top=vp.safe.top+8,code=text(get('lobbyRoomCode'))||'----';
    button(get('nativeLobbyBackBtn'),rect(b.left,top,44,44),{label:'‹',center:true,fontSize:25});heading('BREACH',b.left+50,top+7,landscape?74:130,landscape?25:30);
    button(get('lobbySettingsBtn'),rect(b.right-44,top,44,44),{iconOnly:true});
    button(get('lobbyCopyBtn'),rect(b.right-124,top,72,44),{label:code+' +',center:true,fontSize:12});mark(get('lobbyRoomCode'),rect(b.right-124,top,72,44));
    const inline=landscape,tabsY=inline?top:top+50;
    lobbyTabs(inline?rect(b.left+132,tabsY,b.width-268,44):rect(b.left,tabsY,b.width,44));
    const footerY=vp.height-vp.safe.bottom-62,body=rect(b.left,tabsY+54,b.width,Math.max(1,footerY-tabsY-64));
    if(players)drawDeployment(body);
    else{
      const view=q(`[data-lobby-side-view="${active}"]`,n);let bodyR=body;
      if(active==='killstreaks'||active==='loadout'&&visibleIn(q('.loadout-class-list',view),view)){
        const tabs=get('nativeLoadoutTabs'),list=visibleChildren(tabs),tw=Math.min(300,body.width);mark(tabs,rect(body.left,body.top,tw,44));
        list.forEach((t,i)=>button(t,rect(body.left+i*tw/2,body.top,tw/2-4,44),{tab:true,center:true,active:(i===0&&active==='loadout')||(i===1&&active==='killstreaks')}));bodyR=rect(body.left,body.top+52,body.width,Math.max(1,body.height-52));
      }
      const hostTab=get('lobbyCheatsTab');
      if(shown(hostTab)&&(active==='match'||active==='cheats')){heading(active==='match'?'MATCH CONFIGURATION':'HOST OPTIONS',bodyR.left,bodyR.top+4,bodyR.width-134,24);button(hostTab,rect(bodyR.right-124,bodyR.top,124,44),{label:'Advanced  ›',fontSize:12,active:active==='cheats'});bodyR=rect(bodyR.left,bodyR.top+52,bodyR.width,Math.max(1,bodyR.height-52));}
      if(active==='cheats'){const fy=bodyR.bottom-60,aw=Math.min(150,(bodyR.width-8)/2);mark(get('nativeLobbyHostActions'),rect(bodyR.left,fy,bodyR.width,60));button(get('lobbyHostApplyBtn'),rect(bodyR.right-aw,fy+8,aw,44),{primary:true,center:true});button(get('lobbyHostCancelBtn'),rect(bodyR.right-aw*2-8,fy+8,aw,44),{center:true});bodyR=rect(bodyR.left,bodyR.top,bodyR.width,Math.max(1,bodyR.height-68));}
      if(active==='killstreaks')drawKillstreakWorkspace(view,bodyR);else if(active==='map')drawMapWorkspace(view,bodyR);else if(active==='match'&&shown(get('lobbyHostSetup')))drawMatchSetup(view,bodyR);else if(active==='loadout')drawLoadoutWorkspace(view,bodyR);else if(view)pagedFlow(view,bodyR);
    }
    fade(rect(0,footerY-12,vp.width,vp.height-footerY+12),'rgba(9,13,16,0)','#090d10');line(b.left,footerY-2,b.right,footerY-2,'#39423c');
    const startW=portrait?b.width:250,startX=portrait?b.left:b.right-startW;
    if(host)button(get('lobbyStartBtn'),rect(startX,footerY+8,startW,48),{primary:true,label:'DEPLOY',arrow:true,fontSize:18});else simpleText(get('lobbyStatus'),rect(startX,footerY+8,startW,48),{size:13,color:C.muted,maxLines:2});
    if(!portrait&&active!=='players'){const wr=rect(b.left,footerY+6,b.width-startW-18,50),n=get('nativeLoadoutEditBtn'),weapon=q('.self',get('lobbyRoster'))?.dataset?.primaryWeapon||'assault';art('weapon-'+weapon+'.png',rect(wr.left,wr.top-8,106,66));txt('LOADOUT  ↗',wr.left+108,wr.top+11,wr.width-108,11,C.text,700);txt('v2.14.1  /  '+code,wr.left+108,wr.top+30,wr.width-108,8,C.muted,600);mark(n,wr);hit(n,wr);focusRing(n,wr);}else if(!portrait){txt('ROOM '+code+'  /  '+(host?'HOST':'SQUAD'),b.left,footerY+20,b.width-startW-24,11,C.muted,600);txt('BREACH  v2.14.1',b.left,footerY+39,b.width-startW-24,8,C.dim,600);}
  }
  function drawDeployment(r){
    const side=vp.landscape||r.width>=650,heroW=side?r.width*.44:r.width,heroH=side?r.height:Math.min(250,Math.max(134,r.height*.40));
    const hero=rect(r.left,r.top,heroW,heroH);sceneArt(hero);fade(hero,'rgba(7,11,14,0)','rgba(7,11,14,.98)');
    const mapButton=q('.lobby-map-choice.active'),mapName=text(q('strong',mapButton))||'HIGHLANDS',mode=(text(get('lobbyGuestMode'))||'TEAM DEATHMATCH').split(' · ')[0];
    txt('MULTIPLAYER  /  '+(shown(get('lobbyStartBtn'))?'HOST':'SQUAD'),hero.left+16,hero.top+14,hero.width-32,9,C.lime,700);
    const titleY=hero.top+Math.max(42,hero.height-(side?180:108));heading(mapName.toUpperCase(),hero.left+16,titleY,hero.width-32,side?56:44);txt(mode.toUpperCase(),hero.left+17,titleY+49,hero.width-34,12,C.text,700);
    txt(text(get('lobbyGuestRules')).replace('Minimap: ','').toUpperCase(),hero.left+17,titleY+72,hero.width-34,9,C.muted,600,{maxLines:2});
    const change=get('nativeChangeMapBtn');button(change,rect(hero.right-96,hero.top+4,88,44),{label:'Map  ↗',fontSize:11,center:true});
    // The title block opens match settings; the map action has its own hit region.
    const edit=get('nativeEditMatchBtn'),er=rect(hero.left+12,titleY,hero.width-24,Math.min(94,hero.bottom-titleY));mark(edit,er);hit(edit,er);focusRing(edit,er);
    const sx=side?r.left+heroW+24:r.left,sy=side?r.top:r.top+heroH+8,sw=side?r.width-heroW-24:r.width;
    const roster=get('lobbyRoster'),bots=get('nativeManageBotsBtn'),teams=get('nativeChangeTeamBtn'),manage=roster?.dataset?.manageBots==='true';
    heading('SQUAD',sx,sy+9,sw-180,23);const canBots=qa('[data-lobby-bot-step]',roster).some(enabled),canTeams=qa('[data-lobby-team-choice]',roster).some(enabled);
    if(canBots)button(bots,rect(sx+sw-174,sy,84,44),{label:manage?'Done':'Bots +',center:true,fontSize:11,active:manage});if(canTeams)button(teams,rect(sx+sw-84,sy,84,44),{label:'Teams',center:true,fontSize:11,active:roster?.dataset?.changeTeam==='true'});
    let ry=sy+46;const difficulty=get('lobbyBotDifficultyWrap'),field=q('[data-game-control]',difficulty);
    if(manage&&shown(difficulty)&&field){const dy=hero.bottom-48;txt('BOT LEVEL',hero.left+10,dy+16,70,8,C.muted,700);gameControl(field,rect(hero.left+80,dy,hero.width-90,44));mark(difficulty,rect(hero.left+10,dy,hero.width-20,44));}
    const rowCount=Math.max(1,...visibleChildren(roster).filter(c=>!cls(c,'native-pager-control')).map(c=>visibleChildren(q('.lobby-team-players',c)).length)),showWeapon=!manage&&rowCount<=1&&r.height>=205,weaponH=showWeapon?80:0,rosterBottom=r.bottom-weaponH-(showWeapon?12:0);
    drawRoster(roster,rect(sx,ry,sw,Math.max(1,rosterBottom-ry)));
    if(showWeapon){const wr=rect(sx,r.bottom-weaponH,sw,weaponH),self=q('.lobby-player.self',roster),name=self?.dataset?.primaryWeapon||'assault',weapon=(text(q('small',self)).split(' · ').at(-1)||'ASSAULT RIFLE');panel(wr,'rgba(16,23,28,.94)',null,0);line(wr.left,wr.top,wr.right,wr.top,'#35413c');txt('YOUR LOADOUT',wr.left+12,wr.top+12,wr.width*.5,9,C.lime,700);heading(weapon,wr.left+12,wr.top+33,wr.width*.55,22);txt('EDIT  ↗',wr.left+12,wr.bottom-19,100,9,C.muted,600);art('weapon-'+name+'.png',rect(wr.left+wr.width*.48,wr.top-6,wr.width*.52,wr.height+12));const n=get('nativeLoadoutEditBtn');mark(n,wr);hit(n,wr);focusRing(n,wr);}
  }
  function pageRange(owner,r,total,capacity){
    capacity=Math.max(1,capacity);let state=pages.get(owner);if(!state){state={page:0,prev:ui.createElement('button'),next:ui.createElement('button')};state.prev.className=state.next.className='native-pager-control';state.prev.textContent='‹';state.next.textContent='›';state.prev.setAttribute('aria-label','Previous page');state.next.setAttribute('aria-label','Next page');state.prev.addEventListener('click',()=>{state.page=Math.max(0,state.page-1);dirty=true;});state.next.addEventListener('click',()=>{state.page++;dirty=true;});pages.set(owner,state);}
    const count=Math.max(1,Math.ceil(total/capacity));state.page=clamp(state.page,0,count-1);
    if(count>1){if(state.prev.parentElement!==owner)owner.append(state.prev,state.next);state.prev.disabled=state.page===0;state.next.disabled=state.page===count-1;button(state.prev,rect(r.right-100,r.bottom-44,44,44),{center:true,fontSize:20});button(state.next,rect(r.right-44,r.bottom-44,44,44),{center:true,fontSize:20});txt(`${state.page+1} / ${count}`,r.left,r.bottom-28,Math.max(30,r.width-112),10,C.muted,600);}
    return{start:state.page*capacity,end:Math.min(total,(state.page+1)*capacity),count};
  }
  function visibleIn(n,root){for(let p=n;p&&p!==root;p=p.parentElement)if(!shown(p))return false;return !!n;}
  function pagedFlow(owner,r){
    const units=[];function collect(n){if(!shown(n)||hiddenDecoration(n)||/^h[1-6]$/.test(kind(n)))return;const kids=visibleChildren(n);if(interactive(n)||control(n)||kind(n)==='label'||cls(n,'setting')||kind(n)==='canvas'){units.push(n);return;}if(!kids.length){if(text(n))units.push(n);return;}kids.forEach(collect);}collect(owner);
    const cols=r.width>=260?2:1,cw=(r.width-12*(cols-1))/cols,rowH=72,rows=Math.max(1,Math.floor(r.height/rowH)),cap=units.length>rows*cols?Math.max(1,Math.floor((r.height-44)/rowH))*cols:rows*cols,range=pageRange(owner,r,units.length,cap);mark(owner,r);
    units.slice(range.start,range.end).forEach((n,i)=>{const cr=rect(r.left+i%cols*(cw+12),r.top+Math.floor(i/cols)*rowH,cw,66);if(kind(n)==='label'||cls(n,'setting')){const field=visibleChildren(n).find(interactive);if(field){const caption=ownText(n)||text(visibleChildren(n).find(a=>a!==field&&kind(a)!=='output'));txt(caption,cr.left,cr.top,cr.width-54,11,C.muted,600);const out=q('output',n);if(out)txt(text(out),cr.right-54,cr.top,54,10,C.lime,600,{align:'right'});if(attr(field,'role')==='switch')toggle(field,rect(cr.left,cr.top+20,cr.width,44));else if(control(field))gameControl(field,rect(cr.left,cr.top+20,cr.width,44));else button(field,rect(cr.left,cr.top+20,cr.width,44));mark(n,cr);return;}}
      if(control(n))gameControl(n,rect(cr.left,cr.top,cr.width,44));else if(interactive(n))button(n,rect(cr.left,cr.top,cr.width,Math.min(66,cr.height)),{fontSize:11,label:text(q('strong',n))||label(n),compactCard:true});else if(kind(n)==='canvas')canvasNode(n,cr);else simpleText(n,cr,{size:/^h/.test(kind(n))?19:11,maxLines:3,color:C.muted});
    });
  }
  function drawLoadoutWorkspace(view,r){
    if(!view)return;mark(view,r);const classes=q('.loadout-class-list',view),classPage=q('.loadout-class-view',view),item=q('.loadout-item-view',view);
    if(visibleIn(classes,view)){
      const cards=visibleChildren(classes),cols=Math.min(5,cards.length),range=pageRange(classes,r,cards.length,cols),cw=(r.width-8*(cols-1))/cols,h=r.height-(range.count>1?48:0);mark(classes,r);
      cards.slice(range.start,range.end).forEach((card,i)=>{const cr=rect(r.left+i*(cw+8),r.top,cw,h),main=q('.loadout-class-main',card),edit=q('.loadout-class-edit',card),active=attr(main,'aria-pressed')==='true';panel(cr,active?'rgba(46,60,35,.8)':'rgba(19,28,34,.95)',null,0);const mr=rect(cr.left,cr.top,cr.width,cr.height-44);mark(card,cr);mark(main,mr);hit(main,mr);focusRing(main,mr);heading(text(q('strong',main)),cr.left+10,cr.top+10,cr.width-20,23);art('weapon-'+(main.dataset.primaryWeapon||'assault')+'.png',rect(cr.left-8,cr.top+28,cr.width+16,Math.max(36,cr.height-94)));txt(active?'STARTING CLASS':'SELECT CLASS',cr.left+10,cr.bottom-61,cr.width-20,8,active?C.lime:C.muted,700);button(edit,rect(cr.left,cr.bottom-44,cr.width,44),{label:'Customize  ↗',center:true,fontSize:10});if(active)line(cr.left,cr.top,cr.right,cr.top,C.lime,3);});return;
    }
    if(visibleIn(classPage,view)){
      const back=q('[data-loadout-back-classes]',classPage),name=q('[data-loadout-class-name-edit]',classPage);button(back,rect(r.left,r.top,112,44),{label:'‹ Classes',fontSize:12});button(name,rect(r.left+120,r.top,Math.min(220,r.width-120),44),{fontSize:12});
      const cards=qa('[data-loadout-edit-item]',classPage).filter(shown),cw=(r.width-24)/4,h=r.height-52;cards.forEach((n,i)=>{const cr=rect(r.left+i*(cw+8),r.top+52,cw,h);panel(cr,'rgba(20,29,36,.95)',null,0);txt(text(q('span',n)),cr.left+10,cr.top+9,cr.width-20,8,C.muted,700);if(n.dataset.previewWeapon)art('weapon-'+n.dataset.previewWeapon+'.png',rect(cr.left-10,cr.top+22,cr.width+20,Math.max(36,h-62)));else equipmentGlyph(cr,text(q('strong',n)));heading(text(q('strong',n)),cr.left+10,cr.bottom-29,cr.width-20,20);mark(n,cr);hit(n,cr);focusRing(n,cr);});return;
    }
    if(visibleIn(item,view)){
      const back=q('[data-loadout-back-class]',item),swap=q('[data-loadout-item-swap]',item);button(back,rect(r.left,r.top,100,44),{label:'‹ Loadout',fontSize:11});heading(text(q('[data-loadout-item-title]',item)),r.left+112,r.top+10,r.width-248,27);button(swap,rect(r.right-124,r.top,124,44),{label:'Change weapon',fontSize:10,center:true});
      const body=rect(r.left,r.top+52,r.width,Math.max(1,r.height-52)),weaponPage=qa('.loadout-weapon-page',item).find(shown),equipment=qa('.loadout-equipment-page',item).find(shown);
      if(weaponPage){const left=rect(body.left,body.top,body.width*.52,body.height),right=rect(left.right+16,body.top,body.width-left.width-16,body.height),cv=q('canvas',weaponPage);const previewRect=rect(left.left,left.top,left.width,Math.max(44,left.height-54));canvasNode(cv,previewRect);const stats=visibleChildren(q('.loadout-stat-row',weaponPage)),scw=left.width/3;stats.slice(0,6).forEach((stat,i)=>{const x=left.left+i%3*scw,y=left.bottom-50+Math.floor(i/3)*25,head=q('.loadout-stat-head',stat);txt(text(q('span',head)),x,y,scw-35,7,C.muted,600);txt(text(q('strong',head)),x+scw-35,y,30,9,C.text,700,{align:'right'});const fill=q('.loadout-stat-bar-solid',stat);line(x,y+15,x+scw-8,y+15,C.line,2);line(x,y+15,x+(scw-8)*clamp(parseFloat(fill?.style?.width||'0')/100,0,1),y+15,C.lime,2);});const inspector=q('.gunsmith-inspector',weaponPage),picker=q('.gunsmith-weapon-picker',inspector),options=q('.gunsmith-attachment-options',inspector);
        if(shown(picker))pagedFlow(q('.loadout-choice-grid',picker)||picker,right);
        else if(options){const close=q('.gunsmith-tray-close',inspector);heading(text(q('.gunsmith-attachment-head strong',inspector)),right.left,right.top+10,right.width-52,23);button(close,rect(right.right-44,right.top,44,44),{label:'×',center:true});pagedFlow(options,rect(right.left,right.top+48,right.width,Math.max(1,right.height-48)));}
        else{const host=q('[data-gunsmith-callouts]',weaponPage),buttons=qa('[data-callout-slot]',host).filter(shown),cols=2,capacity=Math.max(2,Math.floor((right.height-(buttons.length*24>right.height?44:0))/48)*2),range=pageRange(host,right,buttons.length,capacity),cw=(right.width-8)/2;mark(host,right);buttons.slice(range.start,range.end).forEach((a,i)=>button(a,rect(right.left+i%2*(cw+8),right.top+Math.floor(i/2)*48,cw,44),{label:text(q('span',a))||text(a),fontSize:10,center:true}));}
const ads=q('[data-loadout-ads-preview]',weaponPage);button(ads,rect(left.right-60,previewRect.bottom-44,60,44),{label:'ADS',center:true,fontSize:10});}
      else if(equipment)pagedFlow(equipment,body);return;
    }
    pagedFlow(view,r);
  }
  function equipmentGlyph(r,name){
    const x=r.left+r.width/2,y=r.top+r.height*.48;ctx.save();ctx.strokeStyle=C.muted;ctx.lineWidth=2;ctx.beginPath();if(/flash|smoke/i.test(name)){ctx.roundRect(x-10,y-20,20,38,4);ctx.stroke();line(x-5,y-24,x+6,y-24,C.muted,3);}else{ctx.ellipse(x,y,15,19,0,0,Math.PI*2);ctx.stroke();line(x,y-20,x+8,y-27,C.muted,2);line(x-10,y,x+10,y,C.muted,1);line(x,y-13,x,y+12,C.muted,1);}ctx.restore();
  }
  function drawMatchSetup(view,r){
    mark(view,r);const modes=qa('[data-lobby-mode-choice]',view).filter(shown),leftW=r.width*.58-12,rightX=r.left+r.width*.58+8,rightW=r.width*.42-8,cw=(leftW-12)/3,rh=Math.min(70,(r.height-22)/2);
    txt('GAME MODE',r.left,r.top,leftW,9,C.muted,700);modes.forEach((n,i)=>{const cr=rect(r.left+i%3*(cw+6),r.top+20+Math.floor(i/3)*rh,cw,rh-6);button(n,cr,{fontSize:10,maxLines:2});});
    const fields=['lobbyMinimapMode','lobbyScoreLimit','lobbyTimeLimit','lobbyMod'].map(get).filter(n=>shown(n)&&shown(n.parentElement));
    const fh=Math.min(66,r.height/Math.max(1,fields.length));fields.forEach((n,i)=>{const fy=r.top+i*fh,names={lobbyMinimapMode:'MINIMAP',lobbyScoreLimit:'SCORE LIMIT',lobbyTimeLimit:'MINUTES',lobbyMod:'MOD'};txt(names[n.id],rightX,fy,rightW,9,C.muted,700);gameControl(n,rect(rightX,fy+14,rightW,44));});
  }
  function drawMapWorkspace(view,r){
    if(!view)return;mark(view,r);const gallery=get('lobbyMapGallery'),tabs=q('.lobby-map-gallery-tabs',view),list=visibleChildren(tabs),tw=220;mark(tabs,rect(r.left,r.top,tw,44));list.forEach((t,i)=>button(t,rect(r.left+i*110,r.top,104,44),{tab:true,center:true,fontSize:11}));
    const mine=list.some(t=>t.dataset.mapGalleryTab==='mine'&&cls(t,'active'));button(get('lobbyCreateMapBtn'),rect(r.right-124,r.top,124,44),{label:'+ Create map',center:true,fontSize:11});if(mine){button(get('lobbyEditMapBtn'),rect(r.right-236,r.top,52,44),{label:'Edit',center:true,fontSize:10});button(get('lobbyDeleteMapBtn'),rect(r.right-180,r.top,52,44),{label:'Delete',center:true,fontSize:10});}
    const body=rect(r.left,r.top+52,r.width,Math.max(1,r.height-52)),cards=visibleChildren(gallery),cols=mine?3:Math.max(1,Math.min(5,cards.length)),range=pageRange(gallery,body,cards.length,cols),cw=(body.width-(cols-1)*8)/cols,h=body.height-(range.count>1?48:0);mark(gallery,body);
    cards.slice(range.start,range.end).forEach((n,i)=>{const cr=rect(body.left+i*(cw+8),body.top,cw,h);if(!interactive(n)){simpleText(n,cr,{maxLines:4});return;}const active=cls(n,'active');panel(cr,'#151e23',active?C.lime:null,0);if(n.dataset.lobbyMapChoice)sceneArt(cr,n.dataset.lobbyMapChoice,.9);else if(active)sceneArt(cr,'custom-map',.9);else{line(cr.left+12,cr.top+12,cr.right-12,cr.bottom-60,C.dim,1);txt('CUSTOM MAP',cr.left+10,cr.top+12,cr.width-20,9,C.muted,700);}fade(cr,'rgba(5,9,12,0)','rgba(5,9,12,.98)');heading(text(q('strong',n)),cr.left+10,cr.bottom-50,cr.width-20,22);txt(text(q('small',n)),cr.left+10,cr.bottom-24,cr.width-20,9,C.muted,500);if(active){line(cr.left,cr.bottom,cr.right,cr.bottom,C.lime,3);txt('SELECTED',cr.left+10,cr.top+10,cr.width-20,8,C.lime,700);}mark(n,cr);hit(n,cr);focusRing(n,cr);});
  }
  function drawKillstreakWorkspace(view,r){
    if(!view)return;mark(view,r);const choices=get('lobbyKillstreakChoices'),cards=visibleChildren(choices),count=get('lobbyKillstreakCount');heading('KILLSTREAKS',r.left,r.top,r.width*.5,25);txt(text(count),r.right-150,r.top+9,150,10,C.lime,700,{align:'right'});
    const body=rect(r.left,r.top+34,r.width,Math.max(1,r.height-34)),cols=Math.min(5,cards.length),range=pageRange(choices,body,cards.length,cols),cw=(r.width-8*(cols-1))/cols,h=body.height-(range.count>1?48:0);mark(choices,body);
    cards.slice(range.start,range.end).forEach((n,i)=>{const cr=rect(body.left+i*(cw+8),body.top,cw,h),selected=attr(n,'aria-pressed')==='true';panel(cr,selected?'rgba(65,78,39,.6)':'rgba(23,31,37,.9)',null,0);streakIcon(n.dataset.killstreakChoice,rect(cr.left,cr.top+15,cr.width,Math.max(36,cr.height-84)),selected?C.lime:C.muted);txt((text(q('.killstreak-choice-top',n)).split(' · ')[0]),cr.left+10,cr.top+8,cr.width-20,9,selected?C.lime:C.muted,700);heading(text(q('strong',n)),cr.left+10,cr.bottom-52,cr.width-20,18);txt(selected?'EQUIPPED':'SELECT',cr.left+10,cr.bottom-22,cr.width-20,8,selected?C.lime:C.dim,700);if(selected)line(cr.left,cr.bottom,cr.right,cr.bottom,C.lime,3);mark(n,cr);hit(n,cr);focusRing(n,cr);});
  }
  function drawMatchSummary(r,compact){const mode=text(get('lobbyGuestMode'))||text(get('lobbyModeBadge'))||'Match',rules=text(get('lobbyGuestRules')),mapButton=q('.lobby-map-choice.active')||q('[data-map-choice].active'),mapName=text(q('strong',mapButton))||text(q('b',mapButton))||'Selected map';if(compact){panel(r,C.raised,C.line);txt(mode,r.left+14,r.top+9,r.width-48,14,C.text,650);txt(`${mapName}${rules?' · '+rules:''}`,r.left+14,r.top+31,r.width-48,11,C.muted);const edit=get('nativeEditMatchBtn');mark(edit,r);hit(edit,r);txt('›',r.right-30,r.top+10,20,23,C.muted);return;}
    let y=r.top;if(!vp.landscape){const cv=get('lobbyMapPreview'),ph=Math.min(176,Math.max(100,r.height*.42));panel(rect(r.left,y,r.width,ph),'#111a1c',C.line);if(cv?.source){try{ctx.drawImage(cv.source,r.left,y,r.width,ph);}catch{}}y+=ph+20;}else line(r.left-16,r.top,r.left-16,r.bottom,C.line);
    txt('MATCH',r.left,y,r.width,11,C.muted,700);txt(mode,r.left,y+24,r.width,20,C.text,700,{maxLines:2});if(vp.landscape)txt(mapName,r.left,y+72,r.width,14,C.text);if(rules)txt(rules,r.left,y+(vp.landscape?98:58),r.width,13,C.muted,500,{maxLines:2});const ay=y+(vp.landscape?136:94);button(get('nativeEditMatchBtn'),rect(r.left,ay,vp.landscape?r.width:(r.width-8)/2,44),{label:'Edit match',fontSize:13});if(!vp.landscape)button(get('nativeChangeMapBtn'),rect(r.left+(r.width+8)/2,ay,(r.width-8)/2,44),{label:'Change map',fontSize:13});
  }
  function drawRoster(n,r){
    if(!n)return;mark(n,r);const cols=visibleChildren(n).filter(c=>!cls(c,'native-pager-control')),two=cols.length>1,cw=(r.width-(two?10:0))/(two?2:1),controls={bots:n.dataset?.manageBots==='true',teams:n.dataset?.changeTeam==='true'};
    const selected=cols.flatMap(c=>visibleChildren(q('.lobby-team-players',c))).find(row=>expandedRows.has(row));
    if(selected){panel(r,'#10191e',null,0);let back=details.get(selected);if(!back){back=ui.createElement('button');back.className='native-pager-control';back.textContent='‹ Squad';back.addEventListener('click',()=>{expandedRows.delete(selected);dirty=true;});details.set(selected,back);selected.append(back);}button(back,rect(r.left+8,r.top+8,96,44),{fontSize:11});heading(text(q('strong',selected)).replace(/ · YOU$/,''),r.left+116,r.top+14,r.width-128,24);txt(text(q('small',selected)),r.left+12,r.top+68,r.width-24,11,C.muted,600,{maxLines:2});const actions=visibleChildren(q('.lobby-player-actions',selected));actions.forEach((n,i)=>button(n,rect(r.left+12+i*(r.width-24)/Math.max(1,actions.length),r.bottom-52,(r.width-32)/Math.max(1,actions.length),44),{fontSize:10}));return;}
    const rowH=44,head=40+(controls.bots?44:0),maxRows=Math.max(1,...cols.map(c=>visibleChildren(q('.lobby-team-players',c)).length)),fits=Math.max(1,Math.floor((r.height-head)/rowH)),capacity=maxRows>fits?Math.max(1,Math.floor((r.height-head-44)/rowH)):fits,range=pageRange(n,r,maxRows,capacity),h=r.height-(range.count>1?44:0);
    cols.forEach((col,i)=>withClip(rect(r.left+i*(cw+10),r.top,cw,h),()=>drawRosterColumn(col,rect(r.left+i*(cw+10),r.top,cw,h),{...controls,start:range.start,end:range.end})));
  }
  function rosterRowHeight(row,w){return 44;}
  function drawRosterColumn(col,r,controls){
    mark(col,r);const title=q('.lobby-team-title',col),labelNode=q('.lobby-team-label',title),parts=children(labelNode),own=!!q('.self',col),accent=own?C.lime:'#a1adb2';
    panel(r,'rgba(13,19,24,.88)',null,0);line(r.left,r.top,r.right,r.top,accent,2);
    heading(text(parts[0])||'PLAYERS',r.left+10,r.top+10,r.width-64,20,accent);
    const count=text(parts[1]).replace(/ PLAYERS?/g,'P').replace(/ BOTS?/g,'B');txt(count,r.left+10,r.top+29,r.width-20,8,C.muted,600);
    if(title)mark(title,rect(r.left,r.top,r.width,40));
    const join=q('[data-lobby-team-choice]',title);if(controls.teams&&join&&enabled(join))button(join,rect(r.right-54,r.top+3,48,44),{label:'Join',center:true,fontSize:10});else if(own)txt('YOU',r.right-44,r.top+15,34,8,C.lime,700,{align:'right'});
    let y=r.top+40;const bots=q('.lobby-team-bot-control',title);
    if(controls.bots&&bots){mark(bots,rect(r.left+6,y,r.width-12,44));const bs=qa('button',bots);button(bs[0],rect(r.left+6,y,44,44),{center:true});txt(text(q('b',bots))+' BOTS',r.left+52,y+16,r.width-104,8,C.muted,700,{align:'center'});button(bs[1],rect(r.right-50,y,44,44),{center:true});y+=44;}
    const list=q('.lobby-team-players',col);mark(list,rect(r.left,y,r.width,r.bottom-y));
    for(const row of visibleChildren(list).slice(controls.start,controls.end)){
      const rh=rosterRowHeight(row,r.width),rr=rect(r.left+6,y,r.width-12,rh);mark(row,rr);
      if(!cls(row,'lobby-player')){txt('+',rr.left+8,rr.top+8,24,22,C.dim,500);txt('OPEN SLOT',rr.left+34,rr.top+15,rr.width-40,9,C.dim,600);y+=rh;continue;}
      const self=cls(row,'self'),color=row.style?.color||(self?C.lime:C.muted),copy=q('.lobby-player-copy',row),name=q('strong',copy),detail=q('small',copy),nameText=text(name).replace(/ · YOU\s*$/,'');
      if(self)panel(rr,'rgba(193,224,111,.08)',null,0);panel(rect(rr.left,rr.top+10,2,26),color,null,0);
      txt(nameText,rr.left+9,rr.top+8,rr.width-18,12,C.text,700);txt(row.dataset?.playerRole||'PLAYER',rr.left+9,rr.top+29,rr.width-18,8,C.muted,600);mark(copy,rr);mark(name,rr);mark(detail,rr);
      if(attr(row,'role')!=='button'){row.setAttribute('role','button');row.setAttribute('tabindex','0');row.addEventListener('click',()=>{expandedRows.has(row)?expandedRows.delete(row):expandedRows.add(row);dirty=true;});}hit(row,rr);focusRing(row,rr);
      if(expandedRows.has(row)){const actions=visibleChildren(q('.lobby-player-actions',row));if(actions.length)actions.forEach((n,i)=>button(n,rect(rr.left,rr.top+50+i*44,rr.width,44),{fontSize:9}));else txt(text(detail),rr.left+9,rr.top+54,rr.width-18,9,C.muted,500,{maxLines:2});}
      y+=rh;
    }
  }
  function modalScreen(n){
    background();const b=vp.content,top=vp.safe.top+8,bottom=vp.height-vp.safe.bottom-8,pad=16,isSettings=n.id==='settingsPanel',isAdmin=n.id==='adminPanel',isLoadout=n.id==='loadoutPanel',r=rect(b.left,top,b.width,bottom-top);panel(r,'rgba(11,17,22,.97)',null,0);mark(n,r);
    heading(isSettings?'SETTINGS':isAdmin?'HOST OPTIONS':'LOADOUT',r.left+pad,r.top+12,r.width-32,30);const tabs=isSettings?q('.settings-tabs',n):isAdmin?q('.admin-tabs',n):null,rail=tabs?132:0;
    if(tabs){const buttons=visibleChildren(tabs);mark(tabs,rect(r.left+pad,r.top+58,rail-12,r.height-126));buttons.forEach((a,i)=>button(a,rect(r.left+pad,r.top+58+i*48,rail-12,44),{tab:true,fontSize:10,center:true}));}
    const footer=q('.modal-foot',n),buttons=visibleChildren(footer).filter(interactive),fy=r.bottom-56;mark(footer,rect(r.left+pad,fy,r.width-pad*2,48));const bw=Math.min(140,(r.width-32-8*(buttons.length-1))/Math.max(1,buttons.length));buttons.forEach((a,i)=>button(a,rect(r.right-pad-(buttons.length-i)*bw-(buttons.length-i-1)*8,fy,bw,44),{center:true,fontSize:11}));
    const body=rect(r.left+pad+rail,r.top+58,r.width-pad*2-rail,Math.max(1,fy-r.top-66));let bodyNode=isSettings?q('.settings-page.active:not([hidden])',n):isAdmin?q('.admin-page:not(.hide):not([hidden])',n):q('[data-loadout-workspace]',n);if(bodyNode){if(isLoadout)drawLoadoutWorkspace(bodyNode,body);else pagedFlow(bodyNode,body);}
  }
  function confirmScreen(n){ctx.fillStyle='rgba(2,4,5,.78)';ctx.fillRect(0,0,vp.width,vp.height);const w=Math.min(480,vp.content.width),pad=24,title=q('h2',n),copy=q('p',n),buttons=qa('button',n).filter(shown),copyH=copy?Math.max(44,naturalHeight(copy,w-pad*2)):0,h=148+copyH,r=rect((vp.width-w)/2,(vp.height-h)/2,w,h);panel(r,C.raised,C.line);mark(n,r);txt(text(title)||'Confirm',r.left+pad,r.top+24,w-pad*2,24,C.text,750);if(copy)simpleText(copy,rect(r.left+pad,r.top+66,w-pad*2,copyH),{color:C.muted,maxLines:5});const bw=(w-pad*2-8*(buttons.length-1))/Math.max(1,buttons.length);buttons.forEach((a,i)=>button(a,rect(r.left+pad+i*(bw+8),r.bottom-68,bw,48),{center:true}));}
  function entryScreen(n){background();mark(n,viewRect());const w=Math.min(400,vp.content.width),x=(vp.width-w)/2,y=Math.max(vp.safe.top+8,(vp.height-vp.safe.bottom-300)/2);panel(rect((vp.width-56)/2,y,56,56),C.lime,null,4);txt('B',(vp.width-56)/2+10,y-1,40,46,'#111605',850);txt('BREACH',x,y+88,w,44,C.text,850,{align:'center'});const version=q('[data-app-version]',n);if(version)simpleText(version,rect(x,y+145,w,22),{color:C.muted,maxLines:1});button(get('enterFullscreenBtn'),rect(x,y+194,w,52),{primary:true,label:'Enter Breach',center:true});const status=get('entryStatus');if(text(status))simpleText(status,rect(x,y+268,w,80),{color:cls(status,'error')?C.red:C.muted,maxLines:4});}
  function connectionScreen(n){ctx.fillStyle='rgba(3,6,8,.88)';ctx.fillRect(0,0,vp.width,vp.height);const w=Math.min(420,vp.content.width),r=rect((vp.width-w)/2,(vp.height-188)/2,w,188);panel(r,C.raised,C.line);mark(n,r);ctx.beginPath();ctx.arc(r.left+30,r.top+37,9,performanceNow()/650,performanceNow()/650+Math.PI*1.45);ctx.strokeStyle=C.lime;ctx.lineWidth=3;ctx.stroke();simpleText(get('connectionText'),rect(r.left+54,r.top+27,w-78,72),{size:18,color:C.text,weight:650,maxLines:3});button(get('connectionCancelBtn'),rect(r.left+24,r.bottom-72,w-48,48),{center:true});}
  function keyboardScreen(n){
    ctx.fillStyle='#101713';ctx.fillRect(0,0,vp.width,vp.height);mark(n,viewRect());
    const editor=n.id==='gameTextEditor',kb=get(editor?'gameTextKeyboard':'chatKeyboard'),prefix=editor?'editor':'chat';
    const keyOf=char=>{let k=qa('button',kb).find(k=>k.dataset[prefix+'Char']===char);if(!k){k=ui.createElement('button');k.dataset[prefix+'Char']=char;k.textContent=char;kb.append(k);}return k;};
    const action=name=>qa('button',kb).find(k=>k.dataset[prefix+'Action']===name);
    let mode=kb._modeButton;if(!mode){mode=ui.createElement('button');mode.setAttribute('aria-label','Switch letters and symbols');mode.addEventListener('click',()=>{kb.dataset.symbols=kb.dataset.symbols==='true'?'false':'true';dirty=true;});kb.append(mode);kb._modeButton=mode;}
    const fullW=Math.min(1030,vp.width-vp.safe.left-vp.safe.right-24),baseX=vp.safe.left+(vp.width-vp.safe.left-vp.safe.right-fullW)/2,top=vp.safe.top+10,bottom=vp.height-vp.safe.bottom-8;
    const historyWidth=editor?0:Math.min(250,fullW*.26),x=baseX+(editor?0:historyWidth+16),w=fullW-(editor?0:historyWidth+16);
    const title=editor?text(get('gameTextEditorTitle')):'CHAT';txt(title,x,top+8,editor?w-164:82,20,C.text,750);
    const close=action('cancel'),done=editor?action('done'):get('chatSendBtn');
    button(close,rect(x+w-64,top,64,38),{label:'CLOSE',center:true,fontSize:11});
    if(!editor){button(get('chatChannel-team'),rect(x+82,top,64,38),{label:'TEAM',center:true,fontSize:11});button(get('chatChannel-all'),rect(x+150,top,60,38),{label:'ALL',center:true,fontSize:11});
      const history=get('nativeChatHistory');txt('COMMS',baseX,top+9,historyWidth,13,C.muted,700);line(baseX,top+42,baseX+historyWidth,top+42,'#354234');drawChatHistory(history,rect(baseX,top+54,historyWidth,bottom-top-54));}
    const display=rect(x,top+49,w-84,44);panel(display,'#1d2721','#354234',0);
    const value=get(editor?'gameTextEditorValue':'chatInputText'),placeholder=get(editor?'gameTextEditorPlaceholder':'chatPlaceholder');
    let draft=text(value);ctx.font='550 15px '+THEME.font;while(draft.length&&ctx.measureText(draft).width>display.width-24)draft=draft.slice(1);
    txt(draft||text(placeholder),display.left+12,display.top+13,display.width-24,15,text(value)?C.text:C.dim,550,{maxLines:1});mark(value,display);mark(placeholder,display);
    button(done,rect(x+w-76,display.top,76,44),{label:editor?(n.dataset.submitLabel||'DONE'):'SEND',primary:true,center:true,fontSize:12});
    const ky=display.bottom+12,gap=5,keyH=(bottom-ky-gap*3)/4,unit=(w-gap*9)/10,symbols=kb.dataset.symbols==='true';
    mark(kb,rect(x,ky,w,bottom-ky));
    const row=(chars,y,offset=0)=>[...chars].forEach((char,i)=>button(keyOf(char),rect(x+offset+i*(unit+gap),y,unit,keyH),{center:true,fontSize:18,maxLines:1}));
    row(symbols?'1234567890':'qwertyuiop',ky);
    row(symbols?'@#$%&*()-':'asdfghjkl',ky+keyH+gap,(unit+gap)/2);
    const third=ky+2*(keyH+gap),wide=unit*1.5+gap*.5;
    button(action('shift'),rect(x,third,wide,keyH),{label:'⇧',center:true,fontSize:23});
    [...(symbols?'!?/:;=+':'zxcvbnm')].forEach((char,i)=>button(keyOf(char),rect(x+wide+gap+i*(unit+gap),third,unit,keyH),{center:true,fontSize:18}));
    button(action('backspace'),rect(x+w-wide,third,wide,keyH),{label:'⌫',center:true,fontSize:22});
    const last=ky+3*(keyH+gap);button(mode,rect(x,last,wide,keyH),{label:symbols?'ABC':'123',center:true,fontSize:14});
    button(keyOf(','),rect(x+wide+gap,last,unit,keyH),{center:true,fontSize:18});
    const spaceX=x+wide+unit+gap*2,spaceW=w-wide*2-unit*2-gap*4;
    button(action('space'),rect(spaceX,last,spaceW,keyH),{label:'SPACE',center:true,fontSize:13});
    button(keyOf('.'),rect(spaceX+spaceW+gap,last,unit,keyH),{center:true,fontSize:18});
    button(keyOf('?'),rect(x+w-wide,last,wide,keyH),{center:true,fontSize:18});
  }
  function drawChatHistory(n,r){
    if(!n)return;mark(n,r);const messages=visibleChildren(n).filter(row=>!cls(row,'native-pager-control')),chunks=[];
    for(const row of messages.slice().reverse()){const name=q('.native-chat-name',row),body=q('.native-chat-text',row),lines=splitLines(text(body),r.width-12,12,500);for(let i=0;i<lines.length;i+=3)chunks.push({row,name,lines:lines.slice(i,i+3),continued:i>0});}
    const capacity=Math.max(1,Math.floor((r.height-44)/79));
    // Most recent messages are first; paging is explicit and never mixed with scrolling.
    if(n.dataset.follow==='true'){const saved=pages.get(n);if(saved)saved.page=0;n.dataset.follow='false';}
    const range=pageRange(n,r,chunks.length,capacity);
    chunks.slice(range.start,range.end).forEach((item,i)=>{const y=r.top+i*79;txt(text(item.name)+(item.continued?' …':''),r.left,y,r.width,10,item.row.dataset.color,700,{maxLines:1});item.lines.forEach((line,j)=>txt(line,r.left,y+19+j*16,r.width,12,C.text,500));});
    if(!chunks.length){txt('NO MESSAGES',r.left,r.top+18,r.width,13,C.text,700);txt('Team messages stay with your teammates. All reaches everyone.',r.left,r.top+47,r.width,12,C.muted,500,{maxLines:5,lineHeight:18});}
  }

  function rotateScreen(n){
    background();mark(n,viewRect());const w=Math.min(400,vp.content.width),x=(vp.width-w)/2,y=vp.height/2-140;
    panel(rect(vp.width/2-38,y,76,44),null,C.lime,6);panel(rect(vp.width/2-30,y+7,60,30),C.selected,null,2);
    txt('LANDSCAPE REQUIRED',x,y+72,w,23,C.text,800,{align:'center'});
    txt('Turn your phone sideways. Breach plays in landscape.',x+16,y+113,w-32,14,C.muted,500,{maxLines:2,align:'center'});
    button(get('rotateFullscreenBtn'),rect(x,y+180,w,48),{primary:true,center:true,label:'FULLSCREEN / CONTINUE'});
    txt('Version '+APP_VERSION,x,y+246,w,14,C.muted,600,{align:'center'});
  }
  const performanceNow=()=>globalThis.performance?.now?.()||Date.now();

  function render(){
    if(disposed)return;dirty=false;lastRevision=ui.revision;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vp.width,vp.height);hits=[];scrolls=[];painted=[];clip=viewRect();for(const n of allNodes)previousRects.set(n,{...n._rect});zero(ui.root);allNodes.clear();
    const screens=NATIVE_SCREEN_IDS.map(get).filter(shown);const main=screens.filter(n=>!['lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','chatComposer','gameTextEditor'].includes(n.id));const overlays=screens.filter(n=>['lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','chatComposer','gameTextEditor'].includes(n.id));const ordered=[...main,...overlays];const fullViewport=vp,notice=ordered.length?getNotice():null,noticeText=String(notice?.text||'').trim();lastNoticeKey=noticeText?`${noticeText}|${notice.until||''}`:'';
    // Only the frontmost screen can receive input. Earlier screens can remain
    // visible beneath overlays, but their hit targets never leak through.
    const signature=ordered.map(n=>n.id).join('|');if(signature!==lastScreen){cancelPointer('screen-change');inputOwner?.sync?.('native-screen-change');lastScreen=signature;}
    ordered.forEach(n=>{activeScreen=n;hits=[];scrolls=[];if(menuScene?.draw({context:ctx,viewport:vp,screen:n,mark,hit}))return;switch(n.id){case'entryScreen':entryScreen(n);break;case'rotateGate':rotateScreen(n);break;case'menu':menuScreen(n);break;case'lobbyScreen':lobbyScreen(n);break;case'settingsPanel':case'adminPanel':case'loadoutPanel':modalScreen(n);break;case'lobbyQuitConfirm':case'mapDeleteConfirm':confirmScreen(n);break;case'connectionOverlay':connectionScreen(n);break;case'gameTextEditor':case'chatComposer':keyboardScreen(n);break;}});
    activeScreen=ordered.at(-1)||null;if(noticeText){vp=fullViewport;clip=viewRect();const w=Math.min(620,vp.content.width),r=rect((vp.width-w)/2,vp.height-vp.safe.bottom-44,w,44);panel(r,C.raised,C.line);txt(noticeText,r.left+14,r.top+8,r.width-28,13,C.text,650,{maxLines:2,lineHeight:15,align:'center'});}mark(ui.root,viewRect());ui.root.layoutStyle={overflow:'hidden',display:'block'};canvas.style.pointerEvents=ordered.length?'auto':'none';return {viewport:vp,screens:ordered.map(n=>n.id),hits:[...hits],scrolls:[...scrolls],painted:[...new Set(painted)]};
  }
  function hitTest(x,y){for(let i=hits.length-1;i>=0;i--)if(inside(hits[i].rect,x,y)&&enabled(hits[i].node))return hits[i];return null;}
  function scrollAt(x,y){for(let i=scrolls.length-1;i>=0;i--)if(inside(scrolls[i].rect,x,y)&&(scrolls[i].max>0||scrolls[i].maxX>0))return scrolls[i];return null;}
  function eventFields(e){return {detail:1,clientX:num(e.clientX),clientY:num(e.clientY),pointerId:e.pointerId??1,pointerType:e.pointerType||'mouse',button:e.button||0,buttons:e.buttons??1,isTrusted:!!e.isTrusted,timeStamp:e.timeStamp,pressure:e.pressure??.5,shiftKey:!!e.shiftKey,ctrlKey:!!e.ctrlKey,altKey:!!e.altKey,metaKey:!!e.metaKey,nativeEvent:e};}
  function dispatch(n,type,e){return ui.dispatch?.(n,type,eventFields(e));}
  function cancelPreviewPointer(id,reason='cancel'){
    const p=previewPointers.get(id);if(!p)return false;previewPointers.delete(id);dispatch(p.hit.node,'pointercancel',{...p.start,pointerId:id});inputOwner?.cancel?.(id,reason);try{canvas.releasePointerCapture?.(id);}catch{}dirty=true;return true;
  }
  function beginPreviewPointer(e,h){
    if(!previewPointers.size)cancelPointer('preview-start');
    inputOwner?.sync?.('preview-pointerdown');const owner=inputOwner?.begin?.(e,{target:h.node});if(inputOwner&&!owner)return;
    e.preventDefault();e.stopPropagation();dispatch(h.node,'pointerdown',e);previewPointers.set(e.pointerId,{hit:h,owner,start:eventFields(e)});ui.focus?.(h.node);try{canvas.setPointerCapture?.(e.pointerId);}catch{}dirty=true;
  }
  function cancelPointer(reason='cancel'){for(const id of [...previewPointers.keys()])cancelPreviewPointer(id,reason);if(!pointer)return;const p=pointer;pointer=null;dispatch(p.hit?.node,'pointercancel',{...p.start,pointerId:p.id,pointerType:p.type});inputOwner?.cancel?.(p.id,reason);try{canvas.releasePointerCapture?.(p.id);}catch{}dirty=true;}
  function down(e){if(e.button!==undefined&&e.button!==0)return;if(dirty||lastRevision!==ui.revision)render();const h=hitTest(e.clientX,e.clientY),s=scrollAt(e.clientX,e.clientY);if(e.pointerType==='touch'&&h?.node?.dataset?.menuPreview){beginPreviewPointer(e,h);return;}if(!h&&!s)return;e.preventDefault();e.stopPropagation();cancelPointer('new-pointer');inputOwner?.sync?.('pointerdown');const owner=inputOwner?.begin?.(e,{target:h?.node||s?.node});if(inputOwner&&!owner)return;const v=h?dispatch(h.node,'pointerdown',e):null;inputOwner?.sync?.('after-pointerdown');if(inputOwner&&!inputOwner.valid?.(owner)){inputOwner.cancel?.(e.pointerId,'down-transition');return;}pointer={id:e.pointerId??1,type:e.pointerType||'mouse',hit:h,scroll:s,start:eventFields(e),lastX:e.clientX,lastY:e.clientY,startX:e.clientX,startY:e.clientY,claimed:!!v?.defaultPrevented,moved:false,owner};ui.focus?.(h?.node||s?.node);try{canvas.setPointerCapture?.(pointer.id);}catch{}dirty=true;}
  function move(e){const multi=previewPointers.get(e.pointerId);if(multi){if(inputOwner&&!inputOwner.valid?.(multi.owner)){cancelPreviewPointer(e.pointerId,'scope-change');return;}e.preventDefault();dispatch(multi.hit.node,'pointermove',e);dirty=true;return;}if(!pointer){const h=hitTest(e.clientX,e.clientY);if(hover!==h?.node){if(hover)dispatch(hover,'pointerleave',e);hover=h?.node;if(hover)dispatch(hover,'pointerenter',e);canvas.style.cursor=h?'pointer':'default';dirty=true;}return;}if((e.pointerId??1)!==pointer.id)return;if(inputOwner&&!inputOwner.valid?.(pointer.owner||pointer.id)){cancelPointer('scope-change');return;}e.preventDefault();const p=pointer,dx=e.clientX-p.lastX,dy=e.clientY-p.lastY,distance=Math.hypot(e.clientX-p.startX,e.clientY-p.startY);if(distance>7)p.moved=true;if(p.claimed&&p.hit)dispatch(p.hit.node,'pointermove',e);else if(p.scroll&&p.moved){if(p.scroll.maxX>0)p.scroll.node.scrollLeft=clamp(num(p.scroll.node.scrollLeft)-dx,0,p.scroll.maxX);p.scroll.node.scrollTop=clamp(num(p.scroll.node.scrollTop)-dy,0,p.scroll.max);dirty=true;}else if(p.hit)dispatch(p.hit.node,'pointermove',e);p.lastX=e.clientX;p.lastY=e.clientY;}
  function up(e){
    const multi=previewPointers.get(e.pointerId);if(multi){previewPointers.delete(e.pointerId);e.preventDefault();e.stopPropagation();const ended=inputOwner?.end?.(e);dispatch(multi.hit.node,ended?.valid===false?'pointercancel':'pointerup',e);try{canvas.releasePointerCapture?.(e.pointerId);}catch{}dirty=true;return;}
    if(!pointer||(e.pointerId??1)!==pointer.id)return;
    const p=pointer;pointer=null;e.preventDefault();e.stopPropagation();
    try{
      const valid=!inputOwner||inputOwner.valid?.(p.owner||p.id),ended=inputOwner?.end?.(e);
      if(!valid||ended?.valid===false){dispatch(p.hit?.node,'pointercancel',e);return;}
      const v=p.hit?dispatch(p.hit.node,'pointerup',e):null;
      inputOwner?.sync?.('after-pointerup');
      const clickFields=eventFields(e),stillValid=!inputOwner||inputOwner.valid?.(p.owner||p.id);
      if(stillValid&&p.hit&&!p.claimed&&!v?.defaultPrevented&&!p.moved&&inside(p.hit.rect,e.clientX,e.clientY)&&enabled(p.hit.node)&&(!inputOwner||inputOwner.allowsClick?.(clickFields)!==false)){
        if(p.hit.action)p.hit.action();else ui.dispatch?.(p.hit.node,'click',clickFields);
        inputOwner?.sync?.('after-click');onAfterAction(p.hit.node);
      }
    }finally{try{canvas.releasePointerCapture?.(p.id);}catch{}dirty=true;}
  }
  function wheel(e){const h=hitTest(e.clientX,e.clientY);if(h?.node?.dataset?.menuPreview||h?.node?.dataset?.menuRail){e.preventDefault();ui.dispatch?.(h.node,'wheel',{...eventFields(e),deltaX:e.deltaX,deltaY:e.deltaY});dirty=true;return;}const s=scrollAt(e.clientX,e.clientY);if(!s)return;e.preventDefault();if(s.maxX>0&&(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey))s.node.scrollLeft=clamp(num(s.node.scrollLeft)+num(e.deltaX||e.deltaY),0,s.maxX);else s.node.scrollTop=clamp(num(s.node.scrollTop)+num(e.deltaY),0,s.max);dirty=true;}
  function listen(target,type,fn,options){target?.addEventListener?.(type,fn,options);removers.push(()=>target?.removeEventListener?.(type,fn,options));}
  listen(canvas,'pointerleave',e=>{if(hover)dispatch(hover,'pointerleave',e);hover=null;dirty=true;});listen(canvas,'pointerdown',down,{passive:false});listen(canvas,'pointermove',move,{passive:false});listen(canvas,'pointerup',up,{passive:false});listen(canvas,'pointercancel',e=>{if(!cancelPreviewPointer(e.pointerId,'pointercancel'))cancelPointer('pointercancel');});listen(canvas,'lostpointercapture',e=>{if(previewPointers.has(e.pointerId))cancelPreviewPointer(e.pointerId,'capture-lost');else if(pointer?.id===e.pointerId)cancelPointer('capture-lost');});listen(canvas,'wheel',wheel,{passive:false});listen(canvas,'contextmenu',e=>e.preventDefault());listen(globalThis,'blur',()=>cancelPointer('blur'));listen(globalThis,'resize',()=>resize());
  const unsubscribe=ui.subscribe?.(()=>{dirty=true;});if(unsubscribe)removers.push(unsubscribe);const unsubOwner=inputOwner?.subscribe?.(()=>{if(pointer&&inputOwner.valid?.(pointer.owner||pointer.id)===false)cancelPointer('owner-change');for(const [id,p]of previewPointers)if(!inputOwner.valid?.(p.owner))cancelPreviewPointer(id,'owner-change');});if(unsubOwner)removers.push(unsubOwner);
  function resize(width,height,pixelRatio){if(disposed)return;if(typeof width==='object'){const opt=width;width=opt.width;height=opt.height;pixelRatio=opt.dpr;safeArea=opt.safeArea||safeArea;}vp=computeNativeViewport(width||globalThis.innerWidth||canvas.width,height||globalThis.innerHeight||canvas.height,safeArea);dpr=clamp(num(pixelRatio,globalThis.devicePixelRatio||1),1,3);const pw=Math.round(vp.width*dpr),ph=Math.round(vp.height*dpr);if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;canvas.style.width=`${vp.width}px`;canvas.style.height=`${vp.height}px`;cancelPointer('resize');dirty=true;return vp;}
  function tick(){if(disposed)return;if(menuScene&&['menu','lobbyScreen','loadoutPanel','settingsPanel','adminPanel'].includes(activeScreen?.id)){const now=performance.now();if(now-lastMenuFrame<32)return;lastMenuFrame=now;}const notice=activeScreen?getNotice():null,noticeKey=notice?.text?`${notice.text}|${notice.until||''}`:'';if(noticeKey!==lastNoticeKey)dirty=true;if(menuScene&&['menu','lobbyScreen','loadoutPanel','settingsPanel','adminPanel'].includes(activeScreen?.id)||dirty||lastRevision!==ui.revision||activeScreen?.id==='connectionOverlay'||qa('canvas[data-loadout-preview]').some(n=>shown(n)&&n._rect?.width))return render();}
  function ensureVisible(n){for(const s of scrolls){if(!s.node.contains?.(n))continue;const r=n._rect;if(!r?.height)continue;if(r.top<s.rect.top)s.node.scrollTop=Math.max(0,num(s.node.scrollTop)-(s.rect.top-r.top)-8);else if(r.bottom>s.rect.bottom)s.node.scrollTop=Math.min(s.max,num(s.node.scrollTop)+r.bottom-s.rect.bottom+8);dirty=true;}}
  resize();
  return {render,tick,resize,hitTest,ensureVisible,cancel:cancelPointer,get viewport(){return vp;},get hits(){return hits;},get scrollRegions(){return scrolls;},get visibleScreens(){return lastScreen?lastScreen.split('|'):[];},invalidate(){dirty=true;},destroy(){disposed=true;cancelPointer('destroy');removers.forEach(fn=>fn());if(frame)cancelAnimationFrame(frame);ctx.clearRect(0,0,canvas.width,canvas.height);}};
}
