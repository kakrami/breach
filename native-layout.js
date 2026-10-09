/*
 * Breach native menu scene renderer.
 *
 * Main-menu workflows are owned by game-menu.js. This module owns native
 * overlay layout, paint, clipping and hit geometry. The
 * widget graph is a semantic/control model; no DOM/CSS measurement is used.
 * All dimensions below are logical pixels. Browser canvas scaling is applied
 * once at the output boundary. Keep the same graph for touch, mouse, keyboard,
 * controller and accessibility rather than introducing parallel UI layouts.
 */
import { THEME, drawPanel, drawButton, drawLabel } from './native-ui.js?v=2.22.1';
import { NATIVE_SCREEN_IDS } from './native-screen-tree.js?v=2.22.1';

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
  const safe={top:Math.max(0,num(safeArea.top)),right:Math.max(0,num(safeArea.right)),bottom:Math.max(0,num(safeArea.bottom)),left:Math.max(0,num(safeArea.left))};
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
  let dpr=1,dirty=true,disposed=false,lastRevision=-1,lastScreen='',hover=null,lastNoticeKey='',lastMenuFrame=0;
  let hits=[],scrolls=[],painted=[],activeScreen=null,pointer=null,clip=null;
  const previewPointers=new Map();
  const artwork=new Map(),pages=new WeakMap();
  globalThis.document?.fonts?.load('700 28px "Breach Display"').then(()=>{dirty=true;}).catch(()=>{});
  const removers=[];
  const get=id=>ui.getElementById(id);
  const q=(selector,root=ui.root)=>root?.querySelector?.(selector);
  const qa=(selector,root=ui.root)=>Array.from(root?.querySelectorAll?.(selector)||[]);
  const viewRect=()=>rect(0,0,vp.width,vp.height);

  function mark(n,r,style={}) {
    if(!n)return;
    n.setRect?.(r);if(!n.setRect)n._rect=r;
    n.layoutClip=clip?{...clip}:viewRect();
    n.layoutStyle={display:'block',visibility:'visible',fontSize:'14px',lineHeight:'20px',...style};
    painted.push(n);
  }
  function zero(n){if(!n)return;n.setRect?.(ZERO);if(!n.setRect)n._rect=ZERO;n.layoutClip=null;for(const c of children(n))zero(c);}
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
    else {const size=options.fontSize||(isTab&&vp.compact?13:14),maxLines=options.maxLines||(isTab?1:2),padding=isTab||r.width<=72?4:12,available=Math.max(8,r.width-(options.arrow?56:padding*2)),rows=splitLines(caption,available,size,650,maxLines);const th=rows.length*size*1.2;txt(caption,r.left+padding,r.top+(r.height-th)/2,available,size,color,650,{maxLines,lineHeight:size*1.2,align:options.center||isTab?'center':'left'});}
    if(options.arrow)arrow(r,color);if(isTab&&active){line(r.left+8,r.bottom-1,r.right-8,r.bottom-1,C.lime,3);fade(r,'rgba(200,235,105,0)','rgba(200,235,105,.08)');};ctx.restore();focusRing(n,r);hit(n,r,{action:options.action});
    // Descendant labels share the button geometry for semantic focus anchors.
    for(const c of children(n))if(!interactive(c)&&kind(c)!=='canvas')mark(c,r);
  }
  function withClip(r,fn){const previous=clip;clip=intersect(previous||viewRect(),r);if(!clip){clip=previous;return;}ctx.save();ctx.beginPath();ctx.rect(clip.left,clip.top,clip.width,clip.height);ctx.clip();fn();ctx.restore();clip=previous;}
  function simpleText(n,r,{size=14,color=C.muted,weight=500,maxLines=4}={}){if(!n||!shown(n))return;mark(n,r);txt(text(n),r.left,r.top,r.width,size,color,weight,{maxLines});}
  function art(name,r,{cover=false,alpha=1}={}){
    let img=artwork.get(name);if(!img&&typeof Image!=='undefined'){img=new Image();artwork.set(name,img);img.onload=()=>{dirty=true;};img.src=new URL('./menu-assets/'+name+new URL(import.meta.url).search,import.meta.url).href;}
    if(!img?.complete||!img.naturalWidth)return false;
    const scale=cover?Math.max(r.width/img.width,r.height/img.height):Math.min(r.width/img.width,r.height/img.height),w=img.width*scale,h=img.height*scale;
    ctx.save();ctx.globalAlpha*=alpha;withClip(r,()=>ctx.drawImage(img,r.left+(r.width-w)/2,r.top+(r.height-h)/2,w,h));ctx.restore();return true;
  }
  function fade(r,from,to,horizontal=false){const g=ctx.createLinearGradient(r.left,r.top,horizontal?r.right:r.left,horizontal?r.top:r.bottom);g.addColorStop(0,from);g.addColorStop(1,to);ctx.fillStyle=g;ctx.fillRect(r.left,r.top,r.width,r.height);}
  function selectedMap(){return q('.lobby-map-choice.active')?.dataset?.lobbyMapChoice||'highlands';}
  function sceneArt(r,map=selectedMap(),alpha=1){if(['highlands','depot','yard','rig','moon'].includes(map))return art('world-'+map+'.jpg',r,{cover:true,alpha});const cv=get('lobbyMapPreview')?.source;if(cv){ctx.save();ctx.globalAlpha*=alpha;ctx.drawImage(cv,r.left,r.top,r.width,r.height);ctx.restore();return true;}return false;}
  function background(){
    ctx.fillStyle='#0a0e11';ctx.fillRect(0,0,vp.width,vp.height);sceneArt(viewRect(),selectedMap(),.22);
    fade(viewRect(),'rgba(5,9,12,.4)','#090d10');
  }

  function pageRange(owner,r,total,capacity){
    capacity=Math.max(1,capacity);let state=pages.get(owner);if(!state){state={page:0,prev:ui.createElement('button'),next:ui.createElement('button')};state.prev.className=state.next.className='native-pager-control';state.prev.textContent='‹';state.next.textContent='›';state.prev.setAttribute('aria-label','Previous page');state.next.setAttribute('aria-label','Next page');state.prev.addEventListener('click',()=>{state.page=Math.max(0,state.page-1);dirty=true;});state.next.addEventListener('click',()=>{state.page++;dirty=true;});pages.set(owner,state);}
    const count=Math.max(1,Math.ceil(total/capacity));state.page=clamp(state.page,0,count-1);
    if(count>1){if(state.prev.parentElement!==owner)owner.append(state.prev,state.next);state.prev.disabled=state.page===0;state.next.disabled=state.page===count-1;button(state.prev,rect(r.right-100,r.bottom-44,44,44),{center:true,fontSize:20});button(state.next,rect(r.right-44,r.bottom-44,44,44),{center:true,fontSize:20});txt(`${state.page+1} / ${count}`,r.left,r.bottom-28,Math.max(30,r.width-112),10,C.muted,600);}
    return{start:state.page*capacity,end:Math.min(total,(state.page+1)*capacity),count};
  }
  function confirmScreen(n){ctx.fillStyle='rgba(2,4,5,.78)';ctx.fillRect(0,0,vp.width,vp.height);const w=Math.min(480,vp.content.width),pad=24,title=q('h2',n),copy=q('p',n),buttons=qa('button',n).filter(shown),copyH=copy?Math.max(44,splitLines(text(copy),w-pad*2,14,500).length*19+8):0,h=148+copyH,r=rect((vp.width-w)/2,(vp.height-h)/2,w,h);panel(r,C.raised,C.line);mark(n,r);txt(text(title)||'Confirm',r.left+pad,r.top+24,w-pad*2,24,C.text,750);if(copy)simpleText(copy,rect(r.left+pad,r.top+66,w-pad*2,copyH),{color:C.muted,maxLines:5});const bw=(w-pad*2-8*(buttons.length-1))/Math.max(1,buttons.length);buttons.forEach((a,i)=>button(a,rect(r.left+pad+i*(bw+8),r.bottom-68,bw,48),{center:true}));}
  function entryScreen(n){background();mark(n,viewRect());const w=Math.min(400,vp.content.width),x=(vp.width-w)/2,y=Math.max(vp.safe.top+8,(vp.height-vp.safe.bottom-300)/2);panel(rect((vp.width-56)/2,y,56,56),C.lime,null,4);txt('B',(vp.width-56)/2+10,y-1,40,46,'#111605',850);txt('BREACH',x,y+88,w,44,C.text,850,{align:'center'});const version=q('[data-app-version]',n);if(version)simpleText(version,rect(x,y+145,w,22),{color:C.muted,maxLines:1});button(get('enterFullscreenBtn'),rect(x,y+194,w,52),{primary:true,label:'Enter Breach',center:true});const status=get('entryStatus');if(text(status))simpleText(status,rect(x,y+268,w,80),{color:cls(status,'error')?C.red:C.muted,maxLines:4});}
  function connectionScreen(n){ctx.fillStyle='rgba(3,6,8,.88)';ctx.fillRect(0,0,vp.width,vp.height);const w=Math.min(420,vp.content.width),r=rect((vp.width-w)/2,(vp.height-188)/2,w,188);panel(r,C.raised,C.line);mark(n,r);ctx.beginPath();ctx.arc(r.left+30,r.top+37,9,performanceNow()/650,performanceNow()/650+Math.PI*1.45);ctx.strokeStyle=C.lime;ctx.lineWidth=3;ctx.stroke();simpleText(get('connectionText'),rect(r.left+54,r.top+27,w-78,72),{size:18,color:C.text,weight:650,maxLines:3});button(get('connectionCancelBtn'),rect(r.left+24,r.bottom-72,w-48,48),{center:true});}
  function keyboardScreen(n){
    ctx.fillStyle='#101713';ctx.fillRect(0,0,vp.width,vp.height);mark(n,viewRect());
    const editor=n.id==='gameTextEditor',kb=get(editor?'gameTextKeyboard':'chatKeyboard'),prefix=editor?'editor':'chat';
    const keyOf=char=>{let k=qa('button',kb).find(k=>k.dataset[prefix+'Char']===char);if(!k){k=ui.createElement('button');k.dataset[prefix+'Char']=char;k.textContent=char;kb.append(k);}return k;};
    const action=name=>qa('button',kb).find(k=>k.dataset[prefix+'Action']===name);
    let mode=kb._modeButton;if(!mode){mode=ui.createElement('button');mode.setAttribute('aria-label','Switch letters and symbols');mode.addEventListener('click',()=>{kb.dataset.symbols=kb.dataset.symbols==='true'?'false':'true';dirty=true;});kb.append(mode);kb._modeButton=mode;}
    const fullW=Math.min(1030,vp.width-vp.safe.left-vp.safe.right-24),baseX=vp.safe.left+(vp.width-vp.safe.left-vp.safe.right-fullW)/2,top=vp.safe.top+10,bottom=vp.height-vp.safe.bottom-8;
    const historyWidth=editor?0:Math.max(0,Math.min(250,fullW*.26,fullW-16-485)),x=baseX+(editor?0:historyWidth+16),w=fullW-(editor?0:historyWidth+16);
    const title=editor?text(get('gameTextEditorTitle')):'CHAT';txt(title,x,top+8,editor?w-164:82,20,C.text,750);
    const close=action('cancel'),done=editor?action('done'):get('chatSendBtn');
    button(close,rect(x+w-64,top,64,44),{label:editor?'CANCEL':'CLOSE',center:true,fontSize:11});
    if(!editor){button(get('chatChannel-team'),rect(x+82,top,64,44),{label:'TEAM',center:true,fontSize:11});button(get('chatChannel-all'),rect(x+150,top,60,44),{label:'ALL',center:true,fontSize:11});
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
    txt('ROTATE TO PLAY',x,y+72,w,23,C.text,800,{align:'center'});
    txt('Turn your device sideways to continue. Fullscreen is optional.',x+16,y+113,w-32,14,C.muted,500,{maxLines:2,align:'center'});
    button(get('rotateFullscreenBtn'),rect(x,y+180,w,48),{primary:true,center:true,label:'Try fullscreen'});
    const status=get('entryStatus');if(text(status))simpleText(status,rect(x,y+242,w,72),{color:C.muted,maxLines:3});
  }
  const performanceNow=()=>globalThis.performance?.now?.()||Date.now();

  function render(){
    if(disposed)return;dirty=false;lastRevision=ui.revision;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,vp.width,vp.height);hits=[];scrolls=[];painted=[];clip=viewRect();zero(ui.root);
    const screens=NATIVE_SCREEN_IDS.map(get).filter(shown),gates=['entryScreen','rotateGate'],overlayIds=['lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','chatComposer','gameTextEditor'];const main=screens.filter(n=>!overlayIds.includes(n.id)&&!gates.includes(n.id)),overlays=screens.filter(n=>overlayIds.includes(n.id)),ordered=[...main,...overlays,...gates.map(get).filter(shown)];const fullViewport=vp,notice=ordered.length?getNotice():null,noticeText=String(notice?.text||'').trim();lastNoticeKey=noticeText?`${noticeText}|${notice.until||''}`:'';
    // Only the frontmost screen can receive input. Earlier screens can remain
    // visible beneath overlays, but their hit targets never leak through.
    const signature=ordered.map(n=>n.id).join('|');if(signature!==lastScreen){cancelPointer('screen-change');inputOwner?.sync?.('native-screen-change');lastScreen=signature;}
    ordered.forEach(n=>{activeScreen=n;hits=[];scrolls=[];if(menuScene?.draw({context:ctx,viewport:vp,screen:n,mark,hit}))return;switch(n.id){case'entryScreen':entryScreen(n);break;case'rotateGate':rotateScreen(n);break;case'lobbyQuitConfirm':case'mapDeleteConfirm':confirmScreen(n);break;case'connectionOverlay':connectionScreen(n);break;case'gameTextEditor':case'chatComposer':keyboardScreen(n);break;default:throw new Error('Native menu scene is unavailable for '+n.id);}});
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
  function down(e){if(e.button!==undefined&&e.button!==0)return;if(dirty||lastRevision!==ui.revision)render();const h=hitTest(e.clientX,e.clientY),s=scrollAt(e.clientX,e.clientY);if(e.pointerType==='touch'&&h?.node?.dataset?.menuPreview){beginPreviewPointer(e,h);return;}if(pointer&&e.pointerType==='touch'&&(e.pointerId??1)!==pointer.id){e.preventDefault();cancelPointer('multi-touch');return;}if(!h&&!s)return;e.preventDefault();e.stopPropagation();cancelPointer('new-pointer');inputOwner?.sync?.('pointerdown');const owner=inputOwner?.begin?.(e,{target:h?.node||s?.node});if(inputOwner&&!owner)return;const v=h?dispatch(h.node,'pointerdown',e):null;inputOwner?.sync?.('after-pointerdown');if(inputOwner&&!inputOwner.valid?.(owner)){inputOwner.cancel?.(e.pointerId,'down-transition');return;}pointer={id:e.pointerId??1,type:e.pointerType||'mouse',hit:h,scroll:s,start:eventFields(e),lastX:e.clientX,lastY:e.clientY,startX:e.clientX,startY:e.clientY,claimed:!!v?.defaultPrevented,moved:false,context:h?.node?.dataset?.actionContext,owner};ui.focus?.(h?.node||s?.node);try{canvas.setPointerCapture?.(pointer.id);}catch{}dirty=true;}
  function move(e){const multi=previewPointers.get(e.pointerId);if(multi){if(inputOwner&&!inputOwner.valid?.(multi.owner)){cancelPreviewPointer(e.pointerId,'scope-change');return;}e.preventDefault();dispatch(multi.hit.node,'pointermove',e);dirty=true;return;}if(!pointer){const h=hitTest(e.clientX,e.clientY);if(hover!==h?.node){if(hover)dispatch(hover,'pointerleave',e);hover=h?.node;if(hover)dispatch(hover,'pointerenter',e);canvas.style.cursor=h?'pointer':'default';dirty=true;}return;}if((e.pointerId??1)!==pointer.id)return;if(inputOwner&&!inputOwner.valid?.(pointer.owner||pointer.id)){cancelPointer('scope-change');return;}e.preventDefault();const p=pointer,dx=e.clientX-p.lastX,dy=e.clientY-p.lastY,distance=Math.hypot(e.clientX-p.startX,e.clientY-p.startY);if(distance>7)p.moved=true;if(p.claimed&&p.hit)dispatch(p.hit.node,'pointermove',e);else if(p.scroll&&p.moved){if(p.scroll.maxX>0)p.scroll.node.scrollLeft=clamp(num(p.scroll.node.scrollLeft)-dx,0,p.scroll.maxX);p.scroll.node.scrollTop=clamp(num(p.scroll.node.scrollTop)-dy,0,p.scroll.max);dirty=true;}else if(p.hit)dispatch(p.hit.node,'pointermove',e);p.lastX=e.clientX;p.lastY=e.clientY;}
  function up(e){
    const multi=previewPointers.get(e.pointerId);if(multi){previewPointers.delete(e.pointerId);e.preventDefault();e.stopPropagation();const ended=inputOwner?.end?.(e);dispatch(multi.hit.node,ended?.valid===false?'pointercancel':'pointerup',e);try{canvas.releasePointerCapture?.(e.pointerId);}catch{}dirty=true;return;}
    if(dirty||lastRevision!==ui.revision)render();
    if(!pointer||(e.pointerId??1)!==pointer.id)return;
    const p=pointer;pointer=null;e.preventDefault();e.stopPropagation();
    try{
      const valid=!inputOwner||inputOwner.valid?.(p.owner||p.id),ended=inputOwner?.end?.(e);
      if(!valid||ended?.valid===false){dispatch(p.hit?.node,'pointercancel',e);return;}
      const v=p.hit?dispatch(p.hit.node,'pointerup',e):null;
      inputOwner?.sync?.('after-pointerup');
      const clickFields=eventFields(e),stillValid=!inputOwner||inputOwner.valid?.(p.owner||p.id);
      if(stillValid&&p.hit&&p.context===p.hit.node.dataset?.actionContext&&hitTest(e.clientX,e.clientY)?.node===p.hit.node&&!p.claimed&&!v?.defaultPrevented&&!p.moved&&inside(p.hit.rect,e.clientX,e.clientY)&&enabled(p.hit.node)&&(!inputOwner||inputOwner.allowsClick?.(clickFields)!==false)){
        if(p.hit.action)p.hit.action();else ui.dispatch?.(p.hit.node,'click',clickFields);
        inputOwner?.sync?.('after-click');onAfterAction(p.hit.node);
      }
    }finally{try{canvas.releasePointerCapture?.(p.id);}catch{}dirty=true;}
  }
  function wheel(e){const h=hitTest(e.clientX,e.clientY);if(h?.node?.dataset?.menuPreview||h?.node?.dataset?.menuRail){e.preventDefault();ui.dispatch?.(h.node,'wheel',{...eventFields(e),deltaX:e.deltaX,deltaY:e.deltaY});dirty=true;return;}const s=scrollAt(e.clientX,e.clientY);if(!s)return;e.preventDefault();if(s.maxX>0&&(Math.abs(e.deltaX)>Math.abs(e.deltaY)||e.shiftKey))s.node.scrollLeft=clamp(num(s.node.scrollLeft)+num(e.deltaX||e.deltaY),0,s.maxX);else s.node.scrollTop=clamp(num(s.node.scrollTop)+num(e.deltaY),0,s.max);dirty=true;}
  function listen(target,type,fn,options){target?.addEventListener?.(type,fn,options);removers.push(()=>target?.removeEventListener?.(type,fn,options));}
  listen(canvas,'pointerleave',e=>{if(hover)dispatch(hover,'pointerleave',e);hover=null;dirty=true;});listen(canvas,'pointerdown',down,{passive:false});listen(canvas,'pointermove',move,{passive:false});listen(canvas,'pointerup',up,{passive:false});listen(canvas,'pointercancel',e=>{if(!cancelPreviewPointer(e.pointerId,'pointercancel'))cancelPointer('pointercancel');});listen(canvas,'lostpointercapture',e=>{if(previewPointers.has(e.pointerId))cancelPreviewPointer(e.pointerId,'capture-lost');else if(pointer?.id===e.pointerId)cancelPointer('capture-lost');});listen(canvas,'wheel',wheel,{passive:false});listen(canvas,'contextmenu',e=>{e.preventDefault();cancelPointer('contextmenu');});listen(globalThis,'blur',()=>cancelPointer('blur'));listen(globalThis,'resize',()=>resize());
  const unsubscribe=ui.subscribe?.(()=>{dirty=true;});if(unsubscribe)removers.push(unsubscribe);const unsubOwner=inputOwner?.subscribe?.(()=>{if(pointer&&inputOwner.valid?.(pointer.owner||pointer.id)===false)cancelPointer('owner-change');for(const [id,p]of previewPointers)if(!inputOwner.valid?.(p.owner))cancelPreviewPointer(id,'owner-change');});if(unsubOwner)removers.push(unsubOwner);
  function resize(width,height,pixelRatio){if(disposed)return;if(typeof width==='object'){const opt=width;width=opt.width;height=opt.height;pixelRatio=opt.dpr;safeArea=opt.safeArea||safeArea;}vp=computeNativeViewport(width||globalThis.innerWidth||canvas.width,height||globalThis.innerHeight||canvas.height,safeArea);dpr=clamp(num(pixelRatio,globalThis.devicePixelRatio||1),1,3);const pw=Math.round(vp.width*dpr),ph=Math.round(vp.height*dpr);if(canvas.width!==pw)canvas.width=pw;if(canvas.height!==ph)canvas.height=ph;canvas.style.width=`${vp.width}px`;canvas.style.height=`${vp.height}px`;cancelPointer('resize');dirty=true;return vp;}
  function tick(){if(disposed)return;if(menuScene&&['menu','lobbyScreen','pause','loadoutPanel','settingsPanel','adminPanel'].includes(activeScreen?.id)){const now=performance.now();if(now-lastMenuFrame<32)return;lastMenuFrame=now;}const notice=activeScreen?getNotice():null,noticeKey=notice?.text?`${notice.text}|${notice.until||''}`:'';if(noticeKey!==lastNoticeKey)dirty=true;if(menuScene&&['menu','lobbyScreen','pause','loadoutPanel','settingsPanel','adminPanel'].includes(activeScreen?.id)||dirty||lastRevision!==ui.revision||activeScreen?.id==='connectionOverlay'||qa('canvas[data-loadout-preview]').some(n=>shown(n)&&n._rect?.width))return render();}
  function ensureVisible(n){for(const s of scrolls){if(!s.node.contains?.(n))continue;const r=n._rect;if(!r?.height)continue;if(r.top<s.rect.top)s.node.scrollTop=Math.max(0,num(s.node.scrollTop)-(s.rect.top-r.top)-8);else if(r.bottom>s.rect.bottom)s.node.scrollTop=Math.min(s.max,num(s.node.scrollTop)+r.bottom-s.rect.bottom+8);dirty=true;}}
  resize();
  return {render,tick,resize,hitTest,ensureVisible,cancel:cancelPointer,get viewport(){return vp;},get hits(){return hits;},get scrollRegions(){return scrolls;},get visibleScreens(){return lastScreen?lastScreen.split('|'):[];},invalidate(){dirty=true;},destroy(){disposed=true;cancelPointer('destroy');removers.forEach(fn=>fn());ctx.clearRect(0,0,canvas.width,canvas.height);}};
}
