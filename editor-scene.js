import * as THREE from "./vendor/three.module.min.js?v=2.6.0";
import { TransformControls } from "./vendor/TransformControls.js";
import { clone, rad, Resolver } from "./builder-model.js?v=2.6.0";
import { assetResizeMode } from "./object-catalog.js?v=2.6.0";
// Scene adapters own no document state. The game supplies its existing scene/camera.
export class EditorScene {
  constructor(editor, scene, camera, canvas) {
    this.editor = editor;
    this.scene = scene;
    this.camera = camera;
    this.canvas = canvas;
    this.orbit = new THREE.PerspectiveCamera(50, 1, .1, 2000);
    this.top = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 2000);
    this.top.up.set(0, 0, -1);
    this.raycaster = new THREE.Raycaster();
    this.proxy = new THREE.Object3D();
    scene.add(this.proxy);
    this.controls = new TransformControls(camera);
    this.controls.domElement = canvas;
    this.controls.setSize(0.8);
    scene.add(this.controls.getHelper());
    this.controls.addEventListener("mouseDown", () => {
      if (editor.beginTransform()) {
        this.start = {
          objects: clone(editor.transaction.after),
          position: this.proxy.position.clone(),
          rotation: this.proxy.rotation.y,
          scale: this.proxy.scale.clone(),
        };
        editor.dragging = true;
        editor.gameRuntime.pauseInput();
      }
    });
    this.controls.addEventListener("objectChange", () => this.changed());
    this.controls.addEventListener("mouseUp", () => {
      editor.dragging = false;
      this.start = null;
    });
    this.source = null;
    this.markerRevision = -1;
    this.markers = new THREE.Group();
    scene.add(this.markers);
  }
  activeCamera() {
    const e = this.editor;
    if(e.state.phase === "test") return this.camera;
    if(e.state.camera !== "top") {
      const r=e.stage.getBoundingClientRect(),v=e.camera,a=v.yaw??.65,p=v.pitch??.85,d=v.span;
      this.orbit.aspect=r.width/Math.max(1,r.height);
      this.orbit.position.set(v.x+Math.sin(a)*Math.cos(p)*d,(v.y||0)+Math.sin(p)*d,v.z+Math.cos(a)*Math.cos(p)*d);
      this.orbit.lookAt(v.x,v.y||0,v.z);this.orbit.updateProjectionMatrix();this.orbit.updateMatrixWorld();return this.orbit;
    }
    const r = e.stage.getBoundingClientRect(),
      half = e.camera.span / 2,
      aspect = r.width / Math.max(1, r.height);
    this.top.left = -half * aspect;
    this.top.right = half * aspect;
    this.top.top = half;
    this.top.bottom = -half;
    this.top.position.set(e.camera.x, 700, e.camera.z);
    this.top.lookAt(e.camera.x, 0, e.camera.z);
    this.top.updateProjectionMatrix();
    this.top.updateMatrixWorld();
    return this.top;
  }
  ray(point) {
    const r = this.editor.stage.getBoundingClientRect(),
      p = point
        ? { x: (point.x / r.width) * 2 - 1, y: 1 - (point.y / r.height) * 2 }
        : { x: 0, y: 0 };
    this.raycaster.setFromCamera(p, this.activeCamera());
    return {
      origin: this.raycaster.ray.origin,
      dir: this.raycaster.ray.direction,
    };
  }
  project(point) {
    const r = this.editor.stage.getBoundingClientRect(),
      p = new THREE.Vector3(point.x, point.y, point.z).project(
        this.activeCamera(),
      );
    return p.z < -1 || p.z > 1
      ? null
      : { x: ((p.x + 1) * r.width) / 2, y: ((1 - p.y) * r.height) / 2 };
  }
  changed() {
    if (!this.start || !this.editor.transaction) return;
    const e = this.editor,
      s = this.start,
      dx = this.proxy.position.x - s.position.x,
      dz = this.proxy.position.z - s.position.z,
      dy = this.proxy.position.y - s.position.y,
      angle = -(this.proxy.rotation.y - s.rotation),
      c = Math.cos(angle),
      sn = Math.sin(angle),
      objects = clone(s.objects);
    for (const o of objects) {
      const x = o.x - s.position.x,
        z = o.z - s.position.z;
      o.x = s.position.x + x * c - z * sn + dx;
      o.z = s.position.z + x * sn + z * c + dz;
      if ("yOffset" in o) o.yOffset = (o.yOffset || 0) + dy;
      if ("rot" in o) o.rot = (o.rot + (angle * 180) / Math.PI + 360) % 360;
      if ("yaw" in o) o.yaw = (o.yaw + (angle * 180) / Math.PI + 360) % 360;
      if (assetResizeMode(o) === "parametric") {
        if ("w" in o) o.w *= this.proxy.scale.x / s.scale.x;
        if ("d" in o) o.d *= this.proxy.scale.z / s.scale.z;
        if ("h" in o) o.h *= this.proxy.scale.y / s.scale.y;
        if ("rise" in o) o.rise *= this.proxy.scale.y / s.scale.y;
      }
    }
    e.previewTransform(objects);
  }
  pointer(kind, event) {
    const e = this.editor,
      c = this.controls;
    if (!c.enabled) return false;
    const rect = this.canvas.getBoundingClientRect(),
      p = {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: 1 - ((event.clientY - rect.top) / rect.height) * 2,
        button: event.button,
      };
    if (kind === "down") {
      c.pointerHover(p);
      if (!c.axis) return false;
      c.pointerDown(p);
      this.pointerId = event.pointerId;
      try {
        this.canvas.setPointerCapture(event.pointerId);
      } catch {}
      return true;
    }
    if (kind === "move") {
      if (this.pointerId === event.pointerId) {
        c.pointerMove({ ...p, button: -1 });
        return true;
      }
      c.pointerHover(p);
      return false;
    }
    if (this.pointerId !== event.pointerId) return false;
    if (kind === "cancel") {
      c.reset();
      e.cancel();
    }
    c.pointerUp({ ...p, button: 0 });
    this.pointerId = null;
    try {
      this.canvas.releasePointerCapture(event.pointerId);
    } catch {}
    e.dragging = false;
    return true;
  }
  cancel() {
    if (this.pointerId != null) {
      try {
        this.canvas.releasePointerCapture(this.pointerId);
      } catch {}
      this.pointerId = null;
    }
    this.controls.dragging = false;
    this.start = null;
    this.editor.dragging = false;
    this.source = null;
  }
  update() {
    const e = this.editor;
    this.markers.visible = e.state.phase === "edit";
    if (this.markerRevision !== e.sceneRev) {
      for (const m of [...this.markers.children]) {
        this.markers.remove(m);
        m.geometry?.dispose();
        m.material?.dispose();
      }
      for (const o of e.doc.spawns) {
        const mat = new THREE.MeshBasicMaterial({
            color:
              o.team === "blue"
                ? 0x48a8ff
                : o.team === "red"
                  ? 0xff6578
                  : 0x77eeaa,
            transparent: true,
            opacity: 0.85,
          }),
          m = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.6, 4), mat);
        m.position.set(
          o.x,
          e.runtimePhysical().geometry.terrainHeight(o.x, o.z) +
            (o.yOffset || 0) +
            0.8,
          o.z,
        );
        m.rotation.y = -rad(o.yaw);
        this.markers.add(m);
      }
      this.markerRevision = e.sceneRev;
    }
    const c = this.controls,
      objects = e.transaction?.after || e.allSelected(),
      visible =
        e.state.phase === "edit" &&
        !e.panel &&
        ["move", "rotate", "scale"].includes(e.state.tool) &&
        objects.length > 0;
    c.camera = this.activeCamera();
    c.enabled = !!visible;
    if (!visible) {
      c.detach();
      return;
    }
    if (!c.dragging) {
      const center = e.groupCenter(objects);
      this.proxy.position.set(
        center.x,
        Resolver.objectBase(e.doc, objects[0]) +
          Math.min(2, Resolver.objectHeight(objects[0]) / 2),
        center.z,
      );
      this.proxy.rotation.set(0, 0, 0);
      this.proxy.scale.set(1, 1, 1);
      this.proxy.updateMatrixWorld();
    }
    c.attach(this.proxy);
    c.setMode(
      { move: "translate", rotate: "rotate", scale: "scale" }[e.state.tool],
    );
    c.showX = c.showZ = e.state.tool !== "rotate";
    c.showY = e.state.tool === "rotate" || (e.state.tool === "move" ? objects.every(o=>["building","prop","elevation","spawn"].includes(o.type)) : objects.every(o=>o.type!=="building"));
    c.showE = false;
    c.showXYZE = false;
    c.setTranslationSnap(e.snapConfig.grid ? e.snapConfig.gridSize : null);
    c.setRotationSnap(e.snapConfig.grid ? rad(e.snapConfig.angle) : null);
    c.setScaleSnap(e.snapConfig.grid ? 0.1 : null);
  }
  dispose() {
    this.markers.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.scene.remove(this.markers);
    this.controls.dispose();
    this.scene.remove(this.controls.getHelper());
    this.scene.remove(this.proxy);
  }
}
