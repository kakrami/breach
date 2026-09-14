import * as THREE from "three";
import { ALPHA_WORLD } from "../../../../packages/world/src/alphaWorld.js";
import { PlayerAvatarRenderer } from "./players/PlayerAvatarRenderer.js";
import { PlayerRendererRegistry } from "./players/PlayerRendererRegistry.js";
export class SceneController {
    registry;
    renderer;
    scene;
    camera;
    host;
    frame = 0;
    disposed = false;
    resizeObserver;
    localPlayer = null;
    lastFrameAt = performance.now();
    constructor(host) {
        this.host = host;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color("#0b0f17");
        this.scene.fog = new THREE.Fog("#0b0f17", 18, 48);
        this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
        this.camera.rotation.order = "YXZ";
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        host.appendChild(this.renderer.domElement);
        this.scene.add(new THREE.HemisphereLight("#b9d5ff", "#1c2330", 1.8));
        const sun = new THREE.DirectionalLight("#ffffff", 2.0);
        sun.position.set(5, 9, 4);
        sun.castShadow = true;
        this.scene.add(sun);
        const ground = new THREE.Mesh(new THREE.PlaneGeometry(ALPHA_WORLD.maxX - ALPHA_WORLD.minX, ALPHA_WORLD.maxZ - ALPHA_WORLD.minZ), new THREE.MeshStandardMaterial({ color: "#151d29", roughness: 0.92, metalness: 0.02 }));
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        for (const box of ALPHA_WORLD.obstacles) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.maxX - box.minX, box.height, box.maxZ - box.minZ), new THREE.MeshStandardMaterial({ color: "#2a3444", roughness: 0.78, metalness: 0.04 }));
            mesh.position.set((box.minX + box.maxX) / 2, box.height / 2, (box.minZ + box.maxZ) / 2);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
        }
        this.registry = new PlayerRendererRegistry((player) => new PlayerAvatarRenderer(this.scene, player));
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(host);
        this.resize();
        this.frame = requestAnimationFrame(this.renderLoop);
    }
    reconcile(players, localPlayerId) {
        this.registry.reconcile(players, localPlayerId);
    }
    setLocalPlayer(player) {
        this.localPlayer = player;
    }
    requestPointerLock() {
        try {
            void this.renderer.domElement.requestPointerLock?.();
        }
        catch { /* browser policy */ }
    }
    dispose() {
        this.disposed = true;
        cancelAnimationFrame(this.frame);
        this.resizeObserver.disconnect();
        this.registry.dispose();
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
    renderLoop = (now) => {
        if (this.disposed)
            return;
        const dt = Math.max(0, Math.min(0.1, (now - this.lastFrameAt) / 1000));
        this.lastFrameAt = now;
        this.registry.tick(dt);
        this.updateCamera();
        this.renderer.render(this.scene, this.camera);
        this.frame = requestAnimationFrame(this.renderLoop);
    };
    updateCamera() {
        const player = this.localPlayer;
        if (!player || player.life !== "alive")
            return;
        const eyeHeight = player.movement.crouched ? 0.94 : 1.62;
        this.camera.position.set(player.transform.x, player.transform.y + eyeHeight, player.transform.z);
        this.camera.rotation.y = player.transform.yaw;
        this.camera.rotation.x = player.transform.pitch;
        this.camera.rotation.z = 0;
    }
    resize() {
        const width = Math.max(1, this.host.clientWidth);
        const height = Math.max(1, this.host.clientHeight);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }
}
