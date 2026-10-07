import * as world from './world-geometry-moon.js?v=2.11.0';
import { createAuthoredWorldCollision } from './authored-world-collision.js?v=2.11.0';
export const {worldBlockerAt,worldBlockedAt,worldMoveBlockedAt,worldHeightExpansionBlockedAt,findTraversalCandidate,collisionDebugStats}=createAuthoredWorldCollision(world);
