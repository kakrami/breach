// Own meshes shared by armory previews and world effects.
export function infectionModel(G,id){
 const root=new G.Group();root.userData.menuOwned=true;
 const mat=(color,emissive=0)=>new G.MeshStandardMaterial({color,roughness:.6,metalness:.15,emissive,emissiveIntensity:.65});
 const skin=mat(0x7d9271),bone=mat(0xc6bea3),dark=mat(0x253331),steel=mat(0x879997),glow=mat(id==='frost'?0x74ccf0:id==='fire'?0xe97b39:0xb9da70,id==='frost'?0x285b7d:id==='fire'?0x67240c:0x284414);
 const add=(geo,m,x=0,y=0,z=0)=>{const n=new G.Mesh(geo,m);n.position.set(x,y,z);root.add(n);return n;},box=(w,h,d,m,x=0,y=0,z=0)=>add(new G.BoxGeometry(w,h,d),m,x,y,z);
 if(id.startsWith('class_')){
  const kind=id.slice(6),width=kind==='brute'?.64:kind==='runner'?.34:.46;
  box(width,.52,.25,dark,0,-.04,0);box(.3,.3,.28,skin,0,.39,0);box(.2,.055,.018,bone,0,.31,-.15);
  for(const sign of [-1,1]){box(.07,.04,.018,glow,sign*.08,.42,-.15);const arm=box(.13,.49,.15,skin,sign*(width/2+.09),-.04,-.04);arm.rotation.z=sign*.18;box(.15,.34,.19,dark,sign*.13,-.46,0);for(let i=0;i<3;i++){const claw=add(new G.ConeGeometry(.018,.13,5),bone,sign*(width/2+.12)+(i-1)*.027,-.3,-.12);claw.rotation.x=Math.PI;}}
  if(kind==='stalker')for(let i=0;i<3;i++)box(.24,.024,.018,glow,0,.12-i*.1,-.14);
  if(kind==='brute')add(new G.IcosahedronGeometry(.11,1),glow,0,.07,-.15);
  if(kind==='leaper'){root.scale.y=1.1;root.scale.x=.88;}
 }else if(id==='armor'||id==='carapace'){
  box(.55,.6,.18,dark);for(let i=0;i<4;i++)box(.61-i*.055,.085,.12,id==='carapace'?skin:steel,0,.23-i*.14,-.11);box(.12,.45,.03,glow,0,0,-.185);
 }else if(id==='barricade'){for(const x of [-.3,.3])box(.06,.65,.07,steel,x,0,0);for(const y of [-.2,0,.2])box(.72,.12,.07,bone,0,y,0);
 }else if(id==='antidote'||id==='purge'){
  add(new G.CylinderGeometry(.06,.06,.4,12),glow);box(.025,.15,.025,steel,0,.27,0);box(.18,.035,.035,bone,0,-.25,0);
 }else{
  add(new G.IcosahedronGeometry(id==='flare'?.12:.21,1),glow);for(const sign of [-1,1])box(.07,.3,.23,dark,sign*.13,0,0);box(.065,.13,.07,steel,0,.25,0);const ring=add(new G.TorusGeometry(.055,.012,5,16),steel,.06,.31,0);ring.rotation.y=.4;
 }return root;
}
export function createInfectionVisuals(){
 let G=null,scene=null,effectsRoot=null,effectsKey='',lamp=null,lampCamera=null;
 const dispose=n=>{if(!n)return;n.parent?.remove(n);const mats=new Set(),geos=new Set();n.traverse(x=>{if(x.geometry)geos.add(x.geometry);if(x.material)for(const m of Array.isArray(x.material)?x.material:[x.material])mats.add(m);});for(const g of geos)g.dispose();for(const m of mats)m.dispose();};
 function update({G:engine,world,view,active,alive,state,remotes,actorStates,now}){
  G=engine;scene=world;if(!G||!scene||!view)return;
  if(lampCamera!==view){dispose(lamp);lamp=new G.SpotLight(0xdde9d3,15,30,Math.PI/5,.5,1.2);lamp.position.set(0,0,-.15);view.add(lamp);view.add(lamp.target);lamp.target.position.set(0,0,-10);lampCamera=view;}
  lamp.visible=active&&alive&&!state.infected; // Human flashlight; infected have ambient night vision.
  for(const [id,r]of remotes){const a=actorStates.get(id),kind=active&&a?.infected&&r.hp>0?(a.infectionReadyAt>now?'turning':a.carapaceUntil>now?'carapace':a.abilityUntil>now?'ability':a.frozenUntil>now?'frost':a.burningUntil>now?'fire':''):'';
   r.group.userData.infectionClass=a?.infectionClass||'';if(r.body){const width=a?.infected?(a.infectionClass==='brute'?1.2:a.infectionClass==='stalker'?.83:.95):1;r.body.scale.x=width;}if(r.head)r.head.scale.y=a?.infected&&a.infectionClass==='leaper'?1.12:1;
   if(r.infectionAura?.userData.kind!==kind){dispose(r.infectionAura);r.infectionAura=null;if(kind){const color=kind==='turning'?0xe6dfb0:kind==='carapace'?0xc9ed79:kind==='ability'?0xdec592:kind==='frost'?0x70d5ff:0xff823f;
    const aura=new G.Group();aura.userData.kind=kind;const ring=new G.Mesh(new G.TorusGeometry(.48,.025,5,28),new G.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false}));ring.rotation.x=Math.PI/2;ring.position.y=.08;aura.add(ring);
    for(let i=0;i<5;i++){const n=new G.Mesh(new G.IcosahedronGeometry(.10,0),new G.MeshBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false})),angle=i*Math.PI*2/5;n.position.set(Math.cos(angle)*.39,.35+i*.22,Math.sin(angle)*.39);aura.add(n);}r.group.add(aura);r.infectionAura=aura;}}
   if(r.infectionAura){r.infectionAura.rotation.y=now*.0015;r.infectionAura.children.forEach((n,i)=>{if(i)n.scale.setScalar(.8+.2*Math.sin(now*.009+i));});}
  }
 }
 function effects(items=[]){if(!G||!scene)return;const key=JSON.stringify(items.map(i=>[i.id,i.kind]));
  if(key!==effectsKey){dispose(effectsRoot);effectsRoot=new G.Group();effectsKey=key;scene.add(effectsRoot);for(const e of items){let model;
   if(e.kind==='projectile'){model=infectionModel(G,e.type);model.scale.setScalar(.6);}
   else{model=new G.Group();const color=e.kind==='fire'?0xff7137:e.kind==='frost'?0x7fddff:e.kind==='flare'?0xf5d793:0xb5d16a;
    const ring=new G.Mesh(new G.RingGeometry(Math.max(.1,e.radius-.2),e.radius,40),new G.MeshBasicMaterial({color,transparent:true,opacity:.55,side:G.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.04;model.add(ring);
    if(e.kind==='flare'){model.add(new G.PointLight(color,20,18,1.5));const core=new G.Mesh(new G.IcosahedronGeometry(.12,1),new G.MeshBasicMaterial({color}));core.position.y=.2;model.add(core);}
    else for(let i=0;i<7;i++){const mat=new G.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.5,transparent:true,opacity:.2,depthWrite:false}),n=new G.Mesh(new G.IcosahedronGeometry(1,1),mat),angle=i*2.399;n.scale.set(e.radius*.35,e.kind==='fire'?.9:.5,e.radius*.35);n.position.set(Math.cos(angle)*e.radius*.55,.4,Math.sin(angle)*e.radius*.55);model.add(n);}
   }model.userData.effectId=e.id;effectsRoot.add(model);}}
  for(const n of effectsRoot.children){const e=items.find(v=>v.id===n.userData.effectId);if(e)n.position.set(e.x,e.y,e.z);}
 }
 return {update,effects,reveal(){},clear(){dispose(effectsRoot);effectsRoot=null;effectsKey='';if(lamp)lamp.visible=false;}};
}
