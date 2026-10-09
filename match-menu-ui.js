/* Match menus own only canvas presentation and navigation. Gameplay state, timers,
 * network messages and relationship colors are supplied by the client. */
import { THEME, drawPanel, drawButton, drawLabel } from './native-ui.js?v=2.22.0';

const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,finite(value)));
const color=(key,fallback)=>typeof THEME?.[key]==='string'?THEME[key]:fallback;
export const MATCH_MENU_METRICS=Object.freeze({space:8,padding:16,row:48,control:44,bodyType:14,labelType:16});
const C={background:color('bg','#090d10'),panel:color('panel','#11181d'),raised:color('panelRaised','#1b252c'),line:color('border','#344149'),text:color('text','#f3f6f5'),muted:color('muted','#a6b3bc'),accent:color('accent','#d7ff58')};
export function matchMenuContains(r,x,y){return !!r&&x>=r.x&&y>=r.y&&x<=r.x+r.w&&y<=r.y+r.h;}
const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.w,b.x+b.w),bottom=Math.min(a.y+a.h,b.y+b.h);return right>x&&bottom>y?{x,y,w:right-x,h:bottom-y}:null;};
export function matchMenuViewport({w=960,h=640,safe={}}={}){w=Math.max(1,finite(w,960));h=Math.max(1,finite(h,640));const left=clamp(safe.left,0,w),top=clamp(safe.top,0,h),right=clamp(safe.right,0,w-left),bottom=clamp(safe.bottom,0,h-top),margin=Math.min(16,Math.max(4,Math.min(w-left-right,h-top-bottom)/24));return{x:left+margin,y:top+margin,w:Math.max(1,w-left-right-margin*2),h:Math.max(1,h-top-bottom-margin*2),screen:{x:0,y:0,w,h}};}
function centered(view,w,h){w=Math.min(view.w,w);h=Math.min(view.h,h);return{x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h};}
function rr(c,r,fill,stroke,radius=THEME.radius){drawPanel(c,r,{fill,stroke,radius:Math.min(radius,THEME.radius)});}
function clipText(c,text,width){text=String(text??'');if(width<=0)return'';if(c.measureText(text).width<=width)return text;let low=0,high=text.length;while(low<high){const mid=Math.ceil((low+high)/2);if(c.measureText(text.slice(0,mid)+'…').width<=width)low=mid;else high=mid-1;}return low?text.slice(0,low)+'…':'';}
function label(c,text,x,y,{size=14,weight=600,fill=C.text,align='left',width=Infinity}={}){c.save();c.font=`${weight} ${size}px ${THEME.font}`;const available=Number.isFinite(width)?Math.max(0,width):Math.max(1,c.measureText(String(text??'')).width+1),value=clipText(c,text,available),left=align==='center'?x-available/2:align==='right'?x-available:x;drawLabel(c,value,{x:left,y:y-size,w:available,h:size*2},{color:fill,fontSize:size,weight,align});c.restore();}
function button(c,r,text,{active=false,primary=false,disabled=false}={}){drawButton(c,r,{text,focused:active,primary:primary&&!disabled,disabled,fontSize:14});}
function backdrop(c,view,opacity=.78){c.fillStyle=`rgba(3,6,8,${opacity})`;c.fillRect(0,0,view.screen.w,view.screen.h);}
function scrollbar(c,layout){if(!layout.maxScroll||!layout.body)return;const b=layout.body,track={x:b.x+b.w-3,y:b.y,w:3,h:b.h},thumbH=Math.max(24,b.h*b.h/layout.contentH),thumb={x:track.x,y:b.y+(b.h-thumbH)*layout.scroll/layout.maxScroll,w:3,h:thumbH};rr(c,track,C.line,null,2);rr(c,thumb,C.accent,null,2);}
function decorateScroll(layout){const {body}=layout;layout.maxScroll=Math.max(0,layout.contentH-body.h);layout.scroll=clamp(layout.scroll,0,layout.maxScroll);return layout;}
function hit(id,r,action,extra={}){return{id,...r,action,...extra};}

