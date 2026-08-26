window.__breachModuleBooted=true;
import * as HighlandsGeometry from './world-geometry.js?v=1.37.29';
import * as DepotGeometry from './world-geometry-depot.js?v=1.37.29';
import * as YardGeometry from './world-geometry-yard.js?v=1.37.29';
import * as RigGeometry from './world-geometry-rig.js?v=1.37.29';
import * as HighlandsWorldCollision from './world-collision.js?v=1.37.29';
import * as DepotWorldCollision from './world-collision-depot.js?v=1.37.29';
import * as YardWorldCollision from './world-collision-yard.js?v=1.37.29';
import * as RigWorldCollision from './world-collision-rig.js?v=1.37.29';
import {
  APP_VERSION, PROTOCOL_VERSION, ROOM_CODE_LENGTH, MAX_PLAYERS, MAX_BOTS, TEAM_COLORS, WEAPON_ORDER, PRIMARY_WEAPONS, WEAPON_SPECS, weaponSpreadRadians, weaponHeatAfterDelay, weaponHeatAfterShot, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, EQUIPMENT_CAPS, EQUIPMENT_SPECS, TACTICAL_EQUIPMENT, LETHAL_EQUIPMENT, normalizeTactical, normalizeLethal, equipmentForLoadout,
  DEFAULT_WORLD_SETTINGS, DEFAULT_MATCH_RULES, GAME_MODES, DEFAULT_GAME_MODE, normalizeGameMode, gameModeSpec, normalizeWorldSettings, MOVEMENT_FEEL, WEAPON_SWITCH_MS, TACTICAL_THROW_SPEED, TACTICAL_THROW_LOFT, TACTICAL_GRAVITY, SMOKE_DURATION_MS, GROUND_FOLLOW_DROP,
  DEFAULT_MAP_ID, normalizeMapId, mapSpec
} from './game-config.js?v=1.37.29';
import { createProjectileCollisionGrid } from './collision-grid.js?v=1.37.29';
import { createAudioEngine } from './audio-engine.js?v=1.37.29';
import { normalizeMatchState as normalizeSharedMatchState } from './match-model.js?v=1.37.29';
import { MATCH_STATUS, matchAllowsLobbyEdits, matchAllowsMovement, matchAllowsCombat, matchPhaseChanged } from './gameplay-phase.js?v=1.37.29';
import { MAX_PLAYER_PHYSICS_STEP_SEC, advanceVerticalMotion, advanceKnockback, sweepHorizontalMovement, createTraversalPlan, traversalPose, tacticalThrowVelocity, LADDER_CLIMB_SPEED, ladderById, ladderClimbPoint, ladderBottomExitPoint, ladderTopExitPoint, findLadderEntry, ladderClimbStep } from './movement-model.js?v=1.37.29';
import { SHELL_PANEL, createSessionShell, detectInputPlatform } from './app-lifecycle.js?v=1.37.29';
import { GAMEPAD_BUTTON, createGamepadInput } from './gamepad-input.js?v=1.37.29';

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
const COYOTE_TIME_MS = MOVEMENT_FEEL.coyoteTimeMs;
const JUMP_BUFFER_MS = MOVEMENT_FEEL.jumpBufferMs;
const TOUCH_JOY_BUTTON_PADDING = 12;
const CONTROLLER_LOOK_YAW_RATE = 2.75;
const CONTROLLER_LOOK_PITCH_RATE = 2.25;
const CONTROLLER_TRIGGER_THRESHOLD = .28;
function freshClientAmmo(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,WEAPON_SPECS[name].mag]));}
function freshClientEquipment(tactical='flash',lethal='sticky'){return equipmentForLoadout(tactical,lethal);}
const HUD_ACCENT='#d7ff58', HUD_SURFACE='rgba(9,11,13,.90)', HUD_LINE='rgba(255,255,255,.16)', HUD_MUTED='#8b969f';
const CHAT_MAX_LENGTH=120,CHAT_VISIBLE_MS=9000,CHAT_MAX_MESSAGES=28;
const ACTIVE_STATE_INTERVAL = 33;
const IDLE_STATE_INTERVAL = 250;
const LOCAL_PREDICTION_HISTORY_MS = 1500;
const LOCAL_PREDICTION_MAX_SAMPLES = 64;
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
// Entire sound set is generated locally as lightweight 8-bit PCM WAV assets.
// No third-party or runtime-hosted audio is required.
const SOUND_CUES = {
  introMusic:{url:'audio/intro.wav',group:'Music',gain:.48,loop:true},
  shotPistol:{url:'audio/shot-pistol.wav',group:'Gunfire',gain:.72},
  shotAssault:{url:'audio/shot-assault.wav',group:'Gunfire',gain:.60},
  shotShotgun:{url:'audio/shot-shotgun.wav',group:'Gunfire',gain:.82},
  shotSniper:{url:'audio/shot-sniper.wav',group:'Gunfire',gain:.88},
  reloadPistol:{url:'audio/reload-pistol.wav',group:'Weapon Handling',gain:.58},
  reloadAssault:{url:'audio/reload-assault.wav',group:'Weapon Handling',gain:.58},
  reloadShotgun:{url:'audio/reload-shotgun.wav',group:'Weapon Handling',gain:.62},
  shotgunPump:{url:'audio/shotgun-pump.wav',group:'Weapon Handling',gain:.72},
  reloadSniper:{url:'audio/reload-sniper.wav',group:'Weapon Handling',gain:.66},
  hitmarker:{url:'audio/hitmarker.wav',group:'Feedback',gain:.54},
  headshot:{url:'audio/headshot.wav',group:'Feedback',gain:.66},
  kill:{url:'audio/kill.wav',group:'Feedback',gain:.62},
  announcer:{url:'audio/announcer.wav',group:'Feedback',gain:.62},
  shield:{url:'audio/shield.wav',group:'Feedback',gain:.56},
  hurt:{url:'audio/hurt.wav',group:'Feedback',gain:.64},
  jump:{url:'audio/jump.wav',group:'Movement',gain:.40},
  footstepLeft:{url:'audio/footstep-left.wav',group:'Movement',gain:.38},
  footstepRight:{url:'audio/footstep-right.wav',group:'Movement',gain:.38},
  land:{url:'audio/land.wav',group:'Movement',gain:.62},
  flashThrow:{url:'audio/flash-throw.wav',group:'Tactical',gain:.50},
  stickyThrow:{url:'audio/sticky-throw.wav',group:'Tactical',gain:.50},
  flashImpact:{url:'audio/flash-impact.wav',group:'Tactical',gain:.52},
  stickyImpact:{url:'audio/sticky-impact.wav',group:'Tactical',gain:.58},
  semtexBeep:{url:'audio/semtex-beep.wav',group:'Tactical',gain:.58},
  flashDetonate:{url:'audio/flash-detonate.wav',group:'Explosions',gain:.86},
  grenadeExplosion:{url:'audio/grenade-explosion.wav',group:'Explosions',gain:1},
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
const appRoot=$('appRoot'), gameStage=$('gameStage'), entryScreen=$('entryScreen'), rotateGate=$('rotateGate'), menu=$('menu'), lobbyScreen=$('lobbyScreen'), pause=$('pause');
const nameInput=$('nameInput'),codeInput=$('codeInput'),menuStatus=$('menuStatus');
const deployTabs=[...document.querySelectorAll('[data-deploy-tab]')],deployViews=[...document.querySelectorAll('[data-deploy-view]')];
const lobbyModeButtons=[...document.querySelectorAll('[data-lobby-mode-choice]')],lobbyTeamButtons=[...document.querySelectorAll('[data-lobby-team-choice]')],lobbyPrimaryButtons=[...document.querySelectorAll('[data-lobby-primary-choice]')],lobbyTacticalButtons=[...document.querySelectorAll('[data-lobby-tactical-choice]')],lobbyLethalButtons=[...document.querySelectorAll('[data-lobby-lethal-choice]')],lobbyMapButtons=[...document.querySelectorAll('[data-lobby-map-choice]')],lobbySideTabs=[...document.querySelectorAll('[data-lobby-side-tab]')],lobbySideViews=[...document.querySelectorAll('[data-lobby-side-view]')];
const matchPrimaryButtons=[...document.querySelectorAll('[data-match-primary-choice]')],matchTacticalButtons=[...document.querySelectorAll('[data-match-tactical-choice]')],matchLethalButtons=[...document.querySelectorAll('[data-match-lethal-choice]')];
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
let preferredTactical=normalizeTactical(localStorage.getItem('breachTactical'));
let preferredLethal=normalizeLethal(localStorage.getItem('breachLethal'));
let masterMuted=localStorage.getItem('breachMuted')==='1';
const requestedRoom=new URL(location.href).searchParams.get('room');
if(requestedRoom)codeInput.value=normalizeCode(requestedRoom);

let scene, camera, renderer, clock, worldRoot, pistolGroup, pistolFlash, pistolMag, assaultGroup, assaultFlash, assaultMag, umpGroup, umpFlash, umpMag, shotgunGroup, shotgunFlash, shotgunPump, semiShotgunGroup, semiShotgunFlash, semiShotgunMag, sniperGroup, sniperFlash, sniperBolt, grenadeLauncherGroup, grenadeLauncherFlash, rpgGroup, rpgFlash, mantleHands;
let hudScene, hudCamera, hudTexture, hudCanvas, hudCtx, hudScale = 1, hudLastDraw = 0;
let socket = null, reconnectTimer = null, reconnectAttempt = 0;
let currentRoom = '', myName = '', myTeam = preferredTeam, selfColor = TEAM_COLORS.blue, godMode = false, isMatchAdmin = false, matchOwnerId = '', pendingTeam='';
let primaryWeapon=preferredPrimary,tacticalEquipment=preferredTactical,lethalEquipment=preferredLethal,pendingLoadout=null,loadoutDraft=null,loadoutBaseDraft=null,matchState={status:'waiting',round:1,mode:DEFAULT_GAME_MODE,blueScore:0,redScore:0,scoreLimit:DEFAULT_MATCH_RULES.scoreLimit,timeLimitMs:DEFAULT_MATCH_RULES.timeLimitMs,minimapRevealAll:false,minimapDirectional:false,warmupEndsAt:0,endsAt:0,winner:'',winnerId:'',winnerName:'',reason:'',serverTime:0},matchCustom=false;
let hp = 100, wastedUntil = 0, currentWeapon = preferredPrimary, ammo = freshClientAmmo(), equipment=freshClientEquipment(tacticalEquipment,lethalEquipment), reloadUntil = 0, reloadWeapon = '', reloadRequestPending=false, pendingWeapon='';
let flashUntil=0,flashPeakUntil=0;
let assaultFireMode=localStorage.getItem('breachAssaultFireMode')==='semi'?'semi':'auto';
let adsWanted=false,adsBlend=0,baseFov=70,sniperZoomLevel=0,lastWastedBy='',lastWastedWeapon='';
let crouchWanted=false,crouched=false,crouchBlend=0,viewFeetY=NaN;
let correctionViewX=0,correctionViewY=0,correctionViewZ=0;
let myStats={kills:0,deaths:0},scoreboardOpen=false,scoreboardScroll=0,scoreboardDrag=null,scoreboardPanel=null,killConfirmUntil=0,killConfirmName='',killConfirmWeapon='',killConfirmHeadshot=false,killConfirmDistance=0;
let headshotUntil=0,announcerCurrent=null;const announcerQueue=[];
let yaw = 0, pitch = 0, viewRecoilPitch = 0, viewRecoilYaw = 0, viewRecoilPitchVelocity = 0, viewRecoilYawVelocity = 0, verticalVelocity = 0, moveVelocityX = 0, moveVelocityZ = 0, knockX = 0, knockZ = 0, jumpSeq = 0, lastGroundedAt = 0, jumpBufferedUntil = 0;
let traversal=null,traversalSeq=0,traversalIntentUntil=0,traversalIntentSeq=0,traversalConsumedIntentSeq=0;
let ladderState=null,ladderSeq=0;
let onGround = true, lastShotVisualAt = 0, lastLocalShotAt = 0, fireReadyAt = freshClientFireReady(), lastStateSent = 0, lastPing = 0, lastPingLocalAt = 0, serverClockOffset = 0, remoteViewDelayMs=REMOTE_INTERPOLATION_MS, remoteDelayMeanMs=REMOTE_INTERPOLATION_MS, remoteDelayJitterMs=0, remoteDelaySamples=0;
let localShotHeat = Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
let localShotHeatAt = Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
let localRecoilStep = Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
let lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,crouched:false,grounded:true,moveX:0,moveZ:0,ladderId:'',ladderMove:0}, localEquipmentCooldownUntil=0, stateSeq=0, lastCorrectionSeq=0;
const localPredictionHistory=[];
let localMoveAmount=0,moveBobPhase=0,landingKick=0,weaponSwapStartedAt=0,reloadStartedAt=0,deathAnimStartedAt=0,nextFootstepAt=0,footstepSide=0,shotgunPumpStartedAt=0,shotgunPumpSoundPlayed=false;
let gameAudioPreloadPromise=null,gameAudioPreparePromise=null,audioUnlockPromise=null,gameAudioReady=false;
const DEFAULT_PLAYER_SETTINGS=Object.freeze({lookSensitivity:1,adsSensitivity:1,touchSensitivity:1,controllerVerticalSensitivity:1,controllerResponseCurve:'dynamic',controllerAimAssist:'on',controllerMoveDeadzone:.10,controllerLookDeadzone:.07,masterVolume:.85,sfxVolume:.9,musicVolume:.55,graphics:isTouch?'medium':'high',minimapOrientation:'heading'});
function loadPlayerSettings(){
  let saved={};try{saved=JSON.parse(localStorage.getItem('breachPlayerSettings')||'{}')||{}}catch{}
  const numeric=(key,min,max)=>{const raw=saved[key];if(raw===null||raw===undefined||raw==='')return DEFAULT_PLAYER_SETTINGS[key];const value=Number(raw);return Number.isFinite(value)?Math.max(min,Math.min(max,value)):DEFAULT_PLAYER_SETTINGS[key];};
  return {lookSensitivity:numeric('lookSensitivity',.5,2),adsSensitivity:numeric('adsSensitivity',.35,1.25),touchSensitivity:numeric('touchSensitivity',.5,2),controllerVerticalSensitivity:numeric('controllerVerticalSensitivity',.5,1.5),controllerResponseCurve:['dynamic','standard','linear'].includes(saved.controllerResponseCurve)?saved.controllerResponseCurve:DEFAULT_PLAYER_SETTINGS.controllerResponseCurve,controllerAimAssist:saved.controllerAimAssist==='off'?'off':'on',controllerMoveDeadzone:numeric('controllerMoveDeadzone',.02,.25),controllerLookDeadzone:numeric('controllerLookDeadzone',.02,.25),masterVolume:numeric('masterVolume',0,1),sfxVolume:numeric('sfxVolume',0,1),musicVolume:numeric('musicVolume',0,1),graphics:['low','medium','high'].includes(saved.graphics)?saved.graphics:DEFAULT_PLAYER_SETTINGS.graphics,minimapOrientation:['heading','north'].includes(saved.minimapOrientation)?saved.minimapOrientation:DEFAULT_PLAYER_SETTINGS.minimapOrientation};
}
let playerSettings=loadPlayerSettings();
let playerSettingsDraft=null;
const gameAudio=createAudioEngine({cues:SOUND_CUES,getVolumes:()=>({master:masterMuted?0:playerSettings.masterVolume,sfx:playerSettings.sfxVolume,music:playerSettings.musicVolume})});
let introMusicHandle=null;

let toastCurrent=null;const toastQueue=[];let hurtUntil = 0, hitUntil = 0;
let botConfig={blueBots:0,redBots:0,difficulty:'normal'};
const bloodSplats=[];
const damageIndicators=[];
let position = null;
const keys = new Set();
const moveInput = { mx:0, mz:0, len:0 };
const remotes = new Map();
const lobbyParticipants = new Map();
let pendingGameSnapshot = null;
let lobbyMatchDraft=null,lobbyMatchDirty=false,lobbyMatchApplying=false;
let lobbyMapDraft='',lobbyMapDirty=false,lobbyMapApplying=false;
let lobbyLoadoutDraft=null,lobbyLoadoutDirty=false,lobbyLoadoutApplying=false;
const bullets = new Map();
const throwables = new Map();
const tacticalFx = [];
const smokeClouds = new Map();
const rocketTrailPuffs = [];
let sharedSmokeTexture = null;
let equipmentAim={kind:'',startedAt:0};
let trajectoryRibbon=null,trajectoryCenters=null,trajectoryVertices=null,trajectoryMarker=null,trajectoryScratch=null,trajectoryLastUpdate=0;
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
let mouseFireDown=false;
const touchVisual = { jumpUntil:0, fireUntil:0, reloadUntil:0, swapUntil:0, modeUntil:0, flashUntil:0, stickyUntil:0 };
const gamepadInput=createGamepadInput();
const INPUT_MODE=Object.freeze({TOUCH:'touch',KEYBOARD_MOUSE:'keyboardMouse',CONTROLLER:'controller'});
let gamepadFrame=gamepadInput.poll();
let activeInputMode=gamepadFrame.connected?INPUT_MODE.CONTROLLER:(isTouch?INPUT_MODE.TOUCH:INPUT_MODE.KEYBOARD_MOUSE);
let gamepadFireDown=false,controllerOwnsAim=false,lastGamepadKey=gamepadFrame.connected?`${gamepadFrame.index}:${gamepadFrame.id}`:'';
let controllerUiFocus=null,controllerUiEditing=null,controllerUiFocusKey='';
let controllerUiAxisDirection='',controllerUiAxisNextAt=0,controllerUiAxisStartedAt=0,controllerUiAdjusting=null;
appRoot.dataset.inputMode=activeInputMode;

function controllerInputActive(){return activeInputMode===INPUT_MODE.CONTROLLER&&gamepadFrame.connected;}
function touchGameplayControlsVisible(){return isTouch&&activeInputMode===INPUT_MODE.TOUCH&&!chatOpen&&!scoreboardOpen&&!shell.paused&&!shell.panel;}
function clearControllerGameplayInput(){
  gamepadFireDown=false;resetControllerAimMotion();
  if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}
  if(equipmentAim.kind)cancelEquipmentAim();
}
function setActiveInputMode(mode,{quiet=false}={}){
  if(!Object.values(INPUT_MODE).includes(mode)||mode===activeInputMode)return false;
  const previous=activeInputMode;
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
  resetTouchInput();
  clearControllerGameplayInput();
  clearFireInput();
  cancelEquipmentAim();
  setAim(false);
  mouseFireDown=false;
  scoreboardOpen=false;
}

function handleShellState(state){
  if(chatOpen&&(!state.inMatch||state.paused||state.panel||state.connecting))void dismissChat({restorePointer:false});
  if(state.inMatch&&state.paused)syncPauseContext();
  const fsBtn=$('settingsFullscreenBtn');if(fsBtn){fsBtn.textContent=state.standalone?'APP FULLSCREEN':state.fullscreen?'EXIT FULLSCREEN':'ENTER FULLSCREEN';fsBtn.disabled=state.standalone||(!state.fullscreen&&!state.fullscreenSupported);}
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

const ENGINE_MODULE_URL = './vendor/three.module.min.js?v=1.37.29';
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
  // Audio starts unlocking immediately inside the click/tap, but audio readiness
  // never blocks networking or 3D startup. Pending cues wait for the engine.
  const unlockPromise=ensureAudio();
  const engineOk=await ensureThreeEngine();
  if(!engineOk)return false;
  void unlockPromise.then(ok=>{if(ok)void ensureGameAudioReady();});
  return true;
}

bindUI();
let controllerUiFrameLast=performance.now();
function runPreEngineControllerFrame(now){
  requestAnimationFrame(runPreEngineControllerFrame);
  if(engineInitialized){controllerUiFrameLast=now;return;}
  const dt=Math.min(.10,Math.max(0,(now-controllerUiFrameLast)/1000));controllerUiFrameLast=now;updateGamepadInput(dt);
}
requestAnimationFrame(runPreEngineControllerFrame);
refreshMatches();
setInterval(() => { if (!shell.inMatch) refreshMatches(); }, 7000);
void preloadGameAudioAssets();

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
function weaponRules(name){return worldSettings.weapons[name]||DEFAULT_WORLD_SETTINGS.weapons[name];}
function aimSensitivityScale(){if(!adsWanted)return 1;const base=currentWeapon==='sniper'?(sniperZoomLevel>=2?.14:.28):.62;return base*playerSettings.adsSensitivity;}
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
  return t*(.72+.28*t*t);
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
  const targetFov=currentWeapon==='sniper'&&sniperZoomLevel>=2?9.5:(WEAPON_SPECS[currentWeapon]?.adsFov||baseFov);
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
  if(d2>.001)for(const cloud of smokeClouds.values()){const cp=cloud?.root?.position;if(!cp)continue;const t=THREE.MathUtils.clamp(((cp.x-ox)*dx+(cp.y-oy)*dy+(cp.z-oz)*dz)/d2,0,1);if(t<=.03||t>=.98)continue;const px=ox+dx*t,py=oy+dy*t,pz=oz+dz*t,r=Math.max(2.8,(Number(cloud.radius)||9.6)*.55);if((cp.x-px)**2+(cp.y-py)**2+(cp.z-pz)**2<r*r)return false;}
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
function applyControllerAim(dt){
  const input=controllerLookAxes(),now=performance.now(),assist=currentControllerAimAssist(now),breakout=1-smoothstep01(THREE.MathUtils.clamp((input.length-.80)/.20,0,1)),assistStrength=(assist?.strength||0)*breakout;
  if(input.length>.86)controllerTurnBoost=Math.min(1,controllerTurnBoost+dt/.28);else controllerTurnBoost=Math.max(0,controllerTurnBoost-dt/.09);
  const ads=smoothstep01(adsBlend),turnMultiplier=1+controllerTurnBoost*.38*(1-ads*.72),adsScale=controllerAdsSensitivityScale();
  const minSlow=currentWeapon==='sniper'&&ads>.2?(sniperZoomLevel>=2?.48:.52):THREE.MathUtils.lerp(.66,.56,ads),slowdown=assist?THREE.MathUtils.lerp(1,minSlow,assistStrength):1;
  const targetYaw=input.x*CONTROLLER_LOOK_YAW_RATE*playerSettings.lookSensitivity*adsScale*turnMultiplier*slowdown;
  const targetPitch=input.y*CONTROLLER_LOOK_PITCH_RATE*playerSettings.lookSensitivity*playerSettings.controllerVerticalSensitivity*adsScale*turnMultiplier*slowdown;
  const smoothing=1-Math.exp(-dt/.032);controllerAimVelocityX+= (targetYaw-controllerAimVelocityX)*smoothing;controllerAimVelocityY+=(targetPitch-controllerAimVelocityY)*smoothing;
  yaw-=controllerAimVelocityX*dt;pitch-=controllerAimVelocityY*dt;
  if(assist&&assistStrength>.01){const move=controllerMoveAxes(),strafe=THREE.MathUtils.clamp(move.length/.72,0,1),rotWeight=assistStrength*strafe;if(rotWeight>.001){yaw-=THREE.MathUtils.clamp(assist.ndcX,-.75,.75)*.72*rotWeight*dt;pitch+=THREE.MathUtils.clamp(assist.ndcY,-.75,.75)*.54*rotWeight*dt;}}
  pitch=THREE.MathUtils.clamp(pitch,-1.28,1.28);
}
function currentShotHeat(weapon=currentWeapon,now=performance.now()){
  const last=localShotHeatAt[weapon]||0,heat=weaponHeatAfterDelay(weapon,localShotHeat[weapon]||0,last?now-last:0);
  if(heat<.002)return 0;return heat;
}
function currentSpreadRadians(){
  const movement=worldSettings.movement,ads=Math.max(0,Math.min(1,adsBlend)),speed=(adsWanted?movement.walkSpeed:movement.runSpeed)*(crouched?CROUCH_SPEED_MULTIPLIER:1);
  return weaponSpreadRadians(currentWeapon,(localMoveAmount||0)*speed,movement.runSpeed,ads,crouched,!onGround,currentShotHeat());
}
function accuracyCrosshairRadius(){const fov=(camera?.fov||baseFov)*Math.PI/180,spread=currentSpreadRadians();return THREE.MathUtils.clamp(Math.tan(spread)*(viewH*.5)/Math.max(.08,Math.tan(fov*.5)),3.5,52);}
function sniperScopeActive(){return currentWeapon==='sniper'&&adsBlend>.72;}
function sniperZoomLabel(){return sniperZoomLevel>=2?'8X':sniperZoomLevel===1?'4X':'HIP';}
function rememberTeam(team){preferredTeam=team==='red'?'red':'blue';localStorage.setItem('breachTeam',preferredTeam);document.documentElement.style.setProperty('--team',TEAM_COLORS[preferredTeam]);}
function rememberPrimary(weapon){preferredPrimary=PRIMARY_WEAPONS.includes(weapon)?weapon:'assault';localStorage.setItem('breachPrimary',preferredPrimary);}
function rememberEquipment(tactical,lethal){preferredTactical=normalizeTactical(tactical);preferredLethal=normalizeLethal(lethal);localStorage.setItem('breachTactical',preferredTactical);localStorage.setItem('breachLethal',preferredLethal);}
function combatItemName(kind){return EQUIPMENT_SPECS[kind]?.name||WEAPON_SPECS[kind]?.name||String(kind||'').toUpperCase();}
function selectedLoadout(){return{primaryWeapon,tactical:tacticalEquipment,lethal:lethalEquipment};}
function loadoutSummary(loadout=selectedLoadout()){return`${WEAPON_SPECS[loadout.primaryWeapon]?.name||'Assault Rifle'} + Pistol · ${combatItemName(loadout.tactical)} · ${combatItemName(loadout.lethal)}`;}


