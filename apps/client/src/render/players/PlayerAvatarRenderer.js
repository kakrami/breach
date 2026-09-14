import * as THREE from "three";
import { TEAM_COLORS } from "../../../../../packages/shared/src/team.js";
export class PlayerAvatarRenderer {
    scene;
    group;
    body;
    head;
    bodyMaterial;
    headMaterial;
    ringMaterial;
    target = { x: 0, y: 0, z: 0, yaw: 0 };
    local = false;
    alive = true;
    lifeId = 0;
    constructor(scene, player) {
        this.scene = scene;
        this.group = new THREE.Group();
        this.group.userData.playerId = player.id;
        this.bodyMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
        this.headMaterial = new THREE.MeshStandardMaterial({ roughness: 0.68, metalness: 0.02 });
        this.ringMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, side: THREE.DoubleSide });
        this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.85, 6, 10), this.bodyMaterial);
        this.body.position.y = 0.96;
        this.body.castShadow = true;
        this.head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 12), this.headMaterial);
        this.head.position.y = 1.78;
        this.head.castShadow = true;
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.58, 24), this.ringMaterial);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        this.group.add(this.body, this.head, ring);
        this.scene.add(this.group);
        this.update(player);
        this.group.position.set(player.transform.x, player.transform.y, player.transform.z);
        this.group.rotation.y = player.transform.yaw;
    }
    update(player) {
        const color = TEAM_COLORS[player.team];
        this.bodyMaterial.color.set(color);
        this.headMaterial.color.set(color);
        this.headMaterial.color.offsetHSL(0, -0.18, 0.16);
        this.ringMaterial.color.set(color);
        this.target = { x: player.transform.x, y: player.transform.y, z: player.transform.z, yaw: player.transform.yaw };
        if (this.lifeId !== 0 && this.lifeId !== player.lifeId) {
            this.group.position.set(this.target.x, this.target.y, this.target.z);
            this.group.rotation.y = this.target.yaw;
        }
        this.lifeId = player.lifeId;
        this.alive = player.connected && player.life === "alive";
        this.group.userData.team = player.team;
        this.group.userData.lifeId = player.lifeId;
        this.group.userData.revision = player.revision;
        this.applyVisibility();
    }
    setLocal(local) {
        this.local = local;
        this.applyVisibility();
    }
    tick(dt) {
        if (this.local)
            return;
        const alpha = 1 - Math.exp(-16 * Math.max(0, Math.min(0.1, dt)));
        this.group.position.x += (this.target.x - this.group.position.x) * alpha;
        this.group.position.y += (this.target.y - this.group.position.y) * alpha;
        this.group.position.z += (this.target.z - this.group.position.z) * alpha;
        this.group.rotation.y += shortestAngle(this.group.rotation.y, this.target.yaw) * alpha;
    }
    dispose() {
        this.scene.remove(this.group);
        this.group.traverse((object) => object.geometry?.dispose?.());
        this.bodyMaterial.dispose();
        this.headMaterial.dispose();
        this.ringMaterial.dispose();
    }
    applyVisibility() {
        this.group.visible = this.alive && !this.local;
    }
}
function shortestAngle(from, to) {
    let delta = to - from;
    while (delta > Math.PI)
        delta -= Math.PI * 2;
    while (delta < -Math.PI)
        delta += Math.PI * 2;
    return delta;
}
