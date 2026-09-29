// A brush changes local samples. Constraints restrict individual samples, never the whole stroke.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function terrainProtection(terrain,objects=[]){
 const cell=terrain.extent*2/(terrain.size-1);
 return objects.filter(o=>['building','elevation','ladder'].includes(o.type)||(o.type==='prop'&&Math.abs(o.yOffset||0)>.05)).map(o=>({...o,w:o.w||o.width||1,d:o.d||o.width||1,pad:cell*Math.SQRT2}));
}
export function protectedTerrainPoint(pads,x,z){return pads.some(o=>{const a=(o.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a),dx=x-o.x,dz=z-o.z;return Math.abs(dx*c+dz*s)<=o.w/2+o.pad&&Math.abs(-dx*s+dz*c)<=o.d/2+o.pad;});}
export function safeTerrainBrush({terrain,objects=[],x,z,tool='raise',radius=12,rate=2,seconds=.12,level=0,baseHeight=()=>0}){
 const n=terrain.size,cell=terrain.extent*2/(n-1),before=terrain.values,next=new Float64Array(before),absolute=new Float64Array(before.length),mutable=[],pads=terrainProtection(terrain,objects),amount=Math.max(0,rate)*Math.max(0,seconds);
 for(let iz=0;iz<n;iz++)for(let ix=0;ix<n;ix++){
  const i=iz*n+ix,wx=-terrain.extent+ix*cell,wz=-terrain.extent+iz*cell;absolute[i]=before[i]+baseHeight(wx,wz);
  if(Math.hypot(wx-x,wz-z)<radius&&!protectedTerrainPoint(pads,wx,wz))mutable.push(i);
 }
 for(const i of mutable){
  const ix=i%n,iz=Math.floor(i/n),wx=-terrain.extent+ix*cell,wz=-terrain.extent+iz*cell,q=1-Math.hypot(wx-x,wz-z)/radius,weight=q*q*(3-2*q),h=absolute[i];let delta=0;
  if(tool==='raise'||tool==='lower')delta=(tool==='raise'?1:-1)*amount*weight;
  else if(tool==='level'||tool==='flatten')delta=(level-h)*(1-Math.exp(-amount*weight));
  else if(tool==='smooth'){let sum=0,count=0;for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){sum+=absolute[clamp(iz+dz,0,n-1)*n+clamp(ix+dx,0,n-1)];count++;}delta=(sum/count-h)*(1-Math.exp(-amount*weight));}
  next[i]=before[i]+clamp(h+delta,Math.min(-6,h),Math.max(6,h))-h;
 }
 // Original neighbours supply independent local bounds. The half allowance
 // guarantees adjacent samples moving in opposite directions cannot exceed the edge limit.
 const changes=[];
 for(const i of mutable){const ix=i%n,iz=Math.floor(i/n),h=absolute[i];let lo=-Infinity,hi=Infinity;
  for(const j of [ix?i-1:-1,ix<n-1?i+1:-1,iz?i-n:-1,iz<n-1?i+n:-1])if(j>=0){const d=h-absolute[j],limit=Math.max(cell*.30,Math.abs(d));lo=Math.max(lo,(-limit-d)/2);hi=Math.min(hi,(limit-d)/2);}
  const after=Math.fround(before[i]+clamp(next[i]-before[i],lo,hi));if(Math.abs(after-before[i])>1e-7)changes.push({i,before:before[i],after});
 }
 return changes;
}