function syncMusicUI(){
  for(const [useId,btnId] of [['musicIconUse','musicBtn']]){const use=$(useId),btn=$(btnId);if(use)use.setAttribute('href',masterMuted?'#i-mute':'#i-sound');if(btn)btn.setAttribute('aria-label',masterMuted?'Unmute audio':'Mute all audio');}
}
function toggleMasterMute(){masterMuted=!masterMuted;localStorage.setItem('breachMuted',masterMuted?'1':'0');syncMusicUI();if(masterMuted)stopIntroMusic();else if(!shell.inMatch)startIntroMusic();}

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
  if(!player?.id)return null;return {id:String(player.id),name:String(player.name||'Player'),team:player.team==='red'?'red':'blue',bot:!!player.bot,godMode:!!player.godMode,admin:!!player.admin,primaryWeapon:PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:PRIMARY_WEAPONS.includes(player.weapon)?player.weapon:'assault',tactical:normalizeTactical(player.tactical),lethal:normalizeLethal(player.lethal),kills:Number(player.kills)||0,deaths:Number(player.deaths)||0};
}
function replaceLobbyParticipants(players=[],bots=[]){lobbyParticipants.clear();for(const player of [...players,...bots]){const row=normalizeLobbyParticipant(player);if(row&&row.id!==clientId)lobbyParticipants.set(row.id,row);}}
function upsertLobbyParticipant(player){const row=normalizeLobbyParticipant(player);if(row&&row.id!==clientId)lobbyParticipants.set(row.id,row);}
function removeLobbyParticipant(id){lobbyParticipants.delete(String(id||''));}
function syncLobbyBots(list=[]){for(const [id,row] of lobbyParticipants){if(row.bot)lobbyParticipants.delete(id);}for(const bot of list){const row=normalizeLobbyParticipant(bot);if(row)lobbyParticipants.set(row.id,row);}}
function lobbySnapshot(){
  const rows=[{id:clientId,name:myName||safeName(),team:myTeam,bot:false,godMode,admin:isMatchAdmin,primaryWeapon,tactical:tacticalEquipment,lethal:lethalEquipment,kills:myStats.kills||0,deaths:myStats.deaths||0,self:true}];
  for(const row of lobbyParticipants.values())rows.push({...row,self:false});
  return rows;
}
function renderLobbyRoster(){
  if(!lobbyRoster)return;const rows=lobbySnapshot(),mode=currentGameMode(),teamBased=gameModeSpec(mode).teamBased;
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
  const committedMatch=committedLobbyMatchDraft();
  if(!lobbyMatchDraft)lobbyMatchDraft={...committedMatch};
  if(lobbyMatchApplying&&sameLobbyMatchDraft(lobbyMatchDraft,committedMatch)){lobbyMatchApplying=false;lobbyMatchDirty=false;lobbyMatchDraft={...committedMatch};}
  else if(!lobbyMatchDirty&&!lobbyMatchApplying)lobbyMatchDraft={...committedMatch};
  const committedMap=normalizeMapId(currentMapId);if(!lobbyMapDraft)lobbyMapDraft=committedMap;if(lobbyMapApplying&&lobbyMapDraft===committedMap){lobbyMapApplying=false;lobbyMapDirty=false;}else if(!lobbyMapDirty&&!lobbyMapApplying)lobbyMapDraft=committedMap;
  const committedLoadout=normalizeLoadoutChoice(selectedLoadout());if(!lobbyLoadoutDraft)lobbyLoadoutDraft={...committedLoadout};if(lobbyLoadoutApplying&&sameLoadoutChoice(lobbyLoadoutDraft,committedLoadout)){lobbyLoadoutApplying=false;lobbyLoadoutDirty=false;lobbyLoadoutDraft={...committedLoadout};}else if(!lobbyLoadoutDirty&&!lobbyLoadoutApplying)lobbyLoadoutDraft={...committedLoadout};
}
let lobbyHostControlsDocked=false,lobbyGameplayApplying=false,lobbyWeaponsApplying=false;
function restoreAdminTuningNode(nodeId,anchorId){const node=$(nodeId),anchor=$(anchorId);if(node&&anchor&&node.previousElementSibling!==anchor)anchor.after(node);}
function syncLobbyHostControlPlacement(){
  const dock=!!shell.inLobby&&!!isMatchAdmin,gameplay=$('adminGameplay'),weapons=$('adminAdvanced');
  $('lobbyCheatsTab')?.classList.toggle('hide',!dock);
  if(dock){
    if(!lobbyHostControlsDocked){$('lobbyGameplayHostMount')?.append(gameplay);$('lobbyWeaponsHostMount')?.append(weapons);gameplay?.classList.remove('hide');weapons?.classList.remove('hide');populateAdminGameplay(worldSettings);populateAdminWeapons(worldSettings);syncAdminWeaponEditor($('adminWeaponSelect')?.value||'assault');lobbyHostControlsDocked=true;}
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
function applyLobbyGameplayDraft(){if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||!matchAllowsLobbyEdits(matchState)||lobbyGameplayApplying||!lobbyGameplayIsDirty())return;lobbyGameplayApplying=true;send({t:'adminSettings',section:'gameplay',patch:collectAdminGameplayPatch()});setLobbyActionState();}
function applyLobbyWeaponsDraft(){if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||!matchAllowsLobbyEdits(matchState)||lobbyWeaponsApplying||!lobbyWeaponsIsDirty())return;lobbyWeaponsApplying=true;send({t:'adminSettings',section:'advanced',patch:collectAdminWeaponsPatch()});setLobbyActionState();}
let lobbyAutoSaveTimer=0;
function lobbyHasPendingChanges(){return lobbyMatchDirty||lobbyMapDirty||lobbyLoadoutDirty||lobbyGameplayIsDirty()||lobbyWeaponsIsDirty()||lobbyMatchApplying||lobbyMapApplying||lobbyLoadoutApplying||lobbyGameplayApplying||lobbyWeaponsApplying;}
function scheduleLobbyAutoSave(delay=260){
  if(!shell.inLobby)return;clearTimeout(lobbyAutoSaveTimer);lobbyAutoSaveTimer=setTimeout(flushLobbyAutoSave,delay);setLobbyActionState();
}
function flushLobbyAutoSave(){
  lobbyAutoSaveTimer=0;if(!shell.inLobby||socket?.readyState!==WebSocket.OPEN)return;
  if(lobbyLoadoutDirty&&!lobbyLoadoutApplying)saveLobbyLoadoutDraft();
  if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState))return;
  if(lobbyMatchDirty&&!lobbyMatchApplying)applyLobbyMatchDraft();
  if(lobbyMapDirty&&!lobbyMapApplying)applyLobbyMapDraft();
  if(lobbyGameplayIsDirty()&&!lobbyGameplayApplying)applyLobbyGameplayDraft();
  if(lobbyWeaponsIsDirty()&&!lobbyWeaponsApplying)applyLobbyWeaponsDraft();
}
function setLobbyActionState(){
  if(!shell.inLobby)return;const pending=lobbyHasPendingChanges(),status=$('lobbyStatus'),hint=$('lobbyHint');
  if(pending){status.textContent='Saving changes…';hint.textContent='Changes save automatically.';}
  else if(isMatchAdmin){status.textContent='Lobby ready';hint.textContent='Changes save automatically. Start when everyone is ready.';}
  else{status.textContent='Waiting for host';hint.textContent='Choose your team and loadout while the host configures the match.';}
}
function syncLobby(){
  if(!shell.inLobby)return;refreshLobbyDraftOwnership();syncLobbyHostControlPlacement();const mode=currentGameMode(),spec=gameModeSpec(mode),host=!!isMatchAdmin,total=lobbyBotTotal(),draft=lobbyMatchDraft||committedLobbyMatchDraft(),draftSpec=gameModeSpec(draft.mode),draftLoadout=lobbyLoadoutDraft||normalizeLoadoutChoice(selectedLoadout());
  $('lobbyRoomCode').textContent=currentRoom||'----';$('lobbyModeBadge').textContent=spec.name;$('lobbyModeDescription').textContent=lobbyModeDescription(mode);
  $('lobbyTeamGroup').classList.toggle('hide',!spec.teamBased);$('lobbyHostSetup').classList.toggle('hide',!host);$('lobbyGuestSetup').classList.toggle('hide',host);$('lobbySetupOwnerLabel').textContent=host?'Host controls':'Match info';$('lobbyCheatsTab')?.classList.toggle('hide',!host);const godToggle=$('lobbyGodModeToggle');if(godToggle){godToggle.classList.toggle('active',!!godMode);godToggle.setAttribute('aria-checked',String(!!godMode));godToggle.disabled=!host||socket?.readyState!==WebSocket.OPEN;}
  const startBtn=$('lobbyStartBtn'),hostDraftPending=lobbyHasPendingChanges();startBtn.classList.toggle('hide',!host);startBtn.disabled=!matchAllowsLobbyEdits(matchState)||hostDraftPending;
  for(const btn of lobbyTeamButtons)btn.classList.toggle('active',spec.teamBased&&btn.dataset.lobbyTeamChoice===myTeam);
  for(const btn of lobbyPrimaryButtons)btn.classList.toggle('active',btn.dataset.lobbyPrimaryChoice===draftLoadout.primaryWeapon);for(const btn of lobbyTacticalButtons)btn.classList.toggle('active',btn.dataset.lobbyTacticalChoice===draftLoadout.tactical);for(const btn of lobbyLethalButtons)btn.classList.toggle('active',btn.dataset.lobbyLethalChoice===draftLoadout.lethal);
  for(const btn of lobbyModeButtons)btn.classList.toggle('active',btn.dataset.lobbyModeChoice===draft.mode);
  const draftFfa=!draftSpec.teamBased;$('lobbyBlueBotWrap').classList.toggle('hide',draftFfa);$('lobbyRedBotWrap').classList.toggle('hide',draftFfa);$('lobbyFfaBotWrap').classList.toggle('hide',!draftFfa);lobbyBlueBotCount.value=String(draft.blueBots);lobbyRedBotCount.value=String(draft.redBots);lobbyFfaBotCount.value=String(draft.ffaBots);lobbyBotDifficulty.value=draft.difficulty;lobbyMinimapMode.value=draft.minimap;
  const mapChoice=host?(lobbyMapDraft||currentMapId):currentMapId;for(const btn of lobbyMapButtons){btn.classList.toggle('active',btn.dataset.lobbyMapChoice===mapChoice);btn.disabled=!host||!matchAllowsLobbyEdits(matchState)||lobbyMapApplying;}if($('lobbyMapDescription'))$('lobbyMapDescription').textContent=host?'Select a level. Changes save automatically.':'Selected by the host.';renderLobbyMapPreview(mapChoice);
  const sandbox=draftSpec.scoreType==='none';lobbyScoreLimit.value=sandbox?'':String(draft.scoreLimit);lobbyTimeLimit.value=sandbox?'':String(draft.timeLimit);lobbyScoreLimit.disabled=sandbox;lobbyTimeLimit.disabled=sandbox;$('lobbyScoreWrap')?.classList.toggle('disabled-setting',sandbox);$('lobbyTimeWrap')?.classList.toggle('disabled-setting',sandbox);
  const committedRule=spec.scoreType==='none'?'No score / time limit':`First ${matchState.scoreLimit||spec.scoreLimit} · ${Math.max(2,Math.round((matchState.timeLimitMs||spec.timeLimitMs)/60000))} min`,committedMinimap=`Minimap: ${lobbyMinimapModeFromState()==='directional'?'Directional':(lobbyMinimapModeFromState()==='all'?'Always On':'Standard')}`,committedMap=mapSpec(currentMapId).name;$('lobbyGuestMode').textContent=`${spec.name} · ${committedMap}`;$('lobbyGuestBots').textContent=`${total} bot${total===1?'':'s'} · ${(botConfig.difficulty||'normal').replace(/^./,c=>c.toUpperCase())}`;$('lobbyGuestRules').textContent=`${committedRule} · ${committedMinimap}${matchCustom?' · Custom rules':''}`;
  setLobbyActionState();renderLobbyRoster();
}
function showLobby(){const leave=$('leaveBtn');if(leave){leave.disabled=false;const label=leave.querySelector('span');if(label)label.textContent='Return to Lobby';}shell.enterLobby();refreshLobbyDraftOwnership();syncLobby();const url=new URL(location.href);url.searchParams.set('room',currentRoom);history.replaceState(null,'',url);}
function updateLobbyMatchDraftFromControls(){
  if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState)||lobbyMatchApplying)return;if(!lobbyMatchDraft)lobbyMatchDraft=committedLobbyMatchDraft();const spec=gameModeSpec(lobbyMatchDraft.mode),ffa=!spec.teamBased;let blue=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyBlueBotCount.value)||0))),red=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyRedBotCount.value)||0))),ffaBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyFfaBotCount.value)||0)));if(!ffa&&blue+red>MAX_BOTS){showToast(`MAX ${MAX_BOTS} BOTS`);const committed=committedLobbyMatchDraft();blue=committed.blueBots;red=committed.redBots;}
  lobbyMatchDraft={...lobbyMatchDraft,blueBots:blue,redBots:red,ffaBots,difficulty:lobbyBotDifficulty.value,scoreLimit:spec.scoreType==='none'?lobbyMatchDraft.scoreLimit:Math.max(5,Math.min(100,Math.round(Number(lobbyScoreLimit.value)||spec.scoreLimit))),timeLimit:spec.scoreType==='none'?lobbyMatchDraft.timeLimit:Math.max(2,Math.min(30,Math.round(Number(lobbyTimeLimit.value)||spec.timeLimitMs/60000))),minimap:['standard','all','directional'].includes(lobbyMinimapMode.value)?lobbyMinimapMode.value:'standard'};lobbyMatchDirty=!sameLobbyMatchDraft(lobbyMatchDraft,committedLobbyMatchDraft());syncLobby();scheduleLobbyAutoSave();
}
function setLobbyModeDraft(mode){if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState)||lobbyMatchApplying)return;if(!lobbyMatchDraft)lobbyMatchDraft=committedLobbyMatchDraft();lobbyMatchDraft={...lobbyMatchDraft,mode:normalizeGameMode(mode)};lobbyMatchDirty=!sameLobbyMatchDraft(lobbyMatchDraft,committedLobbyMatchDraft());syncLobby();scheduleLobbyAutoSave(180);}
function applyLobbyMatchDraft(){
  if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||!matchAllowsLobbyEdits(matchState)||!lobbyMatchDraft||!lobbyMatchDirty||lobbyMatchApplying)return;const d={...lobbyMatchDraft},spec=gameModeSpec(d.mode);let blue=d.blueBots,red=d.redBots;if(!spec.teamBased){const total=Math.max(0,Math.min(MAX_BOTS,Number(d.ffaBots)||0));blue=Math.ceil(total/2);red=Math.floor(total/2);}else if(blue+red>MAX_BOTS){showToast(`MAX ${MAX_BOTS} BOTS`);return;}lobbyMatchDraft={...d,blueBots:blue,redBots:red,ffaBots:blue+red};lobbyMatchApplying=true;send({t:'lobbyMode',mode:d.mode});if(spec.scoreType!=='none')send({t:'adminMatch',rules:{scoreLimit:d.scoreLimit,timeLimitMs:d.timeLimit*60000}});send({t:'adminBots',blueBots:blue,redBots:red,difficulty:d.difficulty});send({t:'lobbyMinimap',revealAll:d.minimap!=='standard',directional:d.minimap==='directional'});syncLobby();
}
function setLobbyMapDraft(mapId){if(!isMatchAdmin||!matchAllowsLobbyEdits(matchState)||lobbyMapApplying)return;lobbyMapDraft=normalizeMapId(mapId);lobbyMapDirty=lobbyMapDraft!==normalizeMapId(currentMapId);syncLobby();scheduleLobbyAutoSave(160);}
function applyLobbyMapDraft(){if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||!matchAllowsLobbyEdits(matchState)||!lobbyMapDirty||lobbyMapApplying)return;lobbyMapApplying=true;send({t:'lobbyMap',mapId:normalizeMapId(lobbyMapDraft)});syncLobby();}
function setLobbyLoadoutDraft(next={}){if(lobbyLoadoutApplying)return;if(!lobbyLoadoutDraft)lobbyLoadoutDraft=normalizeLoadoutChoice(selectedLoadout());lobbyLoadoutDraft=normalizeLoadoutChoice({...lobbyLoadoutDraft,...next});lobbyLoadoutDirty=!sameLoadoutChoice(lobbyLoadoutDraft,selectedLoadout());syncLobby();scheduleLobbyAutoSave(160);}
function saveLobbyLoadoutDraft(){if(socket?.readyState!==WebSocket.OPEN||!lobbyLoadoutDraft||!lobbyLoadoutDirty||lobbyLoadoutApplying)return;lobbyLoadoutApplying=true;send({t:'loadout',...normalizeLoadoutChoice(lobbyLoadoutDraft)});syncLobby();}

function syncPauseContext(){
  if(shell.inMatch)syncLobbyHostControlPlacement();const spec=currentModeSpec(),badge=$('pauseTeamBadge');if(badge){badge.textContent=spec.teamBased?`${myTeam.toUpperCase()} TEAM`:spec.short;const color=spec.teamBased?TEAM_COLORS[myTeam]:HUD_ACCENT;badge.style.color=color;badge.style.borderColor=`${color}88`;badge.style.background=`${color}22`;}
  if($('pauseRoom'))$('pauseRoom').textContent=`${mapSpec(currentMapId).short} · ${spec.short} · ${currentRoom||'----'}`;
  if($('pauseLoadout'))$('pauseLoadout').textContent=`${loadoutSummary()} · ${Math.max(0,Math.floor(ammo[currentWeapon]||0))} rounds${pendingLoadout?' · CHANGE QUEUED':''}`;
  const adminBtn=$('adminBtn');if(adminBtn)adminBtn.classList.toggle('hide',!isMatchAdmin);
  const teamBtn=$('teamSwitchBtn');if(teamBtn)teamBtn.classList.toggle('hide',!spec.teamBased);const teamText=$('teamSwitchText');if(teamText)teamText.textContent=godMode?`Switch to ${myTeam==='blue'?'Red':'Blue'} now`:(pendingTeam?`${pendingTeam.toUpperCase()} ON RESPAWN`:`Switch to ${myTeam==='blue'?'Red':'Blue'} on Respawn`);
}

function switchLobbySide(name='players'){
  let next=['players','match','map','loadout','cheats'].includes(name)?name:'players';
  if(next==='cheats'&&!isMatchAdmin)next='players';
  for(const tab of lobbySideTabs){const active=tab.dataset.lobbySideTab===next;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));}
  for(const view of lobbySideViews){const active=view.dataset.lobbySideView===next;view.classList.toggle('active',active);view.hidden=!active;view.inert=!active;}
  if(next==='map')requestAnimationFrame(renderLobbyMapPreview);
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
  const v=value&&typeof value==='object'?value:{};return{primaryWeapon:PRIMARY_WEAPONS.includes(v.primaryWeapon)?v.primaryWeapon:fallback.primaryWeapon,tactical:normalizeTactical(v.tactical??fallback.tactical),lethal:normalizeLethal(v.lethal??fallback.lethal)};
}
function loadoutChoiceEqual(a,b){const x=normalizeLoadoutChoice(a),y=normalizeLoadoutChoice(b);return x.primaryWeapon===y.primaryWeapon&&x.tactical===y.tactical&&x.lethal===y.lethal;}
function syncMatchLoadoutEditor(){
  const draft=normalizeLoadoutChoice(loadoutDraft||loadoutBaseDraft||pendingLoadout||selectedLoadout());loadoutDraft=draft;
  for(const btn of matchPrimaryButtons)btn.classList.toggle('active',btn.dataset.matchPrimaryChoice===draft.primaryWeapon);
  for(const btn of matchTacticalButtons)btn.classList.toggle('active',btn.dataset.matchTacticalChoice===draft.tactical);
  for(const btn of matchLethalButtons)btn.classList.toggle('active',btn.dataset.matchLethalChoice===draft.lethal);
  const dirty=!loadoutChoiceEqual(draft,loadoutBaseDraft||draft),status=$('loadoutStatus'),description=$('loadoutDescription');if(description)description.textContent=godMode?'God Mode is active. Save equips the new loadout immediately.':'Changes are staged until Save. Your current life stays unchanged.';if(status)status.textContent=dirty?'Unsaved changes':godMode?'Saved loadout · changes equip immediately.':(pendingLoadout?'Queued loadout is saved for your next spawn.':'Saved loadout · equips on your next spawn.');if($('loadoutResetBtn'))$('loadoutResetBtn').disabled=!dirty;if($('loadoutSaveBtn'))$('loadoutSaveBtn').disabled=!dirty;
}
function openMatchLoadout(){if(!shell.inMatch)return;loadoutBaseDraft=normalizeLoadoutChoice(pendingLoadout||selectedLoadout());loadoutDraft={...loadoutBaseDraft};syncMatchLoadoutEditor();shell.openPanel(SHELL_PANEL.LOADOUT);}
function closeMatchLoadout(){loadoutDraft=null;loadoutBaseDraft=null;shell.closePanel(SHELL_PANEL.LOADOUT);}
function resetMatchLoadout(){if(!loadoutBaseDraft)return;loadoutDraft={...loadoutBaseDraft};syncMatchLoadoutEditor();}
function saveMatchLoadout(){
  if(socket?.readyState!==WebSocket.OPEN||!loadoutDraft)return;if(loadoutBaseDraft&&loadoutChoiceEqual(loadoutDraft,loadoutBaseDraft)){closeMatchLoadout();return;}
  const next=normalizeLoadoutChoice(loadoutDraft);send({t:'loadout',...next});rememberPrimary(next.primaryWeapon);rememberEquipment(next.tactical,next.lethal);if(godMode){pendingLoadout=null;showToast('LOADOUT APPLIED');}else{pendingLoadout=next;showToast(hp<=0?'LOADOUT SAVED FOR RESPAWN':'LOADOUT SAVED · NEXT SPAWN');}syncPauseContext();closeMatchLoadout();
}

function weaponSoundCueIds(weapon=currentWeapon){return weapon==='shotgun'?['shotShotgun','reloadShotgun','shotgunPump']:weapon==='semiShotgun'?['shotShotgun','reloadShotgun']:weapon==='sniper'?['shotSniper','reloadSniper']:weapon==='grenadeLauncher'||weapon==='rpg'?['shotShotgun','reloadSniper']:weapon==='assault'||weapon==='ump'?['shotAssault','reloadAssault']:['shotPistol','reloadPistol'];}
function warmWeaponAudio(weapon=currentWeapon){for(const id of weaponSoundCueIds(weapon))gameAudio.load(id);}
function preloadGameAudioAssets(){
  if(gameAudioPreloadPromise)return gameAudioPreloadPromise;
  gameAudioPreloadPromise=gameAudio.preloadAll().then(report=>{if(report.failed)console.warn(`Breach audio preload: ${report.failed}/${report.total} assets failed`);return report;}).finally(()=>{gameAudioPreloadPromise=null;});
  return gameAudioPreloadPromise;
}
function ensureAudio(){
  audioUnlockPromise=gameAudio.unlock();
  void audioUnlockPromise.then(ok=>{if(ok)void prepareAllGameAudio();});
  return audioUnlockPromise;
}
function prepareAllGameAudio(){
  if(gameAudioReady)return Promise.resolve(true);
  if(gameAudioPreparePromise)return gameAudioPreparePromise;
  gameAudioPreparePromise=(async()=>{
    const unlocked=await (audioUnlockPromise||Promise.resolve(false));
    if(!unlocked)return false;
    const report=await gameAudio.prepareAll();
    gameAudioReady=report.failed===0&&report.decoded===report.total;
    if(!gameAudioReady)console.warn(`Breach audio decode: ${report.failed}/${report.total} assets failed`);
    return gameAudioReady;
  })().finally(()=>{if(!gameAudioReady)gameAudioPreparePromise=null;});
  return gameAudioPreparePromise;
}
async function ensureGameAudioReady(){if(gameAudioReady)return true;return prepareAllGameAudio();}
function playSoundCue(cueId,volume=1,override={}){return gameAudio.play(cueId,volume,override);}
function spatialAudioParams(x,y,z,maxDistance=60){
  if(!position)return{volume:.08,pan:0};
  const dx=Number(x||0)-position.x,dy=Number(y||0)-(position.y+1),dz=Number(z||0)-position.z,d=Math.hypot(dx,dy,dz);
  const volume=Math.max(0,1-d/Math.max(1,maxDistance));
  if(d<.001)return{volume,pan:0};
  const rightX=-Math.cos(yaw),rightZ=Math.sin(yaw),pan=THREE.MathUtils.clamp((dx*rightX+dz*rightZ)/d,-.92,.92);
  return{volume:volume*volume,pan};
}
function playSpatialCue(cueId,x,y,z,maxDistance=60,volume=1,override={}){const p=spatialAudioParams(x,y,z,maxDistance);if(p.volume<=.004)return null;return playSoundCue(cueId,p.volume*volume,{...override,pan:p.pan});}
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
    minimapOrientation:value.minimapOrientation==='north'?'north':'heading'
  };
}
function setSettingsStatus(text,tone=''){const el=$('settingsStatus');if(!el)return;el.textContent=text;el.className=`admin-status ${tone}`.trim();}
function playerSettingsEqual(a,b){const x=normalizePlayerSettingsValue(a),y=normalizePlayerSettingsValue(b);return Object.keys(x).every(k=>x[k]===y[k]);}
function syncPlayerSettingsUI(value=playerSettingsDraft||playerSettings){
  const source=normalizePlayerSettingsValue(value),values=[['playerLookSensitivity','lookSensitivity'],['playerAdsSensitivity','adsSensitivity'],['playerTouchSensitivity','touchSensitivity'],['playerControllerVerticalSensitivity','controllerVerticalSensitivity'],['playerControllerMoveDeadzone','controllerMoveDeadzone'],['playerControllerLookDeadzone','controllerLookDeadzone'],['playerMasterVolume','masterVolume'],['playerSfxVolume','sfxVolume'],['playerMusicVolume','musicVolume']];
  for(const [id,key] of values){const el=$(id),out=$(`${id}Value`);if(el)el.value=source[key];if(out)out.textContent=key.includes('Volume')?`${Math.round(source[key]*100)}%`:key.includes('Deadzone')?`${Math.round(source[key]*100)}%`:`${Number(source[key]).toFixed(2)}×`;}
  if($('playerGraphics'))$('playerGraphics').value=source.graphics;if($('playerMinimapOrientation'))$('playerMinimapOrientation').value=source.minimapOrientation;if($('playerControllerResponseCurve'))$('playerControllerResponseCurve').value=source.controllerResponseCurve;if($('playerControllerAimAssist'))$('playerControllerAimAssist').value=source.controllerAimAssist;
  const dirty=!playerSettingsEqual(source,playerSettings);if($('settingsResetBtn'))$('settingsResetBtn').disabled=!dirty;if($('settingsSaveBtn'))$('settingsSaveBtn').disabled=!dirty;
}
function stagePlayerSettingFromUI(id,key){const el=$(id);if(!el)return;if(!playerSettingsDraft)playerSettingsDraft={...playerSettings};playerSettingsDraft=normalizePlayerSettingsValue({...playerSettingsDraft,[key]:Number(el.value)});syncPlayerSettingsUI(playerSettingsDraft);setSettingsStatus(playerSettingsEqual(playerSettingsDraft,playerSettings)?'Saved settings':'Unsaved changes');}
function stagePlayerChoice(key,value){if(!playerSettingsDraft)playerSettingsDraft={...playerSettings};playerSettingsDraft=normalizePlayerSettingsValue({...playerSettingsDraft,[key]:value});syncPlayerSettingsUI(playerSettingsDraft);setSettingsStatus(playerSettingsEqual(playerSettingsDraft,playerSettings)?'Saved settings':'Unsaved changes');}
function openPlayerSettings(){playerSettingsDraft={...playerSettings};syncPlayerSettingsUI(playerSettingsDraft);setSettingsStatus('Saved settings');switchSubTabs('[data-settings-tab]','[data-settings-page]','data-settings-tab','data-settings-page','controls');shell.openPanel(SHELL_PANEL.SETTINGS);}
function cancelPlayerSettings(){playerSettingsDraft=null;shell.closePanel(SHELL_PANEL.SETTINGS);}
function closePlayerSettings(){cancelPlayerSettings();}
function resetPlayerSettings(){playerSettingsDraft={...playerSettings};syncPlayerSettingsUI(playerSettingsDraft);setSettingsStatus('Saved settings');}
function savePlayerSettingsDraft(){
  if(!playerSettingsDraft||playerSettingsEqual(playerSettingsDraft,playerSettings)){cancelPlayerSettings();return;}
  const previous=playerSettings;playerSettings=normalizePlayerSettingsValue(playerSettingsDraft);playerSettingsDraft=null;savePlayerSettings();applyGraphicsQuality();hudLastDraw=0;
  if(!shell.inMatch&&introMusicHandle&&(previous.masterVolume!==playerSettings.masterVolume||previous.musicVolume!==playerSettings.musicVolume)){stopIntroMusic();if(!masterMuted)startIntroMusic();}
  shell.closePanel(SHELL_PANEL.SETTINGS);showToast('SETTINGS SAVED');
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
  const gunMat = new THREE.MeshStandardMaterial({color:0x252a30,roughness:.46,metalness:.35});
  const gripMat = new THREE.MeshStandardMaterial({color:0x4b3d35,roughness:.9});
  const slide = new THREE.Mesh(new THREE.BoxGeometry(.18,.15,.55),gunMat); slide.position.set(0,.02,-.12);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.038,.038,.34,10),gunMat); barrel.rotation.x=Math.PI/2;barrel.position.set(0,.015,-.45);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(.16,.32,.18),gripMat);grip.position.set(0,-.18,.03);grip.rotation.x=-.18;
  pistolMag=new THREE.Mesh(new THREE.BoxGeometry(.105,.20,.12),gunMat);pistolMag.position.set(0,-.25,.025);pistolMag.rotation.x=-.18;
  pistolFlash = new THREE.Mesh(new THREE.SphereGeometry(.07,8,6),new THREE.MeshBasicMaterial({color:0xffd27a,transparent:true,opacity:0}));pistolFlash.position.set(0,.015,-.66);
  pistolGroup.add(slide,barrel,grip,pistolMag,pistolFlash);pistolGroup.position.set(.33,-.25,-.67);pistolGroup.rotation.set(-.08,-.08,0);

  assaultGroup = new THREE.Group();
  const arMat = new THREE.MeshStandardMaterial({color:0x242b31,roughness:.40,metalness:.38});
  const arAccent = new THREE.MeshStandardMaterial({color:0x4b555d,roughness:.62,metalness:.22});
  const arBody = new THREE.Mesh(new THREE.BoxGeometry(.18,.17,.72),arMat);arBody.position.set(0,.01,-.24);
  const arBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.029,.029,.62,10),arMat);arBarrel.rotation.x=Math.PI/2;arBarrel.position.set(0,.015,-.87);
  const arStock = new THREE.Mesh(new THREE.BoxGeometry(.17,.19,.34),arAccent);arStock.position.set(0,-.035,.31);arStock.rotation.x=-.10;
  assaultMag = new THREE.Mesh(new THREE.BoxGeometry(.14,.29,.18),arAccent);assaultMag.position.set(0,-.20,-.10);assaultMag.rotation.x=.15;
  const arSight = new THREE.Mesh(new THREE.BoxGeometry(.055,.07,.13),arAccent);arSight.position.set(0,.13,-.30);
  assaultFlash = new THREE.Mesh(new THREE.SphereGeometry(.074,8,6),new THREE.MeshBasicMaterial({color:0xffd98d,transparent:true,opacity:0}));assaultFlash.position.set(0,.015,-1.18);
  assaultGroup.add(arBody,arBarrel,arStock,assaultMag,arSight,assaultFlash);assaultGroup.position.set(.30,-.27,-.52);assaultGroup.rotation.set(-.06,-.055,0);assaultGroup.visible=false;

  umpGroup = new THREE.Group();
  const umpMat=new THREE.MeshStandardMaterial({color:0x1f252a,roughness:.42,metalness:.34}),umpAccent=new THREE.MeshStandardMaterial({color:0x4a5155,roughness:.65});
  const umpBody=new THREE.Mesh(new THREE.BoxGeometry(.19,.20,.50),umpMat);umpBody.position.set(0,0,-.17);
  const umpBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.34,9),umpMat);umpBarrel.rotation.x=Math.PI/2;umpBarrel.position.set(0,.01,-.58);
  const umpStock=new THREE.Mesh(new THREE.BoxGeometry(.12,.13,.30),umpAccent);umpStock.position.set(0,-.01,.23);
  umpMag=new THREE.Mesh(new THREE.BoxGeometry(.12,.30,.14),umpAccent);umpMag.position.set(0,-.22,-.10);umpMag.rotation.x=.12;
  umpFlash=new THREE.Mesh(new THREE.SphereGeometry(.072,8,6),new THREE.MeshBasicMaterial({color:0xffd994,transparent:true,opacity:0}));umpFlash.position.set(0,.01,-.78);
  umpGroup.add(umpBody,umpBarrel,umpStock,umpMag,umpFlash);umpGroup.position.set(.30,-.27,-.54);umpGroup.rotation.set(-.06,-.05,0);umpGroup.visible=false;

  shotgunGroup = new THREE.Group();
  const sgMat=new THREE.MeshStandardMaterial({color:0x2b3135,roughness:.48,metalness:.30});
  const sgWood=new THREE.MeshStandardMaterial({color:0x5a4636,roughness:.82});
  const sgBody=new THREE.Mesh(new THREE.BoxGeometry(.19,.18,.82),sgMat);sgBody.position.set(0,.01,-.20);
  const sgBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.78,10),sgMat);sgBarrel.rotation.x=Math.PI/2;sgBarrel.position.set(0,.04,-.90);
  const sgStock=new THREE.Mesh(new THREE.BoxGeometry(.18,.22,.38),sgWood);sgStock.position.set(0,-.05,.36);sgStock.rotation.x=-.10;
  shotgunPump=new THREE.Mesh(new THREE.BoxGeometry(.20,.16,.28),sgWood);shotgunPump.position.set(0,-.08,-.48);
  shotgunFlash=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:0xffd181,transparent:true,opacity:0}));shotgunFlash.position.set(0,.04,-1.30);
  shotgunGroup.add(sgBody,sgBarrel,sgStock,shotgunPump,shotgunFlash);shotgunGroup.position.set(.30,-.28,-.50);shotgunGroup.rotation.set(-.06,-.05,0);shotgunGroup.visible=false;

  semiShotgunGroup = new THREE.Group();
  const sasMat=new THREE.MeshStandardMaterial({color:0x252d31,roughness:.43,metalness:.30}),sasAccent=new THREE.MeshStandardMaterial({color:0x39484d,roughness:.72});
  const sasBody=new THREE.Mesh(new THREE.BoxGeometry(.19,.19,.72),sasMat);sasBody.position.set(0,.01,-.18);
  const sasBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.039,.039,.67,10),sasMat);sasBarrel.rotation.x=Math.PI/2;sasBarrel.position.set(0,.035,-.78);
  const sasStock=new THREE.Mesh(new THREE.BoxGeometry(.18,.20,.34),sasAccent);sasStock.position.set(0,-.04,.32);
  semiShotgunMag=new THREE.Mesh(new THREE.BoxGeometry(.15,.22,.19),sasAccent);semiShotgunMag.position.set(0,-.17,-.10);
  semiShotgunFlash=new THREE.Mesh(new THREE.SphereGeometry(.088,8,6),new THREE.MeshBasicMaterial({color:0xffd181,transparent:true,opacity:0}));semiShotgunFlash.position.set(0,.035,-1.12);
  semiShotgunGroup.add(sasBody,sasBarrel,sasStock,semiShotgunMag,semiShotgunFlash);semiShotgunGroup.position.set(.30,-.28,-.50);semiShotgunGroup.rotation.set(-.06,-.05,0);semiShotgunGroup.visible=false;

  sniperGroup = new THREE.Group();
  const rifleMat = new THREE.MeshStandardMaterial({color:0x303842,roughness:.38,metalness:.42});
  const stockMat = new THREE.MeshStandardMaterial({color:0x3e4a43,roughness:.8});
  const rifleBody = new THREE.Mesh(new THREE.BoxGeometry(.17,.16,.78),rifleMat);rifleBody.position.set(0,.01,-.18);
  const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,.78,10),rifleMat);rifleBarrel.rotation.x=Math.PI/2;rifleBarrel.position.set(0,.025,-.83);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(.18,.22,.36),stockMat);stock.position.set(0,-.06,.35);stock.rotation.x=-.12;
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(.055,.055,.28,12),rifleMat);scope.rotation.x=Math.PI/2;scope.position.set(0,.14,-.18);
  sniperBolt=new THREE.Mesh(new THREE.BoxGeometry(.055,.055,.18),rifleMat);sniperBolt.position.set(.11,.065,-.12);
  sniperFlash = new THREE.Mesh(new THREE.SphereGeometry(.085,8,6),new THREE.MeshBasicMaterial({color:0xffe6a6,transparent:true,opacity:0}));sniperFlash.position.set(0,.025,-1.23);
  sniperGroup.add(rifleBody,rifleBarrel,stock,scope,sniperBolt,sniperFlash);sniperGroup.position.set(.28,-.28,-.48);sniperGroup.rotation.set(-.055,-.05,0);sniperGroup.visible=false;

  grenadeLauncherGroup=new THREE.Group();
  const glMat=new THREE.MeshStandardMaterial({color:0x273126,roughness:.58,metalness:.26}),glTube=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.73,12),glMat);glTube.rotation.x=Math.PI/2;glTube.position.set(0,.01,-.40);
  const glGrip=new THREE.Mesh(new THREE.BoxGeometry(.15,.28,.18),gripMat);glGrip.position.set(0,-.20,-.10);glGrip.rotation.x=-.12;
  grenadeLauncherFlash=new THREE.Mesh(new THREE.SphereGeometry(.105,8,6),new THREE.MeshBasicMaterial({color:0xffc66f,transparent:true,opacity:0}));grenadeLauncherFlash.position.set(0,.01,-.80);
  grenadeLauncherGroup.add(glTube,glGrip,grenadeLauncherFlash);grenadeLauncherGroup.position.set(.30,-.28,-.48);grenadeLauncherGroup.rotation.set(-.06+GRENADE_LAUNCH_PITCH,-.05,0);grenadeLauncherGroup.visible=false;

  rpgGroup=new THREE.Group();
  const rpgMat=new THREE.MeshStandardMaterial({color:0x4a5443,roughness:.64,metalness:.18}),rpgTube=new THREE.Mesh(new THREE.CylinderGeometry(.068,.068,.95,12),rpgMat);rpgTube.rotation.x=Math.PI/2;rpgTube.position.set(0,.02,-.30);
  const rpgCone=new THREE.Mesh(new THREE.ConeGeometry(.09,.20,10),new THREE.MeshStandardMaterial({color:0x30372f,roughness:.7}));rpgCone.rotation.x=-Math.PI/2;rpgCone.position.set(0,.02,-.88);
  rpgFlash=new THREE.Mesh(new THREE.SphereGeometry(.12,8,6),new THREE.MeshBasicMaterial({color:0xffc05e,transparent:true,opacity:0}));rpgFlash.position.set(0,.02,-1.00);
  rpgGroup.add(rpgTube,rpgCone,rpgFlash);rpgGroup.position.set(.34,-.16,-.46);rpgGroup.rotation.set(-.025,-.07,.015);rpgGroup.visible=false;
  camera.add(pistolGroup,assaultGroup,umpGroup,shotgunGroup,semiShotgunGroup,sniperGroup,grenadeLauncherGroup,rpgGroup);
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


