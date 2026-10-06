// Shared actual meshes for the shop, first-person equipment and remote actors.
export function infectionModel(G,id){
 const root=new G.Group();root.userData.menuOwned=true;
 const mat=(color,metalness=.15,roughness=.58,emissive=0)=>new G.MeshStandardMaterial({color,metalness,roughness,emissive,emissiveIntensity:.7});
 const shell=mat(0x35443c),bone=mat(0xc5b990),dark=mat(0x152220,.5),vein=mat(0x87ba5c,.05,.4,0x2b501c),steel=mat(0x73827b,.6,.35);
 const add=(geo,m,x=0,y=0,z=0)=>{const n=new G.Mesh(geo,m);n.position.set(x,y,z);root.add(n);return n;};
 const box=(w,h,d,m,x=0,y=0,z=0)=>add(new G.BoxGeometry(w,h,d),m,x,y,z);
 const sphere=(r,m,x=0,y=0,z=0)=>add(new G.IcosahedronGeometry(r,1),m,x,y,z);
 const tube=(r,length,m,x,y,z)=>{const n=add(new G.CylinderGeometry(r,r,length,12),m,x,y,z);n.rotation.x=Math.PI/2;return n;};
 if(id==='mutation'){
  box(.22,.22,.5,shell,0,0,.02);tube(.064,.58,dark,0,.01,-.48);tube(.087,.1,bone,0,.01,-.75);
  box(.14,.17,.28,bone,0,.015,.4);box(.075,.23,.1,dark,0,-.19,.11).rotation.x=-.25;
  sphere(.12,vein,.14,-.035,.07);box(.12,.21,.19,shell,0,-.2,-.13);
  for(let i=0;i<6;i++){box(.26,.025,.035,bone,0,.125,-.2+i*.075);tube(.011,.37,vein,(i%2?1:-1)*.095,.06,-.24);}
  box(.025,.06,.075,steel,0,.165,-.24);box(.05,.045,.05,dark,0,.05,-.73);
 }else if(id==='shield'){
  box(.68,1.05,.1,shell);for(const side of [-1,1]){box(.055,1.09,.14,bone,side*.34,0,0);box(.2,.025,.04,vein,side*.2,.1,-.065);}
  box(.65,.045,.13,bone,0,-.53,0);box(.65,.045,.13,bone,0,.53,0);box(.32,.11,.015,dark,0,.29,-.065);
  for(const x of [-.27,.27])for(const y of [-.42,.42])sphere(.033,steel,x,y,-.075);
  box(.045,.26,.07,steel,0,0,.1);for(let i=0;i<3;i++)box(.38-i*.06,.028,.02,vein,0,-.13-i*.11,-.065);
 }else if(id==='toxic'||id==='screech'){
  const r=id==='toxic'?.22:.27;sphere(r,shell);sphere(r*.78,vein,0,.02,-.085);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;box(.045,r*1.65,.07,bone,Math.sin(a)*r*.78,0,Math.cos(a)*r*.78).rotation.y=a;}
  tube(.09,.14,dark,0,.23,0);if(id==='toxic'){const n=add(new G.TorusGeometry(.055,.012,5,16),steel,.07,.3,0);n.rotation.y=.4;}else{tube(.16,.13,bone,0,0,-.29);tube(.11,.15,dark,0,0,-.31);}
 }else if(id==='claws'){
  box(.25,.15,.26,shell,0,0,.1);for(let i=0;i<4;i++){const x=(i-1.5)*.065;box(.045,.055,.15,bone,x,0,-.09);const n=add(new G.ConeGeometry(.026,.19,6),bone,x,-.025,-.25);n.rotation.x=-Math.PI/2-.25;}
 }else if(id==='carapace'||id==='armor'){
  box(.55,.6,.18,id==='armor'?dark:shell);for(let i=0;i<4;i++)box(.61-i*.055,.085,.12,id==='armor'?steel:bone,0,.23-i*.14,-.11);box(.12,.45,.05,vein,0,0,-.185);
 }else if(id==='medkit'){
  box(.5,.32,.24,shell);box(.28,.055,.016,bone,0,0,-.13);box(.055,.23,.018,bone,0,0,-.13);box(.2,.04,.1,dark,0,.19,0);
 }else {sphere(.2,shell);box(.065,.17,.07,steel,0,.22,0);}
 return root;
}
export function createInfectionVisuals(){
 let engine=null,scene=null,camera=null,local=null,localKey='',effectsRoot=null,effectsKey='',revealRoot=null;
 const remote=new Map();
 const dispose=n=>{if(!n)return;n.parent?.remove(n);const mats=new Set(),geos=new Set();n.traverse(x=>{if(x.geometry)geos.add(x.geometry);if(x.material)for(const m of Array.isArray(x.material)?x.material:[x.material])mats.add(m);});for(const g of geos)g.dispose();for(const m of mats)m.dispose();};
 function update({G,world,view,active,alive,state,remotes,actorStates,now,shotAt=0}){
  if(!G||!world||!view)return;engine=G;scene=world;camera=view;
  const kind=state.shielding?'shield':state.infectionWeapon==='mutation'?'mutation':'';
  if(kind!==localKey||local&&!local.parent){dispose(local);local=null;localKey=kind;if(kind){local=infectionModel(G,kind);view.add(local);}}
  if(local){local.visible=active&&alive;local.scale.setScalar(kind==='shield'?.65:.63);local.position.set(kind==='shield'?-.20:.23,kind==='shield'?-.2:-.26,kind==='shield'?-.68:-.56+Math.max(0,1-(now-shotAt)/110)*.035);local.rotation.set(0,0,0);}
  for(const [id,r]of remotes){const a=actorStates.get(id),key=a?.infected?(a.shielding?'shield':a.infectionWeapon==='mutation'?'mutation':''):'';let old=remote.get(id);
   if(old?.key!==key||old?.root!==r.group){if(old)dispose(old.model);remote.delete(id);if(key){const model=infectionModel(G,key);model.scale.setScalar(key==='shield'?1:.88);model.position.set(key==='shield'?0:.23,key==='shield'?.97:1.06,-.38);r.group.add(model);old={key,model,root:r.group};remote.set(id,old);}}
   if(old)old.model.visible=active&&r.hp>0;
  }for(const [id,r]of remote)if(!remotes.has(id)){dispose(r.model);remote.delete(id);}
 }
 function effects(items=[]){if(!engine||!scene)return;const G=engine,key=JSON.stringify(items.map(i=>[i.id,i.kind]));
  if(key!==effectsKey){dispose(effectsRoot);effectsRoot=new G.Group();effectsKey=key;scene.add(effectsRoot);for(const e of items){let model;if(e.kind==='bomb'){model=infectionModel(G,'toxic');model.scale.setScalar(.6);}else{model=new G.Group();for(let i=0;i<7;i++){const mat=new G.MeshStandardMaterial({color:0x8ca94e,emissive:0x334b1b,transparent:true,opacity:.13,depthWrite:false,roughness:1}),sphere=new G.Mesh(new G.IcosahedronGeometry(1,1),mat),angle=i*2.399;sphere.scale.set(2.5,1.3,2.5);sphere.position.set(Math.cos(angle)*2.2,.7+(i%2)*.45,Math.sin(angle)*2.2);model.add(sphere);}const rim=new G.Mesh(new G.RingGeometry(4.7,5,48),new G.MeshBasicMaterial({color:0xb5d16a,transparent:true,opacity:.45,side:G.DoubleSide,depthWrite:false}));rim.rotation.x=-Math.PI/2;rim.position.y=-.03;model.add(rim);}model.userData.effectId=e.id;effectsRoot.add(model);}}
  for(const n of effectsRoot.children){const e=items.find(v=>v.id===n.userData.effectId);if(e)n.position.set(e.x,e.y,e.z);}
 }
 function reveal(targets=[]){dispose(revealRoot);revealRoot=null;if(!engine||!scene||!targets.length)return;const G=engine;revealRoot=new G.Group();scene.add(revealRoot);for(const t of targets){const mat=new G.MeshBasicMaterial({color:0xff4a43,depthTest:false,transparent:true,opacity:.85}),n=new G.Mesh(new G.OctahedronGeometry(.22),mat);n.position.set(t.x,t.y+2.35,t.z);n.renderOrder=20;revealRoot.add(n);}}
 return {update,effects,reveal,clear(){dispose(local);local=null;localKey='';dispose(effectsRoot);effectsRoot=null;effectsKey='';dispose(revealRoot);revealRoot=null;for(const r of remote.values())dispose(r.model);remote.clear();}};
}
