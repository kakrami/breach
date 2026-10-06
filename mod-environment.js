// Lightweight scene-native sky. No downloads, lights, collision or gameplay state.
export function createMoonSky(THREE){
  const root=new THREE.Group();root.name='moon-sky';
  const material=(color,extra={})=>{const mat=new THREE.MeshBasicMaterial({color,fog:false,...extra});mat.userData.modSky=true;return mat;};
  const earth=new THREE.Group();earth.position.set(-100,155,-120);earth.rotation.set(.12,.35,-.25);root.add(earth);
  const globeCanvas=document.createElement('canvas');globeCanvas.width=512;globeCanvas.height=256;
  const ctx=globeCanvas.getContext('2d');ctx.fillStyle='#164b94';ctx.fillRect(0,0,512,256);
  // Stylized continent silhouettes in equirectangular coordinates.
  const continents=[[[35,52],[63,28],[107,27],[130,43],[120,63],[96,72],[87,91],[71,95],[57,79]],[[87,95],[112,103],[124,127],[115,147],[105,165],[97,187],[86,167],[87,143],[77,121]],[[150,29],[166,19],[181,29],[172,51],[157,56]],[[233,57],[257,42],[281,48],[282,63],[270,73],[278,97],[266,126],[248,148],[231,128],[222,101],[219,80]],[[262,43],[287,27],[326,24],[349,34],[380,34],[416,50],[439,66],[409,77],[382,79],[369,99],[349,91],[336,109],[320,94],[309,72],[282,70]],[[382,147],[408,135],[433,144],[443,163],[421,174],[391,169]],[[449,175],[457,184],[450,199],[443,190]]];
  ctx.fillStyle='#66856b';for(const points of continents){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
  ctx.fillStyle='#d7e6ed';ctx.fillRect(0,0,512,12);ctx.beginPath();ctx.moveTo(0,235);for(let x=0;x<=512;x+=8)ctx.lineTo(x,232+Math.sin(x*.047)*6);ctx.lineTo(512,256);ctx.lineTo(0,256);ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,.52)';ctx.lineCap='round';for(let i=0;i<25;i++){const x=(i*97)%512,y=35+(i*43)%180;ctx.lineWidth=2+i%4;ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+12,y-9,x+23,y+10,x+41,y-1);ctx.stroke();}
  const texture=new THREE.CanvasTexture(globeCanvas);texture.colorSpace=THREE.SRGBColorSpace;
  const globe=new THREE.Mesh(new THREE.SphereGeometry(18,40,24),material(0xffffff,{map:texture}));earth.add(globe);
  const atmosphere=new THREE.Mesh(new THREE.SphereGeometry(18.6,32,20),new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{tint:{value:new THREE.Color(0x569cff)}},vertexShader:'varying vec3 n; varying vec3 v; void main(){vec4 p=modelViewMatrix*vec4(position,1.0);n=normalize(normalMatrix*normal);v=normalize(-p.xyz);gl_Position=projectionMatrix*p;}',fragmentShader:'varying vec3 n; varying vec3 v; uniform vec3 tint; void main(){float rim=pow(1.0-max(0.0,dot(normalize(n),normalize(v))),3.0);gl_FragColor=vec4(tint,rim*.6);}'}));atmosphere.material.userData.modSky=true;earth.add(atmosphere);
  const positions=[];let seed=731;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<210;i++){const yaw=random()*Math.PI*2,y=.18+random()*.82,r=Math.sqrt(1-y*y);positions.push(Math.cos(yaw)*r*290,y*290,Math.sin(yaw)*r*290);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));const stars=new THREE.PointsMaterial({color:0xbacdf5,size:.65,sizeAttenuation:true,fog:false});stars.userData.modSky=true;root.add(new THREE.Points(geometry,stars));
  return root;
}
