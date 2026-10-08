// Shared physical models. Coordinates, component replacements and action poses
// are identical in the armory, first person, remote players and replay.
import {installWeaponIronSights} from './iron-sights.js?v=2.20.0';
import {WEAPON_SPECS} from './game-config.js?v=2.20.0';
import {createBattleRifle, battleRifleCycle, poseBattleRifle} from './battle-rifle.js?v=2.20.0';

const smooth=(p,a,b)=>{const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
const pulse=(p,a,b,c,d)=>smooth(p,a,b)*(1-smooth(p,c,d));

export function createWeaponModel(T,id){
  if(id==='battleRifle'){
    const v=createBattleRifle(T);v.id=id;v.sight={type:'aperture',rearZ:-.12,frontZ:-1.22,sightY:.232,rearMountY:.197,frontMountY:.160,eyeZ:-.40};
    v.hands={right:{position:[.038,-.090,.17],rotation:[-.28,-.02,.06]},left:{position:[-.038,-.095,-.53],rotation:[-.14,.04,.02]},reloadLeft:{parent:v.mag,position:[-.035,-.025,0],rotation:[-.16,.08,.14]},reloadRight:{parent:v.bolt,position:[.151,-.014,.057],rotation:[-.40,-.10,.28]}};
    v.mount={y:.202,z:-.20,handZ:-.53,handY:-.095,laserX:.110};v.magBase=v.mag.position.clone();installWeaponIronSights(T,v);return v;
  }
  const group=new T.Group();group.name=id;const v={id,group},m={};
  for(const [key,color,roughness,metalness]of [['steel',0x394147,.38,.68],['dark',0x20272b,.56,.36],['poly',0x343b3b,.84,.06],['rubber',0x151b1d,.92,.02],['wood',0x785037,.76,.02],['tan',0x9a8c68,.67,.18],['olive',0x606a49,.85,.04],['silver',0x879396,.30,.72],['brass',0xb99a55,.36,.66]]){m[key]=new T.MeshStandardMaterial({color,roughness,metalness});m[key].userData.preservePreviewTone=true;}
  const mesh=(name,geometry,mat=m.steel,parent=group)=>{const o=new T.Mesh(geometry,mat);o.name=name;parent.add(o);return o;};
  const box=(name,size,pos,mat=m.steel,parent=group)=>{const o=mesh(name,new T.BoxGeometry(...size),mat,parent);o.position.set(...pos);return o;};
  const part=(name,pos=[0,0,0],parent=group)=>{const o=new T.Group();o.name=name;o.position.set(...pos);parent.add(o);return o;};
  const profile=(name,points,width,mat=m.steel,parent=group,holes=[])=>{
    const path=(points,Type)=>{const s=new Type();points.forEach(([z,y],i)=>i?s.lineTo(-z,y):s.moveTo(-z,y));s.closePath();return s;};
    const s=path(points,T.Shape);s.holes=holes.map(p=>path(p,T.Path));const bevel=Math.min(.004,width*.09),g=new T.ExtrudeGeometry(s,{depth:width-bevel*2,bevelEnabled:true,bevelThickness:bevel,bevelSize:bevel,bevelSegments:1,curveSegments:8,steps:1});g.translate(0,0,-(width-bevel*2)/2);g.rotateY(Math.PI/2);return mesh(name,g,mat,parent);
  };
  const tube=(name,r,len,pos,mat=m.steel,parent=group,open=false)=>{const o=mesh(name,new T.CylinderGeometry(r,r,len,12,1,open),mat,parent);o.rotation.x=Math.PI/2;o.position.set(...pos);return o;};
  const ring=(name,r,t,pos,mat=m.steel,parent=group)=>{const o=mesh(name,new T.TorusGeometry(r,t,5,16),mat,parent);o.position.set(...pos);return o;};
  const ribs=(parent,z0,z1,y,width,n=8)=>{for(let i=0;i<n;i++)box('rail-tooth',[width,.008,.015],[0,y,z0+(z1-z0)*i/(n-1)],m.dark,parent);};
  const pins=(z,y,width=.18,parent=group)=>{for(const x of [-1,1]){const o=mesh('receiver-pin',new T.CylinderGeometry(.007,.007,.003,8),m.silver,parent);o.rotation.z=Math.PI/2;o.position.set(x*(width/2+.002),y,z);}};
  const vents=(parent,z0,z1,y,width,n=6)=>{for(const side of [-1,1])for(let i=0;i<n;i++)box('cooling-slot',[.002,.026,.034],[side*(width/2+.001),y,z0+(z1-z0)*i/(n-1)],m.rubber,parent);};
  const grip=(z=.02,mat=m.poly)=>{const g=profile('pistol-grip',[[z-.055,-.04],[z+.060,-.035],[z+.125,-.245],[z+.005,-.255]],.105,mat);for(let i=0;i<5;i++)box('grip-checkering',[.108,.009,.085],[0,-.11-i*.025,z+.035+i*.008],m.dark,g);return g;};
  const guard=(z=.02)=>profile('trigger-guard',[[z-.14,-.035],[z+.025,-.035],[z+.018,-.135],[z-.11,-.137]],.025,m.dark,group,[[[z-.109,-.059],[z-.09,-.111],[z-.005,-.109],[z+.001,-.059]]]);
  const trigger=(z=.0)=>{profile('trigger',[[z-.006,-.052],[z-.028,-.08],[z-.012,-.110],[z+.001,-.095],[z+.007,-.054]],.018,m.steel);};
  const stock=(kind='solid',mat=m.poly,start=.10,end=.60)=>{
    const g=part('stock');const outer=[[start,.04],[end-.03,.045],[end,-.19],[end-.05,-.22],[start+.16,-.12],[start,-.045]];
    profile('buttstock',outer,.13,mat,g,kind==='skeleton'?[[[start+.10,.005],[start+.18,-.075],[end-.07,-.148],[end-.10,.001]]]:[]);
    box('recoil-pad',[.145,.22,.027],[0,-.09,end],m.rubber,g);v.stock=g;
    v.stockSet={standard:g};
    for(const [key,length]of [['lightweightStock',end-.06],['fullStock',end+.035],['compactStock',end-.17]]){
      const q=part(key),w=key==='fullStock'?.15:.12;
      if(key==='fullStock')profile('stock-shell',[[start,.035],[length-.04,.055],[length,-.175],[length-.06,-.21],[start+.05,-.09]],w,mat,q);
      else{for(const y of [.016,-.065])tube('stock-brace',.012,length-start,[0,y,(length+start)/2],m.steel,q);box('stock-cheek',[.09,.042,.13],[0,.034,length-.10],mat,q);}
      box('butt-pad',[w,.20,.032],[0,-.07,length],m.rubber,q);q.visible=false;v.stockSet[key]=q;
    }
    return g;
  };
  const magazine=(pos,w,h,d,{curve=0,mat=m.dark,boxFed=false}={})=>{
    const g=part('magazine',pos);v.mag=g;v.magBase=g.position.clone();g.userData.magSize=[w,h,d];v.magSet={};
    for(const [key,extra]of [['standard',0],['extendedMag',boxFed?.07:h*.38]]){
      const q=part(key,[0,0,0],g),bottom=-h/2-extra,top=h/2;
      profile(boxFed?'ammunition-box':'magazine-body',[[-d/2,top],[d/2,top],[d/2+curve,bottom+.025],[d/2+curve-.02,bottom],[-d/2+curve,bottom],[-d/2+.01,top-.035]],w,mat,q);
      box('magazine-floor',[w+.008,.015,d+.014],[0,bottom-.002,curve],m.rubber,q);
      for(const side of [-1,1])for(let i=0;i<(boxFed?2:3);i++)box('pressed-channel',[.003,h*.72+extra,.012],[side*(w/2+.002),-extra/2,-d*.28+i*d*.28+curve*.45],m.steel,q);
      q.visible=!extra;v.magSet[key]=q;
    }
    return g;
  };
  const barrel=(rear,front,y=.025,r=.023,{long=false,short=false,heavy=false}={})=>{
    v.barrelSet={};for(const [key,length,radius]of [['standard',rear-front,r],...(long?[['shotgunLongBarrel',(rear-front)*1.20,r*1.03]]:[]),...(short?[['shortBarrel',(rear-front)*.76,r]]:[]),...(heavy?[['heavyBarrel',(rear-front)*1.16,r*1.24]]:[])]){
      const g=part(key+'-barrel'),tip=rear-length,b=tube('barrel',radius,length,[0,y,rear-length/2],m.steel,g,true);ring('muzzle-crown',radius*.91,radius*.12,[0,y,tip],m.dark,g);ring('chamber-collar',radius*1.10,.006,[0,y,rear-.025],m.dark,g);g.visible=key==='standard';v.barrelSet[key]={mesh:g,front:tip};if(key==='standard')v.barrel=g;
    }
    v.muzzle=[0,y,front-.012];return v.barrel;
  };
  const action=(pos,travel=.06)=>{const g=part('bolt-carrier',pos);box('bolt-face',[.019,.036,.09],[0,0,0],m.silver,g);tube('charging-handle',.010,.047,[.023,-.005,.025],m.dark,g).rotation.z=Math.PI/2;v.bolt=g;v.actionBase=g.position.clone();v.actionTravel=travel;return g;};
  const shell=(name,parent=group)=>{const g=part(name,[0,0,0],parent);tube('shell-hull',.017,.064,[0,0,0],m.olive,g);tube('shell-base',.018,.016,[0,0,.038],m.brass,g);return g;};
  const conventionalStock=(mat=m.wood)=>{v.stock=part('wood-stock');profile('stock-body',[[.06,-.02],[.26,.016],[.57,.00],[.61,-.21],[.53,-.25],[.23,-.105],[.14,-.17],[.045,-.09]],.125,mat,v.stock);box('butt-pad',[.137,.225,.025],[0,-.115,.605],m.rubber,v.stock);};

  if(id==='pistol'){
    const slide=part('slide',[0,.055,-.11]);profile('slide-shell',[[-.295,-.048],[-.31,.022],[-.284,.055],[.205,.055],[.23,.035],[.23,-.045]],.164,m.steel,slide);
    for(const side of [-1,1])for(let i=0;i<6;i++)box('slide-serration',[.003,.074,.006],[side*.084,.002,.12+i*.012],m.dark,slide);
    box('ejection-port',[.092,.003,.090],[.018,.057,-.036],m.rubber,slide);box('barrel-hood',[.073,.004,.062],[.013,.059,-.046],m.silver,slide);
    profile('polymer-frame',[[-.36,-.01],[-.36,-.06],[-.14,-.06],[-.11,-.09],[.075,-.09],[.13,-.035],[.105,.025],[-.15,.025]],.146,m.poly);
    barrel(-.19,-.435,.047,.024);grip(.015);guard(.035);trigger(.01);magazine([0,-.16,.060],.085,.19,.105);v.mag.rotation.x=-.30;v.bolt=slide;v.actionBase=slide.position.clone();v.actionTravel=.084;
    v.sight={type:'pistol',rearZ:.075,frontZ:-.365,sightY:.137,rearMountY:.110,frontMountY:.110,eyeZ:-.46};v.mount={y:.112,z:-.02,handZ:-.045,handY:-.085,laserX:0,laserZ:-.27,laserY:-.10};
    v.hands={right:{position:[.026,-.165,.048],rotation:[-.30,-.04,.04]},left:{position:[-.050,-.115,-.012],rotation:[-.34,.10,.20]}};
  }else if(id==='akimbo1887'||id==='shotgun'){
    const lever=id==='akimbo1887';profile('receiver',[[-.32,.085],[-.16,.096],[.11,.062],[.12,-.05],[.045,-.09],[-.27,-.075]],.155,m.steel);box('ejection-opening',[.003,.056,.14],[.08,.026,-.14],m.rubber);pins(-.24,-.045,.16);pins(.025,.015,.16);
    barrel(-.26,lever?-1.10:-1.24,.036,.026,{long:true});tube('magazine-tube',.019,lever?.76:.86,[0,-.019,lever?-.64:-.69],m.dark);
    conventionalStock();if(lever){const light=part('compact-wood-stock');profile('short-stock',[[.06,-.02],[.24,.01],[.44,-.005],[.46,-.14],[.39,-.17],[.22,-.10],[.14,-.17],[.045,-.09]],.105,m.wood,light);box('butt-pad',[.12,.15,.023],[0,-.07,.46],m.rubber,light);light.visible=false;v.stockSet={standard:v.stock,lightweightStock:light};}
    v.pump=part(lever?'fore-end':'pump',[0,-.024,-.46]);profile('fore-end-shell',[[-.15,.051],[.15,.051],[.16,-.022],[.13,-.059],[-.12,-.059],[-.16,-.021]],.123,m.wood,v.pump);for(let i=0;i<8;i++)box('fore-end-groove',[.126,.064,.005],[0,-.009,-.119+i*.034],m.dark,v.pump);
    guard(.045);trigger(.018);
    if(lever){v.lever=part('lever',[0,-.060,.07]);profile('lever-loop',[[-.20,-.007],[.025,-.006],[.025,-.075],[-.10,-.104],[-.19,-.068]],.027,m.dark,v.lever,[[[-.172,-.022],[-.165,-.053],[-.096,-.081],[.006,-.060],[.006,-.022]]]);box('hammer',[.035,.045,.028],[0,.08,.094],m.dark);}
    else action([.08,.026,-.13],.135);
    v.shell=shell('loading-shell');v.shell.visible=false;v.sight={type:'bead',rearZ:.02,frontZ:lever?-.98:-1.08,sightY:.118,rearMountY:.074,frontMountY:.060,eyeZ:-.42};v.mount={y:.099,z:-.13,handZ:-.46,handY:-.04,laserX:.076};
    v.hands={right:{position:[.025,-.09,.135],rotation:[-.30,-.03,.04]},left:{parent:v.pump,position:[-.025,-.025,0],rotation:[-.12,.04,.02]},reloadLeft:{parent:v.shell,position:[-.023,0,0],rotation:[-.6,.08,.15]}};
    if(lever){v.hands.left={position:[0,-.09,.135],rotation:[-.30,.03,-.04]};v.hands.right={position:[0,-.09,.135],rotation:[-.30,-.03,.04]};v.hands.reloadRight={parent:v.shell,position:[.023,0,0],rotation:[-.6,-.08,-.15]};}
  }else if(id==='assault'||id==='ump'||id==='machineGun'||id==='semiShotgun'||id==='sniper'){
    const scar=id==='assault',ump=id==='ump',mg=id==='machineGun',saiga=id==='semiShotgun',svd=id==='sniper',w=mg?.21:ump?.175:.165,front=ump?-.47:mg?-.78:saiga?-.64:svd?-.72:-.68,skin=scar?m.tan:mg?m.olive:svd?m.wood:m.poly;
    profile('receiver',[[-.43,.097],[.04,.097],[.12,.051],[.11,-.061],[-.13,-.076],[-.40,-.052]],w,scar?m.tan:m.steel);
    const hand=profile('handguard',[[front,.047],[-.39,.058],[-.38,-.064],[front+.015,-.064]],w*.88,skin);vents(group,front+.055,-.44,.012,w*.88,ump?3:6);pins(-.32,-.024,w);pins(.036,.01,w);
    // Raised side rails leave the bolt face and ejection slot visually exposed.
    box('ejection-slot',[.004,.051,.18],[w/2+.002,.035,-.16],m.rubber);action([w/2+.007,.040,-.16],svd?.10:.068);
    const tip=ump?-.76:mg?-1.40:svd?-1.34:saiga?-1.17:-1.21;barrel(front+.045,tip,.026,mg?.026:.022,{heavy:scar||ump||mg||svd,short:scar||ump,long:saiga});
    if(!ump)tube('gas-system',.013,Math.abs(front+.39),[0,.062,(front-.39)/2],m.dark);
    if(svd){
      v.stock=part('thumbhole-stock');profile('stock-body',[[.08,.055],[.55,.06],[.63,-.205],[.55,-.25],[.10,-.13]],.12,m.wood,v.stock,[[[.18,.006],[.19,-.087],[.49,-.18],[.46,-.028]]]);box('cheek-rest',[.123,.045,.22],[0,.083,.37],m.rubber,v.stock);box('butt-pad',[.137,.235,.03],[0,-.11,.625],m.rubber,v.stock);
    }else{grip(.035);stock(ump?'skeleton':'solid',skin,.105,ump?.57:mg?.67:.62);}
    guard(.042);trigger(.018);
    if(mg){
      magazine([-.045,-.19,-.18],.225,.26,.245,{mat:m.olive,boxFed:true});v.cover=part('feed-cover',[0,.113,-.43]);box('feed-cover-lid',[.18,.028,.39],[0,0,.195],m.dark,v.cover);ribs(v.cover,.03,.33,.020,.075,10);
      v.belt=part('feed-belt',[-.13,-.025,-.18]);for(let i=0;i<5;i++){tube('belt-round',.010,.073,[-.005-i*.016,-i*.010,0],m.brass,v.belt);box('belt-link',[.018,.008,.028],[-.005-i*.016,-i*.010,.012],m.dark,v.belt);}
      v.bipod=part('folding-bipod',[0,-.007,-.80]);for(const x of [-1,1]){const leg=tube('bipod-leg',.009,.28,[x*.055,-.12,.012],m.dark,v.bipod);leg.rotation.set(.1,0,x*-.20);box('bipod-foot',[.045,.018,.045],[x*.083,-.25,.01],m.rubber,v.bipod);}
      const carry=part('carry-handle',[.13,.09,-.53]);profile('handle-frame',[[-.12,0],[-.12,.1],[.08,.1],[.08,0]],.022,m.dark,carry,[[[-.093,.022],[.052,.022],[.052,.074],[-.093,.074]]]);
    }else{
      magazine([0,ump?-.20:saiga?-.16:svd?-.13:-.19,ump?-.14:saiga?-.16:-.17],ump?.09:saiga?.118:.102,ump?.31:saiga?.235:svd?.18:.29,ump?.115:saiga?.18:.148,{curve:scar?.046:saiga?.065:svd?.025:0});
      if(!svd){box('top-rail',[.068,.015,Math.abs(front)+.07],[0,.110,(front+.01)/2],m.dark);ribs(group,.024,front+.03,.122,.078,ump?10:15);}
    }
    if(svd){
      const optic=part('pso-scope');box('side-mount',[.024,.08,.12],[-.09,.08,-.16],m.dark,optic);box('scope-bridge',[.10,.012,.025],[-.036,.092,-.27],m.dark,optic);box('scope-bridge',[.10,.012,.025],[-.036,.092,-.02],m.dark,optic);
      const scope=tube('scope-tube',.042,.42,[0,.14,-.16],m.dark,optic,true);ring('objective-ring',.043,.006,[0,.14,-.37],m.dark,optic);ring('eyepiece',.043,.006,[0,.14,.05],m.rubber,optic);
      const lens=new T.MeshStandardMaterial({color:0x9abbbd,roughness:.12,transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false});mesh('scope-lens',new T.CircleGeometry(.037,20),lens,optic).position.set(0,.14,-.365);tube('elevation-turret',.015,.025,[0,.195,-.16],m.dark,optic).rotation.x=0;
      v.scope=optic;v.scopeParts=[optic,optic,optic];v.mount={y:.095,z:-.16,handZ:-.53,handY:-.045,laserX:.087};
    }else v.mount={y:mg?.153:.132,z:mg?-.20:-.15,handZ:ump?-.42:mg?-.63:saiga?-.53:-.55,handY:-.064,laserX:w/2+.018};
    v.sight={type:'aperture',rearZ:.018,frontZ:front+.025,sightY:mg?.194:.172,rearMountY:mg?.140:svd?.097:.124,frontMountY:.065,eyeZ:-.40};
    v.hands={right:{position:[.025,-.15,svd?.15:.055],rotation:[-.28,-.03,.05]},left:{position:[-.030,-.060,v.mount.handZ],rotation:[-.14,.04,.02]},reloadRight:{parent:v.bolt,position:[.030,0,.018],rotation:[-.35,-.10,.18]}};
  }else if(id==='grenadeLauncher'){
    conventionalStock();profile('breech-receiver',[[-.21,.094],[.10,.065],[.12,-.065],[-.21,-.07]],.14,m.steel);guard(.04);trigger(.015);
    v.hinge=part('break-action',[0,-.052,-.21]);tube('launcher-barrel',.064,.68,[0,.065,-.34],m.dark,v.hinge,true);ring('launcher-muzzle',.059,.008,[0,.065,-.68],m.steel,v.hinge);profile('wood-fore-end',[[-.35,.0],[-.03,.0],[-.03,-.08],[-.32,-.08]],.137,m.wood,v.hinge);
    v.round=part('40mm-round',[0,.016,-.32]);tube('round-case',.048,.12,[0,0,0],m.brass,v.round);tube('round-nose',.047,.065,[0,0,-.07],m.olive,v.round);v.round.visible=false;
    v.sight={rearZ:-.12,frontZ:-.82,sightY:.195,rearMountY:.094,frontMountY:.080,eyeZ:-.46,pitch:WEAPON_SPECS.grenadeLauncher.launchPitchDeg*Math.PI/180};v.muzzle=[0,.013,-.903];v.mount={y:.11,z:-.10,handZ:-.46,handY:-.11};v.hands={right:{position:[.024,-.09,.135],rotation:[-.28,-.03,.04]},left:{parent:v.hinge,position:[-.03,-.06,-.27],rotation:[-.14,.04,.02]},reloadLeft:{parent:v.round,position:[-.028,-.024,.02],rotation:[-.2,.04,.1]}};
  }else if(id==='rpg'){
    tube('launcher-tube',.060,1.20,[0,.026,-.20],m.olive,group,true);for(const z of [.31,.22,-.42,-.71])ring('tube-band',.062,.009,[0,.026,z],m.steel);
    const bell=mesh('rear-venturi',new T.CylinderGeometry(.088,.060,.18,16,1,true),m.dark);bell.rotation.x=Math.PI/2;bell.position.set(0,.026,.44);
    for(const side of [-1,1])box('heat-shield',[.013,.09,.40],[side*.059,.017,.01],m.wood);
    grip(-.04,m.wood);grip(-.49,m.wood);guard(-.025);trigger(-.04);
    v.round=part('rocket',[0,.026,-.86]);tube('rocket-motor',.033,.25,[0,0,.01],m.dark,v.round);const head=mesh('warhead',new T.CylinderGeometry(.037,.081,.19,12),m.olive,v.round);head.rotation.x=Math.PI/2;head.position.z=-.16;const tip=mesh('warhead-ogive',new T.ConeGeometry(.081,.19,12),m.olive,v.round);tip.rotation.x=-Math.PI/2;tip.position.z=-.35;
    v.roundBase=v.round.position.clone();v.muzzle=[0,.026,-1.31];v.sight={type:'aperture',x:-.084,rearZ:.07,frontZ:-.63,sightY:.16,rearMountY:.09,frontMountY:.09,eyeZ:-.42};v.mount={y:.105,z:-.12,handZ:-.49,handY:-.17,laserX:.075};v.hands={right:{position:[.026,-.145,-.005],rotation:[-.28,-.03,.05]},left:{position:[-.027,-.145,-.46],rotation:[-.24,.04,.02]},reloadLeft:{parent:v.round,position:[-.045,0,-.12],rotation:[-.14,.05,.06]}};
  }else throw new Error('Unknown weapon model: '+id);
  v.sightMaterial=m.dark;
  v.flash=mesh('muzzle-flash',new T.SphereGeometry(id==='rpg'?.10:.07,8,6),new T.MeshBasicMaterial({color:0xffda98,transparent:true,opacity:0}));v.flash.position.set(...v.muzzle);v.flash.userData.previewSkip=true;
  if(v.mag&&!v.hands.reloadLeft)v.hands.reloadLeft={parent:v.mag,position:[-.036,-.015,.01],rotation:[-.14,.06,.15]};
  if(v.bolt){group.userData.cyclePart=v.bolt;group.userData.cycleBaseZ=v.actionBase.z;group.userData.cycleTravel=v.actionTravel;}
  // Reduce fixed details to one mesh per material, while preserving mechanical
  // groups and replacement assemblies as independent objects.
  batchStaticMeshes(T,group);if(id==='sniper'){v.sight.eyeZ=-.85;v.scope.visible=false;}installWeaponIronSights(T,v);return v;
}

export function batchStaticMeshes(T,root){
  for(const child of [...root.children])if(child.isGroup)batchStaticMeshes(T,child);
  const batches=new Map();for(const child of [...root.children]){if(!child.isMesh||child.userData.previewSkip||child.material.transparent)continue;child.updateMatrix();const geo=child.geometry.index?child.geometry.toNonIndexed():child.geometry.clone();geo.applyMatrix4(child.matrix);const list=batches.get(child.material)||[];list.push(geo);batches.set(child.material,list);root.remove(child);child.geometry.dispose();}
  for(const [mat,list]of batches){const g=new T.BufferGeometry();for(const key of ['position','normal','uv']){const attrs=list.map(g=>g.getAttribute(key));if(attrs.some(a=>!a))continue;const data=new Float32Array(attrs.reduce((n,a)=>n+a.array.length,0));let offset=0;for(const a of attrs){data.set(a.array,offset);offset+=a.array.length;}g.setAttribute(key,new T.BufferAttribute(data,attrs[0].itemSize));}g.computeBoundingSphere();const o=new T.Mesh(g,mat);o.name='surface-'+mat.color.getHexString();root.add(o);list.forEach(g=>g.dispose());}
}

export function selectWeaponComponents(view,attachments={}){
  for(const [set,key]of [[view.magSet,attachments.magazine],[view.stockSet,attachments.stock]])if(set){const chosen=set[key]?key:'standard';for(const [id,obj]of Object.entries(set))obj.visible=id===chosen;}
  const set=view.barrelSet;if(set){const chosen=set[attachments.barrel]?attachments.barrel:'standard';for(const [id,value]of Object.entries(set))value.mesh.visible=id===chosen;return set[chosen].front-set.standard.front;}return 0;
}

export function poseWeaponModel(view,{shot=0,reload=0,empty=false,loaded=true,cycle=null}={}){
  const p=Math.max(0,Math.min(1,reload)),id=view.id;
  if(id==='battleRifle'){poseBattleRifle(view,cycle||battleRifleCycle(0,0),p);return;}
  if(view.bolt){view.bolt.position.copy(view.actionBase);let travel=shot;if(id==='pistol'&&empty)travel=Math.max(travel,1-smooth(p,.80,.91));if(p>0&&empty)travel=Math.max(travel,pulse(p,.72,.80,.88,.96));view.bolt.position.z+=travel*view.actionTravel;}
  if(view.mag){const pull=pulse(p,.13,.32,.53,.76);view.mag.position.copy(view.magBase);view.mag.position.y-=pull*(id==='machineGun'?.30:.27);view.mag.rotation.z=(id==='semiShotgun'||id==='sniper')?pull*-.14:0;}
  if(view.cover)view.cover.rotation.x=-pulse(p,.08,.22,.76,.92)*1.28;
  if(view.belt)view.belt.visible=!(p>.24&&p<.72);
  if(view.shell){view.shell.visible=p>.13&&p<.84;const reach=smooth(p,.14,.58),withdraw=smooth(p,.72,.93);view.shell.position.set(-.06*(1-reach),-.24+(reach-withdraw)*.12,-.13);view.shell.rotation.x=.32;}
  if(id==='shotgun'){const pump=shot;view.pump.position.z=-.46+pump*.135;if(view.bolt)view.bolt.position.z=view.actionBase.z+pump*.135;}
  if(id==='grenadeLauncher'){const open=pulse(p,.07,.23,.74,.94);view.hinge.rotation.x=-open*.64;view.round.visible=p>.26&&p<.76;view.round.position.set(-.035*(1-smooth(p,.3,.53)),.02,-.21+(.18*(1-smooth(p,.3,.68))));}
  if(id==='rpg'){view.round.visible=loaded||p>.27;view.round.position.copy(view.roundBase);view.round.position.z-=pulse(p,.24,.35,.61,.84)*.40;view.round.position.x-=pulse(p,.24,.35,.61,.84)*.14;}
}
