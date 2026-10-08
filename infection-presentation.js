// World presentation owns only meshes; the shared compiler supplies every solid part.
export function createInfectionFieldPresentation(){
 let root=null,parent=null,key='',G=null;
 function dispose(){if(root){root.parent?.remove(root);const mats=new Set();root.traverse(n=>{n.geometry?.dispose();if(n.material)mats.add(n.material);});for(const m of mats)m.dispose();}root=null;key='';}
 function sync(engine,world,compiled,state){if(!engine||!world)return;G=engine;const next=JSON.stringify([state.sockets,state.barricades,state.supplies,state.ladders]);if(world!==parent){dispose();parent=world;}if(next===key)return;dispose();key=next;root=new G.Group();parent.add(root);
  const mat=(color,emissive=0)=>new G.MeshStandardMaterial({color,roughness:.85,emissive,emissiveIntensity:.5});
  const box=(x,y,z,w,h,d,m,rot=0)=>{const n=new G.Mesh(new G.BoxGeometry(w,h,d),m);n.position.set(x,y,z);n.rotation.y=-rot*Math.PI/180;root.add(n);return n;};
  for(const p of compiled?.props||[]){const m=mat(p.hp/p.maxHp<.4?0x665042:0x91724b);for(const part of p.geometry.parts)box(part.x,(part.minY+part.maxY)/2,part.z,part.w,part.maxY-part.minY,part.d,m,part.rot);}
  for(const p of state.sockets||[]){if(state.barricades?.some(b=>b.socket===p.id&&b.hp>0))continue;const ring=new G.Mesh(new G.RingGeometry(.7,.8,24),new G.MeshBasicMaterial({color:0xc0d788,transparent:true,opacity:.3,side:G.DoubleSide,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,p.y+.025,p.z);root.add(ring);}
  for(const s of state.supplies||[]){const m=mat(0x3e5045),accent=mat(0xcce997,0x597d30);box(s.x,s.y+.28,s.z,.8,.56,.6,m);box(s.x,s.y+.57,s.z,.82,.06,.62,accent);box(s.x,s.y+.31,s.z-.31,.13,.3,.02,accent);const n=new G.Mesh(new G.CylinderGeometry(.025,.025,2.5,6),new G.MeshBasicMaterial({color:0xcce997,transparent:true,opacity:.6}));n.position.set(s.x,s.y+1.6,s.z);root.add(n);}
  for(const l of state.ladders||[]){const h=l.topY-l.bottomY,tx=l.nz,tz=-l.nx,m=mat(0x9d967b),rot=Math.atan2(tz,tx)*180/Math.PI;for(const side of [-1,1])box(l.x+tx*side*l.width*.43,l.bottomY+h/2,l.z+tz*side*l.width*.43,.07,h,.07,m);for(let y=.15;y<h;y+=.34)box(l.x,l.bottomY+y,l.z,l.width,.055,.07,m,rot);}
 }
 return {sync,dispose};
}
