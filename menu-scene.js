import {attachmentOptionsForWeapon,ATTACHMENT_SLOTS} from './game-config.js?v=2.21.0';
import { infectionModel } from './infection-models.js?v=2.21.0';
// One renderer; cached thumbnails have their own pose and camera framing.
// Weapon meshes borrow neutral armory templates, independent of live action.
import { equipmentModel, streakModel } from './menu-equipment.js?v=2.21.0';
export function createMenuScene({ready,weaponModel,partModel}) {
  let G,renderer,scene,camera,pivot,pending=false,failed=false,current=null,key='';
  let yaw=-Math.PI/2+.12,pitch=-.10,zoom=1;
  const cache=new Map(),frames=new Map();
  function init(){
    if(renderer||pending||failed)return;pending=true;
    Promise.resolve(ready()).then(engine=>{
      if(!engine)throw Error('Preview unavailable');G=engine;
      renderer=new G.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(1);renderer.outputColorSpace=G.SRGBColorSpace;
      renderer.toneMapping=G.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
      scene=new G.Scene();camera=new G.PerspectiveCamera(28,2,.01,40);
      scene.add(new G.HemisphereLight(0xf3f5ed,0x3c4942,1.7));
      for(const [color,intensity,pos] of [[0xfff3d8,2.8,[-2,3,4]],[0xb3d7ef,2.2,[3,1,-3]],[0xf0e3b8,.9,[0,-2,2]]]){
        const light=new G.DirectionalLight(color,intensity);light.position.set(...pos);scene.add(light);
      }
      pivot=new G.Group();scene.add(pivot);
    }).catch(()=>{failed=true;}).finally(()=>pending=false);
  }
  function make(kind,id,attachments,slot){
    const model=kind==='infection'?infectionModel(G,id):kind==='weapon'?weaponModel(id,attachments):kind==='part'?partModel(id,attachments,slot):kind==='streak'?streakModel(G,id):equipmentModel(G,id);
    if(kind==='weapon'||kind==='part'){
      const materials=new Map();const copy=source=>{if(!materials.has(source)){const m=source.clone();if(m.isMeshStandardMaterial){m.metalness=Math.min(.55,m.metalness);m.roughness=Math.max(.32,m.roughness);if(!m.userData.preservePreviewTone&&!m.transparent&&m.color.getHSL({}).l<.14)m.color.lerp(new G.Color(0x899b9c),.22);}materials.set(source,m);}return materials.get(source);};
      model.traverse(n=>{if(n.material)n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);});model.userData.previewMaterials=[...materials.values()];
    }
    return model;
  }
  function disposeOwned(model){for(const m of model?.userData.previewMaterials||[])m.dispose();if(!model?.userData.menuOwned)return;model.traverse(n=>{n.geometry?.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){m.map?.dispose();m.dispose();}});}
  function weaponFrame(id){
    if(frames.has(id))return frames.get(id);
    const bounds=new G.Box3(),configs=[{}],extended={};
    for(const slot of ATTACHMENT_SLOTS){const options=attachmentOptionsForWeapon(id,slot);for(const option of options)configs.push({[slot]:option.id});extended[slot]=options.find(v=>['heavyBarrel','shotgunLongBarrel','extendedMag','suppressor','fullStock','thermalScope6x'].includes(v.id))?.id||'';}
    configs.push(extended);
    for(const config of configs){const model=weaponModel(id,config);model.updateMatrixWorld(true);bounds.union(new G.Box3().setFromObject(model));}
    frames.set(id,bounds);return bounds;
  }
  function hero(kind,id,attachments={},w=600,h=290){
    init();if(!renderer)return {pending:!failed};const next=JSON.stringify([kind,id,attachments]);
    if(key!==next){
      const previous=key?JSON.parse(key):[];disposeOwned(current);pivot.clear();current=make(kind,id,attachments);
      if(kind!=='weapon'){
        const box=new G.Box3().setFromObject(current),size=box.getSize(new G.Vector3());current.position.sub(box.getCenter(new G.Vector3()));
        const wrapper=new G.Group();wrapper.add(current);wrapper.scale.setScalar(1.55/Math.max(size.x,size.y,size.z,.1));current=wrapper;current.userData.menuOwned=true;
      }
      pivot.add(current);if(previous[0]!==kind||previous[1]!==id)reset(kind);key=next;
    }
    renderer.setSize(w,h,false);camera.aspect=w/h;pivot.rotation.set(pitch,yaw,0);scene.updateMatrixWorld(true);
    // One envelope per weapon includes every attachment. Both axes and depth
    // are fitted after rotation, so pistols fit and comparisons never rescale.
    const local=kind==='weapon'?weaponFrame(id):new G.Box3().setFromObject(current),bounds=new G.Box3();
    if(kind==='weapon')for(const x of [local.min.x,local.max.x])for(const y of [local.min.y,local.max.y])for(const z of [local.min.z,local.max.z])bounds.expandByPoint(new G.Vector3(x,y,z).applyMatrix4(pivot.matrixWorld));
    else bounds.copy(local);
    const size=bounds.getSize(new G.Vector3()),center=bounds.getCenter(new G.Vector3()),tan=Math.tan(14*Math.PI/180),distance=Math.max(size.y/(2*tan),size.x/(2*tan*camera.aspect))*1.12+size.z/2;
    camera.position.set(center.x,center.y,center.z+distance/zoom);camera.lookAt(center);camera.updateProjectionMatrix();scene.updateMatrixWorld(true);renderer.render(scene,camera);
    const anchors={};for(const [slot,p]of Object.entries(current?.userData.calloutPoints||{})){const v=new G.Vector3(p.x,p.y,p.z);pivot.localToWorld(v);v.project(camera);anchors[slot]={x:(v.x*.5+.5)*w,y:(-v.y*.5+.5)*h};}
    return {canvas:renderer.domElement,anchors,frame:{distance,zoom,center:{x:center.x,y:center.y,z:center.z},size:{x:size.x,y:size.y,z:size.z}}};
  }
  function thumb(kind,id,attachments={},slot=''){
    init();if(!renderer)return null;const k=JSON.stringify([kind,id,attachments,slot]);if(cache.has(k))return cache.get(k);
    const model=make(kind,id,attachments,slot);if(!model?.children.length)return null;
    const oldChildren=[...pivot.children],rotation=pivot.rotation.clone();pivot.clear();pivot.rotation.set(0,0,0);
    const pose=new G.Group();pose.add(model);pose.rotation.set(-.16,kind==='infection'?(Math.PI+.45):kind==='equipment'||kind==='streak'?.5:-Math.PI/2-.58,0);pivot.add(pose);
    scene.updateMatrixWorld(true);const bounds=new G.Box3().setFromObject(pose),size=bounds.getSize(new G.Vector3()),center=bounds.getCenter(new G.Vector3());pose.position.sub(center);
    const halfH=Math.max(size.y/2,size.x/4,.01)*1.16,thumbCamera=new G.OrthographicCamera(-halfH*2,halfH*2,halfH,-halfH,.01,40);
    thumbCamera.position.set(0,0,8);thumbCamera.lookAt(0,0,0);renderer.setSize(320,160,false);scene.updateMatrixWorld(true);renderer.render(scene,thumbCamera);
    const out=globalThis.document.createElement('canvas');out.width=320;out.height=160;out.getContext('2d').drawImage(renderer.domElement,0,0);cache.set(k,out);if(cache.size>160)cache.delete(cache.keys().next().value);
    pivot.clear();if(oldChildren.length)pivot.add(...oldChildren);pivot.rotation.copy(rotation);if(kind==='infection'||kind==='equipment'||kind==='streak')model.userData.menuOwned=true;disposeOwned(model);return out;
  }
  function reset(kind='weapon'){yaw=kind==='weapon'?-Math.PI/2+.12:.45;pitch=-.10;zoom=1;}
  return {hero,thumb,rotate(dx,dy){yaw+=dx*.012;pitch=Math.max(-.85,Math.min(.85,pitch+dy*.009));},zoom(delta){zoom=Math.max(.75,Math.min(1.5,zoom+delta));},reset,destroy(){disposeOwned(current);renderer?.dispose();cache.clear();}};
}