/** Whole rows in two columns. Paging exists only when a roster exceeds capacity. */
export function layoutMatchScoreboard(options={}){
  const view=matchMenuViewport(options),rows=Array.isArray(options.rows)?options.rows:[],results=options.kind==='results';
  const teamBased=options.teamBased??rows.some(p=>p.teamLabel),pad=14,gap=16,headerH=78,footerH=54,rowH=26,visibleRows=teamBased?Math.max(rows.filter(p=>p.team==='blue').length,rows.filter(p=>p.team==='red').length):Math.ceil(rows.length/2),panel=centered(view,1000,Math.min(view.h,500,headerH+footerH+Math.max(4,visibleRows)*rowH));
  const body={x:panel.x+pad,y:panel.y+headerH,w:panel.w-pad*2,h:Math.max(rowH,panel.h-headerH-footerH)},capacity=Math.max(1,Math.floor(body.h/rowH)),cw=(body.w-gap)/2;
  const groups=teamBased?[{name:options.infection?'SURVIVORS':'ALPHA',team:'blue',players:rows.filter(p=>p.team==='blue')},{name:options.infection?'INFECTED':'BRAVO',team:'red',players:rows.filter(p=>p.team==='red')}]:[{name:'STANDINGS',players:rows},{name:'',players:rows}];
  const pageCount=Math.max(1,teamBased?Math.ceil(Math.max(...groups.map(g=>g.players.length))/capacity):Math.ceil(rows.length/(capacity*2))),page=clamp(Math.floor(options.page||0),0,pageCount-1);
  const layout={kind:results?'results':'scoreboard',view,panel,body,rows:[],groups,capacity,rowH,page,pageCount,scroll:0,maxScroll:0,contentH:body.h,hits:[],focusTargets:[]};
  groups.forEach((group,col)=>{
    group.x=body.x+col*(cw+gap);group.w=cw;group.columns={name:group.x+9,kills:group.x+cw-84,deaths:group.x+cw-51,ratio:group.x+cw-7};
    const start=teamBased?page*capacity:page*capacity*2+col*capacity;
    group.players.slice(start,start+capacity).forEach((player,index)=>{const r={id:'player:'+player.id,x:group.x,y:body.y+index*rowH,w:cw,h:rowH,player,index,columns:group.columns};layout.rows.push(r);});
  });
  if(!results){layout.close={x:panel.x+panel.w-88,y:panel.y+8,w:74,h:44};layout.hits.push(hit('close',layout.close,'back'));}
  if(pageCount>1){for(const [id,direction,x]of [['previous',-1,panel.x+panel.w-111],['next',1,panel.x+panel.w-57]])layout.hits.push(hit(id,{x,y:panel.y+panel.h-49,w:44,h:44},'page',{direction,disabled:direction<0?page===0:page===pageCount-1}));}
  layout.focusTargets=[...layout.hits];return layout;
}
export function drawMatchScoreboard(c,options={}){
  const l=layoutMatchScoreboard(options),p=l.panel,focusId=options.focusId||'';c.save();backdrop(c,l.view,.86);rr(c,p,'#131d18','#354234',0);
  label(c,options.title||(l.kind==='results'?'FINAL STANDINGS':'SCOREBOARD'),p.x+14,p.y+25,{size:22,weight:800,fill:options.accent||'#edf0e8',width:p.w-122});
  if(l.close)button(c,l.close,options.controller?'B  BACK':'BACK',{active:focusId==='close'});
  for(const group of l.groups){
    const col=group.columns,score=group.team?(options.infection?group.players.length:options.teamScores?.[group.team]):undefined;
    label(c,group.name+(score==null?'':'   '+score),group.x+2,p.y+57,{size:17,weight:800,fill:'#d8eda0',width:group.w-116});
    for(const [text,x]of (options.infection?[['CONV',col.kills],['AST',col.deaths],['DMG',col.ratio]]:[['K',col.kills],['D',col.deaths],['K/D',col.ratio]]))label(c,text,x,p.y+57,{size:11,fill:C.muted,align:'right'});
    c.fillStyle='#354234';c.fillRect(group.x,p.y+67,group.w,1);
  }
  for(const row of l.rows){
    const player=row.player,col=row.columns,self=String(player.id)===String(options.selfId),tone=player.color||(self?'#d7ff58':C.muted);
    rr(c,{x:row.x,y:row.y,w:row.w,h:row.h-2},self?'#293523':row.index%2?'#1e2822':'#18221c',null,0);c.fillStyle=tone;c.fillRect(row.x,row.y+5,2,row.h-12);
    const prefix=self?'YOU  ':'';
    label(c,prefix+(player.bot?String(player.name||'Bot').replace(/^(ALPHA|BRAVO) /,''):String(player.name||'Player')),col.name,row.y+13,{size:12,weight:self?700:500,fill:tone,width:col.kills-col.name-15});
    const kills=Math.max(0,finite(player.kills)),deaths=Math.max(0,finite(player.deaths)),ratio=(kills/Math.max(1,deaths)).toFixed(2);
    for(const [value,x]of (options.infection?[[player.infectionStats?.conversions||0,col.kills],[player.infectionStats?.assists||0,col.deaths],[Math.round(player.infectionStats?.damage||0),col.ratio]]:[[kills,col.kills],[deaths,col.deaths],[ratio,col.ratio]]))label(c,String(value),x,row.y+13,{size:12,align:'right',fill:'#edf0e8'});
  }
  const footerY=p.y+p.h-18;
  if(options.footer)label(c,options.footer,p.x+14,footerY,{size:11,fill:C.muted,width:p.w-(l.pageCount>1?140:28)});
  else {let x=p.x+14;for(const [name,tone]of [['YOU','#d7ff58'],['ALLY','#62ef86'],['ALLY BOT','#54a9ff'],['ENEMY','#ff3b45']]){label(c,name,x,footerY,{size:10,fill:tone});x+=name==='ALLY BOT'?76:55;}}
  if(l.pageCount>1){label(c,(l.page+1)+' / '+l.pageCount,p.x+p.w-145,footerY,{size:11,fill:C.muted,align:'right'});for(const id of ['previous','next']){const target=l.hits.find(h=>h.id===id);button(c,target,id==='previous'?'‹':'›',{disabled:target.disabled,active:focusId===id});}}
  c.restore();return l;
}

