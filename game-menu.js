/* Canvas-native production menu. Only presentation state lives here.
 * Authoritative players, classes, settings and host rights come from the adapter.
 * 844 × 390 is the design frame, with one uniform scale and no scroll containers.
 */
import {APP_VERSION,WEAPON_SPECS,PRIMARY_WEAPONS,SECONDARY_WEAPONS,WEAPON_ORDER,ATTACHMENTS,attachmentOptionsForWeapon,EQUIPMENT_SPECS,TACTICAL_EQUIPMENT,LETHAL_EQUIPMENT,KILLSTREAK_ORDER,KILLSTREAK_SPECS,GAME_MODES,gameModeSpec} from './game-config.js?v=2.22.1';
import {INFECTION} from './infection-rules.js?v=2.22.1';
import {drawMatchScoreboard} from './match-menu-ui.js?v=2.22.1';
import {retainedMatchPresentation} from './match-results.js?v=2.22.1';
import {relationshipFor,relationshipColor} from './team-model.js?v=2.22.1';
const T={bg:'#101713',panel:'#1d2721',line:'#354234',accent:'#d8eda0',text:'#edf0e8',muted:'#a2aea0',blue:'#98c9db',red:'#eb927e'};
const cap=s=>String(s||'').replace(/^./,x=>x.toUpperCase()),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const r=(x,y,w,h)=>({x,y,left:x,top:y,width:w,height:h,right:x+w,bottom:y+h});
const SETTINGS={Controls:[['Look sensitivity','lookSensitivity',.5,2,.05],['ADS sensitivity','adsSensitivity',.35,1.25,.05],['Touch sensitivity','touchSensitivity',.5,2,.05],['Vertical sensitivity','controllerVerticalSensitivity',.5,1.5,.05],['Aim response curve','controllerResponseCurve',['dynamic','linear','standard']],['Aim assist','controllerAimAssist',['off','on']],['Left stick deadzone','controllerMoveDeadzone',.02,.25,.01],['Right stick deadzone','controllerLookDeadzone',.02,.25,.01]],Audio:[['Mute all audio','mute',[false,true]],['Master volume','masterVolume',0,1,.01],['Sound effects','sfxVolume',0,1,.01],['Music','musicVolume',0,1,.01]]};
export function createGameMenu({ui,adapter,preview}) {
  const state={resultsOpen:false,resultsPage:0,resultsPages:1,resultsSessionId:'',resultsNeedsFocus:false,resultsReturnFocus:false,page:'players',edit:'primary',lastEdit:'primary',slot:'optic',catalog:false,settings:'Controls',cheats:'Gameplay',weapon:'assault',homePage:0,maps:'official',rosterPages:{},matchPages:{},streakSlot:0,peek:null,railOffsets:{},mapPage:0,hostPage:0,pending:null};
  const roots=new Map(),controls=new Map(),images=new Map();
  let ctx,mark,hit,screen,S,scale=1,ox=0,oy=0,currentScreen='',menuH=390,localClip=null,railInfo=null,revision=0;
  function node(id,label,action,disabled=false){const key=screen.id+':'+id;let n=controls.get(key);if(!n){n=ui.createElement('button');n.id='integrated-'+key.replace(/[^a-zA-Z0-9_-]/g,'-');n.dataset.controllerKey=key;n.dataset.integratedControl=id;n.addEventListener('click',()=>{if(!n.disabled){n._action?.();state.peek=null;}revision++;});
      const enter=()=>{if(n._peek&&!n.disabled&&S.inputMode!=='touch'){state.peek={...n._peek,node:n};revision++;}};
      const leave=()=>{if(state.peek?.node===n){state.peek=null;revision++;}};
      n.addEventListener('focus',enter);n.addEventListener('pointerenter',enter);n.addEventListener('blur',leave);n.addEventListener('pointerleave',leave);roots.get(screen.id).append(n);controls.set(key,n);}n._action=action;n._peek=null;n.dataset.actionContext=[screen.id,state.page,state.edit,state.catalog,state.resultsOpen?state.resultsSessionId:'',S.classId,id,label].join(':');if(n.textContent!==label)n.textContent=label;if(n.disabled!==disabled)n.disabled=disabled;n.hidden=false;n.setAttribute('aria-label',label||id.replace(/-/g,' '));return n;}
  function physical(b){return r(ox+b.x*scale,oy+b.y*scale,b.width*scale,b.height*scale);}
  function box(x,y,w,h,fill=T.panel,border=''){ctx.fillStyle=fill;ctx.fillRect(x,y,w,h);if(border){ctx.strokeStyle=border;ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);}}
  function line(x,y,xx,yy,color=T.line,width=1){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(xx,yy);ctx.stroke();}
  function text(value,x,y,size=12,color=T.text,w=800,font='sans',weight=600){size=Math.max(size,10/scale);ctx.fillStyle=color;ctx.textAlign='left';ctx.textBaseline='top';ctx.font=`${weight} ${size}px ${font==='display'?'"Breach Display", "Arial Narrow"':'Inter, Arial'}, sans-serif`;let str=String(value??'');while(str.length&&ctx.measureText(str).width>w)str=str.slice(0,-1);if(str!==String(value??''))str=str.slice(0,-1)+'…';ctx.fillText(str,x,y);}
  function wrap(value,x,y,w,size=12,color=T.muted,lines=3){const words=String(value||'').split(' ');let row='',n=0;ctx.font=`400 ${Math.max(size,10/scale)}px Inter, Arial, sans-serif`;for(const word of words){if(ctx.measureText(row+' '+word).width>w&&row){text(row,x,y+n*(size+4),size,color,w,'sans',400);row=word;if(++n>=lines)return;}else row+=(row?' ':'')+word;}text(row,x,y+n*(size+4),size,color,w,'sans',400);}
  // Dense field rows keep their requested paint height. Hit/semantic rectangles
  // still grow to 44 physical pixels in the whitespace around that visual.
  function button(id,label,x,y,w,h,action,{active,primary=false,disabled=false,quiet=false,size=12,left=false,tab=false,ariaLabel=label,compactVisual=false}={}){const target=44/scale,originalWidth=w,originalHeight=h;w=Math.max(w,target);h=Math.max(h,target);x=localClip?x-(w-originalWidth)/2:clamp(x-(w-originalWidth)/2,0,844-w);y=clamp(y-(h-originalHeight)/2,0,menuH-h);const n=node(id,ariaLabel,action,disabled),b=r(x,y,w,h),paintH=compactVisual?Math.min(originalHeight,h):h,paintY=y+(h-paintH)/2;n.visualRect=physical(r(x,paintY,w,paintH));if(tab){n.setAttribute('role','tab');n.setAttribute('aria-selected',String(!!active));}else if(active!==undefined)n.setAttribute('aria-pressed',String(!!active));else n.removeAttribute('aria-pressed');n.classList.toggle('active',!!active);n.dataset.controllerDefault=String(!!primary);const clipped=localClip?r(Math.max(x,localClip.x),Math.max(y,localClip.y),Math.max(0,Math.min(x+w,localClip.right)-Math.max(x,localClip.x)),Math.max(0,Math.min(y+h,localClip.bottom)-Math.max(y,localClip.y))):b;mark(n,physical(clipped));if(clipped.width*scale>=43.9&&clipped.height*scale>=43.9)hit(n,physical(clipped));else n.hidden=true;ctx.save();if(disabled)ctx.globalAlpha=.35;if(!quiet||active)box(x,paintY,w,paintH,primary?T.accent:active?'#273123':T.panel,active&&!tab?T.accent:'');const c=primary?T.bg:active?T.accent:T.text;if(size>0)size=Math.max(size,10/scale);ctx.font=`600 ${size}px Inter, Arial, sans-serif`;const tx=left?x+10:x+Math.max(2,(w-ctx.measureText(label).width)/2);if(['✎','⚙','↺'].includes(label))controlIcon(label,x+w/2,y+h/2,c);else if(size>0)text(label,tx,y+(h-size)/2,size,c,w-(tx-x)-2);if(ui.activeElement===n&&S.inputMode!=='touch'){ctx.strokeStyle=T.text;ctx.lineWidth=1;ctx.strokeRect(x+3,paintY+3,w-6,paintH-6);}ctx.restore();return n;}
  function controlIcon(kind,x,y,color){
    ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.8;ctx.lineCap='round';
    if(kind==='✎'){ctx.beginPath();ctx.moveTo(x-7,y+7);ctx.lineTo(x-5,y);ctx.lineTo(x+5,y-10);ctx.lineTo(x+10,y-5);ctx.lineTo(x,y+5);ctx.closePath();ctx.stroke();line(x+2,y-7,x+7,y-2,color,1.8);}
    else if(kind==='⚙'){ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.stroke();for(let i=0;i<8;i++){const a=i*Math.PI/4;line(x+Math.cos(a)*9,y+Math.sin(a)*9,x+Math.cos(a)*12,y+Math.sin(a)*12,color,1.8);}}
    else{ctx.beginPath();ctx.arc(x,y,8,-Math.PI*.8,Math.PI*.85);ctx.stroke();line(x-7,y-6,x-7,y-12,color,1.8);line(x-7,y-6,x-1,y-6,color,1.8);}
    ctx.restore();
  }
  // Navigation inspects; activation commits. The same cards serve every input.
  function choice(id,label,x,y,w,h,action,kind,context,value,opts={}){const n=button(id,label,x,y,w,h,action,opts);n._peek={kind,context,value};return n;}
  function inspect(kind,context,fallback){return state.peek?.kind===kind&&state.peek.context===context?state.peek.value:fallback;}
  function editSection(id){state.edit=id;if(['primary','secondary','tactical','lethal'].includes(id))state.lastEdit=id;state.catalog=false;state.peek=null;preview.reset(id==='primary'||id==='secondary'?'weapon':'equipment');}
  function rosterRows(rows,team,x,y,w,pages,{capacity=8,pitch=25,pagerY=278}={}){
    const size=rows.length>capacity?Math.min(capacity,Math.floor((pagerY-y-4)/pitch)):capacity,total=Math.max(1,Math.ceil(rows.length/size));
    pages[team]=clamp(pages[team]||0,0,total-1);const page=pages[team];
    rows.slice(page*size,(page+1)*size).forEach((p,i)=>colorRow(p,x,y+i*pitch,w,pitch));
    if(total>1){link('roster-prev-'+team,'‹',x,pagerY,56,44,()=>pages[team]=Math.max(0,page-1),{disabled:page===0,size:22});text((page+1)+' / '+total,x+64,pagerY+16,10,T.muted,65);link('roster-next-'+team,'›',x+w-56,pagerY,56,44,()=>pages[team]=Math.min(total-1,page+1),{disabled:page===total-1,size:22});}
  }
  function link(id,label,x,y,w,h,action,opts={}){return button(id,label,x,y,w,h,action,{quiet:true,...opts});}
  function click(id){adapter.click(id);}
  function img(key,x,y,w,h,cover=true,alpha=1){let im=images.get(key);if(!im){im=new Image();im.src=new URL('./menu-assets/'+key+'?v='+APP_VERSION,import.meta.url).href;images.set(key,im);}if(!im.complete||!im.naturalWidth)return;const z=cover?Math.max(w/im.width,h/im.height):Math.min(w/im.width,h/im.height);ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.globalAlpha=alpha;ctx.drawImage(im,x+(w-im.width*z)/2,y+(h-im.height*z)/2,im.width*z,im.height*z);ctx.restore();}
  function thumb(kind,id,atts,x,y,w,h,slot=''){const canvas=preview.thumb(kind,id,atts,slot);if(canvas)ctx.drawImage(canvas,x,y,w,h);else if(kind==='weapon')img('weapon-'+id+'.png',x,y,w,h,false);}
  function go(page){state.pending=null;state.page=page;editSection(state.lastEdit);adapter.page(page);if(page==='cheats')adapter.hostBegin();}
  function closeResults(){if(!state.resultsOpen)return false;state.resultsOpen=false;state.resultsNeedsFocus=false;state.resultsPage=0;state.resultsReturnFocus=true;revision++;}
  function openResults(){const current=adapter.snapshot();if(!current.inLobby||!current.lastResult)return false;state.resultsOpen=true;state.resultsPage=0;state.resultsSessionId=current.lastResult.sessionId;state.resultsNeedsFocus=true;state.peek=null;state.pending=null;revision++;return true;}
  function back(){
    if(state.resultsOpen){closeResults();return;}
    if(state.pending){state.pending=null;return;}
    if(screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout'){
      if(state.catalog){state.catalog=false;state.peek=null;return;}
      if(screen.id==='loadoutPanel'&&S.inMatch&&state.edit!=='classes'){editSection('classes');return;}
      if(screen.id==='lobbyScreen'){go('players');return;}
    }
    if(screen.id==='settingsPanel')adapter.closeSettings();else if(screen.id==='adminPanel')adapter.closeAdmin();else if(screen.id==='loadoutPanel')adapter.closeLoadout();else if(screen.id==='pause')click('resumeBtn');else click('nativeLobbyBackBtn');
  }
  function chrome(title=''){box(0,0,844,48,'rgba(13,21,16,.96)');line(0,47,844,47);if(screen.id!=='menu')link('back','‹',8,2,44,44,back,{size:26,ariaLabel:screen.id==='pause'?'Resume match':'Back'});text('BREACH',screen.id==='menu'?24:56,6,24,T.text,130,'display');text(title|| (screen.id==='menu'?'MULTIPLAYER':S.host?'LOBBY · HOST':'LOBBY · PLAYER'),screen.id==='menu'?24:56,31,8,T.muted,136);if(screen.id==='lobbyScreen'){const tabs=[['players','PLAYERS',84],['match','MATCH',74],['map','MAPS',65],['loadout','LOADOUT',92],...(S.host?[['cheats','HOST',78]]:[])];let x=157;for(const [id,label,w]of tabs){const on=state.page===id;link('tab-'+id,label,x,0,w,47,()=>go(id),{active:on,tab:true});if(on)line(x,46,x+w,46,T.accent,2);x+=w;}link('invite',S.room+'  INVITE ↗',650,0,129,47,()=>click('lobbyInviteBtn'));}else if(screen.id==='menu')link('profile',S.name+'  ✎',638,0,140,47,()=>click('nameInput'));if(screen.id!=='settingsPanel'&&screen.id!=='pause')link('settings','⚙',790,0,45,47,()=>adapter.openSettings(),{size:22,ariaLabel:'Settings'});}
  function footer(){box(0,menuH-56,844,56,'rgba(13,21,16,.96)');line(0,menuH-56,844,menuH-56);}
  function deployFooter(){footer();if(S.spawnProblem)wrap(S.spawnProblem,25,344,312,10,'#ffad98',3);else{text(S.name,25,346,12,T.text,250);text(S.host?'LOBBY HOST':'CONNECTED',25,365,8,T.muted,250);}link('lobby-name','✎',287,340,44,44,()=>click('nameInput'),{size:18,ariaLabel:'Edit your player name: '+S.name});if(S.host){link('difficulty','BOT DIFFICULTY   '+cap(S.rules.difficulty)+' ›',358,339,221,45,()=>adapter.rule('difficulty',['easy','normal','hard','elite'][(['easy','normal','hard','elite'].indexOf(S.rules.difficulty)+1)%4]));button('start','START MATCH     →',588,340,240,44,()=>click('lobbyStartBtn'),{primary:true,disabled:!S.canStart,size:14});}else text('WAITING FOR HOST TO START',588,355,12,T.accent,240);}
  function home(){
    chrome();
    img('world-highlands.jpg',0,48,844,286,true,.32);
    box(16,58,312,265,'rgba(12,21,15,.88)');
    button('create','HOST MATCH',28,70,288,56,()=>click('createBtn'),{primary:true,size:17});
    text('JOIN WITH CODE',28,145,12,T.muted,288);
    button('code',S.code||'ROOM CODE',28,172,198,52,()=>click('codeInput'),{size:17,ariaLabel:'Room code: '+(S.code||'enter code')});
    button('connect','JOIN',234,172,82,52,()=>click('joinBtn'),{primary:true,disabled:!String(S.code||'').trim(),ariaLabel:'Join room '+(S.code||'')});
    link('builder','MAP BUILDER ↗',28,253,288,52,()=>click('nativeBuilderTab'),{left:true});
    text('OPEN MATCHES',352,75,23,T.text,204,'display');
    link('refresh','REFRESH',740,65,88,52,()=>click('refreshBtn'));
    const rooms=adapter.liveRooms(),discovery=adapter.roomBrowser?.()||{},capacity=3,pages=Math.max(1,Math.ceil(rooms.length/capacity));
    if(state.roomPageKey!==discovery.pageKey){state.roomPageKey=discovery.pageKey;state.homePage=discovery.pageAtEnd?pages-1:0;}
    state.homePage=clamp(state.homePage,0,pages-1);
    if(!rooms.length)wrap(discovery.status||S.status||'No open matches. Host one or join with a room code.',352,141,451,15,T.muted,4);
    rooms.slice(state.homePage*capacity,state.homePage*capacity+capacity).forEach((room,i)=>button('room-'+(state.homePage*capacity+i),room.label,352,127+i*62,476,56,room.action,{left:true,ariaLabel:'Join '+room.label}));
    if(pages>1||discovery.hasPrevious||discovery.nextCursor){link('rooms-prev','‹',574,65,56,52,()=>{if(state.homePage>0)state.homePage--;else adapter.previousRooms?.();},{disabled:!!discovery.loading||state.homePage===0&&!discovery.hasPrevious,ariaLabel:'Previous matches'});text((state.homePage+1)+' / '+pages+(discovery.nextCursor?'+':''),633,85,11,T.muted,45);link('rooms-next','›',674,65,56,52,()=>{if(state.homePage<pages-1)state.homePage++;else adapter.nextRooms?.();},{disabled:!!discovery.loading||state.homePage===pages-1&&!discovery.nextCursor,ariaLabel:'Next matches'});}
    footer();button('armory','LOADOUT',24,341,268,44,()=>adapter.openLoadout());
    text(S.status||discovery.status||'',320,355,10,T.muted,365);text('v'+APP_VERSION,735,355,11,T.muted,90);
  }
  function players(){
    const spec=gameModeSpec(S.mode),infection=S.mode==='infection',teamBased=spec.teamBased&&!spec.cooperative&&!infection;
    const groups=teamBased?[['blue','ALPHA'],['red','BRAVO']]:[['ffa',spec.cooperative?'OPERATORS':infection?'PARTICIPANTS':'PLAYERS']];
    groups.forEach(([team,label],column)=>{
      const x=16+column*284,w=teamBased?272:556,rows=S.roster.filter(p=>team==='ffa'||p.team===team),count=team==='ffa'?S.rules.ffaBots:S.rules[team==='blue'?'blueBots':'redBots'];
      text(label,x,65,teamBased?21:24,T.text,w-140,'display');
      if(teamBased)link('team-'+team,S.team===team?'✓':'JOIN',x+73,69,56,44,()=>adapter.team(team),{disabled:S.team===team,size:10,ariaLabel:(S.team===team?'Joined ':'Join ')+label});
      if(S.host&&!spec.cooperative){link('bots-minus-'+team,'−',x+w-128,69,40,44,()=>adapter.bots(team,-1),{size:23,disabled:count<=0,ariaLabel:'Remove '+label+' bot'});text(count+' BOTS',x+w-85,82,10,T.muted,47,'display');link('bots-plus-'+team,'+',x+w-39,69,39,44,()=>adapter.bots(team,1),{size:25,disabled:count>=(team==='ffa'?16:8),ariaLabel:'Add '+label+' bot'});}
      else text(rows.filter(p=>p.bot).length+' BOTS',x+w-90,73,10,T.muted,85);
      if(infection)text('FIRST INFECTED CHOSEN AFTER PREPARATION',x,89,8,T.muted,w-145);
      line(x,116,x+w-4,116,teamBased&&S.team===team?T.accent:T.line,1);
      const pitch=!teamBased&&rows.length<=6?Math.min(40,200/Math.max(1,rows.length)):25;
      rosterRows(rows,team,x,122,w-4,state.rosterPages,{pitch,capacity:pitch>25?5:8,pagerY:278});
      if(!rows.length){text('OPEN TEAM',x+10,128,13,T.muted,w-20);text('Invite players or add bots above.',x+10,151,11,T.muted,w-20);}
    });
    const x=588;img('world-'+S.map+'.jpg',x,66,240,123,true,.80);box(x,133,240,56,'rgba(11,19,13,.65)');text('BATTLEGROUND  ↗',x+13,141,9,T.accent,210);text(S.mapName,x+13,160,27,T.text,214,'display');link('map-card','',x,66,240,123,()=>go('map'),{ariaLabel:'Choose map: '+S.mapName});
    box(x,196,240,73,'rgba(38,49,32,.8)');text('MATCH RULES  ↗',x+13,205,9,T.accent,210);text(spec.name,x+13,221,23,T.text,214,'display');text(infection?INFECTION.rounds+' rounds · '+Math.round(INFECTION.roundMs/60000)+' min':spec.scoreType==='none'?(spec.cooperative?'Survive together':'Open play'):S.rules.scoreLimit+' points · '+S.rules.timeLimit+' min',x+13,251,10,T.accent,220);link('rules-card','',x,196,240,73,()=>go('match'),{ariaLabel:'Match rules: '+spec.name});
    box(x,277,240,47,'rgba(38,49,32,.8)');
    if(S.lastResult){text('LAST RESULTS  ›',x+13,284,12,T.accent,214);text(gameModeSpec(S.lastResult.match.mode).name,x+13,302,9,T.muted,214);const entry=link('last-results','',x,277,240,47,openResults,{ariaLabel:'Last results: '+gameModeSpec(S.lastResult.match.mode).name});if(state.resultsReturnFocus&&S.inputMode!=='touch')entry.focus();state.resultsReturnFocus=false;}
    else{thumb('weapon',S.loadout.primaryWeapon,S.loadout.primaryAttachments,x+8,278,90,44);text('YOUR LOADOUT ›',x+102,285,9,T.muted,130);text(S.className,x+102,299,13,T.accent,130);link('loadout-card','',x,277,240,47,()=>go('loadout'),{ariaLabel:'Edit loadout: '+S.className});}
    deployFooter();
  }
  function colorRow(p,x,y,w,pitch=25){
    const waiting=S.inLobby&&S.mode==='infection',rowH=pitch-1,color=relationshipColor(relationshipFor({self:p.self,bot:p.bot,viewerTeam:S.team,actorTeam:waiting?S.team:p.team,teamBased:waiting||gameModeSpec(S.mode).teamBased}));
    box(x,y,w,rowH,p.self?'#2e3c29':'rgba(29,39,33,.67)');box(x,y,2,rowH,color);
    text(p.bot?String(p.name).replace(/^(ALPHA|BRAVO) /,''):p.name,x+8,y+(rowH-14)/2,13,color,w-85);text(p.self?'YOU · '+(S.host?'HOST':'PLAYER'):p.bot?'BOT':p.admin?'ADMIN':'PLAYER',x+w-78,y+(rowH-8)/2,8,T.muted,72);
  }
  function step(id,label,value,x,y,w,change,min,max,increment=1,unit='',disabled=false){
    text(label.toUpperCase(),x,y,10,T.muted,w);
    button(id+'-','−',x,y+19,52,44,()=>change(clamp(Number(value)-increment,min,max)),{disabled:disabled||value<=min,ariaLabel:'Decrease '+label});
    box(x+58,y+19,w-116,44,T.panel);text(Number(Number(value).toFixed(2))+unit,x+70,y+33,13,T.accent,w-140);
    button(id+'+','+',x+w-52,y+19,52,44,()=>change(clamp(Number(value)+increment,min,max)),{disabled:disabled||value>=max,ariaLabel:'Increase '+label});
  }
  function match(){
    text('GAME MODE',24,65,12,T.muted);
    Object.values(GAME_MODES).forEach((m,i)=>{const x=24+i%3*161,y=94+Math.floor(i/3)*104;button('mode-'+m.id,'',x,y,151,92,()=>adapter.mode(m.id),{active:S.mode===m.id,disabled:!S.host,ariaLabel:m.name});text(m.short,x+12,y+13,25,S.mode===m.id?T.accent:T.text,125,'display');wrap(m.name,x+12,y+48,127,11,T.muted,2);});
    text(S.host?'MATCH RULES':'MATCH RULES · HOST CONTROLS',534,65,12,T.muted,286);
    const mode=gameModeSpec(S.mode);
    if(S.mode==='infection'){
      text(INFECTION.rounds+' ROUNDS · '+Math.round(INFECTION.roundMs/60000)+' MINUTES',534,105,23,T.text,286,'display');
      wrap(Math.round(INFECTION.buyMs/1000)+'s preparation each round. Start with your class kit; reserve optional gear before the outbreak.',534,145,278,13,T.muted,4);
      wrap('One player becomes infected. Survive the timer or infect every survivor.',534,223,278,13,T.text,3);
    }else{
      if(['team','player'].includes(mode.scoreType)){
        step('score','Score limit',S.rules.scoreLimit,534,99,286,v=>adapter.rule('scoreLimit',v),5,100,5,'',!S.host);
        step('time','Time limit',S.rules.timeLimit,534,175,286,v=>adapter.rule('timeLimit',v),2,30,1,' min',!S.host);
      }else wrap(mode.cooperative?'Survive successive waves together. Players return at the next wave.':'Open play. No score or time limit.',534,104,279,15,T.text,5);
      button('minimap','MINIMAP   '+cap(S.rules.minimap),534,263,286,52,()=>adapter.rule('minimap',['standard','all','directional'][(['standard','all','directional'].indexOf(S.rules.minimap)+1)%3]),{disabled:!S.host});
    }
    deployFooter();
  }
  function maps(){link('official','BATTLEGROUNDS',24,69,171,44,()=>state.maps='official',{active:state.maps==='official'});link('saved','MY MAPS',199,69,121,44,()=>{state.maps='mine';adapter.refreshMaps();},{active:state.maps==='mine'});if(state.maps==='official'){const ids=S.mode==='moon'?['moon']:['highlands','depot','yard','rig'];ids.forEach((id,i)=>{const x=24+i*202;img('world-'+id+'.jpg',x,128,190,166);box(x,248,190,46,'rgba(14,24,17,.9)',S.map===id?T.accent:'');text(id.toUpperCase(),x+12,259,26,T.text,166,'display');button('map-'+id,'',x,128,190,166,()=>adapter.map(id),{quiet:true,disabled:!S.host,ariaLabel:'Select '+cap(id)+' map'});if(S.map===id){line(x,295,x+190,295,T.accent,3);text('SELECTED',x+110,138,9,T.accent,75);}});}else{const entries=S.maps||[];if(!entries.length){text('YOUR BATTLEGROUND STARTS HERE',24,125,33,T.text,750,'display');wrap(S.mapsLoading?'Loading your maps…':'Create a map in the editor, then return here to deploy with your team.',24,178,570,14,T.muted);button('new-map','CREATE MAP  ↗',24,240,250,49,()=>click('lobbyCreateMapBtn'),{primary:true});}else{const pages=Math.ceil(entries.length/4);state.mapPage=Math.min(state.mapPage,pages-1);entries.slice(state.mapPage*4,state.mapPage*4+4).forEach((entry,i)=>{const x=24+i*202;button('saved-map-'+entry.id,'',x,128,190,S.selectedMap===entry.id&&S.host?98:154,()=>adapter.savedMap(entry),{active:S.selectedMap===entry.id,disabled:!S.host,ariaLabel:'Select '+entry.name+' map'});text('CUSTOM BATTLEGROUND',x+13,141,9,T.muted,165);text(entry.name,x+13,162,24,T.text,164,'display');text('REVISION '+(entry.revision||'DRAFT'),x+13,208,10,T.muted,162);if(S.selectedMap===entry.id&&S.host){link('edit-map','EDIT',x+8,239,77,44,()=>click('lobbyEditMapBtn'));link('delete-map','DELETE',x+95,239,85,44,()=>click('lobbyDeleteMapBtn'));}});link('new-map','+ CREATE MAP',620,69,198,44,()=>click('lobbyCreateMapBtn'));if(pages>1){link('maps-prev','‹',335,69,56,44,()=>state.mapPage=Math.max(0,state.mapPage-1),{disabled:state.mapPage===0});text((state.mapPage+1)+' / '+pages,403,84,11,T.muted);link('maps-next','›',466,69,56,44,()=>state.mapPage=Math.min(pages-1,state.mapPage+1),{disabled:state.mapPage>=pages-1});}}}deployFooter();}
  function editClass(id){adapter.class(id);state.railOffsets={};editSection(state.lastEdit);}
  function classPicker(){
    text('CHOOSE CLASS',24,65,27,T.text,490,'display');
    text(S.godMode?'EQUIP IMMEDIATELY':'APPLIES ON NEXT SPAWN',564,74,11,T.muted,263);
    const gap=10,width=(796-gap*4)/5,top=108,height=menuH-top-20,renameWidth=Math.max(44,44/scale);
    S.classes.forEach((item,i)=>{
      const x=24+i*(width+gap),on=item.id===S.playClass,headH=Math.max(48,44/scale);
      box(x,top,width,headH,T.panel);text(item.name,x+10,top+17,15,T.text,width-renameWidth-15,'display');
      link('rename-'+item.id,'✎',x+width-renameWidth,top,renameWidth,headH,()=>adapter.rename(item.id),{size:18,ariaLabel:'Rename '+item.name});
      button('play-class-'+item.id,(S.godMode?'Equip ':'Use on next spawn: ')+item.name,x,top+headH+4,width,height-headH-60,()=>adapter.chooseClass(item.id),{active:on,size:0});
      thumb('weapon',item.primaryWeapon,item.primaryAttachments,x+8,top+headH+10,width-16,69);
      text(WEAPON_SPECS[item.primaryWeapon]?.name,x+10,top+headH+86,12,T.text,width-20,'display');
      text(WEAPON_SPECS[item.secondaryWeapon]?.name,x+10,top+headH+109,10,T.muted,width-20);
      const status=on?(S.pendingClass?'QUEUED ✓':'CURRENT ✓'):S.currentClass===item.id?'CURRENT':'SELECT';
      text(status,x+10,top+height-78,10,T.accent,width-20);
      button('customize-'+item.id,'EDIT',x,top+height-52,width,52,()=>editClass(item.id),{size:11,ariaLabel:'Edit '+item.name+' without equipping'});
    });
  }
  function armory(){
    if(S.inMatch&&state.edit==='classes'){classPicker();return;}
    if(!['primary','secondary','tactical','lethal','streaks'].includes(state.edit))editSection(state.lastEdit);
    box(8,56,180,menuH-64,'rgba(9,16,12,.35)');
    box(198,56,638,menuH-64,'rgba(24,34,27,.7)',T.line);
    text(S.inLobby?'STARTING CLASS':'EDIT CLASS',20,68,10,T.muted,157);
    const pitch=(menuH-152)/5,renameWidth=Math.max(44,44/scale),rowWidth=168;
    S.classes.forEach((item,i)=>{
      const y=89+i*pitch,on=S.classId===item.id,mainWidth=rowWidth-renameWidth-4;
      button('class-'+item.id,(S.inLobby?'Start with ':'Edit ')+item.name,14,y,mainWidth,pitch-3,()=>editClass(item.id),{active:on,size:0});
      text(item.name,24,y+8,12,on?T.accent:T.text,mainWidth-18);
      text(S.inLobby&&item.id===S.startingClass?'STARTING':S.inMatch&&item.id===S.playClass?(S.pendingClass?'QUEUED':'CURRENT'):WEAPON_SPECS[item.primaryWeapon]?.short,24,y+27,9,T.muted,mainWidth-18);
      link('rename-'+item.id,'✎',18+mainWidth,y,renameWidth,pitch-3,()=>adapter.rename(item.id),{size:17,ariaLabel:'Rename '+item.name});
    });
    if(!S.inMatch&&S.mode!=='infection')button('shared-streaks','KILLSTREAKS',14,menuH-55,rowWidth,44,()=>editSection('streaks'),{active:state.edit==='streaks',size:10});
    if(state.edit==='streaks'&&S.mode!=='infection'){streaks();return;}
    if(state.edit==='streaks')editSection(state.lastEdit);
    const status=S.inLobby?'Starts with this class':S.inMatch?(S.classId===S.playClass?(S.godMode?'Changes equip now':'Changes apply on next spawn'):'Editing only · choose to equip'):'Changes saved automatically';
    text('CUSTOMIZE',212,66,24,T.text,275,'display');
    text(status,492,73,11,T.muted,327);
    const tabs=[['primary','PRIMARY',WEAPON_SPECS[S.loadout.primaryWeapon]?.name],['secondary','SECONDARY',WEAPON_SPECS[S.loadout.secondaryWeapon]?.name],['tactical','TACTICAL',EQUIPMENT_SPECS[S.loadout.tactical]?.short],['lethal','LETHAL',EQUIPMENT_SPECS[S.loadout.lethal]?.short]];
    tabs.forEach(([id,label,sub],i)=>{const x=208+i*155;button('edit-'+id,label+' '+sub,x,94,151,43,()=>editSection(id),{active:state.edit===id,size:0,tab:true});text(label,x+10,101,9,state.edit===id?T.accent:T.muted,131);text(sub,x+10,116,11,T.text,131);if(state.edit===id)line(x+7,136,x+143,136,T.accent,2);});
    if(state.edit==='primary'||state.edit==='secondary')gunsmith();else equipment();
  }
  function previewTools(kind,x,y,w){const size=Math.max(44,44/scale),gap=4;[['reset-view','↺','Reset preview',()=>preview.reset(kind)],['zoom-out','−','Zoom out',()=>preview.zoom(-.1)],['zoom-in','+','Zoom in',()=>preview.zoom(.1)]].forEach(([key,label,ariaLabel,action],i)=>link(key,label,x+w-3*size-2*gap+i*(size+gap),y,size,size,action,{size:18,ariaLabel}));}
  function hero(kind,id,atts,x,y,w,h,{controls=true}={}){
    const controlH=Math.max(44,44/scale),previewH=controls?Math.max(1,h-controlH-6):h;
    const n=node('hero','Rotate '+(WEAPON_SPECS[id]?.name||EQUIPMENT_SPECS[id]?.name||id)+' preview',()=>{});n.dataset.menuPreview='true';
    if(!n._previewBound){const points=new Map();let pinch=0;const span=()=>{const [a,b]=[...points.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;};
      n.addEventListener('pointerdown',e=>{points.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch=span();e.preventDefault();});
      n.addEventListener('pointermove',e=>{const previous=points.get(e.pointerId);if(!previous)return;points.set(e.pointerId,{x:e.clientX,y:e.clientY});if(points.size>1){const next=span();if(pinch>0)preview.zoom((next-pinch)/Math.max(80,w*scale));pinch=next;}else preview.rotate((e.clientX-previous.x)/scale,(e.clientY-previous.y)/scale);e.preventDefault();});
      const end=e=>{points.delete(e.pointerId);pinch=span();e.preventDefault();};n.addEventListener('pointerup',end);n.addEventListener('pointercancel',end);n.addEventListener('wheel',e=>{preview.zoom(-e.deltaY*.002);e.preventDefault();});n._previewBound=true;
    }
    mark(n,physical(r(x,y,w,previewH)));hit(n,physical(r(x,y,w,previewH)));
    const drawH=Math.max(1,previewH),output=preview.hero(kind,id,atts,Math.round(w*1.7),Math.round(drawH*1.7));
    const glow=ctx.createRadialGradient(x+w/2,y+drawH/2,10,x+w/2,y+drawH/2,w*.55);glow.addColorStop(0,'rgba(119,138,94,.14)');glow.addColorStop(1,'rgba(119,138,94,0)');box(x,y,w,previewH,glow);
    if(output.canvas)ctx.drawImage(output.canvas,x,y,w,drawH);else text(output.pending?'PREPARING 3D PREVIEW…':'3D PREVIEW UNAVAILABLE',x+40,y+previewH/2,11,T.muted,w-80);
    if(controls)previewTools(kind,x,y+h-controlH,w);
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
        n.addEventListener('pointerdown',e=>{drag={x:e.clientX,offset:state.railOffsets[n._rail.key]||0,moved:false};});
        n.addEventListener('pointermove',e=>{if(!drag)return;const d=(e.clientX-drag.x)/scale;if(Math.abs(e.clientX-drag.x)>7){drag.moved=true;state.railOffsets[n._rail.key]=clamp(drag.offset-d,0,n._rail.max);state.peek=null;revision++;e.preventDefault();}});
        n.addEventListener('pointerup',e=>{if(drag?.moved)e.preventDefault();drag=null;});n.addEventListener('pointercancel',()=>{drag=null;});
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
    const x=208,wid=339,target=Math.max(44,44/scale),categoryRows=state.catalog?1:Math.max(1,Math.ceil(supported.length/Math.max(1,Math.floor(wid/target)))),categoryCols=Math.max(1,Math.ceil(supported.length/categoryRows)),cardH=62+Math.min(12,(menuH-390)*.12),railY=menuH-13-cardH,categoryY=railY-target*categoryRows-6,controlY=147,previewY=controlY+target+6;
    button('weapon-picker',state.catalog?'ATTACHMENTS':'CHANGE WEAPON',x,controlY,wid-3*(target+4),target,()=>{state.catalog=!state.catalog;state.peek=null;},{active:state.catalog,size:9});
    previewTools('weapon',x,controlY,wid);
    const anchors=hero('weapon',w,visual,x,previewY,wid,Math.max(1,categoryY-previewY-6),{controls:false});
    if(diff)text('PREVIEW',x+7,categoryY-19,8,T.accent,90);
    if(state.catalog){
      text('SELECT '+slot.toUpperCase(),x,categoryY+12,11,T.muted,280);
      const ids=slot==='primary'?PRIMARY_WEAPONS:SECONDARY_WEAPONS;
      selectionRail(weaponContext+':weapons',ids.map(id=>({id})),actualWeapon,x,railY,wid,cardH,(item,cx,cy,cw,ch)=>{
        const id=item.id,a=adapter.weaponAttachments(id,slot),n=choice('weapon-'+id,'Equip '+WEAPON_SPECS[id].name,cx,cy,cw,ch,()=>adapter.equip({[slot+'Weapon']:id,[slot+'Attachments']:a}),'weapon',weaponContext,id,{active:id===w,size:0});
        thumb('weapon',id,a,cx+6,cy+3,cw-12,ch-24);text(WEAPON_SPECS[id].name,cx+7,cy+ch-19,10,id===w?T.accent:T.text,cw-14,'display');if(id===actualWeapon)text('✓',cx+cw-18,cy+5,10,T.accent,12);return n;
      });
    }else if(supported.length){
      const labels={muzzle:'MUZZLE',barrel:'BARREL',optic:'OPTIC',underbarrel:'GRIP',magazine:'MAG',stock:'STOCK'},catW=wid/categoryCols;
      state.callouts=[];supported.forEach((part,i)=>{
        const px=x+(i%categoryCols)*catW,py=categoryY+Math.floor(i/categoryCols)*target,anchor=anchors[part],on=state.slot===part;
        if(categoryRows===1&&anchor&&anchor.x>=x&&anchor.x<=x+wid&&anchor.y>=previewY&&anchor.y<categoryY-8){const mid=px+catW/2,elbow=categoryY-7;ctx.save();ctx.globalAlpha=on?.85:.22;line(anchor.x,anchor.y,anchor.x,elbow,on?T.accent:T.muted,on?1.3:.8);line(anchor.x,elbow,mid,elbow,on?T.accent:T.muted,on?1.3:.8);line(mid,elbow,mid,categoryY,on?T.accent:T.muted,on?1.3:.8);ctx.restore();state.callouts.push({part,x:anchor.x,y:anchor.y});}
        link('part-slot-'+part,labels[part],px,py,catW,target,()=>{state.slot=part;state.peek=null;},{active:on,tab:true,size:9,ariaLabel:cap(part)+' attachments'});
        if(on)line(px+4,py+target-1,px+catW-4,py+target-1,T.accent,2);
      });
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
    text(EQUIPMENT_SPECS[id].name,212,151,23,T.text,335,'display');hero('equipment',id,{},208,182,339,menuH-195);
    ids.forEach((item,i)=>{const y=155+i*87;choice('equipment-'+item,'Equip '+EQUIPMENT_SPECS[item].name,564,y,258,79,()=>adapter.equip({[slot]:item}),'equipment',context,item,{active:id===item,size:0});thumb('equipment',item,{},568,y+3,84,73);text(EQUIPMENT_SPECS[item].name,659,y+17,17,T.text,151,'display');if(item===equipped)text('✓',794,y+53,13,T.accent,20);});wrap(descriptions[id],564,341,258,11,T.muted,2);
  }
  function streaks(){
    const selected=S.streaks[state.streakSlot],id=inspect('streak','streaks',selected)||KILLSTREAK_ORDER[0],spec=KILLSTREAK_SPECS[id];
    text('KILLSTREAKS',212,63,29,T.text,310,'display');text(S.streakLocked?'LOCKED DURING MATCH':'SHARED ACROSS CLASSES',560,75,10,T.muted,270);
    for(let i=0;i<3;i++){const kind=S.streaks[i],x=208+i*208;button('streak-slot-'+i,'',x,103,199,46,()=>state.streakSlot=i,{active:i===state.streakSlot,disabled:S.streakLocked});text('SLOT '+(i+1),x+10,110,8,T.muted,70);text(KILLSTREAK_SPECS[kind]?.name||'OPEN SLOT',x+10,126,12,T.text,195,'display');}
    KILLSTREAK_ORDER.forEach((kind,i)=>{const item=KILLSTREAK_SPECS[kind],x=208+i*124,on=S.streaks.includes(kind);choice('streak-'+kind,item.name,x,160,117,97,()=>{const existing=S.streaks.indexOf(kind);if(existing>=0)state.streakSlot=existing;else if(adapter.streakReplace(state.streakSlot,kind))state.streakSlot=adapter.snapshot().streaks.indexOf(kind);},'streak','streaks',kind,{active:id===kind,disabled:S.streakLocked,size:0});thumb('streak',kind,{},x+6,162,105,58);text(item.short,x+9,220,17,T.text,99,'display');text(item.kills+' KILLS'+(on?' · ✓':''),x+9,243,8,on?T.accent:T.muted,99);});
    text(spec.name,212,273,19,T.text,450,'display');wrap(spec.description,212,298,610,11,T.muted,2);
  }
  function slider(key,x,y,w,h,value,min,max,step,change=v=>adapter.settingPreview(key,v),commit=v=>adapter.setting(key,v)){
    const originalHeight=h;h=Math.max(h,44/scale);y-=Math.max(0,h-originalHeight)/2;const n=node('slider-'+key,key+' slider',()=>{});n.dataset.menuAdjust='true';n.dataset.gameControl='slider';n.dataset.min=String(min);n.dataset.max=String(max);n.dataset.step=String(step);n._adjust=dir=>commit(clamp(Number(n._value)+dir*step,min,max));
    if(!n._sliding)n._value=value;n.value=String(n._value);n.setAttribute('role','slider');n.setAttribute('aria-valuemin',String(min));n.setAttribute('aria-valuemax',String(max));n.setAttribute('aria-valuenow',String(n._value));n._slide={rect:physical(r(x,y,w,h)),min,max,step,change,commit};
    if(!n._slideBound){
      n.addEventListener('keydown',e=>{if(n.disabled)return;const s=n._slide,dir={ArrowLeft:-1,ArrowDown:-1,ArrowRight:1,ArrowUp:1}[e.key];if(!dir&&!['Home','End'].includes(e.key))return;e.preventDefault();e.stopPropagation();s.commit(e.key==='Home'?s.min:e.key==='End'?s.max:clamp(Number(n._value)+dir*s.step,s.min,s.max));revision++;});
      const update=e=>{const s=n._slide,v=s.min+clamp((e.clientX-s.rect.x)/s.rect.width,0,1)*(s.max-s.min);n._value=clamp(Math.round((v-s.min)/s.step)*s.step+s.min,s.min,s.max);s.change(n._value);revision++;e.preventDefault();};
      n.addEventListener('pointerdown',e=>{n._startValue=Number(n._value);n._sliding=true;update(e);});n.addEventListener('pointermove',e=>{if(n._sliding)update(e);});
      n.addEventListener('pointerup',e=>{if(n._sliding)n._slide.commit(n._value);n._sliding=false;e.preventDefault();});
      n.addEventListener('pointercancel',e=>{if(n._sliding){n._value=n._startValue;n._slide.change(n._startValue);}n._sliding=false;e.preventDefault();revision++;});n._slideBound=true;
    }
    mark(n,physical(r(x,y,w,h)));hit(n,physical(r(x,y,w,h)));const at=x+w*(n._value-min)/(max-min);box(x,y+h/2-1,w,3,T.line);box(x,y+h/2-1,at-x,3,T.accent);box(at-2,y+h/2-5,4,11,T.accent);
    if(ui.activeElement===n&&S.inputMode==='controller'){ctx.strokeStyle=n.classList.contains('controller-editing')?T.accent:T.text;ctx.strokeRect(x-3,y+(h-originalHeight)/2+2,w+6,originalHeight-4);}
    return n;
  }
  function settings(){chrome('SETTINGS');text('SETTINGS',24,62,24,T.text,170,'display');['Controls','Audio','Display','Diagnostics'].forEach((tab,i)=>button('settings-'+tab,tab,24,96+i*61,152,44,()=>state.settings=tab,{active:state.settings===tab,left:true}));if(SETTINGS[state.settings])SETTINGS[state.settings].forEach(([label,key,min,max,step],i)=>{const x=204+i%2*309,y=67+Math.floor(i/2)*64,value=S.settings[key];if(Array.isArray(min)){text(label,x,y,11,T.muted,280);button('setting-'+key,typeof value==='boolean'?(value?'ON':'OFF'):String(value).toUpperCase(),x,y+18,287,38,()=>adapter.setting(key,min[(min.indexOf(value)+1)%min.length]),{active:value==='on'||value===true,compactVisual:true,ariaLabel:label+': '+(typeof value==='boolean'?(value?'ON':'OFF'):String(value).toUpperCase())});}else{const percent=/Volume|Deadzone/.test(key),format=percent?Math.round(value*100)+'%':value.toFixed(2)+'×';text(label,x,y,11,T.muted,213);text(format,x+224,y,11,T.accent,64);const target=Math.max(44,44/scale);button('setting-'+key+'-','−',x,y+21,target,34,()=>adapter.setting(key,clamp(value-step,min,max)),{ariaLabel:'Decrease '+label,compactVisual:true});slider(key,x+target+8,y+21,287-2*target-16,34,value,min,max,step).setAttribute('aria-label',label);button('setting-'+key+'+','+',x+287-target,y+21,target,34,()=>adapter.setting(key,clamp(value+step,min,max)),{ariaLabel:'Increase '+label,compactVisual:true});}});if(state.settings==='Display'){['low','medium','high'].forEach((quality,i)=>{const x=204+i*209;button('quality-'+quality,'',x,99,194,151,()=>adapter.setting('graphics',quality),{active:S.settings.graphics===quality});text(quality.toUpperCase(),x+16,120,29,T.text,161,'display');wrap(['Prioritize performance.','Balance detail and performance.','Prioritize visual detail.'][i],x+16,173,160,13,T.muted);});button('fullscreen',S.fullscreen?'EXIT FULLSCREEN':S.fullscreenSupported===false?'FULLSCREEN UNAVAILABLE':'ENTER FULLSCREEN ↗',204,271,610,47,()=>adapter.fullscreen(),{disabled:S.fullscreenSupported===false&&!S.fullscreen});}if(state.settings==='Diagnostics'){text('SESSION DIAGNOSTICS',205,95,28,T.text,598,'display');wrap(S.diagnosticsStatus||'Record the session to help reproduce a problem.',205,145,578,14,T.muted);button('record',S.recording?'STOP RECORDING':'START RECORDING',205,241,220,48,()=>adapter.diagnostics('record'));button('export','DOWNLOAD',437,241,174,48,()=>adapter.diagnostics('export'));button('clear','CLEAR',623,241,188,48,()=>adapter.diagnostics('clear'));}footer();link('settings-reset','Restore defaults',24,341,177,43,()=>{state.pending=()=>{adapter.settingsReset();state.pending=null;};state.resetConfirm=true;});}
  function cheats(){
    if(screen.id==='adminPanel'&&S.rosterOnly){roster();return;}
    if(screen.id==='adminPanel')chrome('HOST OPTIONS');
    text('HOST OPTIONS',24,70,11,T.muted,150);
    ['Gameplay','Weapons','Players'].forEach((tab,i)=>button('host-tab-'+tab,tab,24,100+i*62,145,52,()=>{state.cheats=tab;state.hostPage=0;},{active:state.cheats===tab,left:true}));
    text(state.cheats==='Players'?'PLAYER PERMISSIONS':state.cheats.toUpperCase()+' TUNING',191,65,27,T.text,435,'display');
    text(S.custom?'CUSTOM RULES':'STANDARD RULES',646,75,10,T.accent,180);
    let pages=1;
    if(!S.host){text('Only the host can change these options.',191,133,16,T.muted,620);}
    else if(state.cheats==='Players'){
      const rows=S.roster.filter(p=>!p.bot);pages=Math.max(1,Math.ceil(rows.length/4));state.hostPage=clamp(state.hostPage,0,pages-1);
      text('God Mode: invincibility, unlimited ammo and equipment.',191,108,12,T.muted,630);
      rows.slice(state.hostPage*4,state.hostPage*4+4).forEach((p,i)=>{
        const x=191+i%2*324,y=143+Math.floor(i/2)*88,flags=adapter.playerDraft(p);
        box(x,y,312,80,T.panel);text(p.name,x+10,y+8,12,T.text,292);
        button('god-'+p.id,'GOD '+(flags.godMode?'ON':'OFF'),x+7,y+28,139,44,()=>adapter.playerFlag(p,'godMode',!flags.godMode),{active:flags.godMode,size:10,ariaLabel:'God mode for '+p.name+': '+(flags.godMode?'on':'off')});
        if(!p.self&&!p.owner)button('admin-'+p.id,'ADMIN '+(flags.admin?'ON':'OFF'),x+154,y+28,150,44,()=>adapter.playerFlag(p,'admin',!flags.admin),{active:flags.admin,size:10,ariaLabel:'Admin for '+p.name+': '+(flags.admin?'on':'off')});
        else text(p.owner?'HOST':'YOU',x+164,y+47,11,T.muted,130);
      });
    }else{
      const weapons=state.cheats==='Weapons';
      if(weapons)selectionRail('host-weapons',WEAPON_ORDER.map(id=>({id})),state.weapon,191,104,637,56,(item,x,y,w,h)=>button('host-weapon-'+item.id,WEAPON_SPECS[item.id].short,x,y,w,h,()=>{state.weapon=item.id;state.hostPage=0;},{active:state.weapon===item.id,size:12,ariaLabel:'Tune '+WEAPON_SPECS[item.id].name}));
      const fields=adapter.hostFields(state.cheats,state.weapon);pages=Math.max(1,Math.ceil(fields.length/4));state.hostPage=clamp(state.hostPage,0,pages-1);
      fields.slice(state.hostPage*4,state.hostPage*4+4).forEach((field,i)=>{
        const x=191+i%2*324,y=(weapons?174:112)+Math.floor(i/2)*(weapons?76:94),n=ui.getElementById(field.id),value=Number(n.value),target=Math.max(44,44/scale);
        text(field.label+(field.unit?' ('+field.unit.trim()+')':''),x,y,10,T.muted,226);text(value.toFixed(field.decimals||0),x+234,y,12,T.accent,74);
        const cy=y+19;
        button('host-minus-'+field.id,'−',x,cy,target,target,()=>adapter.hostStep(field.id,-1),{size:19,ariaLabel:'Decrease '+field.label});
        slider('host-'+field.id,x+target+8,cy,308-2*target-16,target,value,Number(n.dataset.min),Number(n.dataset.max),Number(n.dataset.step)||1,v=>adapter.hostValue(field.id,v,false),v=>adapter.hostValue(field.id,v,true)).setAttribute('aria-label',field.label);
        button('host-plus-'+field.id,'+',x+308-target,cy,target,target,()=>adapter.hostStep(field.id,1),{size:19,ariaLabel:'Increase '+field.label});
      });
    }
    footer();
    if(S.host)link('host-reset','Restore defaults',24,340,177,44,()=>{state.resetConfirm=true;state.pending=()=>{adapter.hostReset();state.pending=null;};});
    if(pages>1){link('host-prev','‹',642,341,56,44,()=>state.hostPage--,{disabled:state.hostPage===0,ariaLabel:'Previous host options'});text((state.hostPage+1)+' / '+pages,710,356,11,T.muted,48);link('host-next','›',772,341,56,44,()=>state.hostPage++,{disabled:state.hostPage===pages-1,ariaLabel:'Next host options'});}
  }
  function roster(){
    chrome('PLAYERS');const grouped=gameModeSpec(S.mode).teamBased&&!gameModeSpec(S.mode).cooperative,groups=grouped?(S.mode==='infection'?[['blue','SURVIVORS'],['red','INFECTED']]:[['blue','ALPHA'],['red','BRAVO']]):[['all',gameModeSpec(S.mode).cooperative?'OPERATORS':'PLAYERS']];
    groups.forEach(([team,label],col)=>{const x=24+col*409,w=grouped?388:796,rows=S.roster.filter(p=>team==='all'||p.team===team);text(label,x,65,26,T.text,200,'display');if(S.host&&S.mode!=='infection'&&!gameModeSpec(S.mode).cooperative){link('live-bots-plus-'+team,'+',x+w-105,69,39,44,()=>adapter.liveBots(team,1),{size:24,disabled:rows.filter(p=>p.bot).length>=(grouped?8:16)});text('BOTS',x+w-63,72,10,T.muted,32);link('live-bots-minus-'+team,'−',x+w-32,69,39,44,()=>adapter.liveBots(team,-1),{size:24,disabled:!rows.some(p=>p.bot)});}line(x,116,x+w,116,T.line);rosterRows(rows,team,x,122,w,state.matchPages,{capacity:8,pitch:25});if(!rows.length)text('No players',x+10,122,12,T.muted,w-20);});
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
      ...(S.mode==='infection'?[]:[['pause-loadout','LOADOUT','CURRENT · '+(S.currentClassName||S.className),()=>adapter.openLoadout()]]),
      ['pause-players','PLAYERS','View roster'+(S.canSwitchTeam?' or switch team':''),()=>click('nativePausePlayersBtn')],
      ...(S.canSwitchTeam?[['pause-team','SWITCH TEAM',S.teamSwitchLabel,()=>click('teamSwitchBtn')]]:[]),
      ['pause-invite','INVITE',S.room+' · Copy invite link',()=>click('copyBtn')],
      ['pause-settings','SETTINGS','Controls, audio and display',()=>adapter.openSettings()],
      ...(S.host?[['pause-cheats','HOST OPTIONS','Tuning and player permissions',()=>click('adminBtn')]]:[])
    ];
    entries.forEach(([id,label,sub,action],i)=>{
      const x=310+i%2*264,y=61+Math.floor(i/2)*90;
      button(id,label,x,y,250,82,action,{size:0,ariaLabel:label+': '+sub+(id==='pause-loadout'&&S.queuedClassName?'; Next spawn: '+S.queuedClassName:'')});text(label,x+15,y+17,21,T.text,220,'display');text(sub,x+15,y+(id==='pause-loadout'&&S.queuedClassName?47:51),10,T.muted,220);if(id==='pause-loadout'&&S.queuedClassName)text('NEXT SPAWN · '+S.queuedClassName,x+15,y+63,10,T.accent,220);
    });
    if(S.mode==='infection')wrap('Round gear is chosen during preparation. Infected classes can be changed while respawning.',310,253,514,12,T.muted,3);
    footer();button('pause-resume','RESUME MATCH',16,341,278,43,()=>click('resumeBtn'),{primary:true,size:15});
    button('pause-leave','LEAVE MATCH',574,341,250,43,()=>click('leaveBtn'),{size:12});
  }

  function confirm(){if(!state.pending)return;box(0,0,844,menuH,'rgba(4,9,5,.84)');box(195,106,454,177,'#1c271e',T.line);text('RESTORE DEFAULTS?',218,126,28,T.text,412,'display');wrap('Your current settings will be replaced.',219,169,399,13,T.muted,2);const pending=state.pending;button('confirm-stay','BACK',212,228,112,43,()=>{state.pending=null;state.resetConfirm=false;});button('confirm-reset','RESTORE',452,228,180,43,()=>{pending();state.resetConfirm=false;},{primary:true});}
  function drawLastResults(viewport){
    const result=S.lastResult,model=retainedMatchPresentation(result,{selfId:S.selfId,rounds:INFECTION.rounds}),self=result.players.find(p=>p.id===S.selfId),teamBased=gameModeSpec(result.match.mode).teamBased;
    model.rows=model.rows.map(p=>({...p,color:relationshipColor(relationshipFor({self:p.id===S.selfId,bot:p.bot,viewerTeam:self?.team,actorTeam:p.team,teamBased}))}));
    const focusId=String(ui.activeElement?.dataset?.integratedControl||'').replace('last-result-',''),layout=drawMatchScoreboard(ctx,{...model,w:viewport.width,h:viewport.height,safe:viewport.safe,page:state.resultsPage,controller:S.inputMode==='controller',focusId});
    state.resultsPage=layout.page;state.resultsPages=layout.pageCount;mark(roots.get(screen.id),r(0,0,viewport.width,viewport.height));
    for(const target of layout.hits){const label=target.action==='back'?'Back to lobby':target.direction<0?'Previous results page':'Next results page',action=target.action==='back'?closeResults:()=>{state.resultsPage=clamp(state.resultsPage+target.direction,0,state.resultsPages-1);revision++;},n=node('last-result-'+target.id,label,action,!!target.disabled),rect=r(target.x,target.y,target.w,target.h);n.visualRect=rect;n.dataset.controllerDefault=String(target.action==='back');mark(n,rect);hit(n,rect);if(state.resultsNeedsFocus&&target.action==='back'&&S.inputMode!=='touch')n.focus();}
    state.resultsNeedsFocus=false;
  }
  function draw({context,viewport,screen:root,mark:markNode,hit:hitNode}){if(!['menu','lobbyScreen','loadoutPanel','settingsPanel','adminPanel','pause'].includes(root.id))return false;ctx=context;mark=markNode;hit=hitNode;screen=root;S=adapter.snapshot();railInfo=null;if(!roots.has(screen.id)){const container=ui.createElement('div');container.dataset.integratedMenu='true';screen.append(container);roots.set(screen.id,container);}for(const [key,n]of controls)if(key.startsWith(screen.id+':'))n.hidden=true;
    if(currentScreen!==screen.id){state.pending=null;state.resetConfirm=false;state.peek=null;if(screen.id==='settingsPanel')state.settings='Controls';if(screen.id==='adminPanel'&&currentScreen!=='settingsPanel'){state.cheats=S.adminTab==='players'?'Players':S.adminTab==='advanced'?'Weapons':'Gameplay';adapter.hostBegin();}if(screen.id==='lobbyScreen'&&currentScreen==='menu'){state.page='players';state.edit=state.lastEdit;}if(screen.id==='loadoutPanel'&&currentScreen!=='settingsPanel'){editSection(S.inMatch?'classes':state.lastEdit);}currentScreen=screen.id;}
    if(state.resultsOpen&&(screen.id!=='lobbyScreen'||!S.inLobby||!S.lastResult||state.resultsSessionId!==S.lastResult.sessionId))closeResults();
    if(state.resultsOpen){drawLastResults(viewport);return true;}
    const expanding=screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout';const safe=viewport.safe;scale=Math.min((viewport.width-safe.left-safe.right)/844,(viewport.height-safe.top-safe.bottom)/390);menuH=expanding?Math.max(390,(viewport.height-safe.top-safe.bottom)/scale):390;ox=safe.left+(viewport.width-safe.left-safe.right-844*scale)/2;oy=safe.top+(viewport.height-safe.top-safe.bottom-menuH*scale)/2;box(0,0,viewport.width,viewport.height,T.bg);ctx.save();ctx.translate(ox,oy);ctx.scale(scale,scale);ctx.beginPath();ctx.rect(0,0,844,menuH);ctx.clip();box(0,0,844,menuH,T.bg);const arm=screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout';if(!arm&&screen.id==='lobbyScreen')img('world-'+S.map+'.jpg',0,48,844,286,true,.12);else{const glow=ctx.createLinearGradient(0,0,844,390);glow.addColorStop(0,'#243029');glow.addColorStop(1,T.bg);box(0,48,844,menuH-104,glow);for(let x=140;x<1000;x+=140)line(x,48,x-108,334,'rgba(185,203,137,.055)');}mark(roots.get(screen.id),physical(r(0,0,844,menuH)));
    if(screen.id==='menu')home();else if(screen.id==='settingsPanel')settings();else if(screen.id==='adminPanel')cheats();else if(screen.id==='pause')paused();else{chrome(screen.id==='loadoutPanel'?'ARMORY':'');if(arm)armory();else if(state.page==='players')players();else if(state.page==='match')match();else if(state.page==='map')maps();else if(state.page==='cheats')cheats();}
    if(state.pending){for(const n of controls.values())if(!n.dataset.integratedControl.startsWith('confirm-'))n.disabled=true;confirm();}ctx.restore();return true;}
  function visible(){return !!screen&&!screen.hidden&&!screen.classList.contains('hide')&&!['gameTextEditor','chatComposer','lobbyQuitConfirm','mapDeleteConfirm','connectionOverlay','entryScreen','rotateGate'].some(id=>{const n=ui.getElementById(id);return n&&!n.hidden&&!n.classList.contains('hide');});}
  function cycle(direction){if(!visible())return false;if(state.resultsOpen){state.resultsPage=clamp(state.resultsPage+direction,0,state.resultsPages-1);revision++;return true;}if(screen.id==='loadoutPanel'){if(['classes','streaks'].includes(state.edit))return false;const tabs=['primary','secondary','tactical','lethal'];editSection(tabs[(tabs.indexOf(state.edit)+direction+tabs.length)%tabs.length]);return true;}if(screen.id==='lobbyScreen'){const tabs=['players','match','map','loadout',...(S.host?['cheats']:[])];go(tabs[(tabs.indexOf(state.page)+direction+tabs.length)%tabs.length]);return true;}if(screen.id==='settingsPanel'){const tabs=['Controls','Audio','Display','Diagnostics'];state.settings=tabs[(tabs.indexOf(state.settings)+direction+tabs.length)%tabs.length];return true;}return false;}
  function controllerPreview(frame,dt){if(state.resultsOpen)return false;if(!visible()||!['primary','secondary','tactical','lethal'].includes(state.edit)||!(screen.id==='loadoutPanel'||screen.id==='lobbyScreen'&&state.page==='loadout'))return false;const seconds=clamp(Number(dt)||0,0,.1);preview.rotate((Number(frame.lookX)||0)*200*seconds,(Number(frame.lookY)||0)*140*seconds);preview.zoom(((Number(frame.buttons?.[7])||0)-(Number(frame.buttons?.[6])||0))*.65*seconds);return true;}
  return {draw,state,cycle,openResults,closeResults,controllerPreview,moveRailFocus,get revision(){return revision;},active:visible,back(){if(!visible())return false;state.peek=null;if(screen?.id==='menu')return false;back();return true;}};
}
