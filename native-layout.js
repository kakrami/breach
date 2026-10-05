/*
 * Breach native menu scene renderer.
 *
 * This module owns layout, paint, clipping, scrolling and hit geometry. The
 * widget graph is a semantic/control model; no DOM/CSS measurement is used.
 * All dimensions below are logical pixels. Browser canvas scaling is applied
 * once at the output boundary. Keep the same graph for touch, mouse, keyboard,
 * controller and accessibility rather than introducing parallel UI layouts.
 */
import { THEME, drawPanel, drawButton, drawLabel } from './native-ui.js?v=2.7.1';
import { NATIVE_SCREEN_IDS } from './native-screen-tree.js?v=2.7.1';

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
const hiddenDecoration=n=>['svg','use','path','circle','rect','defs','symbol','i'].includes(kind(n))||cls(n,'controller-menu-hint')||cls(n,'loadout-preview-hint')||cls(n,'chat-caret')||cls(n,'lobby-version')||cls(n,'native-host-actions');
const label=n=>text(n)||attr(n,'aria-label')||n?.dataset?.placeholder||'';
const visibleChildren=n=>children(n).filter(c=>shown(c)&&!hiddenDecoration(c));

/** Safe-area contract is injectable for hosts and deterministic QA. */
export function computeNativeViewport(width,height,safeArea={}) {
  const w=Math.max(240,num(width,1280)),h=Math.max(240,num(height,800));
  const portrait=w<h&&w<700,landscape=w>h&&h<540,compact=portrait||landscape;
  // Conservative touch-safe insets supplement actual host-provided insets.
  const safe={top:Math.max(num(safeArea.top),portrait?20:0),right:Math.max(num(safeArea.right),landscape?36:0),bottom:Math.max(num(safeArea.bottom),compact?20:0),left:Math.max(num(safeArea.left),landscape?36:0)};
  const margin=portrait?16:landscape?0:32;
  const available=w-safe.left-safe.right-margin*2;
  const contentWidth=Math.min(1056,Math.max(200,available));
  return {width:w,height:h,portrait,landscape,compact,safe,content:rect(safe.left+(w-safe.left-safe.right-contentWidth)/2,safe.top,contentWidth,h-safe.top-safe.bottom),target:48,secondaryTarget:44};
}

