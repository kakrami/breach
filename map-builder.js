import { EditorSession } from "./editor-session.js?v=2.1.0";
import {
  MapDocument,
  Storage,
  Validator,
  templateToDoc,
} from "./builder-model.js?v=2.1.0";
import { createBuilderPanels } from "./builder-panels.js?v=2.1.0";
import { createBuilderHUD } from "./builder-hud.js?v=2.1.0";
import { createEditorInput } from "./editor-input.js?v=2.1.0";
export function createIntegratedMapBuilder({
  host,
  apiBase,
  getIdentity,
  onExit,
  onSaved,
  gameRuntime,
} = {}) {
  const root = host.shadowRoot || host.attachShadow({ mode: "open" });
  root.replaceChildren();
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = new URL("./map-builder.css?v=2.1.0", import.meta.url).href;
  const app = document.createElement("div");
  app.className = "app";
  const stage = document.createElement("main");
  stage.className = "stage";
  stage.id = "stage";
  app.appendChild(stage);
  root.append(css, app);
  // OS file transfer only; all editor controls and choices are painted on canvas.
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,.breachmap.json,application/json";
  file.hidden = true;
  root.appendChild(file);
  let active = false,
    serverMapId = "",
    dirty = false,
    operation = null;
  const editor = new EditorSession({
    stage,
    gameRuntime,
    onMutation: () => {
      dirty = true;
    },
    onUI: route,
  });
  const panels = createBuilderPanels({
    editor,
    save: () => run(saveServerMap),
    publish: () => run(publishServerMap),
    exit: completeExit,
    importFile: () => file.click(),
    exportFile,
    restore,
  });
  editor.clearPanel = () => panels.reset();
  editor.onUIAction = (id) => panels.action(id);
  editor.loadTemplate = (k) => editor.setDoc(templateToDoc(k));
  editor.loadCollisionLab = async () => {
    const response = await fetch(
      new URL("./maps/collision-lab.breachmap.json", import.meta.url),
    );
    if (!response.ok) throw new Error("Collision test map could not load");
    editor.importData(await response.json());
  };
  editor.hud = createBuilderHUD({
    stage,
    active: () => active,
    model: () => editor.hudModel(),
    action: (id) => editor.action(id),
    lift: (value) => {
      editor.state.lift = editor.state.phase === "edit" ? value : 0;
    },
    pause: () => gameRuntime.pauseInput(),
  });
  editor.input = createEditorInput(editor, () => active, panels);
  async function api(path, payload = {}) {
    const identity = getIdentity?.();
    if (!identity?.client || !identity?.auth)
      throw new Error("Return to the lobby to reconnect, then try again.");
    const response = await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client: identity.client,
        auth: identity.auth,
        ...payload,
      }),
      cache: "no-store",
    });
    let data = {};
    try {
      data = await response.json();
    } catch {}
    if (!response.ok)
      throw new Error(
        data.error || "The server could not complete this action.",
      );
    return data;
  }
  async function saveServerMap() {
    const epoch = editor.epoch,
      rev = editor.sceneRev,
      out = editor.exportData();
    const data = await api("/maps/save", {
      mapId: serverMapId || undefined,
      name: out.meta?.name,
      map: out,
    });
    if (epoch !== editor.epoch) return data;
    serverMapId = data.mapId || data.map?.id || serverMapId;
    if (rev === editor.sceneRev) {
      dirty = false;
      editor.setSaveState("saved");
    }
    editor.toast("Draft saved");
    onSaved?.({ mapId: serverMapId, published: false, map: data.map || null });
    return data;
  }
  async function publishServerMap() {
    const issues = await editor.validate();
    if (!Validator.statusFrom(issues).exportable) {
      panels.show("check", {}, false);
      return;
    }
    await saveServerMap();
    const data = await api("/maps/publish", { mapId: serverMapId });
    editor.toast(`Published revision ${data.revision}`);
    onSaved?.({
      mapId: serverMapId,
      published: true,
      revision: data.revision,
      map: data.map || null,
    });
  }
  function run(task) {
    if (operation) return operation;
    if (editor.transaction) {
      editor.toast("Apply or Cancel before saving");
      return Promise.resolve();
    }
    gameRuntime.pauseInput();
    operation = Promise.resolve()
      .then(task)
      .catch((error) => {
        panels.show("error", { message: error.message }, false);
        throw error;
      })
      .finally(() => {
        operation = null;
        editor.syncUI();
      });
    return operation;
  }
  function route(name, data = {}) {
    if (name === "exit") return requestExit();
    if (name === "save" || name === "publish") {
      panels.show("working", {}, false);
      run(name === "save" ? saveServerMap : publishServerMap)
        .then(() => {
          if (editor.panel?.model().title === "Working…") panels.dismiss();
        })
        .catch(() => {});
      return;
    }
    if (name === "import") return file.click();
    if (name === "download") return exportFile();
    panels.show(
      {
        rename: "settings",
        build: "library",
        props: "library",
        gameplay: "setup",
        environment: "paint",
      }[name] || name,
      data,
    );
  }
  function exportFile() {
    const blob = new Blob([JSON.stringify(editor.exportData(), null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      (editor.doc.meta.name || "map").replace(/[^\w-]/g, "_") +
      ".breachmap.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    editor.toast("Map exported");
  }
  async function restore() {
    const data = await Storage.load();
    if (!data) throw new Error("No local autosave is available.");
    editor.setDoc(data);
  }
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    file.value = "";
    if (!selected) return;
    try {
      if (selected.size > 10 * 1024 * 1024)
        throw new Error("This map file is too large");
      const data = JSON.parse(await selected.text());
      panels.show("confirm", {
        title: "Import map",
        message: "Replace this map? Undo can restore it.",
        run: () => editor.importData(data),
      });
    } catch (error) {
      editor.reportProblem(error);
    }
  });
  function completeExit() {
    panels.dismiss();
    editor.input.cancel();
    editor.stopPlay();
    gameRuntime.close();
    active = false;
    editor.syncUI();
    onExit?.({ mapId: serverMapId });
  }
  function requestExit() {
    if (operation) return;
    if (editor.transaction) {
      editor.toast("Apply or Cancel before leaving");
      return;
    }
    if (dirty) panels.show("exit");
    else completeExit();
  }
  async function open({ mapId = "" } = {}) {
    if (operation) await operation;
    let doc;
    if (mapId) {
      const data = await api("/maps/get", { mapId });
      doc = new MapDocument(data.definition);
      for (const o of doc.all())
        if (data.definition.editor?.groups?.[o.id])
          o.groupId = data.definition.editor.groups[o.id];
    } else doc = templateToDoc("blank");
    editor.input.cancel();
    panels.reset();
    gameRuntime.close();
    serverMapId = String(mapId || "");
    active = true;
    try {
      editor.openDocument(doc);
      dirty = !mapId;
    } catch (error) {
      active = false;
      gameRuntime.close();
      throw error;
    }
    editor.syncUI();
    return true;
  }
  window.__BreachBuilder = {
    getEditor: () => editor,
    getDoc: () => editor.doc?.serializeInternal(),
    action: (a) => editor.action(a),
    choose: (i) => editor.choose(i),
    exportData: () => editor.exportData(),
    runtimeParity: () => editor.runtimeParity(),
    validateDeep: () => Validator.validate(editor.doc, true),
    undo: () => editor.commands.undo(),
    redo: () => editor.commands.redo(),
  };
  return Object.freeze({
    open,
    close({ force = false } = {}) {
      if (!active) return true;
      if (!force && (dirty || editor.transaction)) {
        requestExit();
        return false;
      }
      completeExit();
      return true;
    },
    suspend() {
      active = false;
      panels.dismiss();
      editor.input.cancel();
      editor.stopPlay();
      gameRuntime.close();
      editor.syncUI();
    },
    requestExit,
    handleControllerFrame: (f, dt) => editor.input.controller(f, dt),
    get active() {
      return active;
    },
    get mapId() {
      return serverMapId;
    },
    get saveState() {
      return editor.saveState;
    },
    exportData: () => (editor.doc ? editor.exportData() : null),
  });
}
