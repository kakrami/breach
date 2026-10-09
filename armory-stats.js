import {WEAPON_SPECS,ATTACHMENTS,resolveWeaponRules,resolveWeaponAccuracy,weaponHasAttachment} from './game-config.js?v=2.22.1';

// Actual units come from the same resolved rules as firing/reloading. Display
// scales are constants, never inferred from the hovered or equipped build.
const METRICS={
 damage:['DAMAGE',90,false,'damage'],falloffEnd:['RANGE',150,false,'m'],
 recoilPitch:['V. RECOIL',.035,true,'rad'],recoilYaw:['H. RECOIL',.012,true,'rad'],
 hipDeg:['HIP SPREAD',3,true,'deg'],adsDeg:['ADS SPREAD',.3,true,'deg'],
 adsInMs:['AIM TIME',250,true,'ms'],reloadMs:['RELOAD',2000,true,'s'],
 mag:['CAPACITY',30,false,'rounds'],bulletSpeed:['VELOCITY',500,false,'velocity'],
 adsMoveSpeedScale:['ADS MOVE',1,false,'percent'],sprintOutMs:['SPRINT OUT',200,true,'ms'],
 explosionDamage:['BLAST DMG',120,false,'damage'],explosionRadius:['BLAST RADIUS',5,false,'m'],
 bracedRecoil:['BRACED V.',.035,true,'rad']
};
export function weaponPerformance(weapon,attachments={},settings){
 const rules=resolveWeaponRules(settings,weapon,attachments),spec=rules.spec,scale=Math.max(0,Math.min(3,(Number(rules.recoilScale)||0)/100));
 const recoilPitch=spec.recoilPitch*scale,recoilYaw=spec.recoilYaw*scale;
 return {...spec,...resolveWeaponAccuracy(weapon,attachments),damage:rules.damage,bulletSpeed:rules.speed,reloadMs:rules.reloadMs,cooldownMs:rules.cooldownMs,recoilPitch,recoilYaw,bracedRecoil:recoilPitch*(weaponHasAttachment(weapon,attachments,'bipod')?ATTACHMENTS.bipod.conditionalRecoilScale:1)};
}
function metricKeys(weapon,slot){
 const keys=['damage','falloffEnd','recoilPitch','hipDeg','adsInMs','reloadMs','mag','bulletSpeed'];
 if(WEAPON_SPECS[weapon]?.explosionRadius){keys[0]='explosionDamage';keys[1]='explosionRadius';}
 if(slot==='stock'){keys[3]='recoilYaw';keys[6]='sprintOutMs';keys[7]='adsMoveSpeedScale';}
 if(slot==='underbarrel'){keys[6]='recoilYaw';keys[7]='adsDeg';if(weapon==='machineGun')keys[2]='bracedRecoil';}
 if(slot==='barrel'){keys[3]='hipDeg';keys[5]='sprintOutMs';keys[6]='adsMoveSpeedScale';}
 return keys;
}
function formatted(value,unit,spec){
 if(unit==='rad')return (value*180/Math.PI).toFixed(2)+'°';
 if(unit==='deg')return value.toFixed(2)+'°';
 if(unit==='s')return (value/1000).toFixed(2)+' s';
 if(unit==='percent')return Math.round(value*100)+'%';
 if(unit==='velocity')return Math.round(value)+' m/s';
 if(unit==='ms')return Math.round(value)+' ms';
 if(unit==='m')return (value<10?Number(value.toFixed(1)):Math.round(value))+' m';
 if(unit==='damage')return Number(value.toFixed(1)).toString();
 return String(Math.round(value));
}
export function armoryStatRows(weapon,attachments={},settings,slot=''){
 const current=weaponPerformance(weapon,attachments,settings),factory=weaponPerformance(weapon,{},settings);
 return metricKeys(weapon,slot).map(key=>{
  const [name,reference,inverse,unit]=METRICS[key],value=Number(current[key])||0,base=Number(factory[key])||0;
  // Bounded monotonic curves preserve the direction of every change, including
  // host tuning beyond stock ranges, without saturating attachment comparisons.
  const score=n=>inverse?reference/(reference+Math.max(0,n)):Math.max(0,n)/(reference+Math.max(0,n));
  const targetScore=score(value),factoryScore=score(base),changeStart=Math.min(targetScore,factoryScore),changeWidth=Math.abs(targetScore-factoryScore),changed=Math.abs(value-base)>1e-8;
  let label=name;if(key==='damage'&&current.pellets>1)label='PELLET DMG';if(key==='reloadMs'&&current.shellReload)label='RELOAD / SHELL';if(key==='adsInMs'&&current.akimbo)return {key,label:'AIM TIME',display:'—',value:0,factory:0,targetScore:0,factoryScore:0,solid:0,changeStart:0,changeWidth:0,changed:false,better:false,unavailable:true};
  return {key,label,display:formatted(value,unit,current),value,factory:base,targetScore,factoryScore,solid:changeStart,changeStart,changeWidth,changed,better:inverse?value<base:value>base};
 });
}
