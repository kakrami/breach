import { roadNodes, roadSegments } from './road-path.js?v=2.14.1';
import {
  DocumentOperations,
  MapDocument,
  ModelRules,
  Resolver,
  RuntimeCompiler,
  Storage,
  Validator,
  IssueGuide,
  Analysis,
  AddManyCommand,
  DeleteCommand,
  PatchCommand,
  TerrainCommand,
  MaterialCommand,
  clone,
  uid,
  clamp,
  rad,
  presetTerrain,
  BUILDINGS,
  PROPS,
  ELEVATION,
  templateToDoc,
  MATERIAL_KEYS,
} from "./builder-model.js?v=2.14.1";
import { assetResizeMode } from "./object-catalog.js?v=2.14.1";
import { safeTerrainBrush, terrainProtection, protectedTerrainPoint } from "./safe-terrain.js?v=2.14.1";
import { rayBox, boxesOverlap, partsBounds } from "./editor-spatial.js?v=2.14.1";
const box = (p) => (p.type === "round" ? { ...p, w: p.r * 2, d: p.r * 2 } : p);
const pose = (p) => ({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch });

// One history stores committed document snapshots, never viewport or preview state.
// Compilation happens before the new revision becomes visible to the game frame.
export class EditorHistory {
  constructor(session) {
    this.session = session;
    this.undoStack = [];
    this.redoStack = [];
  }
  execute(command) {
    const e = this.session;
    if (e.state.phase !== "edit" || e.transaction) return false;
    const before = e.doc.serializeInternal();
    try {
      command.do();
      e.prepareCommit();
    } catch (error) {
      e.doc = new MapDocument(before);
      Resolver.resolve(e.doc);
      throw error;
    }
    const after = e.doc.serializeInternal();
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    this.undoStack.push({ before, after, label: command.label || "Edit" });
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    e.committed();
    return true;
  }
  replace(data, label = "Replace map") {
    return this.execute({
      label,
      do: () => {
        this.session.doc = new MapDocument(data);
      },
    });
  }
  restore(from, to, key) {
    const e = this.session;
    if (e.transaction) {
      e.cancel();
      return false;
    }
    if (e.state.phase !== "edit") return false;
    const c = from.at(-1);
    if (!c) return false;
    const old = e.doc;
    try {
      e.doc = new MapDocument(c[key]);
      e.prepareCommit();
    } catch (error) {
      e.doc = old;
      throw error;
    }
    from.pop();
    to.push(c);
    e.committed();
    return true;
  }
  undo() {
    return this.restore(this.undoStack, this.redoStack, "before");
  }
  redo() {
    return this.restore(this.redoStack, this.undoStack, "after");
  }
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }
}
export class EditorSession extends DocumentOperations {
  constructor({ stage, gameRuntime, onMutation = () => {}, onUI = () => {} }) {
    super();
    this.stage = stage;
    this.gameRuntime = gameRuntime;
    this.onMutation = onMutation;
    this.onUI = onUI;
    this.doc = null;
    this.state = {
      phase: "edit",
      tool: "select",
      camera: "perspective",
      page: 0,
      lift: 0,
      controllerLift: 0,
    };
    this.camera = { x: 0, z: 0, span: 70, yaw:.65,pitch:.85,y:0 };
    this.play = { active: false, x: 0, y: 10, z: 20, yaw: 0, pitch: -0.3 };
    this.selected = new Set();
    this.item = null;
    this.rotation = 0;
    this.placementHeight = 0;
    this.transaction = null;
    this.roadPoints = [];
    this.footprintStart = null;
    this.buildingLevels = 2;
    this.pointer = null;
    this.target = null;
    this.ghost = null;
    this.valid = false;
    this.tip = "Select an object, or open Objects";
    this.sceneRev = 0;
    this.terrainRev = 0;
    this.materialRev = 0;
    this.environmentRev = 0;
    this.brush = {
      tool: "raise",
      radius: 6,
      rate: 2,
      level: 0,
      sampleHeight: true,
    };
    this.materialBrush = { material: "grass", radius: 6 };
    this.snapConfig = {
      grid: true,
      gridSize: 1,
      objects: true,
      roads: true,
      angle: 15,
    };
    this.snapGuides = [];
    this.layerState = Object.fromEntries(
      ["terrain", "roads", "build", "props", "gameplay", "flow"].map((k) => [
        k,
        { visible: k !== "flow", locked: false },
      ]),
    );
    this.prefabs = this.loadPrefabs();
    this.commands = new EditorHistory(this);
    this.saveTask = Promise.resolve();
    this.saveState = "saved";
    this.panel = null;
    this.epoch = 0;
    this.analysisView = "integrity";
  }
  prepareCommit() {
    for (const [field, limit] of Object.entries({
      roads: 256,
      props: 512,
      buildings: 128,
      elevation: 128,
      mounds: 128,
      naturals: 256,
      ladders: 128,
      flow: 512,
    }))
      if (this.doc[field].length > limit)
        throw new Error(
          `This map supports up to ${limit} ${field}. Remove an object before adding another.`,
        );
    ModelRules.normalizeDocument(this.doc);
    Resolver.resolve(this.doc);
    const next = RuntimeCompiler.compile(this.doc);
    this.runtimeCache = next;
  }
  committed() {
    this.sceneRev++;
    this.terrainRev++;
    this.materialRev++;
    this.environmentRev++;
    this.analysisCache = null;
    this.partsCache = null;
    this.previewKey = "";
    this.selected = new Set(
      [...this.selected].filter((id) => this.doc.get(id)),
    );
    this.onMutation();
    this.scheduleSave();
    this.syncUI();
  }
  scheduleSave() {
    const epoch = this.epoch,
      rev = this.sceneRev,
      snapshot = new MapDocument(this.doc.serializeInternal());
    this.saveState = "saving";
    this.saveTask = this.saveTask
      .catch(() => {})
      .then(() => Storage.save(snapshot))
      .then((result) => {
        if (epoch === this.epoch && rev === this.sceneRev) {
          this.saveState = result.persistent ? "local" : "session";
          this.syncUI();
        }
      })
      .catch((error) => {
        if (epoch === this.epoch) {
          this.saveState = "error";
          this.reportProblem(error);
        }
      });
  }
  openDocument(doc) {
    this.epoch++;
    this.doc = doc instanceof MapDocument ? doc : new MapDocument(doc);
    this.prepareCommit();
    this.commands.clear();
    this.selected.clear();
    this.transaction = null;
    this.item = null;
    this.roadPoints = [];
    this.footprintStart = null;
    this.state = {
      phase: "edit",
      tool: "select",
      camera: "perspective",
      page: 0,
      lift: 0,
      controllerLift: 0,
    };
    this.panel = null;
    this.sceneRev++;
    this.partsCache = null;
    this.previewKey = "";
    this.camera = {
      x: 0,
      z: 0,
      span: Math.min(110, this.doc.arenaLimit), yaw:.65,pitch:.85,y:0,
    };
    Object.assign(this.play, {
      active: true,
      x: 0,
      y: this.runtimeCache.geometry.terrainHeight(0, 20) + 12,
      z: 20,
      yaw: 0,
      pitch: -0.45,
    });
    this.gameRuntime.attach(this);
    this.syncUI();
  }
  setDoc(doc) {
    if (!this.doc) return this.openDocument(doc);
    this.cancel();
    this.commands.replace(
      doc instanceof MapDocument ? doc.serializeInternal() : doc,
    );
    this.selected.clear();
    this.syncUI();
  }
  async validate() {
    const key = this.epoch + ":" + this.sceneRev;
    if (this.validation?.key === key) return this.validation.promise;
    const data = this.doc.serializeInternal(),
      promise =
        typeof Worker === "undefined"
          ? Promise.resolve().then(() =>
              Validator.validate(new MapDocument(data), true),
            )
          : new Promise((resolve, reject) => {
              const worker = new Worker(
                new URL(
                  "./editor-validation-worker.js?v=2.14.1",
                  import.meta.url,
                ),
                { type: "module" },
              );
              worker.onmessage = ({ data }) => {
                worker.terminate();
                data.error
                  ? reject(new Error(data.error))
                  : resolve(data.issues);
              };
              worker.onerror = (error) => {
                worker.terminate();
                reject(new Error(error.message || "Map Check failed"));
              };
              worker.postMessage(data);
            });
    this.validation = { key, promise };
    return promise;
  }
  runtimePhysical() {
    return this.brushStroke?.runtime || this.runtimeCache;
  }
  setSaveState(state) {
    this.saveState = state;
    this.syncUI();
  }
  syncUI() {
    this.hud?.render();
  }
  draw() {
    this.syncUI();
  }
  toast(text) {
    this.tip = String(text);
    this.syncUI();
  }
  reportProblem(error) {
    this.onUI("error", { message: String(error?.message || error) });
  }
  closeDrawers() {
    this.clearPanel?.();
    this.panel = null;
    this.state.page = 0;
    this.gameRuntime.pauseInput();
  }
  showChecks() {
    this.onUI("check");
  }
  renderEdit() {
    this.onUI("edit");
  }
  cancelInteraction() {
    this.input?.cancel();
  }
  ready() {
    if(this.roadPoints.length){this.toast("Finish or Cancel the road first");return false;}
    if (this.transaction) {
      this.toast("Apply or Cancel the current edit");
      return false;
    }
    if (this.state.phase === "test") return false;
    return true;
  }
  choose(item) {
    if (!this.ready()) return false;
    const defaults =
      item.type === "building"
        ? BUILDINGS[item.archetype]
        : item.type === "prop"
          ? PROPS[item.kind]
          : item.type === "elevation"
            ? ELEVATION[item.kind]
            : {};
    this.roadEditingId=null;this.roadSmooth=item.type==="roadcurve";
    this.placementHit=null;
    this.item = { ...defaults, ...item };
    if(item.type==='buildingFootprint')this.buildingLevels=item.levels||this.buildingLevels;
    this.recentItems = [
      item,
      ...(this.recentItems || []).filter(
        (o) => (o.key || o.label) !== (item.key || item.label),
      ),
    ].slice(0, 5);
    this.state.tool = "place";
    this.rotation = 0;
    this.placementHeight = 0;
    this.roadPoints = [];
    this.footprintStart = null;
    this.selected.clear();
    this.closeDrawers();
    this.previewKey = "";
    this.update();
    return true;
  }
  selectTool(tool = "select") {
    if (!this.ready()) return false;
    if (["move", "rotate", "scale"].includes(tool) && !this.selected.size)
      return false;
    if (
      tool === "scale" &&
      this.allSelected().some((o) => o.type==="road" || assetResizeMode(o) !== "parametric")
    )
      return false;
    this.state.tool = tool;
    this.roadEditingId=null;this.roadNodeDragging=false;
    this.roadPoints = [];
    this.footprintStart = null;
    this.ghost = null;
    this.previewKey = "";
    this.closeDrawers();
    this.update();
    return true;
  }
  terrain(paint = false) {
    if (!this.ready() || this.layerLocked("terrain")) return;
    this.state.tool = paint ? "paint" : "terrain";
    this.selected.clear();
    this.roadPoints = [];
    this.footprintStart = null;
    this.closeDrawers();
    this.previewKey = "";
    this.update();
  }
  switchView() {
    this.gameRuntime.cancelTransform?.();
    this.gameRuntime.pauseInput();
    this.state.camera = this.state.camera === "top" ? "perspective" : "top";
    this.pointer = null;
    this.previewKey = "";
    this.syncUI();
  }
  fit() {
    this.camera = { ...this.camera, x: 0, y:0, z: 0, span: this.doc.arenaLimit * 2.2 };
    this.syncUI();
  }
  focusTarget(id) {
    const o = this.doc.get(id);
    if (!o) return;
    this.closeDrawers();
    this.selected = new Set(this.expandGroupSelection(id));
    this.state.tool = "select";
    this.camera.x = o.x;
    this.camera.z = o.z;
    this.camera.y=Resolver.objectTop(this.doc,o)*.5;
    this.camera.span=Math.max(16,Math.max(o.w||8,o.d||8,Resolver.objectTop(this.doc,o))*2);
    this.previewKey = "";
    this.update();
  }
  toggleTest() {
    if (this.transaction || this.roadPoints.length) {
      this.toast("Finish or Cancel before testing");
      return;
    }
    this.closeDrawers();
    if (this.state.phase === "edit") {
      const issues = Validator.validate(this.doc, false),
        blocked = issues.filter((i) => i.tone === "bad");
      if (blocked.length) {
        this.showChecks();
        return;
      }
      this.testReturn = { camera: this.state.camera, pose: pose(this.play) };
      this.state.phase = "test";
      this.state.camera = "perspective";
      const g = this.runtimePhysical().geometry,
        c = this.runtimePhysical().collision,
        s = this.doc.spawns.find(
          (s) =>
            !c.worldBlockedAt(
              s.x,
              s.z,
              g.terrainHeight(s.x, s.z) + (s.yOffset || 0),
              g.PLAYER_HEIGHT,
              g.PLAYER_RADIUS,
            ),
        );
      if (!s) {
        this.state.phase = "edit";
        this.state.camera=this.testReturn.camera;
        this.toast("Add a clear starting point first");
        return;
      }
      Object.assign(this.play, {
        x: s.x,
        z: s.z,
        y: g.terrainHeight(s.x, s.z) + (s.yOffset || 0) + g.PLAYER_HEIGHT,
        yaw: rad(s.yaw || 0),
        pitch: 0,
      });
    } else {
      this.state.phase = "edit";
      this.state.camera = this.testReturn?.camera || "perspective";
      Object.assign(this.play, this.testReturn?.pose || {});
    }
    this.ghost = null;
    this.gameRuntime.teleport(this.play);
    this.previewKey = "";
    this.syncUI();
  }
  stopPlay() {
    this.play.active = false;
    this.gameRuntime.suspend?.();
  }
  sceneObjects() {
    if (this.partsCache) return this.partsCache;
    this.partsCache = this.doc
      .all()
      .filter((o) => this.layerVisible(this.layerFor(o)))
      .map((o) => {
        const parts = this.placementParts([o], true);
        return { o, parts, bounds: partsBounds(parts) };
      });
    return this.partsCache;
  }
  pick(ray) {
    if (!ray) return null;
    const { origin, dir } = ray,
      g = this.runtimePhysical().geometry,
      max = 1800;
    let best = null;
    const omitted = new Set(this.transaction?.before.map((o) => o.id) || []);
    for (const { o, parts, bounds } of this.sceneObjects()) {
      if(o.type==="road"||["terrain","paint"].includes(this.state.tool)||this.state.tool==='place'&&['road','roadcurve','buildingFootprint'].includes(this.item?.type))continue;
      if (bounds) {
        const inside =
          Math.abs(origin.x - bounds.x) <= bounds.w / 2 &&
          Math.abs(origin.z - bounds.z) <= bounds.d / 2 &&
          origin.y >= bounds.minY &&
          origin.y <= bounds.maxY;
        if (!inside && !rayBox(origin, dir, bounds, best?.t || max)) continue;
      }
      if (omitted.has(o.id)) continue;
      for (const src of parts) {
        if (
          src.decorative &&
          (!src.selectable ||
            !["select", "move", "rotate", "scale"].includes(this.state.tool))
        )
          continue;
        const p = box(src);
        if (!p.w || !p.d) continue;
        const hit = rayBox(origin, dir, p, best?.t || max);
        if (hit) best = { ...hit, object: o };
      }
    }
    let previous = 0;
    for (let t = 0.5; t <= Math.min(best?.t || max, max); t += 0.5) {
      const x = origin.x + dir.x * t,
        z = origin.z + dir.z * t;
      if (origin.y + dir.y * t <= g.terrainHeight(x, z)) {
        let lo = previous,
          hi = t;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2;
          if (
            origin.y + dir.y * mid <=
            g.terrainHeight(origin.x + dir.x * mid, origin.z + dir.z * mid)
          )
            hi = mid;
          else lo = mid;
        }
        const t0 = (lo + hi) / 2;
        best = {
          x: origin.x + dir.x * t0,
          z: origin.z + dir.z * t0,
          y: g.terrainHeight(origin.x + dir.x * t0, origin.z + dir.z * t0),
          t: t0,
          nx: 0,
          ny: 1,
          nz: 0,
          object: null,
        };
        break;
      }
      previous = t;
    }
    if(best&&!best.object&&["select","move","rotate","scale"].includes(this.state.tool)){
      for(const {o} of this.sceneObjects())if(o.type==='road'&&!omitted.has(o.id)){
        if(roadSegments(o).some(r=>{const p=Resolver.localPoint(r,best.x,best.z);return Math.abs(p.x)<=r.w/2&&Math.abs(p.z)<=r.d/2 || r.pathIndex>0&&Math.hypot(p.x+r.w/2,p.z)<=r.d/2;})){best.object=o;break;}
      }
    }
    return best;
  }
  selectionParts() {
    return this.allSelected().flatMap((o) => this.placementParts([o], true));
  }
  buildingFromFootprint(end) {
    const start=this.footprintStart;
    if(!start||!end)return null;
    const w=Math.abs(start.x-end.x),d=Math.abs(start.z-end.z);
    if(w<12||d<10||w>80||d>80)return null;
    return this.doc.normBuilding({type:'building',assetId:'building/custom',archetype:'custom',x:(start.x+end.x)/2,z:(start.z+end.z)/2,w,d,rot:0,levels:this.buildingLevels,floorH:3.1,style:'brick',balcony:0,yOffset:0});
  }
  plan(hit) {
    if (!hit) return [];
    const item = {
        ...this.item,
        rot: this.rotation,
        yOffset: this.placementHeight,
      };
    if(item.type==='buildingFootprint'){
      const end={x:this.snap(hit.x),z:this.snap(hit.z)},building=this.buildingFromFootprint(end);
      return building?[building]:[];
    }
    if (["road","roadcurve"].includes(item.type)) {
      const p=this.snapRoadPoint(hit);
      const points=[...this.roadPoints];
      if(!this.roadNodeDragging && !this.roadEditingId && (!points.length||Math.hypot(p.x-points.at(-1).x,p.z-points.at(-1).z)>.1))points.push(p);
      if(points.length<2)return [];
      const o=this.roadFromPath(points,item.kind,this.roadSmooth??item.type==='roadcurve');
      if(this.roadEditingId){const old=this.doc.get(this.roadEditingId);Object.assign(o,{id:old.id,d:old.d,groupId:old.groupId});}
      return [o];
    }
    const w = item.w || item.r * 2 || 1,
      d = item.d || item.r * 2 || 1,
      a = rad(this.rotation),
      extent =
        (Math.abs(hit.nx * Math.cos(a) + hit.nz * Math.sin(a)) * w +
          Math.abs(-hit.nx * Math.sin(a) + hit.nz * Math.cos(a)) * d) /
        2;
    const x = hit.x + hit.nx * (extent + 0.05),
      z = hit.z + hit.nz * (extent + 0.05),
      objects = this.makePlacement(item, x, z);
    if (
      hit.object &&
      ["building", "prop", "elevation", "spawn"].includes(item.type)
    ) {
      const ground = this.runtimePhysical().geometry.terrainHeight(x, z),
        base = hit.ny > 0 ? hit.y : Resolver.objectBase(this.doc, hit.object);
      for (const o of objects) o.yOffset = base - ground + this.placementHeight;
    }
    return objects;
  }
  candidate(objects, before = []) {
    const d = new MapDocument(this.doc.serializeInternal());
    for (const o of before) d.remove(o.id);
    for (const o of objects) d.add(clone(o));
    ModelRules.normalizeDocument(d);
    Resolver.resolve(d);
    const runtime = RuntimeCompiler.compile(d),
      parts = objects.flatMap((o) =>
        this.placementParts.call(
          { doc: d, runtimePhysical: () => runtime },
          [o],
          true,
        ),
      );
    let reason = "";
    const skip = new Set(before.map((o) => o.id));
    for (const o of objects) {
      if(o.type==='road'&&o.path){if(roadNodes(o).some(p=>Math.abs(p.x)+o.d/2>this.doc.arenaLimit-1||Math.abs(p.z)+o.d/2>this.doc.arenaLimit-1))reason="Keep the road inside the map";continue;}
      if(['building','prop'].includes(o.type)){const issue=Analysis.objectSupport(d,d.get(o.id),runtime).issues.find(i=>i.tone==='bad');if(issue)reason=issue.title;}
      if(o.type==='elevation'&&['ramp','stairs'].includes(o.kind)){const lo=Resolver.worldPoint(o,0,-o.d/2),base=runtime.geometry.terrainHeight(lo.x,lo.z)+(o.yOffset||0);for(let i=0;i<=12;i++){const p=Resolver.worldPoint(o,0,o.d*(i/12-.5));if(runtime.geometry.terrainHeight(p.x,p.z)>base+o.rise*i/12+.2)reason='Ground cuts through this slope · reshape it or move the piece';}}
      if(o.type==='spawn'&&(runtime.collision.worldBlockedAt(o.x,o.z,runtime.geometry.terrainHeight(o.x,o.z)+(o.yOffset||0),runtime.geometry.PLAYER_HEIGHT,runtime.geometry.PLAYER_RADIUS)||Validator.slope(d,o.x,o.z,runtime)>.45))reason='Choose clear, walkable ground for this start';
      const size = Math.hypot(o.w || o.r * 2 || 1, o.d || o.r * 2 || 1) / 2;
      if (
        Math.abs(o.x) + size > this.doc.arenaLimit - 1 ||
        Math.abs(o.z) + size > this.doc.arenaLimit - 1
      )
        reason = "Keep objects inside the map";
      if ((o.yOffset || 0) > 30 || (o.yOffset || 0) < -8)
        reason = "Choose a lower height";
    }
    for(const spawn of d.spawns)if(runtime.collision.worldBlockedAt(spawn.x,spawn.z,runtime.geometry.terrainHeight(spawn.x,spawn.z)+(spawn.yOffset||0),runtime.geometry.PLAYER_HEIGHT,runtime.geometry.PLAYER_RADIUS)){reason='Keep starting points clear of geometry';break;}
    const others = d
      .all()
      .filter(
        (other) =>
          !skip.has(other.id) && !objects.some((o) => o.id === other.id),
      )
      .map((o) => ({
        o,
        parts: this.placementParts.call(
          { doc: d, runtimePhysical: () => runtime },
          [o],
          true,
        ),
      }));
    if (!reason)
      outer: for (const pa0 of parts) {
        if (pa0.decorative) continue;
        const pa = box(pa0);
        for (const entry of others) {
          const bounds =
            entry.bounds ?? (entry.bounds = partsBounds(entry.parts));
          if (bounds && !boxesOverlap(pa, bounds)) continue;
          for (const pb0 of entry.parts) {
            if (pb0.decorative) continue;
            const pb = box(pb0);
            if (pa.w && pb.w && boxesOverlap(pa, pb)) {
              reason = "Objects overlap · move to a clear spot";
              break outer;
            }
          }
        }
      }
    return {
      objects: objects.map((o) => d.get(o.id) || o),
      parts,
      valid: !reason,
      reason,
    };
  }
  update() {
    if (!this.doc || this.panel || this.state.phase !== "edit") {
      this.ghost = null;
      this.syncUI();
      return;
    }
    this.target = this.state.tool==='place'&&this.placementHit ? this.placementHit : this.pick(this.gameRuntime.ray?.(this.state.phase === "edit" ? this.pointer : null));
    const t = this.target,
      tool = this.state.tool;
    if (this.transaction) {
      this.ghost = this.transaction.preview;
      this.valid = this.ghost?.valid !== false;
      this.tip = this.ghost?.reason || "Preview · Apply or Cancel";
      this.syncUI();
      return;
    }
    const planned = tool === "place" && t ? this.plan(t) : null;
    const placementKey = planned?.length
      ? JSON.stringify(
          planned.map((o) =>
            Object.fromEntries(
              Object.entries(o).filter(
                ([key]) => !["id", "groupId", "parentId"].includes(key),
              ),
            ),
          ),
        )
      : null;
    const key = [
      this.sceneRev,
      tool,
      this.rotation,
      this.placementHeight,
      this.item?.key || this.item?.label,
      JSON.stringify(this.roadPoints),
      JSON.stringify(this.footprintStart),
      this.buildingLevels,
      [...this.selected].join(","),
      placementKey || t?.x?.toFixed(2),
      placementKey ? null : t?.y?.toFixed(2),
      placementKey ? null : t?.z?.toFixed(2),
      t?.object?.id,
      this.brush.tool,
      this.brush.radius,
      this.materialBrush.material,
    ].join("|");
    if (key === this.previewKey) {
      this.syncUI();
      return;
    }
    this.previewKey = key;
    this.ghost = null;
    if (["select", "move", "rotate", "scale"].includes(tool)) {
      this.valid = !!t?.object;
      const parts = this.selectionParts();
      this.ghost = parts.length
        ? { parts, selection: true, outlineGroups:this.allSelected().map(o=>this.placementParts([o],true)) }
        : t?.object
          ? { parts: this.placementParts([t.object], true), selection: true }
          : null;
      this.tip = this.selected.size
        ? `${this.selected.size} selected · choose Move, Rotate or Resize`
        : "Select · tap an object";
    } else if (tool === "place") {
      this.valid = !!t;
      this.tip = "Place · aim at a surface";
      if (t) {
        const objects = planned;
        this.ghost = objects.length
          ? this.candidate(objects,this.roadEditingId?[this.doc.get(this.roadEditingId)]:[])
          : {
              parts: [
                {
                  x: t.x,
                  z: t.z,
                  w: 1,
                  d: 1,
                  minY: t.y + 0.04,
                  maxY: t.y + 0.1,
                },
              ],
              objects: [],
              valid: true,
            };
        this.valid = this.ghost.valid && (this.item.type!=='buildingFootprint'||!this.footprintStart||objects.length>0);
        this.tip =
          this.ghost.reason ||
          (this.item.type==='buildingFootprint'
            ? this.footprintStart
              ? objects.length ? 'Tap to create this building' : 'Draw at least 12 × 10 m; use two corners'
              : 'Tap the first corner of your building'
            : ["road", "roadcurve"].includes(this.item.type)
            ? (this.roadPoints.length ? "Tap to extend · drag points to reshape · Finish" : "Tap the road’s starting point")
            : `Place · ${this.item.label || this.item.kind}`);
      }
    } else if (tool === "terrain" || tool === "paint") {
      this.valid = !!t && !t.object;
      const r =
        tool === "terrain" ? this.brush.radius : this.materialBrush.radius;
      if (this.valid)
        this.ghost = {
          parts: [
            {
              x: t.x,
              z: t.z,
              w: r * 2,
              d: r * 2,
              minY: t.y + 0.05,
              maxY: t.y + 0.08,
            },
          ],
          brush: true,
          protected:tool==="terrain"?terrainProtection(this.doc.terrain,this.doc.all()).filter(o=>Math.hypot(o.x-t.x,o.z-t.z)<r+Math.hypot(o.w,o.d)/2+o.pad):[],
        };
      this.tip = this.valid
        ? (this.brushFeedback||(tool==="terrain"&&protectedTerrainPoint(terrainProtection(this.doc.terrain,this.doc.all()),t.x,t.z)?"Protected support · brush outside the orange boundary":"Drag or hold · two fingers navigate"))
        : "Drag on open ground";
    }
    this.syncUI();
  }
  primary() {
    if (this.panel) return;
    if (this.state.phase === "test") return this.gameRuntime.testShot?.();
    if (this.transaction) return this.apply();
    this.update();
    const t = this.target;
    if (["select", "move", "rotate", "scale"].includes(this.state.tool)) {
      if (t?.object && !this.layerLocked(this.layerFor(t.object))) {
        const ids = this.expandGroupSelection(t.object.id);
        if (this.multiSelect)
          for (const id of ids)
            this.selected.has(id)
              ? this.selected.delete(id)
              : this.selected.add(id);
        else this.selected = new Set(ids);
      } else this.selected.clear();
      this.previewKey = "";
      this.update();
      return;
    }
    if (!this.valid) return;
    if (this.state.tool === "place") {
      if(this.item.type==='buildingFootprint'){
        if(!this.footprintStart){this.footprintStart={x:this.snap(t.x),z:this.snap(t.z)};this.placementHit=null;this.previewKey='';this.update();return;}
        if(this.ghost?.objects?.length){const objects=this.ghost.objects;this.commands.execute(new AddManyCommand(this.doc,objects));this.selected=new Set(objects.map(o=>o.id));this.footprintStart=null;this.placementHit=null;this.selectTool();}
        return;
      }
      if (["road","roadcurve"].includes(this.item.type)) {
        const p=this.snapRoadPoint(t);
        if(this.roadPoints.length>=64){this.toast("Finish this road before starting another");return;}
        if(this.roadPoints.length&&Math.hypot(p.x-this.roadPoints.at(-1).x,p.z-this.roadPoints.at(-1).z)<.2)return;
        this.roadPoints.push({x:p.x,z:p.z});
      } else this.commands.execute(new AddManyCommand(this.doc,this.ghost.objects));
    } else this.stroke(t.x, t.z);
    this.previewKey = "";
    this.update();
  }
  roadHandles() {
    if(this.state.tool!=="place"||!["road","roadcurve"].includes(this.item?.type))return [];
    const g=this.runtimePhysical().geometry,points=this.roadPoints,out=[];
    for(let i=0;i<points.length;i++){const p=points[i],screen=this.gameRuntime.project?.({x:p.x,z:p.z,y:g.terrainHeight(p.x,p.z)+.2});if(screen)out.push({...screen,index:i,label:String(i+1)});}
    for(let i=0;i<points.length-1;i++){const p={x:(points[i].x+points[i+1].x)/2,z:(points[i].z+points[i+1].z)/2},screen=this.gameRuntime.project?.({...p,y:g.terrainHeight(p.x,p.z)+.2});if(screen&&!out.some(q=>Math.hypot(q.x-screen.x,q.y-screen.y)<44))out.push({...screen,index:i+.5,label:"+",point:p});}
    return out;
  }
  editRoad() {
    const o=this.allSelected()[0];if(o?.type!=="road"||!this.ready())return;
    this.choose({type:"road",kind:o.kind,label:"Road"});this.roadEditingId=o.id;this.roadPoints=roadNodes(o);this.roadSmooth=!!o.smooth;this.previewKey="";this.update();
  }
  finishRoad() {
    if(this.roadPoints.length<2)return;
    const o=this.roadFromPath(this.roadPoints,this.item.kind,!!this.roadSmooth),before=this.roadEditingId?this.doc.get(this.roadEditingId):null;
    if(before)Object.assign(o,{id:before.id,d:before.d,groupId:before.groupId});
    const preview=this.candidate([o],before?[before]:[]);if(!preview.valid){this.toast(preview.reason);return;}
    this.commands.execute(before?new PatchCommand(this.doc,[before],preview.objects,"Edit road path"):new AddManyCommand(this.doc,preview.objects));
    this.roadEditingId=null;this.roadPoints=[];this.selected=new Set([o.id]);this.selectTool();
  }
  minimumBrushRadius(){if(!this.doc)return 2;const s=this.state.tool==='paint'?this.doc.materials:this.doc.terrain;return Math.max(2,Math.ceil(s.extent/(s.size-1))*2);}
  beginBrush(point,now=performance.now()) {
    if(this.layerLocked("terrain")||this.brushStroke)return;
    const activeBrush=this.state.tool==='paint'?this.materialBrush:this.brush;activeBrush.radius=Math.max(activeBrush.radius,this.minimumBrushRadius());
    this.brushFeedback=null;
    const doc=new MapDocument(this.doc.serializeInternal()),paint=this.state.tool==='paint';
    this.brushStroke={doc,runtime:this.runtimeCache,paint,brush:{...this.brush},material:{...this.materialBrush},last:{...point},samples:[{...point,time:now}],time:now,lastFlush:now,changed:false};
    if(this.brush.sampleHeight&&['level','flatten'].includes(this.brush.tool))this.brushStroke.brush.level=this.runtimePhysical().geometry.terrainHeight(point.x,point.z);
    this.applyBrushDab(point,.12);this.compileBrush();
  }
  extendBrush(point,now=performance.now()) {
    const s=this.brushStroke;if(!s)return;s.samples.push({...point,time:now});s.last={...point};
  }
  applyBrushDab(point,seconds){
    const s=this.brushStroke;if(!s)return;const surface=s.paint?s.doc.materials:s.doc.terrain;
    if(s.paint){const code=Math.max(0,MATERIAL_KEYS.indexOf(s.material.material));for(let iz=0;iz<surface.size;iz++)for(let ix=0;ix<surface.size;ix++){const p=surface.world(ix,iz),i=surface.index(ix,iz);if(Math.hypot(p.x-point.x,p.z-point.z)<=s.material.radius&&surface.values[i]!==code){surface.values[i]=code;s.changed=true;}}}
    else {const changes=safeTerrainBrush({terrain:surface,objects:s.doc.all(),x:point.x,z:point.z,...s.brush,seconds,baseHeight:(x,z)=>presetTerrain(s.doc.theme,x,z)});for(const c of changes)surface.values[c.i]=c.after;s.changed ||= changes.length>0;}
  }
  compileBrush(){const s=this.brushStroke;if(!s?.changed)return;Resolver.resolve(s.doc);s.runtime=RuntimeCompiler.compile(s.doc);this.sceneRev++;this.partsCache=null;this.previewKey='';}
  flushBrush(force=false,now=performance.now()) {
    const s=this.brushStroke;if(!s)return;
    // Integrate the timestamped pointer trajectory at a fixed simulation step.
    // Rendering frequency never controls the amount of terrain modification.
    const step=1000/60;s.samples.push({...s.last,time:now});let advanced=false;
    while(s.time+step<=now){const at=s.time+step;while(s.samples.length>1&&s.samples[1].time<=at)s.samples.shift();const a=s.samples[0],b=s.samples[1]||a,t=b.time>a.time?Math.max(0,Math.min(1,(at-a.time)/(b.time-a.time))):0;
      this.applyBrushDab({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t},step/1000);s.time=at;advanced=true;}
    if(force&&now>s.time){this.applyBrushDab(s.last,(now-s.time)/1000);s.time=now;advanced=true;}
    if(advanced&&(force||now-s.lastFlush>=100)){this.compileBrush();s.lastFlush=now;}
  }
  endBrush(commit=true,now=performance.now()) {
    if(!this.brushStroke)return;if(commit)this.flushBrush(true,now);const s=this.brushStroke;this.brushStroke=null;this.sceneRev++;this.partsCache=null;this.previewKey='';
    if(commit&&s.changed)this.commands.replace(s.doc.serializeInternal(),s.paint?'Paint ground':'Shape ground');
    else if(commit){this.brushFeedback=['level','flatten','smooth'].includes(s.brush.tool)?'No change here · ground is already shaped or protected':'No change here · protected support or terrain limit';this.toast(this.brushFeedback);}this.syncUI();
  }
  stroke(x, z) {
    return this.strokePath([{ x, z }]);
  }
  strokePath(points) {
    if (this.layerLocked("terrain") || !points.length) return;
    const paint = this.state.tool === "paint",
      brush = { ...this.brush };
    if (
      !paint &&
      brush.sampleHeight &&
      ["level", "flatten"].includes(brush.tool)
    )
      brush.level = Resolver.rawTerrainHeight(
        this.doc,
        points[0].x,
        points[0].z,
      );
    let changed = false;
    this.commands.execute({
      label: paint ? "Paint ground" : "Shape ground",
      do: () => {
        const surface = paint ? this.doc.materials : this.doc.terrain;
        for (const { x, z } of points) {
          if (paint) {
            const r = this.materialBrush.radius,
              code = Math.max(
                0,
                MATERIAL_KEYS.indexOf(this.materialBrush.material),
              );
            for (let iz = 0; iz < surface.size; iz++)
              for (let ix = 0; ix < surface.size; ix++) {
                const p = surface.world(ix, iz),
                  i = surface.index(ix, iz);
                if (
                  Math.hypot(p.x - x, p.z - z) <= r &&
                  surface.values[i] !== code
                ) {
                  surface.values[i] = code;
                  changed = true;
                }
              }
          } else {
            const changes = safeTerrainBrush({
              terrain: surface,
              objects: this.doc.all(),
              x,
              z,
              ...brush,
              baseHeight: (a, b) => presetTerrain(this.doc.theme, a, b),
            });
            for (const c of changes) surface.values[c.i] = c.after;
            changed ||= changes.length > 0;
          }
        }
      },
    });
    if (!changed) this.toast("This ground is protected or at its safe limit");
  }
  beginTransform(copy = false) {
    if (this.transaction) return true;
    const before = this.allSelected().map(clone);
    if (copy) {
      const parents = new Set(before.map((o) => o.id));
      for (const ladder of this.doc.ladders)
        if (parents.has(ladder.parentId) && !parents.has(ladder.id))
          before.push(clone(ladder));
    }
    if (!before.length) return false;
    if (!copy && before.some((o) => o.type === "ladder" && o.parentId)) {
      this.toast("Detach the ladder in Properties before moving it");
      return false;
    }
    let after = clone(before);
    if (copy) {
      const ids = new Map(after.map((o) => [o.id, uid(o.type)])),
        groups = new Map();
      for (const o of after) {
        o.id = ids.get(o.id);
        if (o.groupId) {
          if (!groups.has(o.groupId)) groups.set(o.groupId, uid("group"));
          o.groupId = groups.get(o.groupId);
        }
        if (o.parentId) o.parentId = ids.get(o.parentId) || null;
      }
    }
    this.transaction = {
      before: copy ? [] : before,
      source: before,
      after,
      copy,
      preview: null,
    };
    this.previewTransform(after);
    return true;
  }
  previewTransform(objects) {
    if (!this.transaction) return;
    this.transaction.after = clone(objects);
    this.transaction.preview = this.candidate(objects, this.transaction.before);
    this.ghost = this.transaction.preview;
    this.valid = this.ghost.valid;
    this.syncUI();
  }
  nudge(axis, delta) {
    if (!this.beginTransform()) return;
    const objects = clone(this.transaction.after);
    for (const o of objects) {
      if (
        axis === "y" &&
        ["building", "prop", "elevation", "spawn"].includes(o.type)
      )
        o.yOffset = (o.yOffset || 0) + delta;
      else if (axis === "x" || axis === "z") o[axis] += delta;
    }
    this.previewTransform(objects);
  }
  turn(delta) {
    if (this.state.tool === "place" && !this.transaction) {
      this.rotation = (this.rotation + delta + 360) % 360;
      this.previewKey = "";
      this.update();
      return;
    }
    if (!this.beginTransform()) return;
    const objects = clone(this.transaction.after),
      center = this.groupCenter(objects),
      a = rad(delta);
    for (const o of objects) {
      const x = o.x - center.x,
        z = o.z - center.z;
      o.x = center.x + x * Math.cos(a) - z * Math.sin(a);
      o.z = center.z + x * Math.sin(a) + z * Math.cos(a);
      if ("rot" in o) o.rot = (o.rot + delta + 360) % 360;
      if ("yaw" in o) o.yaw = (o.yaw + delta + 360) % 360;
    }
    this.previewTransform(objects);
  }
  scale(factor) {
    if (
      this.allSelected().some((o) => o.type==="road" || assetResizeMode(o) !== "parametric") ||
      !this.beginTransform()
    )
      return;
    const objects = clone(this.transaction.after);
    for (const o of objects)
      for (const key of ["w", "d", "h", "rise"])
        if (key in o) o[key] = clamp(o[key] * factor, 0.2, 80);
    this.previewTransform(objects);
  }
  duplicateSelected() {
    if (!this.ready()) return;
    this.beginTransform(true);
    this.state.tool = "move";
    this.toast("Copy preview · move it, then Apply");
  }
  apply() {
    const t = this.transaction;
    if (!t) return;
    if (!t.preview?.valid) {
      this.toast(t.preview?.reason || "Cannot apply this edit");
      return;
    }
    this.transaction = null;
    const after = t.preview.objects;
    this.commands.execute(
      t.copy
        ? new AddManyCommand(this.doc, after)
        : new PatchCommand(this.doc, t.before, after, "Transform"),
    );
    this.selected = new Set(after.map((o) => o.id));
    this.previewKey = "";
    this.update();
  }
  cancel() {
    if (this.transaction) {
      this.transaction = null;
      this.ghost = null;
      this.previewKey = "";
      this.gameRuntime.cancelTransform?.();
      this.update();
      return;
    }
    if (this.roadPoints.length) {
      this.roadEditingId=null;this.roadNodeDragging=false;this.roadPoints = [];
      this.previewKey = "";
      this.update();
      return;
    }
    if(this.footprintStart){this.footprintStart=null;this.placementHit=null;this.previewKey='';this.update();return;}
    this.selectTool();
  }
  action(id) {
    if(id==='floor-down'||id==='floor-up'){
      this.buildingLevels=clamp(this.buildingLevels+(id==='floor-up'?1:-1),1,5);
      this.previewKey='';this.update();return;
    }
    if(id==='road-edit')return this.editRoad();
    if(id==='road-finish')return this.finishRoad();
    if(id==='road-smooth'){this.roadSmooth=!this.roadSmooth;this.previewKey="";this.update();return;}
    if(id==='road-back'){this.roadPoints.pop();this.previewKey="";this.update();return;}
    if(id==='road-reverse'){this.roadPoints.reverse();this.previewKey="";this.update();return;}

    if(id === "focus"){const id=this.selected.values().next().value;if(id)this.focusTarget(id);return;}
    if(this.brushStroke)this.input?.cancel();
    if (id === "terrain") return this.terrain();
    if (id === "paint-tool") return this.terrain(true);
    if (id === 'placement-raise' || id === 'placement-lower') {
      this.placementHeight=clamp(this.placementHeight+(id==='placement-raise'?1:-1),-8,30);
      this.previewKey='';this.update();return;
    }
    if (id.startsWith("brush-tool:")) {
      this.brush.tool = id.slice(11);
      this.previewKey = "";
      this.syncUI();
      return;
    }
    if (id.startsWith("brush-radius:")) {
      const b = this.state.tool === "paint" ? this.materialBrush : this.brush;
      b.radius = Math.max(this.minimumBrushRadius(), Math.min(30, Number(id.split(":")[1])));
      this.previewKey = "";
      this.syncUI();
      return;
    }
    if (id.startsWith("brush-rate:")) {
      this.brush.rate = Math.max(0.25, Math.min(8, Number(id.split(":")[1])));
      this.syncUI();
      return;
    }
    if (id === "brush-settings")
      return this.onUI(this.state.tool === "paint" ? "paint" : "terrain");
    if (
      this.panel &&
      (id === "close" ||
        id.startsWith("ui:") ||
        id.startsWith("text:") ||
        id.startsWith("value:"))
    )
      return this.onUIAction(id);
    if (id === "previous" || id === "next") {
      this.state.page = Math.max(0, this.state.page + (id === "next" ? 1 : -1));
      this.syncUI();
      return;
    }
    if (id === "cancel") return this.cancel();
    if (id === "place" || id === "apply") return this.primary();
    if (id === "overview") return this.switchView();
    if (id === "playtest" || id === "build") return this.toggleTest();
    if (id === "undo" || id === "redo") {
      this.commands[id]();
      return;
    }
    if (id === "snap-toggle") {
      const enabled=!this.snapConfig.grid;
      this.snapConfig.grid=enabled;
      this.snapConfig.objects=enabled;
      this.snapConfig.roads=enabled;
      this.previewKey = "";
      this.update();
      return;
    }
    if(id==="done"&&this.roadPoints.length){this.roadPoints=[];this.roadEditingId=null;}
    if (id === "select" || id === "done") return this.selectTool();
    if (["move", "rotate-tool", "scale-tool"].includes(id))
      return this.selectTool(
        { move: "move", "rotate-tool": "rotate", "scale-tool": "scale" }[id],
      );
    if (id === "rotate" || id === "turn-right")
      return this.turn(this.snapConfig.angle);
    if (id === "turn-left") return this.turn(-this.snapConfig.angle);
    if (id === "scale-up" || id === "scale-down")
      return this.scale(id === "scale-up" ? 1.1 : 1 / 1.1);
    if (id === "raise-object" || id === "lower-object")
      return this.nudge("y", id === "raise-object" ? 1 : -1);
    if (id.startsWith("nudge:")) {
      const [_, axis, n] = id.split(":");
      return this.nudge(axis, Number(n) * this.snapConfig.gridSize);
    }
    if (id === "copy") return this.duplicateSelected();
    if (id === "erase") {
      if (this.ready()) this.deleteSelected();
      return;
    }
    if (id === "multi") {
      this.multiSelect = !this.multiSelect;
      this.syncUI();
      return;
    }
    if (id.startsWith("debug-")) {
      this.gameRuntime.debugCollision(id.slice(6));
      return;
    }
    if (id === "menu" && this.state.phase === "test") {
      this.onUI("test-menu");
      return;
    }
    if (this.ready()) {
      this.onUI({ menu: "map", pick: "library", edit: "edit" }[id] || id);
    }
  }
  hudModel() {
    const s = this.state,
      selected = this.allSelected();
    const activeBrush=s.tool==='paint'?this.materialBrush:this.brush;activeBrush.radius=Math.max(activeBrush.radius,this.minimumBrushRadius());
    return {
      mapName:this.doc?.meta.name,
      selectionLabel:selected.length>1?`${selected.length} objects`:IssueGuide.objectLabel(selected[0]),
      itemLabel:this.item?.label,
      materialLabel:this.materialBrush.material,
      brushMinRadius:this.minimumBrushRadius(),
      controllerAiming:!!this.controllerAiming,
      roadHandles:this.roadHandles(),
      roadSelected:selected.length===1&&selected[0].type==='road',
      roadMode:s.tool==='place'&&['road','roadcurve'].includes(this.item?.type),
      footprintMode:s.tool==='place'&&this.item?.type==='buildingFootprint',
      footprintStarted:!!this.footprintStart,
      buildingLevels:this.buildingLevels,
      roadCount:this.roadPoints.length,
      roadSmooth:!!this.roadSmooth,
      brush: s.tool === "paint" ? this.materialBrush : this.brush,
      mode: s.tool,
      tool: s.tool,
      modeLabel:
        s.phase === "test"
          ? "TEST · Game controls"
          : this.transaction
            ? "PREVIEW · Apply or Cancel"
            : s.tool==="place"&&["road","roadcurve"].includes(this.item?.type)?"ROAD":s.tool.toUpperCase(),
      building: s.phase === "edit",
      overview: s.camera === "top",
      selected: !!selected.length,
      pending: !!this.transaction,
      vertical: selected.some((o) =>
        ["building", "prop", "elevation", "spawn"].includes(o.type),
      ),
      rotatable:
        selected.length > 1 || selected.some((o) => "rot" in o || "yaw" in o),
      resizable:
        selected.length > 0 &&
        selected.every((o) => o.type!=="road" && assetResizeMode(o) === "parametric"),
      placing: s.tool === "place",
      valid: this.valid,
      primary: this.transaction
        ? "Apply"
        : s.tool === "place"
          ? "Place"
          : s.tool === "terrain"
            ? { level: "Flatten", raise:"Raise", lower:"Lower", smooth:"Smooth" }[this.brush.tool] || "Paint"
            : s.tool === "paint"
              ? "Paint"
              : "Select",
      tip: this.tip,
      undo: s.phase === "edit" && !!this.commands.undoStack.length,
      redo: s.phase === "edit" && !!this.commands.redoStack.length,
      snap: this.snapConfig.grid,
      multi: this.multiSelect,
      panel: this.panel?.model(),
      page: s.page,
    };
  }
}
