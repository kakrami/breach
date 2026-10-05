import { BOSS_WEAKPOINT, bossAttackGeometry, bossWeakpointActive } from './moon-boss-rules.js?v=2.7.0';

const clamp01=n=>Math.max(0,Math.min(1,n));
const mix=(a,b,t)=>a+(b-a)*t;
function dispose(root){root.traverse(o=>{o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m?.dispose();});root.removeFromParent();}

// Pure scene construction: no input, camera, physics or network ownership.
export function createBossPresentation(THREE,remote){
  const {group,model,body,head}=remote,ravager=remote.bossKind==='ravager';
  body.scale.set(ravager?.86:1.3,ravager?1.08:1,ravager?.86:1.12);
  head.scale.set(ravager?.84:1.1,ravager?1.12:.84,ravager?.84:1.1);
  const detail=new THREE.Group();model.add(detail);
  const armor=new THREE.MeshStandardMaterial({color:ravager?0x423d4d:0x4a4934,roughness:.93,metalness:.12});
  for(const side of [-1,1]){
    const shoulder=new THREE.Mesh(new THREE.IcosahedronGeometry(ravager?.115:.18,0),armor);
    shoulder.position.set(side*.43,1.12,0);shoulder.scale.y=ravager?1.6:1;detail.add(shoulder);
    const jaw=new THREE.Mesh(new THREE.BoxGeometry(.09,.075,.12),armor);
    jaw.position.set(side*.15,1.56,-.16);jaw.rotation.z=side*.2;detail.add(jaw);
  }
  if(!ravager){const hump=new THREE.Mesh(new THREE.SphereGeometry(.22,10,8),armor);hump.position.set(0,1.15,.15);hump.scale.y=1.4;detail.add(hump);}
  const coreMaterial=new THREE.MeshStandardMaterial({color:0x6c5145,emissive:0x1e0a04,emissiveIntensity:.1,roughness:.42,metalness:.35});
  const core=new THREE.Mesh(new THREE.SphereGeometry(BOSS_WEAKPOINT.radius,16,12),coreMaterial);
  core.position.set(0,BOSS_WEAKPOINT.y,BOSS_WEAKPOINT.z);core.userData.bossWeakpoint=true;detail.add(core);
  // This aperture fits inside the server's chest sphere, even when closed.
  const aperture=new THREE.Mesh(new THREE.TorusGeometry(.125,.02,8,20),armor);
  aperture.position.set(0,BOSS_WEAKPOINT.y,BOSS_WEAKPOINT.z-.105);detail.add(aperture);
  const tell=new THREE.Group();group.add(tell);tell.visible=false;
  const warning=new THREE.MeshBasicMaterial({color:ravager?0xff526e:0xffaa45,transparent:true,opacity:.6,side:THREE.DoubleSide,depthWrite:false});
  const circle=new THREE.Mesh(new THREE.RingGeometry(.94,1,48),warning);circle.rotation.x=-Math.PI/2;circle.position.y=.055;tell.add(circle);
  const fill=new THREE.Mesh(new THREE.CircleGeometry(1,48),warning.clone());fill.rotation.x=-Math.PI/2;fill.position.y=.05;tell.add(fill);
  const lane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),warning.clone());lane.rotation.x=-Math.PI/2;lane.position.y=.055;tell.add(lane);
  const rails=[];for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.PlaneGeometry(.07,1),warning);rail.rotation.x=-Math.PI/2;rail.position.y=.06;rail.userData.side=side;tell.add(rail);rails.push(rail);}
  const chevrons=[];for(let i=0;i<4;i++){const mark=new THREE.Mesh(new THREE.ConeGeometry(.18,.32,3),warning);mark.rotation.x=-Math.PI/2;mark.position.y=.075;tell.add(mark);chevrons.push(mark);}
  return {detail,core,aperture,tell,circle,fill,lane,rails,chevrons,lastPhase:''};
}

export function updateBossPresentation(remote,now){
  const view=remote.bossView;if(!view)return;
  const alive=remote.hp>0,phase=remote.bossPhase||'chase',wind=phase==='windup',attack=phase==='attack';
  const exposed=bossWeakpointActive(remote,now),span=Math.max(1,(remote.bossPhaseEndsAt||now)-(remote.bossPhaseStartedAt||now)),p=clamp01((now-(remote.bossPhaseStartedAt||now))/span);
  view.core.material.color.set(exposed?0x93fff0:0x6c5145);view.core.material.emissive.set(exposed?0x29edcf:0x1e0a04);view.core.material.emissiveIntensity=exposed?1.5+Math.sin(now*.014)*.35:.1;
  view.tell.visible=alive&&(wind||attack)&&now<remote.bossPhaseEndsAt;const shape=bossAttackGeometry({...remote,x:remote.group.position.x,y:remote.group.position.y,z:remote.group.position.z});
  const lane=shape.kind==='lane';view.circle.visible=view.fill.visible=!lane;view.lane.visible=lane;view.rails.forEach(r=>r.visible=lane);view.chevrons.forEach(r=>r.visible=lane);
  // Tell is a sibling of the scaled body and uses world-meter attack dimensions.
  view.tell.rotation.y=lane?(remote.bossAttackYaw||0)-remote.group.rotation.y:0;
  const opacity=attack?.75:.35+p*.55;view.circle.material.opacity=opacity;view.fill.material.opacity=attack?.2:.06+p*.12;
  if(lane){const length=Math.max(.01,shape.length);view.lane.scale.set(shape.width,length,1);view.lane.position.z=-length/2;view.lane.material.opacity=attack?.26:.08+p*.12;view.rails.forEach(r=>{r.scale.y=length;r.position.set(r.userData.side*shape.width/2,.06,-length/2);});view.chevrons.forEach((r,i)=>r.position.z=-length*(i+1)/5);}
  else{view.circle.scale.setScalar(shape.radius);view.fill.scale.setScalar(shape.radius);}
  if(alive){
    // Keep the torso/core upright: rotating its parent would move a hittable
    // weakpoint away from the server sphere. Limbs alone express anticipation.
    remote.model.rotation.x=0;remote.body.rotation.x=0;remote.head.rotation.x=0;
    if(wind){remote.armL.rotation.x=remote.armR.rotation.x=lane?-1.4-p*.45:-1.7-p*1.1;remote.armL.rotation.z=lane?-.32:-.16;remote.armR.rotation.z=lane?.32:.16;}
    else if(attack){remote.armL.rotation.x=remote.armR.rotation.x=lane?-1.7:-2.8+p*2.5;}
    else if(phase==='recovery'){remote.armL.rotation.x=remote.armR.rotation.x=-.2;remote.armL.rotation.z=-.32;remote.armR.rotation.z=.32;}
  }
  return {phase,exposed};
}

