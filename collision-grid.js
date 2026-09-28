import { createAuthoredServerCollision } from './authored-server-collision.js?v=2.2.0';
export function createProjectileCollisionGrid({staticBoxes=[],staticColliders=null,pyramids=[],naturalObstacles=[],buildingParts=[],terrainHeight,naturalGroundBase}){
 const collision=createAuthoredServerCollision({PLAYER_HEIGHT:1.7,ARENA_LIMIT:300,STATIC_BOXES:staticBoxes,STATIC_PROJECTILE_COLLIDERS:staticColliders,PYRAMIDS:pyramids,NATURAL_OBSTACLES:naturalObstacles,BUILDING_PARTS:buildingParts,terrainHeight,naturalGroundBase});
 return {firstHitT:collision.segmentFirstObstacleT};
}