function buildWorldVisuals(){
  if(!scene||!THREE)return;
  mapObstacles.length=0;
  worldRoot=new THREE.Group();worldRoot.name=`world:${currentMapId}`;scene.add(worldRoot);
  const depot=currentMapId==='depot',yard=currentMapId==='yard',rig=currentMapId==='rig';
  const sky=rig?0xb9a27f:(yard?0x7e878d:(depot?0x89979d:0x9acde6));scene.background=new THREE.Color(sky);scene.fog=new THREE.Fog(sky,rig?72:(yard?58:(depot?90:95)),rig?205:(yard?145:(depot?260:285)));
  addTerrain();
  const wallMat=new THREE.MeshStandardMaterial({color:rig?0x6d5d49:(yard?0x454c50:(depot?0x626a6e:0xd8d4cc)),roughness:.9});addBoundaryWallsBatch(wallMat);
  const blockMat=new THREE.MeshStandardMaterial({color:rig?0x756a59:(yard?0x6f777a:(depot?0x697983:0xb8c0c5)),roughness:.85});
  const pyramidMat=new THREE.MeshStandardMaterial({color:rig?0x9b8058:(depot?0x88775f:0xc8a86b),roughness:.92});addStaticBoxesBatch(blockMat);addPyramidsBatch(pyramidMat);
  const trunkMat=new THREE.MeshStandardMaterial({color:0x60452f,roughness:1}),leafMat=new THREE.MeshStandardMaterial({color:depot?0x405b3f:0x315f37,roughness:1}),bushMat=new THREE.MeshStandardMaterial({color:depot?0x53664b:0x3f7441,roughness:1}),rockMat=new THREE.MeshStandardMaterial({color:rig?0x8b7459:(depot?0x777b78:0x6b706f),roughness:.96});
  addNaturalObstaclesBatch(trunkMat,leafMat,bushMat,rockMat);addBuildingsBatch();addLaddersBatch();
  const markerMat=new THREE.MeshStandardMaterial({color:depot?0x303a40:0x49606f,roughness:.75});if(!yard&&!rig)addMarkersBatch(markerMat);
  minimapStaticCache=null;
}
function rebuildWorldVisuals(){
  if(worldRoot){try{scene.remove(worldRoot);}catch{}disposeObject3D(worldRoot);worldRoot=null;}
  buildWorldVisuals();
  for(const r of remotes.values()){try{scene.remove(r.group);}catch{}disposeObject3D(r.group);}remotes.clear();
  clearBullets();clearThrowables();clearSmokeClouds();clearTacticalFx();clearRocketTrailPuffs();
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
  const charred=new THREE.MeshStandardMaterial({color:0x252728,roughness:.92,metalness:.12}),rust=new THREE.MeshStandardMaterial({color:0x5f4030,roughness:.96}),glass=new THREE.MeshStandardMaterial({color:0x171d20,roughness:.48,metalness:.05}),rubber=new THREE.MeshStandardMaterial({color:0x111213,roughness:1});
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
  const metal=new THREE.MeshStandardMaterial({color:0x485056,roughness:.84,metalness:.18}),darkMetal=new THREE.MeshStandardMaterial({color:0x303438,roughness:.90,metalness:.12}),concrete=new THREE.MeshStandardMaterial({color:0x8e8a80,roughness:.98}),sand=new THREE.MeshStandardMaterial({color:0x8b7753,roughness:1}),rust=new THREE.MeshStandardMaterial({color:0x76523a,roughness:.95,metalness:.05});
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
  if(!LADDERS.length)return;const metal=new THREE.MeshStandardMaterial({color:0x8d8170,roughness:.80,metalness:.35});
  for(const ladder of LADDERS){const g=new THREE.Group(),height=Math.max(.8,ladder.topY-ladder.bottomY),cx=ladder.x+ladder.nx*.05,cz=ladder.z+ladder.nz*.05;g.position.set(cx,ladder.bottomY,cz);worldRoot.add(g);const horizontal=Math.abs(ladder.tx)>.5;
    const railOffset=ladder.width*.43;for(const side of [-1,1]){const rail=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,height,8),metal);rail.position.set(ladder.tx*railOffset*side,height/2,ladder.tz*railOffset*side);g.add(rail);}
    const rungCount=Math.max(4,Math.floor(height/.34));for(let i=0;i<=rungCount;i++){const rung=new THREE.Mesh(new THREE.CylinderGeometry(.032,.032,ladder.width*.90,8),metal);rung.position.y=.18+(height-.36)*(i/rungCount);if(horizontal)rung.rotation.z=Math.PI/2;else rung.rotation.x=Math.PI/2;g.add(rung);}
  }
}
function addStaticBoxesBatch(mat){
  const unit=new THREE.BoxGeometry(1,1,1),customKinds=new Set(['burntCar','burntBus','dumpster','fuelTank','checkpoint','sandbag','brokenWall']);
  const palette={
    boundary:new THREE.MeshStandardMaterial({color:currentMapId==='yard'?0x3d4448:currentMapId==='rig'?0x5a4f41:0x626a6e,roughness:.95}),
    pipe:new THREE.MeshStandardMaterial({color:0x6d665d,roughness:.72,metalness:.18}),tank:new THREE.MeshStandardMaterial({color:0x82755f,roughness:.76,metalness:.10}),shed:new THREE.MeshStandardMaterial({color:0x765744,roughness:.88}),barrier:new THREE.MeshStandardMaterial({color:0x9a8b70,roughness:.94}),crate:new THREE.MeshStandardMaterial({color:0x755437,roughness:.94}),
    containerBlue:new THREE.MeshStandardMaterial({color:0x385f78,roughness:.82}),containerRed:new THREE.MeshStandardMaterial({color:0x8a473f,roughness:.84}),containerGreen:new THREE.MeshStandardMaterial({color:0x4f6d58,roughness:.86}),containerTan:new THREE.MeshStandardMaterial({color:0x847457,roughness:.88}),
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
      wall:new THREE.MeshStandardMaterial({color:buildingStyle?buildingStyle[0]:(currentMapId==='rig'?(b.tall?0x6f6250:0x89735b):(currentMapId==='depot'?(b.tall?0x7d8589:0x919698):(b.tall?0x929aa0:0xa8adb0))),roughness:.9}),
      trim:new THREE.MeshStandardMaterial({color:buildingStyle?buildingStyle[1]:(currentMapId==='rig'?(b.tall?0x3b3229:0x514336):(currentMapId==='depot'?(b.tall?0x30383d:0x41494e):(b.tall?0x39444d:0x4f5961))),roughness:.75}),
      floor:new THREE.MeshStandardMaterial({color:buildingStyle?buildingStyle[2]:(currentMapId==='rig'?0x5b5145:(currentMapId==='depot'?0x5d6264:0x6d7478)),roughness:.95}),
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
  $('loadoutResetBtn').addEventListener('click',resetMatchLoadout);
  $('loadoutCancelBtn').addEventListener('click',closeMatchLoadout);
  $('loadoutSaveBtn').addEventListener('click',saveMatchLoadout);
  for(const btn of matchPrimaryButtons)btn.addEventListener('click',()=>{loadoutDraft=normalizeLoadoutChoice({...loadoutDraft,primaryWeapon:btn.dataset.matchPrimaryChoice});syncMatchLoadoutEditor();});
  for(const btn of matchTacticalButtons)btn.addEventListener('click',()=>{loadoutDraft=normalizeLoadoutChoice({...loadoutDraft,tactical:btn.dataset.matchTacticalChoice});syncMatchLoadoutEditor();});
  for(const btn of matchLethalButtons)btn.addEventListener('click',()=>{loadoutDraft=normalizeLoadoutChoice({...loadoutDraft,lethal:btn.dataset.matchLethalChoice});syncMatchLoadoutEditor();});
  $('settingsCancelBtn').addEventListener('click',cancelPlayerSettings);
  $('settingsSaveBtn').addEventListener('click',savePlayerSettingsDraft);
  $('settingsFullscreenBtn').addEventListener('click',async()=>{ensureAudio();if(shell.fullscreen)await shell.exitFullscreenFromGesture();else await shell.enterFullscreenFromGesture();});
  $('settingsResetBtn').addEventListener('click',resetPlayerSettings);
  for(const [id,key] of [['playerLookSensitivity','lookSensitivity'],['playerAdsSensitivity','adsSensitivity'],['playerTouchSensitivity','touchSensitivity'],['playerControllerVerticalSensitivity','controllerVerticalSensitivity'],['playerControllerMoveDeadzone','controllerMoveDeadzone'],['playerControllerLookDeadzone','controllerLookDeadzone'],['playerMasterVolume','masterVolume'],['playerSfxVolume','sfxVolume'],['playerMusicVolume','musicVolume']])$(id)?.addEventListener('input',()=>stagePlayerSettingFromUI(id,key));
  $('playerGraphics').addEventListener('change',()=>stagePlayerChoice('graphics',$('playerGraphics').value));
  $('playerMinimapOrientation')?.addEventListener('change',()=>stagePlayerChoice('minimapOrientation',$('playerMinimapOrientation').value));
  $('playerControllerResponseCurve')?.addEventListener('change',()=>stagePlayerChoice('controllerResponseCurve',$('playerControllerResponseCurve').value));
  $('playerControllerAimAssist')?.addEventListener('change',()=>stagePlayerChoice('controllerAimAssist',$('playerControllerAimAssist').value));
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
  $('adminWeaponSelect')?.addEventListener('change',()=>syncAdminWeaponEditor($('adminWeaponSelect').value));
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
  $('leaveBtn').addEventListener('click',returnToLobby);
  $('lobbyLeaveBtn').addEventListener('click',leaveMatch);
  $('lobbyCopyBtn').addEventListener('click',copyInvite);
  for(const tab of lobbySideTabs)tab.addEventListener('click',()=>switchLobbySide(tab.dataset.lobbySideTab));
  $('lobbyGodModeToggle')?.addEventListener('click',()=>{if(isMatchAdmin&&socket?.readyState===WebSocket.OPEN)send({t:'god',enabled:!godMode});});
  switchLobbySide('players');
  for(const btn of lobbyTeamButtons)btn.addEventListener('click',()=>{if(socket?.readyState===WebSocket.OPEN)send({t:'team',team:btn.dataset.lobbyTeamChoice});});
  for(const btn of lobbyPrimaryButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({primaryWeapon:btn.dataset.lobbyPrimaryChoice}));
  for(const btn of lobbyTacticalButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({tactical:btn.dataset.lobbyTacticalChoice}));
  for(const btn of lobbyLethalButtons)btn.addEventListener('click',()=>setLobbyLoadoutDraft({lethal:btn.dataset.lobbyLethalChoice}));
  for(const btn of lobbyModeButtons)btn.addEventListener('click',()=>setLobbyModeDraft(btn.dataset.lobbyModeChoice));
  for(const el of [lobbyBlueBotCount,lobbyRedBotCount,lobbyFfaBotCount,lobbyBotDifficulty,lobbyScoreLimit,lobbyTimeLimit,lobbyMinimapMode])el.addEventListener('change',updateLobbyMatchDraftFromControls);
  $('adminGameplay')?.addEventListener('change',()=>{if(shell.inLobby)scheduleLobbyAutoSave();});$('adminGameplay')?.addEventListener('input',()=>{if(shell.inLobby)scheduleLobbyAutoSave();});$('adminAdvanced')?.addEventListener('change',()=>{if(shell.inLobby)scheduleLobbyAutoSave();});$('adminAdvanced')?.addEventListener('input',()=>{if(shell.inLobby)scheduleLobbyAutoSave();});
  for(const btn of lobbyMapButtons)btn.addEventListener('click',()=>setLobbyMapDraft(btn.dataset.lobbyMapChoice));
  $('lobbyStartBtn').addEventListener('click',async()=>{
    if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||!matchAllowsLobbyEdits(matchState))return;
    const button=$('lobbyStartBtn');button.disabled=true;$('lobbyStatus').textContent='Preparing match…';
    // Fullscreen and pointer lock must be requested directly from this user
    // gesture. Engine/audio preparation can safely continue after input is owned.
    if(!(await shell.prepareInputFromGesture())){button.disabled=false;$('lobbyStatus').textContent='Fullscreen / game input is required to start.';return;}
    if(!(await prepareGameRuntime())){button.disabled=false;$('lobbyStatus').textContent='Game runtime could not be prepared.';return;}
    send({t:'startMatch'});$('lobbyStatus').textContent='Starting match…';
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
    if(chatOpen||!shell.canPlay || hp<=0 || (!isTouch&&document.pointerLockElement!==canvas)) return;
    if(Math.abs(e.movementX)+Math.abs(e.movementY)>.01)setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
    const sens=aimSensitivityScale()*playerSettings.lookSensitivity;yaw -= e.movementX*.0023*sens; pitch -= e.movementY*.0020*sens; pitch = THREE.MathUtils.clamp(pitch,-1.28,1.28);
  });
  document.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch'||e.pointerType==='pen'){activateTouchInputMode();setActiveInputMode(INPUT_MODE.TOUCH,{quiet:true});}
    else if(e.pointerType==='mouse')setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
  },{capture:true,passive:true});
  document.addEventListener('keydown', e => {
    if(gameTextEditorTarget){handlePhysicalGameTextKey(e);return;}
    if(chatOpen){handlePhysicalChatKey(e);return;}
    if(isEditableTarget(e.target)) return;
    if(controllerInputActive()&&(e.code==='Space'||e.code==='Escape'||e.code.startsWith('Arrow'))){e.preventDefault();return;}
    if(!controllerInputActive()||isTouch||document.pointerLockElement===canvas)setActiveInputMode(INPUT_MODE.KEYBOARD_MOUSE,{quiet:true});
    if(e.code==='Enter'&&!e.repeat&&shell.inMatch&&!shell.paused&&!shell.panel){e.preventDefault();openChat();return;}
    if(e.code==='Escape'&&!e.repeat&&shell.panel){
      e.preventDefault();
      if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return;}
      if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return;}
      if(shell.panel===SHELL_PANEL.LOADOUT){closeMatchLoadout();return;}
    }
    if(!shell.inMatch)return;
    if((e.code==='KeyM'||e.code==='Escape')&&!e.repeat){
      e.preventDefault();
      if(scoreboardOpen){scoreboardOpen=false;return;}
      if(!shell.paused)openPause();
      return;
    }
    if(!shell.canPlay)return;
    if(hp<=0&&e.code==='KeyL'&&!e.repeat){e.preventDefault();openMatchLoadout();return;}
    if(['KeyW','KeyA','KeyS','KeyD','Space','KeyC','KeyR','KeyQ','KeyB','KeyF','KeyG','Digit1','Digit2','Tab'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if(e.code==='Space' && !e.repeat) tryJump();
    if(e.code==='KeyC' && !e.repeat) toggleCrouch();
    if(e.code==='KeyR' && !e.repeat) doReload();
    if(e.code==='Digit1' && !e.repeat) switchWeapon(primaryWeapon);
    if(e.code==='Digit2' && !e.repeat) switchWeapon('pistol');
    if(e.code==='KeyF' && !e.repeat) beginEquipmentAim(tacticalEquipment);
    if(e.code==='KeyG' && !e.repeat) beginEquipmentAim(lethalEquipment);
    if(e.code==='KeyQ' && !e.repeat) switchWeapon(currentWeapon==='pistol'?primaryWeapon:'pistol');
    if(e.code==='KeyB' && !e.repeat) toggleFireMode();
    if(e.code==='Tab'&&!e.repeat){scoreboardOpen=true;scoreboardScroll=0;clearFireInput();cancelEquipmentAim();}
  });
  document.addEventListener('keyup', e => {
    if(chatOpen){e.preventDefault();return;}
    if(isEditableTarget(e.target))return;
    keys.delete(e.code);
    if(e.code==='Tab')scoreboardOpen=false;
    if(e.code==='KeyF'&&equipmentAim.kind===tacticalEquipment){releaseEquipmentAim();}
    if(e.code==='KeyG'&&equipmentAim.kind===lethalEquipment){releaseEquipmentAim();}
  });
  document.addEventListener('mouseup',e=>{if(e.button===0)mouseFireDown=false;});
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
function renderGameTextEditor(){
  if(!gameTextEditorTarget)return;gameTextEditorValue.textContent=gameTextEditorDraft;gameTextEditorPlaceholder.textContent=gameTextEditorDraft?'':(gameTextEditorTarget.dataset.placeholder||'');gameTextShiftBtn?.classList.toggle('active',gameTextEditorShift);
  gameTextKeyboard?.classList.toggle('code-mode',gameTextMode()==='code');
}
function openGameTextEditor(target){
  if(!target||target.disabled)return false;gameTextEditorTarget=target;gameTextEditorDraft=String(target.value||'');gameTextEditorShift=gameTextMode()==='callsign';
  gameTextEditorTitle.textContent=gameTextMode()==='code'?'ROOM CODE':'CALLSIGN';$('gameTextEditorEyebrow').textContent=gameTextMode()==='code'?'JOIN MATCH':'PLAYER PROFILE';
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
  if(!gameTextEditorTarget)return;let out=String(char||'');if(gameTextMode()==='code'){out=out.toUpperCase();if(!/^[A-Z0-9]$/.test(out))return;}else if(/^[a-z]$/i.test(out)){out=gameTextEditorShift?out.toUpperCase():out.toLowerCase();if(gameTextEditorShift)gameTextEditorShift=false;}
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
  const text=chatDraft.slice(0,CHAT_MAX_LENGTH);chatInputText.textContent=text;chatInput.classList.toggle('has-text',!!text);chatShiftBtn?.classList.toggle('active',chatShift);
}
function setChatDraft(value){chatDraft=String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,CHAT_MAX_LENGTH);renderChatDraft();}
function appendChatCharacter(char){
  if(!chatOpen||chatDraft.length>=CHAT_MAX_LENGTH)return;let out=String(char||'');if(!out)return;
  if(/^[a-z]$/i.test(out)){out=chatShift?out.toUpperCase():out.toLowerCase();if(chatShift)chatShift=false;}
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
  chatOpen=true;chatScroll=0;chatDrag=null;chatPanel=null;scoreboardOpen=false;chatShift=true;setChatDraft('');suspendGameplayInput();chatComposer.classList.remove('hide');
  if(!isTouch&&document.pointerLockElement===canvas)document.exitPointerLock?.();
  hudLayout=null;hudLastDraw=0;return true;
}
async function dismissChat({restorePointer=true}={}){
  if(!chatOpen){chatComposer.classList.add('hide');return false;}
  chatComposer.classList.add('hide');chatShift=false;setChatDraft('');keys.clear();resetTouchInput();clearFireInput();cancelEquipmentAim();
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
    const liveHud=matchAllowsMovement(matchState)&&hp>0;
    // Any canvas control that reveals a DOM surface is armed on press and
    // committed on pointerup. This keeps one physical gesture on one UI
    // surface and prevents the release/click from falling through into a
    // control that did not exist when the press began.
    try{canvas.setPointerCapture(e.pointerId)}catch{}
    if(liveHud&&pointInRect(p.x,p.y,layout.chat)){touchRoles.set(e.pointerId,'open-chat');return;}
    if(hp<=0&&layout.deathLoadout&&pointInRect(p.x,p.y,layout.deathLoadout)){touchRoles.set(e.pointerId,'open-loadout');return;}
    if(scoreboardOpen){
      const panel=scoreboardPanel;
      if(panel?.close&&pointInRect(p.x,p.y,panel.close)){scoreboardOpen=false;scoreboardDrag=null;touchRoles.set(e.pointerId,'scoreboard-close');return;}
      if(panel&&pointInRect(p.x,p.y,panel)&&!touchRoleActive('scoreboard-scroll')){scoreboardDrag={startY:p.y,startScroll:scoreboardScroll};touchRoles.set(e.pointerId,'scoreboard-scroll');return;}
      return;
    }
    if(pointInRect(p.x,p.y,layout.team)){touchRoles.set(e.pointerId,'scoreboard');toggleScoreboard();return;}
    if(pointInRect(p.x,p.y,layout.menu)){
      touchRoles.set(e.pointerId,'open-menu');return;
    }
    if(!liveHud)return;
    if(pointInCircle(p.x,p.y,layout.aim)){touchRoles.set(e.pointerId,'aimtoggle');toggleAim();return;}
    if(pointInCircle(p.x,p.y,layout.leftFire)){
      touchVisual.fireUntil=performance.now()+150;pressTouchFire(e.pointerId);return;
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
  if(e.button===0)pressMouseFire();else if(e.button===2)toggleAim();
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
    const sens=aimSensitivityScale()*playerSettings.touchSensitivity;yaw-=dx*.006*sens;pitch-=dy*.0052*sens;pitch=THREE.MathUtils.clamp(pitch,-1.28,1.28);
  }
}

