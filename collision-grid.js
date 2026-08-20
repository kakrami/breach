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