export function layoutMatchShop(options={}){
  const view=matchMenuViewport(options),items=options.items||[],cols=Math.min(Math.max(1,items.length),view.w<500?2:3),gap=8,headerH=options.tabs?.length?138:94,footerH=32,rows=Math.max(1,Math.ceil(items.length/cols)),rowH=Math.max(44,Math.min(112,(view.h-headerH-footerH-gap*(rows-1))/rows)),panel=centered(view,900,headerH+footerH+rows*rowH+(rows-1)*gap),body={x:panel.x+14,y:panel.y+headerH,w:panel.w-28,h:panel.h-headerH-footerH},itemW=(body.w-gap*(cols-1))/cols;
  const l={kind:'shop',view,panel,body,cols,rowH,scroll:0,maxScroll:0,items:[],hits:[],focusTargets:[]};
  items.forEach((item,index)=>{const r={x:body.x+(index%cols)*(itemW+gap),y:body.y+Math.floor(index/cols)*(rowH+gap),w:itemW,h:rowH},target=hit(`shop:${item.id}`,r,'buy',{index,item});l.items.push({...target,visible:r});l.hits.push(target);l.focusTargets.push(target);});
  l.tabs=(options.tabs||[]).map((tab,i)=>hit('shop-tab:'+tab.id,{x:panel.x+14+i*((panel.w-28)/options.tabs.length),y:panel.y+88,w:(panel.w-28)/options.tabs.length-4,h:44},'shopTab',{tab:tab.id,label:tab.label}));l.hits.push(...l.tabs);l.focusTargets.push(...l.tabs);
  l.close={x:panel.x+panel.w-100,y:panel.y+12,w:86,h:44};const close=hit('close',l.close,'back');l.hits.push(close);l.focusTargets.push(close);return l;
}
export function drawMatchShop(c,options={}){
 const l=layoutMatchShop(options),p=l.panel;c.save();backdrop(c,l.view,.65);rr(c,p,C.panel,C.line);label(c,options.title||'SURVIVOR SUPPLY',p.x+14,p.y+29,{size:20,weight:800,fill:C.accent,width:p.w-125});
 button(c,l.close,options.closeLabel||'MENU',{active:options.focusId==='close'});
 label(c,options.balanceLabel||`${Math.max(0,finite(options.cash))} ${options.currency||'CREDITS'}`,p.x+14,p.y+62,{size:11,fill:C.muted,width:p.w-28});
 label(c,options.phaseLabel||'PREPARATION',p.x+14,p.y+79,{size:11,fill:C.muted,width:p.w-28});
 for(const tab of l.tabs||[])button(c,tab,tab.label,{active:options.activeTab===tab.tab||options.focusId===tab.id});
 for(const r of l.items){const item=r.item,active=options.focusId?options.focusId===r.id:options.selectedIndex===r.index;rr(c,r,active?'#293820':C.raised,active?C.accent:C.line,2);if(active){c.fillStyle=C.accent;c.fillRect(r.x,r.y,3,r.h);}
  const art=options.art?.(item);if(art&&r.h>=80)c.drawImage(art,r.x+r.w*.28,r.y+4,r.w*.7,Math.max(20,r.h-48));
  if(r.h>=80)label(c,String(r.index+1).padStart(2,'0'),r.x+10,r.y+20,{size:11,fill:C.muted});
  label(c,item.label||item.id,r.x+10,r.y+r.h-29,{size:13,weight:800,width:r.w-20});
  label(c,item.status||`$${item.price}`,r.x+10,r.y+r.h-10,{size:12,fill:item.unavailable?C.muted:C.accent,width:r.w-20});
 }
 const selected=l.items.find(t=>t.id===options.focusId)||l.items[options.selectedIndex||0];
 label(c,options.feedback||selected?.item.detail||'Choose directly · close to move · reservations charged only if human',p.x+14,p.y+p.h-13,{size:12,fill:C.muted,width:p.w-28});c.restore();return l;
}

