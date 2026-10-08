// Presentation-only damage feedback. World forward is (-sin(yaw), -cos(yaw));
// camera right is (cos(yaw), -sin(yaw)). Canvas angles run clockwise from up.
export const DAMAGE_INDICATOR_STYLE=Object.freeze({lifetimeMs:1450,holdMs:170,mergeMs:140,maxIndicators:8,halfAngle:.70});
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const clamp01=n=>Math.max(0,Math.min(1,n));

export function resolveDamageSource(hit,legacyAttackerPosition=null){
  // An explicit null is authoritative: global/environment damage has no bearing.
  // Knockback is an impulse, not a reliable source (especially for blasts).
  const source=hit&&Object.hasOwn(hit,'source')?hit.source:legacyAttackerPosition;
  return finitePoint(source)?{x:source.x,z:source.z}:null;
}

export function damageSourceAngle(source,view){
  if(!finitePoint(source)||!finitePoint(view)||!Number.isFinite(view.yaw))return null;
  const dx=source.x-view.x,dz=source.z-view.z;
  if(Math.hypot(dx,dz)<.05)return null;
  const sin=Math.sin(view.yaw),cos=Math.cos(view.yaw);
  const right=dx*cos-dz*sin,forward=-dx*sin-dz*cos;
  return Math.atan2(right,forward);
}

export function damageSourceYaw(source,view){
  if(!finitePoint(source)||!finitePoint(view))return NaN;
  const dx=source.x-view.x,dz=source.z-view.z;
  return Math.hypot(dx,dz)>=.05?Math.atan2(-dx,-dz):NaN;
}

export function expireDamageIndicators(indicators,now){
  for(let i=indicators.length-1;i>=0;i--)if(now>=indicators[i].until)indicators.splice(i,1);
}

export function addDamageIndicator(indicators,hit,{now,view,legacyAttackerPosition=null}={}){
  if(!Number.isFinite(now))return null;
  expireDamageIndicators(indicators,now);
  const damage=Number(hit?.damage),source=resolveDamageSource(hit,legacyAttackerPosition);
  if(!(damage>0)||!Number.isFinite(damage)||damageSourceAngle(source,view)===null)return null;
  // Coalesce one shotgun volley / sustained fire, keeping other directions visible.
  const previous=indicators.find(d=>now-d.lastHitAt<=DAMAGE_INDICATOR_STYLE.mergeMs&&Math.hypot(d.sourceX-source.x,d.sourceZ-source.z)<.75);
  if(previous){previous.damage=Math.min(100,previous.damage+damage);previous.strength=Math.min(1,.65+previous.damage/180);previous.lastHitAt=now;previous.until=now+DAMAGE_INDICATOR_STYLE.lifetimeMs;return previous;}
  const indicator={sourceX:source.x,sourceZ:source.z,damage:Math.min(100,damage),strength:Math.min(1,.65+damage/180),lastHitAt:now,until:now+DAMAGE_INDICATOR_STYLE.lifetimeMs};
  indicators.push(indicator);
  if(indicators.length>DAMAGE_INDICATOR_STYLE.maxIndicators)indicators.splice(0,indicators.length-DAMAGE_INDICATOR_STYLE.maxIndicators);
  return indicator;
}

export function damageIndicatorAlpha(indicator,now){
  const age=Math.max(0,now-indicator.lastHitAt),fade=clamp01((age-DAMAGE_INDICATOR_STYLE.holdMs)/(DAMAGE_INDICATOR_STYLE.lifetimeMs-DAMAGE_INDICATOR_STYLE.holdMs));
  // Immediate hit, short readable hold, then a smooth fade with no blinking.
  return now>=indicator.until?0:indicator.strength*(1-fade*fade*(3-2*fade));
}

export function damageIndicatorGeometry(width,height){
  const shortSide=Math.min(width,height);
  return {radius:Math.min(230,shortSide*.31),depth:Math.min(56,shortSide*.092),halfAngle:DAMAGE_INDICATOR_STYLE.halfAngle};
}

function crescentPath(c,radius,depth,halfAngle){
  c.beginPath();c.arc(0,0,radius,-Math.PI/2-halfAngle,-Math.PI/2+halfAngle);
  // A broad center and sharp tapered ends read as one red damage arc.
  for(let i=32;i>=0;i--){const angle=-halfAngle+i/32*halfAngle*2,r=radius-depth*Math.pow(Math.max(0,Math.cos(angle/halfAngle*Math.PI/2)),.72);c.lineTo(Math.sin(angle)*r,-Math.cos(angle)*r);}
  c.closePath();
}

export function drawDamageIndicatorLayer(c,width,height,now,indicators,view){
  expireDamageIndicators(indicators,now);
  if(!(width>0&&height>0))return;
  const {radius,depth,halfAngle}=damageIndicatorGeometry(width,height);
  for(const indicator of indicators){
    const angle=damageSourceAngle({x:indicator.sourceX,z:indicator.sourceZ},view),alpha=damageIndicatorAlpha(indicator,now);
    if(angle===null||alpha<=.001)continue;
    c.save();c.translate(width/2,height/2);c.rotate(angle);c.globalAlpha=alpha;
    const fill=c.createRadialGradient(0,0,radius-depth,0,0,radius);
    fill.addColorStop(0,'rgba(195,0,15,0)');fill.addColorStop(.24,'rgba(200,0,15,.12)');fill.addColorStop(.61,'rgba(225,5,22,.65)');fill.addColorStop(.86,'rgba(255,24,38,.98)');fill.addColorStop(.97,'rgba(255,42,52,.92)');fill.addColorStop(1,'rgba(255,24,38,0)');
    c.fillStyle=fill;c.shadowColor='rgba(170,0,10,.40)';c.shadowBlur=Math.min(12,depth*.25);crescentPath(c,radius,depth,halfAngle);c.fill();c.restore();
  }
}
