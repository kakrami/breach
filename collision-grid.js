import { segmentAabbFirstT, segmentCylinderFirstT, segmentPyramidFirstT } from './collision-primitives.js?v=1.62.0';

export function createProjectileCollisionGrid({
  staticBoxes = [], staticColliders = null, pyramids = [], naturalObstacles = [], buildingParts = [],
  terrainHeight, naturalGroundBase, cellSize = 8, cellHeight = 3,
}) {
  const grid = new Map(), entries = [];
  const keyFor = (cx, cy, cz) => `${cx},${cy},${cz}`;
  const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
  const normalizeRot=v=>{let r=finite(v)%360;if(r<0)r+=360;return r;};
  const boxAabb=o=>{const a=normalizeRot(o.rot||0)*Math.PI/180,c=Math.abs(Math.cos(a)),sn=Math.abs(Math.sin(a)),hx=o.w/2*c+o.d/2*sn,hz=o.w/2*sn+o.d/2*c;return{minX:o.x-hx,maxX:o.x+hx,minZ:o.z-hz,maxZ:o.z+hz};};
  function segmentOrientedBoxFirstT(x1,y1,z1,x2,y2,z2,o,minY,maxY,r=0){const a=-normalizeRot(o.rot||0)*Math.PI/180,c=Math.cos(a),sn=Math.sin(a),rot=(x,z)=>{const dx=x-o.x,dz=z-o.z;return{x:dx*c-dz*sn,z:dx*sn+dz*c};},p1=rot(x1,z1),p2=rot(x2,z2);return segmentAabbFirstT(p1.x,y1,p1.z,p2.x,y2,p2.z,-o.w/2-r,o.w/2+r,minY-r,maxY+r,-o.d/2-r,o.d/2+r);}
  const add = (entry) => {
    entry.visit = 0; entries.push(entry);
    const minCX = Math.floor(entry.minX / cellSize), maxCX = Math.floor(entry.maxX / cellSize);
    const minCY = Math.floor(entry.minY / cellHeight), maxCY = Math.floor(entry.maxY / cellHeight);
    const minCZ = Math.floor(entry.minZ / cellSize), maxCZ = Math.floor(entry.maxZ / cellSize);
    for (let cx = minCX; cx <= maxCX; cx += 1) for (let cy = minCY; cy <= maxCY; cy += 1) for (let cz = minCZ; cz <= maxCZ; cz += 1) {
      const key = keyFor(cx, cy, cz), list = grid.get(key);
      if (list) list.push(entry); else grid.set(key, [entry]);
    }
  };

  if(Array.isArray(staticColliders)){
    for(const o of staticColliders){
      if(o.type==='round')add({type:'round',source:o,minX:o.x-o.r,maxX:o.x+o.r,minY:o.minY,maxY:o.maxY,minZ:o.z-o.r,maxZ:o.z+o.r});
      else{const a=boxAabb(o);add({type:'box',source:o,...a,minY:o.minY,maxY:o.maxY});}
    }
  }else for (const o of staticBoxes) { const base = terrainHeight(o.x, o.z)+finite(o.yOffset,0),a=boxAabb(o); add({ type:'box', source:o, ...a, minY:base, maxY:base+o.h }); }
  for (const o of pyramids) { const base = terrainHeight(o.x, o.z); add({ type:'pyramid', source:o, minX:o.x-o.base/2, maxX:o.x+o.base/2, minY:base, maxY:base+o.h, minZ:o.z-o.base/2, maxZ:o.z+o.base/2 }); }
  for (const o of naturalObstacles) { const base = naturalGroundBase(o.type, o.x, o.z, o.r); add({ type:'round', source:o, minX:o.x-o.r, maxX:o.x+o.r, minY:base, maxY:base+o.h+.18, minZ:o.z-o.r, maxZ:o.z+o.r }); }
  for (const p of buildingParts) if (p.projectileSolid !== false) { const a=boxAabb(p); add({ type:'box', source:p, ...a, minY:p.bottomY, maxY:p.topY }); }

  let stamp = 0;
  function firstHitT(x1, y1, z1, x2, y2, z2, radius = 0) {
    stamp = (stamp + 1) >>> 0;
    if (!stamp) { for (const e of entries) e.visit = 0; stamp = 1; }
    const r=Math.max(0,Number(radius)||0), minCX = Math.floor((Math.min(x1, x2)-r) / cellSize), maxCX = Math.floor((Math.max(x1, x2)+r) / cellSize);
    const minCY = Math.floor((Math.min(y1, y2)-r) / cellHeight), maxCY = Math.floor((Math.max(y1, y2)+r) / cellHeight);
    const minCZ = Math.floor((Math.min(z1, z2)-r) / cellSize), maxCZ = Math.floor((Math.max(z1, z2)+r) / cellSize);
    let best = null;
    for (let cx = minCX; cx <= maxCX; cx += 1) for (let cy = minCY; cy <= maxCY; cy += 1) for (let cz = minCZ; cz <= maxCZ; cz += 1) {
      const list = grid.get(keyFor(cx, cy, cz));
      if (!list) continue;
      for (const entry of list) {
        if (entry.visit === stamp) continue;
        entry.visit = stamp;
        let t;
        if (entry.type === 'box') t = segmentOrientedBoxFirstT(x1,y1,z1,x2,y2,z2,entry.source,entry.minY,entry.maxY,r);
        else if (entry.type === 'round') { const o = entry.source; t = segmentCylinderFirstT(x1,y1,z1,x2,y2,z2,o.x,o.z,o.r+r,entry.minY-r,entry.maxY+r); }
        else { const o = entry.source; t = segmentPyramidFirstT(x1,y1,z1,x2,y2,z2,o.x,o.z,o.base+2*r,o.h+r,entry.minY-r,entry.maxY+r); }
        if (t != null && (best == null || t < best)) best = t;
      }
    }
    return best;
  }

  return { firstHitT };
}
