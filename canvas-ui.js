const DEFAULT_SOURCE_IDS = Object.freeze([
  'entryScreen','rotateGate','menu','lobbyScreen','connectionOverlay','pause',
  'loadoutPanel','settingsPanel','adminPanel','lobbyQuitConfirm','chatComposer','gameTextEditor'
]);

const INTERACTIVE_SELECTOR = [
  'button','[role="button"]','[data-game-control]','[data-game-text-target]',
  '.game-text-field','canvas:not(#game):not(#uiCanvas)','[data-controller-key]'
].join(',');
const SCROLL_OVERFLOW = new Set(['auto','scroll']);
const CLIP_OVERFLOW = new Set(['auto','scroll','hidden','clip']);

function finite(value,fallback=0){const n=Number(value);return Number.isFinite(n)?n:fallback;}
function rectOf(value){
  if(!value)return null;
  const left=finite(value.left??value.x),top=finite(value.top??value.y),width=Math.max(0,finite(value.width)),height=Math.max(0,finite(value.height));
  return {left,top,right:left+width,bottom:top+height,width,height};
}
function intersectRect(a,b){
  if(!a)return b?{...b}:null;if(!b)return{...a};
  const left=Math.max(a.left,b.left),top=Math.max(a.top,b.top),right=Math.min(a.right,b.right),bottom=Math.min(a.bottom,b.bottom);
  if(right<=left||bottom<=top)return null;
  return {left,top,right,bottom,width:right-left,height:bottom-top};
}
function contains(rect,x,y){return !!rect&&x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;}
function intersects(a,b){return !!intersectRect(a,b);}
function rgbaVisible(value){
  const s=String(value||'').trim().toLowerCase();
  return !!s&&s!=='transparent'&&!/^rgba\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\)$/.test(s)&&!/^hsla\([^,]+,[^,]+,[^,]+,\s*0(?:\.0+)?\)$/.test(s);
}
function firstRadius(style){return Math.max(0,finite(String(style?.borderTopLeftRadius||'0').match(/[\d.]+/)?.[0]));}
function elementDepth(el){let depth=0;for(let n=el;n;n=n.parentElement)depth++;return depth;}
function zIndexOf(el){const z=Number.parseInt(getComputedStyle(el).zIndex,10);return Number.isFinite(z)?z:0;}
function domOrder(a,b){if(a===b)return 0;const pos=a.compareDocumentPosition(b);if(pos&Node.DOCUMENT_POSITION_FOLLOWING)return-1;if(pos&Node.DOCUMENT_POSITION_PRECEDING)return 1;return 0;}
function roundedRectPath(ctx,r,radius=0){
  const rad=Math.max(0,Math.min(radius,r.width/2,r.height/2));
  ctx.beginPath();
  if(!rad){ctx.rect(r.left,r.top,r.width,r.height);return;}
  ctx.moveTo(r.left+rad,r.top);ctx.lineTo(r.right-rad,r.top);ctx.quadraticCurveTo(r.right,r.top,r.right,r.top+rad);
  ctx.lineTo(r.right,r.bottom-rad);ctx.quadraticCurveTo(r.right,r.bottom,r.right-rad,r.bottom);
  ctx.lineTo(r.left+rad,r.bottom);ctx.quadraticCurveTo(r.left,r.bottom,r.left,r.bottom-rad);
  ctx.lineTo(r.left,r.top+rad);ctx.quadraticCurveTo(r.left,r.top,r.left+rad,r.top);ctx.closePath();
}
function parseBorderWidth(value){return Math.max(0,finite(String(value||'0').match(/[\d.]+/)?.[0]));}
function sourceFallbackColor(el){
  if(el.id==='entryScreen'||el.id==='rotateGate')return'#070a0c';
  if(el.id==='menu'||el.id==='lobbyScreen'||el.id==='pause'||el.id==='connectionOverlay')return'rgba(7,10,12,.985)';
  if(el.id==='settingsPanel'||el.id==='adminPanel'||el.id==='loadoutPanel'||el.id==='gameTextEditor')return'rgba(5,8,10,.95)';
  if(el.id==='chatComposer')return'rgba(0,0,0,0)';
  return'rgba(0,0,0,0)';
}
function transformedText(text,style){
  const mode=style?.textTransform;
  if(mode==='uppercase')return text.toUpperCase();
  if(mode==='lowercase')return text.toLowerCase();
  if(mode==='capitalize')return text.replace(/\b\p{L}/gu,m=>m.toUpperCase());
  return text;
}
function fontString(style){
  const fontStyle=style.fontStyle&&style.fontStyle!=='normal'?`${style.fontStyle} `:'';
  const weight=style.fontWeight||'400',size=style.fontSize||'12px',family=style.fontFamily||'system-ui';
  return `${fontStyle}${weight} ${size} ${family}`;
}
function clipForElement(el,viewport,stopAt){
  let clip={...viewport};
  for(let n=el.parentElement;n&&n!==stopAt.parentElement;n=n.parentElement){
    const s=getComputedStyle(n),ox=s.overflowX||s.overflow,oy=s.overflowY||s.overflow;
    if(CLIP_OVERFLOW.has(ox)||CLIP_OVERFLOW.has(oy)){
      clip=intersectRect(clip,rectOf(n.getBoundingClientRect()));
      if(!clip)return null;
    }
    if(n===stopAt)break;
  }
  return clip;
}
function elementDisplayed(el){
  if(!el?.isConnected)return false;
  if(el.hidden||el.closest?.('[hidden]'))return false;
  for(let n=el;n;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none')return false;}
  const r=el.getBoundingClientRect();return r.width>.4&&r.height>.4;
}
function visibleSources(ids){
  const raw=ids.map(id=>document.getElementById(id)).filter(elementDisplayed);
  const roots=raw.filter(el=>!raw.some(other=>other!==el&&other.contains(el)));
  return roots.sort((a,b)=>zIndexOf(a)-zIndexOf(b)||domOrder(a,b));
}
function nearestScrollable(el,stopAt){
  for(let n=el;n&&n!==stopAt?.parentElement;n=n.parentElement){
    const s=getComputedStyle(n),x=s.overflowX||s.overflow,y=s.overflowY||s.overflow;
    if((SCROLL_OVERFLOW.has(y)&&n.scrollHeight>n.clientHeight+2)||(SCROLL_OVERFLOW.has(x)&&n.scrollWidth>n.clientWidth+2))return n;
    if(n===stopAt)break;
  }
  return null;
}
function svgIconName(svg){
  const use=svg?.querySelector?.('use');if(!use)return'';
  const href=use.getAttribute('href')||use.getAttribute('xlink:href')||'';return href.replace(/^#/,'');
}
function drawIcon(ctx,name,r,color){
  const cx=r.left+r.width/2,cy=r.top+r.height/2,s=Math.min(r.width,r.height)*.72,h=s/2,l=cx-h,t=cy-h,rr=cx+h,b=cy+h;
  ctx.save();ctx.strokeStyle=color||'#fff';ctx.fillStyle=color||'#fff';ctx.lineWidth=Math.max(1.2,s*.09);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
  switch(name){
    case'i-plus':ctx.moveTo(cx,t);ctx.lineTo(cx,b);ctx.moveTo(l,cy);ctx.lineTo(rr,cy);break;
    case'i-close':ctx.moveTo(l,t);ctx.lineTo(rr,b);ctx.moveTo(rr,t);ctx.lineTo(l,b);break;
    case'i-play':ctx.moveTo(l+s*.25,t);ctx.lineTo(rr,cy);ctx.lineTo(l+s*.25,b);ctx.closePath();ctx.fill();ctx.restore();return;
    case'i-refresh':ctx.arc(cx,cy,s*.34,-.35,Math.PI*1.55);ctx.moveTo(rr-s*.05,t+s*.2);ctx.lineTo(rr-s*.05,t+s*.48);ctx.lineTo(rr-s*.32,t+s*.44);break;
    case'i-full':ctx.moveTo(l+s*.34,t);ctx.lineTo(l,t);ctx.lineTo(l,t+s*.34);ctx.moveTo(rr-s*.34,t);ctx.lineTo(rr,t);ctx.lineTo(rr,t+s*.34);ctx.moveTo(l+s*.34,b);ctx.lineTo(l,b);ctx.lineTo(l,b-s*.34);ctx.moveTo(rr-s*.34,b);ctx.lineTo(rr,b);ctx.lineTo(rr,b-s*.34);break;
    case'i-sound':case'i-mute':ctx.moveTo(l,cy-s*.18);ctx.lineTo(l+s*.22,cy-s*.18);ctx.lineTo(cx,cy-s*.38);ctx.lineTo(cx,cy+s*.38);ctx.lineTo(l+s*.22,cy+s*.18);ctx.lineTo(l,cy+s*.18);ctx.closePath();if(name==='i-mute'){ctx.moveTo(cx+s*.18,cy-s*.2);ctx.lineTo(rr,cy+s*.2);ctx.moveTo(rr,cy-s*.2);ctx.lineTo(cx+s*.18,cy+s*.2);}else{ctx.moveTo(cx+s*.15,cy-s*.18);ctx.quadraticCurveTo(rr,cy, cx+s*.15,cy+s*.18);}break;
    case'i-enter':case'i-exit':ctx.moveTo(l,cy);ctx.lineTo(rr-s*.18,cy);ctx.moveTo(rr-s*.42,t+s*.28);ctx.lineTo(rr-s*.12,cy);ctx.lineTo(rr-s*.42,b-s*.28);break;
    case'i-settings':ctx.arc(cx,cy,s*.2,0,Math.PI*2);for(let i=0;i<8;i++){const a=i*Math.PI/4,ri=s*.31,ro=s*.46;ctx.moveTo(cx+Math.cos(a)*ri,cy+Math.sin(a)*ri);ctx.lineTo(cx+Math.cos(a)*ro,cy+Math.sin(a)*ro);}break;
    case'i-team':ctx.arc(cx-s*.2,cy-s*.18,s*.14,0,Math.PI*2);ctx.moveTo(l+s*.08,b-s*.12);ctx.quadraticCurveTo(cx-s*.2,cy+s*.1,cx+s*.02,b-s*.12);ctx.arc(cx+s*.22,cy-s*.08,s*.11,0,Math.PI*2);ctx.moveTo(cx+s*.08,b-s*.1);ctx.quadraticCurveTo(cx+s*.24,cy+s*.13,rr-s*.04,b-s*.1);break;
    case'i-copy':ctx.rect(cx-s*.1,cy-s*.08,s*.38,s*.38);ctx.moveTo(cx-s*.28,cy+s*.12);ctx.lineTo(cx-s*.28,cy-s*.28);ctx.lineTo(cx+s*.12,cy-s*.28);break;
    case'i-chat':ctx.rect(l+s*.08,t+s*.12,s*.84,s*.58);ctx.moveTo(l+s*.25,b-s*.3);ctx.lineTo(l+s*.18,b-s*.08);ctx.lineTo(l+s*.45,b-s*.3);break;
    case'i-loadout':ctx.moveTo(l,cy-s*.12);ctx.lineTo(cx+s*.05,cy-s*.12);ctx.lineTo(cx+s*.25,cy-s*.26);ctx.lineTo(rr,cy-s*.26);ctx.lineTo(rr,cy+s*.03);ctx.lineTo(cx+s*.25,cy+s*.03);ctx.lineTo(cx+s*.05,cy-s*.08);ctx.moveTo(cx-s*.08,cy-s*.08);ctx.lineTo(cx-s*.08,cy+s*.3);break;
    case'i-shield':ctx.moveTo(cx,t);ctx.lineTo(rr-s*.08,t+s*.18);ctx.lineTo(rr-s*.14,cy+s*.18);ctx.quadraticCurveTo(cx,b,cx,b);ctx.quadraticCurveTo(l+s*.14,cy+s*.18,l+s*.14,cy+s*.18);ctx.lineTo(l+s*.08,t+s*.18);ctx.closePath();break;
    case'i-mark':ctx.moveTo(l+s*.22,t);ctx.lineTo(cx+s*.1,t);ctx.quadraticCurveTo(rr,cy-s*.18,cx+s*.18,cy);ctx.quadraticCurveTo(rr,cy+s*.18,cx+s*.1,b);ctx.lineTo(l+s*.22,b);ctx.closePath();ctx.stroke();break;
    default:ctx.arc(cx,cy,s*.24,0,Math.PI*2);break;
  }
  ctx.stroke();ctx.restore();
}

function cssColors(value){
  const text=String(value||'');
  const out=[];
  const re=/(?:rgba?\([^)]*\)|hsla?\([^)]*\)|#[0-9a-f]{3,8}\b|\btransparent\b)/gi;
  let m;while((m=re.exec(text)))out.push(m[0]);
  return out;
}
function splitGradientLayers(value){
  const text=String(value||'').trim();if(!text||text==='none')return[];
  const layers=[];let start=0,depth=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];if(c==='(')depth++;else if(c===')')depth=Math.max(0,depth-1);else if(c===','&&depth===0){layers.push(text.slice(start,i).trim());start=i+1;}
  }
  layers.push(text.slice(start).trim());return layers.filter(Boolean);
}
function gradientDescriptor(layer){
  const colors=cssColors(layer);if(colors.length<2)return null;
  const stops=colors.map((color,i)=>({color,at:colors.length===1?0:i/(colors.length-1)}));
  if(/^linear-gradient/i.test(layer)){
    const deg=finite(layer.match(/linear-gradient\(\s*(-?[\d.]+)deg/i)?.[1],180);
    return{kind:'linear',deg,stops};
  }
  if(/^radial-gradient/i.test(layer)){
    const at=layer.match(/\bat\s+([\d.]+)%\s+([\d.]+)%/i);
    return{kind:'radial',cx:at?finite(at[1],50)/100:.5,cy:at?finite(at[2],50)/100:.5,stops};
  }
  return null;
}
function drawBackground(ctx,rect,fill,image,radius=0){
  const layers=splitGradientLayers(image).map(gradientDescriptor).filter(Boolean);
  roundedRectPath(ctx,rect,radius);ctx.save();ctx.clip();
  if(rgbaVisible(fill)){ctx.fillStyle=fill;ctx.fillRect(rect.left,rect.top,rect.width,rect.height);}
  for(let i=layers.length-1;i>=0;i--){
    const layer=layers[i];let g;
    if(layer.kind==='linear'){
      const a=(layer.deg-90)*Math.PI/180,dx=Math.cos(a),dy=Math.sin(a),span=Math.abs(dx)*rect.width+Math.abs(dy)*rect.height||1;
      const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      g=ctx.createLinearGradient(cx-dx*span/2,cy-dy*span/2,cx+dx*span/2,cy+dy*span/2);
    }else{
      const cx=rect.left+rect.width*layer.cx,cy=rect.top+rect.height*layer.cy,r=Math.max(rect.width,rect.height)*.72;
      g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
    }
    for(const stop of layer.stops){try{g.addColorStop(Math.max(0,Math.min(1,stop.at)),stop.color);}catch{}}
    ctx.fillStyle=g;ctx.fillRect(rect.left,rect.top,rect.width,rect.height);
  }
  ctx.restore();
}
function buildCommands(sources,viewport){
  const commands=[],interactives=[];
  const range=document.createRange();
  const paintNode=(node,root,ancestorAlpha=1)=>{
    if(node.nodeType===Node.TEXT_NODE){
      const parent=node.parentElement;if(!parent||!node.nodeValue||!node.nodeValue.trim())return;
      const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.color==='transparent')return;
      const clip=clipForElement(parent,viewport,root);if(!clip)return;
      const text=node.nodeValue,matcher=/\S+/gu;let match;
      while((match=matcher.exec(text))){
        const start=match.index,end=start+match[0].length;try{range.setStart(node,start);range.setEnd(node,end);}catch{continue;}
        for(const rawRect of range.getClientRects()){
          const r=rectOf(rawRect),visible=intersectRect(r,clip);if(!visible)continue;
          commands.push({type:'text',text:transformedText(match[0],style),x:r.left,y:r.top,w:r.width,h:r.height,clip,font:fontString(style),color:style.color,align:style.textAlign||'left',alpha:ancestorAlpha});
        }
      }
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    const el=node;if(el!==root&&!elementDisplayed(el))return;
    const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden')return;
    const rect=rectOf(el.getBoundingClientRect()),clip=clipForElement(el,viewport,root);if(!clip||!rect||!intersects(rect,clip))return;
    const ownOpacity=el===root?1:Math.max(0,Math.min(1,finite(style.opacity,1))),alpha=ancestorAlpha*ownOpacity;
    if(alpha<=.005)return;
    const radius=firstRadius(style),bg=rgbaVisible(style.backgroundColor)?style.backgroundColor:(el===root?sourceFallbackColor(el):''),bgImage=style.backgroundImage&&style.backgroundImage!=='none'?style.backgroundImage:'';
    if(bg||bgImage)commands.push({type:'box',rect,clip,radius,fill:bg,image:bgImage,alpha});
    const bw=Math.max(parseBorderWidth(style.borderTopWidth),parseBorderWidth(style.borderRightWidth),parseBorderWidth(style.borderBottomWidth),parseBorderWidth(style.borderLeftWidth));
    const bc=rgbaVisible(style.borderTopColor)?style.borderTopColor:'';
    if(bw>.2&&bc)commands.push({type:'border',rect,clip,radius,color:bc,width:bw,alpha});
    if(el.classList?.contains('controller-focus')||el.classList?.contains('controller-card-focus'))commands.push({type:'focus',rect,clip,radius,color:'#d7ff58',width:2,alpha:1});
    const tag=String(el.tagName||'').toUpperCase();
    if(tag==='CANVAS')commands.push({type:'canvas',el,rect,clip,alpha});
    else if(tag==='IMG')commands.push({type:'image',el,rect,clip,alpha});
    else if(tag==='SVG'){
      const name=svgIconName(el);if(name)commands.push({type:'icon',name,rect,clip,color:style.color||'#fff',alpha});
      return;
    }
    if(el.matches?.(INTERACTIVE_SELECTOR)&&!el.disabled&&!el.classList.contains('disabled'))interactives.push({el,rect,clip,depth:elementDepth(el),z:zIndexOf(el),root});
    for(const child of el.childNodes)paintNode(child,root,alpha);
  };
  for(const source of sources){
    const sourceRect=rectOf(source.getBoundingClientRect()),clip=intersectRect(viewport,sourceRect)||viewport;
    commands.push({type:'sourceBackdrop',rect:viewport,clip:viewport,fill:sourceFallbackColor(source),alpha:1});
    paintNode(source,source,1);
  }
  interactives.sort((a,b)=>a.z-b.z||a.depth-b.depth||domOrder(a.el,b.el));
  return {commands,interactives};
}
function drawCommands(ctx,commands,dpr){
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,ctx.canvas.width/dpr,ctx.canvas.height/dpr);
  for(const cmd of commands){
    const clip=cmd.clip;if(!clip)continue;ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,cmd.alpha??1));ctx.beginPath();ctx.rect(clip.left,clip.top,clip.width,clip.height);ctx.clip();
    if(cmd.type==='sourceBackdrop'){if(rgbaVisible(cmd.fill)){ctx.fillStyle=cmd.fill;ctx.fillRect(cmd.rect.left,cmd.rect.top,cmd.rect.width,cmd.rect.height);}}
    else if(cmd.type==='box'){drawBackground(ctx,cmd.rect,cmd.fill,cmd.image,cmd.radius);}
    else if(cmd.type==='border'||cmd.type==='focus'){const inset=(cmd.width||1)/2,r={left:cmd.rect.left+inset,top:cmd.rect.top+inset,right:cmd.rect.right-inset,bottom:cmd.rect.bottom-inset,width:Math.max(0,cmd.rect.width-inset*2),height:Math.max(0,cmd.rect.height-inset*2)};roundedRectPath(ctx,r,Math.max(0,cmd.radius-inset));ctx.strokeStyle=cmd.color;ctx.lineWidth=cmd.width||1;ctx.stroke();if(cmd.type==='focus'){ctx.globalAlpha*=.12;ctx.fillStyle=cmd.color;roundedRectPath(ctx,r,Math.max(0,cmd.radius-inset));ctx.fill();}}
    else if(cmd.type==='text'){ctx.font=cmd.font;ctx.fillStyle=cmd.color;ctx.textBaseline='top';ctx.textAlign='left';ctx.fillText(cmd.text,cmd.x,cmd.y);}
    else if(cmd.type==='canvas'){try{if(cmd.el.width>0&&cmd.el.height>0)ctx.drawImage(cmd.el,cmd.rect.left,cmd.rect.top,cmd.rect.width,cmd.rect.height);}catch{}}
    else if(cmd.type==='image'){try{if(cmd.el.complete&&cmd.el.naturalWidth)ctx.drawImage(cmd.el,cmd.rect.left,cmd.rect.top,cmd.rect.width,cmd.rect.height);}catch{}}
    else if(cmd.type==='icon')drawIcon(ctx,cmd.name,cmd.rect,cmd.color);
    ctx.restore();
  }
}
function dispatchPointer(target,type,sourceEvent){
  if(!target||typeof PointerEvent!=='function')return;
  try{target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:sourceEvent.clientX,clientY:sourceEvent.clientY,pointerId:sourceEvent.pointerId,pointerType:sourceEvent.pointerType||'mouse',button:sourceEvent.button??0,buttons:type==='pointerup'?0:(sourceEvent.buttons||1),pressure:type==='pointerup'?0:(sourceEvent.pressure||.5)}));}catch{}
}