function onCanvasPointerEnd(e){
  const role=touchRoles.get(e.pointerId);
  touchRoles.delete(e.pointerId);
  if(role==='joy'){joy.x=joy.y=0;joy.centerX=joy.centerY=0;}
  if(role==='equipment')releaseEquipmentAim();
  if(role==='scoreboard-scroll')scoreboardDrag=null;
  if(role==='chat-scroll')chatDrag=null;
  if(!isTouch&&e.button===0)mouseFireDown=false;
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
  touchRoles.clear();mouseFireDown=false;joy.x=joy.y=0;joy.centerX=joy.centerY=0;scoreboardDrag=null;chatDrag=null;cancelEquipmentAim();setAim(false);
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

async function refreshMatches(){
  try{
    const response=await fetch(`${ONLINE_API}/rooms`,{cache:'no-store'}); if(!response.ok)throw new Error('Server unavailable');
    const data=await response.json(); renderMatches(Array.isArray(data.rooms)?data.rooms:[]);
  }catch(err){ if(!shell.inMatch){matchList.innerHTML='<div class="empty">Multiplayer server unavailable.</div>';matchCount.textContent='';} }
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
    const btn=document.createElement('button');btn.className='btn icon-btn';btn.setAttribute('aria-label',`Join ${room.code}`);btn.innerHTML='<svg class="ui-icon"><use href="#i-enter"/></svg>';btn.addEventListener('click',()=>joinMatch(room.code));
    row.append(left,meta,btn);matchList.append(row);
  }
  
}

