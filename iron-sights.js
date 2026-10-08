// Physical sight geometry shared by gameplay, armory, remote players and replays.
// A/B/C refer to the approved Breach concept sheets, not interchangeable presets.
export const SELECTED_IRON_SIGHTS=Object.freeze({pistol:'Glock 19 B',assault:'FN SCAR-L B',ump:'HK UMP45 A',machineGun:'M249 C',akimbo1887:'Winchester 1887 Dual A',shotgun:'Remington 870 C',semiShotgun:'Saiga-12 A',battleRifle:'Glock 19 B',sniper:'SVD Dragunov C',grenadeLauncher:'M79 A',rpg:'RPG-7 B'});

export function installWeaponIronSights(T,v){
  const s=v.sight;if(!s)return;
  const root=v.group,id=v.id,material=v.sightMaterial||new T.MeshStandardMaterial({color:0x252c30,roughness:.62,metalness:.45});
  const rear=new T.Group(),front=new T.Group();rear.name='iron-rear-'+id;front.name='iron-front-'+id;
  const x=s.x||0,pitch=s.pitch||0,y=s.sightY,fy=y+(s.frontZ-s.rearZ)*Math.tan(pitch);
  rear.position.set(x,y,s.rearZ);front.position.set(x,fy,s.frontZ);root.add(rear,front);
  const mesh=(name,geo,parent,mat=material)=>{const o=new T.Mesh(geo,mat);o.name=name;parent.add(o);return o;};
  const box=(name,w,h,d,x,y,z,parent,mat)=>{const o=mesh(name,new T.BoxGeometry(w,h,d),parent,mat);o.position.set(x,y,z);return o;};
  const plate=(name,points,depth,parent,holes=[])=>{
    const path=(a,Type)=>{const p=new Type();a.forEach(([x,y],i)=>i?p.lineTo(x,y):p.moveTo(x,y));p.closePath();return p;};
    const shape=path(points,T.Shape);shape.holes=holes.map(a=>path(a,T.Path));
    const geo=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:.0009,bevelThickness:.0008,bevelSegments:1,steps:1,curveSegments:12});geo.translate(0,0,-depth/2);return mesh(name,geo,parent);
  };
  const notch=(name,{width=.088,gap=.026,top=.003,bottom=-.038,floor=-.024,rounded=false}={},parent=rear)=>{
    const inner=rounded?[[gap/2,top],[gap/2, floor+.010],[gap*.43,floor+.004],[gap*.29,floor+.001],[0,floor],[-gap*.29,floor+.001],[-gap*.43,floor+.004],[-gap/2,floor+.010],[-gap/2,top]]:[[gap/2,top],[gap/2,floor],[-gap/2,floor],[-gap/2,top]];
    return plate(name,[[-width/2,bottom],[width/2,bottom],[width*.49,top-.012],[width*.41,top],...inner,[-width*.41,top],[-width*.49,top-.012]],.019,parent);
  };
  const post=(name='front-blade',width=.013,triangular=false)=>{
    const bottom=Math.min(-.017,s.frontMountY-fy);box('front-foot',.031,.009,.024,0,bottom+.0045,0,front);
    plate(name,[[-width/2,bottom+.007],[width/2,bottom+.007],[triangular?0:width*.30,0],[-(triangular?0:width*.30),0]],.015,front);
  };
  const bead=()=>{
    const base=s.frontMountY-fy;box('bead-pedestal',.013,Math.max(.005,-base-.005),.018,0,(base-.005)/2,0,front);
    const brass=new T.MeshStandardMaterial({color:0xddba66,roughness:.28,metalness:.62});mesh('brass-bead',new T.SphereGeometry(.0055,12,8),front,brass);
  };
  const roundedFrame=(name,width,height,bottom,parent=rear)=>{
    const w=width/2,r=.009,top=bottom+height,t=.006;
    const outline=[[-w,bottom],[w,bottom],[w,top-r],[w-r*.3,top-r*.3],[w-r,top],[-w+r,top],[-w+r*.3,top-r*.3],[-w,top-r]];
    const hole=[[-w+t,bottom+t],[-w+t,top-r],[-w+r,top-t],[w-r,top-t],[w-t,top-r],[w-t,bottom+t]];
    return plate(name,outline,.016,parent,[hole]);
  };
  if(id==='pistol'||id==='battleRifle'){
    notch('framed-rounded-U',{width:.092,gap:.030,top:.004,bottom:-.029,floor:-.016,rounded:true});post('square-front-blade',.015);
    const white=new T.MeshStandardMaterial({color:0xf3f1de,roughness:.65,metalness:0});
    for(const side of [-1,1])box('rear-white-square',.006,.006,.001,side*.026,-.001,.0106,rear,white);
    box('front-white-square',.0058,.006,.001,0,-.005,.0086,front,white);
  }else if(id==='assault'){
    const ring=mesh('round-rear-aperture',new T.TorusGeometry(.027,.0045,8,32),rear);ring.position.y=.009;
    box('aperture-stem',.020,.014,.023,0,-.025,0,rear);box('rear-crossbar',.093,.017,.031,0,-.037,0,rear);
    for(const side of [-1,1]){box('rear-protective-ear',.013,.044,.027,side*.044,-.017,0,rear);const dial=mesh('rear-adjustment-dial',new T.CylinderGeometry(.018,.018,.010,16),rear);dial.rotation.z=Math.PI/2;dial.position.set(side*.057,-.031,0);}
    post();
  }else if(id==='ump'){
    notch('open-wide-U',{width:.093,gap:.038,top:.006,bottom:-.049,floor:-.029});post('hooded-front-post',.012);
    roundedFrame('front-protective-loop',.043,.050,-.026,front);
  }else if(id==='machineGun'){
    notch('minimal-wide-notch',{width:.104,gap:.040,top:.003,bottom:-.036,floor:-.024});post('unhooded-front-blade',.012);
  }else if(id==='akimbo1887'){
    // Dual-wield remains a hip-fire pair. Each physical barrel has its own bead.
    bead();
  }else if(id==='shotgun'){
    notch('low-receiver-notch',{width:.058,gap:.023,top:-.018,bottom:-.031,floor:-.024});bead();
  }else if(id==='semiShotgun'){
    notch('open-sculpted-U',{width:.091,gap:.034,top:.004,bottom:-.041,floor:-.026,rounded:true});post('front-post',.013);
    for(const side of [-1,1])plate('front-protective-ear',[[side*.011,-.036],[side*.020,-.036],[side*.018,.010],[side*.014,.013]],.014,front);
  }else if(id==='sniper'){
    notch('minimal-low-notch',{width:.078,gap:.026,top:.003,bottom:-.023,floor:-.010});post('unhooded-front-blade',.011);
  }else if(id==='grenadeLauncher'){
    // The bottom aperture stays clear; upper rungs are real model geometry.
    box('ladder-left',.009,.154,.018,-.031,.050,0,rear);box('ladder-right',.009,.154,.018,.031,.050,0,rear);
    for(const h of [-.025,.035,.080,.124])box('ladder-rung',.057,.007,.018,0,h,0,rear);
    box('ladder-hinge',.084,.017,.030,0,-.034,0,rear);post('launcher-front-post',.015);
  }else if(id==='rpg'){
    roundedFrame('tall-rounded-launcher-frame',.054,.132,-.028);post('triangular-front-post',.022,true);
    for(const part of [rear,front])box('side-sight-bracket',Math.abs(x)+.018,.012,.028,-x/2,.084-(part===rear?y:fy),0,part);
    const dial=mesh('side-adjustment-dial',new T.CylinderGeometry(.019,.019,.011,16),rear);dial.rotation.z=Math.PI/2;dial.position.set(-.037,-.018,0);
  }
  // Posts remain grounded in the real receiver/barrel, without blocking the notch.
  if(id!=='akimbo1887'){
    const low=({pistol:-.028,battleRifle:-.028,assault:-.044,ump:-.048,machineGun:-.035,shotgun:-.030,semiShotgun:-.040,sniper:-.022,grenadeLauncher:-.041,rpg:-.027})[id];
    const base=s.rearMountY-y;if(base<low)box('rear-mount',id==='rpg'?.022:.046,low-base,.025,0,(base+low)/2,0,rear);
  }
  const parts=rear.children.length?[rear,front]:[front];if(!rear.children.length)root.remove(rear);
  root.userData.ironSightParts=parts;root.userData.frontSightParts=[front];root.userData.selectedIronSight=SELECTED_IRON_SIGHTS[id];
  root.userData.adsSightRear={x,y,z:s.rearZ};root.userData.adsSightTip={x,y:fy,z:s.frontZ};root.userData.adsSightY=y;
  root.userData.adsPose={x:-x,y:-(y*Math.cos(pitch)-s.rearZ*Math.sin(pitch)),z:s.eyeZ-(y*Math.sin(pitch)+s.rearZ*Math.cos(pitch)),rx:pitch,ry:0,rz:0};
  // Carry the sights with each weapon's existing action, preserving reload poses.
  const rearHost=id==='pistol'?v.bolt:id==='machineGun'?v.cover:id==='grenadeLauncher'?v.hinge:null;
  const frontHost=id==='pistol'?v.bolt:id==='grenadeLauncher'?v.hinge:null;
  root.updateMatrixWorld(true);if(rearHost)rearHost.attach(rear);if(frontHost)frontHost.attach(front);
  front.userData.baseSightZ=front.position.z;front.userData.baseSightY=front.position.y;
  return v;
}