export function layoutMatchDeath(options={}){const view=matchMenuViewport(options),panel=centered(view,512,options.allowLoadout===false?240:296),loadout=options.allowLoadout===false?null:{x:panel.x+16,y:panel.y+panel.h-60,w:panel.w-32,h:44};return{kind:'death',view,panel,loadout,hits:loadout?[hit('loadout',loadout,'loadout')]:[],focusTargets:loadout?[hit('loadout',loadout,'loadout')]:[]};}
export function drawMatchDeath(c,options={}){const l=layoutMatchDeath(options),p=l.panel,accent=options.accent||'#ff6973';c.save();if(options.backdrop!==false)backdrop(c,l.view,.64);rr(c,p,C.panel,C.line);label(c,'ELIMINATED',p.x+16,p.y+36,{size:28,weight:800,fill:accent,width:p.w-32});label(c,options.attacker||'Preparing your next spawn',p.x+16,p.y+76,{size:16,weight:700,width:p.w-32});label(c,options.detail||'',p.x+16,p.y+105,{size:14,fill:C.muted,width:p.w-32});label(c,options.nextLoadout?`NEXT SPAWN · ${options.nextLoadout}`:'',p.x+16,p.y+137,{size:14,fill:C.accent,width:p.w-32});const bar={x:p.x+16,y:p.y+164,w:p.w-32,h:4};rr(c,bar,C.line,null,2);if(options.progress>0)rr(c,{...bar,w:bar.w*clamp(options.progress,0,1)},accent,null,2);label(c,options.status||'RESPAWNING',p.x+16,p.y+193,{size:16,weight:700,width:p.w-32});if(l.loadout)button(c,l.loadout,options.loadoutLabel?(options.controller?'A  '+options.loadoutLabel:options.loadoutLabel):(options.controller?'A / Y  CHANGE LOADOUT':'CHANGE LOADOUT'),{active:options.focusId==='loadout'});c.restore();return l;}

