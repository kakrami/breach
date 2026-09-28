import {APP_VERSION} from './game-config.js?v=1.72.0';
import {createBuilderHUD} from './builder-hud.js?v=1.72.0';
import {BUILDING_ASSETS,PROP_ASSETS,resolveAsset,assetResizeMode} from './object-catalog.js?v=1.72.0';
import {createAuthoredWorldGeometry} from './authored-world-geometry.js?v=1.72.0';
import {createAuthoredWorldCollision} from './authored-world-collision.js?v=1.72.0';
import {GAMEPAD_BUTTON as B} from './gamepad-input.js?v=1.72.0';
const rad=d=>d*Math.PI/180,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const WALK_ITEMS=Object.freeze([
 {key:'house',label:'House',group:'Buildings',type:'building',archetype:'rowhouse',...BUILDING_ASSETS.rowhouse,label:'House'},
 {key:'garage',label:'Garage',group:'Buildings',type:'building',archetype:'garage',...BUILDING_ASSETS.garage},
 {key:'warehouse',label:'Warehouse',group:'Buildings',type:'building',archetype:'warehouse',...BUILDING_ASSETS.warehouse},
 {key:'office',label:'Office',group:'Buildings',type:'building',archetype:'office',...BUILDING_ASSETS.office},
 {key:'wall',label:'Wall',group:'Pieces',type:'prop',kind:'barrier',w:4,d:.4,h:3.1},
 {key:'floor',label:'Floor',group:'Pieces',type:'prop',kind:'concrete',w:4,d:4,h:.2},
 {key:'block',label:'Block',group:'Pieces',type:'prop',kind:'crate',w:4,d:4,h:3.1},
 {key:'stairs',label:'Stairs',group:'Pieces',type:'elevation',kind:'stairs',w:3,d:6.35,rise:3.1},
 {key:'ramp',label:'Ramp',group:'Pieces',type:'elevation',kind:'ramp',w:4,d:8,rise:3.1},
 {key:'bridge',label:'Bridge',group:'Pieces',type:'elevation',kind:'overpass',w:8,d:12,rise:3.1},
 {key:'broken',label:'Broken wall',group:'Pieces',type:'prop',kind:'brokenWall',...PROP_ASSETS.brokenwall},
 {key:'ruins',label:'Ruins',group:'Pieces',type:'prop',kind:'ruins',w:8,d:7,h:3.1},
 {key:'doorway',label:'Doorway',group:'Pieces',type:'prop',kind:'doorway',w:4,d:.5,h:3.1},
 {key:'window',label:'Window wall',group:'Pieces',type:'prop',kind:'windowWall',w:4,d:.5,h:3.1},
 {key:'pillar',label:'Pillar',group:'Pieces',type:'prop',kind:'pillar',w:1,d:1,h:3.1},
 {key:'crate',label:'Crate',group:'Cover',type:'prop',kind:'crate',w:2,d:2,h:1.5},
 {key:'sandbag',label:'Sandbags',group:'Cover',type:'prop',kind:'sandbag',...PROP_ASSETS.sandbag},
 {key:'car',label:'Car',group:'Cover',type:'prop',kind:'burntCar',...PROP_ASSETS.car,label:'Car'},
 {key:'container',label:'Container',group:'Cover',type:'prop',kind:'containerBlue',w:12,d:3.2,h:2.85},
 {key:'tree',label:'Tree',group:'Nature',type:'natural',kind:'tree',r:.8,h:7.8},
 {key:'rock',label:'Rock',group:'Nature',type:'natural',kind:'rock',r:2,h:2.4},
 {key:'bush',label:'Bush',group:'Nature',type:'natural',kind:'bush',r:1.7,h:1.5},
 ...Object.entries(BUILDING_ASSETS).filter(([key])=>!['rowhouse','garage','warehouse','office'].includes(key)).map(([key,value])=>({key,label:value.label,group:'Buildings',type:'building',...resolveAsset({archetype:key},'building')})),
 ...Object.entries(PROP_ASSETS).filter(([key])=>!['ruins','doorway','windowWall','crate','barrier','pillar','container','car','brokenwall','sandbag'].includes(key)).map(([key,value])=>({key,label:value.label,group:'Cover',type:'prop',...resolveAsset({kind:key},'prop')})),
]);
export function rayBox(origin,dir,p,max=60){
 const a=rad(p.rot||0),c=Math.cos(a),s=Math.sin(a),dx=origin.x-p.x,dz=origin.z-p.z;
 const o=[dx*c+dz*s,origin.y,-dx*s+dz*c],d=[dir.x*c+dir.z*s,dir.y,-dir.x*s+dir.z*c];
 const lo=[-p.w/2,p.minY??p.bottomY,-p.d/2],hi=[p.w/2,p.maxY??p.topY,p.d/2];let near=0,far=max,axis=-1,sign=0;
 for(let i=0;i<3;i++){if(Math.abs(d[i])<1e-9){if(o[i]<lo[i]||o[i]>hi[i])return null;continue;}let t0=(lo[i]-o[i])/d[i],t1=(hi[i]-o[i])/d[i],n=-1;if(t0>t1){[t0,t1]=[t1,t0];n=1;}if(t0>near){near=t0;axis=i;sign=n;}far=Math.min(far,t1);if(near>far)return null;}
 if(axis<0||near<.02||near>max)return null;const n=[0,0,0];n[axis]=sign;
 return {t:near,x:origin.x+dir.x*near,y:origin.y+dir.y*near,z:origin.z+dir.z*near,nx:n[0]*c-n[2]*s,ny:n[1],nz:n[0]*s+n[2]*c};
}
function boxFor(p){if(p.type==='round')return {...p,w:p.r*2,d:p.r*2};return p;}
export function boxesOverlap(a,b,skin=.045){
 if((a.maxY??a.topY)<=(b.minY??b.bottomY)+skin||(b.maxY??b.topY)<=(a.minY??a.bottomY)+skin)return false;
 const aa=rad(a.rot||0),ba=rad(b.rot||0),axes=[[Math.cos(aa),Math.sin(aa)],[-Math.sin(aa),Math.cos(aa)],[Math.cos(ba),Math.sin(ba)],[-Math.sin(ba),Math.cos(ba)]];
 for(const [x,z]of axes){const ar=Math.abs(x*Math.cos(aa)+z*Math.sin(aa))*a.w/2+Math.abs(-x*Math.sin(aa)+z*Math.cos(aa))*a.d/2,br=Math.abs(x*Math.cos(ba)+z*Math.sin(ba))*b.w/2+Math.abs(-x*Math.sin(ba)+z*Math.cos(ba))*b.d/2;if(Math.abs((a.x-b.x)*x+(a.z-b.z)*z)>=ar+br-skin)return false;}return true;
}
export function createWalkBuilder({editor:e,root,add,remove,patch,makeId,prepareStarts,isActive,createHUD=createBuilderHUD}){
 const $=id=>root.getElementById(id),app=root.querySelector('.app');
 const state={building:false,overview:false,item:WALK_ITEMS[0],rot:0,mode:'place',selectedId:null,brush:'raise',target:null,ghost:null,key:'',lift:0,menu:false,copy:null,moveId:null,parts:[],valid:false,reason:'Aim at the ground',revision:-1,eye:1.65,velocity:0,jumpHeld:false};
 app.classList.add('simple-builder');
 // The visible interface is painted once into a canvas. Native controls remain
 // only for text/files, accessibility and the retained specialist editor panels.
 const place={textContent:'Place',disabled:true};let hud=null;
 state.panel=null;state.page=0;state.tool='select';state.tip='';
 const menuItems=[['pick','Objects'],['select','Select'],['terrain','Terrain'],['save','Save'],['publish','Publish'],['check','Map Check'],['rename','Rename'],['download','Export'],['import','Import'],['restore','Restore autosave'],['roads','Roads'],['setup','Starts & ladders'],['paint','Paint ground'],['weather','Light & weather'],['layers','Layers'],['prefabs','Saved groups'],['snap','Snap settings'],['settings','Map options'],['debug-player','Player collision'],['debug-projectile','Shot collision'],['debug-off','Hide collision'],['help','Controls'],['exit','Back to maps']];
 function panelModel(){
  if(!state.panel)return null;
  if(state.panel==='objects')return {title:'Objects',items:[...['Buildings','Pieces','Cover','Nature'].map(g=>({id:'group:'+g,label:g,selected:group===g})),...WALK_ITEMS.filter(i=>i.group===group).map(i=>({id:'item:'+i.key,label:i.label,thumbnail:thumbnail(i),selected:state.item.key===i.key})),{id:'all-objects',label:'More objects'}]};
  if(state.panel==='terrain')return {title:'Terrain',items:[...['raise','lower','smooth','flatten'].map(b=>({id:b,label:b[0].toUpperCase()+b.slice(1),selected:state.brush===b})),{id:'brush-small',label:'Small brush'},{id:'brush-large',label:'Large brush'},{id:'paint',label:'Paint ground'}]};
  if(state.panel==='transform')return {title:'Transform',items:[['move','Move with aim'],['copy','Copy'],['erase','Delete'],['rotate','Rotate 90°'],['turn-left','Rotate −15°'],['turn-right','Rotate +15°'],['raise-object','Object up'],['lower-object','Object down'],['edit',assetResizeMode(e.doc.get(state.selectedId))==='parametric'?'Size & properties':'Properties']].map(([id,label])=>({id,label}))};
  return {title:'Map · '+APP_VERSION,items:menuItems.map(([id,label])=>({id,label}))};
 }
 function renderHUD(){hud?.render();}
 function hudModel(){return {vertical:e.doc?.get(state.selectedId)?.type!=='natural',gizmo:gizmoModel(),resizable:assetResizeMode(e.doc?.get(state.selectedId))==='parametric',building:state.building,overview:state.overview,tool:state.mode==='terrain'?'terrain':state.tool,item:state.mode==='place'?state.item.key:null,selected:!!state.selectedId,pending:!!state.copy,tip:state.tip,primary:place.textContent,valid:!place.disabled,undo:(state.building||state.overview)&&!!e.commands.undoStack?.length,redo:(state.building||state.overview)&&!!e.commands.redoStack?.length,snap:e.snapConfig?.grid!==false,panel:panelModel(),page:state.page,hotbar:['house','wall','floor','stairs','crate'].map(k=>{const i=WALK_ITEMS.find(i=>i.key===k);return {...i,thumbnail:thumbnail(i)}})};}
 let transformStart=null;
 function gizmoModel(){
  const o=state.ghost?.object||e.doc?.get(state.selectedId);if(!o||!state.selectedId||!state.building||state.overview||state.menu||!e.gameRuntime?.project)return null;
  const ground=e.runtimePhysical().geometry.terrainHeight(o.x,o.z),p={x:o.x,y:ground+(o.yOffset||0)+Math.min(2,(o.h||o.rise||3)/2),z:o.z},origin=e.gameRuntime.project(p);if(!origin)return null;
  const length=Math.max(2,Math.min(5,Math.hypot(e.play.x-p.x,e.play.z-p.z)*.18));
  if(state.tool==='rotate-tool')return {origin,axes:[{axis:'rotation',label:'Rotate',color:'#f4c15a',length:1,end:{x:origin.x+60,y:origin.y-40}}]};
  const resizing=state.tool==='scale-tool';return {origin,axes:[['x',resizing?'Width':'X','#ed6969'],['y',resizing?'Height':'Y','#72d79a'],['z',resizing?'Depth':'Z','#79b9ff']].filter(([axis])=>!resizing||axis!=='y'||o.type!=='building').map(([axis,label,color])=>({axis:resizing?'size-'+axis:axis,label,color,length,end:e.gameRuntime.project({...p,[axis]:p[axis]+length})})).filter(a=>a.end)};
 }
 function transform(phase,axis,delta){
  if(phase==='start'){const o=e.doc.get(state.selectedId);if(!o||axis.startsWith('size-')&&assetResizeMode(o)!=='parametric')return;const tool=state.tool;beginEdit(o,true);state.tool=tool;transformStart={...o};state.transforming=true;state.fixedPosition={...o};state.key='';return;}
  if(!transformStart)return;
  if(phase==='cancel'){transformStart=null;state.transforming=false;cancelEdit();return;}
  if(phase==='end'){update();const valid=state.valid;transformStart=null;state.transforming=false;if(valid)commit();else{cancelEdit();setTip('Move blocked · object kept in its original position');}return;}
  const step=e.snapConfig?.grid===false?.05:(e.snapConfig?.gridSize||1),amount=Math.round(delta/step)*step;
  state.fixedPosition={...transformStart};if(axis==='rotation'){const angle=e.snapConfig?.grid===false?1:(e.snapConfig?.angle||15);state.rot=(transformStart.rot||0)+Math.round(delta/angle)*angle;}
  else if(axis.startsWith('size-')){const field=axis==='size-x'?'w':axis==='size-z'?'d':transformStart.type==='elevation'?'rise':'h';state.fixedPosition[field]=clamp(transformStart[field]+amount*2,1,80);}
  else if(axis==='y')state.fixedPosition.yOffset=clamp((transformStart.yOffset||0)+amount,0,20);
  else state.fixedPosition[axis]=transformStart[axis]+amount;
  state.key='';update();
 }
 const thumbs=new Map();
 function thumbnail(item){if(thumbs.has(item.key))return thumbs.get(item.key);const canvas=document.createElement('canvas');canvas.width=144;canvas.height=112;const ctx=canvas.getContext('2d');const o={...item,x:0,z:0,rot:0,yOffset:0},g=compileObject(o),parts=objectParts(g,o),polys=[];const project=(x,y,z)=>[72+(x-z)*2.5,88+(x+z)*1.15-y*3.8];let all=[];
  for(const src of parts){const p=boxFor(src);if(!p.w||!p.d)continue;const y=p.minY??p.bottomY,h=p.maxY??p.topY;const v=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>[p.x+x*p.w/2,p.z+z*p.d/2]);for(const [ids,color] of [[[0,1,2,3],'#89adbc'],[[0,1,5,4],'#547c91'],[[1,2,6,5],'#355d71']]){const points=ids.map(i=>{const q=v[i%4];return project(q[0],i<4?h:y,q[1]);});polys.push({points,color,depth:p.x+p.z+y*.05});all.push(...points);}}
  if(all.length){const minX=Math.min(...all.map(p=>p[0])),maxX=Math.max(...all.map(p=>p[0])),minY=Math.min(...all.map(p=>p[1])),maxY=Math.max(...all.map(p=>p[1])),s=Math.min(128/(maxX-minX||1),96/(maxY-minY||1));ctx.translate(72,56);ctx.scale(s,s);ctx.translate(-(minX+maxX)/2,-(minY+maxY)/2);for(const poly of polys.sort((a,b)=>a.depth-b.depth)){ctx.beginPath();poly.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=poly.color;ctx.fill();ctx.strokeStyle='#243f53';ctx.lineWidth=.5/s;ctx.stroke();}}
  const url=canvas.toDataURL();thumbs.set(item.key,url);return url;}
 function compileObject(o){return createAuthoredWorldGeometry({terrain:{preset:'flat'},[o.type==='building'?'buildings':o.type==='elevation'?'elevationObjects':o.type==='natural'?'naturalObstacles':'staticBoxes']:[o.type==='natural'?{...o,type:o.kind}:o]});}
 function objectParts(g,o){return o.type==='building'?g.BUILDING_GEOMETRY[0].parts:o.type==='elevation'?g.ELEVATION_GEOMETRY[0].parts:o.type==='natural'?g.NATURAL_PLAYER_COLLIDERS:g.STATIC_PARTS;}
 let group='Buildings';
 function choose(item){state.item=item;state.fixedPosition=null;state.selectedId=null;state.mode='place';state.tool='select';state.copy=null;state.moveId=null;state.key='';closePanels();sync();}
 function sync(){app.classList.toggle('walk-active',!!e.doc&&!state.overview);app.classList.toggle('walk-overhead',state.overview);app.classList.toggle('walk-testing',!state.building&&!state.overview);renderHUD();}
 function setTip(text){state.tip=state.issue||text;renderHUD();}
 function closePanels(){state.lift=0;state.controllerLift=0;e.gameRuntime?.pauseInput();state.panel=null;state.page=0;state.menu=false;e.play.keys.clear();e.play.moveX=e.play.moveY=0;renderHUD();}
 function openPanel(panel){closePanels();state.panel=panel;state.menu=true;renderHUD();}
 function enter(){if(!e.doc)return;state.selectedId=null;state.fixedPosition=null;state.revision=-1;state.issue='';state.eye=1.65;state.velocity=0;state.overview=false;state.building=true;state.key='';state.moveId=null;state.copy=null;state.mode='place';closePanels();e.startPlay();if(!e.doc.buildings.length&&!e.doc.props.length){e.play.x=0;e.play.z=12;e.play.y=1.65;}e.play.pitch=-.22;e.gameRuntime?.teleport(e.play);sync();}
 function exit(){state.selectedId=null;state.fixedPosition=null;state.moveId=null;state.copy=null;state.building=false;state.overview=false;state.ghost=null;closePanels();app.classList.remove('walk-active','walk-overhead');}
 function toggleTest(){cancelEdit();if(state.overview){state.overview=false;state.building=true;e.startPlay();}state.building=!state.building;setTip(state.building?'Aim where you want to build':'Walk around to try your map');state.key='';closePanels();if(!state.building){prepareStarts();const g=e.runtimePhysical().geometry,c=e.runtimePhysical().collision;let y=g.worldSupportHeight(e.play.x,e.play.z,e.play.y-1.65,false);if(c.worldBlockedAt(e.play.x,e.play.z,y)){const s=e.doc.spawns[0];if(s){e.play.x=s.x;e.play.z=s.z;y=g.terrainHeight(s.x,s.z);}}e.play.y=y+1.65;state.eye=1.65;state.velocity=0;}else{e.play.y+=1.65-state.eye;state.eye=1.65;}e.gameRuntime?.teleport(e.play);sync();}
 function overview(){closePanels();if(state.overview){state.overview=false;state.building=true;const pose=state.overheadPose;e.startPlay();if(pose){Object.assign(e.play,pose);e.gameRuntime?.teleport(e.play);}state.overheadPose=null;}else{state.overheadPose={x:e.play.x,y:e.play.y,z:e.play.z,yaw:e.play.yaw,pitch:e.play.pitch};state.overview=true;state.building=false;e.stopPlay();$('view2d').click();}sync();}
 function overheadTool(mode){closePanels();if(!state.overview)overview();e.setMode(mode);}
 function objectHeight(delta){const o=e.doc.get(state.selectedId);if(!o||o.type==='natural')return;if(state.mode!=='place'||state.moveId!==o.id){beginEdit(o,true);state.fixedPosition={...o};}state.fixedPosition.yOffset=clamp((state.fixedPosition.yOffset||0)+delta,0,20);state.key='';sync();}

 function cancelEdit(){state.transforming=false;transformStart=null;state.fixedPosition=null;state.moveId=null;state.copy=null;state.mode='select';state.key='';state.ghost=null;sync();}
 function beginEdit(o,move){state.tool=move?'move':'select';state.fixedPosition=null;state.copy={...o,key:o.id,label:o.type==='building'?'Building':'Object'};state.moveId=move?o.id:null;state.rot=o.rot||0;state.mode='place';state.key='';sync();}
 function action(name){if(!e.doc||!name)return;if(state.copy&&['overview','test','playtest','save','publish','download','import','restore','exit'].includes(name)){closePanels();setTip('Apply or Cancel this edit first');return;}
  if(name.startsWith('axis-')){const axis=name.slice(5);transform('start',axis,0);transform('move',axis,axis==='rotation'?15:1);transform('end',axis,0);return;}
  if(['pick','terrain','select'].includes(name)&&!state.building){state.overview?overview():toggleTest();}
  if(name==='previous'||name==='next'){state.page=Math.max(0,state.page+(name==='next'?1:-1));renderHUD();return;}
  if(name.startsWith('group:')){group=name.slice(6);state.page=0;renderHUD();return;}
  if(name.startsWith('item:')){const item=WALK_ITEMS.find(i=>i.key===name.slice(5));if(item)choose(item);return;}
  if(name==='build'){if(!state.building){state.overview?overview():toggleTest();}return;}
  if(name==='playtest'){if(state.building||state.overview)toggleTest();return;}
  if(name==='snap-toggle'){if(e.snapConfig)e.snapConfig.grid=!e.snapConfig.grid;state.key='';renderHUD();return;}
  if(name.startsWith('debug-')){e.gameRuntime?.debugCollision?.(name.slice(6));closePanels();return;}
  if(name==='rotate-tool'||name==='scale-tool'){if(state.selectedId&&(name!=='scale-tool'||assetResizeMode(e.doc.get(state.selectedId))==='parametric')){cancelEdit();state.tool=name;state.mode='select';state.key='';sync();}return;}
  if(name==='brush-small'||name==='brush-large'){state.brushRadius=name==='brush-small'?6:12;closePanels();return;}
  if(name==='fly-step-up'||name==='fly-step-down'){if(state.building){e.play.y+=name==='fly-step-up'?1:-1;e.gameRuntime?.teleport(e.play);}return;}
  if(state.panel&&!['menu','pick','close'].includes(name))closePanels();
  if(name==='turn-left'||name==='turn-right'){const o=e.doc.get(state.selectedId);if(o){if(!state.copy)beginEdit(o,true);state.fixedPosition={...(state.fixedPosition||o)};state.rot=(state.rot+(name==='turn-left'?-15:15)+360)%360;state.key='';sync();}return;}
  
  const modes={'all-objects':'build',roads:'roads',setup:'gameplay',paint:'environment'};
  if(modes[name]){overheadTool(modes[name]);return;}
  const menus={weather:'menuLook',snap:'menuSnapping',layers:'menuLayers',prefabs:'menuPrefabs',settings:'menuSettings'};
  if(menus[name]){if(name==='layers'||name==='prefabs')overheadTool('select');else closePanels();$(menus[name]).click();return;}
  if(name==='check'){closePanels();e.showChecks();return;}
  if(name==='fit'){overheadTool('select');e.fit();return;}
  if(name==='edit'){const id=state.selectedId;if(!id)return;closePanels();e.selected=new Set([id]);e.syncUI();e.renderEdit();return;}
  if(name==='raise-object'||name==='lower-object'){if(state.building)objectHeight(name==='raise-object'?1:-1);return;}
  if(name==='cancel'){cancelEdit();return;}
  if(name==='select'){closePanels();cancelEdit();state.selectedId=null;state.tool='select';sync();return;}
  if(name==='terrain'){if(e.layerLocked?.('terrain')){setTip('Unlock Terrain in Layers first');return;}cancelEdit();state.mode='terrain';state.selectedId=null;state.tool='terrain';openPanel('terrain');sync();return;}
  if(['raise','lower','smooth','flatten'].includes(name)){state.brush=name;state.mode='terrain';state.key='';closePanels();sync();return;}
if(['place','rotate','erase','move','copy','undo','redo','pick'].includes(name))state.issue='';
  if(name==='pick'){state.panel==='objects'?closePanels():openPanel('objects');return;}
  if(name==='close'){closePanels();return;}
  if(name==='menu'){state.panel==='menu'?closePanels():openPanel('menu');return;}
  if(name==='overview'){overview();return;}if(name==='test'){toggleTest();return;}if(name==='exit'){$('backToGameBtn').click();return;}if(name==='save'){$('saveServerBtn').click();return;}if(name==='publish'){prepareStarts();$('publishServerBtn').click();return;}if(name==='download'){prepareStarts();e.download();return;}if(name==='import'){$('fileInput').click();closePanels();return;}if(name==='restore'){$('menuRestore').click();closePanels();return;}if(name==='rename'){const name=window.prompt('Map name',e.doc.meta.name);if(name?.trim()){const before=e.doc.meta.name,after=name.trim().slice(0,64);e.commands.execute({do:()=>{e.doc.meta.name=after},undo:()=>{e.doc.meta.name=before}});}closePanels();return;}if(name==='help'){setTip('Build: WASD fly · Space up · C down · RB/LB up/down · E place/select · R rotate · Q objects · Test uses normal game movement');closePanels();return;}if(name==='undo'||name==='redo'){if(!state.building&&!state.overview)return;e.commands[name]();cancelEdit();if(state.selectedId&&(!e.doc.get(state.selectedId)||e.layerLocked?.(e.layerFor(e.doc.get(state.selectedId)))))state.selectedId=null;sync();return;}if(!state.building)return;
  if(['move','copy','erase','rotate'].includes(name)&&state.selectedId&&state.mode==='select'){const o=e.doc.get(state.selectedId);if(!o){state.selectedId=null;return;}if(name==='erase'){remove(o.id);state.selectedId=null;state.key='';return;}beginEdit(o,name!=='copy');if(name==='rotate'){state.rot=(state.rot+90)%360;state.fixedPosition={...o};}return;}
  if(name==='rotate'){state.rot=(state.rot+90)%360;state.key='';return;}
  if(['erase','move','copy'].includes(name)){state.mode=state.mode===name?'place':name;state.moveId=null;state.copy=null;state.key='';sync();return;}
  if(name==='place')commit();
 }
 hud=createHUD({stage:$('stage'),active:()=>isActive()&&!!e.doc,model:hudModel,action,lift:value=>{state.lift=state.building&&!state.menu?value:0;},pause:()=>e.gameRuntime?.pauseInput(),transform});
 function sceneObjects(){const runtime=e.runtimePhysical(),g=runtime.geometry,objects=[];e.doc.buildings.forEach((o,i)=>objects.push({o,parts:g.BUILDING_GEOMETRY[i]?.parts||[]}));e.doc.props.forEach((o,i)=>objects.push({o,parts:g.STATIC_GEOMETRY[i]?.parts||[]}));e.doc.elevation.forEach((o,i)=>objects.push({o,parts:g.ELEVATION_GEOMETRY[i]?.parts||[]}));e.doc.naturals.forEach((o,i)=>objects.push({o,parts:[g.NATURAL_PLAYER_COLLIDERS[i]].filter(Boolean)}));return objects;}
 function aim(){const cam=e.play,cp=Math.cos(cam.pitch),dir={x:Math.sin(cam.yaw)*cp,y:Math.sin(cam.pitch),z:-Math.cos(cam.yaw)*cp},g=e.runtimePhysical().geometry;let best=null;
  for(const entry of state.parts){if(entry.o.id===state.moveId)continue;for(const part of entry.parts){const p=boxFor(part);if(part.decorative||!p.w||!p.d)continue;const hit=rayBox(cam,dir,p,best?.t||60);if(hit)best={...hit,object:entry.o};}}
  let previous=0;for(let t=.25;t<=Math.min(best?.t||60,60);t+=.25){const x=cam.x+dir.x*t,z=cam.z+dir.z*t,y=cam.y+dir.y*t;if(y<=g.terrainHeight(x,z)){let lo=previous,hi=t;for(let n=0;n<8;n++){const mid=(lo+hi)/2;if(cam.y+dir.y*mid<=g.terrainHeight(cam.x+dir.x*mid,cam.z+dir.z*mid))hi=mid;else lo=mid;}const h=(lo+hi)/2;best={x:cam.x+dir.x*h,y:g.terrainHeight(cam.x+dir.x*h,cam.z+dir.z*h),z:cam.z+dir.z*h,t:h,nx:0,ny:1,nz:0,object:null};break;}previous=t;}
  return best;
 }
 function update(){if(!e.doc||!e.play.active||!state.building)return;if(state.revision!==e.sceneRev){state.parts=sceneObjects();state.revision=e.sceneRev;state.key='';}if(state.selectedId&&(!e.doc.get(state.selectedId)||e.layerLocked?.(e.layerFor(e.doc.get(state.selectedId))))){state.selectedId=null;sync();}state.target=aim();const hit=state.fixedPosition?{x:state.fixedPosition.x,z:state.fixedPosition.z,y:e.runtimePhysical().geometry.terrainHeight(state.fixedPosition.x,state.fixedPosition.z)+(state.fixedPosition.yOffset||0),ny:1,nx:0,nz:0,object:state.fixedPosition}:state.target;
  if(state.mode==='terrain'){const key='ground|'+[e.sceneRev,state.brush,hit?.x?.toFixed(2),hit?.z?.toFixed(2),hit?.object?.id].join('|');if(key!==state.key){state.key=key;state.ghost=hit&&!hit.object?{parts:[{x:hit.x,z:hit.z,w:(state.brushRadius||12)*2,d:(state.brushRadius||12)*2,minY:hit.y+.03,maxY:hit.y+.06}]}:null;}state.valid=!!hit&&!hit.object;place.disabled=!state.valid;place.textContent={raise:'Raise',lower:'Lower',smooth:'Smooth',flatten:'Flatten'}[state.brush];setTip(state.valid?'Aim at open ground · buildings stay protected':'Aim at open ground');return;}
  if(state.mode==='select'){const o=e.doc.get(state.selectedId),key='select|'+(o?.id||hit?.object?.id||'')+'|'+e.sceneRev;if(key!==state.key){state.key=key;state.ghost=(o||hit?.object)?{parts:state.parts.find(p=>p.o.id===(o||hit.object).id)?.parts||[]}:null;}state.valid=!!(o||hit?.object);place.disabled=!hit?.object;place.textContent='Select';setTip(o?'Selected · Move, Rotate, Copy or Delete':hit?.object?'Select this object':'Aim at an object');return;}

  if(state.mode!=='place'){const key='target|'+(hit?.object?.id||'')+'|'+state.mode+'|'+e.sceneRev;if(state.key!==key){state.key=key;state.ghost=hit?.object?{parts:state.parts.find(p=>p.o.id===hit.object.id)?.parts||[]}:null;}state.valid=!!hit?.object;place.disabled=!state.valid;place.textContent={erase:'Erase',move:'Move',copy:'Copy'}[state.mode];setTip(hit?.object?`${place.textContent} this ${hit.object.type==='building'?'building':'object'}`:'Aim at an object');return;}
  place.textContent=state.moveId?(state.fixedPosition?'Apply':'Place here'):'Place';if(!hit){state.ghost=null;state.valid=false;place.disabled=true;setTip('Look down to find a place');return;}
  const src=state.fixedPosition?{...state.copy,...state.fixedPosition}:state.copy||state.item,h=src.h??src.rise??((src.levels||1)*(src.floorH||1)),w=src.w||src.r*2,d=src.d||src.r*2,a=rad(state.rot),nx=hit.nx,nz=hit.nz,extent=(Math.abs(nx*Math.cos(a)+nz*Math.sin(a))*w+Math.abs(-nx*Math.sin(a)+nz*Math.cos(a))*d)/2;
  let x=hit.x+nx*(extent+.04),z=hit.z+nz*(extent+.04),base=hit.y;if(hit.ny===0)base=hit.object?e.runtimePhysical().geometry.terrainHeight(hit.object.x,hit.object.z)+(hit.object.yOffset||0):hit.y;if(hit.ny<0)base=hit.y-h;
  const step=e.snapConfig?.grid===false?.01:(e.snapConfig?.gridSize||1),snap=v=>Math.round(v/step)*step;if(hit.ny!==0){x=snap(x);z=snap(z);}else{const tx=-nz,tz=nx,t=snap(x*tx+z*tz),n=x*nx+z*nz;x=nx*n+tx*t;z=nz*n+tz*t;}base=Math.round(base*1000)/1000;if(state.fixedPosition){x=state.fixedPosition.x;z=state.fixedPosition.z;}
  const key=[e.sceneRev,src.key||src.id,state.rot,x,z,base,state.fixedPosition?.yOffset||0,state.moveId].join('|');if(key===state.key){renderHUD();return;}state.key=key;
  const ground=e.runtimePhysical().geometry.terrainHeight(x,z),o={...src,id:state.moveId||'walk-preview',x,z,rot:state.rot,yOffset:state.fixedPosition?state.fixedPosition.yOffset||0:hit.object?base-ground:0};delete o.groupId;
  if(o.type==='natural'&&Math.abs(base-ground)>.25){state.ghost=null;state.valid=false;place.disabled=true;setTip('Put nature on the ground');return;}
  const candidate=e.previewObject?.(o,state.moveId),preview=candidate?.geometry||compileObject({...o,yOffset:base}),parts=candidate?.parts||objectParts(preview,o);state.ghost={object:o,parts};state.valid=true;state.reason='';
  if(Math.abs(x)+Math.hypot(w,d)/2>e.doc.arenaLimit-2||Math.abs(z)+Math.hypot(w,d)/2>e.doc.arenaLimit-2){state.valid=false;state.reason='Move away from the edge';}
  if(o.yOffset>20||o.yOffset<-.1){state.valid=false;state.reason='Choose a lower spot';}
  if(!state.moveId&&state.parts.length>=160){state.valid=false;state.reason='Map is full · remove something first';}
  if(!hit.object&&o.type!=='natural'){const terrain=e.runtimePhysical().geometry.terrainHeight,hs=[];for(const u of [-.5,0,.5])for(const v of [-.5,0,.5])hs.push(terrain(x+u*w*Math.cos(a)-v*d*Math.sin(a),z+u*w*Math.sin(a)+v*d*Math.cos(a)));if(Math.max(...hs)-Math.min(...hs)>2){state.valid=false;state.reason='Choose flatter ground or use Smooth first';}}
  if(state.valid){outer:for(const group of state.parts){if(group.o.id===state.moveId)continue;for(const pa of parts){if(pa.decorative)continue;for(const pb of group.parts){if(pb.decorative)continue;if(boxesOverlap(boxFor(pa),boxFor(pb))){state.valid=false;state.reason='Give it a little more room';break outer;}}}}}
  if(state.valid&&createAuthoredWorldCollision(preview).worldBlockedAt(e.play.x,e.play.z,e.play.feetY??e.play.y-1.7,e.play.bodyHeight??1.7,.38)){state.valid=false;state.reason='Take a step back';}
  place.disabled=!state.valid;setTip(state.valid?`${src.label||'Object'} · ready to place`:state.reason);
 }
 function commit(){if(state.menu||!state.building)return;if(state.target?.object&&e.layerLocked?.(e.layerFor(state.target.object))&&state.mode!=='place'){setTip('This object is on a locked layer');return;}update();if(state.mode==='terrain'){if(state.valid){const n=e.shapeGround(state.target.x,state.target.z,state.brush,state.brushRadius||12);if(!n)setTip('This ground is protected or has reached its safe limit');state.key='';}return;}if(state.mode==='select'){state.selectedId=state.target?.object?.id||null;state.key='';sync();return;}if(state.mode!=='place'){const o=state.target?.object;if(!o)return;if(state.mode==='erase'){remove(o.id);state.key='';return;}state.copy={...o,key:o.id,label:o.type==='building'?'Building':'Object'};state.moveId=state.mode==='move'?o.id:null;state.rot=o.rot||0;state.mode='place';state.key='';sync();return;}
  if(!state.valid||!state.ghost)return;const o={...state.ghost.object,id:state.moveId||makeId(state.ghost.object.type)};for(const k of ['key','group','label','icon'])delete o[k];if(state.moveId){const before=e.doc.get(state.moveId);patch(before,o);state.selectedId=o.id;state.fixedPosition=null;state.moveId=null;state.copy=null;state.mode='select';}else {add(o);if(state.copy){state.selectedId=o.id;state.copy=null;state.mode='select';}}state.key='';sync();
 }
 function draw(renderer){if(!state.building||state.menu||!state.ghost)return;let mesh=state.ghost.mesh;if(!mesh){const pos=[],col=[],color=state.mode==='erase'?'#ff647d':state.valid?'#55edbd':'#ff647d';for(const part of state.ghost.parts){const p=boxFor(part),y=p.minY??p.bottomY,h=(p.maxY??p.topY)-y;if(h>0){if(part.type==='round')renderer.round(pos,col,part,y,h,color);else renderer.box(pos,col,p,y,h,color);}}for(let i=3;i<col.length;i+=4)col[i]=.38;mesh=state.ghost.mesh={pos:new Float32Array(pos),col:new Float32Array(col),count:pos.length/3};}const gl=renderer.gl;gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);renderer.drawGeometry(mesh.pos,mesh.col,mesh.count,true);gl.depthMask(true);gl.disable(gl.BLEND);}
 function key(ev){if(!isActive()||!e.doc||!e.play.active&&!state.overview)return false;const nativePanel=root.querySelector('.overlay:not(.hide),.drawer:not(.hide)');if(nativePanel){if(ev.key==='Escape'){nativePanel.classList.add('hide');e.gameRuntime?.pauseInput();return true;}return false;}if((root.activeElement||ev.target)?.matches?.('input,textarea,select'))return false;const k=ev.key.toLowerCase();if(!e.play.active&&!state.menu&&k!=='tab')return false;if((ev.ctrlKey||ev.metaKey)&&k==='s'){action('save');return true;}if(k==='tab'&&!state.menu){action('menu');return true;}if(k==='pageup'||k==='pagedown'){action(k==='pageup'?'raise-object':'lower-object');return true;}if((ev.ctrlKey||ev.metaKey)&&k==='z'){action(ev.shiftKey?'redo':'undo');return true;}if(ev.repeat&&['e','r','q','escape','delete'].includes(k))return true;if(k==='e'){action('place');return true;}if(k==='r'){action('rotate');return true;}if(k==='q'){action('pick');return true;}if(k==='v'){action('select');return true;}if(k==='escape'){if(state.menu)closePanels();else if(state.copy)cancelEdit();else action('menu');return true;}if(k==='delete'){action('erase');return true;}return false;}
 function controller(frame,dt){
  if(hud.controller(frame))return true;
  if(!e.play.active||root.querySelector('.overlay:not(.hide),.drawer:not(.hide)'))return false;
  const p=frame.pressed||[];state.controllerLift=state.building&&!state.menu?((frame.held?.[B.RB]?1:0)-(frame.held?.[B.LB]?1:0)):0;
  if(p[B.MENU]){action('menu');return true;}
  if(p[B.VIEW]){action('test');return true;}
  if(!state.building)return true;
  if(p[B.RT])action('place');if(p[B.X])action('rotate');if(p[B.Y])state.selectedId?openPanel('transform'):action('pick');if(p[B.B])action('cancel');
  if(p[B.DPAD_UP])action('raise-object');if(p[B.DPAD_DOWN])action('lower-object');if(p[B.DPAD_LEFT])action('select');if(p[B.DPAD_RIGHT])action('rotate-tool');return true;
 }

 window.addEventListener('blur',()=>{state.lift=0;state.controllerLift=0;e.play.keys.clear();e.play.moveX=e.play.moveY=0;});
 function showIssue(issue){closePanels();if(!state.building||state.overview){state.overview=false;state.building=true;if(!e.play.active)e.startPlay();}const o=e.doc.get(issue?.target);if(o){const distance=Math.max(8,Math.hypot(o.w||4,o.d||4));e.play.x=o.x;e.play.z=clamp(o.z+distance,-e.doc.arenaLimit+1,e.doc.arenaLimit-1);e.play.y=e.runtimePhysical().geometry.terrainHeight(o.x,o.z)+5;e.play.yaw=0;e.play.pitch=-.3;e.gameRuntime?.teleport(e.play);state.issue='This spot needs attention. Move or erase the object.';setTip(state.issue);}else setTip('Could not finish checking this map. Your edits are still here.');sync();}
 return {state,enter,exit,update,draw,key,controller,action,choose,commit,closePanels,sync,showIssue,renderHUD,transform};
}
