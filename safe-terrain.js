// One bounded brush transaction. Existing structures retain their terrain samples.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function safeTerrainBrush({terrain,objects=[],x,z,tool='raise',radius=12,power=.35,level=0,baseHeight=()=>0}){
 const n=terrain.size,cell=terrain.extent*2/(n-1),before=terrain.values,next=new Float64Array(before),absolute=new Float64Array(before.length),mutable=new Set();
 const pads=objects.filter(o=>o.type!=='natural'&&o.type!=='flow').map(o=>({...o,w:o.w||o.width||o.base||o.radius*2||2,d:o.d||o.width||o.base||o.radius*2||2}));
 const locked=(wx,wz)=>pads.some(o=>{const a=(o.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=wx-o.x,dz=wz-o.z,pad=6+cell*1.5;return Math.abs(dx*c+dz*s)<=o.w/2+pad&&Math.abs(-dx*s+dz*c)<=o.d/2+pad;});
 for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){const i=iz*n+ix,wx=-terrain.extent+ix*cell,wz=-terrain.extent+iz*cell;absolute[i]=before[i]+baseHeight(wx,wz);const dist=Math.hypot(wx-x,wz-z);if(dist<radius&&!locked(wx,wz))mutable.add(i);}
 for(const i of mutable){const ix=i%n,iz=Math.floor(i/n),wx=-terrain.extent+ix*cell,wz=-terrain.extent+iz*cell,q=1-Math.hypot(wx-x,wz-z)/radius,weight=q*q*(3-2*q),h=absolute[i];let delta=0;
  if(tool==='raise'||tool==='lower')delta=(tool==='raise'?1:-1)*Math.min(.5,power)*weight;
  else if(tool==='level'||tool==='flatten')delta=(level-h)*.25*weight;
  else if(tool==='smooth'){let sum=0,count=0;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){sum+=absolute[clamp(iz+dz,0,n-1)*n+clamp(ix+dx,0,n-1)];count++;}delta=(sum/count-h)*.35*weight;}
  // Imported terrain outside the range can be smoothed toward it, never made worse.
  next[i]=before[i]+clamp(h+delta,Math.min(-6,h),Math.max(6,h))-h;
 }
 // Bound both grid derivatives, so diagonal slopes also stay walkable. Use
 // original neighbours as bounds: changing two adjacent samples cannot widen
 // their old difference. Final global interpolation guarantees all edge bounds.
 let fraction=1;const allowed=cell*.30;
 for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){const i=iz*n+ix;for(const j of [ix+1<n?i+1:-1,iz+1<n?i+n:-1]){if(j<0)continue;const old=absolute[i]-absolute[j],delta=(next[i]-before[i])-(next[j]-before[j]),limit=Math.max(allowed,Math.abs(old));if(delta>0)fraction=Math.min(fraction,(limit-old)/delta);if(delta<0)fraction=Math.min(fraction,(-limit-old)/delta);}}
 fraction=clamp(fraction,0,1);const changes=[];for(const i of mutable){const after=Math.fround(before[i]+(next[i]-before[i])*fraction);if(Math.abs(after-before[i])>.00001)changes.push({i,before:before[i],after});}return changes;
}