export function layoutMatchTarget(options={}){
  const view=matchMenuViewport(options),wide=view.w>=480&&view.w/view.h>1.45,gap=16,sidebar=wide?Math.min(240,Math.max(192,view.w*.32)):0,headerH=wide?0:76,footerH=wide?0:124,size=Math.max(1,Math.min(wide?view.w-sidebar-gap:view.w,view.h-headerH-footerH,640)),panel=wide?centered(view,size+sidebar+gap,Math.max(size,264)):centered(view,Math.min(view.w,Math.max(320,size+32)),headerH+size+footerH),map=wide?{x:panel.x,y:panel.y+(panel.h-size)/2,w:size,h:size}:{x:panel.x+(panel.w-size)/2,y:panel.y+headerH,w:size,h:size},rail=wide?{x:map.x+map.w+gap,y:panel.y,w:sidebar,h:panel.h}:{x:panel.x,y:map.y+map.h,w:panel.w,h:footerH};
  const confirm=wide?{x:rail.x+16,y:rail.y+rail.h-60,w:rail.w-32,h:44}:{x:rail.x+rail.w/2+4,y:rail.y+rail.h-60,w:rail.w/2-20,h:44},cancel=wide?{x:rail.x+16,y:confirm.y-52,w:rail.w-32,h:44}:{x:rail.x+16,y:confirm.y,w:rail.w/2-20,h:44};return{kind:'target',view,panel,map,rail,wide,confirm,cancel,hits:[hit('target',map,'target'),hit('cancel',cancel,'back'),hit('confirm',confirm,'confirm')],focusTargets:[hit('cancel',cancel,'back'),hit('confirm',confirm,'confirm')]};
}
/** Draw chrome before the client paints the tactical map and gameplay-colored markers. */
export function drawMatchTarget(c,options={}){const l=layoutMatchTarget(options),p=l.panel,r=l.rail;c.save();backdrop(c,l.view,.9);rr(c,p,C.panel,C.line);const tx=l.wide?r.x+16:p.x+16,ty=p.y+28,tw=l.wide?r.w-32:p.w-32;label(c,options.title||'SELECT TARGET',tx,ty,{size:l.wide&&r.w<224?16:20,weight:800,fill:C.accent,width:tw});label(c,`${Math.max(0,finite(options.enemies))} ENEMIES IN ZONE`,tx,ty+28,{size:14,fill:options.enemies?'#ff8068':C.muted,width:tw});const legendY=l.wide?r.y+88:r.y+22;label(c,'◆ ENEMY',r.x+16,legendY,{fill:options.enemyColor||'#ff493f',size:14});label(c,!l.wide&&r.w<360?'▲ ALLY':'▲ FRIENDLY',r.x+16+(l.wide?0:(r.w-32)/3),legendY+(l.wide?24:0),{fill:options.friendColor||'#58b8ff',size:14});label(c,'▲ YOU',r.x+16+(l.wide?0:(r.w-32)*2/3),legendY+(l.wide?48:0),{size:14,width:l.wide?r.w-32:Math.max(0,(r.w-32)/3)});const hint=options.controller?(options.chosen?'TARGET LOCKED':'LEFT STICK TO AIM'):(options.chosen?'TARGET LOCKED':'TAP MAP TO AIM');label(c,hint,r.x+16,l.wide?Math.min(r.y+176,l.cancel.y-20):r.y+47,{size:14,fill:C.muted,width:r.w-32});button(c,l.cancel,options.controller?(options.chosen?'B  EDIT':'B  CANCEL'):'CANCEL',{active:options.focusId==='cancel'});button(c,l.confirm,options.controller?(options.chosen?'A  DEPLOY':'A  SELECT'):'DEPLOY',{primary:true,disabled:!options.chosen&&!options.controller,active:options.focusId==='confirm'});c.restore();return l;}

