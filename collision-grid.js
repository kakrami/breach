import { segmentAabbFirstT, segmentCylinderFirstT, segmentPyramidFirstT } from './collision-primitives.js?v=1.18.1';

export function createObstacleGrid({ cellSize = 8, cellHeight = 3, playerHeight }) {
  const obstacles = [];
  const grid = new Map();
  const keyFor = (cx, cy, cz) => `${cx},${cy},${cz}`;

  function register(obstacle) {
    obstacles.push(obstacle);
    const minX = obstacle.type === 'box' ? obstacle.minX : obstacle.x - obstacle.r;
    const maxX = obstacle.type === 'box' ? obstacle.maxX : obstacle.x + obstacle.r;
    const minZ = obstacle.type === 'box' ? obstacle.minZ : obstacle.z - obstacle.r;
    const maxZ = obstacle.type === 'box' ? obstacle.maxZ : obstacle.z + obstacle.r;
    const minCX = Math.floor(minX / cellSize);
    const maxCX = Math.floor(maxX / cellSize);
    const minCY = Math.floor(obstacle.minY / cellHeight);
    const maxCY = Math.floor(obstacle.maxY / cellHeight);
    const minCZ = Math.floor(minZ / cellSize);
    const maxCZ = Math.floor(maxZ / cellSize);

    for (let cx = minCX; cx <= maxCX; cx += 1) {
      for (let cy = minCY; cy <= maxCY; cy += 1) {
        for (let cz = minCZ; cz <= maxCZ; cz += 1) {
          const key = keyFor(cx, cy, cz);
          let list = grid.get(key);
          if (!list) {
            list = [];
            grid.set(key, list);
          }
          list.push(obstacle);
        }
      }
    }
    return obstacle;
  }

  function nearby(x, z, y) {
    const minCY = Math.floor(y / cellHeight);
    const maxCY = Math.floor((y + playerHeight * 0.92) / cellHeight);
    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    const out = [];
    const seen = new Set();
    for (let cy = minCY; cy <= maxCY; cy += 1) {
      const list = grid.get(keyFor(cx, cy, cz));
      if (!list) continue;
      for (const obstacle of list) {
        if (seen.has(obstacle)) continue;
        seen.add(obstacle);
        out.push(obstacle);
      }
    }
    return out;
  }

  return Object.freeze({ obstacles, register, nearby });
}

export function createProjectileCollisionGrid({
  staticBoxes = [], pyramids = [], naturalObstacles = [], buildingParts = [],
  terrainHeight, naturalGroundBase, cellSize = 8, cellHeight = 3,
}){
  const grid=new Map(),entries=[];
  const keyFor=(cx,cy,cz)=>`${cx},${cy},${cz}`;
  const add=(entry)=>{
    entry.visit=0;entries.push(entry);
    const minCX=Math.floor(entry.minX/cellSize),maxCX=Math.floor(entry.maxX/cellSize);
    const minCY=Math.floor(entry.minY/cellHeight),maxCY=Math.floor(entry.maxY/cellHeight);
    const minCZ=Math.floor(entry.minZ/cellSize),maxCZ=Math.floor(entry.maxZ/cellSize);
    for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++)for(let cz=minCZ;cz<=maxCZ;cz++){
      const key=keyFor(cx,cy,cz);let list=grid.get(key);if(!list){list=[];grid.set(key,list);}list.push(entry);
    }
  };
  for(const o of staticBoxes){const base=terrainHeight(o.x,o.z);add({type:'box',source:o,minX:o.x-o.w/2,maxX:o.x+o.w/2,minY:base,maxY:base+o.h,minZ:o.z-o.d/2,maxZ:o.z+o.d/2});}
  for(const o of pyramids){const base=terrainHeight(o.x,o.z);add({type:'pyramid',source:o,minX:o.x-o.base/2,maxX:o.x+o.base/2,minY:base,maxY:base+o.h,minZ:o.z-o.base/2,maxZ:o.z+o.base/2});}
  for(const o of naturalObstacles){const base=naturalGroundBase(o.type,o.x,o.z,o.r);add({type:'round',source:o,minX:o.x-o.r,maxX:o.x+o.r,minY:base,maxY:base+o.h+.18,minZ:o.z-o.r,maxZ:o.z+o.r});}
  for(const p of buildingParts){if(p.projectileSolid===false)continue;add({type:'box',source:p,minX:p.x-p.w/2,maxX:p.x+p.w/2,minY:p.bottomY,maxY:p.topY,minZ:p.z-p.d/2,maxZ:p.z+p.d/2});}

  let stamp=0;
  function firstHitT(x1,y1,z1,x2,y2,z2){
    stamp=(stamp+1)>>>0;if(stamp===0){for(const e of entries)e.visit=0;stamp=1;}
    const minCX=Math.floor(Math.min(x1,x2)/cellSize),maxCX=Math.floor(Math.max(x1,x2)/cellSize);
    const minCY=Math.floor(Math.min(y1,y2)/cellHeight),maxCY=Math.floor(Math.max(y1,y2)/cellHeight);
    const minCZ=Math.floor(Math.min(z1,z2)/cellSize),maxCZ=Math.floor(Math.max(z1,z2)/cellSize);
    let best=null;
    for(let cx=minCX;cx<=maxCX;cx++)for(let cy=minCY;cy<=maxCY;cy++)for(let cz=minCZ;cz<=maxCZ;cz++){
      const list=grid.get(keyFor(cx,cy,cz));if(!list)continue;
      for(const entry of list){
        if(entry.visit===stamp)continue;entry.visit=stamp;
        let t=null;
        if(entry.type==='box')t=segmentAabbFirstT(x1,y1,z1,x2,y2,z2,entry.minX,entry.maxX,entry.minY,entry.maxY,entry.minZ,entry.maxZ);
        else if(entry.type==='round'){const o=entry.source;t=segmentCylinderFirstT(x1,y1,z1,x2,y2,z2,o.x,o.z,o.r,entry.minY,entry.maxY);}
        else { const o=entry.source; t=segmentPyramidFirstT(x1,y1,z1,x2,y2,z2,o.x,o.z,o.base,o.h,entry.minY,entry.maxY); }
        if(t!=null&&(best==null||t<best))best=t;
      }
    }
    return best;
  }
  return Object.freeze({firstHitT,entryCount:entries.length});
}
