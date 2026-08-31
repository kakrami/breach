window.__breachModuleBooted=true;
import * as HighlandsGeometry from './world-geometry.js?v=1.44.42';
import * as DepotGeometry from './world-geometry-depot.js?v=1.44.42';
import * as YardGeometry from './world-geometry-yard.js?v=1.44.42';
import * as RigGeometry from './world-geometry-rig.js?v=1.44.42';
import * as HighlandsWorldCollision from './world-collision.js?v=1.44.42';
import * as DepotWorldCollision from './world-collision-depot.js?v=1.44.42';
import * as YardWorldCollision from './world-collision-yard.js?v=1.44.42';
import * as RigWorldCollision from './world-collision-rig.js?v=1.44.42';
import {
  APP_VERSION, PROTOCOL_VERSION, ROOM_CODE_LENGTH, MAX_PLAYERS, MAX_BOTS, TEAM_COLORS, WEAPON_ORDER, PRIMARY_WEAPONS, SECONDARY_WEAPONS, WEAPON_SPECS, ATTACHMENT_SLOTS, ATTACHMENTS, normalizeWeaponAttachments, attachmentOptionsForWeapon, attachmentModsForWeapon, attachmentAccuracyModsForWeapon, attachmentAdsMoveAddForWeapon, resolveWeaponSpec, resolveWeaponAccuracy, attachmentSoundScale, weaponHasAttachment, weaponSpreadRadians, weaponHeatAfterDelay, weaponHeatAfterShot, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, EQUIPMENT_CAPS, EQUIPMENT_SPECS, TACTICAL_EQUIPMENT, LETHAL_EQUIPMENT, normalizeTactical, normalizeLethal, equipmentForLoadout, LOADOUT_CLASS_COUNT, LOADOUT_CLASS_IDS, normalizeLoadoutClassId, normalizeLoadoutClassName, normalizeLoadoutDefinition, defaultLoadoutClasses, normalizeLoadoutClasses, loadoutClassById,
  DEFAULT_WORLD_SETTINGS, DEFAULT_MATCH_RULES, GAME_MODES, DEFAULT_GAME_MODE, normalizeGameMode, gameModeSpec, normalizeWorldSettings, MOVEMENT_FEEL, WEAPON_SWITCH_MS, EQUIPMENT_THROW_COMMIT_MS, EQUIPMENT_WEAPON_RECOVER_MS, TACTICAL_THROW_SPEED, TACTICAL_THROW_LOFT, TACTICAL_GRAVITY, equipmentCollisionRadius, SMOKE_DURATION_MS, SMOKE_LOS_RADIUS_SCALE, SMOKE_GROW_MS, SMOKE_START_SCALE, GROUND_FOLLOW_DROP,
  DEFAULT_MAP_ID, normalizeMapId, mapSpec
} from './game-config.js?v=1.44.42';
import { createProjectileCollisionGrid } from './collision-grid.js?v=1.44.42';
import { createAudioEngine } from './audio-engine.js?v=1.44.42';
import { normalizeMatchState as normalizeSharedMatchState } from './match-model.js?v=1.44.42';
import { MATCH_STATUS, matchAllowsLobbyEdits, matchAllowsMovement, matchAllowsCombat, matchPhaseChanged } from './gameplay-phase.js?v=1.44.42';
import { MAX_PLAYER_PHYSICS_STEP_SEC, advanceVerticalMotion, advanceKnockback, sweepHorizontalMovement, createTraversalPlan, traversalPose, tacticalThrowVelocity, LADDER_CLIMB_SPEED, ladderById, ladderClimbPoint, ladderBottomExitPoint, ladderTopExitPoint, findLadderEntry, ladderClimbStep } from './movement-model.js?v=1.44.42';
import { SHELL_PANEL, createSessionShell, detectInputPlatform } from './app-lifecycle.js?v=1.44.42';
import { GAMEPAD_BUTTON, createGamepadInput } from './gamepad-input.js?v=1.44.42';

let THREE = null;

// A room owns one authoritative map. Both maps export the same world contract,
// so movement, traversal, minimap, rendering and prediction switch together.
const {PLAYER_HEIGHT,PLAYER_RADIUS,ARENA_LIMIT,MAX_STEP_HEIGHT}=HighlandsGeometry;
const CLIENT_WORLD_BUNDLES=Object.freeze({
  highlands:Object.freeze({geometry:HighlandsGeometry,collision:HighlandsWorldCollision}),
  depot:Object.freeze({geometry:DepotGeometry,collision:DepotWorldCollision}),
  yard:Object.freeze({geometry:YardGeometry,collision:YardWorldCollision}),
  rig:Object.freeze({geometry:RigGeometry,collision:RigWorldCollision}),
});
let currentMapId=DEFAULT_MAP_ID;
let worldGeometry=HighlandsGeometry;
let activeWorldCollision=HighlandsWorldCollision;
let STATIC_BOXES=worldGeometry.STATIC_BOXES,BUILDINGS=worldGeometry.BUILDINGS,PYRAMIDS=worldGeometry.PYRAMIDS,NATURAL_OBSTACLES=worldGeometry.NATURAL_OBSTACLES,LADDERS=worldGeometry.LADDERS||[];
let TERRAIN_SIZE=worldGeometry.TERRAIN_SIZE,TERRAIN_SEGMENTS=worldGeometry.TERRAIN_SEGMENTS,BUILDING_GEOMETRY=worldGeometry.BUILDING_GEOMETRY,BUILDING_PARTS=worldGeometry.BUILDING_PARTS;
let terrainHeight=worldGeometry.terrainHeight,naturalGroundBase=worldGeometry.naturalGroundBase,worldSupportHeight=worldGeometry.worldSupportHeight,worldStepUpHeight=worldGeometry.worldStepUpHeight,resolveCeilingCollision=worldGeometry.resolveCeilingCollision;
function worldBlockedAt(...args){return activeWorldCollision.worldBlockedAt(...args);}
function worldMoveBlockedAt(...args){return activeWorldCollision.worldMoveBlockedAt(...args);}
function worldHeightExpansionBlockedAt(...args){return activeWorldCollision.worldHeightExpansionBlockedAt(...args);}
function findTraversalCandidate(...args){return activeWorldCollision.findTraversalCandidate(...args);}

// Change only this line if Cloudflare gives your Worker a different URL.
const GRENADE_LAUNCH_PITCH=(Number(WEAPON_SPECS.grenadeLauncher?.launchPitchDeg)||0)*Math.PI/180;
const ONLINE_API = 'https://breach-online.kiadesignenterprise.workers.dev';
const MOBILE_MOVE_ZONE_RATIO = .35;
const CLIENT_FIXED_STEP_SEC = 1/60;
const CLIENT_MAX_FRAME_SEC = .12;
const CLIENT_MAX_SIM_STEPS = 4;
const GROUND_ACCELERATION = MOVEMENT_FEEL.groundAcceleration;
const GROUND_BRAKING = MOVEMENT_FEEL.groundBraking;
const AIR_ACCELERATION = MOVEMENT_FEEL.airAcceleration;
const SPRINT_SPEED_MULTIPLIER = MOVEMENT_FEEL.sprintSpeedMultiplier;
const SPRINT_MIN_FORWARD = MOVEMENT_FEEL.sprintMinForward;
const SPRINT_MIN_INPUT = MOVEMENT_FEEL.sprintMinInput;
const TOUCH_SPRINT_MIN_INPUT = .78;
const TOUCH_SPRINT_MIN_FORWARD = .52;
const SLIDE_DURATION_MS = MOVEMENT_FEEL.slideDurationMs;
const SLIDE_START_SPEED_MULTIPLIER = MOVEMENT_FEEL.slideStartSpeedMultiplier;
const SLIDE_END_SPEED_MULTIPLIER = MOVEMENT_FEEL.slideEndSpeedMultiplier;
const SLIDE_STEER = MOVEMENT_FEEL.slideSteer;
const SLIDE_RECOVERY_MS = MOVEMENT_FEEL.slideRecoveryMs;
const COYOTE_TIME_MS = MOVEMENT_FEEL.coyoteTimeMs;
const JUMP_BUFFER_MS = MOVEMENT_FEEL.jumpBufferMs;
const TOUCH_JOY_BUTTON_PADDING = 12;
const CONTROLLER_LOOK_YAW_RATE = 2.75;
const CONTROLLER_LOOK_PITCH_RATE = 2.25;
const CONTROLLER_TRIGGER_THRESHOLD = .28;
const CONTROLLER_TRIGGER_RELEASE_THRESHOLD = .18;
function freshClientAmmo(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,weaponCapacity(name)]));}
function freshClientEquipment(tactical='flash',lethal='sticky'){return equipmentForLoadout(tactical,lethal);}
const HUD_ACCENT='#d7ff58', HUD_SURFACE='rgba(9,11,13,.90)', HUD_LINE='rgba(255,255,255,.16)', HUD_MUTED='#8b969f';
const IRON_SIGHT_WEAPONS = new Set(['pistol','assault','ump','machineGun','shotgun','semiShotgun','rpg']);
const CHAT_MAX_LENGTH=120,CHAT_VISIBLE_MS=9000,CHAT_MAX_MESSAGES=28;
const ACTIVE_STATE_INTERVAL = 33;
const IDLE_STATE_INTERVAL = 250;
const LOCAL_PREDICTION_HISTORY_MS = 5000;
const LOCAL_PREDICTION_MAX_SAMPLES = 192;
const REMOTE_INTERPOLATION_MS = 85;
const REMOTE_INTERPOLATION_MIN_MS = 70;
const REMOTE_INTERPOLATION_MAX_MS = 220;
const REMOTE_EXTRAPOLATION_MAX_MS = 70;
const REMOTE_HISTORY_MS = 1400;
const REMOTE_HISTORY_MAX_SAMPLES = 64;
// Physical collision/support remains authoritative and discrete. These rates only smooth presentation.
const CROUCH_VIEW_RATE = 13;
const GROUND_VIEW_UP_RATE = 18;
const GROUND_VIEW_DOWN_RATE = 16;
const GROUND_VIEW_MAX_LAG = 0.055;
const AIR_VIEW_RATE = 28;
const VIEW_VERTICAL_SNAP_DISTANCE = 2.75;
const CORRECTION_VIEW_RATE = 13.5;
const CORRECTION_MAX_HORIZONTAL = 0.72;
const CORRECTION_MAX_VERTICAL = 0.55;
const CORRECTION_HARD_SNAP_DISTANCE = 1.35;
const NET_DIAG_URL_ENABLED = new URL(location.href).searchParams.get('netdiag')==='1';
const NET_DIAG_FRAME_STALL_MS = 100;
// Entire sound set is generated locally as 16-bit PCM WAV assets.
// No third-party or runtime-hosted audio is required.
const AUDIO_ASSET_REV='audio-20260828-2';
const ATTACHMENT_AUDIO_REV='audio-20260829-1';
const SOUND_CUES = {
  introMusic:{url:`audio/intro.wav?rev=${AUDIO_ASSET_REV}`,group:'Music',gain:.40,loop:true},
  shotPistol:{url:`audio/shot-pistol.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.78},
  shotAssault:{url:`audio/shot-assault.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.72},
  shotUmp:{url:`audio/shot-ump.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.70},
  shotMachineGun:{url:'audio/shot-machine-gun.wav?rev=audio-20260828-3',group:'Gunfire',gain:.90},
  shotPistolSuppressed:{url:`audio/shot-pistol-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.62},
  shotAssaultSuppressed:{url:`audio/shot-assault-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.58},
  shotUmpSuppressed:{url:`audio/shot-ump-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.62},
  shotMachineGunSuppressed:{url:`audio/shot-machine-gun-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.62},
  shotSniperSuppressed:{url:`audio/shot-sniper-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.64},
  shotShotgunSuppressed:{url:`audio/shot-shotgun-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.72},
  shot1887Suppressed:{url:`audio/shot-1887-suppressed.wav?rev=${ATTACHMENT_AUDIO_REV}`,group:'Gunfire',gain:.74},
  shotShotgun:{url:`audio/shot-shotgun.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.88},
  shot1887:{url:`audio/shot-1887.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.90},
  shotSemiShotgun:{url:`audio/shot-semi-shotgun.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.90},
  shotSniper:{url:`audio/shot-sniper.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.98},
  shotGl:{url:`audio/shot-gl.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.82},
  shotRpg:{url:`audio/shot-rpg.wav?rev=${AUDIO_ASSET_REV}`,group:'Gunfire',gain:.88},
  reloadPistol:{url:`audio/reload-pistol.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.66},
  reloadAssault:{url:`audio/reload-assault.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.64},
  reloadUmp:{url:`audio/reload-ump.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.62},
  reloadMachineGun:{url:'audio/reload-machine-gun.wav?rev=audio-20260828-3',group:'Weapon Handling',gain:.72},
  reloadShotgun:{url:`audio/reload-shotgun.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.68},
  reload1887:{url:`audio/reload-1887.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.70},
  reloadSemiShotgun:{url:`audio/reload-semi-shotgun.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.66},
  shotgunPump:{url:`audio/shotgun-pump.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.78},
  action1887:{url:`audio/action-1887.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.80},
  reloadSniper:{url:`audio/reload-sniper.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.72},
  reloadGl:{url:`audio/reload-gl.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.72},
  reloadRpg:{url:`audio/reload-rpg.wav?rev=${AUDIO_ASSET_REV}`,group:'Weapon Handling',gain:.76},
  hitmarker:{url:`audio/hitmarker.wav?rev=${AUDIO_ASSET_REV}`,group:'Feedback',gain:.58},
  headshot:{url:`audio/headshot.wav?rev=${AUDIO_ASSET_REV}`,group:'Feedback',gain:.58},
  kill:{url:`audio/kill.wav?rev=${AUDIO_ASSET_REV}`,group:'Feedback',gain:.58},
  announcer:{url:`audio/announcer.wav?rev=${AUDIO_ASSET_REV}`,group:'Feedback',gain:.54},
  shield:{url:`audio/shield.wav?rev=${AUDIO_ASSET_REV}`,group:'Feedback',gain:.58},
  hurt:{url:`audio/hurt.wav?rev=${AUDIO_ASSET_REV}`,group:'Feedback',gain:.60},
  jump:{url:`audio/jump.wav?rev=${AUDIO_ASSET_REV}`,group:'Movement',gain:.34},
  footstepLeft:{url:`audio/footstep-left.wav?rev=${AUDIO_ASSET_REV}`,group:'Movement',gain:.42},
  footstepRight:{url:`audio/footstep-right.wav?rev=${AUDIO_ASSET_REV}`,group:'Movement',gain:.42},
  land:{url:`audio/land.wav?rev=${AUDIO_ASSET_REV}`,group:'Movement',gain:.66},
  slide:{url:`audio/slide.wav?rev=${AUDIO_ASSET_REV}`,group:'Movement',gain:.58},
  impactWall:{url:`audio/impact-wall.wav?rev=${AUDIO_ASSET_REV}`,group:'Impacts',gain:.62},
  impactPlayer:{url:`audio/impact-player.wav?rev=${AUDIO_ASSET_REV}`,group:'Impacts',gain:.60},
  impactBlocked:{url:`audio/impact-blocked.wav?rev=${AUDIO_ASSET_REV}`,group:'Impacts',gain:.58},
  flashThrow:{url:`audio/flash-throw.wav?rev=${AUDIO_ASSET_REV}`,group:'Tactical',gain:.52},
  stickyThrow:{url:`audio/sticky-throw.wav?rev=${AUDIO_ASSET_REV}`,group:'Tactical',gain:.52},
  flashImpact:{url:`audio/flash-impact.wav?rev=${AUDIO_ASSET_REV}`,group:'Tactical',gain:.58},
  stickyImpact:{url:`audio/sticky-impact.wav?rev=${AUDIO_ASSET_REV}`,group:'Tactical',gain:.62},
  semtexBeep:{url:`audio/semtex-beep.wav?rev=${AUDIO_ASSET_REV}`,group:'Tactical',gain:.60},
  flashDetonate:{url:`audio/flash-detonate.wav?rev=${AUDIO_ASSET_REV}`,group:'Explosions',gain:.88},
  grenadeExplosion:{url:`audio/grenade-explosion.wav?rev=${AUDIO_ASSET_REV}`,group:'Explosions',gain:1},
  glExplosion:{url:`audio/gl-explosion.wav?rev=${AUDIO_ASSET_REV}`,group:'Explosions',gain:1},
  rpgExplosion:{url:`audio/rpg-explosion.wav?rev=${AUDIO_ASSET_REV}`,group:'Explosions',gain:1},
};

let worldSettings=normalizeWorldSettings(DEFAULT_WORLD_SETTINGS);
const LONG_SHOT_DISTANCE = 30;

const $ = (id) => document.getElementById(id);

// Breach-owned UI controls. No native browser inputs, selects or range widgets are used.
function controlNumber(el,key,fallback){const n=Number(el?.dataset?.[key]);return Number.isFinite(n)?n:fallback;}
function controlDecimals(step){const raw=String(step??'1');return raw.includes('.')?Math.min(3,raw.split('.')[1].length):0;}
function gameCycleOptions(el){try{return JSON.parse(el?.dataset?.options||'[]');}catch{return[];}}
function renderGameControl(el){
  if(!el)return;
  const type=el.dataset?.gameControl,value=String(el.__gameValue??el.dataset?.value??'');
  if(type==='cycle'){
    const option=gameCycleOptions(el).find(o=>String(o.value)===value)||gameCycleOptions(el)[0];
    const out=el.querySelector('[data-control-value]');if(out)out.textContent=option?.label??value;
  }else if(type==='stepper'){
    const out=el.querySelector('[data-control-value]');if(out){const step=controlNumber(el,'step',1);out.textContent=Number.isFinite(Number(value))?Number(value).toFixed(controlDecimals(step)):value;}
    el.setAttribute('aria-valuenow',value);
  }else if(type==='slider'){
    const min=controlNumber(el,'min',0),max=controlNumber(el,'max',1),n=Math.max(min,Math.min(max,Number(value)||0)),pct=max>min?(n-min)/(max-min)*100:0;
    const fill=el.querySelector('[data-slider-fill]'),knob=el.querySelector('[data-slider-knob]');if(fill)fill.style.width=`${pct}%`;if(knob)knob.style.left=`${pct}%`;
    el.setAttribute('aria-valuenow',String(n));
  }else if(type==='text'){
    const out=el.querySelector('[data-control-value]');if(out){out.textContent=value||el.dataset.placeholder||'';out.classList.toggle('placeholder',!value);}
  }
}
function setGameControlValue(el,value,{emitInput=false,emitChange=false}={}){
  if(!el)return false;const type=el.dataset?.gameControl;
  let next=String(value??'');
  if(type==='cycle'){
    const opts=gameCycleOptions(el);if(opts.length&&!opts.some(o=>String(o.value)===next))next=String(opts[0].value);
  }else if(type==='stepper'||type==='slider'){
    const min=controlNumber(el,'min',-Infinity),max=controlNumber(el,'max',Infinity),step=controlNumber(el,'step',1);let n=Number(next);if(!Number.isFinite(n))n=Number.isFinite(min)?min:0;n=Math.max(min,Math.min(max,n));if(Number.isFinite(step)&&step>0&&Number.isFinite(min))n=min+Math.round((n-min)/step)*step;next=String(Number(n.toFixed(Math.max(0,controlDecimals(step)))));
  }else if(type==='text'){
    next=next.slice(0,Math.max(1,Number(el.dataset.maxlength)||64));
  }
  const previous=String(el.value??el.__gameValue??el.dataset?.value??'');el.value=next;const changed=next!==previous;
  if(emitInput)el.dispatchEvent(new Event('input',{bubbles:true}));if(emitChange&&changed)el.dispatchEvent(new Event('change',{bubbles:true}));return changed;
}
function adjustGameControl(el,dir,{commit=true}={}){
  if(!el||!dir||el.disabled||el.classList?.contains('disabled'))return false;const type=el.dataset?.gameControl;
  if(type==='cycle'){
    const opts=gameCycleOptions(el);if(!opts.length)return false;const cur=Math.max(0,opts.findIndex(o=>String(o.value)===String(el.value))),next=Math.max(0,Math.min(opts.length-1,cur+(dir>0?1:-1)));if(next===cur)return true;setGameControlValue(el,opts[next].value,{emitInput:true,emitChange:commit});return true;
  }
  if(type==='stepper'||type==='slider'){
    const step=controlNumber(el,'step',1);setGameControlValue(el,(Number(el.value)||0)+step*(dir>0?1:-1),{emitInput:true,emitChange:commit});return true;
  }
  return false;
}
function initGameControls(){
  for(const el of document.querySelectorAll('[data-game-control]')){
    const type=el.dataset.gameControl,initial=el.dataset.value??'';
    if(type==='text'){
      let current=initial;Object.defineProperty(el,'value',{configurable:true,get(){return current;},set(v){current=String(v??'').slice(0,Math.max(1,Number(el.dataset.maxlength)||64));el.__gameValue=current;el.dataset.value=current;renderGameControl(el);}});el.value=initial;
    }else{
      let current=initial;Object.defineProperty(el,'value',{configurable:true,get(){return current;},set(v){current=String(v??'');el.__gameValue=current;el.dataset.value=current;renderGameControl(el);}});
      Object.defineProperty(el,'disabled',{configurable:true,get(){return el.classList.contains('disabled');},set(v){el.classList.toggle('disabled',!!v);el.setAttribute('aria-disabled',v?'true':'false');for(const b of el.querySelectorAll('button'))b.disabled=!!v;}});
      for(const key of ['min','max','step'])Object.defineProperty(el,key,{configurable:true,get(){return el.dataset[key]??'';}});
      el.value=initial;
      const stepButtons=[...el.querySelectorAll('[data-control-step]')];
      let activeStepPress=null;
      const setPressedSide=dir=>{
        const side=dir>0?'1':dir<0?'-1':'';
        if(side)el.dataset.pressedStep=side;else delete el.dataset.pressedStep;
        for(const arrow of stepButtons)arrow.classList.toggle('pressed',!!side&&String(arrow.dataset.controlStep)===side);
      };
      const repeatStep=()=>{
        if(!activeStepPress)return;
        adjustGameControl(el,activeStepPress.dir,{commit:false});
        const heldFor=performance.now()-activeStepPress.pressStartedAt;
        const delay=heldFor>=2400?42:heldFor>=1200?68:105;
        activeStepPress.repeatTimer=setTimeout(repeatStep,delay);
      };
      const finishStepPress=e=>{
        if(!activeStepPress||(e?.pointerId!=null&&e.pointerId!==activeStepPress.pointerId))return;
        const press=activeStepPress;activeStepPress=null;clearTimeout(press.repeatTimer||0);setPressedSide(0);
        try{if(press.btn.hasPointerCapture?.(press.pointerId))press.btn.releasePointerCapture(press.pointerId);}catch{}
        if(String(el.value)!==press.startValue)el.dispatchEvent(new Event('change',{bubbles:true}));
      };
      for(const btn of stepButtons){
        const dir=Number(btn.dataset.controlStep)||0;
        btn.addEventListener('pointerdown',e=>{
          if(el.disabled||!dir||activeStepPress||(e.pointerType==='mouse'&&e.button!==0))return;
          e.preventDefault();e.stopPropagation();
          activeStepPress={btn,dir,pointerId:e.pointerId,repeatTimer:0,pressStartedAt:performance.now(),startValue:String(el.value)};
          setPressedSide(dir);
          try{btn.setPointerCapture?.(e.pointerId);}catch{}
          adjustGameControl(el,dir,{commit:false});
          activeStepPress.repeatTimer=setTimeout(repeatStep,360);
        });
        btn.addEventListener('pointerup',finishStepPress);
        btn.addEventListener('pointercancel',finishStepPress);
        btn.addEventListener('lostpointercapture',finishStepPress);
        btn.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();});
        btn.addEventListener('contextmenu',e=>e.preventDefault());
      }
      el.addEventListener('keydown',e=>{if(controllerInputActive()){if(e.key.startsWith('Arrow'))e.preventDefault();return;}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();adjustGameControl(el,-1);}else if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();adjustGameControl(el,1);}});
      if(type==='slider'){
        const track=el.querySelector('[data-slider-track]');let dragging=false;
        const setPointer=e=>{const r=track.getBoundingClientRect();if(r.width<=0)return;const min=controlNumber(el,'min',0),max=controlNumber(el,'max',1),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),raw=min+(max-min)*(x/r.width);setGameControlValue(el,raw,{emitInput:true,emitChange:false});};
        track?.addEventListener('pointerdown',e=>{if(el.disabled)return;e.preventDefault();dragging=true;track.setPointerCapture?.(e.pointerId);setPointer(e);});
        track?.addEventListener('pointermove',e=>{if(dragging)setPointer(e);});
        const end=e=>{if(!dragging)return;dragging=false;setPointer(e);el.dispatchEvent(new Event('change',{bubbles:true}));};track?.addEventListener('pointerup',end);track?.addEventListener('pointercancel',()=>{dragging=false;});
      }
    }
  }
}
function renderLoadoutChoiceGrids(){
  const slotItems={
    primary:PRIMARY_WEAPONS.map(id=>[id,WEAPON_SPECS[id]?.name||id]),
    secondary:SECONDARY_WEAPONS.map(id=>[id,WEAPON_SPECS[id]?.name||id]),
    tactical:TACTICAL_EQUIPMENT.map(id=>[id,EQUIPMENT_SPECS[id]?.name||id]),
    lethal:LETHAL_EQUIPMENT.map(id=>[id,EQUIPMENT_SPECS[id]?.name||id]),
  };
  for(const grid of document.querySelectorAll('[data-loadout-grid]')){
    const [surface,slot]=String(grid.dataset.loadoutGrid||'').split('-');
    const items=slotItems[slot]||[];grid.replaceChildren();
    for(const [id,label] of items){
      const button=document.createElement('button');button.className='loadout-choice';button.type='button';button.setAttribute(`data-${surface}-${slot}-choice`,id);button.dataset.controllerKey=`loadout:${surface}:${slot}:${id}`;
      const text=document.createElement('strong');text.textContent=label;button.append(text);grid.append(button);
    }
  }
}
renderLoadoutChoiceGrids();
const LOADOUT_WEAPON_ROLES=Object.freeze({
  pistol:'Reliable backup · Fast handling',akimbo1887:'Akimbo · Very close range',assault:'Balanced · Mid range',ump:'Mobile · Close range',machineGun:'Sustained fire · Support',shotgun:'High impact · Close range',semiShotgun:'Fast follow-up · Close range',sniper:'Precision · Long range',grenadeLauncher:'Area denial · Explosive',rpg:'Heavy explosive · Anti-group'
});
const loadoutFocusSlot={lobby:'primary',match:'primary'},loadoutWorkspaceMode={lobby:'classes',match:'classes'},loadoutPreviewDesired=new Map(),loadoutPreviewContexts=new Map(),loadoutAttachmentSlot={'lobby-primary':'','lobby-secondary':'','match-primary':'','match-secondary':''},loadoutAttachmentTrayOpen=new Set(),loadoutAttachmentCompareBase=new Map(),loadoutPreviewAdsKeys=new Set(),loadoutWeaponPickerOpen=new Set();
function loadoutSlotWeapon(draft,slot){return slot==='primary'?draft.primaryWeapon:draft.secondaryWeapon;}
function loadoutSlotAttachments(draft,slot){return slot==='primary'?draft.primaryAttachments:draft.secondaryAttachments;}
function loadoutDraftForSurface(surface){return normalizeLoadoutChoice(surface==='lobby'?(lobbyLoadoutDraft||selectedLoadout()):(loadoutDraft||loadoutBaseDraft||pendingLoadout||selectedLoadout()));}
function loadoutMetricClamp(v){return Math.max(0,Math.min(100,Number(v)||0));}
function loadoutControlScore(spec,accuracy=null,pelletWeapon=false){if(pelletWeapon&&accuracy){return loadoutMetricClamp(100-(Number(accuracy.hipDeg)||0)*9.5-(Number(accuracy.fireDeg)||0)*7);}const initial=Math.max(.001,Number(spec.recoilPitch)||0)+Math.max(0,Number(spec.recoilYaw)||0)*1.35,sustained=Math.max(.001,Number(spec.recoilMaxPitch)||Number(spec.recoilPitch)||0)+Math.max(0,Number(spec.recoilMaxYaw)||Number(spec.recoilYaw)||0)*1.35,initialScore=loadoutMetricClamp(106-initial*2350),sustainedScore=loadoutMetricClamp(106-sustained*400),recoveryScore=loadoutMetricClamp(((Number(spec.recoilRecovery)||8)-6)/12*100);return loadoutMetricClamp(initialScore*.40+sustainedScore*.50+recoveryScore*.10);}
function loadoutMobilityScore(spec){const adsMove=Math.max(.5,Math.min(1.25,Number(spec.adsMoveSpeedScale)||1)),sprint=Math.max(80,Math.min(350,Number(spec.sprintOutMs)||180));return loadoutMetricClamp(adsMove*72+(1-(sprint-80)/270)*28);}
function loadoutHandlingScore(spec){const ads=Math.max(0,Math.min(420,Number(spec.adsInMs)||0)),reload=Math.max(500,Math.min(4000,Number(spec.reloadMs)||1500));return loadoutMetricClamp((1-ads/420)*68+(1-(reload-500)/3500)*32);}
function loadoutWeaponStats(weapon,attachments,comparisonAttachments={}){
  const spec=resolveWeaponSpec(weapon,attachments),compare=resolveWeaponSpec(weapon,comparisonAttachments),pellets=Math.max(1,Number(spec.pellets)||1),accuracy=resolveWeaponAccuracy(weapon,attachments),compareAccuracy=resolveWeaponAccuracy(weapon,comparisonAttachments),pelletWeapon=pellets>1;
  return[
    {label:'DAMAGE',value:pellets>1?`${Math.round(spec.damage)}×${pellets}`:`${Math.round(spec.damage)}`,score:loadoutMetricClamp((Number(spec.damage)||0)*(pellets>1?2.1:1.65)),baseScore:loadoutMetricClamp((Number(compare.damage)||0)*(pellets>1?2.1:1.65))},
    {label:'RANGE',value:`${Math.round(spec.falloffEnd||0)}M`,score:loadoutMetricClamp((Number(spec.falloffEnd)||0)/2.2),baseScore:loadoutMetricClamp((Number(compare.falloffEnd)||0)/2.2)},
    {label:'CONTROL',value:`${Math.round(loadoutControlScore(spec,accuracy,pelletWeapon))}`,score:loadoutControlScore(spec,accuracy,pelletWeapon),baseScore:loadoutControlScore(compare,compareAccuracy,pelletWeapon)},
    {label:'MOBILITY',value:`${Math.round((Number(spec.adsMoveSpeedScale)||1)*100)}%`,score:loadoutMobilityScore(spec),baseScore:loadoutMobilityScore(compare)},
    {label:'HANDLING',value:`${Math.round(loadoutHandlingScore(spec))}`,score:loadoutHandlingScore(spec),baseScore:loadoutHandlingScore(compare)},
    {label:'CAPACITY',value:`${Math.round(spec.mag||0)}`,score:loadoutMetricClamp(Number(spec.mag)||0),baseScore:loadoutMetricClamp(Number(compare.mag)||0)},
  ];
}
function activeLoadoutAttachmentSlot(surface,weaponSlot,weapon){const key=`${surface}-${weaponSlot}`,available=ATTACHMENT_SLOTS.filter(slot=>attachmentOptionsForWeapon(weapon,slot).length),selected=loadoutAttachmentSlot[key];if(!available.includes(selected)){loadoutAttachmentSlot[key]='';loadoutAttachmentTrayOpen.delete(key);loadoutAttachmentCompareBase.delete(key);return'';}return selected;}
function setLoadoutAttachmentComparisonBase(surface,weaponSlot,weapon,slot,attachments){const key=`${surface}-${weaponSlot}`;loadoutAttachmentCompareBase.set(key,{weapon,slot,attachments:normalizeWeaponAttachments(weapon,attachments)});}
function clearLoadoutAttachmentComparisonBase(key){loadoutAttachmentCompareBase.delete(key);}
function loadoutComparisonAttachments(surface,weaponSlot,weapon,attachments){const key=`${surface}-${weaponSlot}`,current=normalizeWeaponAttachments(weapon,attachments);if(!loadoutAttachmentTrayOpen.has(key))return current;const activeSlot=activeLoadoutAttachmentSlot(surface,weaponSlot,weapon),saved=loadoutAttachmentCompareBase.get(key);if(saved&&saved.weapon===weapon&&saved.slot===activeSlot)return normalizeWeaponAttachments(weapon,saved.attachments);return current;}
function renderLoadoutStats(surface,slot,weapon,attachments){
  const host=document.querySelector(`[data-loadout-stats="${surface}-${slot}"]`);if(!host)return;host.replaceChildren();const comparison=loadoutComparisonAttachments(surface,slot,weapon,attachments);
  for(const row of loadoutWeaponStats(weapon,attachments,comparison)){
    const target=loadoutMetricClamp(row.score),baseline=loadoutMetricClamp(row.baseScore),delta=target-baseline,card=document.createElement('div');card.className='loadout-stat';if(delta>1.2)card.classList.add('better');else if(delta<-1.2)card.classList.add('worse');
    const head=document.createElement('div');head.className='loadout-stat-head';const label=document.createElement('span');label.textContent=row.label;const value=document.createElement('strong');value.textContent=row.value;head.append(label,value);
    const change=document.createElement('div');change.className='loadout-stat-delta';change.textContent=Math.abs(delta)>1.2?`${delta>0?'▲':'▼'} ${Math.abs(Math.round(delta))}`:'NO CHANGE';
    const bar=document.createElement('div');bar.className='loadout-stat-bar';bar.setAttribute('aria-label',`${row.label}: ${Math.round(baseline)} to ${Math.round(target)}`);
    const solid=document.createElement('i');solid.className='loadout-stat-bar-solid';solid.style.width=`${Math.max(3,Math.min(target,baseline))}%`;bar.append(solid);
    if(Math.abs(delta)>1.2){const hatch=document.createElement('b');hatch.className=`loadout-stat-bar-hatch ${delta>0?'gain':'loss'}`;hatch.style.left=`${Math.min(target,baseline)}%`;hatch.style.width=`${Math.abs(delta)}%`;bar.append(hatch);}
    if(Math.abs(delta)>1.2){const baselineMark=document.createElement('em');baselineMark.className='loadout-stat-baseline-mark';baselineMark.style.left=`${baseline}%`;bar.append(baselineMark);}
    card.append(head,change,bar);host.append(card);
  }
}
function modifierTag(label,mult,{lowerBetter=false}={}){const n=Number(mult);if(!Number.isFinite(n)||Math.abs(n-1)<.005)return null;const pct=Math.round(Math.abs(n-1)*100),up=n>1,good=lowerBetter?!up:up;return{text:`${label} ${up?'+':'-'}${pct}%`,good};}
function attachmentEffectTags(item,weapon){if(!item)return[];const tags=[],mods=attachmentModsForWeapon(item,weapon),accuracyMods=attachmentAccuracyModsForWeapon(item,weapon),adsMoveAdd=attachmentAdsMoveAddForWeapon(item,weapon),push=x=>{if(x&&tags.length<8)tags.push(x);};push(modifierTag('DAMAGE',mods.damage));push(modifierTag('VELOCITY',mods.bulletSpeed));push(modifierTag('RANGE',mods.falloffEnd));const recoilVals=[mods.recoilPitch,mods.recoilYaw].map(Number).filter(Number.isFinite);if(recoilVals.length){const avg=recoilVals.reduce((a,b)=>a+b,0)/recoilVals.length;push(modifierTag('RECOIL',avg,{lowerBetter:true}));}push(modifierTag('ADS TIME',mods.adsInMs,{lowerBetter:true}));push(modifierTag('SPRINT-OUT',mods.sprintOutMs,{lowerBetter:true}));push(modifierTag('RELOAD',mods.reloadMs,{lowerBetter:true}));if(adsMoveAdd)push({text:`ADS MOVE ${adsMoveAdd>0?'+':''}${Math.round(adsMoveAdd*100)}%`,good:adsMoveAdd>0});if(item.magAdd?.[weapon]){const add=Number(item.magAdd[weapon])||0,base=Math.max(0,Number(WEAPON_SPECS[weapon]?.mag)||0),next=Math.max(0,base+add);push({text:`MAG ${base}→${next}`,good:add>0});}if(accuracyMods){const fields=[['HIP SPREAD',accuracyMods.hipDeg],['ADS SPREAD',accuracyMods.adsDeg],['MOVE SPREAD',accuracyMods.moveDeg],['AIR SPREAD',accuracyMods.airborneDeg],['SLIDE SPREAD',accuracyMods.slideDeg],['FIRE SPREAD',accuracyMods.fireDeg],['MAX FIRE SPREAD',accuracyMods.fireMaxDeg]].filter(([,value])=>Number.isFinite(Number(value))&&Math.abs(Number(value)-1)>=.005),vals=fields.map(([,value])=>Number(value));if(vals.length){const same=vals.every(value=>Math.abs(value-vals[0])<.005);if(same)push(modifierTag('SPREAD',vals[0],{lowerBetter:true}));else for(const [label,value] of fields)push(modifierTag(label,value,{lowerBetter:true}));}}if(item.soundScale&&item.soundScale<1)push({text:'QUIETER / OFF RADAR',good:true});if(item.conditionalRecoilScale)push({text:`CROUCHED RECOIL -${Math.round((1-item.conditionalRecoilScale)*100)}%`,good:true});if(item.adsFov)push({text:item.highAdsFov?`OPTIC ${Math.round(item.adsFov)} / ${Number(item.highAdsFov).toFixed(1)} FOV`:`OPTIC ${Math.round(item.adsFov)} FOV`,good:true});return tags;}
function attachmentDescriptionForWeapon(item,weapon){if(!item)return'';const tags=attachmentEffectTags(item,weapon);return tags.length?tags.map(tag=>tag.text).join(' · '):'No gameplay stat change.';}
function loadoutOverviewAttachmentText(weapon,attachments){const names=ATTACHMENT_SLOTS.map(slot=>attachments?.[slot]?ATTACHMENTS[attachments[slot]]?.short||ATTACHMENTS[attachments[slot]]?.name:'').filter(Boolean);return names.length?names.join(' · '):'NO ATTACHMENTS';}
function renderLoadoutOverview(surface,draft){
  const safe=normalizeLoadoutChoice(draft),classes=surface==='lobby'?normalizeLoadoutClasses(lobbyClassDrafts||loadoutClasses,selectedLoadout()):normalizeLoadoutClasses(matchClassDrafts||loadoutClasses,selectedLoadout()),selected=normalizeLoadoutClassId(loadoutEditClass[surface]||activeClassId),classInfo=loadoutClassById(classes,selected,selectedLoadout()),name=document.querySelector(`[data-loadout-overview-name="${surface}"]`);if(name){const label=document.createElement('span');label.textContent=classInfo.name;const icon=document.createElement('span');icon.className='class-name-edit-icon';icon.setAttribute('aria-hidden','true');icon.textContent='✎';name.replaceChildren(label,icon);}
  for(const slot of ['primary','secondary']){const key=`${surface}-${slot}`,weapon=loadoutSlotWeapon(safe,slot),attachments=loadoutSlotAttachments(safe,slot),spec=resolveWeaponSpec(weapon,attachments),weaponEl=document.querySelector(`[data-loadout-overview-weapon="${key}"]`),modsEl=document.querySelector(`[data-loadout-overview-mods="${key}"]`);if(weaponEl)weaponEl.textContent=spec.name||weapon;if(modsEl)modsEl.textContent=loadoutOverviewAttachmentText(weapon,attachments);}
  const tactical=document.querySelector(`[data-loadout-overview-equipment="${surface}-tactical"]`),lethal=document.querySelector(`[data-loadout-overview-equipment="${surface}-lethal"]`);if(tactical)tactical.textContent=EQUIPMENT_SPECS[safe.tactical]?.name||safe.tactical;if(lethal)lethal.textContent=EQUIPMENT_SPECS[safe.lethal]?.name||safe.lethal;
  const focus=loadoutFocusSlot[surface]||'primary',title=document.querySelector(`[data-loadout-item-title="${surface}"]`),kicker=document.querySelector(`[data-loadout-item-kicker="${surface}"]`);if(title){title.textContent=focus==='primary'||focus==='secondary'?(resolveWeaponSpec(loadoutSlotWeapon(safe,focus),loadoutSlotAttachments(safe,focus)).name||loadoutSlotWeapon(safe,focus)):(EQUIPMENT_SPECS[safe[focus]]?.name||safe[focus]);}if(kicker)kicker.textContent=focus==='primary'?'PRIMARY WEAPON':focus==='secondary'?'SECONDARY WEAPON':focus==='tactical'?'TACTICAL':'LETHAL';
  if(name&&'value' in name)name.value=classInfo.name;
}
function syncLoadoutFocusedView(surface,draft){
  const safe=normalizeLoadoutChoice(draft);for(const slot of ['primary','secondary']){const weapon=loadoutSlotWeapon(safe,slot),attachments=loadoutSlotAttachments(safe,slot),key=`${surface}-${slot}`,spec=resolveWeaponSpec(weapon,attachments),nameEl=document.querySelector(`[data-loadout-weapon-name="${key}"]`),roleEl=document.querySelector(`[data-loadout-weapon-role="${key}"]`),ammoEl=document.querySelector(`[data-loadout-weapon-ammo="${key}"]`);if(nameEl)nameEl.textContent=spec.name||weapon;if(roleEl)roleEl.textContent=LOADOUT_WEAPON_ROLES[weapon]||'Weapon';if(ammoEl)ammoEl.textContent=`${spec.mag} ROUNDS`;renderLoadoutStats(surface,slot,weapon,attachments);loadoutPreviewDesired.set(key,{weapon,attachments:{...attachments},signature:`${weapon}:${JSON.stringify(attachments||{})}`});}
  renderLoadoutOverview(surface,safe);
}
function showLoadoutItemPage(surface,item='primary',{ensurePreview=true}={}){const focus=['primary','secondary','tactical','lethal'].includes(item)?item:'primary';loadoutFocusSlot[surface]=focus;for(const page of document.querySelectorAll(`[data-loadout-weapon-page^="${surface}-"]`)){const active=page.dataset.loadoutWeaponPage===`${surface}-${focus}`;page.hidden=!active;page.inert=!active;page.classList.toggle('active',active);}for(const page of document.querySelectorAll(`[data-loadout-equipment-page^="${surface}-"]`)){const active=page.dataset.loadoutEquipmentPage===`${surface}-${focus}`;page.hidden=!active;page.inert=!active;page.classList.toggle('active',active);}renderLoadoutOverview(surface,loadoutDraftForSurface(surface));if(ensurePreview&&(focus==='primary'||focus==='secondary')){const key=`${surface}-${focus}`;requestAnimationFrame(()=>{if(loadoutPreviewDesired.has(key))void ensureLoadoutPreviewEngine();});}}
function syncLobbyLoadoutFocusMode(mode=loadoutWorkspaceMode.lobby){const lobby=$('lobbyScreen'),loadoutTab=document.querySelector('[data-lobby-side-tab="loadout"]'),focused=!!lobby&&loadoutTab?.classList.contains('active')&&mode!=='classes';lobby?.classList.toggle('loadout-focused',focused);}
function setLoadoutWorkspaceMode(surface,mode='classes',{item=loadoutFocusSlot[surface]||'primary',ensurePreview=true}={}){const next=['classes','class','item'].includes(mode)?mode:'classes';loadoutWorkspaceMode[surface]=next;const workspace=document.querySelector(`[data-loadout-workspace="${surface}"]`),views={classes:document.querySelector(`[data-loadout-classes-view="${surface}"]`),class:document.querySelector(`[data-loadout-class-view="${surface}"]`),item:document.querySelector(`[data-loadout-item-view="${surface}"]`)};if(workspace)workspace.dataset.view=next;for(const [name,view] of Object.entries(views))if(view){const active=name===next;view.hidden=!active;view.inert=!active;view.classList.toggle('active',active);}if(surface==='lobby')syncLobbyLoadoutFocusMode(next);if(next==='item')showLoadoutItemPage(surface,item,{ensurePreview});else{for(const key of [...loadoutPreviewAdsKeys])if(key.startsWith(`${surface}-`))setLoadoutAdsPreview(key,false);renderLoadoutOverview(surface,loadoutDraftForSurface(surface));renderLoadoutClassStrip(surface);} }
function setLoadoutAdsPreview(key,active){if(active)loadoutPreviewAdsKeys.add(key);else loadoutPreviewAdsKeys.delete(key);document.querySelector(`[data-loadout-ads-preview="${key}"]`)?.classList.toggle('active',!!active);const ctx=loadoutPreviewContexts.get(key);if(ctx)ctx.adsPreview=!!active;}
function bindLoadoutWorkspaceTabs(){
  for(const nameButton of document.querySelectorAll('[data-loadout-class-name-edit]')){const surface=nameButton.dataset.loadoutClassNameEdit;nameButton.dataset.controllerKey=`class-name:${surface}`;nameButton.dataset.textMode='class';nameButton.dataset.maxlength='18';nameButton.dataset.placeholder='CLASS NAME';nameButton.addEventListener('click',()=>{const classes=loadoutClassesForSurface(surface),item=loadoutClassById(classes,loadoutEditClass[surface],selectedLoadout());nameButton.value=item.name;openGameTextEditor(nameButton);});nameButton.addEventListener('change',()=>renameLoadoutClass(surface,loadoutEditClass[surface],nameButton.value));}
  for(const button of document.querySelectorAll('[data-loadout-edit-item]')){button.dataset.controllerKey=`class-item:${button.dataset.loadoutEditItem}`;button.addEventListener('click',()=>{const [surface,item]=String(button.dataset.loadoutEditItem||'').split('-');loadoutAttachmentTrayOpen.delete(`${surface}-${item}`);clearLoadoutAttachmentComparisonBase(`${surface}-${item}`);loadoutWeaponPickerOpen.delete(`${surface}-${item}`);setLoadoutWorkspaceMode(surface,'item',{item});if(item==='primary'||item==='secondary'){renderAttachmentEditor(surface,item,loadoutDraftForSurface(surface));const weapon=loadoutSlotWeapon(loadoutDraftForSurface(surface),item),first=ATTACHMENT_SLOTS.find(slot=>attachmentOptionsForWeapon(weapon,slot).length);if(first)queueControllerUiFocus(`gunsmith:${surface}-${item}:slot:${first}`);else queueControllerUiFocus(`weapon-toggle:${surface}-${item}`);}else queueControllerUiFocus(`loadout:${surface}:${item}:${loadoutDraftForSurface(surface)[item]}`);});}
  for(const button of document.querySelectorAll('[data-loadout-back-class]')){button.dataset.controllerKey=`back-class:${button.dataset.loadoutBackClass}`;button.addEventListener('click',()=>{const surface=button.dataset.loadoutBackClass,setItem=loadoutFocusSlot[surface]||'primary';setLoadoutWorkspaceMode(surface,'class',{ensurePreview:false});queueControllerUiFocus(`class-item:${surface}-${setItem}`);});}
  for(const button of document.querySelectorAll('[data-loadout-back-classes]')){button.dataset.controllerKey=`back-classes:${button.dataset.loadoutBackClasses}`;button.addEventListener('click',()=>{const surface=button.dataset.loadoutBackClasses;setLoadoutWorkspaceMode(surface,'classes',{ensurePreview:false});queueControllerUiFocus(`class:${surface}:${normalizeLoadoutClassId(loadoutEditClass[surface]||activeClassId)}:main`);});}
  for(const button of document.querySelectorAll('[data-loadout-weapon-picker-toggle]')){const stableKey=button.dataset.loadoutWeaponPickerToggle;button.dataset.controllerKey=`weapon-toggle:${stableKey}`;button.addEventListener('click',()=>{const key=button.dataset.loadoutWeaponPickerToggle,[surface,slot]=key.split('-');if(loadoutWeaponPickerOpen.has(key)){loadoutWeaponPickerOpen.delete(key);renderAttachmentEditor(surface,slot,loadoutDraftForSurface(surface));queueControllerUiFocus(`weapon-toggle:${key}`);}else{loadoutWeaponPickerOpen.add(key);loadoutAttachmentTrayOpen.delete(key);clearLoadoutAttachmentComparisonBase(key);renderAttachmentEditor(surface,slot,loadoutDraftForSurface(surface));queueControllerUiFocus(`loadout:${surface}:${slot}:${loadoutSlotWeapon(loadoutDraftForSurface(surface),slot)}`);}renderLoadoutStats(surface,slot,loadoutSlotWeapon(loadoutDraftForSurface(surface),slot),loadoutSlotAttachments(loadoutDraftForSurface(surface),slot));});}
  for(const button of document.querySelectorAll('[data-loadout-ads-preview]')){const key=button.dataset.loadoutAdsPreview;const down=e=>{e.preventDefault();button.setPointerCapture?.(e.pointerId);setLoadoutAdsPreview(key,true);};const up=e=>{e.preventDefault();try{button.releasePointerCapture?.(e.pointerId);}catch{}setLoadoutAdsPreview(key,false);};button.addEventListener('pointerdown',down);button.addEventListener('pointerup',up);button.addEventListener('pointercancel',()=>setLoadoutAdsPreview(key,false));button.addEventListener('lostpointercapture',()=>setLoadoutAdsPreview(key,false));button.addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat){e.preventDefault();setLoadoutAdsPreview(key,true);}});button.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();setLoadoutAdsPreview(key,false);}});button.addEventListener('click',e=>{if(e.detail===0)setLoadoutAdsPreview(key,!loadoutPreviewAdsKeys.has(key));});}
}
function applyLoadoutAttachmentChoice(surface,weaponSlot,slot,id){const live=loadoutDraftForSurface(surface),key=weaponSlot==='primary'?'primaryAttachments':'secondaryAttachments',next={...loadoutSlotAttachments(live,weaponSlot),[slot]:id};if(surface==='lobby'){setLobbyLoadoutDraft({[key]:next});renderAttachmentEditors('lobby',lobbyLoadoutDraft||loadoutDraftForSurface('lobby'));}else{loadoutDraft=normalizeLoadoutChoice({...live,[key]:next});syncMatchLoadoutEditor();commitMatchLoadoutChange();}}
function renderGunsmithCallouts(surface,weaponSlot,weapon,current,groups){const key=`${surface}-${weaponSlot}`,host=document.querySelector(`[data-gunsmith-callouts="${key}"]`);if(!host)return;host.replaceChildren();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('gunsmith-callout-lines');svg.setAttribute('aria-hidden','true');host.append(svg);for(const [slot] of groups){const line=document.createElementNS('http://www.w3.org/2000/svg','line');line.dataset.calloutLine=slot;const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');dot.dataset.calloutDot=slot;dot.setAttribute('r','2.8');svg.append(line,dot);const b=document.createElement('button');b.type='button';b.className=`gunsmith-callout gunsmith-callout-${slot}`;b.dataset.calloutSlot=slot;b.dataset.controllerKey=`gunsmith:${key}:slot:${slot}`;const label=document.createElement('span');label.textContent=slot.toUpperCase();const id=current?.[slot]||'',item=id?ATTACHMENTS[id]:null,value=document.createElement('strong');value.textContent=item?.short||item?.name||'NONE';b.append(label,value);b.classList.toggle('active',loadoutAttachmentTrayOpen.has(key)&&loadoutAttachmentSlot[key]===slot);b.classList.toggle('equipped',!!item);b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();loadoutWeaponPickerOpen.delete(key);if(!loadoutAttachmentTrayOpen.has(key)||loadoutAttachmentSlot[key]!==slot)setLoadoutAttachmentComparisonBase(surface,weaponSlot,weapon,slot,current);loadoutAttachmentSlot[key]=slot;loadoutAttachmentTrayOpen.add(key);renderAttachmentEditor(surface,weaponSlot,loadoutDraftForSurface(surface));renderLoadoutStats(surface,weaponSlot,weapon,loadoutSlotAttachments(loadoutDraftForSurface(surface),weaponSlot));const selected=current?.[slot]||'';queueControllerUiFocus(`attachment:${key}:${slot}:${selected||'none'}`);});host.append(b);} }
function renderAttachmentEditor(surface,weaponSlot,draft){
  const host=document.querySelector(`[data-attachment-editor="${surface}-${weaponSlot}"]`);if(!host)return;const key=`${surface}-${weaponSlot}`,weapon=loadoutSlotWeapon(draft,weaponSlot),current=loadoutSlotAttachments(draft,weaponSlot),groups=ATTACHMENT_SLOTS.map(slot=>[slot,attachmentOptionsForWeapon(weapon,slot)]).filter(([,items])=>items.length),picker=document.querySelector(`[data-gunsmith-weapon-picker="${key}"]`),weaponPicker=loadoutWeaponPickerOpen.has(key);if(picker)picker.hidden=!weaponPicker;host.hidden=weaponPicker;renderGunsmithCallouts(surface,weaponSlot,weapon,current,groups);if(weaponPicker)return;host.replaceChildren();host.classList.toggle('empty',groups.length===0);if(!groups.length){const empty=document.createElement('div');empty.className='gunsmith-inspector-empty';empty.innerHTML='<strong>NO ATTACHMENTS</strong><span>This weapon has no configurable attachment slots.</span>';host.append(empty);return;}
  const activeSlot=activeLoadoutAttachmentSlot(surface,weaponSlot,weapon),activeItems=activeSlot?(groups.find(([slot])=>slot===activeSlot)?.[1]||[]):[];if(!activeSlot||!loadoutAttachmentTrayOpen.has(key)){const intro=document.createElement('div');intro.className='gunsmith-inspector-intro';const equipped=ATTACHMENT_SLOTS.reduce((n,slot)=>n+(current?.[slot]?1:0),0);intro.innerHTML=`<span>GUNSMITH</span><strong>SELECT A WEAPON PART</strong><p>Tap a callout on the weapon to browse that attachment slot.</p><small>${equipped} ATTACHMENT${equipped===1?'':'S'} EQUIPPED</small>`;host.append(intro);return;}
  const selectedId=current?.[activeSlot]||'',selectedItem=selectedId?ATTACHMENTS[selectedId]:null,head=document.createElement('header');head.className='gunsmith-attachment-head';const title=document.createElement('div'),eyebrow=document.createElement('span');eyebrow.textContent='ATTACHMENT SLOT';const strong=document.createElement('strong');strong.textContent=activeSlot.toUpperCase();const summary=document.createElement('small');summary.className='gunsmith-slot-summary';summary.textContent=selectedItem?`${selectedItem.name} · ${attachmentDescriptionForWeapon(selectedItem,weapon)}`:`BASE ${activeSlot.toUpperCase()} · NO ATTACHMENT`;title.append(eyebrow,strong,summary);const close=document.createElement('button');close.type='button';close.className='gunsmith-tray-close';close.textContent='×';close.setAttribute('aria-label','Close attachment options');close.dataset.controllerKey=`attachment:${key}:close`;close.addEventListener('click',()=>{const slot=loadoutAttachmentSlot[key];loadoutAttachmentTrayOpen.delete(key);clearLoadoutAttachmentComparisonBase(key);loadoutAttachmentSlot[key]='';renderAttachmentEditor(surface,weaponSlot,loadoutDraftForSurface(surface));renderLoadoutStats(surface,weaponSlot,weapon,loadoutSlotAttachments(loadoutDraftForSurface(surface),weaponSlot));queueControllerUiFocus(`gunsmith:${key}:slot:${slot}`);});head.append(title,close);
  const options=document.createElement('div');options.className='gunsmith-attachment-options';for(const item of [null,...activeItems]){const id=item?.id||'',b=document.createElement('button');b.type='button';b.className='gunsmith-attachment-option';b.dataset.controllerKey=`attachment:${key}:${activeSlot}:${id||'none'}`;b.classList.toggle('active',(current?.[activeSlot]||'')===id);const name=document.createElement('strong');name.textContent=item?.name||'NONE';const detail=document.createElement('small');detail.textContent=item?attachmentDescriptionForWeapon(item,weapon):`BASE ${activeSlot.toUpperCase()}`;b.append(name,detail);b.addEventListener('click',()=>{applyLoadoutAttachmentChoice(surface,weaponSlot,activeSlot,id);queueControllerUiFocus(`attachment:${key}:${activeSlot}:${id||'none'}`);});options.append(b);}host.append(head,options);
}
function renderAttachmentEditors(surface,draft){syncLoadoutFocusedView(surface,draft);renderAttachmentEditor(surface,'primary',draft);renderAttachmentEditor(surface,'secondary',draft);}
bindLoadoutWorkspaceTabs();for(const button of document.querySelectorAll('[data-loadout-ads-preview]'))button.dataset.controllerKey=`ads:${button.dataset.loadoutAdsPreview}`;
let adminWeaponSelection='assault';
function currentAdminWeaponSelection(){return WEAPON_ORDER.includes(adminWeaponSelection)?adminWeaponSelection:(WEAPON_ORDER[0]||'assault');}
function hydrateWeaponTuneSelector(){
  const state=$('adminWeaponSelect'),grid=$('adminWeaponGrid');if(!state||!grid)return;
  adminWeaponSelection=WEAPON_ORDER.includes(state.dataset.value)?state.dataset.value:(WEAPON_ORDER[0]||'assault');
  grid.replaceChildren();
  for(const id of WEAPON_ORDER){const button=document.createElement('button');button.type='button';button.className='admin-weapon-choice';button.dataset.adminWeaponChoice=id;button.dataset.controllerKey=`admin-weapon:${id}`;button.setAttribute('role','tab');button.textContent=WEAPON_SPECS[id]?.name||id;button.addEventListener('click',()=>syncAdminWeaponEditor(id));grid.append(button);}
}
hydrateWeaponTuneSelector();
const appRoot=$('appRoot'), gameStage=$('gameStage'), entryScreen=$('entryScreen'), rotateGate=$('rotateGate'), menu=$('menu'), lobbyScreen=$('lobbyScreen'), pause=$('pause'), lobbyQuitConfirm=$('lobbyQuitConfirm');
const nameInput=$('nameInput'),codeInput=$('codeInput'),menuStatus=$('menuStatus');
const deployTabs=[...document.querySelectorAll('[data-deploy-tab]')],deployViews=[...document.querySelectorAll('[data-deploy-view]')];
const lobbyModeButtons=[...document.querySelectorAll('[data-lobby-mode-choice]')],lobbyTeamButtons=[...document.querySelectorAll('[data-lobby-team-choice]')],lobbyPrimaryButtons=[...document.querySelectorAll('[data-lobby-primary-choice]')],lobbySecondaryButtons=[...document.querySelectorAll('[data-lobby-secondary-choice]')],lobbyTacticalButtons=[...document.querySelectorAll('[data-lobby-tactical-choice]')],lobbyLethalButtons=[...document.querySelectorAll('[data-lobby-lethal-choice]')],lobbyMapButtons=[...document.querySelectorAll('[data-lobby-map-choice]')],lobbySideTabs=[...document.querySelectorAll('[data-lobby-side-tab]')],lobbySideViews=[...document.querySelectorAll('[data-lobby-side-view]')];
const matchPrimaryButtons=[...document.querySelectorAll('[data-match-primary-choice]')],matchSecondaryButtons=[...document.querySelectorAll('[data-match-secondary-choice]')],matchTacticalButtons=[...document.querySelectorAll('[data-match-tactical-choice]')],matchLethalButtons=[...document.querySelectorAll('[data-match-lethal-choice]')];
const lobbyRoster=$('lobbyRoster'),lobbyBlueBotCount=$('lobbyBlueBotCount'),lobbyRedBotCount=$('lobbyRedBotCount'),lobbyFfaBotCount=$('lobbyFfaBotCount'),lobbyBotDifficulty=$('lobbyBotDifficulty'),lobbyMapPreview=$('lobbyMapPreview'),lobbyMinimapMode=$('lobbyMinimapMode'),lobbyScoreLimit=$('lobbyScoreLimit'),lobbyTimeLimit=$('lobbyTimeLimit');
const matchList=$('matchList'),matchCount=$('matchCount'),canvas=$('game'),connectionOverlay=$('connectionOverlay'),connectionText=$('connectionText'),chatComposer=$('chatComposer'),chatInput=$('chatInput'),chatInputText=$('chatInputText'),chatPlaceholder=$('chatPlaceholder'),chatKeyboard=$('chatKeyboard'),chatSendBtn=$('chatSendBtn'),chatShiftBtn=$('chatShiftBtn');
const gameTextEditor=$('gameTextEditor'),gameTextEditorTitle=$('gameTextEditorTitle'),gameTextEditorValue=$('gameTextEditorValue'),gameTextEditorPlaceholder=$('gameTextEditorPlaceholder'),gameTextKeyboard=$('gameTextKeyboard'),gameTextShiftBtn=$('gameTextShiftBtn');
initGameControls();
document.querySelectorAll('[data-app-version]').forEach(el=>{el.textContent=`Version ${APP_VERSION}`;});

const platform=detectInputPlatform();
let isTouch=platform.touchControls;
const clientId=getClientId(),clientAuth=getClientAuth();
const samePlayerId=(a,b)=>String(a??'')===String(b??'');
nameInput.value=localStorage.getItem('breachName')||`Player${Math.floor(Math.random()*90+10)}`;
let preferredTeam=localStorage.getItem('breachTeam')==='red'?'red':'blue';
let preferredPrimary=PRIMARY_WEAPONS.includes(localStorage.getItem('breachPrimary'))?localStorage.getItem('breachPrimary'):'assault';
let preferredSecondary=SECONDARY_WEAPONS.includes(localStorage.getItem('breachSecondary'))?localStorage.getItem('breachSecondary'):'pistol';
let storedAttachmentPreferences={};try{storedAttachmentPreferences=JSON.parse(localStorage.getItem('breachAttachments')||'{}')||{};}catch{}
let preferredPrimaryAttachments=normalizeWeaponAttachments(preferredPrimary,storedAttachmentPreferences.primary),preferredSecondaryAttachments=normalizeWeaponAttachments(preferredSecondary,storedAttachmentPreferences.secondary);
let preferredTactical=normalizeTactical(localStorage.getItem('breachTactical'));
let preferredLethal=normalizeLethal(localStorage.getItem('breachLethal'));
let storedLoadoutClasses=[];try{storedLoadoutClasses=JSON.parse(localStorage.getItem('breachLoadoutClasses')||'[]')||[];}catch{}
let preferredActiveClassId=normalizeLoadoutClassId(localStorage.getItem('breachActiveClass'));
let preferredLoadoutClasses=normalizeLoadoutClasses(storedLoadoutClasses,{primaryWeapon:preferredPrimary,secondaryWeapon:preferredSecondary,primaryAttachments:preferredPrimaryAttachments,secondaryAttachments:preferredSecondaryAttachments,tactical:preferredTactical,lethal:preferredLethal});
{const c=loadoutClassById(preferredLoadoutClasses,preferredActiveClassId);preferredPrimary=c.primaryWeapon;preferredSecondary=c.secondaryWeapon;preferredPrimaryAttachments={...c.primaryAttachments};preferredSecondaryAttachments={...c.secondaryAttachments};preferredTactical=c.tactical;preferredLethal=c.lethal;}
let masterMuted=localStorage.getItem('breachMuted')==='1';
const requestedRoom=new URL(location.href).searchParams.get('room');
if(requestedRoom)codeInput.value=normalizeCode(requestedRoom);

let scene, camera, renderer, clock, worldRoot, pistolGroup, pistolFlash, pistolMag, akimboLeftGroup, akimboRightGroup, akimboLeftFlash, akimboRightFlash, akimboLeftLever, akimboRightLever, akimboLeftBarrel, akimboRightBarrel, akimboLeftStock, akimboRightStock, assaultGroup, assaultFlash, assaultMag, umpGroup, umpFlash, umpMag, machineGunGroup, machineGunFlash, machineGunBox, machineGunBolt, shotgunGroup, shotgunFlash, shotgunPump, semiShotgunGroup, semiShotgunFlash, semiShotgunMag, sniperGroup, sniperFlash, sniperBolt, grenadeLauncherGroup, grenadeLauncherFlash, rpgGroup, rpgFlash, mantleHands, firstPersonHands, fpLeftHand, fpRightHand, fpLeftForearm, fpRightForearm, fpEquipmentProp, fpRigScratch;
let hudScene, hudCamera, hudTexture, hudCanvas, hudCtx, hudScale = 1, hudLastDraw = 0, hudLastScopeActive = false;
let socket = null, reconnectTimer = null, reconnectAttempt = 0;
let initialConnectionAttempt=null,initialConnectionSerial=0;
const INITIAL_CONNECTION_TIMEOUT_MS=15000;
function finishInitialConnectionAttempt(){const attempt=initialConnectionAttempt;if(!attempt)return;clearTimeout(attempt.timer);initialConnectionAttempt=null;}
function cancelInitialConnection(reason='Connection canceled.',{silent=false}={}){
  const attempt=initialConnectionAttempt;if(!attempt)return false;initialConnectionAttempt=null;clearTimeout(attempt.timer);attempt.controller.abort();
  if(socket){try{socket.close(1000,'Connection canceled')}catch{}socket=null;}
  clearTimeout(reconnectTimer);currentRoom='';shell.cancelConnection();disableMenu(false);if(!silent)setStatus(reason,'error');return true;
}
function beginInitialConnectionAttempt(text){
  cancelInitialConnection('',{silent:true});const controller=new AbortController(),id=++initialConnectionSerial;
  const attempt={id,controller,timer:0};initialConnectionAttempt=attempt;shell.beginConnection(text);attempt.timer=setTimeout(()=>{if(initialConnectionAttempt?.id===id)cancelInitialConnection('Connection timed out. Try again.');},INITIAL_CONNECTION_TIMEOUT_MS);return attempt;
}
function initialConnectionSignal(attempt){return initialConnectionAttempt?.id===attempt?.id?attempt.controller.signal:null;}
function initialConnectionCurrent(attempt){return !!attempt&&initialConnectionAttempt?.id===attempt.id&&!attempt.controller.signal.aborted;}
let currentRoom = '', myName = '', myTeam = preferredTeam, selfColor = TEAM_COLORS.blue, godMode = false, isMatchAdmin = false, matchOwnerId = '', pendingTeam='';
let primaryWeapon=preferredPrimary,secondaryWeapon=preferredSecondary,primaryAttachments={...preferredPrimaryAttachments},secondaryAttachments={...preferredSecondaryAttachments},tacticalEquipment=preferredTactical,lethalEquipment=preferredLethal,loadoutClasses=normalizeLoadoutClasses(preferredLoadoutClasses),activeClassId=preferredActiveClassId,pendingClassId='',pendingLoadout=null,loadoutDraft=null,loadoutBaseDraft=null,matchClassDrafts=null,matchClassBase=null,matchState={status:'waiting',round:1,mode:DEFAULT_GAME_MODE,blueScore:0,redScore:0,scoreLimit:DEFAULT_MATCH_RULES.scoreLimit,timeLimitMs:DEFAULT_MATCH_RULES.timeLimitMs,minimapRevealAll:false,minimapDirectional:false,warmupEndsAt:0,endsAt:0,winner:'',winnerId:'',winnerName:'',reason:'',serverTime:0},matchCustom=false;
let hp = 100, wastedUntil = 0, currentWeapon = preferredPrimary, ammo = freshClientAmmo(), equipment=freshClientEquipment(tacticalEquipment,lethalEquipment), reloadUntil = 0, reloadWeapon = '', reloadRequestPending=false, pendingWeapon='';
let flashUntil=0,flashPeakUntil=0;
let assaultFireMode=localStorage.getItem('breachAssaultFireMode')==='semi'?'semi':'auto';
let adsWanted=false,adsBlend=0,baseFov=70,sniperZoomLevel=0,lastWastedBy='',lastWastedWeapon='',lastWastedHeadshot=false,lastWastedDistance=0,deathViewStartYaw=0,deathViewTargetYaw=NaN,deathViewStartPitch=0;
let crouchWanted=false,crouched=false,crouchBlend=0,viewFeetY=NaN;
let sprintLatched=false,sprinting=false,sliding=false,slideStartedAt=0,slideDirX=0,slideDirZ=0,slideStartSpeed=0,slideRecoveryUntil=0,sprintBlockedUntil=0,sprintActionReadyAt=0,pendingSprintShot='',pendingSprintShotExpiresAt=0,sprintViewBlend=0,slideViewBlend=0;
let correctionViewX=0,correctionViewY=0,correctionViewZ=0;
let myStats={kills:0,deaths:0},scoreboardOpen=false,scoreboardScroll=0,scoreboardDrag=null,scoreboardPanel=null,killConfirmUntil=0,killConfirmName='',killConfirmWeapon='',killConfirmHeadshot=false,killConfirmDistance=0;
let headshotUntil=0,announcerCurrent=null;const announcerQueue=[];
let yaw = 0, pitch = 0, recoilDebtPitch = 0, recoilDebtYaw = 0, recoilPatternPitch = 0, recoilPatternYaw = 0, recoilBurstActive=false, recoilBurstWeapon='', recoilBurstReleaseAt=0, recoilBurstEndedAt=0, weaponKickZ=0, weaponKickVelocity=0, verticalVelocity = 0, moveVelocityX = 0, moveVelocityZ = 0, knockX = 0, knockZ = 0, jumpSeq = 0, lastGroundedAt = 0, jumpBufferedUntil = 0;
let traversal=null,traversalSeq=0,traversalIntentUntil=0,traversalIntentSeq=0,traversalConsumedIntentSeq=0;
let ladderState=null,ladderSeq=0,ladderAttachLockId='',ladderAttachLockUntil=0,ladderAttachNeedsRelease=false;
let onGround = true, lastShotVisualAt = 0, lastLocalShotAt = 0, fireReadyAt = freshClientFireReady(), lastStateSent = 0, lastPing = 0, lastPingLocalAt = 0, serverClockOffset = 0, remoteViewDelayMs=REMOTE_INTERPOLATION_MS, remoteDelayMeanMs=REMOTE_INTERPOLATION_MS, remoteDelayJitterMs=0, remoteDelaySamples=0;
let localShotHeat = Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
let localShotHeatAt = Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
let localRecoilStep = Object.fromEntries(WEAPON_ORDER.map(name=>[name,-1]));
let localWeaponShotSequence = Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
let lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,grounded:true,moveX:0,moveZ:0,ladderId:'',ladderMove:0}, localEquipmentCooldownUntil=0, stateSeq=0, lastCorrectionSeq=0;
const localPredictionHistory=[];
const netDiag={
  startedAt:performance.now(),rttMs:0,rttMeanMs:0,rttJitterMs:0,pingSamples:0,
  lastStateSendAt:0,lastStateGapMs:0,maxStateGapMs:0,stateGapOver120:0,
  serverLastStateGapMs:0,serverMaxStateGapMs:0,serverStateAgeMs:0,
  corrections:0,maxCorrectionM:0,lastCorrectionM:0,lastCorrectionReason:'',correctionReasons:Object.create(null),
  rejects:0,lastReject:'',rejectReasons:Object.create(null),socketCloses:0,reconnects:0,socketErrors:0,messageErrors:0,
  frameStalls:0,maxFrameMs:0,lastFrameMs:0,events:[]
};
function netDiagCount(map,key){const name=String(key||'unknown');map[name]=(map[name]||0)+1;}
function netDiagEvent(type,data={}){netDiag.events.push({at:Math.round(performance.now()-netDiag.startedAt),type,...data});if(netDiag.events.length>24)netDiag.events.shift();diagnosticsRecordEvent(`net:${type}`,data);}
function recordNetFrame(rawDt){const ms=Math.max(0,Number(rawDt)||0)*1000;netDiag.lastFrameMs=ms;netDiag.maxFrameMs=Math.max(netDiag.maxFrameMs,ms);if(ms>=NET_DIAG_FRAME_STALL_MS){netDiag.frameStalls++;if(ms>=180)netDiagEvent('frame',{ms:Math.round(ms)});}}
function recordNetStateSend(now){if(netDiag.lastStateSendAt){const gap=Math.max(0,now-netDiag.lastStateSendAt);netDiag.lastStateGapMs=gap;netDiag.maxStateGapMs=Math.max(netDiag.maxStateGapMs,gap);if(gap>120)netDiag.stateGapOver120++;}netDiag.lastStateSendAt=now;}
function recordNetPong(echoed,received,serverNet){const rtt=Math.max(0,received-echoed);netDiag.rttMs=rtt;if(netDiag.pingSamples===0){netDiag.rttMeanMs=rtt;netDiag.rttJitterMs=0;}else{const prior=netDiag.rttMeanMs;netDiag.rttMeanMs=prior+(rtt-prior)*.18;netDiag.rttJitterMs=netDiag.rttJitterMs+(Math.abs(rtt-prior)-netDiag.rttJitterMs)*.22;}netDiag.pingSamples++;if(serverNet&&typeof serverNet==='object'){netDiag.serverLastStateGapMs=Math.max(0,Number(serverNet.lastStateGapMs)||0);netDiag.serverMaxStateGapMs=Math.max(netDiag.serverMaxStateGapMs,Number(serverNet.maxStateGapMs)||0);netDiag.serverStateAgeMs=Math.max(0,Number(serverNet.stateAgeMs)||0);}}
function recordNetCorrection(m,magnitude){const reason=String(m?.reason||'unspecified');netDiag.corrections++;netDiag.lastCorrectionM=magnitude;netDiag.maxCorrectionM=Math.max(netDiag.maxCorrectionM,magnitude);netDiag.lastCorrectionReason=reason;netDiagCount(netDiag.correctionReasons,reason);if(magnitude>=.35)netDiagEvent('correction',{m:Number(magnitude.toFixed(3)),reason,seq:Math.max(0,Math.floor(Number(m?.seq)||0))});}
function recordNetReject(kind,reason){const label=`${String(kind||'action')}:${String(reason||'rejected')}`;netDiag.rejects++;netDiag.lastReject=label;netDiagCount(netDiag.rejectReasons,label);netDiagEvent('reject',{label});}
function resetNetworkDiagnostics(){const keep=performance.now();Object.assign(netDiag,{startedAt:keep,rttMs:0,rttMeanMs:0,rttJitterMs:0,pingSamples:0,lastStateSendAt:0,lastStateGapMs:0,maxStateGapMs:0,stateGapOver120:0,serverLastStateGapMs:0,serverMaxStateGapMs:0,serverStateAgeMs:0,corrections:0,maxCorrectionM:0,lastCorrectionM:0,lastCorrectionReason:'',rejects:0,lastReject:'',socketCloses:0,reconnects:0,socketErrors:0,messageErrors:0,frameStalls:0,maxFrameMs:0,lastFrameMs:0,events:[]});netDiag.correctionReasons=Object.create(null);netDiag.rejectReasons=Object.create(null);}
function networkDiagnosticsSnapshot(){return JSON.parse(JSON.stringify({...netDiag,uptimeMs:performance.now()-netDiag.startedAt,connected:socket?.readyState===WebSocket.OPEN,room:currentRoom||''}));}
window.breachNetworkDiagnostics=networkDiagnosticsSnapshot;
window.resetBreachNetworkDiagnostics=resetNetworkDiagnostics;
let localMoveAmount=0,moveBobPhase=0,landingKick=0,weaponSwapStartedAt=0,reloadStartedAt=0,deathAnimStartedAt=0,nextFootstepAt=0,footstepSide=0,shotgunPumpStartedAt=0,shotgunPumpSoundPlayed=false;
let audioUnlockPromise=null;
const DEFAULT_PLAYER_SETTINGS=Object.freeze({lookSensitivity:1,adsSensitivity:1,touchSensitivity:1,controllerVerticalSensitivity:1,controllerResponseCurve:'dynamic',controllerAimAssist:'on',controllerMoveDeadzone:.10,controllerLookDeadzone:.07,masterVolume:.85,sfxVolume:.9,musicVolume:.55,graphics:isTouch?'medium':'high',minimapOrientation:'heading',diagnostics:'off'});
function loadPlayerSettings(){
  let saved={};try{saved=JSON.parse(localStorage.getItem('breachPlayerSettings')||'{}')||{}}catch{}
  const numeric=(key,min,max)=>{const raw=saved[key];if(raw===null||raw===undefined||raw==='')return DEFAULT_PLAYER_SETTINGS[key];const value=Number(raw);return Number.isFinite(value)?Math.max(min,Math.min(max,value)):DEFAULT_PLAYER_SETTINGS[key];};
  return {lookSensitivity:numeric('lookSensitivity',.5,2),adsSensitivity:numeric('adsSensitivity',.35,1.25),touchSensitivity:numeric('touchSensitivity',.5,2),controllerVerticalSensitivity:numeric('controllerVerticalSensitivity',.5,1.5),controllerResponseCurve:['dynamic','standard','linear'].includes(saved.controllerResponseCurve)?saved.controllerResponseCurve:DEFAULT_PLAYER_SETTINGS.controllerResponseCurve,controllerAimAssist:saved.controllerAimAssist==='off'?'off':'on',controllerMoveDeadzone:numeric('controllerMoveDeadzone',.02,.25),controllerLookDeadzone:numeric('controllerLookDeadzone',.02,.25),masterVolume:numeric('masterVolume',0,1),sfxVolume:numeric('sfxVolume',0,1),musicVolume:numeric('musicVolume',0,1),graphics:['low','medium','high'].includes(saved.graphics)?saved.graphics:DEFAULT_PLAYER_SETTINGS.graphics,minimapOrientation:['heading','north'].includes(saved.minimapOrientation)?saved.minimapOrientation:DEFAULT_PLAYER_SETTINGS.minimapOrientation,diagnostics:saved.diagnostics==='on'?'on':'off'};
}
let playerSettings=loadPlayerSettings();
let playerSettingsDraft=null;
const DIAGNOSTICS_SAMPLE_INTERVAL_MS=33;
const DIAGNOSTICS_MAX_SAMPLES=9000;
const DIAGNOSTICS_MAX_EVENTS=2400;
const DIAGNOSTICS_MAX_INCIDENTS=12;
const DIAGNOSTICS_INCIDENT_HISTORY=150;
const diagnosticsRecorder={startedAt:performance.now(),startedEpoch:Date.now(),lastSampleAt:0,lastFrameAt:0,lastEffectivePitch:NaN,lastBasePitch:NaN,lastCameraY:NaN,lastRecoilDebtPitch:NaN,lastFireHeld:false,lastIncidentAt:0,samples:[],events:[],incidents:[]};
const controllerDiagnostics={rawX:0,rawY:0,inputX:0,inputY:0,inputLength:0,assistStrength:0,assistTarget:'',targetYaw:0,targetPitch:0,velocityYaw:0,velocityPitch:0,deltaYaw:0,deltaPitch:0,dt:0};
function diagnosticsRecordingEnabled(value=playerSettings){return NET_DIAG_URL_ENABLED||value?.diagnostics==='on';}
function diagnosticsRound(value,digits=4){const n=Number(value);return Number.isFinite(n)?Number(n.toFixed(digits)):null;}
function diagnosticsRelativeTime(now=performance.now()){return Math.max(0,Math.round(now-diagnosticsRecorder.startedAt));}
function diagnosticsRecordEvent(type,data={}){
  if(!diagnosticsRecordingEnabled())return;
  const event={t:diagnosticsRelativeTime(),type:String(type||'event'),...data};diagnosticsRecorder.events.push(event);if(diagnosticsRecorder.events.length>DIAGNOSTICS_MAX_EVENTS)diagnosticsRecorder.events.splice(0,Math.min(300,diagnosticsRecorder.events.length));
}
function diagnosticsDataCount(){return diagnosticsRecorder.samples.length+diagnosticsRecorder.events.length+diagnosticsRecorder.incidents.length;}
function resetDiagnosticsRecording({markStart=true}={}){
  diagnosticsRecorder.startedAt=performance.now();diagnosticsRecorder.startedEpoch=Date.now();diagnosticsRecorder.lastSampleAt=0;diagnosticsRecorder.lastFrameAt=0;diagnosticsRecorder.lastEffectivePitch=NaN;diagnosticsRecorder.lastBasePitch=NaN;diagnosticsRecorder.lastCameraY=NaN;diagnosticsRecorder.lastRecoilDebtPitch=NaN;diagnosticsRecorder.lastFireHeld=false;diagnosticsRecorder.lastIncidentAt=0;diagnosticsRecorder.samples.length=0;diagnosticsRecorder.events.length=0;diagnosticsRecorder.incidents.length=0;resetNetworkDiagnostics();
  if(markStart&&diagnosticsRecordingEnabled())diagnosticsRecordEvent('recording_start',{version:APP_VERSION,protocol:PROTOCOL_VERSION,inputMode:activeInputMode});syncDiagnosticsSettingsUI();hudLastDraw=0;
}
function diagnosticsControllerSnapshot(){return{rawX:diagnosticsRound(gamepadFrame?.rawLookX??gamepadFrame?.lookX),rawY:diagnosticsRound(gamepadFrame?.rawLookY??gamepadFrame?.lookY),x:diagnosticsRound(controllerDiagnostics.inputX),y:diagnosticsRound(controllerDiagnostics.inputY),len:diagnosticsRound(controllerDiagnostics.inputLength),rt:diagnosticsRound(gamepadFrame?.buttons?.[GAMEPAD_BUTTON.RT]||0,3),lt:diagnosticsRound(gamepadFrame?.buttons?.[GAMEPAD_BUTTON.LT]||0,3),assist:diagnosticsRound(controllerDiagnostics.assistStrength,3),assistTarget:controllerDiagnostics.assistTarget||'',targetPitch:diagnosticsRound(controllerDiagnostics.targetPitch),velocityPitch:diagnosticsRound(controllerDiagnostics.velocityPitch),pitchDelta:diagnosticsRound(controllerDiagnostics.deltaPitch),dt:diagnosticsRound(controllerDiagnostics.dt,5)};}
function diagnosticsFrameState(now,rawFrameDt){
  const effectivePitch=effectiveAimPitch(),effectiveYaw=effectiveAimYaw(),cameraY=Number(camera?.position?.y),fire=fireInputHeld();
  const renderInfo=renderer?.info?.render||{},memoryInfo=renderer?.info?.memory||{},visibleSmokeClouds=[...smokeClouds.values()].reduce((n,c)=>n+(c.root?.visible!==false?1:0),0);
  return{t:diagnosticsRelativeTime(now),dtMs:diagnosticsRound((Number(rawFrameDt)||0)*1000,2),mode:activeInputMode,fire,mouseFire:!!mouseFireDown,touchFire:touchRoleActive('fire'),gamepadFire:!!gamepadFireDown,weapon:currentWeapon,ads:diagnosticsRound(adsBlend,3),yaw:diagnosticsRound(yaw),pitch:diagnosticsRound(pitch),effectiveYaw:diagnosticsRound(effectiveYaw),effectivePitch:diagnosticsRound(effectivePitch),recoilPitch:diagnosticsRound(recoilDebtPitch),recoilPitchTarget:diagnosticsRound(recoilPatternPitch),recoilYaw:diagnosticsRound(recoilDebtYaw),recoilYawTarget:diagnosticsRound(recoilPatternYaw),recoilDebtPitch:diagnosticsRound(recoilDebtPitch),recoilDebtYaw:diagnosticsRound(recoilDebtYaw),recoilPatternPitch:diagnosticsRound(recoilPatternPitch),recoilPatternYaw:diagnosticsRound(recoilPatternYaw),recoilBurst:!!recoilBurstActive,recoilStep:Number(localRecoilStep[currentWeapon]??-1),cameraX:diagnosticsRound(camera?.position?.x,3),cameraY:diagnosticsRound(cameraY,3),cameraZ:diagnosticsRound(camera?.position?.z,3),positionY:diagnosticsRound(position?.y,3),viewFeetY:diagnosticsRound(viewFeetY,3),correctionY:diagnosticsRound(correctionViewY,3),verticalVelocity:diagnosticsRound(verticalVelocity,3),grounded:!!onGround,stateSeq,correctionSeq:lastCorrectionSeq,rttMs:diagnosticsRound(netDiag.rttMs,1),lastCorrectionM:diagnosticsRound(netDiag.lastCorrectionM,3),touchLook:touchRoleActive('look'),renderCalls:Number(renderInfo.calls)||0,renderTriangles:Number(renderInfo.triangles)||0,gpuGeometries:Number(memoryInfo.geometries)||0,gpuTextures:Number(memoryInfo.textures)||0,activeBullets:bullets.size,activeThrowables:throwables.size,activeImpacts:bulletImpactFx.length,activeExplosions:tacticalFx.length,activeSmokeClouds:smokeClouds.size,visibleSmokeClouds,activeRocketPuffs:rocketTrailPuffs.length,activeRemotes:remotes.size,activeAudioVoices:Number(gameAudio?.status?.().activeVoices)||0,controller:diagnosticsControllerSnapshot()};
}
function diagnosticsCaptureIncident(kind,sample,data={}){
  const now=performance.now();if(now-diagnosticsRecorder.lastIncidentAt<250)return;diagnosticsRecorder.lastIncidentAt=now;
  const incident={t:sample.t,kind,details:data,before:diagnosticsRecorder.samples.slice(-DIAGNOSTICS_INCIDENT_HISTORY),at:sample};diagnosticsRecorder.incidents.push(incident);if(diagnosticsRecorder.incidents.length>DIAGNOSTICS_MAX_INCIDENTS)diagnosticsRecorder.incidents.shift();diagnosticsRecordEvent('incident',{kind,...data});
}
function captureGameplayDiagnostics(rawFrameDt,now=performance.now()){
  if(!diagnosticsRecordingEnabled()||!shell.inMatch||!shell.canPlay||!camera||!position){diagnosticsRecorder.lastFrameAt=0;diagnosticsRecorder.lastEffectivePitch=NaN;diagnosticsRecorder.lastBasePitch=NaN;diagnosticsRecorder.lastCameraY=NaN;diagnosticsRecorder.lastRecoilDebtPitch=NaN;diagnosticsRecorder.lastFireHeld=false;return;}
  // Keep the per-render diagnostic path allocation-free. Full nested samples are
  // built only at the recorder's 30 Hz sample cadence or when an incident is
  // actually detected, so diagnostics cannot manufacture the hitch it is meant
  // to measure on mobile.
  const effective=Number(effectiveAimPitch()),base=Number(pitch),cameraY=Number(camera.position.y),recoilPitch=Number(recoilDebtPitch)||0,fire=fireInputHeld();
  if(fire!==diagnosticsRecorder.lastFireHeld)diagnosticsRecordEvent(fire?'fire_hold_start':'fire_hold_end',{weapon:currentWeapon,pitch:diagnosticsRound(base),effectivePitch:diagnosticsRound(effective),rawLookY:diagnosticsRound(gamepadFrame?.rawLookY??gamepadFrame?.lookY),rt:diagnosticsRound(gamepadFrame?.buttons?.[GAMEPAD_BUTTON.RT]||0,3)});
  let incidentKind='',incidentData=null;
  if(fire&&diagnosticsRecorder.lastFireHeld&&Number.isFinite(diagnosticsRecorder.lastEffectivePitch)&&Number.isFinite(effective)){
    const effectiveDelta=effective-diagnosticsRecorder.lastEffectivePitch,baseDelta=base-diagnosticsRecorder.lastBasePitch,cameraYDelta=cameraY-diagnosticsRecorder.lastCameraY;
    if(effectiveDelta<-.055){incidentKind='aim_pitch_down';incidentData={effectiveDelta:diagnosticsRound(effectiveDelta),baseDelta:diagnosticsRound(baseDelta),cameraYDelta:diagnosticsRound(cameraYDelta,3),rawLookY:diagnosticsRound(gamepadFrame?.rawLookY??gamepadFrame?.lookY),processedLookY:diagnosticsRound(controllerDiagnostics.inputY),recoilDelta:diagnosticsRound(recoilPitch-(Number.isFinite(diagnosticsRecorder.lastRecoilDebtPitch)?diagnosticsRecorder.lastRecoilDebtPitch:recoilPitch))};}
    else if(cameraYDelta<-.22){incidentKind='camera_drop';incidentData={effectiveDelta:diagnosticsRound(effectiveDelta),baseDelta:diagnosticsRound(baseDelta),cameraYDelta:diagnosticsRound(cameraYDelta,3),correctionY:diagnosticsRound(correctionViewY,3),lastCorrectionM:diagnosticsRound(netDiag.lastCorrectionM,3)};}
  }
  const shouldSample=now-diagnosticsRecorder.lastSampleAt>=DIAGNOSTICS_SAMPLE_INTERVAL_MS,sample=(shouldSample||incidentKind)?diagnosticsFrameState(now,rawFrameDt):null;
  if(incidentKind&&sample)diagnosticsCaptureIncident(incidentKind,sample,incidentData||{});
  diagnosticsRecorder.lastFrameAt=now;diagnosticsRecorder.lastEffectivePitch=effective;diagnosticsRecorder.lastBasePitch=base;diagnosticsRecorder.lastCameraY=cameraY;diagnosticsRecorder.lastRecoilDebtPitch=recoilPitch;diagnosticsRecorder.lastFireHeld=fire;
  if(shouldSample&&sample){diagnosticsRecorder.lastSampleAt=now;diagnosticsRecorder.samples.push(sample);if(diagnosticsRecorder.samples.length>DIAGNOSTICS_MAX_SAMPLES)diagnosticsRecorder.samples.splice(0,Math.min(600,diagnosticsRecorder.samples.length));}
}
function diagnosticsExportPayload(){
  const settings=normalizePlayerSettingsValue(playerSettings);delete settings.masterVolume;delete settings.sfxVolume;delete settings.musicVolume;
  return{format:'breach-diagnostics-v2',recoilModel:'authoritative-aim-debt-v1',exportedAt:new Date().toISOString(),appVersion:APP_VERSION,protocolVersion:PROTOCOL_VERSION,recording:diagnosticsRecordingEnabled(),startedAt:new Date(diagnosticsRecorder.startedEpoch).toISOString(),durationMs:Math.max(0,performance.now()-diagnosticsRecorder.startedAt),environment:{userAgent:navigator.userAgent||'',platform:navigator.platform||'',touch:!!isTouch,inputMode:activeInputMode,viewport:{w:viewW||0,h:viewH||0},map:currentMapId||'',matchMode:matchState?.mode||''},playerSettings:settings,network:networkDiagnosticsSnapshot(),sampleIntervalMs:DIAGNOSTICS_SAMPLE_INTERVAL_MS,samples:diagnosticsRecorder.samples,events:diagnosticsRecorder.events,incidents:diagnosticsRecorder.incidents};
}
function exportDiagnosticsRecording(){
  if(!diagnosticsDataCount()){showToast('NO DIAGNOSTICS RECORDED');return;}
  try{const json=JSON.stringify(diagnosticsExportPayload());const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),stamp=new Date().toISOString().replace(/[:.]/g,'-'),a=document.createElement('a');a.href=url;a.download=`breach-diagnostics-${stamp}.json`;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('DIAGNOSTICS EXPORTED');}catch(error){console.error('Diagnostics export failed',error);showToast('DIAGNOSTICS EXPORT FAILED');}
}
function syncDiagnosticsSettingsUI(){
  const active=diagnosticsRecordingEnabled(),el=$('diagnosticsStatus'),hasData=diagnosticsDataCount()>0,button=$('playerDiagnosticsBtn');
  if(button){button.textContent=active?'STOP RECORDING':'START RECORDING';button.setAttribute('aria-pressed',active?'true':'false');button.classList.toggle('active',active);}
  if(el){const seconds=Math.round(Math.max(0,performance.now()-diagnosticsRecorder.startedAt)/1000);el.textContent=active?`RECORDING · ${seconds}s · ${diagnosticsRecorder.incidents.length} INCIDENT${diagnosticsRecorder.incidents.length===1?'':'S'}`:hasData?`STOPPED · ${diagnosticsRecorder.incidents.length} INCIDENT${diagnosticsRecorder.incidents.length===1?'':'S'}`:'OFF';}
  if($('diagnosticsExportBtn'))$('diagnosticsExportBtn').disabled=!hasData;if($('diagnosticsClearBtn'))$('diagnosticsClearBtn').disabled=!hasData;
}
function setDiagnosticsRecording(enabled){
  const next=!!enabled,before=diagnosticsRecordingEnabled();
  if(before===next){syncDiagnosticsSettingsUI();return;}
  if(before&&!next)diagnosticsRecordEvent('recording_stop',{samples:diagnosticsRecorder.samples.length,events:diagnosticsRecorder.events.length,incidents:diagnosticsRecorder.incidents.length});
  playerSettings=normalizePlayerSettingsValue({...playerSettings,diagnostics:next?'on':'off'});
  if(playerSettingsDraft)playerSettingsDraft=normalizePlayerSettingsValue({...playerSettingsDraft,diagnostics:next?'on':'off'});
  savePlayerSettings();
  if(next)resetDiagnosticsRecording();else{syncDiagnosticsSettingsUI();hudLastDraw=0;}
  syncPlayerSettingsUI(playerSettingsDraft||playerSettings);
  setSettingsStatus(next?'Diagnostics recording':'Diagnostics stopped',next?'ok':'');
  showToast(next?'DIAGNOSTICS RECORDING':'DIAGNOSTICS STOPPED');
}
function toggleDiagnosticsRecording(){setDiagnosticsRecording(!diagnosticsRecordingEnabled());}

const gameAudio=createAudioEngine({cues:SOUND_CUES,getVolumes:()=>({master:masterMuted?0:playerSettings.masterVolume,sfx:playerSettings.sfxVolume,music:playerSettings.musicVolume})});
let introMusicHandle=null;

let toastCurrent=null;const toastQueue=[];let hurtUntil = 0, hitUntil = 0;
let blastFeedbackUntil=0,blastFeedbackPower=0,blastFeedbackSeed=0;
let botConfig={blueBots:0,redBots:0,difficulty:'normal'};
const bloodSplats=[];
const damageIndicators=[];
let position = null;
const keys = new Set();
const moveInput = { mx:0, mz:0, len:0 };
const remotes = new Map();
const lobbyParticipants = new Map();
let pendingGameSnapshot = null;
let lobbyMatchDraft=null,lobbyMatchDirty=false;
let lobbyMapDraft='',lobbyMapDirty=false;
let lobbyLoadoutDraft=null,lobbyClassDrafts=null,lobbyLoadoutDirty=false,lobbyLoadoutRevision=0,lobbyLoadoutAckRevision=0,lobbyStartingClassId=activeClassId,matchLoadoutRevision=0,matchLoadoutAckRevision=0;const loadoutEditClass={lobby:activeClassId,match:activeClassId};
const bullets = new Map();
const throwables = new Map();
const tacticalFx = [];
const bulletImpactFx = [];
const smokeClouds = new Map();
const rocketTrailPuffs = [];
let sharedSmokeTexture = null, lastSmokeVisibilityAt = 0;
const COMBAT_ACTION=Object.freeze({READY:'ready',EQUIPMENT_AIM:'equipmentAim',EQUIPMENT_THROW:'equipmentThrow',WEAPON_RECOVER:'weaponRecover'});
let combatAction={phase:COMBAT_ACTION.READY,kind:'',startedAt:0,commitAt:0,recoverStartedAt:0,recoverUntil:0,pending:null};
function equipmentAimKind(){return combatAction.phase===COMBAT_ACTION.EQUIPMENT_AIM?combatAction.kind:'';}
function combatWeaponAvailable(now=performance.now()){return combatAction.phase===COMBAT_ACTION.READY||(combatAction.phase===COMBAT_ACTION.WEAPON_RECOVER&&now>=combatAction.recoverUntil);}
function combatActionActive(){return combatAction.phase!==COMBAT_ACTION.READY;}
function equipmentWeaponLower(now=performance.now()){
  if(combatAction.phase===COMBAT_ACTION.READY)return 0;
  if(combatAction.phase===COMBAT_ACTION.EQUIPMENT_AIM)return smoothstep01((now-combatAction.startedAt)/105);
  if(combatAction.phase===COMBAT_ACTION.EQUIPMENT_THROW)return 1;
  if(combatAction.phase===COMBAT_ACTION.WEAPON_RECOVER){const span=Math.max(1,combatAction.recoverUntil-combatAction.recoverStartedAt);return 1-smoothstep01((now-combatAction.recoverStartedAt)/span);}
  return 0;
}
let trajectoryRibbon=null,trajectoryCenters=null,trajectoryVertices=null,trajectoryMarker=null,trajectoryLandingRing=null,trajectoryLandingDot=null,trajectoryScratch=null,trajectoryLastUpdate=0;
let trajectoryLastX=NaN,trajectoryLastY=NaN,trajectoryLastZ=NaN,trajectoryLastYaw=NaN,trajectoryLastPitch=NaN,trajectoryLastHeight=NaN;
const TRAJECTORY_MAX_POINTS=56;
const TRAJECTORY_UPDATE_MS=33;
const TRAJECTORY_RENDER_STEP=.04;
const SIM_HEARTBEAT_MS=33;
const SIM_LEADER_STALE_MS=750;
let lastSimHeartbeat=0;
let trajectoryCollision=createProjectileCollisionGrid({
  staticBoxes:STATIC_BOXES,pyramids:PYRAMIDS,naturalObstacles:NATURAL_OBSTACLES,buildingParts:BUILDING_PARTS,
  terrainHeight,naturalGroundBase,cellSize:8,cellHeight:3
});
const mapObstacles = [];
const joy = { x:0, y:0, centerX:0, centerY:0 };
const look = { x:0, y:0 };
const touchRoles = new Map();
let mouseFireDown=false,akimboLeftCycleStartedAt=0,akimboRightCycleStartedAt=0,akimboCycleSoundPlayed={left:false,right:false},akimboReadyAt={left:0,right:0};
const AKIMBO_1887_CYCLE_MS=920;
const touchVisual = { jumpUntil:0, fireUntil:0, reloadUntil:0, swapUntil:0, modeUntil:0, flashUntil:0, stickyUntil:0 };
const gamepadInput=createGamepadInput();
const INPUT_MODE=Object.freeze({TOUCH:'touch',KEYBOARD_MOUSE:'keyboardMouse',CONTROLLER:'controller'});
let gamepadFrame=gamepadInput.poll();
let activeInputMode=gamepadFrame.connected?INPUT_MODE.CONTROLLER:(isTouch?INPUT_MODE.TOUCH:INPUT_MODE.KEYBOARD_MOUSE);
let gamepadFireDown=false,controllerOwnsAim=false,lastGamepadKey=gamepadFrame.connected?`${gamepadFrame.index}:${gamepadFrame.id}`:'';
let controllerUiFocus=null,controllerUiEditing=null,controllerUiFocusKey='';
const controllerUiFocusMemory=new Map();
let controllerUiAxisDirection='',controllerUiAxisNextAt=0,controllerUiAxisStartedAt=0,controllerUiAdjusting=null;
appRoot.dataset.inputMode=activeInputMode;

function controllerInputActive(){return activeInputMode===INPUT_MODE.CONTROLLER&&gamepadFrame.connected;}
function touchGameplayControlsVisible(){return isTouch&&activeInputMode===INPUT_MODE.TOUCH&&!chatOpen&&!scoreboardOpen&&!shell.paused&&!shell.panel;}
function clearControllerGameplayInput(){
  gamepadFireDown=false;endRecoilBurst();resetControllerAimMotion();
  if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}
  if(combatActionActive())cancelEquipmentAction();
}
function setActiveInputMode(mode,{quiet=false}={}){
  if(!Object.values(INPUT_MODE).includes(mode)||mode===activeInputMode)return false;
  const previous=activeInputMode;
  stopSlide();cancelSprint();endRecoilBurst();
  if(previous===INPUT_MODE.CONTROLLER){clearControllerGameplayInput();clearControllerUiFocus();resetControllerUiAxis();}
  if(mode===INPUT_MODE.CONTROLLER){keys.clear();resetTouchInput();mouseFireDown=false;}
  else if(mode===INPUT_MODE.TOUCH){keys.clear();mouseFireDown=false;}
  else{resetTouchInput();}
  activeInputMode=mode;appRoot.dataset.inputMode=mode;hudLayout=null;
  if(!quiet&&typeof shell!=='undefined'&&shell.inMatch&&mode===INPUT_MODE.CONTROLLER)showToast('CONTROLLER ACTIVE');
  return true;
}

function activateTouchInputMode(){
  if(isTouch)return false;
  isTouch=true;
  appRoot.classList.add('touch');
  appRoot.classList.remove('desktop');
  hudLayout=null;
  if(renderer){applyGraphicsQuality();onResize();}
  return true;
}

const killFeed = [];
const chatMessages=[];
let chatOpen=false,chatDraft='',chatShift=false,chatScroll=0,chatDrag=null,chatPanel=null;
let aimedRemoteId='',aimTagRaycaster=null,nextAimTagCheckAt=0;
let minimapStaticCache=null;
let hudLayout=null;
let viewW=1,viewH=1,viewDpr=1;

function rebuildTrajectoryCollision(){
  trajectoryCollision=createProjectileCollisionGrid({staticBoxes:STATIC_BOXES,pyramids:PYRAMIDS,naturalObstacles:NATURAL_OBSTACLES,buildingParts:BUILDING_PARTS,terrainHeight,naturalGroundBase,cellSize:8,cellHeight:3});
}
function setActiveMap(value,{rebuild=true}={}){
  const nextId=normalizeMapId(value),changed=nextId!==currentMapId;
  currentMapId=nextId;
  const bundle=CLIENT_WORLD_BUNDLES[nextId]||CLIENT_WORLD_BUNDLES[DEFAULT_MAP_ID];
  worldGeometry=bundle.geometry;
  activeWorldCollision=bundle.collision;
  STATIC_BOXES=worldGeometry.STATIC_BOXES;BUILDINGS=worldGeometry.BUILDINGS;PYRAMIDS=worldGeometry.PYRAMIDS;NATURAL_OBSTACLES=worldGeometry.NATURAL_OBSTACLES;LADDERS=worldGeometry.LADDERS||[];
  TERRAIN_SIZE=worldGeometry.TERRAIN_SIZE;TERRAIN_SEGMENTS=worldGeometry.TERRAIN_SEGMENTS;BUILDING_GEOMETRY=worldGeometry.BUILDING_GEOMETRY;BUILDING_PARTS=worldGeometry.BUILDING_PARTS;
  terrainHeight=worldGeometry.terrainHeight;naturalGroundBase=worldGeometry.naturalGroundBase;worldSupportHeight=worldGeometry.worldSupportHeight;worldStepUpHeight=worldGeometry.worldStepUpHeight;resolveCeilingCollision=worldGeometry.resolveCeilingCollision;
  rebuildTrajectoryCollision();minimapStaticCache=null;hudLastDraw=0;
  if(changed&&rebuild&&engineInitialized&&scene)rebuildWorldVisuals();
  return changed;
}

function suspendGameplayInput(){
  keys.clear();
  stopSlide();cancelSprint();
  resetTouchInput();
  clearControllerGameplayInput();
  clearFireInput();
  cancelEquipmentAction();
  setAim(false);
  mouseFireDown=false;
  scoreboardOpen=false;
}

function handleShellState(state){
  if(chatOpen&&(!state.inMatch||state.paused||state.panel||state.connecting))void dismissChat({restorePointer:false});
  if(state.inMatch&&state.paused)syncPauseContext();
  const fsBtn=$('settingsFullscreenBtn');if(fsBtn){fsBtn.textContent=state.standalone?'APP FULLSCREEN':state.fullscreen?'EXIT FULLSCREEN':'ENTER FULLSCREEN';fsBtn.disabled=state.standalone||(!state.fullscreen&&!state.fullscreenSupported);}const connectionCancel=$('connectionCancelBtn');if(connectionCancel)connectionCancel.classList.toggle('hide',!initialConnectionAttempt||state.inMatch);
  if((state.location==='menu'||state.location==='lobby')&&(!state.touchControls||state.immersive)&&!document.hidden)startIntroMusic();else stopIntroMusic();
}

function handleViewportChange(metrics){
  applyViewportSize(metrics);
}

const shell=createSessionShell({
  root:appRoot,
  stage:gameStage,
  canvas,
  platform,
  elements:{
    entry:entryScreen,
    entryButton:$('enterFullscreenBtn'),
    entryStatus:$('entryStatus'),
    menu,
    lobby:lobbyScreen,
    rotate:rotateGate,
    connection:connectionOverlay,
    connectionText,
    pause,
    settings:$('settingsPanel'),
    admin:$('adminPanel'),
    loadout:$('loadoutPanel'),
  },
  onSuspend:suspendGameplayInput,
  onStateChange:handleShellState,
  onViewport:handleViewportChange,
  onPointerLockUnavailable:()=>showToast('Mouse capture unavailable'),
  alternateInputReady:()=>controllerInputActive()||chatOpen,
});
({w:viewW,h:viewH,dpr:viewDpr}=shell.viewport);
shell.start();

syncMusicUI();
syncPlayerSettingsUI();

const ENGINE_MODULE_URL = './vendor/three.module.min.js?v=1.44.42';
let engineReady=false, engineLoadPromise=null, engineInitialized=false;

async function ensureThreeEngine(){
  if(engineReady)return true;
  if(engineLoadPromise)return engineLoadPromise;
  engineLoadPromise=(async()=>{
    try{
      const mod=await import(ENGINE_MODULE_URL);
      if(!mod?.WebGLRenderer||!mod?.Scene||!mod?.Vector3)throw new Error('Bundled 3D engine is invalid');
      THREE=mod;
      position=new THREE.Vector3(0,0,0);
      if(!engineInitialized){init3D();engineInitialized=true;onResize();}
      engineReady=true;
      return true;
    }catch(error){
      console.error('Breach could not initialize its bundled 3D engine.',error);
      const webglError=/webgl|context/i.test(String(error?.message||error));
      if(!shell.inMatch)setStatus(webglError?'WebGL2 unavailable · enable hardware acceleration.':'3D engine failed to load · redeploy the client.','error');
      return false;
    }
  })().finally(()=>{engineLoadPromise=null;});
  return engineLoadPromise;
}

async function prepareGameRuntime(){
  // Keep decoding work out of live gameplay. Only the small movement/current-
  // weapon set is warmed before play; everything else stays lazy on first use.
  const unlockPromise=ensureAudio();
  const engineOk=await ensureThreeEngine();
  if(!engineOk)return false;
  if(await unlockPromise)await warmGameplayAudio(currentWeapon);
  return true;
}

bindUI();
let controllerUiFrameLast=performance.now();
function runPreEngineControllerFrame(now){
  if(engineInitialized)return;
  requestAnimationFrame(runPreEngineControllerFrame);
  const dt=Math.min(.10,Math.max(0,(now-controllerUiFrameLast)/1000));controllerUiFrameLast=now;updateGamepadInput(dt);
}
requestAnimationFrame(runPreEngineControllerFrame);
if(shell.location==='menu'&&$('menuShell')?.dataset.deployMode==='live')void refreshMatches();
setInterval(()=>{if(shell.location==='menu'&&$('menuShell')?.dataset.deployMode==='live')void refreshMatches();},7000);
// Full-library audio preloading intentionally disabled; gameplay warms only essential cues.

function getClientId(){
  let id = localStorage.getItem('breachClient');
  if (!id) {
    const cryptoApi=globalThis.crypto;
    if(typeof cryptoApi?.randomUUID==='function')id=cryptoApi.randomUUID().replace(/-/g,'').slice(0,24);
    else if(typeof cryptoApi?.getRandomValues==='function'){
      const bytes=new Uint8Array(12);cryptoApi.getRandomValues(bytes);id=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');
    }else id=`${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`.replace(/[^a-z0-9]/gi,'').padEnd(24,'0').slice(0,24);
    localStorage.setItem('breachClient', id);
  }
  return id;
}
function getClientAuth(){
  let secret=String(localStorage.getItem('breachClientAuth')||'').toLowerCase();
  if(!/^[a-f0-9]{64}$/.test(secret)){
    const cryptoApi=globalThis.crypto;
    if(typeof cryptoApi?.getRandomValues==='function'){const bytes=new Uint8Array(32);cryptoApi.getRandomValues(bytes);secret=[...bytes].map(value=>value.toString(16).padStart(2,'0')).join('');}
    else{secret='';while(secret.length<64)secret+=`${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;secret=secret.replace(/[^a-f0-9]/g,'').padEnd(64,'0').slice(0,64);}
    localStorage.setItem('breachClientAuth',secret);
  }
  return secret;
}
function normalizeCode(v){ return String(v||'').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,ROOM_CODE_LENGTH); }
function setStatus(text,tone=''){menuStatus.textContent=text;menuStatus.className=`menu-status ${tone}`;}
function apiToWs(base){ return base.replace(/^https:/,'wss:').replace(/^http:/,'ws:'); }
function safeName(){ return (nameInput.value||'Player').replace(/[<>]/g,'').trim().slice(0,18) || 'Player'; }
function applyWorldSettings(value){
  worldSettings=normalizeWorldSettings(value);
  syncPauseContext();
}
function weaponRules(name){const safe=WEAPON_SPECS[name]?name:'pistol',baseRules=worldSettings.weapons[safe]||DEFAULT_WORLD_SETTINGS.weapons[safe],baseSpec=WEAPON_SPECS[safe],resolved=effectiveWeaponSpec(safe);return{...baseRules,mag:resolved.mag,reloadMs:Number(baseRules.reloadMs)*(resolved.reloadMs/baseSpec.reloadMs),cooldownMs:Number(baseRules.cooldownMs)*(resolved.cooldownMs/baseSpec.cooldownMs),speed:Number(baseRules.speed)*(resolved.bulletSpeed/baseSpec.bulletSpeed),resolvedSpec:resolved};}
function aimSensitivityScale(){if(!adsWanted)return 1;const variable=currentWeapon==='sniper'&&sniperVariableScopeEquipped(),base=currentWeapon==='sniper'?(sniperZoomLevel>=2?(variable?.18:.14):(variable?.34:.28)):.62;return base*playerSettings.adsSensitivity;}
function controllerRadialAxes(rawX,rawY,minDeadzone,outerDeadzone=.98){
  const x=THREE.MathUtils.clamp(Number(rawX)||0,-1,1),y=THREE.MathUtils.clamp(Number(rawY)||0,-1,1),len=Math.hypot(x,y);
  const inner=THREE.MathUtils.clamp(Number(minDeadzone)||.07,.01,.45),outer=Math.max(inner+.05,THREE.MathUtils.clamp(Number(outerDeadzone)||.98,.75,1));
  if(len<=inner)return{x:0,y:0,length:0};
  const normalized=THREE.MathUtils.clamp((len-inner)/(outer-inner),0,1),scale=normalized/Math.max(len,1e-6);
  return{x:x*scale,y:y*scale,length:normalized};
}
function controllerResponseMagnitude(value,curve=playerSettings.controllerResponseCurve){
  const t=THREE.MathUtils.clamp(Number(value)||0,0,1);
  if(curve==='linear')return t;
  if(curve==='standard')return Math.pow(t,1.35);
  // Dynamic keeps fine input more alive than the old power curve, stays
  // controlled through the middle, and still reaches full turn rate quickly.
  return t*(.84-.16*t+.32*t*t);
}
function controllerMoveAxes(){
  const rawX=Number.isFinite(gamepadFrame.rawMoveX)?gamepadFrame.rawMoveX:gamepadFrame.moveX,rawY=Number.isFinite(gamepadFrame.rawMoveY)?gamepadFrame.rawMoveY:gamepadFrame.moveY;
  return controllerRadialAxes(rawX,rawY,playerSettings.controllerMoveDeadzone,.98);
}
function controllerLookAxes(){
  const rawX=Number.isFinite(gamepadFrame.rawLookX)?gamepadFrame.rawLookX:gamepadFrame.lookX,rawY=Number.isFinite(gamepadFrame.rawLookY)?gamepadFrame.rawLookY:gamepadFrame.lookY;
  const radial=controllerRadialAxes(rawX,rawY,playerSettings.controllerLookDeadzone,.98);if(!radial.length)return radial;
  const shaped=controllerResponseMagnitude(radial.length),scale=shaped/Math.max(radial.length,1e-6);
  return{x:radial.x*scale,y:radial.y*scale,length:shaped};
}
function controllerAdsSensitivityScale(){
  const blend=smoothstep01(adsBlend);if(blend<=.001)return 1;
  const targetFov=currentWeapon==='sniper'&&sniperZoomLevel>=2?sniperHighZoomFov():(effectiveWeaponSpec(currentWeapon)?.adsFov||baseFov);
  const baseTan=Math.max(.001,Math.tan(baseFov*Math.PI/360)),adsTan=Math.max(.001,Math.tan(targetFov*Math.PI/360));
  const fovRatio=THREE.MathUtils.clamp(adsTan/baseTan,.08,1),scoped=Math.pow(fovRatio,.72)*playerSettings.adsSensitivity;
  return THREE.MathUtils.lerp(1,scoped,blend);
}
function controllerAssistRadiusDeg(){
  if(currentWeapon==='sniper'&&adsBlend>.2)return sniperZoomLevel>=2?1.2:1.8;
  return THREE.MathUtils.lerp(4.2,2.8,smoothstep01(adsBlend));
}
function controllerAssistMaxDistance(){return currentWeapon==='sniper'&&adsBlend>.2?180:THREE.MathUtils.lerp(72,115,smoothstep01(adsBlend));}
function remoteControllerAimPoint(remote,out){
  out.copy(remote.group.position);out.y+=THREE.MathUtils.lerp(1.36,1.03,THREE.MathUtils.clamp(remote.crouchBlend||0,0,1));return out;
}
let controllerAimVelocityX=0,controllerAimVelocityY=0,controllerTurnBoost=0,controllerAssistTargetId='',controllerAssistNextScanAt=0,controllerAssistRaycaster=null,controllerAssistOrigin=null,controllerAssistForward=null,controllerAssistVector=null,controllerAssistPoint=null,controllerAssistProjected=null;
function ensureControllerAimScratch(){
  if(!controllerAssistRaycaster)controllerAssistRaycaster=new THREE.Raycaster();
  controllerAssistOrigin ||= new THREE.Vector3();controllerAssistForward ||= new THREE.Vector3();controllerAssistVector ||= new THREE.Vector3();controllerAssistPoint ||= new THREE.Vector3();controllerAssistProjected ||= new THREE.Vector3();
}
function controllerTargetLineVisible(point,distance){
  if(!worldRoot||!camera)return false;ensureControllerAimScratch();camera.getWorldPosition(controllerAssistOrigin);controllerAssistVector.copy(point).sub(controllerAssistOrigin);const dist=distance||controllerAssistVector.length();if(dist<=.05)return true;
  controllerAssistRaycaster.set(controllerAssistOrigin,controllerAssistVector.normalize());controllerAssistRaycaster.near=.05;controllerAssistRaycaster.far=Math.max(.05,dist-.28);
  if(controllerAssistRaycaster.intersectObject(worldRoot,true)[0])return false;
  // Dense smoke is visual cover, so controller assistance must not track a
  // target the player cannot actually see through it.
  const ox=controllerAssistOrigin.x,oy=controllerAssistOrigin.y,oz=controllerAssistOrigin.z,dx=point.x-ox,dy=point.y-oy,dz=point.z-oz,d2=dx*dx+dy*dy+dz*dz;
  if(d2>.001)for(const cloud of smokeClouds.values()){const cp=cloud?.root?.position;if(!cp)continue;const t=THREE.MathUtils.clamp(((cp.x-ox)*dx+(cp.y-oy)*dy+(cp.z-oz)*dz)/d2,0,1);if(t<=.03||t>=.98)continue;const px=ox+dx*t,py=oy+dy*t,pz=oz+dz*t,grow=THREE.MathUtils.clamp((serverNow()-(Number(cloud.bornAt)||serverNow()))/SMOKE_GROW_MS,0,1),visibleScale=SMOKE_START_SCALE+(1-SMOKE_START_SCALE)*grow,r=Math.max(2.8,(Number(cloud.radius)||9.6)*visibleScale*SMOKE_LOS_RADIUS_SCALE);if((cp.x-px)**2+(cp.y-py)**2+(cp.z-pz)**2<r*r)return false;}
  return true;
}
function controllerTargetMetrics(remote,radiusDeg,maxDistance){
  if(!remote||remote.hp<=0||modeFriendly(remote.team)||!camera)return null;ensureControllerAimScratch();remoteControllerAimPoint(remote,controllerAssistPoint);camera.getWorldPosition(controllerAssistOrigin);controllerAssistVector.copy(controllerAssistPoint).sub(controllerAssistOrigin);const distance=controllerAssistVector.length();if(distance<.35||distance>maxDistance)return null;
  camera.getWorldDirection(controllerAssistForward);const angle=Math.acos(THREE.MathUtils.clamp(controllerAssistForward.dot(controllerAssistVector.normalize()),-1,1))*180/Math.PI;if(angle>radiusDeg)return null;
  return{remote,angle,distance,radiusDeg};
}
function scanControllerAimAssist(now=performance.now()){
  if(playerSettings.controllerAimAssist==='off'||!controllerInputActive()||!shell.canPlay||hp<=0||!camera||!worldRoot){controllerAssistTargetId='';return null;}
  if(now<controllerAssistNextScanAt&&controllerAssistTargetId){const held=[...remotes.values()].find(r=>samePlayerId(r.id,controllerAssistTargetId));if(held&&held.hp>0)return held;}
  controllerAssistNextScanAt=now+30;const enterRadius=controllerAssistRadiusDeg(),exitRadius=enterRadius*1.34,maxDistance=controllerAssistMaxDistance();
  const current=[...remotes.values()].find(r=>samePlayerId(r.id,controllerAssistTargetId));if(current){const metric=controllerTargetMetrics(current,exitRadius,maxDistance*1.08);if(metric){remoteControllerAimPoint(current,controllerAssistPoint);if(controllerTargetLineVisible(controllerAssistPoint,metric.distance))return current;}}
  const candidates=[];for(const remote of remotes.values()){const metric=controllerTargetMetrics(remote,enterRadius,maxDistance);if(metric)candidates.push(metric);}candidates.sort((a,b)=>(a.angle/enterRadius+a.distance/maxDistance*.035)-(b.angle/enterRadius+b.distance/maxDistance*.035));
  for(const metric of candidates.slice(0,3)){remoteControllerAimPoint(metric.remote,controllerAssistPoint);if(controllerTargetLineVisible(controllerAssistPoint,metric.distance)){controllerAssistTargetId=String(metric.remote.id);return metric.remote;}}
  controllerAssistTargetId='';return null;
}
function currentControllerAimAssist(now=performance.now()){
  const remote=scanControllerAimAssist(now);if(!remote)return null;ensureControllerAimScratch();const radius=controllerAssistRadiusDeg()*1.34,maxDistance=controllerAssistMaxDistance()*1.08,metric=controllerTargetMetrics(remote,radius,maxDistance);if(!metric){controllerAssistTargetId='';return null;}
  remoteControllerAimPoint(remote,controllerAssistPoint);controllerAssistProjected.copy(controllerAssistPoint).project(camera);if(controllerAssistProjected.z<-1||controllerAssistProjected.z>1){controllerAssistTargetId='';return null;}
  const normalized=THREE.MathUtils.clamp(metric.angle/Math.max(.01,controllerAssistRadiusDeg()),0,1.34),strength=1-smoothstep01(THREE.MathUtils.clamp((normalized-.08)/.92,0,1));
  return{remote,strength,ndcX:controllerAssistProjected.x,ndcY:controllerAssistProjected.y,angle:metric.angle};
}
function resetControllerAimMotion(){controllerAimVelocityX=controllerAimVelocityY=0;controllerTurnBoost=0;controllerAssistTargetId='';controllerAssistNextScanAt=0;}
function consumeRecoilDebtAxis(debt,delta){
  if(debt>0&&delta<0)return Math.max(0,debt+delta);
  if(debt<0&&delta>0)return Math.min(0,debt+delta);
  return debt;
}
function applyPlayerAimDelta(deltaYaw=0,deltaPitch=0){
  const beforeYaw=yaw,beforePitch=pitch;
  yaw+=Number(deltaYaw)||0;pitch=THREE.MathUtils.clamp(pitch+(Number(deltaPitch)||0),-1.28,1.28);
  const appliedYaw=yaw-beforeYaw,appliedPitch=pitch-beforePitch;
  recoilDebtYaw=consumeRecoilDebtAxis(recoilDebtYaw,appliedYaw);recoilDebtPitch=consumeRecoilDebtAxis(recoilDebtPitch,appliedPitch);
  return{yaw:appliedYaw,pitch:appliedPitch};
}
function applyControllerAim(dt){
  const beforeYaw=yaw,beforePitch=pitch,input=controllerLookAxes(),now=performance.now(),assist=currentControllerAimAssist(now),breakout=1-smoothstep01(THREE.MathUtils.clamp((input.length-.80)/.20,0,1)),assistStrength=(assist?.strength||0)*breakout;
  if(input.length>.86)controllerTurnBoost=Math.min(1,controllerTurnBoost+dt/.22);else controllerTurnBoost=Math.max(0,controllerTurnBoost-dt/.08);
  const ads=smoothstep01(adsBlend),turnMultiplier=1+controllerTurnBoost*.30*(1-ads*.72),adsScale=controllerAdsSensitivityScale();
  const minSlow=currentWeapon==='sniper'&&ads>.2?(sniperZoomLevel>=2?.49:.53):THREE.MathUtils.lerp(.70,.60,ads),slowdown=assist?THREE.MathUtils.lerp(1,minSlow,assistStrength):1;
  const targetYaw=input.x*CONTROLLER_LOOK_YAW_RATE*playerSettings.lookSensitivity*adsScale*turnMultiplier*slowdown;
  const targetPitch=input.y*CONTROLLER_LOOK_PITCH_RATE*playerSettings.lookSensitivity*playerSettings.controllerVerticalSensitivity*adsScale*turnMultiplier*slowdown;
  const smoothing=1-Math.exp(-dt/.024);controllerAimVelocityX+= (targetYaw-controllerAimVelocityX)*smoothing;controllerAimVelocityY+=(targetPitch-controllerAimVelocityY)*smoothing;
  applyPlayerAimDelta(-controllerAimVelocityX*dt,-controllerAimVelocityY*dt);
  if(assist&&assistStrength>.01){const move=controllerMoveAxes(),strafe=THREE.MathUtils.clamp(move.length/.72,0,1),rotWeight=assistStrength*strafe;if(rotWeight>.001){yaw-=THREE.MathUtils.clamp(assist.ndcX,-.75,.75)*.72*rotWeight*dt;
    // Rotational aim assist may help track horizontally, but it must never
    // counter-steer sustained vertical recoil. Recoil control belongs to the
    // player; rotational assist may track horizontally but must not erase the
    // authoritative pitch recoil the player is actively controlling.
    if(!(automaticRecoilActive(currentWeapon)&&recoilBurstActive&&recoilBurstWeapon===currentWeapon))pitch+=THREE.MathUtils.clamp(assist.ndcY,-.75,.75)*.54*rotWeight*dt;
  }}
  pitch=THREE.MathUtils.clamp(pitch,-1.28,1.28);
  controllerDiagnostics.rawX=Number(gamepadFrame?.rawLookX??gamepadFrame?.lookX)||0;controllerDiagnostics.rawY=Number(gamepadFrame?.rawLookY??gamepadFrame?.lookY)||0;controllerDiagnostics.inputX=input.x;controllerDiagnostics.inputY=input.y;controllerDiagnostics.inputLength=input.length;controllerDiagnostics.assistStrength=assistStrength;controllerDiagnostics.assistTarget=String(assist?.remote?.id||controllerAssistTargetId||'');controllerDiagnostics.targetYaw=targetYaw;controllerDiagnostics.targetPitch=targetPitch;controllerDiagnostics.velocityYaw=controllerAimVelocityX;controllerDiagnostics.velocityPitch=controllerAimVelocityY;controllerDiagnostics.deltaYaw=yaw-beforeYaw;controllerDiagnostics.deltaPitch=pitch-beforePitch;controllerDiagnostics.dt=dt;
}
function currentShotHeat(weapon=currentWeapon,now=performance.now()){
  const last=localShotHeatAt[weapon]||0,heat=weaponHeatAfterDelay(weapon,localShotHeat[weapon]||0,last?now-last:0);
  if(heat<.002)return 0;return heat;
}
function currentSpreadRadians(){
  const movement=worldSettings.movement,ads=Math.max(0,Math.min(1,adsBlend)),speed=THREE.MathUtils.lerp(movement.runSpeed,movement.walkSpeed,smoothstep01(ads))*(crouched?CROUCH_SPEED_MULTIPLIER:1);
  return weaponSpreadRadians(currentWeapon,(localMoveAmount||0)*speed,movement.runSpeed,ads,crouched,!onGround,currentShotHeat(),sliding,attachmentsForWeapon(currentWeapon));
}
function accuracyCrosshairRadius(){const fov=(camera?.fov||baseFov)*Math.PI/180,spread=currentSpreadRadians();return THREE.MathUtils.clamp(Math.tan(spread)*(viewH*.5)/Math.max(.08,Math.tan(fov*.5)),3.5,52);}
// Sniper ADS is one centered main-camera animation.
// The rifle centers first; zoom and the fixed HUD scope begin only after that.
const SNIPER_CENTER_END_BLEND=.52;
const SNIPER_EYE_END_BLEND=.90;
const SNIPER_ZOOM_START_BLEND=.52;
const SNIPER_ZOOM_END_BLEND=.96;
const SNIPER_MASK_START_BLEND=.66;
const SNIPER_MASK_END_BLEND=.94;
const SNIPER_RETICLE_START_BLEND=.90;
const SNIPER_RETICLE_END_BLEND=.98;
const SNIPER_WEAPON_HIDE_BLEND=.90;
const SNIPER_SCOPE_SCREEN_RADIUS=.435;
const SNIPER_SCOPE_AXIS_Y=.14;
function sniperVariableScopeEquipped(){return weaponHasAttachment('sniper',attachmentsForWeapon('sniper'),'variableScope');}
function sniperLowZoomLabel(){return sniperVariableScopeEquipped()?'3X':'4X';}
function sniperHighZoomLabel(){return sniperVariableScopeEquipped()?'6X':'8X';}
function sniperHighZoomFov(){return sniperVariableScopeEquipped()?Number(ATTACHMENTS.variableScope?.highAdsFov)||12.5:9.5;}
function sniperZoomLabel(){return sniperZoomLevel>=2?sniperHighZoomLabel():sniperZoomLevel===1?sniperLowZoomLabel():'HIP';}
function sniperTargetFov(){const spec=effectiveWeaponSpec('sniper');return sniperZoomLevel>=2?sniperHighZoomFov():(Number(spec?.adsFov)||18);}
function sniperCenterAmount(){return currentWeapon==='sniper'?smoothstep01(adsBlend/SNIPER_CENTER_END_BLEND):0;}
function sniperEyeAmount(){return currentWeapon==='sniper'?smoothstep01((adsBlend-SNIPER_CENTER_END_BLEND)/(SNIPER_EYE_END_BLEND-SNIPER_CENTER_END_BLEND)):0;}
function sniperZoomAmount(){return currentWeapon==='sniper'?smoothstep01((adsBlend-SNIPER_ZOOM_START_BLEND)/(SNIPER_ZOOM_END_BLEND-SNIPER_ZOOM_START_BLEND)):0;}
function sniperMaskAmount(){return currentWeapon==='sniper'?smoothstep01((adsBlend-SNIPER_MASK_START_BLEND)/(SNIPER_MASK_END_BLEND-SNIPER_MASK_START_BLEND)):0;}
function sniperReticleAmount(){return currentWeapon==='sniper'?smoothstep01((adsBlend-SNIPER_RETICLE_START_BLEND)/(SNIPER_RETICLE_END_BLEND-SNIPER_RETICLE_START_BLEND)):0;}
function sniperWeaponHiddenForScope(){return currentWeapon==='sniper'&&adsBlend>=SNIPER_WEAPON_HIDE_BLEND;}
function sniperAdsPose(){return{x:0,y:-SNIPER_SCOPE_AXIS_Y,z:-.235,rx:0,ry:0,rz:0};}
function rememberTeam(team){preferredTeam=team==='red'?'red':'blue';localStorage.setItem('breachTeam',preferredTeam);document.documentElement.style.setProperty('--team',TEAM_COLORS[preferredTeam]);}
function rememberPrimary(weapon){preferredPrimary=PRIMARY_WEAPONS.includes(weapon)?weapon:'assault';localStorage.setItem('breachPrimary',preferredPrimary);}
function rememberSecondary(weapon){preferredSecondary=SECONDARY_WEAPONS.includes(weapon)?weapon:'pistol';localStorage.setItem('breachSecondary',preferredSecondary);}
function rememberAttachments(primary=primaryAttachments,secondary=secondaryAttachments,primaryName=primaryWeapon,secondaryName=secondaryWeapon){preferredPrimaryAttachments=normalizeWeaponAttachments(primaryName,primary);preferredSecondaryAttachments=normalizeWeaponAttachments(secondaryName,secondary);localStorage.setItem('breachAttachments',JSON.stringify({primary:preferredPrimaryAttachments,secondary:preferredSecondaryAttachments}));}
function attachmentsForWeapon(weapon=currentWeapon,loadout=null){const l=loadout||selectedLoadout();return weapon===l.primaryWeapon?normalizeWeaponAttachments(weapon,l.primaryAttachments):weapon===l.secondaryWeapon?normalizeWeaponAttachments(weapon,l.secondaryAttachments):normalizeWeaponAttachments(weapon,{});}
function effectiveWeaponSpec(weapon=currentWeapon,loadout=null){return resolveWeaponSpec(weapon,attachmentsForWeapon(weapon,loadout));}
function weaponCapacity(weapon=currentWeapon,loadout=null){return Math.max(1,Math.floor(Number(effectiveWeaponSpec(weapon,loadout).mag)||1));}
function rememberEquipment(tactical,lethal){preferredTactical=normalizeTactical(tactical);preferredLethal=normalizeLethal(lethal);localStorage.setItem('breachTactical',preferredTactical);localStorage.setItem('breachLethal',preferredLethal);}
function rememberLoadoutClasses(classes=loadoutClasses,classId=activeClassId){preferredLoadoutClasses=normalizeLoadoutClasses(classes,selectedLoadout());preferredActiveClassId=normalizeLoadoutClassId(classId);localStorage.setItem('breachLoadoutClasses',JSON.stringify(preferredLoadoutClasses));localStorage.setItem('breachActiveClass',preferredActiveClassId);}
function classLoadout(classes,id){const c=loadoutClassById(classes,id,selectedLoadout());return normalizeLoadoutChoice(c);}
function classSetEqual(a,b){return JSON.stringify(normalizeLoadoutClasses(a,selectedLoadout()))===JSON.stringify(normalizeLoadoutClasses(b,selectedLoadout()));}
function writeClassLoadout(classes,id,loadout){const normalized=normalizeLoadoutClasses(classes,selectedLoadout()),idx=normalized.findIndex(c=>c.id===normalizeLoadoutClassId(id));if(idx>=0)normalized[idx]={...normalized[idx],...normalizeLoadoutChoice(loadout)};return normalized;}
function loadoutClassesForSurface(surface){return surface==='lobby'?normalizeLoadoutClasses(lobbyClassDrafts||loadoutClasses,selectedLoadout()):normalizeLoadoutClasses(matchClassDrafts||loadoutClasses,selectedLoadout());}
function currentLobbyStartingClassId(){return normalizeLoadoutClassId(lobbyStartingClassId||activeClassId);}
function markLobbyLoadoutDirty(){lobbyLoadoutDirty=!classSetEqual(lobbyClassDrafts||loadoutClasses,loadoutClasses)||currentLobbyStartingClassId()!==normalizeLoadoutClassId(activeClassId);}
function syncLobbyClassesToServer(){
  if(socket?.readyState!==WebSocket.OPEN)return;
  const classes=normalizeLoadoutClasses(lobbyClassDrafts||loadoutClasses,selectedLoadout()),classId=currentLobbyStartingClassId(),start=classLoadout(classes,classId),rev=++lobbyLoadoutRevision;
  // Keep the established server contract: the message always activates the starting class,
  // while loadoutClasses carries edits for every class, including classes being edited off-screen.
  send({t:'loadout',rev,classId,loadoutClasses:classes,...start});
}
function setLobbyStartingClass(id){
  if(!matchAllowsLobbyEdits(matchState))return;
  if(lobbyLoadoutDraft)lobbyClassDrafts=writeClassLoadout(lobbyClassDrafts||loadoutClasses,loadoutEditClass.lobby,lobbyLoadoutDraft);
  lobbyStartingClassId=normalizeLoadoutClassId(id);markLobbyLoadoutDirty();renderLoadoutClassStrip('lobby');renderLoadoutOverview('lobby',lobbyLoadoutDraft||classLoadout(lobbyClassDrafts,lobbyStartingClassId));setLobbyActionState();syncLobbyClassesToServer();
  showToast(`${loadoutClassById(lobbyClassDrafts||loadoutClasses,lobbyStartingClassId).name} · STARTING CLASS`,{duration:1200,key:'starting-class'});
}
function renameLoadoutClass(surface,id,value){
  const classId=normalizeLoadoutClassId(id);
  if(surface==='lobby'){
    if(lobbyLoadoutDraft)lobbyClassDrafts=writeClassLoadout(lobbyClassDrafts||loadoutClasses,loadoutEditClass.lobby,lobbyLoadoutDraft);
    const classes=normalizeLoadoutClasses(lobbyClassDrafts||loadoutClasses,selectedLoadout()),idx=classes.findIndex(c=>c.id===classId);if(idx<0)return;
    classes[idx]={...classes[idx],name:normalizeLoadoutClassName(value,idx)};lobbyClassDrafts=classes;markLobbyLoadoutDirty();renderLoadoutClassStrip('lobby');renderLoadoutOverview('lobby',lobbyLoadoutDraft||classLoadout(classes,loadoutEditClass.lobby));setLobbyActionState();syncLobbyClassesToServer();
  }else{
    if(loadoutDraft)matchClassDrafts=writeClassLoadout(matchClassDrafts||loadoutClasses,loadoutEditClass.match,loadoutDraft);const classes=normalizeLoadoutClasses(matchClassDrafts||loadoutClasses,selectedLoadout()),idx=classes.findIndex(c=>c.id===classId);if(idx<0)return;classes[idx]={...classes[idx],name:normalizeLoadoutClassName(value,idx)};matchClassDrafts=classes;syncMatchLoadoutEditor();commitMatchLoadoutChange();
  }
}
function selectLoadoutClass(surface,id){
  const classId=normalizeLoadoutClassId(id);
  if(surface==='lobby'){setLobbyStartingClass(classId);queueControllerUiFocus(`class:${surface}:${classId}:main`);return;}
  if(loadoutDraft)matchClassDrafts=writeClassLoadout(matchClassDrafts||loadoutClasses,loadoutEditClass.match,loadoutDraft);
  loadoutEditClass.match=classId;loadoutBaseDraft=classLoadout(matchClassBase||loadoutClasses,classId);loadoutDraft=classLoadout(matchClassDrafts||loadoutClasses,classId);syncMatchLoadoutEditor();commitMatchLoadoutChange({selectClass:true,announce:true});setLoadoutWorkspaceMode('match','classes',{ensurePreview:false});queueControllerUiFocus(`class:${surface}:${classId}:main`);
}
function renderLoadoutClassStrip(surface){
  const host=document.querySelector(`[data-loadout-class-strip="${surface}"]`);if(!host)return;
  const classes=loadoutClassesForSurface(surface),baseline=surface==='lobby'?normalizeLoadoutClasses(loadoutClasses,selectedLoadout()):normalizeLoadoutClasses(matchClassBase||loadoutClasses,selectedLoadout()),selected=normalizeLoadoutClassId(loadoutEditClass[surface]||activeClassId),starting=surface==='lobby'?currentLobbyStartingClassId():normalizeLoadoutClassId(activeClassId);
  host.replaceChildren();
  for(const item of classes){
    const base=loadoutClassById(baseline,item.id,selectedLoadout()),dirty=item.name!==base.name||!loadoutChoiceEqual(item,base),card=document.createElement('div');card.className='loadout-class-card';
    card.classList.toggle('selected',surface!=='lobby'&&item.id===selected);card.classList.toggle('starting',surface==='lobby'&&item.id===starting);card.classList.toggle('equipped',surface!=='lobby'&&item.id===activeClassId);card.classList.toggle('pending',surface!=='lobby'&&item.id===pendingClassId&&!!pendingLoadout);card.classList.toggle('dirty',dirty);card.setAttribute('role','listitem');
    const main=document.createElement('button');main.type='button';main.className='loadout-class-main';main.dataset.loadoutClass=item.id;main.dataset.controllerKey=`class:${surface}:${item.id}:main`;main.setAttribute('aria-pressed',String(surface==='lobby'?item.id===starting:item.id===selected));main.setAttribute('aria-label',surface==='lobby'?`Use ${item.name} as starting class`:`Select ${item.name}`);
    const head=document.createElement('div');head.className='loadout-class-card-head';const name=document.createElement('strong');name.textContent=item.name;const state=document.createElement('span');state.textContent=surface==='lobby'&&item.id===starting?'STARTING':surface!=='lobby'&&item.id===pendingClassId&&pendingLoadout?'NEXT':surface!=='lobby'&&item.id===activeClassId?'ACTIVE':surface!=='lobby'&&item.id===selected&&item.id!==activeClassId?'SELECTED':dirty?'EDITED':'';head.append(name,state);
    const weapons=document.createElement('div');weapons.className='loadout-class-weapons';const pmods=attachmentCount(item.primaryAttachments),smods=attachmentCount(item.secondaryAttachments);weapons.innerHTML=`<span><b>PRIMARY</b>${WEAPON_SPECS[item.primaryWeapon]?.name||item.primaryWeapon}${pmods?` · ${pmods} MOD${pmods===1?'':'S'}`:''}</span><span><b>SECONDARY</b>${WEAPON_SPECS[item.secondaryWeapon]?.name||item.secondaryWeapon}${smods?` · ${smods} MOD${smods===1?'':'S'}`:''}</span>`;
    const equipment=document.createElement('small');equipment.textContent=`${EQUIPMENT_SPECS[item.tactical]?.short||item.tactical} · ${EQUIPMENT_SPECS[item.lethal]?.short||item.lethal}`;main.append(head,weapons,equipment);main.addEventListener('click',()=>selectLoadoutClass(surface,item.id));
    const edit=document.createElement('button');edit.type='button';edit.className='loadout-class-edit';edit.dataset.controllerKey=`class:${surface}:${item.id}:edit`;edit.textContent='✎';edit.setAttribute('aria-label',`Edit ${item.name}`);edit.addEventListener('click',e=>{e.stopPropagation();switchLoadoutClass(surface,item.id);});card.append(main,edit);host.append(card);
  }
}
function switchLoadoutClass(surface,id){
  const nextId=normalizeLoadoutClassId(id);
  if(surface==='lobby'){
    if(lobbyLoadoutDraft)lobbyClassDrafts=writeClassLoadout(lobbyClassDrafts||loadoutClasses,loadoutEditClass.lobby,lobbyLoadoutDraft);
    loadoutEditClass.lobby=nextId;lobbyLoadoutDraft=classLoadout(lobbyClassDrafts||loadoutClasses,nextId);markLobbyLoadoutDirty();renderLobbySetupControls();setLobbyActionState();
  }else{
    if(loadoutDraft)matchClassDrafts=writeClassLoadout(matchClassDrafts||loadoutClasses,loadoutEditClass.match,loadoutDraft);loadoutEditClass.match=nextId;loadoutBaseDraft=classLoadout(matchClassBase||loadoutClasses,nextId);loadoutDraft=classLoadout(matchClassDrafts||loadoutClasses,nextId);syncMatchLoadoutEditor();
  }
  setLoadoutWorkspaceMode(surface,'class',{ensurePreview:false});renderLoadoutOverview(surface,loadoutDraftForSurface(surface));queueControllerUiFocus(`class-item:${surface}-primary`);
}
function combatItemName(kind){return EQUIPMENT_SPECS[kind]?.name||WEAPON_SPECS[kind]?.name||String(kind||'').toUpperCase();}
function selectedLoadout(){return{primaryWeapon,secondaryWeapon,primaryAttachments:normalizeWeaponAttachments(primaryWeapon,primaryAttachments),secondaryAttachments:normalizeWeaponAttachments(secondaryWeapon,secondaryAttachments),tactical:tacticalEquipment,lethal:lethalEquipment};}
function applyAttachmentState(value={}){primaryAttachments=normalizeWeaponAttachments(primaryWeapon,value.primaryAttachments??primaryAttachments);secondaryAttachments=normalizeWeaponAttachments(secondaryWeapon,value.secondaryAttachments??secondaryAttachments);}
function attachmentCount(value){return ATTACHMENT_SLOTS.reduce((n,slot)=>n+(value?.[slot]?1:0),0);}function loadoutSummary(loadout=selectedLoadout()){const mods=attachmentCount(loadout.primaryAttachments)+attachmentCount(loadout.secondaryAttachments);return`${WEAPON_SPECS[loadout.primaryWeapon]?.name||'Assault Rifle'} + ${WEAPON_SPECS[loadout.secondaryWeapon]?.name||'Pistol'}${mods?` · ${mods} MOD${mods===1?'':'S'}`:''} · ${combatItemName(loadout.tactical)} · ${combatItemName(loadout.lethal)}`;}


function syncMusicUI(){
  for(const [useId,btnId] of [['musicIconUse','musicBtn']]){const use=$(useId),btn=$(btnId);if(use)use.setAttribute('href',masterMuted?'#i-mute':'#i-sound');if(btn)btn.setAttribute('aria-label',masterMuted?'Unmute audio':'Mute all audio');}
  const setting=$('playerMasterMute');if(setting)setGameControlValue(setting,masterMuted?'on':'off');
}
function setMasterMuted(next){
  const muted=!!next;if(masterMuted===muted){syncMusicUI();return;}
  masterMuted=muted;localStorage.setItem('breachMuted',masterMuted?'1':'0');syncMusicUI();
  if(masterMuted)stopIntroMusic();else{void ensureAudio();if(!shell.inMatch)startIntroMusic();}
}
function toggleMasterMute(){setMasterMuted(!masterMuted);}

function currentGameMode(){return normalizeGameMode(matchState?.mode||DEFAULT_GAME_MODE);}
function currentModeSpec(){return gameModeSpec(currentGameMode());}
function modeFriendly(team){return currentModeSpec().teamBased&&team===myTeam;}
function remoteDisplayColor(team){return currentModeSpec().teamBased?(TEAM_COLORS[team]||'#fff'):TEAM_COLORS.red;}
function syncModeVisuals(){selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||TEAM_COLORS.blue):TEAM_COLORS.blue;for(const r of remotes.values())applyRemoteTeamVisual(r,r.team);syncPauseContext();syncLobby();}
function roomSessionActive(){return !!currentRoom&&(shell.inLobby||shell.inMatch||socket?.readyState===WebSocket.OPEN);}
function lobbyModeDescription(mode=currentGameMode()){
  return mode==='ffa'?'Every player and bot is hostile. Highest eliminations wins.':mode==='sandbox'?'Open-ended team sandbox. No score or time limit.':'Blue vs Red. First team to the elimination limit wins.';
}
function normalizeLobbyParticipant(player){
  if(!player?.id)return null;const bot=!!player.bot,botWeapon=bot&&WEAPON_ORDER.includes(player.weapon)?player.weapon:'',primaryWeapon=botWeapon||(PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:PRIMARY_WEAPONS.includes(player.weapon)?player.weapon:'assault');return {id:String(player.id),name:String(player.name||'Player'),team:player.team==='red'?'red':'blue',bot,godMode:!!player.godMode,admin:!!player.admin,primaryWeapon,secondaryWeapon:SECONDARY_WEAPONS.includes(player.secondaryWeapon)?player.secondaryWeapon:'pistol',tactical:normalizeTactical(player.tactical),lethal:normalizeLethal(player.lethal),kills:Number(player.kills)||0,deaths:Number(player.deaths)||0};
}
function replaceLobbyParticipants(players=[],bots=[]){lobbyParticipants.clear();for(const player of [...players,...bots]){const row=normalizeLobbyParticipant(player);if(row&&row.id!==clientId)lobbyParticipants.set(row.id,row);}}
function upsertLobbyParticipant(player){const row=normalizeLobbyParticipant(player);if(row&&row.id!==clientId)lobbyParticipants.set(row.id,row);}
function removeLobbyParticipant(id){lobbyParticipants.delete(String(id||''));}
function syncLobbyBots(list=[]){for(const [id,row] of lobbyParticipants){if(row.bot)lobbyParticipants.delete(id);}for(const bot of list){const row=normalizeLobbyParticipant(bot);if(row)lobbyParticipants.set(row.id,row);}}
function lobbySnapshot(){
  const selfLoadout=shell.inLobby?classLoadout(lobbyClassDrafts||loadoutClasses,currentLobbyStartingClassId()):selectedLoadout(),rows=[{id:clientId,name:myName||safeName(),team:myTeam,bot:false,godMode,admin:isMatchAdmin,...selfLoadout,kills:myStats.kills||0,deaths:myStats.deaths||0,self:true}];
  for(const row of lobbyParticipants.values())rows.push({...row,self:false});
  return rows;
}
function renderLobbyRoster(modeOverride=currentGameMode()){
  if(!lobbyRoster)return;const rows=lobbySnapshot(),mode=normalizeGameMode(modeOverride),teamBased=gameModeSpec(mode).teamBased;
  const humanCount=rows.filter(x=>!x.bot).length,botCount=rows.filter(x=>x.bot).length;$('lobbyPlayerCount').textContent=`${humanCount} / ${MAX_PLAYERS} · ${botCount} bots`;
  const toggle=(label,attr,id,enabled)=>`<button aria-pressed="${enabled}" class="lobby-admin-toggle ${enabled?'active':''}" ${attr}="${id}" type="button"><span>${label}</span><i aria-hidden="true"></i></button>`;
  const hostActions=p=>{if(!isMatchAdmin||p.bot)return'';const owner=p.id===matchOwnerId,self=!!p.self,role=owner?'<span class="lobby-role-chip">HOST</span>':self?`<span class="lobby-role-chip">${p.admin?'ADMIN':'PLAYER'}</span>`:toggle('ADMIN','data-lobby-admin-role',p.id,!!p.admin);return`<div class="lobby-player-actions">${role}</div>`;};
  const playerRow=p=>{const owner=p.id===matchOwnerId,role=owner?' · HOST':p.admin?' · ADMIN':'';return`<div class="lobby-player ${p.self?'self':''}"><span class="lobby-player-color ${teamBased?p.team:'ffa'}"></span><div class="lobby-player-copy"><strong>${escapeHtml(p.bot?'[BOT] '+p.name:p.name)}${p.self?' · YOU':''}</strong><small>${teamBased?String(p.team||'blue').toUpperCase()+' · ':''}${escapeHtml(WEAPON_SPECS[p.primaryWeapon]?.name||'ASSAULT RIFLE')}${role}</small></div>${hostActions(p)}</div>`;};
  if(!teamBased){const body=rows.sort((a,b)=>Number(b.self)-Number(a.self)||a.name.localeCompare(b.name)).map(playerRow).join('');lobbyRoster.className='lobby-roster ffa';lobbyRoster.innerHTML=`<div class="lobby-team-column ffa"><div class="lobby-team-title"><span>FREE FOR ALL</span><b>${rows.length}</b></div><div class="lobby-team-players">${body||'<div class="lobby-empty-team">Open slot</div>'}</div></div>`;}else{lobbyRoster.className='lobby-roster';const column=team=>{const list=rows.filter(p=>p.team===team),name=team==='red'?'RED':'BLUE',body=list.map(playerRow).join('')||'<div class="lobby-empty-team">Open slot</div>';return `<div class="lobby-team-column ${team}"><div class="lobby-team-title"><span>${name}</span><b>${list.length}</b></div><div class="lobby-team-players">${body}</div></div>`;};lobbyRoster.innerHTML=column('blue')+column('red');}
  for(const btn of lobbyRoster.querySelectorAll('[data-lobby-admin-role]'))btn.addEventListener('click',()=>{const id=btn.dataset.lobbyAdminRole,pl=lobbySnapshot().find(x=>x.id===id);if(pl&&!pl.self)send({t:'adminPlayer',targetId:id,action:'admin',enabled:!pl.admin});});
}
function lobbyBotTotal(value=botConfig){return Math.max(0,Math.min(MAX_BOTS,(value.blueBots||0)+(value.redBots||0)));}
function lobbyMinimapModeFromState(state=matchState){return state.minimapDirectional?'directional':(state.minimapRevealAll?'all':'standard');}
function committedLobbyMatchDraft(){const mode=currentGameMode(),spec=gameModeSpec(mode),total=lobbyBotTotal();return{mode,blueBots:Math.max(0,Number(botConfig.blueBots)||0),redBots:Math.max(0,Number(botConfig.redBots)||0),ffaBots:total,difficulty:botConfig.difficulty||'normal',scoreLimit:Number(matchState.scoreLimit||spec.scoreLimit)||spec.scoreLimit,timeLimit:Math.max(2,Math.round((matchState.timeLimitMs||spec.timeLimitMs)/60000)),minimap:lobbyMinimapModeFromState(matchState)};}
function sameLobbyMatchDraft(a,b){if(!a||!b)return false;return a.mode===b.mode&&Number(a.blueBots)===Number(b.blueBots)&&Number(a.redBots)===Number(b.redBots)&&Number(a.ffaBots)===Number(b.ffaBots)&&a.difficulty===b.difficulty&&Number(a.scoreLimit)===Number(b.scoreLimit)&&Number(a.timeLimit)===Number(b.timeLimit)&&a.minimap===b.minimap;}
function sameLoadoutChoice(a,b){return loadoutChoiceEqual(a,b);}
function refreshLobbyDraftOwnership(){
  // Session-state ownership stays independent from Create-a-Class rendering.
  const committedMatch=committedLobbyMatchDraft();if(!lobbyMatchDraft||!lobbyMatchDirty)lobbyMatchDraft={...committedMatch};
  const committedMap=normalizeMapId(currentMapId);if(!lobbyMapDraft||!lobbyMapDirty)lobbyMapDraft=committedMap;
  const committedLoadout=normalizeLoadoutChoice(selectedLoadout());
  if(!lobbyClassDrafts){lobbyClassDrafts=normalizeLoadoutClasses(loadoutClasses,committedLoadout);lobbyStartingClassId=normalizeLoadoutClassId(activeClassId);loadoutEditClass.lobby=normalizeLoadoutClassId(activeClassId);lobbyLoadoutDraft=classLoadout(lobbyClassDrafts,loadoutEditClass.lobby);}
  else if(!lobbyLoadoutDirty){lobbyClassDrafts=normalizeLoadoutClasses(loadoutClasses,committedLoadout);lobbyStartingClassId=normalizeLoadoutClassId(activeClassId);loadoutEditClass.lobby=normalizeLoadoutClassId(loadoutEditClass.lobby||activeClassId);lobbyLoadoutDraft=classLoadout(lobbyClassDrafts,loadoutEditClass.lobby);}
}
let lobbyHostControlsDocked=false;
function restoreAdminTuningNode(nodeId,anchorId){const node=$(nodeId),anchor=$(anchorId);if(node&&anchor&&node.previousElementSibling!==anchor)anchor.after(node);}
function syncLobbyHostControlPlacement(){
  const dock=!!shell.inLobby&&!!isMatchAdmin,gameplay=$('adminGameplay'),weapons=$('adminAdvanced');
  $('lobbyCheatsTab')?.classList.toggle('hide',!dock);
  if(dock){
    if(!lobbyHostControlsDocked){$('lobbyGameplayHostMount')?.append(gameplay);$('lobbyWeaponsHostMount')?.append(weapons);gameplay?.classList.remove('hide');weapons?.classList.remove('hide');populateAdminGameplay(worldSettings);populateAdminWeapons(worldSettings);syncAdminWeaponEditor(currentAdminWeaponSelection());lobbyHostControlsDocked=true;}
    document.querySelector('.admin-bot-card')?.classList.add('hide');
  }else if(lobbyHostControlsDocked){
    restoreAdminTuningNode('adminGameplay','adminGameplayHome');restoreAdminTuningNode('adminAdvanced','adminAdvancedHome');lobbyHostControlsDocked=false;
    const liveBots=document.querySelector('.admin-bot-card');liveBots?.classList.toggle('hide',!shell.inMatch);
    if(shell.panel===SHELL_PANEL.ADMIN)switchAdminTab(activeAdminTab);
  }
  if(!dock&&document.querySelector('[data-lobby-side-tab="cheats"]')?.classList.contains('active'))switchLobbySide('players');
}
function sameJson(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function lobbyGameplaySettingsFromControls(){const patch=collectAdminGameplayPatch();return normalizeWorldSettings({...worldSettings,movement:patch.movement,combat:patch.combat,weapons:worldSettings.weapons});}
function lobbyWeaponsSettingsFromControls(){const patch=collectAdminWeaponsPatch();return normalizeWorldSettings({...worldSettings,weapons:patch.weapons});}
function lobbyGameplayIsDirty(){if(!lobbyHostControlsDocked||!isMatchAdmin)return false;const draft=lobbyGameplaySettingsFromControls(),saved=normalizeWorldSettings(worldSettings);return !sameJson(draft.movement,saved.movement)||!sameJson(draft.combat,saved.combat);}
function lobbyWeaponsIsDirty(){if(!lobbyHostControlsDocked||!isMatchAdmin)return false;const draft=lobbyWeaponsSettingsFromControls(),saved=normalizeWorldSettings(worldSettings);return !sameJson(draft.weapons,saved.weapons);}
function lobbyHostSetupIsDirty(){return !!isMatchAdmin&&(lobbyMatchDirty||lobbyMapDirty||lobbyGameplayIsDirty()||lobbyWeaponsIsDirty());}
function lobbyHasDraftChanges(){return lobbyHostSetupIsDirty()||lobbyLoadoutDirty;}
function resetLobbyHostSetup(){
  if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState))return;
  lobbyMatchDraft=committedLobbyMatchDraft();lobbyMatchDirty=false;lobbyMapDraft=normalizeMapId(currentMapId);lobbyMapDirty=false;
  populateAdminGameplay(worldSettings);populateAdminWeapons(worldSettings);syncAdminWeaponEditor(currentAdminWeaponSelection());syncLobby();showToast('MATCH SETUP RESET');
}
function lobbyDisplayMode(){return isMatchAdmin?(lobbyMatchDraft?.mode||currentGameMode()):currentGameMode();}
function setLobbyActionState(){
  if(!shell.inLobby)return;const setupDirty=lobbyHostSetupIsDirty(),status=$('lobbyStatus'),hint=$('lobbyHint'),reset=$('lobbyResetSetupBtn');if(reset)reset.disabled=!setupDirty||!matchAllowsLobbyEdits(matchState);
  if(isMatchAdmin){if(setupDirty){status.textContent='Match setup ready';hint.textContent='Staged host changes apply once when you start the match.';}else if(lobbyLoadoutDirty){status.textContent='Loadout syncing…';hint.textContent='Match setup is unchanged.';}else{status.textContent='Lobby ready';hint.textContent='Adjust match setup, then start when everyone is ready.';}}
  else{status.textContent='Waiting for host';hint.textContent=lobbyLoadoutDirty?'Loadout syncing…':'Choose your team and loadout while the host configures the match.';}
}
function collectLobbyStartSetup(){
  refreshLobbyDraftOwnership();
  const draft={...(lobbyMatchDraft||committedLobbyMatchDraft())},spec=gameModeSpec(draft.mode);let blue=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(draft.blueBots)||0))),red=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(draft.redBots)||0)));
  if(!spec.teamBased){const total=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(draft.ffaBots)||0)));blue=Math.ceil(total/2);red=Math.floor(total/2);}
  if(blue+red>MAX_BOTS)return null;
  const gameplay=collectAdminGameplayPatch(),weapons=collectAdminWeaponsPatch(),scoreLimit=Math.max(5,Math.min(100,Math.round(Number(draft.scoreLimit)||spec.scoreLimit))),timeLimit=Math.max(2,Math.min(30,Math.round(Number(draft.timeLimit)||Math.max(2,spec.timeLimitMs/60000))));
  return{
    mode:normalizeGameMode(draft.mode),mapId:normalizeMapId(lobbyMapDraft||currentMapId),
    rules:{scoreLimit,timeLimitMs:spec.scoreType==='none'?0:timeLimit*60000},
    bots:{blueBots:blue,redBots:red,difficulty:String(draft.difficulty||'normal')},
    minimap:{revealAll:draft.minimap!=='standard',directional:draft.minimap==='directional'},
    settings:normalizeWorldSettings({...worldSettings,movement:gameplay.movement,combat:gameplay.combat,weapons:weapons.weapons}),
    loadout:classLoadout(lobbyClassDrafts||loadoutClasses,currentLobbyStartingClassId()),loadoutClasses:normalizeLoadoutClasses(lobbyClassDrafts||loadoutClasses,selectedLoadout()),classId:currentLobbyStartingClassId()
  };
}
function renderLobbySetupControls(){
  if(!shell.inLobby)return;refreshLobbyDraftOwnership();const host=!!isMatchAdmin,draft=lobbyMatchDraft||committedLobbyMatchDraft(),draftSpec=gameModeSpec(draft.mode),draftLoadout=lobbyLoadoutDraft||normalizeLoadoutChoice(selectedLoadout());renderLoadoutClassStrip('lobby');renderAttachmentEditors('lobby',draftLoadout);
  for(const btn of lobbyPrimaryButtons)btn.classList.toggle('active',btn.dataset.lobbyPrimaryChoice===draftLoadout.primaryWeapon);
  for(const btn of lobbySecondaryButtons)btn.classList.toggle('active',btn.dataset.lobbySecondaryChoice===draftLoadout.secondaryWeapon);
  for(const btn of lobbyTacticalButtons)btn.classList.toggle('active',btn.dataset.lobbyTacticalChoice===draftLoadout.tactical);
  for(const btn of lobbyLethalButtons)btn.classList.toggle('active',btn.dataset.lobbyLethalChoice===draftLoadout.lethal);
  for(const btn of lobbyModeButtons)btn.classList.toggle('active',btn.dataset.lobbyModeChoice===draft.mode);
  const mapChoice=host?(lobbyMapDraft||currentMapId):currentMapId;for(const btn of lobbyMapButtons){btn.classList.toggle('active',btn.dataset.lobbyMapChoice===mapChoice);btn.disabled=!host||!matchAllowsLobbyEdits(matchState);}renderLobbyMapPreview(mapChoice);
  if(host){
    const draftFfa=!draftSpec.teamBased;$('lobbyBlueBotWrap').classList.toggle('hide',draftFfa);$('lobbyRedBotWrap').classList.toggle('hide',draftFfa);$('lobbyFfaBotWrap').classList.toggle('hide',!draftFfa);
    lobbyBlueBotCount.value=String(draft.blueBots);lobbyRedBotCount.value=String(draft.redBots);lobbyFfaBotCount.value=String(draft.ffaBots);lobbyBotDifficulty.value=draft.difficulty;lobbyMinimapMode.value=draft.minimap;
    const sandbox=draftSpec.scoreType==='none';lobbyScoreLimit.value=sandbox?'':String(draft.scoreLimit);lobbyTimeLimit.value=sandbox?'':String(draft.timeLimit);lobbyScoreLimit.disabled=sandbox;lobbyTimeLimit.disabled=sandbox;$('lobbyScoreWrap')?.classList.toggle('disabled-setting',sandbox);$('lobbyTimeWrap')?.classList.toggle('disabled-setting',sandbox);
  }
}
function renderLobbyShell(){
  if(!shell.inLobby)return;refreshLobbyDraftOwnership();syncLobbyHostControlPlacement();const host=!!isMatchAdmin,displayMode=lobbyDisplayMode(),displaySpec=gameModeSpec(displayMode),committedMode=currentGameMode(),committedSpec=gameModeSpec(committedMode),total=lobbyBotTotal();
  $('lobbyRoomCode').textContent=currentRoom||'----';$('lobbyModeBadge').textContent=displaySpec.name;$('lobbyModeDescription').textContent=lobbyModeDescription(displayMode);
  $('lobbyTeamGroup').classList.toggle('hide',!displaySpec.teamBased);$('lobbyHostSetup').classList.toggle('hide',!host);$('lobbyGuestSetup').classList.toggle('hide',host);$('lobbySetupOwnerLabel').textContent=host?'Host controls':'Match info';$('lobbyCheatsTab')?.classList.toggle('hide',!host);
  const godToggle=$('lobbyGodModeToggle');if(godToggle){godToggle.classList.toggle('active',!!godMode);godToggle.setAttribute('aria-checked',String(!!godMode));godToggle.disabled=!host||socket?.readyState!==WebSocket.OPEN;}
  const startBtn=$('lobbyStartBtn'),resetBtn=$('lobbyResetSetupBtn');startBtn.classList.toggle('hide',!host);startBtn.disabled=!matchAllowsLobbyEdits(matchState);if(resetBtn)resetBtn.classList.toggle('hide',!host);
  for(const btn of lobbyTeamButtons)btn.classList.toggle('active',displaySpec.teamBased&&btn.dataset.lobbyTeamChoice===myTeam);
  if($('lobbyMapDescription'))$('lobbyMapDescription').textContent=host?'Select a level. Applied when the match starts.':'Selected by the host.';
  const committedRule=committedSpec.scoreType==='none'?'No score / time limit':`First ${matchState.scoreLimit||committedSpec.scoreLimit} · ${Math.max(2,Math.round((matchState.timeLimitMs||committedSpec.timeLimitMs)/60000))} min`,committedMinimap=`Minimap: ${lobbyMinimapModeFromState()==='directional'?'Directional':(lobbyMinimapModeFromState()==='all'?'Always On':'Standard')}`,committedMap=mapSpec(currentMapId).name;
  $('lobbyGuestMode').textContent=`${committedSpec.name} · ${committedMap}`;$('lobbyGuestBots').textContent=`${total} bot${total===1?'':'s'} · ${(botConfig.difficulty||'normal').replace(/^./,c=>c.toUpperCase())}`;$('lobbyGuestRules').textContent=`${committedRule} · ${committedMinimap}${matchCustom?' · Custom rules':''}`;
}
function syncLobby({setup=true,roster=true}={}){if(!shell.inLobby)return;renderLobbyShell();if(setup){try{renderLobbySetupControls();}catch(error){console.error('Loadout/setup UI render failed without interrupting lobby session state.',error);}}setLobbyActionState();if(roster)renderLobbyRoster(lobbyDisplayMode());}
function showLobby(){finishInitialConnectionAttempt();const leave=$('leaveBtn');if(leave){leave.disabled=false;const label=leave.querySelector('span');if(label)label.textContent='Return to Lobby';}shell.enterLobby();refreshLobbyDraftOwnership();syncLobby();const url=new URL(location.href);url.searchParams.set('room',currentRoom);history.replaceState(null,'',url);}
function updateLobbyMatchDraftFromControls(){
  if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState))return;if(!lobbyMatchDraft)lobbyMatchDraft=committedLobbyMatchDraft();const spec=gameModeSpec(lobbyMatchDraft.mode),ffa=!spec.teamBased;let blue=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyBlueBotCount.value)||0))),red=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyRedBotCount.value)||0))),ffaBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyFfaBotCount.value)||0)));
  if(!ffa&&blue+red>MAX_BOTS){showToast(`MAX ${MAX_BOTS} BOTS`);const committed=committedLobbyMatchDraft();blue=committed.blueBots;red=committed.redBots;}
  lobbyMatchDraft={...lobbyMatchDraft,blueBots:blue,redBots:red,ffaBots,difficulty:lobbyBotDifficulty.value,scoreLimit:spec.scoreType==='none'?lobbyMatchDraft.scoreLimit:Math.max(5,Math.min(100,Math.round(Number(lobbyScoreLimit.value)||spec.scoreLimit))),timeLimit:spec.scoreType==='none'?lobbyMatchDraft.timeLimit:Math.max(2,Math.min(30,Math.round(Number(lobbyTimeLimit.value)||spec.timeLimitMs/60000))),minimap:['standard','all','directional'].includes(lobbyMinimapMode.value)?lobbyMinimapMode.value:'standard'};
  lobbyMatchDirty=!sameLobbyMatchDraft(lobbyMatchDraft,committedLobbyMatchDraft());renderLobbySetupControls();setLobbyActionState();
}
function setLobbyModeDraft(mode){if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState))return;if(!lobbyMatchDraft)lobbyMatchDraft=committedLobbyMatchDraft();lobbyMatchDraft={...lobbyMatchDraft,mode:normalizeGameMode(mode)};lobbyMatchDirty=!sameLobbyMatchDraft(lobbyMatchDraft,committedLobbyMatchDraft());syncLobby();}
function setLobbyMapDraft(mapId){if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState))return;lobbyMapDraft=normalizeMapId(mapId);lobbyMapDirty=lobbyMapDraft!==normalizeMapId(currentMapId);renderLobbySetupControls();setLobbyActionState();}
function setLobbyLoadoutDraft(next={}){
  if(!lobbyClassDrafts)lobbyClassDrafts=normalizeLoadoutClasses(loadoutClasses,selectedLoadout());if(!lobbyLoadoutDraft)lobbyLoadoutDraft=classLoadout(lobbyClassDrafts,loadoutEditClass.lobby||activeClassId);
  lobbyLoadoutDraft=normalizeLoadoutChoice({...lobbyLoadoutDraft,...next});lobbyClassDrafts=writeClassLoadout(lobbyClassDrafts,loadoutEditClass.lobby,lobbyLoadoutDraft);markLobbyLoadoutDirty();renderLobbySetupControls();setLobbyActionState();syncLobbyClassesToServer();
}

function syncPauseContext(){
  if(shell.inMatch)syncLobbyHostControlPlacement();const spec=currentModeSpec(),badge=$('pauseTeamBadge');if(badge){badge.textContent=spec.teamBased?`${myTeam.toUpperCase()} TEAM`:spec.short;const color=spec.teamBased?TEAM_COLORS[myTeam]:HUD_ACCENT;badge.style.color=color;badge.style.borderColor=`${color}88`;badge.style.background=`${color}22`;}
  if($('pauseRoom'))$('pauseRoom').textContent=`${mapSpec(currentMapId).short} · ${spec.short} · ${currentRoom||'----'}`;
  if($('pauseLoadout'))$('pauseLoadout').textContent=`${loadoutClassById(loadoutClasses,activeClassId).name} · ${loadoutSummary()} · ${Math.max(0,Math.floor(ammo[currentWeapon]||0))} rounds${pendingClassId?` · ${loadoutClassById(loadoutClasses,pendingClassId).name} NEXT`:''}`;
  const adminBtn=$('adminBtn');if(adminBtn)adminBtn.classList.toggle('hide',!isMatchAdmin);
  const leave=$('leaveBtn');if(leave){leave.disabled=false;const label=leave.querySelector('span');if(label)label.textContent=isMatchAdmin?'Return to Lobby':'Leave Match';}
  const teamBtn=$('teamSwitchBtn');if(teamBtn)teamBtn.classList.toggle('hide',!spec.teamBased);const teamText=$('teamSwitchText');if(teamText)teamText.textContent=godMode?`Switch to ${myTeam==='blue'?'Red':'Blue'} now`:(pendingTeam?`${pendingTeam.toUpperCase()} ON RESPAWN`:`Switch to ${myTeam==='blue'?'Red':'Blue'} on Respawn`);
}

function switchLobbySide(name='players'){
  let next=['players','match','map','loadout','cheats'].includes(name)?name:'players';
  if(next!=='loadout')$('lobbyScreen')?.classList.remove('loadout-focused');
  if(next==='cheats'&&!isMatchAdmin)next='players';
  for(const tab of lobbySideTabs){const active=tab.dataset.lobbySideTab===next;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));}
  for(const view of lobbySideViews){const active=view.dataset.lobbySideView===next;view.classList.toggle('active',active);view.hidden=!active;view.inert=!active;}
  if(next==='map')requestAnimationFrame(renderLobbyMapPreview);if(next==='loadout'){setLoadoutWorkspaceMode('lobby','classes',{ensurePreview:false});renderAttachmentEditors('lobby',lobbyLoadoutDraft||normalizeLoadoutChoice(selectedLoadout()));}
}
function switchSubTabs(tabSelector,pageSelector,tabAttr,pageAttr,name){
  const tabs=[...document.querySelectorAll(tabSelector)],pages=[...document.querySelectorAll(pageSelector)];if(!tabs.length||!pages.length)return;
  const next=tabs.some(t=>t.getAttribute(tabAttr)===name)?name:tabs[0].getAttribute(tabAttr);
  for(const tab of tabs){const active=tab.getAttribute(tabAttr)===next;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;}
  for(const page of pages){const active=page.getAttribute(pageAttr)===next;page.classList.toggle('active',active);page.hidden=!active;page.inert=!active;}
}
function bindSubTabs(tabSelector,pageSelector,tabAttr,pageAttr,initial){
  const tabs=[...document.querySelectorAll(tabSelector)];for(const tab of tabs){tab.addEventListener('click',()=>switchSubTabs(tabSelector,pageSelector,tabAttr,pageAttr,tab.getAttribute(tabAttr)));tab.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const cur=Math.max(0,tabs.indexOf(tab)),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(cur+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;tabs[next].focus();switchSubTabs(tabSelector,pageSelector,tabAttr,pageAttr,tabs[next].getAttribute(tabAttr));});}
  switchSubTabs(tabSelector,pageSelector,tabAttr,pageAttr,initial);
}
function normalizeLoadoutChoice(value,fallback=selectedLoadout()){
  const v=value&&typeof value==='object'?value:{},primaryWeapon=PRIMARY_WEAPONS.includes(v.primaryWeapon)?v.primaryWeapon:fallback.primaryWeapon,secondaryWeapon=SECONDARY_WEAPONS.includes(v.secondaryWeapon)?v.secondaryWeapon:(SECONDARY_WEAPONS.includes(fallback.secondaryWeapon)?fallback.secondaryWeapon:'pistol');
  return{primaryWeapon,secondaryWeapon,primaryAttachments:normalizeWeaponAttachments(primaryWeapon,v.primaryAttachments??fallback.primaryAttachments),secondaryAttachments:normalizeWeaponAttachments(secondaryWeapon,v.secondaryAttachments??fallback.secondaryAttachments),tactical:normalizeTactical(v.tactical??fallback.tactical),lethal:normalizeLethal(v.lethal??fallback.lethal)};
}
function loadoutChoiceEqual(a,b){const x=normalizeLoadoutChoice(a),y=normalizeLoadoutChoice(b);return x.primaryWeapon===y.primaryWeapon&&x.secondaryWeapon===y.secondaryWeapon&&JSON.stringify(x.primaryAttachments)===JSON.stringify(y.primaryAttachments)&&JSON.stringify(x.secondaryAttachments)===JSON.stringify(y.secondaryAttachments)&&x.tactical===y.tactical&&x.lethal===y.lethal;}
function syncMatchLoadoutEditor(){
  const draft=normalizeLoadoutChoice(loadoutDraft||loadoutBaseDraft||pendingLoadout||selectedLoadout());loadoutDraft=draft;renderAttachmentEditors('match',draft);
  for(const btn of matchPrimaryButtons)btn.classList.toggle('active',btn.dataset.matchPrimaryChoice===draft.primaryWeapon);
  for(const btn of matchSecondaryButtons)btn.classList.toggle('active',btn.dataset.matchSecondaryChoice===draft.secondaryWeapon);
  for(const btn of matchTacticalButtons)btn.classList.toggle('active',btn.dataset.matchTacticalChoice===draft.tactical);
  for(const btn of matchLethalButtons)btn.classList.toggle('active',btn.dataset.matchLethalChoice===draft.lethal);
  if(matchClassDrafts)matchClassDrafts=writeClassLoadout(matchClassDrafts,loadoutEditClass.match,draft);renderLoadoutClassStrip('match');const status=$('loadoutStatus'),description=$('loadoutDescription');if(description)description.textContent=godMode?'Changes save automatically and equip immediately while God Mode is active.':'Changes save automatically and equip on your next spawn. Your current life stays unchanged.';if(status)status.textContent=godMode?'AUTO-SAVE · EQUIPS IMMEDIATELY':'AUTO-SAVE · NEXT SPAWN';
}
function openMatchLoadout(){if(!shell.inMatch||matchState.status===MATCH_STATUS.ENDED)return;matchClassBase=normalizeLoadoutClasses(loadoutClasses,selectedLoadout());matchClassDrafts=normalizeLoadoutClasses(matchClassBase,selectedLoadout());loadoutEditClass.match=normalizeLoadoutClassId(pendingClassId||activeClassId);loadoutBaseDraft=classLoadout(matchClassBase,loadoutEditClass.match);loadoutDraft=classLoadout(matchClassDrafts,loadoutEditClass.match);syncMatchLoadoutEditor();shell.openPanel(SHELL_PANEL.LOADOUT);setLoadoutWorkspaceMode('match','classes',{ensurePreview:false});}
function closeMatchLoadout(){setLoadoutWorkspaceMode('match','classes',{ensurePreview:false});loadoutDraft=null;loadoutBaseDraft=null;matchClassDrafts=null;matchClassBase=null;shell.closePanel(SHELL_PANEL.LOADOUT);}
function commitMatchLoadoutChange({selectClass=false,announce=false}={}){
  if(socket?.readyState!==WebSocket.OPEN||!matchClassDrafts||!loadoutDraft)return false;
  matchClassDrafts=writeClassLoadout(matchClassDrafts,loadoutEditClass.match,loadoutDraft);
  const editedClassId=normalizeLoadoutClassId(loadoutEditClass.match),classId=selectClass?editedClassId:normalizeLoadoutClassId(pendingClassId||activeClassId),classes=normalizeLoadoutClasses(matchClassDrafts,selectedLoadout()),next=classLoadout(classes,classId),classesOnly=!selectClass&&editedClassId!==classId,rev=++matchLoadoutRevision;
  loadoutClasses=classes;matchClassBase=normalizeLoadoutClasses(classes,selectedLoadout());loadoutBaseDraft=classLoadout(matchClassBase,editedClassId);rememberLoadoutClasses(loadoutClasses,classId);
  if(!classesOnly&&!godMode){pendingClassId=classId;pendingLoadout=next;}
  send(classesOnly?{t:'loadout',rev,classId,loadoutClasses:classes,classesOnly:true}:{t:'loadout',rev,classId,loadoutClasses:classes,...next});syncPauseContext();renderLoadoutClassStrip('match');
  if(announce)showToast(godMode?`${loadoutClassById(classes,classId).name} APPLYING`:`${loadoutClassById(classes,classId).name} · NEXT SPAWN`,{duration:1100,key:'loadout-class'});
  return true;
}
function setMatchLoadoutDraft(next={}){loadoutDraft=normalizeLoadoutChoice({...loadoutDraftForSurface('match'),...next});syncMatchLoadoutEditor();commitMatchLoadoutChange();}

function weaponSoundCueIds(weapon=currentWeapon){return weapon==='akimbo1887'?['shot1887','shot1887Suppressed','reload1887','action1887']:weapon==='assault'?['shotAssault','shotAssaultSuppressed','reloadAssault']:weapon==='ump'?['shotUmp','shotUmpSuppressed','reloadUmp']:weapon==='machineGun'?['shotMachineGun','shotMachineGunSuppressed','reloadMachineGun']:weapon==='shotgun'?['shotShotgun','shotShotgunSuppressed','reloadShotgun','shotgunPump']:weapon==='semiShotgun'?['shotSemiShotgun','reloadSemiShotgun']:weapon==='sniper'?['shotSniper','shotSniperSuppressed','reloadSniper']:weapon==='grenadeLauncher'?['shotGl','reloadGl','glExplosion']:weapon==='rpg'?['shotRpg','reloadRpg','rpgExplosion']:['shotPistol','shotPistolSuppressed','reloadPistol'];}
function warmWeaponAudio(weapon=currentWeapon){for(const id of weaponSoundCueIds(weapon))gameAudio.load(id);}
const CORE_GAMEPLAY_AUDIO_IDS=Object.freeze(['footstepLeft','footstepRight','jump','land','slide','impactWall','impactPlayer','impactBlocked','hurt','hitmarker','headshot','kill','shield','announcer','flashDetonate','grenadeExplosion','glExplosion','rpgExplosion','flashThrow','stickyThrow','flashImpact','stickyImpact','semtexBeep']);
const ALL_WEAPON_AUDIO_IDS=Object.freeze([...new Set(WEAPON_ORDER.flatMap(weapon=>weaponSoundCueIds(weapon)))]);
function ensureAudio(){audioUnlockPromise=gameAudio.unlock();return audioUnlockPromise;}
async function warmGameplayAudio(weapon=currentWeapon){
  if(masterMuted)return false;
  const unlocked=await (audioUnlockPromise||ensureAudio());if(!unlocked)return false;
  const ids=[...new Set([...CORE_GAMEPLAY_AUDIO_IDS,...weaponSoundCueIds(weapon)])];
  const results=await Promise.all(ids.map(id=>gameAudio.load(id)));
  // Do not hold match entry for every weapon. Once the critical/local set is
  // ready, decode the remaining weapon library opportunistically so the first
  // nearby remote shot/reload is unlikely to arrive cold.
  for(const id of ALL_WEAPON_AUDIO_IDS)if(!ids.includes(id))void gameAudio.load(id);
  return results.every(Boolean);
}
function playSoundCue(cueId,volume=1,override={}){return gameAudio.play(cueId,volume,override);}
function spatialAudioParams(x,y,z,maxDistance=60){
  if(!position)return{volume:.08,pan:0,distanceRatio:1,lowpassHz:3200};
  const dx=Number(x||0)-position.x,dy=Number(y||0)-(position.y+1),dz=Number(z||0)-position.z,d=Math.hypot(dx,dy,dz),range=Math.max(1,maxDistance),distanceRatio=THREE.MathUtils.clamp(d/range,0,1);
  const volume=Math.pow(Math.max(0,1-distanceRatio),1.7);
  if(d<.001)return{volume,pan:0,distanceRatio:0,lowpassHz:20000};
  const rightX=-Math.cos(yaw),rightZ=Math.sin(yaw),pan=THREE.MathUtils.clamp((dx*rightX+dz*rightZ)/d,-.92,.92),lowpassHz=THREE.MathUtils.lerp(19000,2600,Math.pow(distanceRatio,1.08));
  return{volume,pan,distanceRatio,lowpassHz};
}
function playSpatialCue(cueId,x,y,z,maxDistance=60,volume=1,override={}){const p=spatialAudioParams(x,y,z,maxDistance);if(p.volume<=.004)return null;return playSoundCue(cueId,p.volume*volume,{...override,pan:p.pan,lowpassHz:override.lowpassHz??p.lowpassHz});}
function savePlayerSettings(){localStorage.setItem('breachPlayerSettings',JSON.stringify(playerSettings));}
function targetPixelRatio(){
  const quality=playerSettings.graphics,maxRatio=quality==='low'?1:quality==='medium'?(isTouch?1.25:1.5):(isTouch?1.5:2);
  return Math.min(devicePixelRatio||1,maxRatio);
}
function applyGraphicsQuality(){
  if(!renderer)return;
  const ratio=targetPixelRatio();
  if(Math.abs(renderer.getPixelRatio()-ratio)>.001)renderer.setPixelRatio(ratio);
  renderer.shadowMap.enabled=playerSettings.graphics==='high'&&!isTouch;
  if(hudCanvas)resizeHudOverlay();
}
function normalizePlayerSettingsValue(value={}){
  const clamp=(raw,min,max,fallback)=>{const n=Number(raw);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
  return{
    lookSensitivity:clamp(value.lookSensitivity,.5,2,DEFAULT_PLAYER_SETTINGS.lookSensitivity),
    adsSensitivity:clamp(value.adsSensitivity,.35,1.25,DEFAULT_PLAYER_SETTINGS.adsSensitivity),
    touchSensitivity:clamp(value.touchSensitivity,.5,2,DEFAULT_PLAYER_SETTINGS.touchSensitivity),
    controllerVerticalSensitivity:clamp(value.controllerVerticalSensitivity,.5,1.5,DEFAULT_PLAYER_SETTINGS.controllerVerticalSensitivity),
    controllerResponseCurve:['dynamic','standard','linear'].includes(value.controllerResponseCurve)?value.controllerResponseCurve:DEFAULT_PLAYER_SETTINGS.controllerResponseCurve,
    controllerAimAssist:value.controllerAimAssist==='off'?'off':'on',
    controllerMoveDeadzone:clamp(value.controllerMoveDeadzone,.02,.25,DEFAULT_PLAYER_SETTINGS.controllerMoveDeadzone),
    controllerLookDeadzone:clamp(value.controllerLookDeadzone,.02,.25,DEFAULT_PLAYER_SETTINGS.controllerLookDeadzone),
    masterVolume:clamp(value.masterVolume,0,1,DEFAULT_PLAYER_SETTINGS.masterVolume),
    sfxVolume:clamp(value.sfxVolume,0,1,DEFAULT_PLAYER_SETTINGS.sfxVolume),
    musicVolume:clamp(value.musicVolume,0,1,DEFAULT_PLAYER_SETTINGS.musicVolume),
    graphics:['low','medium','high'].includes(value.graphics)?value.graphics:DEFAULT_PLAYER_SETTINGS.graphics,
    minimapOrientation:value.minimapOrientation==='north'?'north':'heading',
    diagnostics:value.diagnostics==='on'?'on':'off'
  };
}
function setSettingsStatus(text,tone=''){const el=$('settingsStatus');if(!el)return;el.textContent=text;el.className=`admin-status ${tone}`.trim();}
function playerSettingsEqual(a,b){const x=normalizePlayerSettingsValue(a),y=normalizePlayerSettingsValue(b);return Object.keys(x).every(k=>x[k]===y[k]);}
function syncPlayerSettingsUI(value=playerSettings){
  const source=normalizePlayerSettingsValue(value),values=[['playerLookSensitivity','lookSensitivity'],['playerAdsSensitivity','adsSensitivity'],['playerTouchSensitivity','touchSensitivity'],['playerControllerVerticalSensitivity','controllerVerticalSensitivity'],['playerControllerMoveDeadzone','controllerMoveDeadzone'],['playerControllerLookDeadzone','controllerLookDeadzone'],['playerMasterVolume','masterVolume'],['playerSfxVolume','sfxVolume'],['playerMusicVolume','musicVolume']];
  for(const [id,key] of values){const el=$(id),out=$(`${id}Value`);if(el)el.value=source[key];if(out)out.textContent=key.includes('Volume')?`${Math.round(source[key]*100)}%`:key.includes('Deadzone')?`${Math.round(source[key]*100)}%`:`${Number(source[key]).toFixed(2)}×`;}
  if($('playerGraphics'))$('playerGraphics').value=source.graphics;if($('playerMinimapOrientation'))$('playerMinimapOrientation').value=source.minimapOrientation;if($('playerControllerResponseCurve'))$('playerControllerResponseCurve').value=source.controllerResponseCurve;if($('playerControllerAimAssist'))$('playerControllerAimAssist').value=source.controllerAimAssist;syncMusicUI();syncDiagnosticsSettingsUI();
}
function applyPlayerSettings(next,{status='Saved automatically'}={}){const previous=playerSettings;playerSettings=normalizePlayerSettingsValue(next);playerSettingsDraft=null;savePlayerSettings();applyGraphicsQuality();hudLastDraw=0;syncPlayerSettingsUI(playerSettings);setSettingsStatus(status,'ok');return previous;}
function stagePlayerSettingFromUI(id,key){const el=$(id);if(!el)return;applyPlayerSettings({...playerSettings,[key]:Number(el.value)});}
function stagePlayerChoice(key,value){applyPlayerSettings({...playerSettings,[key]:value});}
function refreshIntroMusicVolume(){if(!shell.inMatch&&introMusicHandle){stopIntroMusic();if(!masterMuted)startIntroMusic();}}
function openPlayerSettings(){if(shell.inMatch&&matchState.status===MATCH_STATUS.ENDED)return;playerSettingsDraft=null;syncPlayerSettingsUI(playerSettings);setSettingsStatus('Changes save automatically','ok');switchSubTabs('[data-settings-tab]','[data-settings-page]','data-settings-tab','data-settings-page','controls');shell.openPanel(SHELL_PANEL.SETTINGS);}
function closePlayerSettings(){playerSettingsDraft=null;shell.closePanel(SHELL_PANEL.SETTINGS);}
function cancelPlayerSettings(){closePlayerSettings();}
function resetPlayerSettings(){if(diagnosticsRecordingEnabled())setDiagnosticsRecording(false);setMasterMuted(false);applyPlayerSettings({...DEFAULT_PLAYER_SETTINGS,diagnostics:'off'},{status:'Defaults restored'});refreshIntroMusicVolume();showToast('SETTINGS RESET TO DEFAULTS');}



function sightMarkMaterial(color=0xf4f1df){return new THREE.MeshBasicMaterial({color,transparent:true,opacity:.96,depthWrite:false,side:THREE.DoubleSide,toneMapped:false});}
function addPistolIronSights(group,material,{rearZ=.08,frontZ=-.31,sightY=.140,rearMountY=.112,frontMountY=.112,eyeZ=-.46}={}){
  // CoD-style pistol sight picture: a shallow square rear notch and a narrow
  // front blade with high-contrast three-dot references. Keep the center open.
  const parts=[],markMat=sightMarkMaterial(),rearBaseH=.010,rearBase=new THREE.Mesh(new THREE.BoxGeometry(.058,rearBaseH,.020),material);rearBase.position.set(0,rearMountY+rearBaseH/2,rearZ);parts.push(rearBase);
  const earW=.011,earH=Math.max(.014,sightY-rearMountY-.006),gap=.016,rearL=new THREE.Mesh(new THREE.BoxGeometry(earW,earH,.018),material),rearR=rearL.clone();rearL.position.set(-(gap+earW/2),rearMountY+rearBaseH+earH/2,rearZ);rearR.position.set(gap+earW/2,rearMountY+rearBaseH+earH/2,rearZ);parts.push(rearL,rearR);
  const frontBaseH=.008,frontBase=new THREE.Mesh(new THREE.BoxGeometry(.024,frontBaseH,.018),material);frontBase.position.set(0,frontMountY+frontBaseH/2,frontZ);const postBottom=frontMountY+frontBaseH,postH=Math.max(.008,sightY-postBottom),frontPost=new THREE.Mesh(new THREE.BoxGeometry(.0062,postH,.014),material);frontPost.position.set(0,postBottom+postH/2,frontZ);parts.push(frontBase,frontPost);
  const rearDotL=new THREE.Mesh(new THREE.CircleGeometry(.0034,12),markMat),rearDotR=rearDotL.clone(),frontDot=new THREE.Mesh(new THREE.CircleGeometry(.0036,12),markMat);rearDotL.position.set(-.020,sightY-.008,rearZ+.010);rearDotR.position.set(.020,sightY-.008,rearZ+.010);frontDot.position.set(0,sightY-.006,frontZ+.008);parts.push(rearDotL,rearDotR,frontDot);
  group.add(...parts);group.userData.ironSightParts=parts;group.userData.adsSightRear={x:0,y:sightY,z:rearZ};group.userData.adsSightTip={x:0,y:sightY,z:frontZ};group.userData.adsSightY=sightY;group.userData.adsPose={x:0,y:-sightY,z:eyeZ-rearZ,rx:0,ry:0,rz:0};return sightY;
}
function addApertureIronSights(group,material,{rearZ=.04,frontZ=-.66,sightY=.165,rearMountY=.132,frontMountY=.132,eyeZ=-.40,rearRadius=.021,rearTube=.0036,postWidth=.0065,frontEarGap=.020}={}){
  // Rifle/SMG sight picture: thin rear aperture + protected front post. This
  // keeps the center much less obstructed than the old generic square notch.
  const parts=[],rearRing=new THREE.Mesh(new THREE.TorusGeometry(rearRadius,rearTube,7,24),material);rearRing.position.set(0,sightY,rearZ);parts.push(rearRing);
  const rearStemTop=sightY-rearRadius-rearTube*.35,rearStemH=Math.max(.008,rearStemTop-rearMountY),rearStem=new THREE.Mesh(new THREE.BoxGeometry(.012,rearStemH,.018),material);rearStem.position.set(0,rearMountY+rearStemH/2,rearZ);const rearFoot=new THREE.Mesh(new THREE.BoxGeometry(.046,.008,.024),material);rearFoot.position.set(0,rearMountY+.004,rearZ);parts.push(rearStem,rearFoot);
  const frontBaseH=.008,frontBase=new THREE.Mesh(new THREE.BoxGeometry(.040,frontBaseH,.018),material);frontBase.position.set(0,frontMountY+frontBaseH/2,frontZ);const postBottom=frontMountY+frontBaseH,postH=Math.max(.008,sightY-postBottom),frontPost=new THREE.Mesh(new THREE.BoxGeometry(postWidth,postH,.014),material);frontPost.position.set(0,postBottom+postH/2,frontZ);parts.push(frontBase,frontPost);
  const earW=.0065,earTop=sightY+.010,earH=Math.max(.010,earTop-postBottom),frontL=new THREE.Mesh(new THREE.BoxGeometry(earW,earH,.014),material),frontR=frontL.clone();frontL.position.set(-(frontEarGap+earW/2),postBottom+earH/2,frontZ);frontR.position.set(frontEarGap+earW/2,postBottom+earH/2,frontZ);parts.push(frontL,frontR);
  group.add(...parts);group.userData.ironSightParts=parts;group.userData.adsSightRear={x:0,y:sightY,z:rearZ};group.userData.adsSightTip={x:0,y:sightY,z:frontZ};group.userData.adsSightY=sightY;group.userData.adsPose={x:0,y:-sightY,z:eyeZ-rearZ,rx:0,ry:0,rz:0};return sightY;
}
function addShotgunBeadSight(group,material,{rearZ=.02,frontZ=-1.04,sightY=.116,rearMountY=.090,frontMountY=.060,eyeZ=-.42}={}){
  // Pump shotgun: low receiver rib and a bright, simple front bead. The eye is
  // not boxed in by a fake rear notch.
  const parts=[],rib=new THREE.Mesh(new THREE.BoxGeometry(.030,.006,.055),material);rib.position.set(0,rearMountY+.003,rearZ-.010);parts.push(rib);
  const beadStemH=Math.max(.006,sightY-frontMountY-.006),beadStem=new THREE.Mesh(new THREE.BoxGeometry(.010,beadStemH,.014),material);beadStem.position.set(0,frontMountY+beadStemH/2,frontZ);const bead=new THREE.Mesh(new THREE.SphereGeometry(.0055,10,7),sightMarkMaterial(0xfff0b8));bead.position.set(0,sightY,frontZ);parts.push(beadStem,bead);
  group.add(...parts);group.userData.ironSightParts=parts;group.userData.adsSightRear={x:0,y:sightY,z:rearZ};group.userData.adsSightTip={x:0,y:sightY,z:frontZ};group.userData.adsSightY=sightY;group.userData.adsPose={x:0,y:-sightY,z:eyeZ-rearZ,rx:0,ry:0,rz:0};return sightY;
}
function addShotgunGhostRingSight(group,material,opts={}){
  return addApertureIronSights(group,material,{rearRadius:.017,rearTube:.0032,postWidth:.006,frontEarGap:.017,...opts});
}
function weaponUsesIronSights(weapon=currentWeapon){return IRON_SIGHT_WEAPONS.has(weapon);}
function attachmentVisualMaterial(color=0x171c20,metalness=.34,roughness=.44){return new THREE.MeshStandardMaterial({color,metalness,roughness});}
function registerAttachmentVisual(group,id,object){if(!group||!object)return object;if(!group.userData.attachmentVisuals)group.userData.attachmentVisuals={};group.userData.attachmentVisuals[id]=object;object.visible=false;group.add(object);return object;}
function makeMuzzleAttachment({radius=.030,length=.22,color=0x171c20,muzzle={x:0,y:0,z:-1},overlap=.018,ported=false}={}){
  // Muzzle devices mount from the real barrel tip, not a guessed weapon-center
  // Z coordinate. This keeps pistol/SMG/rifle devices concentric with the bore.
  const g=new THREE.Group(),mx=Number(muzzle?.x)||0,my=Number(muzzle?.y)||0,mz=Number(muzzle?.z)||0,seat=Math.max(0,Math.min(length*.35,Number(overlap)||0)),centerZ=mz-length*.5+seat,frontZ=mz-length+seat;
  const mat=attachmentVisualMaterial(color,.48,.34),body=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,12),mat);body.rotation.x=Math.PI/2;body.position.set(mx,my,centerZ);g.add(body);
  // A narrow collar visually seats the device around the barrel instead of
  // leaving a floating gap at the thread/muzzle junction.
  const collar=new THREE.Mesh(new THREE.CylinderGeometry(radius*.82,radius*.82,Math.min(.040,length*.22),12),attachmentVisualMaterial(0x111518,.44,.42));collar.rotation.x=Math.PI/2;collar.position.set(mx,my,mz+seat*.35);g.add(collar);
  if(ported){for(const x of [-1,1]){const port=new THREE.Mesh(new THREE.BoxGeometry(.010,.018,.032),attachmentVisualMaterial(0x080a0b,.15,.80));port.position.set(mx+x*radius*.72,my+radius*.08,centerZ-length*.16);g.add(port);}}
  g.userData.muzzleTip=new THREE.Vector3(mx,my,frontZ);g.userData.muzzleSeat=new THREE.Vector3(mx,my,mz);return g;
}
function opticReticleMaterials(){return{glow:new THREE.MeshBasicMaterial({color:0xff312c,transparent:true,opacity:.20,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}),core:new THREE.MeshBasicMaterial({color:0xff5149,transparent:true,opacity:.99,depthTest:false,depthWrite:false,toneMapped:false,side:THREE.DoubleSide})};}
function makeChevronReticle(material,{size=.0065,z=0}={}){
  const s=Math.max(.002,Number(size)||.0065),shape=new THREE.Shape();shape.moveTo(-s,-s*.42);shape.lineTo(0,s*.38);shape.lineTo(s,-s*.42);shape.lineTo(s*.64,-s*.42);shape.lineTo(0,s*.04);shape.lineTo(-s*.64,-s*.42);shape.closePath();const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),material);mesh.position.z=z;return mesh;
}
function makeRedDotAttachment({sightY=.15,z=-.18,mountY=.12,eyeZ=-.38}={}){
  const g=new THREE.Group(),mat=attachmentVisualMaterial(0x14191d,.34,.44),lens=new THREE.MeshStandardMaterial({color:0x9ab8c1,roughness:.06,metalness:.05,transparent:true,opacity:.13,emissive:0x142d34,emissiveIntensity:.07,depthWrite:false,side:THREE.DoubleSide}),ret=opticReticleMaterials();
  const base=new THREE.Mesh(new THREE.BoxGeometry(.056,.014,.062),mat);base.position.set(0,mountY+.007,z+.003);const riserH=Math.max(.008,sightY-mountY-.028),riserL=new THREE.Mesh(new THREE.BoxGeometry(.009,riserH,.020),mat),riserR=riserL.clone();riserL.position.set(-.017,mountY+riserH*.5+.002,z-.002);riserR.position.set(.017,mountY+riserH*.5+.002,z-.002);
  const frameW=.006,windowW=.050,windowH=.039,left=new THREE.Mesh(new THREE.BoxGeometry(frameW,windowH+.006,.012),mat),right=left.clone(),top=new THREE.Mesh(new THREE.BoxGeometry(windowW+.006,frameW,.012),mat);left.position.set(-windowW*.5,sightY,z-.014);right.position.set(windowW*.5,sightY,z-.014);top.position.set(0,sightY+windowH*.5,z-.014);
  const glass=new THREE.Mesh(new THREE.BoxGeometry(windowW-.004,windowH-.004,.003),lens);glass.position.set(0,sightY,z-.015);const dotGlow=new THREE.Mesh(new THREE.CircleGeometry(.0048,18),ret.glow),dotCore=new THREE.Mesh(new THREE.CircleGeometry(.0022,18),ret.core);dotGlow.position.set(0,sightY,z-.017);dotCore.position.set(0,sightY,z-.0167);dotGlow.renderOrder=8;dotCore.renderOrder=9;
  g.add(base,riserL,riserR,left,right,top,glass,dotGlow,dotCore);g.userData.aimPoint=dotCore;g.userData.adsPose={x:0,y:-sightY,z:Number(eyeZ)-Number(z-.015),rx:0,ry:0,rz:0};return g;
}
function makeHoloAttachment({sightY=.15,z=-.17,mountY=.12,eyeZ=-.38}={}){
  const g=new THREE.Group(),mat=attachmentVisualMaterial(0x171c20,.30,.47),lens=new THREE.MeshStandardMaterial({color:0xa5bec4,roughness:.06,metalness:.05,transparent:true,opacity:.10,emissive:0x13292e,emissiveIntensity:.05,depthWrite:false,side:THREE.DoubleSide}),ret=opticReticleMaterials();
  const base=new THREE.Mesh(new THREE.BoxGeometry(.094,.020,.094),mat);base.position.set(0,mountY+.010,z+.005);const frameW=.008,windowW=.086,windowH=.066,left=new THREE.Mesh(new THREE.BoxGeometry(frameW,windowH+.010,.016),mat),right=left.clone(),top=new THREE.Mesh(new THREE.BoxGeometry(windowW+.010,frameW,.016),mat);left.position.set(-windowW*.5,sightY,z-.020);right.position.set(windowW*.5,sightY,z-.020);top.position.set(0,sightY+windowH*.5,z-.020);
  const guardL=new THREE.Mesh(new THREE.BoxGeometry(.009,.042,.070),mat),guardR=guardL.clone();guardL.position.set(-.050,mountY+.038,z+.006);guardR.position.set(.050,mountY+.038,z+.006);guardL.rotation.z=-.09;guardR.rotation.z=.09;
  const glass=new THREE.Mesh(new THREE.BoxGeometry(windowW-.005,windowH-.005,.003),lens);glass.position.set(0,sightY,z-.022);const ringGlow=new THREE.Mesh(new THREE.RingGeometry(.0090,.0118,32),ret.glow),ring=new THREE.Mesh(new THREE.RingGeometry(.0086,.0102,32),ret.core),dot=new THREE.Mesh(new THREE.CircleGeometry(.0021,18),ret.core);for(const obj of [ringGlow,ring,dot])obj.position.set(0,sightY,z-.024);ringGlow.renderOrder=8;ring.renderOrder=9;dot.renderOrder=10;
  g.add(base,guardL,guardR,left,right,top,glass,ringGlow,ring,dot);g.userData.aimPoint=dot;g.userData.adsPose={x:0,y:-sightY,z:Number(eyeZ)-Number(z-.022),rx:0,ry:0,rz:0};return g;
}
function makeCombatOptic({sightY=.15,z=-.17,mountY=.12,eyeZ=-.38,length=.19}={}){
  const g=new THREE.Group(),mat=attachmentVisualMaterial(0x171b1e,.30,.48),innerMat=new THREE.MeshStandardMaterial({color:0x07090b,roughness:.98,metalness:.01,side:THREE.BackSide}),lensMat=new THREE.MeshStandardMaterial({color:0xb9cdd2,roughness:.05,metalness:.04,transparent:true,opacity:.09,emissive:0x102126,emissiveIntensity:.035,depthWrite:false,side:THREE.DoubleSide}),ret=opticReticleMaterials(),radius=.037;
  const railBase=new THREE.Mesh(new THREE.BoxGeometry(.070,.014,length*.68),mat);railBase.position.set(0,mountY+.007,z+.010);const footH=Math.max(.014,sightY-radius-(mountY+.014)),footA=new THREE.Mesh(new THREE.BoxGeometry(.046,footH,.032),mat),footB=footA.clone();footA.position.set(0,mountY+.014+footH*.5,z-length*.24);footB.position.set(0,mountY+.014+footH*.5,z+length*.24);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(radius*.92,radius,length,18,1,true),mat);body.rotation.x=Math.PI/2;body.position.set(0,sightY,z);const inner=new THREE.Mesh(new THREE.CylinderGeometry(radius*.72,radius*.76,length*.91,18,1,true),innerMat);inner.rotation.x=Math.PI/2;inner.position.copy(body.position);
  const objectiveRing=new THREE.Mesh(new THREE.TorusGeometry(radius*.94,.0048,8,22),mat),eyeRing=new THREE.Mesh(new THREE.TorusGeometry(radius*.82,.0045,8,22),mat);objectiveRing.position.set(0,sightY,z-length*.50);eyeRing.position.set(0,sightY,z+length*.50);const front=new THREE.Mesh(new THREE.CircleGeometry(radius*.78,22),lensMat),rear=new THREE.Mesh(new THREE.CircleGeometry(radius*.68,22),lensMat);front.position.set(0,sightY,z-length*.485);rear.position.set(0,sightY,z+length*.485);
  const topRail=new THREE.Mesh(new THREE.BoxGeometry(.030,.010,length*.33),mat);topRail.position.set(0,sightY+radius*.92,z-.018);const reticle=new THREE.Group(),chevron=makeChevronReticle(ret.core,{size:.0080}),centerDot=new THREE.Mesh(new THREE.CircleGeometry(.00135,14),ret.core);reticle.add(chevron,centerDot);for(let i=1;i<=4;i++){const tick=new THREE.Mesh(new THREE.BoxGeometry(.0060-i*.0007,.0008,.0001),ret.core);tick.position.set(0,-.008-i*.0054,0);reticle.add(tick);}reticle.position.set(0,sightY,z+length*.492);reticle.traverse(o=>{if(o.isMesh)o.renderOrder=10;});
  g.add(railBase,footA,footB,body,inner,objectiveRing,eyeRing,front,rear,topRail,reticle);g.userData.aimPoint=centerDot;g.userData.adsPose={x:0,y:-sightY,z:Number(eyeZ)-Number(z+length*.485),rx:0,ry:0,rz:0};return g;
}
function makeVariableScopeMarker({z=-.16,y=.14,radius=.052}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x394147,.28,.48),turret=new THREE.Mesh(new THREE.CylinderGeometry(.017,.017,.032,10),mat),index=new THREE.Mesh(new THREE.BoxGeometry(.010,.020,.026),mat);turret.rotation.z=Math.PI/2;turret.position.set(radius+.014,y,z);index.position.set(radius+.014,y+.024,z);g.add(turret,index);return g;}
function makeVerticalGrip({z=-.45,y=-.12}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x1a1f22,.14,.72),stem=new THREE.Mesh(new THREE.BoxGeometry(.055,.155,.065),mat),mount=new THREE.Mesh(new THREE.BoxGeometry(.070,.022,.090),mat);mount.position.set(0,y+.075,z);stem.position.set(0,y,z);stem.rotation.x=-.08;g.add(mount,stem);return g;}
function makeAngledGrip({z=-.45,y=-.105}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x20262a,.16,.68),mount=new THREE.Mesh(new THREE.BoxGeometry(.082,.020,.115),mat),wedge=new THREE.Mesh(new THREE.BoxGeometry(.070,.075,.105),mat);mount.position.set(0,y+.055,z);wedge.position.set(0,y+.005,z-.018);wedge.rotation.x=-.48;g.add(mount,wedge);return g;}
function makeBipodAttachment({z=-.60,y=-.13,scale=1}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x171c1f,.20,.56),mount=new THREE.Mesh(new THREE.BoxGeometry(.055*scale,.025*scale,.055*scale),mat),left=new THREE.Mesh(new THREE.CylinderGeometry(.008*scale,.008*scale,.20*scale,7),mat),right=left.clone();mount.position.set(0,y+.10*scale,z);left.position.set(-.050*scale,y,z);right.position.set(.050*scale,y,z);left.rotation.z=.19;right.rotation.z=-.19;left.rotation.x=right.rotation.x=.12;g.add(mount,left,right);return g;}
function makeLaserAttachment({x=.035,z=-.40,y=-.09,scale=1}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x191e21,.22,.54),green=0x39ff70,lensMat=new THREE.MeshBasicMaterial({color:green,transparent:true,opacity:1,depthWrite:false,toneMapped:false}),beamMat=new THREE.MeshBasicMaterial({color:green,transparent:true,opacity:.34,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}),coreMat=new THREE.MeshBasicMaterial({color:0xb9ffd0,transparent:true,opacity:.78,depthTest:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending}),body=new THREE.Mesh(new THREE.BoxGeometry(.055*scale,.042*scale,.105*scale),mat),lens=new THREE.Mesh(new THREE.CircleGeometry(.010*scale,12),lensMat),beam=new THREE.Mesh(new THREE.CylinderGeometry(.0024*scale,.0024*scale,1,6,1,true),beamMat),core=new THREE.Mesh(new THREE.CylinderGeometry(.0009*scale,.0009*scale,1,5,1,true),coreMat),emitter=new THREE.Vector3(x,y,z-.053*scale);body.position.set(x,y,z);lens.position.copy(emitter);beam.rotation.x=core.rotation.x=Math.PI/2;beam.renderOrder=core.renderOrder=35;beam.userData.previewSkip=true;core.userData.previewSkip=true;g.userData.laserBeam={beam,core,emitter,maxLength:24,length:24,nextRaycastAt:0};g.add(body,lens,beam,core);setLaserBeamLength(g,24);return g;}
function setLaserBeamLength(visual,length){const data=visual?.userData?.laserBeam;if(!data)return;const len=Math.max(.04,Math.min(data.maxLength||24,Number(length)||0)),emitter=data.emitter;data.length=len;for(const mesh of [data.beam,data.core]){mesh.scale.y=len;mesh.position.set(emitter.x,emitter.y,emitter.z-len*.5);}}
let laserRaycaster=null,laserWorldOrigin=null,laserWorldDirection=null,laserWorldQuaternion=null;
function updateLaserAttachmentBeam(visual,now=performance.now(),raycastInterval=0){const data=visual?.userData?.laserBeam;if(!data||!visual.visible||!worldRoot)return;if(now>=data.nextRaycastAt){laserRaycaster=laserRaycaster||new THREE.Raycaster();laserWorldOrigin=laserWorldOrigin||new THREE.Vector3();laserWorldDirection=laserWorldDirection||new THREE.Vector3();laserWorldQuaternion=laserWorldQuaternion||new THREE.Quaternion();visual.localToWorld(laserWorldOrigin.copy(data.emitter));visual.getWorldQuaternion(laserWorldQuaternion);laserWorldDirection.set(0,0,-1).applyQuaternion(laserWorldQuaternion).normalize();laserRaycaster.set(laserWorldOrigin,laserWorldDirection);laserRaycaster.near=.02;laserRaycaster.far=data.maxLength;const hit=laserRaycaster.intersectObject(worldRoot,true)[0],distance=hit?Math.max(.04,hit.distance-.012):data.maxLength;setLaserBeamLength(visual,distance);data.nextRaycastAt=now+Math.max(0,raycastInterval);}}
function updateGameplayLaserBeams(now=performance.now()){const local=[];for(const group of [pistolGroup,akimboLeftGroup,akimboRightGroup,assaultGroup,umpGroup,machineGunGroup,shotgunGroup,semiShotgunGroup,sniperGroup,rpgGroup]){const laser=group?.userData?.attachmentVisuals?.laser;if(laser?.visible&&group.visible)local.push(laser);}for(const laser of local)updateLaserAttachmentBeam(laser,now,0);for(const r of remotes.values()){if(!r||r.hp<=0)continue;if(r.weapon==='akimbo1887'){for(const gun of [r.akimboLeft,r.akimboRight]){const laser=gun?.userData?.attachmentVisuals?.laser;if(laser?.visible&&gun.visible)updateLaserAttachmentBeam(laser,now,42);}}else{const gun=r[r.weapon],laser=gun?.userData?.attachmentVisuals?.laser;if(laser?.visible&&gun?.visible)updateLaserAttachmentBeam(laser,now,42);}}}

function makeStockAttachment({z=.40,y=-.02,width=.15}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x4c555b,.12,.70),plate=new THREE.Mesh(new THREE.BoxGeometry(width,.12,.055),mat),brace=new THREE.Mesh(new THREE.BoxGeometry(width*.55,.045,.11),mat);plate.position.set(0,y,z+.055);brace.position.set(0,y+.025,z);g.add(brace,plate);return g;}
function makeFullStockAttachment({z=.42,y=-.02,width=.16}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x424b50,.14,.66),body=new THREE.Mesh(new THREE.BoxGeometry(width,.15,.18),mat),pad=new THREE.Mesh(new THREE.BoxGeometry(width*1.04,.16,.045),attachmentVisualMaterial(0x22272a,.10,.82));body.position.set(0,y,z);body.rotation.x=-.08;pad.position.set(0,y-.008,z+.105);pad.rotation.x=-.08;g.add(body,pad);return g;}
function makeCompactStockAttachment({z=.24,y=.01,width=.10}={}){const g=new THREE.Group(),mat=attachmentVisualMaterial(0x343b40,.18,.58),brace=new THREE.Mesh(new THREE.BoxGeometry(width*.45,.045,.12),mat),pad=new THREE.Mesh(new THREE.BoxGeometry(width,.095,.035),mat);brace.position.set(0,y+.015,z);pad.position.set(0,y,z+.075);g.add(brace,pad);return g;}
function makeMagMarker({z=-.12,y=-.21,width=.11}={}){const g=new THREE.Group(),mat=new THREE.MeshStandardMaterial({color:0x808e96,roughness:.62,metalness:.22}),band=new THREE.Mesh(new THREE.BoxGeometry(width+.012,.026,.14),mat);band.position.set(0,y,z);g.add(band);return g;}
function makeFastMagBand({width=.11,depth=.13,y=.18}={}){const mat=new THREE.MeshStandardMaterial({color:0x87969f,roughness:.58,metalness:.24}),band=new THREE.Mesh(new THREE.BoxGeometry(width,.030,depth),mat);band.position.set(0,y,0);band.visible=false;return band;}
function setupWeaponAttachmentVisuals(group,weapon,opts={}){
  if(!group)return;const flash=opts.flash||null,muzzle=opts.muzzle?{x:Number(opts.muzzle.x)||0,y:Number(opts.muzzle.y)||0,z:Number(opts.muzzle.z)||0}:flash?{x:flash.position.x,y:flash.position.y,z:flash.position.z}:null;
  group.userData.attachmentWeapon=weapon;group.userData.attachmentFlash=flash;group.userData.attachmentBaseFlash=flash?flash.position.clone():null;group.userData.attachmentMuzzle=muzzle;group.userData.attachmentMagazine=opts.mag||null;if(opts.mag)group.userData.attachmentMagazineBaseScale=opts.mag.scale.clone();
  if(opts.barrelMesh){const mesh=opts.barrelMesh,length=Math.max(.001,Number(mesh.geometry?.parameters?.height)||.1),baseScale=mesh.scale.clone(),basePosition=mesh.position.clone(),worldLength=length*baseScale.y,rearZ=basePosition.z+worldLength*.5;group.userData.attachmentBarrel={mesh,baseScale,basePosition,baseLength:worldLength,rearZ,baseFrontZ:rearZ-worldLength};}
  group.userData.attachmentStockBaseParts=(opts.stockBaseParts||[]).filter(Boolean);group.userData.attachmentBipodBaseParts=(opts.bipodBaseParts||[]).filter(Boolean);
  if(opts.redDot)registerAttachmentVisual(group,'redDot',makeRedDotAttachment(opts.redDot));if(opts.holoSight)registerAttachmentVisual(group,'holoSight',makeHoloAttachment(opts.holoSight));if(opts.combatOptic)registerAttachmentVisual(group,'combatOptic',makeCombatOptic(opts.combatOptic));if(opts.variableScope)registerAttachmentVisual(group,'variableScope',makeVariableScopeMarker(opts.variableScope));
  if(opts.suppressor&&muzzle)registerAttachmentVisual(group,'suppressor',makeMuzzleAttachment({...opts.suppressor,muzzle,ported:false}));if(opts.compensator&&muzzle)registerAttachmentVisual(group,'compensator',makeMuzzleAttachment({...opts.compensator,muzzle,ported:true}));if(opts.shotgunChoke&&muzzle)registerAttachmentVisual(group,'shotgunChoke',makeMuzzleAttachment({...opts.shotgunChoke,muzzle,ported:false}));
  if(opts.verticalGrip)registerAttachmentVisual(group,'verticalGrip',makeVerticalGrip(opts.verticalGrip));if(opts.angledGrip)registerAttachmentVisual(group,'angledGrip',makeAngledGrip(opts.angledGrip));if(opts.bipod&&!group.userData.attachmentBipodBaseParts.length)registerAttachmentVisual(group,'bipod',makeBipodAttachment(opts.bipod));if(opts.laser)registerAttachmentVisual(group,'laser',makeLaserAttachment(opts.laser));
  if(opts.lightweightStock)registerAttachmentVisual(group,'lightweightStock',makeStockAttachment(opts.lightweightStock));if(opts.fullStock)registerAttachmentVisual(group,'fullStock',makeFullStockAttachment(opts.fullStock));if(opts.compactStock)registerAttachmentVisual(group,'compactStock',makeCompactStockAttachment(opts.compactStock));
  if(opts.fastMag){if(opts.mag){const band=makeFastMagBand(opts.fastMag);group.userData.attachmentVisuals=group.userData.attachmentVisuals||{};group.userData.attachmentVisuals.fastMag=band;opts.mag.add(band);}else registerAttachmentVisual(group,'fastMag',makeMagMarker(opts.fastMag));}if(opts.extendedMag&&!opts.mag)registerAttachmentVisual(group,'extendedMag',makeMagMarker(opts.extendedMag));
}
function syncWeaponAttachmentVisuals(group,weapon,attachments){
  if(!group)return;const normalized=normalizeWeaponAttachments(weapon,attachments),visuals=group.userData.attachmentVisuals||{};for(const [id,obj] of Object.entries(visuals))obj.visible=weaponHasAttachment(weapon,normalized,id);
  const opticId=String(normalized.optic||'');for(const part of group.userData.ironSightParts||[])part.visible=!opticId;
  const mag=group.userData.attachmentMagazine,baseScale=group.userData.attachmentMagazineBaseScale;if(mag&&baseScale){mag.scale.copy(baseScale);if(weaponHasAttachment(weapon,normalized,'extendedMag'))mag.scale.y*=weapon==='machineGun'?1.14:1.20;}const fast=visuals.fastMag;if(fast)fast.visible=weaponHasAttachment(weapon,normalized,'fastMag');
  for(const part of group.userData.attachmentStockBaseParts||[])part.visible=!weaponHasAttachment(weapon,normalized,'compactStock');for(const part of group.userData.attachmentBipodBaseParts||[])part.visible=weaponHasAttachment(weapon,normalized,'bipod');
  let muzzleDeltaZ=0;const barrel=group.userData.attachmentBarrel;if(barrel?.mesh){let lengthScale=1,thickness=1;if(weaponHasAttachment(weapon,normalized,'heavyBarrel')){lengthScale=1.16;thickness=1.16;}else if(weaponHasAttachment(weapon,normalized,'shortBarrel')){lengthScale=.76;thickness=.94;}else if(weaponHasAttachment(weapon,normalized,'shotgunLongBarrel')){lengthScale=1.20;thickness=1.06;}barrel.mesh.scale.copy(barrel.baseScale);barrel.mesh.scale.y*=lengthScale;barrel.mesh.scale.x*=thickness;barrel.mesh.scale.z*=thickness;barrel.mesh.position.copy(barrel.basePosition);const newLength=barrel.baseLength*lengthScale,newFront=barrel.rearZ-newLength;barrel.mesh.position.z=barrel.rearZ-newLength*.5;muzzleDeltaZ=newFront-barrel.baseFrontZ;}
  for(const id of ['suppressor','compensator','shotgunChoke'])if(visuals[id])visuals[id].position.z=muzzleDeltaZ;
  const flash=group.userData.attachmentFlash,baseFlash=group.userData.attachmentBaseFlash;if(flash&&baseFlash){flash.position.copy(baseFlash);flash.position.z+=muzzleDeltaZ;const activeMuzzleId=weaponHasAttachment(weapon,normalized,'suppressor')?'suppressor':weaponHasAttachment(weapon,normalized,'compensator')?'compensator':weaponHasAttachment(weapon,normalized,'shotgunChoke')?'shotgunChoke':'';const visual=activeMuzzleId?visuals[activeMuzzleId]:null,tip=visual?.userData?.muzzleTip;if(tip){flash.position.copy(tip);flash.position.add(visual.position);}}
}
function syncLocalAttachmentVisuals(){
  const loadout=selectedLoadout();for(const weapon of WEAPON_ORDER){const attachments=attachmentsForWeapon(weapon,loadout);if(weapon==='akimbo1887'){for(const group of [akimboLeftGroup,akimboRightGroup])if(group)syncWeaponAttachmentVisuals(group,weapon,attachments);continue;}const group=activeFirstPersonWeaponGroup(weapon);if(group)syncWeaponAttachmentVisuals(group,weapon,attachments);}
}
function addViewAnchor(root,key,parent,position,rotation=[0,0,0]){
  const anchor=new THREE.Object3D(),host=parent||root;anchor.position.set(position[0],position[1],position[2]);anchor.rotation.set(rotation[0]||0,rotation[1]||0,rotation[2]||0);host.add(anchor);root.userData[key]=anchor;return anchor;
}
function registerWeaponHandAnchors(root,{right,left,reloadLeft,reloadRight}={}){
  if(right)addViewAnchor(root,'fpRightGrip',right.parent||root,right.position,right.rotation);
  if(left)addViewAnchor(root,'fpLeftGrip',left.parent||root,left.position,left.rotation);
  if(reloadLeft)addViewAnchor(root,'fpReloadLeft',reloadLeft.parent||root,reloadLeft.position,reloadLeft.rotation);
  if(reloadRight)addViewAnchor(root,'fpReloadRight',reloadRight.parent||root,reloadRight.position,reloadRight.rotation);
}
function activeFirstPersonWeaponGroup(weapon=currentWeapon){
  return weapon==='pistol'?pistolGroup:weapon==='akimbo1887'?null:weapon==='assault'?assaultGroup:weapon==='ump'?umpGroup:weapon==='machineGun'?machineGunGroup:weapon==='shotgun'?shotgunGroup:weapon==='semiShotgun'?semiShotgunGroup:weapon==='sniper'?sniperGroup:weapon==='grenadeLauncher'?grenadeLauncherGroup:weapon==='rpg'?rpgGroup:null;
}
function cloneLoadoutPreviewNode(source){
  // Preview only the geometry that is actually active. Hidden attachment meshes
  // must not affect weapon framing or the preview bounding box.
  if(!source||source.visible===false||source.userData?.previewSkip)return null;let clone;if(source.isMesh){clone=new THREE.Mesh(source.geometry,source.material);clone.castShadow=false;clone.receiveShadow=false;}else clone=new THREE.Group();clone.position.copy(source.position);clone.quaternion.copy(source.quaternion);clone.scale.copy(source.scale);clone.visible=true;clone.renderOrder=source.renderOrder||0;for(const child of source.children||[]){const copy=cloneLoadoutPreviewNode(child);if(copy)clone.add(copy);}return clone;
}
function loadoutPreviewSightPoint(source,weapon,attachments){
  if(!source)return null;const normalized=normalizeWeaponAttachments(weapon,attachments),opticId=String(normalized.optic||''),optic=opticId?source.userData?.attachmentVisuals?.[opticId]:null,aim=optic?.userData?.aimPoint;if(aim?.getWorldPosition){source.updateWorldMatrix(true,true);aim.updateWorldMatrix(true,false);const p=new THREE.Vector3();aim.getWorldPosition(p);return source.worldToLocal(p);}const rear=source.userData?.adsSightRear;if(rear)return new THREE.Vector3(Number(rear.x)||0,Number(rear.y)||0,Number(rear.z)||0);if(weapon==='sniper')return new THREE.Vector3(0,.14,.05);return null;
}
function loadoutPreviewNodePoint(source,node){if(!source||!node?.getWorldPosition)return null;source.updateWorldMatrix(true,true);node.updateWorldMatrix(true,false);const p=new THREE.Vector3();node.getWorldPosition(p);return source.worldToLocal(p);}
function loadoutPreviewCalloutPoints(source,weapon,attachments){
  if(!source)return{};const normalized=normalizeWeaponAttachments(weapon,attachments),visuals=source.userData?.attachmentVisuals||{},points={},opticId=String(normalized.optic||''),optic=opticId?visuals[opticId]:null,opticAim=optic?.userData?.aimPoint;
  points.optic=loadoutPreviewNodePoint(source,opticAim||optic)||(()=>{const rear=source.userData?.adsSightRear;return rear?new THREE.Vector3(Number(rear.x)||0,Number(rear.y)||0,Number(rear.z)||0):null;})();
  points.muzzle=loadoutPreviewNodePoint(source,source.userData?.attachmentFlash)||(()=>{const m=source.userData?.attachmentMuzzle;return m?new THREE.Vector3(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0):null;})();
  points.barrel=loadoutPreviewNodePoint(source,source.userData?.attachmentBarrel?.mesh);
  points.magazine=loadoutPreviewNodePoint(source,source.userData?.attachmentMagazine);
  const underId=String(normalized.underbarrel||''),under=underId?visuals[underId]:null;points.underbarrel=loadoutPreviewNodePoint(source,under)||loadoutPreviewNodePoint(source,source.userData?.fpLeftGrip);
  const stockId=String(normalized.stock||''),stock=stockId?visuals[stockId]:null,stockBase=(source.userData?.attachmentStockBaseParts||[])[0];points.stock=loadoutPreviewNodePoint(source,stock)||loadoutPreviewNodePoint(source,stockBase)||loadoutPreviewNodePoint(source,source.userData?.fpRightGrip);
  return Object.fromEntries(Object.entries(points).filter(([,v])=>v));
}
function buildLoadoutPreviewModel(weapon,attachments){
  const root=new THREE.Group(),referenceRoot=new THREE.Group(),sources=weapon==='akimbo1887'?[akimboLeftGroup,akimboRightGroup]:[activeFirstPersonWeaponGroup(weapon)].filter(Boolean);if(!sources.length)return root;let sightPoint=null,calloutPoints={};
  const appendVisibleSource=(target,source)=>{const copy=new THREE.Group();for(const child of source?.children||[]){const node=cloneLoadoutPreviewNode(child);if(node)copy.add(node);}target.add(copy);};
  const poseAkimbo=target=>{if(weapon==='akimbo1887'&&target.children.length>=2){target.children[0].position.x=-.19;target.children[0].rotation.y=.08;target.children[1].position.x=.19;target.children[1].rotation.y=-.08;}};
  const changed=[];for(const source of sources){if(source?.userData?.attachmentWeapon){syncWeaponAttachmentVisuals(source,weapon,attachments);changed.push(source);}if(sources.length===1){if(!sightPoint)sightPoint=loadoutPreviewSightPoint(source,weapon,attachments);calloutPoints=loadoutPreviewCalloutPoints(source,weapon,attachments);}appendVisibleSource(root,source);}
  // Frame every configuration from the weapon's base silhouette. Extended mags,
  // long/heavy barrels and other dimensional attachments no longer make the
  // weapon jump in size or recenter when the player compares options.
  for(const source of changed)syncWeaponAttachmentVisuals(source,weapon,{});for(const source of sources)appendVisibleSource(referenceRoot,source);poseAkimbo(root);poseAkimbo(referenceRoot);
  // Restore the live viewmodel immediately; draft attachments belong only to the preview until saved.
  if(changed.length)syncLocalAttachmentVisuals();
  const frameRoot=referenceRoot.children.length?referenceRoot:root,box=new THREE.Box3().setFromObject(frameRoot),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3()),maxDim=Math.max(.01,size.x,size.y,size.z),scale=2.16/maxDim;root.position.sub(center);const wrapper=new THREE.Group();wrapper.add(root);wrapper.scale.setScalar(scale);if(sightPoint)wrapper.userData.adsPoint=sightPoint.sub(center).multiplyScalar(scale);wrapper.userData.calloutPoints={};for(const [slot,point] of Object.entries(calloutPoints))wrapper.userData.calloutPoints[slot]=point.clone().sub(center).multiplyScalar(scale);return wrapper;
}
function adjustLoadoutPreviewAngle(ctx,horizontalDelta){
  if(!ctx)return false;const delta=Number(horizontalDelta)||0;if(!delta)return false;ctx.angle+=delta*.012;ctx.interacted=true;return true;
}
function createLoadoutPreviewContext(key,canvas){
  const previewScene=new THREE.Scene(),previewCamera=new THREE.PerspectiveCamera(28,1,.05,20),previewRenderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});previewRenderer.setPixelRatio(1);previewRenderer.outputColorSpace=THREE.SRGBColorSpace;previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;previewRenderer.toneMappingExposure=1.08;previewRenderer.setClearColor(0x000000,0);previewCamera.position.set(0,.18,4.6);previewCamera.lookAt(0,0,0);previewScene.add(new THREE.HemisphereLight(0xeaf6ff,0x29322d,2.5));const keyLight=new THREE.DirectionalLight(0xffffff,2.3);keyLight.position.set(-3,4,4);previewScene.add(keyLight);const rim=new THREE.DirectionalLight(0x9bc7da,1.1);rim.position.set(4,1,-3);previewScene.add(rim);const pivot=new THREE.Group();previewScene.add(pivot);const ctx={key,canvas,scene:previewScene,camera:previewCamera,renderer:previewRenderer,pivot,signature:'',angle:.16,dragging:false,lastX:0,interacted:false,lastRenderedAt:0,adsPreview:loadoutPreviewAdsKeys.has(key)};
  canvas.addEventListener('pointerdown',e=>{ctx.dragging=true;ctx.interacted=true;ctx.lastX=e.clientX;canvas.setPointerCapture?.(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!ctx.dragging)return;const dx=e.clientX-ctx.lastX;ctx.lastX=e.clientX;adjustLoadoutPreviewAngle(ctx,dx);});const end=e=>{ctx.dragging=false;try{canvas.releasePointerCapture?.(e.pointerId);}catch{}};canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);return ctx;
}
async function ensureLoadoutPreviewEngine(){if(engineReady)return true;return ensureThreeEngine();}
function updateLoadoutCalloutLines(key,ctx,model,w,h){const host=document.querySelector(`[data-gunsmith-callouts="${key}"]`);if(!host||!model)return;host.classList.toggle('ads-hidden',!!ctx.adsPreview);if(ctx.adsPreview)return;const svg=host.querySelector('.gunsmith-callout-lines');if(!svg)return;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);ctx.pivot.updateMatrixWorld(true);ctx.camera.updateMatrixWorld(true);const canvasRect=ctx.canvas.getBoundingClientRect(),points=model.userData?.calloutPoints||{};for(const button of host.querySelectorAll('[data-callout-slot]')){const slot=button.dataset.calloutSlot,point=points[slot],line=svg.querySelector(`[data-callout-line="${slot}"]`),dot=svg.querySelector(`[data-callout-dot="${slot}"]`);if(!point||!line){if(line)line.style.display='none';if(dot)dot.style.display='none';continue;}const projected=point.clone();ctx.pivot.localToWorld(projected);projected.project(ctx.camera);const x=(projected.x*.5+.5)*w,y=(-projected.y*.5+.5)*h,br=button.getBoundingClientRect(),bx=br.left-canvasRect.left+br.width*.5,by=br.top-canvasRect.top+br.height*.5,visible=projected.z>=-1&&projected.z<=1&&x>=-w*.15&&x<=w*1.15&&y>=-h*.2&&y<=h*1.2;line.style.display=visible?'':'none';line.setAttribute('x1',String(x));line.setAttribute('y1',String(y));line.setAttribute('x2',String(bx));line.setAttribute('y2',String(by));if(dot){dot.style.display=visible?'':'none';dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));}}
}
function updateLoadoutPreviewFrame(now,dt){
  if(!engineReady||!THREE)return;for(const [key,desired] of loadoutPreviewDesired){const canvas=document.querySelector(`[data-loadout-preview="${key}"]`);if(!canvas||!canvas.getClientRects().length||canvas.closest('[hidden]'))continue;let ctx=loadoutPreviewContexts.get(key);if(!ctx){ctx=createLoadoutPreviewContext(key,canvas);loadoutPreviewContexts.set(key,ctx);}if(ctx.signature!==desired.signature){while(ctx.pivot.children.length)ctx.pivot.remove(ctx.pivot.children[0]);const model=buildLoadoutPreviewModel(desired.weapon,desired.attachments);ctx.pivot.add(model);ctx.signature=desired.signature;}
    const w=Math.max(2,Math.round(canvas.clientWidth||2)),h=Math.max(2,Math.round(canvas.clientHeight||2));if(canvas.width!==w||canvas.height!==h)ctx.renderer.setSize(w,h,false);ctx.camera.aspect=w/h;ctx.adsPreview=loadoutPreviewAdsKeys.has(key);const model=ctx.pivot.children[0],adsPoint=model?.userData?.adsPoint;if(ctx.adsPreview){ctx.camera.fov=23;ctx.camera.position.set(0,0,3.75);ctx.pivot.rotation.set(0,0,0);ctx.pivot.position.set(-(adsPoint?.x||0),-(adsPoint?.y||0),0);}else{ctx.camera.fov=28;ctx.camera.position.set(0,.18,4.6);ctx.pivot.position.set(0,0,0);if(!ctx.dragging&&!ctx.interacted)ctx.angle+=Math.max(0,Number(dt)||0)*.10;ctx.pivot.rotation.set(-.10,Math.PI/2+ctx.angle,.02);}ctx.camera.updateProjectionMatrix();ctx.renderer.render(ctx.scene,ctx.camera);updateLoadoutCalloutLines(key,ctx,model,w,h);ctx.lastRenderedAt=now;}
}
function createFirstPersonHand(side,gloveMat){
  const root=new THREE.Group(),palm=new THREE.Mesh(new THREE.BoxGeometry(.074,.050,.096),gloveMat),knuckles=new THREE.Mesh(new THREE.BoxGeometry(.078,.032,.052),gloveMat),thumb=new THREE.Mesh(new THREE.CapsuleGeometry(.012,.035,3,6),gloveMat);
  palm.position.set(0,0,0);knuckles.position.set(0,.005,-.055);thumb.rotation.z=side*.72;thumb.rotation.x=-.34;thumb.position.set(side*.045,-.010,-.002);root.add(palm,knuckles,thumb);root.userData.side=side;return root;
}
function initFirstPersonHandRig(){
  firstPersonHands=new THREE.Group();
  const gloveMat=new THREE.MeshStandardMaterial({color:0x171b1f,roughness:.94,metalness:.02}),sleeveMat=new THREE.MeshStandardMaterial({color:0x35414a,roughness:.96,metalness:.01});
  fpLeftHand=createFirstPersonHand(-1,gloveMat);fpRightHand=createFirstPersonHand(1,gloveMat);
  fpLeftForearm=new THREE.Mesh(new THREE.CylinderGeometry(.040,.052,1,8),sleeveMat);fpRightForearm=fpLeftForearm.clone();
  fpEquipmentProp=new THREE.Mesh(new THREE.SphereGeometry(.048,9,7),new THREE.MeshStandardMaterial({color:0x4d5659,roughness:.68,metalness:.18}));fpEquipmentProp.position.set(-.004,.035,-.060);fpEquipmentProp.visible=false;fpLeftHand.add(fpEquipmentProp);
  firstPersonHands.add(fpLeftForearm,fpRightForearm,fpLeftHand,fpRightHand);camera.add(firstPersonHands);
  fpRigScratch={p0:new THREE.Vector3(),p1:new THREE.Vector3(),p2:new THREE.Vector3(),p3:new THREE.Vector3(),dir:new THREE.Vector3(),q0:new THREE.Quaternion(),q1:new THREE.Quaternion(),q2:new THREE.Quaternion(),camQ:new THREE.Quaternion(),camInvQ:new THREE.Quaternion(),camInvMatrix:new THREE.Matrix4(),unitY:new THREE.Vector3(0,1,0)};
}
function anchorPoseInCamera(anchor,outPos,outQuat){
  if(!anchor||!camera||!fpRigScratch)return false;anchor.updateWorldMatrix(true,false);outPos.setFromMatrixPosition(anchor.matrixWorld).applyMatrix4(fpRigScratch.camInvMatrix);anchor.getWorldQuaternion(outQuat);outQuat.premultiply(fpRigScratch.camInvQ);return true;
}
function reloadHandWeight(p,start=.10,end=.82,edge=.14){
  if(p<=start||p>=end)return 0;const enter=smoothstep01((p-start)/Math.max(.001,edge)),exit=1-smoothstep01((p-(end-edge))/Math.max(.001,edge));return Math.max(0,Math.min(1,enter*exit));
}
function updateForearmMesh(mesh,side,wrist){
  if(!mesh||!wrist||!fpRigScratch)return;const elbow=fpRigScratch.p3.set(side*.33,-.43,-.20),dir=fpRigScratch.dir.copy(wrist).sub(elbow),length=Math.max(.08,dir.length());dir.normalize();mesh.position.copy(elbow).add(wrist).multiplyScalar(.5);mesh.scale.set(1,length,1);mesh.quaternion.setFromUnitVectors(fpRigScratch.unitY,dir);
}
function equipmentHandTarget(now,outPos,outQuat){
  let t=0,posA=[-.17,-.17,-.54],posB=[-.205,-.185,-.68],rotA=[-.50,.18,-.28],rotB=[-.82,.14,-.34];
  if(combatAction.phase===COMBAT_ACTION.EQUIPMENT_AIM)t=smoothstep01((now-combatAction.startedAt)/120);
  else if(combatAction.phase===COMBAT_ACTION.EQUIPMENT_THROW){const start=combatAction.commitAt-EQUIPMENT_THROW_COMMIT_MS;t=smoothstep01((now-start)/Math.max(1,EQUIPMENT_THROW_COMMIT_MS));}
  else t=0;
  outPos.set(THREE.MathUtils.lerp(posA[0],posB[0],t),THREE.MathUtils.lerp(posA[1],posB[1],t),THREE.MathUtils.lerp(posA[2],posB[2],t));
  fpRigScratch.q2.setFromEuler(new THREE.Euler(THREE.MathUtils.lerp(rotA[0],rotB[0],t),THREE.MathUtils.lerp(rotA[1],rotB[1],t),THREE.MathUtils.lerp(rotA[2],rotB[2],t),'XYZ'));outQuat.copy(fpRigScratch.q2);
}
function updateFirstPersonHandRig(now,reloading,reloadP,traversalViewActive){
  if(!firstPersonHands||!fpRigScratch)return;
  const scopedHidden=sniperWeaponHiddenForScope(),alive=!!shell.inMatch&&hp>0&&!traversalViewActive&&!scopedHidden;firstPersonHands.visible=alive;if(!alive){if(fpEquipmentProp)fpEquipmentProp.visible=false;return;}
  let leftAnchor=null,rightAnchor=null,reloadLeft=null,reloadRight=null;
  if(currentWeapon==='akimbo1887'){leftAnchor=akimboLeftGroup?.userData.fpLeftGrip||null;rightAnchor=akimboRightGroup?.userData.fpRightGrip||null;reloadLeft=akimboLeftGroup?.userData.fpReloadLeft||null;reloadRight=akimboRightGroup?.userData.fpReloadRight||null;}
  else{const group=activeFirstPersonWeaponGroup(currentWeapon);leftAnchor=group?.userData.fpLeftGrip||null;rightAnchor=group?.userData.fpRightGrip||null;reloadLeft=group?.userData.fpReloadLeft||null;reloadRight=group?.userData.fpReloadRight||null;}
  if(!leftAnchor||!rightAnchor){firstPersonHands.visible=false;return;}
  camera.updateMatrixWorld(true);camera.getWorldQuaternion(fpRigScratch.camQ);fpRigScratch.camInvQ.copy(fpRigScratch.camQ).invert();fpRigScratch.camInvMatrix.copy(camera.matrixWorld).invert();
  const lp=fpRigScratch.p0,lq=fpRigScratch.q0,rp=fpRigScratch.p1,rq=fpRigScratch.q1,targetP=fpRigScratch.p2,targetQ=fpRigScratch.q2;
  anchorPoseInCamera(leftAnchor,lp,lq);anchorPoseInCamera(rightAnchor,rp,rq);
  if(reloading&&reloadLeft){let w=currentWeapon==='shotgun'?reloadHandWeight(reloadP,.06,.92,.16):currentWeapon==='machineGun'?reloadHandWeight(reloadP,.10,.84,.18):reloadHandWeight(reloadP,.12,.80,.14);if(w>0&&anchorPoseInCamera(reloadLeft,targetP,targetQ)){lp.lerp(targetP,w);lq.slerp(targetQ,w);}}
  if(reloading&&reloadRight){const w=currentWeapon==='sniper'?reloadHandWeight(reloadP,.24,.64,.10):reloadHandWeight(reloadP,.20,.68,.12);if(w>0&&anchorPoseInCamera(reloadRight,targetP,targetQ)){rp.lerp(targetP,w);rq.slerp(targetQ,w);}}
  const equipmentWeight=equipmentWeaponLower(now);if(equipmentWeight>0){equipmentHandTarget(now,targetP,targetQ);lp.lerp(targetP,equipmentWeight);lq.slerp(targetQ,equipmentWeight);}
  fpLeftHand.position.copy(lp);fpLeftHand.quaternion.copy(lq);fpRightHand.position.copy(rp);fpRightHand.quaternion.copy(rq);updateForearmMesh(fpLeftForearm,-1,lp);updateForearmMesh(fpRightForearm,1,rp);
  if(fpEquipmentProp){const show=combatAction.phase===COMBAT_ACTION.EQUIPMENT_AIM||combatAction.phase===COMBAT_ACTION.EQUIPMENT_THROW;fpEquipmentProp.visible=show;const kind=combatAction.kind||'';fpEquipmentProp.material.color.set(kind==='frag'?0x4e5745:kind==='sticky'?0x70757a:kind==='smoke'?0x59636b:0x72787b);const baseScale=kind==='flash'?.64:kind==='sticky'?.68:kind==='smoke'?.84:.80;fpEquipmentProp.scale.set(baseScale,baseScale*(kind==='flash'?1.28:kind==='sticky'?1.10:1),baseScale);}
}

function init3D(){
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9acde6);
  scene.fog = new THREE.Fog(0x9acde6, 95, 285);
  const initialView=getViewSize(); viewW=initialView.w; viewH=initialView.h;
  camera = new THREE.PerspectiveCamera(70, viewW/viewH, 0.05, 360);
  camera.rotation.order = 'YXZ';
  renderer = new THREE.WebGLRenderer({ canvas, antialias:true, powerPreference:'high-performance' });
  renderer.setPixelRatio(1);
  renderer.setSize(viewW, viewH, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  applyGraphicsQuality();
  clock = new THREE.Clock();
  initHudOverlay();

  const hemi = new THREE.HemisphereLight(0xdaf4ff, 0x52604c, 2.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.15); sun.position.set(26,38,18);sun.castShadow=!isTouch;if(!isTouch){sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.left=-125;sun.shadow.camera.right=125;sun.shadow.camera.top=125;sun.shadow.camera.bottom=-125;sun.shadow.camera.near=5;sun.shadow.camera.far=110;sun.shadow.bias=-.00035;} scene.add(sun);

  buildWorldVisuals();


  pistolGroup = new THREE.Group();
  const pistolMetal = new THREE.MeshStandardMaterial({color:0x20262c,roughness:.38,metalness:.48});
  const pistolPoly = new THREE.MeshStandardMaterial({color:0x32383d,roughness:.72,metalness:.12});
  const gripMat = new THREE.MeshStandardMaterial({color:0x47413a,roughness:.9,metalness:.04});
  const glockSlide = new THREE.Mesh(new THREE.BoxGeometry(.17,.11,.46),pistolMetal);glockSlide.position.set(0,.055,-.11);
  const glockFront = new THREE.Mesh(new THREE.BoxGeometry(.145,.095,.10),pistolMetal);glockFront.position.set(0,.047,-.39);
  const glockFrame = new THREE.Mesh(new THREE.BoxGeometry(.16,.10,.30),pistolPoly);glockFrame.position.set(0,-.005,-.05);
  const glockDust = new THREE.Mesh(new THREE.BoxGeometry(.14,.07,.15),pistolPoly);glockDust.position.set(0,-.045,-.23);
  const glockBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,.18,10),pistolMetal);glockBarrel.rotation.x=Math.PI/2;glockBarrel.position.set(0,.047,-.39);
  const triggerGuard = new THREE.Mesh(new THREE.TorusGeometry(.045,.010,5,18,Math.PI),pistolPoly);triggerGuard.rotation.y=Math.PI/2;triggerGuard.rotation.z=Math.PI;triggerGuard.position.set(0,-.085,-.03);
  const glockGrip = new THREE.Mesh(new THREE.BoxGeometry(.135,.30,.15),gripMat);glockGrip.position.set(0,-.185,.05);glockGrip.rotation.x=-.32;
  const glockBackstrap = new THREE.Mesh(new THREE.BoxGeometry(.05,.16,.11),pistolPoly);glockBackstrap.position.set(0,-.125,.13);glockBackstrap.rotation.x=-.32;
  pistolMag=new THREE.Mesh(new THREE.BoxGeometry(.090,.20,.11),pistolMetal);pistolMag.position.set(0,-.245,.045);pistolMag.rotation.x=-.32;
  pistolFlash = new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:0}));pistolFlash.position.set(0,.047,-.51);
  pistolGroup.add(glockSlide,glockFront,glockFrame,glockDust,glockBarrel,triggerGuard,glockGrip,glockBackstrap,pistolMag,pistolFlash);pistolGroup.userData.cyclePart=glockSlide;pistolGroup.userData.cycleBaseZ=-.11;pistolGroup.userData.cycleTravel=.075;addPistolIronSights(pistolGroup,pistolMetal,{rearZ:.08,frontZ:-.31,sightY:.140,rearMountY:.112,frontMountY:.112,eyeZ:-.46});registerWeaponHandAnchors(pistolGroup,{right:{position:[.035,-.16,.055],rotation:[-.30,-.04,.04]},left:{position:[-.045,-.105,-.015],rotation:[-.34,.10,.20]},reloadLeft:{parent:pistolMag,position:[-.035,-.02,.01],rotation:[-.18,.08,.18]}});pistolGroup.position.set(.33,-.25,-.67);pistolGroup.rotation.set(-.08,-.08,0);

  const buildAkimbo1887=(side)=>{
    const g=new THREE.Group(),metal=new THREE.MeshStandardMaterial({color:0x24282b,roughness:.40,metalness:.46}),wood=new THREE.MeshStandardMaterial({color:0x684933,roughness:.84}),leverMat=new THREE.MeshStandardMaterial({color:0x34383b,roughness:.36,metalness:.44});
    const receiver=new THREE.Mesh(new THREE.BoxGeometry(.15,.14,.36),metal);receiver.position.set(0,.02,-.16);
    const tang=new THREE.Mesh(new THREE.BoxGeometry(.06,.05,.16),metal);tang.position.set(0,.06,.05);
    const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.022,.022,1.02,10),metal);barrel.rotation.x=Math.PI/2;barrel.position.set(0,.04,-.70);
    const tube=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.88,9),metal);tube.rotation.x=Math.PI/2;tube.position.set(0,-.012,-.66);
    const forearm=new THREE.Mesh(new THREE.BoxGeometry(.12,.095,.32),wood);forearm.position.set(0,-.005,-.43);forearm.rotation.x=-.03;
    const grip=new THREE.Mesh(new THREE.BoxGeometry(.12,.22,.12),wood);grip.position.set(0,-.13,.05);grip.rotation.x=-.34;
    const stock=new THREE.Mesh(new THREE.BoxGeometry(.11,.14,.38),wood);stock.position.set(0,-.005,.22);stock.rotation.x=-.12;
    const butt=new THREE.Mesh(new THREE.BoxGeometry(.12,.16,.08),wood);butt.position.set(0,-.03,.42);butt.rotation.x=-.12;
    const lever=new THREE.Mesh(new THREE.TorusGeometry(.072,.011,6,22),leverMat);lever.rotation.x=Math.PI/2;lever.scale.set(1,.68,1);lever.position.set(0,-.11,.00);
    const hammer=new THREE.Mesh(new THREE.BoxGeometry(.040,.045,.07),metal);hammer.position.set(0,.08,.07);hammer.rotation.x=-.30;
    const flash=new THREE.Mesh(new THREE.SphereGeometry(.082,8,6),new THREE.MeshBasicMaterial({color:0xffcf79,transparent:true,opacity:0}));flash.position.set(0,.04,-1.24);
    g.add(receiver,tang,barrel,tube,forearm,grip,stock,butt,lever,hammer,flash);g.userData.akimboSide=side;return{group:g,flash,lever,barrel,stock};
  };
  ({group:akimboLeftGroup,flash:akimboLeftFlash,lever:akimboLeftLever,barrel:akimboLeftBarrel,stock:akimboLeftStock}=buildAkimbo1887('left'));({group:akimboRightGroup,flash:akimboRightFlash,lever:akimboRightLever,barrel:akimboRightBarrel,stock:akimboRightStock}=buildAkimbo1887('right'));
  registerWeaponHandAnchors(akimboLeftGroup,{left:{position:[0,-.12,.055],rotation:[-.32,.05,-.06]},reloadLeft:{position:[0,-.16,.075],rotation:[-.20,.02,-.08]}});registerWeaponHandAnchors(akimboRightGroup,{right:{position:[0,-.12,.055],rotation:[-.32,-.05,.06]},reloadRight:{position:[0,-.16,.075],rotation:[-.20,-.02,.08]}});akimboLeftGroup.position.set(-.40,-.32,-.72);akimboLeftGroup.rotation.set(-.08,.18,-.035);akimboLeftGroup.visible=false;
  akimboRightGroup.position.set(.40,-.32,-.72);akimboRightGroup.rotation.set(-.08,-.18,.035);akimboRightGroup.visible=false;

  assaultGroup = new THREE.Group();
  const arMat = new THREE.MeshStandardMaterial({color:0x23292f,roughness:.40,metalness:.42});
  const arAccent = new THREE.MeshStandardMaterial({color:0x61574a,roughness:.74,metalness:.08});
  const scarUpper = new THREE.Mesh(new THREE.BoxGeometry(.18,.11,.40),arMat);scarUpper.position.set(0,.05,-.24);
  const scarLower = new THREE.Mesh(new THREE.BoxGeometry(.17,.10,.30),arMat);scarLower.position.set(0,-.03,-.10);
  const scarRail = new THREE.Mesh(new THREE.BoxGeometry(.09,.03,.72),new THREE.MeshStandardMaterial({color:0x4a5158,roughness:.55,metalness:.30}));scarRail.position.set(0,.115,-.34);
  const scarHandguard = new THREE.Mesh(new THREE.BoxGeometry(.16,.11,.36),new THREE.MeshStandardMaterial({color:0x7a6e5a,roughness:.82,metalness:.05}));scarHandguard.position.set(0,.015,-.56);
  const arBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.021,.021,.54,10),arMat);arBarrel.rotation.x=Math.PI/2;arBarrel.position.set(0,.02,-.92);
  const scarStockStem = new THREE.Mesh(new THREE.BoxGeometry(.045,.055,.22),arMat);scarStockStem.position.set(0,-.01,.22);scarStockStem.rotation.x=-.10;
  const scarStock = new THREE.Mesh(new THREE.BoxGeometry(.15,.14,.18),arAccent);scarStock.position.set(0,-.01,.40);scarStock.rotation.x=-.10;
  const scarGrip = new THREE.Mesh(new THREE.BoxGeometry(.11,.23,.12),arMat);scarGrip.position.set(0,-.17,.01);scarGrip.rotation.x=-.26;
  const scarBolt=new THREE.Mesh(new THREE.BoxGeometry(.018,.035,.12),new THREE.MeshStandardMaterial({color:0x11161a,roughness:.28,metalness:.62}));scarBolt.position.set(.095,.055,-.21);
  assaultMag = new THREE.Mesh(new THREE.BoxGeometry(.11,.29,.16),new THREE.MeshStandardMaterial({color:0x676f75,roughness:.62,metalness:.18}));assaultMag.position.set(0,-.19,-.15);assaultMag.rotation.x=.16;
  assaultFlash = new THREE.Mesh(new THREE.SphereGeometry(.074,8,6),new THREE.MeshBasicMaterial({color:0xffd98d,transparent:true,opacity:0}));assaultFlash.position.set(0,.02,-1.20);
  assaultGroup.add(scarUpper,scarLower,scarRail,scarHandguard,arBarrel,scarStockStem,scarStock,scarGrip,scarBolt,assaultMag,assaultFlash);assaultGroup.userData.cyclePart=scarBolt;assaultGroup.userData.cycleBaseZ=-.21;assaultGroup.userData.cycleTravel=.055;addApertureIronSights(assaultGroup,scarRail.material,{rearZ:.05,frontZ:-.66,sightY:.165,rearMountY:.132,frontMountY:.132,rearRadius:.021,postWidth:.0065,frontEarGap:.019,eyeZ:-.40});registerWeaponHandAnchors(assaultGroup,{right:{position:[.025,-.145,.025],rotation:[-.28,-.03,.05]},left:{position:[-.025,-.045,-.51],rotation:[-.18,.05,.02]},reloadLeft:{parent:assaultMag,position:[-.04,.02,.015],rotation:[-.12,.06,.16]}});assaultGroup.position.set(.30,-.27,-.52);assaultGroup.rotation.set(-.06,-.055,0);assaultGroup.visible=false;

  umpGroup = new THREE.Group();
  const umpMat=new THREE.MeshStandardMaterial({color:0x1f252a,roughness:.42,metalness:.34}),umpAccent=new THREE.MeshStandardMaterial({color:0x3f464b,roughness:.68,metalness:.12}),polyBlack=new THREE.MeshStandardMaterial({color:0x22272c,roughness:.84,metalness:.04});
  const umpReceiver=new THREE.Mesh(new THREE.BoxGeometry(.18,.18,.38),umpMat);umpReceiver.position.set(0,.04,-.12);
  const umpLower=new THREE.Mesh(new THREE.BoxGeometry(.17,.12,.24),polyBlack);umpLower.position.set(0,-.03,-.02);
  const umpHandguard=new THREE.Mesh(new THREE.BoxGeometry(.15,.11,.22),polyBlack);umpHandguard.position.set(0,.00,-.42);
  const umpTop=new THREE.Mesh(new THREE.BoxGeometry(.08,.025,.50),umpAccent);umpTop.position.set(0,.112,-.22);
  const umpBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.020,.020,.24,9),umpMat);umpBarrel.rotation.x=Math.PI/2;umpBarrel.position.set(0,.02,-.63);
  const umpGrip=new THREE.Mesh(new THREE.BoxGeometry(.11,.22,.12),polyBlack);umpGrip.position.set(0,-.17,.03);umpGrip.rotation.x=-.28;
  const umpStockRodL=new THREE.Mesh(new THREE.BoxGeometry(.02,.02,.23),umpAccent);umpStockRodL.position.set(-.035,.045,.12);
  const umpStockRodR=umpStockRodL.clone();umpStockRodR.position.x=.035;
  const umpButt=new THREE.Mesh(new THREE.BoxGeometry(.12,.11,.06),umpAccent);umpButt.position.set(0,.03,.26);
  const umpBolt=new THREE.Mesh(new THREE.BoxGeometry(.016,.032,.10),new THREE.MeshStandardMaterial({color:0x12171b,roughness:.30,metalness:.58}));umpBolt.position.set(.095,.045,-.13);
  umpMag=new THREE.Mesh(new THREE.BoxGeometry(.10,.31,.12),polyBlack);umpMag.position.set(0,-.20,-.12);umpMag.rotation.x=.08;
  umpFlash=new THREE.Mesh(new THREE.SphereGeometry(.072,8,6),new THREE.MeshBasicMaterial({color:0xffd994,transparent:true,opacity:0}));umpFlash.position.set(0,.02,-.77);
  umpGroup.add(umpReceiver,umpLower,umpHandguard,umpTop,umpBarrel,umpGrip,umpStockRodL,umpStockRodR,umpButt,umpBolt,umpMag,umpFlash);umpGroup.userData.cyclePart=umpBolt;umpGroup.userData.cycleBaseZ=-.13;umpGroup.userData.cycleTravel=.050;addApertureIronSights(umpGroup,umpAccent,{rearZ:.00,frontZ:-.46,sightY:.155,rearMountY:.126,frontMountY:.126,rearRadius:.020,postWidth:.0063,frontEarGap:.018,eyeZ:-.46});registerWeaponHandAnchors(umpGroup,{right:{position:[.022,-.145,.035],rotation:[-.30,-.03,.05]},left:{position:[-.025,-.045,-.38],rotation:[-.18,.05,.02]},reloadLeft:{parent:umpMag,position:[-.035,.02,.01],rotation:[-.12,.06,.15]}});umpGroup.position.set(.30,-.27,-.54);umpGroup.rotation.set(-.06,-.05,0);umpGroup.visible=false;

  machineGunGroup = new THREE.Group();
  const mgMat=new THREE.MeshStandardMaterial({color:0x252b2e,roughness:.44,metalness:.42}),mgAccent=new THREE.MeshStandardMaterial({color:0x596053,roughness:.76,metalness:.08}),mgDark=new THREE.MeshStandardMaterial({color:0x161b1e,roughness:.52,metalness:.34});
  const mgReceiver=new THREE.Mesh(new THREE.BoxGeometry(.22,.16,.54),mgMat);mgReceiver.position.set(0,.03,-.18);
  const mgTopCover=new THREE.Mesh(new THREE.BoxGeometry(.18,.035,.42),mgDark);mgTopCover.position.set(0,.128,-.20);
  const mgFeedTray=new THREE.Mesh(new THREE.BoxGeometry(.12,.024,.18),mgDark);mgFeedTray.position.set(0,.142,-.17);
  const mgHandguard=new THREE.Mesh(new THREE.BoxGeometry(.18,.12,.42),mgAccent);mgHandguard.position.set(0,.00,-.62);
  const mgBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.023,.023,.72,10),mgMat);mgBarrel.rotation.x=Math.PI/2;mgBarrel.position.set(0,.025,-1.00);
  const mgGasTube=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.48,9),mgDark);mgGasTube.rotation.x=Math.PI/2;mgGasTube.position.set(0,.058,-.82);
  const mgStock=new THREE.Mesh(new THREE.BoxGeometry(.18,.19,.38),mgAccent);mgStock.position.set(0,-.02,.34);mgStock.rotation.x=-.08;
  const mgGrip=new THREE.Mesh(new THREE.BoxGeometry(.11,.25,.13),mgDark);mgGrip.position.set(0,-.17,.02);mgGrip.rotation.x=-.25;
  machineGunBox=new THREE.Mesh(new THREE.BoxGeometry(.20,.28,.22),mgAccent);machineGunBox.position.set(-.045,-.19,-.18);machineGunBox.rotation.z=.03;
  machineGunBolt=new THREE.Mesh(new THREE.BoxGeometry(.020,.040,.14),new THREE.MeshStandardMaterial({color:0x0f1417,roughness:.26,metalness:.66}));machineGunBolt.position.set(.122,.052,-.18);
  const mgBipodMount=new THREE.Mesh(new THREE.BoxGeometry(.050,.024,.050),mgDark);mgBipodMount.position.set(0,-.020,-.71);
  const mgBipodL=new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,.20,7),mgDark);mgBipodL.position.set(-.050,-.095,-.71);mgBipodL.rotation.z=.18;mgBipodL.rotation.x=.12;
  const mgBipodR=mgBipodL.clone();mgBipodR.position.x=.050;mgBipodR.rotation.z=-.18;
  machineGunFlash=new THREE.Mesh(new THREE.SphereGeometry(.080,8,6),new THREE.MeshBasicMaterial({color:0xffd98d,transparent:true,opacity:0}));machineGunFlash.position.set(0,.025,-1.38);
  machineGunGroup.add(mgReceiver,mgTopCover,mgFeedTray,mgHandguard,mgBarrel,mgGasTube,mgStock,mgGrip,machineGunBox,machineGunBolt,mgBipodMount,mgBipodL,mgBipodR,machineGunFlash);machineGunGroup.userData.cyclePart=machineGunBolt;machineGunGroup.userData.cycleBaseZ=-.18;machineGunGroup.userData.cycleTravel=.060;addApertureIronSights(machineGunGroup,mgDark,{rearZ:.02,frontZ:-.80,sightY:.171,rearMountY:.136,frontMountY:.106,rearRadius:.022,postWidth:.007,frontEarGap:.021,eyeZ:-.42});registerWeaponHandAnchors(machineGunGroup,{right:{position:[.028,-.155,.025],rotation:[-.28,-.03,.05]},left:{position:[-.035,-.055,-.58],rotation:[-.16,.04,.02]},reloadLeft:{parent:machineGunBox,position:[-.055,.015,.015],rotation:[-.08,.08,.20]}});machineGunGroup.position.set(.30,-.29,-.55);machineGunGroup.rotation.set(-.06,-.05,0);machineGunGroup.visible=false;

  shotgunGroup = new THREE.Group();
  const sgMat=new THREE.MeshStandardMaterial({color:0x2b3135,roughness:.48,metalness:.30});
  const sgWood=new THREE.MeshStandardMaterial({color:0x5a4636,roughness:.82});
  const sgReceiver=new THREE.Mesh(new THREE.BoxGeometry(.17,.14,.36),sgMat);sgReceiver.position.set(0,.02,-.14);
  const sgBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,1.00,10),sgMat);sgBarrel.rotation.x=Math.PI/2;sgBarrel.position.set(0,.035,-.72);
  const sgTube=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.80,9),sgMat);sgTube.rotation.x=Math.PI/2;sgTube.position.set(0,-.02,-.64);
  const sgStock=new THREE.Mesh(new THREE.BoxGeometry(.12,.16,.42),sgWood);sgStock.position.set(0,-.01,.22);sgStock.rotation.x=-.12;
  const sgGrip=new THREE.Mesh(new THREE.BoxGeometry(.12,.21,.12),sgWood);sgGrip.position.set(0,-.13,.05);sgGrip.rotation.x=-.28;
  shotgunPump=new THREE.Mesh(new THREE.BoxGeometry(.12,.10,.28),sgWood);shotgunPump.position.set(0,-.02,-.42);
  shotgunFlash=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:0xffd181,transparent:true,opacity:0}));shotgunFlash.position.set(0,.035,-1.24);
  shotgunGroup.add(sgReceiver,sgBarrel,sgTube,sgStock,sgGrip,shotgunPump,shotgunFlash);addShotgunBeadSight(shotgunGroup,sgMat,{rearZ:.02,frontZ:-1.04,sightY:.116,rearMountY:.090,frontMountY:.060,eyeZ:-.42});registerWeaponHandAnchors(shotgunGroup,{right:{position:[.025,-.125,.055],rotation:[-.26,-.03,.04]},left:{parent:shotgunPump,position:[-.025,-.015,.00],rotation:[-.12,.04,.02]},reloadLeft:{position:[-.035,-.115,-.12],rotation:[-.58,.08,.15]}});shotgunGroup.position.set(.30,-.28,-.50);shotgunGroup.rotation.set(-.06,-.05,0);shotgunGroup.visible=false;

  semiShotgunGroup = new THREE.Group();
  const sasMat=new THREE.MeshStandardMaterial({color:0x252d31,roughness:.43,metalness:.30}),sasAccent=new THREE.MeshStandardMaterial({color:0x454f45,roughness:.78,metalness:.08});
  const sasReceiver=new THREE.Mesh(new THREE.BoxGeometry(.18,.14,.42),sasMat);sasReceiver.position.set(0,.03,-.14);
  const sasHandguard=new THREE.Mesh(new THREE.BoxGeometry(.13,.10,.28),sasAccent);sasHandguard.position.set(0,-.005,-.42);
  const sasBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.024,.024,.82,10),sasMat);sasBarrel.rotation.x=Math.PI/2;sasBarrel.position.set(0,.03,-.72);
  const sasTube=new THREE.Mesh(new THREE.CylinderGeometry(.017,.017,.52,9),sasMat);sasTube.rotation.x=Math.PI/2;sasTube.position.set(0,-.015,-.56);
  const sasStock=new THREE.Mesh(new THREE.BoxGeometry(.13,.16,.34),sasAccent);sasStock.position.set(0,-.01,.20);sasStock.rotation.x=-.12;
  const sasGrip=new THREE.Mesh(new THREE.BoxGeometry(.11,.22,.12),sasMat);sasGrip.position.set(0,-.15,.00);sasGrip.rotation.x=-.25;
  const sasBolt=new THREE.Mesh(new THREE.BoxGeometry(.018,.040,.13),new THREE.MeshStandardMaterial({color:0x12171a,roughness:.28,metalness:.62}));sasBolt.position.set(.095,.045,-.16);
  semiShotgunMag=new THREE.Mesh(new THREE.BoxGeometry(.12,.18,.12),sasMat);semiShotgunMag.position.set(0,-.14,-.10);
  semiShotgunFlash=new THREE.Mesh(new THREE.SphereGeometry(.088,8,6),new THREE.MeshBasicMaterial({color:0xffd181,transparent:true,opacity:0}));semiShotgunFlash.position.set(0,.03,-1.13);
  semiShotgunGroup.add(sasReceiver,sasHandguard,sasBarrel,sasTube,sasStock,sasGrip,sasBolt,semiShotgunMag,semiShotgunFlash);semiShotgunGroup.userData.cyclePart=sasBolt;semiShotgunGroup.userData.cycleBaseZ=-.16;semiShotgunGroup.userData.cycleTravel=.070;addShotgunGhostRingSight(semiShotgunGroup,sasMat,{rearZ:.04,frontZ:-.94,sightY:.118,rearMountY:.090,frontMountY:.060,rearRadius:.017,postWidth:.006,frontEarGap:.017,eyeZ:-.40});registerWeaponHandAnchors(semiShotgunGroup,{right:{position:[.025,-.135,.015],rotation:[-.27,-.03,.04]},left:{position:[-.025,-.040,-.40],rotation:[-.14,.04,.02]},reloadLeft:{parent:semiShotgunMag,position:[-.035,.015,.01],rotation:[-.10,.07,.15]}});semiShotgunGroup.position.set(.30,-.28,-.50);semiShotgunGroup.rotation.set(-.06,-.05,0);semiShotgunGroup.visible=false;

  sniperGroup = new THREE.Group();
  const rifleMat = new THREE.MeshStandardMaterial({color:0x2f3438,roughness:.42,metalness:.40});
  const stockMat = new THREE.MeshStandardMaterial({color:0x5a5e4a,roughness:.84,metalness:.06});
  const lensMat = new THREE.MeshStandardMaterial({color:0xcfe6ef,roughness:.06,metalness:.08,transparent:true,opacity:.18,emissive:0x10252e,emissiveIntensity:.08,depthWrite:false,side:THREE.DoubleSide});
  const rearLensMat = new THREE.MeshStandardMaterial({color:0x17242b,roughness:.18,metalness:.12,transparent:true,opacity:.58,emissive:0x081218,emissiveIntensity:.10,depthWrite:true,side:THREE.DoubleSide});
  const dragReceiver = new THREE.Mesh(new THREE.BoxGeometry(.16,.12,.46),rifleMat);dragReceiver.position.set(0,.04,-.18);
  const dragHandguard = new THREE.Mesh(new THREE.BoxGeometry(.13,.10,.36),stockMat);dragHandguard.position.set(0,-.005,-.52);
  const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.020,.020,.84,10),rifleMat);rifleBarrel.rotation.x=Math.PI/2;rifleBarrel.position.set(0,.025,-.82);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(.13,.17,.42),stockMat);stock.position.set(0,-.01,.23);stock.rotation.x=-.12;
  const stockComb = new THREE.Mesh(new THREE.BoxGeometry(.11,.06,.22),stockMat);stockComb.position.set(0,.06,.20);stockComb.rotation.x=-.12;
  const sniperMag=new THREE.Mesh(new THREE.BoxGeometry(.095,.16,.12),rifleMat);sniperMag.position.set(0,-.075,-.16);sniperMag.rotation.x=.10;
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(.048,.048,.42,18,1,true),rifleMat);scope.rotation.x=Math.PI/2;scope.position.set(0,.14,-.16);
  const scopeInner=new THREE.Mesh(new THREE.CylinderGeometry(.039,.039,.39,18,1,true),new THREE.MeshStandardMaterial({color:0x090c10,roughness:.96,metalness:.02,side:THREE.BackSide}));scopeInner.rotation.x=Math.PI/2;scopeInner.position.copy(scope.position);
  const scopeFrontRing=new THREE.Mesh(new THREE.TorusGeometry(.043,.0055,8,20),rifleMat);scopeFrontRing.position.set(0,.14,-.37);
  const scopeRearRing=new THREE.Mesh(new THREE.TorusGeometry(.043,.0055,8,20),rifleMat);scopeRearRing.position.set(0,.14,.05);
  const scopeFrontLens = new THREE.Mesh(new THREE.CircleGeometry(.0405,24),lensMat);scopeFrontLens.position.set(0,.14,-.366);
  const scopeRearLens = new THREE.Mesh(new THREE.CircleGeometry(.0405,28),rearLensMat);scopeRearLens.position.set(0,.14,.046);
  // Low rail feet stay entirely below the optical bore. The old .055-high
  // blocks rose into the line of sight and were the rectangular obstruction
  // visible through both the rear and front of the scope.
  const scopeMountRear=new THREE.Mesh(new THREE.BoxGeometry(.065,.014,.032),rifleMat);scopeMountRear.position.set(0,.085,-.02);
  const scopeMountFront=new THREE.Mesh(new THREE.BoxGeometry(.065,.014,.032),rifleMat);scopeMountFront.position.set(0,.085,-.27);
  const scopeShade=new THREE.Mesh(new THREE.CylinderGeometry(.051,.051,.035,18,1,true),rifleMat);scopeShade.rotation.x=Math.PI/2;scopeShade.position.set(0,.14,-.39);
  sniperBolt=new THREE.Mesh(new THREE.BoxGeometry(.050,.050,.16),rifleMat);sniperBolt.position.set(.10,.065,-.06);
  sniperFlash = new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),new THREE.MeshBasicMaterial({color:0xffe6a6,transparent:true,opacity:0}));sniperFlash.position.set(0,.025,-1.24);
  sniperGroup.add(dragReceiver,dragHandguard,rifleBarrel,stock,stockComb,sniperMag,scopeMountRear,scopeMountFront,scope,scopeInner,scopeShade,scopeFrontRing,scopeRearRing,scopeFrontLens,scopeRearLens,sniperBolt,sniperFlash);sniperGroup.userData.cyclePart=sniperBolt;sniperGroup.userData.cycleBaseZ=-.06;sniperGroup.userData.cycleTravel=.085;registerWeaponHandAnchors(sniperGroup,{right:{position:[.030,-.120,.035],rotation:[-.25,-.03,.05]},left:{position:[-.030,-.045,-.45],rotation:[-.14,.04,.02]},reloadLeft:{position:[-.035,-.125,-.08],rotation:[-.16,.08,.14]},reloadRight:{parent:sniperBolt,position:[.025,.015,.00],rotation:[-.44,-.12,.25]}});sniperGroup.position.set(.28,-.28,-.48);sniperGroup.rotation.set(-.055,-.05,0);sniperGroup.visible=false;

  grenadeLauncherGroup=new THREE.Group();
  const glMat=new THREE.MeshStandardMaterial({color:0x273126,roughness:.58,metalness:.26}),glTube=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.73,12),glMat);glTube.rotation.x=Math.PI/2;glTube.position.set(0,.01,-.40);
  const glGrip=new THREE.Mesh(new THREE.BoxGeometry(.15,.28,.18),gripMat);glGrip.position.set(0,-.20,-.10);glGrip.rotation.x=-.12;
  grenadeLauncherFlash=new THREE.Mesh(new THREE.SphereGeometry(.105,8,6),new THREE.MeshBasicMaterial({color:0xffc66f,transparent:true,opacity:0}));grenadeLauncherFlash.position.set(0,.01,-.80);
  grenadeLauncherGroup.add(glTube,glGrip,grenadeLauncherFlash);registerWeaponHandAnchors(grenadeLauncherGroup,{right:{position:[.025,-.145,-.08],rotation:[-.25,-.03,.05]},left:{position:[-.030,-.035,-.45],rotation:[-.14,.04,.02]},reloadLeft:{position:[-.035,-.10,-.31],rotation:[-.48,.10,.16]}});grenadeLauncherGroup.position.set(.30,-.28,-.48);grenadeLauncherGroup.rotation.set(-.06+GRENADE_LAUNCH_PITCH,-.05,0);grenadeLauncherGroup.visible=false;

  rpgGroup=new THREE.Group();
  const rpgMat=new THREE.MeshStandardMaterial({color:0x4a5443,roughness:.64,metalness:.18}),rpgTube=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,.95,12),rpgMat);rpgTube.rotation.x=Math.PI/2;rpgTube.position.set(0,.02,-.30);
  const rpgCone=new THREE.Mesh(new THREE.ConeGeometry(.09,.20,10),new THREE.MeshStandardMaterial({color:0x30372f,roughness:.7}));rpgCone.rotation.x=-Math.PI/2;rpgCone.position.set(0,.02,-.88);
  rpgFlash=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffc05e,transparent:true,opacity:0}));rpgFlash.position.set(0,.02,-1.00);
  rpgGroup.add(rpgTube,rpgCone,rpgFlash);addApertureIronSights(rpgGroup,rpgMat,{rearZ:.07,frontZ:-.70,sightY:.145,rearMountY:.092,frontMountY:.092,eyeZ:-.42,rearRadius:.018,rearTube:.0032,postWidth:.006,frontEarGap:.016});registerWeaponHandAnchors(rpgGroup,{right:{position:[.030,-.080,-.04],rotation:[-.18,-.04,.04]},left:{position:[-.030,-.020,-.52],rotation:[-.10,.04,.02]},reloadLeft:{position:[-.040,-.08,-.34],rotation:[-.34,.08,.14]}});rpgGroup.position.set(.34,-.16,-.46);rpgGroup.rotation.set(-.025,-.07,.015);rpgGroup.visible=false;
  setupWeaponAttachmentVisuals(akimboLeftGroup,'akimbo1887',{flash:akimboLeftFlash,barrelMesh:akimboLeftBarrel,stockBaseParts:[akimboLeftStock],suppressor:{radius:.028,length:.20,overlap:.018},laser:{x:.050,z:-.46,y:-.060},lightweightStock:{z:.31,y:-.01,width:.115},fastMag:{z:-.10,y:-.17,width:.09}});
  setupWeaponAttachmentVisuals(akimboRightGroup,'akimbo1887',{flash:akimboRightFlash,barrelMesh:akimboRightBarrel,stockBaseParts:[akimboRightStock],suppressor:{radius:.028,length:.20,overlap:.018},laser:{x:.050,z:-.46,y:-.060},lightweightStock:{z:.31,y:-.01,width:.115},fastMag:{z:-.10,y:-.17,width:.09}});
  setupWeaponAttachmentVisuals(pistolGroup,'pistol',{flash:pistolFlash,mag:pistolMag,redDot:{sightY:.140,z:-.10,mountY:.110,eyeZ:-.46},suppressor:{radius:.030,length:.20,overlap:.020},compensator:{radius:.030,length:.09,overlap:.014},laser:{x:.045,z:-.25,y:-.065,scale:.78},fastMag:{width:.095,depth:.115,y:.07}});
  setupWeaponAttachmentVisuals(assaultGroup,'assault',{flash:assaultFlash,mag:assaultMag,barrelMesh:arBarrel,stockBaseParts:[scarStockStem,scarStock],redDot:{sightY:.165,z:-.16,mountY:.130,eyeZ:-.39},holoSight:{sightY:.180,z:-.15,mountY:.130,eyeZ:-.39},combatOptic:{sightY:.192,z:-.11,mountY:.130,eyeZ:-.40,length:.20},suppressor:{radius:.032,length:.27,overlap:.022},compensator:{radius:.030,length:.11,overlap:.016},verticalGrip:{z:-.55,y:-.105},angledGrip:{z:-.54,y:-.105},laser:{x:.065,z:-.55,y:-.105},lightweightStock:{z:.43,y:-.01,width:.145},fullStock:{z:.41,y:-.01,width:.155},compactStock:{z:.12,y:.01,width:.105},fastMag:{width:.115,depth:.165,y:.08}});
  setupWeaponAttachmentVisuals(umpGroup,'ump',{flash:umpFlash,mag:umpMag,barrelMesh:umpBarrel,stockBaseParts:[umpStockRodL,umpStockRodR,umpButt],redDot:{sightY:.155,z:-.15,mountY:.124,eyeZ:-.40},holoSight:{sightY:.171,z:-.14,mountY:.124,eyeZ:-.40},suppressor:{radius:.032,length:.22,overlap:.020},compensator:{radius:.030,length:.09,overlap:.015},verticalGrip:{z:-.40,y:-.105},angledGrip:{z:-.39,y:-.105},laser:{x:.060,z:-.39,y:-.100},lightweightStock:{z:.27,y:.03,width:.125},fullStock:{z:.27,y:.015,width:.135},compactStock:{z:.12,y:.035,width:.095},fastMag:{width:.105,depth:.125,y:.09}});
  setupWeaponAttachmentVisuals(machineGunGroup,'machineGun',{flash:machineGunFlash,mag:machineGunBox,barrelMesh:mgBarrel,stockBaseParts:[mgStock],bipodBaseParts:[mgBipodMount,mgBipodL,mgBipodR],redDot:{sightY:.171,z:-.20,mountY:.150,eyeZ:-.405},holoSight:{sightY:.190,z:-.19,mountY:.150,eyeZ:-.405},combatOptic:{sightY:.202,z:-.14,mountY:.150,eyeZ:-.415,length:.21},suppressor:{radius:.035,length:.30,overlap:.025},compensator:{radius:.033,length:.12,overlap:.018},verticalGrip:{z:-.61,y:-.12},angledGrip:{z:-.60,y:-.12},laser:{x:.070,z:-.60,y:-.115},lightweightStock:{z:.46,y:-.02,width:.175},fullStock:{z:.45,y:-.025,width:.185},fastMag:{width:.19,depth:.22,y:.08}});
  setupWeaponAttachmentVisuals(shotgunGroup,'shotgun',{flash:shotgunFlash,barrelMesh:sgBarrel,redDot:{sightY:.116,z:-.12,mountY:.090,eyeZ:-.42},suppressor:{radius:.029,length:.22,overlap:.018},shotgunChoke:{radius:.029,length:.10,overlap:.018},laser:{x:.055,z:-.48,y:-.055}});
  setupWeaponAttachmentVisuals(semiShotgunGroup,'semiShotgun',{flash:semiShotgunFlash,mag:semiShotgunMag,barrelMesh:sasBarrel,redDot:{sightY:.118,z:-.14,mountY:.095,eyeZ:-.39},holoSight:{sightY:.142,z:-.13,mountY:.095,eyeZ:-.39},combatOptic:{sightY:.151,z:-.08,mountY:.095,eyeZ:-.40,length:.19},shotgunChoke:{radius:.028,length:.10,overlap:.018},laser:{x:.055,z:-.43,y:-.075},fastMag:{width:.125,depth:.125,y:.05}});
  setupWeaponAttachmentVisuals(sniperGroup,'sniper',{flash:sniperFlash,mag:sniperMag,barrelMesh:rifleBarrel,variableScope:{z:-.16,y:.14,radius:.052},laser:{x:.050,z:-.50,y:-.070},suppressor:{radius:.032,length:.30,overlap:.022},fastMag:{width:.10,depth:.125,y:.04}});
  setupWeaponAttachmentVisuals(rpgGroup,'rpg',{flash:rpgFlash,laser:{x:.065,z:-.38,y:-.060,scale:1.05}});
  syncLocalAttachmentVisuals();
  camera.add(pistolGroup,akimboLeftGroup,akimboRightGroup,assaultGroup,umpGroup,machineGunGroup,shotgunGroup,semiShotgunGroup,sniperGroup,grenadeLauncherGroup,rpgGroup);initFirstPersonHandRig();
  // First-person traversal view model. Keep this geometry entirely in camera
  // space and well in front of the near plane. The old capsule arms extended
  // back toward the eye and could fill the screen during mantle/vault motion,
  // creating the appearance that the camera had entered the player's body.
  mantleHands=new THREE.Group();
  const mantleGloveMat=new THREE.MeshStandardMaterial({color:0x171c20,roughness:.92,depthTest:false,depthWrite:false});
  const mantleSleeveMat=new THREE.MeshStandardMaterial({color:0x344047,roughness:.96,depthTest:false,depthWrite:false});
  for(const side of [-1,1]){
    const limb=new THREE.Group();
    const forearm=new THREE.Mesh(new THREE.CylinderGeometry(.038,.050,.30,8),mantleSleeveMat);
    forearm.rotation.x=Math.PI/2;forearm.position.set(0,-.035,.10);forearm.renderOrder=1000;
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.050,10,7),mantleGloveMat);
    hand.scale.set(1.12,.66,1.24);hand.position.set(0,.025,-.105);hand.renderOrder=1001;
    limb.position.set(side*.27,-.34,-.82);limb.rotation.z=side*.06;limb.userData.side=side;limb.userData.forearm=forearm;limb.userData.hand=hand;
    limb.add(forearm,hand);mantleHands.add(limb);
  }
  mantleHands.visible=false;mantleHands.renderOrder=1000;camera.add(mantleHands);scene.add(camera);

  animate();
}



const WORLD_TEXTURE_DEFS=Object.freeze({
  concrete:Object.freeze({file:'concrete.png',repeat:[2.4,2.4]}),
  plaster:Object.freeze({file:'plaster.png',repeat:[2.8,2.8]}),
  brick:Object.freeze({file:'brick.png',repeat:[2.0,2.0]}),
  stone:Object.freeze({file:'stone.png',repeat:[2.2,2.2]}),
  paintedMetal:Object.freeze({file:'painted_metal.png',repeat:[3.0,3.0]}),
  corrugatedMetal:Object.freeze({file:'corrugated_metal.png',repeat:[4.0,2.0]}),
  rustedMetal:Object.freeze({file:'rusted_metal.png',repeat:[3.0,3.0]}),
  charredMetal:Object.freeze({file:'charred_metal.png',repeat:[3.0,3.0]}),
  wood:Object.freeze({file:'wood.png',repeat:[2.0,3.0]}),
  sandbag:Object.freeze({file:'sandbag_fabric.png',repeat:[4.0,4.0]}),
  bark:Object.freeze({file:'bark.png',repeat:[2.0,3.0]}),
  foliage:Object.freeze({file:'foliage.png',repeat:[3.0,3.0]}),
  rock:Object.freeze({file:'rock.png',repeat:[2.0,2.0]}),
  glass:Object.freeze({file:'glass_grime.png',repeat:[2.0,2.0]}),
});
const WORLD_TEXTURE_ASSET_REV='textures-20260826-1';
const worldTextureCache=new Map();
let worldTextureLoader=null;
function getWorldTexture(name){
  if(!THREE||!name)return null;
  if(worldTextureCache.has(name))return worldTextureCache.get(name);
  const def=WORLD_TEXTURE_DEFS[name];if(!def)return null;
  worldTextureLoader ||= new THREE.TextureLoader();
  const tex=worldTextureLoader.load(`textures/${def.file}?rev=${WORLD_TEXTURE_ASSET_REV}`);
  tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(def.repeat[0],def.repeat[1]);
  tex.minFilter=THREE.LinearMipmapLinearFilter;tex.magFilter=THREE.LinearFilter;tex.anisotropy=Math.min(isTouch?1:8,renderer?.capabilities?.getMaxAnisotropy?.()||1);
  tex.userData.preserveWorldTexture=true;worldTextureCache.set(name,tex);return tex;
}
function worldMat(color,texture,roughness=.9,metalness=0,extra={}){
  return new THREE.MeshStandardMaterial({color,map:getWorldTexture(texture),roughness,metalness,...extra});
}
function buildingWallTexture(style){
  return ({plaster:'plaster',brick:'brick',stone:'stone',office:'concrete',industrial:'corrugatedMetal',warehouse:'corrugatedMetal',tower:'stone',utility:'plaster'})[style]||'concrete';
}

function buildWorldVisuals(){
  if(!scene||!THREE)return;
  mapObstacles.length=0;
  worldRoot=new THREE.Group();worldRoot.name=`world:${currentMapId}`;scene.add(worldRoot);
  const depot=currentMapId==='depot',yard=currentMapId==='yard',rig=currentMapId==='rig';
  const sky=rig?0xb9a27f:(yard?0x7e878d:(depot?0x89979d:0x9acde6));scene.background=new THREE.Color(sky);scene.fog=new THREE.Fog(sky,rig?72:(yard?58:(depot?90:95)),rig?205:(yard?145:(depot?260:285)));
  addTerrain();
  const wallMat=worldMat(rig?0x6d5d49:(yard?0x454c50:(depot?0x626a6e:0xd8d4cc)),yard?'paintedMetal':(rig?'stone':'concrete'),.9,yard?.08:0);addBoundaryWallsBatch(wallMat);
  const blockMat=worldMat(rig?0x756a59:(yard?0x6f777a:(depot?0x697983:0xb8c0c5)),'concrete',.88,0);
  const pyramidMat=worldMat(rig?0x9b8058:(depot?0x88775f:0xc8a86b),'stone',.94,0);addStaticBoxesBatch(blockMat);addPyramidsBatch(pyramidMat);
  const trunkMat=worldMat(0x60452f,'bark',1,0),leafMat=worldMat(depot?0x405b3f:0x315f37,'foliage',1,0),bushMat=worldMat(depot?0x53664b:0x3f7441,'foliage',1,0),rockMat=worldMat(rig?0x8b7459:(depot?0x777b78:0x6b706f),'rock',.98,0);
  addNaturalObstaclesBatch(trunkMat,leafMat,bushMat,rockMat);addBuildingsBatch();addLaddersBatch();
  const markerMat=worldMat(depot?0x303a40:0x49606f,'paintedMetal',.78,.15);if(!yard&&!rig)addMarkersBatch(markerMat);
  minimapStaticCache=null;
}
function rebuildWorldVisuals(){
  if(worldRoot){try{scene.remove(worldRoot);}catch{}disposeObject3D(worldRoot);worldRoot=null;}
  buildWorldVisuals();
  for(const r of remotes.values()){try{scene.remove(r.group);}catch{}disposeObject3D(r.group);}remotes.clear();
  clearBullets();clearBulletImpactFx();clearThrowables();clearSmokeClouds();clearTacticalFx();clearRocketTrailPuffs();hideTrajectory();
}

function addTerrain(){
  const size=TERRAIN_SIZE,segments=TERRAIN_SEGMENTS;
  const geo=new THREE.PlaneGeometry(size,size,segments,segments),pos=geo.attributes.position;
  const colors=[];
  const depot=currentMapId==='depot',yard=currentMapId==='yard',rig=currentMapId==='rig',low=new THREE.Color(rig?0x8f7957:(yard?0x686c6d:(depot?0x62655f:0x587552))),mid=new THREE.Color(rig?0xa58d66:(yard?0x747878:(depot?0x777972:0x78915f))),high=new THREE.Color(rig?0xb59a70:(yard?0x7d8080:(depot?0x756d60:0x807a65))),peak=new THREE.Color(rig?0xc0a77c:(yard?0x858888:(depot?0x8b8375:0x9a9586)));
  for(let i=0;i<pos.count;i++){
    const x=pos.getX(i),z=-pos.getY(i),h=terrainHeight(x,z);pos.setZ(i,h);
    const color=new THREE.Color();
    if(h<1.5)color.lerpColors(low,mid,THREE.MathUtils.clamp((h+2.4)/3.9,0,1));
    else if(h<7)color.lerpColors(mid,high,(h-1.5)/5.5);
    else color.lerpColors(high,peak,THREE.MathUtils.clamp((h-7)/6.8,0,1));
    colors.push(color.r,color.g,color.b);
  }
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  const terrainTexture=makeTerrainTexture();
  const mat=new THREE.MeshStandardMaterial({vertexColors:true,map:terrainTexture,roughness:1,metalness:0});
  const ground=new THREE.Mesh(geo,mat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=!isTouch;worldRoot.add(ground);
}
function makeTerrainTexture(){
  const size=256,c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
  const image=x.createImageData(size,size),depot=currentMapId==='depot',yard=currentMapId==='yard',rig=currentMapId==='rig';let seed=rig?0x9f5e2b:(yard?0x413c37:(depot?0x6d4f23:0x51f15e));
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const i=(py*size+px)*4,n=rand(),wave=Math.sin(px*.19+Math.sin(py*.07))*5+Math.cos(py*.15)*4;
    if(rig){const v=Math.max(142,Math.min(205,176+(n-.5)*34+wave*.42));image.data[i]=v;image.data[i+1]=Math.round(v*.86);image.data[i+2]=Math.round(v*.64);image.data[i+3]=255;}
    else if(yard){const v=Math.max(118,Math.min(174,145+(n-.5)*24+wave*.35));image.data[i]=v;image.data[i+1]=v+2;image.data[i+2]=v+3;image.data[i+3]=255;}
    else{const v=Math.max(depot?128:168,Math.min(depot?202:238,(depot?168:211)+(n-.5)*(depot?36:30)+wave));image.data[i]=Math.round(v*(depot?.94:.96));image.data[i+1]=Math.round(v*(depot?.93:1));image.data[i+2]=Math.round(v*(depot?.89:.88));image.data[i+3]=255;}
  }
  x.putImageData(image,0,0);
  if(rig){x.globalAlpha=.18;x.strokeStyle='#8a7251';x.lineWidth=1;for(let i=0;i<28;i++){const y=(i*29+13)%size;x.beginPath();x.moveTo(0,y);x.bezierCurveTo(80,y+3,170,y-4,size,y+2);x.stroke();}x.globalAlpha=.20;x.fillStyle='#715d43';for(let i=0;i<520;i++){const px=rand()*size,py=rand()*size,r=.3+rand()*1.0;x.fillRect(px,py,r,r);}}
  else if(yard){x.globalAlpha=.22;x.strokeStyle='#575d60';x.lineWidth=1;for(let i=0;i<18;i++){const y=(i*31+9)%size;x.beginPath();x.moveTo(0,y);x.lineTo(size,y+((i%3)-1)*2);x.stroke();}x.globalAlpha=.18;x.fillStyle='#4e5355';for(let i=0;i<420;i++){const px=rand()*size,py=rand()*size,r=.35+rand()*1.2;x.fillRect(px,py,r,r);}}
  else{x.globalAlpha=depot?.28:.22;x.strokeStyle=depot?'#575d5b':'#758064';x.lineWidth=1;for(let i=0;i<34;i++){const y=(i*37)%size;x.beginPath();x.moveTo(0,y);x.bezierCurveTo(70,y+10,150,y-12,size,y+4);x.stroke();}x.globalAlpha=.16;x.fillStyle=depot?'#777064':'#5d674d';for(let i=0;i<520;i++){const px=rand()*size,py=rand()*size,r=.4+rand()*1.5;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill();}}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(yard?34:(rig?30:28),yard?34:(rig?30:28));tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy?.()||1);return tex;
}
function addStaticInstancedMesh(geometry,material,transforms,{castShadow=true,receiveShadow=true}={}){
  if(!transforms.length)return null;
  const mesh=new THREE.InstancedMesh(geometry,material,transforms.length),dummy=new THREE.Object3D();
  for(let i=0;i<transforms.length;i++){
    const t=transforms[i];dummy.position.set(t.x||0,t.y||0,t.z||0);dummy.rotation.set(t.rx||0,t.ry||0,t.rz||0);dummy.scale.set(t.sx??1,t.sy??1,t.sz??1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=castShadow&&!isTouch;mesh.receiveShadow=receiveShadow&&!isTouch;mesh.computeBoundingBox?.();mesh.computeBoundingSphere?.();worldRoot.add(mesh);return mesh;
}
function addBoundaryWallsBatch(mat){
  const pieces=16,span=ARENA_LIMIT*2,piece=span/pieces,edge=ARENA_LIMIT+1,transforms=[];
  for(let i=0;i<pieces;i++){
    const p=-ARENA_LIMIT+piece*(i+.5);
    transforms.push({x:p,y:terrainHeight(p,-edge)+2.5,z:-edge,sx:piece+.35,sy:5,sz:2});
    transforms.push({x:p,y:terrainHeight(p,edge)+2.5,z:edge,sx:piece+.35,sy:5,sz:2});
    transforms.push({x:-edge,y:terrainHeight(-edge,p)+2.5,z:p,sx:2,sy:5,sz:piece+.35});
    transforms.push({x:edge,y:terrainHeight(edge,p)+2.5,z:p,sx:2,sy:5,sz:piece+.35});
  }
  addStaticInstancedMesh(new THREE.BoxGeometry(1,1,1),mat,transforms);
}
function addCompoundPropBox(group,mat,x,y,z,sx,sy,sz,ry=0){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat);mesh.position.set(x,y,z);mesh.rotation.y=ry;mesh.castShadow=!isTouch;mesh.receiveShadow=!isTouch;group.add(mesh);return mesh;
}
function addVehicleProp(o){
  const ground=terrainHeight(o.x,o.z),longX=o.w>=o.d,ry=longX?0:Math.PI/2,length=Math.max(o.w,o.d),width=Math.min(o.w,o.d),group=new THREE.Group();group.position.set(o.x,ground,o.z);group.rotation.y=ry;worldRoot.add(group);
  const charred=worldMat(0x252728,'charredMetal',.94,.12),rust=worldMat(0x5f4030,'rustedMetal',.97,.04),glass=worldMat(0x171d20,'glass',.48,.05),rubber=new THREE.MeshStandardMaterial({color:0x111213,roughness:1});
  const bus=o.kind==='burntBus',bodyH=bus?1.90:.72,bodyY=bus?.97:.46;
  addCompoundPropBox(group,charred,0,bodyY,0,length*.96,bodyH,width*.94);
  if(bus){
    addCompoundPropBox(group,rust,0,2.30,0,length*.90,.92,width*.88);addCompoundPropBox(group,glass,0,2.34,-width*.455,length*.74,.54,.035);addCompoundPropBox(group,glass,0,2.34,width*.455,length*.74,.54,.035);addCompoundPropBox(group,charred,0,2.83,0,length*.92,.14,width*.90);
  }else{
    addCompoundPropBox(group,rust,-length*.03,1.05,0,length*.47,.54,width*.84);addCompoundPropBox(group,glass,-length*.03,1.12,-width*.425,length*.34,.30,.035);addCompoundPropBox(group,glass,-length*.03,1.12,width*.425,length*.34,.30,.035);
    addCompoundPropBox(group,charred,length*.33,.70,0,length*.25,.30,width*.88);addCompoundPropBox(group,charred,-length*.36,.66,0,length*.20,.25,width*.86);
  }
  const wheelR=bus?.42:.33,wheelW=bus?.26:.22,wheelX=length*(bus?.34:.32),wheelZ=width*.48;
  for(const sx of [-1,1])for(const sz of [-1,1]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(wheelR,wheelR,wheelW,10),rubber);wheel.rotation.x=Math.PI/2;wheel.position.set(sx*wheelX,wheelR*.92,sz*wheelZ);group.add(wheel);}
}
function addSpecialStaticProps(){
  const metal=worldMat(0x485056,'paintedMetal',.84,.18),darkMetal=worldMat(0x303438,'charredMetal',.92,.12),concrete=worldMat(0x8e8a80,'concrete',.98,0),sand=worldMat(0x8b7753,'sandbag',1,0),rust=worldMat(0x76523a,'rustedMetal',.96,.05);
  for(const o of STATIC_BOXES){
    if(o.kind==='burntCar'||o.kind==='burntBus'){addVehicleProp(o);continue;}
    const ground=terrainHeight(o.x,o.z);
    if(o.kind==='dumpster'){
      const g=new THREE.Group();g.position.set(o.x,ground,o.z);worldRoot.add(g);addCompoundPropBox(g,darkMetal,0,o.h*.45,0,o.w,o.h*.84,o.d);addCompoundPropBox(g,metal,0,o.h*.91,0,o.w*1.02,.12,o.d*1.03,Math.PI*.02);continue;
    }
    if(o.kind==='fuelTank'){
      const longX=o.w>=o.d,length=Math.max(o.w,o.d),radius=Math.min(o.w,o.d)*.46,tank=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,length,14),metal);tank.rotation.z=Math.PI/2;tank.rotation.y=longX?0:Math.PI/2;tank.position.set(o.x,ground+o.h/2,o.z);tank.scale.y=.86;worldRoot.add(tank);continue;
    }
    if(o.kind==='checkpoint'){
      const g=new THREE.Group();g.position.set(o.x,ground,o.z);worldRoot.add(g);addCompoundPropBox(g,rust,0,o.h*.46,0,o.w,o.h*.92,o.d);addCompoundPropBox(g,darkMetal,0,o.h*.68,-o.d*.505,o.w*.66,.58,.05);addCompoundPropBox(g,darkMetal,0,o.h*.68,o.d*.505,o.w*.66,.58,.05);addCompoundPropBox(g,metal,0,o.h+.10,0,o.w*1.10,.20,o.d*1.10);continue;
    }
    if(o.kind==='sandbag'){
      const g=new THREE.Group();g.position.set(o.x,ground,o.z);worldRoot.add(g);const longX=o.w>=o.d,length=Math.max(o.w,o.d),count=Math.max(4,Math.floor(length/.72)),step=length/count,rows=Math.max(2,Math.round(o.h/.38));
      for(let row=0;row<rows;row++)for(let i=0;i<Math.max(2,count-row);i++){const bag=new THREE.Mesh(new THREE.CapsuleGeometry(.23,.38,3,6),sand);bag.rotation.z=Math.PI/2;bag.rotation.y=longX?0:Math.PI/2;const rowCount=Math.max(2,count-row),rowStep=length/rowCount,along=-length/2+rowStep*(i+.5);bag.position.set(longX?along:0,.23+row*.38,longX?0:along);g.add(bag);}continue;
    }
    if(o.kind==='brokenWall'){
      const g=new THREE.Group();g.position.set(o.x,ground,o.z);worldRoot.add(g);const longX=o.w>=o.d,length=Math.max(o.w,o.d),depth=Math.min(o.w,o.d),pieces=5,seg=length/pieces;
      addCompoundPropBox(g,concrete,0,o.h/2,0,o.w,o.h,o.d);for(let i=0;i<pieces;i++){const along=-length/2+seg*(i+.5),chunkH=.12+.08*Math.abs(Math.sin((i+1)*1.73));addCompoundPropBox(g,rust,longX?along:0,o.h+chunkH/2,longX?0:along,longX?seg*.72:depth*.90,chunkH,longX?depth*.90:seg*.72,(i%2?1:-1)*.05);}continue;
    }
  }
}
function addLaddersBatch(){
  if(!LADDERS.length)return;const metal=worldMat(0x8d8170,'rustedMetal',.82,.35);
  for(const ladder of LADDERS){const g=new THREE.Group(),height=Math.max(.8,ladder.topY-ladder.bottomY),cx=ladder.x+ladder.nx*.05,cz=ladder.z+ladder.nz*.05;g.position.set(cx,ladder.bottomY,cz);worldRoot.add(g);const horizontal=Math.abs(ladder.tx)>.5;
    const railOffset=ladder.width*.43;for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,height,8),metal);rail.position.set(ladder.tx*railOffset*side,height/2,ladder.tz*railOffset*side);g.add(rail);}
    const rungCount=Math.max(4,Math.floor(height/.34));for(let i=0;i<=rungCount;i++){const rung=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,ladder.width*.90,8),metal);rung.position.y=.18+(height-.36)*(i/rungCount);if(horizontal)rung.rotation.z=Math.PI/2;else rung.rotation.x=Math.PI/2;g.add(rung);}
  }
}
function addStaticBoxesBatch(mat){
  const unit=new THREE.BoxGeometry(1,1,1),customKinds=new Set(['burntCar','burntBus','dumpster','fuelTank','checkpoint','sandbag','brokenWall']);
  const palette={
    boundary:worldMat(currentMapId==='yard'?0x3d4448:currentMapId==='rig'?0x5a4f41:0x626a6e,currentMapId==='yard'?'paintedMetal':(currentMapId==='rig'?'stone':'concrete'),.95,currentMapId==='yard'?.08:0),
    pipe:worldMat(0x6d665d,'rustedMetal',.76,.18),tank:worldMat(0x82755f,'rustedMetal',.80,.12),shed:worldMat(0x765744,'corrugatedMetal',.88,.08),barrier:worldMat(0x9a8b70,'concrete',.96,0),crate:worldMat(0x755437,'wood',.96,0),
    containerBlue:worldMat(0x385f78,'corrugatedMetal',.82,.06),containerRed:worldMat(0x8a473f,'corrugatedMetal',.84,.06),containerGreen:worldMat(0x4f6d58,'corrugatedMetal',.86,.06),containerTan:worldMat(0x847457,'corrugatedMetal',.88,.05),
    default:mat,
  };
  const groups=new Map();for(const o of STATIC_BOXES){if(customKinds.has(o.kind))continue;const kind=o.kind||'default';if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push({x:o.x,y:terrainHeight(o.x,o.z)+o.h/2,z:o.z,sx:o.w,sy:o.h,sz:o.d});}
  for(const [kind,transforms] of groups)addStaticInstancedMesh(unit,palette[kind]||mat,transforms);
  addSpecialStaticProps();
  for(const o of STATIC_BOXES)mapObstacles.push({type:'box',x:o.x,z:o.z,w:o.w,d:o.d});
}
function addPyramidsBatch(mat){
  const transforms=[];
  for(const p of PYRAMIDS){const radius=p.base/Math.sqrt(2),ground=terrainHeight(p.x,p.z);transforms.push({x:p.x,y:ground+p.h/2-.05,z:p.z,ry:Math.PI/4,sx:radius,sy:p.h,sz:radius});mapObstacles.push({type:'pyramid',x:p.x,z:p.z,base:p.base});}
  addStaticInstancedMesh(new THREE.ConeGeometry(1,1,4,1),mat,transforms);
}
function addNaturalObstaclesBatch(trunkMat,leafMat,bushMat,rockMat){
  const trunks=[],crowns=[],bushes=[],rocks=[];
  const bushOffsets=[[0,0,1],[-.55,0,.72],[.55,.08,.68],[0,.48,.63]];
  for(const o of NATURAL_OBSTACLES){
    const base=naturalGroundBase(o.type,o.x,o.z,o.r);mapObstacles.push({type:o.type,x:o.x,z:o.z,r:o.r,h:o.h});
    if(o.type==='tree'){
      trunks.push({x:o.x,y:base+o.h*.32,z:o.z,sx:o.r,sy:o.h*.64,sz:o.r});
      crowns.push({x:o.x,y:base+o.h*.62,z:o.z,sx:o.r*3.0,sy:o.h*.48,sz:o.r*3.0});
      crowns.push({x:o.x,y:base+o.h*.83,z:o.z,sx:o.r*2.35,sy:o.h*.40,sz:o.r*2.35});
    }else if(o.type==='bush'){
      for(const [ox,oz,scale] of bushOffsets){const r=o.r*scale*.72;bushes.push({x:o.x+ox*o.r*.45,y:base+o.h*.42,z:o.z+oz*o.r*.45,sx:r,sy:r*.62,sz:r});}
    }else rocks.push({x:o.x,y:base+o.h/2,z:o.z,ry:.4,sx:o.r,sy:o.h,sz:o.r});
  }
  addStaticInstancedMesh(new THREE.CylinderGeometry(.72,1,1,8),trunkMat,trunks);
  addStaticInstancedMesh(new THREE.ConeGeometry(1,1,9),leafMat,crowns);
  addStaticInstancedMesh(new THREE.SphereGeometry(1,8,6),bushMat,bushes,{castShadow:false,receiveShadow:false});
  addStaticInstancedMesh(new THREE.CylinderGeometry(.62,1,1,7,2,false),rockMat,rocks,{castShadow:false,receiveShadow:false});
}
function addBuildingsBatch(){
  const unitBox=new THREE.BoxGeometry(1,1,1);
  for(let index=0;index<BUILDINGS.length;index++){
    const b=BUILDINGS[index],geometry=BUILDING_GEOMETRY[index];
    const buildingStyle={
      plaster:[0xb6afa2,0x5b5751,0x706b64],brick:[0x8a6555,0x403b38,0x665d57],stone:[0x8c8c83,0x454a49,0x676862],office:[0x91999d,0x343d43,0x626a6d],industrial:[0x767f82,0x30383d,0x555d60],
      warehouse:[0x8e9393,0x3f474b,0x5c6263],tower:[0x6f6250,0x3b3229,0x5b5145],utility:[0x89735b,0x514336,0x5b5145],
    }[b.style]||null;
    const materials={
      wall:worldMat(buildingStyle?buildingStyle[0]:(currentMapId==='rig'?(b.tall?0x6f6250:0x89735b):(currentMapId==='depot'?(b.tall?0x7d8589:0x919698):(b.tall?0x929aa0:0xa8adb0))),buildingWallTexture(b.style),.92,b.style==='industrial'||b.style==='warehouse'?.05:0),
      trim:worldMat(buildingStyle?buildingStyle[1]:(currentMapId==='rig'?(b.tall?0x3b3229:0x514336):(currentMapId==='depot'?(b.tall?0x30383d:0x41494e):(b.tall?0x39444d:0x4f5961))),'paintedMetal',.78,.10),
      floor:worldMat(buildingStyle?buildingStyle[2]:(currentMapId==='rig'?0x5b5145:(currentMapId==='depot'?0x5d6264:0x6d7478)),'concrete',.97,0),
    };
    const groups={wall:[],trim:[],floor:[]};
    for(const part of geometry.parts){
      const h=part.topY-part.bottomY,key=part.role==='wall'?'wall':(part.role==='trim'||part.role==='rail'||part.role==='roof'||part.role==='stairSide'?'trim':'floor');
      groups[key].push({x:part.x,y:(part.bottomY+part.topY)/2,z:part.z,sx:part.w,sy:h,sz:part.d});
    }
    for(const key of ['wall','trim','floor'])addStaticInstancedMesh(unitBox,materials[key],groups[key]);
    mapObstacles.push({type:'box',x:b.x,z:b.z,w:b.w,d:b.d});
  }
}
function addMarkersBatch(mat){
  const transforms=[];for(const [x,z] of [[-102,-102],[102,-102],[-102,102],[102,102],[0,-108],[108,0],[0,108],[-108,0]])transforms.push({x,y:terrainHeight(x,z)+2.6,z});
  addStaticInstancedMesh(new THREE.CylinderGeometry(.28,.4,5.2,10),mat,transforms,{castShadow:false,receiveShadow:false});
}


function bindUI(){

  const menuShell=$('menuShell');
  const setDeployMode=(mode)=>{
    const next=['create','join','live'].includes(mode)?mode:'create';
    menuShell.dataset.deployMode=next;
    for(const tab of deployTabs){const active=tab.dataset.deployTab===next;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));}
    for(const view of deployViews){
      const active=view.dataset.deployView===next;
      view.hidden=!active;
      view.inert=!active;
      view.setAttribute('aria-hidden',String(!active));
    }
    const focused=document.activeElement;
    if(focused instanceof HTMLElement&&focused.matches('input,textarea,select')&&focused.closest('[data-deploy-view]')?.dataset.deployView!==next)focused.blur();
    if(next==='live')void refreshMatches();
  };
  for(const tab of deployTabs)tab.addEventListener('click',()=>setDeployMode(tab.dataset.deployTab));
  setDeployMode(requestedRoom?'join':'create');
  bindSubTabs('[data-settings-tab]','[data-settings-page]','data-settings-tab','data-settings-page','controls');
  bindSubTabs('[data-lobby-cheat-tab]','[data-lobby-cheat-page]','data-lobby-cheat-tab','data-lobby-cheat-page','gameplay');

  $('createBtn').addEventListener('click',createMatch);
  $('refreshBtn').addEventListener('click',refreshMatches);
  $('enterFullscreenBtn').addEventListener('click',()=>{ensureAudio();void shell.enterFullscreenFromGesture();});
  $('musicBtn').addEventListener('click',()=>{ensureAudio();toggleMasterMute();});
  $('settingsBtn').addEventListener('click',openPlayerSettings);
  $('lobbySettingsBtn').addEventListener('click',openPlayerSettings);
  $('pauseSettingsBtn').addEventListener('click',openPlayerSettings);
  $('pauseLoadoutBtn').addEventListener('click',openMatchLoadout);
  $('loadoutCloseBtn').addEventListener('click',closeMatchLoadout);
  for(const btn of matchPrimaryButtons)btn.addEventListener('click',()=>setMatchLoadoutDraft({primaryWeapon:btn.dataset.matchPrimaryChoice}));
  for(const btn of matchSecondaryButtons)btn.addEventListener('click',()=>setMatchLoadoutDraft({secondaryWeapon:btn.dataset.matchSecondaryChoice}));
  for(const btn of matchTacticalButtons)btn.addEventListener('click',()=>setMatchLoadoutDraft({tactical:btn.dataset.matchTacticalChoice}));
  for(const btn of matchLethalButtons)btn.addEventListener('click',()=>setMatchLoadoutDraft({lethal:btn.dataset.matchLethalChoice}));
  $('settingsCloseBtn').addEventListener('click',closePlayerSettings);
  $('settingsFullscreenBtn').addEventListener('click',async()=>{ensureAudio();if(shell.fullscreen)await shell.exitFullscreenFromGesture();else await shell.enterFullscreenFromGesture();});
  $('rotateExitFullscreenBtn')?.addEventListener('click',()=>shell.exitFullscreenFromGesture());
  $('connectionCancelBtn')?.addEventListener('click',()=>cancelInitialConnection('Connection canceled.'));
  $('settingsResetBtn').addEventListener('click',resetPlayerSettings);
  $('playerMasterMute')?.addEventListener('change',()=>{setMasterMuted($('playerMasterMute').value==='on');setSettingsStatus('Saved automatically','ok');});
  for(const [id,key] of [['playerLookSensitivity','lookSensitivity'],['playerAdsSensitivity','adsSensitivity'],['playerTouchSensitivity','touchSensitivity'],['playerControllerVerticalSensitivity','controllerVerticalSensitivity'],['playerControllerMoveDeadzone','controllerMoveDeadzone'],['playerControllerLookDeadzone','controllerLookDeadzone'],['playerMasterVolume','masterVolume'],['playerSfxVolume','sfxVolume'],['playerMusicVolume','musicVolume']])$(id)?.addEventListener('input',()=>stagePlayerSettingFromUI(id,key));
  for(const id of ['playerMasterVolume','playerMusicVolume'])$(id)?.addEventListener('change',refreshIntroMusicVolume);
  $('playerGraphics').addEventListener('change',()=>stagePlayerChoice('graphics',$('playerGraphics').value));
  $('playerMinimapOrientation')?.addEventListener('change',()=>stagePlayerChoice('minimapOrientation',$('playerMinimapOrientation').value));
  $('playerControllerResponseCurve')?.addEventListener('change',()=>stagePlayerChoice('controllerResponseCurve',$('playerControllerResponseCurve').value));
  $('playerControllerAimAssist')?.addEventListener('change',()=>stagePlayerChoice('controllerAimAssist',$('playerControllerAimAssist').value));
  $('playerDiagnosticsBtn')?.addEventListener('click',toggleDiagnosticsRecording);
  $('diagnosticsExportBtn')?.addEventListener('click',exportDiagnosticsRecording);
  $('diagnosticsClearBtn')?.addEventListener('click',()=>{resetDiagnosticsRecording({markStart:diagnosticsRecordingEnabled()});showToast(diagnosticsRecordingEnabled()?'DIAGNOSTICS CLEARED · RECORDING':'DIAGNOSTICS CLEARED');});
  chatSendBtn.addEventListener('click',submitChat);
  chatKeyboard.addEventListener('pointerdown',e=>{const btn=e.target.closest?.('[data-chat-char],[data-chat-action]');if(!btn||!chatOpen)return;e.preventDefault();handleChatKeyboardButton(btn);});
  $('joinBtn').addEventListener('click', () => joinMatch(normalizeCode(codeInput.value)));
  nameInput.addEventListener('click',()=>openGameTextEditor(nameInput));
  codeInput.addEventListener('click',()=>openGameTextEditor(codeInput));
  for(const btn of gameTextKeyboard?.querySelectorAll('[data-editor-char],[data-editor-action]')||[])btn.addEventListener('click',()=>handleGameTextEditorButton(btn));
  $('resumeBtn').addEventListener('click', resumeFromGesture);
  $('copyBtn').addEventListener('click', copyInvite);
  $('teamSwitchBtn').addEventListener('click',()=>requestTeamChange(godMode?(myTeam==='blue'?'red':'blue'):(pendingTeam?myTeam:(myTeam==='blue'?'red':'blue'))));
  $('adminBtn').addEventListener('click',()=>openAdminPanel('gameplay'));
  $('adminCancelBtn').addEventListener('click',closeAdminPanel);
  $('adminSaveBtn').addEventListener('click',saveAdminSettings);
  $('adminResetBtn').addEventListener('click',resetActiveAdminTab);
  for(const id of ['adminBlueBotCount','adminRedBotCount','adminFfaBotCount','adminBotDifficulty'])$(id)?.addEventListener('change',syncAdminBotDraftSummary);
  const adminTabs=[...document.querySelectorAll('[data-admin-tab]')];
  for(const tab of adminTabs){
    tab.addEventListener('click',()=>switchAdminTab(tab.dataset.adminTab));
    tab.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
      const tabs=availableAdminTabs();if(!tabs.includes(tab)||!tabs.length)return;
      e.preventDefault();
      const current=tabs.indexOf(tab),next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(current+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
      tabs[next].focus();switchAdminTab(tabs[next].dataset.adminTab);
    });
  }
  $('leaveBtn').addEventListener('click',()=>{if(isMatchAdmin)returnToLobby();else leaveMatch();});
  $('lobbyLeaveBtn').addEventListener('click',openLobbyQuitConfirm);$('lobbyQuitStayBtn')?.addEventListener('click',closeLobbyQuitConfirm);$('lobbyQuitLeaveBtn')?.addEventListener('click',confirmLobbyQuit);
  $('lobbyCopyBtn').addEventListener('click',copyInvite);
  $('lobbyResetSetupBtn')?.addEventListener('click',resetLobbyHostSetup);
  for(const tab of lobbySideTabs)tab.addEventListener('click',()=>switchLobbySide(tab.dataset.lobbySideTab));
  $('lobbyGodModeToggle')?.addEventListener('click',()=>{if(isMatchAdmin&&socket?.readyState===WebSocket.OPEN)send({t:'god',enabled:!godMode});});
  switchLobbySide('players');
  for(const btn of lobbyTeamButtons)btn.addEventListener('click',()=>{if(socket?.readyState===WebSocket.OPEN)send({t:'team',team:btn.dataset.lobbyTeamChoice});});
  for(const btn of lobbyPrimaryButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({primaryWeapon:btn.dataset.lobbyPrimaryChoice}));
  for(const btn of lobbySecondaryButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({secondaryWeapon:btn.dataset.lobbySecondaryChoice}));
  for(const btn of lobbyTacticalButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({tactical:btn.dataset.lobbyTacticalChoice}));
  for(const btn of lobbyLethalButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({lethal:btn.dataset.lobbyLethalChoice}));
  for(const btn of lobbyModeButtons)btn.addEventListener('click',()=>setLobbyModeDraft(btn.dataset.lobbyModeChoice));
  for(const el of [lobbyBlueBotCount,lobbyRedBotCount,lobbyFfaBotCount,lobbyBotDifficulty,lobbyScoreLimit,lobbyTimeLimit,lobbyMinimapMode])el.addEventListener('input',updateLobbyMatchDraftFromControls);
  for(const root of [$('adminGameplay'),$('adminAdvanced')]){root?.addEventListener('input',()=>{if(shell.inLobby)setLobbyActionState();});root?.addEventListener('change',()=>{if(shell.inLobby)setLobbyActionState();});}
  for(const btn of lobbyMapButtons)btn.addEventListener('click',()=>setLobbyMapDraft(btn.dataset.lobbyMapChoice));
  $('lobbyStartBtn').addEventListener('click',async()=>{
    if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||!matchAllowsLobbyEdits(matchState))return;
    const setup=collectLobbyStartSetup();if(!setup){$('lobbyStatus').textContent=`Maximum ${MAX_BOTS} bots per match.`;return;}
    const button=$('lobbyStartBtn');button.disabled=true;$('lobbyStatus').textContent='Preparing match…';
    // Validate first. Fullscreen/input capture happens only for a setup that can actually start.
    if(!(await shell.prepareInputFromGesture())){button.disabled=false;$('lobbyStatus').textContent='Fullscreen / game input is required to start.';return;}
    if(!(await prepareGameRuntime())){button.disabled=false;$('lobbyStatus').textContent='Game runtime could not be prepared.';return;}
    loadoutClasses=normalizeLoadoutClasses(setup.loadoutClasses,selectedLoadout());rememberLoadoutClasses(loadoutClasses,setup.classId);send({t:'startMatch',setup});$('lobbyStatus').textContent='Starting match…';
  });

  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', onCanvasPointerDown, {passive:false});
  canvas.addEventListener('pointermove', onCanvasPointerMove, {passive:false});
  canvas.addEventListener('pointerup', onCanvasPointerEnd, {passive:false});
  canvas.addEventListener('pointercancel', onCanvasPointerEnd, {passive:false});
  canvas.addEventListener('lostpointercapture', onCanvasPointerEnd);
  const suppressCanvasNativeTouch=e=>{if(shell.canPlay){e.preventDefault();const sel=window.getSelection?.();if(sel&&!sel.isCollapsed)sel.removeAllRanges();}};
  for(const type of ['touchstart','touchmove','touchend','touchcancel'])canvas.addEventListener(type,suppressCanvasNativeTouch,{passive:false,capture:true});
  const suppressNativeUI=e=>{if(!isEditableTarget(e.target)){e.preventDefault();const sel=window.getSelection?.();if(sel)sel.removeAllRanges();}};
  document.addEventListener('contextmenu',suppressNativeUI,{capture:true});
  document.addEventListener('gesturestart',suppressNativeUI,{passive:false,capture:true});
  document.addEventListener('gesturechange',suppressNativeUI,{passive:false,capture:true});
  document.addEventListener('gestureend',suppressNativeUI,{passive:false,capture:true});

  document.addEventListener('mousemove', e => {
    if(chatOpen||!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||(!isTouch&&document.pointerLockElement!==canvas)) return;
    if(Math.abs(e.movementX)+Math.abs(e.movementY)>.01)setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
    const beforePitch=pitch,sens=aimSensitivityScale()*playerSettings.lookSensitivity;applyPlayerAimDelta(-e.movementX*.0023*sens,-e.movementY*.0020*sens);if(diagnosticsRecordingEnabled()&&fireInputHeld()&&Math.abs(pitch-beforePitch)>.02)diagnosticsRecordEvent('mouse_look',{dx:diagnosticsRound(e.movementX,2),dy:diagnosticsRound(e.movementY,2),pitchDelta:diagnosticsRound(pitch-beforePitch)});
  });
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||e.pointerType==='pen'){activateTouchInputMode();setActiveInputMode(INPUT_MODE.TOUCH,{quiet:true});}
    else if(e.pointerType==='mouse')setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
  },{capture:true,passive:true});
  document.addEventListener('keydown', e => {
    if(gameTextEditorTarget){handlePhysicalGameTextKey(e);return;}
    if(chatOpen){handlePhysicalChatKey(e);return;}
    if(lobbyQuitPromptOpen()&&e.code==='Escape'&&!e.repeat){e.preventDefault();closeLobbyQuitConfirm();return;}
    if(isEditableTarget(e.target)) return;
    if(controllerInputActive()&&(e.code==='Space'||e.code==='Escape'||e.code.startsWith('Arrow'))){e.preventDefault();return;}
    if(!controllerInputActive()||isTouch||document.pointerLockElement===canvas)setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
    if(e.code==='Enter'&&!e.repeat&&shell.inMatch&&!shell.paused&&!shell.panel){e.preventDefault();openChat();return;}
    if(e.code==='Escape'&&!e.repeat&&shell.panel){
      e.preventDefault();
      if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return;}
      if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return;}
      if(shell.panel===SHELL_PANEL.LOADOUT){if(loadoutWorkspaceMode.match==='item'){setLoadoutWorkspaceMode('match','class',{ensurePreview:false});return;}if(loadoutWorkspaceMode.match==='class'){setLoadoutWorkspaceMode('match','classes',{ensurePreview:false});return;}closeMatchLoadout();return;}
    }
    if(e.code==='Escape'&&!e.repeat&&shell.inLobby&&loadoutWorkspaceMode.lobby!=='classes'&&document.querySelector('[data-lobby-side-tab="loadout"]')?.classList.contains('active')){e.preventDefault();setLoadoutWorkspaceMode('lobby',loadoutWorkspaceMode.lobby==='item'?'class':'classes',{ensurePreview:false});return;}
    if(e.code==='Escape'&&!e.repeat&&shell.inLobby){e.preventDefault();openLobbyQuitConfirm();return;}
    if(!shell.inMatch)return;
    if((e.code==='KeyM'||e.code==='Escape')&&!e.repeat){
      e.preventDefault();
      if(scoreboardOpen){scoreboardOpen=false;return;}
      if(!shell.paused)openPause();
      return;
    }
    if(!shell.canPlay)return;
    if(matchAllowsMovement(matchState)&&hp<=0&&e.code==='KeyL'&&!e.repeat){e.preventDefault();openMatchLoadout();return;}
    if(['KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Space','KeyC','KeyR','KeyQ','KeyB','KeyF','KeyG','Digit1','Digit2','Tab'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if(e.code==='Space' && !e.repeat) tryJump();
    if(e.code==='KeyC' && !e.repeat) toggleCrouch();
    if(e.code==='KeyR' && !e.repeat) doReload();
    if(e.code==='Digit1' && !e.repeat) switchWeapon(primaryWeapon);
    if(e.code==='Digit2' && !e.repeat) switchWeapon(secondaryWeapon);
    if(e.code==='KeyF' && !e.repeat) beginEquipmentAim(tacticalEquipment);
    if(e.code==='KeyG' && !e.repeat) beginEquipmentAim(lethalEquipment);
    if(e.code==='KeyQ' && !e.repeat) switchWeapon(currentWeapon===secondaryWeapon?primaryWeapon:secondaryWeapon);
    if(e.code==='KeyB' && !e.repeat) toggleFireMode();
    if(e.code==='Tab'&&!e.repeat){scoreboardOpen=true;scoreboardScroll=0;clearFireInput();cancelEquipmentAction();}
  });
  document.addEventListener('keyup', e => {
    if(chatOpen){e.preventDefault();return;}
    if(isEditableTarget(e.target))return;
    keys.delete(e.code);
    if(e.code==='Tab')scoreboardOpen=false;
    if(e.code==='KeyF'&&equipmentAimKind()===tacticalEquipment){releaseEquipmentAim();}
    if(e.code==='KeyG'&&equipmentAimKind()===lethalEquipment){releaseEquipmentAim();}
  });
  document.addEventListener('mouseup',e=>{if(e.button===0){mouseFireDown=false;endRecoilBurstIfReleased();}});
  document.addEventListener('selectstart',e=>{if(!isEditableTarget(e.target))e.preventDefault();});
  document.addEventListener('dragstart',e=>e.preventDefault());
  canvas.addEventListener('wheel',onScoreboardWheel,{passive:false});
}

let gameTextEditorTarget=null,gameTextEditorDraft='',gameTextEditorShift=true;
function gameTextMode(){return gameTextEditorTarget?.dataset?.textMode||'callsign';}
function normalizeGameTextDraft(value){
  let text=String(value??'').replace(/[<>\u0000-\u001f\u007f]/g,'');
  if(gameTextMode()==='code')text=text.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,ROOM_CODE_LENGTH);
  else text=text.replace(/\s+/g,' ').slice(0,Math.max(1,Number(gameTextEditorTarget?.dataset?.maxlength)||18));
  return text;
}
function renderKeyboardLetterCase(root,dataKey,caps){
  for(const key of root?.querySelectorAll?.(`[data-${dataKey}-char]`)||[]){const raw=String(key.dataset?.[`${dataKey}Char`]||'');if(/^[a-z]$/i.test(raw))key.textContent=caps?raw.toUpperCase():raw.toLowerCase();}
}
function renderGameTextEditor(){
  if(!gameTextEditorTarget)return;const codeMode=gameTextMode()==='code',caps=codeMode||gameTextEditorShift;gameTextEditorValue.textContent=gameTextEditorDraft;gameTextEditorPlaceholder.textContent=gameTextEditorDraft?'':(gameTextEditorTarget.dataset.placeholder||'');gameTextShiftBtn?.classList.toggle('active',caps);if(gameTextShiftBtn){gameTextShiftBtn.textContent=caps?'CAPS ON':'CAPS';gameTextShiftBtn.disabled=codeMode;}
  gameTextKeyboard?.classList.toggle('code-mode',codeMode);renderKeyboardLetterCase(gameTextKeyboard,'editor',caps);
}
function openGameTextEditor(target){
  if(!target||target.disabled)return false;gameTextEditorTarget=target;gameTextEditorDraft=String(target.value||'');gameTextEditorShift=gameTextMode()==='code';
  const mode=gameTextMode();gameTextEditorTitle.textContent=mode==='code'?'ROOM CODE':mode==='class'?'CLASS NAME':'CALLSIGN';$('gameTextEditorEyebrow').textContent=mode==='code'?'JOIN MATCH':mode==='class'?'CREATE A CLASS':'PLAYER PROFILE';
  gameTextEditor.classList.remove('hide');renderGameTextEditor();clearControllerUiFocus();return true;
}
function closeGameTextEditor(commit){
  if(!gameTextEditorTarget)return;const target=gameTextEditorTarget;if(commit){target.value=normalizeGameTextDraft(gameTextEditorDraft);target.dispatchEvent(new Event('change',{bubbles:true}));}
  gameTextEditorTarget=null;gameTextEditorDraft='';gameTextEditor.classList.add('hide');clearControllerUiFocus();
  if(controllerInputActive())requestAnimationFrame(()=>setControllerUiFocus(target));
}
function cancelGameTextEditor(){closeGameTextEditor(false);}
function commitGameTextEditor(){closeGameTextEditor(true);}
function appendGameTextChar(char){
  if(!gameTextEditorTarget)return;let out=String(char||'');if(gameTextMode()==='code'){out=out.toUpperCase();if(!/^[A-Z0-9]$/.test(out))return;}else if(/^[a-z]$/i.test(out)){out=gameTextEditorShift?out.toUpperCase():out.toLowerCase();}
  const max=gameTextMode()==='code'?ROOM_CODE_LENGTH:Math.max(1,Number(gameTextEditorTarget.dataset.maxlength)||18);if(gameTextEditorDraft.length>=max)return;gameTextEditorDraft=normalizeGameTextDraft(gameTextEditorDraft+out);renderGameTextEditor();
}
function backspaceGameText(){if(!gameTextEditorTarget||!gameTextEditorDraft)return;gameTextEditorDraft=Array.from(gameTextEditorDraft).slice(0,-1).join('');renderGameTextEditor();}
function handleGameTextEditorButton(btn){
  if(!gameTextEditorTarget)return;const char=btn.dataset.editorChar,action=btn.dataset.editorAction;if(char!=null){appendGameTextChar(char);return;}if(action==='shift'){gameTextEditorShift=!gameTextEditorShift;renderGameTextEditor();return;}if(action==='backspace'){backspaceGameText();return;}if(action==='space'){if(gameTextMode()!=='code')appendGameTextChar(' ');return;}if(action==='cancel'){cancelGameTextEditor();return;}if(action==='done')commitGameTextEditor();
}
function handlePhysicalGameTextKey(e){
  if(!gameTextEditorTarget)return false;e.preventDefault();e.stopPropagation();if(e.key==='Escape'){cancelGameTextEditor();return true;}if(e.key==='Enter'){commitGameTextEditor();return true;}if(e.key==='Backspace'){backspaceGameText();return true;}if(e.key===' '){if(gameTextMode()!=='code')appendGameTextChar(' ');return true;}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key?.length===1){if(gameTextMode()==='code')appendGameTextChar(e.key);else{const max=Math.max(1,Number(gameTextEditorTarget.dataset.maxlength)||18);if(gameTextEditorDraft.length<max){gameTextEditorDraft=normalizeGameTextDraft(gameTextEditorDraft+e.key);renderGameTextEditor();}}}return true;
}

function cleanChatText(value){return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,CHAT_MAX_LENGTH);}
function receiveChatMessage(m){
  const text=cleanChatText(m?.text),name=String(m?.name||'Player').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,18)||'Player';if(!text)return;
  chatMessages.push({id:String(m?.id||''),name,team:String(m?.team||'blue')==='red'?'red':'blue',text,until:performance.now()+CHAT_VISIBLE_MS});
  if(chatOpen&&chatScroll>0)chatScroll++;
  while(chatMessages.length>CHAT_MAX_MESSAGES)chatMessages.shift();hudLastDraw=0;
}
function renderChatDraft(){
  const text=chatDraft.slice(0,CHAT_MAX_LENGTH);chatInputText.textContent=text;chatInput.classList.toggle('has-text',!!text);chatShiftBtn?.classList.toggle('active',chatShift);if(chatShiftBtn)chatShiftBtn.textContent=chatShift?'CAPS ON':'CAPS';renderKeyboardLetterCase(chatKeyboard,'chat',chatShift);
}
function setChatDraft(value){chatDraft=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,CHAT_MAX_LENGTH);renderChatDraft();}
function appendChatCharacter(char){
  if(!chatOpen||chatDraft.length>=CHAT_MAX_LENGTH)return;let out=String(char||'');if(!out)return;
  if(/^[a-z]$/i.test(out)){out=chatShift?out.toUpperCase():out.toLowerCase();}
  setChatDraft(chatDraft+out);
}
function backspaceChat(){if(!chatDraft)return;const chars=Array.from(chatDraft);chars.pop();setChatDraft(chars.join(''));}
function handleChatKeyboardButton(btn){
  const char=btn.dataset.chatChar,action=btn.dataset.chatAction;if(char!=null){appendChatCharacter(char);return;}
  if(action==='shift'){chatShift=!chatShift;renderChatDraft();return;}
  if(action==='backspace'){backspaceChat();return;}
  if(action==='space'){appendChatCharacter(' ');return;}
  if(action==='send'){submitChat();return;}
  if(action==='cancel')void dismissChat();
}
function handlePhysicalChatKey(e){
  if(!chatOpen)return false;e.preventDefault();e.stopPropagation();
  if(e.key==='Escape'){void dismissChat();return true;}
  if(e.key==='Enter'){submitChat();return true;}
  if(e.key==='Backspace'){backspaceChat();return true;}
  if(e.key===' '){if(chatDraft.length<CHAT_MAX_LENGTH)setChatDraft(chatDraft+' ');return true;}
  if(!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key?.length===1&&chatDraft.length<CHAT_MAX_LENGTH)setChatDraft(chatDraft+e.key);
  return true;
}
function openChat(){
  if(chatOpen||!shell.inMatch||shell.paused||shell.panel||shell.connecting||hp<=0||!matchAllowsMovement(matchState))return false;
  chatOpen=true;chatScroll=0;chatDrag=null;chatPanel=null;scoreboardOpen=false;chatShift=false;setChatDraft('');suspendGameplayInput();chatComposer.classList.remove('hide');
  if(!isTouch&&document.pointerLockElement===canvas)document.exitPointerLock?.();
  hudLayout=null;hudLastDraw=0;return true;
}
async function dismissChat({restorePointer=true}={}){
  if(!chatOpen){chatComposer.classList.add('hide');return false;}
  chatComposer.classList.add('hide');chatShift=false;setChatDraft('');keys.clear();resetTouchInput();clearFireInput();cancelEquipmentAction();
  const recapture=restorePointer&&!isTouch&&shell.inMatch&&!shell.paused&&!shell.panel&&!controllerInputActive();let captured=true;
  if(recapture)captured=await shell.capturePointerFromGesture();
  chatOpen=false;chatScroll=0;chatDrag=null;chatPanel=null;hudLayout=null;hudLastDraw=0;if(recapture&&!captured)showToast('CLICK GAME TO CAPTURE MOUSE');return true;
}
function submitChat(){
  if(!chatOpen)return;const text=cleanChatText(chatDraft);setChatDraft('');
  if(text){if(socket?.readyState===WebSocket.OPEN)send({t:'chat',text});else showToast('CHAT OFFLINE');}
  void dismissChat();
}

function clipHudText(c,text,maxWidth){let out=String(text||'');if(c.measureText(out).width<=maxWidth)return out;const ell='…';while(out.length>1&&c.measureText(out+ell).width>maxWidth)out=out.slice(0,-1);return out+ell;}
function drawChatFeed(c,L,w,h,now){
  const r=L.chatFeed,rowH=isTouch?17:19,maxRows=Math.max(0,Math.floor(r.h/rowH));if(maxRows<1){chatPanel=null;return;}
  const source=chatMessages.filter(item=>chatOpen||item.until>now),rowLimit=Math.min(maxRows,chatOpen?12:(isTouch?3:5));if(!source.length){chatPanel={...r,maxScroll:0,rowH};return;}
  const maxScroll=chatOpen?Math.max(0,source.length-rowLimit):0;chatScroll=Math.max(0,Math.min(maxScroll,Math.round(chatScroll)));const end=Math.max(0,source.length-chatScroll),start=Math.max(0,end-rowLimit),visible=source.slice(start,end);
  chatPanel={...r,maxScroll,rowH};const x=r.x,y=r.y,boxW=r.w;c.save();c.beginPath();c.rect(x,y,r.w,r.h);c.clip();c.shadowColor='rgba(0,0,0,.88)';c.shadowBlur=3;c.shadowOffsetY=1;let cy=y+rowH/2;
  for(const item of visible){const mine=samePlayerId(item.id,clientId),teamColor=currentModeSpec().teamBased?(TEAM_COLORS[item.team]||'#fff'):'#dfe8ee';c.textAlign='left';c.font=`900 ${isTouch?10:11}px system-ui`;c.fillStyle=mine?HUD_ACCENT:teamColor;const label=`${item.name}: `;c.fillText(label,x+2,cy);const lw=c.measureText(label).width;c.font=`800 ${isTouch?10:11}px system-ui`;c.fillStyle='rgba(244,248,250,.90)';c.fillText(clipHudText(c,item.text,boxW-lw-8),x+2+lw,cy);cy+=rowH;}
  c.shadowColor='transparent';if(chatOpen&&maxScroll>0){const trackH=Math.max(24,Math.min(r.h,visible.length*rowH)),thumbH=Math.max(16,trackH*(rowLimit/source.length)),thumbY=y+(trackH-thumbH)*(1-chatScroll/maxScroll);c.fillStyle='rgba(255,255,255,.22)';c.fillRect(x+r.w-2,thumbY,2,thumbH);}c.restore();
}
function drawChatButton(c,r){
  if(!r)return;const active=chatOpen;roundRect(c,r.x,r.y,r.w,r.h,7,active?'rgba(215,255,88,.18)':HUD_SURFACE,active?'rgba(215,255,88,.55)':HUD_LINE);c.save();c.textAlign='center';c.fillStyle=active?HUD_ACCENT:'#dbe4ea';c.font='1000 10px system-ui';c.fillText('CHAT',r.x+r.w/2,r.y+r.h/2);c.restore();
}

function isEditableTarget(target){return !!target?.isContentEditable;}

function getViewSize(){const v=shell.viewport;return {w:v.w,h:v.h};}
async function resumeFromGesture(){
  ensureAudio();
  if(!shell.inMatch)return;
  if(!(await shell.resumeFromGesture()))return;
  resetTouchInput();
  clock?.getDelta();
}

function onCanvasPointerDown(e){
  if(!shell.canPlay)return;
  const directTouch=e.pointerType==='touch'||e.pointerType==='pen';
  const p=canvasPoint(e);
  if(chatOpen){
    const layout=hudLayout||computeHudLayout();
    if(pointInRect(p.x,p.y,layout.chat)){e.preventDefault();void dismissChat({restorePointer:false});return;}
    if(chatPanel?.maxScroll>0&&pointInRect(p.x,p.y,layout.chatFeed)){e.preventDefault();try{canvas.setPointerCapture(e.pointerId)}catch{}chatDrag={startY:p.y,startScroll:chatScroll,rowH:chatPanel.rowH};touchRoles.set(e.pointerId,'chat-scroll');}
    return;
  }
  ensureAudio();
  if(directTouch){activateTouchInputMode();setActiveInputMode(INPUT_MODE.TOUCH,{quiet:true});}
  else setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
  if(!directTouch&&!isTouch&&document.pointerLockElement!==canvas){void shell.capturePointerFromGesture();return;}
  if(isTouch||directTouch){
    e.preventDefault();
    const layout=hudLayout||computeHudLayout();
    const activeRound=matchAllowsMovement(matchState),liveHud=activeRound&&hp>0;
    // Any canvas control that reveals a DOM surface is armed on press and
    // committed on pointerup. This keeps one physical gesture on one UI
    // surface and prevents the release/click from falling through into a
    // control that did not exist when the press began.
    try{canvas.setPointerCapture(e.pointerId)}catch{}
    if(liveHud&&pointInRect(p.x,p.y,layout.chat)){touchRoles.set(e.pointerId,'open-chat');return;}
    if(activeRound&&hp<=0&&layout.deathLoadout&&pointInRect(p.x,p.y,layout.deathLoadout)){touchRoles.set(e.pointerId,'open-loadout');return;}
    if(scoreboardOpen){
      const panel=scoreboardPanel;
      if(panel?.close&&pointInRect(p.x,p.y,panel.close)){scoreboardOpen=false;scoreboardDrag=null;touchRoles.set(e.pointerId,'scoreboard-close');return;}
      if(panel&&pointInRect(p.x,p.y,panel)&&!touchRoleActive('scoreboard-scroll')){scoreboardDrag={startY:p.y,startScroll:scoreboardScroll};touchRoles.set(e.pointerId,'scoreboard-scroll');return;}
      return;
    }
    if(pointInRect(p.x,p.y,layout.team)){touchRoles.set(e.pointerId,'scoreboard');toggleScoreboard();return;}
    if(matchState.status!==MATCH_STATUS.ENDED&&pointInRect(p.x,p.y,layout.menu)){
      touchRoles.set(e.pointerId,'open-menu');return;
    }
    if(!liveHud)return;
    if(currentWeapon!=='akimbo1887'&&pointInCircle(p.x,p.y,layout.aim)){touchRoles.set(e.pointerId,'aimtoggle');toggleAim();return;}
    if(pointInCircle(p.x,p.y,layout.leftFire)){
      touchVisual.fireUntil=performance.now()+150;pressTouchFire(e.pointerId,currentWeapon==='akimbo1887'?'left':'right');return;
    }
    if(pointInCircle(p.x,p.y,layout.crouch)){touchRoles.set(e.pointerId,'crouch');toggleCrouch();return;}
    if(pointInCircle(p.x,p.y,layout.flash)){touchVisual.flashUntil=performance.now()+160;if(beginEquipmentAim(tacticalEquipment))touchRoles.set(e.pointerId,'equipment');return;}
    if(pointInCircle(p.x,p.y,layout.sticky)){touchVisual.stickyUntil=performance.now()+160;if(beginEquipmentAim(lethalEquipment))touchRoles.set(e.pointerId,'equipment');return;}
    if(pointInCircle(p.x,p.y,layout.fire)){
      touchVisual.fireUntil=performance.now()+150;pressTouchFire(e.pointerId);return;
    }
    if(pointInCircle(p.x,p.y,layout.reload)){
      touchRoles.set(e.pointerId,'reload');touchVisual.reloadUntil=performance.now()+150;doReload();return;
    }
    if(pointInCircle(p.x,p.y,layout.swap)){
      touchRoles.set(e.pointerId,'swap');touchVisual.swapUntil=performance.now()+150;switchWeapon(nextWeapon(currentWeapon));return;
    }
    if(currentWeapon==='assault'&&pointInCircle(p.x,p.y,layout.mode)){
      touchRoles.set(e.pointerId,'mode');touchVisual.modeUntil=performance.now()+150;toggleFireMode();return;
    }
    if(pointInCircle(p.x,p.y,layout.jump)){
      touchRoles.set(e.pointerId,'jump');
      touchVisual.jumpUntil=performance.now()+150;
      tryJump();
      return;
    }
    const moveBoundary=viewW*MOBILE_MOVE_ZONE_RATIO;
    if(!touchRoleActive('joy') && joystickSpawnAllowed(p,layout)){
      joy.centerX=p.x;
      joy.centerY=p.y;
      touchRoles.set(e.pointerId,'joy');
      updateJoy(p.x,p.y,{x:joy.centerX,y:joy.centerY,r:layout.joy.r});
      return;
    }
    if(p.x>moveBoundary&&!touchRoleActive('look')){
      touchRoles.set(e.pointerId,'look');look.x=p.x;look.y=p.y;
    }
    return;
  }

  const layout=hudLayout||computeHudLayout();
  if(scoreboardOpen){const panel=scoreboardPanel;if(e.button===0&&panel?.close&&pointInRect(p.x,p.y,panel.close)){scoreboardOpen=false;scoreboardDrag=null;}return;}
  if(e.button===0){if(currentWeapon==='akimbo1887')requestShot('right');else pressMouseFire();}else if(e.button===2){if(currentWeapon==='akimbo1887')requestShot('left');else toggleAim();}
}

function onCanvasPointerMove(e){
  if(!shell.canPlay)return;
  const role=touchRoles.get(e.pointerId);
  if(!role)return;
  const p=canvasPoint(e);
  e.preventDefault();
  if(role==='scoreboard-scroll'&&scoreboardDrag){const panel=scoreboardPanel;if(panel){scoreboardScroll=Math.max(0,Math.min(panel.maxScroll,scoreboardDrag.startScroll+(scoreboardDrag.startY-p.y)));}return;}
  if(role==='chat-scroll'&&chatDrag&&chatPanel){chatScroll=Math.max(0,Math.min(chatPanel.maxScroll,Math.round(chatDrag.startScroll+(p.y-chatDrag.startY)/Math.max(1,chatDrag.rowH))));hudLastDraw=0;return;}
  if(role==='joy'){const L=hudLayout||computeHudLayout();updateJoy(p.x,p.y,{x:joy.centerX,y:joy.centerY,r:L.joy.r});return;}
  if(role==='look'&&hp>0){
    const dx=p.x-look.x,dy=p.y-look.y;look.x=p.x;look.y=p.y;
    const beforePitch=pitch,sens=aimSensitivityScale()*playerSettings.touchSensitivity;applyPlayerAimDelta(-dx*.006*sens,-dy*.0052*sens);if(diagnosticsRecordingEnabled()&&fireInputHeld()&&Math.abs(pitch-beforePitch)>.02)diagnosticsRecordEvent('touch_look',{dx:diagnosticsRound(dx,2),dy:diagnosticsRound(dy,2),pitchDelta:diagnosticsRound(pitch-beforePitch),pointerId:e.pointerId});
  }
}

function onCanvasPointerEnd(e){
  const role=touchRoles.get(e.pointerId);
  touchRoles.delete(e.pointerId);
  if(role==='fire')endRecoilBurstIfReleased();
  if(role==='joy'){joy.x=joy.y=0;joy.centerX=joy.centerY=0;}
  if(role==='equipment')releaseEquipmentAim();
  if(role==='scoreboard-scroll')scoreboardDrag=null;
  if(role==='chat-scroll')chatDrag=null;
  if(!isTouch&&e.button===0){mouseFireDown=false;endRecoilBurstIfReleased();}
  // Never commit a surface transition from pointercancel/lostpointercapture.
  // pointerup is the completed gesture; pointer capture keeps its target on
  // the canvas until the gesture is finished, so no newly shown DOM button
  // can receive the same release.
  if(e.type!=='pointerup')return;
  if(role==='open-menu'){openPause();return;}
  if(role==='open-chat'){openChat();return;}
  if(role==='open-loadout')openMatchLoadout();
}

function resetTouchInput(){
  touchRoles.clear();mouseFireDown=false;endRecoilBurst();joy.x=joy.y=0;joy.centerX=joy.centerY=0;scoreboardDrag=null;chatDrag=null;cancelEquipmentAction();setAim(false);
}

function updateJoy(x,y,center){
  let dx=x-center.x,dy=y-center.y;const max=center.r*.46;const len=Math.hypot(dx,dy)||1;
  if(len>max){dx=dx/len*max;dy=dy/len*max;}
  joy.x=dx/max;joy.y=dy/max;
}

function canvasPoint(e){const r=canvas.getBoundingClientRect(),rw=Math.max(1,r.width),rh=Math.max(1,r.height);return{x:(e.clientX-r.left)*(viewW/rw),y:(e.clientY-r.top)*(viewH/rh)};}
function pointInCircle(x,y,c){return Math.hypot(x-c.x,y-c.y)<=c.r;}
function pointNearCircle(x,y,c,padding=0){return Math.hypot(x-c.x,y-c.y)<=c.r+padding;}
function joystickSpawnAllowed(p,layout){return p.x<=layout.moveBoundary&&![layout.leftFire,layout.flash,layout.sticky].some(c=>pointNearCircle(p.x,p.y,c,TOUCH_JOY_BUTTON_PADDING));}
function pointInRect(x,y,r){return !!r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
function onScoreboardWheel(e){const p=canvasPoint(e);if(chatOpen&&chatPanel?.maxScroll>0&&pointInRect(p.x,p.y,(hudLayout||computeHudLayout()).chatFeed)){e.preventDefault();chatScroll=Math.max(0,Math.min(chatPanel.maxScroll,chatScroll-Math.sign(e.deltaY)));hudLastDraw=0;return;}if(!scoreboardOpen||!scoreboardPanel)return;e.preventDefault();scoreboardScroll=Math.max(0,Math.min(scoreboardPanel.maxScroll,scoreboardScroll+e.deltaY));}

let matchesRefreshPromise=null;
async function refreshMatches(){
  if(matchesRefreshPromise)return matchesRefreshPromise;
  matchesRefreshPromise=(async()=>{
    try{
      const response=await fetch(`${ONLINE_API}/rooms`,{cache:'no-store'});if(!response.ok)throw new Error('Server unavailable');
      const data=await response.json();renderMatches(Array.isArray(data.rooms)?data.rooms:[]);
    }catch(err){if(!shell.inMatch){matchList.innerHTML='<div class="empty">Multiplayer server unavailable.</div>';matchCount.textContent='';}}
    finally{matchesRefreshPromise=null;}
  })();
  return matchesRefreshPromise;
}
function renderMatches(rooms){
  const visible=rooms;
  matchCount.textContent=rooms.length?String(rooms.length):'';
  if(!rooms.length){matchList.innerHTML='<div class="empty">No live matches. Create one.</div>';return;}
  matchList.innerHTML='';
  for(const room of visible){
    const row=document.createElement('div');row.className='match';
    const left=document.createElement('div');const blue=Number(room.blue)||0,red=Number(room.red)||0,blueBots=Number(room.blueBots)||0,redBots=Number(room.redBots)||0;
    const codeEl=document.createElement('div');codeEl.className='match-code';codeEl.textContent=String(room.code||'');
    const botMeta=document.createElement('div');botMeta.className='match-meta';const roomMode=normalizeGameMode(room.mode),roomSpec=gameModeSpec(roomMode),scoreText=roomSpec.scoreType==='team'?`${Number(room.blueScore)||0}-${Number(room.redScore)||0} / ${Number(room.scoreLimit)||roomSpec.scoreLimit}`:roomSpec.scoreType==='player'?`First ${Number(room.scoreLimit)||roomSpec.scoreLimit}`:'Open play';botMeta.textContent=`${room.custom?'CUSTOM · ':''}${mapSpec(room.mapId).short} · ${roomSpec.short} · ${String(room.matchStatus||'waiting').toUpperCase()} · ${scoreText} · Bots ${blueBots+redBots}`;if(room.custom)codeEl.classList.add('custom-match');
    const teamCounts=document.createElement('div');teamCounts.className='team-counts';
    if(roomSpec.teamBased){const blueChip=document.createElement('span');blueChip.className='team-chip blue';blueChip.textContent=`BLUE ${blue}`;const redChip=document.createElement('span');redChip.className='team-chip red';redChip.textContent=`RED ${red}`;teamCounts.append(blueChip,redChip);}else{const ffaChip=document.createElement('span');ffaChip.className='team-chip ffa';ffaChip.textContent=`COMBATANTS ${blue+red}`;teamCounts.append(ffaChip);}
    left.append(codeEl,botMeta,teamCounts);
    const meta=document.createElement('div');meta.className='match-meta';meta.textContent=`${Number(room.players)||0}/${Number(room.maxPlayers)||0}`;
    const btn=document.createElement('button');btn.className='btn icon-btn';btn.dataset.controllerKey=`room:${String(room.code||'')}`;btn.setAttribute('aria-label',`Join ${room.code}`);btn.innerHTML='<svg class="ui-icon"><use href="#i-enter"/></svg>';btn.addEventListener('click',()=>joinMatch(room.code));
    row.append(left,meta,btn);matchList.append(row);
  }
  
}

async function createMatch(){
  const attempt=beginInitialConnectionAttempt('Creating lobby…');
  myName=safeName();myTeam=preferredTeam;godMode=false;primaryWeapon=preferredPrimary;secondaryWeapon=preferredSecondary;primaryAttachments={...preferredPrimaryAttachments};secondaryAttachments={...preferredSecondaryAttachments};tacticalEquipment=preferredTactical;lethalEquipment=preferredLethal;pendingLoadout=null;pendingTeam='';
  localStorage.setItem('breachName',myName);disableMenu(true);setStatus('Creating lobby…');
  try{
    const response=await fetch(`${ONLINE_API}/rooms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:PROTOCOL_VERSION,client:clientId,auth:clientAuth}),cache:'no-store',signal:initialConnectionSignal(attempt)});
    const data=await response.json();if(!initialConnectionCurrent(attempt))return;if(!response.ok)throw new Error(data.error||'Could not create lobby.');void connectMatch(data.code,false,attempt);
  }catch(err){if(err?.name==='AbortError'||!initialConnectionCurrent(attempt))return;finishInitialConnectionAttempt();shell.cancelConnection();setStatus(err.message||'Could not create lobby.','error');disableMenu(false);}
}
async function joinMatch(code){
  if(code.length!==ROOM_CODE_LENGTH){setStatus('Enter a 4-character room code.','error');return;}
  const attempt=beginInitialConnectionAttempt(`Joining ${code}…`);myName=safeName();myTeam=preferredTeam;godMode=false;loadoutClasses=normalizeLoadoutClasses(preferredLoadoutClasses);activeClassId=normalizeLoadoutClassId(preferredActiveClassId);pendingClassId='';{const c=loadoutClassById(loadoutClasses,activeClassId);primaryWeapon=c.primaryWeapon;secondaryWeapon=c.secondaryWeapon;primaryAttachments={...c.primaryAttachments};secondaryAttachments={...c.secondaryAttachments};tacticalEquipment=c.tactical;lethalEquipment=c.lethal;}pendingLoadout=null;pendingTeam='';
  localStorage.setItem('breachName',myName);disableMenu(true);setStatus(`Joining ${code}…`);void connectMatch(code,false,attempt);
}
function disableMenu(disabled){
  $('createBtn').disabled=disabled;$('joinBtn').disabled=disabled;$('refreshBtn').disabled=disabled;nameInput.disabled=disabled;
  for(const btn of deployTabs)btn.disabled=disabled;
}

async function connectMatch(code, reconnecting=false, initialAttempt=null){
  clearTimeout(reconnectTimer);currentRoom=normalizeCode(code);if(!currentRoom)return;
  if(!reconnecting)shell.updateConnection(`Connecting to ${currentRoom}…`);
  if(socket){try{socket.close(1000,'Replacing connection')}catch{}}
  let ticket='';
  try{
    const signal=!reconnecting?initialConnectionSignal(initialAttempt):null;if(!reconnecting&&!signal)return;const ticketResponse=await fetch(`${ONLINE_API}/rooms/${currentRoom}/ticket`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:PROTOCOL_VERSION,client:clientId,auth:clientAuth,name:myName||safeName(),team:myTeam,primaryWeapon,secondaryWeapon,primaryAttachments,secondaryAttachments,tactical:tacticalEquipment,lethal:lethalEquipment,loadoutClasses,activeClassId}),cache:'no-store',signal});
    const ticketData=await ticketResponse.json();if(!ticketResponse.ok)throw new Error(ticketData.error||'Could not authorize match connection.');ticket=String(ticketData.ticket||'');if(!ticket)throw new Error('Server did not issue a join ticket.');
  }catch(err){if(err?.name==='AbortError'&&!reconnecting)return;if(!shell.inMatch&&!reconnecting){finishInitialConnectionAttempt();shell.cancelConnection();disableMenu(false);setStatus(err.message||'Could not join match.','error');}else scheduleReconnect();return;}
  if(!reconnecting&&!initialConnectionCurrent(initialAttempt))return;const url=`${apiToWs(ONLINE_API)}/rooms/${currentRoom}/socket?protocol=${PROTOCOL_VERSION}&ticket=${encodeURIComponent(ticket)}`;
  let ws;try{ws=new WebSocket(url);socket=ws;}catch{if(!shell.inMatch&&!reconnecting){finishInitialConnectionAttempt();shell.cancelConnection();disableMenu(false);setStatus('Could not open multiplayer connection.','error');}else scheduleReconnect();return;}
  ws.addEventListener('open',()=>{if(ws!==socket)return;reconnectAttempt=0;if(reconnecting){netDiag.reconnects++;netDiagEvent('reconnect');showToast('Reconnected');}});
  ws.addEventListener('message',e=>{if(ws!==socket)return;try{handleMessage(JSON.parse(e.data))}catch(error){netDiag.messageErrors++;console.error('WebSocket message handling failed',error);}});
  ws.addEventListener('close',e=>{
    if(ws!==socket)return;
    netDiag.socketCloses++;netDiagEvent('close',{code:e.code||0});
    if(!reconnecting&&initialConnectionAttempt){finishInitialConnectionAttempt();shell.cancelConnection();disableMenu(false);setStatus(e.reason||'Could not join match.','error');return;}
    if(!roomSessionActive()&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus(e.reason||'Could not join match.','error');return;}
    if(roomSessionActive()&&e.code!==1000){showToast('Connection lost · reconnecting',{priority:3,key:'connection-lost'});scheduleReconnect();}
  });
  ws.addEventListener('error',()=>{if(ws!==socket)return;netDiag.socketErrors++;netDiagEvent('socket_error');if(!shell.inMatch)setStatus('Multiplayer server unreachable.','error');});
}
function scheduleReconnect(){
  if(!roomSessionActive()||!currentRoom)return;clearTimeout(reconnectTimer);reconnectAttempt++;
  reconnectTimer=setTimeout(()=>connectMatch(currentRoom,true),Math.min(5000,700*reconnectAttempt));
}
function send(payload){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(payload));}
function serverNow(){return Date.now()+serverClockOffset;}
function normalizeClientMatch(value){const v=value&&typeof value==='object'?value:{};return{...normalizeSharedMatchState(v,Date.now(),v),serverTime:Number(v.serverTime)||serverNow()};}
function applyMatchPhaseTransition(previous,next){
  if(!matchPhaseChanged(previous,next))return;
  if(!matchAllowsCombat(next)){clearFireInput();cancelEquipmentAction();setAim(false);reloadRequestPending=false;}
  if(next.status===MATCH_STATUS.ENDED){
    // Final results own the match surface. Tear down the active UI through its
    // normal owner before exposing the read-only post-match presentation.
    if(gameTextEditorTarget)cancelGameTextEditor();
    if(shell.panel===SHELL_PANEL.SETTINGS)cancelPlayerSettings();
    else if(shell.panel===SHELL_PANEL.ADMIN)closeAdminPanel();
    else if(shell.panel===SHELL_PANEL.LOADOUT)closeMatchLoadout();
    shell.showMatchPresentation?.();clearControllerUiFocus();
    reloadUntil=0;reloadWeapon='';reloadStartedAt=0;pendingWeapon='';weaponSwapStartedAt=0;localEquipmentCooldownUntil=0;sprintActionReadyAt=0;clearQueuedSprintShot();resetRecoilBookkeeping();
    if(chatOpen)void dismissChat({restorePointer:false});else chatComposer.classList.add('hide');
    scoreboardOpen=false;scoreboardScroll=0;scoreboardDrag=null;scoreboardPanel=null;clearToastNotifications();announcerCurrent=null;announcerQueue.length=0;killConfirmUntil=0;damageIndicators.length=0;bloodSplats.length=0;
  }
  if(!matchAllowsMovement(next)){
    traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;
    moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;jumpBufferedUntil=0;localMoveAmount=0;
    crouchWanted=false;crouched=false;stopSlide();cancelSprint();
  }
  if(next.status===MATCH_STATUS.ACTIVE){
    clearFireInput();cancelEquipmentAction();lastStateSent=0;fireReadyAt=freshClientFireReady();
    traversal=null;ladderState=null;traversalIntentUntil=0;jumpBufferedUntil=0;moveVelocityX=moveVelocityZ=0;knockX=knockZ=0;
  }
}
function applyClientMatchState(value){const previous=matchState,next=normalizeClientMatch(value);matchState=next;applyMatchPhaseTransition(previous,next);return next;}
function matchClockText(){const m=matchState,now=serverNow(),spec=gameModeSpec(m.mode);if(m.status==='warmup')return `START ${(Math.max(0,m.warmupEndsAt-now)/1000).toFixed(1)}`;if(m.status==='active'){if(spec.scoreType==='none')return 'SANDBOX';const sec=Math.max(0,Math.ceil((m.endsAt-now)/1000)),min=Math.floor(sec/60);return `${min}:${String(sec%60).padStart(2,'0')}`;}if(m.status==='ended'){if(m.winner==='draw')return 'DRAW';if(m.winnerName)return `${String(m.winnerName).toUpperCase()} WINS`;return `${String(m.winner||'').toUpperCase()} WINS`;}return 'LOBBY';}

function resetMatchPresentationForLobby(){
  if(chatOpen)void dismissChat({restorePointer:false});else chatComposer.classList.add('hide');
  chatMessages.length=0;scoreboardOpen=false;scoreboardScroll=0;scoreboardDrag=null;scoreboardPanel=null;clearToastNotifications();announcerCurrent=null;announcerQueue.length=0;
  resetTouchInput();clearFireInput();cancelEquipmentAction();keys.clear();clearRemotes();clearBullets();clearRocketTrailPuffs();clearThrowables();clearTacticalFx();clearSmokeClouds();
  killFeed.length=0;bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;blastFeedbackUntil=blastFeedbackPower=blastFeedbackSeed=0;headshotUntil=0;killConfirmUntil=0;killConfirmHeadshot=false;killConfirmDistance=0;lastShotVisualAt=0;wastedUntil=0;lastWastedBy='';lastWastedWeapon='';lastWastedHeadshot=false;lastWastedDistance=0;deathViewStartYaw=0;deathViewTargetYaw=NaN;deathViewStartPitch=0;
  traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;jumpBufferedUntil=0;crouchWanted=false;crouched=false;crouchBlend=0;stopSlide();cancelSprint();setAim(false);hudLayout=null;hudLastDraw=0;resetLocalPredictionHistory();resetRemoteNetworkTiming();
}
function handleMatchLobby(m){
  applyClientMatchState(m.match);matchCustom=!!m.custom;const players=Array.isArray(m.players)?m.players:[],bots=Array.isArray(m.bots)?m.bots:[],self=players.find(player=>samePlayerId(player?.id,clientId))||null;
  if(self){myTeam=self.team||myTeam;rememberTeam(myTeam);pendingTeam='';if(self.activeClassId)activeClassId=normalizeLoadoutClassId(self.activeClassId);pendingClassId=self.pendingClassId?normalizeLoadoutClassId(self.pendingClassId):'';primaryWeapon=PRIMARY_WEAPONS.includes(self.primaryWeapon)?self.primaryWeapon:primaryWeapon;secondaryWeapon=SECONDARY_WEAPONS.includes(self.secondaryWeapon)?self.secondaryWeapon:secondaryWeapon;applyAttachmentState(self);tacticalEquipment=normalizeTactical(self.tactical);lethalEquipment=normalizeLethal(self.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberSecondary(secondaryWeapon);rememberAttachments(primaryAttachments,secondaryAttachments);rememberEquipment(tacticalEquipment,lethalEquipment);currentWeapon=primaryWeapon;godMode=!!self.godMode;hp=Math.max(0,Math.min(100,Number(self.hp??100)||0));myStats={kills:Number(self.kills)||0,deaths:Number(self.deaths)||0};ammo=normalizeClientAmmo(self.ammo);equipment=normalizeEquipment(self.equipment);selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;syncLocalWeaponModel();}
  lobbyLoadoutDraft=null;lobbyClassDrafts=null;lobbyLoadoutDirty=false;lobbyStartingClassId=normalizeLoadoutClassId(activeClassId);loadoutEditClass.lobby=normalizeLoadoutClassId(activeClassId);rememberLoadoutClasses(loadoutClasses,activeClassId);pendingGameSnapshot=self?gameSnapshot(self,players,bots,m.match?.serverTime):null;replaceLobbyParticipants(players,bots);resetMatchPresentationForLobby();syncModeVisuals();syncPauseContext();showLobby();
}

function handleMessage(m){
  if(m.t==='welcome'){
    finishInitialConnectionAttempt();
    if(Number(m.protocol)!==PROTOCOL_VERSION){showToast('CLIENT / SERVER VERSION MISMATCH');leaveMatch();return;}
    if(Number.isFinite(Number(m.serverTime)))serverClockOffset=Number(m.serverTime)-Date.now();
    setActiveMap(m.mapId,{rebuild:true});currentRoom=m.code;isMatchAdmin=!!m.isAdmin;matchOwnerId=String(m.ownerClientId||'');applyWorldSettings(m.settings||DEFAULT_WORLD_SETTINGS);botConfig=normalizeBotConfig(m.botConfig);matchState=normalizeClientMatch(m.match);matchCustom=!!m.custom;myTeam=m.self.team||myTeam;rememberTeam(myTeam);selfColor=TEAM_COLORS[myTeam]||m.self.color||selfColor;godMode=!!m.self.godMode;verticalVelocity=Number.isFinite(Number(m.self.verticalVelocity))?Number(m.self.verticalVelocity):0;moveVelocityX=moveVelocityZ=0;onGround=m.self.grounded!==false;lastGroundedAt=onGround?performance.now():0;jumpBufferedUntil=0;crouched=!!m.self.crouched;crouchWanted=crouched;crouchBlend=crouched?1:0;stopSlide();cancelSprint();jumpSeq=Math.max(0,Math.floor(Number(m.self.jumpSeq)||0));traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;hp=m.self.hp??100;myStats={kills:Number(m.self.kills)||0,deaths:Number(m.self.deaths)||0};wastedUntil=m.self.wastedUntil||0;loadoutClasses=normalizeLoadoutClasses(m.self.loadoutClasses??loadoutClasses,selectedLoadout());activeClassId=normalizeLoadoutClassId(m.self.activeClassId??activeClassId);pendingClassId=m.self.pendingClassId?normalizeLoadoutClassId(m.self.pendingClassId):'';primaryWeapon=PRIMARY_WEAPONS.includes(m.self.primaryWeapon)?m.self.primaryWeapon:primaryWeapon;secondaryWeapon=SECONDARY_WEAPONS.includes(m.self.secondaryWeapon)?m.self.secondaryWeapon:secondaryWeapon;applyAttachmentState(m.self);tacticalEquipment=normalizeTactical(m.self.tactical);lethalEquipment=normalizeLethal(m.self.lethal);pendingLoadout=m.self.pendingLoadout?normalizeLoadoutChoice(m.self.pendingLoadout):null;rememberPrimary(primaryWeapon);rememberSecondary(secondaryWeapon);rememberAttachments(primaryAttachments,secondaryAttachments);rememberEquipment(tacticalEquipment,lethalEquipment);rememberLoadoutClasses(loadoutClasses,pendingClassId||activeClassId);pendingTeam=m.self.pendingTeam||'';currentWeapon=(m.self.weapon===secondaryWeapon||m.self.weapon===primaryWeapon)?m.self.weapon:primaryWeapon;ammo=normalizeClientAmmo(m.self.ammo);equipment=normalizeEquipment(m.self.equipment);pendingWeapon='';reloadRequestPending=false;reloadUntil=m.self.reloadAt||0;reloadWeapon=m.self.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;warmWeaponAudio(currentWeapon);syncLocalWeaponModel();
    yaw=m.self.yaw||0;pitch=m.self.pitch||0;recoilDebtPitch=recoilDebtYaw=recoilPatternPitch=recoilPatternYaw=0;recoilBurstActive=false;recoilBurstWeapon='';recoilBurstReleaseAt=0;recoilBurstEndedAt=performance.now();weaponKickZ=weaponKickVelocity=0;resetLocalPredictionHistory();resetRemoteNetworkTiming();pendingGameSnapshot=gameSnapshot(m.self,m.players||[],m.bots||[],m.serverTime);replaceLobbyParticipants(m.players||[],m.bots||[]);
    syncModeVisuals();syncLocalStatus();syncPauseContext();if(matchAllowsLobbyEdits(matchState))showLobby();else{void enterGame(pendingGameSnapshot);}return;
  }
  if(m.t==='join'){upsertLobbyParticipant(m.player);if(shell.inMatch&&engineReady)upsertRemote(m.player,true);syncPauseContext();renderAdminPlayers();if(shell.inLobby)renderLobbyRoster(lobbyDisplayMode());showToast(`${m.player.name} joined`);return;}
  if(m.t==='leave'){const lobbyRow=lobbyParticipants.get(String(m.id||'')),r=remotes.get(m.id);if((lobbyRow&&!lobbyRow.bot)||(r&&!r.bot))showToast(`${lobbyRow?.name||r?.name||'Player'} left`);removeLobbyParticipant(m.id);if(engineReady)removeRemote(m.id);syncPauseContext();renderAdminPlayers();if(shell.inLobby)renderLobbyRoster(lobbyDisplayMode());return;}
  if(m.t==='lobbyPlayer'){
    const p=m.player;if(!p?.id)return;
    const rev=Math.max(0,Math.floor(Number(m.rev)||0));
    if(p.id===clientId){
      // A lobby loadout broadcast can arrive after the player has already moved
      // to a newer local selection. Never let an older broadcast repaint it.
      if(!(shell.inLobby&&rev&&rev<lobbyLoadoutRevision)){myTeam=p.team||myTeam;rememberTeam(myTeam);if(p.activeClassId)activeClassId=normalizeLoadoutClassId(p.activeClassId);pendingClassId=p.pendingClassId?normalizeLoadoutClassId(p.pendingClassId):'';primaryWeapon=PRIMARY_WEAPONS.includes(p.primaryWeapon)?p.primaryWeapon:primaryWeapon;secondaryWeapon=SECONDARY_WEAPONS.includes(p.secondaryWeapon)?p.secondaryWeapon:secondaryWeapon;applyAttachmentState(p);tacticalEquipment=normalizeTactical(p.tactical);lethalEquipment=normalizeLethal(p.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberSecondary(secondaryWeapon);rememberAttachments(primaryAttachments,secondaryAttachments);rememberEquipment(tacticalEquipment,lethalEquipment);currentWeapon=primaryWeapon;godMode=!!p.godMode;ammo=normalizeClientAmmo(p.ammo);equipment=normalizeEquipment(p.equipment);selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;syncLocalWeaponModel();}
    }else{upsertLobbyParticipant(p);if(shell.inMatch&&engineReady)upsertRemote(p,true);}
    syncPauseContext();syncLobby();return;
  }
  if(m.t==='state'){const r=remotes.get(m.id);if(r)updateRemoteTarget(r,m);return;}
  if(m.t==='traverse'){if(samePlayerId(m.id,clientId)&&m.accepted===false)recordNetReject('traverse',m.reason||'rejected');handleTraversalMessage(m);return;}
  if(m.t==='ladder'){if(samePlayerId(m.id,clientId)&&m.accepted===false)recordNetReject('ladder',m.reason||m.action);handleLadderMessage(m);return;}
  if(m.t==='correction'){applyServerCorrection(m);return;}
  if(m.t==='botState'){for(const b of m.bots||[])upsertRemote({...b,at:m.at},false);return;}
  if(m.t==='shot'){handleShot(m);return;}
  if(m.t==='projectileState'){updateLauncherProjectileState(m);return;}
  if(m.t==='bulletImpact'){spawnBulletImpactFx(m);return;}
  if(m.t==='bulletEnd'){removeBullet(m.id);return;}
  if(m.t==='equipment'){equipment=normalizeEquipment(m.equipment);return;}
  if(m.t==='equipmentAction'){if(m.accepted===false)recordNetReject('equipment',m.reason||m.action);if(m.action==='begin'&&m.accepted===false&&combatAction.phase===COMBAT_ACTION.EQUIPMENT_AIM)cancelEquipmentAction({notify:false});return;}
  if(m.t==='throwable'){spawnThrowableVisual(m);return;}
  if(m.t==='throwableState'){updateThrowableVisual(m);return;}
  if(m.t==='throwableImpact'){handleThrowableImpact(m);return;}
  if(m.t==='throwAck'){if(m.accepted===false){recordNetReject('throw',m.reason);removeThrowableVisual(m.id);}return;}
  if(m.t==='throwableEnd'){removeThrowableVisual(m.id);return;}
  if(m.t==='flashDetonate'){soundTacticalDetonation('flash',m);spawnDetonationFx('flash',m);removeThrowableVisual(m.id);return;}
  if(m.t==='smokeDetonate'){soundTacticalDetonation('smoke',m);spawnSmokeCloud(m);removeThrowableVisual(m.id);return;}
  if(m.t==='flashEffect'){applyFlashEffect(m);return;}
  if(m.t==='explosion'){applyExplosionFeedback(m.kind||'sticky',m);const projectile=bullets.get(m.id);if(projectile?.type==='launcher')projectile.root.position.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);soundTacticalDetonation(m.kind||'sticky',m);spawnDetonationFx(m.kind||'sticky',m);removeBullet(m.id);removeThrowableVisual(m.id);return;}
  if(m.t==='chat'){receiveChatMessage(m);return;}
  if(m.t==='loadout'){applyAuthoritativeLoadout(m);return;}
  if(m.t==='weapon'){const r=remotes.get(m.id);if(r){r.weapon=m.weapon||'pistol';r.swapStartedAt=performance.now();syncRemoteWeapon(r);}return;}
  if(m.t==='reload'){const r=remotes.get(m.id);if(r){r.reloadUntil=Number(m.reloadAt)||0;r.reloadStartedAt=serverNow();r.reloadWeapon=m.weapon||r.weapon;if(r.reloadWeapon!=='shotgun'&&r.reloadUntil)playSpatialCue(reloadSoundId(r.reloadWeapon),r.group.position.x,r.group.position.y+1,r.group.position.z,34,.72);}return;}
  if(m.t==='reloadShell'){const r=remotes.get(m.id);if(r){r.reloadUntil=Number(m.reloadAt)||0;r.reloadStartedAt=r.reloadUntil?serverNow():0;r.reloadWeapon=r.reloadUntil?'shotgun':'';playSpatialCue('reloadShotgun',r.group.position.x,r.group.position.y+1,r.group.position.z,34,.72);}return;}
  if(m.t==='god'){if(typeof m.custom==='boolean')matchCustom=m.custom;if(m.id===clientId){godMode=!!m.enabled;syncLobby();syncPauseContext();if(shell.panel===SHELL_PANEL.LOADOUT)syncMatchLoadoutEditor();showToast(godMode?'GOD MODE ENABLED':'GOD MODE DISABLED',{priority:2,key:'god-mode-state'});}else{const row=lobbyParticipants.get(String(m.id||''));if(row)row.godMode=!!m.enabled;const r=remotes.get(m.id);if(r){r.godMode=!!m.enabled;if(r.godRing)r.godRing.visible=r.godMode;}}renderAdminPlayers();syncLobby();return;}
  if(m.t==='adminRole'){if(m.id===clientId){isMatchAdmin=!!m.enabled;syncPauseContext();if(!isMatchAdmin&&shell.panel===SHELL_PANEL.ADMIN)closeAdminPanel();showToast(isMatchAdmin?'ADMIN PRIVILEGES GRANTED':'ADMIN PRIVILEGES REMOVED');}else{const row=lobbyParticipants.get(String(m.id||''));if(row)row.admin=!!m.enabled;const r=remotes.get(m.id);if(r)r.admin=!!m.enabled;}renderAdminPlayers();syncLobby();return;}
  if(m.t==='teamQueued'){if(m.id===clientId){pendingTeam=m.pendingTeam||'';syncPauseContext();showToast(pendingTeam?`TEAM SWITCH QUEUED · ${pendingTeam.toUpperCase()}`:'TEAM SWITCH CANCELED');syncLobby();}return;}
  if(m.t==='matchLobby'){handleMatchLobby(m);return;}
  if(m.t==='match'){applyClientMatchState(m.match);matchCustom=!!m.custom;if(shell.panel===SHELL_PANEL.ADMIN&&m.rulesUpdated&&m.by===clientId)setAdminStatus('Match rules updated in the lobby.','ok');if(matchAllowsLobbyEdits(matchState)){syncLobby();syncModeVisuals();}return;}
  if(m.t==='matchReset'){if(m.mapId)setActiveMap(m.mapId,{rebuild:true});if(m.settings)applyWorldSettings(m.settings);if(m.botConfig)botConfig=normalizeBotConfig(m.botConfig);lobbyMatchDraft=null;lobbyMatchDirty=false;lobbyMapDraft='';lobbyMapDirty=false;lobbyLoadoutDraft=null;lobbyClassDrafts=null;lobbyLoadoutDirty=false;lobbyLoadoutRevision=0;lobbyLoadoutAckRevision=0;applyClientMatchState(m.match);matchCustom=!!m.custom;myStats={kills:0,deaths:0};const players=m.players||[],bots=m.bots||[],self=players.find(pl=>pl?.id===clientId)||null;if(self){myTeam=self.team||myTeam;pendingTeam='';if(self.activeClassId)activeClassId=normalizeLoadoutClassId(self.activeClassId);pendingClassId=self.pendingClassId?normalizeLoadoutClassId(self.pendingClassId):'';primaryWeapon=PRIMARY_WEAPONS.includes(self.primaryWeapon)?self.primaryWeapon:primaryWeapon;secondaryWeapon=SECONDARY_WEAPONS.includes(self.secondaryWeapon)?self.secondaryWeapon:secondaryWeapon;applyAttachmentState(self);tacticalEquipment=normalizeTactical(self.tactical);lethalEquipment=normalizeLethal(self.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberSecondary(secondaryWeapon);rememberAttachments(primaryAttachments,secondaryAttachments);rememberEquipment(tacticalEquipment,lethalEquipment);rememberLoadoutClasses(loadoutClasses,activeClassId);}pendingGameSnapshot=gameSnapshot(self,players,bots,m.match?.serverTime);replaceLobbyParticipants(players,bots);syncModeVisuals();if(shell.inLobby||!engineReady){void enterGame(pendingGameSnapshot,{resetRound:true});}else applyGameSnapshot(pendingGameSnapshot,{resetRound:true});showToast('MATCH STARTING',{duration:1100,key:'match-start'});return;}
  if(m.t==='blocked'){handleBlocked(m);return;}
  if(m.t==='kill'){handleKill(m);return;}
  if(m.t==='settings'){applyWorldSettings(m.settings||DEFAULT_WORLD_SETTINGS);if(typeof m.custom==='boolean')matchCustom=m.custom;const section=m.section==='advanced'?'advanced':'gameplay';if(shell.panel===SHELL_PANEL.ADMIN){if(m.by===clientId){if(section==='advanced')populateAdminWeapons(worldSettings);else populateAdminGameplay(worldSettings);setAdminStatus(section==='advanced'?'Weapons applied.':'Gameplay applied.','ok');}else if(activeAdminTab!==section){if(section==='advanced')populateAdminWeapons(worldSettings);else populateAdminGameplay(worldSettings);}}syncLobby();showToast(section==='advanced'?'WEAPON RULES UPDATED':'GAMEPLAY RULES UPDATED');return;}
  if(m.t==='bots'){botConfig=normalizeBotConfig(m.config);syncLobbyBots(m.bots||[]);if(shell.inMatch&&engineReady)syncBotRoster(m.bots||[]);syncLobby();if(shell.panel===SHELL_PANEL.ADMIN){populateAdminBots(botConfig);setAdminStatus(shell.inMatch?'Live bot roster updated.':'Lobby bot roster updated.','ok');}showToast(`BOTS · ${botConfig.difficulty.toUpperCase()}`);return;}
  if(m.t==='notice'){showToast(m.text||'Server notice',{priority:m.tone==='error'?3:1,key:`notice:${m.text||'server'}`});if(shell.panel===SHELL_PANEL.ADMIN)setAdminStatus(m.text||'Server notice',m.tone==='error'?'error':'');return;}
  if(m.t==='pong'){const echoed=Number(m.clientAt)||lastPingLocalAt;if(echoed&&Number.isFinite(Number(m.at))){const received=Date.now(),mid=echoed+(received-echoed)/2,estimate=Number(m.at)-mid;recordNetPong(echoed,received,m.net);serverClockOffset=serverClockOffset*.7+estimate*.3;}return;}
  if(m.t==='health'){if(m.id===clientId){hp=Math.max(0,Math.min(100,Number(m.hp)||0));syncLocalStatus();}else{const r=remotes.get(m.id);if(r)r.hp=Math.max(0,Math.min(100,Number(m.hp)||0));}return;}
  if(m.t==='hit'){handleHit(m);return;}
  if(m.t==='respawn'){handleRespawn(m.player);return;}
}

async function enterGame(snapshot=pendingGameSnapshot,{resetRound=false}={}){
  finishInitialConnectionAttempt();stopIntroMusic();shell.beginConnection('Loading game…');
  if(!(await prepareGameRuntime())){shell.cancelConnection();if(matchAllowsLobbyEdits(matchState))shell.enterLobby();return;}
  if(snapshot)applyGameSnapshot(snapshot,{resetRound});
  await shell.enterMatch();syncPauseContext();disableMenu(false);setStatus('Ready.');
  const url=new URL(location.href);url.searchParams.set('room',currentRoom);history.replaceState(null,'',url);onResize();
}

function returnToLobby(){
  if(!shell.inMatch)return;
  if(socket?.readyState!==WebSocket.OPEN||!currentRoom){showToast('LOBBY CONNECTION UNAVAILABLE',{priority:3,key:'lobby-return-unavailable'});return;}
  const button=$('leaveBtn');if(button){button.disabled=true;const label=button.querySelector('span');if(label)label.textContent='Returning…';}
  send({t:'returnLobby'});showToast('RETURNING TO LOBBY',{duration:900,key:'returning-lobby'});
}

let lobbyQuitReturnFocusKey='';
function lobbyQuitPromptOpen(){return !!lobbyQuitConfirm&&!lobbyQuitConfirm.classList.contains('hide');}
function openLobbyQuitConfirm(){
  if(!shell.inLobby||!lobbyQuitConfirm)return false;lobbyQuitReturnFocusKey=controllerFocusKey(controllerUiFocus);clearControllerUiEditing();lobbyQuitConfirm.classList.remove('hide');clearControllerUiFocus();
  if(controllerInputActive())requestAnimationFrame(()=>setControllerUiFocus($('lobbyQuitStayBtn')));return true;
}
function closeLobbyQuitConfirm(){
  if(!lobbyQuitPromptOpen())return false;const restore=lobbyQuitReturnFocusKey;lobbyQuitReturnFocusKey='';lobbyQuitConfirm.classList.add('hide');clearControllerUiFocus();
  if(controllerInputActive())requestAnimationFrame(()=>{const list=controllerFocusableElements(),target=(restore&&list.find(el=>controllerFocusKey(el)===restore))||$('lobbyLeaveBtn');if(target)setControllerUiFocus(target);});return true;
}
function confirmLobbyQuit(){if(lobbyQuitConfirm)lobbyQuitConfirm.classList.add('hide');lobbyQuitReturnFocusKey='';leaveMatch();}

function leaveMatch(){
  if(lobbyQuitConfirm)lobbyQuitConfirm.classList.add('hide');lobbyQuitReturnFocusKey='';cancelInitialConnection('',{silent:true});if(chatOpen)void dismissChat({restorePointer:false});chatMessages.length=0;
  shell.leaveToMenu();disableMenu(false);serverClockOffset=0;lastPingLocalAt=0;resetLocalPredictionHistory();resetRemoteNetworkTiming();clearTimeout(reconnectTimer);if(socket){try{socket.close(1000,'Left match')}catch{}}socket=null;currentRoom='';isMatchAdmin=false;matchOwnerId='';lobbyParticipants.clear();pendingGameSnapshot=null;lobbyMatchDraft=null;lobbyMatchDirty=false;lobbyMapDraft='';lobbyMapDirty=false;lobbyLoadoutDraft=null;lobbyClassDrafts=null;lobbyLoadoutDirty=false;lobbyLoadoutRevision=0;lobbyLoadoutAckRevision=0;syncLobbyHostControlPlacement();applyWorldSettings(DEFAULT_WORLD_SETTINGS);
  resetTouchInput();clearRemotes();clearBullets();clearBulletImpactFx();clearRocketTrailPuffs();clearThrowables();clearTacticalFx();clearSmokeClouds();keys.clear();hp=100;wastedUntil=0;godMode=false;pendingTeam='';matchState=normalizeClientMatch(null);matchCustom=false;loadoutClasses=normalizeLoadoutClasses(preferredLoadoutClasses);activeClassId=normalizeLoadoutClassId(preferredActiveClassId);pendingClassId='';{const c=loadoutClassById(loadoutClasses,activeClassId);primaryWeapon=c.primaryWeapon;secondaryWeapon=c.secondaryWeapon;primaryAttachments={...c.primaryAttachments};secondaryAttachments={...c.secondaryAttachments};tacticalEquipment=c.tactical;lethalEquipment=c.lethal;}pendingLoadout=null;currentWeapon=primaryWeapon;crouchWanted=false;crouched=false;crouchBlend=0;stopSlide();cancelSprint();viewFeetY=NaN;verticalVelocity=moveVelocityX=moveVelocityZ=0;lastGroundedAt=0;jumpBufferedUntil=0;recoilDebtPitch=recoilDebtYaw=recoilPatternPitch=recoilPatternYaw=0;recoilBurstActive=false;recoilBurstWeapon='';recoilBurstReleaseAt=0;recoilBurstEndedAt=performance.now();weaponKickZ=weaponKickVelocity=0;lastLocalShotAt=0;localShotHeat=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localShotHeatAt=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localRecoilStep=Object.fromEntries(WEAPON_ORDER.map(name=>[name,-1]));localWeaponShotSequence=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;ammo=freshClientAmmo();equipment=freshClientEquipment(tacticalEquipment,lethalEquipment);reloadRequestPending=false;lastStateSent=0;lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,grounded:true,moveX:0,moveZ:0,ladderId:'',ladderMove:0};pendingWeapon='';reloadUntil=0;reloadWeapon='';reloadStartedAt=0;weaponSwapStartedAt=0;deathAnimStartedAt=0;localMoveAmount=0;landingKick=0;nextFootstepAt=0;footstepSide=0;shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;fireReadyAt=freshClientFireReady();akimboReadyAt={left:0,right:0};akimboLeftCycleStartedAt=akimboRightCycleStartedAt=0;akimboCycleSoundPlayed={left:false,right:false};clearFireInput();localEquipmentCooldownUntil=0;lastSimHeartbeat=0;cancelEquipmentAction();killFeed.length=0;bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;blastFeedbackUntil=blastFeedbackPower=blastFeedbackSeed=0;lastShotVisualAt=0;myStats={kills:0,deaths:0};scoreboardOpen=false;killConfirmUntil=0;killConfirmHeadshot=false;killConfirmDistance=0;headshotUntil=0;announcerCurrent=null;announcerQueue.length=0;clearToastNotifications();setAim(false);syncLocalWeaponModel();
  const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);refreshMatches();
}

function normalizeBotConfig(value){const v=value&&typeof value==='object'?value:{};const blueBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(v.blueBots)||0))),redBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(v.redBots)||0)));const diff=['easy','normal','hard','elite'].includes(String(v.difficulty||'normal').toLowerCase())?String(v.difficulty||'normal').toLowerCase():'normal';return{blueBots,redBots,difficulty:diff};}
function syncBotRoster(list){const incoming=new Set((list||[]).map(b=>b.id));for(const [id,r] of remotes){if(r.bot&&!incoming.has(id))removeRemote(id);}for(const b of list||[])upsertRemote(b,true);syncPauseContext();}
function setAdminStatus(text,tone=''){const el=$('adminStatus');el.textContent=text;el.className=`admin-status ${tone}`;}
let activeAdminTab='gameplay';
function availableAdminTabs(){return [...document.querySelectorAll('[data-admin-tab]')].filter(tab=>!tab.classList.contains('hide'));}
function syncAdminContext(){
  $('adminTitle').textContent='Host control';
  const liveBots=document.querySelector('.admin-bot-card');
  liveBots?.classList.toggle('hide',!shell.inMatch);
  $('adminDescription').textContent=shell.inLobby?'Advanced host tuning only. Match rules, map and bots stay in their lobby tabs.':'Changes are staged until Apply. Player commands act immediately.';
}
function switchAdminTab(tab){
  const tabs=availableAdminTabs(),requested=tabs.find(btn=>btn.dataset.adminTab===tab);
  activeAdminTab=requested?.dataset.adminTab||tabs[0]?.dataset.adminTab||'match';
  for(const page of document.querySelectorAll('[data-admin-page]'))page.classList.toggle('hide',page.dataset.adminPage!==activeAdminTab);
  for(const b of document.querySelectorAll('[data-admin-tab]')){const active=b.dataset.adminTab===activeAdminTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
  const players=activeAdminTab==='players',cancelBtn=$('adminCancelBtn');$('adminResetBtn').classList.toggle('hide',players);$('adminSaveBtn').classList.toggle('hide',players);if(cancelBtn)cancelBtn.textContent=players?'CLOSE':'CANCEL';document.querySelector('.admin-shell').dataset.page=activeAdminTab;if(players){setAdminStatus('Player commands apply immediately.');renderAdminPlayers(true);}
}
function syncAdminBotDraftSummary(){
  const ffa=normalizeGameMode(matchState.mode)==='ffa',blue=Math.max(0,Math.floor(Number($('adminBlueBotCount')?.value)||0)),red=Math.max(0,Math.floor(Number($('adminRedBotCount')?.value)||0)),total=ffa?Math.max(0,Math.floor(Number($('adminFfaBotCount')?.value)||0)):blue+red,diff=String($('adminBotDifficulty')?.value||botConfig.difficulty||'normal');
  if($('adminBotSummary'))$('adminBotSummary').textContent=`${Math.min(MAX_BOTS,total)} / ${MAX_BOTS} bots · ${diff.replace(/^./,c=>c.toUpperCase())}`;
}
function populateAdminBots(value=botConfig){
  const cfg=normalizeBotConfig(value),ffa=normalizeGameMode(matchState.mode)==='ffa',total=Math.min(MAX_BOTS,cfg.blueBots+cfg.redBots);
  $('adminBlueBotWrap')?.classList.toggle('hide',ffa);$('adminRedBotWrap')?.classList.toggle('hide',ffa);$('adminFfaBotWrap')?.classList.toggle('hide',!ffa);
  if($('adminBlueBotCount'))$('adminBlueBotCount').value=String(cfg.blueBots);if($('adminRedBotCount'))$('adminRedBotCount').value=String(cfg.redBots);if($('adminFfaBotCount'))$('adminFfaBotCount').value=String(total);if($('adminBotDifficulty'))$('adminBotDifficulty').value=cfg.difficulty;
  if($('adminBotHelp'))$('adminBotHelp').textContent=ffa?'Bot count changes apply to the live FFA roster immediately after Apply.':'Blue and Red bot counts reconcile the live match immediately after Apply.';syncAdminBotDraftSummary();
}
function collectAdminBotConfig(){
  const ffa=normalizeGameMode(matchState.mode)==='ffa';let blue,red;if(ffa){const total=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number($('adminFfaBotCount')?.value)||0)));blue=Math.ceil(total/2);red=Math.floor(total/2);}else{blue=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number($('adminBlueBotCount')?.value)||0)));red=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number($('adminRedBotCount')?.value)||0)));if(blue+red>MAX_BOTS)return null;}return{blueBots:blue,redBots:red,difficulty:String($('adminBotDifficulty')?.value||'normal')};
}
function populateAdminGameplay(value){const x=normalizeWorldSettings(value);$('setRunSpeed').value=x.movement.runSpeed;$('setWalkSpeed').value=x.movement.walkSpeed;$('setJumpHeight').value=x.movement.jumpHeight;$('setGravity').value=x.movement.gravity;$('setRegenDelay').value=(x.combat.regenDelayMs/1000).toFixed(1);$('setRegenRate').value=x.combat.regenPerSecond;$('setRespawnDelay').value=(x.combat.respawnMs/1000).toFixed(1);populateAdminBots(botConfig);}
function populateAdminWeapons(value){const x=normalizeWorldSettings(value);for(const name of WEAPON_ORDER){const cap=name[0].toUpperCase()+name.slice(1),w=x.weapons[name];$(`set${cap}Damage`).value=w.damage;$(`set${cap}Speed`).value=w.speed;$(`set${cap}Reload`).value=(w.reloadMs/1000).toFixed(2);$(`set${cap}Cooldown`).value=Math.round(60000/w.cooldownMs);$(`set${cap}Recoil`).value=Math.round(w.recoilScale);}}
function populateAdminSettings(value){populateAdminGameplay(value);populateAdminWeapons(value);}
function collectAdminGameplayPatch(){return{movement:{runSpeed:$('setRunSpeed').value,walkSpeed:$('setWalkSpeed').value,jumpHeight:$('setJumpHeight').value,gravity:$('setGravity').value},combat:{regenDelayMs:Number($('setRegenDelay').value)*1000,regenPerSecond:$('setRegenRate').value,respawnMs:Number($('setRespawnDelay').value)*1000}};}
function collectAdminWeaponsPatch(){return{weapons:Object.fromEntries(WEAPON_ORDER.map(name=>{const cap=name[0].toUpperCase()+name.slice(1);return[name,{damage:$(`set${cap}Damage`).value,speed:$(`set${cap}Speed`).value,reloadMs:Number($(`set${cap}Reload`).value)*1000,cooldownMs:60000/Math.max(24,Number($(`set${cap}Cooldown`).value)||60),recoilScale:$(`set${cap}Recoil`).value}]}))};}
function adminPlayerSnapshot(){if(shell.inLobby)return lobbySnapshot().filter(r=>!r.bot).map(r=>({id:r.id,name:r.name,team:r.team,godMode:!!r.godMode,admin:!!r.admin,self:!!r.self}));return[{id:clientId,name:myName||'You',team:myTeam,godMode,admin:isMatchAdmin,self:true},...Array.from(remotes.values()).filter(r=>!r.bot).map(r=>({id:r.id,name:r.name,team:r.team,godMode:!!r.godMode,admin:!!r.admin,self:false}))];}
function renderAdminPlayers(force=false){
  const root=$('adminPlayerList');if(!root)return;if(!force&&(shell.panel!==SHELL_PANEL.ADMIN||activeAdminTab!=='players'))return;root.innerHTML='';
  for(const pl of adminPlayerSnapshot()){
    const row=document.createElement('div');row.className='admin-player-row';const owner=pl.id===matchOwnerId,self=!!pl.self;
    const safeId=escapeHtml(pl.id),godAction=`<button class="btn admin-mini ${pl.godMode?'active':''}" data-admin-god="${safeId}" data-controller-key="admin-player:${safeId}:god">${pl.godMode?'God Mode On':'God Mode Off'}</button>`;
    const roleAction=(owner||self)?`<button class="btn admin-mini ${pl.admin?'active':''}" disabled>${owner?'Host':pl.admin?'Admin':'Player'}</button>`:`<button class="btn admin-mini ${pl.admin?'active':''}" data-admin-role="${safeId}" data-controller-key="admin-player:${safeId}:role">${pl.admin?'Admin':'Make Admin'}</button>`;
    row.innerHTML=`<div class="admin-player-identity"><span class="admin-team-dot ${currentModeSpec().teamBased?pl.team:'ffa'}"></span><div><strong>${escapeHtml(pl.name)}${self?' (You)':''}</strong><small>${owner?'HOST':pl.admin?'ADMIN':'PLAYER'} · ${currentModeSpec().teamBased?String(pl.team||'blue').toUpperCase():'FFA'}</small></div></div><div class="admin-player-actions">${godAction}${roleAction}</div>`;root.appendChild(row);
  }
  for(const btn of root.querySelectorAll('[data-admin-god]'))btn.addEventListener('click',()=>{const id=btn.dataset.adminGod,pl=adminPlayerSnapshot().find(x=>x.id===id);if(pl)send({t:'adminPlayer',targetId:id,action:'god',enabled:!pl.godMode});});
  for(const btn of root.querySelectorAll('[data-admin-role]'))btn.addEventListener('click',()=>{const id=btn.dataset.adminRole,pl=adminPlayerSnapshot().find(x=>x.id===id);if(pl&&!pl.self)send({t:'adminPlayer',targetId:id,action:'admin',enabled:!pl.admin});});
}
function requestTeamChange(team){if(!shell.inMatch||socket?.readyState!==WebSocket.OPEN)return;const next=team==='red'?'red':'blue';send({t:'team',team:next});if(godMode)showToast(next===myTeam?`ALREADY ON ${next.toUpperCase()}`:`SWITCHING TO ${next.toUpperCase()}`);else showToast(next===myTeam?'CANCELING TEAM SWITCH':`SWITCH TO ${next.toUpperCase()} ON RESPAWN`);}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function applyRemoteTeamVisual(r,team){if(!r)return;const next=team==='red'?'red':'blue';r.team=next;r.color=remoteDisplayColor(next);if(r.body?.material?.color)r.body.material.color.set(remoteDisplayColor(next));if(r.tag){r.group.remove(r.tag);r.tag.material?.map?.dispose?.();r.tag.material?.dispose?.();r.tag=makeNameTag(r.bot?`[BOT] ${r.name}`:r.name,remoteDisplayColor(next));r.tag.position.set(0,2.18,0);r.tag.visible=r.hp>0&&(modeFriendly(next)||samePlayerId(r.id,aimedRemoteId));r.group.add(r.tag);}}
function syncAdminWeaponEditor(name='assault'){
  const state=$('adminWeaponSelect'),next=WEAPON_ORDER.includes(name)?name:(WEAPON_ORDER[0]||'assault');adminWeaponSelection=next;if(state)state.dataset.value=next;
  for(const button of document.querySelectorAll('[data-admin-weapon-choice]')){const active=button.dataset.adminWeaponChoice===next;button.classList.toggle('active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
  for(const card of document.querySelectorAll('[data-admin-weapon-editor]')){const active=card.dataset.adminWeaponEditor===next;card.hidden=!active;card.inert=!active;}
}
function openAdminPanel(initialTab='gameplay'){if(shell.inMatch&&matchState.status===MATCH_STATUS.ENDED)return;if(!isMatchAdmin){showToast('HOST ACCESS REQUIRED');return;}if(shell.inLobby){syncLobbyHostControlPlacement();if(initialTab==='players'){switchLobbySide('players');return;}switchLobbySide('cheats');switchSubTabs('[data-lobby-cheat-tab]','[data-lobby-cheat-page]','data-lobby-cheat-tab','data-lobby-cheat-page',initialTab==='advanced'?'weapons':'gameplay');return;}syncLobbyHostControlPlacement();syncAdminContext();populateAdminSettings(worldSettings);switchAdminTab(initialTab);syncAdminWeaponEditor(currentAdminWeaponSelection());setAdminStatus(matchCustom?'CUSTOM tuning active.':'Advanced settings are unchanged.');shell.openPanel(SHELL_PANEL.ADMIN);renderAdminPlayers(true);}
function closeAdminPanel(){shell.closePanel(SHELL_PANEL.ADMIN);}
function resetActiveAdminTab(){if(activeAdminTab==='gameplay'){populateAdminGameplay(worldSettings);populateAdminBots(botConfig);}else if(activeAdminTab==='advanced')populateAdminWeapons(worldSettings);setAdminStatus('Changes reset.');}
function saveAdminSettings(){
  if(shell.inLobby){setAdminStatus('Lobby tuning is staged and applies with Start Match.');return;}
  if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN){setAdminStatus('Host connection unavailable.','error');return;}
  if(activeAdminTab==='gameplay'){let bots=null;if(shell.inMatch){bots=collectAdminBotConfig();if(!bots){setAdminStatus(`Maximum ${MAX_BOTS} bots per match.`,'error');return;}}send({t:'adminSettings',section:'gameplay',patch:collectAdminGameplayPatch()});if(bots){send({t:'adminBots',...bots});setAdminStatus('Applying gameplay and live bot roster…');}else setAdminStatus('Applying gameplay…');return;}
  if(activeAdminTab==='advanced'){send({t:'adminSettings',section:'advanced',patch:collectAdminWeaponsPatch()});setAdminStatus('Applying weapons…');return;}
}

function openPause(){if(!shell.inMatch||shell.paused||matchState.status===MATCH_STATUS.ENDED)return;shell.pause('user-pause');}
async function copyInvite(){
  const url=new URL(location.href);url.searchParams.set('room',currentRoom);try{await navigator.clipboard.writeText(url.toString());showToast('Invite copied');}catch{showToast(`Match code: ${currentRoom}`);}
}

function gameSnapshot(self,players=[],bots=[],at=undefined){const stamp=Number(at),mark=p=>p&&Number.isFinite(stamp)&&!Number.isFinite(Number(p.at))?{...p,at:stamp}:p;return {self:mark(self)||null,players:Array.isArray(players)?players.map(mark):[],bots:Array.isArray(bots)?bots.map(mark):[]};}
function applyGameSnapshot(snapshot,{resetRound=false}={}){
  if(!engineReady||!position||!snapshot)return false;
  if(resetRound){killFeed.length=0;clearBullets();clearRocketTrailPuffs();clearThrowables();clearTacticalFx();clearSmokeClouds();}
  clearRemotes();
  const self=snapshot.self||snapshot.players.find(player=>player?.id===clientId)||null;
  if(self)handleRespawn(self);
  for(const player of snapshot.players){if(player?.id&&!samePlayerId(player.id,clientId))upsertRemote(player,true);}
  for(const bot of snapshot.bots)upsertRemote(bot,true);
  syncPauseContext();return true;
}
function currentRemoteViewDelayMs(){return THREE.MathUtils.clamp(remoteViewDelayMs,REMOTE_INTERPOLATION_MIN_MS,REMOTE_INTERPOLATION_MAX_MS);}
function resetRemoteNetworkTiming(){remoteViewDelayMs=REMOTE_INTERPOLATION_MS;remoteDelayMeanMs=REMOTE_INTERPOLATION_MS;remoteDelayJitterMs=0;remoteDelaySamples=0;}
function observeRemoteNetworkTime(value){
  const at=Number(value);if(!Number.isFinite(at))return;
  const age=THREE.MathUtils.clamp(serverNow()-at,0,360);
  if(remoteDelaySamples===0){remoteDelayMeanMs=age;remoteDelayJitterMs=0;remoteViewDelayMs=THREE.MathUtils.clamp(Math.max(REMOTE_INTERPOLATION_MS,age+18),REMOTE_INTERPOLATION_MIN_MS,REMOTE_INTERPOLATION_MAX_MS);}
  else{
    const previousMean=remoteDelayMeanMs;remoteDelayMeanMs=THREE.MathUtils.lerp(remoteDelayMeanMs,age,.08);remoteDelayJitterMs=THREE.MathUtils.lerp(remoteDelayJitterMs,Math.abs(age-previousMean),.12);
    const desired=THREE.MathUtils.clamp(remoteDelayMeanMs+Math.max(18,remoteDelayJitterMs*1.6),REMOTE_INTERPOLATION_MIN_MS,REMOTE_INTERPOLATION_MAX_MS);
    remoteViewDelayMs=THREE.MathUtils.lerp(remoteViewDelayMs,desired,remoteDelaySamples<4?.45:.08);
  }
  remoteDelaySamples=Math.min(100000,remoteDelaySamples+1);
}
function pushRemoteSnapshot(r,player,{reset=false}={}){
  const history=r.snapshots||(r.snapshots=[]),at=Number.isFinite(Number(player.at))?Number(player.at):serverNow();
  const sample={at,x:Number(player.x)||0,y:Number(player.y)||0,z:Number(player.z)||0,yaw:Number(player.yaw)||0,ads:player.ads??r.ads,crouched:player.crouched??r.crouched,sprinting:player.sprinting??r.sprinting,sliding:player.sliding??r.sliding};
  if(reset)history.length=0;
  const previous=history[history.length-1];
  if(previous&&sample.at<=previous.at){if(Math.abs(sample.at-previous.at)<=2)history[history.length-1]=sample;return sample;}
  history.push(sample);const cutoff=sample.at-REMOTE_HISTORY_MS;while(history.length>2&&(history[0].at<cutoff||history.length>REMOTE_HISTORY_MAX_SAMPLES))history.shift();return sample;
}
function remoteSnapshotAt(r,renderAt){
  const history=r.snapshots||[];if(!history.length)return null;if(history.length===1)return {...history[0]};
  if(renderAt<=history[0].at)return {...history[0]};
  for(let i=1;i<history.length;i++){
    const b=history[i];if(renderAt>b.at)continue;const a=history[i-1],span=Math.max(1,b.at-a.at),t=THREE.MathUtils.clamp((renderAt-a.at)/span,0,1),yawDelta=normalizeAngle(b.yaw-a.yaw);
    return {at:renderAt,x:THREE.MathUtils.lerp(a.x,b.x,t),y:THREE.MathUtils.lerp(a.y,b.y,t),z:THREE.MathUtils.lerp(a.z,b.z,t),yaw:a.yaw+yawDelta*t,ads:t<.5?a.ads:b.ads,crouched:t<.5?a.crouched:b.crouched,sprinting:t<.5?a.sprinting:b.sprinting,sliding:t<.5?a.sliding:b.sliding};
  }
  const b=history[history.length-1],a=history[history.length-2],sourceSpan=Math.max(1,b.at-a.at),extra=Math.min(REMOTE_EXTRAPOLATION_MAX_MS,Math.max(0,renderAt-b.at));if(extra<=0)return {...b};
  const seconds=sourceSpan/1000,extrapSec=extra/1000,maxPlanar=Math.max(4,worldSettings.movement.runSpeed*1.35),vx=THREE.MathUtils.clamp((b.x-a.x)/seconds,-maxPlanar,maxPlanar),vz=THREE.MathUtils.clamp((b.z-a.z)/seconds,-maxPlanar,maxPlanar),vy=THREE.MathUtils.clamp((b.y-a.y)/seconds,-13,9),yawRate=THREE.MathUtils.clamp(normalizeAngle(b.yaw-a.yaw)/seconds,-7,7);
  return {at:b.at+extra,x:b.x+vx*extrapSec,y:b.y+vy*extrapSec,z:b.z+vz*extrapSec,yaw:b.yaw+yawRate*extrapSec,ads:b.ads,crouched:b.crouched,sprinting:b.sprinting,sliding:b.sliding};
}
function makeRemote(player){
  const group=new THREE.Group(),model=new THREE.Group();model.userData.remoteId=String(player.id||'');group.add(model);
  const team=player.team==='red'?'red':'blue';
  const color=new THREE.Color(remoteDisplayColor(team));
  const mat=new THREE.MeshStandardMaterial({color,roughness:.75,metalness:player.bot?.18:0});
  const skin=new THREE.MeshStandardMaterial({color:player.bot?0x9faab3:0xe4aa82,roughness:.8});
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.34,.78,5,9),mat);body.position.y=.94;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.25,12,8),skin);head.position.y=1.66;
  const armL=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.52,4,7),skin);const armR=armL.clone();armL.position.set(-.44,1.05,0);armR.position.set(.44,1.05,0);armL.rotation.z=-.12;armR.rotation.z=.12;
  const legMat=new THREE.MeshStandardMaterial({color:player.bot?0x414b52:0x27333d,roughness:.92});
  const legL=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.48,4,7),legMat);const legR=legL.clone();legL.position.set(-.18,.38,0);legR.position.set(.18,.38,0);
  const gunMat=new THREE.MeshStandardMaterial({color:0x252a30,roughness:.5,metalness:.25}),polyMat=new THREE.MeshStandardMaterial({color:0x31373c,roughness:.76,metalness:.10}),woodMat=new THREE.MeshStandardMaterial({color:0x654832,roughness:.84,metalness:.04}),lensMat=new THREE.MeshStandardMaterial({color:0xcfe6ef,roughness:.06,metalness:.08,transparent:true,opacity:.16,emissive:0x10252e,emissiveIntensity:.07,depthWrite:false,side:THREE.DoubleSide});
  const pistol=new THREE.Group();
  const pSlide=new THREE.Mesh(new THREE.BoxGeometry(.12,.075,.30),gunMat);pSlide.position.set(0,.04,.02);
  const pFrame=new THREE.Mesh(new THREE.BoxGeometry(.11,.065,.18),polyMat);pFrame.position.set(0,0,.06);
  const pBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.10,8),gunMat);pBarrel.rotation.x=Math.PI/2;pBarrel.position.set(0,.03,-.13);
  const pGrip=new THREE.Mesh(new THREE.BoxGeometry(.10,.18,.10),polyMat);pGrip.position.set(0,-.10,.15);pGrip.rotation.x=-.30;const pMagRemote=new THREE.Mesh(new THREE.BoxGeometry(.065,.13,.075),gunMat.clone());pMagRemote.position.set(0,-.145,.15);pMagRemote.rotation.x=-.30;
  pistol.add(pSlide,pFrame,pBarrel,pGrip,pMagRemote);
  const akimbo1887=new THREE.Group(),akL=new THREE.Group(),akR=new THREE.Group();
  const buildRemote1887=(gun)=>{const recv=new THREE.Mesh(new THREE.BoxGeometry(.11,.09,.24),gunMat.clone()),brl=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.54,8),gunMat.clone()),tube=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.42,8),gunMat.clone()),fore=new THREE.Mesh(new THREE.BoxGeometry(.09,.07,.18),woodMat.clone()),grip=new THREE.Mesh(new THREE.BoxGeometry(.09,.15,.09),woodMat.clone()),stock=new THREE.Mesh(new THREE.BoxGeometry(.08,.10,.22),woodMat.clone()),lever=new THREE.Mesh(new THREE.TorusGeometry(.045,.008,5,14),gunMat.clone());recv.position.z=-.10;brl.rotation.x=Math.PI/2;brl.position.set(0,.02,-.43);tube.rotation.x=Math.PI/2;tube.position.set(0,-.01,-.39);fore.position.set(0,-.005,-.26);grip.position.set(0,-.09,.04);grip.rotation.x=-.30;stock.position.set(0,-.005,.16);stock.rotation.x=-.10;lever.rotation.x=Math.PI/2;lever.scale.set(1,.7,1);lever.position.set(0,-.07,.01);gun.add(recv,brl,tube,fore,grip,stock,lever);return{brl,stock};};
  const akLParts=buildRemote1887(akL),akRParts=buildRemote1887(akR);akL.position.set(-.32,1.08,-.25);akR.position.set(.32,1.08,-.25);akL.rotation.set(-.08,.14,-.03);akR.rotation.set(-.08,-.14,.03);akimbo1887.add(akL,akR);
  const assault=new THREE.Group();
  const arRecv=new THREE.Mesh(new THREE.BoxGeometry(.12,.085,.26),gunMat.clone()),arHand=new THREE.Mesh(new THREE.BoxGeometry(.11,.07,.20),new THREE.MeshStandardMaterial({color:0x7a6e5a,roughness:.82,metalness:.05})),arBar=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,.34,8),gunMat.clone()),arStock=new THREE.Mesh(new THREE.BoxGeometry(.10,.10,.16),new THREE.MeshStandardMaterial({color:0x61574a,roughness:.74,metalness:.08})),arGrip=new THREE.Mesh(new THREE.BoxGeometry(.08,.16,.08),gunMat.clone());arRecv.position.set(0,.01,.16);arHand.position.set(0,-.01,-.04);arBar.rotation.x=Math.PI/2;arBar.position.set(0,-.01,-.22);arStock.position.set(0,-.03,.35);arGrip.position.set(0,-.10,.29);arGrip.rotation.x=-.24;const arMagRemote=new THREE.Mesh(new THREE.BoxGeometry(.08,.18,.10),new THREE.MeshStandardMaterial({color:0x676f75,roughness:.62,metalness:.18}));arMagRemote.position.set(0,-.10,.20);arMagRemote.rotation.x=.18;assault.add(arRecv,arHand,arBar,arStock,arGrip,arMagRemote);assault.visible=false;
  const ump=new THREE.Group();
  const uRecv=new THREE.Mesh(new THREE.BoxGeometry(.12,.10,.24),gunMat.clone()),uFront=new THREE.Mesh(new THREE.BoxGeometry(.10,.07,.14),polyMat.clone()),uBar=new THREE.Mesh(new THREE.CylinderGeometry(.013,.013,.16,8),gunMat.clone()),uGrip=new THREE.Mesh(new THREE.BoxGeometry(.08,.16,.08),polyMat.clone()),uStock=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.14),new THREE.MeshStandardMaterial({color:0x454b50,roughness:.68,metalness:.12}));uRecv.position.set(0,.01,.16);uFront.position.set(0,-.02,.01);uBar.rotation.x=Math.PI/2;uBar.position.set(0,-.01,-.14);uGrip.position.set(0,-.09,.24);uGrip.rotation.x=-.28;uStock.position.set(0,-.01,.35);const uMagRemote=new THREE.Mesh(new THREE.BoxGeometry(.08,.19,.09),polyMat.clone());uMagRemote.position.set(0,-.10,.17);uMagRemote.rotation.x=.10;ump.add(uRecv,uFront,uBar,uGrip,uStock,uMagRemote);ump.visible=false;

  const machineGun=new THREE.Group();
  const mgRecvRemote=new THREE.Mesh(new THREE.BoxGeometry(.14,.10,.30),gunMat.clone()),mgHandRemote=new THREE.Mesh(new THREE.BoxGeometry(.12,.08,.24),new THREE.MeshStandardMaterial({color:0x596053,roughness:.76,metalness:.08})),mgBarRemote=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.42,8),gunMat.clone()),mgGasRemote=new THREE.Mesh(new THREE.CylinderGeometry(.009,.009,.28,8),polyMat.clone()),mgStockRemote=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.22),new THREE.MeshStandardMaterial({color:0x596053,roughness:.76,metalness:.08})),mgGripRemote=new THREE.Mesh(new THREE.BoxGeometry(.08,.17,.09),polyMat.clone()),mgBoxRemote=new THREE.Mesh(new THREE.BoxGeometry(.14,.18,.14),new THREE.MeshStandardMaterial({color:0x596053,roughness:.76,metalness:.08}));mgRecvRemote.position.set(0,.01,.16);mgHandRemote.position.set(0,-.01,-.08);mgBarRemote.rotation.x=Math.PI/2;mgBarRemote.position.set(0,-.01,-.32);mgGasRemote.rotation.x=Math.PI/2;mgGasRemote.position.set(0,.02,-.24);mgStockRemote.position.set(0,-.03,.39);mgGripRemote.position.set(0,-.10,.27);mgGripRemote.rotation.x=-.24;mgBoxRemote.position.set(-.025,-.10,.15);
  const mgCarryRearRemoteL=new THREE.Mesh(new THREE.BoxGeometry(.010,.042,.016),polyMat.clone());mgCarryRearRemoteL.position.set(-.030,.080,.08);
  const mgCarryRearRemoteR=mgCarryRearRemoteL.clone();mgCarryRearRemoteR.position.x=.030;
  const mgCarryFrontRemoteL=new THREE.Mesh(new THREE.BoxGeometry(.010,.038,.016),polyMat.clone());mgCarryFrontRemoteL.position.set(-.030,.078,-.05);
  const mgCarryFrontRemoteR=mgCarryFrontRemoteL.clone();mgCarryFrontRemoteR.position.x=.030;
  const mgCarryBarRemote=new THREE.Mesh(new THREE.BoxGeometry(.090,.012,.16),polyMat.clone());mgCarryBarRemote.position.set(0,.104,.01);
  machineGun.add(mgRecvRemote,mgHandRemote,mgBarRemote,mgGasRemote,mgStockRemote,mgGripRemote,mgBoxRemote,mgCarryRearRemoteL,mgCarryRearRemoteR,mgCarryFrontRemoteL,mgCarryFrontRemoteR,mgCarryBarRemote);machineGun.visible=false;
  const shotgun=new THREE.Group();
  const sgRecv=new THREE.Mesh(new THREE.BoxGeometry(.11,.09,.24),gunMat.clone()),sgBar=new THREE.Mesh(new THREE.CylinderGeometry(.015,.015,.58,8),gunMat.clone()),sgTube=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.46,8),gunMat.clone()),sgStock=new THREE.Mesh(new THREE.BoxGeometry(.09,.12,.24),woodMat.clone()),sgGrip=new THREE.Mesh(new THREE.BoxGeometry(.09,.15,.09),woodMat.clone());sgRecv.position.set(0,.01,.23);sgBar.rotation.x=Math.PI/2;sgBar.position.set(0,.02,-.09);sgTube.rotation.x=Math.PI/2;sgTube.position.set(0,-.03,-.04);sgStock.position.set(0,-.03,.41);sgGrip.position.set(0,-.11,.33);sgGrip.rotation.x=-.26;const sgPumpRemote=new THREE.Mesh(new THREE.BoxGeometry(.09,.07,.16),woodMat.clone());sgPumpRemote.position.set(0,-.05,.09);shotgun.add(sgRecv,sgBar,sgTube,sgStock,sgGrip,sgPumpRemote);shotgun.visible=false;
  const semiShotgun=new THREE.Group();
  const ssRecv=new THREE.Mesh(new THREE.BoxGeometry(.11,.09,.24),gunMat.clone()),ssHand=new THREE.Mesh(new THREE.BoxGeometry(.09,.07,.16),new THREE.MeshStandardMaterial({color:0x4d5548,roughness:.78,metalness:.08})),ssBar=new THREE.Mesh(new THREE.CylinderGeometry(.014,.014,.48,8),gunMat.clone()),ssTube=new THREE.Mesh(new THREE.CylinderGeometry(.010,.010,.30,8),gunMat.clone()),ssStock=new THREE.Mesh(new THREE.BoxGeometry(.09,.12,.20),new THREE.MeshStandardMaterial({color:0x4d5548,roughness:.78,metalness:.08})),ssGrip=new THREE.Mesh(new THREE.BoxGeometry(.08,.15,.08),gunMat.clone());ssRecv.position.set(0,.01,.22);ssHand.position.set(0,-.04,.06);ssBar.rotation.x=Math.PI/2;ssBar.position.set(0,.01,-.06);ssTube.rotation.x=Math.PI/2;ssTube.position.set(0,-.03,0);ssStock.position.set(0,-.03,.41);ssGrip.position.set(0,-.11,.33);ssGrip.rotation.x=-.25;const ssMagRemote=new THREE.Mesh(new THREE.BoxGeometry(.08,.12,.09),gunMat.clone());ssMagRemote.position.set(0,-.09,.25);semiShotgun.add(ssRecv,ssHand,ssBar,ssTube,ssStock,ssGrip,ssMagRemote);semiShotgun.visible=false;

  const sniper=new THREE.Group();
  const snRecv=new THREE.Mesh(new THREE.BoxGeometry(.11,.08,.30),gunMat.clone()),snHand=new THREE.Mesh(new THREE.BoxGeometry(.08,.07,.22),new THREE.MeshStandardMaterial({color:0x5a5e4a,roughness:.84,metalness:.06})),snBar=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.56,8),gunMat.clone()),snStock=new THREE.Mesh(new THREE.BoxGeometry(.09,.12,.24),new THREE.MeshStandardMaterial({color:0x5a5e4a,roughness:.84,metalness:.06})),snScope=new THREE.Mesh(new THREE.CylinderGeometry(.026,.026,.18,14,1,true),gunMat.clone());snRecv.position.set(0,.01,.27);snHand.position.set(0,-.03,.05);snBar.rotation.x=Math.PI/2;snBar.position.set(0,.01,-.11);snStock.position.set(0,-.03,.47);snScope.rotation.x=Math.PI/2;snScope.position.set(0,.08,.27);const snScopeInner=new THREE.Mesh(new THREE.CylinderGeometry(.020,.020,.17,14,1,true),new THREE.MeshStandardMaterial({color:0x090c10,roughness:.96,metalness:.02,side:THREE.BackSide}));snScopeInner.rotation.x=Math.PI/2;snScopeInner.position.copy(snScope.position);const snFrontRing=new THREE.Mesh(new THREE.TorusGeometry(.0225,.0035,8,18),gunMat.clone());snFrontRing.position.set(0,.08,.18);const snRearRing=new THREE.Mesh(new THREE.TorusGeometry(.0225,.0035,8,18),gunMat.clone());snRearRing.position.set(0,.08,.36);const snFrontLens=new THREE.Mesh(new THREE.CircleGeometry(.021,18),lensMat.clone());snFrontLens.position.set(0,.08,.183);const snRearLens=new THREE.Mesh(new THREE.CircleGeometry(.021,18),lensMat.clone());snRearLens.position.set(0,.08,.357);const snScopeMountRear=new THREE.Mesh(new THREE.BoxGeometry(.042,.042,.020),gunMat.clone());snScopeMountRear.position.set(0,.045,.33);const snScopeMountFront=new THREE.Mesh(new THREE.BoxGeometry(.042,.042,.020),gunMat.clone());snScopeMountFront.position.set(0,.045,.22);const sniperBoltRemote=new THREE.Mesh(new THREE.BoxGeometry(.034,.034,.10),gunMat.clone());sniperBoltRemote.position.set(.07,.02,.33);const snMagRemote=new THREE.Mesh(new THREE.BoxGeometry(.07,.11,.085),gunMat.clone());snMagRemote.position.set(0,-.075,.26);snMagRemote.rotation.x=.08;sniper.add(snRecv,snHand,snBar,snStock,snScopeMountRear,snScopeMountFront,snScope,snScopeInner,snFrontRing,snRearRing,snFrontLens,snRearLens,sniperBoltRemote,snMagRemote);sniper.visible=false;
  const grenadeLauncher=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.68,9),gunMat.clone());grenadeLauncher.rotation.x=Math.PI/2+GRENADE_LAUNCH_PITCH;grenadeLauncher.position.set(.45,1.08,-.40);grenadeLauncher.visible=false;
  const rpg=new THREE.Group(),rpgTubeRemote=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.88,9),gunMat.clone());rpgTubeRemote.rotation.x=Math.PI/2;rpg.add(rpgTubeRemote);rpg.position.set(.38,1.42,-.43);rpg.visible=false;
  const godRing=new THREE.Mesh(new THREE.TorusGeometry(.42,.035,6,28),new THREE.MeshBasicMaterial({color:0xffdd67,transparent:true,opacity:.9}));godRing.rotation.x=Math.PI/2;godRing.position.y=2.03;godRing.visible=!!player.godMode;
  setupWeaponAttachmentVisuals(pistol,'pistol',{muzzle:{x:0,y:.03,z:-.18},mag:pMagRemote,redDot:{sightY:.078,z:.05,mountY:.052,eyeZ:-.09},suppressor:{radius:.019,length:.13,overlap:.012},compensator:{radius:.018,length:.055,overlap:.010},laser:{x:.030,z:-.08,y:-.035,scale:.55},fastMag:{width:.068,depth:.078,y:.035}});
  setupWeaponAttachmentVisuals(akL,'akimbo1887',{muzzle:{x:0,y:.02,z:-.70},barrelMesh:akLParts.brl,stockBaseParts:[akLParts.stock],suppressor:{radius:.018,length:.12,overlap:.010},laser:{x:.030,z:-.28,y:-.035,scale:.55},lightweightStock:{z:.22,y:-.01,width:.075},fastMag:{z:-.02,y:-.10,width:.065}});
  setupWeaponAttachmentVisuals(akR,'akimbo1887',{muzzle:{x:0,y:.02,z:-.70},barrelMesh:akRParts.brl,stockBaseParts:[akRParts.stock],suppressor:{radius:.018,length:.12,overlap:.010},laser:{x:.030,z:-.28,y:-.035,scale:.55},lightweightStock:{z:.22,y:-.01,width:.075},fastMag:{z:-.02,y:-.10,width:.065}});
  setupWeaponAttachmentVisuals(assault,'assault',{muzzle:{x:0,y:-.01,z:-.39},mag:arMagRemote,barrelMesh:arBar,stockBaseParts:[arStock],redDot:{sightY:.080,z:.105,mountY:.052,eyeZ:-.09},holoSight:{sightY:.094,z:.105,mountY:.052,eyeZ:-.09},combatOptic:{sightY:.106,z:.145,mountY:.052,eyeZ:-.09,length:.125},suppressor:{radius:.020,length:.15,overlap:.013},compensator:{radius:.019,length:.065,overlap:.010},verticalGrip:{z:-.07,y:-.10},angledGrip:{z:-.06,y:-.095},laser:{x:.040,z:-.06,y:-.090,scale:.65},lightweightStock:{z:.41,y:-.03,width:.10},fullStock:{z:.39,y:-.03,width:.11},compactStock:{z:.30,y:-.01,width:.075},fastMag:{width:.082,depth:.10,y:.05}});
  setupWeaponAttachmentVisuals(ump,'ump',{muzzle:{x:0,y:-.01,z:-.22},mag:uMagRemote,barrelMesh:uBar,stockBaseParts:[uStock],redDot:{sightY:.078,z:.095,mountY:.050,eyeZ:-.09},holoSight:{sightY:.092,z:.095,mountY:.050,eyeZ:-.09},suppressor:{radius:.020,length:.13,overlap:.012},compensator:{radius:.019,length:.055,overlap:.010},verticalGrip:{z:-.01,y:-.10},angledGrip:{z:0,y:-.095},laser:{x:.040,z:0,y:-.090,scale:.65},lightweightStock:{z:.39,y:-.01,width:.085},fullStock:{z:.37,y:-.015,width:.095},compactStock:{z:.29,y:0,width:.07},fastMag:{width:.082,depth:.09,y:.05}});
  setupWeaponAttachmentVisuals(machineGun,'machineGun',{muzzle:{x:0,y:-.01,z:-.53},mag:mgBoxRemote,barrelMesh:mgBarRemote,stockBaseParts:[mgStockRemote],redDot:{sightY:.090,z:.110,mountY:.062,eyeZ:-.10},holoSight:{sightY:.106,z:.110,mountY:.062,eyeZ:-.10},combatOptic:{sightY:.119,z:.150,mountY:.062,eyeZ:-.10,length:.135},suppressor:{radius:.023,length:.18,overlap:.015},compensator:{radius:.021,length:.075,overlap:.011},verticalGrip:{z:-.10,y:-.11},angledGrip:{z:-.09,y:-.105},laser:{x:.045,z:-.09,y:-.100,scale:.70},bipod:{z:-.13,y:-.16,scale:.72},lightweightStock:{z:.47,y:-.03,width:.12},fullStock:{z:.45,y:-.03,width:.13},fastMag:{width:.14,depth:.14,y:.04}});
  setupWeaponAttachmentVisuals(shotgun,'shotgun',{muzzle:{x:0,y:.02,z:-.38},barrelMesh:sgBar,redDot:{sightY:.075,z:.12,mountY:.050,eyeZ:-.09},suppressor:{radius:.018,length:.13,overlap:.010},shotgunChoke:{radius:.018,length:.065,overlap:.010},laser:{x:.038,z:-.12,y:-.035,scale:.65}});
  setupWeaponAttachmentVisuals(semiShotgun,'semiShotgun',{muzzle:{x:0,y:.01,z:-.30},mag:ssMagRemote,barrelMesh:ssBar,redDot:{sightY:.080,z:.165,mountY:.050,eyeZ:-.09},holoSight:{sightY:.096,z:.165,mountY:.050,eyeZ:-.09},combatOptic:{sightY:.108,z:.205,mountY:.050,eyeZ:-.09,length:.125},shotgunChoke:{radius:.017,length:.065,overlap:.010},laser:{x:.038,z:-.06,y:-.045,scale:.65},fastMag:{width:.082,depth:.09,y:.035}});
  setupWeaponAttachmentVisuals(sniper,'sniper',{muzzle:{x:0,y:.01,z:-.39},mag:snMagRemote,barrelMesh:snBar,variableScope:{z:.27,y:.08,radius:.029},laser:{x:.035,z:-.08,y:-.035,scale:.65},suppressor:{radius:.020,length:.17,overlap:.014},fastMag:{width:.072,depth:.088,y:.03}});
  setupWeaponAttachmentVisuals(rpg,'rpg',{laser:{x:.045,z:-.12,y:-.035,scale:.75}});
  model.add(body,head,armL,armR,legL,legR,pistol,akimbo1887,assault,ump,machineGun,shotgun,semiShotgun,sniper,grenadeLauncher,rpg,godRing);group.position.set(player.x||0,player.y||0,player.z||0);scene.add(group);
  const tag=makeNameTag(player.bot?`[BOT] ${player.name||'Bot'}`:(player.name||'Player'),remoteDisplayColor(team));tag.position.set(0,2.18,0);group.add(tag);
  const now=performance.now();
  const remote={id:player.id,name:player.name||'Player',color:remoteDisplayColor(team),team,bot:!!player.bot,weapon:player.weapon||'pistol',primaryWeapon:PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:'assault',secondaryWeapon:SECONDARY_WEAPONS.includes(player.secondaryWeapon)?player.secondaryWeapon:'pistol',primaryAttachments:normalizeWeaponAttachments(PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:'assault',player.primaryAttachments),secondaryAttachments:normalizeWeaponAttachments(SECONDARY_WEAPONS.includes(player.secondaryWeapon)?player.secondaryWeapon:'pistol',player.secondaryAttachments),group,model,tag,target:new THREE.Vector3(player.x||0,player.y||0,player.z||0),targetYaw:player.yaw||0,hp:player.hp??100,kills:Number(player.kills)||0,deaths:Number(player.deaths)||0,armL,armR,legL,legR,body,head,pistol,akimbo1887,akimboLeft:akL,akimboRight:akR,akimboCycleStartedAt:{left:0,right:0},assault,ump,machineGun,shotgun,semiShotgun,sniper,grenadeLauncher,rpg,godRing,godMode:!!player.godMode,admin:!!player.admin,lastSeen:now,lastNetAt:now,lastNetServerAt:Number.isFinite(Number(player.at))?Number(player.at):serverNow(),lastNetX:player.x||0,lastNetY:player.y||0,lastNetZ:player.z||0,snapshots:[],moveSpeed:0,airborne:false,ads:!!player.ads,crouched:!!player.crouched,sprinting:!!player.sprinting,sliding:!!player.sliding,crouchBlend:player.crouched?1:0,sprintBlend:player.sprinting?1:0,slideBlend:player.sliding?1:0,animPhase:Math.random()*Math.PI*2,deathPose:player.hp<=0?1:0,reloadUntil:Number(player.reloadAt)||0,reloadStartedAt:0,reloadWeapon:player.reloadWeapon||'',swapStartedAt:0,fireKickUntil:0,revealedUntil:0,nextFootstepAt:now+300+Math.random()*260,footstepSide:Math.random()<.5?0:1,traversal:player.traversal?traversalPlanFromServer({id:player.id,accepted:true,...player.traversal}):null,ladder:player.ladder?ladderStateFromServer(player.ladder):null};tag.visible=remote.hp>0&&modeFriendly(team);
  syncRemoteWeapon(remote);return remote;
}
function makeNameTag(name,color){
  const c=document.createElement('canvas');c.width=512;c.height=96;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.textBaseline='middle';x.textAlign='center';x.font='800 34px system-ui';x.lineWidth=5;x.strokeStyle='rgba(0,0,0,.64)';x.strokeText(name,270,48);x.fillStyle='rgba(255,255,255,.86)';x.fillText(name,270,48);x.beginPath();x.arc(88,48,6,0,Math.PI*2);x.fillStyle=color;x.globalAlpha=.78;x.fill();x.globalAlpha=1;
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,opacity:.82,depthTest:true,depthWrite:false}));sprite.scale.set(1.45,.27,1);return sprite;
}
function updateRemoteTarget(r,player,instant=false){
  const now=performance.now(),x=Number(player.x)||0,y=Number(player.y)||0,z=Number(player.z)||0,serverAt=Number.isFinite(Number(player.at))?Number(player.at):serverNow(),elapsed=Math.max(.016,(serverAt-r.lastNetServerAt)/1000),dist=Math.hypot(x-r.lastNetX,z-r.lastNetZ);
  if(Number.isFinite(Number(player.at)))observeRemoteNetworkTime(player.at);pushRemoteSnapshot(r,{...player,at:serverAt},{reset:instant});
  r.moveSpeed=THREE.MathUtils.lerp(r.moveSpeed,Math.min(16,dist/elapsed),.55);if(Object.prototype.hasOwnProperty.call(player,'ladderId')){if(player.ladderId){if(!r.ladder||String(r.ladder.id)!==String(player.ladderId))r.ladder={id:String(player.ladderId),seq:0,phase:'climb',entry:''};}else r.ladder=null;}r.airborne=!!r.ladder||y>worldSupportHeight(x,z,y)+.08;r.ads=player.ads??r.ads;r.crouched=player.crouched??r.crouched;r.lastNetAt=now;r.lastNetServerAt=serverAt;r.lastNetX=x;r.lastNetY=y;r.lastNetZ=z;r.target.set(x,y,z);r.targetYaw=Number(player.yaw)||0;r.lastSeen=now;
  if(Number(player.reloadAt)>0){r.reloadUntil=Number(player.reloadAt);r.reloadWeapon=player.reloadWeapon||r.weapon;if(!r.reloadStartedAt)r.reloadStartedAt=serverNow();}
  if(instant){r.group.position.copy(r.target);r.group.rotation.y=r.targetYaw;}
}
function upsertRemote(player,instant=false){if(!player?.id)return;if(samePlayerId(player.id,clientId)){for(const [id] of remotes){if(samePlayerId(id,clientId))removeRemote(id);}return;}let r=remotes.get(player.id);if(!r){r=makeRemote(player);remotes.set(player.id,r);}const oldTeam=r.team;r.name=player.name||r.name;r.bot=!!player.bot;r.team=player.team||r.team;r.color=remoteDisplayColor(r.team);r.admin=player.admin??r.admin;r.weapon=player.weapon||r.weapon;if(PRIMARY_WEAPONS.includes(player.primaryWeapon))r.primaryWeapon=player.primaryWeapon;if(SECONDARY_WEAPONS.includes(player.secondaryWeapon))r.secondaryWeapon=player.secondaryWeapon;if(Object.prototype.hasOwnProperty.call(player,'primaryAttachments'))r.primaryAttachments=normalizeWeaponAttachments(r.primaryWeapon,player.primaryAttachments);if(Object.prototype.hasOwnProperty.call(player,'secondaryAttachments'))r.secondaryAttachments=normalizeWeaponAttachments(r.secondaryWeapon,player.secondaryAttachments);r.hp=player.hp??r.hp;r.kills=Number(player.kills??r.kills)||0;r.deaths=Number(player.deaths??r.deaths)||0;r.godMode=player.godMode??r.godMode;if(player.traversal&&typeof player.traversal==='object'&&Number(player.traversal.seq)!==Number(r.traversal?.seq))r.traversal=traversalPlanFromServer({id:player.id,accepted:true,...player.traversal});else if(player.bot&&player.traversal===null)r.traversal=null;if(player.ladder&&typeof player.ladder==='object')r.ladder=ladderStateFromServer(player.ladder);else if(player.ladder===null)r.ladder=null;if(r.godRing)r.godRing.visible=!!r.godMode;if(oldTeam!==r.team)applyRemoteTeamVisual(r,r.team);syncRemoteWeapon(r);updateRemoteTarget(r,player,instant);}
function removeRemote(id){const r=remotes.get(id);if(!r)return;scene.remove(r.group);r.group.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material){if(o.material.map)o.material.map.dispose?.();o.material.dispose?.();}});remotes.delete(id);}
function clearRemotes(){for(const id of [...remotes.keys()])removeRemote(id);}

function handleBlocked(m){
  if(m.attacker===clientId){hitUntil=performance.now()+180;soundShield();showToast('BLOCKED',{duration:900,key:'blocked-shot'});}
  if(m.target===clientId){hurtUntil=performance.now()+220;soundShield();}
}
function deathLookYawFromHit(m){
  const attacker=m?.attacker&&m.attacker!==clientId?remotes.get(m.attacker):null;
  if(attacker){const dx=attacker.group.position.x-position.x,dz=attacker.group.position.z-position.z;if(Math.hypot(dx,dz)>.05)return Math.atan2(-dx,-dz);}
  const kx=Number(m?.knockback?.x)||0,kz=Number(m?.knockback?.z)||0;return Math.hypot(kx,kz)>.01?Math.atan2(kx,kz):NaN;
}
function enterLocalDeath(m){
  const now=performance.now();deathViewStartYaw=effectiveAimYaw();deathViewTargetYaw=deathLookYawFromHit(m);deathViewStartPitch=effectiveAimPitch();
  stopSlide();cancelSprint();traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;jumpBufferedUntil=0;
  wastedUntil=m.respawnAt||serverNow()+worldSettings.combat.respawnMs;deathAnimStartedAt=now;clearFireInput();cancelEquipmentAction();clearQueuedSprintShot();setAim(false);resetRecoilBookkeeping();
  reloadRequestPending=false;reloadUntil=0;reloadWeapon='';reloadStartedAt=0;pendingWeapon='';weaponSwapStartedAt=0;localEquipmentCooldownUntil=0;sprintActionReadyAt=0;sniperZoomLevel=0;
  moveVelocityX=moveVelocityZ=0;localMoveAmount=0;showToast('ELIMINATED');
}
function handleHit(m){
  const targetRemote=remotes.get(m.target);if(targetRemote){targetRemote.hp=m.hp;if(m.wasted){targetRemote.traversal=null;targetRemote.ladder=null;}flashRemote(targetRemote);}
  if(m.attacker===clientId){showHitmarker(!!m.headshot);if(m.headshot)soundHeadshot();else soundHitmarker(m.weapon||'pistol');}
  if(m.target===clientId){
    if(m.blast&&diagnosticsRecordingEnabled())diagnosticsRecordEvent('blast_hit',{weapon:String(m.weapon||''),damage:Number(m.damage)||0,distance:diagnosticsRound(Number(m.distance)||0,2),directImpact:!!m.directImpact});
    hp=m.hp;knockX+=m.knockback?.x||0;knockZ+=m.knockback?.z||0;verticalVelocity=Math.max(verticalVelocity,m.knockback?.y||0);onGround=false;addDamageFeedback(m);syncLocalStatus();showHurt();soundHurt();
    if(m.wasted)enterLocalDeath(m);
  }
  
}
function addDamageFeedback(m){
  const damage=Math.max(1,Number(m.damage)||1),kx=Number(m.knockback?.x)||0,kz=Number(m.knockback?.z)||0;
  if(Math.hypot(kx,kz)>.01){
    const attacker=m.attacker&&m.attacker!==clientId?remotes.get(m.attacker):null,bearing=Math.atan2(kx,kz),knockLen=Math.hypot(kx,kz),sourceDistance=Math.max(1,Number(m.distance)||8);
    const sourceX=attacker?.group.position.x??(position.x-kx/knockLen*sourceDistance),sourceZ=attacker?.group.position.z??(position.z-kz/knockLen*sourceDistance);
    damageIndicators.push({bearing,sourceX,sourceZ,until:performance.now()+1150,strength:Math.min(1,.35+damage/95)});
    if(damageIndicators.length>6)damageIndicators.shift();
  }
  const count=Math.max(2,Math.min(9,Math.ceil(damage/18)));for(let i=0;i<count;i++){const edge=Math.random(),side=Math.floor(Math.random()*4);let x,y;if(side===0){x=.05+edge*.9;y=.04+Math.random()*.20;}else if(side===1){x=.78+Math.random()*.18;y=.08+edge*.82;}else if(side===2){x=.05+edge*.9;y=.76+Math.random()*.20;}else{x=.04+Math.random()*.18;y=.08+edge*.82;}bloodSplats.push({x,y,r:.006+Math.random()*.018,stretch:.7+Math.random()*1.8,rot:Math.random()*Math.PI,until:performance.now()+6500+Math.random()*3500,alpha:.28+Math.random()*.38});}
  if(bloodSplats.length>42)bloodSplats.splice(0,bloodSplats.length-42);
}
function drawBloodSplatter(c,w,h,now,missingHealth){for(let i=bloodSplats.length-1;i>=0;i--){const s=bloodSplats[i],remain=(s.until-now)/8500;if(remain<=0){bloodSplats.splice(i,1);continue;}const a=s.alpha*Math.min(1,remain*2)*Math.max(.18,missingHealth);c.save();c.translate(s.x*w,s.y*h);c.rotate(s.rot);c.scale(s.stretch,1);c.fillStyle=`rgba(118,0,15,${a})`;c.beginPath();c.arc(0,0,s.r*Math.min(w,h),0,Math.PI*2);c.fill();c.fillStyle=`rgba(76,0,8,${a*.72})`;c.beginPath();c.arc(s.r*Math.min(w,h)*.65,-s.r*Math.min(w,h)*.35,s.r*Math.min(w,h)*.42,0,Math.PI*2);c.fill();c.restore();}}
function drawDamageIndicators(c,w,h,now){
  for(let i=damageIndicators.length-1;i>=0;i--){
    const d=damageIndicators[i],remain=(d.until-now)/1150;if(remain<=0){damageIndicators.splice(i,1);continue;}
    let bearing=d.bearing;if(Number.isFinite(d.sourceX)&&Number.isFinite(d.sourceZ)){const dx=position.x-d.sourceX,dz=position.z-d.sourceZ;if(Math.hypot(dx,dz)>.05)bearing=Math.atan2(dx,dz);}
    const relative=normalizeAngle(bearing-yaw),radius=Math.min(w,h)*.315,x=w/2-Math.sin(relative)*radius,y=h/2-Math.cos(relative)*radius,rot=relative,alpha=Math.min(1,remain*2.35)*d.strength;
    c.save();c.translate(x,y);c.rotate(rot);c.globalAlpha=alpha;c.shadowColor='rgba(0,0,0,.72)';c.shadowBlur=4;c.strokeStyle='#ff4057';c.fillStyle='rgba(255,36,61,.25)';c.lineCap='round';
    c.lineWidth=3.7;c.beginPath();c.moveTo(-22,9);c.quadraticCurveTo(0,-11,22,9);c.stroke();
    c.globalAlpha=alpha*.78;c.lineWidth=2;c.beginPath();c.moveTo(-14,11);c.quadraticCurveTo(0,-2,14,11);c.stroke();
    c.globalAlpha=alpha*.72;c.beginPath();c.moveTo(-8,7);c.lineTo(0,0);c.lineTo(8,7);c.lineTo(0,4);c.closePath();c.fill();c.restore();
  }
}
function handleRespawn(player){
  if(!player?.id)return;
  const selfRespawn=player.id===clientId;
  diagnosticsRecordEvent('respawn',{playerId:String(player.id),self:selfRespawn,fireHeld:fireInputHeld(),recoilDebtPitch:diagnosticsRound(recoilDebtPitch),recoilPatternPitch:diagnosticsRound(recoilPatternPitch),recoilBurst:!!recoilBurstActive,recoilStep:Number(localRecoilStep[currentWeapon]??-1)});
  if(selfRespawn){recoilDebtPitch=recoilDebtYaw=recoilPatternPitch=recoilPatternYaw=0;recoilBurstActive=false;recoilBurstWeapon='';recoilBurstReleaseAt=0;recoilBurstEndedAt=performance.now();weaponKickZ=weaponKickVelocity=0;lastLocalShotAt=0;localShotHeat=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localShotHeatAt=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localRecoilStep=Object.fromEntries(WEAPON_ORDER.map(name=>[name,-1]));localWeaponShotSequence=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));}
  // Snapshot application also uses this entry point. A reconnect can legitimately
  // restore a player who is still inside the death/respawn window; do not treat
  // that snapshot as a respawn merely because the world is being rebuilt.
  if(player.id===clientId&&Math.max(0,Number(player.hp)||0)<=0){
    resetLocalPredictionHistory();hp=0;myStats={kills:Number(player.kills??myStats.kills)||0,deaths:Number(player.deaths??myStats.deaths)||0};wastedUntil=Math.max(serverNow()+120,Number(player.wastedUntil)||serverNow()+worldSettings.combat.respawnMs);
    yaw=Number.isFinite(Number(player.yaw))?Number(player.yaw):yaw;pitch=Number.isFinite(Number(player.pitch))?Number(player.pitch):pitch;deathViewStartYaw=yaw;deathViewTargetYaw=yaw;deathViewStartPitch=pitch;deathAnimStartedAt=performance.now()-700;
    position.set(Number(player.x)||0,Number(player.y)||worldSupportHeight(Number(player.x)||0,Number(player.z)||0,0,false),Number(player.z)||0);moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;clearCorrectionView();resetViewVertical();clearFireInput();cancelEquipmentAction();setAim(false);reloadRequestPending=false;reloadUntil=0;reloadWeapon='';pendingWeapon='';syncLocalStatus();return;
  }
  if(player.id===clientId){resetLocalPredictionHistory();hp=Math.max(0,Math.min(100,Number(player.hp??100)||0));myStats={kills:Number(player.kills??myStats.kills)||0,deaths:Number(player.deaths??myStats.deaths)||0};wastedUntil=0;lastWastedBy='';lastWastedWeapon='';lastWastedHeadshot=false;lastWastedDistance=0;deathViewStartYaw=0;deathViewTargetYaw=NaN;deathViewStartPitch=0;bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;blastFeedbackUntil=blastFeedbackPower=blastFeedbackSeed=0;lastShotVisualAt=0;localEquipmentCooldownUntil=0;myTeam=player.team||myTeam;pendingTeam=player.pendingTeam||'';if(player.activeClassId)activeClassId=normalizeLoadoutClassId(player.activeClassId);pendingClassId=player.pendingClassId?normalizeLoadoutClassId(player.pendingClassId):'';selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;primaryWeapon=PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:primaryWeapon;secondaryWeapon=SECONDARY_WEAPONS.includes(player.secondaryWeapon)?player.secondaryWeapon:secondaryWeapon;applyAttachmentState(player);tacticalEquipment=normalizeTactical(player.tactical);lethalEquipment=normalizeLethal(player.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberSecondary(secondaryWeapon);rememberAttachments(primaryAttachments,secondaryAttachments);rememberEquipment(tacticalEquipment,lethalEquipment);rememberLoadoutClasses(loadoutClasses,activeClassId);currentWeapon=(player.weapon===secondaryWeapon||player.weapon===primaryWeapon)?player.weapon:primaryWeapon;sniperZoomLevel=0;adsWanted=false;crouchWanted=false;crouched=false;crouchBlend=0;stopSlide();cancelSprint();ammo=normalizeClientAmmo(player.ammo);equipment=normalizeEquipment(player.equipment);pendingWeapon='';reloadRequestPending=false;reloadUntil=player.reloadAt||0;reloadWeapon=player.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;deathAnimStartedAt=0;landingKick=0;nextFootstepAt=0;shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;fireReadyAt=freshClientFireReady();akimboReadyAt={left:0,right:0};akimboLeftCycleStartedAt=akimboRightCycleStartedAt=0;akimboCycleSoundPlayed={left:false,right:false};clearFireInput();warmWeaponAudio(currentWeapon);syncLocalWeaponModel();traversal=player.traversal?traversalPlanFromServer({id:clientId,accepted:true,...player.traversal}):null;ladderState=player.ladder?ladderStateFromServer(player.ladder):null;ladderSeq=Math.max(ladderSeq,Math.floor(Number(player.ladder?.seq)||0));traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;yaw=Number.isFinite(Number(player.yaw))?Number(player.yaw):yaw;pitch=Number.isFinite(Number(player.pitch))?Number(player.pitch):0;position.set(player.x,player.y,player.z);clearCorrectionView();resetViewVertical();verticalVelocity=Number.isFinite(Number(player.verticalVelocity))?Number(player.verticalVelocity):0;moveVelocityX=moveVelocityZ=0;onGround=player.grounded!==false;lastGroundedAt=onGround?performance.now():0;jumpBufferedUntil=0;jumpSeq=Math.max(jumpSeq,Math.floor(Number(player.jumpSeq)||0));knockX=knockZ=0;camera.rotation.z=0;syncLocalStatus();showToast('Back in');return;}
  upsertRemote(player,true);const r=remotes.get(player.id);if(r){r.hp=100;}
}
function flashRemote(r){const old=r.body.material.emissive?.clone?.();r.body.material.emissive=new THREE.Color(0x8a1020);setTimeout(()=>{if(r.body?.material)r.body.material.emissive=old||new THREE.Color(0x000000)},120);}
function showHitmarker(headshot=false){const now=performance.now();hitUntil=now+(headshot?220:155);if(headshot)headshotUntil=now+280;}
function showHurt(){hurtUntil=performance.now()+650;}
function showToast(text,{duration=1600,priority=1,key=''}={}){
  const label=String(text||'').trim();if(!label)return;const toastKey=String(key||label),item={text:label,key:toastKey,duration:Math.max(500,Number(duration)||1600),priority:Math.max(0,Number(priority)||0),queuedAt:performance.now()};
  if(toastCurrent?.key===toastKey||toastQueue.some(entry=>entry.key===toastKey))return;
  toastQueue.push(item);toastQueue.sort((a,b)=>(b.priority-a.priority)||(a.queuedAt-b.queuedAt));if(toastQueue.length>5)toastQueue.length=5;hudLastDraw=0;
}
function activeToast(now){
  if(toastCurrent&&now>=toastCurrent.until)toastCurrent=null;
  if(!toastCurrent&&toastQueue.length){const next=toastQueue.shift();toastCurrent={...next,startedAt:now,until:now+next.duration};}
  return toastCurrent;
}
function clearToastNotifications(){toastCurrent=null;toastQueue.length=0;}
function syncLocalStatus(){if(hp<=0)setAim(false);syncPauseContext();}

function currentPlayerHeight(){return crouched?CROUCH_HEIGHT:PLAYER_HEIGHT;}
function canStandHere(){return !worldHeightExpansionBlockedAt(position.x,position.z,position.y,CROUCH_HEIGHT,PLAYER_HEIGHT,PLAYER_RADIUS);}
function expFollow(current,target,rate,dt){return current+(target-current)*(1-Math.exp(-Math.max(0,rate)*Math.max(0,dt)));}
function approachVector(x,z,targetX,targetZ,maxDelta){const dx=targetX-x,dz=targetZ-z,d=Math.hypot(dx,dz);if(d<=maxDelta||d<1e-7)return{x:targetX,z:targetZ};const scale=maxDelta/d;return{x:x+dx*scale,z:z+dz*scale};}
function smoothstep01(value){const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);}
function resetViewVertical(){viewFeetY=position?position.y:NaN;}
function clearCorrectionView(){correctionViewX=0;correctionViewY=0;correctionViewZ=0;}
function traversalPlanFromServer(m){
  const durationMs=Math.max(1,Number(m.durationMs)||1),elapsed=Math.max(0,serverNow()-(Number(m.startedAt)||serverNow()));
  return {seq:Math.max(0,Math.floor(Number(m.seq)||0)),mode:m.mode==='vault'?'vault':'mantle',role:String(m.role||''),portalId:String(m.portalId||''),startX:Number(m.startX)||0,startY:Number(m.startY)||0,startZ:Number(m.startZ)||0,endX:Number(m.endX)||0,endY:Number(m.endY)||0,endZ:Number(m.endZ)||0,peakY:Number(m.peakY)||Number(m.endY)||0,durationMs,startedAt:performance.now()-Math.min(durationMs,elapsed),endGrounded:m.endGrounded!==false,exitVelocityY:Number.isFinite(Number(m.exitVelocityY))?Number(m.exitVelocityY):0,viewMaxY:m.viewMaxY!=null&&Number.isFinite(Number(m.viewMaxY))?Number(m.viewMaxY):null};
}
function handleTraversalMessage(m){
  if(samePlayerId(m.id,clientId)){
    if(m.accepted===false){traversal=null;const x=Number(m.x),y=Number(m.y),z=Number(m.z);if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)){position.set(x,y,z);clearCorrectionView();resetViewVertical();}return;}
    ladderState=null;traversal=traversalPlanFromServer(m);clearCorrectionView();resetViewVertical();verticalVelocity=0;onGround=false;return;
  }
  const r=remotes.get(m.id);if(!r||m.accepted===false)return;r.traversal=traversalPlanFromServer(m);
}

function ladderStateFromServer(value){
  const state=value&&typeof value==='object'?value:null;if(!state?.id)return null;
  return {id:String(state.id),seq:Math.max(0,Math.floor(Number(state.seq)||0)),phase:'climb',entry:state.entry==='top'?'top':'bottom'};
}
function activeLadder(){return ladderById(LADDERS,ladderState?.id);}
function ladderInputAmount(){
  const input=movementInput(),raw=THREE.MathUtils.clamp(-input.mz,-1,1);
  // A top entry starts by continuing downward while the player keeps holding
  // the same forward input used to step onto the ladder. Once released, the
  // ladder uses the normal rule everywhere: forward = up, back = down.
  if(ladderState?.entry==='top'){
    if(Math.abs(raw)<.12){ladderState.entry='';return 0;}
    if(raw>0)return -raw;
    ladderState.entry='';
  }
  return raw;
}
function ladderDirection(){const input=movementInput();if(input.len<.20)return null;const sin=Math.sin(yaw),cos=Math.cos(yaw),dx=input.mx*cos+input.mz*sin,dz=-input.mx*sin+input.mz*cos,len=Math.hypot(dx,dz);return len>.001?{x:dx/len,z:dz/len}:null;}
function lockLadderReattach(id){ladderAttachLockId=String(id||'');ladderAttachLockUntil=performance.now()+260;ladderAttachNeedsRelease=true;}
function updateLadderAttachLock(now=performance.now()){
  if(!ladderAttachLockId)return;
  const input=movementInput();if(input.len<.12)ladderAttachNeedsRelease=false;
  if(!ladderAttachNeedsRelease&&now>=ladderAttachLockUntil){ladderAttachLockId='';ladderAttachLockUntil=0;}
}
function ladderAttachLocked(id){return !!ladderAttachLockId&&String(id||'')===ladderAttachLockId&&(ladderAttachNeedsRelease||performance.now()<ladderAttachLockUntil);}
function markLadderHandoff(){localPredictionHistory.length=0;lastCorrectionSeq=Math.max(lastCorrectionSeq,stateSeq);}
function tryAttachLadder(){
  if(ladderState||traversal||!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||!onGround)return false;
  const direction=ladderDirection();if(!direction)return false;
  const faceX=-Math.sin(yaw),faceZ=-Math.cos(yaw),entry=findLadderEntry({ladders:LADDERS,x:position.x,y:position.y,z:position.z,dirX:direction.x,dirZ:direction.z,faceX,faceZ,radius:PLAYER_RADIUS,grounded:onGround});if(!entry||ladderAttachLocked(entry.ladderId))return false;
  // Send the current free-movement pose first. The server then validates the
  // attach from the same position the client used instead of a stale network pose.
  sendCurrentState(true);markLadderHandoff();
  const seq=++ladderSeq;
  stopSlide();cancelSprint();ladderState={id:String(entry.ladderId),seq,phase:'climb',entry:entry.entry==='top'?'top':'bottom'};
  position.set(Number(entry.attachX),Number(entry.attachY),Number(entry.attachZ));
  clearCorrectionView();resetViewVertical();verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=false;landingKick=0;crouchWanted=false;crouched=false;setAim(false);cancelEquipmentAction();
  send({t:'ladder',action:'attach',seq,at:Math.round(serverNow()),ladderId:entry.ladderId,dirX:round3(direction.x),dirZ:round3(direction.z)});return true;
}
function finishLadder(end){
  if(!ladderState)return false;const ladder=activeLadder();if(!ladder)return false;
  const target=end==='top'?ladderTopExitPoint(ladder,PLAYER_RADIUS):ladderBottomExitPoint(ladder,PLAYER_RADIUS);
  if(worldBlockedAt(target.x,target.z,target.y,PLAYER_HEIGHT,PLAYER_RADIUS)||remoteActorBlocked(target.x,target.z,target.y,position.x,position.z,PLAYER_HEIGHT)){showToast('LADDER EXIT BLOCKED',{duration:900,key:'ladder-exit-blocked'});return false;}
  // Flush the final on-ladder pose before asking the server to dismount. This
  // removes the old race where the server could reject an exit using an older y.
  sendCurrentState(true);markLadderHandoff();
  const seq=++ladderSeq;
  position.set(target.x,target.y,target.z);ladderState=null;lockLadderReattach(ladder.id);verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=true;lastGroundedAt=performance.now();clearCorrectionView();resetViewVertical();localMoveAmount=0;
  send({t:'ladder',action:'dismount',end,seq,at:Math.round(serverNow()),ladderId:String(ladder.id)});sendCurrentState(true);return true;
}
function detachLadder(){
  if(!ladderState)return false;const ladder=activeLadder();if(!ladder)return false;
  const cp=ladderClimbPoint(ladder,PLAYER_RADIUS),targetX=cp.x+Number(ladder.nx)*.24,targetZ=cp.z+Number(ladder.nz)*.24;
  if(worldBlockedAt(targetX,targetZ,position.y,PLAYER_HEIGHT,PLAYER_RADIUS)||remoteActorBlocked(targetX,targetZ,position.y,position.x,position.z,PLAYER_HEIGHT)){showToast('LADDER EXIT BLOCKED',{duration:900,key:'ladder-exit-blocked'});return false;}
  sendCurrentState(true);markLadderHandoff();
  const seq=++ladderSeq;
  position.x=targetX;position.z=targetZ;ladderState=null;lockLadderReattach(ladder.id);verticalVelocity=2.15;onGround=false;lastGroundedAt=0;clearCorrectionView();resetViewVertical();send({t:'ladder',action:'detach',seq,ladderId:String(ladder.id)});sendCurrentState(true);soundJump();return true;
}
function updateLadder(nowServer,dt){
  if(!ladderState)return false;const ladder=activeLadder();if(!ladder){ladderState=null;return false;}
  const cp=ladderClimbPoint(ladder,PLAYER_RADIUS),input=ladderInputAmount();position.x=cp.x;position.z=cp.z;position.y=ladderClimbStep(ladder,position.y,input,dt);verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=false;localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,Math.abs(input),Math.min(1,dt*12));
  if(input>.18&&position.y>=Number(ladder.topY)-.105){finishLadder('top');return true;}
  if(input<-.18&&position.y<=Number(ladder.bottomY)+.005){finishLadder('bottom');return true;}
  return true;
}
function handleLadderMessage(m){
  if(samePlayerId(m.id,clientId)){
    if(m.accepted===false){const x=Number(m.x),y=Number(m.y),z=Number(m.z);ladderState=m.ladder?ladderStateFromServer(m.ladder):null;if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)){position.set(x,y,z);clearCorrectionView();resetViewVertical();}return;}
    const x=Number(m.x),y=Number(m.y),z=Number(m.z);
    if(m.action==='dismount'){
      const sameLocalAction=Number(m.seq)===Number(ladderSeq);ladderState=null;
      // The local exit was already predicted to this exact server-defined point.
      // Do not apply the same teleport a second time when its acknowledgement arrives.
      if(!sameLocalAction&&Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)){position.set(x,y,z);clearCorrectionView();resetViewVertical();}
      verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=true;lastGroundedAt=performance.now();return;
    }
    if(m.action==='detach'){
      ladderState=null;const sameLocalAction=Number(m.seq)===Number(ladderSeq);if(!sameLocalAction&&Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z))position.set(x,y,z);verticalVelocity=Number.isFinite(Number(m.verticalVelocity))?Number(m.verticalVelocity):2.15;onGround=false;clearCorrectionView();resetViewVertical();return;
    }
    const authoritative=ladderStateFromServer(m.ladder);if(!ladderState||Number(ladderState.seq)!==Number(m.seq)){ladderState=authoritative;if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z))position.set(x,y,z);}clearCorrectionView();resetViewVertical();verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=false;return;
  }
  const r=remotes.get(m.id);if(!r||m.accepted===false)return;r.ladder=m.ladder?ladderStateFromServer(m.ladder):null;if(m.action==='detach'||m.action==='dismount')r.ladder=null;
}

function predictionStateForSeq(seq){for(let i=localPredictionHistory.length-1;i>=0;i--)if(localPredictionHistory[i].seq===seq)return localPredictionHistory[i];return null;}
function rebasePredictionsAfter(seq,dx,dy,dz){
  if(!seq||(!dx&&!dy&&!dz))return;
  for(const sample of localPredictionHistory){
    if(sample.seq<=seq)continue;
    sample.x+=dx;sample.y+=dy;sample.z+=dz;
  }
}
function discardPredictionThrough(seq){while(localPredictionHistory.length&&localPredictionHistory[0].seq<=seq)localPredictionHistory.shift();}
function resetLocalPredictionHistory(){localPredictionHistory.length=0;stateSeq=0;lastCorrectionSeq=0;lastStateSent=0;lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,adsAmount:0,crouched:false,sprinting:false,sliding:false,grounded:true,moveX:0,moveZ:0,ladderId:'',ladderMove:0};}
function applyServerCorrection(m){
  // Traversal is deterministic once accepted. A correction for an earlier
  // free-movement state must not pull the player back into the obstacle.
  if(traversal){clearCorrectionView();return;}
  const cx=Number(m.x),cy=Number(m.y),cz=Number(m.z),seq=Math.max(0,Math.floor(Number(m.seq)||0));
  if(seq&&seq<=lastCorrectionSeq)return;
  const serverX=Number.isFinite(cx)?cx:position.x,serverY=Number.isFinite(cy)?cy:position.y,serverZ=Number.isFinite(cz)?cz:position.z;
  const visualX=position.x+correctionViewX,visualY=Number.isFinite(viewFeetY)?viewFeetY:position.y+correctionViewY,visualZ=position.z+correctionViewZ;
  const predicted=seq?predictionStateForSeq(seq):null;
  // If the state has already aged out of the prediction window, snapping to
  // an old correction is worse than keeping the newer authoritative stream.
  if(seq&&!predicted){lastCorrectionSeq=Math.max(lastCorrectionSeq,seq);return;}
  let deltaX,deltaY,deltaZ;
  if(predicted){deltaX=serverX-predicted.x;deltaY=serverY-predicted.y;deltaZ=serverZ-predicted.z;}
  else{deltaX=serverX-position.x;deltaY=serverY-position.y;deltaZ=serverZ-position.z;}
  position.x+=deltaX;position.y+=deltaY;position.z+=deltaZ;
  // Every prediction newer than the corrected snapshot was simulated in the
  // same old coordinate frame. Rebase it once with the authoritative delta so
  // later correction packets only contain NEW error instead of re-applying the
  // same network correction over and over after a packet stall.
  if(seq)rebasePredictionsAfter(seq,deltaX,deltaY,deltaZ);
  const correctionMagnitude=Math.hypot(deltaX,deltaY,deltaZ),recent=!seq||stateSeq-seq<=2;recordNetCorrection(m,correctionMagnitude);if(diagnosticsRecordingEnabled()&&(fireInputHeld()||correctionMagnitude>.08))diagnosticsRecordEvent('server_correction',{seq,dx:diagnosticsRound(deltaX,4),dy:diagnosticsRound(deltaY,4),dz:diagnosticsRound(deltaZ,4),magnitude:diagnosticsRound(correctionMagnitude,4),reason:String(m?.reason||''),fire:fireInputHeld(),positionY:diagnosticsRound(position.y,3),viewFeetY:diagnosticsRound(viewFeetY,3)});
  if(correctionMagnitude>CORRECTION_HARD_SNAP_DISTANCE||Math.abs(deltaY)>.9){clearCorrectionView();resetViewVertical();}
  else{
    const errorX=visualX-position.x,errorY=visualY-position.y,errorZ=visualZ-position.z,horizontal=Math.hypot(errorX,errorZ),scale=horizontal>CORRECTION_MAX_HORIZONTAL?CORRECTION_MAX_HORIZONTAL/horizontal:1;
    correctionViewX=errorX*scale;correctionViewZ=errorZ*scale;correctionViewY=THREE.MathUtils.clamp(errorY,-CORRECTION_MAX_VERTICAL,CORRECTION_MAX_VERTICAL);
  }
  if(seq){lastCorrectionSeq=seq;discardPredictionThrough(seq);}
  if(recent&&typeof m.crouched==='boolean'){crouched=m.crouched;if(crouched)crouchWanted=true;else if(!crouchWanted)crouched=false;}
  if(recent&&m.vertical){const serverVy=Number(m.verticalVelocity);if(Number.isFinite(serverVy))verticalVelocity=serverVy;onGround=typeof m.grounded==='boolean'?m.grounded:Math.abs(position.y-worldSupportHeight(position.x,position.z,position.y))<=.08;}
}
function updateCorrectionView(dt){
  const decay=Math.exp(-CORRECTION_VIEW_RATE*Math.max(0,dt));correctionViewX*=decay;correctionViewY*=decay;correctionViewZ*=decay;
  if(Math.abs(correctionViewX)<.0003)correctionViewX=0;if(Math.abs(correctionViewY)<.0003)correctionViewY=0;if(Math.abs(correctionViewZ)<.0003)correctionViewZ=0;
}
function updateViewVertical(dt){
  const target=position.y+correctionViewY;if(traversal||ladderState){viewFeetY=target;return viewFeetY;}if(!Number.isFinite(viewFeetY)||Math.abs(target-viewFeetY)>VIEW_VERTICAL_SNAP_DISTANCE){viewFeetY=target;return viewFeetY;}
  const rate=onGround?(target>=viewFeetY?GROUND_VIEW_UP_RATE:GROUND_VIEW_DOWN_RATE):AIR_VIEW_RATE;viewFeetY=expFollow(viewFeetY,target,rate,dt);
  // Ground support already uses continuous ramps for stairs. Keep only a very
  // small visual filter here: allowing the camera to trail 30-50 cm behind a
  // steep stair ramp caused a visible catch-up pop at the top/bottom of flights.
  if(onGround){const lag=target-viewFeetY;if(lag>GROUND_VIEW_MAX_LAG)viewFeetY=target-GROUND_VIEW_MAX_LAG;else if(lag<-GROUND_VIEW_MAX_LAG)viewFeetY=target+GROUND_VIEW_MAX_LAG;}
  if(Math.abs(target-viewFeetY)<.0005)viewFeetY=target;return viewFeetY;
}
function updateCrouchState(dt=0){
  const next=crouchWanted||(crouched&&!canStandHere());crouched=next;
  const target=crouched?1:0;crouchBlend=expFollow(crouchBlend,target,CROUCH_VIEW_RATE,Math.max(.001,dt));if(Math.abs(target-crouchBlend)<.002)crouchBlend=target;
}
function weaponSprintOutMs(weapon=currentWeapon){return Math.max(0,Number(effectiveWeaponSpec(weapon)?.sprintOutMs)||0);}
function weaponSprintAdsMs(weapon=currentWeapon){return Math.max(0,Number(effectiveWeaponSpec(weapon)?.sprintAdsMs)||weaponSprintOutMs(weapon)*.8);}
function clearQueuedSprintShot(){pendingSprintShot='';pendingSprintShotExpiresAt=0;}
function registerSprintExit(now=performance.now(),weapon=currentWeapon){sprintActionReadyAt=Math.max(sprintActionReadyAt,now+weaponSprintOutMs(weapon));}
function cancelSprint({lockMs=0}={}){const now=performance.now(),wasSprinting=sprinting;sprintLatched=false;sprinting=false;if(wasSprinting&&!sliding)registerSprintExit(now);if(lockMs>0)sprintBlockedUntil=Math.max(sprintBlockedUntil,now+lockMs);}
function sprintInputRequested(input=movementInput()){const touchAuto=touchGameplayControlsVisible()&&touchRoleActive('joy')&&input.len>=TOUCH_SPRINT_MIN_INPUT&&input.mz<=-TOUCH_SPRINT_MIN_FORWARD;return keys.has('ShiftLeft')||keys.has('ShiftRight')||sprintLatched||touchAuto;}
function sprintEligible(input=movementInput()){
  const now=performance.now();return now>=sprintBlockedUntil&&!fireInputHeld()&&!combatActionActive()&&!sliding&&!adsWanted&&!crouched&&!crouchWanted&&onGround&&!traversal&&!ladderState&&input.len>=SPRINT_MIN_INPUT&&input.mz<=-SPRINT_MIN_FORWARD;
}
function toggleSprint(){
  const now=performance.now();if(!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||traversal||ladderState||sliding||now<sprintBlockedUntil)return;
  sprintLatched=!sprintLatched;if(!sprintLatched)sprinting=false;sendCurrentState(true);
}
function updateSprintState(input){
  if(sliding){sprinting=false;return false;}
  const now=performance.now(),requested=sprintInputRequested(input),eligible=requested&&sprintEligible(input),wasSprinting=sprinting;sprinting=eligible;if(wasSprinting&&!sprinting&&!sliding)registerSprintExit(now);
  if(sprintLatched&&!eligible&&(now<sprintBlockedUntil||fireInputHeld()||combatActionActive()||adsWanted||crouched||crouchWanted||input.len<.12||input.mz>-.05||!onGround))sprintLatched=false;
  return sprinting;
}
function stopSlide({recover=false}={}){const wasSliding=sliding;sliding=false;slideStartedAt=0;slideDirX=slideDirZ=0;slideStartSpeed=0;if(recover&&wasSliding){const now=performance.now();slideRecoveryUntil=Math.max(slideRecoveryUntil,now+SLIDE_RECOVERY_MS);sprintBlockedUntil=Math.max(sprintBlockedUntil,slideRecoveryUntil);crouchWanted=false;if(canStandHere())crouched=false;}else if(!recover)slideRecoveryUntil=0;}
function startSlide(){
  if(!sprinting||!onGround||adsWanted||traversal||ladderState)return false;
  const speed=Math.hypot(moveVelocityX,moveVelocityZ),movement=worldSettings.movement;if(speed<movement.runSpeed*.72)return false;
  const input=movementInput();if(input.len<.35)return false;
  const inv=speed>1e-5?1/speed:0;slideDirX=inv?moveVelocityX*inv:Math.sin(yaw)*-1;slideDirZ=inv?moveVelocityZ*inv:Math.cos(yaw)*-1;
  slideRecoveryUntil=0;slideStartSpeed=Math.max(speed,movement.runSpeed*SLIDE_START_SPEED_MULTIPLIER);slideStartedAt=performance.now();sliding=true;crouchWanted=true;crouched=true;cancelSprint();setAim(false);soundSlide();sendCurrentState(true);return true;
}
function setCrouch(active){if(sliding&&!active)stopSlide({recover:true});crouchWanted=!!active;if(crouchWanted)crouched=true;else if(canStandHere())crouched=false;sendCurrentState(true);}
function toggleCrouch(){
  if(!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||traversal||ladderState)return;
  if(startSlide())return;
  const next=!crouchWanted;if(!next&&!canStandHere()){crouched=true;crouchWanted=false;showToast('NEED CLEARANCE');sendCurrentState(true);return;}setCrouch(next);
}
function traversalDirection(){
  const input=movementInput();if(input.len<.15)return null;
  const sin=Math.sin(yaw),cos=Math.cos(yaw),dx=input.mx*cos+input.mz*sin,dz=-input.mx*sin+input.mz*cos,len=Math.hypot(dx,dz);return len>.001?{x:dx/len,z:dz/len}:null;
}
function traversalCandidate(direction,airborne=!onGround){
  if(!direction||traversal)return null;
  return findTraversalCandidate({x:position.x,y:position.y,z:position.z,dirX:direction.x,dirZ:direction.z,height:currentPlayerHeight(),radius:PLAYER_RADIUS,airborne});
}
function beginTraversal(candidate,direction,{playJump=false}={}){
  if(!candidate||!direction||traversal||ladderState||!shell.canPlay||hp<=0)return false;
  if(remoteActorBlocked(candidate.endX,candidate.endZ,candidate.endY,position.x,position.z,currentPlayerHeight()))return false;
  const now=performance.now(),seq=++traversalSeq,plan=createTraversalPlan(candidate,position.x,position.y,position.z,now,seq);if(!plan)return false;
  stopSlide();cancelSprint();traversal={...plan,dirX:direction.x,dirZ:direction.z};traversalConsumedIntentSeq=traversalIntentSeq;traversalIntentUntil=0;clearCorrectionView();resetViewVertical();verticalVelocity=0;onGround=false;landingKick=0;setAim(false);clearFireInput();cancelEquipmentAction();
  sendCurrentState(true);send({t:'traverse',seq,at:Math.round(serverNow()),dirX:round3(direction.x),dirZ:round3(direction.z)});if(playJump)soundJump();return true;
}
function tryTraversal({vaultOnly=false}={}){
  const direction=traversalDirection(),candidate=traversalCandidate(direction,!onGround);if(!candidate||vaultOnly&&candidate.mode!=='vault')return false;return beginTraversal(candidate,direction,{playJump:onGround});
}
function updateTraversal(now){
  if(!traversal)return false;const pose=traversalPose(traversal,now);if(!pose){traversal=null;return false;}
  position.set(pose.x,pose.y,pose.z);verticalVelocity=0;onGround=false;
  if(pose.done){const finished=traversal;position.set(finished.endX,finished.endY,finished.endZ);traversal=null;onGround=finished.endGrounded!==false;verticalVelocity=onGround?0:(Number.isFinite(Number(finished.exitVelocityY))?Number(finished.exitVelocityY):-1.15);if(onGround){lastGroundedAt=now;landingKick=.32;nextFootstepAt=now+120;soundLanding(.28);}else{landingKick=0;}sendCurrentState(true);}
  return true;
}
function startPlayerJump(now=performance.now(),{allowTraversal=true}={}){
  if(sliding){stopSlide();crouchWanted=false;if(canStandHere())crouched=false;}cancelSprint();
  // A crouched player at a window/low barrier gets first chance to vault it.
  // Only require standing headroom when an actual free jump is needed.
  if((crouched||crouchWanted)&&allowTraversal&&tryTraversal())return true;
  if(crouched||crouchWanted){crouchWanted=false;if(!canStandHere()){crouched=true;showToast('LOW CEILING');sendCurrentState(true);return false;}crouched=false;}
  if(allowTraversal&&onGround&&tryTraversal({vaultOnly:true}))return true;
  jumpBufferedUntil=0;jumpSeq+=1;verticalVelocity=Math.sqrt(2*worldSettings.movement.gravity*worldSettings.movement.jumpHeight);onGround=false;landingKick=0;sendCurrentState(true);soundJump();return true;
}
function tryJump(){
  if(!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||traversal)return;if(ladderState){detachLadder();return;}const now=performance.now();traversalIntentSeq+=1;traversalIntentUntil=now+560;
  if(onGround||now-lastGroundedAt<=COYOTE_TIME_MS){startPlayerJump(now);return;}
  if(tryTraversal()){jumpBufferedUntil=0;return;}
  jumpBufferedUntil=now+JUMP_BUFFER_MS;
}
function movementInput(){
  let mx=0,mz=0;
  if(!chatOpen&&shell.canPlay&&matchAllowsMovement(matchState)&&hp>0){
    if(controllerInputActive()){const controllerMove=controllerMoveAxes();mx=controllerMove.x;mz=controllerMove.y;}
    else if(touchGameplayControlsVisible()){mx=joy.x;mz=joy.y;}
    else{if(keys.has('KeyA'))mx--;if(keys.has('KeyD'))mx++;if(keys.has('KeyW'))mz--;if(keys.has('KeyS'))mz++;}
  }
  const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
  moveInput.mx=mx;moveInput.mz=mz;moveInput.len=Math.min(1,len);return moveInput;
}
function effectiveAimYaw(){return yaw;}
function effectiveAimPitch(){return THREE.MathUtils.clamp(pitch,-1.28,1.28);}
function statePayload(seq=stateSeq){const input=movementInput(),ladderMove=ladderState?ladderInputAmount():0;return {t:'state',seq:Math.max(0,Math.floor(Number(seq)||0)),at:Math.round(serverNow()),x:round3(position.x),y:round3(position.y),z:round3(position.z),yaw:round3(yaw),pitch:round3(pitch),ads:currentWeapon==='akimbo1887'?false:adsWanted,adsAmount:currentWeapon==='akimbo1887'?0:round3(adsBlend),crouched,sprinting,sliding,grounded:onGround,jumpSeq,moveX:round3(input.mx),moveZ:round3(input.mz),ladderId:ladderState?.id||'',ladderMove:round3(ladderMove)};}
function stateChanged(p){return !Number.isFinite(lastSentState.x)||Math.abs(p.x-lastSentState.x)>.008||Math.abs(p.y-lastSentState.y)>.008||Math.abs(p.z-lastSentState.z)>.008||Math.abs(normalizeAngle(p.yaw-lastSentState.yaw))>.0025||Math.abs(p.pitch-lastSentState.pitch)>.0025||Math.abs(p.moveX-lastSentState.moveX)>.02||Math.abs(p.moveZ-lastSentState.moveZ)>.02||Math.abs((p.ladderMove||0)-(lastSentState.ladderMove||0))>.02||String(p.ladderId||'')!==String(lastSentState.ladderId||'')||p.ads!==lastSentState.ads||Math.abs((p.adsAmount||0)-(lastSentState.adsAmount||0))>.025||p.crouched!==lastSentState.crouched||p.sprinting!==lastSentState.sprinting||p.sliding!==lastSentState.sliding||p.grounded!==lastSentState.grounded;}
function rememberPredictionState(p,now=performance.now()){
  localPredictionHistory.push({seq:p.seq,at:p.at,localAt:now,x:p.x,y:p.y,z:p.z,grounded:p.grounded,crouched:p.crouched});
  const cutoff=now-LOCAL_PREDICTION_HISTORY_MS;while(localPredictionHistory.length&&(localPredictionHistory[0].localAt<cutoff||localPredictionHistory.length>LOCAL_PREDICTION_MAX_SAMPLES))localPredictionHistory.shift();
}
function sendCurrentState(force=false){
  const now=performance.now(),preview=statePayload(stateSeq+1),changed=stateChanged(preview),interval=changed?ACTIVE_STATE_INTERVAL:IDLE_STATE_INTERVAL;
  if(!force&&now-lastStateSent<interval)return false;
  stateSeq+=1;preview.seq=stateSeq;recordNetStateSend(now);lastStateSent=now;lastSentState={x:preview.x,y:preview.y,z:preview.z,yaw:preview.yaw,pitch:preview.pitch,ads:preview.ads,adsAmount:preview.adsAmount||0,crouched:preview.crouched,sprinting:preview.sprinting,sliding:preview.sliding,grounded:preview.grounded,moveX:preview.moveX,moveZ:preview.moveZ,ladderId:preview.ladderId||'',ladderMove:preview.ladderMove||0};rememberPredictionState(preview,now);send(preview);return true;
}
function applyAuthoritativeLoadout(m){
  if(m?.action==='fire')diagnosticsRecordEvent('fire_loadout_ack',{accepted:m.accepted!==false,reason:String(m.reason||''),weapon:String(m.weapon||''),currentWeapon,stateSeq,serverAmmo:Number(m?.ammo?.[m.weapon]),localAmmo:Number(ammo[m.weapon]??-1),reloadAt:Number(m.reloadAt)||0,pendingWeapon:String(pendingWeapon||'')});
  if(m?.accepted===false&&m.action)recordNetReject(m.action,m.reason);
  const ackRev=Math.max(0,Math.floor(Number(m.rev)||0));
  if(shell.inLobby&&m.action==='loadout'&&ackRev&&ackRev<lobbyLoadoutRevision)return;
  if(shell.inMatch&&m.action==='loadout'&&ackRev&&ackRev<matchLoadoutRevision)return;
  if(shell.inLobby&&m.action==='loadout'&&ackRev)lobbyLoadoutAckRevision=Math.max(lobbyLoadoutAckRevision,ackRev);
  if(shell.inMatch&&m.action==='loadout'&&ackRev)matchLoadoutAckRevision=Math.max(matchLoadoutAckRevision,ackRev);
  if(Array.isArray(m.loadoutClasses))loadoutClasses=normalizeLoadoutClasses(m.loadoutClasses,selectedLoadout());if(Object.prototype.hasOwnProperty.call(m,'activeClassId')){activeClassId=normalizeLoadoutClassId(m.activeClassId);if(shell.inLobby)lobbyStartingClassId=activeClassId;}if(Object.prototype.hasOwnProperty.call(m,'pendingClassId'))pendingClassId=m.pendingClassId?normalizeLoadoutClassId(m.pendingClassId):'';if(Array.isArray(m.loadoutClasses))rememberLoadoutClasses(loadoutClasses,pendingClassId||activeClassId);
  if(PRIMARY_WEAPONS.includes(m.primaryWeapon)){primaryWeapon=m.primaryWeapon;if(shell.inLobby)rememberPrimary(primaryWeapon);}
  if(SECONDARY_WEAPONS.includes(m.secondaryWeapon)){secondaryWeapon=m.secondaryWeapon;if(shell.inLobby)rememberSecondary(secondaryWeapon);}
  primaryAttachments=normalizeWeaponAttachments(primaryWeapon,m.primaryAttachments??primaryAttachments);secondaryAttachments=normalizeWeaponAttachments(secondaryWeapon,m.secondaryAttachments??secondaryAttachments);if(shell.inLobby)rememberAttachments(primaryAttachments,secondaryAttachments);
  if(TACTICAL_EQUIPMENT.includes(m.tactical)){tacticalEquipment=normalizeTactical(m.tactical);if(shell.inLobby)rememberEquipment(tacticalEquipment,lethalEquipment);}
  if(LETHAL_EQUIPMENT.includes(m.lethal)){lethalEquipment=normalizeLethal(m.lethal);if(shell.inLobby)rememberEquipment(tacticalEquipment,lethalEquipment);}
  pendingLoadout=m.pendingLoadout&&typeof m.pendingLoadout==='object'?normalizeLoadoutChoice(m.pendingLoadout):null;
  if(typeof m.pendingTeam==='string')pendingTeam=m.pendingTeam;
  const serverWeapon=(m.weapon===secondaryWeapon||m.weapon===primaryWeapon)?m.weapon:currentWeapon;
  if(!pendingWeapon||serverWeapon===pendingWeapon){currentWeapon=serverWeapon;if(pendingWeapon===serverWeapon)pendingWeapon='';}
  syncClientAmmo(m.ammo);if(m.equipment)equipment=normalizeEquipment(m.equipment);
  reloadUntil=Math.max(0,Number(m.reloadAt)||0);reloadWeapon=m.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;reloadRequestPending=false;
  if(m.action==='weapon'&&m.accepted!==false)pendingWeapon='';
  if(m.action==='reloadShell')soundReload('shotgun');
  if(m.action==='fire'&&m.accepted===false&&(m.reason==='cooldown'||m.reason==='weapon_switch'||m.reason==='sprint_out'))delayFire(Math.max(8,Math.min(180,Number(m.retryAfterMs)||35)),m.weapon);
  if(m.pending===true&&pendingLoadout){rememberLoadoutClasses(loadoutClasses,activeClassId);showToast(`${loadoutClassById(loadoutClasses,pendingClassId||activeClassId).name} QUEUED · NEXT SPAWN`);}
  if(shell.inLobby&&lobbyLoadoutDraft){if(Array.isArray(m.loadoutClasses))lobbyClassDrafts=normalizeLoadoutClasses(loadoutClasses,selectedLoadout());markLobbyLoadoutDirty();}
  if(shell.panel===SHELL_PANEL.LOADOUT&&Array.isArray(m.loadoutClasses)){matchClassDrafts=normalizeLoadoutClasses(loadoutClasses,selectedLoadout());matchClassBase=normalizeLoadoutClasses(loadoutClasses,selectedLoadout());loadoutDraft=classLoadout(matchClassDrafts,loadoutEditClass.match);loadoutBaseDraft=classLoadout(matchClassBase,loadoutEditClass.match);syncMatchLoadoutEditor();}syncLocalWeaponModel();syncPauseContext();if(shell.inLobby){renderLobbySetupControls();setLobbyActionState();renderLobbyRoster(lobbyDisplayMode());}
}

function freshClientFireReady(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));}
function touchRoleActive(role){for(const value of touchRoles.values())if(value===role)return true;return false;}
function fireInputHeld(){return mouseFireDown||touchRoleActive('fire')||gamepadFireDown;}
function beginRecoilBurst(weapon=currentWeapon){
  if(!automaticRecoilActive(weapon))return;
  recoilBurstReleaseAt=0;
  if(recoilBurstActive&&recoilBurstWeapon===weapon)return;
  recoilBurstActive=true;recoilBurstWeapon=weapon;localRecoilStep[weapon]=-1;
  // A quick re-trigger can happen before the previous burst has recovered. The
  // remaining vertical recoil debt is the new burst's baseline; starting the
  // envelope from zero here would stack a second full climb on top of it.
  recoilPatternPitch=Math.max(0,recoilDebtPitch);recoilPatternYaw=0;
}
function endRecoilBurst(releasedAt=performance.now()){
  if(recoilBurstWeapon&&localRecoilStep[recoilBurstWeapon]!==undefined)localRecoilStep[recoilBurstWeapon]=-1;
  recoilBurstActive=false;recoilBurstWeapon='';recoilBurstReleaseAt=0;recoilBurstEndedAt=releasedAt;recoilPatternPitch=0;recoilPatternYaw=0;
}
function scheduleRecoilBurstRelease(){
  if(!recoilBurstActive||!recoilBurstWeapon||recoilBurstReleaseAt)return;
  // One/two bad mobile input frames must not split an automatic burst, but this
  // qualification window is independent from recoil recovery timing.
  recoilBurstReleaseAt=performance.now();
}
function endRecoilBurstIfReleased(){if(!fireInputHeld())scheduleRecoilBurstRelease();else recoilBurstReleaseAt=0;}
function clearFireInput(){mouseFireDown=false;gamepadFireDown=false;for(const [id,role] of touchRoles)if(role==='fire'||role==='fire-left'||role==='fire-right')touchRoles.delete(id);endRecoilBurst();clearQueuedSprintShot();}
function delayFire(ms,weapon=currentWeapon){weapon=WEAPON_SPECS[weapon]?weapon:currentWeapon;if(ms>0)fireReadyAt[weapon]=Math.max(fireReadyAt[weapon]||0,performance.now()+ms);}
function pressMouseFire(){if(mouseFireDown||!combatWeaponAvailable())return;const wasHeld=fireInputHeld();mouseFireDown=true;if(!wasHeld)requestShot();}
function pressTouchFire(pointerId,hand='right'){if(touchRoles.has(pointerId)||!combatWeaponAvailable())return;if(currentWeapon==='akimbo1887'){touchRoles.set(pointerId,hand==='left'?'fire-left':'fire-right');requestShot(hand);return;}const wasHeld=fireInputHeld();touchRoles.set(pointerId,'fire');if(!wasHeld)requestShot();}
function bipodRecoilScale(weapon=currentWeapon){if(weapon!=='machineGun'||weapon!==currentWeapon)return 1;const mods=attachmentsForWeapon(weapon),item=ATTACHMENTS.bipod,still=Math.hypot(moveVelocityX,moveVelocityZ)<=Math.max(.18,worldSettings.movement.walkSpeed*.10);return weaponHasAttachment(weapon,mods,'bipod')&&crouched&&onGround&&!sliding&&still?Math.max(.45,Math.min(1,Number(item?.conditionalRecoilScale)||.62)):1;}
function recoilSpec(weapon){const safe=WEAPON_SPECS[weapon]?weapon:'pistol',resolved=effectiveWeaponSpec(safe),scale=bipodRecoilScale(safe);if(scale>=.999)return resolved;return{...resolved,recoilPitch:Number(resolved.recoilPitch||0)*scale,recoilYaw:Number(resolved.recoilYaw||0)*scale,recoilMaxPitch:Number(resolved.recoilMaxPitch||resolved.recoilPitch||0)*scale,recoilMaxYaw:Number(resolved.recoilMaxYaw||resolved.recoilYaw||0)*scale};}
// Automatic recoil uses a bounded CoD-style envelope instead of climbing
// forever. The first ~1 second climbs mostly vertically, the next section bends
// right, then sustained fire moves around that elevated/rightward hold area.
// The hold-area motion changes the real aim/bullet ray; it is not viewmodel-only.
const RECOIL_SINGLE_YAW_PATTERN=[0,.04,.10,.17,.24,.30,.32,.28,.20,.10,0,-.10,-.17,-.20,-.15,-.07,.02,.09];
function recoilSmooth01(v){v=Math.max(0,Math.min(1,Number(v)||0));return v*v*(3-2*v);}
function automaticRecoilTarget(step,weapon,recoilScale=1,adsScale=1,heatScale=1){
  const r=recoilSpec(weapon),s=Math.max(0,Number(step)||0),cooldown=Math.max(50,Number(weaponRules(weapon).cooldownMs)||100),elapsed=s*cooldown;
  const climbMs=weapon==='machineGun'?1150:weapon==='assault'?1000:900,curveMs=weapon==='machineGun'?760:weapon==='assault'?650:560;
  const maxPitch=Math.max(.001,Number(r.recoilMaxPitch)||.08)*recoilScale*adsScale;
  const maxYaw=Math.max(.001,Number(r.recoilMaxYaw)||.025)*recoilScale*adsScale;
  const firstPitch=Math.max(0,Number(r.recoilPitch)||0)*recoilScale*adsScale*Math.max(.18,Math.min(1,Number(r.firstShotRecoilScale)||.5));
  let pitchTarget,yawTarget;
  // A small deterministic spread is present from the first few rounds so the
  // climb never traces a ruler-straight line. Keep it low-frequency/bounded:
  // recoil should feel hand-driven and controllable, not randomly teleport.
  const spreadRamp=recoilSmooth01(Math.min(1,s/3)),weaponSpread=weapon==='machineGun'?1.12:weapon==='assault'?1:.78;
  const earlyYawSpread=maxYaw*weaponSpread*spreadRamp*(.120*Math.sin(s*1.71+.55)+.052*Math.sin(s*2.83+1.15));
  const earlyPitchSpread=maxPitch*weaponSpread*spreadRamp*(.025*Math.sin(s*1.37+.25)+.014*Math.sin(s*2.31+1.40));
  if(elapsed<=climbMs){
    const p=recoilSmooth01(elapsed/climbMs);
    pitchTarget=firstPitch+(maxPitch*.78-firstPitch)*p+earlyPitchSpread;
    yawTarget=-maxYaw*.08*p+earlyYawSpread;
  }else if(elapsed<=climbMs+curveMs){
    const p=recoilSmooth01((elapsed-climbMs)/curveMs);
    const curveSpread=1-.35*p;
    pitchTarget=maxPitch*(.78+.10*p)+earlyPitchSpread*curveSpread;
    yawTarget=-maxYaw*(.08+.72*p)+earlyYawSpread*curveSpread;
  }else{
    const h=(elapsed-climbMs-curveMs)/Math.max(60,cooldown);
    const pitchWander=.068*Math.sin(h*.79+.35)+.038*Math.sin(h*1.73+1.10)+.022*Math.sin(h*2.41+.20);
    const yawWander=.19*Math.sin(h*.63+.70)+.098*Math.sin(h*1.37+.15)+.058*Math.sin(h*2.11+1.30);
    pitchTarget=maxPitch*((weapon==='machineGun'?.82:.88)+pitchWander*(weapon==='machineGun'?1.12:1));
    yawTarget=-maxYaw*((weapon==='machineGun'?.68:.80)+yawWander*(weapon==='machineGun'?1.18:1));
  }
  // Sustained heat adds a little instability but does not move the hold area's
  // center upward forever.
  const heat=Math.max(1,Math.min(1.24,Number(heatScale)||1));
  if(elapsed>climbMs+curveMs){
    const extra=heat-1;
    pitchTarget+=maxPitch*extra*.10*Math.sin(s*1.91+.40);
    yawTarget+=maxYaw*extra*.18*Math.sin(s*1.57+.90);
  }
  return {pitch:Math.max(0,pitchTarget),yaw:yawTarget};
}
function recoilYawShape(step,weapon=currentWeapon){
  const s=Math.max(0,Number(step)||0);
  return RECOIL_SINGLE_YAW_PATTERN[Math.min(RECOIL_SINGLE_YAW_PATTERN.length-1,Math.floor(s))]||0;
}
function singleShotRecoilImpulse(weapon,{step=0,sequence=0,hand='right',basePitch=0,baseYaw=0,adsScale=1,heatScale=1,firstScale=1}={}){
  const seq=Math.max(0,Math.floor(Number(sequence)||0)),follow=Math.max(0,Math.floor(Number(step)||0));
  // These are recoil directions, not accuracy spread. Heavy single-shot weapons
  // get a characteristic shoulder/launcher impulse while the RPG stays on its
  // dedicated straight shove. Deterministic sequences avoid random aim jumps.
  if(weapon==='pistol'){
    const side=[.42,-.34,.58,-.46,.30,-.55][seq%6];
    return{pitch:basePitch*adsScale*heatScale*firstScale,yaw:baseYaw*adsScale*side};
  }
  if(weapon==='sniper'){
    const side=(seq%4===0?.78:seq%4===1?-.58:seq%4===2?.42:-.72);
    return{pitch:basePitch*adsScale*heatScale*Math.max(.88,firstScale)*1.02,yaw:baseYaw*side};
  }
  if(weapon==='shotgun'){
    const side=[.62,-.38,.46,-.55][seq%4];
    return{pitch:basePitch*adsScale*heatScale*Math.max(.86,firstScale)*1.06,yaw:baseYaw*side};
  }
  if(weapon==='semiShotgun'){
    const side=[.48,-.62,.70,-.36,.56,-.50][seq%6],followScale=1+Math.min(.18,follow*.035);
    return{pitch:basePitch*adsScale*heatScale*firstScale*followScale,yaw:baseYaw*side*followScale};
  }
  if(weapon==='akimbo1887'){
    const outward=hand==='left'?.72:-.72;
    return{pitch:basePitch*adsScale*heatScale*Math.max(.82,firstScale),yaw:baseYaw*outward};
  }
  if(weapon==='grenadeLauncher'){
    const side=[.16,-.10,.12,-.14][seq%4];
    return{pitch:basePitch*adsScale*heatScale*Math.max(.78,firstScale)*.72,yaw:baseYaw*side};
  }
  if(weapon==='rpg')return{pitch:basePitch*adsScale*heatScale*firstScale,yaw:0};
  const yawShape=recoilYawShape(follow,weapon);
  return{pitch:basePitch*adsScale*heatScale*firstScale,yaw:baseYaw*adsScale*firstScale*yawShape};
}
function automaticRecoilActive(weapon){const r=recoilSpec(weapon);return !!r.automatic&&(weapon!=='assault'||assaultFireMode==='auto');}
function resetRecoilBookkeeping({kick=true}={}){
  // This resets only recoil bookkeeping. It must never alter yaw/pitch.
  recoilDebtPitch=0;recoilDebtYaw=0;recoilPatternPitch=0;recoilPatternYaw=0;endRecoilBurst();if(kick)weaponKickZ=weaponKickVelocity=0;
}
function weaponVisualKickProfile(weapon=currentWeapon){
  return ({
    pistol:{impulse:1.72,stiffness:315,damping:28,maxTravel:.155,rear:1.02,lift:.24,pitch:.58,yaw:.010,roll:.014,adsRear:.90,actionMs:92},
    assault:{impulse:2.28,stiffness:205,damping:20,maxTravel:.225,rear:1.18,lift:.29,pitch:.72,yaw:.008,roll:.012,adsRear:.94,actionMs:62},
    ump:{impulse:1.56,stiffness:325,damping:28,maxTravel:.155,rear:.96,lift:.17,pitch:.43,yaw:.006,roll:.009,adsRear:.90,actionMs:48},
    machineGun:{impulse:2.48,stiffness:182,damping:19,maxTravel:.245,rear:1.26,lift:.32,pitch:.82,yaw:.013,roll:.019,adsRear:.95,actionMs:58},
    shotgun:{impulse:3.18,stiffness:158,damping:17.5,maxTravel:.285,rear:1.34,lift:.43,pitch:1.08,yaw:.019,roll:.030,adsRear:.95,actionMs:120},
    semiShotgun:{impulse:2.62,stiffness:198,damping:20.5,maxTravel:.238,rear:1.22,lift:.35,pitch:.88,yaw:.017,roll:.025,adsRear:.94,actionMs:92},
    akimbo1887:{impulse:1.18,stiffness:245,damping:23,maxTravel:.160,rear:.78,lift:.12,pitch:.20,yaw:0,roll:0,adsRear:1,actionMs:120},
    sniper:{impulse:3.55,stiffness:132,damping:16.5,maxTravel:.310,rear:1.46,lift:.46,pitch:1.12,yaw:.022,roll:.034,adsRear:.96,actionMs:138},
    grenadeLauncher:{impulse:3.28,stiffness:148,damping:17.5,maxTravel:.300,rear:1.42,lift:.29,pitch:.72,yaw:.012,roll:.018,adsRear:.96,actionMs:145},
    rpg:{impulse:3.38,stiffness:135,damping:16,maxTravel:.305,rear:1.40,lift:.35,pitch:.92,yaw:.004,roll:.008,adsRear:.97,actionMs:150},
  })[weapon]||{impulse:1.6,stiffness:250,damping:23,maxTravel:.18,rear:1,lift:.22,pitch:.55,yaw:.008,roll:.012,adsRear:.92,actionMs:80};
}
function weaponVisualAttachmentRecoilScale(weapon=currentWeapon){const safe=WEAPON_SPECS[weapon]?weapon:'pistol',base=WEAPON_SPECS[safe],resolved=effectiveWeaponSpec(safe),pitch=Math.max(.2,Number(resolved.recoilPitch||base.recoilPitch)/Math.max(.000001,Number(base.recoilPitch)||1)),yaw=Math.max(.2,Number(resolved.recoilYaw||base.recoilYaw||base.recoilPitch)/Math.max(.000001,Number(base.recoilYaw||base.recoilPitch)||1));return THREE.MathUtils.clamp(Math.sqrt(pitch*yaw)*bipodRecoilScale(safe),.48,1.18);}
function weaponKickImpulse(weapon){
  const profile=weaponVisualKickProfile(weapon),recoilScale=Math.max(0,Math.min(3,(Number(weaponRules(weapon).recoilScale)||0)/100)),attachmentScale=weaponVisualAttachmentRecoilScale(weapon);
  return profile.impulse*recoilScale*attachmentScale;
}
function addWeaponKick(weapon){const profile=weaponVisualKickProfile(weapon),attachmentScale=weaponVisualAttachmentRecoilScale(weapon);weaponKickVelocity=Math.min(7.2,weaponKickVelocity+weaponKickImpulse(weapon));weaponKickZ=Math.min(profile.maxTravel*attachmentScale,weaponKickZ);}
function updateWeaponKick(dt){
  // Visual weapon kick is intentionally separate from aim recoil. Resetting or
  // finishing this spring can never change the bullet/camera aim direction.
  const profile=weaponVisualKickProfile(currentWeapon),attachmentScale=weaponVisualAttachmentRecoilScale(currentWeapon),maxTravel=profile.maxTravel*attachmentScale;let remaining=Math.min(.05,Math.max(0,Number(dt)||0));
  while(remaining>.000001){const step=Math.min(1/120,remaining);weaponKickVelocity+=(-profile.stiffness*weaponKickZ-profile.damping*weaponKickVelocity)*step;weaponKickZ+=weaponKickVelocity*step;weaponKickZ=THREE.MathUtils.clamp(weaponKickZ,-.025,maxTravel);remaining-=step;}
  if(Math.abs(weaponKickZ)<.00005&&Math.abs(weaponKickVelocity)<.001){weaponKickZ=0;weaponKickVelocity=0;}
}
function weaponActionPulse(weapon=currentWeapon,now=performance.now()){
  const ms=weaponVisualKickProfile(weapon).actionMs,elapsed=now-(lastLocalShotAt||0);if(elapsed<0||elapsed>=ms)return 0;const p=elapsed/Math.max(1,ms);return Math.sin(Math.PI*p);
}
function registerLocalShotHeat(weapon,now){
  const previousAt=localShotHeatAt[weapon]||0,automatic=automaticRecoilActive(weapon),freshBurst=automatic&&(localRecoilStep[weapon]??-1)<0,firstShot=automatic?freshBurst:(!previousAt||now-previousAt>420),heat=weaponHeatAfterDelay(weapon,localShotHeat[weapon]||0,previousAt?now-previousAt:0);
  localShotHeat[weapon]=weaponHeatAfterShot(weapon,heat);localShotHeatAt[weapon]=now;
  if(firstShot)localRecoilStep[weapon]=0;else localRecoilStep[weapon]+=1;
  return {heat,firstShot};
}
function applyAimRecoilDelta(deltaPitch=0,deltaYaw=0){
  const beforePitch=pitch,beforeYaw=yaw;pitch=THREE.MathUtils.clamp(pitch+(Number(deltaPitch)||0),-1.28,1.28);yaw+=Number(deltaYaw)||0;
  const appliedPitch=pitch-beforePitch,appliedYaw=yaw-beforeYaw;recoilDebtPitch+=appliedPitch;recoilDebtYaw+=appliedYaw;
  return{pitch:appliedPitch,yaw:appliedYaw};
}
function applyAimRecoil(weapon,preShotHeat=0,firstShot=false,hand='right'){
  const r=recoilSpec(weapon),automatic=automaticRecoilActive(weapon),recoilScale=Math.max(0,Math.min(3,(Number(weaponRules(weapon).recoilScale)||0)/100)),adsScale=1-.20*Math.max(0,Math.min(1,adsBlend)),heatScale=1+Math.min(.24,Math.max(0,preShotHeat)*.04),step=localRecoilStep[weapon]||0;
  const basePitch=Math.max(0,Number(r.recoilPitch)||0)*recoilScale,baseYaw=Math.max(0,Number(r.recoilYaw)||0)*recoilScale,firstScale=firstShot?Math.max(.18,Math.min(1,Number(r.firstShotRecoilScale)||.5)):1;
  const softPitch=Math.max(0,(Number(r.recoilMaxPitch)||Math.max(0,Number(r.recoilPitch)||0))*recoilScale),softYaw=Math.max(0,(Number(r.recoilMaxYaw)||Number(r.recoilYaw)||.020)*recoilScale),hardPitch=softPitch*1.08,hardYaw=softYaw*1.12;
  if(automatic){
    const target=automaticRecoilTarget(step,weapon,recoilScale,adsScale,heatScale),nextPatternPitch=Math.max(recoilPatternPitch,Math.max(0,target.pitch)),nextPatternYaw=THREE.MathUtils.clamp(target.yaw,-hardYaw,hardYaw),deltaPitch=Math.max(0,nextPatternPitch-recoilPatternPitch),deltaYaw=nextPatternYaw-recoilPatternYaw;
    recoilPatternPitch=nextPatternPitch;recoilPatternYaw=nextPatternYaw;
    // Debt is the actual unresolved aim displacement. Clamp that displacement
    // to the weapon envelope as well as clamping the pattern itself, otherwise
    // rapid release/re-trigger cycles can stack multiple bounded envelopes.
    const nextDebtPitch=THREE.MathUtils.clamp(recoilDebtPitch+deltaPitch,0,hardPitch),nextDebtYaw=THREE.MathUtils.clamp(recoilDebtYaw+deltaYaw,-hardYaw,hardYaw);
    applyAimRecoilDelta(nextDebtPitch-recoilDebtPitch,nextDebtYaw-recoilDebtYaw);return;
  }
  const impulse=singleShotRecoilImpulse(weapon,{step,sequence:localWeaponShotSequence[weapon]||0,hand,basePitch,baseYaw,adsScale,heatScale,firstScale}),nextDebtPitch=THREE.MathUtils.clamp(recoilDebtPitch+impulse.pitch,0,hardPitch),nextDebtYaw=THREE.MathUtils.clamp(recoilDebtYaw+impulse.yaw,-hardYaw,hardYaw);
  applyAimRecoilDelta(nextDebtPitch-recoilDebtPitch,nextDebtYaw-recoilDebtYaw);
}
function updateAimRecoil(dt){
  const r=recoilSpec(currentWeapon),automatic=automaticRecoilActive(currentWeapon),totalDt=Math.min(.05,Math.max(0,Number(dt)||0)),now=performance.now();
  if(automatic&&recoilBurstActive&&recoilBurstWeapon===currentWeapon&&recoilBurstReleaseAt){
    if(fireInputHeld())recoilBurstReleaseAt=0;
    else if(now-recoilBurstReleaseAt>=34)endRecoilBurst(recoilBurstReleaseAt);
  }
  const releaseAt=recoilBurstReleaseAt||recoilBurstEndedAt,recoveryAge=automatic?now-releaseAt:now-lastLocalShotAt,delay=Math.max(0,Number(r.recoilRecoveryDelayMs)||0),canRecover=!fireInputHeld()&&recoveryAge>=delay;
  if(canRecover&&(Math.abs(recoilDebtPitch)>.000001||Math.abs(recoilDebtYaw)>.000001)){
    const recovery=Math.max(5,Number(r.recoilRecovery)||12),pitchShare=1-Math.exp(-recovery*.46*totalDt),yawShare=1-Math.exp(-recovery*.58*totalDt),recoverPitch=recoilDebtPitch*pitchShare,recoverYaw=recoilDebtYaw*yawShare;
    pitch=THREE.MathUtils.clamp(pitch-recoverPitch,-1.28,1.28);yaw-=recoverYaw;recoilDebtPitch-=recoverPitch;recoilDebtYaw-=recoverYaw;
    if(Math.abs(recoilDebtPitch)<.00002)recoilDebtPitch=0;if(Math.abs(recoilDebtYaw)<.00002)recoilDebtYaw=0;
  }
}
function presentLocalShot(weapon,now=performance.now(),hand='right'){
  // Shooter-side prediction: weapon feedback must happen on the trigger frame,
  // not after a WebSocket round trip. The server still owns acceptance, damage,
  // hit detection and the authoritative ammo state returned in the fire ack.
  if(!godMode)ammo[weapon]=Math.max(0,(ammo[weapon]||0)-1);
  lastShotVisualAt=now;if(weapon==='akimbo1887'){const side=hand==='left'?'left':'right';if(side==='left')akimboLeftCycleStartedAt=now;else akimboRightCycleStartedAt=now;akimboCycleSoundPlayed[side]=false;soundShot(weapon,side);}else{addWeaponKick(weapon);soundShot(weapon);}
  if(weapon==='shotgun'){shotgunPumpStartedAt=now;shotgunPumpSoundPlayed=false;}
  const flash=localMuzzleObject(weapon,hand);if(flash)flash.material.opacity=weaponHasAttachment(weapon,attachmentsForWeapon(weapon),'suppressor')?.18:1;
}
function requestShot(hand='right'){
  const now=performance.now(),weapon=currentWeapon,interruptShotgunReload=!godMode&&weapon==='shotgun'&&!!reloadUntil&&(ammo.shotgun||0)>0;
  if(!shell.canPlay||!matchAllowsCombat(matchState)||hp<=0||traversal||!combatWeaponAvailable(now))return false;
  if(sprinting){const outMs=weaponSprintOutMs(weapon);cancelSprint({lockMs:outMs+90});sprintActionReadyAt=Math.max(sprintActionReadyAt,now+outMs);pendingSprintShot=weapon;pendingSprintShotExpiresAt=sprintActionReadyAt+420;sendCurrentState(true);return false;}
  if(now<sprintActionReadyAt){pendingSprintShot=weapon;pendingSprintShotExpiresAt=Math.max(pendingSprintShotExpiresAt,sprintActionReadyAt+420);return false;}
  const localReady=weapon==='akimbo1887'?(akimboReadyAt[hand==='left'?'left':'right']||0):(fireReadyAt[weapon]||0);
  if(now<localReady||(!godMode&&(reloadRequestPending||(reloadUntil&&!interruptShotgunReload))))return false;
  if(!godMode&&(ammo[weapon]||0)<=0){doReload();return false;}
  if(interruptShotgunReload){reloadUntil=0;reloadWeapon='';reloadStartedAt=0;reloadRequestPending=false;}
  // The reticle is authoritative: fire along the exact camera aim including
  // recoil already accumulated from previous rounds. Applying the new impulse
  // after sending means the first shot is precise and subsequent rounds climb.
  const shotYaw=round4(effectiveAimYaw()),shotPitch=round4(effectiveAimPitch()),preShotHeat=currentShotHeat(weapon,now);diagnosticsRecordEvent('shot_request',{weapon,hand,shotYaw,shotPitch,basePitch:diagnosticsRound(pitch),recoilDebtPitch:diagnosticsRound(recoilDebtPitch),recoilPatternPitch:diagnosticsRound(recoilPatternPitch),stateSeq,ammo:Number(ammo[weapon]||0),rawLookY:diagnosticsRound(gamepadFrame?.rawLookY??gamepadFrame?.lookY),processedLookY:diagnosticsRound(controllerDiagnostics.inputY),rt:diagnosticsRound(gamepadFrame?.buttons?.[GAMEPAD_BUTTON.RT]||0,3)});
  if(weapon==='akimbo1887')akimboReadyAt[hand==='left'?'left':'right']=now+weaponRules(weapon).cooldownMs;else fireReadyAt[weapon]=now+weaponRules(weapon).cooldownMs;
  presentLocalShot(weapon,now,hand);
  sendCurrentState(true);send({t:'fire',weapon,hand:weapon==='akimbo1887'?(hand==='left'?'left':'right'):undefined,yaw:shotYaw,pitch:shotPitch,adsAmount:round3(adsBlend),shotAt:Math.round(serverNow()),viewDelayMs:Math.round(currentRemoteViewDelayMs())});
  beginRecoilBurst(weapon);recoilBurstReleaseAt=0;const recoilShot=registerLocalShotHeat(weapon,now);localWeaponShotSequence[weapon]=(localWeaponShotSequence[weapon]||0)+1;lastLocalShotAt=now;applyAimRecoil(weapon,preShotHeat,recoilShot.firstShot,hand);if(!godMode&&(ammo[weapon]||0)<=0)endRecoilBurst();clearQueuedSprintShot();return true;
}
function updateFireControl(now){
  if(!combatWeaponAvailable(now)){clearQueuedSprintShot();return;}
  if(pendingSprintShot){if(now>pendingSprintShotExpiresAt||pendingSprintShot!==currentWeapon)clearQueuedSprintShot();else if(now>=sprintActionReadyAt){const queued=pendingSprintShot;clearQueuedSprintShot();if(queued===currentWeapon)requestShot();}}
  const spec=effectiveWeaponSpec(currentWeapon);if(fireInputHeld()&&spec?.automatic&&(currentWeapon!=='assault'||assaultFireMode==='auto')&&now>=(fireReadyAt[currentWeapon]||0)&&now>=sprintActionReadyAt)requestShot();
}
function doReload(){
  const spec=effectiveWeaponSpec(currentWeapon);
  if(!shell.canPlay||hp<=0||traversal||ladderState||!combatWeaponAvailable())return;
  // Unlimited/God Mode has no reload transition, so Reload is a true no-op and
  // cannot terminate recoil, cancel sprint, or otherwise change combat state.
  if(godMode){reloadUntil=0;reloadRequestPending=false;return;}
  clearQueuedSprintShot();cancelSprint();
  if((ammo[currentWeapon]||0)>=spec.mag)return;
  if(reloadRequestPending)return;
  if(reloadUntil)return;
  endRecoilBurst();setAim(false);const predictedStart=serverNow(),predictedMs=Math.max(1,Number(weaponRules(currentWeapon).reloadMs)||1);reloadRequestPending=true;reloadWeapon=currentWeapon;reloadStartedAt=predictedStart;reloadUntil=predictedStart+predictedMs;send({t:'reload',weapon:currentWeapon});if(currentWeapon!=='shotgun')soundReload(currentWeapon);
}
function nextWeapon(weapon){return weapon===secondaryWeapon?primaryWeapon:secondaryWeapon;}
function switchWeapon(weapon){
  clearQueuedSprintShot();cancelSprint();
  weapon=weapon===secondaryWeapon?secondaryWeapon:primaryWeapon;
  if(!shell.canPlay||hp<=0||traversal||ladderState||!combatWeaponAvailable()||weapon===currentWeapon)return;
  setAim(false);sniperZoomLevel=0;resetRecoilBookkeeping();currentWeapon=weapon;pendingWeapon=weapon;reloadRequestPending=false;reloadUntil=0;reloadWeapon='';reloadStartedAt=0;weaponSwapStartedAt=performance.now();delayFire(WEAPON_SWITCH_MS,weapon);warmWeaponAudio(weapon);syncLocalWeaponModel();send({t:'weapon',weapon});showToast(WEAPON_SPECS[weapon].name);
}
function setAim(active){
  if(currentWeapon==='akimbo1887')active=false;
  const canAim=!!active&&shell.canPlay&&matchAllowsCombat(matchState)&&hp>0&&!reloadUntil&&!traversal&&!ladderState&&combatWeaponAvailable();
  if(canAim&&sprinting){
    const delay=weaponSprintAdsMs(currentWeapon);cancelSprint({lockMs:delay+70});sendCurrentState(true);
    // Sprint recovery still gates weapon actions through sprintActionReadyAt, but
    // it must never freeze the camera/weapon ADS animation. On touch, forward
    // movement auto-sprints, so the old gate created a very obvious dead pause
    // before every scope raise while moving.
  }
  adsWanted=canAim;
  if(!adsWanted){if(currentWeapon==='sniper')sniperZoomLevel=0;}else if(currentWeapon==='sniper'&&sniperZoomLevel===0)sniperZoomLevel=1;
}
function toggleAim(){if(traversal||ladderState)return;if(currentWeapon==='akimbo1887'){setAim(false);showToast('AKIMBO · HIP FIRE');return;}if(currentWeapon==='sniper'&&shell.canPlay&&hp>0&&!reloadUntil){if(!adsWanted){setAim(true);if(adsWanted)showToast(`SNIPER ${sniperLowZoomLabel()}`);}else if(sniperZoomLevel===1){sniperZoomLevel=2;showToast(`SNIPER ${sniperHighZoomLabel()}`);}else{setAim(false);}return;}setAim(!adsWanted);}
function toggleFireMode(){if(!combatWeaponAvailable())return;if(currentWeapon!=='assault'){showToast('FIRE MODE · ASSAULT ONLY');return;}assaultFireMode=assaultFireMode==='semi'?'auto':'semi';clearFireInput();touchVisual.modeUntil=performance.now()+180;localStorage.setItem('breachAssaultFireMode',assaultFireMode);showToast(assaultFireMode==='auto'?'ASSAULT · AUTO':'ASSAULT · SEMI');}
function normalizeClientAmmo(value){const v=value&&typeof value==='object'?value:{};return Object.fromEntries(WEAPON_ORDER.map(name=>{const mag=weaponCapacity(name);return[name,Math.max(0,Math.min(mag,Number(v[name]??mag)))]}));}
function syncClientAmmo(value){const v=value&&typeof value==='object'?value:{};for(const name of WEAPON_ORDER){const mag=weaponCapacity(name);ammo[name]=Math.max(0,Math.min(mag,Number(v[name]??mag)));}}
function normalizeEquipment(v){v=v&&typeof v==='object'?v:{};return Object.fromEntries(Object.entries(EQUIPMENT_CAPS).map(([name,cap])=>[name,Math.max(0,Math.min(cap,Number(v[name]??cap)))]));}
function beginEquipmentAim(kind){
  const now=performance.now();kind=String(kind||'');
  if(kind!==tacticalEquipment&&kind!==lethalEquipment)return false;
  if(!EQUIPMENT_SPECS[kind]||!shell.canPlay||!matchAllowsCombat(matchState)||hp<=0||traversal||ladderState||now<localEquipmentCooldownUntil||(!godMode&&(equipment[kind]||0)<=0)||!combatWeaponAvailable(now))return false;
  clearQueuedSprintShot();clearFireInput();cancelSprint();endRecoilBurst();setAim(false);sniperZoomLevel=0;
  // CoD-style equipment use interrupts a weapon reload. The server receives the
  // same begin action and cancels its authoritative reload state as well.
  if(reloadUntil||reloadRequestPending){reloadUntil=0;reloadWeapon='';reloadStartedAt=0;reloadRequestPending=false;}
  combatAction={phase:COMBAT_ACTION.EQUIPMENT_AIM,kind,startedAt:now,commitAt:0,recoverStartedAt:0,recoverUntil:0,pending:null};
  showTrajectory();sendCurrentState(true);send({t:'equipmentAction',action:'begin',kind});
  if(kind===tacticalEquipment)touchVisual.flashUntil=now+220;else touchVisual.stickyUntil=now+220;
  return true;
}
function makeThrowId(){return crypto.randomUUID().replace(/-/g,'').slice(0,16);}
function releaseEquipmentAim(){
  if(combatAction.phase!==COMBAT_ACTION.EQUIPMENT_AIM||!combatAction.kind)return false;
  const kind=combatAction.kind,now=performance.now(),throwId=makeThrowId(),v=trajectoryVelocity();
  hideTrajectory();
  combatAction={phase:COMBAT_ACTION.EQUIPMENT_THROW,kind,startedAt:combatAction.startedAt,commitAt:now+EQUIPMENT_THROW_COMMIT_MS,recoverStartedAt:0,recoverUntil:0,pending:{id:throwId,kind,yaw:round3(yaw),pitch:round3(pitch),vx:v.vx,vy:v.vy,vz:v.vz,fx:v.fx,fz:v.fz}};
  if(kind===tacticalEquipment)touchVisual.flashUntil=now+EQUIPMENT_THROW_COMMIT_MS+120;else touchVisual.stickyUntil=now+EQUIPMENT_THROW_COMMIT_MS+120;
  return true;
}
function commitEquipmentThrow(now=performance.now()){
  if(combatAction.phase!==COMBAT_ACTION.EQUIPMENT_THROW||!combatAction.pending)return false;
  const pending=combatAction.pending,kind=pending.kind;
  if(!shell.canPlay||!matchAllowsCombat(matchState)||hp<=0){cancelEquipmentAction({notify:true});return false;}
  localEquipmentCooldownUntil=Math.max(localEquipmentCooldownUntil,now+Math.max(360,EQUIPMENT_WEAPON_RECOVER_MS));
  const startX=position.x+pending.fx*.82,startY=position.y+currentPlayerHeight()-.22,startZ=position.z+pending.fz*.82;
  spawnThrowableVisual({id:pending.id,kind,ownerId:clientId,x:startX,y:startY,z:startZ,vx:pending.vx,vy:pending.vy,vz:pending.vz,at:serverNow()});
  sendCurrentState(true);send({t:'throw',id:pending.id,kind,yaw:pending.yaw,pitch:pending.pitch});
  combatAction={phase:COMBAT_ACTION.WEAPON_RECOVER,kind,startedAt:combatAction.startedAt,commitAt:combatAction.commitAt,recoverStartedAt:now,recoverUntil:now+EQUIPMENT_WEAPON_RECOVER_MS,pending:null};
  return true;
}
function updateCombatAction(now=performance.now()){
  if(combatAction.phase===COMBAT_ACTION.EQUIPMENT_THROW&&now>=combatAction.commitAt)commitEquipmentThrow(now);
  if(combatAction.phase===COMBAT_ACTION.WEAPON_RECOVER&&now>=combatAction.recoverUntil)combatAction={phase:COMBAT_ACTION.READY,kind:'',startedAt:0,commitAt:0,recoverStartedAt:0,recoverUntil:0,pending:null};
}
function cancelEquipmentAction({notify=true}={}){
  const wasServerAim=combatAction.phase===COMBAT_ACTION.EQUIPMENT_AIM||combatAction.phase===COMBAT_ACTION.EQUIPMENT_THROW,kind=combatAction.kind;
  combatAction={phase:COMBAT_ACTION.READY,kind:'',startedAt:0,commitAt:0,recoverStartedAt:0,recoverUntil:0,pending:null};hideTrajectory();
  if(notify&&wasServerAim&&kind&&socket?.readyState===WebSocket.OPEN)send({t:'equipmentAction',action:'cancel',kind});
}
function trajectoryVelocity(){return tacticalThrowVelocity(yaw,pitch,TACTICAL_THROW_SPEED,TACTICAL_THROW_LOFT);}
function resetTrajectoryPose(){trajectoryLastX=trajectoryLastY=trajectoryLastZ=trajectoryLastYaw=trajectoryLastPitch=trajectoryLastHeight=NaN;trajectoryLastUpdate=0;}
function showTrajectory(){
  if(!trajectoryRibbon){
    trajectoryCenters=new Float32Array(TRAJECTORY_MAX_POINTS*3);
    trajectoryVertices=new Float32Array(TRAJECTORY_MAX_POINTS*2*3);
    const indices=new Uint16Array((TRAJECTORY_MAX_POINTS-1)*6);
    for(let i=0;i<TRAJECTORY_MAX_POINTS-1;i++){const v=i*2,j=i*6;indices[j]=v;indices[j+1]=v+1;indices[j+2]=v+2;indices[j+3]=v+1;indices[j+4]=v+3;indices[j+5]=v+2;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(trajectoryVertices,3));geo.setIndex(new THREE.BufferAttribute(indices,1));geo.setDrawRange(0,0);
    const mat=new THREE.MeshBasicMaterial({color:0xeaf4ff,transparent:true,opacity:.66,side:THREE.DoubleSide,depthTest:true,depthWrite:false});
    trajectoryRibbon=new THREE.Mesh(geo,mat);trajectoryRibbon.frustumCulled=false;trajectoryRibbon.renderOrder=42;scene.add(trajectoryRibbon);
    trajectoryMarker=new THREE.Mesh(new THREE.SphereGeometry(.050,10,7),new THREE.MeshBasicMaterial({color:0xd7ff58,transparent:true,opacity:.94,depthTest:true,depthWrite:false}));trajectoryMarker.renderOrder=44;scene.add(trajectoryMarker);
    trajectoryLandingRing=new THREE.Mesh(new THREE.TorusGeometry(.155,.018,8,28),new THREE.MeshBasicMaterial({color:0xd7ff58,transparent:true,opacity:.90,depthTest:true,depthWrite:false}));trajectoryLandingRing.renderOrder=43;scene.add(trajectoryLandingRing);
    trajectoryLandingDot=new THREE.Mesh(new THREE.CircleGeometry(.040,20),new THREE.MeshBasicMaterial({color:0xd7ff58,transparent:true,opacity:.60,depthTest:true,depthWrite:false,side:THREE.DoubleSide}));trajectoryLandingDot.renderOrder=43;scene.add(trajectoryLandingDot);
    trajectoryScratch={cameraRight:new THREE.Vector3(),point:new THREE.Vector3(),prev:new THREE.Vector3(),next:new THREE.Vector3(),tangent:new THREE.Vector3(),view:new THREE.Vector3(),side:new THREE.Vector3()};
  }
  trajectoryRibbon.visible=true;trajectoryRibbon.geometry.setDrawRange(0,0);trajectoryMarker.visible=false;if(trajectoryLandingRing)trajectoryLandingRing.visible=false;if(trajectoryLandingDot)trajectoryLandingDot.visible=false;resetTrajectoryPose();
}
function hideTrajectory(){
  if(trajectoryRibbon){trajectoryRibbon.visible=false;trajectoryRibbon.geometry.setDrawRange(0,0);}
  if(trajectoryMarker)trajectoryMarker.visible=false;if(trajectoryLandingRing)trajectoryLandingRing.visible=false;if(trajectoryLandingDot)trajectoryLandingDot.visible=false;
  resetTrajectoryPose();
}
function trajectoryTerrainFirstT(ax,ay,az,bx,by,bz,startClearance,endClearance,radius=0){
  if(startClearance<=0)return 0;if(endClearance>0)return null;
  let lo=0,hi=1;
  for(let i=0;i<5;i++){
    const t=(lo+hi)/2,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,z=az+(bz-az)*t;
    if(y<=terrainHeight(x,z)+.08+Math.max(0,Number(radius)||0))hi=t;else lo=t;
  }
  return hi;
}
function trajectorySegmentHit(ax,ay,az,bx,by,bz,startClearance,endClearance,radius=0){
  const obstacleT=trajectoryCollision.firstHitT(ax,ay,az,bx,by,bz,radius);
  const terrainT=trajectoryTerrainFirstT(ax,ay,az,bx,by,bz,startClearance,endClearance,radius);
  if(obstacleT==null&&terrainT==null)return null;
  const terrainFirst=terrainT!=null&&(obstacleT==null||terrainT<=obstacleT),t=terrainFirst?terrainT:obstacleT;
  const x=ax+(bx-ax)*t,z=az+(bz-az)*t;let y=ay+(by-ay)*t;
  if(terrainFirst)y=Math.max(y,terrainHeight(x,z)+.09);
  return{x,y,z};
}
function updateTrajectoryRibbon(count){
  if(!trajectoryRibbon||count<2)return;
  const {cameraRight,point,prev,next,tangent,view,side}=trajectoryScratch;cameraRight.set(1,0,0).applyQuaternion(camera.quaternion);
  for(let i=0;i<count;i++){
    const c=i*3;point.set(trajectoryCenters[c],trajectoryCenters[c+1],trajectoryCenters[c+2]);
    const pi=Math.max(0,i-1)*3,ni=Math.min(count-1,i+1)*3;prev.set(trajectoryCenters[pi],trajectoryCenters[pi+1],trajectoryCenters[pi+2]);next.set(trajectoryCenters[ni],trajectoryCenters[ni+1],trajectoryCenters[ni+2]);
    tangent.copy(next).sub(prev).normalize();view.copy(camera.position).sub(point).normalize();side.crossVectors(tangent,view);
    if(side.lengthSq()<1e-5)side.copy(cameraRight);else side.normalize();
    const progress=i/(count-1),halfWidth=THREE.MathUtils.lerp(.030,.010,Math.pow(progress,.82)),v=i*6;
    trajectoryVertices[v]=point.x+side.x*halfWidth;trajectoryVertices[v+1]=point.y+side.y*halfWidth;trajectoryVertices[v+2]=point.z+side.z*halfWidth;
    trajectoryVertices[v+3]=point.x-side.x*halfWidth;trajectoryVertices[v+4]=point.y-side.y*halfWidth;trajectoryVertices[v+5]=point.z-side.z*halfWidth;
  }
  const attr=trajectoryRibbon.geometry.getAttribute('position');attr.needsUpdate=true;trajectoryRibbon.geometry.setDrawRange(0,(count-1)*6);trajectoryRibbon.visible=true;
}
function trajectoryPoseChanged(playerHeight){
  const changed=!Number.isFinite(trajectoryLastX)||Math.abs(position.x-trajectoryLastX)>.012||Math.abs(position.y-trajectoryLastY)>.012||Math.abs(position.z-trajectoryLastZ)>.012||Math.abs(yaw-trajectoryLastYaw)>.0012||Math.abs(pitch-trajectoryLastPitch)>.0012||Math.abs(playerHeight-trajectoryLastHeight)>.001;
  if(changed){trajectoryLastX=position.x;trajectoryLastY=position.y;trajectoryLastZ=position.z;trajectoryLastYaw=yaw;trajectoryLastPitch=pitch;trajectoryLastHeight=playerHeight;}
  return changed;
}
function updateEquipmentTrajectory(){
  if(combatAction.phase!==COMBAT_ACTION.EQUIPMENT_AIM||!combatAction.kind||!trajectoryRibbon||!position||!trajectoryCenters||!trajectoryVertices)return;
  const now=performance.now();if(now-trajectoryLastUpdate<TRAJECTORY_UPDATE_MS)return;
  const playerHeight=currentPlayerHeight();if(!trajectoryPoseChanged(playerHeight))return;trajectoryLastUpdate=now;
  const v=trajectoryVelocity(),maxT=2.12,radius=equipmentCollisionRadius(combatAction.kind),startX=position.x+v.fx*.82,startY=position.y+playerHeight-.22,startZ=position.z+v.fz*.82;
  let count=0,lastX=startX,lastY=startY,lastZ=startZ,impact=null,lastClearance=startY-(terrainHeight(startX,startZ)+.08+radius);
  for(let t=0;t<=maxT&&count<TRAJECTORY_MAX_POINTS;t+=TRAJECTORY_RENDER_STEP){
    const x=startX+v.vx*t,y=startY+v.vy*t-.5*TACTICAL_GRAVITY*t*t,z=startZ+v.vz*t,i=count*3;
    trajectoryCenters[i]=x;trajectoryCenters[i+1]=y;trajectoryCenters[i+2]=z;count++;
    if(count>1){
      const clearance=y-(terrainHeight(x,z)+.08+radius);impact=trajectorySegmentHit(lastX,lastY,lastZ,x,y,z,lastClearance,clearance,radius);
      if(impact){trajectoryCenters[i]=impact.x;trajectoryCenters[i+1]=impact.y;trajectoryCenters[i+2]=impact.z;break;}
      lastClearance=clearance;
    }
    lastX=x;lastY=y;lastZ=z;
  }
  if(count<2)return;
  updateTrajectoryRibbon(count);
  const end=(count-1)*3,endX=trajectoryCenters[end],endY=trajectoryCenters[end+1],endZ=trajectoryCenters[end+2];
  trajectoryMarker.visible=true;trajectoryMarker.position.set(endX,endY,endZ);trajectoryMarker.material.opacity=impact?.96:.74;const markerScale=THREE.MathUtils.clamp(camera.position.distanceTo(trajectoryMarker.position)*.075,.90,3.0);trajectoryMarker.scale.setScalar(markerScale);if(trajectoryLandingRing){trajectoryLandingRing.visible=true;trajectoryLandingRing.position.set(endX,endY,endZ);trajectoryLandingRing.quaternion.copy(camera.quaternion);trajectoryLandingRing.scale.setScalar(markerScale);trajectoryLandingRing.material.opacity=impact?.94:.72;}if(trajectoryLandingDot){trajectoryLandingDot.visible=true;trajectoryLandingDot.position.set(endX,endY,endZ);trajectoryLandingDot.quaternion.copy(camera.quaternion);trajectoryLandingDot.scale.setScalar(markerScale);trajectoryLandingDot.material.opacity=impact?.68:.48;}
}
function isSimulationLeader(now=performance.now()){
  if(!clientId)return false;
  let leader=clientId;
  for(const r of remotes.values()){
    if(r.bot||!r.id||now-r.lastSeen>SIM_LEADER_STALE_MS)continue;
    if(String(r.id).localeCompare(String(leader))<0)leader=r.id;
  }
  return leader===clientId;
}
function sendSimulationHeartbeat(stateSent=false){
  const now=performance.now();
  if(stateSent){lastSimHeartbeat=now;return;}
  if(!shell.inMatch||socket?.readyState!==WebSocket.OPEN||!isSimulationLeader(now)||now-lastSimHeartbeat<SIM_HEARTBEAT_MS)return;
  lastSimHeartbeat=now;send({t:'simTick'});
}


function syncLocalWeaponModel(){if(pistolGroup)pistolGroup.visible=currentWeapon==='pistol';if(akimboLeftGroup)akimboLeftGroup.visible=currentWeapon==='akimbo1887';if(akimboRightGroup)akimboRightGroup.visible=currentWeapon==='akimbo1887';if(assaultGroup)assaultGroup.visible=currentWeapon==='assault';if(umpGroup)umpGroup.visible=currentWeapon==='ump';if(machineGunGroup)machineGunGroup.visible=currentWeapon==='machineGun';if(shotgunGroup)shotgunGroup.visible=currentWeapon==='shotgun';if(semiShotgunGroup)semiShotgunGroup.visible=currentWeapon==='semiShotgun';if(sniperGroup)sniperGroup.visible=currentWeapon==='sniper'&&!sniperWeaponHiddenForScope();if(grenadeLauncherGroup)grenadeLauncherGroup.visible=currentWeapon==='grenadeLauncher';if(rpgGroup)rpgGroup.visible=currentWeapon==='rpg';syncLocalAttachmentVisuals();syncPauseContext();}
function remoteAttachmentsForWeapon(r,weapon){return weapon===r.primaryWeapon?normalizeWeaponAttachments(weapon,r.primaryAttachments):weapon===r.secondaryWeapon?normalizeWeaponAttachments(weapon,r.secondaryAttachments):normalizeWeaponAttachments(weapon,{});}
function syncRemoteWeapon(r){if(!r)return;for(const name of WEAPON_ORDER){if(!r[name])continue;r[name].visible=r.weapon===name;const attachments=remoteAttachmentsForWeapon(r,name);if(name==='akimbo1887'){for(const gun of [r.akimboLeft,r.akimboRight])if(gun)syncWeaponAttachmentVisuals(gun,name,attachments);}else syncWeaponAttachmentVisuals(r[name],name,attachments);}}
function tracerMaterial(color){return new THREE.LineBasicMaterial({color,transparent:true,opacity:.82,depthWrite:false});}
function localMuzzleObject(weapon,hand='right'){if(weapon==='akimbo1887')return hand==='left'?akimboLeftFlash:akimboRightFlash;return weapon==='sniper'?sniperFlash:weapon==='semiShotgun'?semiShotgunFlash:weapon==='shotgun'?shotgunFlash:weapon==='machineGun'?machineGunFlash:weapon==='ump'?umpFlash:weapon==='assault'?assaultFlash:weapon==='grenadeLauncher'?grenadeLauncherFlash:weapon==='rpg'?rpgFlash:pistolFlash;}
function tracerHash(id){let h=0;for(const ch of String(id||''))h=(h*33+ch.charCodeAt(0))>>>0;return h;}
function shotPacketPrimary(m){return m.primaryShot===true||(m.primaryShot==null&&m.consumeAmmo!==false);}
function shouldShowTracer(m){if(['sniper','pistol','grenadeLauncher','rpg'].includes(m.weapon))return true;if(m.weapon==='shotgun'||m.weapon==='semiShotgun'||m.weapon==='akimbo1887')return shotPacketPrimary(m);return tracerHash(m.id)%2===0;}
function createTracer(m){
  if(!shouldShowTracer(m)||['grenadeLauncher','rpg'].includes(m.weapon))return null;
  const velocity=new THREE.Vector3(Number(m.vx)||0,Number(m.vy)||0,Number(m.vz)||0),speed=Math.max(.01,velocity.length()),dir=velocity.clone().multiplyScalar(1/speed),serverStart=new THREE.Vector3(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0),start=serverStart.clone();
  if(m.ownerId===clientId){const muzzle=localMuzzleObject(m.weapon,m.hand||'right');if(muzzle){camera.updateMatrixWorld(true);muzzle.getWorldPosition(start);}}
  let visualDir=dir.clone();if(m.ownerId===clientId){const converge=serverStart.clone().addScaledVector(dir,9);visualDir=converge.sub(start).normalize();}
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(6);geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const color=m.weapon==='sniper'?0xb8efff:(m.weapon==='shotgun'||m.weapon==='semiShotgun'||m.weapon==='akimbo1887')?0xffc482:(m.weapon==='assault'||m.weapon==='ump'||m.weapon==='machineGun')?0xffdc96:0xffedbd,line=new THREE.Line(geometry,tracerMaterial(color));line.frustumCulled=false;scene.add(line);
  const gravity=Math.max(0,Number(m.gravity)||0);
  return{type:'tracer',mesh:line,geometry,start,dir:visualDir,speed,gravity,born:performance.now()-Math.min(500,Math.max(0,Number(m.visualAgeMs)||0)),lifeMs:m.weapon==='sniper'?125:m.weapon==='pistol'?105:(m.weapon==='shotgun'||m.weapon==='semiShotgun'||m.weapon==='akimbo1887')?62:92,length:m.weapon==='sniper'?2.8:(m.weapon==='assault'||m.weapon==='ump'||m.weapon==='machineGun')?1.55:m.weapon==='pistol'?.95:.75};
}
function getSharedSmokeTexture(){
  if(sharedSmokeTexture||!THREE)return sharedSmokeTexture;
  const q=document.createElement('canvas');q.width=96;q.height=96;const c=q.getContext('2d'),g=c.createRadialGradient(48,48,3,48,48,47);
  g.addColorStop(0,'rgba(255,255,255,.98)');g.addColorStop(.34,'rgba(255,255,255,.92)');g.addColorStop(.66,'rgba(235,235,235,.58)');g.addColorStop(.86,'rgba(210,210,210,.20)');g.addColorStop(1,'rgba(190,190,190,0)');c.fillStyle=g;c.fillRect(0,0,96,96);
  sharedSmokeTexture=new THREE.CanvasTexture(q);sharedSmokeTexture.userData.preserveTransient=true;sharedSmokeTexture.colorSpace=THREE.SRGBColorSpace;sharedSmokeTexture.minFilter=THREE.LinearFilter;sharedSmokeTexture.magFilter=THREE.LinearFilter;return sharedSmokeTexture;
}
function spawnRocketTrailPuff(position,velocity){
  if(!scene||!THREE)return;const speed=Math.max(.01,velocity.length()),dir=velocity.clone().multiplyScalar(1/speed),mat=new THREE.SpriteMaterial({map:getSharedSmokeTexture(),color:0xb8b8b4,transparent:true,opacity:.56,depthTest:true,depthWrite:false,toneMapped:false}),sprite=new THREE.Sprite(mat);
  sprite.position.copy(position).addScaledVector(dir,-.28);const startScale=.30+Math.random()*.10;sprite.scale.set(startScale,startScale,1);scene.add(sprite);rocketTrailPuffs.push({sprite,age:0,life:.72+Math.random()*.18,startScale,driftX:(Math.random()-.5)*.12,driftY:.08+Math.random()*.08,driftZ:(Math.random()-.5)*.12});
  const cap=playerSettings.graphics==='low'?16:playerSettings.graphics==='medium'?24:34;while(rocketTrailPuffs.length>cap){const old=rocketTrailPuffs.shift();try{scene?.remove(old.sprite);}catch{}disposeObject3D(old.sprite);}
}
function updateRocketTrailPuffs(dt){
  for(let i=rocketTrailPuffs.length-1;i>=0;i--){const p=rocketTrailPuffs[i];p.age+=dt;const q=Math.min(1,p.age/p.life),scale=p.startScale*(1+q*3.0);p.sprite.scale.set(scale,scale,1);p.sprite.material.opacity=.56*Math.pow(1-q,1.25);p.sprite.position.x+=p.driftX*dt;p.sprite.position.y+=p.driftY*dt;p.sprite.position.z+=p.driftZ*dt;if(q>=1){rocketTrailPuffs.splice(i,1);try{scene?.remove(p.sprite);}catch{}disposeObject3D(p.sprite);}}
}
function clearRocketTrailPuffs(){const pending=rocketTrailPuffs.splice(0);for(const p of pending){try{scene?.remove(p.sprite);}catch{}disposeObject3D(p.sprite);}}
function createLauncherProjectile(m){
  if(!scene||!THREE)return null;
  const weapon=m.weapon==='rpg'?'rpg':'grenadeLauncher',root=new THREE.Group(),bodyColor=weapon==='grenadeLauncher'?0x536140:0x50534d,bandColor=weapon==='grenadeLauncher'?0xc5aa62:0x8a8d87;
  // Launcher rounds are intentionally oversized in first/third person so the
  // player can read their arc and impact point, like an arcade/CoD-style 40 mm
  // grenade rather than a thin rifle tracer.
  if(weapon==='grenadeLauncher'){
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.115,.125,.34,12),new THREE.MeshBasicMaterial({color:bodyColor}));root.add(body);
    const nose=new THREE.Mesh(new THREE.SphereGeometry(.118,10,7),new THREE.MeshBasicMaterial({color:0x626f4f}));nose.scale.y=.75;nose.position.y=.20;root.add(nose);
    const band=new THREE.Mesh(new THREE.CylinderGeometry(.132,.132,.055,12),new THREE.MeshBasicMaterial({color:bandColor}));band.position.y=-.07;root.add(band);
  }else{
    const body=new THREE.Mesh(new THREE.CylinderGeometry(.075,.09,.48,12),new THREE.MeshBasicMaterial({color:bodyColor}));root.add(body);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.09,.22,12),new THREE.MeshBasicMaterial({color:0x6d716b}));nose.position.y=.35;root.add(nose);
    const tail=new THREE.Mesh(new THREE.CylinderGeometry(.11,.075,.12,10),new THREE.MeshBasicMaterial({color:0x343733}));tail.position.y=-.30;root.add(tail);
  }
  const serverPos=new THREE.Vector3(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0),velocity=new THREE.Vector3(Number(m.vx)||0,Number(m.vy)||0,Number(m.vz)||0),visualStart=serverPos.clone();
  if(m.ownerId===clientId){const muzzle=localMuzzleObject(weapon);if(muzzle){camera.updateMatrixWorld(true);muzzle.getWorldPosition(visualStart);}}
  root.position.copy(visualStart);scene.add(root);
  return{type:'launcher',weapon,mesh:root,root,snapshotPos:serverPos,snapshotVel:velocity,snapshotAt:Number(m.at)||serverNow(),gravity:Math.max(0,Number(m.gravity)||0),born:performance.now(),lifeMs:Math.max(900,Number(m.lifetimeMs)||3000),visualVelocity:velocity.clone(),lastTrailAt:0};
}
function updateLauncherProjectileState(m){
  const b=bullets.get(m?.id);if(!b||b.type!=='launcher')return;
  const at=Number(m.at)||serverNow();if(at+2<b.snapshotAt)return;
  b.snapshotPos.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);b.snapshotVel.set(Number(m.vx)||0,Number(m.vy)||0,Number(m.vz)||0);b.snapshotAt=at;b.gravity=Math.max(0,Number(m.gravity)||b.gravity||0);
}
function handleShot(m){
  if(!m?.id||bullets.has(m.id))return;const packetAge=Number.isFinite(Number(m.at))?Math.max(0,serverNow()-Number(m.at)):0;if(packetAge>520)return;
  // Backdate tracer animation by packet age so network latency does not make a
  // server-authoritative projectile appear to start traveling only after it
  // reaches this client.
  const visualPacket=packetAge>0?{...m,visualAgeMs:packetAge}:m;
  const projectile=['grenadeLauncher','rpg'].includes(m.weapon)?createLauncherProjectile(visualPacket):createTracer(visualPacket);if(projectile)bullets.set(m.id,projectile);
  if(m.ownerId===clientId){
    // Local sound, muzzle flash, ammo presentation and weapon kick were already
    // predicted on the trigger frame. The server echo is only authoritative
    // projectile/reconciliation data; replaying feedback here caused the
    // noticeable round-trip-time firing delay.
  }else if(shotPacketPrimary(m)){
    const r=remotes.get(m.ownerId);if(r){const shotNow=performance.now();r.fireKickUntil=shotNow+170;if(m.weapon==='akimbo1887'&&r.akimboCycleStartedAt)r.akimboCycleStartedAt[m.hand==='left'?'left':'right']=shotNow;if(!m.suppressed)r.revealedUntil=shotNow+1500;{const v=weaponShotVariation(m.weapon),mods=remoteAttachmentsForWeapon(r,m.weapon),tone=attachmentShotTone(m.weapon,mods),soundScale=m.suppressed?.90:1;playSpatialCue(weaponShotSoundId(m.weapon,!!m.suppressed),m.x,m.y,m.z,weaponAudibleDistance(m.weapon,!!m.suppressed),.95*v.volume*soundScale*tone.volume,{playbackRate:v.playbackRate*(m.suppressed?.99:1)*tone.rate,priority:1});}}
  }
}
function removeBullet(id){const b=bullets.get(id);if(!b)return;bullets.delete(id);const root=b.root||b.mesh;try{scene?.remove(root);}catch{}if(b.type==='launcher')disposeObject3D(root);else{try{b.geometry?.dispose?.();}catch{}disposeMaterialResources(b.mesh?.material);}}
function clearBullets(){for(const id of [...bullets.keys()])removeBullet(id);}
let launcherTargetScratch=null,launcherDirectionScratch=null,launcherUpScratch=null;
function updateBullets(dt=1/60){
  const now=performance.now(),srv=serverNow();
  if(!launcherTargetScratch&&THREE){launcherTargetScratch=new THREE.Vector3();launcherDirectionScratch=new THREE.Vector3();launcherUpScratch=new THREE.Vector3(0,1,0);}
  const trailInterval=playerSettings.graphics==='low'?72:playerSettings.graphics==='medium'?56:42;
  for(const [id,b] of bullets){
    const age=now-b.born;if(age>b.lifeMs+250){removeBullet(id);continue;}
    if(b.type==='launcher'){
      const predictionAge=Math.max(0,Math.min(.12,(srv-b.snapshotAt)/1000)),target=launcherTargetScratch.copy(b.snapshotPos).addScaledVector(b.snapshotVel,predictionAge);target.y-=.5*b.gravity*predictionAge*predictionAge;
      const error=b.root.position.distanceTo(target),blend=error>1.5?1:1-Math.exp(-Math.max(.001,dt)*28);b.root.position.lerp(target,blend);
      b.visualVelocity.copy(b.snapshotVel);b.visualVelocity.y-=b.gravity*predictionAge;if(b.visualVelocity.lengthSq()>.0001)b.root.quaternion.setFromUnitVectors(launcherUpScratch,launcherDirectionScratch.copy(b.visualVelocity).normalize());
      if(b.weapon==='rpg'&&now-b.lastTrailAt>=trailInterval){b.lastTrailAt=now;spawnRocketTrailPuff(b.root.position,b.visualVelocity);}
      continue;
    }
    const t=Math.max(.001,age/1000),tailT=Math.max(0,t-b.length/Math.max(.01,b.speed)),speed=b.speed,gravity=b.gravity;
    const headX=b.start.x+b.dir.x*speed*t,headY=b.start.y+b.dir.y*speed*t-.5*gravity*t*t,headZ=b.start.z+b.dir.z*speed*t;
    const tailX=b.start.x+b.dir.x*speed*tailT,tailY=b.start.y+b.dir.y*speed*tailT-.5*gravity*tailT*tailT,tailZ=b.start.z+b.dir.z*speed*tailT;
    const attr=b.geometry.getAttribute('position');attr.setXYZ(0,tailX,tailY,tailZ);attr.setXYZ(1,headX,headY,headZ);attr.needsUpdate=true;b.mesh.material.opacity=.82*Math.max(0,1-age/b.lifeMs);
  }
}
function equipmentFuseMs(kind){return kind==='sticky'?1850:kind==='frag'?2300:kind==='smoke'?1300:1650;}
function spawnThrowableVisual(m){
  if(!m?.id)return;const existing=throwables.get(m.id);if(existing){updateThrowableVisual(m);return;}
  const root=new THREE.Group(),kind=EQUIPMENT_SPECS[m.kind]?m.kind:'flash',flash=kind==='flash',smoke=kind==='smoke',frag=kind==='frag',sticky=kind==='sticky';
  const color=flash?0xd7dde0:smoke?0x5d6468:frag?0x46513b:0x4b5632,bodyMat=new THREE.MeshStandardMaterial({color,roughness:.70,metalness:flash?.42:.26,emissive:sticky?0x130900:0x050505,emissiveIntensity:sticky?.12:.04});
  let geometry;if(flash||smoke)geometry=new THREE.CylinderGeometry(.10,.10,.24,10);else if(frag)geometry=new THREE.DodecahedronGeometry(.14,0);else geometry=new THREE.OctahedronGeometry(.14,1);
  const body=new THREE.Mesh(geometry,bodyMat);if(flash||smoke)body.rotation.z=Math.PI/2;root.add(body);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.075,8),new THREE.MeshStandardMaterial({color:0x252a2c,roughness:.55,metalness:.7}));cap.position.y=.13;root.add(cap);
  let indicator=null;if(sticky){indicator=new THREE.Mesh(new THREE.SphereGeometry(.025,6,5),new THREE.MeshBasicMaterial({color:0xff4b29,transparent:true,opacity:1}));indicator.position.set(.10,.04,.07);root.add(indicator);}
  root.position.set(m.x,m.y,m.z);scene.add(root);
  const at=Number(m.at)||serverNow(),fuseAt=Number(m.fuseAt)||at+equipmentFuseMs(kind);throwables.set(m.id,{root,mesh:root,body,indicator,kind,ownerId:m.ownerId,radius:equipmentCollisionRadius(kind),target:new THREE.Vector3(m.x,m.y,m.z),snapshotPos:new THREE.Vector3(m.x,m.y,m.z),snapshotVel:new THREE.Vector3(m.vx||0,m.vy||0,m.vz||0),snapshotAt:at,fuseAt,nextBeepAt:sticky?at+170:0,born:performance.now(),stuck:!!m.stuck,rolling:!!m.rolling});
  if(m.ownerId===clientId)soundThrowableThrow(kind);else playSpatialCue(sticky||frag?'stickyThrow':'flashThrow',m.x,m.y,m.z,30,.55);
}

function updateThrowableVisual(m){
  const g=throwables.get(m.id);if(!g)return;
  g.snapshotPos.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);g.target.copy(g.snapshotPos);g.snapshotAt=Number(m.at)||serverNow();if(Number.isFinite(Number(m.fuseAt)))g.fuseAt=Number(m.fuseAt);g.stuck=!!m.stuck;g.rolling=!!m.rolling;
  if(g.stuck)g.snapshotVel.set(0,0,0);else g.snapshotVel.set(Number(m.vx)||0,Number(m.vy)||0,Number(m.vz)||0);
}
function handleThrowableImpact(m){soundThrowableImpact(m.kind||'flash',m);updateThrowableVisual(m);}
function disposeMaterialResources(material){
  const materials=Array.isArray(material)?material:[material];
  for(const mat of materials){
    if(!mat)continue;
    // Transient gameplay effects own their materials. Dispose any texture-like
    // resources defensively, then the material itself. Cleanup must never throw
    // into the animation loop.
    for(const value of Object.values(mat)){if(value?.isTexture&&!value.userData?.preserveTransient&&!value.userData?.preserveWorldTexture){try{value.dispose?.();}catch{}}}
    try{mat.dispose?.();}catch{}
  }
}
function disposeObject3D(root){
  if(!root)return;
  const disposeNode=(node)=>{if(!node)return;try{node.geometry?.dispose?.();}catch{}disposeMaterialResources(node.material);};
  try{if(typeof root.traverse==='function')root.traverse(disposeNode);else disposeNode(root);}catch(error){console.warn('Transient object cleanup failed',error);}
}
function removeThrowableVisual(id){const g=throwables.get(id);if(!g)return;throwables.delete(id);const root=g.root||g.mesh;try{scene?.remove(root);}catch{}disposeObject3D(root);}
function clearThrowables(){for(const id of [...throwables.keys()])removeThrowableVisual(id);}
function updateThrowables(dt){
  const now=performance.now(),srv=serverNow();
  for(const g of throwables.values()){
    let px=g.snapshotPos.x,py=g.snapshotPos.y,pz=g.snapshotPos.z;
    if(!g.stuck){const age=Math.max(0,Math.min(.34,(srv-g.snapshotAt)/1000));px+=g.snapshotVel.x*age;pz+=g.snapshotVel.z*age;if(!g.rolling)py+=g.snapshotVel.y*age-.5*TACTICAL_GRAVITY*age*age;}
    g.target.set(px,py,pz);const error=g.root.position.distanceTo(g.target);
    if(error>2.5)g.root.position.copy(g.target);else g.root.position.lerp(g.target,1-Math.exp(-dt*18));
    if(g.rolling){g.root.rotation.x+=g.snapshotVel.z*dt*8;g.root.rotation.z-=g.snapshotVel.x*dt*8;}
    else if(!g.stuck){g.root.rotation.x+=dt*7;g.root.rotation.z+=dt*5;}
    if(g.kind==='sticky'&&Number.isFinite(g.fuseAt)&&srv>=g.nextBeepAt&&srv<g.fuseAt-45){const remaining=Math.max(0,g.fuseAt-srv);soundSemtexBeep(g,remaining);g.nextBeepAt=srv+semtexBeepInterval(remaining);}
    if(g.indicator){const remaining=Number.isFinite(g.fuseAt)?Math.max(0,g.fuseAt-srv):900,pulseRate=remaining<650?.035:.020,pulse=.45+.55*Math.sin((now-g.born)*pulseRate);g.indicator.scale.setScalar(.72+pulse*.55);g.indicator.material.opacity=.65+pulse*.35;}
  }
}

function playBulletImpactSound(kind,x,y,z){
  const cue=kind==='player'?'impactPlayer':kind==='blocked'?'impactBlocked':'impactWall';
  const rate=kind==='player'?.97+Math.random()*.05:.94+Math.random()*.10;
  playSpatialCue(cue,Number(x)||0,Number(y)||0,Number(z)||0,42,.92,{playbackRate:rate});
}
function spawnBulletImpactFx(m){
  if(!scene||!THREE)return;const kind=String(m?.kind||'world'),playerHit=kind==='player',blocked=kind==='blocked',x=Number(m?.x)||0,y=Number(m?.y)||0,z=Number(m?.z)||0,root=new THREE.Group();root.position.set(x,y,z);
  const count=playerHit?8:blocked?7:6,positions=new Float32Array(count*3),velocities=new Float32Array(count*3),geometry=new THREE.BufferGeometry();
  for(let i=0;i<count;i++){const j=i*3,a=Math.random()*Math.PI*2,speed=(playerHit?.42:blocked?1.20:.82)+Math.random()*(playerHit?.72:1.05);velocities[j]=Math.cos(a)*speed;velocities[j+1]=(playerHit?.10:.18)+Math.random()*(playerHit?.70:1.05);velocities[j+2]=Math.sin(a)*speed;}
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const color=playerHit?0x9e1828:blocked?0xe9d675:0xe1c49a,material=new THREE.PointsMaterial({color,size:playerHit?.055:.042,sizeAttenuation:true,transparent:true,opacity:playerHit?.72:.86,depthWrite:false,blending:playerHit?THREE.NormalBlending:THREE.AdditiveBlending});
  const particles=new THREE.Points(geometry,material);particles.frustumCulled=false;root.add(particles);
  let mark=null;if(!playerHit){mark=new THREE.Mesh(new THREE.SphereGeometry(blocked?.025:.021,6,4),new THREE.MeshBasicMaterial({color:blocked?0xd9c76a:0x292724,transparent:true,opacity:blocked?.72:.84,depthWrite:false}));root.add(mark);}
  const worldMarkDuration=playerSettings.graphics==='low'?2.5:playerSettings.graphics==='medium'?3.4:4.6,impactCap=playerSettings.graphics==='low'?28:playerSettings.graphics==='medium'?44:64;
  scene.add(root);bulletImpactFx.push({root,particles,velocities,mark,age:0,particleDuration:playerHit?.30:.24,duration:playerHit?.34:blocked?.55:worldMarkDuration,playerHit,blocked});
  while(bulletImpactFx.length>impactCap){const old=bulletImpactFx.shift();try{scene?.remove(old.root);}catch{}disposeObject3D(old.root);}
  playBulletImpactSound(kind,x,y,z);
}
function updateBulletImpactFx(dt){
  for(let i=bulletImpactFx.length-1;i>=0;i--){const f=bulletImpactFx[i];f.age+=dt;const particleP=Math.min(1,f.age/f.particleDuration),attr=f.particles.geometry.getAttribute('position'),pos=attr.array,v=f.velocities;
    if(particleP<1){for(let j=0;j<pos.length;j+=3){v[j+1]-=(f.playerHit?4.8:7.2)*dt;pos[j]+=v[j]*dt;pos[j+1]+=v[j+1]*dt;pos[j+2]+=v[j+2]*dt;}attr.needsUpdate=true;}f.particles.material.opacity=Math.max(0,1-particleP)*(f.playerHit?.72:.86);
    if(f.mark){const fadeStart=Math.max(.35,f.duration-.9),fade=f.blocked?Math.max(0,1-f.age/f.duration):f.age<fadeStart?1:Math.max(0,1-(f.age-fadeStart)/Math.max(.01,f.duration-fadeStart));f.mark.material.opacity=(f.blocked?.72:.84)*fade;}
    if(f.age>=f.duration){bulletImpactFx.splice(i,1);try{scene?.remove(f.root);}catch{}disposeObject3D(f.root);}
  }
}
function clearBulletImpactFx(){const pending=bulletImpactFx.splice(0);for(const f of pending){try{scene?.remove(f.root);}catch{}disposeObject3D(f.root);}}

function applyExplosionFeedback(kind,m){
  if(!position||!m)return;const radius=Math.max(1,Number(m.radius)||6),dx=(Number(m.x)||0)-position.x,dy=(Number(m.y)||0)-(camera?.position?.y||position.y),dz=(Number(m.z)||0)-position.z,dist=Math.hypot(dx,dy,dz),reach=radius*2.65,power=THREE.MathUtils.clamp(1-dist/Math.max(1,reach),0,1);if(power<=.01)return;
  const now=performance.now();blastFeedbackPower=Math.max(blastFeedbackPower,power);blastFeedbackUntil=Math.max(blastFeedbackUntil,now+THREE.MathUtils.lerp(150,420,power));blastFeedbackSeed=(Number(m.x)||0)*.73+(Number(m.z)||0)*1.19+now*.001;
  if(diagnosticsRecordingEnabled())diagnosticsRecordEvent('explosion_nearby',{kind:String(kind||''),distance:diagnosticsRound(dist,2),radius:diagnosticsRound(radius,2),power:diagnosticsRound(power,3)});
}
function explosionVisualRoll(now=performance.now()){if(now>=blastFeedbackUntil||blastFeedbackPower<=.001){blastFeedbackPower=0;return 0;}const remaining=THREE.MathUtils.clamp((blastFeedbackUntil-now)/420,0,1),p=blastFeedbackPower*remaining;return Math.sin(now*.071+blastFeedbackSeed)*p*.026;}
function spawnDetonationFx(kind,m){
  if(!scene||!THREE)return;
  const sticky=kind==='sticky',frag=kind==='frag',launcher=kind==='rpg'||kind==='grenadeLauncher',damaging=sticky||frag||launcher;
  const blastRadius=damaging?Math.max(1,Number(m?.radius)||6):5.5,root=new THREE.Group();root.position.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);
  // The outer ring is scaled from the authoritative damage radius. This keeps
  // what the player sees consistent with the actual splash volume.
  const coreColor=sticky?0xff8a35:launcher?0xffb05d:frag?0xffc77a:0xffffff,ringColor=sticky?0xffb15c:launcher?0xffd19a:frag?0xffddb0:0xeafaff;
  const core=new THREE.Mesh(new THREE.SphereGeometry(1,12,8),new THREE.MeshBasicMaterial({color:coreColor,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));core.scale.setScalar(.08);root.add(core);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.82,1,28),new THREE.MeshBasicMaterial({color:ringColor,transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.12);root.add(ring);
  const count=sticky?18:launcher?22:frag?16:10,positions=new Float32Array(count*3),velocities=new Float32Array(count*3),geometry=new THREE.BufferGeometry(),duration=sticky?.72:launcher?.68:frag?.60:.48;
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,e=.12+Math.random()*.92,targetSpeed=(blastRadius*(.62+Math.random()*.28))/duration,j=i*3;velocities[j]=Math.cos(a)*Math.cos(e)*targetSpeed;velocities[j+1]=Math.sin(e)*targetSpeed*.72;velocities[j+2]=Math.sin(a)*Math.cos(e)*targetSpeed;}
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const particleMaterial=new THREE.PointsMaterial({color:sticky?0xffae68:launcher?0xffc17a:frag?0xffd19a:0xffffff,size:sticky?.10:launcher?.13:frag?.10:.08,sizeAttenuation:true,transparent:true,opacity:.92,depthWrite:false,blending:THREE.AdditiveBlending});
  const particles=new THREE.Points(geometry,particleMaterial);particles.frustumCulled=false;root.add(particles);scene.add(root);
  tacticalFx.push({kind,root,core,ring,particles,velocities,age:0,duration,blastRadius});const cap=playerSettings.graphics==='low'?12:playerSettings.graphics==='medium'?18:28;while(tacticalFx.length>cap){const old=tacticalFx.shift();try{scene?.remove(old.root);}catch{}disposeObject3D(old.root);}
}
function updateTacticalFx(dt){
  for(let i=tacticalFx.length-1;i>=0;i--){
    const f=tacticalFx[i];f.age+=dt;const p=Math.min(1,f.age/f.duration),sticky=f.kind==='sticky',frag=f.kind==='frag',launcher=f.kind==='rpg'||f.kind==='grenadeLauncher',radius=Math.max(1,f.blastRadius||5.5);
    f.core.scale.setScalar(radius*(sticky?.46:launcher?.52:frag?.48:.42)*(1-Math.pow(1-p,3))+.05);f.core.material.opacity=(1-p)*(sticky?.62:launcher?.74:frag?.68:.88);
    f.ring.scale.setScalar(radius*Math.min(1,Math.pow(p,.62)));f.ring.material.opacity=(1-p)*(sticky?.70:launcher?.78:frag?.74:.86);
    const attr=f.particles.geometry.getAttribute('position'),pos=attr.array,v=f.velocities;
    for(let j=0;j<pos.length;j+=3){v[j+1]-=9*dt;pos[j]+=v[j]*dt;pos[j+1]+=v[j+1]*dt;pos[j+2]+=v[j+2]*dt;}
    attr.needsUpdate=true;f.particles.material.opacity=Math.max(0,1-p);f.particles.material.size=(sticky?.10:launcher?.13:frag?.10:.08)*(1+p*1.1);
    if(p>=1){tacticalFx.splice(i,1);try{scene?.remove(f.root);}catch{}disposeObject3D(f.root);}
  }
}
function clearTacticalFx(){const pending=tacticalFx.splice(0);for(const f of pending){try{scene?.remove(f.root);}catch{}disposeObject3D(f.root);}}
function smokePointCounts(){return playerSettings.graphics==='low'?{core:10,outer:12}:playerSettings.graphics==='medium'?{core:14,outer:18}:{core:18,outer:26};}
function makeSmokePointLayer(count,radius,core,texture){
  const positions=new Float32Array(count*3);for(let i=0;i<count;i++){const a=(i*2.399963229728653)+Math.random()*.28,radial=(core?Math.sqrt(Math.random())*.43:(.28+Math.sqrt(Math.random())*.50))*radius,yBand=core?(-.08+Math.random()*.34):(-.12+Math.random()*.48),j=i*3;positions[j]=Math.cos(a)*radial;positions[j+1]=yBand*radius;positions[j+2]=Math.sin(a)*radial;}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.PointsMaterial({map:texture,color:core?0x74797a:0x686d6f,size:radius*(core?.50:.42),sizeAttenuation:true,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false,alphaTest:.015});
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.userData={baseOpacity:core?.76:.60,phase:core?.4:1.7};return points;
}
function spawnSmokeCloud(m){
  if(!scene||!THREE||!m?.id)return;const existing=smokeClouds.get(m.id);if(existing){existing.expiresAt=Math.max(existing.expiresAt,Number(m.expiresAt)||serverNow()+SMOKE_DURATION_MS);return;}
  const radius=Math.max(4,Number(m.radius)||9.6),root=new THREE.Group();root.position.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);const texture=getSharedSmokeTexture(),counts=smokePointCounts(),core=makeSmokePointLayer(counts.core,radius,true,texture),outer=makeSmokePointLayer(counts.outer,radius,false,texture),layers=[core,outer];root.add(core,outer);
  // Two batched point layers replace 48 individually-materialed sprites. The
  // gameplay cloud radius and LOS behavior are unchanged, while a smoke cloud
  // now costs two transparent draw calls instead of dozens on mobile.
  const srvNow=serverNow(),serverBornAt=Number(m.bornAt)||srvNow;scene.add(root);smokeClouds.set(m.id,{root,layers,bornAt:serverBornAt,expiresAt:Number(m.expiresAt)||srvNow+SMOKE_DURATION_MS,radius});
}
function updateSmokeCloudVisibility(now=performance.now()){
  if(now-lastSmokeVisibilityAt<240)return;lastSmokeVisibilityAt=now;const limit=playerSettings.graphics==='low'?8:playerSettings.graphics==='medium'?12:16,clouds=[...smokeClouds.values()];
  if(clouds.length<=limit){for(const c of clouds)if(c.root)c.root.visible=true;return;}
  const cx=Number(camera?.position?.x)||0,cy=Number(camera?.position?.y)||0,cz=Number(camera?.position?.z)||0;clouds.sort((a,b)=>{const ap=a.root?.position,bp=b.root?.position,ad=ap?(ap.x-cx)**2+(ap.y-cy)**2+(ap.z-cz)**2:Infinity,bd=bp?(bp.x-cx)**2+(bp.y-cy)**2+(bp.z-cz)**2:Infinity;return ad-bd;});
  for(let i=0;i<clouds.length;i++)if(clouds[i].root)clouds[i].root.visible=i<limit;
}
function radiusVisualDrift(radius){return Math.min(.08,Math.max(.025,(Number(radius)||9.6)*.006));}
function updateSmokeClouds(dt){
  const now=performance.now(),srv=serverNow();updateSmokeCloudVisibility(now);for(const [id,c] of smokeClouds){const ageMs=Math.max(0,srv-(Number(c.bornAt)||srv)),grow=Math.min(1,ageMs/SMOKE_GROW_MS),remaining=c.expiresAt-srv;if(remaining<=0){smokeClouds.delete(id);try{scene?.remove(c.root);}catch{}disposeObject3D(c.root);continue;}if(c.root.visible===false)continue;const fade=Math.min(1,remaining/1800),visualScale=SMOKE_START_SCALE+(1-SMOKE_START_SCALE)*grow;c.root.scale.setScalar(visualScale);c.root.rotation.y+=dt*.018;for(const layer of c.layers){const u=layer.userData||{},pulse=.97+.03*Math.sin(now*.0007+(u.phase||0));layer.material.opacity=(u.baseOpacity||.62)*pulse*grow*fade;layer.position.x=Math.sin(now*.00019+(u.phase||0))*radiusVisualDrift(c.radius);layer.position.y=Math.sin(now*.00024+(u.phase||0))*.018;layer.position.z=Math.cos(now*.00017+(u.phase||0))*radiusVisualDrift(c.radius);}}
}
function clearSmokeClouds(){const pending=[...smokeClouds.values()];smokeClouds.clear();lastSmokeVisibilityAt=0;for(const c of pending){try{scene?.remove(c.root);}catch{}disposeObject3D(c.root);}}

function applyFlashEffect(m){const power=Math.max(0,Math.min(1,Number(m.power)||0));if(power<=0)return;const now=performance.now(),duration=Math.max(350,Number(m.durationMs)||700+power*2600);flashPeakUntil=Math.max(flashPeakUntil,now+180+power*520);flashUntil=Math.max(flashUntil,now+duration);}
function animate(){
  requestAnimationFrame(animate);
  const rawFrameDt=Math.max(0,clock.getDelta()),frameDt=Math.min(rawFrameDt,CLIENT_MAX_FRAME_SEC);recordNetFrame(rawFrameDt);
  updateGamepadInput(frameDt);updateLoadoutPreviewFrame(performance.now(),Math.min(rawFrameDt,.10));
  if(!shell.inMatch)return;
  if(shell.canPlay){
    // Keep prediction caught up without a fixed-step backlog. A render hitch used
    // to trigger as many as 18 collision/physics passes in the very next frame,
    // which turned one missed frame into a repeating hitch. Normal elapsed time
    // is now divided into at most four bounded substeps; only extreme suspended
    // frames are clipped and the server correction path handles that recovery.
    const steps=Math.max(1,Math.min(CLIENT_MAX_SIM_STEPS,Math.ceil(frameDt/(CLIENT_FIXED_STEP_SEC*1.35))));
    const stepDt=Math.min(MAX_PLAYER_PHYSICS_STEP_SEC,frameDt/steps);
    for(let i=0;i<steps;i++)updateGameSimulation(stepDt);
    updateGameFrame(Math.min(frameDt,MAX_PLAYER_PHYSICS_STEP_SEC));
  }else updatePausedNetwork();
  const visualDt=Math.min(frameDt,.10);updateAim(visualDt);updateRemoteVisuals(visualDt);updateWeaponView(visualDt);updateGameplayLaserBeams(performance.now());
  // Cosmetic systems are fault-contained from the gameplay/simulation path.
  // A malformed transient effect must be discarded rather than poisoning every
  // following render frame and making the match appear frozen.
  try{updateBullets(visualDt);}catch(error){console.error('Tracer update failed; clearing transient tracers.',error);clearBullets();}
  try{updateRocketTrailPuffs(visualDt);}catch(error){console.error('Rocket trail update failed; clearing transient rocket smoke.',error);clearRocketTrailPuffs();}
  try{updateThrowables(visualDt);}catch(error){console.error('Throwable visual update failed; clearing transient throwables.',error);clearThrowables();}
  try{updateTacticalFx(visualDt);}catch(error){console.error('Explosion visual update failed; clearing transient explosion FX.',error);clearTacticalFx();}
  try{updateBulletImpactFx(visualDt);}catch(error){console.error('Bullet impact visual update failed; clearing transient impact FX.',error);clearBulletImpactFx();}
  try{updateSmokeClouds(visualDt);}catch(error){console.error('Smoke visual update failed; clearing transient smoke FX.',error);clearSmokeClouds();}
  updateEquipmentTrajectory();captureGameplayDiagnostics(rawFrameDt,performance.now());
  // Draw the 2D HUD texture before the compositing pass so visual state and the
  // world frame are presented together.
  const renderNow=performance.now();if(shell.canPlay)drawHud(renderNow);
  renderer.autoClear=true;
  renderer.render(scene,camera);
  if(shell.canPlay){renderer.autoClear=false;renderer.clearDepth();renderer.render(hudScene,hudCamera);renderer.autoClear=true;}
}
function maintainNetwork(){
  const now=performance.now(),stateSent=sendCurrentState(false);sendSimulationHeartbeat(stateSent);
  const diagnosticsOn=diagnosticsRecordingEnabled();if(now-lastPing<=(diagnosticsOn?2000:15000))return;
  lastPing=now;lastPingLocalAt=Date.now();send({t:'ping',clientAt:lastPingLocalAt,diag:diagnosticsOn?1:0});
}
function updatePausedNetwork(){if(traversal)updateTraversal(performance.now());maintainNetwork();}
function finishControllerUiAdjustment(){
  const state=controllerUiAdjusting;if(!state)return;
  controllerUiAdjusting=null;state.el?.classList?.remove('controller-adjusting');
  if(state.el&&String(state.el.value)!==state.startValue)state.el.dispatchEvent(new Event('change',{bubbles:true}));
}
function clearControllerUiEditing(){
  finishControllerUiAdjustment();
  if(controllerUiEditing?.classList)controllerUiEditing.classList.remove('controller-editing');
  controllerUiEditing=null;
}
function controllerFocusKey(el){
  if(!el)return'';if(el.dataset?.controllerKey)return`controller:${el.dataset.controllerKey}`;if(el.id)return`id:${el.id}`;
  const stableData=['deployTab','lobbySideTab','lobbyCheatTab','lobbyAdminGod','lobbyAdminRole','adminGod','adminRole','lobbyMapChoice','lobbyMode','loadoutChoice','loadoutClass','loadoutEditItem','loadoutBackClass','loadoutBackClasses','loadoutWeaponPickerToggle','loadoutAdsPreview','calloutSlot','matchPrimaryChoice','matchTacticalChoice','matchLethalChoice','settingsTab','adminTab','chatChar','chatAction','editorChar','editorAction','gameControl'];
  for(const key of stableData){const value=el.dataset?.[key];if(value!=null&&value!=='')return`data:${key}:${value}`;}
  const text=String(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,48);return`${el.tagName||''}:${text}`;
}
function clearControllerUiFocus(){
  clearControllerUiEditing();
  if(controllerUiFocus?.classList){controllerUiFocus.closest?.('.loadout-class-card')?.classList.remove('controller-card-focus');controllerUiFocus.classList.remove('controller-focus');}
  controllerUiFocus=null;controllerUiFocusKey='';
}
function resetControllerUiAxis(){controllerUiAxisDirection='';controllerUiAxisNextAt=0;controllerUiAxisStartedAt=0;}
function controllerEditableField(el){return !!el?.matches?.('[data-game-control="cycle"],[data-game-control="stepper"],[data-game-control="slider"]');}
function setControllerUiEditing(el){
  if(!controllerEditableField(el))return false;
  clearControllerUiEditing();controllerUiEditing=el;el.classList.add('controller-editing');return true;
}
function controllerUiSurface(){
  if(lobbyQuitPromptOpen())return lobbyQuitConfirm;
  if(shell.connecting)return connectionOverlay;
  if(gameTextEditorTarget)return gameTextEditor;
  if(chatOpen)return chatComposer;
  if(shell.panel===SHELL_PANEL.SETTINGS)return $('settingsPanel');
  if(shell.panel===SHELL_PANEL.ADMIN)return $('adminPanel');
  if(shell.panel===SHELL_PANEL.LOADOUT)return $('loadoutPanel');
  if(shell.paused)return pause;
  if(shell.inLobby)return lobbyScreen;
  if(!entryScreen.classList.contains('hide'))return entryScreen;
  if(!menu.classList.contains('hide'))return menu;
  return null;
}
function controllerPrimaryTablist(surface){return surface?.querySelector?.('[data-controller-primary-tabs="true"]')||null;}
function controllerUiScopeId(surface=controllerUiSurface()){
  if(!surface)return'';
  if(surface===lobbyScreen){const side=surface.querySelector('[data-lobby-side-tab].active')?.dataset?.lobbySideTab||'players';return side==='loadout'?`lobby:${side}:${loadoutWorkspaceMode.lobby}:${loadoutFocusSlot.lobby||'primary'}`:`lobby:${side}`;}
  if(surface===menu)return`menu:${surface.querySelector('[data-deploy-view]:not([hidden]):not(.hide)')?.dataset?.deployView||'play'}`;
  if(surface===$('settingsPanel'))return`settings:${surface.querySelector('[data-settings-tab].active')?.dataset?.settingsTab||'controls'}`;
  if(surface===$('adminPanel'))return`admin:${activeAdminTab||'gameplay'}`;
  if(surface===$('loadoutPanel'))return`loadout:${loadoutWorkspaceMode.match}:${loadoutFocusSlot.match||'primary'}`;
  if(surface===lobbyQuitConfirm)return'lobby-quit';
  if(surface===pause)return'pause';
  if(surface===chatComposer)return'chat';
  if(surface===gameTextEditor)return'editor';
  if(surface===entryScreen)return'entry';
  return surface.id?`surface:${surface.id}`:'surface';
}
function controllerRememberFocus(el,surface=controllerUiSurface()){const scope=controllerUiScopeId(surface),key=controllerFocusKey(el);if(scope&&key)controllerUiFocusMemory.set(scope,key);}
function controllerElementVisible(el,surface){
  if(!el||!surface||!surface.contains(el)||el.disabled)return false;
  if(el.closest('[hidden],.hide,[aria-hidden="true"]'))return false;
  const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
  const r=el.getBoundingClientRect();if(r.width<=2||r.height<=2)return false;
  return true;
}
function controllerFocusableElements(){
  const surface=controllerUiSurface();if(!surface)return[];
  const selector='button:not([disabled]):not(.game-control-arrow),[role="tab"]:not([disabled]),[data-game-control][tabindex="0"]:not(.disabled),[data-controller-focusable="true"]';
  return [...new Set(surface.querySelectorAll(selector))].filter(el=>controllerElementVisible(el,surface));
}
function controllerRevealFocusedElement(el,surface){
  if(!el||!surface)return;let node=el.parentElement,er=el.getBoundingClientRect();
  while(node&&node!==document.body){const style=getComputedStyle(node),canY=/(auto|scroll)/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+2,canX=/(auto|scroll)/.test(style.overflowX)&&node.scrollWidth>node.clientWidth+2;if(canY||canX){const r=node.getBoundingClientRect();if(canY){if(er.top<r.top)node.scrollTop-=r.top-er.top;else if(er.bottom>r.bottom)node.scrollTop+=er.bottom-r.bottom;}if(canX){if(er.left<r.left)node.scrollLeft-=r.left-er.left;else if(er.right>r.right)node.scrollLeft+=er.right-r.right;}er=el.getBoundingClientRect();}if(node===surface)break;node=node.parentElement;}
}
function setControllerUiFocus(el){
  const surface=controllerUiSurface();if(!controllerElementVisible(el,surface))return false;
  if(controllerUiFocus===el)return true;
  if(controllerUiEditing&&controllerUiEditing!==el)clearControllerUiEditing();else finishControllerUiAdjustment();
  if(controllerUiFocus?.classList){controllerUiFocus.closest?.('.loadout-class-card')?.classList.remove('controller-card-focus');controllerUiFocus.classList.remove('controller-focus');}
  controllerUiFocus=el;controllerUiFocusKey=controllerFocusKey(el);controllerRememberFocus(el,surface);el.classList.add('controller-focus');el.closest?.('.loadout-class-card')?.classList.add('controller-card-focus');
  try{el.focus?.({preventScroll:true});}catch{el.focus?.();}
  controllerRevealFocusedElement(el,surface);return true;
}
function queueControllerUiFocus(key,{fallback=null}={}){
  if(!controllerInputActive()||!key)return;
  const expected=String(key),attempt=()=>{const surface=controllerUiSurface(),list=controllerFocusableElements();if(!surface||!list.length)return false;const target=list.find(el=>el.dataset?.controllerKey===expected||controllerFocusKey(el)===expected||controllerFocusKey(el)===`controller:${expected}`)||(typeof fallback==='function'?fallback(list,surface):null);return target?setControllerUiFocus(target):false;};
  requestAnimationFrame(()=>{if(!attempt())requestAnimationFrame(attempt);});
}
function controllerPreferredRegion(surface){
  if(!surface)return null;
  if(surface===lobbyQuitConfirm)return surface.querySelector('.lobby-quit-card')||surface;
  if(surface===lobbyScreen)return surface.querySelector('[data-lobby-side-view].active:not([hidden])')||surface;
  if(surface===menu)return surface.querySelector('.deploy-view:not([hidden]):not(.hide)')||surface;
  if(surface===$('settingsPanel'))return surface.querySelector('[data-settings-page].active:not([hidden])')||surface;
  if(surface===$('adminPanel'))return surface.querySelector('[data-admin-page]:not([hidden]):not(.hide)')||surface;
  if(surface===$('loadoutPanel'))return surface.querySelector('[data-loadout-classes-view="match"]:not([hidden]),[data-loadout-class-view="match"]:not([hidden]),[data-loadout-item-view="match"]:not([hidden])')||surface;
  return surface;
}
function preferredControllerFocus(list,surface){
  if(!list.length)return null;
  const chatDefault=surface===chatComposer?list.find(el=>el.dataset?.chatChar==='q'):surface===gameTextEditor?list.find(el=>el.dataset?.editorChar==='q'):null;if(chatDefault)return chatDefault;
  const region=controllerPreferredRegion(surface),regionList=region&&region!==surface?list.filter(el=>region.contains(el)):list;if(regionList.length)list=regionList;
  const activeNestedTab=list.find(el=>el.closest?.('[role="tablist"]')&&!el.closest?.('[data-controller-primary-tabs="true"]')&&el.getAttribute('aria-selected')==='true');if(activeNestedTab)return activeNestedTab;
  const primary=list.find(el=>el.dataset?.controllerDefault==='true')||list.find(el=>el.classList?.contains('active'));if(primary)return primary;
  const rr=(region||surface).getBoundingClientRect();
  return list.reduce((best,el)=>{
    const r=el.getBoundingClientRect(),top=Math.max(0,r.top-rr.top),left=Math.max(0,r.left-rr.left),score=top*1.2+left*.08;
    return !best||score<best.score?{el,score}:best;
  },null)?.el||list[0];
}
function ensureControllerUiFocus(){
  const surface=controllerUiSurface(),list=controllerFocusableElements();if(!surface||!list.length){clearControllerUiFocus();return null;}
  if(!list.includes(controllerUiFocus)){
    const rememberedKey=controllerUiFocusMemory.get(controllerUiScopeId(surface))||'',priorKey=controllerUiFocusKey||controllerFocusKey(controllerUiFocus);
    const restored=(rememberedKey&&list.find(el=>controllerFocusKey(el)===rememberedKey))||(priorKey&&list.find(el=>controllerFocusKey(el)===priorKey))||null;
    setControllerUiFocus(restored||preferredControllerFocus(list,surface));
  }
  return controllerUiFocus;
}
function intervalGap(a0,a1,b0,b1){if(a1<b0)return b0-a1;if(b1<a0)return a0-b1;return 0;}
const CONTROLLER_NAV_GROUP_SELECTOR='.settings-grid,.weapon-fields,.loadout-choice-grid,.attachment-editor,.gunsmith-attachment-options,.loadout-class-list,.class-detail-grid,.gunsmith-callout-overlay,.gunsmith-inspector,.loadout-view-nav,.lobby-mode-picker,.lobby-setup-row,.lobby-team-picker,.lobby-side-tabs,.lobby-header-actions,.lobby-footer-actions,.lobby-player-actions,.admin-bot-controls,.pause-actions,.pause-actions-player,.pause-actions-system,.join-controls,.lobby-map-choice-grid,.lobby-cheat-tabs,.chat-key-row,.game-text-key-row';
function controllerNavGroup(el){return el?.closest?.(CONTROLLER_NAV_GROUP_SELECTOR)||null;}
function controllerDirectionScore(a,r,dx,dy){
  const ax=a.left+a.width/2,ay=a.top+a.height/2,bx=r.left+r.width/2,by=r.top+r.height/2,vx=bx-ax,vy=by-ay;
  if((dx<0&&vx>=-3)||(dx>0&&vx<=3)||(dy<0&&vy>=-3)||(dy>0&&vy<=3))return null;
  const horizontal=dx!==0;
  const primary=horizontal?Math.max(0,dx>0?r.left-a.right:a.left-r.right):Math.max(0,dy>0?r.top-a.bottom:a.top-r.bottom);
  const crossGap=horizontal?intervalGap(a.top,a.bottom,r.top,r.bottom):intervalGap(a.left,a.right,r.left,r.right);
  const crossCenter=horizontal?Math.abs(vy):Math.abs(vx),centerPrimary=horizontal?Math.abs(vx):Math.abs(vy);
  const angleRatio=crossCenter/Math.max(1,centerPrimary);
  const aligned=crossGap<=Math.max(8,(horizontal?Math.min(a.height,r.height):Math.min(a.width,r.width))*.18);
  if(!aligned&&angleRatio>1.0)return null;
  const direct=aligned||angleRatio<=.55;
  return{score:primary+crossGap*5.5+crossCenter*.28+centerPrimary*.03,direct};
}
const GUNSMITH_CONTROLLER_POINTS=Object.freeze({optic:[1,0],muzzle:[0,1],barrel:[0,2],magazine:[1,3],underbarrel:[2,3],stock:[2,2]});
function controllerGridColumnCount(group){const raw=getComputedStyle(group).gridTemplateColumns||'';const cols=raw.split(/\s+/).filter(Boolean).length;return Math.max(1,cols||1);}
function controllerGridMove(current,list,group,dx,dy){
  const items=list.filter(el=>controllerNavGroup(el)===group);if(items.length<2)return null;
  if(group.classList.contains('gunsmith-callout-overlay')){const slot=current.dataset?.calloutSlot,from=GUNSMITH_CONTROLLER_POINTS[slot];if(!from)return null;let best=null,bestScore=Infinity;for(const el of items){if(el===current)continue;const to=GUNSMITH_CONTROLLER_POINTS[el.dataset?.calloutSlot];if(!to)continue;const vx=to[0]-from[0],vy=to[1]-from[1];if((dx<0&&vx>=0)||(dx>0&&vx<=0)||(dy<0&&vy>=0)||(dy>0&&vy<=0))continue;const primary=dx?Math.abs(vx):Math.abs(vy),cross=dx?Math.abs(vy):Math.abs(vx),score=primary+cross*1.35;if(score<bestScore){best=el;bestScore=score;}}if(best)return best;const key=String(current.dataset?.controllerKey||'').match(/^gunsmith:(.+):slot:/)?.[1]||'';if(dy<0&&key){const change=list.find(el=>el.dataset?.controllerKey===`weapon-toggle:${key}`);if(change)return change;}if(dy>0&&key){const ads=list.find(el=>el.dataset?.controllerKey===`ads:${key}`);if(ads)return ads;}return null;}
  if(group.matches('.class-detail-grid,.gunsmith-attachment-options,.loadout-choice-grid,.equipment-choice-grid')){const cols=controllerGridColumnCount(group),idx=items.indexOf(current);if(idx<0)return current;if(dx){const next=idx+(dx>0?1:-1);if(next<0||next>=items.length||Math.floor(next/cols)!==Math.floor(idx/cols))return null;return items[next]||current;}if(dy){const next=idx+(dy>0?cols:-cols);if(next<0||next>=items.length)return null;return items[next]||null;}return current;}
  return null;
}
function moveControllerUiFocus(dx,dy){
  const list=controllerFocusableElements();if(!list.length)return false;const current=ensureControllerUiFocus();if(!current)return false;
  const a=current.getBoundingClientRect(),group=controllerNavGroup(current),explicit=group?controllerGridMove(current,list,group,dx,dy):null;if(explicit){setControllerUiFocus(explicit);return true;}
  let sameDirect=null,sameDirectScore=Infinity,direct=null,directScore=Infinity,sameFallback=null,sameFallbackScore=Infinity,fallback=null,fallbackScore=Infinity;
  for(const el of list){if(el===current)continue;const result=controllerDirectionScore(a,el.getBoundingClientRect(),dx,dy);if(!result)continue;
    const sameGroup=!!group&&controllerNavGroup(el)===group;
    if(result.direct&&sameGroup&&result.score<sameDirectScore){sameDirect=el;sameDirectScore=result.score;}
    if(result.direct&&result.score<directScore){direct=el;directScore=result.score;}
    if(sameGroup&&result.score<sameFallbackScore){sameFallback=el;sameFallbackScore=result.score;}
    if(result.score<fallbackScore){fallback=el;fallbackScore=result.score;}
  }
  const best=sameDirect||direct||sameFallback||fallback;if(best){setControllerUiFocus(best);return true;}return false;
}
function controllerUiDirection(pressed){
  const held=gamepadFrame.held||[],enterThreshold=.68,releaseThreshold=.40;let dx=0,dy=0,source='';
  const dl=!!held[GAMEPAD_BUTTON.DPAD_LEFT],dr=!!held[GAMEPAD_BUTTON.DPAD_RIGHT],du=!!held[GAMEPAD_BUTTON.DPAD_UP],dd=!!held[GAMEPAD_BUTTON.DPAD_DOWN];
  const ddx=(dr?1:0)-(dl?1:0),ddy=(dd?1:0)-(du?1:0);
  if(ddx||ddy){
    source='d';
    if(ddx&&ddy){
      const horizontalPressed=pressed[GAMEPAD_BUTTON.DPAD_LEFT]||pressed[GAMEPAD_BUTTON.DPAD_RIGHT],verticalPressed=pressed[GAMEPAD_BUTTON.DPAD_UP]||pressed[GAMEPAD_BUTTON.DPAD_DOWN];
      if(horizontalPressed&&!verticalPressed)dx=ddx;else if(verticalPressed&&!horizontalPressed)dy=ddy;else if(controllerUiAxisDirection.endsWith(`${ddx},0`))dx=ddx;else dy=ddy;
    }else{dx=ddx;dy=ddy;}
  }else{
    const x=Number(gamepadFrame.moveX)||0,y=Number(gamepadFrame.moveY)||0,latched=controllerUiAxisDirection.startsWith('s:'),threshold=latched?releaseThreshold:enterThreshold;
    if(Math.max(Math.abs(x),Math.abs(y))>=threshold){source='s';if(Math.abs(x)>=Math.abs(y))dx=x>0?1:-1;else dy=y>0?1:-1;}
  }
  if(!dx&&!dy){resetControllerUiAxis();return null;}
  const key=`${source}:${dx},${dy}`,now=performance.now(),justPressed=source==='d'&&(pressed[GAMEPAD_BUTTON.DPAD_LEFT]||pressed[GAMEPAD_BUTTON.DPAD_RIGHT]||pressed[GAMEPAD_BUTTON.DPAD_UP]||pressed[GAMEPAD_BUTTON.DPAD_DOWN]);
  if(key!==controllerUiAxisDirection||justPressed){controllerUiAxisDirection=key;controllerUiAxisStartedAt=now;controllerUiAxisNextAt=now+360;return{dx,dy};}
  if(now>=controllerUiAxisNextAt){const heldFor=now-controllerUiAxisStartedAt,delay=heldFor>=2400?55:heldFor>=1200?80:115;controllerUiAxisNextAt=now+delay;return{dx,dy};}
  return null;
}
function controllerEditAdjustHeld(){
  const held=gamepadFrame.held||[];if(held[GAMEPAD_BUTTON.DPAD_LEFT]||held[GAMEPAD_BUTTON.DPAD_RIGHT]||held[GAMEPAD_BUTTON.DPAD_UP]||held[GAMEPAD_BUTTON.DPAD_DOWN])return true;
  const x=Number(gamepadFrame.moveX)||0,y=Number(gamepadFrame.moveY)||0;return Math.max(Math.abs(x),Math.abs(y))>=.40;
}
function stepControllerField(el,dir){
  if(!controllerEditableField(el)||!dir)return false;
  if(controllerUiAdjusting?.el!==el){finishControllerUiAdjustment();controllerUiAdjusting={el,startValue:String(el.value)};el.classList.add('controller-adjusting');}
  return adjustGameControl(el,dir,{commit:false});
}
function cycleControllerTabs(direction){
  const surface=controllerUiSurface();if(!surface)return false;const tablist=controllerPrimaryTablist(surface);if(!tablist)return false;
  const tabs=[...tablist.querySelectorAll('[role="tab"],button')].filter(el=>controllerElementVisible(el,surface)&&!el.disabled);if(tabs.length<2)return false;
  let cur=tabs.findIndex(el=>el.getAttribute('aria-selected')==='true'||el.classList.contains('active'));if(cur<0)cur=0;
  const next=(cur+direction+tabs.length)%tabs.length;finishControllerUiAdjustment();tabs[next].click();
  requestAnimationFrame(()=>{if(controllerUiSurface()!==surface)return;setControllerUiFocus(tabs[next]);});
  return true;
}
function handleControllerUiNavigation(pressed){
  const surface=controllerUiSurface();if(!surface){clearControllerUiFocus();resetControllerUiAxis();return false;}const focus=ensureControllerUiFocus();
  if(controllerUiAdjusting&&(controllerUiAdjusting.el!==focus||controllerUiEditing!==focus||!controllerEditAdjustHeld()))finishControllerUiAdjustment();
  if(gameTextEditorTarget){
    if(pressed[GAMEPAD_BUTTON.X]){backspaceGameText();return true;}
    if(pressed[GAMEPAD_BUTTON.Y]){if(gameTextMode()!=='code')appendGameTextChar(' ');return true;}
    if(pressed[GAMEPAD_BUTTON.RS]){if(gameTextMode()!=='code'){gameTextEditorShift=!gameTextEditorShift;renderGameTextEditor();}return true;}
    if(pressed[GAMEPAD_BUTTON.MENU]){commitGameTextEditor();return true;}
  }else if(chatOpen){
    if(pressed[GAMEPAD_BUTTON.X]){backspaceChat();return true;}
    if(pressed[GAMEPAD_BUTTON.Y]){appendChatCharacter(' ');return true;}
    if(pressed[GAMEPAD_BUTTON.RS]){chatShift=!chatShift;renderChatDraft();return true;}
    if(pressed[GAMEPAD_BUTTON.MENU]){submitChat();return true;}
  }
  if(pressed[GAMEPAD_BUTTON.B]){
    if(lobbyQuitPromptOpen()){closeLobbyQuitConfirm();return true;}
    if(shell.connecting&&initialConnectionAttempt){cancelInitialConnection('Connection canceled.');return true;}
    if(controllerUiEditing){clearControllerUiEditing();return true;}
    finishControllerUiAdjustment();
    if(chatOpen){void dismissChat({restorePointer:false});return true;}
    if(gameTextEditorTarget){cancelGameTextEditor();return true;}
    if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return true;}
    if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return true;}
    if(shell.panel===SHELL_PANEL.LOADOUT){if(loadoutWorkspaceMode.match==='item'){const slot=loadoutFocusSlot.match,key=`match-${slot}`;if((slot==='primary'||slot==='secondary')&&loadoutWeaponPickerOpen.has(key)){loadoutWeaponPickerOpen.delete(key);renderAttachmentEditor('match',slot,loadoutDraftForSurface('match'));queueControllerUiFocus(`weapon-toggle:${key}`);return true;}if((slot==='primary'||slot==='secondary')&&loadoutAttachmentTrayOpen.has(key)){const activeSlot=loadoutAttachmentSlot[key];loadoutAttachmentTrayOpen.delete(key);clearLoadoutAttachmentComparisonBase(key);loadoutAttachmentSlot[key]='';renderAttachmentEditor('match',slot,loadoutDraftForSurface('match'));queueControllerUiFocus(`gunsmith:${key}:slot:${activeSlot}`);return true;}setLoadoutWorkspaceMode('match','class',{ensurePreview:false});return true;}if(loadoutWorkspaceMode.match==='class'){setLoadoutWorkspaceMode('match','classes',{ensurePreview:false});return true;}closeMatchLoadout();return true;}
    if(shell.inLobby&&loadoutWorkspaceMode.lobby!=='classes'&&document.querySelector('[data-lobby-side-tab="loadout"]')?.classList.contains('active')){if(loadoutWorkspaceMode.lobby==='item'){const slot=loadoutFocusSlot.lobby,key=`lobby-${slot}`;if((slot==='primary'||slot==='secondary')&&loadoutWeaponPickerOpen.has(key)){loadoutWeaponPickerOpen.delete(key);renderAttachmentEditor('lobby',slot,loadoutDraftForSurface('lobby'));queueControllerUiFocus(`weapon-toggle:${key}`);return true;}if((slot==='primary'||slot==='secondary')&&loadoutAttachmentTrayOpen.has(key)){const activeSlot=loadoutAttachmentSlot[key];loadoutAttachmentTrayOpen.delete(key);clearLoadoutAttachmentComparisonBase(key);loadoutAttachmentSlot[key]='';renderAttachmentEditor('lobby',slot,loadoutDraftForSurface('lobby'));queueControllerUiFocus(`gunsmith:${key}:slot:${activeSlot}`);return true;}}setLoadoutWorkspaceMode('lobby',loadoutWorkspaceMode.lobby==='item'?'class':'classes',{ensurePreview:false});return true;}
    if(shell.inLobby){openLobbyQuitConfirm();return true;}
    if(shell.paused){shell.resumeFromAlternateInput();clock?.getDelta();return true;}
  }
  if(pressed[GAMEPAD_BUTTON.LB]){clearControllerUiEditing();if(cycleControllerTabs(-1))return true;}
  if(pressed[GAMEPAD_BUTTON.RB]){clearControllerUiEditing();if(cycleControllerTabs(1))return true;}
  if(pressed[GAMEPAD_BUTTON.A]&&focus){
    finishControllerUiAdjustment();
    if(controllerEditableField(focus)){if(controllerUiEditing===focus)clearControllerUiEditing();else setControllerUiEditing(focus);return true;}
    if(focus.tagName==='BUTTON'||focus.dataset?.gameControl==='text'){focus.click();return true;}
    focus.focus?.();return true;
  }
  const nav=controllerUiDirection(pressed);
  if(nav){
    if(controllerUiEditing===focus){const dir=nav.dx?nav.dx:-nav.dy;if(dir)stepControllerField(focus,dir);return true;}
    finishControllerUiAdjustment();return moveControllerUiFocus(nav.dx,nav.dy);
  }
  return false;
}

function activeControllerLoadoutPreviewKey(){
  let surface='';
  if(shell.panel===SHELL_PANEL.LOADOUT&&loadoutWorkspaceMode.match==='item')surface='match';
  else if(shell.inLobby&&loadoutWorkspaceMode.lobby==='item'&&document.querySelector('[data-lobby-side-tab="loadout"]')?.classList.contains('active'))surface='lobby';
  if(!surface)return'';const slot=loadoutFocusSlot[surface];return slot==='primary'||slot==='secondary'?`${surface}-${slot}`:'';
}
function rotateLoadoutPreviewFromController(dt){
  const key=activeControllerLoadoutPreviewKey();if(!key)return false;const x=Number(gamepadFrame.lookX)||0;if(Math.abs(x)<.01)return false;const ctx=loadoutPreviewContexts.get(key);if(!ctx||ctx.adsPreview)return false;
  // Match touch-drag exactly: the stick produces horizontal drag distance and
  // the shared preview-angle path converts that distance into yaw rotation.
  return adjustLoadoutPreviewAngle(ctx,x*240*Math.max(0,Math.min(.10,Number(dt)||0)));
}

function controllerDisplayName(id){
  const raw=String(id||'Controller').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();
  return /xbox/i.test(raw)?'XBOX CONTROLLER':raw.slice(0,28).toUpperCase()||'CONTROLLER';
}
function cycleControllerUtility(){
  if(currentWeapon==='sniper'&&adsWanted){sniperZoomLevel=sniperZoomLevel===2?1:2;showToast(`SNIPER ${sniperZoomLevel===2?sniperHighZoomLabel():sniperLowZoomLabel()}`);return;}
  if(currentWeapon==='assault'){toggleFireMode();return;}
  switchWeapon(nextWeapon(currentWeapon));
}
function updateGamepadInput(dt){
  const previousConnected=!!gamepadFrame.connected;
  gamepadFrame=gamepadInput.poll();
  const key=gamepadFrame.connected?`${gamepadFrame.index}:${gamepadFrame.id}`:'';
  if(gamepadFrame.connected&&key!==lastGamepadKey){
    lastGamepadKey=key;setActiveInputMode(INPUT_MODE.CONTROLLER,{quiet:true});
    if(shell.inMatch)showToast(`${controllerDisplayName(gamepadFrame.id)} CONNECTED`);
  }else if(!gamepadFrame.connected&&previousConnected){
    lastGamepadKey='';
    if(activeInputMode===INPUT_MODE.CONTROLLER){clearControllerGameplayInput();setActiveInputMode(isTouch?INPUT_MODE.TOUCH:INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});if(shell.inMatch)showToast('CONTROLLER DISCONNECTED');}
  }else if(gamepadFrame.connected&&gamepadFrame.meaningful&&activeInputMode!==INPUT_MODE.CONTROLLER)setActiveInputMode(INPUT_MODE.CONTROLLER,{quiet:true});
  if(!controllerInputActive())return;

  const pressed=gamepadFrame.pressed,released=gamepadFrame.released,buttons=gamepadFrame.buttons;
  if(chatOpen){
    clearControllerGameplayInput();
    handleControllerUiNavigation(pressed);
    if(chatPanel?.maxScroll>0&&Math.abs(gamepadFrame.lookY)>.18){chatScroll=Math.max(0,Math.min(chatPanel.maxScroll,chatScroll-gamepadFrame.lookY*9*dt));hudLastDraw=0;}
    return;
  }
  if(shell.inMatch&&pressed[GAMEPAD_BUTTON.MENU]){
    clearFireInput();cancelEquipmentAction();
    if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return;}
    if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return;}
    if(shell.panel===SHELL_PANEL.LOADOUT){closeMatchLoadout();return;}
    if(shell.paused){if(shell.resumeFromAlternateInput()){clock?.getDelta();return;}showToast('RETURN TO GAME VIEW');return;}
    openPause();return;
  }
  if(!shell.canPlay){gamepadFireDown=false;endRecoilBurst();resetControllerAimMotion();if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}rotateLoadoutPreviewFromController(dt);handleControllerUiNavigation(pressed);return;}
  if(pressed[GAMEPAD_BUTTON.VIEW]){scoreboardOpen=true;scoreboardScroll=0;clearFireInput();cancelEquipmentAction();}
  if(released[GAMEPAD_BUTTON.VIEW])scoreboardOpen=false;
  if(scoreboardOpen&&scoreboardPanel&&Math.abs(gamepadFrame.lookY)>.02)scoreboardScroll=Math.max(0,Math.min(scoreboardPanel.maxScroll,scoreboardScroll+gamepadFrame.lookY*620*dt));
  if(!matchAllowsMovement(matchState)){clearControllerGameplayInput();clearControllerUiFocus();return;}
  clearControllerUiFocus();
  if(hp<=0&&pressed[GAMEPAD_BUTTON.Y]){openMatchLoadout();return;}
  // Gameplay controller contract: LS owns sprint exclusively. D-pad is kept
  // free of weapon-swap duplicates; Down is the single chat shortcut.
  if(hp>0&&pressed[GAMEPAD_BUTTON.LS])toggleSprint();
  if(hp>0&&pressed[GAMEPAD_BUTTON.DPAD_DOWN]){openChat();return;}

  if(scoreboardOpen){gamepadFireDown=buttons[GAMEPAD_BUTTON.RT]>=CONTROLLER_TRIGGER_THRESHOLD;resetControllerAimMotion();return;}

  if(currentWeapon==='akimbo1887'){
    if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}
    if(pressed[GAMEPAD_BUTTON.LT])requestShot('left');
    if(pressed[GAMEPAD_BUTTON.RT])requestShot('right');
    gamepadFireDown=false;
  }else{
    const adsHeld=buttons[GAMEPAD_BUTTON.LT]>=CONTROLLER_TRIGGER_THRESHOLD;
    if(adsHeld){controllerOwnsAim=true;if(!adsWanted)setAim(true);}else if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}
    const rtValue=buttons[GAMEPAD_BUTTON.RT]||0,fireHeld=gamepadFireDown?rtValue>=CONTROLLER_TRIGGER_RELEASE_THRESHOLD:rtValue>=CONTROLLER_TRIGGER_THRESHOLD;
    if(fireHeld&&!gamepadFireDown){gamepadFireDown=true;requestShot();}
    else if(!fireHeld&&gamepadFireDown){gamepadFireDown=false;endRecoilBurstIfReleased();}
  }
  if(hp>0)applyControllerAim(dt);else resetControllerAimMotion();

  if(pressed[GAMEPAD_BUTTON.A])tryJump();
  if(pressed[GAMEPAD_BUTTON.B])toggleCrouch();
  if(pressed[GAMEPAD_BUTTON.X])doReload();
  if(pressed[GAMEPAD_BUTTON.Y])switchWeapon(nextWeapon(currentWeapon));
  if(pressed[GAMEPAD_BUTTON.LB])beginEquipmentAim(tacticalEquipment);
  if(pressed[GAMEPAD_BUTTON.RB])beginEquipmentAim(lethalEquipment);
  if(released[GAMEPAD_BUTTON.LB]&&equipmentAimKind()===tacticalEquipment)releaseEquipmentAim();
  if(released[GAMEPAD_BUTTON.RB]&&equipmentAimKind()===lethalEquipment)releaseEquipmentAim();
  if(pressed[GAMEPAD_BUTTON.RS])cycleControllerUtility();
}
function updateGameSimulation(dt){const now=performance.now();updateCombatAction(now);if(hp>0){updateCrouchState(dt);updateMovement(dt);updateFireControl(now);}}
function updateGameFrame(dt){
  const now=performance.now();updateCorrectionView(dt);updateAimRecoil(dt);
  const deathP=hp<=0?THREE.MathUtils.clamp((now-(deathAnimStartedAt||now))/700,0,1):0,deathEase=deathP*deathP*(3-2*deathP),viewY=updateViewVertical(dt),stanceEase=smoothstep01(crouchBlend),traversePose=traversal?traversalPose(traversal,now):null,traverseWave=traversePose?Math.sin(Math.PI*traversePose.progress):0;
  const stanceHeight=THREE.MathUtils.lerp(PLAYER_HEIGHT,CROUCH_HEIGHT,stanceEase);
  let cameraY=viewY+stanceHeight-.42*deathEase-slideViewBlend*.13;
  if(traversePose){
    // Traversal is a deterministic forced path. Prediction-correction offsets
    // from the previous free-movement frame must not shift the camera sideways
    // into a wall/window frame. Duck the first-person eye through the opening
    // and also respect the exact portal ceiling supplied by collision geometry.
    const duck=traversal?.role==='window'?0.24:traversal?.mode==='mantle'?0.15:0.11;
    cameraY-=duck*traverseWave;
    if(traversal?.viewMaxY!=null&&Number.isFinite(Number(traversal.viewMaxY)))cameraY=Math.min(cameraY,Number(traversal.viewMaxY));
  }
  const cameraCorrectionX=(traversal||ladderState)?0:correctionViewX,cameraCorrectionZ=(traversal||ladderState)?0:correctionViewZ;
  camera.position.set(position.x+cameraCorrectionX,cameraY,position.z+cameraCorrectionZ);const liveYaw=effectiveAimYaw(),deathYaw=Number.isFinite(deathViewTargetYaw)?deathViewStartYaw+normalizeAngle(deathViewTargetYaw-deathViewStartYaw)*deathEase:deathViewStartYaw;camera.rotation.y=hp<=0?deathYaw:liveYaw;const livePitch=effectiveAimPitch(),deathPitch=THREE.MathUtils.clamp(deathViewStartPitch+.10*deathEase,-1.40,1.40);camera.rotation.x=THREE.MathUtils.clamp((hp<=0?deathPitch:livePitch)-.045*traverseWave,-1.40,1.40);camera.rotation.z=.72*deathEase+(hp>0?explosionVisualRoll(now):0);
  maintainNetwork();
}
function updateMovement(dt){
  const now=performance.now();
  if(!matchAllowsMovement(matchState)){
    stopSlide();cancelSprint();traversal=null;ladderState=null;moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;onGround=true;lastGroundedAt=now;jumpBufferedUntil=0;traversalIntentUntil=0;localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,0,Math.min(1,dt*12));position.y=worldSupportHeight(position.x,position.z,position.y,false);return;
  }
  if(updateLadder(serverNow(),dt)){sendCurrentState();return;}
  if(updateTraversal(now)){localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,0,Math.min(1,dt*10));moveVelocityX=moveVelocityZ=0;return;}
  if(onGround)lastGroundedAt=now;
  updateLadderAttachLock(now);
  if(onGround&&tryAttachLadder()){sendCurrentState(true);return;}
  if((keys.has('Space')||touchRoleActive('jump')||(controllerInputActive()&&gamepadFrame.held[GAMEPAD_BUTTON.A]))&&traversalConsumedIntentSeq!==traversalIntentSeq)traversalIntentUntil=Math.max(traversalIntentUntil,now+110);
  const input=movementInput(),mx=input.mx,mz=input.mz,len=input.len,movement=worldSettings.movement;
  const sin=Math.sin(yaw),cos=Math.cos(yaw);updateSprintState(input);
  if(sliding){
    const elapsed=now-slideStartedAt,progress=Math.max(0,Math.min(1,elapsed/Math.max(1,SLIDE_DURATION_MS)));
    if(!onGround||elapsed>=SLIDE_DURATION_MS){stopSlide({recover:onGround});}
    else{
      const desiredX=mx*cos+mz*sin,desiredZ=-mx*sin+mz*cos,desiredLen=Math.hypot(desiredX,desiredZ);
      if(desiredLen>.15){const nx=desiredX/desiredLen,nz=desiredZ/desiredLen,steer=Math.min(1,SLIDE_STEER*dt*60);slideDirX=slideDirX*(1-steer)+nx*steer;slideDirZ=slideDirZ*(1-steer)+nz*steer;const dl=Math.hypot(slideDirX,slideDirZ)||1;slideDirX/=dl;slideDirZ/=dl;}
      // Hold the burst briefly, then shed speed hard so a slide feels like a
      // committed movement action instead of crouch carrying sprint momentum.
      const decel=progress*progress,endSpeed=movement.runSpeed*SLIDE_END_SPEED_MULTIPLIER,slideSpeed=THREE.MathUtils.lerp(slideStartSpeed,endSpeed,decel);moveVelocityX=slideDirX*slideSpeed;moveVelocityZ=slideDirZ*slideSpeed;
    }
  }
  if(!sliding){
    const recovering=now<slideRecoveryUntil,adsMove=smoothstep01(adsBlend),adsMoveSpeedScale=Math.max(.5,Math.min(1,Number(effectiveWeaponSpec(currentWeapon)?.adsMoveSpeedScale)||1)),baseMoveSpeed=THREE.MathUtils.lerp(movement.runSpeed,movement.walkSpeed*adsMoveSpeedScale,adsMove),targetSpeed=recovering?0:baseMoveSpeed*(sprinting?SPRINT_SPEED_MULTIPLIER:1)*(crouched?CROUCH_SPEED_MULTIPLIER:1),targetX=recovering?0:(mx*cos+mz*sin)*targetSpeed,targetZ=recovering?0:(-mx*sin+mz*cos)*targetSpeed;
    if(onGround){const accel=recovering?GROUND_BRAKING*1.45:(len>.04?GROUND_ACCELERATION:GROUND_BRAKING),next=approachVector(moveVelocityX,moveVelocityZ,targetX,targetZ,accel*dt);moveVelocityX=next.x;moveVelocityZ=next.z;}
    else if(len>.04){const next=approachVector(moveVelocityX,moveVelocityZ,targetX,targetZ,AIR_ACCELERATION*dt);moveVelocityX=next.x;moveVelocityZ=next.z;const airSpeed=Math.hypot(moveVelocityX,moveVelocityZ),airCap=movement.runSpeed;if(airSpeed>airCap){moveVelocityX=moveVelocityX/airSpeed*airCap;moveVelocityZ=moveVelocityZ/airSpeed*airCap;}}
  }
  const knock=advanceKnockback(knockX,knockZ,dt),dx=moveVelocityX*dt+knock.dx,dz=moveVelocityZ*dt+knock.dz,startX=position.x,startZ=position.z;
  knockX=knock.xVelocity;knockZ=knock.zVelocity;
  // Collision resolution already removes the blocked displacement and slides
  // the capsule along the free axis. Do not damp the full velocity merely
  // because one contact occurred: that made continuous wall contact destroy
  // tangential speed every simulation step and could reduce a run to a crawl.
  const horizontalMove=moveHorizontal(dx,dz);
  const moved=Math.hypot(position.x-startX,position.z-startZ),wasGround=onGround,previousY=position.y;
  const verticalStep=advanceVerticalMotion(previousY,verticalVelocity,movement.gravity,dt);
  const vertical=resolveCeilingCollision(previousY,verticalStep.y,position.x,position.z,currentPlayerHeight());position.y=vertical.y;verticalVelocity=verticalStep.velocity;if(vertical.hit&&verticalVelocity>0)verticalVelocity=0;const ground=worldSupportHeight(position.x,position.z,position.y);
  if(position.y<=ground||(wasGround&&verticalVelocity<=0&&position.y<ground+.3)){
    const landingSpeed=!wasGround?Math.max(0,-verticalVelocity):0;
    position.y=ground;verticalVelocity=0;onGround=true;lastGroundedAt=now;
    if(!wasGround){landingKick=1;nextFootstepAt=now+120;if(landingSpeed>2.4)soundLanding(THREE.MathUtils.clamp((landingSpeed-2.4)/8,.28,.82));}
    if(jumpBufferedUntil>now){startPlayerJump(now,{allowTraversal:false});return;}
  }else onGround=false;
  if(jumpBufferedUntil&&jumpBufferedUntil<=now)jumpBufferedUntil=0;
  if(horizontalMove?.blocked&&traversalConsumedIntentSeq!==traversalIntentSeq&&now<traversalIntentUntil&&tryTraversal())return;
  const planarSpeed=Math.hypot(moveVelocityX,moveVelocityZ),moveRatio=THREE.MathUtils.clamp(planarSpeed/Math.max(.1,movement.runSpeed),0,1);localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,moved>0.0005?moveRatio:0,Math.min(1,dt*12));
  const walking=onGround&&hp>0&&planarSpeed>.35&&moved>.0005;
  if(walking){
    const pace=THREE.MathUtils.lerp(530,310,moveRatio);
    if(now>=nextFootstepAt){soundFootstep(footstepSide,THREE.MathUtils.lerp(.22,.38,moveRatio));footstepSide^=1;nextFootstepAt=now+pace;}
  }else if(!onGround||planarSpeed<=.25)nextFootstepAt=Math.max(nextFootstepAt,now+90);
}

function remoteActorBlocked(x,z,y,fromX,fromZ,playerHeight=currentPlayerHeight()){
  for(const r of remotes.values()){
    if(!r||Number(r.hp)<=0)continue;
    const actor=r.target||r.group?.position;if(!actor)continue;
    const ax=Number(actor.x),ay=Number(actor.y),az=Number(actor.z);if(!Number.isFinite(ax)||!Number.isFinite(ay)||!Number.isFinite(az))continue;
    const actorHeight=r.crouched?CROUCH_HEIGHT:PLAYER_HEIGHT;
    if(y+playerHeight-.08<=ay||y>=ay+actorHeight-.08)continue;
    const minDist=PLAYER_RADIUS*2+.02,newDist=Math.hypot(x-ax,z-az),oldDist=Math.hypot(fromX-ax,fromZ-az);
    if(newDist<minDist&&(oldDist>=minDist||newDist<oldDist-.002))return true;
  }
  return false;
}

function moveHorizontal(dx,dz){
  const next=sweepHorizontalMovement({
    x:position.x,y:position.y,z:position.z,dx,dz,grounded:onGround,arenaLimit:ARENA_LIMIT,followDrop:GROUND_FOLLOW_DROP,
    supportHeight:(x,z,y)=>worldSupportHeight(x,z,y,crouched),
    stepUpHeight:(x,z,y,maxStep)=>worldStepUpHeight(x,z,y,maxStep,PLAYER_RADIUS),maxStepHeight:MAX_STEP_HEIGHT,
    blockedAt:(x,z,y,fromX,fromZ,fromY)=>worldMoveBlockedAt(x,z,y,fromX,fromZ,currentPlayerHeight(),PLAYER_RADIUS,fromY)||remoteActorBlocked(x,z,y,fromX,fromZ),
  });
  position.set(next.x,next.y,next.z);onGround=next.grounded;return next;
}
function blocked(x,z,y=position?.y??terrainHeight(x,z),playerHeight=currentPlayerHeight()){return worldBlockedAt(x,z,y,playerHeight,PLAYER_RADIUS);}
function round3(n){return Math.round(n*1000)/1000;}
function round4(n){return Math.round(n*10000)/10000;}

function updateRemoteVisuals(dt){
  const now=performance.now(),srv=serverNow(),remoteDelay=currentRemoteViewDelayMs(),remoteRenderAt=srv-remoteDelay,remoteTraversalNow=now-remoteDelay;
  for(const [id] of remotes){if(samePlayerId(id,clientId))removeRemote(id);}
  for(const r of remotes.values()){
    const traversalPoseNow=r.traversal?traversalPose(r.traversal,remoteTraversalNow):null;if(r.traversal&&traversalPoseNow?.done)r.traversal=null;const traversing=!!traversalPoseNow&&!traversalPoseNow.done,laddering=!!r.ladder,rendered=traversing?traversalPoseNow:remoteSnapshotAt(r,remoteRenderAt);
    if(rendered){r.group.position.set(rendered.x,rendered.y,rendered.z);if(Number.isFinite(Number(rendered.yaw)))r.group.rotation.y=Number(rendered.yaw);if(typeof rendered.ads==='boolean')r.ads=rendered.ads;if(typeof rendered.crouched==='boolean')r.crouched=rendered.crouched;if(typeof rendered.sprinting==='boolean')r.sprinting=rendered.sprinting;if(typeof rendered.sliding==='boolean')r.sliding=rendered.sliding;r.airborne=traversing||laddering||rendered.y>worldSupportHeight(rendered.x,rendered.z,rendered.y)+.08;}
    const dead=r.hp<=0;r.deathPose=THREE.MathUtils.lerp(r.deathPose,dead?1:0,Math.min(1,dt*(dead?5.5:12)));const dp=r.deathPose*r.deathPose*(3-2*r.deathPose);r.model.rotation.z=1.34*dp;r.model.rotation.x=.10*dp;r.model.position.y=-.18*dp;if(r.tag)r.tag.visible=!dead&&(modeFriendly(r.team)||samePlayerId(r.id,aimedRemoteId));
    if(!dead){
      r.crouchBlend=THREE.MathUtils.lerp(r.crouchBlend,r.crouched?1:0,Math.min(1,dt*12));r.sprintBlend=THREE.MathUtils.lerp(r.sprintBlend||0,r.sprinting?1:0,Math.min(1,dt*14));r.slideBlend=THREE.MathUtils.lerp(r.slideBlend||0,r.sliding?1:0,Math.min(1,dt*16));r.model.scale.y=THREE.MathUtils.lerp(1,CROUCH_HEIGHT/PLAYER_HEIGHT,r.crouchBlend);r.model.rotation.x=.10*dp+r.slideBlend*.17;if(r.tag)r.tag.position.y=THREE.MathUtils.lerp(2.18,1.48,r.crouchBlend);
      const move=THREE.MathUtils.clamp(r.moveSpeed/(worldSettings.movement.runSpeed*.75),0,1),running=move>.08&&!r.airborne&&!traversing&&!laddering;r.animPhase+=dt*(running?5.5+move*6+(r.sprintBlend||0)*2.2:1.8);const swing=running?Math.sin(r.animPhase)*.68*move*(1+(r.sprintBlend||0)*.18):Math.sin(r.animPhase)*.035;
      if(running&&now>=r.nextFootstepAt){playSpatialCue(r.footstepSide?'footstepRight':'footstepLeft',r.group.position.x,r.group.position.y,r.group.position.z,30,.48);r.footstepSide^=1;r.nextFootstepAt=now+THREE.MathUtils.lerp(540,315,move);}else if(!running)r.nextFootstepAt=Math.max(r.nextFootstepAt,now+120);
      r.legL.rotation.x=r.airborne?-.34:swing;r.legR.rotation.x=r.airborne?.34:-swing;r.armL.rotation.x=r.airborne?.28:-swing*.72;r.armR.rotation.x=r.airborne?-.20:swing*.52;r.armL.rotation.z=-.12;r.armR.rotation.z=.12;if(r.weapon==='akimbo1887'){r.armL.rotation.x=-1.05;r.armR.rotation.x=-1.05;r.armL.rotation.z=-.20;r.armR.rotation.z=.20;}
      if(traversing){const p=traversalPoseNow.progress,wave=Math.sin(Math.PI*p);r.armL.rotation.x=-1.55-wave*.35;r.armR.rotation.x=-1.55-wave*.35;r.armL.rotation.z=-.24;r.armR.rotation.z=.24;r.legL.rotation.x=.48*wave;r.legR.rotation.x=-.30*wave;r.body.rotation.x=-.18*wave;r.head.rotation.x=.08*wave;}if(laddering){const phase=(now*.010)% (Math.PI*2),wave=Math.sin(phase);r.armL.rotation.x=-1.35+wave*.34;r.armR.rotation.x=-1.35-wave*.34;r.armL.rotation.z=-.20;r.armR.rotation.z=.20;r.legL.rotation.x=-wave*.42;r.legR.rotation.x=wave*.42;r.body.rotation.x=-.08;r.head.rotation.x=.03;}
      const reloadActive=r.reloadUntil>srv;if(!reloadActive){r.reloadUntil=0;r.reloadStartedAt=0;}const total=weaponRules(r.reloadWeapon||r.weapon)?.reloadMs||650,reloadP=reloadActive?THREE.MathUtils.clamp((srv-(r.reloadStartedAt||srv))/Math.max(1,total),0,1):0,reloadCurve=Math.sin(Math.PI*reloadP);const swapP=r.swapStartedAt?THREE.MathUtils.clamp((now-r.swapStartedAt)/Math.max(1,WEAPON_SWITCH_MS),0,1):1,swapCurve=swapP<1?Math.sin(Math.PI*swapP):0;if(swapP>=1)r.swapStartedAt=0;const kick=now<r.fireKickUntil?Math.sin(Math.PI*THREE.MathUtils.clamp((r.fireKickUntil-now)/170,0,1))*.31:0;
      r.armR.rotation.x+=reloadCurve*.95+kick*1.18;r.armR.rotation.z=.12-reloadCurve*.28+kick*.10;const lower=reloadCurve*.24+swapCurve*.34+(r.sprintBlend||0)*.18+(r.slideBlend||0)*.12+(traversing?Math.sin(Math.PI*traversalPoseNow.progress)*.34:0)+(laddering ? .32 : 0);
      r.pistol.position.set(.45,1.08-lower+kick*.06,-.25+kick*.31);if(r.akimbo1887){r.akimbo1887.position.y=-lower+kick*.04;r.akimbo1887.position.z=kick*.22;if(r.akimboLeft&&r.akimboRight&&r.akimboCycleStartedAt){const lc=akimbo1887CycleState(r.akimboCycleStartedAt.left,now,'left'),rc=akimbo1887CycleState(r.akimboCycleStartedAt.right,now,'right');r.akimboLeft.rotation.set(-.08+lc.spin,.14,-.03);r.akimboRight.rotation.set(-.08+rc.spin,-.14,.03);}}r.assault.position.set(.45,1.09-lower+kick*.07,-.38+kick*.38);r.ump.position.set(.45,1.08-lower+kick*.06,-.34+kick*.34);r.machineGun.position.set(.45,1.08-lower+kick*.08,-.42+kick*.42);r.shotgun.position.set(.45,1.10-lower+kick*.09,-.41+kick*.42);r.semiShotgun.position.set(.45,1.10-lower+kick*.08,-.40+kick*.39);r.sniper.position.set(.45,1.10-lower+kick*.10,-.45+kick*.45);r.grenadeLauncher.position.set(.45,1.08-lower+kick*.09,-.40+kick*.46);r.rpg.position.set(.38,1.42-lower*.82+kick*.10,-.43+kick*.48);for(const gun of [r.pistol,r.akimbo1887,r.assault,r.ump,r.machineGun,r.shotgun,r.semiShotgun,r.sniper,r.grenadeLauncher,r.rpg])gun.rotation.z=-reloadCurve*.35-swapCurve*.35+kick*.08;
      if(!traversing&&!laddering){r.body.rotation.x=r.airborne?-.08:running?Math.sin(r.animPhase*2)*.025:Math.sin(r.animPhase)*.012;r.head.rotation.x=r.ads?-.045:0;}
    }
    if(r.godRing?.visible){r.godRing.rotation.z+=dt*1.8;r.godRing.material.opacity=.66+.24*Math.sin(now*.004+r.group.position.x);}
  }
  updateAimNameplates(now);
}
function updateAimNameplates(now=performance.now()){
  if(!THREE||!camera||!worldRoot||!matchAllowsMovement(matchState)||hp<=0){aimedRemoteId='';for(const r of remotes.values())if(r.tag)r.tag.visible=r.hp>0&&modeFriendly(r.team);return;}
  if(now<nextAimTagCheckAt)return;nextAimTagCheckAt=now+70;if(!aimTagRaycaster)aimTagRaycaster=new THREE.Raycaster();
  const targets=[worldRoot];for(const r of remotes.values())if(r.hp>0)targets.push(r.model);aimTagRaycaster.setFromCamera({x:0,y:0},camera);aimTagRaycaster.near=.05;aimTagRaycaster.far=180;
  let hitId='';for(const hit of aimTagRaycaster.intersectObjects(targets,true)){let o=hit.object,remoteId='';while(o){if(o.userData?.remoteId){remoteId=String(o.userData.remoteId);break;}if(o===worldRoot)break;o=o.parent;}if(remoteId){const r=Array.from(remotes.values()).find(item=>samePlayerId(item.id,remoteId));if(r&&r.hp>0&&!modeFriendly(r.team))hitId=String(r.id);break;}break;}
  aimedRemoteId=hitId;for(const r of remotes.values())if(r.tag)r.tag.visible=r.hp>0&&(modeFriendly(r.team)||samePlayerId(r.id,aimedRemoteId));
}

function updateAim(dt){
  const target=adsWanted&&hp>0&&shell.canPlay?1:0,spec=effectiveWeaponSpec(currentWeapon),transitionMs=Math.max(60,Number(target?spec.adsInMs:spec.adsOutMs)||180),seconds=Math.max(.060,transitionMs/1000),frameDt=Math.max(0,Number(dt)||0);
  if(currentWeapon==='sniper')adsBlend=THREE.MathUtils.clamp(adsBlend+(target?1:-1)*(frameDt/seconds),0,1);
  else{const rate=4.605170186/seconds,follow=1-Math.exp(-rate*frameDt);adsBlend+=(target-adsBlend)*follow;if(Math.abs(target-adsBlend)<.002)adsBlend=target;}
  if(currentWeapon==='sniper'){
    const desiredFov=THREE.MathUtils.lerp(baseFov,sniperTargetFov(),sniperZoomAmount()),fovFollow=1-Math.exp(-18*Math.max(0,Number(dt)||0)),fov=camera.fov+(desiredFov-camera.fov)*fovFollow;
    if(Math.abs(camera.fov-fov)>.03){camera.fov=fov;camera.updateProjectionMatrix();}
  }else{
    const eased=adsBlend*adsBlend*(3-2*adsBlend),fov=THREE.MathUtils.lerp(baseFov,spec.adsFov,eased);
    if(Math.abs(camera.fov-fov)>.03){camera.fov=fov;camera.updateProjectionMatrix();}
  }
}
function akimbo1887CycleState(startedAt,now,side){
  if(!startedAt||now<startedAt)return{active:false,p:1,kick:0,spin:0,lever:0,lift:0};
  const p=THREE.MathUtils.clamp((now-startedAt)/AKIMBO_1887_CYCLE_MS,0,1);
  if(p>=1)return{active:false,p:1,kick:0,spin:0,lever:0,lift:0};
  const kickP=THREE.MathUtils.clamp(p/.17,0,1),spinP=smoothstep01((p-.09)/.73),actionP=THREE.MathUtils.clamp((p-.06)/.55,0,1);
  return{active:true,p,kick:Math.sin(Math.PI*kickP),spin:Math.PI*2*spinP,lever:Math.sin(Math.PI*actionP)*1.02,lift:Math.sin(Math.PI*spinP)*.065};
}
function updateWeaponView(dt){
  const now=performance.now();
  sprintViewBlend=expFollow(sprintViewBlend,sprinting?1:0,13,Math.max(.001,dt));slideViewBlend=expFollow(slideViewBlend,sliding?1:0,16,Math.max(.001,dt));
  const kickAds=smoothstep01(adsBlend),sightLock=weaponUsesIronSights(currentWeapon)?kickAds:0;updateWeaponKick(dt);
  // Keep the fore/aft recoil the user can feel, but do not throw the iron sight
  // sideways or rotate it away from the authoritative camera/bullet ray.
  const kickProfile=weaponVisualKickProfile(currentWeapon),kickZ=weaponKickZ*kickProfile.rear*THREE.MathUtils.lerp(1,kickProfile.adsRear,kickAds),kickLift=weaponKickZ*kickProfile.lift*THREE.MathUtils.lerp(1,0,sightLock),kickStep=Math.max(0,localRecoilStep[currentWeapon]??0),kickSeq=Math.max(0,localWeaponShotSequence[currentWeapon]||0),kickSide=Math.sin((kickStep+kickSeq*.73+1)*1.91+WEAPON_ORDER.indexOf(currentWeapon)*.73),kickPitch=weaponKickZ*kickProfile.pitch*THREE.MathUtils.lerp(1,0,sightLock),kickYaw=weaponKickZ*kickSide*kickProfile.yaw*THREE.MathUtils.lerp(1,0,sightLock),kickRoll=weaponKickZ*kickSide*kickProfile.roll*THREE.MathUtils.lerp(1,0,sightLock),actionPulse=weaponActionPulse(currentWeapon,now);
  const moving=hp>0&&onGround?THREE.MathUtils.clamp(localMoveAmount,0,1):0;if(moving>.03)moveBobPhase+=dt*THREE.MathUtils.lerp(11.5,7.5,kickAds)*(0.55+moving*.65);else moveBobPhase+=dt*1.8;
  landingKick=Math.max(0,landingKick-dt*4.2);const bobScale=moving*THREE.MathUtils.lerp(1,.015,sightLock),bobX=Math.sin(moveBobPhase)*.018*bobScale,bobY=Math.abs(Math.cos(moveBobPhase))*-.016*bobScale;
  const jumpSpeed=Math.sqrt(2*worldSettings.movement.gravity*worldSettings.movement.jumpHeight),jumpNorm=onGround?0:THREE.MathUtils.clamp(verticalVelocity/Math.max(.1,jumpSpeed),-1,1),sightMotion=1-sightLock*.94,jumpY=(onGround?0:(jumpNorm>0?-.035:.025))*sightMotion,landY=-Math.sin(landingKick*Math.PI)*.055*sightMotion;
  const reloadW=reloadWeapon||currentWeapon,reloading=!!reloadUntil&&reloadW===currentWeapon;let reloadP=0,reloadCurve=0;
  if(reloading){const total=weaponRules(reloadW).reloadMs;const start=reloadStartedAt||reloadUntil-total;reloadP=THREE.MathUtils.clamp((serverNow()-start)/Math.max(1,total),0,1);reloadCurve=Math.sin(Math.PI*reloadP);}
  const swapP=weaponSwapStartedAt?THREE.MathUtils.clamp((now-weaponSwapStartedAt)/Math.max(1,WEAPON_SWITCH_MS),0,1):1,swapCurve=swapP<1?Math.sin(Math.PI*swapP):0;if(swapP>=1)weaponSwapStartedAt=0;
  const deathP=hp<=0?THREE.MathUtils.clamp((now-(deathAnimStartedAt||now))/650,0,1):0,deathEase=deathP*deathP*(3-2*deathP);
  const traversePoseNow=traversal?traversalPose(traversal,now):null,traverseP=traversePoseNow?traversePoseNow.progress:0,traverseCurve=traversePoseNow?Math.sin(Math.PI*traverseP):0;
  const equipmentLower=equipmentWeaponLower(now),mobilityLower=sprintViewBlend*(1-kickAds),slideLower=slideViewBlend*(1-kickAds*.35),idle=Math.sin(now*.0018)*.0035*THREE.MathUtils.lerp(1,.25,kickAds)*(1-sightLock*.94),commonX=bobX+mobilityLower*.10+slideLower*.035+equipmentLower*.035,commonY=bobY+jumpY+landY+idle+kickLift-reloadCurve*.19-swapCurve*.36-deathEase*.55-traverseCurve*.42-mobilityLower*.19-slideLower*.08-equipmentLower*.30,commonZ=reloadCurve*.08+swapCurve*.10+deathEase*.18+traverseCurve*.16+mobilityLower*.13+slideLower*.055+equipmentLower*.07;
  const reloadRoll=reloadCurve*(currentWeapon==='sniper'?.22:.48),swapRoll=swapCurve*.42,deathRoll=deathEase*.58,mobilityRoll=mobilityLower*.46+slideLower*.16+equipmentLower*.10;
  const a=kickAds,ironCommonX=commonX*(1-sightLock),ironCommonY=commonY*(1-sightLock);
  const sightPose=(group,weapon,fallback)=>{const mods=attachmentsForWeapon(weapon),opticId=String(mods?.optic||''),opticPose=opticId?group?.userData?.attachmentVisuals?.[opticId]?.userData?.adsPose:null;return opticPose?opticPose:(group.userData.adsPose||fallback);},pistolPose=sightPose(pistolGroup,'pistol',{x:0,y:-.14,z:-.54,rx:0,ry:0,rz:0}),assaultPose=sightPose(assaultGroup,'assault',{x:0,y:-.165,z:-.45,rx:0,ry:0,rz:0}),umpPose=sightPose(umpGroup,'ump',{x:0,y:-.155,z:-.46,rx:0,ry:0,rz:0}),machineGunPose=sightPose(machineGunGroup,'machineGun',{x:0,y:-.178,z:-.46,rx:0,ry:0,rz:0}),shotgunPose=sightPose(shotgunGroup,'shotgun',{x:0,y:-.116,z:-.44,rx:0,ry:0,rz:0}),semiShotgunPose=sightPose(semiShotgunGroup,'semiShotgun',{x:0,y:-.118,z:-.44,rx:0,ry:0,rz:0}),rpgPose=sightPose(rpgGroup,'rpg',{x:0,y:-.145,z:-.49,rx:0,ry:0,rz:0});
  pistolGroup.position.set(THREE.MathUtils.lerp(.33,pistolPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.25,pistolPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.67,pistolPose.z,a)+kickZ+commonZ);pistolGroup.rotation.set(THREE.MathUtils.lerp(-.08,pistolPose.rx,a)+reloadCurve*.18+kickPitch,THREE.MathUtils.lerp(-.08,pistolPose.ry,a)-reloadCurve*.18+kickYaw,THREE.MathUtils.lerp(0,pistolPose.rz,a)-reloadRoll-swapRoll-deathRoll-mobilityRoll+kickRoll);
  if(akimboLeftGroup&&akimboRightGroup){
    const left=akimbo1887CycleState(akimboLeftCycleStartedAt,now,'left'),right=akimbo1887CycleState(akimboRightCycleStartedAt,now,'right'),akReload=reloading&&currentWeapon==='akimbo1887'?reloadCurve:0;
    if(left.active&&left.p>=.28&&!akimboCycleSoundPlayed.left){akimboCycleSoundPlayed.left=true;playSoundCue('action1887',.90,{playbackRate:.99+Math.random()*.02,pan:-.42});}
    if(right.active&&right.p>=.28&&!akimboCycleSoundPlayed.right){akimboCycleSoundPlayed.right=true;playSoundCue('action1887',.90,{playbackRate:.99+Math.random()*.02,pan:.42});}
    akimboLeftGroup.position.set(-.40+commonX*.42,-.32+commonY*.50-akReload*.18+left.lift,-.72+commonZ+left.kick*.18);
    akimboRightGroup.position.set(.40+commonX*.42,-.32+commonY*.50-akReload*.18+right.lift,-.72+commonZ+right.kick*.18);
    akimboLeftGroup.rotation.set(-.08+left.spin+akReload*.18,.18,-.035-akReload*.24);
    akimboRightGroup.rotation.set(-.08+right.spin+akReload*.18,-.18,.035+akReload*.24);
    if(akimboLeftLever)akimboLeftLever.rotation.x=Math.PI/2+left.lever;
    if(akimboRightLever)akimboRightLever.rotation.x=Math.PI/2+right.lever;
  }
  assaultGroup.position.set(THREE.MathUtils.lerp(.30,assaultPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.27,assaultPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.52,assaultPose.z,a)+kickZ+commonZ);assaultGroup.rotation.set(THREE.MathUtils.lerp(-.06,assaultPose.rx,a)+reloadCurve*.16+kickPitch,THREE.MathUtils.lerp(-.055,assaultPose.ry,a)-reloadCurve*.14+kickYaw,THREE.MathUtils.lerp(0,assaultPose.rz,a)-reloadRoll-swapRoll-deathRoll-mobilityRoll+kickRoll);
  umpGroup.position.set(THREE.MathUtils.lerp(.30,umpPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.27,umpPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.54,umpPose.z,a)+kickZ+commonZ);umpGroup.rotation.set(THREE.MathUtils.lerp(-.06,umpPose.rx,a)+reloadCurve*.16+kickPitch,THREE.MathUtils.lerp(-.05,umpPose.ry,a)-reloadCurve*.14+kickYaw,THREE.MathUtils.lerp(0,umpPose.rz,a)-reloadRoll-swapRoll-deathRoll-mobilityRoll+kickRoll);
  machineGunGroup.position.set(THREE.MathUtils.lerp(.30,machineGunPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.29,machineGunPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.55,machineGunPose.z,a)+kickZ+commonZ);machineGunGroup.rotation.set(THREE.MathUtils.lerp(-.06,machineGunPose.rx,a)+reloadCurve*.18+kickPitch,THREE.MathUtils.lerp(-.05,machineGunPose.ry,a)-reloadCurve*.15+kickYaw,THREE.MathUtils.lerp(0,machineGunPose.rz,a)-reloadRoll-swapRoll-deathRoll-mobilityRoll+kickRoll);
  shotgunGroup.position.set(THREE.MathUtils.lerp(.30,shotgunPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.28,shotgunPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.50,shotgunPose.z,a)+kickZ+commonZ);shotgunGroup.rotation.set(THREE.MathUtils.lerp(-.06,shotgunPose.rx,a)+reloadCurve*.14+kickPitch,THREE.MathUtils.lerp(-.05,shotgunPose.ry,a)-reloadCurve*.12+kickYaw,THREE.MathUtils.lerp(0,shotgunPose.rz,a)-reloadRoll*.8-swapRoll-deathRoll-mobilityRoll+kickRoll);
  semiShotgunGroup.position.set(THREE.MathUtils.lerp(.30,semiShotgunPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.28,semiShotgunPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.50,semiShotgunPose.z,a)+kickZ+commonZ);semiShotgunGroup.rotation.set(THREE.MathUtils.lerp(-.06,semiShotgunPose.rx,a)+reloadCurve*.14+kickPitch,THREE.MathUtils.lerp(-.05,semiShotgunPose.ry,a)-reloadCurve*.12+kickYaw,THREE.MathUtils.lerp(0,semiShotgunPose.rz,a)-reloadRoll*.8-swapRoll-deathRoll-mobilityRoll+kickRoll);
  const sniperPose=sniperAdsPose(),sniperCenter=sniperCenterAmount(),sniperEye=sniperEyeAmount();sniperGroup.position.set(THREE.MathUtils.lerp(.28,sniperPose.x,sniperCenter)+commonX*(1-sniperCenter),THREE.MathUtils.lerp(-.28,sniperPose.y,sniperCenter)+commonY*(1-sniperCenter),THREE.MathUtils.lerp(-.48,sniperPose.z,sniperEye)+kickZ+commonZ*(1-sniperCenter));sniperGroup.rotation.set(THREE.MathUtils.lerp(-.055,sniperPose.rx,sniperCenter)+reloadCurve*.10*(1-sniperCenter)+kickPitch,THREE.MathUtils.lerp(-.05,sniperPose.ry,sniperCenter)-reloadCurve*.12*(1-sniperCenter)+kickYaw,THREE.MathUtils.lerp(0,sniperPose.rz,sniperCenter)-reloadRoll*.65*(1-sniperCenter)-swapRoll*(1-sniperCenter)-deathRoll*(1-sniperCenter)-mobilityRoll*(1-sniperCenter)+kickRoll);
  grenadeLauncherGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.20,a)+commonY,THREE.MathUtils.lerp(-.48,-.42,a)+kickZ+commonZ);grenadeLauncherGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+GRENADE_LAUNCH_PITCH+reloadCurve*.13+kickPitch,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12+kickYaw,-reloadRoll*.75-swapRoll-deathRoll-mobilityRoll+kickRoll);
  rpgGroup.position.set(THREE.MathUtils.lerp(.34,rpgPose.x,a)+ironCommonX,THREE.MathUtils.lerp(-.16,rpgPose.y,a)+ironCommonY,THREE.MathUtils.lerp(-.46,rpgPose.z,a)+kickZ+commonZ);rpgGroup.rotation.set(THREE.MathUtils.lerp(-.025,rpgPose.rx,a)+reloadCurve*.11+kickPitch,THREE.MathUtils.lerp(-.07,rpgPose.ry,a)-reloadCurve*.10+kickYaw,THREE.MathUtils.lerp(.015,rpgPose.rz,a)-reloadRoll*.6-swapRoll-deathRoll-mobilityRoll+kickRoll);
  // Mechanical cycling is separate from recoil: slide/bolt motion gives the shot
  // visible life without changing the sight/bullet ray.
  if(pistolGroup.userData.cyclePart)pistolGroup.userData.cyclePart.position.z=pistolGroup.userData.cycleBaseZ+pistolGroup.userData.cycleTravel*(currentWeapon==='pistol'?actionPulse:0);
  if(assaultGroup.userData.cyclePart)assaultGroup.userData.cyclePart.position.z=assaultGroup.userData.cycleBaseZ+assaultGroup.userData.cycleTravel*(currentWeapon==='assault'?actionPulse:0);
  if(umpGroup.userData.cyclePart)umpGroup.userData.cyclePart.position.z=umpGroup.userData.cycleBaseZ+umpGroup.userData.cycleTravel*(currentWeapon==='ump'?actionPulse:0);
  if(machineGunGroup.userData.cyclePart)machineGunGroup.userData.cyclePart.position.z=machineGunGroup.userData.cycleBaseZ+machineGunGroup.userData.cycleTravel*(currentWeapon==='machineGun'?actionPulse:0);
  if(semiShotgunGroup.userData.cyclePart)semiShotgunGroup.userData.cyclePart.position.z=semiShotgunGroup.userData.cycleBaseZ+semiShotgunGroup.userData.cycleTravel*(currentWeapon==='semiShotgun'?actionPulse:0);
  if(sniperGroup.userData.cyclePart)sniperGroup.userData.cyclePart.position.z=sniperGroup.userData.cycleBaseZ+sniperGroup.userData.cycleTravel*(currentWeapon==='sniper'?actionPulse:0);
  if(pistolMag)pistolMag.position.y=-.245-(reloading&&currentWeapon==='pistol'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.18)/.62,0,1))*.20:0);
  if(assaultMag)assaultMag.position.y=-.19-(reloading&&currentWeapon==='assault'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.28:0);
  if(umpMag)umpMag.position.y=-.20-(reloading&&currentWeapon==='ump'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.26:0);
  if(machineGunBox){const mgReload=reloading&&currentWeapon==='machineGun'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.12)/.74,0,1)):0;machineGunBox.position.y=-.19-mgReload*.30;machineGunBox.position.x=-.045-mgReload*.08;}
  if(semiShotgunMag)semiShotgunMag.position.y=-.14-(reloading&&currentWeapon==='semiShotgun'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.22:0);
  if(sniperBolt)sniperBolt.position.z=-.06+(currentWeapon==='sniper'?actionPulse*.085:0)+(reloading&&currentWeapon==='sniper'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.20)/.55,0,1))*.18:0);
  const traversalViewActive=!!traversePoseNow;sniperGroup.visible=!traversalViewActive&&currentWeapon==='sniper'&&!sniperWeaponHiddenForScope();shotgunGroup.visible=!traversalViewActive&&currentWeapon==='shotgun';semiShotgunGroup.visible=!traversalViewActive&&currentWeapon==='semiShotgun';assaultGroup.visible=!traversalViewActive&&currentWeapon==='assault';umpGroup.visible=!traversalViewActive&&currentWeapon==='ump';machineGunGroup.visible=!traversalViewActive&&currentWeapon==='machineGun';grenadeLauncherGroup.visible=!traversalViewActive&&currentWeapon==='grenadeLauncher';rpgGroup.visible=!traversalViewActive&&currentWeapon==='rpg';pistolGroup.visible=!traversalViewActive&&currentWeapon==='pistol';if(akimboLeftGroup)akimboLeftGroup.visible=!traversalViewActive&&currentWeapon==='akimbo1887';if(akimboRightGroup)akimboRightGroup.visible=!traversalViewActive&&currentWeapon==='akimbo1887';
  if(shotgunPump){
    let pumpOffset=reloading&&currentWeapon==='shotgun'?Math.sin(Math.PI*reloadP)*.10:0;
    if(shotgunPumpStartedAt){
      const elapsed=now-shotgunPumpStartedAt,p=Math.max(0,Math.min(1,(elapsed-150)/470));
      if(elapsed>=150){const travel=p<.44?THREE.MathUtils.smoothstep(p,0,.44):1-THREE.MathUtils.smoothstep(p,.44,1);pumpOffset=Math.max(pumpOffset,travel*.135);if(!shotgunPumpSoundPlayed&&p>=.42){shotgunPumpSoundPlayed=true;soundShotgunPump();}}
      if(p>=1){shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;}
    }
    shotgunPump.position.z=-.48-pumpOffset;
  }
  updateFirstPersonHandRig(now,reloading,reloadP,traversalViewActive);
  if(mantleHands){
    mantleHands.visible=!!traversePoseNow;
    if(traversePoseNow){
      const reach=smoothstep01(Math.min(1,traverseP/.42)),pull=smoothstep01(Math.max(0,(traverseP-.42)/.58)),vault=traversal?.mode==='vault';
      // Hands rise from the lower corners and reach forward. No traversal
      // geometry is allowed closer than ~0.55 m to the eye, so camera pitch or
      // mantle motion cannot expose the inside of a forearm mesh.
      mantleHands.position.set(0,-.015+pull*.035,-.03-reach*.07+pull*.025);mantleHands.rotation.x=-.045-reach*.055+pull*.07;
      mantleHands.children.forEach((limb,i)=>{const side=limb.userData.side|| (i?1:-1),stagger=vault?(i?-.055:.035):0,wave=Math.sin(Math.PI*THREE.MathUtils.clamp(traverseP+stagger,0,1));limb.position.x=side*(.27-.025*reach);limb.position.y=-.34+.085*reach-.035*pull+(vault?side*.012*wave:0);limb.position.z=-.82-.10*reach+.055*pull;limb.rotation.x=(vault?side*.07:0)*wave;limb.rotation.z=side*(.06-.08*reach);});
    }
  }
  for(const flash of [pistolFlash,akimboLeftFlash,akimboRightFlash,assaultFlash,umpFlash,machineGunFlash,shotgunFlash,semiShotgunFlash,sniperFlash,grenadeLauncherFlash,rpgFlash])if(flash)flash.material.opacity=Math.max(0,flash.material.opacity-dt*20);
}
function normalizeAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}

function applyViewportSize(metrics=shell.viewport){
  const nextW=Math.max(1,Math.round(metrics?.w||1)),nextH=Math.max(1,Math.round(metrics?.h||1)),nextDpr=Math.max(.5,Math.min(4,Number(metrics?.dpr)||Number(devicePixelRatio)||1));
  const sizeChanged=nextW!==viewW||nextH!==viewH,dprChanged=Math.abs(nextDpr-viewDpr)>.001;
  viewW=nextW;viewH=nextH;viewDpr=nextDpr;
  if(!camera||!renderer)return;
  const aspect=viewW/viewH;
  camera.aspect=aspect;
  const maxHorizontalFov=104*Math.PI/180;
  const landscapeVFov=2*Math.atan(Math.tan(maxHorizontalFov/2)/Math.max(1,aspect))*180/Math.PI;
  baseFov=THREE.MathUtils.clamp(landscapeVFov,58,72);
  if(adsBlend<.01)camera.fov=baseFov;
  camera.updateProjectionMatrix();
  if(sizeChanged||dprChanged){
    const ratio=targetPixelRatio();if(Math.abs(renderer.getPixelRatio()-ratio)>.001)renderer.setPixelRatio(ratio);
    renderer.setSize(viewW,viewH,false);resizeHudOverlay();minimapStaticCache=null;scoreboardPanel=null;scoreboardDrag=null;hudLastDraw=0;
    if(isTouch)resetTouchInput();
  }
  hudLayout=computeHudLayout();
}

function onResize(metrics=shell.viewport){applyViewportSize(metrics);}

function initHudOverlay(){
  hudCanvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(2,2):document.createElement('canvas');
  hudCtx=hudCanvas.getContext('2d');
  hudTexture=new THREE.CanvasTexture(hudCanvas);hudTexture.colorSpace=THREE.SRGBColorSpace;hudTexture.minFilter=THREE.LinearFilter;hudTexture.magFilter=THREE.LinearFilter;
  hudScene=new THREE.Scene();hudCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,2);
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.MeshBasicMaterial({map:hudTexture,transparent:true,depthTest:false,depthWrite:false,toneMapped:false}));quad.position.z=-1;hudScene.add(quad);
  resizeHudOverlay();
}

function resizeHudOverlay(){
  if(!hudCanvas)return;
  const quality=playerSettings.graphics,hudMax=quality==='low'?1:(quality==='medium'?1.25:(isTouch?1.4:1.75));hudScale=Math.min(devicePixelRatio || 1,hudMax);
  hudCanvas.width=Math.max(2,Math.round(viewW*hudScale));hudCanvas.height=Math.max(2,Math.round(viewH*hudScale));
  hudCtx=hudCanvas.getContext('2d');hudTexture.needsUpdate=true;hudLastDraw=0;
}

function safeInsets(){
  const cs=getComputedStyle(document.documentElement);const n=k=>parseFloat(cs.getPropertyValue(k))||0;
  return{top:n('--safe-top'),right:n('--safe-right'),bottom:n('--safe-bottom'),left:n('--safe-left')};
}

function computeHudLayout(){
  const safe=safeInsets(),landscape=viewW>viewH,compact=isTouch&&landscape&&viewH<=520,margin=compact?8:12;
  const contentLeft=safe.left+margin,contentRight=viewW-safe.right-margin,contentW=Math.max(180,contentRight-contentLeft);
  const desiredMap=compact?96:(isTouch?112:140),mapSize=Math.max(72,Math.min(desiredMap,contentW*.23));
  const menuW=compact?34:40,menuH=compact?30:34,chatW=menuW;
  const maxTeamSpace=Math.max(130,contentW-mapSize-20),desiredTeamW=compact?208:(isTouch?248:292),teamW=Math.min(desiredTeamW,maxTeamSpace),teamH=compact?32:36;
  const joyR=compact?54:(isTouch?62:0),fireR=compact?37:43,leftFireR=compact?32:37,aimR=compact?27:31,jumpR=compact?29:33,reloadR=compact?21:24,swapR=compact?23:26,modeR=swapR,equipR=compact?23:27,crouchR=compact?22:26;
  const bottom=safe.bottom+margin,weaponW=compact?158:(isTouch?174:198),weaponH=compact?50:(isTouch?54:58),baseKillW=compact?220:(isTouch?252:300),killH=compact?58:(isTouch?88:112);
  const mapX=contentRight-mapSize,mapY=safe.top+margin,teamY=mapY;
  const desiredTeamX=(viewW-teamW)/2,maxTeamX=mapX-teamW-8,minTeamX=contentLeft;
  const teamX=Math.max(minTeamX,Math.min(desiredTeamX,maxTeamX));
  const topKillSpace=teamX-contentLeft-8,killBelow=topKillSpace<118;
  const killX=contentLeft,killY=killBelow?teamY+teamH+7:mapY,killW=Math.max(96,Math.min(baseKillW,killBelow?mapX-contentLeft-8:topKillSpace));
  const controlsY=mapY+mapSize+6,menuX=mapX,chatX=mapX+mapSize-chatW;
  const moveBoundary=viewW*MOBILE_MOVE_ZONE_RATIO,defaultJoyX=safe.left+joyR+margin,defaultJoyY=viewH-bottom-joyR;
  // Restore the compact lower-left combat cluster: Fire on the upper row,
  // Tactical/Lethal directly beneath it at the bottom edge. The movement stick
  // remains dynamic and cannot spawn over these controls.
  const equipGap=compact?8:10,flashX=safe.left+margin+equipR,stickyX=flashX+equipR*2+equipGap;
  const equipRowY=viewH-bottom-equipR-(compact?4:6),flashY=equipRowY,stickyY=equipRowY;
  const leftFireX=(flashX+stickyX)/2,leftFireY=Math.max(safe.top+leftFireR+52,equipRowY-equipR-leftFireR-(compact?8:10));
  const fireX=viewW-safe.right-margin-fireR,fireY=viewH-bottom-fireR,reloadX=fireX-fireR-reloadR-9,reloadY=fireY,crouchX=reloadX-reloadR-crouchR-9,crouchY=fireY;
  const topRowY=fireY-fireR-Math.max(jumpR,swapR,aimR)-11,jumpX=crouchX,jumpY=topRowY,swapX=reloadX,swapY=topRowY,aimX=fireX,aimY=topRowY;
  const modeX=crouchX-crouchR-modeR-9,modeY=(topRowY+fireY)/2,weaponLift=touchGameplayControlsVisible()?(fireR*3.75+8):0;
  const weaponX=viewW-safe.right-margin-weaponW,weaponY=viewH-bottom-weaponH-weaponLift;
  const teamIndicatorY=teamY+teamH+8,announcerY=teamIndicatorY+(compact?24:28),noticeW=Math.max(118,Math.min(compact?190:240,contentW*.34)),noticeH=28;
  const noticeX=Math.max(contentLeft,Math.min((viewW-noticeW)/2,contentRight-noticeW)),noticeY=announcerY+(compact?30:36);
  const gapLeft=teamX+teamW+8,gapRight=mapX-8,gapW=gapRight-gapLeft,chatFallbackX=Math.max(contentLeft,Math.min(mapX-150,contentRight-150));
  const chatFeedX=gapW>=92?gapLeft:chatFallbackX,chatFeedRight=gapW>=92?gapRight:mapX-8,chatFeedW=Math.max(72,chatFeedRight-chatFeedX),chatFeedY=mapY+2,composerTop=chatOpen&&!chatComposer.classList.contains('hide')?chatComposer.getBoundingClientRect().top:Infinity;
  const chatOverlapsWeapon=chatFeedRight>weaponX&&chatFeedX<weaponX+weaponW,chatClosedBottom=mapY+mapSize,chatOpenBottom=Math.min(viewH-bottom-8,composerTop-6,chatOverlapsWeapon?weaponY-8:Infinity),chatFeedBottom=chatOpen?chatOpenBottom:chatClosedBottom,chatFeedH=Math.max(0,chatFeedBottom-chatFeedY);
  return{compact,safe,moveBoundary,
    map:{x:mapX,y:mapY,w:mapSize,h:mapSize},kill:{x:killX,y:killY,w:killW,h:killH},
    team:{x:teamX,y:teamY,w:teamW,h:teamH},teamIndicator:{x:teamX+teamW/2,y:teamIndicatorY},notice:{x:noticeX,y:noticeY,w:noticeW,h:noticeH},chatFeed:{x:chatFeedX,y:chatFeedY,w:chatFeedW,h:chatFeedH},announcer:{x:viewW/2,y:announcerY},
    chat:{x:chatX,y:controlsY,w:chatW,h:menuH},menu:{x:menuX,y:controlsY,w:menuW,h:menuH},
    weapon:{x:weaponX,y:weaponY,w:weaponW,h:weaponH},joy:{x:defaultJoyX,y:defaultJoyY,r:joyR},
    leftFire:{x:leftFireX,y:leftFireY,r:leftFireR},crouch:{x:crouchX,y:crouchY,r:crouchR},flash:{x:flashX,y:flashY,r:equipR},sticky:{x:stickyX,y:stickyY,r:equipR},
    fire:{x:fireX,y:fireY,r:fireR},aim:{x:aimX,y:aimY,r:aimR},jump:{x:jumpX,y:jumpY,r:jumpR},reload:{x:reloadX,y:reloadY,r:reloadR},swap:{x:swapX,y:swapY,r:swapR},mode:{x:modeX,y:modeY,r:modeR},
    deathLoadout:{x:viewW/2-92,y:Math.min(viewH-safe.bottom-margin-34,viewH/2+(compact?60:70)),w:184,h:34}
  };
}
function drawNetworkDiagnostics(c,w,h){
  if(!diagnosticsRecordingEnabled())return;
  const lines=[
    `DIAG REC  ${Math.round((performance.now()-diagnosticsRecorder.startedAt)/1000)}s  INCIDENTS ${diagnosticsRecorder.incidents.length}`,
    `NET ${socket?.readyState===WebSocket.OPEN?'OPEN':'OFF'}  RTT ${Math.round(netDiag.rttMs)}  JIT ${Math.round(netDiag.rttJitterMs)}`,
    `STATE ${Math.round(netDiag.lastStateGapMs)}/${Math.round(netDiag.maxStateGapMs)}ms  SRV ${Math.round(netDiag.serverLastStateGapMs)}/${Math.round(netDiag.serverMaxStateGapMs)}ms`,
    `CORR ${netDiag.corrections}  MAX ${netDiag.maxCorrectionM.toFixed(2)}m  ${netDiag.lastCorrectionReason||'-'}`,
    `REJ ${netDiag.rejects}  ${netDiag.lastReject||'-'}`,
    `STALL ${netDiag.frameStalls}  MAX ${Math.round(netDiag.maxFrameMs)}ms  REC ${netDiag.reconnects}`
  ];
  c.save();c.font='700 9px ui-monospace,monospace';const pad=6,lineH=12,panelW=Math.min(360,Math.max(...lines.map(line=>c.measureText(line).width))+pad*2),panelH=lines.length*lineH+pad*2;c.fillStyle='rgba(0,0,0,.72)';c.fillRect(7,7,panelW,panelH);c.strokeStyle='rgba(215,255,88,.45)';c.strokeRect(7.5,7.5,panelW-1,panelH-1);c.fillStyle='#e8f0f4';c.textAlign='left';c.textBaseline='top';lines.forEach((line,i)=>c.fillText(line,7+pad,7+pad+i*lineH));c.restore();
}
function drawHud(now){
  const scopeAmount=sniperMaskAmount(),scoped=scopeAmount>.002,scopeAnimating=scoped&&scopeAmount<.998,hudInterval=scopeAnimating?16:(touchGameplayControlsVisible()?33:16),scopeStateChanged=scoped!==hudLastScopeActive;
  if(!scopeStateChanged&&!scopeAnimating&&now-hudLastDraw<hudInterval)return;hudLastDraw=now;hudLastScopeActive=scoped;if(!hudLayout)hudLayout=computeHudLayout();
  const c=hudCtx,s=hudScale,w=viewW,h=viewH,L=hudLayout,toast=activeToast(now);
  c.setTransform(s,0,0,s,0,0);c.clearRect(0,0,w,h);c.textBaseline='middle';
  if(now<flashUntil){const a=now<flashPeakUntil?1:Math.max(0,(flashUntil-now)/Math.max(1,flashUntil-flashPeakUntil));c.fillStyle=`rgba(255,255,255,${Math.min(.96,a*.92)})`;c.fillRect(0,0,w,h);}c.lineCap='round';c.lineJoin='round';
  const missingHealth=Math.max(0,Math.min(1,(100-hp)/100)),hurtPulse=now<hurtUntil?Math.max(0,(hurtUntil-now)/700):0,damageAlpha=Math.min(.82,missingHealth*.58+hurtPulse*.38);
  if(damageAlpha>.01){const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.10,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'rgba(255,18,40,0)');g.addColorStop(.58,`rgba(255,18,40,${damageAlpha*.12})`);g.addColorStop(.82,`rgba(185,0,22,${damageAlpha*.42})`);g.addColorStop(1,`rgba(125,0,16,${damageAlpha})`);c.fillStyle=g;c.fillRect(0,0,w,h);}
  drawBloodSplatter(c,w,h,now,missingHealth);
  if(scoreboardOpen){drawScoreboard(c,L);drawNetworkDiagnostics(c,w,h);hudTexture.needsUpdate=true;return;}
  if(!matchAllowsMovement(matchState)){drawMatchStatus(c,w,h);drawScoreboardButton(c,L.team);if(matchState.status!==MATCH_STATUS.ENDED)drawMenuButton(c,L.menu);drawNetworkDiagnostics(c,w,h);hudTexture.needsUpdate=true;return;}
  if(hp<=0){drawDeathScreen(c,L,w,h,now);drawNetworkDiagnostics(c,w,h);hudTexture.needsUpdate=true;return;}
  if(!scoped||scopeAmount<.82){drawKillFeed(c,L.kill,now);drawMiniMap(c,L.map);drawTeamBar(c,L.team);drawTeamIndicator(c,L.teamIndicator);}if(scoped)drawScopeMask(c,w,h,scopeAmount);
  drawMenuButton(c,L.menu);drawWeapon(c,L.weapon);
  drawDamageIndicators(c,w,h,now);drawChatFeed(c,L,w,h,now);if(isTouch)drawChatButton(c,L.chat);if(chatOpen)activeAnnouncer(now);else drawAnnouncer(c,L,now);
  if(touchGameplayControlsVisible())drawTouchControls(c,L,now);if(killConfirmUntil>now)drawKillConfirm(c,w,h,now);
  if(toast){c.font='800 11px system-ui';const toastLabel=clipHudText(c,toast.text,Math.max(70,L.notice.w-20)),tw=Math.min(L.notice.w,c.measureText(toastLabel).width+24),tx=L.notice.x+(L.notice.w-tw)/2,ty=L.notice.y;roundRect(c,tx,ty,tw,L.notice.h,8,HUD_SURFACE,HUD_LINE);c.fillStyle='#fff';c.textAlign='center';c.fillText(toastLabel,tx+tw/2,ty+L.notice.h/2);}
  const hitActive=now<hitUntil,headshotHit=now<headshotUntil,scopeReticle=sniperReticleAmount();if(scopeReticle>.002)drawScopeReticle(c,w,h,hitActive,headshotHit,scopeReticle);else drawWeaponCrosshair(c,w/2,h/2,currentWeapon,hitActive,adsBlend,headshotHit);if(hitActive)drawHitConfirm(c,w/2,h/2,headshotHit);
  drawNetworkDiagnostics(c,w,h);hudTexture.needsUpdate=true;
}
function drawDeathScreen(c,L,w,h,now){
  c.fillStyle='rgba(24,3,8,.60)';c.fillRect(0,0,w,h);drawTeamBar(c,L.team);drawMiniMap(c,L.map);drawMenuButton(c,L.menu);
  const total=Math.max(500,Number(worldSettings.combat.respawnMs)||3000),remain=Math.max(0,wastedUntil-serverNow()),progress=Math.max(0,Math.min(1,1-remain/total));
  const panelW=Math.min(430,w-32),panelH=L.compact?138:154,x=(w-panelW)/2,y=Math.max(L.safe.top+8,(h-panelH)/2-20),cx=w/2;
  roundRect(c,x,y,panelW,panelH,12,'rgba(11,10,13,.94)','rgba(255,91,112,.26)');c.fillStyle='#ff5367';c.fillRect(x,y,3,panelH);
  c.textAlign='center';c.fillStyle='#ff6676';c.font=`1000 ${L.compact?27:34}px system-ui`;c.fillText('ELIMINATED',cx,y+(L.compact?25:29));
  if(lastWastedBy){c.fillStyle='#fff';c.font='1000 13px system-ui';c.fillText(clipHudText(c,lastWastedBy,Math.max(120,panelW-42)),cx,y+(L.compact?49:55));}
  const details=[];if(lastWastedWeapon)details.push(weaponLabel(lastWastedWeapon));if(lastWastedHeadshot)details.push('HEADSHOT');if(lastWastedDistance>=1)details.push(`${lastWastedDistance.toFixed(1)} m`);c.fillStyle=lastWastedHeadshot?'#ffd36d':'#b9c4cb';c.font='850 10px system-ui';c.fillText(clipHudText(c,details.join(' · '),Math.max(120,panelW-38)),cx,y+(L.compact?67:74));
  const classId=pendingClassId||activeClassId,classInfo=loadoutClassById(loadoutClasses,classId,selectedLoadout());c.fillStyle='#8e9aa3';c.font='850 10px system-ui';c.fillText(`NEXT SPAWN · ${String(classInfo?.name||'CLASS').toUpperCase()}`,cx,y+(L.compact?86:94));
  const barX=x+24,barW=panelW-48,barY=y+(L.compact?101:110);roundRect(c,barX,barY,barW,4,2,'rgba(255,255,255,.10)');if(progress>0)roundRect(c,barX,barY,barW*progress,4,2,'#ff5367');
  c.fillStyle='#dce3e7';c.font='900 10px system-ui';c.fillText(remain>120?`RESPAWN ${Math.max(1,Math.ceil(remain/1000))}`:'RESPAWNING',cx,barY+16);
  const b=L.deathLoadout;roundRect(c,b.x,b.y,b.w,b.h,8,'rgba(13,18,22,.94)','rgba(255,255,255,.18)');c.fillStyle='#fff';c.font='900 11px system-ui';c.fillText(`${isTouch?'TAP':controllerInputActive()?'Y':'L'} · CHANGE LOADOUT`,cx,b.y+b.h/2);
}

function drawFinalStandings(c,w,h,returnIn,title,accent){
  const L=hudLayout||computeHudLayout(),rows=allCombatStats(),panelW=Math.min(570,w-L.safe.left-L.safe.right-26),rowH=L.compact?22:25,headH=L.compact?67:76,maxRows=Math.max(3,Math.min(7,Math.floor((h-L.safe.top-L.safe.bottom-headH-40)/rowH))),visible=rows.slice(0,maxRows),panelH=headH+visible.length*rowH+32,x=(w-panelW)/2,y=Math.max(L.safe.top+8,(h-panelH)/2);
  c.save();c.fillStyle='rgba(2,4,6,.70)';c.fillRect(0,0,w,h);roundRect(c,x,y,panelW,panelH,13,'rgba(8,12,15,.97)','rgba(255,255,255,.17)');c.fillStyle=accent;c.fillRect(x,y,3,panelH);
  c.textAlign='left';c.fillStyle=accent;c.font=`1000 ${L.compact?18:22}px system-ui`;c.fillText(title,x+16,y+22);c.fillStyle='#fff';c.font='1000 12px system-ui';c.fillText('FINAL STANDINGS',x+16,y+(L.compact?45:50));
  const spec=currentModeSpec();if(spec.teamBased){const t=teamScores();c.textAlign='right';c.font='1000 13px system-ui';c.fillStyle=TEAM_COLORS.blue;c.fillText(`BLUE ${t.blue}`,x+panelW-78,y+23);c.fillStyle=TEAM_COLORS.red;c.fillText(`${t.red} RED`,x+panelW-16,y+23);}else{c.textAlign='right';c.fillStyle='#aab6be';c.font='850 10px system-ui';c.fillText(spec.short||'MATCH',x+panelW-16,y+23);}
  const nameX=x+16,kX=x+panelW-108,dX=x+panelW-65,kdX=x+panelW-16,headerY=y+headH-11;c.fillStyle='#75818a';c.font='900 9px system-ui';c.textAlign='right';c.fillText('K',kX,headerY);c.fillText('D',dX,headerY);c.fillText('K/D',kdX,headerY);
  let ry=y+headH;for(const p of visible){const self=p.id===clientId;if(self)roundRect(c,x+8,ry,panelW-16,rowH-1,5,'rgba(215,255,88,.08)');c.fillStyle=self?HUD_ACCENT:(spec.teamBased?(TEAM_COLORS[p.team]||'#fff'):'#ff6973');c.fillRect(x+9,ry+5,3,rowH-10);c.textAlign='left';c.fillStyle=self?'#fff':'#d8e1e7';c.font=`${self?'1000':'850'} 11px system-ui`;c.fillText(clipHudText(c,`${p.bot?'[BOT] ':''}${p.name}`,Math.max(60,kX-nameX-14)),nameX,ry+rowH/2);c.textAlign='right';c.fillStyle='#fff';c.fillText(String(p.kills),kX,ry+rowH/2);c.fillStyle='#b8c3ca';c.fillText(String(p.deaths),dX,ry+rowH/2);c.fillText(p.deaths?(p.kills/p.deaths).toFixed(2):p.kills?String(p.kills):'0.00',kdX,ry+rowH/2);ry+=rowH;}
  c.textAlign='center';c.fillStyle='#7f8b94';c.font='850 10px system-ui';const hidden=Math.max(0,rows.length-visible.length),footer=`${hidden?`+${hidden} MORE · `:''}${returnIn>0?`LOBBY IN ${returnIn}s`:'RETURNING TO LOBBY'}`;c.fillText(footer,w/2,y+panelH-15);c.restore();
}

function drawMatchStatus(c,w,h){
  if(matchAllowsMovement(matchState))return;
  if(matchState.status==='ended'){
    const spec=currentModeSpec(),teamMode=spec.teamBased,winner=String(matchState.winner||''),isDraw=winner==='draw'||(!winner&&!matchState.winnerId),won=teamMode?winner===myTeam:samePlayerId(matchState.winnerId,clientId),title=isDraw?'DRAW':won?'VICTORY':'DEFEAT',accent=isDraw?HUD_ACCENT:won?'#8ff0a9':'#ff6973',endedAt=Number(matchState.endedAt)||serverNow(),elapsed=Math.max(0,serverNow()-endedAt),returnIn=Math.max(0,Math.ceil(((Number(matchState.restartAt)||serverNow())-serverNow())/1000));
    if(elapsed>=1900){drawFinalStandings(c,w,h,returnIn,title,accent);return;}
    const panelW=Math.min(470,w-30),panelH=Math.min(220,h-30),x=(w-panelW)/2,y=Math.max(15,(h-panelH)/2-6),reason=matchState.reason==='score'?'SCORE LIMIT':matchState.reason==='time'?'TIME LIMIT':'MATCH COMPLETE';
    c.save();c.fillStyle='rgba(2,4,6,.66)';c.fillRect(0,0,w,h);roundRect(c,x,y,panelW,panelH,14,'rgba(8,12,15,.96)','rgba(255,255,255,.18)');c.fillStyle=accent;c.fillRect(x,y,3,panelH);c.textAlign='center';c.fillStyle=accent;c.font=`1000 ${Math.max(30,Math.min(44,h*.095))}px system-ui`;c.fillText(title,w/2,y+49);
    c.fillStyle='#fff';c.font='900 14px system-ui';if(teamMode){const t=teamScores();c.fillText(`${t.blue}  BLUE   ·   RED  ${t.red}`,w/2,y+88);}else c.fillText(matchState.winnerName?`${String(matchState.winnerName).toUpperCase()} WINS`:'MATCH COMPLETE',w/2,y+88);
    c.fillStyle='#c4ced5';c.font='800 12px system-ui';c.fillText(`YOU  ${myStats.kills||0} K  ·  ${myStats.deaths||0} D  ·  ${(myStats.deaths?(myStats.kills/myStats.deaths):myStats.kills||0).toFixed(2)} K/D`,w/2,y+121);c.fillStyle=HUD_MUTED;c.font='800 10px system-ui';c.fillText(reason,w/2,y+147);c.fillText('FINAL STANDINGS',w/2,y+175);c.restore();return;
  }
  const warm=matchState.status==='warmup',remain=warm?Math.max(0,matchState.warmupEndsAt-serverNow()):0,count=warm?Math.max(1,Math.ceil(remain/1000)):0,text=warm?String(count):'WAITING FOR MATCH',sub=warm?`${currentModeSpec().short||'MATCH'} · ${mapSpec(currentMapId).short||'MAP'}`:'Waiting for players';
  const pw=Math.min(320,w-30),ph=warm?92:78,x=(w-pw)/2,y=h*.29;c.save();roundRect(c,x,y,pw,ph,12,'rgba(6,9,12,.84)','rgba(255,255,255,.16)');c.textAlign='center';c.fillStyle=warm?HUD_ACCENT:'#fff';c.font=`1000 ${warm?42:22}px system-ui`;c.fillText(text,w/2,y+(warm?35:29));c.fillStyle=warm?'#fff':HUD_MUTED;c.font='900 11px system-ui';c.fillText(warm?'GET READY':'Waiting for players',w/2,y+(warm?62:54));if(warm){c.fillStyle=HUD_MUTED;c.font='800 9px system-ui';c.fillText(sub,w/2,y+78);}c.restore();
}
function allCombatStats(){
  const rows=[{id:clientId,name:myName||safeName(),team:myTeam,bot:false,godMode,kills:myStats.kills||0,deaths:myStats.deaths||0}];
  for(const r of remotes.values())rows.push({id:r.id,name:r.name,team:r.team,bot:r.bot,godMode:!!r.godMode,kills:r.kills||0,deaths:r.deaths||0});
  return rows.sort((a,b)=>currentModeSpec().teamBased?(a.team.localeCompare(b.team)||(b.kills-a.kills)||(a.deaths-b.deaths)||a.name.localeCompare(b.name)):((b.kills-a.kills)||(a.deaths-b.deaths)||a.name.localeCompare(b.name)));
}
function teamScores(){return{blue:Math.max(0,Number(matchState.blueScore)||0),red:Math.max(0,Number(matchState.redScore)||0)};}
function drawTeamBar(c,r){
  const spec=currentModeSpec(),mid=r.x+r.w/2,clock=matchClockText();roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);c.textBaseline='middle';
  if(spec.scoreType==='player'){
    const rows=allCombatStats(),leader=rows[0];c.fillStyle=HUD_ACCENT;c.fillRect(r.x,r.y,3,r.h);c.fillStyle=TEAM_COLORS.red;c.fillRect(r.x+r.w-3,r.y,3,r.h);
    c.textAlign='left';c.font=`900 ${r.h<=32?10:11}px system-ui`;c.fillStyle='#dfe8ee';c.fillText('YOU',r.x+10,r.y+r.h/2);c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(myStats.kills||0),r.x+37,r.y+r.h/2);
    c.textAlign='center';c.font='1000 11px system-ui';c.fillStyle=matchState.status==='ended'?HUD_ACCENT:'#dbe4ea';c.fillText(clock,mid,r.y+r.h/2);
    c.textAlign='right';c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(leader?.kills||0),r.x+r.w-37,r.y+r.h/2);c.font=`900 ${r.h<=32?10:11}px system-ui`;c.fillStyle='#ff9ca4';c.fillText('LEAD',r.x+r.w-10,r.y+r.h/2);return;
  }
  const rows=allCombatStats(),bluePlayers=rows.filter(p=>p.team==='blue').length,redPlayers=rows.filter(p=>p.team==='red').length,t=teamScores();c.fillStyle=TEAM_COLORS.blue;c.fillRect(r.x,r.y,3,r.h);c.fillStyle=TEAM_COLORS.red;c.fillRect(r.x+r.w-3,r.y,3,r.h);
  c.textAlign='left';c.font=`900 ${r.h<=32?10:11}px system-ui`;c.fillStyle='#8fc8ff';c.fillText('BLUE',r.x+10,r.y+r.h/2);c.textAlign='right';c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(spec.scoreType==='none'?bluePlayers:t.blue),mid-40,r.y+r.h/2);
  c.textAlign='center';c.font='1000 11px system-ui';c.fillStyle=matchState.status==='ended'?HUD_ACCENT:'#dbe4ea';c.fillText(clock,mid,r.y+r.h/2);
  c.textAlign='left';c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(spec.scoreType==='none'?redPlayers:t.red),mid+40,r.y+r.h/2);c.textAlign='right';c.font=`900 ${r.h<=32?10:11}px system-ui`;c.fillStyle='#ff9ca4';c.fillText('RED',r.x+r.w-10,r.y+r.h/2);
}
function drawTeamIndicator(c,p){if(!p||!currentModeSpec().teamBased)return;const team=myTeam==='red'?'red':'blue',color=TEAM_COLORS[team]||'#fff',label=team.toUpperCase();c.save();c.textAlign='center';c.textBaseline='middle';c.font='900 9px system-ui';c.shadowColor='rgba(0,0,0,.86)';c.shadowBlur=3;c.fillStyle=color;c.globalAlpha=.88;c.fillText(`◆ ${label}`,p.x,p.y);c.restore();}
function drawScoreboardButton(c,r){roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);c.textAlign='center';c.fillStyle='#e7eef2';c.font=`1000 ${r.h<=32?10:11}px system-ui`;c.fillText('SCOREBOARD',r.x+r.w/2,r.y+r.h/2);}
function toggleScoreboard(){if(!shell.canPlay)return;scoreboardOpen=!scoreboardOpen;scoreboardDrag=null;if(scoreboardOpen){scoreboardScroll=0;touchRoles.clear();clearFireInput();cancelEquipmentAction();joy.x=joy.y=0;}}
function drawScoreboard(c,L){
  const rows=allCombatStats(),w=Math.min(viewW-L.safe.left-L.safe.right-28,L.compact?500:620),rowH=L.compact?24:27,headH=43,maxH=viewH-L.safe.top-L.safe.bottom-34;
  const visibleH=Math.min(maxH,Math.max(150,headH+Math.min(rows.length,7)*rowH+14)),x=(viewW-w)/2,y=Math.max(L.safe.top+L.team.h+15,(viewH-visibleH)/2);
  const bodyTop=y+headH,bodyH=visibleH-headH-9,contentH=rows.length*rowH,maxScroll=Math.max(0,contentH-bodyH);
  scoreboardScroll=Math.max(0,Math.min(maxScroll,scoreboardScroll));scoreboardPanel={x,y,w,h:visibleH,maxScroll,close:{x:x+w-78,y:y+5,w:68,h:28}};
  c.fillStyle='rgba(0,0,0,.44)';c.fillRect(0,0,viewW,viewH);roundRect(c,x,y,w,visibleH,12,'rgba(9,11,13,.97)','rgba(255,255,255,.18)');
  c.textAlign='left';c.fillStyle='#fff';c.font='1000 13px system-ui';c.fillText('SCOREBOARD',x+14,y+17);c.fillStyle='#737e87';c.font='900 10px system-ui';c.fillText(maxScroll?`${controllerInputActive()?'RIGHT STICK':touchGameplayControlsVisible()?'DRAG':'WHEEL'} TO SCROLL`:'ALL PLAYERS',x+108,y+17);
  roundRect(c,x+w-76,y+6,64,25,7,'rgba(255,255,255,.08)','rgba(255,255,255,.14)');c.fillStyle='#fff';c.font='1000 10px system-ui';c.textAlign='center';c.fillText('CANCEL',x+w-44,y+18.5);
  const nameX=x+14,kX=x+w-112,dX=x+w-67,kdX=x+w-18;c.fillStyle='#737e87';c.font='900 10px system-ui';c.textAlign='right';c.fillText('K',kX,y+35);c.fillText('D',dX,y+35);c.fillText('K/D',kdX,y+35);
  c.save();c.beginPath();c.rect(x+7,bodyTop,w-14,bodyH);c.clip();let ry=bodyTop-scoreboardScroll;
  for(const p of rows){if(ry+rowH>=bodyTop&&ry<=bodyTop+bodyH){const self=p.id===clientId;if(self){c.fillStyle='rgba(255,255,255,.06)';c.fillRect(x+7,ry,w-14,rowH-1);}c.fillStyle=p.id===clientId?HUD_ACCENT:(currentModeSpec().teamBased?(TEAM_COLORS[p.team]||'#fff'):TEAM_COLORS.red);c.fillRect(x+8,ry+5,3,rowH-10);c.textAlign='left';c.font=`${self?'1000':'850'} 11px system-ui`;c.fillStyle=self?'#fff':'#d6e0e8';const playerLabel=`${p.godMode?'◆ ':''}${p.bot?'[BOT] ':''}${p.name}`,playerNameBudget=Math.max(60,kX-nameX-14);c.fillText(clipHudText(c,playerLabel,playerNameBudget),nameX,ry+rowH/2);c.textAlign='right';c.fillStyle='#fff';c.fillText(String(p.kills),kX,ry+rowH/2);c.fillStyle='#b9c5cf';c.fillText(String(p.deaths),dX,ry+rowH/2);c.fillText(p.deaths?(p.kills/p.deaths).toFixed(2):p.kills?String(p.kills):'0.00',kdX,ry+rowH/2);}ry+=rowH;}c.restore();
  if(maxScroll>0){const trackY=bodyTop+3,trackH=bodyH-6,thumbH=Math.max(24,trackH*(bodyH/contentH)),thumbY=trackY+(trackH-thumbH)*(scoreboardScroll/maxScroll);roundRect(c,x+w-6,trackY,2,trackH,1,'rgba(255,255,255,.08)');roundRect(c,x+w-7,thumbY,4,thumbH,2,'rgba(255,255,255,.35)');}
}

function drawKillConfirm(c,w,h,now){const remain=Math.max(0,Math.min(1,(killConfirmUntil-now)/1000)),a=Math.min(1,remain*2.8);c.save();c.globalAlpha=a;c.textAlign='center';c.shadowColor='rgba(0,0,0,.84)';c.shadowBlur=4;c.fillStyle=killConfirmHeadshot?'#ffd36d':'rgba(255,255,255,.94)';c.font='1000 11px system-ui';c.fillText(killConfirmHeadshot?'HEADSHOT ELIMINATION':'ELIMINATED',w/2,h/2+34);c.fillStyle=killConfirmHeadshot?'rgba(255,221,138,.90)':'rgba(210,220,226,.88)';c.font='850 9px system-ui';const distance=killConfirmDistance>=1?` · ${killConfirmDistance.toFixed(1)} m`:'',detail=`${killConfirmName}${killConfirmWeapon?' · '+weaponLabel(killConfirmWeapon):''}${distance}`;c.fillText(clipHudText(c,detail,Math.max(120,w-40)),w/2,h/2+48);c.restore();}
function queueAnnouncer(title,subtitle='',duration=1500,priority=1){const item={title:String(title||''),subtitle:String(subtitle||''),duration,priority};if(!item.title)return;if(announcerCurrent&&priority>announcerCurrent.priority){announcerQueue.unshift(announcerCurrent);announcerCurrent=null;}announcerQueue.push(item);announcerQueue.sort((a,b)=>b.priority-a.priority);}
function activeAnnouncer(now){if(announcerCurrent&&now>=announcerCurrent.until)announcerCurrent=null;if(!announcerCurrent&&announcerQueue.length){const next=announcerQueue.shift();announcerCurrent={...next,start:now,until:now+next.duration};soundAnnouncer(next.priority);}return announcerCurrent;}
function drawAnnouncer(c,L,now){const a=activeAnnouncer(now);if(!a)return;const life=(now-a.start)/a.duration,fade=Math.min(1,life*6,(1-life)*5),scale=1+Math.max(0,.08-life*.34);c.save();c.translate(L.announcer.x,L.announcer.y);c.scale(scale,scale);c.globalAlpha=Math.max(0,fade);c.textAlign='center';c.shadowColor='rgba(0,0,0,.78)';c.shadowBlur=8;c.fillStyle='#fff';c.font=`1000 ${Math.max(18,Math.min(28,viewH*.052))}px system-ui`;c.fillText(a.title,0,0);if(a.subtitle){c.fillStyle=HUD_ACCENT;c.font=`900 ${Math.max(9,Math.min(12,viewH*.026))}px system-ui`;c.fillText(a.subtitle,0,20);}c.restore();}
function weaponLabel(w){return WEAPON_SPECS[w]?.name||EQUIPMENT_SPECS[w]?.name||'PISTOL';}
function drawWeapon(c,r){
  const spec=effectiveWeaponSpec(currentWeapon),count=Math.max(0,Math.floor(ammo[currentWeapon]||0)),unlimited=!!godMode;
  const accent=currentWeapon==='sniper'?'#8edcff':(currentWeapon==='shotgun'||currentWeapon==='semiShotgun')?'#ffad69':(currentWeapon==='grenadeLauncher'||currentWeapon==='rpg')?'#ffb267':(currentWeapon==='assault'||currentWeapon==='ump'||currentWeapon==='machineGun')?HUD_ACCENT:'#f4f6f7';
  roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);c.fillStyle=accent;c.fillRect(r.x,r.y,2.5,r.h);
  const left=r.x+10,top=r.y+11,right=r.x+r.w-9,mode=currentWeapon==='assault'?assaultFireMode.toUpperCase():spec?.automatic?'AUTO':'SEMI';
  c.textAlign='left';c.fillStyle='#fff';c.font=`1000 ${r.w<180?10.5:12}px system-ui`;c.fillText(clipHudText(c,spec.name,Math.max(48,r.w-78)),left,top);
  const statusLine=!isTouch?`${mode} · ${currentWeapon==='sniper'?sniperZoomLabel():(adsWanted?'ADS':'HIP')}${godMode?' · GOD':''}`:(godMode?'◆ GOD':'');if(statusLine){c.fillStyle=godMode?HUD_ACCENT:HUD_MUTED;c.font=`850 ${isTouch?8.5:10}px system-ui`;c.fillText(statusLine,left,top+13);}
  c.textAlign='right';c.fillStyle=unlimited?HUD_ACCENT:count<=3?'#ff747d':'#fff';c.font=`1000 ${r.h<=60?22:24}px system-ui`;if(unlimited)c.fillText('∞',right,top+6);else{c.fillText(String(count),right-23,top+6);c.fillStyle='#69747d';c.font='900 10px system-ui';c.fillText(`/ ${spec.mag}`,right,top+8);}
  const bx=left,by=r.y+r.h-7,bw=r.w-19,bh=2.5;roundRect(c,bx,by,bw,bh,2,'rgba(255,255,255,.09)');
  if(unlimited)roundRect(c,bx,by,bw,bh,2,HUD_ACCENT);else if(reloadUntil){const total=weaponRules(reloadWeapon||currentWeapon).reloadMs,remain=Math.max(0,reloadUntil-serverNow()),q=Math.max(0,Math.min(1,1-remain/total));roundRect(c,bx,by,bw*q,bh,2,HUD_ACCENT);c.fillStyle=HUD_ACCENT;c.font='900 10px system-ui';c.textAlign='left';c.fillText('RELOADING',left,by-7);}else roundRect(c,bx,by,bw*(count/spec.mag),bh,2,accent);
}
function minimapDotColor(rmt){return modeFriendly(rmt.team)?(!rmt.bot?'#62ef86':TEAM_COLORS[rmt.team]):TEAM_COLORS.red;}
const MINIMAP_ZOOM=1.45;
function minimapWorldLimit(geometry=worldGeometry){const value=Number(geometry?.MINIMAP_LIMIT);return Number.isFinite(value)&&value>8?value:Number(geometry?.ARENA_LIMIT)||ARENA_LIMIT;}
function minimapObstacles(geometry=worldGeometry){
  const out=[];for(const o of geometry.STATIC_BOXES||[])out.push({type:'box',x:o.x,z:o.z,w:o.w,d:o.d,kind:o.kind||'cover'});for(const b of geometry.BUILDINGS||[])out.push({type:'building',x:b.x,z:b.z,w:b.w,d:b.d});for(const p of geometry.PYRAMIDS||[])out.push({type:'pyramid',x:p.x,z:p.z,base:p.base});for(const o of geometry.NATURAL_OBSTACLES||[])out.push({type:o.type,x:o.x,z:o.z,r:o.r,h:o.h});return out;
}
function getMinimapStatic(w=512,h=512,mapId=currentMapId){
  const id=normalizeMapId(mapId),geometry=CLIENT_WORLD_BUNDLES[id]?.geometry||worldGeometry,mapLimit=minimapWorldLimit(geometry),key=`${id}:${mapLimit}:${Math.round(w)}x${Math.round(h)}`;if(minimapStaticCache?.key===key)return minimapStaticCache.canvas;
  const q=document.createElement('canvas');q.width=Math.max(1,Math.round(w));q.height=Math.max(1,Math.round(h));const c=q.getContext('2d'),iw=q.width,ih=q.height,terrainCells=32,cellW=iw/terrainCells,cellH=ih/terrainCells,terrainFn=geometry.terrainHeight||terrainHeight;
  c.fillStyle='rgba(19,27,26,.94)';c.fillRect(0,0,iw,ih);for(let gy=0;gy<terrainCells;gy++)for(let gx=0;gx<terrainCells;gx++){const wx=-mapLimit+(gx+.5)/terrainCells*mapLimit*2,wz=-mapLimit+(gy+.5)/terrainCells*mapLimit*2,hv=terrainFn(wx,wz),t=Math.max(0,Math.min(1,(hv+2.4)/16.2));c.fillStyle=`rgba(${Math.round(58+72*t)},${Math.round(78+46*t)},${Math.round(57+31*t)},${.34+.34*t})`;c.fillRect(gx*cellW,gy*cellH,cellW+.7,cellH+.7);}
  const toX=x=>(x+mapLimit)/(mapLimit*2)*iw,toY=z=>(z+mapLimit)/(mapLimit*2)*ih;for(const b of minimapObstacles(geometry)){if(b.type==='box'||b.type==='building'){const x1=toX(b.x-b.w/2),x2=toX(b.x+b.w/2),y1=toY(b.z-b.d/2),y2=toY(b.z+b.d/2);c.fillStyle=b.type==='building'?'rgba(226,231,234,.64)':'rgba(190,199,204,.43)';c.fillRect(x1,y1,x2-x1,y2-y1);if(b.type==='building'){c.strokeStyle='rgba(255,255,255,.30)';c.lineWidth=Math.max(1,iw/512);c.strokeRect(x1+.5,y1+.5,Math.max(0,x2-x1-1),Math.max(0,y2-y1-1));}}else if(b.type==='pyramid'){const px=toX(b.x),py=toY(b.z),rr=b.base/(mapLimit*2)*iw*.55;c.beginPath();c.moveTo(px,py-rr);c.lineTo(px+rr,py+rr);c.lineTo(px-rr,py+rr);c.closePath();c.fillStyle='rgba(207,199,170,.62)';c.fill();}else{const px=toX(b.x),py=toY(b.z),rr=Math.max(1.6,(b.r||1)/(mapLimit*2)*iw*1.6);c.beginPath();c.arc(px,py,rr,0,Math.PI*2);c.fillStyle=b.type==='tree'?'rgba(41,101,52,.84)':b.type==='bush'?'rgba(65,116,59,.76)':'rgba(148,154,153,.72)';c.fill();}}
  minimapStaticCache={key,canvas:q};return q;
}
function renderLobbyMapPreview(mapId=lobbyMapDraft||currentMapId){
  if(!lobbyMapPreview||!shell.inLobby)return;const rect=lobbyMapPreview.getBoundingClientRect(),cssW=Math.max(240,Math.round(rect.width||640)),cssH=Math.max(170,Math.round(rect.height||360)),dpr=Math.min(2,devicePixelRatio||1),pw=Math.round(cssW*dpr),ph=Math.round(cssH*dpr);if(lobbyMapPreview.width!==pw)lobbyMapPreview.width=pw;if(lobbyMapPreview.height!==ph)lobbyMapPreview.height=ph;const c=lobbyMapPreview.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,cssW,cssH);c.fillStyle='#080d10';c.fillRect(0,0,cssW,cssH);const pad=12,size=Math.max(1,Math.min(cssW-pad*2,cssH-pad*2)),x=(cssW-size)/2,y=(cssH-size)/2,staticMap=getMinimapStatic(768,768,mapId);c.drawImage(staticMap,x,y,size,size);c.strokeStyle='rgba(255,255,255,.22)';c.lineWidth=1;c.strokeRect(x+.5,y+.5,size-1,size-1);c.fillStyle='rgba(5,8,10,.72)';c.fillRect(x,y,34,20);c.fillStyle='#fff';c.textAlign='center';c.textBaseline='middle';c.font='1000 11px system-ui';c.fillText('N',x+17,y+10);
}

function drawMiniMap(c,r){
  const mapLimit=minimapWorldLimit(),ix=r.x,iy=r.y,iw=r.w,ih=r.h,cx=ix+iw/2,cy=iy+ih/2,visibleWorld=(mapLimit*2)/MINIMAP_ZOOM,ppm=iw/visibleWorld,now=performance.now(),staticMap=getMinimapStatic(),staticScale=(mapLimit*2)/staticMap.width,headingUp=playerSettings.minimapOrientation!=='north',rotation=headingUp?yaw:0,sinR=Math.sin(rotation),cosR=Math.cos(rotation);
  c.save();c.beginPath();if(typeof c.roundRect==='function')c.roundRect(ix,iy,iw,ih,7);else c.rect(ix,iy,iw,ih);c.clip();
  c.fillStyle='rgba(8,13,17,.58)';c.fillRect(ix,iy,iw,ih);
  const playerMapX=(position.x+mapLimit)/staticScale,playerMapY=(position.z+mapLimit)/staticScale,drawScale=ppm*staticScale;
  c.save();c.translate(cx,cy);if(headingUp)c.rotate(yaw);c.globalAlpha=.96;c.drawImage(staticMap,-playerMapX*drawScale,-playerMapY*drawScale,staticMap.width*drawScale,staticMap.height*drawScale);c.globalAlpha=1;c.restore();
  const toMap=(x,z)=>{const dx=(x-position.x)*ppm,dz=(z-position.z)*ppm;return{x:cx+dx*cosR-dz*sinR,y:cy+dx*sinR+dz*cosR};};
  const edgePad=8,edgeHalfW=Math.max(1,iw/2-edgePad),edgeHalfH=Math.max(1,ih/2-edgePad);
  const clampMinimapMarker=p=>{const dx=p.x-cx,dy=p.y-cy,inside=Math.abs(dx)<=edgeHalfW&&Math.abs(dy)<=edgeHalfH;if(inside)return{x:p.x,y:p.y,edge:false,angle:0};const sx=Math.abs(dx)>1e-6?edgeHalfW/Math.abs(dx):Infinity,sy=Math.abs(dy)>1e-6?edgeHalfH/Math.abs(dy):Infinity,k=Math.min(sx,sy);return{x:cx+dx*k,y:cy+dy*k,edge:true,angle:Math.atan2(dy,dx)};};
  for(const rmt of remotes.values()){if(!matchState.minimapRevealAll&&!modeFriendly(rmt.team)&&now>=rmt.revealedUntil)continue;const p=clampMinimapMarker(toMap(rmt.group.position.x,rmt.group.position.z)),humanTeammate=!rmt.bot&&modeFriendly(rmt.team),color=minimapDotColor(rmt);if(p.edge){c.save();c.translate(p.x,p.y);c.rotate(p.angle+Math.PI/2);c.beginPath();c.moveTo(0,-4.8);c.lineTo(3.8,3.4);c.lineTo(0,2);c.lineTo(-3.8,3.4);c.closePath();c.fillStyle=color;c.fill();c.strokeStyle=modeFriendly(rmt.team)?(humanTeammate?'#d8ffe3':'#fff'):'rgba(255,255,255,.72)';c.lineWidth=1;c.stroke();c.restore();}else if(matchState.minimapDirectional){const markerYaw=Number.isFinite(rmt.targetYaw)?rmt.targetYaw:rmt.group.rotation.y,markerRotation=headingUp?yaw-markerYaw:-markerYaw;c.save();c.translate(p.x,p.y);c.rotate(markerRotation);c.beginPath();c.moveTo(0,-5.2);c.lineTo(3.8,4);c.lineTo(0,2.7);c.lineTo(-3.8,4);c.closePath();c.fillStyle=color;c.fill();c.strokeStyle=modeFriendly(rmt.team)?(humanTeammate?'#d8ffe3':'#fff'):'rgba(255,255,255,.72)';c.lineWidth=1;c.stroke();c.restore();}else{c.beginPath();c.arc(p.x,p.y,3.3,0,Math.PI*2);c.fillStyle=color;c.fill();if(modeFriendly(rmt.team)){c.strokeStyle=humanTeammate?'#d8ffe3':'#fff';c.lineWidth=1;c.stroke();}}}
  c.save();c.translate(cx,cy);if(!headingUp)c.rotate(-yaw);c.beginPath();c.moveTo(0,-6.5);c.lineTo(4.8,5.2);c.lineTo(0,3.2);c.lineTo(-4.8,5.2);c.closePath();c.fillStyle=selfColor;c.fill();c.strokeStyle='#fff';c.lineWidth=1.2;c.stroke();c.restore();
  const vignette=c.createRadialGradient(cx,cy,Math.min(iw,ih)*.28,cx,cy,Math.min(iw,ih)*.72);vignette.addColorStop(0,'rgba(5,9,12,0)');vignette.addColorStop(.68,'rgba(5,9,12,0)');vignette.addColorStop(.88,'rgba(5,9,12,.18)');vignette.addColorStop(1,'rgba(5,9,12,.72)');c.fillStyle=vignette;c.fillRect(ix,iy,iw,ih);
  const topFade=c.createLinearGradient(0,iy,0,iy+22);topFade.addColorStop(0,'rgba(5,9,12,.58)');topFade.addColorStop(1,'rgba(5,9,12,0)');c.fillStyle=topFade;c.fillRect(ix,iy,iw,22);
  const cardinalRadius=Math.max(10,Math.min(iw,ih)*.5-10),cards=[['N',0,-1],['E',1,0],['S',0,1],['W',-1,0]];c.textAlign='center';c.textBaseline='middle';c.font='1000 9px system-ui';c.fillStyle='rgba(255,255,255,.82)';for(const [label,dx,dz] of cards){const sx=headingUp?(dx*cosR-dz*sinR):dx,sy=headingUp?(dx*sinR+dz*cosR):dz;c.fillText(label,cx+sx*cardinalRadius,cy+sy*cardinalRadius);}
  const bottomFade=c.createLinearGradient(0,iy+ih-25,0,iy+ih);bottomFade.addColorStop(0,'rgba(5,9,12,0)');bottomFade.addColorStop(1,'rgba(5,9,12,.76)');c.fillStyle=bottomFade;c.fillRect(ix,iy+ih-25,iw,25);
  c.restore();
  c.textBaseline='middle';c.font=`900 ${r.w<110?9.5:10.5}px system-ui`;c.textAlign='left';c.fillStyle='rgba(255,255,255,.88)';c.fillText(currentRoom||'----',r.x+6,r.y+r.h-7);c.textAlign='right';c.fillStyle='rgba(211,222,230,.82)';const humanCount=[...remotes.values()].filter(v=>!v.bot).length+1,botTotal=[...remotes.values()].filter(v=>v.bot).length;c.fillText(`${humanCount}P · ${botTotal}B`,r.x+r.w-6,r.y+r.h-7);
}

function handleKill(m){
  if(!m?.attacker||!m?.victim)return;const update=p=>{if(!p)return;if(p.id===clientId){myStats.kills=Number(p.kills)||0;myStats.deaths=Number(p.deaths)||0;}else{const r=remotes.get(p.id);if(r){r.kills=Number(p.kills)||0;r.deaths=Number(p.deaths)||0;}}};update(m.attacker);update(m.victim);
  if(m.victim.id===clientId){lastWastedBy=m.attacker.name||'Player';lastWastedWeapon=m.weapon||'';lastWastedHeadshot=!!m.headshot;lastWastedDistance=Math.max(0,Number(m.distance)||0);const killer=remotes.get(m.attacker.id);if(killer){const dx=killer.group.position.x-position.x,dz=killer.group.position.z-position.z;if(Math.hypot(dx,dz)>.05)deathViewTargetYaw=Math.atan2(-dx,-dz);}}
  const mine=m.attacker.id===clientId&&m.victim.id!==clientId,multi=Math.max(0,Number(m.multiKill)||0),distance=Math.max(0,Number(m.distance)||0);
  if(mine){
    killConfirmName=m.victim.name||'Player';killConfirmWeapon=m.weapon||'pistol';killConfirmHeadshot=!!m.headshot;killConfirmDistance=distance;killConfirmUntil=performance.now()+1050;soundKill();
    if(multi===2)queueAnnouncer('DOUBLE KILL','',1500,3);
    else if(multi===3)queueAnnouncer('TRIPLE KILL','',1650,5);
    else if(multi>=4)queueAnnouncer('MULTI-KILL',`×${multi}`,1750,6);
    if(distance>=LONG_SHOT_DISTANCE)queueAnnouncer('LONG SHOT',`${distance.toFixed(1)} m`,1650,4);
  }else if(multi===3)queueAnnouncer('TRIPLE KILL',m.attacker.name||'Player',1550,2);
  else if(multi>=4)queueAnnouncer('MULTI-KILL',`${m.attacker.name||'Player'} · ×${multi}`,1650,2);
  addKillFeed(m);
}
function addKillFeed(m){if(!m?.attacker||!m?.victim)return;killFeed.unshift({attacker:m.attacker,victim:m.victim,weapon:m.weapon||'pistol',headshot:!!m.headshot,distance:Math.max(0,Number(m.distance)||0),until:performance.now()+6500});if(killFeed.length>6)killFeed.length=6;}
function drawKillFeed(c,r,now){
  while(killFeed.length&&killFeed[killFeed.length-1].until<now)killFeed.pop();
  c.save();c.beginPath();c.rect(r.x,r.y,r.w,r.h);c.clip();let y=r.y;
  for(const item of killFeed){const h=23,localKill=item.attacker.id===clientId&&item.victim.id!==clientId,localDeath=item.victim.id===clientId,weapon=`${WEAPON_SPECS[item.weapon]?.short||EQUIPMENT_SPECS[item.weapon]?.short||'PST'}${item.headshot?' ◆':''}`;if(y+h>r.y+r.h)break;
    const fill=localKill?'rgba(30,42,20,.91)':localDeath?'rgba(53,12,18,.91)':'rgba(9,11,13,.76)',line=localKill?'rgba(215,255,88,.34)':localDeath?'rgba(255,82,101,.34)':'rgba(255,255,255,.09)';roundRect(c,r.x,y,r.w,h,6,fill,line);
    const teamBased=currentModeSpec().teamBased,attackerColor=teamBased?(TEAM_COLORS[item.attacker.team]||'#fff'):(localKill?HUD_ACCENT:TEAM_COLORS.red),victimColor=teamBased?(TEAM_COLORS[item.victim.team]||'#fff'):(localDeath?'#ff7b8a':TEAM_COLORS.red);c.fillStyle=localKill?HUD_ACCENT:localDeath?'#ff5367':attackerColor;c.fillRect(r.x,y,3,h);
    const innerW=Math.max(40,r.w-17),weaponBudget=Math.min(66,innerW*.30),nameBudget=Math.max(28,(innerW-weaponBudget-8)/2);c.font=`${localKill||localDeath?'1000':'900'} 11px system-ui`;c.textAlign='left';c.fillStyle=localKill?HUD_ACCENT:'#fff';const attacker=clipHudText(c,item.attacker.name||'Player',nameBudget);c.fillText(attacker,r.x+9,y+h/2);
    const aw=c.measureText(attacker).width;c.fillStyle=item.headshot?'#ffd36d':'#89959e';c.font='900 9px system-ui';const weaponText=clipHudText(c,weapon,weaponBudget);c.fillText(` ${weaponText} `,r.x+11+aw,y+h/2);
    const ww=c.measureText(` ${weaponText} `).width;c.fillStyle=localDeath?'#ff9ba5':victimColor;c.font=`${localDeath?'1000':'900'} 11px system-ui`;const victimX=r.x+13+aw+ww,victim=clipHudText(c,item.victim.name||'Player',Math.max(24,r.x+r.w-7-victimX));c.fillText(victim,victimX,y+h/2);y+=h+4;
  }
  c.restore();
}

function drawMenuButton(c,r){roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);const cx=r.x+r.w/2,cy=r.y+r.h/2;c.save();c.strokeStyle='rgba(245,249,252,.92)';c.lineWidth=1.8;c.lineCap='round';for(const off of [-5,0,5]){c.beginPath();c.moveTo(cx-7,cy+off);c.lineTo(cx+7,cy+off);c.stroke();}c.restore();}
function drawWeaponCrosshair(c,x,y,weapon,hit,ads=0,headshot=false){if(combatActionActive())return;const adsAmount=Math.max(0,Math.min(1,ads)),hideInAds=weaponUsesIronSights(weapon)||weapon==='grenadeLauncher',adsFade=weapon==='sniper'?1-smoothstep01((adsAmount-.16)/.20):hideInAds?1-smoothstep01((adsAmount-.52)/.42):1;if(adsFade<=.01)return;const color=headshot?'#ffd36d':hit?'#fff':'rgba(255,255,255,.94)',gap=accuracyCrosshairRadius();c.save();c.globalAlpha=adsFade;c.strokeStyle=color;c.fillStyle=color;c.shadowColor='rgba(0,0,0,.88)';c.shadowBlur=3;c.lineWidth=hit?2.35:1.65;c.lineCap='round';
  if(weapon==='grenadeLauncher'){
    // Launcher-specific range ladder: center aiming ring plus descending holdover
    // marks communicates the grenade's arcing trajectory instead of reusing a
    // rifle crosshair that implies a flat shot.
    const spread=Math.max(7,gap*.72),ring=4.3+spread*.08;c.lineWidth=hit?2.2:1.45;c.beginPath();c.arc(x,y,ring,0,Math.PI*2);c.stroke();c.beginPath();c.arc(x,y,1.15,0,Math.PI*2);c.fill();
    const ladder=[{dy:14,w:13},{dy:25,w:18},{dy:38,w:24},{dy:53,w:30}];c.beginPath();c.moveTo(x,y+ring+3);c.lineTo(x,y+57);for(const mark of ladder){c.moveTo(x-mark.w/2,y+mark.dy);c.lineTo(x+mark.w/2,y+mark.dy);}c.stroke();
    c.globalAlpha=.72;c.lineWidth=1.1;c.beginPath();c.moveTo(x-18-spread*.25,y-5);c.quadraticCurveTo(x-23-spread*.3,y,x-18-spread*.25,y+5);c.moveTo(x+18+spread*.25,y-5);c.quadraticCurveTo(x+23+spread*.3,y,x+18+spread*.25,y+5);c.stroke();
  }else if(weapon==='akimbo1887'){const r=Math.max(38,Math.min(64,gap*1.12+10)),arc=.82;c.lineWidth=hit?2.65:2.05;c.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2-arc/2;c.arc(x,y,r,a,a+arc);}c.stroke();c.globalAlpha*=.72;c.lineWidth=1.2;c.beginPath();c.arc(x,y,Math.max(9,r*.24),0,Math.PI*2);c.stroke();c.globalAlpha=adsFade;c.beginPath();c.arc(x,y,1.8,0,Math.PI*2);c.fill();
  }else if(weapon==='shotgun'||weapon==='semiShotgun'){const r=Math.max(8,gap),arc=.50;c.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2-arc/2;c.arc(x,y,r,a,a+arc);}c.stroke();c.beginPath();c.arc(x,y,1.5,0,Math.PI*2);c.fill();}
  else{const len=weapon==='machineGun'?9:weapon==='assault'?8:weapon==='sniper'?6:5.5,inner=Math.max(3.5,gap);if(weapon==='sniper')c.lineWidth=1.2;c.beginPath();c.moveTo(x-inner-len,y);c.lineTo(x-inner,y);c.moveTo(x+inner,y);c.lineTo(x+inner+len,y);c.moveTo(x,y-inner-len);c.lineTo(x,y-inner);c.moveTo(x,y+inner);c.lineTo(x,y+inner+len);c.stroke();c.beginPath();c.arc(x,y,weapon==='assault'?1.35:weapon==='sniper'?1.1:1.6,0,Math.PI*2);c.fill();}
  c.restore();}

function drawHitConfirm(c,x,y,headshot=false){const size=headshot?8.5:7,gap=4.5;c.save();c.strokeStyle=headshot?'#ffd36d':'rgba(255,255,255,.98)';c.lineWidth=headshot?2.5:2.15;c.lineCap='round';c.shadowColor='rgba(0,0,0,.92)';c.shadowBlur=3;c.beginPath();c.moveTo(x-gap-size,y-gap-size);c.lineTo(x-gap,y-gap);c.moveTo(x+gap,y+gap);c.lineTo(x+gap+size,y+gap+size);c.moveTo(x+gap+size,y-gap-size);c.lineTo(x+gap,y-gap);c.moveTo(x-gap,y+gap);c.lineTo(x-gap-size,y+gap+size);c.stroke();c.restore();}

function drawScopeMask(c,w,h,amount=1){
  const a=THREE.MathUtils.clamp(amount,0,1),r=Math.min(w,h)*SNIPER_SCOPE_SCREEN_RADIUS,cx=w/2,cy=h/2;if(a<=.001)return;
  c.save();c.beginPath();c.rect(0,0,w,h);c.arc(cx,cy,r,0,Math.PI*2,true);c.fillStyle=`rgba(0,0,0,${.985*a})`;c.fill('evenodd');
  c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.clip();const vignette=c.createRadialGradient(cx,cy,r*.62,cx,cy,r);vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(.82,`rgba(0,0,0,${.035*a})`);vignette.addColorStop(1,`rgba(0,0,0,${.46*a})`);c.fillStyle=vignette;c.fillRect(cx-r,cy-r,r*2,r*2);c.restore();
  c.save();c.globalAlpha=a;c.strokeStyle='rgba(7,9,11,.98)';c.lineWidth=5;c.beginPath();c.arc(cx,cy,r-1.5,0,Math.PI*2);c.stroke();c.strokeStyle='rgba(255,255,255,.10)';c.lineWidth=1;c.beginPath();c.arc(cx,cy,r-4,0,Math.PI*2);c.stroke();c.restore();
}
function drawScopeReticle(c,w,h,hit,headshot=false,amount=1){
  const a=THREE.MathUtils.clamp(amount,0,1),r=Math.min(w,h)*SNIPER_SCOPE_SCREEN_RADIUS,cx=w/2,cy=h/2,gap=Math.max(7,r*.032),post=Math.max(30,r*.17);if(a<=.001)return;
  c.save();c.globalAlpha=a;c.strokeStyle='rgba(8,11,13,.94)';c.fillStyle='rgba(8,11,13,.94)';c.lineCap='butt';
  c.lineWidth=3.4;c.beginPath();c.moveTo(cx-r+8,cy);c.lineTo(cx-post,cy);c.moveTo(cx+post,cy);c.lineTo(cx+r-8,cy);c.moveTo(cx,cy-r+8);c.lineTo(cx,cy-post);c.moveTo(cx,cy+post);c.lineTo(cx,cy+r-8);c.stroke();
  c.lineWidth=1.35;c.beginPath();c.moveTo(cx-post,cy);c.lineTo(cx-gap,cy);c.moveTo(cx+gap,cy);c.lineTo(cx+post,cy);c.moveTo(cx,cy-post);c.lineTo(cx,cy-gap);c.moveTo(cx,cy+gap);c.lineTo(cx,cy+post);c.stroke();
  c.beginPath();c.arc(cx,cy,1.65,0,Math.PI*2);c.fill();
  c.font='900 9px system-ui';c.textAlign='center';c.fillStyle='rgba(255,255,255,.72)';c.shadowColor='rgba(0,0,0,.8)';c.shadowBlur=2;c.fillText(sniperZoomLabel(),cx,cy-r+20);c.restore();
}
function drawTouchControls(c,L,now){
  c.save();if(touchRoleActive('joy')){const j={x:joy.centerX,y:joy.centerY,r:L.joy.r};c.beginPath();c.arc(j.x,j.y,j.r,0,Math.PI*2);c.fillStyle='rgba(9,11,13,.42)';c.fill();c.strokeStyle='rgba(255,255,255,.24)';c.lineWidth=1.5;c.stroke();c.beginPath();c.arc(j.x,j.y,j.r*.72,0,Math.PI*2);c.strokeStyle='rgba(255,255,255,.08)';c.stroke();const max=j.r*.45,sx=j.x+joy.x*max,sy=j.y+joy.y*max;c.beginPath();c.arc(sx,sy,j.r*.40,0,Math.PI*2);c.fillStyle='rgba(215,255,88,.16)';c.fill();c.strokeStyle='rgba(215,255,88,.42)';c.stroke();c.fillStyle='rgba(255,255,255,.58)';c.font='900 10px system-ui';c.textAlign='center';c.fillText(sprinting?'SPRINT':'MOVE',j.x,j.y+j.r*.70);}c.restore();
  const weaponLocked=!combatWeaponAvailable(now);
  drawRoundControl(c,L.leftFire,now<touchVisual.fireUntil,'fire',weaponLocked);drawRoundControl(c,L.crouch,crouched,'crouch');drawRoundControl(c,L.flash,equipmentAimKind()===tacticalEquipment||now<touchVisual.flashUntil,'flash');drawRoundControl(c,L.sticky,equipmentAimKind()===lethalEquipment||now<touchVisual.stickyUntil,'sticky');
  drawRoundControl(c,L.fire,now<touchVisual.fireUntil,'fire',weaponLocked);if(currentWeapon!=='akimbo1887')drawRoundControl(c,L.aim,adsWanted,'aim',weaponLocked);drawRoundControl(c,L.jump,now<touchVisual.jumpUntil,'jump');
  drawRoundControl(c,L.reload,now<touchVisual.reloadUntil||!!reloadUntil,'reload',weaponLocked);drawRoundControl(c,L.swap,now<touchVisual.swapUntil,'swap',weaponLocked);
  if(currentWeapon==='assault')drawRoundControl(c,L.mode,now<touchVisual.modeUntil||assaultFireMode==='auto','mode',weaponLocked);
}
function drawRoundControl(c,b,active,type,disabled=false){
  c.save();if(disabled)c.globalAlpha=.34;c.beginPath();c.arc(b.x,b.y,b.r,0,Math.PI*2);const hot=type==='fire',aim=type==='aim';c.fillStyle=active?(aim?'rgba(215,255,88,.30)':hot?'rgba(255,95,103,.48)':'rgba(215,255,88,.22)'):(hot?'rgba(60,22,25,.56)':'rgba(9,11,13,.62)');c.fill();c.strokeStyle=active?(aim?HUD_ACCENT:hot?'rgba(255,132,139,.86)':HUD_ACCENT):(hot?'rgba(255,115,123,.52)':'rgba(255,255,255,.22)');c.lineWidth=active?2:1.4;c.stroke();drawControlIcon(c,b.x,b.y-b.r*.08,b.r,type,active);
  const label=type==='fire'?'FIRE':type==='aim'?(currentWeapon==='sniper'?(adsWanted?(sniperZoomLevel===1?sniperHighZoomLabel():'EXIT'):sniperLowZoomLabel()):'ADS'):type==='jump'?(ladderState?'JUMP OFF':traversal?'CLIMB':'JUMP'):type==='crouch'?(sliding?'SLIDE':crouched?'STAND':'CROUCH'):type==='reload'?'RELOAD':type==='swap'?'SWAP':type==='mode'?assaultFireMode.toUpperCase():type==='flash'?(equipmentAimKind()===tacticalEquipment?'THROW':`${tacticalEquipment==='flash'?'FLASH':'SMOKE'} ${godMode?'∞':equipment[tacticalEquipment]||0}`):type==='sticky'?(equipmentAimKind()===lethalEquipment?'THROW':`${lethalEquipment==='sticky'?'SEMTEX':'FRAG'} ${godMode?'∞':equipment[lethalEquipment]||0}`):'';c.textAlign='center';c.fillStyle=active?'#fff':'rgba(230,243,249,.68)';c.font=`900 ${Math.max(8,Math.min(10,b.r*.26))}px system-ui`;c.fillText(label,b.x,b.y+b.r*.56,Math.max(26,b.r*1.55));c.restore();
}
function drawControlIcon(c,x,y,r,type,active){
  const q=Math.max(8,r*.44),ink=active?'#fff':'rgba(241,250,255,.92)';
  c.save();c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=Math.max(1.35,r*.055);c.lineCap='round';c.lineJoin='round';
  if(type==='fire'){
    const a=q*.63,g=q*.24;c.beginPath();c.moveTo(x-a,y-g);c.lineTo(x-a,y-a);c.lineTo(x-g,y-a);c.moveTo(x+g,y-a);c.lineTo(x+a,y-a);c.lineTo(x+a,y-g);c.moveTo(x+a,y+g);c.lineTo(x+a,y+a);c.lineTo(x+g,y+a);c.moveTo(x-g,y+a);c.lineTo(x-a,y+a);c.lineTo(x-a,y+g);c.stroke();c.beginPath();c.arc(x,y,q*.105,0,Math.PI*2);c.fill();
  }else if(type==='aim'){
    const a=q*.68,g=q*.22;c.beginPath();c.moveTo(x-a,y-g);c.lineTo(x-a,y-a);c.lineTo(x-g,y-a);c.moveTo(x+g,y-a);c.lineTo(x+a,y-a);c.lineTo(x+a,y-g);c.moveTo(x+a,y+g);c.lineTo(x+a,y+a);c.lineTo(x+g,y+a);c.moveTo(x-g,y+a);c.lineTo(x-a,y+a);c.lineTo(x-a,y+g);c.stroke();c.beginPath();c.arc(x,y,q*.18,0,Math.PI*2);c.stroke();
  }else if(type==='jump'){
    c.beginPath();c.moveTo(x-q*.55,y+q*.25);c.lineTo(x,y-q*.48);c.lineTo(x+q*.55,y+q*.25);c.stroke();c.beginPath();c.moveTo(x-q*.52,y+q*.56);c.lineTo(x+q*.52,y+q*.56);c.stroke();
  }else if(type==='reload'){
    c.beginPath();c.arc(x,y,q*.56,-.7,Math.PI*1.45);c.stroke();c.beginPath();c.moveTo(x+q*.42,y-q*.46);c.lineTo(x+q*.72,y-q*.42);c.lineTo(x+q*.58,y-q*.14);c.stroke();
  }else if(type==='swap'){
    c.beginPath();c.moveTo(x-q*.66,y-q*.26);c.lineTo(x+q*.43,y-q*.26);c.lineTo(x+q*.20,y-q*.49);c.moveTo(x+q*.66,y+q*.26);c.lineTo(x-q*.43,y+q*.26);c.lineTo(x-q*.20,y+q*.49);c.stroke();
  }else if(type==='flash'){
    c.beginPath();c.roundRect(x-q*.38,y-q*.45,q*.76,q*.78,q*.18);c.stroke();c.beginPath();c.moveTo(x-q*.10,y-q*.55);c.lineTo(x+q*.18,y-q*.72);c.lineTo(x+q*.34,y-q*.60);c.stroke();for(const a of [-.9,0,.9]){const sx=x+Math.sin(a)*q*.66,sy=y+Math.cos(a)*q*.66;c.beginPath();c.moveTo(sx,sy);c.lineTo(x+Math.sin(a)*q*.84,y+Math.cos(a)*q*.84);c.stroke();}
  }else if(type==='sticky'){
    c.beginPath();c.arc(x,y,q*.50,0,Math.PI*2);c.stroke();c.beginPath();c.arc(x,y,q*.15,0,Math.PI*2);c.fill();c.beginPath();c.moveTo(x-q*.12,y-q*.55);c.lineTo(x+q*.18,y-q*.76);c.lineTo(x+q*.34,y-q*.62);c.stroke();
  }else if(type==='crouch'){
    c.beginPath();c.arc(x-q*.28,y-q*.32,q*.18,0,Math.PI*2);c.stroke();c.beginPath();c.moveTo(x-q*.13,y-q*.18);c.lineTo(x+q*.12,y+q*.04);c.lineTo(x+q*.48,y+q*.04);c.moveTo(x+q*.12,y+q*.04);c.lineTo(x-q*.10,y+q*.36);c.moveTo(x+q*.10,y+q*.05);c.lineTo(x+q*.34,y+q*.35);c.stroke();
  }else if(type==='mode'){
    const n=assaultFireMode==='auto'?3:1;for(let i=0;i<n;i++){const yy=y+(i-(n-1)/2)*q*.33;c.beginPath();c.roundRect(x-q*.50,yy-q*.085,q*.82,q*.17,q*.085);c.fill();c.beginPath();c.moveTo(x+q*.35,yy);c.lineTo(x+q*.58,yy);c.stroke();}
  }
  c.restore();
}


function roundRect(c,x,y,w,h,r,fill,stroke){if(w<=0||h<=0)return;c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}}

function startIntroMusic(){
  if(masterMuted||shell.inMatch||introMusicHandle)return;
  introMusicHandle=playSoundCue('introMusic',1,{loop:true,onended:()=>{introMusicHandle=null;}});
}
function stopIntroMusic(){if(introMusicHandle){introMusicHandle.stop();introMusicHandle=null;}}



function weaponShotSoundId(weapon='pistol',suppressed=false){
  if(suppressed){if(weapon==='pistol')return'shotPistolSuppressed';if(weapon==='akimbo1887')return'shot1887Suppressed';if(weapon==='assault')return'shotAssaultSuppressed';if(weapon==='ump')return'shotUmpSuppressed';if(weapon==='machineGun')return'shotMachineGunSuppressed';if(weapon==='shotgun')return'shotShotgunSuppressed';if(weapon==='sniper')return'shotSniperSuppressed';}
  return weapon==='assault'?'shotAssault':weapon==='ump'?'shotUmp':weapon==='machineGun'?'shotMachineGun':weapon==='akimbo1887'?'shot1887':weapon==='shotgun'?'shotShotgun':weapon==='semiShotgun'?'shotSemiShotgun':weapon==='sniper'?'shotSniper':weapon==='grenadeLauncher'?'shotGl':weapon==='rpg'?'shotRpg':'shotPistol';
}
function weaponAudibleDistance(weapon='pistol',suppressed=false){
  if(suppressed)return weapon==='sniper'?70:weapon==='machineGun'?64:weapon==='assault'?62:weapon==='shotgun'||weapon==='akimbo1887'?58:54;
  return weapon==='sniper'?135:weapon==='rpg'?130:weapon==='machineGun'?115:weapon==='shotgun'||weapon==='akimbo1887'?108:weapon==='assault'?105:weapon==='grenadeLauncher'?100:weapon==='ump'?92:78;
}
function weaponShotVariation(weapon='pistol'){
  const spread=weapon==='machineGun'?.020:(weapon==='assault'||weapon==='ump') ? .016 : (weapon==='shotgun'||weapon==='semiShotgun'||weapon==='akimbo1887') ? .010 : .006;
  return{playbackRate:1+(Math.random()*2-1)*spread,volume:.97+Math.random()*.06};
}
function attachmentShotTone(weapon,mods){let volume=1,rate=1;if(weaponHasAttachment(weapon,mods,'shortBarrel')){volume*=1.08;rate*=1.035;}if(weaponHasAttachment(weapon,mods,'heavyBarrel')){volume*=.98;rate*=.985;}if(weaponHasAttachment(weapon,mods,'shotgunLongBarrel')){volume*=.98;rate*=.982;}return{volume,rate};}
function soundShot(weapon='pistol',hand='right'){const v=weaponShotVariation(weapon),mods=attachmentsForWeapon(weapon),soundScale=attachmentSoundScale(weapon,mods),tone=attachmentShotTone(weapon,mods),suppressed=weaponHasAttachment(weapon,mods,'suppressor'),pan=weapon==='akimbo1887'?(hand==='left'?-0.42:.42):0;playSoundCue(weaponShotSoundId(weapon,suppressed),v.volume*soundScale*tone.volume,{playbackRate:v.playbackRate*(weapon==='akimbo1887'?1.04:1)*(suppressed?.99:1)*tone.rate,pan,priority:4});}
function reloadSoundId(weapon=currentWeapon){
  return weapon==='assault'?'reloadAssault':weapon==='ump'?'reloadUmp':weapon==='machineGun'?'reloadMachineGun':weapon==='akimbo1887'?'reload1887':weapon==='shotgun'?'reloadShotgun':weapon==='semiShotgun'?'reloadSemiShotgun':weapon==='sniper'?'reloadSniper':weapon==='grenadeLauncher'?'reloadGl':weapon==='rpg'?'reloadRpg':'reloadPistol';
}
function soundReload(weapon=currentWeapon){playSoundCue(reloadSoundId(weapon),1,{playbackRate:.99+Math.random()*.02,priority:3});}
function soundHitmarker(){playSoundCue('hitmarker',1,{priority:5});}
function soundHeadshot(){playSoundCue('headshot',1,{priority:6});}
function soundKill(){playSoundCue('kill',1,{priority:6});}
function soundAnnouncer(priority=1){playSoundCue('announcer',1,{playbackRate:priority>=5?1.08:1,priority:Math.max(3,Math.min(6,priority))});}
function soundShield(){playSoundCue('shield',1,{priority:5});}
function soundHurt(){playSoundCue('hurt',1,{priority:5});}
function soundJump(){playSoundCue('jump');}
function soundFootstep(side=0,volume=1){playSoundCue(side?'footstepRight':'footstepLeft',volume*(.96+Math.random()*.08),{playbackRate:.96+Math.random()*.08});}
function soundLanding(volume=1){playSoundCue('land',volume,{playbackRate:.97+Math.random()*.05});}
function soundSlide(){playSoundCue('slide',.92,{playbackRate:.97+Math.random()*.06});}
function soundShotgunPump(){playSoundCue('shotgunPump',1,{playbackRate:.985+Math.random()*.03});}
function soundThrowableThrow(kind='flash'){playSoundCue(kind==='sticky'||kind==='frag'?'stickyThrow':'flashThrow');}
function soundThrowableImpact(kind='flash',m){if(!m)return;playSpatialCue(kind==='sticky'||kind==='frag'?'stickyImpact':'flashImpact',Number(m.x)||0,Number(m.y)||0,Number(m.z)||0,32,.85);}

function semtexBeepInterval(remainingMs){const p=1-THREE.MathUtils.clamp(Number(remainingMs||0)/1850,0,1);return Math.round(THREE.MathUtils.lerp(360,85,Math.pow(p,1.22)));}
function soundSemtexBeep(g,remainingMs){if(!g?.root)return;const p=1-THREE.MathUtils.clamp(Number(remainingMs||0)/1850,0,1),rate=1+p*.10,interval=semtexBeepInterval(remainingMs)/1000,pos=g.root.position;playSpatialCue('semtexBeep',pos.x,pos.y,pos.z,44,1,{playbackRate:rate,maxDuration:Math.max(.055,Math.min(.18,interval*.72))});}

function soundTacticalDetonation(kind,m){if(!m)return;const cue=kind==='flash'||kind==='smoke'?'flashDetonate':kind==='grenadeLauncher'?'glExplosion':kind==='rpg'?'rpgExplosion':'grenadeExplosion',distance=kind==='rpg'?104:kind==='grenadeLauncher'?88:kind==='sticky'||kind==='frag'?82:62;playSpatialCue(cue,Number(m.x)||0,Number(m.y)||0,Number(m.z)||0,distance,1,{playbackRate:.985+Math.random()*.03,priority:3});}
document.addEventListener('pointerdown',()=>{void ensureAudio();if(!shell.inMatch&&!masterMuted)startIntroMusic();},{capture:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void gameAudio.resume();});