export function createMoonSupplyPresentation(THREE){
  const root=new THREE.Group(),craft=new THREE.Group(),beamRoot=new THREE.Group(),marker=new THREE.Group(),pickups=new Map();root.add(craft,beamRoot,marker);
  const metal=new THREE.MeshStandardMaterial({color:0x79839a,roughness:.38,metalness:.72}),light=new THREE.MeshBasicMaterial({color:0x8ffff2});
  const hull=new THREE.Mesh(new THREE.SphereGeometry(3.4,24,12),metal);hull.scale.y=.22;craft.add(hull);
  const canopy=new THREE.Mesh(new THREE.SphereGeometry(1.25,16,10),new THREE.MeshStandardMaterial({color:0x9edfea,emissive:0x204348,emissiveIntensity:.6,metalness:.3,roughness:.2}));canopy.position.y=.35;canopy.scale.y=.7;craft.add(canopy);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(2.8,.065,6,32),light);rim.rotation.x=Math.PI/2;craft.add(rim);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(.45,1.6,1,24,1,true),new THREE.MeshBasicMaterial({color:0x8ffff2,transparent:true,opacity:.14,side:THREE.DoubleSide,depthWrite:false}));beamRoot.add(beam);
  const landing=new THREE.Mesh(new THREE.RingGeometry(1.45,1.6,40),new THREE.MeshBasicMaterial({color:0xf5d782,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));landing.rotation.x=-Math.PI/2;marker.add(landing);
  let data={flyby:null,pickups:[]};
  function sync(snapshot={}){
    data={flyby:snapshot.flyby||null,pickups:Array.isArray(snapshot.pickups)?snapshot.pickups:[]};const ids=new Set(data.pickups.map(p=>p.id));
    for(const [id,view] of pickups)if(!ids.has(id)){dispose(view.root);pickups.delete(id);}
    for(const p of data.pickups){if(pickups.has(p.id))continue;const g=new THREE.Group(),color=p.kind==='heal'?0x98efb4:0x83c9ff;
      const box=new THREE.Mesh(new THREE.BoxGeometry(.65,.46,.5),new THREE.MeshStandardMaterial({color:0x303c4b,emissive:color,emissiveIntensity:.16,roughness:.7}));g.add(box);
      const glyph=new THREE.MeshBasicMaterial({color});if(p.kind==='heal'){for(const size of [[.33,.09,.025],[.09,.33,.025]]){const bar=new THREE.Mesh(new THREE.BoxGeometry(...size),glyph);bar.position.z=-.263;g.add(bar);}}
      else for(const x of [-.15,0,.15]){const round=new THREE.Mesh(new THREE.CapsuleGeometry(.035,.18,3,6),glyph);round.position.set(x,0,-.275);g.add(round);}
      const ring=new THREE.Mesh(new THREE.RingGeometry(.68,.76,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,side:THREE.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=-.4;g.add(ring);
      root.add(g);pickups.set(p.id,{root:g,ring,source:p});
    }
  }
  function update(now){
    const f=data.flyby,active=f&&now>=f.startedAt&&now<f.endsAt;craft.visible=!!active;beamRoot.visible=!!active&&now>=f.beamAt&&now<f.dropAt+350;marker.visible=!!active&&now<f.dropAt;
    if(active){const approach=now<f.beamAt,depart=now>=f.dropAt,t=approach?clamp01((now-f.startedAt)/(f.beamAt-f.startedAt)):depart?clamp01((now-f.dropAt)/(f.endsAt-f.dropAt)):1;
      craft.position.set(approach?mix(f.fromX,f.x,t):depart?mix(f.x,f.toX,t):f.x,f.y+20+(depart?t*t*16:0),approach?mix(f.fromZ,f.z,t):depart?mix(f.z,f.toZ,t):f.z);craft.rotation.z=approach?.08:depart?-.12:Math.sin(now*.001)*.015;
      beamRoot.position.set(f.x,f.y+10,f.z);beam.scale.y=20;marker.position.set(f.x,f.y+.06,f.z);landing.material.opacity=.55+.35*Math.sin(now*.008);
    }
    for(const view of pickups.values()){const p=view.source;view.root.visible=now<p.expiresAt;view.root.position.set(p.x,p.y+.46+Math.sin(now*.002)*.035,p.z);view.root.rotation.y=now*.00035;}
    return active?(now<f.beamAt?'approach':now<f.dropAt?'beam':'depart'):'idle';
  }
  sync();update(0);return {root,craft,beamRoot,marker,pickups,sync,update,dispose:()=>dispose(root)};
}
