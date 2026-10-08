// One model for the armory, the local weapon and other players. Forward is -Z.
export function createBattleRifle(T) {
  const group=new T.Group();group.name='battleRifle';
  const material=(color,roughness=.58,metalness=.08)=>new T.MeshStandardMaterial({color,roughness,metalness});
  const orange=material(0xe87520),green=material(0x71bb13),dark=material(0x24272a,.72),rubber=material(0x101316,.9),red=material(0xaf263e),steel=material(0x555e63,.35,.7);
  dark.userData.preservePreviewTone=true;rubber.userData.preservePreviewTone=true;
  const mesh=(name,geometry,mat,parent=group)=>{const m=new T.Mesh(geometry,mat);m.name=name;parent.add(m);return m;};
  const box=(name,size,pos,mat,parent)=>{const m=mesh(name,new T.BoxGeometry(...size),mat,parent);m.position.set(...pos);return m;};
  const profile=(name,points,width,mat,bevel=.008)=>{
    const s=new T.Shape();points.forEach(([z,y],i)=>i?s.lineTo(-z,y):s.moveTo(-z,y));s.closePath();
    const g=new T.ExtrudeGeometry(s,{depth:width-2*bevel,bevelEnabled:bevel>0,bevelThickness:bevel,bevelSize:bevel,bevelSegments:2,steps:1,curveSegments:8});
    g.translate(0,0,-(width-2*bevel)/2);g.rotateY(Math.PI/2);return mesh(name,g,mat);
  };
  const tube=(name,radius,length,pos,mat,parent)=>{const m=mesh(name,new T.CylinderGeometry(radius,radius,length,16),mat,parent);m.rotation.x=Math.PI/2;m.position.set(...pos);return m;};
  const stock=profile('orange-stock',[[.13,.015],[.36,.055],[.52,.022],[.93,.022],[.96,-.285],[.87,-.32],[.54,-.205],[.41,-.26],[.29,-.19],[.19,-.09]],.145,orange,.016);
  profile('rubber-butt-pad',[[.932,.028],[.977,.02],[.995,-.278],[.953,-.301]],.158,rubber,.010);
  profile('orange-receiver',[[-.27,.105],[-.16,.15],[.05,.13],[.18,.072],[.23,-.025],[.10,-.085],[-.23,-.074]],.165,orange,.014);
  // The slim orange trigger guard is a real opening, not a solid block.
  const guard=new T.Shape();guard.moveTo(-.13,-.06);guard.lineTo(.13,-.06);guard.lineTo(.09,-.20);guard.lineTo(-.08,-.20);guard.closePath();
  const hole=new T.Path();hole.moveTo(-.085,-.09);hole.lineTo(-.057,-.167);hole.lineTo(.059,-.167);hole.lineTo(.083,-.09);hole.closePath();guard.holes.push(hole);
  const gg=new T.ExtrudeGeometry(guard,{depth:.026,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:2,steps:1});gg.translate(0,0,-.013);gg.rotateY(Math.PI/2);mesh('orange-trigger-guard',gg,orange);
  const trigger=profile('red-trigger',[[.014,-.070],[.002,-.098],[-.009,-.143],[.002,-.159],[.021,-.135],[.030,-.073]],.023,red,.003);
  const barrel=tube('green-upper-shroud',.062,1.02,[0,.042,-.755],green);
  tube('green-lower-shroud',.049,.98,[0,-.050,-.772],green);
  profile('green-top-rail',[[-.11,.157],[-.12,.190],[-.35,.190],[-.49,.160],[-1.24,.160],[-1.29,.144],[-1.29,.098],[-.27,.108]],.112,green,.006);
  for(let i=0;i<9;i++)box('rail-tooth-'+i,[.117,.007,.023],[0,.198,-.15-i*.021],green);
  // Recessed side vents retain the reference's long, uninterrupted green rail.
  for(const side of [-1,1])for(let i=0;i<5;i++)box('rail-vent',[.003,.016,.102],[side*.060,.133,-.51-i*.143],dark);
  profile('black-fore-end',[[-.28,.065],[-.66,.066],[-.78,.009],[-.76,-.090],[-.68,-.132],[-.34,-.125],[-.26,-.067]],.186,dark,.016);
  for(const side of [-1,1]){
    for(let i=0;i<5;i++){const rib=box('fore-end-groove',[.007,.047,.012],[side*.099,-.084,-.37-i*.071],rubber);rib.rotation.x=-.38;}
    for(let i=0;i<3;i++)box('stock-vent',[.004,.010,.12-i*.02],[side*.081,-.063-i*.025,.73],dark);
    const panel=profile('stock-grip-panel',[[.18,-.026],[.31,.005],[.44,-.043],[.37,-.181],[.29,-.166]],.004,orange,.002);panel.position.x=side*.076;
    for(const [z,y]of [[.86,-.04],[.35,-.027],[-.18,.042],[-.53,-.02]]){const screw=mesh('recessed-screw',new T.CylinderGeometry(.008,.008,.003,8),dark);screw.rotation.z=Math.PI/2;screw.position.set(side*(z>0?.083:.100),y,z);}
  }
  for(const [y,r]of [[.042,.066],[-.050,.053]]){
    tube('orange-muzzle-cap',r,.071,[0,y,-1.295],orange);
    const ring=mesh('orange-muzzle-rim',new T.TorusGeometry(r-.012,.010,8,20),orange);ring.position.set(0,y,-1.333);
    const bore=mesh('dark-muzzle-inset',new T.CircleGeometry(r-.020,20),rubber);bore.rotation.y=Math.PI;bore.position.set(0,y,-1.334);
  }
  const mag=box('compact-magazine',[.100,.073,.125],[0,-.105,-.203],dark);
  box('orange-magazine-base',[.108,.018,.131],[0,-.043,0],orange,mag);
  // The bolt rotates about the bore before moving rearwards. Its knob stays on
  // the right, so the player's hand can follow the same moving anchor.
  const bolt=new T.Group();bolt.name='bolt';bolt.position.set(0,.094,-.035);group.add(bolt);
  tube('bolt-body',.020,.22,[0,0,0],steel,bolt);
  const stem=mesh('bolt-handle',new T.CylinderGeometry(.010,.012,.125,10),steel,bolt);stem.rotation.z=-Math.PI/2;stem.position.set(.080,-.014,.057);
  const knob=mesh('red-bolt-knob',new T.SphereGeometry(.025,12,8),red,bolt);knob.scale.set(1,.83,1.13);knob.position.set(.151,-.014,.057);
  const flash=mesh('muzzle-flash',new T.SphereGeometry(.07,8,6),new T.MeshBasicMaterial({color:0xffe6a6,transparent:true,opacity:0}));flash.position.set(0,.042,-1.355);flash.userData.previewSkip=true;
  // Batch fixed shell details by material. Bolts, magazines and attachment
  // anchors remain independent; remote rifles do not spend a draw per groove.
  const moving=new Set([bolt,mag,flash,stock,barrel,trigger]),batches=new Map();
  for(const part of [...group.children]){
    if(moving.has(part)||!part.isMesh)continue;
    part.updateMatrix();const geometry=part.geometry.index?part.geometry.toNonIndexed():part.geometry.clone();geometry.applyMatrix4(part.matrix);
    const batch=batches.get(part.material)||[];batch.push(geometry);batches.set(part.material,batch);
    group.remove(part);part.geometry.dispose();
  }
  for(const [mat,parts]of batches){
    const geometry=new T.BufferGeometry();
    for(const name of ['position','normal','uv']){
      const arrays=parts.map(g=>g.getAttribute(name)),merged=new Float32Array(arrays.reduce((n,a)=>n+a.array.length,0));let offset=0;
      for(const a of arrays){merged.set(a.array,offset);offset+=a.array.length;}
      geometry.setAttribute(name,new T.BufferAttribute(merged,arrays[0].itemSize));
    }
    geometry.computeBoundingSphere();mesh('shell-'+mat.color.getHexString(),geometry,mat);for(const g of parts)g.dispose();
  }
  return {group,bolt,mag,barrel,stock,trigger,flash,sightMaterial:dark};
}

const smooth=(p,a,b)=>{const t=Math.max(0,Math.min(1,(p-a)/(b-a)));return t*t*(3-2*t);};
export function battleRifleCycle(startedAt,now,duration=1000){
  if(!Number.isFinite(startedAt)||startedAt<=0)return {active:false,p:1,lift:0,travel:0,hand:0};
  const p=Math.max(0,Math.min(1,(now-startedAt)/Math.max(1,duration)));
  return {active:p<1,p,lift:smooth(p,.10,.25)*(1-smooth(p,.76,.91)),travel:smooth(p,.26,.44)*(1-smooth(p,.55,.75)),hand:smooth(p,.05,.18)*(1-smooth(p,.88,1))};
}
export function poseBattleRifle(view,cycle,reload=0){
  view.bolt.rotation.z=cycle.lift*1.12;
  view.bolt.position.z=-.035+cycle.travel*.195;
  const t=Math.max(0,Math.min(1,(reload-.12)/.60));
  view.mag.position.y=-.105-Math.sin(Math.PI*t)*.23;
}