export function createNativeRenderer({canvas,ui,onAfterAction=()=>{},inputOwner=null,safeArea={},getNotice=()=>null}={}) {
  if(!canvas||!ui)throw new TypeError('Native renderer requires canvas and widget graph');
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw new Error('Canvas 2D is unavailable');
  let vp=computeNativeViewport(globalThis.innerWidth||canvas.width||1280,globalThis.innerHeight||canvas.height||800,safeArea);
  let dpr=1,dirty=true,disposed=false,frame=0,lastRevision=-1,lastScreen='',hover=null,lastNoticeKey='';
  let hits=[],scrolls=[],painted=[],activeScreen=null,pointer=null,clip=null;
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
  function focusRing(n,r){if(n===ui.activeElement)panel(rect(r.left-3,r.top-3,r.width+6,r.height+6),null,C.lime,6);}
  function button(n,r,options={}) {
    if(!n||!shown(n))return;mark(n,r);const primary=options.primary??(cls(n,'primary')||n.id==='enterFullscreenBtn'),active=options.active??(cls(n,'active')||attr(n,'aria-pressed')==='true'||attr(n,'aria-selected')==='true');const disabled=!enabled(n);
    const isTab=options.tab||attr(n,'role')==='tab';const fill=primary?C.lime:active?C.selected:C.raised;
    ctx.save();if(disabled)ctx.globalAlpha=.4;drawButton(ctx,r,{text:'',fill:isTab?(active?C.selected:'transparent'):fill,stroke:isTab?null:active?C.lime:C.line,radius:2});if(!isTab&&active)panel(rect(r.left,r.top,2,r.height),C.lime,null,0);if(n===hover&&!disabled)panel(r,'rgba(255,255,255,.045)',null,2);const color=primary?'#111605':cls(n,'danger')?C.red:active?C.lime:C.text;
    const caption=options.label??label(n);const aria=attr(n,'aria-label')||'';
    if(options.iconOnly||(!text(n)&&aria&&r.width<=56))icon(aria,r,color);
    else if(cls(n,'class-item-card')||cls(n,'loadout-choice')||cls(n,'killstreak-choice')||cls(n,'loadout-class-main')||q('strong',n)&&q('small',n))drawCardLabel(n,r,color);
    else {const size=options.fontSize||(isTab&&vp.compact?13:14),maxLines=options.maxLines||(isTab?1:2),padding=isTab||r.width<=72?4:12,available=Math.max(8,r.width-(options.arrow?56:padding*2)),rows=splitLines(caption,available,size,650,maxLines);const th=rows.length*size*1.2;txt(caption,r.left+padding,r.top+(r.height-th)/2,available,size,color,650,{maxLines,lineHeight:size*1.2,align:options.center||isTab?'center':'left'});}
    if(options.arrow)arrow(r,color);if(isTab&&active)line(r.left+12,r.bottom-1,r.right-12,r.bottom-1,C.lime,2);ctx.restore();focusRing(n,r);hit(n,r,{action:options.action});
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
  function background(){
    const wash=ctx.createLinearGradient(0,0,vp.width,vp.height);wash.addColorStop(0,'#202a2b');wash.addColorStop(.48,C.bg);wash.addColorStop(1,'#101817');ctx.fillStyle=wash;ctx.fillRect(0,0,vp.width,vp.height);
    ctx.save();ctx.globalAlpha=.13;for(let i=0;i<7;i++){const x=vp.width*.48+i*76;line(x,-40,x-vp.height*.35,vp.height+40,'#697772',1);}ctx.restore();
    line(vp.content.left,vp.safe.top+2,vp.content.left+36,vp.safe.top+2,C.lime,2);
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
    background();mark(n,viewRect());const {content:b,portrait,landscape}=vp;const headerY=portrait?vp.safe.top+24:landscape?14:28,headerH=portrait?64:60;
    brand(b.left,headerY,portrait||landscape);const profile=get('nameInput');button(profile,rect(b.right-(portrait?76:150),headerY-6,portrait?76:150,44),{label:profile?.value||profile?.dataset?.value||'Player',center:true});
    if(!portrait&&!landscape)globalNav(rect(b.left+290,headerY-4,Math.max(350,b.width-474),48));
    const footerH=portrait?76:landscape?56:24,footerY=vp.height-vp.safe.bottom-footerH;
    if(portrait||landscape){panel(rect(0,footerY,vp.width,footerH+vp.safe.bottom),C.surface);line(0,footerY,vp.width,footerY);globalNav(rect(b.left,footerY+4,b.width,48));}
    line(b.left,headerY+headerH,b.right,headerY+headerH);
    const top=headerY+headerH+20,body=rect(b.left,top,b.width,Math.max(100,footerY-top-14));
    const host=get('createBtn'),code=get('codeInput'),join=get('joinBtn'),refresh=get('refreshBtn'),list=get('matchList');
    const total=landscape?Math.max(260,naturalHeight(list,b.width*.54)):Math.max(550,330+matchListHeight(list));
    scroll(get('menuShell')||n,body,total,y=>{
      if(landscape){const left=rect(b.left,y,b.width*.43,body.height),right=rect(b.left+b.width*.47,y,b.width*.53,body.height);txt('MULTIPLAYER',left.left,left.top,left.width,11,C.lime,700);txt('PLAY.',left.left,left.top+24,left.width,30,C.text,800);button(host,rect(left.left,left.top+76,left.width,48),{primary:true,label:'Host a match',arrow:true});txt('HAVE A ROOM CODE?',left.left,left.top+144,left.width,11,C.muted,700);button(code,rect(left.left,left.top+168,left.width-100,48),{label:code?.value||'ENTER CODE'});button(join,rect(left.right-92,left.top+168,92,48),{label:'Join',center:true});txt('Open rooms',right.left,right.top+8,right.width-100,20,C.text,700);button(refresh,rect(right.right-96,right.top,96,44),{label:'Refresh',center:true});drawMatches(list,rect(right.left,right.top+60,right.width,body.height-60));
      }else{const wide=b.width>760,leftW=wide?Math.min(396,b.width*.4):b.width;txt('MULTIPLAYER',b.left,y,b.width,11,C.lime,700);txt('PLAY.',b.left,y+26,b.width,36,C.text,800);txt('Create a room or find your squad.',b.left,y+77,leftW,14,C.muted);button(host,rect(b.left,y+116,leftW,48),{primary:true,label:'Host a match',arrow:true});txt('HAVE A ROOM CODE?',b.left,y+188,leftW,11,C.muted,700);button(code,rect(b.left,y+214,leftW-112,48),{label:code?.value||'ENTER CODE'});button(join,rect(b.left+leftW-104,y+214,104,48),{label:'Join',center:true});const rx=wide?b.left+leftW+64:b.left,ry=wide?y+12:y+302,rw=wide?b.width-leftW-64:b.width;if(!wide)line(rx,ry-12,rx+rw,ry-12);txt('Open rooms',rx,ry+10,rw-105,21,C.text,700);button(refresh,rect(rx+rw-100,ry,100,44),{label:'Refresh',center:true});drawMatches(list,rect(rx,ry+60,rw,Math.max(120,total-(ry-y)-60)));}
    });
    const status=get('menuStatus');if(text(status))simpleText(status,rect(b.left,footerY-26,b.width,24),{color:cls(status,'error')?C.red:C.muted,maxLines:1});
    markAncestors(host,body); // Semantic shells own the same explicitly measured viewport.
  }
  function matchListHeight(n){const rows=visibleChildren(n);return rows.length?rows.reduce((s,row)=>s+(cls(row,'match')?90:52),0):64;}
  function drawMatches(n,r){if(!n)return;mark(n,r);let y=r.top;for(const row of visibleChildren(n)){if(!cls(row,'match')){flow(row,r.left,y,r.width);y+=56;continue;}const rh=82,rr=rect(r.left,y,r.width,rh);mark(row,rr);panel(rr,C.surface,C.line);const code=q('.match-code',row),metas=qa('.match-meta',row),join=q('button',row),title=code?text(code):'Room';txt(title,r.left+16,y+11,r.width-94,15,C.text,700);if(metas[0])txt(text(metas[0]),r.left+16,y+36,r.width-58,11,C.muted,500,{maxLines:2,lineHeight:15});if(metas[1])txt(text(metas[1]),r.right-86,y+12,66,12,C.lime,650,{align:'right'});if(join){mark(join,rr);hit(join,rr);focusRing(join,rr);txt('›',r.right-32,y+41,22,23,C.muted);}for(const c of children(row))if(c!==join)mark(c,rr);y+=90;}n.scrollHeight=Math.max(0,y-r.top);}

  function lobbyTabs(r){const tabRoot=q('.lobby-side-tabs',get('lobbyScreen')),tabs=visibleChildren(tabRoot).filter(t=>!t.id||t.id!=='lobbyCheatsTab');mark(tabRoot,r);const count=tabs.length||1;tabs.forEach((t,i)=>button(t,rect(r.left+i*r.width/count,r.top,r.width/count,44),{tab:true,center:true,label:({players:'Players',match:'Match',map:'Maps',loadout:'Loadout'})[t.dataset?.lobbySideTab]||label(t),fontSize:vp.compact?13:14,active:t.dataset?.lobbySideTab===(activeLobbyTab()==='killstreaks'?'loadout':activeLobbyTab())}));}
  function activeLobbyTab(){const root=get('lobbyScreen');return root?.dataset?.page|| q('[data-lobby-side-tab].active',root)?.dataset?.lobbySideTab||q('[data-lobby-side-view]:not([hidden])',root)?.dataset?.lobbySideView||'players';}
  function lobbyScreen(n){
    background();mark(n,viewRect());
    const {content:b,portrait,landscape}=vp,active=activeLobbyTab(),players=active==='players';
    const top=vp.safe.top+(landscape?8:12),host=shown(get('lobbyStartBtn')),code=text(get('lobbyRoomCode'))||'----';
    button(get('nativeLobbyBackBtn'),rect(b.left,top,48,44),{label:'‹',center:true,fontSize:24});
    txt('BREACH / LOBBY',b.left+60,top+3,b.width-170,11,C.muted,700);
    txt(code,b.left+60,top+21,b.width-170,16,C.text,800,{mono:true});
    button(get('lobbySettingsBtn'),rect(b.right-96,top,44,44),{iconOnly:true});
    button(get('lobbyCopyBtn'),rect(b.right-48,top,48,44),{label:'Invite',center:true,fontSize:11});
    mark(get('lobbyRoomCode'),rect(b.left+60,top+21,100,20));
    let tabsY=top+54;
    if(!landscape){txt('MULTIPLAYER',b.left,tabsY+4,b.width,portrait?24:32,C.text,800);txt(host?'HOST · MATCH SETUP':'SQUAD · CONNECTED',b.left,tabsY+(portrait?36:44),b.width,10,C.lime,700);tabsY+=portrait?58:68;}
    if(landscape&&b.width>=620){tabsY=top;lobbyTabs(rect(b.left+172,tabsY,b.width-276,44));}else lobbyTabs(rect(b.left,tabsY,b.width,44));line(b.left,tabsY+44,b.right,tabsY+44);
    const bots=get('nativeManageBotsBtn'),teams=get('nativeChangeTeamBtn');
    const actions=[];if(players&&qa('[data-lobby-bot-step]',get('lobbyRoster')).some(enabled))actions.push(bots);if(players&&qa('[data-lobby-team-choice]',get('lobbyRoster')).some(enabled))actions.push(teams);
    const footerH=portrait&&actions.length?112:64,footerY=vp.height-vp.safe.bottom-footerH;
    const body=rect(b.left,tabsY+56,b.width,Math.max(1,footerY-tabsY-68));
    if(players){
      const side=!portrait&&b.width>=850,summaryW=side?Math.min(300,b.width*.29):0;
      const rosterW=side?b.width-summaryW-24:b.width;
      const inlineDifficulty=landscape&&get('lobbyRoster')?.dataset?.manageBots==='true'&&shown(get('lobbyBotDifficultyWrap'));
      drawMatchSummary(side?rect(b.right-summaryW,body.top,summaryW,body.height):rect(b.left,body.top,inlineDifficulty?b.width-244:b.width,56),!side);
      let ry=side?body.top:body.top+68;
      const roster=get('lobbyRoster'),difficulty=get('lobbyBotDifficultyWrap'),field=q('[data-game-control]',difficulty);
      if(roster?.dataset?.manageBots==='true'&&shown(difficulty)&&field){if(inlineDifficulty){mark(difficulty,rect(b.right-228,body.top,228,56));txt('BOT DIFFICULTY',b.right-228,body.top,228,9,C.muted,700);gameControl(field,rect(b.right-228,body.top+14,228,44));}else{mark(difficulty,rect(b.left,ry,rosterW,44));txt('BOT DIFFICULTY',b.left,ry+16,rosterW*.43,10,C.muted,700);gameControl(field,rect(b.left+rosterW*.43,ry,rosterW*.57,44));ry+=56;}}
      const zi=get('lobbyZombieInfo');if(shown(zi)&&text(zi)){simpleText(zi,rect(b.left,ry,rosterW,34),{size:12,maxLines:2});ry+=42;}
      drawRoster(roster,rect(b.left,ry,rosterW,Math.max(1,body.bottom-ry)));
    }else{
      const view=q(`[data-lobby-side-view="${active}"]`,n);let bodyR=body;
      if(active==='loadout'||active==='killstreaks'){
        const tabs=get('nativeLoadoutTabs'),list=visibleChildren(tabs),tw=Math.min(320,body.width);mark(tabs,rect(body.left,body.top,tw,44));
        list.forEach((t,i)=>button(t,rect(body.left+i*tw/2,body.top,tw/2-4,44),{tab:true,center:true,active:(i===0&&active==='loadout')||(i===1&&active==='killstreaks')}));
        bodyR=rect(body.left,body.top+52,body.width,Math.max(1,body.height-52));
      }
      const hostTab=get('lobbyCheatsTab');
      if(shown(hostTab)&&(active==='match'||active==='cheats')){button(hostTab,rect(bodyR.left,bodyR.top,160,44),{label:'Host options  ›',active:active==='cheats'});bodyR=rect(bodyR.left,bodyR.top+52,bodyR.width,Math.max(1,bodyR.height-52));}
      if(active==='cheats'){const fy=bodyR.bottom-60,aw=Math.min(150,(bodyR.width-8)/2);mark(get('nativeLobbyHostActions'),rect(bodyR.left,fy,bodyR.width,60));button(get('lobbyHostApplyBtn'),rect(bodyR.right-aw,fy+8,aw,44),{primary:true,center:true});button(get('lobbyHostCancelBtn'),rect(bodyR.right-aw*2-8,fy+8,aw,44),{center:true});bodyR=rect(bodyR.left,bodyR.top,bodyR.width,Math.max(1,bodyR.height-68));}
      if(active==='killstreaks')drawKillstreakWorkspace(view,bodyR);else if(active==='map')drawMapWorkspace(view,bodyR);else if(active==='match'&&shown(get('lobbyHostSetup')))drawMatchSetup(view,bodyR);else if(view)scroll(view,bodyR,naturalHeight(view,bodyR.width-8),y=>flow(view,bodyR.left,y,bodyR.width-8));
    }
    panel(rect(0,footerY,vp.width,vp.height-footerY),C.surface,null,0);line(b.left,footerY,b.right,footerY);
    const actionY=footerY+10,aw=portrait?(b.width-8)/2:124;
    actions.forEach((a,i)=>button(a,rect(b.left+i*(aw+8),actionY,aw,44),{label:a===bots?'Manage bots':'Change team',fontSize:12,active:a===bots?get('lobbyRoster')?.dataset?.manageBots==='true':get('lobbyRoster')?.dataset?.changeTeam==='true'}));
    const startY=portrait&&actions.length?footerY+62:actionY,startW=portrait?b.width:Math.min(240,b.width*.34),startX=portrait?b.left:b.right-startW;
    if(host)button(get('lobbyStartBtn'),rect(startX,startY,startW,44),{primary:true,label:'DEPLOY / START MATCH',arrow:true,fontSize:12});
    else simpleText(get('lobbyStatus'),rect(startX,startY,startW,44),{size:12,color:C.muted,maxLines:2});
    if(!portrait&&!actions.length)txt('BREACH  /  '+code,b.left,footerY+24,b.width-startW-24,11,C.dim,650,{mono:true});
  }
  function drawMatchSetup(view,r){
    mark(view,r);const modes=qa('[data-lobby-mode-choice]',view).filter(shown),cols=r.width>650?3:2,cw=(r.width-8-8*(cols-1))/cols;
    const modeH=Math.ceil(modes.length/cols)*52+26,fields=['lobbyMinimapMode','lobbyScoreLimit','lobbyTimeLimit','lobbyMod'].map(get).filter(n=>shown(n)&&shown(n.parentElement));
    const total=modeH+fields.length*56;scroll(view,r,total,y=>{txt('GAME MODE',r.left,y,r.width,10,C.muted,700);modes.forEach((n,i)=>button(n,rect(r.left+i%cols*(cw+8),y+22+Math.floor(i/cols)*52,cw,44),{fontSize:11}));
      fields.forEach((n,i)=>{const fy=y+modeH+i*56,names={lobbyMinimapMode:'MINIMAP',lobbyScoreLimit:'SCORE LIMIT',lobbyTimeLimit:'TIME LIMIT',lobbyMod:'MOD'};txt(names[n.id],r.left,fy+16,r.width*.38,10,C.muted,700);gameControl(n,rect(r.left+r.width*.38,fy,r.width*.62-8,44));});
    });
  }
  function drawMapWorkspace(view,r){
    if(!view)return;mark(view,r);const gallery=get('lobbyMapGallery'),tabs=q('.lobby-map-gallery-tabs',view),list=visibleChildren(tabs),wide=r.width>=650,tw=Math.min(280,r.width-60);
    mark(tabs,rect(r.left,r.top,tw,44));list.forEach((t,i)=>button(t,rect(r.left+i*tw/2,r.top,tw/2-4,44),{tab:true,center:true,fontSize:11}));button(get('lobbyCreateMapBtn'),rect(r.right-52,r.top,44,44),{label:'+',center:true,fontSize:23});
    const mine=list.some(t=>t.dataset.mapGalleryTab==='mine'&&cls(t,'active')),actions=mine?52:0;
    if(mine){button(get('lobbyEditMapBtn'),rect(r.left,r.top+52,(r.width-16)/2,44),{label:'Edit map',center:true});button(get('lobbyDeleteMapBtn'),rect(r.left+(r.width-8)/2+8,r.top+52,(r.width-16)/2,44),{label:'Delete map',center:true});}
    const top=r.top+52+actions,space=Math.max(1,r.bottom-top),previewW=wide?Math.min(420,r.width*.46):r.width,previewH=wide?space:Math.min(164,Math.max(80,space*.38));
    const pr=rect(wide?r.right-previewW:r.left,top,previewW,previewH);panel(pr,C.surface,C.line);canvasNode(get('lobbyMapPreview'),pr);
    const body=wide?rect(r.left,top,r.width-previewW-16,space):rect(r.left,top+previewH+12,r.width,Math.max(1,space-previewH-12));
    const cards=visibleChildren(gallery);scroll(gallery,body,cards.reduce((sum,n)=>sum+(interactive(n)?76:naturalHeight(n,body.width-8)+8),0),y=>{let cy=y;for(const n of cards){if(interactive(n)){button(n,rect(body.left,cy,body.width-8,68));cy+=76;}else cy+=flow(n,body.left,cy,body.width-8)+8;}});
    const err=get('mapBuilderError');if(shown(err)&&text(err))simpleText(err,rect(r.left,r.bottom-44,r.width,44),{color:C.red,maxLines:2});
  }
  function drawKillstreakWorkspace(view,r){
    if(!view)return;mark(view,r);const equipped=get('lobbyKillstreakEquipped'),choices=get('lobbyKillstreakChoices'),count=get('lobbyKillstreakCount');
    const wide=vp.landscape&&r.width>=620;
    if(wide){
      const sw=174;txt('EQUIPPED / 3',r.left,r.top,sw,10,C.muted,700);mark(equipped,rect(r.left,r.top+22,sw,150));
      visibleChildren(equipped).forEach((slot,i)=>{const sr=rect(r.left,r.top+22+i*50,sw,44);mark(slot,sr);panel(sr,C.surface,C.line,2);txt(text(q('.kill-count',slot)),sr.left+10,sr.top+9,30,21,C.lime,800);txt(text(q('strong',slot)),sr.left+46,sr.top+10,sw-56,10,C.text,700,{maxLines:2,lineHeight:13});});
      const body=rect(r.left+sw+16,r.top,r.width-sw-16,r.height);scroll(choices,body,naturalHeight(choices,body.width-8),y=>flow(choices,body.left,y,body.width-8));
    }else{
      txt('KILLSTREAKS',r.left,r.top,r.width/2,11,C.text,800);simpleText(count,rect(r.left+r.width/2,r.top,r.width/2,20),{size:10,color:C.lime,weight:700,maxLines:1});
      flow(equipped,r.left,r.top+26,r.width-8);
      const body=rect(r.left,r.top+124,r.width,Math.max(1,r.height-124));scroll(choices,body,naturalHeight(choices,body.width-8),y=>flow(choices,body.left,y,body.width-8));
    }
  }
  function drawMatchSummary(r,compact){const mode=text(get('lobbyGuestMode'))||text(get('lobbyModeBadge'))||'Match',rules=text(get('lobbyGuestRules')),mapButton=q('.lobby-map-choice.active')||q('[data-map-choice].active'),mapName=text(q('strong',mapButton))||text(q('b',mapButton))||'Selected map';if(compact){panel(r,C.raised,C.line);txt(mode,r.left+14,r.top+9,r.width-48,14,C.text,650);txt(`${mapName}${rules?' · '+rules:''}`,r.left+14,r.top+31,r.width-48,11,C.muted);const edit=get('nativeEditMatchBtn');mark(edit,r);hit(edit,r);txt('›',r.right-30,r.top+10,20,23,C.muted);return;}
    let y=r.top;if(!vp.landscape){const cv=get('lobbyMapPreview'),ph=Math.min(176,Math.max(100,r.height*.42));panel(rect(r.left,y,r.width,ph),'#111a1c',C.line);if(cv?.source){try{ctx.drawImage(cv.source,r.left,y,r.width,ph);}catch{}}y+=ph+20;}else line(r.left-16,r.top,r.left-16,r.bottom,C.line);
    txt('MATCH',r.left,y,r.width,11,C.muted,700);txt(mode,r.left,y+24,r.width,20,C.text,700,{maxLines:2});if(vp.landscape)txt(mapName,r.left,y+72,r.width,14,C.text);if(rules)txt(rules,r.left,y+(vp.landscape?98:58),r.width,13,C.muted,500,{maxLines:2});const ay=y+(vp.landscape?136:94);button(get('nativeEditMatchBtn'),rect(r.left,ay,vp.landscape?r.width:(r.width-8)/2,44),{label:'Edit match',fontSize:13});if(!vp.landscape)button(get('nativeChangeMapBtn'),rect(r.left+(r.width+8)/2,ay,(r.width-8)/2,44),{label:'Change map',fontSize:13});
  }
  function drawRoster(n,r){if(!n)return;const cols=visibleChildren(n),innerW=r.width-8,two=innerW>=560&&cols.length>1,cw=two?(innerW-12)/2:innerW;const controls={bots:n.dataset?.manageBots==='true',teams:n.dataset?.changeTeam==='true'};
    const colHeight=col=>{let h=26;const title=q('.lobby-team-title',col);if(controls.bots&&q('.lobby-team-bot-control',title))h+=52;if(controls.teams&&q('[data-lobby-team-choice]',title))h+=52;for(const row of visibleChildren(q('.lobby-team-players',col)))h+=rosterRowHeight(row,cw)+4;return h+6;};const heights=cols.map(colHeight),total=two?Math.max(...heights,0):heights.reduce((s,h)=>s+h,0);
    scroll(n,r,total,y=>{let sy=y;cols.forEach((col,i)=>{const x=two?r.left+i*(cw+12):r.left,cy=two?y:sy;drawRosterColumn(col,rect(x,cy,cw,heights[i]),controls);if(!two)sy+=heights[i];});});
  }
  function rosterRowHeight(row,w){if(!cls(row,'lobby-player'))return 44;const name=q('.lobby-player-copy strong',row),nameText=ownText(name)||text(name);const lines=splitLines(nameText,w-56,14,650).length;return Math.max(vp.portrait?48:vp.landscape?50:56,22+lines*18)+(expandedRows.has(row)?(q('.lobby-player-actions',row)?56:36):0);}
  function drawRosterColumn(col,r,controls){mark(col,r);const title=q('.lobby-team-title',col),labelNode=q('.lobby-team-label',title),labelParts=children(labelNode);const own=!!q('.self',col);const caption=colsFriendlyLabel(col,own,labelParts[0]);txt(caption,r.left,r.top,r.width-130,11,C.text,700);if(labelParts[1])txt(text(labelParts[1]),r.right-128,r.top,128,10,C.muted,600,{align:'right'});if(title)mark(title,rect(r.left,r.top,r.width,24));let y=r.top+26;
    const bots=q('.lobby-team-bot-control',title),join=q('[data-lobby-team-choice]',title);
    if(controls.bots&&bots){mark(bots,rect(r.left,y,r.width,44));txt('BOTS',r.left+8,y+15,72,11,C.muted,700);const bs=qa('button',bots);button(bs[0],rect(r.right-144,y,44,44),{center:true});txt(text(q('b',bots)),r.right-96,y+15,40,14,C.text,650,{align:'center'});button(bs[1],rect(r.right-44,y,44,44),{center:true});y+=52;}
    if(controls.teams&&join){button(join,rect(r.left,y,r.width,44),{label:own?'Your team':`Join ${text(labelParts[0])||'team'}`,center:true});y+=52;}
    const playerRoot=q('.lobby-team-players',col);if(playerRoot)mark(playerRoot,rect(r.left,y,r.width,Math.max(0,r.bottom-y)));
    for(const row of visibleChildren(playerRoot)){const rh=rosterRowHeight(row,r.width);if(!cls(row,'lobby-player')){simpleText(row,rect(r.left,y,r.width,rh));y+=rh+4;continue;}const rr=rect(r.left,y,r.width,rh),self=cls(row,'self'),bot=cls(row,'bot'),color=row.style?.color||(self?C.lime:own?(bot?C.blue:C.green):C.red);mark(row,rr);panel(rr,self?'#172019':C.surface,self?C.line:null);panel(rect(r.left+12,y+12,3,Math.max(24,rh-(expandedRows.has(row)?68:26))),color,null,0);const copy=q('.lobby-player-copy',row),name=q('strong',copy),chip=q('.lobby-role-chip',name),weapon=q('small',copy),nameText=(ownText(name)||text(name)).replace(/ · YOU\s*$/,'');const lines=splitLines(nameText,r.width-58,14,650).length;txt(nameText,r.left+28,y+8,r.width-58,14,C.text,650,{maxLines:99,lineHeight:18});const role=row.dataset?.playerRole||(self?(text(chip)||'YOU'):(text(chip)||'PLAYER'));const metadata=/^(HOST|ADMIN|PLAYER|BOT|YOU)\s*[·|]/i.test(text(weapon))?text(weapon):`${role} · ${text(weapon)}`;txt(metadata,r.left+28,y+12+lines*18,r.width-48,10,C.muted,650,{maxLines:1});txt(expandedRows.has(row)?'⌄':'›',r.right-26,y+10,18,22,C.muted);if(copy)mark(copy,rr);if(name)mark(name,rect(r.left+28,y+8,r.width-58,lines*18));if(weapon)mark(weapon,rect(r.left+28,y+12+lines*18,r.width-48,16));
      const expand=()=>{expandedRows.has(row)?expandedRows.delete(row):expandedRows.add(row);dirty=true;};if(attr(row,'role')!=='button'){row.setAttribute?.('role','button');row.setAttribute?.('tabindex','0');row.addEventListener?.('click',expand);}hit(row,rr);focusRing(row,rr);
      if(expandedRows.has(row)){const actions=q('.lobby-player-actions',row),buttons=visibleChildren(actions);if(buttons.length)buttons.forEach((b,i)=>button(b,rect(r.left+28+i*(r.width-40)/buttons.length,rr.bottom-52,(r.width-48)/buttons.length,44),{fontSize:12}));else txt(self?'Your player':bot?(own?'Friendly bot':'Opponent bot'):(own?'Friendly player':'Opponent player'),r.left+28,rr.bottom-28,r.width-40,12,color,550);}
      y+=rh+4;
    }
  }
  function colsFriendlyLabel(col,own,n){const original=text(n);if(cls(col,'ffa')||!q('.lobby-player-color',col)||/survivor/i.test(original))return original||'PLAYERS';return own?'YOUR TEAM':'OPPOSING TEAM';}

  function modalScreen(n){
    ctx.fillStyle='rgba(3,6,8,.92)';ctx.fillRect(0,0,vp.width,vp.height);const isSettings=n.id==='settingsPanel',isAdmin=n.id==='adminPanel',isLoadout=n.id==='loadoutPanel',b=vp.content;const top=vp.landscape?16:vp.portrait?vp.safe.top+20:Math.max(42,vp.height*.065),width=Math.min(isAdmin?1056:isLoadout?1056:880,b.width),x=(vp.width-width)/2,bottom=vp.height-vp.safe.bottom-16;const outer=rect(x,top,width,bottom-top);panel(outer,C.surface,C.line);mark(n,outer);const pad=vp.portrait?16:24,ix=x+pad,iw=width-pad*2;const title=isSettings?'Settings':isAdmin?(text(get('adminTitle'))||'Host options'):isLoadout?'Loadout':attr(n,'aria-label')||'Menu';txt(title,ix,top+20,iw,26,C.text,750);let bodyTop=top+68;
    const tabs=isSettings?q('.settings-tabs',n):isAdmin?q('.admin-tabs',n):null;if(tabs){const list=visibleChildren(tabs),each=iw/Math.max(1,list.length);mark(tabs,rect(ix,bodyTop,iw,44));list.forEach((a,i)=>button(a,rect(ix+i*each,bodyTop,each,44),{tab:true,center:true,fontSize:vp.portrait?12:14}));bodyTop+=60;}
    const footer=q('.modal-foot',n),footerH=isSettings&&vp.portrait?112:76,fy=bottom-footerH;line(ix,fy,x+width-pad,fy);mark(footer,rect(ix,fy,iw,footerH));const footerButtons=visibleChildren(footer).filter(interactive);const actionW=isSettings&&vp.portrait?(iw-8)/2:Math.min(168,(iw-8*(footerButtons.length-1))/Math.max(1,footerButtons.length));let fx=x+width-pad;
    for(let i=footerButtons.length-1;i>=0;i--){const a=footerButtons[i];if(isSettings&&vp.portrait&&a.id==='settingsResetBtn'){button(a,rect(ix,fy+64,iw,44),{label:'Reset defaults',center:true,fontSize:12});continue;}fx-=actionW;button(a,rect(fx,fy+14,actionW,48),{center:true});fx-=8;}
    const status=visibleChildren(footer).find(a=>!interactive(a));if(status&&text(status)&&fx>ix+80)simpleText(status,rect(ix,fy+20,Math.max(40,fx-ix),40),{maxLines:2});const body=rect(ix,bodyTop,iw,Math.max(32,fy-bodyTop-12));let bodyNode=isSettings?q('.settings-page.active:not([hidden])',n)||q('.settings-categories',n):isAdmin?q('.admin-page:not(.hide):not([hidden])',n):isLoadout?q('[data-loadout-workspace]',n):children(n)[0];if(!bodyNode)bodyNode=n;const total=naturalHeight(bodyNode,body.width);scroll(bodyNode,body,total,y=>flow(bodyNode,body.left,y,body.width));
  }
  function pauseScreen(n){ctx.fillStyle='rgba(3,6,8,.93)';ctx.fillRect(0,0,vp.width,vp.height);const b=vp.content,w=Math.min(640,b.width),x=(vp.width-w)/2,top=vp.landscape?16:Math.max(vp.safe.top+20,vp.height*.13),height=vp.height-vp.safe.bottom-top-24;const box=rect(x,top,w,height);panel(box,C.surface,C.line);mark(n,box);txt('PAUSED',x+24,top+22,w-48,32,C.text,800);txt(`${text(get('pauseRoom'))} · ${text(get('pauseLoadout'))}`,x+24,top+68,w-48,12,C.muted);const orientation=get('pauseOrientationMessage'),extra=text(orientation)?44:0;if(extra)simpleText(orientation,rect(x+24,top+92,w-48,44),{color:C.lime,maxLines:2});const body=rect(x+24,top+104+extra,w-48,height-124-extra),buttons=qa('button',n).filter(shown),cols=vp.landscape?2:1,cw=(body.width-8*(cols-1))/cols,total=Math.ceil(buttons.length/cols)*56;scroll(n,body,total,y=>buttons.forEach((a,i)=>button(a,rect(body.left+(i%cols)*(cw+8),y+Math.floor(i/cols)*56,cw,48))));}
  function confirmScreen(n){ctx.fillStyle='rgba(2,4,5,.78)';ctx.fillRect(0,0,vp.width,vp.height);const w=Math.min(480,vp.content.width),pad=24,title=q('h2',n),copy=q('p',n),buttons=qa('button',n).filter(shown),copyH=copy?Math.max(44,naturalHeight(copy,w-pad*2)):0,h=148+copyH,r=rect((vp.width-w)/2,(vp.height-h)/2,w,h);panel(r,C.raised,C.line);mark(n,r);txt(text(title)||'Confirm',r.left+pad,r.top+24,w-pad*2,24,C.text,750);if(copy)simpleText(copy,rect(r.left+pad,r.top+66,w-pad*2,copyH),{color:C.muted,maxLines:5});const bw=(w-pad*2-8*(buttons.length-1))/Math.max(1,buttons.length);buttons.forEach((a,i)=>button(a,rect(r.left+pad+i*(bw+8),r.bottom-68,bw,48),{center:true}));}
  function entryScreen(n){background();mark(n,viewRect());const w=Math.min(400,vp.content.width),x=(vp.width-w)/2,y=Math.max(vp.safe.top+8,(vp.height-vp.safe.bottom-300)/2);panel(rect((vp.width-56)/2,y,56,56),C.lime,null,4);txt('B',(vp.width-56)/2+10,y-1,40,46,'#111605',850);txt('BREACH',x,y+88,w,44,C.text,850,{align:'center'});const version=q('[data-app-version]',n);if(version)simpleText(version,rect(x,y+145,w,22),{color:C.muted,maxLines:1});button(get('enterFullscreenBtn'),rect(x,y+194,w,52),{primary:true,label:'Enter Breach',center:true});const status=get('entryStatus');if(text(status))simpleText(status,rect(x,y+268,w,80),{color:cls(status,'error')?C.red:C.muted,maxLines:4});}
  function connectionScreen(n){ctx.fillStyle='rgba(3,6,8,.88)';ctx.fillRect(0,0,vp.width,vp.height);const w=Math.min(420,vp.content.width),r=rect((vp.width-w)/2,(vp.height-188)/2,w,188);panel(r,C.raised,C.line);mark(n,r);ctx.beginPath();ctx.arc(r.left+30,r.top+37,9,performanceNow()/650,performanceNow()/650+Math.PI*1.45);ctx.strokeStyle=C.lime;ctx.lineWidth=3;ctx.stroke();simpleText(get('connectionText'),rect(r.left+54,r.top+27,w-78,72),{size:18,color:C.text,weight:650,maxLines:3});button(get('connectionCancelBtn'),rect(r.left+24,r.bottom-72,w-48,48),{center:true});}
  function keyboardScreen(n){
    ctx.fillStyle='rgba(3,6,8,.96)';ctx.fillRect(0,0,vp.width,vp.height);
    const editor=n.id==='gameTextEditor',kb=get(editor?'gameTextKeyboard':'chatKeyboard'),keyScroll=get(editor?'nativeTextKeysScroll':'nativeChatKeysScroll')||kb,keyFooter=get(editor?'nativeTextKeysFooter':'nativeChatKeysFooter');
    const keys=qa('button',kb).filter(shown),characters=keys.filter(k=>k.dataset.editorChar!==undefined||k.dataset.chatChar!==undefined),fixed=keys.filter(k=>['done','cancel'].includes(k.dataset.editorAction||k.dataset.chatAction)),commands=keys.filter(k=>!characters.includes(k)&&!fixed.includes(k));
    const fullW=Math.min(880,vp.width-vp.safe.left-vp.safe.right-(vp.portrait?8:32)),baseX=(vp.width-fullW)/2,historySide=!editor&&vp.landscape,historyWidth=historySide?Math.min(236,fullW*.31):0,w=fullW-(historySide?historyWidth+16:0),x=baseX+(historySide?historyWidth+16:0),gap=4,keyH=44;
    const wide=w>=476,columns=wide?10:Math.max(1,Math.min(8,Math.floor((w+gap)/48))),keyW=(w-gap*(columns-1))/columns;
    const groups=wide?qa('.chat-key-row',keyScroll).map(row=>visibleChildren(row).filter(k=>characters.includes(k))).filter(row=>row.length):Array.from({length:Math.ceil(characters.length/columns)},(_,i)=>characters.slice(i*columns,(i+1)*columns));
    const commandCols=Math.min(commands.length,Math.max(2,Math.floor(w/88))),commandW=(w-gap*(commandCols-1))/Math.max(1,commandCols),commandRows=Math.ceil(commands.length/Math.max(1,commandCols)),natural=(groups.length+commandRows)*48+8;
    const top=vp.landscape?12:editor?Math.max(vp.safe.top+24,(vp.height-natural-176)/2):Math.max(vp.safe.top+108,vp.height-vp.safe.bottom-natural-148),title=editor?text(get('gameTextEditorTitle')):'Message';
    mark(n,viewRect());if(!editor){const history=get('nativeChatHistory'),hr=historySide?rect(baseX,16,historyWidth,vp.height-vp.safe.bottom-32):rect(baseX,vp.safe.top+12,fullW,Math.max(44,top-vp.safe.top-28));drawChatHistory(history,hr);}txt(title,x,top,w-(editor?0:112),vp.landscape?20:24,C.text,750);
    const display=rect(x,top+36,w,48);panel(display,C.raised,C.line);const value=get(editor?'gameTextEditorValue':'chatInputText'),placeholder=get(editor?'gameTextEditorPlaceholder':'chatPlaceholder');
    txt(text(value)||text(placeholder),display.left+14,display.top+15,display.width-28,16,text(value)?C.text:C.dim,550,{maxLines:1});mark(value,display);mark(placeholder,display);
    const ky=display.bottom+12,fy=vp.height-vp.safe.bottom-44,r=rect(x,ky,w,Math.max(44,fy-ky-8));mark(kb,rect(x,ky,w,fy+44-ky));
    scroll(keyScroll,r,natural,y=>{groups.forEach((row,j)=>{const rw=row.length*keyW+(row.length-1)*gap,rx=wide?x+(w-rw)/2:x;row.forEach((key,i)=>button(key,rect(rx+i*(keyW+gap),y+j*48,keyW,keyH),{center:true,fontSize:14}));});const cy=y+groups.length*48+8;commands.forEach((key,i)=>button(key,rect(x+(i%commandCols)*(commandW+gap),cy+Math.floor(i/commandCols)*48,commandW,keyH),{center:true,fontSize:11}));});
    const fw=(w-gap*(fixed.length-1))/Math.max(1,fixed.length);if(keyFooter)mark(keyFooter,rect(x,fy,w,44));fixed.forEach((key,i)=>button(key,rect(x+i*(fw+gap),fy,fw,44),{center:true,primary:key.dataset.editorAction==='done',fontSize:13}));
    if(!editor)button(get('chatSendBtn'),rect(x+w-100,top-2,100,44),{label:'Send',primary:true,center:true});
  }
  function drawChatHistory(n,r){
    if(!n)return;const rows=visibleChildren(n),lineHeight=18,heights=rows.map(row=>{const name=q('.native-chat-name',row)||q('strong',row),body=q('.native-chat-text',row)||q('span',row);return 24+splitLines(text(body)||text(row),r.width-24,14,500).length*lineHeight;});const total=heights.reduce((sum,h)=>sum+h+8,0),oldHeight=previousRects.get(n)?.height||n.clientHeight,follow=n.scrollHeight<=oldHeight||num(n.scrollTop)>=n.scrollHeight-oldHeight-4;mark(n,r);n.scrollHeight=total;if(follow)n.scrollTop=Math.max(0,total-r.height);scroll(n,r,total,y=>{let yy=y;rows.forEach((row,i)=>{const rr=rect(r.left,yy,r.width,heights[i]),name=q('.native-chat-name',row)||q('strong',row),body=q('.native-chat-text',row)||q('span',row);mark(row,rr);txt(text(name)||'Player',r.left+10,yy+2,r.width-20,14,row.dataset?.color||C.lime,700);txt(text(body)||text(row),r.left+10,yy+22,r.width-20,14,C.text,500,{maxLines:99,lineHeight});yy+=heights[i]+8;});});if(!rows.length)txt('No messages yet',r.left+8,r.top+8,r.width-16,14,C.dim,500);
  }
  function rotateScreen(n){
    background();mark(n,viewRect());const w=Math.min(400,vp.content.width),x=(vp.width-w)/2,y=vp.height/2-140;
    panel(rect(vp.width/2-38,y,76,44),null,C.lime,6);panel(rect(vp.width/2-30,y+7,60,30),C.selected,null,2);
    txt('LANDSCAPE REQUIRED',x,y+72,w,23,C.text,800,{align:'center'});
    txt('Turn your phone sideways to enter the match.',x+16,y+113,w-32,14,C.muted,500,{maxLines:2,align:'center'});
    button(get('rotateFullscreenBtn'),rect(x,y+180,w,48),{primary:true,center:true,label:'FULLSCREEN / CONTINUE'});
  }
  const performanceNow=()=>globalThis.performance?.now?.()||Date.now();

  function render(){
    if(disposed)return;dirty=false;lastRevision=ui.revision;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vp.width,vp.height);hits=[];scrolls=[];painted=[];clip=viewRect();for(const n of allNodes)previousRects.set(n,{...n._rect});zero(ui.root);allNodes.clear();
    const screens=NATIVE_SCREEN_IDS.map(get).filter(shown);const main=screens.filter(n=>!['lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','chatComposer','gameTextEditor'].includes(n.id));const overlays=screens.filter(n=>['lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','chatComposer','gameTextEditor'].includes(n.id));const ordered=[...main,...overlays];const fullViewport=vp,notice=ordered.length?getNotice():null,noticeText=String(notice?.text||'').trim();lastNoticeKey=noticeText?`${noticeText}|${notice.until||''}`:'';if(noticeText){const band=52+vp.safe.bottom;vp={...vp,height:vp.height-band,content:rect(vp.content.left,vp.content.top,vp.content.width,Math.max(0,vp.content.height-band))};clip=viewRect();}
    // Only the frontmost screen can receive input. Earlier screens can remain
    // visible beneath overlays, but their hit targets never leak through.
    const signature=ordered.map(n=>n.id).join('|');if(signature!==lastScreen){cancelPointer('screen-change');inputOwner?.sync?.('native-screen-change');lastScreen=signature;}
    ordered.forEach(n=>{activeScreen=n;hits=[];scrolls=[];switch(n.id){case'entryScreen':entryScreen(n);break;case'rotateGate':rotateScreen(n);break;case'menu':menuScreen(n);break;case'lobbyScreen':lobbyScreen(n);break;case'pause':pauseScreen(n);break;case'settingsPanel':case'adminPanel':case'loadoutPanel':modalScreen(n);break;case'lobbyQuitConfirm':case'mapDeleteConfirm':confirmScreen(n);break;case'connectionOverlay':connectionScreen(n);break;case'gameTextEditor':case'chatComposer':keyboardScreen(n);break;}});
    activeScreen=ordered.at(-1)||null;if(noticeText){vp=fullViewport;clip=viewRect();const w=Math.min(620,vp.content.width),r=rect((vp.width-w)/2,vp.height-vp.safe.bottom-44,w,44);panel(r,C.raised,C.line);txt(noticeText,r.left+14,r.top+8,r.width-28,13,C.text,650,{maxLines:2,lineHeight:15,align:'center'});}mark(ui.root,viewRect());ui.root.layoutStyle={overflow:'hidden',display:'block'};canvas.style.pointerEvents=ordered.length?'auto':'none';return {viewport:vp,screens:ordered.map(n=>n.id),hits:[...hits],scrolls:[...scrolls],painted:[...new Set(painted)]};
  }
  function hitTest(x,y){for(let i=hits.length-1;i>=0;i--)if(inside(hits[i].rect,x,y)&&enabled(hits[i].node))return hits[i];return null;}
  function scrollAt(x,y){for(let i=scrolls.length-1;i>=0;i--)if(inside(scrolls[i].rect,x,y)&&(scrolls[i].max>0||scrolls[i].maxX>0))return scrolls[i];return null;}
  function eventFields(e){return {detail:1,clientX:num(e.clientX),clientY:num(e.clientY),pointerId:e.pointerId??1,pointerType:e.pointerType||'mouse',button:e.button||0,buttons:e.buttons??1,isTrusted:!!e.isTrusted,timeStamp:e.timeStamp,pressure:e.pressure??.5,shiftKey:!!e.shiftKey,ctrlKey:!!e.ctrlKey,altKey:!!e.altKey,metaKey:!!e.metaKey,nativeEvent:e};}
  function dispatch(n,type,e){return ui.dispatch?.(n,type,eventFields(e));}
  function cancelPointer(reason='cancel'){if(!pointer)return;const p=pointer;pointer=null;dispatch(p.hit?.node,'pointercancel',{...p.start,pointerId:p.id,pointerType:p.type});inputOwner?.cancel?.(p.id,reason);try{canvas.releasePointerCapture?.(p.id);}catch{}dirty=true;}
  function down(e){if(e.button!==undefined&&e.button!==0)return;if(dirty||lastRevision!==ui.revision)render();const h=hitTest(e.clientX,e.clientY),s=scrollAt(e.clientX,e.clientY);if(!h&&!s)return;e.preventDefault();e.stopPropagation();cancelPointer('new-pointer');inputOwner?.sync?.('pointerdown');const owner=inputOwner?.begin?.(e,{target:h?.node||s?.node});if(inputOwner&&!owner)return;const v=h?dispatch(h.node,'pointerdown',e):null;inputOwner?.sync?.('after-pointerdown');if(inputOwner&&!inputOwner.valid?.(owner)){inputOwner.cancel?.(e.pointerId,'down-transition');return;}pointer={id:e.pointerId??1,type:e.pointerType||'mouse',hit:h,scroll:s,start:eventFields(e),lastX:e.clientX,lastY:e.clientY,startX:e.clientX,startY:e.clientY,claimed:!!v?.defaultPrevented,moved:false,owner};ui.focus?.(h?.node||s?.node);try{canvas.setPointerCapture?.(pointer.id);}catch{}dirty=true;}
  function move(e){if(!pointer){const h=hitTest(e.clientX,e.clientY);if(hover!==h?.node){hover=h?.node;canvas.style.cursor=h?'pointer':'default';dirty=true;}return;}if((e.pointerId??1)!==pointer.id)return;if(inputOwner&&!inputOwner.valid?.(pointer.owner||pointer.id)){cancelPointer('scope-change');return;}e.preventDefault();const p=pointer,dx=e.clientX-p.lastX,dy=e.clientY-p.lastY,distance=Math.hypot(e.clientX-p.startX,e.clientY-p.startY);if(distance>7)p.moved=true;if(p.claimed&&p.hit)dispatch(p.hit.node,'pointermove',e);else if(p.scroll&&p.moved){if(p.scroll.maxX>0)p.scroll.node.scrollLeft=clamp(num(p.scroll.node.scrollLeft)-dx,0,p.scroll.maxX);p.scroll.node.scrollTop=clamp(num(p.scroll.node.scrollTop)-dy,0,p.scroll.max);dirty=true;}else if(p.hit)dispatch(p.hit.node,'pointermove',e);p.lastX=e.clientX;p.lastY=e.clientY;}
  function up(e){
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
  function wheel(e){const s=scrollAt(e.clientX,e.clientY);if(!s)return;e.preventDefault();if(s.maxX>0&&(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey))s.node.scrollLeft=clamp(num(s.node.scrollLeft)+num(e.deltaX||e.deltaY),0,s.maxX);else s.node.scrollTop=clamp(num(s.node.scrollTop)+num(e.deltaY),0,s.max);dirty=true;}
  function listen(target,type,fn,options){target?.addEventListener?.(type,fn,options);removers.push(()=>target?.removeEventListener?.(type,fn,options));}
  listen(canvas,'pointerdown',down,{passive:false});listen(canvas,'pointermove',move,{passive:false});listen(canvas,'pointerup',up,{passive:false});listen(canvas,'pointercancel',()=>cancelPointer('pointercancel'));listen(canvas,'lostpointercapture',()=>cancelPointer('capture-lost'));listen(canvas,'wheel',wheel,{passive:false});listen(canvas,'contextmenu',e=>e.preventDefault());listen(globalThis,'blur',()=>cancelPointer('blur'));listen(globalThis,'resize',()=>resize());
  const unsubscribe=ui.subscribe?.(()=>{dirty=true;});if(unsubscribe)removers.push(unsubscribe);const unsubOwner=inputOwner?.subscribe?.(()=>{if(pointer&&inputOwner.valid?.(pointer.owner||pointer.id)===false)cancelPointer('owner-change');});if(unsubOwner)removers.push(unsubOwner);
  function resize(width,height,pixelRatio){if(disposed)return;if(typeof width==='object'){const opt=width;width=opt.width;height=opt.height;pixelRatio=opt.dpr;safeArea=opt.safeArea||safeArea;}vp=computeNativeViewport(width||globalThis.innerWidth||canvas.width,height||globalThis.innerHeight||canvas.height,safeArea);dpr=clamp(num(pixelRatio,globalThis.devicePixelRatio||1),1,3);const pw=Math.round(vp.width*dpr),ph=Math.round(vp.height*dpr);if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;canvas.style.width=`${vp.width}px`;canvas.style.height=`${vp.height}px`;cancelPointer('resize');dirty=true;return vp;}
  function tick(){if(disposed)return;const notice=activeScreen?getNotice():null,noticeKey=notice?.text?`${notice.text}|${notice.until||''}`:'';if(noticeKey!==lastNoticeKey)dirty=true;if(dirty||lastRevision!==ui.revision||activeScreen?.id==='connectionOverlay'||qa('canvas[data-loadout-preview]').some(n=>shown(n)&&n._rect?.width))return render();}
  function ensureVisible(n){for(const s of scrolls){if(!s.node.contains?.(n))continue;const r=n._rect;if(!r?.height)continue;if(r.top<s.rect.top)s.node.scrollTop=Math.max(0,num(s.node.scrollTop)-(s.rect.top-r.top)-8);else if(r.bottom>s.rect.bottom)s.node.scrollTop=Math.min(s.max,num(s.node.scrollTop)+r.bottom-s.rect.bottom+8);dirty=true;}}
  resize();
  return {render,tick,resize,hitTest,ensureVisible,cancel:cancelPointer,get viewport(){return vp;},get hits(){return hits;},get scrollRegions(){return scrolls;},get visibleScreens(){return lastScreen?lastScreen.split('|'):[];},invalidate(){dirty=true;},destroy(){disposed=true;cancelPointer('destroy');removers.forEach(fn=>fn());if(frame)cancelAnimationFrame(frame);ctx.clearRect(0,0,canvas.width,canvas.height);}};
}
