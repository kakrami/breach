import { infectionModel } from './infection-models.js?v=2.10.0';
// One renderer; cached thumbnails have their own pose and camera framing.
// Weapon meshes borrow live geometry/materials, which must never be disposed here.
import { equipmentModel, streakModel } from './menu-equipment.js?v=2.10.0';
export function createMenuScene({ready,weaponModel,partModel}) {
  let G,renderer,scene,camera,pivot,pending=false,failed=false,current=null,key='';
  let yaw=Math.PI/2+.12,pitch=-.10,zoom=1;
  const cache=new Map();
  function init(){
    if(renderer||pending||failed)return;pending=true;
    Promise.resolve(ready()).then(engine=>{
      if(!engine)throw Error('Preview unavailable');G=engine;
      renderer=new G.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
      renderer.setPixelRatio(1);renderer.outputColorSpace=G.SRGBColorSpace;
      renderer.toneMapping=G.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
      scene=new G.Scene();camera=new G.PerspectiveCamera(28,2,.01,40);
      scene.add(new G.HemisphereLight(0xf3f5ed,0x586755,3.4));
      for(const [color,intensity,pos] of [[0xffffff,3.4,[-2,3,4]],[0xc2e0ed,2.8,[3,1,-3]],[0xf0e3b8,1.3,[0,-2,2]]]){
        const light=new G.DirectionalLight(color,intensity);light.position.set(...pos);scene.add(light);
      }
      pivot=new G.Group();scene.add(pivot);
    }).catch(()=>{failed=true;}).finally(()=>pending=false);
  }
  function make(kind,id,attachments,slot){
    const model=kind==='infection'?infectionModel(G,id):kind==='weapon'?weaponModel(id,attachments):kind==='part'?partModel(id,attachments,slot):kind==='streak'?streakModel(G,id):equipmentModel(G,id);
    if(kind==='weapon'||kind==='part'){
      const materials=new Map();const copy=source=>{if(!materials.has(source)){const m=source.clone();if(m.isMeshStandardMaterial){m.metalness=Math.min(.55,m.metalness);m.roughness=Math.max(.32,m.roughness);if(!m.transparent)m.color.lerp(new G.Color(0x84928b),.12);}materials.set(source,m);}return materials.get(source);};
      model.traverse(n=>{if(n.material)n.material=Array.isArray(n.material)?n.material.map(copy):copy(n.material);});model.userData.previewMaterials=[...materials.values()];
    }
    return model;
  }
  function disposeOwned(model){for(const m of model?.userData.previewMaterials||[])m.dispose();if(!model?.userData.menuOwned)return;model.traverse(n=>{n.geometry?.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])if(m){m.map?.dispose();m.dispose();}});}
  function hero(kind,id,attachments={},w=600,h=290){
    init();if(!renderer)return {pending:!failed};const next=JSON.stringify([kind,id,attachments]);
    if(key!==next){
      disposeOwned(current);pivot.clear();current=make(kind,id,attachments);
      if(kind!=='weapon'){
        const box=new G.Box3().setFromObject(current),size=box.getSize(new G.Vector3());current.position.sub(box.getCenter(new G.Vector3()));
        const wrapper=new G.Group();wrapper.add(current);wrapper.scale.setScalar(1.55/Math.max(size.x,size.y,size.z,.1));current=wrapper;current.userData.menuOwned=true;
      }
      pivot.add(current);if(!key||JSON.parse(key)[0]!==kind)reset(kind);key=next;
    }
    renderer.setSize(w,h,false);camera.aspect=w/h;
    // Fixed weapon width: swapping attachments never shrinks the gun.
    const distance=kind==='weapon'?3.3/(2*Math.tan(14*Math.PI/180)*camera.aspect):3.7;
    const centerX=kind==='weapon'?-.16:0;camera.position.set(centerX,.04,distance/zoom);camera.lookAt(centerX,0,0);camera.updateProjectionMatrix();
    pivot.rotation.set(pitch,yaw,0);scene.updateMatrixWorld(true);renderer.render(scene,camera);
    const anchors={};for(const [slot,p]of Object.entries(current?.userData.calloutPoints||{})){
      const v=new G.Vector3(p.x,p.y,p.z);pivot.localToWorld(v);v.project(camera);anchors[slot]={x:(v.x*.5+.5)*w,y:(-v.y*.5+.5)*h};
    }
    return {canvas:renderer.domElement,anchors};
  }
  function thumb(kind,id,attachments={},slot=''){
    init();if(!renderer)return null;const k=JSON.stringify([kind,id,attachments,slot]);if(cache.has(k))return cache.get(k);
    const model=make(kind,id,attachments,slot);if(!model?.children.length)return null;
    const oldChildren=[...pivot.children],rotation=pivot.rotation.clone();pivot.clear();pivot.rotation.set(0,0,0);
    const pose=new G.Group();pose.add(model);pose.rotation.set(-.16,kind==='infection'?(id==='mutation'?Math.PI/2+.58:Math.PI+.45):kind==='equipment'||kind==='streak'?.5:Math.PI/2+.58,0);pivot.add(pose);
    scene.updateMatrixWorld(true);const bounds=new G.Box3().setFromObject(pose),size=bounds.getSize(new G.Vector3()),center=bounds.getCenter(new G.Vector3());pose.position.sub(center);
    const halfH=Math.max(size.y/2,size.x/4,.01)*1.16,thumbCamera=new G.OrthographicCamera(-halfH*2,halfH*2,halfH,-halfH,.01,40);
    thumbCamera.position.set(0,0,8);thumbCamera.lookAt(0,0,0);renderer.setSize(320,160,false);scene.updateMatrixWorld(true);renderer.render(scene,thumbCamera);
    const out=globalThis.document.createElement('canvas');out.width=320;out.height=160;out.getContext('2d').drawImage(renderer.domElement,0,0);cache.set(k,out);
    pivot.clear();if(oldChildren.length)pivot.add(...oldChildren);pivot.rotation.copy(rotation);if(kind==='infection'||kind==='equipment'||kind==='streak')model.userData.menuOwned=true;disposeOwned(model);return out;
  }
  function reset(kind='weapon'){yaw=kind==='weapon'?Math.PI/2+.12:.45;pitch=-.10;zoom=1;}
  return {hero,thumb,rotate(dx,dy){yaw+=dx*.012;pitch=Math.max(-.85,Math.min(.85,pitch+dy*.009));},zoom(delta){zoom=Math.max(.75,Math.min(1.5,zoom+delta));},reset,destroy(){disposeOwned(current);renderer?.dispose();cache.clear();}};
}
