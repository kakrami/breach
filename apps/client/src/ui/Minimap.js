import { TEAM_COLORS } from "../../../../packages/shared/src/team.js";
import { ALPHA_WORLD } from "../../../../packages/world/src/alphaWorld.js";
export class Minimap {
    canvas;
    ctx;
    constructor(canvas) {
        this.canvas = canvas;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            throw new Error("2d_context_unavailable");
        this.ctx = ctx;
    }
    render(markers) {
        const size = Math.max(120, Math.floor(this.canvas.clientWidth * (window.devicePixelRatio || 1)));
        if (this.canvas.width !== size || this.canvas.height !== size) {
            this.canvas.width = size;
            this.canvas.height = size;
        }
        const ctx = this.ctx;
        ctx.clearRect(0, 0, size, size);
        ctx.fillStyle = "rgba(8,12,18,.9)";
        ctx.fillRect(0, 0, size, size);
        const mapX = (x) => ((x - ALPHA_WORLD.minX) / (ALPHA_WORLD.maxX - ALPHA_WORLD.minX)) * size;
        const mapZ = (z) => ((z - ALPHA_WORLD.minZ) / (ALPHA_WORLD.maxZ - ALPHA_WORLD.minZ)) * size;
        ctx.fillStyle = "rgba(160,180,205,.12)";
        for (const box of ALPHA_WORLD.obstacles)
            ctx.fillRect(mapX(box.minX), mapZ(box.minZ), mapX(box.maxX) - mapX(box.minX), mapZ(box.maxZ) - mapZ(box.minZ));
        ctx.strokeStyle = "rgba(255,255,255,.28)";
        ctx.strokeRect(0.5, 0.5, size - 1, size - 1);
        for (const marker of markers) {
            if (!marker.alive)
                continue;
            const x = mapX(marker.x);
            const y = mapZ(marker.z);
            const radius = marker.local ? 8 : 5.5;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(-marker.yaw);
            ctx.beginPath();
            ctx.moveTo(0, -radius * 1.35);
            ctx.lineTo(radius, radius);
            ctx.lineTo(-radius, radius);
            ctx.closePath();
            ctx.fillStyle = TEAM_COLORS[marker.team];
            ctx.fill();
            if (marker.local) {
                ctx.strokeStyle = "#ffffff";
                ctx.lineWidth = 2.2;
                ctx.stroke();
            }
            ctx.restore();
        }
    }
}
