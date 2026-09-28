import {WALK_ITEMS} from './walk-builder.js?v=1.74.0';
// Canvas panel descriptions and commands. No DOM controls or browser prompts.
import {APP_VERSION} from './game-config.js?v=1.74.0';
import {assetResizeMode,BUILDING_MATERIALS} from './object-catalog.js?v=1.74.0';
import {CATALOG,MATERIALS,ENV_PRESETS,EnvironmentRules,SettingsCommand,EnvironmentCommand,PatchCommand,Validator,IssueGuide,clone,uid,clamp} from './builder-model.js?v=1.74.0';
export function createBuilderPanels({editor:e,save,publish,exit,importFile,exportFile,restore}){
 let screen=null,history=[],actions=new Map(),keyboard=null,busy=false,checkRevision=-1,checkDoc=null,checkIssues=[];
 const selection=()=>{if(e.play.active)e.selected=new Set(e.walk.state.selectedId?[e.walk.state.selectedId]:[]);return e.allSelected();};
 function show(name,data={},push=true){e.cancelInteraction?.();if(push&&screen)history.push(screen);screen={name,data};keyboard=null;e.panel={model};if(e.walk){e.walk.state.menu=true;e.walk.state.page=0;e.walk.state.lift=0;e.walk.state.controllerLift=0;}e.gameRuntime?.pauseInput();e.syncUI();}
 function close(){if(busy||screen?.name==='working')return;if(history.length){const s=history.pop();show(s.name,s.data,false);}else{screen=null;keyboard=null;e.panel=null;e.walk?.closePanels();}e.syncUI();}
 function reset(){history=[];screen=null;keyboard=null;e.panel=null;}
 function dismiss(){reset();e.walk?.closePanels();}
 function item(label,run,options={}){const id='ui:'+actions.size;actions.set(id,run);return {id,label,...options};}
 function field(label,value,set,{min=-300,max=300,step=1}={}){return item(`${label}: ${Number(value).toFixed(step<1?2:0)}`,()=>editText(label,String(value),v=>{const n=Number(v);if(!v.trim()||!Number.isFinite(n))throw new Error('Enter a number');set(clamp(n,min,max));},true),{adjust:dir=>set(clamp(value+dir*step,min,max))});}
 function choice(title,values,current,set){show('choice',{title,values,current,set});}
 function editText(title,value,apply,numeric=false){keyboard={title,value:String(value),draft:String(value),apply,numeric,caps:false};e.walk.state.page=0;e.syncUI();}
 function commitText(){const k=keyboard;if(!k)return;try{k.apply(k.draft);keyboard=null;e.syncUI();}catch(error){k.error=error.message;e.syncUI();}}
 function setProperty(key,value){const before=selection().map(clone),after=before.map(o=>({...o,[key]:value}));if(before.length)e.commands.execute(new PatchCommand(e.doc,before,after,'Property'));}
 function changeSetting(change){const before=e.settingsSnapshot(),after=clone(before);change(after);e.commands.execute(new SettingsCommand(e,before,after));e.fit();}
 function environment(change){const before=clone(e.doc.environment),after=clone(before);change(after);e.commands.execute(new EnvironmentCommand(e,before,after));}
 function activate(mode,itemToPlace){if(itemToPlace)return e.flow.choose(itemToPlace);if(mode==='analysis'){if(!e.walk.state.overview){show('analysis-view');return;}dismiss();e.setMode('analysis',false);e.draw();return;}e.flow.terrain(mode==='environment');}

 async function task(run){if(busy)return;busy=true;e.syncUI();try{await run();}catch(error){show('error',{message:String(error?.message||error)},false);}finally{busy=false;e.syncUI();}}
 function confirm(title,message,run){show('confirm',{title,message,run});}
 function model(){
  actions=new Map();if(!screen)return null;
  if(keyboard)return {title:keyboard.error||keyboard.title,kind:'keyboard',value:keyboard.draft,numeric:keyboard.numeric,caps:keyboard.caps,digits:keyboard.digits};
  const {name,data}=screen;let title='',items=[],description='';
  if(name==='working'){title='Working…';description='Please wait';}
  else if(name==='restore'){title='Restore autosave';description='Replace this map with the saved local draft?';items=[item('Cancel',close),item('Restore',()=>task(restore))];}
  else if(name==='choice'){title=data.title;items=data.values.map(v=>{const [value,label]=Array.isArray(v)?v:[v,v];return item(label,()=>{data.set(value);close();},{selected:value===data.current});});}
  else if(name==='confirm'){title=data.title;description=data.message;items=[item('Cancel',close),item('Confirm',()=>task(async()=>{await data.run();dismiss();}))];}
  else if(name==='error'){title='Could not finish';description=data.message;items=[item('Back',close),item('Map Check',()=>show('check'))];}
  else if(name==='edit'){
   title='Object properties';const objects=selection(),o=objects[0];if(!o){description='Select an object first';items=[item('Select',()=>{dismiss();e.walk.action('select');})];}
   else{
    description=objects.length>1?`${objects.length} selected`:IssueGuide.objectLabel(o);
    items=[...(e.play.active?[item('Move',()=>{dismiss();e.walk.action('move');},{disabled:o.type==='ladder'&&!!o.parentId}),...('rot'in o||'yaw'in o?[item('Rotate tool',()=>{dismiss();e.walk.action('rotate-tool');})]:[])]:[]),item('Copy',()=>{e.duplicateSelected();if(e.play.active)e.walk.state.selectedId=[...e.selected][0]||null;e.syncUI();}),item('Delete',()=>{e.deleteSelected();if(e.walk)e.walk.state.selectedId=null;dismiss();}),...(objects.length>1||'rot'in o||'yaw'in o?[item('Rotate left',()=>e.rotateSelected(-15)),item('Rotate right',()=>e.rotateSelected(15))]:[]),item('Raise objects',()=>e.elevateSelected(1)),item('Lower objects',()=>e.elevateSelected(-1)),item(objects.some(x=>x.groupId)?'Ungroup':'Group',()=>objects.some(x=>x.groupId)?e.ungroupSelected():e.groupSelected()),item('Save group',()=>editText('Group name',`Piece ${e.prefabs.length+1}`,saveGroup))];
    if(objects.length===1){for(const [key,label,min,max,step]of [['x','X',-e.doc.arenaLimit,e.doc.arenaLimit,.5],['z','Z',-e.doc.arenaLimit,e.doc.arenaLimit,.5],['rot','Rotation',0,359,15],['yOffset','Height',-8,20,.25],['yaw','Facing',0,359,15]])if(key in o)items.push(field(label,o[key],v=>setProperty(key,v),{min,max,step}));
     if(assetResizeMode(o)==='parametric')for(const [key,label,min,max,step]of [['w','Width',o.type==='building'?8:1,80,.5],['d','Depth',o.type==='building'?6:1,80,.5],['h','Height',.2,40,.25],['levels','Floors',1,8,1],['floorH','Floor height',2.2,5,.1],['balcony','Balcony',0,10,.5],['rise','Rise',.5,24,.25],['base','Base',2,60,.5]])if(key in o)items.push(field(label,o[key],v=>setProperty(key,v),{min,max,step}));
     if(o.type==='building')items.push(item('Material: '+o.style,()=>choice('Building material',Object.keys(BUILDING_MATERIALS),o.style,v=>setProperty('style',v))));
     if(o.type==='spawn')items.push(item('Team: '+o.team,()=>choice('Team',[['blue','Alpha'],['red','Bravo'],['ffa','Free for all']],o.team,v=>setProperty('team',v))));
     if(o.type==='ladder'&&o.parentId)items.push(item('Detach ladder',()=>{const before=clone(o),after={...before,parentId:null,attached:false};e.commands.execute(new PatchCommand(e.doc,[before],[after],'Detach ladder'));}));if(o.type==='ladder')for(const key of (o.parentId?['width']:['width','bottomY','topY']))items.push(field(key,o[key],v=>setProperty(key,v),{min:key==='width'?.5:-8,max:key==='width'?5:60,step:.25}));
    }
   }
  }
  else if(name==='library'){title='Place objects';items=[...['Buildings','Pieces','Cover','Nature'].map(group=>item(group,()=>show('objects',{group}))),item('Roads',()=>show('roads')),item('Starts & ladders',()=>show('setup')),item('Saved groups',()=>show('prefabs'))];}
  else if(name==='objects'){title='Place · '+data.group;items=WALK_ITEMS.filter(o=>o.group===data.group).map(o=>item(o.label,()=>e.flow.choose(o),{thumbnail:e.walk.thumbnail(o)}));if(data.group==='Pieces')items.push(...CATALOG.build.filter(o=>o.type==='mound'||o.kind==='platform').map(o=>item(o.label,()=>e.flow.choose(o))));}
  else if(name==='tools'){title='Build tools';items=[item('Terrain',()=>show('terrain')),item('Paint ground',()=>show('paint')),item('Light & weather',()=>show('weather')),item('Snapping',()=>show('snap')),item('Layers',()=>show('layers')),item('Map analysis',()=>show('analysis'))];}
  else if(name==='analysis-view'){title='Map analysis';description='Analysis overlays are available in Top view.';items=[item('Switch to Top view',()=>{dismiss();e.flow.switchView();e.setMode('analysis',false);e.draw();}),item('Back',close)];}
  else if(name==='roads'||name==='setup'||name==='catalog'){
   title=name==='roads'?'Roads':name==='setup'?'Starts & ladders':'Object library';const group=name==='roads'?'roads':name==='setup'?'gameplay':data.group||'build';
   if(name==='setup')items.push(item('Auto setup',()=>e.autoGameplay()),item('Rebuild bot routes',()=>e.autoFlow()));
   
   items.push(...CATALOG[group].map(o=>item(o.label,()=>activate('select',o))));
  }
  else if(name==='paint'){
   title='Paint ground';items=Object.entries(MATERIALS).map(([key,v])=>item(v.label,()=>{e.materialBrush.material=key;activate('environment');},{selected:e.materialBrush.material===key}));items.push(field('Brush radius',e.materialBrush.radius,v=>{e.materialBrush.radius=v;},{min:2,max:30,step:2}));
  }
  else if(name==='terrain'){
   title='Shape ground';items=['raise','lower','smooth','level'].map(tool=>item(tool==='level'?'Flatten':tool[0].toUpperCase()+tool.slice(1),()=>{e.brush.tool=tool;activate('terrain');},{selected:e.brush.tool===tool}));items.push(field('Brush radius',e.brush.radius,v=>{e.brush.radius=v;},{min:2,max:30,step:2}),field('Strength',e.brush.power,v=>{e.brush.power=v;},{min:.1,max:1,step:.1}),item('Sample flatten height: '+(e.brush.sampleHeight?'On':'Off'),()=>{e.brush.sampleHeight=!e.brush.sampleHeight;}),field('Flatten height',e.brush.level,v=>{e.brush.level=v;},{min:-6,max:6,step:.25}),item('Flatten entire map',()=>confirm('Flatten ground','This replaces all terrain shaping. Undo can restore it.',()=>e.resetTerrainSurface('flat'))),item('Reset shaping',()=>confirm('Reset shaping','Restore the base terrain. Undo can restore your edits.',()=>e.resetTerrainSurface('base'))));
  }
  else if(name==='weather'){
   title='Light & weather';items=Object.entries(ENV_PRESETS).map(([key,v])=>item(v.label,()=>{const before=clone(e.doc.environment);e.commands.execute(new EnvironmentCommand(e,before,EnvironmentRules.preset(key)));},{selected:e.doc.environment.preset===key}));
   items.push(item('Weather: '+e.doc.environment.weather,()=>choice('Weather',['clear','overcast','rain','storm'],e.doc.environment.weather,v=>environment(a=>{a.weather=v;a.preset='custom';}))));
   for(const [key,label,min,max,step]of [['sunAzimuth','Sun direction',0,359,15],['sunElevation','Sun height',-30,85,5],['cloudAmount','Clouds',0,1,.1],['fogAmount','Fog',0,.85,.05],['rainIntensity','Precipitation',0,1,.1],['ambient','Ambient light',.12,1,.05],['wetness','Wet ground',0,1,.1],['wind','Wind',0,1,.1]])items.push(field(label,e.doc.environment[key],v=>environment(a=>{a[key]=v;a.preset='custom';}),{min,max,step}));
  }
  else if(name==='snap'){
   title='Snapping';for(const [key,label]of [['grid','Grid'],['objects','Objects'],['roads','Road ends']])items.push(item(label+': '+(e.snapConfig[key]?'On':'Off'),()=>{e.snapConfig[key]=!e.snapConfig[key];e.walk.state.key='';}));items.push(field('Grid size',e.snapConfig.gridSize,v=>{e.snapConfig.gridSize=v;},{min:.25,max:10,step:.25}),field('Rotation step',e.snapConfig.angle,v=>{e.snapConfig.angle=v;},{min:1,max:90,step:5}));
  }
  else if(name==='layers'){
   title='Layers · top view';description='Visibility applies to the top view. Locks protect edits.';for(const [key,v]of Object.entries(e.layerState)){items.push(item(key+': '+(v.visible?'Visible':'Hidden'),()=>{v.visible=!v.visible;e.draw();}),item(key+': '+(v.locked?'Locked':'Unlocked'),()=>{v.locked=!v.locked;e.selected=new Set(e.allSelected().map(o=>o.id));e.syncUI();e.draw();}));}
  }
  else if(name==='prefabs'){
   title='Saved groups';items=[item('Save selection',()=>{if(!selection().length){e.toast('Select objects first');return;}editText('Group name',`Piece ${e.prefabs.length+1}`,saveGroup);})];for(const p of e.prefabs)items.push(item('Place '+p.name,()=>activate('select',{type:'prefab',label:p.name,prefabId:p.id})),item('Remove '+p.name,()=>confirm('Remove saved group',p.name,()=>{e.prefabs=e.prefabs.filter(x=>x.id!==p.id);e.persistPrefabs();})));
  }
  else if(name==='settings'){
   title='Map settings';items=[item('Name: '+e.doc.meta.name,()=>editText('Map name',e.doc.meta.name,v=>changeSetting(a=>{a.meta.name=v.trim().slice(0,64)||'NEW MAP';}))),item('Base: '+e.doc.theme,()=>choice('Base terrain',['flat','highlands','depot','yard','rig'],e.doc.theme,v=>changeSetting(a=>{a.theme=v;}))),field('Play area',e.doc.arenaLimit,v=>changeSetting(a=>{a.arenaLimit=v;a.minimapLimit=Math.min(a.minimapLimit,v);a.terrain.heightfield=e.doc.terrain.resample(v).serialize();a.terrain.materials=e.doc.materials.resample(v).serialize();}),{min:Math.ceil(e.minimumArena()),max:300,step:5}),field('Minimap area',e.doc.minimapLimit,v=>changeSetting(a=>{a.minimapLimit=v;}),{min:20,max:e.doc.arenaLimit,step:5}),item('Rebuild bot routes',()=>e.autoFlow()),item('Generate map',()=>show('generate')),item('Starting maps',()=>show('templates'))];
  }
  else if(name==='generate'){
   title='Generate map';const d=screen.data;if(!d.style)Object.assign(d,{style:'urban',size:'medium',density:'normal',seed:'MAP'});items=[item('Style: '+d.style,()=>choice('Style',['urban','mixed','depot','yard','outpost','highlands'],d.style,v=>{d.style=v;})),item('Size: '+d.size,()=>choice('Size',['small','medium','large'],d.size,v=>{d.size=v;})),item('Density: '+d.density,()=>choice('Density',['light','normal','heavy'],d.density,v=>{d.density=v;})),item('Seed: '+d.seed,()=>editText('Seed',d.seed,v=>{d.seed=v;})),item('Generate',()=>confirm('Replace current map','Save or export first if you need this draft.',()=>e.generate(d.style,d.size,d.density,d.seed)))];
  }
  else if(name==='templates'){
   title='Starting maps';items=['blank','highlands','depot','yard','rig'].map(k=>item(k==='blank'?'Flat map':k,()=>confirm('Replace current map','Save or export first if you need this draft.',()=>e.loadTemplate(k))));items.push(item('Reference map',()=>confirm('Replace current map','Load the reference map?',()=>e.buildShowcase())));
  }
  else if(name==='check'){
   title='Map Check';const issues=checkDoc===e.doc&&checkRevision===e.sceneRev?checkIssues:(checkDoc=e.doc,checkRevision=e.sceneRev,checkIssues=Validator.validate(e.doc,true)),status=Validator.statusFrom(issues);description=status.exportable?'No blocking problems found':'Fix the listed problems before publishing';items=[item('Test map',()=>{dismiss();e.walk.action('playtest');}),item('Analysis',()=>show('analysis')),item('Export',()=>exportFile())];for(const issue of issues.filter(i=>i.tone!=='good')){const guide=IssueGuide.describe(issue,e.doc);items.push(item(guide.title,()=>show('issue',{issue,guide})));}
  }
  else if(name==='issue'){
   title=data.guide.title;description=data.guide.fix;items=[item('Show location',()=>{dismiss();if(data.issue.target)e.focusTarget(data.issue.target);else e.showChecks();}),item('Undo last edit',()=>e.commands.undo()),item('Check again',()=>show('check',{},false))];
  }
  else if(name==='analysis'){
   title='Map analysis';items=['elevation','slope','walkability','spawns','sightlines','integrity'].map(v=>item(v,()=>{e.analysisView=v;e.r2.raster=null;activate('analysis');}));items.push(item('Contours: '+(e.analysisContours?'On':'Off'),()=>{e.analysisContours=!e.analysisContours;e.r2.raster=null;e.draw();}));
  }
  else if(name==='help'){
   title='Controls';description=e.play.active?'Build: move/look with game controls. Space/C or RB/LB fly up/down. E/RT places. Q/Y opens objects. Tab/Menu opens tools. View switches Build/Test.':'Top view: drag objects or handles. Drag empty ground to pan; pinch/wheel to zoom. Shift selects several; controller X toggles the map cursor.';items=[item('Objects',()=>{dismiss();e.walk.action('pick');}),item('Properties',()=>show('edit')),item('Terrain tools',()=>show('terrain'))];
  }
  else if(name==='exit'){
   title='Unsaved map';description='Save this draft before returning to Maps?';items=[item('Keep editing',dismiss),item('Save & exit',()=>task(async()=>{await save();exit();})),item('Discard & exit',exit)];
  }
  else {title='Map · '+APP_VERSION;items=[item('Save',()=>task(save)),item('Publish',()=>task(publish)),item('Map Check',()=>show('check')),item('Build tools',()=>show('tools')),item('Map settings',()=>show('settings')),item('Controls',()=>show('help')),item('Back to maps',()=>{dismiss();e.onUI('exit');}),item('Map name',()=>editText('Map name',e.doc.meta.name,v=>changeSetting(a=>{a.meta.name=v.trim().slice(0,64)||'NEW MAP';}))),item('Import file',()=>importFile()),item('Export file',()=>exportFile()),item('Restore autosave',()=>confirm('Restore autosave','Replace the current map with the saved local draft?',restore))];}
  if(busy){title='Working…';items=items.map(i=>({...i,disabled:true}));}
  return {title,description,items,back:history.length>0};
 }
 function saveGroup(name){const objects=selection();if(!objects.length)return;const ids=new Set(objects.map(o=>o.id));for(const l of e.doc.ladders)if(ids.has(l.parentId))ids.add(l.id);const all=[...ids].map(id=>clone(e.doc.get(id))),center=e.groupCenter(objects);for(const o of all){o.x-=center.x;o.z-=center.z;}e.prefabs.push({id:uid('prefab'),name:name.trim().slice(0,48)||'Piece',objects:all,created:Date.now()});e.persistPrefabs();e.toast('Group saved');}
 function action(id){
  if(id==='close'){if(keyboard){keyboard=null;e.syncUI();}else close();return true;}
  if(keyboard&&id.startsWith('text:')){const key=id.slice(5);keyboard.error='';if(key==='done')commitText();else if(key==='cancel'){keyboard=null;}else if(key==='back')keyboard.draft=Array.from(keyboard.draft).slice(0,-1).join('');else if(key==='digits')keyboard.digits=!keyboard.digits;else if(key==='clear')keyboard.draft='';else if(key==='caps')keyboard.caps=!keyboard.caps;else if(keyboard.draft.length<64)keyboard.draft+=key==='space'?' ':key;e.syncUI();return true;}
  const run=actions.get(id);if(!run)return false;if(!busy){try{run();}catch(error){show('error',{message:error.message});}}e.syncUI();return true;
 }
 function key(ev){if(!keyboard)return false;if(ev.ctrlKey||ev.metaKey)return true;ev.preventDefault();if(ev.key==='Enter')commitText();else if(ev.key==='Escape')action('text:cancel');else if(ev.key==='Backspace')action('text:back');else if(ev.key.startsWith('Arrow'))return false;else if(ev.key.length===1&&(!keyboard.numeric||/[0-9.\-]/.test(ev.key)))action('text:'+ev.key);return true;}
 return {show,close,dismiss,reset,model,action,key,get active(){return !!screen;},get busy(){return busy;}};
}