export function drawMatchNotice(c,options={}){const view=matchMenuViewport(options),lines=(options.lines||[]).filter(Boolean),p=centered(view,560,Math.min(320,104+lines.length*32));c.save();if(options.backdrop!==false)backdrop(c,view,.7);rr(c,p,C.panel,C.line);label(c,options.title||'MATCH',p.x+16,p.y+38,{size:options.large?36:24,weight:800,fill:options.accent||C.accent,width:p.w-32});lines.forEach((text,i)=>label(c,text,p.x+16,p.y+84+i*32,{size:16,fill:i===lines.length-1?C.muted:C.text,width:p.w-32}));c.restore();return{kind:'notice',view,panel:p,hits:[],focusTargets:[]};}
export function drawMatchReplay(c,options={}){const view=matchMenuViewport(options),p={x:view.x,y:view.y,w:view.w,h:108},skip=options.canSkip?{x:view.x+(view.w-Math.min(280,view.w))/2,y:view.y+view.h-60,w:Math.min(280,view.w),h:44}:null;c.save();rr(c,p,C.panel,C.line);label(c,options.title||'KILLCAM',p.x+16,p.y+26,{size:20,weight:800,fill:C.accent,width:p.w-32});label(c,options.players||'',p.x+16,p.y+55,{size:16,width:p.w-32});label(c,options.detail||'',p.x+16,p.y+84,{size:14,fill:C.muted,width:p.w-32});const bar={x:view.x,y:view.y+view.h-4,w:view.w,h:4};rr(c,bar,C.line);if(options.progress>0)rr(c,{...bar,w:bar.w*clamp(options.progress,0,1)},C.accent);if(skip)button(c,skip,options.controller?'A / B  SKIP REPLAY':'SKIP REPLAY');c.restore();return{kind:'replay',view,panel:p,skip,hits:skip?[hit('skip',skip,'skip')]:[],focusTargets:skip?[hit('skip',skip,'skip')]:[]};}

