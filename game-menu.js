/* Canvas-native production menu. Only presentation state lives here.
 * Authoritative players, classes, settings and host rights come from the adapter.
 * 844 × 390 is the design frame, with one uniform scale and no scroll containers.
 */
import {APP_VERSION,WEAPON_SPECS,PRIMARY_WEAPONS,SECONDARY_WEAPONS,WEAPON_ORDER,ATTACHMENTS,attachmentOptionsForWeapon,resolveWeaponSpec,EQUIPMENT_SPECS,TACTICAL_EQUIPMENT,LETHAL_EQUIPMENT,KILLSTREAK_ORDER,KILLSTREAK_SPECS,GAME_MODES,gameModeSpec} from './game-config.js?v=2.20.0';
import {relationshipFor,relationshipColor} from './team-model.js?v=2.20.0';
const T={bg:'#101713',panel:'#1d2721',line:'#354234',accent:'#d8eda0',text:'#edf0e8',muted:'#a2aea0',blue:'#98c9db',red:'#eb927e'};
const cap=s=>String(s||'').replace(/^./,x=>x.toUpperCase()),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const r=(x,y,w,h)=>({x,y,left:x,top:y,width:w,height:h,right:x+w,bottom:y+h});
const SETTINGS={Controls:[['Look sensitivity','lookSensitivity',.5,2,.05],['ADS sensitivity','adsSensitivity',.35,1.25,.05],['Touch sensitivity','touchSensitivity',.5,2,.05],['Vertical sensitivity','controllerVerticalSensitivity',.5,1.5,.05],['Aim response curve','controllerResponseCurve',['dynamic','linear','standard']],['Aim assist','controllerAimAssist',['off','on']],['Left stick deadzone','controllerMoveDeadzone',.02,.25,.01],['Right stick deadzone','controllerLookDeadzone',.02,.25,.01]],Audio:[['Mute all audio','mute',[false,true]],['Master volume','masterVolume',0,1,.01],['Sound effects','sfxVolume',0,1,.01],['Music','musicVolume',0,1,.01]]};
export function createGameMenu({ui,adapter,preview}) {
  const state={page:'players',edit:'overview',slot:'optic',catalog:false,attachment:null,settings:'Controls',cheats:'Gameplay',weapon:'assault',home:'home',homePage:0,maps:'official',rosterPages:{},matchPages:{},streakSlot:0,peek:null,railOffsets:{},mapPage:0,playerPage:0,pending:null};
  const roots=new Map(),controls=new Map(),images=new Map();
  let ctx,mark,hit,screen,S,scale=1,ox=0,oy=0,currentScreen='',menuH=390,localClip=null,railInfo=null,revision=0;
  function node(id,label,action,disabled=false){const key=screen.id+':'+id;let n=controls.get(key);if(!n){n=ui.createElement('button');n.id='integrated-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');n.dataset.controllerKey=key;n.dataset.integratedControl=id;n.addEventListener('click',()=>{if(!n.disabled){n._action?.();state.peek=null;}revision++;});
      const enter=()=>{if(n._peek&&!n.disabled&&S.inputMode!=='touch'){state.peek={...n._peek,node:n};revision++;}};
      const leave=()=>{if(state.peek?.node===n){state.peek=null;revision++;}};
      n.addEventListener('focus',enter);n.addEventListener('pointerenter',enter);n.addEventListener('blur',leave);n.addEventListener('pointerleave',leave);roots.get(screen.id).append(n);controls.set(key,n);}n._action=action;n._peek=null;if(n.textContent!==label)n.textContent=label;if(n.disabled!==disabled)n.disabled=disabled;n.hidden=false;n.setAttribute('aria-label',label||id.replace(/-/g,' '));return n;}
  function physical(b){return r(ox+b.x*scale,oy+b.y*scale,b.width*scale,b.height*scale);}
  function box(x,y,w,h,fill=T.panel,border=''){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);if(border){ctx.strokeStyle=border;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);}}
  function line(x,y,xx,yy,color=T.line,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}
  function text(value,x,y,size=12,color=T.text,w=800,font='sans',weight=600){ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='top';ctx.font=`${weight} ${size}px ${font==='display'?'"Breach Display", "Arial Narrow"':'Inter, Arial'}, sans-serif`;let str=String(value??'');while(str.length&&ctx.measureText(str).width>w)str=str.slice(0,-1);if(str!==String(value??''))str=str.slice(0,-1)+'…';ctx.fillText(str,x,y);}
  function wrap(value,x,y,w,size=12,color=T.muted,lines=3){const words=String(value||'').split(' ');let row='',n=0;ctx.font=`400 ${size}px Arial`;for(const word of words){if(ctx.measureText(row+' '+word).width>w&&row){text(row,x,y+n*(size+4),size,color,w,'sans',400);row=word;if(++n>=lines)return;}else row+=(row?' ':'')+word;}text(row,x,y+n*(size+4),size,color,w,'sans',400);}
  function button(id,label,x,y,w,h,action,{active=false,primary=false,disabled=false,quiet=false,size=12,left=false,tab=false}={}){const n=node(id,label,action,disabled),b=r(x,y,w,h);const clipped=localClip?r(Math.max(x,localClip.x),Math.max(y,localClip.y),Math.max(0,Math.min(x+w,localClip.right)-Math.max(x,localClip.x)),Math.max(0,Math.min(y+h,localClip.bottom)-Math.max(y,localClip.y))):b;mark(n,physical(clipped));if(clipped.width>2&&clipped.height>2)hit(n,physical(clipped));else n.hidden=true;ctx.save();if(disabled)ctx.globalAlpha=.35;if(!quiet||active)box(x,y,w,h,primary?T.accent:active?'#273123':T.panel,active&&!tab?T.accent:'');const c=primary?T.bg:active?T.accent:T.text;ctx.font=`600 ${size}px Arial`;const tx=left?x+10:x+Math.max(6,(w-ctx.measureText(label).width)/2);if(size>0)text(label,tx,y+(h-size)/2,size,c,w-(tx-x)-5);if(ui.activeElement===n&&S.inputMode!=='touch'){ctx.strokeStyle=T.text;ctx.lineWidth=1;ctx.strokeRect(x+3,y+3,w-6,h-6);}ctx.restore();return n;}
  // Navigation inspects; activation commits. The same cards serve every input.
  function choice(id,label,x,y,w,h,action,kind,context,value,opts={}){const n=button(id,label,x,y,w,h,action,opts);n._peek={kind,context,value};return n;}
  function inspect(kind,context,fallback){return state.peek?.kind===kind&&state.peek.context===context?state.peek.value:fallback;}
  function editSection(id){state.edit=id;state.catalog=false;state.attachment=null;state.peek=null;preview.reset(id==='primary'||id==='secondary'?'weapon':'equipment');}
  function rosterRows(rows,team,x,y,w,pages,{capacity=9,pitch=25,pagerY=299}={}){
    const size=rows.length>capacity?Math.min(capacity,Math.floor((pagerY-y-4)/pitch)):capacity,total=Math.max(1,Math.ceil(rows.length/size));
    pages[team]=clamp(pages[team]||0,0,total-1);const page=pages[team];
    rows.slice(page*size,(page+1)*size).forEach((p,i)=>colorRow(p,x,y+i*pitch,w,pitch));
    if(total>1){link('roster-prev-'+team,'‹',x,pagerY,44,33,()=>pages[team]=Math.max(0,page-1),{disabled:page===0,size:22});text((page+1)+' / '+total,x+53,pagerY+11,10,T.muted,65);link('roster-next-'+team,'›',x+w-44,pagerY,44,33,()=>pages[team]=Math.min(total-1,page+1),{disabled:page===total-1,size:22});}
  }
  function link(id,label,x,y,w,h,action,opts={}){return button(id,label,x,y,w,h,action,{quiet:true,...opts});}
  function click(id){adapter.click(id);}
  function img(key,x,y,w,h,cover=true,alpha=1){let im=images.get(key);if(!im){im=new Image();im.src=new URL('./menu-assets/'+key+'?v='+APP_VERSION,import.meta.url).href;images.set(key,im);}if(!im.complete||!im.naturalWidth)return;const z=cover?Math.max(w/im.width,h/im.height):Math.min(w/im.width,h/im.height);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.globalAlpha=alpha;ctx.drawImage(im,x+(w-im.width*z)/2,y+(h-im.height*z)/2,im.width*z,im.height*z);ctx.restore();}
  function thumb(kind,id,atts,x,y,w,h,slot=''){const canvas=preview.thumb(kind,id,atts,slot);if(canvas)ctx.drawImage(canvas,x,y,w,h);else if(kind==='weapon')img('weapon-'+id+'.png',x,y,w,h,false);}
  function go(page){goDirect(page);}
  function goDirect(page){state.pending=null;state.page=page;editSection('overview');adapter.page(page);if(page==='cheats')adapter.hostBegin();}
  function back(){
    if(state.pending){state.pending=null;return;}
    if(screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout'){
      if(state.catalog){state.catalog=false;state.peek=null;return;}
      if(!['overview','classes'].includes(state.edit)){editSection('overview');return;}
      if(screen.id==='loadoutPanel'&&S.inMatch&&state.edit==='overview'){editSection('classes');return;}
      if(screen.id==='lobbyScreen'){goDirect('players');return;}
    }
    if(screen.id==='settingsPanel')adapter.closeSettings();else if(screen.id==='adminPanel')adapter.closeAdmin();else if(screen.id==='loadoutPanel')adapter.closeLoadout();else if(screen.id==='pause')click('resumeBtn');else click('nativeLobbyBackBtn');
  }
  function chrome(title=''){box(0,0,844,48,'rgba(13,21,16,.96)');line(0,47,844,47);if(screen.id!=='menu')link('back','‹',8,2,42,44,back,{size:26});text('BREACH',screen.id==='menu'?24:56,6,24,T.text,130,'display');text(title|| (screen.id==='menu'?'MULTIPLAYER':S.host?'LOBBY · HOST':'LOBBY · PLAYER'),screen.id==='menu'?24:56,31,8,T.muted,136);if(screen.id==='lobbyScreen'){const tabs=[['players','PLAYERS',84],['match','MATCH',74],['map','MAPS',65],['loadout','LOADOUT',92],...(S.host?[['cheats','CHEATS',78]]:[])];let x=157;for(const [id,label,w]of tabs){const on=state.page===id;link('tab-'+id,label,x,0,w,47,()=>go(id),{active:on,tab:true,disabled:id==='loadout'&&S.mode==='infection'});if(on)line(x,46,x+w,46,T.accent,2);x+=w;}link('invite',S.room+'  INVITE ↗',650,0,137,47,()=>click('lobbyInviteBtn'));}else if(screen.id==='menu')link('profile',S.name+'  ✎',638,0,148,47,()=>click('nameInput'));if(screen.id!=='settingsPanel')link('settings','⚙',790,0,45,47,()=>adapter.openSettings(),{size:22});}
  function footer(){box(0,menuH-56,844,56,'rgba(13,21,16,.96)');line(0,menuH-56,844,menuH-56);}
  function deployFooter(){footer();if(S.spawnProblem)wrap(S.spawnProblem,25,344,312,10,'#ffad98',3);else{text(S.name,25,346,12,T.text,180);text(S.host?'LOBBY HOST':'CONNECTED',25,365,8,T.muted,180);}if(S.host){link('difficulty','BOT DIFFICULTY   '+cap(S.rules.difficulty)+' ›',358,339,221,45,()=>adapter.rule('difficulty',['easy','normal','hard','elite'][(['easy','normal','hard','elite'].indexOf(S.rules.difficulty)+1)%4]));button('start','START MATCH     →',588,340,240,44,()=>click('lobbyStartBtn'),{primary:true,disabled:!S.canStart,size:14});}else text('WAITING FOR HOST TO START',588,355,12,T.accent,240);}
  function home(){chrome();img('world-highlands.jpg',0,48,844,286,true,.58);const fade=ctx.createLinearGradient(0,0,720,0);fade.addColorStop(0,'rgba(12,21,15,.94)');fade.addColorStop(1,'rgba(12,21,15,.04)');box(0,48,844,286,fade);if(state.home==='home'){text('READY TO',28,88,48,T.text,550,'display');text('BREACH.',28,137,65,T.accent,550,'display');text('BUILD YOUR LOADOUT. ASSEMBLE YOUR TEAM.',31,221,10,T.muted);button('create','CREATE MATCH  →',530,69,288,58,()=>click('createBtn'),{primary:true,size:16});button('join','JOIN WITH CODE',530,139,288,50,()=>{state.home='join';});button('browse','LIVE MATCHES',530,201,288,50,()=>{state.home='live';click('refreshBtn');});button('builder','MAP BUILDER ↗',530,263,288,50,()=>click('nativeBuilderTab'));}else{link('home-back','‹  MAIN MENU',24,58,135,42,()=>state.home='home');text(state.home==='join'?'JOIN YOUR TEAM':'LIVE MATCHES',30,114,35,T.text,470,'display');if(state.home==='join'){button('code',S.code||'ENTER ROOM CODE',30,173,344,55,()=>click('codeInput'),{size:20});button('connect','CONNECT  →',30,243,344,50,()=>click('joinBtn'),{primary:true});}else{link('refresh','REFRESH ↻',664,59,151,40,()=>click('refreshBtn'));const rooms=adapter.liveRooms();if(!rooms.length)text(S.status||'No open matches. Create a match to get started.',32,180,14,T.muted,720);const pages=Math.max(1,Math.ceil(rooms.length/4));state.homePage=Math.min(state.homePage,pages-1);if(pages>1){link('rooms-prev','‹',506,102,44,39,()=>state.homePage=Math.max(0,state.homePage-1),{disabled:state.homePage===0});text((state.homePage+1)+' / '+pages,565,116,12,T.muted);link('rooms-next','›',630,102,44,39,()=>state.homePage=Math.min(pages-1,state.homePage+1),{disabled:state.homePage>=pages-1});}rooms.slice(state.homePage*4,state.homePage*4+4).forEach((room,i)=>button('room-'+i,room.label,30,160+i*40,784,36,room.action,{left:true}));}}footer();button('armory','LOADOUT  →',24,343,268,39,()=>adapter.openLoadout());text(S.status||'ONLINE MULTIPLAYER',320,355,10,T.muted,340);text('Version '+APP_VERSION,700,352,14,T.text,124);}
  function players(){
    const spec=gameModeSpec(S.mode),infection=S.mode==='infection',teamBased=spec.teamBased&&!spec.cooperative&&!infection;
    const groups=teamBased?[['blue','ALPHA'],['red','BRAVO']]:[['ffa',spec.cooperative?'OPERATORS':infection?'PARTICIPANTS':'PLAYERS']];
    groups.forEach(([team,label],column)=>{
      const x=16+column*284,w=teamBased?272:556,rows=S.roster.filter(p=>team==='ffa'||p.team===team),count=team==='ffa'?S.rules.ffaBots:S.rules[team==='blue'?'blueBots':'redBots'];
      text(label,x,65,teamBased?21:24,T.text,w-140,'display');
      if(teamBased)link('team-'+team,S.team===team?'JOINED':'JOIN →',x+79,55,62,44,()=>adapter.team(team),{disabled:S.team===team,size:8});
      if(S.host&&!spec.cooperative){link('bots-minus-'+team,'−',x+w-128,55,40,44,()=>adapter.bots(team,-1),{size:23,disabled:count<=0});text(count+' BOTS',x+w-85,72,10,T.muted,47);link('bots-plus-'+team,'+',x+w-39,55,39,44,()=>adapter.bots(team,1),{size:25,disabled:count>=(team==='ffa'?16:8)});}
      else text(rows.filter(p=>p.bot).length+' BOTS',x+w-90,73,10,T.muted,85);
      if(infection)text('FIRST INFECTED CHOSEN AFTER PREPARATION',x,89,8,T.muted,w-145);
      line(x,102,x+w-4,102,teamBased&&S.team===team?T.accent:T.line,1);
      const pitch=!teamBased&&rows.length<=6?Math.min(43,216/Math.max(1,rows.length)):25;
      rosterRows(rows,team,x,108,w-4,state.rosterPages,{pitch,capacity:pitch>25?6:9});
      if(!rows.length){text('OPEN TEAM',x+10,128,13,T.muted,w-20);text('Invite players or add bots above.',x+10,151,11,T.muted,w-20);}
    });
    const x=588;img('world-'+S.map+'.jpg',x,58,240,131,true,.80);box(x,133,240,56,'rgba(11,19,13,.65)');text('BATTLEGROUND  ↗',x+13,141,9,T.accent,210);text(S.mapName,x+13,160,27,T.text,214,'display');link('map-card','',x,58,240,131,()=>go('map'));
    box(x,196,240,73,'rgba(38,49,32,.8)');text('MATCH RULES  ↗',x+13,205,9,T.accent,210);text(spec.name,x+13,221,23,T.text,214,'display');text(infection?'1 round · '+S.rules.timeLimit+' min':S.rules.scoreLimit+' points · '+S.rules.timeLimit+' min',x+13,251,10,T.accent,220);link('rules-card','',x,196,240,73,()=>go('match'));
    box(x,277,240,47,'rgba(38,49,32,.8)');
    if(infection){text('ROUND EQUIPMENT',x+13,285,10,T.muted,215);text('FREE WEAPONS · EARN AMMO PACKS',x+13,302,11,T.accent,215);}
    else{thumb('weapon',S.loadout.primaryWeapon,S.loadout.primaryAttachments,x+8,278,90,44);text('YOUR LOADOUT ›',x+102,285,9,T.muted,130);text(S.className,x+102,299,13,T.accent,130);link('loadout-card','',x,277,240,47,()=>go('loadout'));}
    deployFooter();
  }
  function colorRow(p,x,y,w,pitch=25){
    const waiting=S.inLobby&&S.mode==='infection',rowH=pitch-1,color=relationshipColor(relationshipFor({self:p.self,bot:p.bot,viewerTeam:S.team,actorTeam:waiting?S.team:p.team,teamBased:waiting||gameModeSpec(S.mode).teamBased}));
    box(x,y,w,rowH,p.self?'#2e3c29':'rgba(29,39,33,.67)');box(x,y,2,rowH,color);
    text(p.bot?String(p.name).replace(/^(ALPHA|BRAVO) /,''):p.name,x+8,y+(rowH-14)/2,13,color,w-85);text(p.self?'YOU · '+(S.host?'HOST':'PLAYER'):p.bot?'BOT':p.admin?'ADMIN':'PLAYER',x+w-78,y+(rowH-8)/2,8,T.muted,72);
  }
  function step(id,label,value,x,y,w,change,min,max,step=1,unit=''){text(label.toUpperCase(),x,y,9,T.muted,w);button(id+'-','−',x,y+19,44,38,()=>change(clamp(Number(value)-step,min,max)),{disabled:value<=min});box(x+48,y+19,w-96,38,T.panel);text(Number(Number(value).toFixed(2))+unit,x+60,y+31,13,T.accent,w-112);button(id+'+','+',x+w-44,y+19,44,38,()=>change(clamp(Number(value)+step,min,max)),{disabled:value>=max});}
  function match(){text('CHOOSE YOUR ENGAGEMENT',24,65,12,T.muted);Object.values(GAME_MODES).forEach((m,i)=>{const x=24+i%3*161,y=94+Math.floor(i/3)*104;button('mode-'+m.id,'',x,y,151,92,()=>adapter.mode(m.id),{active:S.mode===m.id,disabled:!S.host});text(m.short,x+12,y+13,25,S.mode===m.id?T.accent:T.text,125,'display');wrap(m.name,x+12,y+48,127,11,T.muted,2);});text('MATCH RULES',534,65,12,T.muted);const editable=S.host,mode=gameModeSpec(S.mode);if(['team','player'].includes(mode.scoreType)){step('score','Score limit',S.rules.scoreLimit,534,99,286,v=>editable&&adapter.rule('scoreLimit',v),5,100,5);step('time','Time limit',S.rules.timeLimit,534,171,286,v=>editable&&adapter.rule('timeLimit',v),2,30,1,' min');}else if(S.mode==='infection'){step('time','Match duration',S.rules.timeLimit,534,99,286,v=>editable&&adapter.rule('timeLimit',v),4,8,2,' min');wrap('1 round · 20s to equip and find cover. Claw contact infects. Infected respawn.',534,164,279,12,T.text,3);button('infection-chaos','CHAOS ITEMS  '+(S.rules.infectionChaos?'ON':'OFF'),534,218,286,44,()=>adapter.rule('infectionChaos',!S.rules.infectionChaos),{disabled:!editable,size:11});}else wrap(mode.cooperative?'Survive successive waves together. Players return at the next wave.':'Open play. No score or time limit.',534,104,279,15,T.text,5);button('minimap','MINIMAP   '+cap(S.rules.minimap),534,S.mode==='infection'?275:252,286,46,()=>adapter.rule('minimap',['standard','all','directional'][(['standard','all','directional'].indexOf(S.rules.minimap)+1)%3]),{disabled:!S.host||S.mode==='infection'});deployFooter();}
  function maps(){link('official','BATTLEGROUNDS',24,57,171,38,()=>state.maps='official',{active:state.maps==='official'});link('saved','MY MAPS',199,57,121,38,()=>{state.maps='mine';adapter.refreshMaps();},{active:state.maps==='mine'});if(state.maps==='official'){const ids=S.mode==='moon'?['moon']:['highlands','depot','yard','rig'];ids.forEach((id,i)=>{const x=24+i*202;img('world-'+id+'.jpg',x,108,190,186);box(x,248,190,46,'rgba(14,24,17,.9)',S.map===id?T.accent:'');text(id.toUpperCase(),x+12,259,26,T.text,166,'display');button('map-'+id,'',x,108,190,186,()=>adapter.map(id),{quiet:true,disabled:!S.host});if(S.map===id){line(x,295,x+190,295,T.accent,3);text('SELECTED',x+110,120,9,T.accent,75);}});}else{const entries=S.maps||[];if(!entries.length){text('YOUR BATTLEGROUND STARTS HERE',24,125,33,T.text,750,'display');wrap(S.mapsLoading?'Loading your maps…':'Create a map in the editor, then return here to deploy with your team.',24,178,570,14,T.muted);button('new-map','CREATE MAP  ↗',24,240,250,49,()=>click('lobbyCreateMapBtn'),{primary:true});}else{const pages=Math.ceil(entries.length/4);state.mapPage=Math.min(state.mapPage,pages-1);entries.slice(state.mapPage*4,state.mapPage*4+4).forEach((entry,i)=>{const x=24+i*202;button('saved-map-'+entry.id,'',x,112,190,170,()=>adapter.savedMap(entry),{active:S.selectedMap===entry.id,disabled:!S.host});text('CUSTOM BATTLEGROUND',x+13,130,9,T.muted,165);text(entry.name,x+13,162,24,T.text,164,'display');text('REVISION '+(entry.revision||'DRAFT'),x+13,208,10,T.muted,162);if(S.selectedMap===entry.id){link('edit-map','EDIT',x+8,234,77,41,()=>click('lobbyEditMapBtn'));link('delete-map','DELETE',x+95,234,85,41,()=>click('lobbyDeleteMapBtn'));}});link('new-map','+ CREATE MAP',620,57,198,38,()=>click('lobbyCreateMapBtn'));if(pages>1){link('maps-prev','‹',335,57,44,38,()=>state.mapPage=Math.max(0,state.mapPage-1),{disabled:state.mapPage===0});text((state.mapPage+1)+' / '+pages,390,72,11,T.muted);link('maps-next','›',449,57,44,38,()=>state.mapPage=Math.min(pages-1,state.mapPage+1),{disabled:state.mapPage>=pages-1});}}}deployFooter();}
  function classOverview(id){adapter.class(id);state.railOffsets={};state.slot='';editSection('overview');}
  function classPicker(){
    text('CHOOSE CLASS',24,65,27,T.text,490,'display');
    text(S.godMode?'EQUIP NOW':'NEXT SPAWN',630,74,10,T.muted,197);
    const gap=10,width=(796-gap*4)/5,top=108,height=menuH-top-20;
    S.classes.forEach((item,i)=>{
      const x=24+i*(width+gap),on=item.id===S.playClass;
      button('play-class-'+item.id,'Choose '+item.name,x,top,width,height-52,()=>adapter.chooseClass(item.id),{active:on,size:0});
      text(item.name,x+10,top+15,17,on?T.accent:T.text,width-20,'display');
      thumb('weapon',item.primaryWeapon,item.primaryAttachments,x+8,top+51,width-16,69);
      text(WEAPON_SPECS[item.primaryWeapon]?.name,x+10,top+128,12,T.text,width-20,'display');
      text(WEAPON_SPECS[item.secondaryWeapon]?.name,x+10,top+151,10,T.muted,width-20);
      text(on?(S.pendingClass?'NEXT ✓':'CURRENT ✓'):'',x+10,top+height-78,10,T.accent,width-20);
      button('customize-'+item.id,'EDIT',x,top+height-46,width,46,()=>classOverview(item.id),{size:11});
    });
  }
  function armory(){
    if(S.inMatch&&state.edit==='classes'){classPicker();return;}
    box(8,56,125,menuH-64,'rgba(9,16,12,.35)');
    box(141,56,695,menuH-64,'rgba(24,34,27,.7)',T.line);
    text('CLASSES',20,68,10,T.muted,101);
    const pitch=(menuH-152)/5;
    S.classes.forEach((item,i)=>{const y=89+i*pitch;button('class-'+item.id,'Edit '+item.name,14,y,113,pitch-3,()=>classOverview(item.id),{active:S.classId===item.id,size:0});text(item.name,25,y+8,12,S.classId===item.id?T.accent:T.text,92);text(WEAPON_SPECS[item.primaryWeapon]?.name,25,y+27,9,T.muted,92);});
    if(!S.inMatch)button('shared-streaks','KILLSTREAKS',14,menuH-55,113,44,()=>editSection('streaks'),{active:state.edit==='streaks',size:9});
    if(state.edit==='streaks'){streaks();return;}
    text(S.className,155,65,20,T.text,590,'display');link('rename','✎',788,57,42,34,()=>adapter.rename(),{size:18});
    if(state.edit==='overview'){overview();return;}
    const tabs=[['primary','PRIMARY',WEAPON_SPECS[S.loadout.primaryWeapon]?.name],['secondary','SECONDARY',WEAPON_SPECS[S.loadout.secondaryWeapon]?.name],['tactical','TACTICAL',EQUIPMENT_SPECS[S.loadout.tactical]?.short],['lethal','LETHAL',EQUIPMENT_SPECS[S.loadout.lethal]?.short]];
    tabs.forEach(([id,label,sub],i)=>{const x=151+i*170;button('edit-'+id,label+' '+sub,x,94,166,43,()=>editSection(id),{active:state.edit===id,size:0,tab:true});text(label,x+10,101,9,state.edit===id?T.accent:T.muted,145);text(sub,x+10,116,11,T.text,145);if(state.edit===id)line(x+7,136,x+159,136,T.accent,2);});
    if(state.edit==='primary'||state.edit==='secondary')gunsmith();else equipment();
  }
  function overview(){
    const top=104,primaryH=(menuH-128)*.57,lowerY=top+primaryH+10,lowerH=menuH-lowerY-15;
    const cards=[['primary',S.loadout.primaryWeapon,155,top,326,primaryH],['secondary',S.loadout.secondaryWeapon,491,top,330,primaryH],['tactical',S.loadout.tactical,155,lowerY,326,lowerH],['lethal',S.loadout.lethal,491,lowerY,330,lowerH]];
    cards.forEach(([slot,id,x,y,w,h])=>{
      button('overview-'+slot,slot+' '+(WEAPON_SPECS[id]?.name||EQUIPMENT_SPECS[id]?.name),x,y,w,h,()=>editSection(slot),{size:0});
      text(slot.toUpperCase(),x+12,y+10,10,T.muted,w-24);
      if(slot==='primary'||slot==='secondary'){thumb('weapon',id,S.loadout[slot+'Attachments'],x+18,y+26,w-36,h-55);text(WEAPON_SPECS[id]?.name,x+12,y+h-25,17,T.text,w-24,'display');}
      else{thumb('equipment',id,{},x+w-130,y+3,120,h-6);text(EQUIPMENT_SPECS[id]?.name,x+12,y+39,18,T.text,w-150,'display');}
    });
  }

  function hero(kind,id,atts,x,y,w,h){
    const n=node('hero','Rotate '+(WEAPON_SPECS[id]?.name||EQUIPMENT_SPECS[id]?.name||id)+' preview',()=>{});n.dataset.menuPreview='true';
    if(!n._previewBound){const points=new Map();let pinch=0;const span=()=>{const [a,b]=[...points.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
      n.addEventListener('pointerdown',e=>{points.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=span();e.preventDefault();});
      n.addEventListener('pointermove',e=>{const previous=points.get(e.pointerId);if(!previous)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size>1){const next=span();if(pinch>0)preview.zoom((next-pinch)/Math.max(80,w*scale));pinch=next;}else preview.rotate((e.clientX-previous.x)/scale,(e.clientY-previous.y)/scale);e.preventDefault();});
      const end=e=>{points.delete(e.pointerId);pinch=span();e.preventDefault();};n.addEventListener('pointerup',end);n.addEventListener('pointercancel',end);n.addEventListener('wheel',e=>{preview.zoom(-e.deltaY*.002);e.preventDefault();});n._previewBound=true;
    }
    mark(n,physical(r(x,y,w,h)));hit(n,physical(r(x,y,w,h)));
    const drawH=Math.max(40,h),output=preview.hero(kind,id,atts,Math.round(w*1.7),Math.round(drawH*1.7));
    const glow=ctx.createRadialGradient(x+w/2,y+drawH/2,10,x+w/2,y+drawH/2,w*.55);glow.addColorStop(0,'rgba(119,138,94,.14)');glow.addColorStop(1,'rgba(119,138,94,0)');box(x,y,w,h,glow);
    if(output.canvas)ctx.drawImage(output.canvas,x,y,w,drawH);else text(output.pending?'PREPARING 3D PREVIEW…':'3D PREVIEW UNAVAILABLE',x+40,y+h/2,11,T.muted,w-80);
    [['reset-view','↺',()=>preview.reset(kind)],['zoom-out','−',()=>preview.zoom(-.1)],['zoom-in','+',()=>preview.zoom(.1)]].forEach(([key,label,action],i)=>link(key,label,x+w-108+i*36,y+h-32,35,32,action,{size:18}));
    return Object.fromEntries(Object.entries(output.anchors||{}).map(([s,p])=>[s,{x:x+p.x/1.7,y:y+p.y/1.7}]));
  }
  function stockLabel(w,slot){return slot==='optic'?'IRON SIGHTS':['muzzle','underbarrel'].includes(slot)?'NONE':'FACTORY';}
  function selectionRail(key,items,selected,x,y,w,h,drawItem){
    const gap=7,columns=Math.min(3,Math.max(1,items.length)),cardW=(w-gap*(columns-1))/columns,pitch=cardW+gap,max=Math.max(0,items.length*pitch-gap-w);
    if(state.railOffsets[key]===undefined){const i=Math.max(0,items.findIndex(item=>item.id===selected));state.railOffsets[key]=clamp((i-1)*pitch,0,max);}
    const offset=state.railOffsets[key]=clamp(state.railOffsets[key],0,max);railInfo={key,items,pitch,max,x,y,w,h,nodes:[]};
    const clipBefore=localClip;localClip=r(x,y,w,h);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();
    items.forEach((item,i)=>{const left=x+i*pitch-offset,n=drawItem(item,left,y,cardW,h);n.dataset.menuRail='true';n._rail={key,i,pitch,max,x,w};railInfo.nodes.push(n);
      if(!n._railBound){let drag=null;
        n.addEventListener('pointerdown',e=>{drag={x:e.clientX,offset:state.railOffsets[n._rail.key]||0};});
        n.addEventListener('pointermove',e=>{if(!drag)return;const d=(e.clientX-drag.x)/scale;if(Math.abs(d)>7){state.railOffsets[n._rail.key]=clamp(drag.offset-d,0,n._rail.max);state.peek=null;revision++;e.preventDefault();}});
        n.addEventListener('pointerup',()=>{drag=null;});n.addEventListener('pointercancel',()=>{drag=null;});
        n.addEventListener('wheel',e=>{state.railOffsets[n._rail.key]=clamp((state.railOffsets[n._rail.key]||0)+(e.deltaX||e.deltaY)/scale,0,n._rail.max);state.peek=null;revision++;e.preventDefault();});n._railBound=true;
      }
    });ctx.restore();localClip=clipBefore;
    if(max>0){const width=w*w/(w+max);box(x,y+h+3,w,2,T.line);box(x+offset/(w+max)*w,y+h+3,width,2,T.accent);}
  }
  function moveRailFocus(dx,dy){
    const active=ui.activeElement,a=active?._rail,info=railInfo;if(!dx||dy||!info||a?.key!==info.key||!visible())return false;
    const i=clamp(a.i+Math.sign(dx),0,info.nodes.length-1),left=i*info.pitch,right=left+info.pitch-7;let offset=state.railOffsets[info.key]||0;
    if(left<offset)offset=left;if(right>offset+info.w)offset=right-info.w;state.railOffsets[info.key]=clamp(offset,0,info.max);
    const target=info.nodes[i];target.hidden=false;revision++;return target;
  }
  function gunsmith(){
    const slot=state.edit,actualWeapon=S.loadout[slot+'Weapon'],actualAtts=S.loadout[slot+'Attachments']||{},weaponContext=S.classId+':'+slot;
    const w=state.catalog?inspect('weapon',weaponContext,actualWeapon):actualWeapon,atts=w===actualWeapon?actualAtts:adapter.weaponAttachments(w,slot);
    const supported=['muzzle','barrel','optic','underbarrel','magazine','stock'].filter(s=>attachmentOptionsForWeapon(w,s).length);
    if(!supported.includes(state.slot))state.slot=supported[0];
    const context=weaponContext+':'+w+':'+state.slot,equipped=atts[state.slot]||'',chosen=state.catalog?equipped:inspect('attachment',context,equipped),visual={...atts,...(state.slot?{[state.slot]:chosen}:{})},diff=chosen!==equipped||w!==actualWeapon;
    const x=151,wid=396,cardH=62+Math.min(12,(menuH-390)*.12),railY=menuH-13-cardH,categoryY=railY-41;
    text(WEAPON_SPECS[w].name,x,143,18,T.text,278,'display');text(WEAPON_SPECS[w].type,x,166,8,T.muted,278);
    button('weapon-picker',state.catalog?'ATTACHMENTS':'CHANGE WEAPON',435,140,112,34,()=>{state.catalog=!state.catalog;state.peek=null;},{active:state.catalog,size:9});
    const anchors=hero('weapon',w,visual,x,178,wid,categoryY-181);
    if(diff)text('PREVIEW',x+7,categoryY-19,8,T.accent,90);
    if(state.catalog){
      text('SELECT '+slot.toUpperCase(),x,categoryY+12,11,T.muted,280);
      const ids=slot==='primary'?PRIMARY_WEAPONS:SECONDARY_WEAPONS;
      selectionRail(weaponContext+':weapons',ids.map(id=>({id})),actualWeapon,x,railY,wid,cardH,(item,cx,cy,cw,ch)=>{
        const id=item.id,a=adapter.weaponAttachments(id,slot),n=choice('weapon-'+id,'Equip '+WEAPON_SPECS[id].name,cx,cy,cw,ch,()=>adapter.equip({[slot+'Weapon']:id,[slot+'Attachments']:a}),'weapon',weaponContext,id,{active:id===w,size:0});
        thumb('weapon',id,a,cx+6,cy+3,cw-12,ch-24);text(WEAPON_SPECS[id].name,cx+7,cy+ch-19,10,id===w?T.accent:T.text,cw-14,'display');if(id===actualWeapon)text('✓',cx+cw-18,cy+5,10,T.accent,12);return n;
      });
    }else if(supported.length){
      ctx.font='600 10px "Breach Display", "Arial Narrow", sans-serif';
      const labelWidths=supported.map(part=>ctx.measureText(part.toUpperCase()).width),widths=labelWidths.map(v=>Math.max(44,v+12)),extra=(wid-widths.reduce((a,b)=>a+b,0))/supported.length;let catX=x;
      state.callouts=[];supported.forEach((part,i)=>{const px=catX,catW=widths[i]+extra,label=part.toUpperCase();catX+=catW;const anchor=anchors[part];if(anchor&&anchor.x>=x&&anchor.x<=x+wid&&anchor.y>=176&&anchor.y<categoryY-8){const on=state.slot===part,mid=px+catW/2,elbow=categoryY-7;ctx.save();ctx.globalAlpha=on?.85:.22;line(anchor.x,anchor.y,anchor.x,elbow,on?T.accent:T.muted,on?1.3:.8);line(anchor.x,elbow,mid,elbow,on?T.accent:T.muted,on?1.3:.8);line(mid,elbow,mid,categoryY,on?T.accent:T.muted,on?1.3:.8);ctx.beginPath();ctx.arc(anchor.x,anchor.y,on?3:1.8,0,Math.PI*2);ctx.fillStyle=on?T.accent:T.muted;ctx.fill();ctx.restore();state.callouts.push({part,x:anchor.x,y:anchor.y});}link('part-slot-'+part,label,px,categoryY,catW,39,()=>{state.slot=part;state.peek=null;},{active:state.slot===part,tab:true,size:0});text(label,px+(catW-labelWidths[i])/2,categoryY+14,10,state.slot===part?T.accent:T.text,catW-6,'display');if(state.slot===part)line(px+5,categoryY+38,px+catW-5,categoryY+38,T.accent,2);});
      const options=[{id:'',name:stockLabel(w,state.slot)},...attachmentOptionsForWeapon(w,state.slot)];
      selectionRail(context,options,equipped,x,railY,wid,cardH,(item,cx,cy,cw,ch)=>{
        const id=item.id,n=choice('attachment-'+(id||'standard'),'Equip '+item.name,cx,cy,cw,ch,()=>adapter.equip({[slot+'Attachments']:{...atts,[state.slot]:id}}),'attachment',context,id,{active:chosen===id,size:0});
        if(!id&&['muzzle','underbarrel'].includes(state.slot))line(cx+cw*.35,cy+(ch-19)*.5,cx+cw*.65,cy+(ch-19)*.5,T.muted);else thumb('part',w,{...atts,[state.slot]:id},cx+9,cy+2,cw-18,ch-22,state.slot);
        text(item.name,cx+7,cy+ch-19,10,chosen===id?T.accent:T.text,cw-14,'display');if(id===equipped)text('✓',cx+cw-18,cy+5,10,T.accent,12);return n;
      });
    }else{text('FACTORY CONFIGURATION',x+10,categoryY+13,14,T.muted,wid-20,'display');}
    stats(w,visual,state.catalog?'':state.slot,diff);
  }
  function stats(w,atts,slot,diff){
    const x=566,width=258,col=120,pitch=(menuH-184)/4;
    box(555,143,274,menuH-151,'rgba(8,15,12,.3)');line(555,143,555,menuH-9,T.line);
    text('WEAPON STATS',x,151,16,T.text,width,'display');
    const selected=ATTACHMENTS[atts[slot]]?.name||stockLabel(w,slot);
    if(diff)text('PREVIEW',x+187,154,8,T.accent,71);
    const rows=adapter.statRows(w,atts,slot);state.statRows=rows;
    rows.forEach((row,i)=>{const px=x+i%2*134,y=180+Math.floor(i/2)*pitch;
      text(row.label,px,y,9,T.muted,col);text(row.display,px,y+16,16,row.changed?(row.better?T.accent:T.red):T.text,col,'display');
      const by=y+39;box(px,by,col,4,T.line);
      if(!row.unavailable){box(px,by,col*row.solid,4,'#b5c1a8');if(row.changed)box(px+col*row.changeStart,by,col*row.changeWidth,4,row.better?T.accent:T.red);const marker=px+col*row.factoryScore;box(marker-.65,by-2,1.3,8,T.text);}
      if(i<6)line(px,y+pitch-7,px+col,y+pitch-7,'rgba(74,91,73,.3)');
    });
  }
  function equipment(){
    const slot=state.edit,equipped=S.loadout[slot],context=S.classId+':'+slot,id=inspect('equipment',context,equipped),ids=slot==='tactical'?TACTICAL_EQUIPMENT:LETHAL_EQUIPMENT;
    const descriptions={flash:'Disorient opponents.',smoke:'Conceal movement and break sightlines.',sticky:'Adheres to surfaces and opponents.',frag:'Timed explosive that bounces into cover.'};
    text(EQUIPMENT_SPECS[id].name,155,151,23,T.text,390,'display');hero('equipment',id,{},151,182,396,menuH-195);
    ids.forEach((item,i)=>{const y=155+i*87;choice('equipment-'+item,'Equip '+EQUIPMENT_SPECS[item].name,564,y,258,79,()=>adapter.equip({[slot]:item}),'equipment',context,item,{active:id===item,size:0});thumb('equipment',item,{},568,y+3,84,73);text(EQUIPMENT_SPECS[item].name,659,y+17,17,T.text,151,'display');if(item===equipped)text('✓',794,y+53,13,T.accent,20);});wrap(descriptions[id],564,341,258,11,T.muted,2);
  }
  function streaks(){
    const selected=S.streaks[state.streakSlot],id=inspect('streak','streaks',selected)||KILLSTREAK_ORDER[0],spec=KILLSTREAK_SPECS[id];
    text('KILLSTREAKS',149,63,29,T.text,350,'display');text(S.streakLocked?'LOCKED DURING MATCH':'SHARED ACROSS CLASSES',560,75,10,T.muted,270);
    for(let i=0;i<3;i++){const kind=S.streaks[i],x=149+i*229;button('streak-slot-'+i,'',x,103,216,46,()=>state.streakSlot=i,{active:i===state.streakSlot,disabled:S.streakLocked});text('SLOT '+(i+1),x+10,110,8,T.muted,70);text(KILLSTREAK_SPECS[kind]?.name||'OPEN SLOT',x+10,126,12,T.text,195,'display');}
    KILLSTREAK_ORDER.forEach((kind,i)=>{const item=KILLSTREAK_SPECS[kind],x=149+i*137,on=S.streaks.includes(kind);choice('streak-'+kind,item.name,x,160,129,97,()=>{const existing=S.streaks.indexOf(kind);if(existing>=0)state.streakSlot=existing;else if(adapter.streakReplace(state.streakSlot,kind))state.streakSlot=adapter.snapshot().streaks.indexOf(kind);},'streak','streaks',kind,{active:id===kind,disabled:S.streakLocked,size:0});thumb('streak',kind,{},x+6,162,117,58);text(item.short,x+9,220,19,T.text,113,'display');text(item.kills+' KILLS'+(on?' · ✓':''),x+9,243,8,on?T.accent:T.muted,112);});
    text(spec.name,150,273,19,T.text,450,'display');wrap(spec.description,150,298,667,11,T.muted,2);
  }
  function slider(key,x,y,w,h,value,min,max,step,change=v=>adapter.settingPreview(key,v),commit=v=>adapter.setting(key,v)){
    const n=node('slider-'+key,key+' slider',()=>{});n.dataset.menuAdjust='true';n._adjust=dir=>commit(clamp(Number(n._value)+dir*step,min,max));
    if(!n._sliding)n._value=value;n.value=String(n._value);n._slide={rect:physical(r(x,y,w,h)),min,max,step,change,commit};
    if(!n._slideBound){
      const update=e=>{const s=n._slide,v=s.min+clamp((e.clientX-s.rect.x)/s.rect.width,0,1)*(s.max-s.min);n._value=clamp(Math.round((v-s.min)/s.step)*s.step+s.min,s.min,s.max);s.change(n._value);revision++;e.preventDefault();};
      n.addEventListener('pointerdown',e=>{n._sliding=true;update(e);});n.addEventListener('pointermove',e=>{if(n._sliding)update(e);});
      for(const event of ['pointerup','pointercancel'])n.addEventListener(event,e=>{if(n._sliding)n._slide.commit(n._value);n._sliding=false;e.preventDefault();});n._slideBound=true;
    }
    mark(n,physical(r(x,y,w,h)));hit(n,physical(r(x,y,w,h)));const at=x+w*(n._value-min)/(max-min);box(x,y+h/2-1,w,3,T.line);box(x,y+h/2-1,at-x,3,T.accent);box(at-2,y+h/2-5,4,11,T.accent);
    if(ui.activeElement===n&&S.inputMode==='controller'){ctx.strokeStyle=n.classList.contains('controller-editing')?T.accent:T.text;ctx.strokeRect(x-3,y+2,w+6,h-4);}
  }
  function settings(){chrome('SETTINGS');text('SETTINGS',24,65,29,T.text,170,'display');['Controls','Audio','Display','Diagnostics'].forEach((tab,i)=>button('settings-'+tab,tab,24,112+i*47,152,42,()=>state.settings=tab,{active:state.settings===tab,left:true}));if(SETTINGS[state.settings])SETTINGS[state.settings].forEach(([label,key,min,max,step],i)=>{const x=204+i%2*309,y=67+Math.floor(i/2)*64,value=S.settings[key];if(Array.isArray(min)){text(label,x,y,11,T.muted,280);button('setting-'+key,typeof value==='boolean'?(value?'ON':'OFF'):String(value).toUpperCase(),x,y+18,287,38,()=>adapter.setting(key,min[(min.indexOf(value)+1)%min.length]),{active:value==='on'||value===true});}else{const percent=/Volume|Deadzone/.test(key),format=percent?Math.round(value*100)+'%':value.toFixed(2)+'×';text(label,x,y,11,T.muted,213);text(format,x+224,y,11,T.accent,64);button('setting-'+key+'-','−',x,y+21,40,34,()=>adapter.setting(key,clamp(value-step,min,max)));slider(key,x+49,y+21,183,34,value,min,max,step);button('setting-'+key+'+','+',x+247,y+21,40,34,()=>adapter.setting(key,clamp(value+step,min,max)));}});if(state.settings==='Display'){['low','medium','high'].forEach((quality,i)=>{const x=204+i*209;button('quality-'+quality,'',x,99,194,151,()=>adapter.setting('graphics',quality),{active:S.settings.graphics===quality});text(quality.toUpperCase(),x+16,120,29,T.text,161,'display');wrap(['Prioritize performance.','Balance detail and performance.','Prioritize visual detail.'][i],x+16,173,160,13,T.muted);});button('fullscreen',S.fullscreen?'EXIT FULLSCREEN':'ENTER FULLSCREEN ↗',204,271,610,47,()=>adapter.fullscreen());}if(state.settings==='Diagnostics'){text('SESSION DIAGNOSTICS',205,95,28,T.text,598,'display');wrap(S.diagnosticsStatus||'Record the session to help reproduce a problem.',205,145,578,14,T.muted);button('record',S.recording?'STOP RECORDING':'START RECORDING',205,241,220,48,()=>adapter.diagnostics('record'));button('export','DOWNLOAD',437,241,174,48,()=>adapter.diagnostics('export'));button('clear','CLEAR',623,241,188,48,()=>adapter.diagnostics('clear'));}footer();link('settings-reset','Restore defaults',24,341,177,43,()=>{state.pending=()=>{adapter.settingsReset();state.pending=null;};state.resetConfirm=true;});}
  function cheats(){if(screen.id==='adminPanel'&&S.rosterOnly){roster();return;}const admin=screen.id==='adminPanel';if(admin)chrome('HOST / ADMIN');text('HOST / ADMIN',24,70,10,T.muted,150);['Gameplay','Weapons','Players'].forEach((tab,i)=>button('host-tab-'+tab,tab,24,97+i*49,145,44,()=>state.cheats=tab,{active:state.cheats===tab,left:true}));text(state.cheats==='Players'?'PLAYER PERMISSIONS':state.cheats.toUpperCase()+' TUNING',191,65,27,T.text,445,'display');text(S.custom?'CUSTOM RULES':'STANDARD RULES',630,74,9,T.accent,197);if(!S.host&&state.cheats!=='Players'){text('Host controls are unavailable.',191,135,16,T.muted,622);}else if(state.cheats==='Players'){const rows=S.roster.filter(p=>!p.bot),pages=Math.max(1,Math.ceil(rows.length/6));state.playerPage=Math.min(state.playerPage,pages-1);text('God Mode: invincibility, unlimited ammo and equipment.',191,107,12,T.muted,630);rows.slice(state.playerPage*6,state.playerPage*6+6).forEach((p,i)=>{const x=191+i%2*324,y=134+Math.floor(i/2)*62,flags=adapter.playerDraft(p);box(x,y,312,56,T.panel);text(p.name,x+10,y+8,12,T.text,142);text(p.self?'YOU':p.owner?'HOST':p.admin?'ADMIN':'PLAYER',x+10,y+30,9,T.muted,130);button('god-'+p.id,'GOD '+(flags.godMode?'ON':'OFF'),x+147,y+7,76,43,()=>adapter.playerFlag(p,'godMode',!flags.godMode),{active:flags.godMode,size:9,disabled:!S.host});if(S.host&&!p.self&&!p.owner)button('admin-'+p.id,'ADMIN '+(flags.admin?'ON':'OFF'),x+228,y+7,77,43,()=>adapter.playerFlag(p,'admin',!flags.admin),{active:flags.admin,size:9});});if(pages>1){link('permission-prev','‹',22,262,46,40,()=>state.playerPage=Math.max(0,state.playerPage-1),{disabled:state.playerPage===0});text((state.playerPage+1)+' / '+pages,77,277,11,T.muted);link('permission-next','›',119,262,46,40,()=>state.playerPage=Math.min(pages-1,state.playerPage+1),{disabled:state.playerPage>=pages-1});}}else{if(state.cheats==='Weapons')WEAPON_ORDER.forEach((id,i)=>button('host-weapon-'+id,WEAPON_SPECS[id].short,191+i%Math.ceil(WEAPON_ORDER.length/2)*(640/Math.ceil(WEAPON_ORDER.length/2)),102+Math.floor(i/Math.ceil(WEAPON_ORDER.length/2))*35,640/Math.ceil(WEAPON_ORDER.length/2)-8,30,()=>state.weapon=id,{active:state.weapon===id,size:10}));const fields=adapter.hostFields(state.cheats,state.weapon);fields.forEach((field,i)=>{const col=i%2,row=Math.floor(i/2),x=191+col*324,y=(state.cheats==='Weapons'?185:107)+row*(state.cheats==='Weapons'?47:53),w=308;const n=ui.getElementById(field.id),value=Number(n.value);text(field.label+(field.unit?' ('+field.unit.trim()+')':''),x,y,10,T.muted,300);slider('host-'+field.id,x+3,y+17,155,30,value,Number(n.dataset.min),Number(n.dataset.max),Number(n.dataset.step)||1,v=>adapter.hostValue(field.id,v,false),v=>adapter.hostValue(field.id,v,true));link('host-minus-'+field.id,'−',x+173,y+9,37,39,()=>adapter.hostStep(field.id,-1),{size:18});text(value.toFixed(field.decimals||0),x+216,y+20,12,T.accent,58);link('host-plus-'+field.id,'+',x+271,y+9,37,39,()=>adapter.hostStep(field.id,1),{size:18});line(x,y+49,x+w,y+49);});}footer();link('host-reset','Restore defaults',24,340,177,44,()=>{state.resetConfirm=true;state.pending=()=>{adapter.hostReset();state.pending=null;};});}
  function roster(){
    chrome('PLAYERS');const grouped=gameModeSpec(S.mode).teamBased,groups=grouped?(S.mode==='infection'?[['blue','SURVIVORS'],['red','INFECTED']]:[['blue','ALPHA'],['red','BRAVO']]):[['all','PLAYERS']];
    groups.forEach(([team,label],col)=>{const x=24+col*409,w=grouped?388:796,rows=S.roster.filter(p=>team==='all'||p.team===team);text(label,x,65,26,T.text,200,'display');if(S.host&&S.mode!=='infection'&&!gameModeSpec(S.mode).cooperative){link('live-bots-plus-'+team,'+',x+w-105,57,39,42,()=>adapter.liveBots(team,1),{size:24,disabled:rows.filter(p=>p.bot).length>=(grouped?8:16)});text('BOTS',x+w-63,72,10,T.muted,32);link('live-bots-minus-'+team,'−',x+w-32,57,39,42,()=>adapter.liveBots(team,-1),{size:24,disabled:!rows.some(p=>p.bot)});}line(x,100,x+w,100,T.line);rosterRows(rows,team,x,108,w,state.matchPages,{capacity:9,pitch:25});if(!rows.length)text('No players',x+10,122,12,T.muted,w-20);});
    footer();button('roster-back','BACK TO MATCH MENU',24,341,242,43,()=>adapter.closeAdmin(),{primary:true,size:12});
    if(S.canSwitchTeam)button('roster-team','SWITCH TEAM',285,341,180,43,()=>click('nativeRosterTeamBtn'),{size:12});

  }
  function paused(){
    chrome('MATCH MENU');
    img('world-'+S.map+'.jpg',16,61,278,262,true,.72);
    const shade=ctx.createLinearGradient(0,105,0,323);shade.addColorStop(0,'rgba(9,17,13,.15)');shade.addColorStop(1,'rgba(9,17,13,.95)');box(16,61,278,262,shade);
    text('IN MATCH',33,78,43,T.text,247,'display');text(gameModeSpec(S.mode).name.toUpperCase(),34,127,11,T.accent,239);
    text(S.mapName,34,224,29,T.text,239,'display');text(S.room+' · '+S.roster.length+' PLAYERS',35,261,11,T.muted,230);
    const entries=[
      ['pause-loadout',S.mode==='infection'?'ARMORY':'LOADOUT',S.mode==='infection'?'Weapons, equipment and zombie class':S.className+' · '+WEAPON_SPECS[S.loadout.primaryWeapon]?.name,()=>adapter.openLoadout()],
      ['pause-players','PLAYERS','View the match roster',()=>click('nativePausePlayersBtn')],
      ['pause-team','SWITCH TEAM',S.teamSwitchLabel,()=>click('teamSwitchBtn'),!S.canSwitchTeam],
      ['pause-invite','INVITE',S.room+' · Copy invite link',()=>click('copyBtn')],
      ['pause-settings','SETTINGS','Controls, audio and display',()=>adapter.openSettings()],
      ['pause-cheats','CHEATS','Host tuning and permissions',()=>click('adminBtn'),!S.host]
    ];
    entries.forEach(([id,label,sub,action,disabled],i)=>{
      const x=310+i%2*264,y=61+Math.floor(i/2)*90;
      button(id,'',x,y,250,82,action,{disabled});text(label,x+15,y+17,21,T.text,220,'display');text(sub,x+15,y+51,10,T.muted,220);
    });
    footer();button('pause-resume','RESUME MATCH  →',16,341,278,43,()=>click('resumeBtn'),{primary:true,size:15});
    link('pause-diagnostics','DOWNLOAD DIAGNOSTICS',310,341,250,43,()=>adapter.diagnostics('export'),{size:11});
    button('pause-leave','LEAVE MATCH',574,341,250,43,()=>click('leaveBtn'),{size:12});text('×',594,351,20,T.red,20);
  }
  function confirm(){if(!state.pending)return;box(0,0,844,menuH,'rgba(4,9,5,.84)');box(195,106,454,177,'#1c271e',T.line);text('RESTORE DEFAULTS?',218,126,28,T.text,412,'display');wrap('Your current settings will be replaced.',219,169,399,13,T.muted,2);const pending=state.pending;button('confirm-stay','BACK',212,228,112,43,()=>{state.pending=null;state.resetConfirm=false;});button('confirm-reset','RESTORE',452,228,180,43,()=>{pending();state.resetConfirm=false;},{primary:true});}
  function draw({context,viewport,screen:root,mark:markNode,hit:hitNode}){if(!['menu','lobbyScreen','loadoutPanel','settingsPanel','adminPanel','pause'].includes(root.id))return false;ctx=context;mark=markNode;hit=hitNode;screen=root;S=adapter.snapshot();railInfo=null;if(screen.id==='lobbyScreen'&&S.mode==='infection'&&state.page==='loadout')state.page='players';if(!roots.has(screen.id)){const container=ui.createElement('div');container.dataset.integratedMenu='true';screen.append(container);roots.set(screen.id,container);}for(const [key,n]of controls)if(key.startsWith(screen.id+':'))n.hidden=true;
    if(currentScreen!==screen.id){state.peek=null;if(screen.id==='settingsPanel')state.settings='Controls';if(screen.id==='adminPanel'&&currentScreen!=='settingsPanel'){state.cheats=S.adminTab==='players'?'Players':S.adminTab==='advanced'?'Weapons':'Gameplay';adapter.hostBegin();}if(screen.id==='lobbyScreen'&&currentScreen==='menu'){state.page='players';state.edit='overview';}if(screen.id==='loadoutPanel'&&currentScreen!=='settingsPanel'){editSection(S.inMatch?'classes':'overview');}currentScreen=screen.id;}
    const expanding=screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout';const safe=viewport.safe;scale=Math.min((viewport.width-safe.left-safe.right)/844,(viewport.height-safe.top-safe.bottom)/390);menuH=expanding?Math.max(390,(viewport.height-safe.top-safe.bottom)/scale):390;ox=safe.left+(viewport.width-safe.left-safe.right-844*scale)/2;oy=safe.top+(viewport.height-safe.top-safe.bottom-menuH*scale)/2;box(0,0,viewport.width,viewport.height,T.bg);ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.beginPath();ctx.rect(0,0,844,menuH);ctx.clip();box(0,0,844,menuH,T.bg);const arm=screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout';if(!arm&&screen.id==='lobbyScreen')img('world-'+S.map+'.jpg',0,48,844,286,true,.12);else{const glow=ctx.createLinearGradient(0,0,844,390);glow.addColorStop(0,'#243029');glow.addColorStop(1,T.bg);box(0,48,844,menuH-104,glow);for(let x=140;x<1000;x+=140)line(x,48,x-108,334,'rgba(185,203,137,.055)');}mark(roots.get(screen.id),physical(r(0,0,844,menuH)));
    if(screen.id==='menu')home();else if(screen.id==='settingsPanel')settings();else if(screen.id==='adminPanel')cheats();else if(screen.id==='pause')paused();else{chrome(screen.id==='loadoutPanel'?'ARMORY':'');if(arm)armory();else if(state.page==='players')players();else if(state.page==='match')match();else if(state.page==='map')maps();else if(state.page==='cheats')cheats();}
    if(state.pending){for(const n of controls.values())if(!n.dataset.integratedControl.startsWith('confirm-'))n.disabled=true;confirm();}ctx.restore();return true;}
  function visible(){return !!screen&&!screen.hidden&&!screen.classList.contains('hide')&&!['gameTextEditor','chatComposer','lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','entryScreen','rotateGate'].some(id=>{const n=ui.getElementById(id);return n&&!n.hidden&&!n.classList.contains('hide');});}
  function cycle(direction){if(!visible())return false;if(screen.id==='loadoutPanel'){if(['overview','classes','streaks'].includes(state.edit))return false;const tabs=['primary','secondary','tactical','lethal'];editSection(tabs[(tabs.indexOf(state.edit)+direction+tabs.length)%tabs.length]);return true;}if(screen.id==='lobbyScreen'){const tabs=['players','match','map',...(S.mode==='infection'?[]:['loadout']),...(S.host?['cheats']:[])];go(tabs[(tabs.indexOf(state.page)+direction+tabs.length)%tabs.length]);return true;}if(screen.id==='settingsPanel'){const tabs=['Controls','Audio','Display','Diagnostics'];state.settings=tabs[(tabs.indexOf(state.settings)+direction+tabs.length)%tabs.length];return true;}return false;}
  function controllerPreview(frame,dt){if(!visible()||!['primary','secondary','tactical','lethal'].includes(state.edit)||!(screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout'))return false;const seconds=clamp(Number(dt)||0,0,.1);preview.rotate((Number(frame.lookX)||0)*200*seconds,(Number(frame.lookY)||0)*140*seconds);preview.zoom(((Number(frame.buttons?.[7])||0)-(Number(frame.buttons?.[6])||0))*.65*seconds);return true;}
  return {draw,state,cycle,controllerPreview,moveRailFocus,get revision(){return revision;},active:visible,back(){if(!visible())return false;state.peek=null;if(screen?.id==='menu'&&state.home!=='home'){state.home='home';return true;}back();return true;}};
}