async function createMatch(){
  shell.beginConnection('Creating lobby…');
  myName=safeName();myTeam=preferredTeam;godMode=false;primaryWeapon=preferredPrimary;tacticalEquipment=preferredTactical;lethalEquipment=preferredLethal;pendingLoadout=null;pendingTeam='';
  localStorage.setItem('breachName',myName);disableMenu(true);setStatus('Creating lobby…');
  try{
    const response=await fetch(`${ONLINE_API}/rooms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:PROTOCOL_VERSION,client:clientId,auth:clientAuth}),cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not create lobby.');connectMatch(data.code);
  }catch(err){shell.cancelConnection();setStatus(err.message||'Could not create lobby.','error');disableMenu(false);}
}
async function joinMatch(code){
  if(code.length!==ROOM_CODE_LENGTH){setStatus('Enter a 4-character room code.','error');return;}
  shell.beginConnection(`Joining ${code}…`);myName=safeName();myTeam=preferredTeam;godMode=false;primaryWeapon=preferredPrimary;tacticalEquipment=preferredTactical;lethalEquipment=preferredLethal;pendingLoadout=null;pendingTeam='';
  localStorage.setItem('breachName',myName);disableMenu(true);setStatus(`Joining ${code}…`);connectMatch(code);
}
function disableMenu(disabled){
  $('createBtn').disabled=disabled;$('joinBtn').disabled=disabled;$('refreshBtn').disabled=disabled;nameInput.disabled=disabled;
  for(const btn of deployTabs)btn.disabled=disabled;
}

async function connectMatch(code, reconnecting=false){
  clearTimeout(reconnectTimer);currentRoom=normalizeCode(code);if(!currentRoom)return;
  if(!reconnecting)shell.updateConnection(`Connecting to ${currentRoom}…`);
  if(socket){try{socket.close(1000,'Replacing connection')}catch{}}
  let ticket='';
  try{
    const ticketResponse=await fetch(`${ONLINE_API}/rooms/${currentRoom}/ticket`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:PROTOCOL_VERSION,client:clientId,auth:clientAuth,name:myName||safeName(),team:myTeam,primaryWeapon,tactical:tacticalEquipment,lethal:lethalEquipment}),cache:'no-store'});
    const ticketData=await ticketResponse.json();if(!ticketResponse.ok)throw new Error(ticketData.error||'Could not authorize match connection.');ticket=String(ticketData.ticket||'');if(!ticket)throw new Error('Server did not issue a join ticket.');
  }catch(err){if(!shell.inMatch&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus(err.message||'Could not join match.','error');}else scheduleReconnect();return;}
  const url=`${apiToWs(ONLINE_API)}/rooms/${currentRoom}/socket?protocol=${PROTOCOL_VERSION}&ticket=${encodeURIComponent(ticket)}`;
  let ws;try{ws=new WebSocket(url);socket=ws;}catch{if(!shell.inMatch&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus('Could not open multiplayer connection.','error');}else scheduleReconnect();return;}
  ws.addEventListener('open',()=>{if(ws!==socket)return;reconnectAttempt=0;if(reconnecting)showToast('Reconnected');});
  ws.addEventListener('message',e=>{if(ws!==socket)return;try{handleMessage(JSON.parse(e.data))}catch(error){console.error('WebSocket message handling failed',error);}});
  ws.addEventListener('close',e=>{
    if(ws!==socket)return;
    if(!roomSessionActive()&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus(e.reason||'Could not join match.','error');return;}
    if(roomSessionActive()&&e.code!==1000){showToast('Connection lost · reconnecting',{priority:3,key:'connection-lost'});scheduleReconnect();}
  });
  ws.addEventListener('error',()=>{if(ws===socket&&!shell.inMatch)setStatus('Multiplayer server unreachable.','error');});
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
  if(!matchAllowsCombat(next)){clearFireInput();cancelEquipmentAim();setAim(false);reloadRequestPending=false;}
  if(!matchAllowsMovement(next)){
    traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;
    moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;jumpBufferedUntil=0;localMoveAmount=0;
    crouchWanted=false;crouched=false;
  }
  if(next.status===MATCH_STATUS.ACTIVE){
    clearFireInput();cancelEquipmentAim();lastStateSent=0;fireReadyAt=freshClientFireReady();
    traversal=null;ladderState=null;traversalIntentUntil=0;jumpBufferedUntil=0;moveVelocityX=moveVelocityZ=0;knockX=knockZ=0;
  }
}
function applyClientMatchState(value){const previous=matchState,next=normalizeClientMatch(value);matchState=next;applyMatchPhaseTransition(previous,next);return next;}
function matchClockText(){const m=matchState,now=serverNow(),spec=gameModeSpec(m.mode);if(m.status==='warmup')return `START ${(Math.max(0,m.warmupEndsAt-now)/1000).toFixed(1)}`;if(m.status==='active'){if(spec.scoreType==='none')return 'SANDBOX';const sec=Math.max(0,Math.ceil((m.endsAt-now)/1000)),min=Math.floor(sec/60);return `${min}:${String(sec%60).padStart(2,'0')}`;}if(m.status==='ended'){if(m.winner==='draw')return 'DRAW';if(m.winnerName)return `${String(m.winnerName).toUpperCase()} WINS`;return `${String(m.winner||'').toUpperCase()} WINS`;}return 'LOBBY';}

function resetMatchPresentationForLobby(){
  if(chatOpen)void dismissChat({restorePointer:false});else chatComposer.classList.add('hide');
  chatMessages.length=0;scoreboardOpen=false;scoreboardScroll=0;scoreboardDrag=null;scoreboardPanel=null;clearToastNotifications();announcerCurrent=null;announcerQueue.length=0;
  resetTouchInput();clearFireInput();cancelEquipmentAim();keys.clear();clearRemotes();clearBullets();clearRocketTrailPuffs();clearThrowables();clearTacticalFx();clearSmokeClouds();
  killFeed.length=0;bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;headshotUntil=0;killConfirmUntil=0;killConfirmHeadshot=false;killConfirmDistance=0;lastShotVisualAt=0;wastedUntil=0;lastWastedBy='';lastWastedWeapon='';
  traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;jumpBufferedUntil=0;crouchWanted=false;crouched=false;crouchBlend=0;setAim(false);hudLayout=null;hudLastDraw=0;resetLocalPredictionHistory();resetRemoteNetworkTiming();
}
function handleMatchLobby(m){
  applyClientMatchState(m.match);matchCustom=!!m.custom;const players=Array.isArray(m.players)?m.players:[],bots=Array.isArray(m.bots)?m.bots:[],self=players.find(player=>samePlayerId(player?.id,clientId))||null;
  if(self){myTeam=self.team||myTeam;rememberTeam(myTeam);pendingTeam='';primaryWeapon=PRIMARY_WEAPONS.includes(self.primaryWeapon)?self.primaryWeapon:primaryWeapon;tacticalEquipment=normalizeTactical(self.tactical);lethalEquipment=normalizeLethal(self.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberEquipment(tacticalEquipment,lethalEquipment);currentWeapon=primaryWeapon;godMode=!!self.godMode;hp=Math.max(0,Math.min(100,Number(self.hp??100)||0));myStats={kills:Number(self.kills)||0,deaths:Number(self.deaths)||0};ammo=normalizeClientAmmo(self.ammo);equipment=normalizeEquipment(self.equipment);selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;syncLocalWeaponModel();}
  pendingGameSnapshot=self?gameSnapshot(self,players,bots,m.match?.serverTime):null;replaceLobbyParticipants(players,bots);resetMatchPresentationForLobby();syncModeVisuals();syncPauseContext();showLobby();
}

function handleMessage(m){
  if(m.t==='welcome'){
    if(Number(m.protocol)!==PROTOCOL_VERSION){showToast('CLIENT / SERVER VERSION MISMATCH');leaveMatch();return;}
    if(Number.isFinite(Number(m.serverTime)))serverClockOffset=Number(m.serverTime)-Date.now();
    setActiveMap(m.mapId,{rebuild:true});currentRoom=m.code;isMatchAdmin=!!m.isAdmin;matchOwnerId=String(m.ownerClientId||'');applyWorldSettings(m.settings||DEFAULT_WORLD_SETTINGS);botConfig=normalizeBotConfig(m.botConfig);matchState=normalizeClientMatch(m.match);matchCustom=!!m.custom;myTeam=m.self.team||myTeam;rememberTeam(myTeam);selfColor=TEAM_COLORS[myTeam]||m.self.color||selfColor;godMode=!!m.self.godMode;verticalVelocity=Number.isFinite(Number(m.self.verticalVelocity))?Number(m.self.verticalVelocity):0;moveVelocityX=moveVelocityZ=0;onGround=m.self.grounded!==false;lastGroundedAt=onGround?performance.now():0;jumpBufferedUntil=0;crouched=!!m.self.crouched;crouchWanted=crouched;crouchBlend=crouched?1:0;jumpSeq=Math.max(0,Math.floor(Number(m.self.jumpSeq)||0));traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;hp=m.self.hp??100;myStats={kills:Number(m.self.kills)||0,deaths:Number(m.self.deaths)||0};wastedUntil=m.self.wastedUntil||0;primaryWeapon=PRIMARY_WEAPONS.includes(m.self.primaryWeapon)?m.self.primaryWeapon:primaryWeapon;tacticalEquipment=normalizeTactical(m.self.tactical);lethalEquipment=normalizeLethal(m.self.lethal);pendingLoadout=m.self.pendingLoadout?normalizeLoadoutChoice(m.self.pendingLoadout):null;rememberPrimary(primaryWeapon);rememberEquipment(tacticalEquipment,lethalEquipment);pendingTeam=m.self.pendingTeam||'';currentWeapon=(m.self.weapon==='pistol'||m.self.weapon===primaryWeapon)?m.self.weapon:primaryWeapon;ammo=normalizeClientAmmo(m.self.ammo);equipment=normalizeEquipment(m.self.equipment);pendingWeapon='';reloadRequestPending=false;reloadUntil=m.self.reloadAt||0;reloadWeapon=m.self.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;warmWeaponAudio(currentWeapon);syncLocalWeaponModel();
    yaw=m.self.yaw||0;pitch=m.self.pitch||0;viewRecoilPitch=viewRecoilYaw=viewRecoilPitchVelocity=viewRecoilYawVelocity=0;resetLocalPredictionHistory();resetRemoteNetworkTiming();pendingGameSnapshot=gameSnapshot(m.self,m.players||[],m.bots||[],m.serverTime);replaceLobbyParticipants(m.players||[],m.bots||[]);
    syncModeVisuals();syncLocalStatus();syncPauseContext();if(matchAllowsLobbyEdits(matchState))showLobby();else{void enterGame(pendingGameSnapshot);}return;
  }
  if(m.t==='map'){
    const changed=setActiveMap(m.mapId,{rebuild:true}),players=Array.isArray(m.players)?m.players:[],bots=Array.isArray(m.bots)?m.bots:[],self=players.find(p=>samePlayerId(p.id,clientId));
    pendingGameSnapshot=self?gameSnapshot(self,players,bots,m.serverTime||serverNow()):pendingGameSnapshot;replaceLobbyParticipants(players,bots);syncLobby();
    if(changed)showToast(`MAP · ${mapSpec(currentMapId).name}`);return;
  }
  if(m.t==='join'){upsertLobbyParticipant(m.player);if(shell.inMatch&&engineReady)upsertRemote(m.player,true);syncPauseContext();renderAdminPlayers();syncLobby();showToast(`${m.player.name} joined`);return;}
  if(m.t==='leave'){const lobbyRow=lobbyParticipants.get(String(m.id||'')),r=remotes.get(m.id);if((lobbyRow&&!lobbyRow.bot)||(r&&!r.bot))showToast(`${lobbyRow?.name||r?.name||'Player'} left`);removeLobbyParticipant(m.id);if(engineReady)removeRemote(m.id);syncPauseContext();renderAdminPlayers();syncLobby();return;}
  if(m.t==='lobbyPlayer'){
    const p=m.player;if(!p?.id)return;
    if(p.id===clientId){myTeam=p.team||myTeam;rememberTeam(myTeam);primaryWeapon=PRIMARY_WEAPONS.includes(p.primaryWeapon)?p.primaryWeapon:primaryWeapon;tacticalEquipment=normalizeTactical(p.tactical);lethalEquipment=normalizeLethal(p.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberEquipment(tacticalEquipment,lethalEquipment);currentWeapon=primaryWeapon;godMode=!!p.godMode;ammo=normalizeClientAmmo(p.ammo);equipment=normalizeEquipment(p.equipment);selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;syncLocalWeaponModel();}else{upsertLobbyParticipant(p);if(shell.inMatch&&engineReady)upsertRemote(p,true);}
    syncPauseContext();syncLobby();return;
  }
  if(m.t==='state'){const r=remotes.get(m.id);if(r)updateRemoteTarget(r,m);return;}
  if(m.t==='traverse'){handleTraversalMessage(m);return;}
  if(m.t==='ladder'){handleLadderMessage(m);return;}
  if(m.t==='correction'){applyServerCorrection(m);return;}
  if(m.t==='botState'){for(const b of m.bots||[])upsertRemote({...b,at:m.at},false);return;}
  if(m.t==='shot'){handleShot(m);return;}
  if(m.t==='projectileState'){updateLauncherProjectileState(m);return;}
  if(m.t==='bulletEnd'){removeBullet(m.id);return;}
  if(m.t==='equipment'){equipment=normalizeEquipment(m.equipment);return;}
  if(m.t==='throwable'){spawnThrowableVisual(m);return;}
  if(m.t==='throwableState'){updateThrowableVisual(m);return;}
  if(m.t==='throwableImpact'){handleThrowableImpact(m);return;}
  if(m.t==='throwAck'){if(m.accepted===false)removeThrowableVisual(m.id);return;}
  if(m.t==='throwableEnd'){removeThrowableVisual(m.id);return;}
  if(m.t==='flashDetonate'){soundTacticalDetonation('flash',m);spawnDetonationFx('flash',m);removeThrowableVisual(m.id);return;}
  if(m.t==='smokeDetonate'){soundTacticalDetonation('smoke',m);spawnSmokeCloud(m);removeThrowableVisual(m.id);return;}
  if(m.t==='flashEffect'){applyFlashEffect(m);return;}
  if(m.t==='explosion'){const projectile=bullets.get(m.id);if(projectile?.type==='launcher')projectile.root.position.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);soundTacticalDetonation(m.kind||'sticky',m);spawnDetonationFx(m.kind||'sticky',m);removeBullet(m.id);removeThrowableVisual(m.id);return;}
  if(m.t==='chat'){receiveChatMessage(m);return;}
  if(m.t==='loadout'){applyAuthoritativeLoadout(m);syncLobby();return;}
  if(m.t==='weapon'){const r=remotes.get(m.id);if(r){r.weapon=m.weapon||'pistol';r.swapStartedAt=performance.now();syncRemoteWeapon(r);}return;}
  if(m.t==='reload'){const r=remotes.get(m.id);if(r){r.reloadUntil=Number(m.reloadAt)||0;r.reloadStartedAt=serverNow();r.reloadWeapon=m.weapon||r.weapon;if(r.reloadWeapon!=='shotgun'&&r.reloadUntil)playSpatialCue(reloadSoundId(r.reloadWeapon),r.group.position.x,r.group.position.y+1,r.group.position.z,34,.72);}return;}
  if(m.t==='reloadShell'){const r=remotes.get(m.id);if(r){r.reloadUntil=Number(m.reloadAt)||0;r.reloadStartedAt=r.reloadUntil?serverNow():0;r.reloadWeapon=r.reloadUntil?'shotgun':'';playSpatialCue('reloadShotgun',r.group.position.x,r.group.position.y+1,r.group.position.z,34,.72);}return;}
  if(m.t==='god'){if(typeof m.custom==='boolean')matchCustom=m.custom;if(m.id===clientId){godMode=!!m.enabled;syncLobby();syncPauseContext();if(shell.panel===SHELL_PANEL.LOADOUT)syncMatchLoadoutEditor();showToast(godMode?'GOD MODE ENABLED':'GOD MODE DISABLED',{priority:2,key:'god-mode-state'});}else{const row=lobbyParticipants.get(String(m.id||''));if(row)row.godMode=!!m.enabled;const r=remotes.get(m.id);if(r){r.godMode=!!m.enabled;if(r.godRing)r.godRing.visible=r.godMode;}}renderAdminPlayers();syncLobby();return;}
  if(m.t==='adminRole'){if(m.id===clientId){isMatchAdmin=!!m.enabled;syncPauseContext();if(!isMatchAdmin&&shell.panel===SHELL_PANEL.ADMIN)closeAdminPanel();showToast(isMatchAdmin?'ADMIN PRIVILEGES GRANTED':'ADMIN PRIVILEGES REMOVED');}else{const row=lobbyParticipants.get(String(m.id||''));if(row)row.admin=!!m.enabled;const r=remotes.get(m.id);if(r)r.admin=!!m.enabled;}renderAdminPlayers();syncLobby();return;}
  if(m.t==='teamQueued'){if(m.id===clientId){pendingTeam=m.pendingTeam||'';syncPauseContext();showToast(pendingTeam?`TEAM SWITCH QUEUED · ${pendingTeam.toUpperCase()}`:'TEAM SWITCH CANCELED');syncLobby();}return;}
  if(m.t==='matchLobby'){handleMatchLobby(m);return;}
  if(m.t==='match'){applyClientMatchState(m.match);matchCustom=!!m.custom;if(shell.panel===SHELL_PANEL.ADMIN&&m.rulesUpdated&&m.by===clientId)setAdminStatus('Match rules updated in the lobby.','ok');if(matchAllowsLobbyEdits(matchState)){syncLobby();syncModeVisuals();}return;}
  if(m.t==='matchReset'){applyClientMatchState(m.match);matchCustom=!!m.custom;myStats={kills:0,deaths:0};const players=m.players||[],bots=m.bots||[],self=players.find(pl=>pl?.id===clientId)||null;if(self){myTeam=self.team||myTeam;pendingTeam='';primaryWeapon=PRIMARY_WEAPONS.includes(self.primaryWeapon)?self.primaryWeapon:primaryWeapon;tacticalEquipment=normalizeTactical(self.tactical);lethalEquipment=normalizeLethal(self.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberEquipment(tacticalEquipment,lethalEquipment);}pendingGameSnapshot=gameSnapshot(self,players,bots,m.match?.serverTime);replaceLobbyParticipants(players,bots);syncModeVisuals();if(shell.inLobby||!engineReady){void enterGame(pendingGameSnapshot,{resetRound:true});}else applyGameSnapshot(pendingGameSnapshot,{resetRound:true});showToast('MATCH STARTING',{duration:1100,key:'match-start'});return;}
  if(m.t==='blocked'){handleBlocked(m);return;}
  if(m.t==='kill'){handleKill(m);return;}
  if(m.t==='settings'){applyWorldSettings(m.settings||DEFAULT_WORLD_SETTINGS);if(typeof m.custom==='boolean')matchCustom=m.custom;const section=m.section==='advanced'?'advanced':'gameplay';if(shell.inLobby&&m.by===clientId){if(section==='advanced')lobbyWeaponsApplying=false;else lobbyGameplayApplying=false;}if(shell.panel===SHELL_PANEL.ADMIN){if(m.by===clientId){if(section==='advanced')populateAdminWeapons(worldSettings);else populateAdminGameplay(worldSettings);setAdminStatus(section==='advanced'?'Weapons applied.':'Gameplay applied.','ok');}else if(activeAdminTab!==section){if(section==='advanced')populateAdminWeapons(worldSettings);else populateAdminGameplay(worldSettings);}}syncLobby();showToast(section==='advanced'?'WEAPON RULES UPDATED':'GAMEPLAY RULES UPDATED');return;}
  if(m.t==='bots'){botConfig=normalizeBotConfig(m.config);syncLobbyBots(m.bots||[]);if(shell.inMatch&&engineReady)syncBotRoster(m.bots||[]);syncLobby();if(shell.panel===SHELL_PANEL.ADMIN){populateAdminBots(botConfig);setAdminStatus(shell.inMatch?'Live bot roster updated.':'Lobby bot roster updated.','ok');}showToast(`BOTS · ${botConfig.difficulty.toUpperCase()}`);return;}
  if(m.t==='notice'){showToast(m.text||'Server notice',{priority:m.tone==='error'?3:1,key:`notice:${m.text||'server'}`});if(shell.panel===SHELL_PANEL.ADMIN)setAdminStatus(m.text||'Server notice',m.tone==='error'?'error':'');return;}
  if(m.t==='pong'){const echoed=Number(m.clientAt)||lastPingLocalAt;if(echoed&&Number.isFinite(Number(m.at))){const received=Date.now(),mid=echoed+(received-echoed)/2,estimate=Number(m.at)-mid;serverClockOffset=serverClockOffset*.7+estimate*.3;}return;}
  if(m.t==='health'){if(m.id===clientId){hp=Math.max(0,Math.min(100,Number(m.hp)||0));syncLocalStatus();}else{const r=remotes.get(m.id);if(r)r.hp=Math.max(0,Math.min(100,Number(m.hp)||0));}return;}
  if(m.t==='hit'){handleHit(m);return;}
  if(m.t==='respawn'){handleRespawn(m.player);return;}
}

async function enterGame(snapshot=pendingGameSnapshot,{resetRound=false}={}){
  stopIntroMusic();shell.beginConnection('Loading game…');
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

function leaveMatch(){
  if(chatOpen)void dismissChat({restorePointer:false});chatMessages.length=0;
  shell.leaveToMenu();disableMenu(false);serverClockOffset=0;lastPingLocalAt=0;resetLocalPredictionHistory();resetRemoteNetworkTiming();clearTimeout(reconnectTimer);if(socket){try{socket.close(1000,'Left match')}catch{}}socket=null;currentRoom='';isMatchAdmin=false;matchOwnerId='';lobbyParticipants.clear();pendingGameSnapshot=null;lobbyMatchDraft=null;lobbyMatchDirty=lobbyMatchApplying=false;lobbyGameplayApplying=lobbyWeaponsApplying=false;lobbyMapDraft='';lobbyMapDirty=lobbyMapApplying=false;lobbyLoadoutDraft=null;lobbyLoadoutDirty=lobbyLoadoutApplying=false;clearTimeout(lobbyAutoSaveTimer);lobbyAutoSaveTimer=0;syncLobbyHostControlPlacement();applyWorldSettings(DEFAULT_WORLD_SETTINGS);
  resetTouchInput();clearRemotes();clearBullets();clearRocketTrailPuffs();clearThrowables();clearTacticalFx();clearSmokeClouds();keys.clear();hp=100;wastedUntil=0;godMode=false;pendingTeam='';matchState=normalizeClientMatch(null);matchCustom=false;primaryWeapon=preferredPrimary;tacticalEquipment=preferredTactical;lethalEquipment=preferredLethal;pendingLoadout=null;currentWeapon=primaryWeapon;crouchWanted=false;crouched=false;crouchBlend=0;viewFeetY=NaN;verticalVelocity=moveVelocityX=moveVelocityZ=0;lastGroundedAt=0;jumpBufferedUntil=0;viewRecoilPitch=viewRecoilYaw=viewRecoilPitchVelocity=viewRecoilYawVelocity=0;lastLocalShotAt=0;localShotHeat=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localShotHeatAt=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localRecoilStep=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;ammo=freshClientAmmo();equipment=freshClientEquipment(tacticalEquipment,lethalEquipment);reloadRequestPending=false;lastStateSent=0;lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,crouched:false,grounded:true,moveX:0,moveZ:0,ladderId:'',ladderMove:0};pendingWeapon='';reloadUntil=0;reloadWeapon='';reloadStartedAt=0;weaponSwapStartedAt=0;deathAnimStartedAt=0;localMoveAmount=0;landingKick=0;nextFootstepAt=0;footstepSide=0;shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;fireReadyAt=freshClientFireReady();clearFireInput();localEquipmentCooldownUntil=0;lastSimHeartbeat=0;cancelEquipmentAim();killFeed.length=0;bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;lastShotVisualAt=0;myStats={kills:0,deaths:0};scoreboardOpen=false;killConfirmUntil=0;killConfirmHeadshot=false;killConfirmDistance=0;headshotUntil=0;announcerCurrent=null;announcerQueue.length=0;clearToastNotifications();setAim(false);syncLocalWeaponModel();
  const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);refreshMatches();
}

function normalizeBotConfig(value){const v=value&&typeof value==='object'?value:{};const blueBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(v.blueBots)||0))),redBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(v.redBots)||0)));const diff=['easy','normal','hard','elite'].includes(String(v.difficulty||'normal').toLowerCase())?String(v.difficulty||'normal').toLowerCase():'normal';return{blueBots,redBots,difficulty:diff};}
function botDifficultyDescription(diff){return({easy:'Forgiving aim and slower reactions.',normal:'Faster pressure, tighter aim and active strafing.',hard:'Aggressive pursuit, fast strafing and accurate sustained fire.',elite:'Relentless pursuit, evasive strafing, long range and near-instant reactions.'})[diff]||'Faster pressure and tighter aim.';}
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
function populateAdminWeapons(value){const x=normalizeWorldSettings(value);for(const name of WEAPON_ORDER){const cap=name[0].toUpperCase()+name.slice(1),w=x.weapons[name];$(`set${cap}Damage`).value=w.damage;$(`set${cap}Speed`).value=w.speed;$(`set${cap}Reload`).value=(w.reloadMs/1000).toFixed(2);$(`set${cap}Cooldown`).value=Math.round(60000/w.cooldownMs);}}
function populateAdminSettings(value){populateAdminGameplay(value);populateAdminWeapons(value);}
function collectAdminGameplayPatch(){return{movement:{runSpeed:$('setRunSpeed').value,walkSpeed:$('setWalkSpeed').value,jumpHeight:$('setJumpHeight').value,gravity:$('setGravity').value},combat:{regenDelayMs:Number($('setRegenDelay').value)*1000,regenPerSecond:$('setRegenRate').value,respawnMs:Number($('setRespawnDelay').value)*1000}};}
function collectAdminWeaponsPatch(){return{weapons:Object.fromEntries(WEAPON_ORDER.map(name=>{const cap=name[0].toUpperCase()+name.slice(1);return[name,{damage:$(`set${cap}Damage`).value,speed:$(`set${cap}Speed`).value,reloadMs:Number($(`set${cap}Reload`).value)*1000,cooldownMs:60000/Math.max(24,Number($(`set${cap}Cooldown`).value)||60)}]}))};}
function adminPlayerSnapshot(){if(shell.inLobby)return lobbySnapshot().filter(r=>!r.bot).map(r=>({id:r.id,name:r.name,team:r.team,godMode:!!r.godMode,admin:!!r.admin,self:!!r.self}));return[{id:clientId,name:myName||'You',team:myTeam,godMode,admin:isMatchAdmin,self:true},...Array.from(remotes.values()).filter(r=>!r.bot).map(r=>({id:r.id,name:r.name,team:r.team,godMode:!!r.godMode,admin:!!r.admin,self:false}))];}
function renderAdminPlayers(force=false){
  const root=$('adminPlayerList');if(!root)return;if(!force&&(shell.panel!==SHELL_PANEL.ADMIN||activeAdminTab!=='players'))return;root.innerHTML='';
  for(const pl of adminPlayerSnapshot()){
    const row=document.createElement('div');row.className='admin-player-row';const owner=pl.id===matchOwnerId,self=!!pl.self;
    const godAction=`<button class="btn admin-mini ${pl.godMode?'active':''}" data-admin-god="${pl.id}">${pl.godMode?'God Mode On':'God Mode Off'}</button>`;
    const roleAction=(owner||self)?`<button class="btn admin-mini ${pl.admin?'active':''}" disabled>${owner?'Host':pl.admin?'Admin':'Player'}</button>`:`<button class="btn admin-mini ${pl.admin?'active':''}" data-admin-role="${pl.id}">${pl.admin?'Admin':'Make Admin'}</button>`;
    row.innerHTML=`<div class="admin-player-identity"><span class="admin-team-dot ${currentModeSpec().teamBased?pl.team:'ffa'}"></span><div><strong>${escapeHtml(pl.name)}${self?' (You)':''}</strong><small>${owner?'HOST':pl.admin?'ADMIN':'PLAYER'} · ${currentModeSpec().teamBased?String(pl.team||'blue').toUpperCase():'FFA'}</small></div></div><div class="admin-player-actions">${godAction}${roleAction}</div>`;root.appendChild(row);
  }
  for(const btn of root.querySelectorAll('[data-admin-god]'))btn.addEventListener('click',()=>{const id=btn.dataset.adminGod,pl=adminPlayerSnapshot().find(x=>x.id===id);if(pl)send({t:'adminPlayer',targetId:id,action:'god',enabled:!pl.godMode});});
  for(const btn of root.querySelectorAll('[data-admin-role]'))btn.addEventListener('click',()=>{const id=btn.dataset.adminRole,pl=adminPlayerSnapshot().find(x=>x.id===id);if(pl&&!pl.self)send({t:'adminPlayer',targetId:id,action:'admin',enabled:!pl.admin});});
}
function requestTeamChange(team){if(!shell.inMatch||socket?.readyState!==WebSocket.OPEN)return;const next=team==='red'?'red':'blue';send({t:'team',team:next});if(godMode)showToast(next===myTeam?`ALREADY ON ${next.toUpperCase()}`:`SWITCHING TO ${next.toUpperCase()}`);else showToast(next===myTeam?'CANCELING TEAM SWITCH':`SWITCH TO ${next.toUpperCase()} ON RESPAWN`);}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function applyRemoteTeamVisual(r,team){if(!r)return;const next=team==='red'?'red':'blue';r.team=next;r.color=remoteDisplayColor(next);if(r.body?.material?.color)r.body.material.color.set(remoteDisplayColor(next));if(r.tag){r.group.remove(r.tag);r.tag.material?.map?.dispose?.();r.tag.material?.dispose?.();r.tag=makeNameTag(r.bot?`[BOT] ${r.name}`:r.name,remoteDisplayColor(next));r.tag.position.set(0,2.18,0);r.tag.visible=r.hp>0&&(modeFriendly(next)||samePlayerId(r.id,aimedRemoteId));r.group.add(r.tag);}}
function syncAdminWeaponEditor(name='assault'){
  const select=$('adminWeaponSelect');
  const next=WEAPON_ORDER.includes(name)?name:'assault';
  if(select)select.value=next;
  for(const card of document.querySelectorAll('[data-admin-weapon-editor]')){
    const active=card.dataset.adminWeaponEditor===next;
    card.hidden=!active;card.inert=!active;
  }
}
function openAdminPanel(initialTab='gameplay'){if(!isMatchAdmin){showToast('HOST ACCESS REQUIRED');return;}if(shell.inLobby){syncLobbyHostControlPlacement();if(initialTab==='players'){switchLobbySide('players');return;}switchLobbySide('cheats');switchSubTabs('[data-lobby-cheat-tab]','[data-lobby-cheat-page]','data-lobby-cheat-tab','data-lobby-cheat-page',initialTab==='advanced'?'weapons':'gameplay');return;}syncLobbyHostControlPlacement();syncAdminContext();populateAdminSettings(worldSettings);switchAdminTab(initialTab);syncAdminWeaponEditor($('adminWeaponSelect')?.value||'assault');setAdminStatus(matchCustom?'CUSTOM tuning active.':'Advanced settings are unchanged.');shell.openPanel(SHELL_PANEL.ADMIN);renderAdminPlayers(true);}
function closeAdminPanel(){shell.closePanel(SHELL_PANEL.ADMIN);}
function resetActiveAdminTab(){if(activeAdminTab==='gameplay'){populateAdminGameplay(worldSettings);populateAdminBots(botConfig);}else if(activeAdminTab==='advanced')populateAdminWeapons(worldSettings);setAdminStatus('Changes reset.');}
function saveAdminSettings(){
  if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN){setAdminStatus('Host connection unavailable.','error');return;}
  if(activeAdminTab==='gameplay'){let bots=null;if(shell.inMatch){bots=collectAdminBotConfig();if(!bots){setAdminStatus(`Maximum ${MAX_BOTS} bots per match.`,'error');return;}}send({t:'adminSettings',section:'gameplay',patch:collectAdminGameplayPatch()});if(bots){send({t:'adminBots',...bots});setAdminStatus('Applying gameplay and live bot roster…');}else setAdminStatus('Applying gameplay…');return;}
  if(activeAdminTab==='advanced'){send({t:'adminSettings',section:'advanced',patch:collectAdminWeaponsPatch()});setAdminStatus('Applying weapons…');return;}
}

function openPause(){if(!shell.inMatch||shell.paused)return;shell.pause('user-pause');}
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
  const sample={at,x:Number(player.x)||0,y:Number(player.y)||0,z:Number(player.z)||0,yaw:Number(player.yaw)||0,ads:player.ads??r.ads,crouched:player.crouched??r.crouched};
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
    return {at:renderAt,x:THREE.MathUtils.lerp(a.x,b.x,t),y:THREE.MathUtils.lerp(a.y,b.y,t),z:THREE.MathUtils.lerp(a.z,b.z,t),yaw:a.yaw+yawDelta*t,ads:t<.5?a.ads:b.ads,crouched:t<.5?a.crouched:b.crouched};
  }
  const b=history[history.length-1],a=history[history.length-2],sourceSpan=Math.max(1,b.at-a.at),extra=Math.min(REMOTE_EXTRAPOLATION_MAX_MS,Math.max(0,renderAt-b.at));if(extra<=0)return {...b};
  const seconds=sourceSpan/1000,extrapSec=extra/1000,maxPlanar=Math.max(4,worldSettings.movement.runSpeed*1.35),vx=THREE.MathUtils.clamp((b.x-a.x)/seconds,-maxPlanar,maxPlanar),vz=THREE.MathUtils.clamp((b.z-a.z)/seconds,-maxPlanar,maxPlanar),vy=THREE.MathUtils.clamp((b.y-a.y)/seconds,-13,9),yawRate=THREE.MathUtils.clamp(normalizeAngle(b.yaw-a.yaw)/seconds,-7,7);
  return {at:b.at+extra,x:b.x+vx*extrapSec,y:b.y+vy*extrapSec,z:b.z+vz*extrapSec,yaw:b.yaw+yawRate*extrapSec,ads:b.ads,crouched:b.crouched};
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
  const gunMat=new THREE.MeshStandardMaterial({color:0x252a30,roughness:.5,metalness:.25});
  const pistol=new THREE.Mesh(new THREE.BoxGeometry(.13,.10,.38),gunMat);pistol.position.set(.45,1.08,-.25);
  const assault=new THREE.Mesh(new THREE.BoxGeometry(.13,.11,.66),gunMat.clone());assault.position.set(.45,1.09,-.38);assault.visible=false;
  const ump=new THREE.Mesh(new THREE.BoxGeometry(.15,.14,.48),gunMat.clone());ump.position.set(.45,1.08,-.34);ump.visible=false;
  const shotgun=new THREE.Mesh(new THREE.BoxGeometry(.15,.12,.74),gunMat.clone());shotgun.position.set(.45,1.10,-.41);shotgun.visible=false;
  const semiShotgun=new THREE.Mesh(new THREE.BoxGeometry(.16,.13,.69),gunMat.clone());semiShotgun.position.set(.45,1.10,-.40);semiShotgun.visible=false;
  const sniper=new THREE.Mesh(new THREE.BoxGeometry(.12,.10,.82),gunMat.clone());sniper.position.set(.45,1.10,-.45);sniper.visible=false;
  const grenadeLauncher=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.68,9),gunMat.clone());grenadeLauncher.rotation.x=Math.PI/2+GRENADE_LAUNCH_PITCH;grenadeLauncher.position.set(.45,1.08,-.40);grenadeLauncher.visible=false;
  const rpg=new THREE.Mesh(new THREE.CylinderGeometry(.06,.06,.88,9),gunMat.clone());rpg.rotation.x=Math.PI/2;rpg.position.set(.38,1.42,-.43);rpg.visible=false;
  const godRing=new THREE.Mesh(new THREE.TorusGeometry(.42,.035,6,28),new THREE.MeshBasicMaterial({color:0xffdd67,transparent:true,opacity:.9}));godRing.rotation.x=Math.PI/2;godRing.position.y=2.03;godRing.visible=!!player.godMode;
  model.add(body,head,armL,armR,legL,legR,pistol,assault,ump,shotgun,semiShotgun,sniper,grenadeLauncher,rpg,godRing);group.position.set(player.x||0,player.y||0,player.z||0);scene.add(group);
  const tag=makeNameTag(player.bot?`[BOT] ${player.name||'Bot'}`:(player.name||'Player'),remoteDisplayColor(team));tag.position.set(0,2.18,0);group.add(tag);
  const now=performance.now();
  const remote={id:player.id,name:player.name||'Player',color:remoteDisplayColor(team),team,bot:!!player.bot,weapon:player.weapon||'pistol',primaryWeapon:PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:'assault',group,model,tag,target:new THREE.Vector3(player.x||0,player.y||0,player.z||0),targetYaw:player.yaw||0,hp:player.hp??100,kills:Number(player.kills)||0,deaths:Number(player.deaths)||0,armL,armR,legL,legR,body,head,pistol,assault,ump,shotgun,semiShotgun,sniper,grenadeLauncher,rpg,godRing,godMode:!!player.godMode,admin:!!player.admin,lastSeen:now,lastNetAt:now,lastNetServerAt:Number.isFinite(Number(player.at))?Number(player.at):serverNow(),lastNetX:player.x||0,lastNetY:player.y||0,lastNetZ:player.z||0,snapshots:[],moveSpeed:0,airborne:false,ads:!!player.ads,crouched:!!player.crouched,crouchBlend:player.crouched?1:0,animPhase:Math.random()*Math.PI*2,deathPose:player.hp<=0?1:0,reloadUntil:Number(player.reloadAt)||0,reloadStartedAt:0,reloadWeapon:player.reloadWeapon||'',swapStartedAt:0,fireKickUntil:0,revealedUntil:0,nextFootstepAt:now+300+Math.random()*260,footstepSide:Math.random()<.5?0:1,traversal:player.traversal?traversalPlanFromServer({id:player.id,accepted:true,...player.traversal}):null,ladder:player.ladder?ladderStateFromServer(player.ladder):null};tag.visible=remote.hp>0&&modeFriendly(team);
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
function upsertRemote(player,instant=false){if(!player?.id)return;if(samePlayerId(player.id,clientId)){for(const [id] of remotes){if(samePlayerId(id,clientId))removeRemote(id);}return;}let r=remotes.get(player.id);if(!r){r=makeRemote(player);remotes.set(player.id,r);}const oldTeam=r.team;r.name=player.name||r.name;r.bot=!!player.bot;r.team=player.team||r.team;r.color=remoteDisplayColor(r.team);r.admin=player.admin??r.admin;r.weapon=player.weapon||r.weapon;if(PRIMARY_WEAPONS.includes(player.primaryWeapon))r.primaryWeapon=player.primaryWeapon;r.hp=player.hp??r.hp;r.kills=Number(player.kills??r.kills)||0;r.deaths=Number(player.deaths??r.deaths)||0;r.godMode=player.godMode??r.godMode;if(player.traversal&&typeof player.traversal==='object'&&Number(player.traversal.seq)!==Number(r.traversal?.seq))r.traversal=traversalPlanFromServer({id:player.id,accepted:true,...player.traversal});else if(player.bot&&player.traversal===null)r.traversal=null;if(player.ladder&&typeof player.ladder==='object')r.ladder=ladderStateFromServer(player.ladder);else if(player.ladder===null)r.ladder=null;if(r.godRing)r.godRing.visible=!!r.godMode;if(oldTeam!==r.team)applyRemoteTeamVisual(r,r.team);syncRemoteWeapon(r);updateRemoteTarget(r,player,instant);}
function removeRemote(id){const r=remotes.get(id);if(!r)return;scene.remove(r.group);r.group.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material){if(o.material.map)o.material.map.dispose?.();o.material.dispose?.();}});remotes.delete(id);}
function clearRemotes(){for(const id of [...remotes.keys()])removeRemote(id);}

function handleBlocked(m){
  if(m.attacker===clientId){hitUntil=performance.now()+180;soundShield();showToast('BLOCKED',{duration:900,key:'blocked-shot'});}
  if(m.target===clientId){hurtUntil=performance.now()+220;soundShield();}
}
function handleHit(m){
  const targetRemote=remotes.get(m.target);if(targetRemote){targetRemote.hp=m.hp;if(m.wasted){targetRemote.traversal=null;targetRemote.ladder=null;}flashRemote(targetRemote);}
  if(m.attacker===clientId){showHitmarker(!!m.headshot);if(m.headshot)soundHeadshot();else soundHitmarker(m.weapon||'pistol');}
  if(m.target===clientId){
    hp=m.hp;knockX+=m.knockback?.x||0;knockZ+=m.knockback?.z||0;verticalVelocity=Math.max(verticalVelocity,m.knockback?.y||0);onGround=false;addDamageFeedback(m);syncLocalStatus();showHurt();soundHurt();
    if(m.wasted){traversal=null;ladderState=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;wastedUntil=m.respawnAt||serverNow()+worldSettings.combat.respawnMs;deathAnimStartedAt=performance.now();clearFireInput();cancelEquipmentAim();showToast('ELIMINATED');}
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
    const relative=normalizeAngle(bearing-yaw),radius=Math.min(w,h)*.26,x=w/2-Math.sin(relative)*radius,y=h/2-Math.cos(relative)*radius,rot=relative;
    c.save();c.translate(x,y);c.rotate(rot);c.globalAlpha=Math.min(1,remain*2)*d.strength;c.strokeStyle='#ff334d';c.fillStyle='rgba(255,30,55,.28)';c.lineWidth=3.2;c.beginPath();c.moveTo(-18,8);c.lineTo(0,-9);c.lineTo(18,8);c.stroke();c.beginPath();c.moveTo(-13,6);c.lineTo(0,-5);c.lineTo(13,6);c.lineTo(0,1);c.closePath();c.fill();c.restore();
  }
}
function handleRespawn(player){viewRecoilPitch=viewRecoilYaw=viewRecoilPitchVelocity=viewRecoilYawVelocity=0;lastLocalShotAt=0;localShotHeat=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localShotHeatAt=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));localRecoilStep=Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));
  if(!player?.id)return;
  if(player.id===clientId){resetLocalPredictionHistory();hp=Math.max(0,Math.min(100,Number(player.hp??100)||0));myStats={kills:Number(player.kills??myStats.kills)||0,deaths:Number(player.deaths??myStats.deaths)||0};wastedUntil=0;lastWastedBy='';lastWastedWeapon='';bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;lastShotVisualAt=0;localEquipmentCooldownUntil=0;myTeam=player.team||myTeam;pendingTeam=player.pendingTeam||'';selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;primaryWeapon=PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:primaryWeapon;tacticalEquipment=normalizeTactical(player.tactical);lethalEquipment=normalizeLethal(player.lethal);pendingLoadout=null;rememberPrimary(primaryWeapon);rememberEquipment(tacticalEquipment,lethalEquipment);currentWeapon=(player.weapon==='pistol'||player.weapon===primaryWeapon)?player.weapon:primaryWeapon;sniperZoomLevel=0;adsWanted=false;crouchWanted=false;crouched=false;crouchBlend=0;ammo=normalizeClientAmmo(player.ammo);equipment=normalizeEquipment(player.equipment);pendingWeapon='';reloadRequestPending=false;reloadUntil=player.reloadAt||0;reloadWeapon=player.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;deathAnimStartedAt=0;landingKick=0;nextFootstepAt=0;shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;fireReadyAt=freshClientFireReady();clearFireInput();warmWeaponAudio(currentWeapon);syncLocalWeaponModel();traversal=player.traversal?traversalPlanFromServer({id:clientId,accepted:true,...player.traversal}):null;ladderState=player.ladder?ladderStateFromServer(player.ladder):null;ladderSeq=Math.max(ladderSeq,Math.floor(Number(player.ladder?.seq)||0));traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;position.set(player.x,player.y,player.z);clearCorrectionView();resetViewVertical();verticalVelocity=Number.isFinite(Number(player.verticalVelocity))?Number(player.verticalVelocity):0;moveVelocityX=moveVelocityZ=0;onGround=player.grounded!==false;lastGroundedAt=onGround?performance.now():0;jumpBufferedUntil=0;jumpSeq=Math.max(jumpSeq,Math.floor(Number(player.jumpSeq)||0));knockX=knockZ=0;camera.rotation.z=0;syncLocalStatus();showToast('Back in');return;}
  upsertRemote(player,true);const r=remotes.get(player.id);if(r){r.hp=100;}
}
function flashRemote(r){const old=r.body.material.emissive?.clone?.();r.body.material.emissive=new THREE.Color(0x8a1020);setTimeout(()=>{if(r.body?.material)r.body.material.emissive=old||new THREE.Color(0x000000)},120);}
function showHitmarker(headshot=false){hitUntil=performance.now()+190;if(headshot)headshotUntil=performance.now()+280;}
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
function tryAttachLadder(){
  if(ladderState||traversal||!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||!onGround)return false;
  const direction=ladderDirection();if(!direction)return false;
  const faceX=-Math.sin(yaw),faceZ=-Math.cos(yaw),entry=findLadderEntry({ladders:LADDERS,x:position.x,y:position.y,z:position.z,dirX:direction.x,dirZ:direction.z,faceX,faceZ,radius:PLAYER_RADIUS,grounded:onGround});if(!entry)return false;
  const seq=++ladderSeq;
  ladderState={id:String(entry.ladderId),seq,phase:'climb',entry:entry.entry==='top'?'top':'bottom'};
  position.set(Number(entry.attachX),Number(entry.attachY),Number(entry.attachZ));
  clearCorrectionView();resetViewVertical();verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=false;landingKick=0;crouchWanted=false;crouched=false;setAim(false);cancelEquipmentAim();
  send({t:'ladder',action:'attach',seq,at:Math.round(serverNow()),ladderId:entry.ladderId,dirX:round3(direction.x),dirZ:round3(direction.z)});return true;
}
function finishLadder(end){
  if(!ladderState)return false;const ladder=activeLadder();if(!ladder)return false;const seq=++ladderSeq,target=end==='top'?ladderTopExitPoint(ladder,PLAYER_RADIUS):ladderBottomExitPoint(ladder,PLAYER_RADIUS);
  position.set(target.x,target.y,target.z);ladderState=null;verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=true;lastGroundedAt=performance.now();clearCorrectionView();resetViewVertical();localMoveAmount=0;
  send({t:'ladder',action:'dismount',end,seq,at:Math.round(serverNow()),ladderId:String(ladder.id)});sendCurrentState(true);return true;
}
function detachLadder(){
  if(!ladderState)return false;const ladder=activeLadder();if(!ladder)return false;const cp=ladderClimbPoint(ladder,PLAYER_RADIUS),seq=++ladderSeq;
  position.x=cp.x+Number(ladder.nx)*.24;position.z=cp.z+Number(ladder.nz)*.24;ladderState=null;verticalVelocity=2.15;onGround=false;lastGroundedAt=0;clearCorrectionView();resetViewVertical();send({t:'ladder',action:'detach',seq,ladderId:String(ladder.id)});sendCurrentState(true);soundJump();return true;
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
      ladderState=null;if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z))position.set(x,y,z);verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=true;lastGroundedAt=performance.now();clearCorrectionView();resetViewVertical();return;
    }
    if(m.action==='detach'){
      ladderState=null;const sameLocalAction=Number(m.seq)===Number(ladderSeq);if(!sameLocalAction&&Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z))position.set(x,y,z);verticalVelocity=Number.isFinite(Number(m.verticalVelocity))?Number(m.verticalVelocity):2.15;onGround=false;clearCorrectionView();resetViewVertical();return;
    }
    const authoritative=ladderStateFromServer(m.ladder);if(!ladderState||Number(ladderState.seq)!==Number(m.seq)){ladderState=authoritative;if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z))position.set(x,y,z);}clearCorrectionView();resetViewVertical();verticalVelocity=0;moveVelocityX=moveVelocityZ=0;onGround=false;return;
  }
  const r=remotes.get(m.id);if(!r||m.accepted===false)return;r.ladder=m.ladder?ladderStateFromServer(m.ladder):null;if(m.action==='detach'||m.action==='dismount')r.ladder=null;
}

function predictionStateForSeq(seq){for(let i=localPredictionHistory.length-1;i>=0;i--)if(localPredictionHistory[i].seq===seq)return localPredictionHistory[i];return null;}
function discardPredictionThrough(seq){while(localPredictionHistory.length&&localPredictionHistory[0].seq<=seq)localPredictionHistory.shift();}
function resetLocalPredictionHistory(){localPredictionHistory.length=0;stateSeq=0;lastCorrectionSeq=0;lastStateSent=0;lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,crouched:false,grounded:true,moveX:0,moveZ:0,ladderId:'',ladderMove:0};}
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
  const correctionMagnitude=Math.hypot(deltaX,deltaY,deltaZ),recent=!seq||stateSeq-seq<=2;
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
function setCrouch(active){crouchWanted=!!active;if(crouchWanted)crouched=true;else if(canStandHere())crouched=false;sendCurrentState(true);}
function toggleCrouch(){if(!shell.canPlay||!matchAllowsMovement(matchState)||hp<=0||traversal||ladderState)return;const next=!crouchWanted;if(!next&&!canStandHere()){crouched=true;crouchWanted=false;showToast('NEED CLEARANCE');sendCurrentState(true);return;}setCrouch(next);}
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
  const now=performance.now(),seq=++traversalSeq,plan=createTraversalPlan(candidate,position.x,position.y,position.z,now,seq);if(!plan)return false;
  traversal={...plan,dirX:direction.x,dirZ:direction.z};traversalConsumedIntentSeq=traversalIntentSeq;traversalIntentUntil=0;clearCorrectionView();resetViewVertical();verticalVelocity=0;onGround=false;landingKick=0;setAim(false);clearFireInput();cancelEquipmentAim();
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
function statePayload(seq=stateSeq){const input=movementInput(),ladderMove=ladderState?ladderInputAmount():0;return {t:'state',seq:Math.max(0,Math.floor(Number(seq)||0)),at:Math.round(serverNow()),x:round3(position.x),y:round3(position.y),z:round3(position.z),yaw:round3(yaw),pitch:round3(pitch),ads:adsWanted,crouched,grounded:onGround,jumpSeq,moveX:round3(input.mx),moveZ:round3(input.mz),ladderId:ladderState?.id||'',ladderMove:round3(ladderMove)};}
function stateChanged(p){return !Number.isFinite(lastSentState.x)||Math.abs(p.x-lastSentState.x)>.008||Math.abs(p.y-lastSentState.y)>.008||Math.abs(p.z-lastSentState.z)>.008||Math.abs(normalizeAngle(p.yaw-lastSentState.yaw))>.0025||Math.abs(p.pitch-lastSentState.pitch)>.0025||Math.abs(p.moveX-lastSentState.moveX)>.02||Math.abs(p.moveZ-lastSentState.moveZ)>.02||Math.abs((p.ladderMove||0)-(lastSentState.ladderMove||0))>.02||String(p.ladderId||'')!==String(lastSentState.ladderId||'')||p.ads!==lastSentState.ads||p.crouched!==lastSentState.crouched||p.grounded!==lastSentState.grounded;}
function rememberPredictionState(p,now=performance.now()){
  localPredictionHistory.push({seq:p.seq,at:p.at,localAt:now,x:p.x,y:p.y,z:p.z,grounded:p.grounded,crouched:p.crouched});
  const cutoff=now-LOCAL_PREDICTION_HISTORY_MS;while(localPredictionHistory.length&&(localPredictionHistory[0].localAt<cutoff||localPredictionHistory.length>LOCAL_PREDICTION_MAX_SAMPLES))localPredictionHistory.shift();
}
function sendCurrentState(force=false){
  const now=performance.now(),preview=statePayload(stateSeq+1),changed=stateChanged(preview),interval=changed?ACTIVE_STATE_INTERVAL:IDLE_STATE_INTERVAL;
  if(!force&&now-lastStateSent<interval)return false;
  stateSeq+=1;preview.seq=stateSeq;lastStateSent=now;lastSentState={x:preview.x,y:preview.y,z:preview.z,yaw:preview.yaw,pitch:preview.pitch,ads:preview.ads,crouched:preview.crouched,grounded:preview.grounded,moveX:preview.moveX,moveZ:preview.moveZ,ladderId:preview.ladderId||'',ladderMove:preview.ladderMove||0};rememberPredictionState(preview,now);send(preview);return true;
}
function applyAuthoritativeLoadout(m){
  if(PRIMARY_WEAPONS.includes(m.primaryWeapon)){primaryWeapon=m.primaryWeapon;if(shell.inLobby)rememberPrimary(primaryWeapon);}
  if(TACTICAL_EQUIPMENT.includes(m.tactical)){tacticalEquipment=normalizeTactical(m.tactical);if(shell.inLobby)rememberEquipment(tacticalEquipment,lethalEquipment);}
  if(LETHAL_EQUIPMENT.includes(m.lethal)){lethalEquipment=normalizeLethal(m.lethal);if(shell.inLobby)rememberEquipment(tacticalEquipment,lethalEquipment);}
  pendingLoadout=m.pendingLoadout&&typeof m.pendingLoadout==='object'?normalizeLoadoutChoice(m.pendingLoadout):null;
  if(typeof m.pendingTeam==='string')pendingTeam=m.pendingTeam;
  const serverWeapon=(m.weapon==='pistol'||m.weapon===primaryWeapon)?m.weapon:currentWeapon;
  if(!pendingWeapon||serverWeapon===pendingWeapon){currentWeapon=serverWeapon;if(pendingWeapon===serverWeapon)pendingWeapon='';}
  syncClientAmmo(m.ammo);if(m.equipment)equipment=normalizeEquipment(m.equipment);
  reloadUntil=Math.max(0,Number(m.reloadAt)||0);reloadWeapon=m.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;reloadRequestPending=false;
  if(m.action==='weapon'&&m.accepted!==false){pendingWeapon='';delayFire(Number(m.retryAfterMs)||0,m.weapon);}
  if(m.action==='reloadShell')soundReload('shotgun');
  if(m.action==='fire'&&m.accepted===false&&(m.reason==='cooldown'||m.reason==='weapon_switch'))delayFire(Math.max(8,Math.min(180,Number(m.retryAfterMs)||35)),m.weapon);
  if(m.pending===true&&pendingLoadout){rememberPrimary(pendingLoadout.primaryWeapon);rememberEquipment(pendingLoadout.tactical,pendingLoadout.lethal);showToast('LOADOUT QUEUED · NEXT SPAWN');}
  syncLocalWeaponModel();syncPauseContext();
}

function freshClientFireReady(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));}
function touchRoleActive(role){for(const value of touchRoles.values())if(value===role)return true;return false;}
function fireInputHeld(){return mouseFireDown||touchRoleActive('fire')||gamepadFireDown;}
function clearFireInput(){mouseFireDown=false;gamepadFireDown=false;for(const [id,role] of touchRoles)if(role==='fire')touchRoles.delete(id);}
function delayFire(ms,weapon=currentWeapon){weapon=WEAPON_SPECS[weapon]?weapon:currentWeapon;if(ms>0)fireReadyAt[weapon]=Math.max(fireReadyAt[weapon]||0,performance.now()+ms);}
function pressMouseFire(){if(mouseFireDown)return;const wasHeld=fireInputHeld();mouseFireDown=true;if(!wasHeld)requestShot();}
function pressTouchFire(pointerId){if(touchRoles.has(pointerId))return;const wasHeld=fireInputHeld();touchRoles.set(pointerId,'fire');if(!wasHeld)requestShot();}
function recoilSpec(weapon){return WEAPON_SPECS[weapon]||WEAPON_SPECS.pistol;}
const RECOIL_YAW_PATTERN=[-.28,.16,.34,-.10,.48,-.32,.21,.52,-.42,.12,.38,-.20];
function registerLocalShotHeat(weapon,now){
  const previousAt=localShotHeatAt[weapon]||0,heat=weaponHeatAfterDelay(weapon,localShotHeat[weapon]||0,previousAt?now-previousAt:0);
  localShotHeat[weapon]=weaponHeatAfterShot(weapon,heat);localShotHeatAt[weapon]=now;
  if(!previousAt||now-previousAt>420)localRecoilStep[weapon]=0;else localRecoilStep[weapon]=(localRecoilStep[weapon]+1)%RECOIL_YAW_PATTERN.length;
  return heat;
}
function recoilMotionSpec(weapon){
  const r=recoilSpec(weapon),basePitch=Math.max(0,Number(r.recoilPitch)||0),recovery=Math.max(5,Number(r.recoilRecovery)||12),returnSpring=58+recovery*3.6;
  return {impulseScale:THREE.MathUtils.clamp(18+basePitch*200,19,25),holdSpring:2.2,kickDamping:18,returnSpring,returnDamping:1.75*Math.sqrt(returnSpring)};
}
function applyViewRecoil(weapon,preShotHeat=0){
  const r=recoilSpec(weapon),motion=recoilMotionSpec(weapon),adsScale=1-.20*Math.max(0,Math.min(1,adsBlend)),heatScale=1+Math.min(.35,Math.max(0,preShotHeat)*.055),pitchKick=Math.max(0,Number(r.recoilPitch)||0)*adsScale*heatScale,yawKick=Math.max(0,Number(r.recoilYaw)||0)*adsScale,step=localRecoilStep[weapon]||0;
  // Add recoil as angular velocity instead of teleporting the camera by the
  // entire kick on the trigger frame. The spring below turns that impulse into
  // a quick rise, short hold and controlled return that remains counterable.
  viewRecoilPitchVelocity=Math.min(1.65,viewRecoilPitchVelocity+pitchKick*motion.impulseScale);
  viewRecoilYawVelocity=THREE.MathUtils.clamp(viewRecoilYawVelocity+RECOIL_YAW_PATTERN[step%RECOIL_YAW_PATTERN.length]*yawKick*motion.impulseScale*.78,-.48,.48);
}
function updateViewRecoil(dt){
  const r=recoilSpec(currentWeapon),motion=recoilMotionSpec(currentWeapon),totalDt=Math.min(.05,Math.max(0,Number(dt)||0)),delay=Math.max(0,Number(r.recoilRecoveryDelayMs)||0),since=performance.now()-lastLocalShotAt,recent=since<delay;
  const spring=recent?motion.holdSpring:motion.returnSpring,damping=recent?motion.kickDamping:motion.returnDamping,maxPitch=Math.max(Math.max(0,Number(r.recoilPitch)||0),Number(r.recoilMaxPitch)||0);
  // Small fixed substeps keep the recoil envelope effectively identical at
  // 30, 60, 120+ FPS instead of making low frame rates feel weaker/heavier.
  let remaining=totalDt;
  while(remaining>.000001){
    const step=Math.min(1/120,remaining);remaining-=step;
    viewRecoilPitchVelocity+=(-spring*viewRecoilPitch-damping*viewRecoilPitchVelocity)*step;
    viewRecoilYawVelocity+=(-spring*viewRecoilYaw-damping*viewRecoilYawVelocity)*step;
    viewRecoilPitch+=viewRecoilPitchVelocity*step;viewRecoilYaw+=viewRecoilYawVelocity*step;
    if(viewRecoilPitch>maxPitch){viewRecoilPitch=maxPitch;if(viewRecoilPitchVelocity>0)viewRecoilPitchVelocity*=.16;}
    if(viewRecoilPitch<0){viewRecoilPitch=0;if(viewRecoilPitchVelocity<0)viewRecoilPitchVelocity=0;}
    if(viewRecoilYaw>.020){viewRecoilYaw=.020;if(viewRecoilYawVelocity>0)viewRecoilYawVelocity*=.16;}
    else if(viewRecoilYaw<-.020){viewRecoilYaw=-.020;if(viewRecoilYawVelocity<0)viewRecoilYawVelocity*=.16;}
  }
  if(Math.abs(viewRecoilPitch)<.00002&&Math.abs(viewRecoilPitchVelocity)<.0003){viewRecoilPitch=0;viewRecoilPitchVelocity=0;}
  if(Math.abs(viewRecoilYaw)<.00002&&Math.abs(viewRecoilYawVelocity)<.0003){viewRecoilYaw=0;viewRecoilYawVelocity=0;}
}
function presentLocalShot(weapon,now=performance.now()){
  // Shooter-side prediction: weapon feedback must happen on the trigger frame,
  // not after a WebSocket round trip. The server still owns acceptance, damage,
  // hit detection and the authoritative ammo state returned in the fire ack.
  if(!godMode)ammo[weapon]=Math.max(0,(ammo[weapon]||0)-1);
  lastShotVisualAt=now;soundShot(weapon);
  if(weapon==='shotgun'){shotgunPumpStartedAt=now;shotgunPumpSoundPlayed=false;}
  const flash=localMuzzleObject(weapon);if(flash)flash.material.opacity=1;
}
function requestShot(){
  const now=performance.now(),interruptShotgunReload=!godMode&&currentWeapon==='shotgun'&&!!reloadUntil&&(ammo.shotgun||0)>0;
  if(!shell.canPlay||!matchAllowsCombat(matchState)||hp<=0||traversal||now<(fireReadyAt[currentWeapon]||0)||(!godMode&&(reloadRequestPending||(reloadUntil&&!interruptShotgunReload))))return false;
  if(!godMode&&(ammo[currentWeapon]||0)<=0){doReload();return false;}
  if(interruptShotgunReload){reloadUntil=0;reloadWeapon='';reloadStartedAt=0;reloadRequestPending=false;}
  // The reticle is authoritative: fire along the exact camera aim including
  // recoil already accumulated from previous rounds. Applying the new impulse
  // after sending means the first shot is precise and subsequent rounds climb.
  const shotYaw=round4(yaw+viewRecoilYaw),shotPitch=round4(THREE.MathUtils.clamp(pitch+viewRecoilPitch,-1.4,1.4)),preShotHeat=currentShotHeat(currentWeapon,now);
  fireReadyAt[currentWeapon]=now+weaponRules(currentWeapon).cooldownMs;
  presentLocalShot(currentWeapon,now);
  sendCurrentState(true);send({t:'fire',weapon:currentWeapon,yaw:shotYaw,pitch:shotPitch,adsAmount:round3(adsBlend),shotAt:Math.round(serverNow()),viewDelayMs:Math.round(currentRemoteViewDelayMs())});
  registerLocalShotHeat(currentWeapon,now);lastLocalShotAt=now;applyViewRecoil(currentWeapon,preShotHeat);return true;
}
function updateFireControl(now){const spec=WEAPON_SPECS[currentWeapon];if(fireInputHeld()&&spec?.automatic&&(currentWeapon!=='assault'||assaultFireMode==='auto')&&now>=(fireReadyAt[currentWeapon]||0))requestShot();}
function doReload(){
  const spec=WEAPON_SPECS[currentWeapon];
  if(!shell.canPlay||hp<=0||traversal||ladderState)return;
  if(godMode){reloadUntil=0;reloadRequestPending=false;return;}
  if((ammo[currentWeapon]||0)>=spec.mag)return;
  if(reloadRequestPending)return;
  if(reloadUntil)return;
  setAim(false);reloadRequestPending=true;send({t:'reload',weapon:currentWeapon});if(currentWeapon!=='shotgun')soundReload(currentWeapon);
}
function nextWeapon(weapon){return weapon==='pistol'?primaryWeapon:'pistol';}
function switchWeapon(weapon){
  weapon=weapon==='pistol'?'pistol':primaryWeapon;
  if(!shell.canPlay||hp<=0||traversal||ladderState||weapon===currentWeapon)return;
  setAim(false);sniperZoomLevel=0;currentWeapon=weapon;pendingWeapon=weapon;reloadRequestPending=false;reloadUntil=0;reloadWeapon='';reloadStartedAt=0;weaponSwapStartedAt=performance.now();delayFire(WEAPON_SWITCH_MS,weapon);warmWeaponAudio(weapon);syncLocalWeaponModel();send({t:'weapon',weapon});showToast(WEAPON_SPECS[weapon].name);
}
function setAim(active){adsWanted=!!active&&shell.canPlay&&hp>0&&!reloadUntil&&!traversal&&!ladderState;if(!adsWanted&&currentWeapon==='sniper')sniperZoomLevel=0;else if(adsWanted&&currentWeapon==='sniper'&&sniperZoomLevel===0)sniperZoomLevel=1;}
function toggleAim(){if(traversal||ladderState)return;if(currentWeapon==='sniper'&&shell.canPlay&&hp>0&&!reloadUntil){if(!adsWanted){adsWanted=true;sniperZoomLevel=1;showToast('SNIPER 4X');}else if(sniperZoomLevel===1){sniperZoomLevel=2;showToast('SNIPER 8X');}else{adsWanted=false;sniperZoomLevel=0;}return;}setAim(!adsWanted);}
function toggleFireMode(){if(currentWeapon!=='assault'){showToast('FIRE MODE · ASSAULT ONLY');return;}assaultFireMode=assaultFireMode==='semi'?'auto':'semi';clearFireInput();touchVisual.modeUntil=performance.now()+180;localStorage.setItem('breachAssaultFireMode',assaultFireMode);showToast(assaultFireMode==='auto'?'ASSAULT · AUTO':'ASSAULT · SEMI');}
function normalizeClientAmmo(value){const v=value&&typeof value==='object'?value:{};return Object.fromEntries(WEAPON_ORDER.map(name=>{const spec=WEAPON_SPECS[name];return[name,Math.max(0,Math.min(spec.mag,Number(v[name]??spec.mag)))]}));}
function syncClientAmmo(value){const v=value&&typeof value==='object'?value:{};for(const name of WEAPON_ORDER){const spec=WEAPON_SPECS[name];ammo[name]=Math.max(0,Math.min(spec.mag,Number(v[name]??spec.mag)));}}
function normalizeEquipment(v){v=v&&typeof v==='object'?v:{};return Object.fromEntries(Object.entries(EQUIPMENT_CAPS).map(([name,cap])=>[name,Math.max(0,Math.min(cap,Number(v[name]??cap)))]));}
function beginEquipmentAim(kind){const now=performance.now();kind=String(kind||'');if(kind!==tacticalEquipment&&kind!==lethalEquipment)return false;if(!EQUIPMENT_SPECS[kind]||!shell.canPlay||!matchAllowsCombat(matchState)||hp<=0||traversal||ladderState||now<localEquipmentCooldownUntil||(!godMode&&(equipment[kind]||0)<=0))return false;if(equipmentAim.kind)return false;equipmentAim={kind,startedAt:now};showTrajectory();if(kind===tacticalEquipment)touchVisual.flashUntil=now+220;else touchVisual.stickyUntil=now+220;return true;}
function makeThrowId(){return crypto.randomUUID().replace(/-/g,'').slice(0,16);}
function releaseEquipmentAim(){
  if(!equipmentAim.kind)return;
  const kind=equipmentAim.kind,now=performance.now(),throwId=makeThrowId(),v=trajectoryVelocity();
  equipmentAim={kind:'',startedAt:0};hideTrajectory();
  if(!shell.canPlay||hp<=0||now<localEquipmentCooldownUntil)return;
  localEquipmentCooldownUntil=now+360;
  const startX=position.x+v.fx*.82,startY=position.y+currentPlayerHeight()-.22,startZ=position.z+v.fz*.82;
  // Predict the local throw immediately. The server adopts the same ID and
  // reconciles this visual with authoritative physics/collisions.
  spawnThrowableVisual({id:throwId,kind,ownerId:clientId,x:startX,y:startY,z:startZ,vx:v.vx,vy:v.vy,vz:v.vz,at:serverNow()});
  sendCurrentState(true);send({t:'throw',id:throwId,kind,yaw:round3(yaw),pitch:round3(pitch)});
  if(kind===tacticalEquipment)touchVisual.flashUntil=now+160;else touchVisual.stickyUntil=now+160;
}
function cancelEquipmentAim(){equipmentAim={kind:'',startedAt:0};hideTrajectory();}
function trajectoryVelocity(){return tacticalThrowVelocity(yaw,pitch,TACTICAL_THROW_SPEED,TACTICAL_THROW_LOFT);}
function resetTrajectoryPose(){trajectoryLastX=trajectoryLastY=trajectoryLastZ=trajectoryLastYaw=trajectoryLastPitch=trajectoryLastHeight=NaN;trajectoryLastUpdate=0;}
function showTrajectory(){
  if(!trajectoryRibbon){
    trajectoryCenters=new Float32Array(TRAJECTORY_MAX_POINTS*3);
    trajectoryVertices=new Float32Array(TRAJECTORY_MAX_POINTS*2*3);
    const indices=new Uint16Array((TRAJECTORY_MAX_POINTS-1)*6);
    for(let i=0;i<TRAJECTORY_MAX_POINTS-1;i++){const v=i*2,j=i*6;indices[j]=v;indices[j+1]=v+1;indices[j+2]=v+2;indices[j+3]=v+1;indices[j+4]=v+3;indices[j+5]=v+2;}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(trajectoryVertices,3));geo.setIndex(new THREE.BufferAttribute(indices,1));geo.setDrawRange(0,0);
    const mat=new THREE.MeshBasicMaterial({color:0xeaf4ff,transparent:true,opacity:.44,side:THREE.DoubleSide,depthTest:true,depthWrite:false});
    trajectoryRibbon=new THREE.Mesh(geo,mat);trajectoryRibbon.frustumCulled=false;trajectoryRibbon.renderOrder=42;scene.add(trajectoryRibbon);
    trajectoryMarker=new THREE.Mesh(new THREE.SphereGeometry(.085,10,7),new THREE.MeshBasicMaterial({color:0xeaf4ff,transparent:true,opacity:.72,depthTest:true,depthWrite:false}));trajectoryMarker.renderOrder=43;scene.add(trajectoryMarker);
    trajectoryScratch={cameraRight:new THREE.Vector3(),point:new THREE.Vector3(),prev:new THREE.Vector3(),next:new THREE.Vector3(),tangent:new THREE.Vector3(),view:new THREE.Vector3(),side:new THREE.Vector3()};
  }
  trajectoryRibbon.visible=true;trajectoryRibbon.geometry.setDrawRange(0,0);trajectoryMarker.visible=false;resetTrajectoryPose();
}
function hideTrajectory(){
  if(trajectoryRibbon){trajectoryRibbon.visible=false;trajectoryRibbon.geometry.setDrawRange(0,0);}
  if(trajectoryMarker)trajectoryMarker.visible=false;
  resetTrajectoryPose();
}
function trajectoryTerrainFirstT(ax,ay,az,bx,by,bz,startClearance,endClearance){
  if(startClearance<=0)return 0;if(endClearance>0)return null;
  let lo=0,hi=1;
  for(let i=0;i<5;i++){
    const t=(lo+hi)/2,x=ax+(bx-ax)*t,y=ay+(by-ay)*t,z=az+(bz-az)*t;
    if(y<=terrainHeight(x,z)+.08)hi=t;else lo=t;
  }
  return hi;
}
function trajectorySegmentHit(ax,ay,az,bx,by,bz,startClearance,endClearance){
  const obstacleT=trajectoryCollision.firstHitT(ax,ay,az,bx,by,bz);
  const terrainT=trajectoryTerrainFirstT(ax,ay,az,bx,by,bz,startClearance,endClearance);
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
    const progress=i/(count-1),halfWidth=THREE.MathUtils.lerp(.060,.018,Math.pow(progress,.82)),v=i*6;
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
  if(!equipmentAim.kind||!trajectoryRibbon||!position||!trajectoryCenters||!trajectoryVertices)return;
  const now=performance.now();if(now-trajectoryLastUpdate<TRAJECTORY_UPDATE_MS)return;
  const playerHeight=currentPlayerHeight();if(!trajectoryPoseChanged(playerHeight))return;trajectoryLastUpdate=now;
  const v=trajectoryVelocity(),maxT=2.12,startX=position.x+v.fx*.82,startY=position.y+playerHeight-.22,startZ=position.z+v.fz*.82;
  let count=0,lastX=startX,lastY=startY,lastZ=startZ,impact=null,lastClearance=startY-(terrainHeight(startX,startZ)+.08);
  for(let t=0;t<=maxT&&count<TRAJECTORY_MAX_POINTS;t+=TRAJECTORY_RENDER_STEP){
    const x=startX+v.vx*t,y=startY+v.vy*t-.5*TACTICAL_GRAVITY*t*t,z=startZ+v.vz*t,i=count*3;
    trajectoryCenters[i]=x;trajectoryCenters[i+1]=y;trajectoryCenters[i+2]=z;count++;
    if(count>1){
      const clearance=y-(terrainHeight(x,z)+.08);impact=trajectorySegmentHit(lastX,lastY,lastZ,x,y,z,lastClearance,clearance);
      if(impact){trajectoryCenters[i]=impact.x;trajectoryCenters[i+1]=impact.y;trajectoryCenters[i+2]=impact.z;break;}
      lastClearance=clearance;
    }
    lastX=x;lastY=y;lastZ=z;
  }
  if(count<2)return;
  updateTrajectoryRibbon(count);
  const end=(count-1)*3,endX=trajectoryCenters[end],endY=trajectoryCenters[end+1],endZ=trajectoryCenters[end+2];
  trajectoryMarker.visible=true;trajectoryMarker.position.set(endX,endY,endZ);trajectoryMarker.material.opacity=impact ? .78 : .58;
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


function syncLocalWeaponModel(){if(pistolGroup)pistolGroup.visible=currentWeapon==='pistol';if(assaultGroup)assaultGroup.visible=currentWeapon==='assault';if(umpGroup)umpGroup.visible=currentWeapon==='ump';if(shotgunGroup)shotgunGroup.visible=currentWeapon==='shotgun';if(semiShotgunGroup)semiShotgunGroup.visible=currentWeapon==='semiShotgun';if(sniperGroup)sniperGroup.visible=currentWeapon==='sniper';if(grenadeLauncherGroup)grenadeLauncherGroup.visible=currentWeapon==='grenadeLauncher';if(rpgGroup)rpgGroup.visible=currentWeapon==='rpg';syncPauseContext();}
function syncRemoteWeapon(r){if(!r)return;for(const name of WEAPON_ORDER){if(r[name])r[name].visible=r.weapon===name;}}
function tracerMaterial(color){return new THREE.LineBasicMaterial({color,transparent:true,opacity:.82,depthWrite:false});}
function localMuzzleObject(weapon){return weapon==='sniper'?sniperFlash:weapon==='semiShotgun'?semiShotgunFlash:weapon==='shotgun'?shotgunFlash:weapon==='ump'?umpFlash:weapon==='assault'?assaultFlash:weapon==='grenadeLauncher'?grenadeLauncherFlash:weapon==='rpg'?rpgFlash:pistolFlash;}
function tracerHash(id){let h=0;for(const ch of String(id||''))h=(h*33+ch.charCodeAt(0))>>>0;return h;}
function shotPacketPrimary(m){return m.primaryShot===true||(m.primaryShot==null&&m.consumeAmmo!==false);}
function shouldShowTracer(m){if(['sniper','pistol','grenadeLauncher','rpg'].includes(m.weapon))return true;if(m.weapon==='shotgun'||m.weapon==='semiShotgun')return shotPacketPrimary(m);return tracerHash(m.id)%2===0;}
function createTracer(m){
  if(!shouldShowTracer(m)||['grenadeLauncher','rpg'].includes(m.weapon))return null;
  const velocity=new THREE.Vector3(Number(m.vx)||0,Number(m.vy)||0,Number(m.vz)||0),speed=Math.max(.01,velocity.length()),dir=velocity.clone().multiplyScalar(1/speed),serverStart=new THREE.Vector3(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0),start=serverStart.clone();
  if(m.ownerId===clientId){const muzzle=localMuzzleObject(m.weapon);if(muzzle){camera.updateMatrixWorld(true);muzzle.getWorldPosition(start);}}
  let visualDir=dir.clone();if(m.ownerId===clientId){const converge=serverStart.clone().addScaledVector(dir,9);visualDir=converge.sub(start).normalize();}
  const geometry=new THREE.BufferGeometry(),positions=new Float32Array(6);geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const color=m.weapon==='sniper'?0xb8efff:(m.weapon==='shotgun'||m.weapon==='semiShotgun')?0xffc482:(m.weapon==='assault'||m.weapon==='ump')?0xffdc96:0xffedbd,line=new THREE.Line(geometry,tracerMaterial(color));line.frustumCulled=false;scene.add(line);
  const gravity=Math.max(0,Number(m.gravity)||0);
  return{type:'tracer',mesh:line,geometry,start,dir:visualDir,speed,gravity,born:performance.now()-Math.min(500,Math.max(0,Number(m.visualAgeMs)||0)),lifeMs:m.weapon==='sniper'?125:m.weapon==='pistol'?105:(m.weapon==='shotgun'||m.weapon==='semiShotgun')?62:92,length:m.weapon==='sniper'?2.8:(m.weapon==='assault'||m.weapon==='ump')?1.55:m.weapon==='pistol'?.95:.75};
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
    const r=remotes.get(m.ownerId);if(r){r.fireKickUntil=performance.now()+170;r.revealedUntil=performance.now()+1500;playSpatialCue(weaponShotSoundId(m.weapon),m.x,m.y,m.z,95,.95);}
  }
}
function removeBullet(id){const b=bullets.get(id);if(!b)return;bullets.delete(id);const root=b.root||b.mesh;try{scene?.remove(root);}catch{}if(b.type==='launcher')disposeObject3D(root);else{try{b.geometry?.dispose?.();}catch{}disposeMaterialResources(b.mesh?.material);}}
function clearBullets(){for(const id of [...bullets.keys()])removeBullet(id);}
function updateBullets(dt=1/60){
  const now=performance.now(),srv=serverNow(),up=new THREE.Vector3(0,1,0);
  for(const [id,b] of bullets){
    const age=now-b.born;if(age>b.lifeMs+250){removeBullet(id);continue;}
    if(b.type==='launcher'){
      const predictionAge=Math.max(0,Math.min(.12,(srv-b.snapshotAt)/1000)),target=b.snapshotPos.clone().addScaledVector(b.snapshotVel,predictionAge);target.y-=.5*b.gravity*predictionAge*predictionAge;
      const error=b.root.position.distanceTo(target),blend=error>1.5?1:1-Math.exp(-Math.max(.001,dt)*28);b.root.position.lerp(target,blend);
      b.visualVelocity.copy(b.snapshotVel);b.visualVelocity.y-=b.gravity*predictionAge;if(b.visualVelocity.lengthSq()>.0001)b.root.quaternion.setFromUnitVectors(up,b.visualVelocity.clone().normalize());
      if(b.weapon==='rpg'&&now-b.lastTrailAt>=42){b.lastTrailAt=now;spawnRocketTrailPuff(b.root.position,b.visualVelocity);}
      continue;
    }
    const t=Math.max(.001,age/1000),tailT=Math.max(0,t-b.length/Math.max(.01,b.speed)),pointAt=(time)=>b.start.clone().addScaledVector(b.dir,b.speed*time).add(new THREE.Vector3(0,-.5*b.gravity*time*time,0)),head=pointAt(t),tail=pointAt(tailT),p=b.geometry.getAttribute('position');p.setXYZ(0,tail.x,tail.y,tail.z);p.setXYZ(1,head.x,head.y,head.z);p.needsUpdate=true;b.mesh.material.opacity=.82*Math.max(0,1-age/b.lifeMs);
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
  const at=Number(m.at)||serverNow(),fuseAt=Number(m.fuseAt)||at+equipmentFuseMs(kind);throwables.set(m.id,{root,mesh:root,body,indicator,kind,ownerId:m.ownerId,target:new THREE.Vector3(m.x,m.y,m.z),snapshotPos:new THREE.Vector3(m.x,m.y,m.z),snapshotVel:new THREE.Vector3(m.vx||0,m.vy||0,m.vz||0),snapshotAt:at,fuseAt,nextBeepAt:sticky?at+170:0,born:performance.now(),stuck:!!m.stuck,rolling:!!m.rolling});
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
    for(const value of Object.values(mat)){if(value?.isTexture&&!value.userData?.preserveTransient){try{value.dispose?.();}catch{}}}
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
  tacticalFx.push({kind,root,core,ring,particles,velocities,age:0,duration,blastRadius});
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
function spawnSmokeCloud(m){
  if(!scene||!THREE||!m?.id)return;const existing=smokeClouds.get(m.id);if(existing){existing.expiresAt=Math.max(existing.expiresAt,Number(m.expiresAt)||serverNow()+SMOKE_DURATION_MS);return;}
  const radius=Math.max(4,Number(m.radius)||9.6),root=new THREE.Group();root.position.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);const puffs=[],texture=getSharedSmokeTexture();
  // Dense sprite volume: overlapping camera-facing smoke cards accumulate to
  // near-opaque coverage through the center while still keeping a soft edge.
  // This is intentionally visual-cover first; the server uses this same radius
  // for bot LOS, so what players see now agrees with what AI can see through.
  const count=48;
  for(let i=0;i<count;i++){
    const core=i<22,a=(i*2.399963229728653)+Math.random()*.34,radial=(core?Math.sqrt(Math.random())*.42:(.30+Math.sqrt(Math.random())*.48))*radius;
    const yBand=core?(-.08+Math.random()*.34):(-.12+Math.random()*.48),baseOpacity=core?.72:(.56+Math.random()*.10),size=radius*(core?(.40+Math.random()*.14):(.34+Math.random()*.15));
    const mat=new THREE.SpriteMaterial({map:texture,color:i%5===0?0x777b7d:i%3===0?0x85898a:0x696e70,transparent:true,opacity:0,depthTest:true,depthWrite:false,toneMapped:false}),puff=new THREE.Sprite(mat);
    puff.position.set(Math.cos(a)*radial,yBand*radius,Math.sin(a)*radial);puff.scale.set(size,size*(.82+Math.random()*.28),1);puff.userData={baseOpacity,phase:i*.83,driftX:(Math.random()-.5)*.035,driftZ:(Math.random()-.5)*.035};root.add(puff);puffs.push(puff);
  }
  scene.add(root);smokeClouds.set(m.id,{root,puffs,born:performance.now(),expiresAt:Number(m.expiresAt)||serverNow()+SMOKE_DURATION_MS,radius});
}
function updateSmokeClouds(dt){
  const now=performance.now(),srv=serverNow();for(const [id,c] of smokeClouds){const age=Math.max(0,(now-c.born)/1000),remaining=c.expiresAt-srv;if(remaining<=0){smokeClouds.delete(id);try{scene?.remove(c.root);}catch{}disposeObject3D(c.root);continue;}const grow=Math.min(1,age/.75),fade=Math.min(1,remaining/1800);c.root.scale.setScalar(.54+.46*grow);for(const puff of c.puffs){const u=puff.userData||{},pulse=.94+.06*Math.sin(now*.0007+(u.phase||0));puff.material.opacity=(u.baseOpacity||.62)*pulse*grow*fade;puff.position.x+=(u.driftX||0)*dt;puff.position.z+=(u.driftZ||0)*dt;puff.position.y+=Math.sin(now*.00028+(u.phase||0))*dt*.018;}}
}
function clearSmokeClouds(){const pending=[...smokeClouds.values()];smokeClouds.clear();for(const c of pending){try{scene?.remove(c.root);}catch{}disposeObject3D(c.root);}}

function applyFlashEffect(m){const power=Math.max(0,Math.min(1,Number(m.power)||0));if(power<=0)return;const now=performance.now(),duration=Math.max(350,Number(m.durationMs)||700+power*2600);flashPeakUntil=Math.max(flashPeakUntil,now+180+power*520);flashUntil=Math.max(flashUntil,now+duration);}
function animate(){
  requestAnimationFrame(animate);
  const rawFrameDt=Math.max(0,clock.getDelta()),frameDt=Math.min(rawFrameDt,CLIENT_MAX_FRAME_SEC);
  updateGamepadInput(frameDt);
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
  const visualDt=Math.min(frameDt,.10);updateAim(visualDt);updateRemoteVisuals(visualDt);updateWeaponView(visualDt);
  // Cosmetic systems are fault-contained from the gameplay/simulation path.
  // A malformed transient effect must be discarded rather than poisoning every
  // following render frame and making the match appear frozen.
  try{updateBullets(visualDt);}catch(error){console.error('Tracer update failed; clearing transient tracers.',error);clearBullets();}
  try{updateRocketTrailPuffs(visualDt);}catch(error){console.error('Rocket trail update failed; clearing transient rocket smoke.',error);clearRocketTrailPuffs();}
  try{updateThrowables(visualDt);}catch(error){console.error('Throwable visual update failed; clearing transient throwables.',error);clearThrowables();}
  try{updateTacticalFx(visualDt);}catch(error){console.error('Explosion visual update failed; clearing transient explosion FX.',error);clearTacticalFx();}
  try{updateSmokeClouds(visualDt);}catch(error){console.error('Smoke visual update failed; clearing transient smoke FX.',error);clearSmokeClouds();}
  updateEquipmentTrajectory();
  renderer.autoClear=true;renderer.render(scene,camera);
  if(shell.canPlay){renderer.autoClear=false;renderer.clearDepth();renderer.render(hudScene,hudCamera);renderer.autoClear=true;drawHud(performance.now());}
}
function maintainNetwork(){
  const now=performance.now(),stateSent=sendCurrentState(false);sendSimulationHeartbeat(stateSent);
  if(now-lastPing<=15000)return;
  lastPing=now;lastPingLocalAt=Date.now();send({t:'ping',clientAt:lastPingLocalAt});
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
  if(!el)return'';if(el.id)return`id:${el.id}`;
  const stableData=['deployTab','lobbySideTab','lobbyCheatTab','lobbyAdminGod','lobbyAdminRole','adminGod','adminRole','lobbyMapChoice','lobbyMode','loadoutChoice','matchPrimaryChoice','matchTacticalChoice','matchLethalChoice','settingsTab','adminTab','chatChar','chatAction','editorChar','editorAction','gameControl'];
  for(const key of stableData){const value=el.dataset?.[key];if(value!=null&&value!=='')return`data:${key}:${value}`;}
  const text=String(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,48);return`${el.tagName||''}:${text}`;
}
function clearControllerUiFocus(){
  clearControllerUiEditing();
  if(controllerUiFocus?.classList)controllerUiFocus.classList.remove('controller-focus');
  controllerUiFocus=null;controllerUiFocusKey='';
}
function resetControllerUiAxis(){controllerUiAxisDirection='';controllerUiAxisNextAt=0;controllerUiAxisStartedAt=0;}
function controllerEditableField(el){return !!el?.matches?.('[data-game-control="cycle"],[data-game-control="stepper"],[data-game-control="slider"]');}
function setControllerUiEditing(el){
  if(!controllerEditableField(el))return false;
  clearControllerUiEditing();controllerUiEditing=el;el.classList.add('controller-editing');return true;
}
function controllerUiSurface(){
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
function controllerElementVisible(el,surface){
  if(!el||!surface||!surface.contains(el)||el.disabled)return false;
  if(el.closest('[hidden],.hide,[aria-hidden="true"]'))return false;
  const style=getComputedStyle(el);if(style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0)return false;
  const r=el.getBoundingClientRect();if(r.width<=2||r.height<=2)return false;
  return true;
}
function controllerFocusableElements(){
  const surface=controllerUiSurface();if(!surface)return[];
  const primaryTabs=controllerPrimaryTablist(surface);
  const selector='button:not([disabled]):not(.game-control-arrow),[role="tab"]:not([disabled]),[data-game-control][tabindex="0"]:not(.disabled),[data-controller-focusable="true"]';
  return [...new Set(surface.querySelectorAll(selector))].filter(el=>controllerElementVisible(el,surface)&&!(primaryTabs&&primaryTabs.contains(el)));
}
function setControllerUiFocus(el){
  const surface=controllerUiSurface();if(!controllerElementVisible(el,surface))return false;
  if(controllerUiFocus===el)return true;
  finishControllerUiAdjustment();
  if(controllerUiFocus?.classList)controllerUiFocus.classList.remove('controller-focus');
  controllerUiFocus=el;controllerUiFocusKey=controllerFocusKey(el);el.classList.add('controller-focus');
  try{el.focus?.({preventScroll:true});}catch{el.focus?.();}
  el.scrollIntoView?.({block:'nearest',inline:'nearest'});return true;
}
function controllerPreferredRegion(surface){
  if(!surface)return null;
  if(surface===lobbyScreen)return surface.querySelector('[data-lobby-side-view].active:not([hidden])')||surface;
  if(surface===menu)return surface.querySelector('.deploy-view:not([hidden]):not(.hide)')||surface;
  if(surface===$('settingsPanel'))return surface.querySelector('[data-settings-page].active:not([hidden])')||surface;
  if(surface===$('adminPanel'))return surface.querySelector('[data-admin-page]:not([hidden]):not(.hide)')||surface;
  if(surface===$('loadoutPanel'))return surface.querySelector('.loadout-grid,.loadout-body')||surface;
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
    const priorKey=controllerUiFocusKey||controllerFocusKey(controllerUiFocus);
    const restored=priorKey?list.find(el=>controllerFocusKey(el)===priorKey):null;
    setControllerUiFocus(restored||preferredControllerFocus(list,surface));
  }
  return controllerUiFocus;
}
function intervalGap(a0,a1,b0,b1){if(a1<b0)return b0-a1;if(b1<a0)return a0-b1;return 0;}
const CONTROLLER_NAV_GROUP_SELECTOR='.settings-grid,.weapon-fields,.loadout-choice-grid,.lobby-mode-picker,.lobby-setup-row,.lobby-team-picker,.admin-bot-controls,.pause-actions,.pause-actions-player,.pause-actions-system,.join-controls,.lobby-map-choice-grid,.lobby-cheat-tabs,.chat-key-row,.game-text-key-row';
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
function moveControllerUiFocus(dx,dy){
  const list=controllerFocusableElements();if(!list.length)return false;const current=ensureControllerUiFocus();if(!current)return false;
  const a=current.getBoundingClientRect(),group=controllerNavGroup(current);
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
  const held=gamepadFrame.held||[],threshold=.62;let dx=0,dy=0,source='';
  const dl=!!held[GAMEPAD_BUTTON.DPAD_LEFT],dr=!!held[GAMEPAD_BUTTON.DPAD_RIGHT],du=!!held[GAMEPAD_BUTTON.DPAD_UP],dd=!!held[GAMEPAD_BUTTON.DPAD_DOWN];
  const ddx=(dr?1:0)-(dl?1:0),ddy=(dd?1:0)-(du?1:0);
  if(ddx||ddy){
    source='d';
    if(ddx&&ddy){
      const horizontalPressed=pressed[GAMEPAD_BUTTON.DPAD_LEFT]||pressed[GAMEPAD_BUTTON.DPAD_RIGHT],verticalPressed=pressed[GAMEPAD_BUTTON.DPAD_UP]||pressed[GAMEPAD_BUTTON.DPAD_DOWN];
      if(horizontalPressed&&!verticalPressed)dx=ddx;else if(verticalPressed&&!horizontalPressed)dy=ddy;else if(controllerUiAxisDirection.endsWith(`${ddx},0`))dx=ddx;else dy=ddy;
    }else{dx=ddx;dy=ddy;}
  }else{
    const x=Number(gamepadFrame.moveX)||0,y=Number(gamepadFrame.moveY)||0;
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
  const x=Number(gamepadFrame.moveX)||0,y=Number(gamepadFrame.moveY)||0;return Math.max(Math.abs(x),Math.abs(y))>=.62;
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
  requestAnimationFrame(()=>{if(controllerUiSurface()!==surface)return;const list=controllerFocusableElements();const target=preferredControllerFocus(list,surface);if(target)setControllerUiFocus(target);});
  return true;
}
function handleControllerUiNavigation(pressed){
  const surface=controllerUiSurface();if(!surface){clearControllerUiFocus();resetControllerUiAxis();return false;}const focus=ensureControllerUiFocus();
  if(controllerUiAdjusting&&(controllerUiAdjusting.el!==focus||controllerUiEditing!==focus||!controllerEditAdjustHeld()))finishControllerUiAdjustment();
  if(pressed[GAMEPAD_BUTTON.B]){
    if(controllerUiEditing){clearControllerUiEditing();return true;}
    finishControllerUiAdjustment();
    if(chatOpen){void dismissChat({restorePointer:false});return true;}
    if(gameTextEditorTarget){cancelGameTextEditor();return true;}
    if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return true;}
    if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return true;}
    if(shell.panel===SHELL_PANEL.LOADOUT){closeMatchLoadout();return true;}
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

function controllerDisplayName(id){
  const raw=String(id||'Controller').replace(/\s*\([^)]*\)\s*/g,' ').replace(/\s+/g,' ').trim();
  return /xbox/i.test(raw)?'XBOX CONTROLLER':raw.slice(0,28).toUpperCase()||'CONTROLLER';
}
function cycleControllerUtility(){
  if(currentWeapon==='sniper'&&adsWanted){sniperZoomLevel=sniperZoomLevel===2?1:2;showToast(sniperZoomLevel===2?'SNIPER 8X':'SNIPER 4X');return;}
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
    clearFireInput();cancelEquipmentAim();
    if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return;}
    if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return;}
    if(shell.panel===SHELL_PANEL.LOADOUT){closeMatchLoadout();return;}
    if(shell.paused){if(shell.resumeFromAlternateInput()){clock?.getDelta();return;}showToast('RETURN TO GAME VIEW');return;}
    openPause();return;
  }
  if(!shell.canPlay){gamepadFireDown=false;resetControllerAimMotion();if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}handleControllerUiNavigation(pressed);return;}
  clearControllerUiFocus();
  if(hp<=0&&pressed[GAMEPAD_BUTTON.Y]){openMatchLoadout();return;}
  if(hp>0&&pressed[GAMEPAD_BUTTON.LS]){openChat();return;}

  if(pressed[GAMEPAD_BUTTON.VIEW]){scoreboardOpen=true;scoreboardScroll=0;clearFireInput();cancelEquipmentAim();}
  if(released[GAMEPAD_BUTTON.VIEW])scoreboardOpen=false;
  if(scoreboardOpen&&scoreboardPanel&&Math.abs(gamepadFrame.lookY)>.02)scoreboardScroll=Math.max(0,Math.min(scoreboardPanel.maxScroll,scoreboardScroll+gamepadFrame.lookY*620*dt));
  if(scoreboardOpen){gamepadFireDown=buttons[GAMEPAD_BUTTON.RT]>=CONTROLLER_TRIGGER_THRESHOLD;resetControllerAimMotion();return;}

  const adsHeld=buttons[GAMEPAD_BUTTON.LT]>=CONTROLLER_TRIGGER_THRESHOLD;
  if(adsHeld){controllerOwnsAim=true;if(!adsWanted)setAim(true);}else if(controllerOwnsAim){controllerOwnsAim=false;setAim(false);}
  if(hp>0)applyControllerAim(dt);else resetControllerAimMotion();
  const fireHeld=buttons[GAMEPAD_BUTTON.RT]>=CONTROLLER_TRIGGER_THRESHOLD;
  if(fireHeld&&!gamepadFireDown){gamepadFireDown=true;requestShot();}else if(!fireHeld)gamepadFireDown=false;

  if(pressed[GAMEPAD_BUTTON.A])tryJump();
  if(pressed[GAMEPAD_BUTTON.B])toggleCrouch();
  if(pressed[GAMEPAD_BUTTON.X])doReload();
  if(pressed[GAMEPAD_BUTTON.Y])switchWeapon(nextWeapon(currentWeapon));
  if(pressed[GAMEPAD_BUTTON.LB])beginEquipmentAim(tacticalEquipment);
  if(pressed[GAMEPAD_BUTTON.RB])beginEquipmentAim(lethalEquipment);
  if(released[GAMEPAD_BUTTON.LB]&&equipmentAim.kind===tacticalEquipment)releaseEquipmentAim();
  if(released[GAMEPAD_BUTTON.RB]&&equipmentAim.kind===lethalEquipment)releaseEquipmentAim();
  if(pressed[GAMEPAD_BUTTON.RS])cycleControllerUtility();
  if(pressed[GAMEPAD_BUTTON.DPAD_UP])switchWeapon(primaryWeapon);
  if(pressed[GAMEPAD_BUTTON.DPAD_DOWN])switchWeapon('pistol');
  if(pressed[GAMEPAD_BUTTON.DPAD_LEFT])toggleFireMode();
  if(pressed[GAMEPAD_BUTTON.DPAD_RIGHT])switchWeapon(nextWeapon(currentWeapon));
}
function updateGameSimulation(dt){const now=performance.now();if(hp>0){updateCrouchState(dt);updateMovement(dt);updateFireControl(now);}}
function updateGameFrame(dt){
  const now=performance.now();updateCorrectionView(dt);updateViewRecoil(dt);
  const deathP=hp<=0?THREE.MathUtils.clamp((now-(deathAnimStartedAt||now))/700,0,1):0,deathEase=deathP*deathP*(3-2*deathP),viewY=updateViewVertical(dt),stanceEase=smoothstep01(crouchBlend),traversePose=traversal?traversalPose(traversal,now):null,traverseWave=traversePose?Math.sin(Math.PI*traversePose.progress):0;
  const stanceHeight=THREE.MathUtils.lerp(PLAYER_HEIGHT,CROUCH_HEIGHT,stanceEase);
  let cameraY=viewY+stanceHeight-.42*deathEase;
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
  camera.position.set(position.x+cameraCorrectionX,cameraY,position.z+cameraCorrectionZ);camera.rotation.y=yaw+viewRecoilYaw;camera.rotation.x=pitch+viewRecoilPitch+.10*deathEase-.045*traverseWave;camera.rotation.z=.72*deathEase;
  maintainNetwork();
}
function updateMovement(dt){
  const now=performance.now();
  if(!matchAllowsMovement(matchState)){
    traversal=null;ladderState=null;moveVelocityX=moveVelocityZ=0;verticalVelocity=0;knockX=knockZ=0;onGround=true;lastGroundedAt=now;jumpBufferedUntil=0;traversalIntentUntil=0;localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,0,Math.min(1,dt*12));position.y=worldSupportHeight(position.x,position.z,position.y,false);return;
  }
  if(updateLadder(serverNow(),dt)){sendCurrentState();return;}
  if(updateTraversal(now)){localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,0,Math.min(1,dt*10));moveVelocityX=moveVelocityZ=0;return;}
  if(onGround)lastGroundedAt=now;
  if(onGround&&tryAttachLadder()){sendCurrentState(true);return;}
  if((keys.has('Space')||touchRoleActive('jump')||(controllerInputActive()&&gamepadFrame.held[GAMEPAD_BUTTON.A]))&&traversalConsumedIntentSeq!==traversalIntentSeq)traversalIntentUntil=Math.max(traversalIntentUntil,now+110);
  const input=movementInput(),mx=input.mx,mz=input.mz,len=input.len,movement=worldSettings.movement;
  const targetSpeed=(adsWanted?movement.walkSpeed:movement.runSpeed)*(crouched?CROUCH_SPEED_MULTIPLIER:1),sin=Math.sin(yaw),cos=Math.cos(yaw);
  const targetX=(mx*cos+mz*sin)*targetSpeed,targetZ=(-mx*sin+mz*cos)*targetSpeed;
  if(onGround){const next=approachVector(moveVelocityX,moveVelocityZ,targetX,targetZ,(len>.04?GROUND_ACCELERATION:GROUND_BRAKING)*dt);moveVelocityX=next.x;moveVelocityZ=next.z;}
  else if(len>.04){const next=approachVector(moveVelocityX,moveVelocityZ,targetX,targetZ,AIR_ACCELERATION*dt);moveVelocityX=next.x;moveVelocityZ=next.z;const airSpeed=Math.hypot(moveVelocityX,moveVelocityZ),airCap=movement.runSpeed;if(airSpeed>airCap){moveVelocityX=moveVelocityX/airSpeed*airCap;moveVelocityZ=moveVelocityZ/airSpeed*airCap;}}
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
    blockedAt:(x,z,y,fromX,fromZ)=>worldMoveBlockedAt(x,z,y,fromX,fromZ,currentPlayerHeight(),PLAYER_RADIUS)||remoteActorBlocked(x,z,y,fromX,fromZ),
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
    if(rendered){r.group.position.set(rendered.x,rendered.y,rendered.z);if(Number.isFinite(Number(rendered.yaw)))r.group.rotation.y=Number(rendered.yaw);if(typeof rendered.ads==='boolean')r.ads=rendered.ads;if(typeof rendered.crouched==='boolean')r.crouched=rendered.crouched;r.airborne=traversing||laddering||rendered.y>worldSupportHeight(rendered.x,rendered.z,rendered.y)+.08;}
    const dead=r.hp<=0;r.deathPose=THREE.MathUtils.lerp(r.deathPose,dead?1:0,Math.min(1,dt*(dead?5.5:12)));const dp=r.deathPose*r.deathPose*(3-2*r.deathPose);r.model.rotation.z=1.34*dp;r.model.rotation.x=.10*dp;r.model.position.y=-.18*dp;if(r.tag)r.tag.visible=!dead&&(modeFriendly(r.team)||samePlayerId(r.id,aimedRemoteId));
    if(!dead){
      r.crouchBlend=THREE.MathUtils.lerp(r.crouchBlend,r.crouched?1:0,Math.min(1,dt*12));r.model.scale.y=THREE.MathUtils.lerp(1,CROUCH_HEIGHT/PLAYER_HEIGHT,r.crouchBlend);if(r.tag)r.tag.position.y=THREE.MathUtils.lerp(2.18,1.48,r.crouchBlend);
      const move=THREE.MathUtils.clamp(r.moveSpeed/(worldSettings.movement.runSpeed*.75),0,1),running=move>.08&&!r.airborne&&!traversing&&!laddering;r.animPhase+=dt*(running?5.5+move*6:1.8);const swing=running?Math.sin(r.animPhase)*.68*move:Math.sin(r.animPhase)*.035;
      if(running&&now>=r.nextFootstepAt){playSpatialCue(r.footstepSide?'footstepRight':'footstepLeft',r.group.position.x,r.group.position.y,r.group.position.z,30,.48);r.footstepSide^=1;r.nextFootstepAt=now+THREE.MathUtils.lerp(540,315,move);}else if(!running)r.nextFootstepAt=Math.max(r.nextFootstepAt,now+120);
      r.legL.rotation.x=r.airborne?-.34:swing;r.legR.rotation.x=r.airborne?.34:-swing;r.armL.rotation.x=r.airborne?.28:-swing*.72;r.armR.rotation.x=r.airborne?-.20:swing*.52;r.armL.rotation.z=-.12;r.armR.rotation.z=.12;
      if(traversing){const p=traversalPoseNow.progress,wave=Math.sin(Math.PI*p);r.armL.rotation.x=-1.55-wave*.35;r.armR.rotation.x=-1.55-wave*.35;r.armL.rotation.z=-.24;r.armR.rotation.z=.24;r.legL.rotation.x=.48*wave;r.legR.rotation.x=-.30*wave;r.body.rotation.x=-.18*wave;r.head.rotation.x=.08*wave;}if(laddering){const phase=(now*.010)% (Math.PI*2),wave=Math.sin(phase);r.armL.rotation.x=-1.35+wave*.34;r.armR.rotation.x=-1.35-wave*.34;r.armL.rotation.z=-.20;r.armR.rotation.z=.20;r.legL.rotation.x=-wave*.42;r.legR.rotation.x=wave*.42;r.body.rotation.x=-.08;r.head.rotation.x=.03;}
      const reloadActive=r.reloadUntil>srv;if(!reloadActive){r.reloadUntil=0;r.reloadStartedAt=0;}const total=weaponRules(r.reloadWeapon||r.weapon)?.reloadMs||650,reloadP=reloadActive?THREE.MathUtils.clamp((srv-(r.reloadStartedAt||srv))/Math.max(1,total),0,1):0,reloadCurve=Math.sin(Math.PI*reloadP);const swapP=r.swapStartedAt?THREE.MathUtils.clamp((now-r.swapStartedAt)/360,0,1):1,swapCurve=swapP<1?Math.sin(Math.PI*swapP):0;if(swapP>=1)r.swapStartedAt=0;const kick=now<r.fireKickUntil?Math.sin(Math.PI*THREE.MathUtils.clamp((r.fireKickUntil-now)/170,0,1))*.18:0;
      r.armR.rotation.x+=reloadCurve*.95+kick;r.armR.rotation.z=.12-reloadCurve*.28;const lower=reloadCurve*.24+swapCurve*.34+(traversing?Math.sin(Math.PI*traversalPoseNow.progress)*.34:0)+(laddering ? .32 : 0);
      r.pistol.position.set(.45,1.08-lower,-.25+kick*.20);r.assault.position.set(.45,1.09-lower,-.38+kick*.24);r.ump.position.set(.45,1.08-lower,-.34+kick*.23);r.shotgun.position.set(.45,1.10-lower,-.41+kick*.26);r.semiShotgun.position.set(.45,1.10-lower,-.40+kick*.25);r.sniper.position.set(.45,1.10-lower,-.45+kick*.28);r.grenadeLauncher.position.set(.45,1.08-lower,-.40+kick*.30);r.rpg.position.set(.38,1.42-lower*.82,-.43+kick*.32);for(const gun of [r.pistol,r.assault,r.ump,r.shotgun,r.semiShotgun,r.sniper,r.grenadeLauncher,r.rpg])gun.rotation.z=-reloadCurve*.35-swapCurve*.35;
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
  const target=adsWanted&&hp>0&&shell.canPlay?1:0;
  adsBlend+= (target-adsBlend)*Math.min(1,dt*15);
  if(Math.abs(target-adsBlend)<.002)adsBlend=target;
  const eased=adsBlend*adsBlend*(3-2*adsBlend),targetFov=currentWeapon==='sniper'&&sniperZoomLevel>=2?9.5:WEAPON_SPECS[currentWeapon].adsFov;
  const fov=THREE.MathUtils.lerp(baseFov,targetFov,eased);
  if(Math.abs(camera.fov-fov)>.03){camera.fov=fov;camera.updateProjectionMatrix();}
}
function updateWeaponView(dt){
  const now=performance.now(),fireElapsed=lastShotVisualAt?(now-lastShotVisualAt)/1000:99;
  const recoilDur=currentWeapon==='sniper'?.24:.13,recoil=fireElapsed<recoilDur?Math.sin((fireElapsed/recoilDur)*Math.PI):0;
  const moving=hp>0&&onGround?THREE.MathUtils.clamp(localMoveAmount,0,1):0;if(moving>.03)moveBobPhase+=dt*(adsWanted?7.5:11.5)*(0.55+moving*.65);else moveBobPhase+=dt*1.8;
  landingKick=Math.max(0,landingKick-dt*4.2);const bobScale=moving*(adsWanted?.18:1),bobX=Math.sin(moveBobPhase)*.018*bobScale,bobY=Math.abs(Math.cos(moveBobPhase))*-.016*bobScale;
  const jumpSpeed=Math.sqrt(2*worldSettings.movement.gravity*worldSettings.movement.jumpHeight),jumpNorm=onGround?0:THREE.MathUtils.clamp(verticalVelocity/Math.max(.1,jumpSpeed),-1,1),jumpY=onGround?0:(jumpNorm>0?-.035:.025),landY=-Math.sin(landingKick*Math.PI)*.055;
  const reloadW=reloadWeapon||currentWeapon,reloading=!!reloadUntil&&reloadW===currentWeapon;let reloadP=0,reloadCurve=0;
  if(reloading){const total=weaponRules(reloadW).reloadMs;const start=reloadStartedAt||reloadUntil-total;reloadP=THREE.MathUtils.clamp((serverNow()-start)/Math.max(1,total),0,1);reloadCurve=Math.sin(Math.PI*reloadP);}
  const swapP=weaponSwapStartedAt?THREE.MathUtils.clamp((now-weaponSwapStartedAt)/360,0,1):1,swapCurve=swapP<1?Math.sin(Math.PI*swapP):0;if(swapP>=1)weaponSwapStartedAt=0;
  const deathP=hp<=0?THREE.MathUtils.clamp((now-(deathAnimStartedAt||now))/650,0,1):0,deathEase=deathP*deathP*(3-2*deathP);
  const traversePoseNow=traversal?traversalPose(traversal,now):null,traverseP=traversePoseNow?traversePoseNow.progress:0,traverseCurve=traversePoseNow?Math.sin(Math.PI*traverseP):0;
  const idle=Math.sin(now*.0018)*.0035*(adsWanted?.25:1),commonX=bobX,commonY=bobY+jumpY+landY+idle-reloadCurve*.19-swapCurve*.36-deathEase*.55-traverseCurve*.42,commonZ=reloadCurve*.08+swapCurve*.10+deathEase*.18+traverseCurve*.16;
  const reloadRoll=reloadCurve*(currentWeapon==='sniper'?.22:.48),swapRoll=swapCurve*.42,deathRoll=deathEase*.58;
  const a=adsBlend;
  pistolGroup.position.set(THREE.MathUtils.lerp(.33,0,a)+commonX,THREE.MathUtils.lerp(-.25,-.20,a)+commonY,THREE.MathUtils.lerp(-.67,-.54,a)+.12*recoil+commonZ);pistolGroup.rotation.set(THREE.MathUtils.lerp(-.08,0,a)+.12*recoil+reloadCurve*.18,THREE.MathUtils.lerp(-.08,0,a)-reloadCurve*.18, -reloadRoll-swapRoll-deathRoll);
  assaultGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.27,-.19,a)+commonY,THREE.MathUtils.lerp(-.52,-.45,a)+.14*recoil+commonZ);assaultGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+.13*recoil+reloadCurve*.16,THREE.MathUtils.lerp(-.055,0,a)-reloadCurve*.14,-reloadRoll-swapRoll-deathRoll);
  umpGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.27,-.19,a)+commonY,THREE.MathUtils.lerp(-.54,-.46,a)+.13*recoil+commonZ);umpGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+.12*recoil+reloadCurve*.16,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.14,-reloadRoll-swapRoll-deathRoll);
  shotgunGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.20,a)+commonY,THREE.MathUtils.lerp(-.50,-.44,a)+.17*recoil+commonZ);shotgunGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+.15*recoil+reloadCurve*.14,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12,-reloadRoll*.8-swapRoll-deathRoll);
  semiShotgunGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.20,a)+commonY,THREE.MathUtils.lerp(-.50,-.44,a)+.16*recoil+commonZ);semiShotgunGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+.14*recoil+reloadCurve*.14,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12,-reloadRoll*.8-swapRoll-deathRoll);
  sniperGroup.position.set(THREE.MathUtils.lerp(.28,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.18,a)+commonY,THREE.MathUtils.lerp(-.48,-.42,a)+.18*recoil+commonZ);sniperGroup.rotation.set(THREE.MathUtils.lerp(-.055,0,a)+.16*recoil+reloadCurve*.10,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12,-reloadRoll*.65-swapRoll-deathRoll);
  grenadeLauncherGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.20,a)+commonY,THREE.MathUtils.lerp(-.48,-.42,a)+.20*recoil+commonZ);grenadeLauncherGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+GRENADE_LAUNCH_PITCH+.18*recoil+reloadCurve*.13,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12,-reloadRoll*.75-swapRoll-deathRoll);
  rpgGroup.position.set(THREE.MathUtils.lerp(.34,.10,a)+commonX,THREE.MathUtils.lerp(-.16,-.105,a)+commonY,THREE.MathUtils.lerp(-.46,-.405,a)+.22*recoil+commonZ);rpgGroup.rotation.set(THREE.MathUtils.lerp(-.025,-.008,a)+.19*recoil+reloadCurve*.11,THREE.MathUtils.lerp(-.07,-.018,a)-reloadCurve*.10,THREE.MathUtils.lerp(.015,0,a)-reloadRoll*.6-swapRoll-deathRoll);
  if(pistolMag)pistolMag.position.y=-.25-(reloading&&currentWeapon==='pistol'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.18)/.62,0,1))*.20:0);
  if(assaultMag)assaultMag.position.y=-.20-(reloading&&currentWeapon==='assault'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.28:0);
  if(umpMag)umpMag.position.y=-.22-(reloading&&currentWeapon==='ump'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.26:0);
  if(semiShotgunMag)semiShotgunMag.position.y=-.17-(reloading&&currentWeapon==='semiShotgun'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.22:0);
  if(sniperBolt)sniperBolt.position.z=-.12+(reloading&&currentWeapon==='sniper'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.20)/.55,0,1))*.18:0);
  const traversalViewActive=!!traversePoseNow;sniperGroup.visible=!traversalViewActive&&currentWeapon==='sniper'&&adsBlend<.94;shotgunGroup.visible=!traversalViewActive&&currentWeapon==='shotgun';semiShotgunGroup.visible=!traversalViewActive&&currentWeapon==='semiShotgun';assaultGroup.visible=!traversalViewActive&&currentWeapon==='assault';umpGroup.visible=!traversalViewActive&&currentWeapon==='ump';grenadeLauncherGroup.visible=!traversalViewActive&&currentWeapon==='grenadeLauncher';rpgGroup.visible=!traversalViewActive&&currentWeapon==='rpg';pistolGroup.visible=!traversalViewActive&&currentWeapon==='pistol';
  if(shotgunPump){
    let pumpOffset=reloading&&currentWeapon==='shotgun'?Math.sin(Math.PI*reloadP)*.10:0;
    if(shotgunPumpStartedAt){
      const elapsed=now-shotgunPumpStartedAt,p=Math.max(0,Math.min(1,(elapsed-150)/470));
      if(elapsed>=150){const travel=p<.44?THREE.MathUtils.smoothstep(p,0,.44):1-THREE.MathUtils.smoothstep(p,.44,1);pumpOffset=Math.max(pumpOffset,travel*.135);if(!shotgunPumpSoundPlayed&&p>=.42){shotgunPumpSoundPlayed=true;soundShotgunPump();}}
      if(p>=1){shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;}
    }
    shotgunPump.position.z=-.48-pumpOffset;
  }
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
  for(const flash of [pistolFlash,assaultFlash,umpFlash,shotgunFlash,semiShotgunFlash,sniperFlash,grenadeLauncherFlash,rpgFlash])if(flash)flash.material.opacity=Math.max(0,flash.material.opacity-dt*20);
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
  const leftSpan=Math.max(120,moveBoundary-safe.left),leftFireX=Math.max(safe.left+leftFireR+8,Math.min(moveBoundary-leftFireR-10,safe.left+leftSpan*.30));
  const leftFireY=Math.max(safe.top+leftFireR+52,Math.min(viewH-bottom-leftFireR-118,viewH*.31)),equipGap=compact?8:10,equipOffset=equipR+equipGap/2;
  const equipCenterX=Math.max(safe.left+equipR+equipOffset+8,Math.min(moveBoundary-equipR-equipOffset-10,leftFireX)),flashX=equipCenterX-equipOffset,stickyX=equipCenterX+equipOffset;
  const equipRowY=Math.max(safe.top+equipR+74,Math.min(viewH-bottom-equipR-62,leftFireY+leftFireR+equipR+9)),flashY=equipRowY,stickyY=equipRowY;
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
    deathLoadout:{x:viewW/2-92,y:viewH/2+52,w:184,h:34}
  };
}
function drawHud(now){
  const hudInterval=touchGameplayControlsVisible()?33:16;
  if(now-hudLastDraw<hudInterval)return;hudLastDraw=now;if(!hudLayout)hudLayout=computeHudLayout();
  const c=hudCtx,s=hudScale,w=viewW,h=viewH,L=hudLayout,scoped=sniperScopeActive(),toast=activeToast(now);
  c.setTransform(s,0,0,s,0,0);c.clearRect(0,0,w,h);c.textBaseline='middle';
  if(now<flashUntil){const a=now<flashPeakUntil?1:Math.max(0,(flashUntil-now)/Math.max(1,flashUntil-flashPeakUntil));c.fillStyle=`rgba(255,255,255,${Math.min(.96,a*.92)})`;c.fillRect(0,0,w,h);}c.lineCap='round';c.lineJoin='round';
  const missingHealth=Math.max(0,Math.min(1,(100-hp)/100)),hurtPulse=now<hurtUntil?Math.max(0,(hurtUntil-now)/700):0,damageAlpha=Math.min(.82,missingHealth*.58+hurtPulse*.38);
  if(damageAlpha>.01){const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.10,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'rgba(255,18,40,0)');g.addColorStop(.58,`rgba(255,18,40,${damageAlpha*.12})`);g.addColorStop(.82,`rgba(185,0,22,${damageAlpha*.42})`);g.addColorStop(1,`rgba(125,0,16,${damageAlpha})`);c.fillStyle=g;c.fillRect(0,0,w,h);}
  drawBloodSplatter(c,w,h,now,missingHealth);
  if(scoreboardOpen){drawScoreboard(c,L);hudTexture.needsUpdate=true;return;}
  if(!matchAllowsMovement(matchState)){drawMatchStatus(c,w,h);drawScoreboardButton(c,L.team);drawMenuButton(c,L.menu);hudTexture.needsUpdate=true;return;}
  if(hp<=0){
    c.fillStyle='rgba(24,3,8,.64)';c.fillRect(0,0,w,h);drawTeamBar(c,L.team);drawMiniMap(c,L.map);drawMenuButton(c,L.menu);c.textAlign='center';c.fillStyle='#ff6676';c.font=`1000 ${L.compact?36:50}px system-ui`;c.fillText('ELIMINATED',w/2,h/2-34);
    c.font='900 13px system-ui';c.fillStyle='#ffd8dd';if(lastWastedBy){const deathLine=`Killed by ${lastWastedBy}${lastWastedWeapon?' · '+weaponLabel(lastWastedWeapon):''}`;c.fillText(clipHudText(c,deathLine,Math.max(120,w-40)),w/2,h/2+2);}
    c.font='800 12px system-ui';c.fillStyle='#c8b4b8';c.fillText(`Respawning in ${Math.max(1,Math.ceil((wastedUntil-serverNow())/1000))}`,w/2,h/2+25);
    const b=L.deathLoadout;roundRect(c,b.x,b.y,b.w,b.h,8,'rgba(13,18,22,.92)','rgba(255,255,255,.22)');c.fillStyle='#fff';c.font='900 11px system-ui';c.fillText(`${isTouch?'TAP':controllerInputActive()?'Y':'L'} · CHANGE LOADOUT`,w/2,b.y+b.h/2);
    hudTexture.needsUpdate=true;return;
  }
  if(scoped)drawScopeMask(c,w,h);else{drawKillFeed(c,L.kill,now);drawMiniMap(c,L.map);drawTeamBar(c,L.team);drawTeamIndicator(c,L.teamIndicator);}
  drawMenuButton(c,L.menu);drawWeapon(c,L.weapon);
  drawDamageIndicators(c,w,h,now);drawChatFeed(c,L,w,h,now);if(isTouch)drawChatButton(c,L.chat);if(chatOpen)activeAnnouncer(now);else drawAnnouncer(c,L,now);
  if(touchGameplayControlsVisible())drawTouchControls(c,L,now);if(killConfirmUntil>now)drawKillConfirm(c,w,h,now);
  if(toast){c.font='800 11px system-ui';const toastLabel=clipHudText(c,toast.text,Math.max(70,L.notice.w-20)),tw=Math.min(L.notice.w,c.measureText(toastLabel).width+24),tx=L.notice.x+(L.notice.w-tw)/2,ty=L.notice.y;roundRect(c,tx,ty,tw,L.notice.h,8,HUD_SURFACE,HUD_LINE);c.fillStyle='#fff';c.textAlign='center';c.fillText(toastLabel,tx+tw/2,ty+L.notice.h/2);}
  const headshotHit=now<headshotUntil;if(scoped)drawScopeReticle(c,w,h,now<hitUntil,headshotHit);else drawWeaponCrosshair(c,w/2,h/2,currentWeapon,now<hitUntil,adsBlend,headshotHit);
  hudTexture.needsUpdate=true;
}
function drawMatchStatus(c,w,h){
  if(matchAllowsMovement(matchState))return;
  if(matchState.status==='ended'){
    const spec=currentModeSpec(),teamMode=spec.teamBased,winner=String(matchState.winner||''),isDraw=winner==='draw'||(!winner&&!matchState.winnerId),won=teamMode?winner===myTeam:samePlayerId(matchState.winnerId,clientId);
    const title=isDraw?'DRAW':won?'VICTORY':'DEFEAT',accent=isDraw?HUD_ACCENT:won?'#8ff0a9':'#ff6973';
    const panelW=Math.min(470,w-30),panelH=Math.min(235,h-30),x=(w-panelW)/2,y=Math.max(15,(h-panelH)/2-6),returnIn=Math.max(0,Math.ceil(((Number(matchState.restartAt)||serverNow())-serverNow())/1000));
    c.save();c.fillStyle='rgba(2,4,6,.62)';c.fillRect(0,0,w,h);roundRect(c,x,y,panelW,panelH,14,'rgba(8,12,15,.96)','rgba(255,255,255,.18)');c.textAlign='center';c.fillStyle=accent;c.font=`1000 ${Math.max(28,Math.min(42,h*.09))}px system-ui`;c.fillText(title,w/2,y+49);
    c.fillStyle='#fff';c.font='900 14px system-ui';if(teamMode){const t=teamScores();c.fillText(`${t.blue}  BLUE   ·   RED  ${t.red}`,w/2,y+88);}else c.fillText(matchState.winnerName?`${String(matchState.winnerName).toUpperCase()} WINS`:'MATCH COMPLETE',w/2,y+88);
    c.fillStyle='#c4ced5';c.font='800 12px system-ui';c.fillText(`Your result  ${myStats.kills||0} K  ·  ${myStats.deaths||0} D  ·  ${(myStats.deaths?(myStats.kills/myStats.deaths):myStats.kills||0).toFixed(2)} K/D`,w/2,y+121);
    c.fillStyle=HUD_MUTED;c.font='800 11px system-ui';c.fillText(returnIn>0?`Returning to lobby in ${returnIn}s`:'Returning to lobby…',w/2,y+151);c.fillText(`${controllerInputActive()?'VIEW':isTouch?'Tap SCOREBOARD':'TAB'} for scoreboard`,w/2,y+176);c.restore();return;
  }
  const warm=matchState.status==='warmup',text=warm?matchClockText():'WAITING FOR MATCH',sub=warm?'Get ready':'Waiting for players';
  const pw=Math.min(320,w-30),ph=78,x=(w-pw)/2,y=h*.31;c.save();roundRect(c,x,y,pw,ph,12,'rgba(6,9,12,.82)','rgba(255,255,255,.16)');c.textAlign='center';c.fillStyle='#fff';c.font='1000 22px system-ui';c.fillText(text,w/2,y+29);c.fillStyle=HUD_MUTED;c.font='850 11px system-ui';c.fillText(sub,w/2,y+54);c.restore();
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
function toggleScoreboard(){if(!shell.canPlay)return;scoreboardOpen=!scoreboardOpen;scoreboardDrag=null;if(scoreboardOpen){scoreboardScroll=0;touchRoles.clear();clearFireInput();cancelEquipmentAim();joy.x=joy.y=0;}}
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

function drawKillConfirm(c,w,h,now){const remain=Math.max(0,Math.min(1,(killConfirmUntil-now)/1000)),a=Math.min(1,remain*2.8);c.save();c.globalAlpha=a;c.textAlign='center';c.shadowColor='rgba(0,0,0,.80)';c.shadowBlur=4;c.fillStyle='rgba(255,255,255,.88)';c.font='900 11px system-ui';c.fillText('ELIMINATED',w/2,h/2+34);c.fillStyle=killConfirmHeadshot?'#ffd36d':'rgba(240,201,106,.86)';c.font='800 9px system-ui';const extra=killConfirmHeadshot?' · HEADSHOT':'',detail=`${killConfirmName}${killConfirmWeapon?' · '+weaponLabel(killConfirmWeapon):''}${extra}`;c.fillText(clipHudText(c,detail,Math.max(120,w-40)),w/2,h/2+48);c.restore();}
function queueAnnouncer(title,subtitle='',duration=1500,priority=1){const item={title:String(title||''),subtitle:String(subtitle||''),duration,priority};if(!item.title)return;if(announcerCurrent&&priority>announcerCurrent.priority){announcerQueue.unshift(announcerCurrent);announcerCurrent=null;}announcerQueue.push(item);announcerQueue.sort((a,b)=>b.priority-a.priority);}
function activeAnnouncer(now){if(announcerCurrent&&now>=announcerCurrent.until)announcerCurrent=null;if(!announcerCurrent&&announcerQueue.length){const next=announcerQueue.shift();announcerCurrent={...next,start:now,until:now+next.duration};soundAnnouncer(next.priority);}return announcerCurrent;}
function drawAnnouncer(c,L,now){const a=activeAnnouncer(now);if(!a)return;const life=(now-a.start)/a.duration,fade=Math.min(1,life*6,(1-life)*5),scale=1+Math.max(0,.08-life*.34);c.save();c.translate(L.announcer.x,L.announcer.y);c.scale(scale,scale);c.globalAlpha=Math.max(0,fade);c.textAlign='center';c.shadowColor='rgba(0,0,0,.78)';c.shadowBlur=8;c.fillStyle='#fff';c.font=`1000 ${Math.max(18,Math.min(28,viewH*.052))}px system-ui`;c.fillText(a.title,0,0);if(a.subtitle){c.fillStyle=HUD_ACCENT;c.font=`900 ${Math.max(9,Math.min(12,viewH*.026))}px system-ui`;c.fillText(a.subtitle,0,20);}c.restore();}
function weaponLabel(w){return WEAPON_SPECS[w]?.name||EQUIPMENT_SPECS[w]?.name||'PISTOL';}
function drawWeapon(c,r){
  const spec=WEAPON_SPECS[currentWeapon],count=Math.max(0,Math.floor(ammo[currentWeapon]||0)),unlimited=!!godMode;
  const accent=currentWeapon==='sniper'?'#8edcff':(currentWeapon==='shotgun'||currentWeapon==='semiShotgun')?'#ffad69':(currentWeapon==='grenadeLauncher'||currentWeapon==='rpg')?'#ffb267':(currentWeapon==='assault'||currentWeapon==='ump')?HUD_ACCENT:'#f4f6f7';
  roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);c.fillStyle=accent;c.fillRect(r.x,r.y,2.5,r.h);
  const left=r.x+10,top=r.y+11,right=r.x+r.w-9,mode=currentWeapon==='assault'?assaultFireMode.toUpperCase():WEAPON_SPECS[currentWeapon]?.automatic?'AUTO':'SEMI';
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
  if(m.victim.id===clientId){lastWastedBy=m.attacker.name||'Player';lastWastedWeapon=m.weapon||'';}
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
  for(const item of killFeed){const h=22,weapon=`${WEAPON_SPECS[item.weapon]?.short||EQUIPMENT_SPECS[item.weapon]?.short||'PST'}${item.headshot?' HS':''}`;if(y+h>r.y+r.h)break;
    roundRect(c,r.x,y,r.w,h,6,'rgba(9,11,13,.76)','rgba(255,255,255,.09)');
    const teamBased=currentModeSpec().teamBased,attackerColor=teamBased?(TEAM_COLORS[item.attacker.team]||'#fff'):(item.attacker.id===clientId?HUD_ACCENT:TEAM_COLORS.red),victimColor=teamBased?(TEAM_COLORS[item.victim.team]||'#fff'):(item.victim.id===clientId?HUD_ACCENT:TEAM_COLORS.red);c.fillStyle=attackerColor;c.fillRect(r.x,y,2,h);
    const innerW=Math.max(40,r.w-16),weaponBudget=Math.min(64,innerW*.30),nameBudget=Math.max(28,(innerW-weaponBudget-8)/2);c.font='900 11px system-ui';c.textAlign='left';c.fillStyle='#fff';const attacker=clipHudText(c,item.attacker.name||'Player',nameBudget);c.fillText(attacker,r.x+8,y+h/2);
    const aw=c.measureText(attacker).width;c.fillStyle=item.headshot?HUD_ACCENT:'#86919a';c.font='900 9px system-ui';const weaponText=clipHudText(c,weapon,weaponBudget);c.fillText(` ${weaponText} `,r.x+10+aw,y+h/2);
    const ww=c.measureText(` ${weaponText} `).width;c.fillStyle=victimColor;c.font='900 11px system-ui';const victimX=r.x+12+aw+ww,victim=clipHudText(c,item.victim.name||'Player',Math.max(24,r.x+r.w-7-victimX));c.fillText(victim,victimX,y+h/2);y+=h+4;
  }
  c.restore();
}

function drawMenuButton(c,r){roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);const cx=r.x+r.w/2,cy=r.y+r.h/2;c.save();c.strokeStyle='rgba(245,249,252,.92)';c.lineWidth=1.8;c.lineCap='round';for(const off of [-5,0,5]){c.beginPath();c.moveTo(cx-7,cy+off);c.lineTo(cx+7,cy+off);c.stroke();}c.restore();}
function drawWeaponCrosshair(c,x,y,weapon,hit,ads=0,headshot=false){const color=headshot?'#ffd36d':hit?'#fff':'rgba(255,255,255,.94)',gap=accuracyCrosshairRadius();c.save();c.strokeStyle=color;c.fillStyle=color;c.shadowColor='rgba(0,0,0,.88)';c.shadowBlur=3;c.lineWidth=hit?2.35:1.65;c.lineCap='round';
  if(weapon==='grenadeLauncher'){
    // Launcher-specific range ladder: center aiming ring plus descending holdover
    // marks communicates the grenade's arcing trajectory instead of reusing a
    // rifle crosshair that implies a flat shot.
    const spread=Math.max(7,gap*.72),ring=4.3+spread*.08;c.lineWidth=hit?2.2:1.45;c.beginPath();c.arc(x,y,ring,0,Math.PI*2);c.stroke();c.beginPath();c.arc(x,y,1.15,0,Math.PI*2);c.fill();
    const ladder=[{dy:14,w:13},{dy:25,w:18},{dy:38,w:24},{dy:53,w:30}];c.beginPath();c.moveTo(x,y+ring+3);c.lineTo(x,y+57);for(const mark of ladder){c.moveTo(x-mark.w/2,y+mark.dy);c.lineTo(x+mark.w/2,y+mark.dy);}c.stroke();
    c.globalAlpha=.72;c.lineWidth=1.1;c.beginPath();c.moveTo(x-18-spread*.25,y-5);c.quadraticCurveTo(x-23-spread*.3,y,x-18-spread*.25,y+5);c.moveTo(x+18+spread*.25,y-5);c.quadraticCurveTo(x+23+spread*.3,y,x+18+spread*.25,y+5);c.stroke();
  }else if(weapon==='shotgun'||weapon==='semiShotgun'){const r=Math.max(8,gap),arc=.50;c.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2-arc/2;c.arc(x,y,r,a,a+arc);}c.stroke();c.beginPath();c.arc(x,y,1.5,0,Math.PI*2);c.fill();}
  else{const len=weapon==='assault'?8:weapon==='sniper'?6:5.5,inner=Math.max(3.5,gap);if(weapon==='sniper')c.lineWidth=1.2;c.beginPath();c.moveTo(x-inner-len,y);c.lineTo(x-inner,y);c.moveTo(x+inner,y);c.lineTo(x+inner+len,y);c.moveTo(x,y-inner-len);c.lineTo(x,y-inner);c.moveTo(x,y+inner);c.lineTo(x,y+inner+len);c.stroke();c.beginPath();c.arc(x,y,weapon==='assault'?1.35:weapon==='sniper'?1.1:1.6,0,Math.PI*2);c.fill();}
  c.restore();}

function drawScopeMask(c,w,h){const r=Math.min(w,h)*.43,cx=w/2,cy=h/2;c.save();c.beginPath();c.rect(0,0,w,h);c.arc(cx,cy,r,0,Math.PI*2,true);c.fillStyle='rgba(0,0,0,.94)';c.fill('evenodd');c.strokeStyle='rgba(255,255,255,.22)';c.lineWidth=2;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();c.restore();}
function drawScopeReticle(c,w,h,hit,headshot=false){const r=Math.min(w,h)*.43,cx=w/2,cy=h/2;c.save();c.beginPath();c.arc(cx,cy,r-2,0,Math.PI*2);c.clip();c.strokeStyle=headshot?'#ffd36d':hit?'#fff':'rgba(20,20,20,.86)';c.lineWidth=1.2;c.beginPath();c.moveTo(cx-r,cy);c.lineTo(cx+r,cy);c.moveTo(cx,cy-r);c.lineTo(cx,cy+r);c.stroke();c.fillStyle=headshot?'#ffd36d':hit?'#fff':'rgba(15,15,15,.92)';c.beginPath();c.arc(cx,cy,2,0,Math.PI*2);c.fill();for(let i=1;i<=4;i++){const off=i*18;c.beginPath();c.moveTo(cx-5,cy+off);c.lineTo(cx+5,cy+off);c.stroke();}c.fillStyle='rgba(255,255,255,.76)';c.font='900 10px system-ui';c.textAlign='center';c.fillText(sniperZoomLabel(),cx,cy-r+18);c.restore();}
function drawTouchControls(c,L,now){
  c.save();if(touchRoleActive('joy')){const j={x:joy.centerX,y:joy.centerY,r:L.joy.r};c.beginPath();c.arc(j.x,j.y,j.r,0,Math.PI*2);c.fillStyle='rgba(9,11,13,.42)';c.fill();c.strokeStyle='rgba(255,255,255,.24)';c.lineWidth=1.5;c.stroke();c.beginPath();c.arc(j.x,j.y,j.r*.72,0,Math.PI*2);c.strokeStyle='rgba(255,255,255,.08)';c.stroke();const max=j.r*.45,sx=j.x+joy.x*max,sy=j.y+joy.y*max;c.beginPath();c.arc(sx,sy,j.r*.40,0,Math.PI*2);c.fillStyle='rgba(215,255,88,.16)';c.fill();c.strokeStyle='rgba(215,255,88,.42)';c.stroke();c.fillStyle='rgba(255,255,255,.58)';c.font='900 10px system-ui';c.textAlign='center';c.fillText('MOVE',j.x,j.y+j.r*.70);}c.restore();
  drawRoundControl(c,L.leftFire,now<touchVisual.fireUntil,'fire');drawRoundControl(c,L.crouch,crouched,'crouch');drawRoundControl(c,L.flash,equipmentAim.kind===tacticalEquipment||now<touchVisual.flashUntil,'flash');drawRoundControl(c,L.sticky,equipmentAim.kind===lethalEquipment||now<touchVisual.stickyUntil,'sticky');
  drawRoundControl(c,L.fire,now<touchVisual.fireUntil,'fire');drawRoundControl(c,L.aim,adsWanted,'aim');drawRoundControl(c,L.jump,now<touchVisual.jumpUntil,'jump');
  drawRoundControl(c,L.reload,now<touchVisual.reloadUntil||!!reloadUntil,'reload');drawRoundControl(c,L.swap,now<touchVisual.swapUntil,'swap');
  if(currentWeapon==='assault')drawRoundControl(c,L.mode,now<touchVisual.modeUntil||assaultFireMode==='auto','mode');
}
function drawRoundControl(c,b,active,type){
  c.save();c.beginPath();c.arc(b.x,b.y,b.r,0,Math.PI*2);const hot=type==='fire',aim=type==='aim';c.fillStyle=active?(aim?'rgba(215,255,88,.30)':hot?'rgba(255,95,103,.48)':'rgba(215,255,88,.22)'):(hot?'rgba(60,22,25,.56)':'rgba(9,11,13,.62)');c.fill();c.strokeStyle=active?(aim?HUD_ACCENT:hot?'rgba(255,132,139,.86)':HUD_ACCENT):(hot?'rgba(255,115,123,.52)':'rgba(255,255,255,.22)');c.lineWidth=active?2:1.4;c.stroke();drawControlIcon(c,b.x,b.y-b.r*.08,b.r,type,active);
  const label=type==='fire'?'FIRE':type==='aim'?(currentWeapon==='sniper'?(adsWanted?(sniperZoomLevel===1?'8X':'EXIT'):'4X'):'ADS'):type==='jump'?(ladderState?'JUMP OFF':traversal?'CLIMB':'JUMP'):type==='crouch'?(crouched?'STAND':'CROUCH'):type==='reload'?'RELOAD':type==='swap'?'SWAP':type==='mode'?assaultFireMode.toUpperCase():type==='flash'?(equipmentAim.kind===tacticalEquipment?'THROW':`${tacticalEquipment==='flash'?'FLASH':'SMOKE'} ${godMode?'∞':equipment[tacticalEquipment]||0}`):type==='sticky'?(equipmentAim.kind===lethalEquipment?'THROW':`${lethalEquipment==='sticky'?'SEMTEX':'FRAG'} ${godMode?'∞':equipment[lethalEquipment]||0}`):'';c.textAlign='center';c.fillStyle=active?'#fff':'rgba(230,243,249,.68)';c.font=`900 ${Math.max(8,Math.min(10,b.r*.26))}px system-ui`;c.fillText(label,b.x,b.y+b.r*.56,Math.max(26,b.r*1.55));c.restore();
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



function weaponShotSoundId(weapon='pistol'){return weapon==='shotgun'||weapon==='semiShotgun'||weapon==='grenadeLauncher'||weapon==='rpg'?'shotShotgun':weapon==='sniper'?'shotSniper':weapon==='assault'||weapon==='ump'?'shotAssault':'shotPistol';}
function soundShot(weapon='pistol'){playSoundCue(weaponShotSoundId(weapon));}
function reloadSoundId(weapon=currentWeapon){return weapon==='shotgun'||weapon==='semiShotgun'?'reloadShotgun':weapon==='sniper'||weapon==='grenadeLauncher'||weapon==='rpg'?'reloadSniper':weapon==='assault'||weapon==='ump'?'reloadAssault':'reloadPistol';}
function soundReload(weapon=currentWeapon){playSoundCue(reloadSoundId(weapon));}
function soundHitmarker(){playSoundCue('hitmarker');}
function soundHeadshot(){playSoundCue('headshot');}
function soundKill(){playSoundCue('kill');}
function soundAnnouncer(priority=1){playSoundCue('announcer',1,{playbackRate:priority>=5?1.08:1});}
function soundShield(){playSoundCue('shield');}
function soundHurt(){playSoundCue('hurt');}
function soundJump(){playSoundCue('jump');}
function soundFootstep(side=0,volume=1){playSoundCue(side?'footstepRight':'footstepLeft',volume);}
function soundLanding(volume=1){playSoundCue('land',volume);}
function soundShotgunPump(){playSoundCue('shotgunPump');}
function soundThrowableThrow(kind='flash'){playSoundCue(kind==='sticky'||kind==='frag'?'stickyThrow':'flashThrow');}
function soundThrowableImpact(kind='flash',m){if(!m)return;playSpatialCue(kind==='sticky'||kind==='frag'?'stickyImpact':'flashImpact',Number(m.x)||0,Number(m.y)||0,Number(m.z)||0,32,.85);}

function semtexBeepInterval(remainingMs){const p=1-THREE.MathUtils.clamp(Number(remainingMs||0)/1850,0,1);return Math.round(THREE.MathUtils.lerp(360,85,Math.pow(p,1.22)));}
function soundSemtexBeep(g,remainingMs){if(!g?.root)return;const p=1-THREE.MathUtils.clamp(Number(remainingMs||0)/1850,0,1),rate=1+p*.10,interval=semtexBeepInterval(remainingMs)/1000,pos=g.root.position;playSpatialCue('semtexBeep',pos.x,pos.y,pos.z,44,1,{playbackRate:rate,maxDuration:Math.max(.055,Math.min(.18,interval*.72))});}

function soundTacticalDetonation(kind,m){if(!m)return;playSpatialCue(kind==='flash'||kind==='smoke'?'flashDetonate':'grenadeExplosion',Number(m.x)||0,Number(m.y)||0,Number(m.z)||0,kind==='sticky'?70:58,1);}
document.addEventListener('pointerdown',()=>{void ensureAudio();if(!shell.inMatch&&!masterMuted)startIntroMusic();},{capture:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void gameAudio.resume();});