/** Normalized input ownership. All actions commit on release/accept and never mutate game state. */
export function createMatchMenuController(callbacks={}){
  let key='',layout=null,focusId='',press=null,epoch=0;
  const notifyFocus=()=>callbacks.onFocus?.(focusId,layout);
  const scrollTo=value=>{if(!layout?.body||!layout.maxScroll)return false;const next=clamp(value,0,layout.maxScroll);if(next===layout.scroll)return false;layout.scroll=next;callbacks.onScroll?.(next,layout);return true;};
  const ensureVisible=target=>{if(!target?.scrollItem||!layout?.body)return;const top=target.contentY,bottom=top+target.h;if(top<layout.scroll)scrollTo(top);else if(bottom>layout.scroll+layout.body.h)scrollTo(bottom-layout.body.h);};
  const focus=target=>{if(!target)return false;focusId=target.id;ensureVisible(target);notifyFocus();return true;};
  const targets=()=>layout?.focusTargets?.filter(t=>!t.disabled)||[];
  const pageTo=direction=>{if(!layout?.pageCount)return false;const next=clamp(layout.page+direction,0,layout.pageCount-1);if(next===layout.page)return false;layout.page=next;callbacks.onPage?.(next,layout);return true;};
  const activate=target=>{if(!target||target.disabled)return false;if(target.action==='page'&&layout.pageCount)return pageTo(target.direction);if(target.action==='page')return scrollTo(layout.scroll+target.direction*Math.max(layout.rowH||48,layout.body.h-(layout.rowH||48)));if(target.action==='back'){callbacks.onBack?.(layout);return true;}callbacks.onAction?.(target.action,target,layout);return true;};
  const move=direction=>{const all=targets();if(!all.length)return false;const current=all.find(t=>t.id===focusId);if(!current)return focus(all[0]);const dx=direction==='left'?-1:direction==='right'?1:0,dy=direction==='up'?-1:direction==='down'?1:0,cx=current.x+current.w/2,cy=current.y+current.h/2;let best=null,bestScore=Infinity;for(const t of all){if(t===current)continue;const x=t.x+t.w/2-cx,y=t.y+t.h/2-cy,along=x*dx+y*dy,cross=Math.abs(x*dy-y*dx);if(along<=1)continue;const score=along+cross*3;if(score<bestScore){bestScore=score;best=t;}}return focus(best);};
  const command=value=>{if(!layout)return false;if(value==='back'){callbacks.onBack?.(layout);return true;}if(value==='accept'){const all=targets();return activate(all.find(t=>t.id===focusId)||all[0]);}if(value==='previousTab'||value==='nextTab'){const direction=value==='previousTab'?-1:1;if(layout.pageCount)return pageTo(direction);if(callbacks.onTab){callbacks.onTab(direction,layout);return true;}return scrollTo(layout.scroll+direction*(layout.body?.h||48));}if(value==='home')return focus(targets().find(t=>t.scrollItem)||targets()[0]);if(value==='end'){const list=targets().filter(t=>t.scrollItem);return focus(list[list.length-1]);}if(['up','down','left','right'].includes(value))return move(value);return false;};
  return{
    setLayout(nextKey,next){if(nextKey!==key){key=nextKey;epoch++;press=null;focusId='';}layout=next;if(layout&&!layout.focusTargets?.some(t=>t.id===focusId&&!t.disabled)){focusId=targets()[0]?.id||'';notifyFocus();}return layout;},
    getLayout:()=>layout,getHits:()=>layout?.hits||[],getFocus:()=>focusId,
    clear(){key='';layout=null;focusId='';press=null;epoch++;},
    focus(id){return focus(targets().find(t=>t.id===id));},command,
    key(code){const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',Enter:'accept',Space:'accept',Escape:'back',PageUp:'previousTab',PageDown:'nextTab',Home:'home',End:'end'};return command(map[code]||code);},
    gamepad(input={}){let handled=false;for(const [button,value] of [['B','back'],['A','accept'],['LB','previousTab'],['RB','nextTab'],['UP','up'],['DOWN','down'],['LEFT','left'],['RIGHT','right']])if(input[button]){handled=command(value)||handled;break;}if(Math.abs(finite(input.scrollY))>.12)handled=scrollTo((layout?.scroll||0)+input.scrollY*620*clamp(input.dt,.001,.1))||handled;return handled;},
    pointerDown({id=0,x,y,button=0}={}){if(!layout||press||button!==0)return false;const target=[...(layout.hits||[])].reverse().find(t=>matchMenuContains(t,x,y)),inside=matchMenuContains(layout.panel,x,y);if(!target&&!inside)return false;press={id,x,y,epoch,targetId:target?.id||'',scroll:layout.scroll||0,drag:false,scrollable:!!layout.maxScroll&&matchMenuContains(layout.body,x,y)};if(target&&!target.disabled)focus(target);return true;},
    pointerMove({id=0,x,y}={}){if(!press||id!==press.id)return false;if(press.scrollable&&Math.hypot(x-press.x,y-press.y)>8)press.drag=true;if(press.drag)scrollTo(press.scroll+press.y-y);return true;},
    pointerUp({id=0,x,y}={}){if(!press||id!==press.id)return false;const saved=press;press=null;if(saved.epoch!==epoch||saved.drag)return true;const target=layout?.hits?.find(t=>t.id===saved.targetId);if(target&&matchMenuContains(target,x,y))activate(target);return true;},
    pointerCancel(id){if(press&&(id==null||press.id===id)){press=null;return true;}return false;},
    wheel({x,y,deltaY}={}){if(!layout||!matchMenuContains(layout.panel,x,y))return false;scrollTo((layout.scroll||0)+finite(deltaY));return true;}
  };
}