export function createCanvasUiBridge({canvas,sourceIds=DEFAULT_SOURCE_IDS,onAfterAction=()=>{}}={}){
  if(!canvas)throw new Error('Canvas UI bridge requires a canvas.');
  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!ctx)throw new Error('Canvas UI bridge could not create a 2D context.');
  let sources=[],commands=[],interactives=[],dirty=true,running=false,raf=0,lastPaint=0,hover=null,press=null;
  const viewport=()=>({left:0,top:0,right:innerWidth,bottom:innerHeight,width:innerWidth,height:innerHeight});
  function resize(){const dpr=Math.max(1,Math.min(3,finite(devicePixelRatio,1))),w=Math.max(1,Math.round(innerWidth*dpr)),h=Math.max(1,Math.round(innerHeight*dpr));if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;canvas.style.width=`${innerWidth}px`;canvas.style.height=`${innerHeight}px`;dirty=true;}return dpr;}
  function active(){sources=visibleSources(sourceIds);return sources.length>0;}
  function rebuild(){sources=visibleSources(sourceIds);const built=buildCommands(sources,viewport());commands=built.commands;interactives=built.interactives;dirty=false;}
  function render(now=performance.now()){
    raf=requestAnimationFrame(render);const hasUi=active();canvas.classList.toggle('active',hasUi);canvas.style.pointerEvents=hasUi?'auto':'none';if(!hasUi){if(commands.length||lastPaint){commands=[];interactives=[];const dpr=resize();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,innerWidth,innerHeight);lastPaint=0;}return;}
    const dpr=resize();if(!dirty&&now-lastPaint<33)return;if(dirty)rebuild();drawCommands(ctx,commands,dpr);lastPaint=now;
  }
  function hit(x,y){for(let i=interactives.length-1;i>=0;i--){const item=interactives[i];if(contains(item.rect,x,y)&&contains(item.clip,x,y))return item;}return null;}
  function mark(){dirty=true;}
  function setSliderFromPoint(item,x,{commit=false}={}){
    const el=item?.el;if(!el||el.dataset?.gameControl!=='slider')return false;const track=el.querySelector('.game-slider-track')||el,rect=track.getBoundingClientRect(),min=finite(el.dataset.min,0),max=finite(el.dataset.max,1),step=Math.max(.000001,finite(el.dataset.step,.01)),pct=Math.max(0,Math.min(1,(x-rect.left)/Math.max(1,rect.width))),raw=min+(max-min)*pct,value=min+Math.round((raw-min)/step)*step;el.value=String(Number(value.toFixed(4)));el.dispatchEvent(new Event('input',{bubbles:true}));if(commit)el.dispatchEvent(new Event('change',{bubbles:true}));mark();return true;
  }
  function pointerDown(e){
    e.preventDefault();e.stopPropagation();canvas.setPointerCapture?.(e.pointerId);const item=hit(e.clientX,e.clientY),scrollable=item?nearestScrollable(item.el,item.root):null;press={item,startX:e.clientX,startY:e.clientY,lastX:e.clientX,lastY:e.clientY,pointerId:e.pointerId,dragged:false,scrollable};hover=item?.el||null;
    if(item?.el?.dataset?.gameControl==='slider'){setSliderFromPoint(item,e.clientX);press.slider=true;return;}
    if(item?.el?.matches?.('[data-loadout-ads-preview]')||item?.el?.tagName==='CANVAS'){dispatchPointer(item.el,'pointerdown',e);press.forwarded=true;}
  }
  function pointerMove(e){
    if(!press||press.pointerId!==e.pointerId){hover=hit(e.clientX,e.clientY)?.el||null;return;}e.preventDefault();e.stopPropagation();const dx=e.clientX-press.lastX,dy=e.clientY-press.lastY,total=Math.hypot(e.clientX-press.startX,e.clientY-press.startY);if(total>7)press.dragged=true;
    if(press.slider){setSliderFromPoint(press.item,e.clientX);}
    else if(press.forwarded)dispatchPointer(press.item.el,'pointermove',e);
    else if(press.dragged&&press.scrollable){press.scrollable.scrollLeft-=dx;press.scrollable.scrollTop-=dy;mark();}
    press.lastX=e.clientX;press.lastY=e.clientY;
  }
  function finishPointer(e,canceled=false){
    if(!press||press.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();const state=press;press=null;try{canvas.releasePointerCapture?.(e.pointerId);}catch{}
    if(state.slider){setSliderFromPoint(state.item,e.clientX,{commit:true});onAfterAction();return;}
    if(state.forwarded){dispatchPointer(state.item.el,canceled?'pointercancel':'pointerup',e);mark();onAfterAction();return;}
    if(!canceled&&!state.dragged&&state.item?.el&&!state.item.el.disabled){try{state.item.el.click();}catch{}mark();onAfterAction();}
  }
  function wheel(e){const item=hit(e.clientX,e.clientY),scroller=item?nearestScrollable(item.el,item.root):sources.map(s=>nearestScrollable(s,s)).find(Boolean);if(!scroller)return;e.preventDefault();e.stopPropagation();scroller.scrollTop+=e.deltaY;scroller.scrollLeft+=e.deltaX;mark();}
  function suppressGesture(e){e.preventDefault();}
  const observer=new MutationObserver(mark);
  function start(){
    if(running)return;running=true;for(const id of sourceIds){const el=document.getElementById(id);if(el)el.classList.add('canvas-ui-source');}
    for(const id of sourceIds){const source=document.getElementById(id);if(source)observer.observe(source,{subtree:true,childList:true,attributes:true,characterData:true});}
    canvas.addEventListener('pointerdown',pointerDown,{passive:false});canvas.addEventListener('pointermove',pointerMove,{passive:false});canvas.addEventListener('pointerup',e=>finishPointer(e,false),{passive:false});canvas.addEventListener('pointercancel',e=>finishPointer(e,true),{passive:false});canvas.addEventListener('touchstart',suppressGesture,{passive:false});canvas.addEventListener('touchmove',suppressGesture,{passive:false});canvas.addEventListener('touchend',suppressGesture,{passive:false});canvas.addEventListener('wheel',wheel,{passive:false});canvas.addEventListener('dblclick',suppressGesture,{passive:false});canvas.addEventListener('contextmenu',suppressGesture,{passive:false});
    for(const type of ['gesturestart','gesturechange','gestureend'])document.addEventListener(type,suppressGesture,{passive:false,capture:true});
    document.addEventListener('selectstart',suppressGesture,{capture:true});document.addEventListener('dragstart',suppressGesture,{capture:true});document.addEventListener('scroll',mark,{capture:true,passive:true});
    addEventListener('resize',mark,{passive:true});visualViewport?.addEventListener?.('resize',mark,{passive:true});raf=requestAnimationFrame(render);
  }
  function destroy(){if(!running)return;running=false;observer.disconnect();cancelAnimationFrame(raf);canvas.removeEventListener('pointerdown',pointerDown);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('wheel',wheel);}
  return {start,destroy,invalidate:mark,get active(){return sources.length>0;}};
}
