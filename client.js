window.__breachModuleBooted=true;
import {
  PLAYER_HEIGHT, PLAYER_RADIUS, ARENA_LIMIT, STATIC_BOXES, BUILDINGS, PYRAMIDS, NATURAL_OBSTACLES, TERRAIN_SIZE, TERRAIN_SEGMENTS,
  terrainHeight, naturalGroundBase, worldSupportHeight, resolveCeilingCollision, BUILDING_GEOMETRY, BUILDING_PARTS
} from './world-geometry.js?v=1.25.6';
import {
  APP_VERSION, PROTOCOL_VERSION, ROOM_CODE_LENGTH, MAX_PLAYERS, MAX_BOTS, TEAM_COLORS, WEAPON_ORDER, PRIMARY_WEAPONS, WEAPON_SPECS, weaponSpreadRadians, CROUCH_HEIGHT, CROUCH_SPEED_MULTIPLIER, EQUIPMENT_CAPS,
  DEFAULT_WORLD_SETTINGS, DEFAULT_MATCH_RULES, GAME_MODES, DEFAULT_GAME_MODE, normalizeGameMode, gameModeSpec, normalizeWorldSettings, TACTICAL_THROW_SPEED, TACTICAL_THROW_LOFT, TACTICAL_GRAVITY, GROUND_FOLLOW_DROP
} from './game-config.js?v=1.25.6';
import { createProjectileCollisionGrid } from './collision-grid.js?v=1.25.6';
import { worldBlockedAt, worldMoveBlockedAt, findTraversalCandidate } from './world-collision.js?v=1.25.6';
import { createAudioEngine } from './audio-engine.js?v=1.25.6';
import { normalizeMatchState as normalizeSharedMatchState } from './match-model.js?v=1.25.6';
import { MAX_PLAYER_PHYSICS_STEP_SEC, advanceVerticalMotion, advanceKnockback, sweepHorizontalMovement, createTraversalPlan, traversalPose, tacticalThrowVelocity } from './movement-model.js?v=1.25.6';
import { SHELL_PANEL, createSessionShell, detectInputPlatform } from './app-lifecycle.js?v=1.25.6';

let THREE = null;

// Change only this line if Cloudflare gives your Worker a different URL.
const ONLINE_API = 'https://breach-online.kiadesignenterprise.workers.dev';
const MOBILE_MOVE_ZONE_RATIO = .35;
const CLIENT_FIXED_STEP_SEC = 1/60;
const CLIENT_MAX_FRAME_SEC = .12;
const CLIENT_MAX_SIM_STEPS = 4;
const GROUND_ACCELERATION = 64;
const GROUND_BRAKING = 86;
const AIR_ACCELERATION = 18;
const COYOTE_TIME_MS = 95;
const JUMP_BUFFER_MS = 120;
const TOUCH_JOY_BUTTON_PADDING = 12;
function freshClientAmmo(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,WEAPON_SPECS[name].mag]));}
function freshClientEquipment(){return {...EQUIPMENT_CAPS};}
const HUD_ACCENT='#d7ff58', HUD_SURFACE='rgba(9,11,13,.90)', HUD_LINE='rgba(255,255,255,.16)', HUD_MUTED='#8b969f';
const ACTIVE_STATE_INTERVAL = 33;
const IDLE_STATE_INTERVAL = 250;
// Physical collision/support remains authoritative and discrete. These rates only smooth presentation.
const CROUCH_VIEW_RATE = 13;
const GROUND_VIEW_UP_RATE = 11.5;
const GROUND_VIEW_DOWN_RATE = 9.0;
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
const appRoot=$('appRoot'), gameStage=$('gameStage'), entryScreen=$('entryScreen'), rotateGate=$('rotateGate'), menu=$('menu'), lobbyScreen=$('lobbyScreen'), pause=$('pause');
const nameInput=$('nameInput'),codeInput=$('codeInput'),menuStatus=$('menuStatus');
const deployTabs=[...document.querySelectorAll('[data-deploy-tab]')],deployViews=[...document.querySelectorAll('[data-deploy-view]')];
const lobbyModeButtons=[...document.querySelectorAll('[data-lobby-mode-choice]')],lobbyTeamButtons=[...document.querySelectorAll('[data-lobby-team-choice]')],lobbyPrimaryButtons=[...document.querySelectorAll('[data-lobby-primary-choice]')];
const lobbyRoster=$('lobbyRoster'),lobbyBlueBotCount=$('lobbyBlueBotCount'),lobbyRedBotCount=$('lobbyRedBotCount'),lobbyFfaBotCount=$('lobbyFfaBotCount'),lobbyBotDifficulty=$('lobbyBotDifficulty');
const matchList=$('matchList'),matchCount=$('matchCount'),canvas=$('game'),connectionOverlay=$('connectionOverlay'),connectionText=$('connectionText');
document.querySelectorAll('[data-app-version]').forEach(el=>{el.textContent=`Version ${APP_VERSION}`;});

const platform=detectInputPlatform(),isTouch=platform.touchControls;
const clientId=getClientId(),clientAuth=getClientAuth();
nameInput.value=localStorage.getItem('breachName')||`Player${Math.floor(Math.random()*90+10)}`;
let preferredTeam=localStorage.getItem('breachTeam')==='red'?'red':'blue';
let preferredPrimary=PRIMARY_WEAPONS.includes(localStorage.getItem('breachPrimary'))?localStorage.getItem('breachPrimary'):'assault';
let masterMuted=localStorage.getItem('breachMuted')==='1';
const requestedRoom=new URL(location.href).searchParams.get('room');
if(requestedRoom)codeInput.value=normalizeCode(requestedRoom);

let scene, camera, renderer, clock, pistolGroup, pistolFlash, pistolMag, assaultGroup, assaultFlash, assaultMag, shotgunGroup, shotgunFlash, shotgunPump, sniperGroup, sniperFlash, sniperBolt, mantleHands;
let hudScene, hudCamera, hudTexture, hudCanvas, hudCtx, hudScale = 1, hudLastDraw = 0;
let socket = null, reconnectTimer = null, reconnectAttempt = 0;
let currentRoom = '', myName = '', myTeam = preferredTeam, selfColor = TEAM_COLORS.blue, godMode = false, isMatchAdmin = false, matchOwnerId = '', pendingTeam='';
let primaryWeapon=preferredPrimary,matchState={status:'waiting',round:1,mode:DEFAULT_GAME_MODE,blueScore:0,redScore:0,scoreLimit:DEFAULT_MATCH_RULES.scoreLimit,timeLimitMs:DEFAULT_MATCH_RULES.timeLimitMs,warmupEndsAt:0,endsAt:0,winner:'',winnerId:'',winnerName:'',reason:'',serverTime:0},matchCustom=false;
let hp = 100, wastedUntil = 0, currentWeapon = preferredPrimary, ammo = freshClientAmmo(), equipment=freshClientEquipment(), reloadUntil = 0, reloadWeapon = '', reloadRequestPending=false, pendingWeapon='';
let flashUntil=0,flashPeakUntil=0;
let assaultFireMode=localStorage.getItem('breachAssaultFireMode')==='semi'?'semi':'auto';
let adsWanted=false,adsBlend=0,baseFov=70,sniperZoomLevel=0,lastWastedBy='',lastWastedWeapon='';
let crouchWanted=false,crouched=false,crouchBlend=0,viewFeetY=NaN;
let correctionViewX=0,correctionViewY=0,correctionViewZ=0;
let myStats={kills:0,deaths:0},scoreboardOpen=false,scoreboardScroll=0,scoreboardDrag=null,scoreboardPanel=null,killConfirmUntil=0,killConfirmName='',killConfirmWeapon='',killConfirmHeadshot=false,killConfirmDistance=0;
let headshotUntil=0,announcerCurrent=null;const announcerQueue=[];
let yaw = 0, pitch = 0, viewRecoilPitch = 0, viewRecoilYaw = 0, verticalVelocity = 0, moveVelocityX = 0, moveVelocityZ = 0, knockX = 0, knockZ = 0, jumpSeq = 0, lastGroundedAt = 0, jumpBufferedUntil = 0;
let traversal=null,traversalSeq=0,traversalIntentUntil=0,traversalIntentSeq=0,traversalConsumedIntentSeq=0;
let onGround = true, lastShotVisualAt = 0, fireReadyAt = freshClientFireReady(), lastStateSent = 0, lastPing = 0, lastPingLocalAt = 0, serverClockOffset = 0;
let lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,crouched:false,grounded:true,moveX:0,moveZ:0}, localEquipmentCooldownUntil=0;
let localMoveAmount=0,moveBobPhase=0,landingKick=0,weaponSwapStartedAt=0,reloadStartedAt=0,deathAnimStartedAt=0,nextFootstepAt=0,footstepSide=0,shotgunPumpStartedAt=0,shotgunPumpSoundPlayed=false;
let gameAudioPreloadPromise=null,gameAudioPreparePromise=null,audioUnlockPromise=null,gameAudioReady=false;
const DEFAULT_PLAYER_SETTINGS=Object.freeze({lookSensitivity:1,adsSensitivity:1,touchSensitivity:1,masterVolume:.85,sfxVolume:.9,musicVolume:.55,graphics:isTouch?'medium':'high'});
function loadPlayerSettings(){
  let saved={};try{saved=JSON.parse(localStorage.getItem('breachPlayerSettings')||'{}')||{}}catch{}
  const numeric=(key,min,max)=>{const raw=saved[key];if(raw===null||raw===undefined||raw==='')return DEFAULT_PLAYER_SETTINGS[key];const value=Number(raw);return Number.isFinite(value)?Math.max(min,Math.min(max,value)):DEFAULT_PLAYER_SETTINGS[key];};
  return {lookSensitivity:numeric('lookSensitivity',.5,2),adsSensitivity:numeric('adsSensitivity',.35,1.25),touchSensitivity:numeric('touchSensitivity',.5,2),masterVolume:numeric('masterVolume',0,1),sfxVolume:numeric('sfxVolume',0,1),musicVolume:numeric('musicVolume',0,1),graphics:['low','medium','high'].includes(saved.graphics)?saved.graphics:DEFAULT_PLAYER_SETTINGS.graphics};
}
let playerSettings=loadPlayerSettings();
const gameAudio=createAudioEngine({cues:SOUND_CUES,getVolumes:()=>({master:masterMuted?0:playerSettings.masterVolume,sfx:playerSettings.sfxVolume,music:playerSettings.musicVolume})});
let introMusicHandle=null;

let toastText = '', toastUntil = 0, hurtUntil = 0, hitUntil = 0;
let botConfig={blueBots:0,redBots:0,difficulty:'normal'};
const bloodSplats=[];
const damageIndicators=[];
let position = null;
const keys = new Set();
const moveInput = { mx:0, mz:0, len:0 };
const remotes = new Map();
const lobbyParticipants = new Map();
let pendingGameSnapshot = null;
const bullets = new Map();
const bulletGeometryCache = new Map();
const bulletMaterialCache = new Map();
const bulletMeshPool = [];
const throwables = new Map();
const tacticalFx = [];
let equipmentAim={kind:'',startedAt:0};
let trajectoryRibbon=null,trajectoryCenters=null,trajectoryVertices=null,trajectoryMarker=null,trajectoryScratch=null,trajectoryLastUpdate=0;
let trajectoryLastX=NaN,trajectoryLastY=NaN,trajectoryLastZ=NaN,trajectoryLastYaw=NaN,trajectoryLastPitch=NaN,trajectoryLastHeight=NaN;
const TRAJECTORY_MAX_POINTS=56;
const TRAJECTORY_UPDATE_MS=33;
const TRAJECTORY_RENDER_STEP=.04;
const SIM_HEARTBEAT_MS=33;
const SIM_LEADER_STALE_MS=750;
let lastSimHeartbeat=0;
const trajectoryCollision=createProjectileCollisionGrid({
  staticBoxes:STATIC_BOXES,pyramids:PYRAMIDS,naturalObstacles:NATURAL_OBSTACLES,buildingParts:BUILDING_PARTS,
  terrainHeight,naturalGroundBase,cellSize:8,cellHeight:3
});
const mapObstacles = [];
const joy = { x:0, y:0, centerX:0, centerY:0 };
const look = { x:0, y:0 };
const touchRoles = new Map();
let mouseFireDown=false;
const touchVisual = { jumpUntil:0, fireUntil:0, reloadUntil:0, swapUntil:0, modeUntil:0, flashUntil:0, stickyUntil:0 };

const killFeed = [];
let minimapStaticCache=null;
let hudLayout=null;
let viewW=1,viewH=1;

function suspendGameplayInput(){
  keys.clear();
  resetTouchInput();
  clearFireInput();
  cancelEquipmentAim();
  setAim(false);
  mouseFireDown=false;
  scoreboardOpen=false;
}

function handleShellState(state){
  if(state.inMatch&&state.paused)syncPauseContext();
  for(const id of ['exitAppBtn','lobbyExitFullscreenBtn']){const btn=$(id);if(btn)btn.disabled=state.standalone||!state.fullscreen;}
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
    fullscreenButton:$('fullBtn'),
  },
  onSuspend:suspendGameplayInput,
  onStateChange:handleShellState,
  onViewport:handleViewportChange,
  onPointerLockUnavailable:()=>showToast('Mouse capture unavailable'),
});
({w:viewW,h:viewH}=shell.viewport);
shell.start();

syncMusicUI();
syncPlayerSettingsUI();

const ENGINE_MODULE_URL = './vendor/three.module.min.js?v=1.25.6';
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
function currentSpreadRadians(){const movement=worldSettings.movement,speed=(adsWanted?movement.walkSpeed:movement.runSpeed)*(crouched?CROUCH_SPEED_MULTIPLIER:1);return weaponSpreadRadians(currentWeapon,(localMoveAmount||0)*speed,movement.runSpeed,!!adsWanted,crouched);}
function accuracyCrosshairRadius(){const fov=(camera?.fov||baseFov)*Math.PI/180,spread=currentSpreadRadians();return THREE.MathUtils.clamp(Math.tan(spread)*(viewH*.5)/Math.max(.08,Math.tan(fov*.5)),3.5,52);}
function sniperScopeActive(){return currentWeapon==='sniper'&&adsBlend>.72;}
function sniperZoomLabel(){return sniperZoomLevel>=2?'8X':sniperZoomLevel===1?'4X':'HIP';}
function rememberTeam(team){preferredTeam=team==='red'?'red':'blue';localStorage.setItem('breachTeam',preferredTeam);document.documentElement.style.setProperty('--team',TEAM_COLORS[preferredTeam]);}
function rememberPrimary(weapon){preferredPrimary=PRIMARY_WEAPONS.includes(weapon)?weapon:'assault';localStorage.setItem('breachPrimary',preferredPrimary);}

function syncMusicUI(){
  for(const [useId,btnId] of [['musicIconUse','musicBtn'],['lobbyMusicIconUse','lobbyMusicBtn']]){const use=$(useId),btn=$(btnId);if(use)use.setAttribute('href',masterMuted?'#i-mute':'#i-sound');if(btn)btn.title=masterMuted?'Unmute audio':'Mute all audio';}
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
  if(!player?.id)return null;return {id:String(player.id),name:String(player.name||'Player'),team:player.team==='red'?'red':'blue',bot:!!player.bot,godMode:!!player.godMode,admin:!!player.admin,primaryWeapon:PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:PRIMARY_WEAPONS.includes(player.weapon)?player.weapon:'assault',kills:Number(player.kills)||0,deaths:Number(player.deaths)||0};
}
function replaceLobbyParticipants(players=[],bots=[]){lobbyParticipants.clear();for(const player of [...players,...bots]){const row=normalizeLobbyParticipant(player);if(row&&row.id!==clientId)lobbyParticipants.set(row.id,row);}}
function upsertLobbyParticipant(player){const row=normalizeLobbyParticipant(player);if(row&&row.id!==clientId)lobbyParticipants.set(row.id,row);}
function removeLobbyParticipant(id){lobbyParticipants.delete(String(id||''));}
function syncLobbyBots(list=[]){for(const [id,row] of lobbyParticipants){if(row.bot)lobbyParticipants.delete(id);}for(const bot of list){const row=normalizeLobbyParticipant(bot);if(row)lobbyParticipants.set(row.id,row);}}
function lobbySnapshot(){
  const rows=[{id:clientId,name:myName||safeName(),team:myTeam,bot:false,godMode,admin:isMatchAdmin,primaryWeapon,kills:myStats.kills||0,deaths:myStats.deaths||0,self:true}];
  for(const row of lobbyParticipants.values())rows.push({...row,self:false});
  return rows;
}
function renderLobbyRoster(){
  if(!lobbyRoster)return;const rows=lobbySnapshot(),mode=currentGameMode(),teamBased=gameModeSpec(mode).teamBased;
  const humanCount=rows.filter(x=>!x.bot).length,botCount=rows.filter(x=>x.bot).length;$('lobbyPlayerCount').textContent=`${humanCount} / ${MAX_PLAYERS} · ${botCount} bots`;
  const playerRow=p=>`<div class="lobby-player ${p.self?'self':''}"><span class="lobby-player-color ${teamBased?p.team:'ffa'}"></span><div class="lobby-player-copy"><strong>${escapeHtml(p.bot?'[BOT] '+p.name:p.name)}${p.self?' · YOU':''}</strong><small>${teamBased?String(p.team||'blue').toUpperCase()+' · ':''}${escapeHtml(WEAPON_SPECS[p.primaryWeapon]?.name||'ASSAULT RIFLE')}${p.admin?' · ADMIN':''}${p.godMode?' · GOD MODE':''}</small></div></div>`;
  if(!teamBased){lobbyRoster.className='lobby-roster ffa';lobbyRoster.innerHTML=`<div class="lobby-team-column ffa"><div class="lobby-team-title"><span>FREE FOR ALL</span><b>${rows.length}</b></div>${rows.sort((a,b)=>Number(b.self)-Number(a.self)||a.name.localeCompare(b.name)).map(playerRow).join('')}</div>`;return;}
  lobbyRoster.className='lobby-roster';
  const column=team=>{const list=rows.filter(p=>p.team===team),name=team==='red'?'RED':'BLUE';return `<div class="lobby-team-column ${team}"><div class="lobby-team-title"><span>${name}</span><b>${list.length}</b></div>${list.map(playerRow).join('')||'<div class="lobby-empty-team">Open slot</div>'}</div>`;};
  lobbyRoster.innerHTML=column('blue')+column('red');
}
function lobbyBotTotal(){return Math.max(0,Math.min(MAX_BOTS,(botConfig.blueBots||0)+(botConfig.redBots||0)));}
function syncLobby(){
  if(!shell.inLobby)return;const mode=currentGameMode(),spec=gameModeSpec(mode),host=!!isMatchAdmin,total=lobbyBotTotal();
  $('lobbyRoomCode').textContent=currentRoom||'----';$('lobbyModeBadge').textContent=spec.name;$('lobbyModeDescription').textContent=lobbyModeDescription(mode);
  $('lobbyTeamGroup').classList.toggle('hide',!spec.teamBased);$('lobbyGodWrap').classList.toggle('hide',!host);$('lobbyHostSetup').classList.toggle('hide',!host);$('lobbyGuestSetup').classList.toggle('hide',host);$('lobbyManagePlayersBtn').classList.toggle('hide',!host);$('lobbySetupOwnerLabel').textContent=host?'Admin controls':'Match info';
  const startBtn=$('lobbyStartBtn');startBtn.classList.toggle('hide',!host);startBtn.disabled=matchState.status!=='waiting';
  for(const btn of lobbyTeamButtons)btn.classList.toggle('active',spec.teamBased&&btn.dataset.lobbyTeamChoice===myTeam);
  for(const btn of lobbyPrimaryButtons)btn.classList.toggle('active',btn.dataset.lobbyPrimaryChoice===primaryWeapon);
  for(const btn of lobbyModeButtons)btn.classList.toggle('active',btn.dataset.lobbyModeChoice===mode);
  const godBtn=$('lobbyGodBtn');if(godBtn){godBtn.setAttribute('aria-pressed',String(godMode));godBtn.classList.toggle('active',godMode);}$('lobbyGodState').textContent=godMode?'ON':'OFF';
  const ffa=!spec.teamBased;$('lobbyBlueBotWrap').classList.toggle('hide',ffa);$('lobbyRedBotWrap').classList.toggle('hide',ffa);$('lobbyFfaBotWrap').classList.toggle('hide',!ffa);
  lobbyBlueBotCount.value=String(botConfig.blueBots||0);lobbyRedBotCount.value=String(botConfig.redBots||0);lobbyFfaBotCount.value=String(total);lobbyBotDifficulty.value=botConfig.difficulty||'normal';
  const ruleSummary=spec.scoreType==='none'?'No score / time limit':`First ${matchState.scoreLimit||spec.scoreLimit} · ${Math.max(2,Math.round((matchState.timeLimitMs||spec.timeLimitMs)/60000))} min`;$('lobbyRuleSummary').textContent=`${ruleSummary}${matchCustom?' · CUSTOM':''}`;$('lobbyGuestMode').textContent=spec.name;$('lobbyGuestBots').textContent=`${total} bot${total===1?'':'s'} · ${(botConfig.difficulty||'normal').replace(/^./,c=>c.toUpperCase())}`;$('lobbyGuestRules').textContent=`${ruleSummary}${matchCustom?' · Custom rules':''}`;
  $('lobbyStatus').textContent=host?'Lobby ready':'Waiting for admin';$('lobbyHint').textContent=host?'Configure the match, then start when everyone is ready.':'Choose your team and loadout while a lobby admin configures the match.';
  renderLobbyRoster();
}
function showLobby(){
  shell.enterLobby();syncLobby();const url=new URL(location.href);url.searchParams.set('room',currentRoom);history.replaceState(null,'',url);
}
function sendLobbyBotConfig(){
  if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||matchState.status!=='waiting')return;
  const ffa=!currentModeSpec().teamBased;let blue=0,red=0;
  if(ffa){const total=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyFfaBotCount.value)||0)));blue=Math.ceil(total/2);red=Math.floor(total/2);}else{blue=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyBlueBotCount.value)||0)));red=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(lobbyRedBotCount.value)||0)));if(blue+red>MAX_BOTS){showToast(`MAX ${MAX_BOTS} BOTS`);syncLobby();return;}}
  send({t:'adminBots',blueBots:blue,redBots:red,difficulty:lobbyBotDifficulty.value});
}

function syncPauseContext(){
  const spec=currentModeSpec(),badge=$('pauseTeamBadge');if(badge){badge.textContent=spec.teamBased?`${myTeam.toUpperCase()} TEAM`:spec.short;const color=spec.teamBased?TEAM_COLORS[myTeam]:HUD_ACCENT;badge.style.color=color;badge.style.borderColor=`${color}88`;badge.style.background=`${color}22`;}
  if($('pauseRoom'))$('pauseRoom').textContent=`${spec.short} · ${currentRoom||'----'}`;
  if($('pauseLoadout'))$('pauseLoadout').textContent=`${WEAPON_SPECS[primaryWeapon].name} + Pistol · ${Math.max(0,Math.floor(ammo[currentWeapon]||0))} rounds`;
  const adminBtn=$('adminBtn');if(adminBtn)adminBtn.classList.toggle('hide',!isMatchAdmin);
  const teamBtn=$('teamSwitchBtn');if(teamBtn)teamBtn.classList.toggle('hide',!spec.teamBased);const teamText=$('teamSwitchText');if(teamText)teamText.textContent=pendingTeam?`${pendingTeam.toUpperCase()} ON RESPAWN`:`Switch to ${myTeam==='blue'?'Red':'Blue'} on Respawn`;
}



function weaponSoundCueIds(weapon=currentWeapon){return weapon==='shotgun'?['shotShotgun','reloadShotgun','shotgunPump']:weapon==='sniper'?['shotSniper','reloadSniper']:weapon==='assault'?['shotAssault','reloadAssault']:['shotPistol','reloadPistol'];}
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
function syncPlayerSettingsUI(){
  const values=[['playerLookSensitivity','lookSensitivity'],['playerAdsSensitivity','adsSensitivity'],['playerTouchSensitivity','touchSensitivity'],['playerMasterVolume','masterVolume'],['playerSfxVolume','sfxVolume'],['playerMusicVolume','musicVolume']];
  for(const [id,key] of values){const el=$(id),out=$(`${id}Value`);if(el)el.value=playerSettings[key];if(out)out.textContent=key.includes('Volume')?`${Math.round(playerSettings[key]*100)}%`:`${Number(playerSettings[key]).toFixed(2)}×`;}
  if($('playerGraphics'))$('playerGraphics').value=playerSettings.graphics;
}
function updatePlayerSettingFromUI(id,key){const el=$(id);if(!el)return;playerSettings={...playerSettings,[key]:Number(el.value)};savePlayerSettings();syncPlayerSettingsUI();if((key==='masterVolume'||key==='musicVolume')&&!shell.inMatch&&introMusicHandle){stopIntroMusic();if(!masterMuted)startIntroMusic();}}
function openPlayerSettings(){syncPlayerSettingsUI();shell.openPanel(SHELL_PANEL.SETTINGS);}
function closePlayerSettings(){shell.closePanel(SHELL_PANEL.SETTINGS);}
function resetPlayerSettings(){playerSettings={...DEFAULT_PLAYER_SETTINGS};savePlayerSettings();syncPlayerSettingsUI();applyGraphicsQuality();}


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

  addTerrain();

  const wallMat = new THREE.MeshStandardMaterial({color:0xd8d4cc,roughness:.9});
  addBoundaryWallsBatch(wallMat);

  const blockMat = new THREE.MeshStandardMaterial({color:0xb8c0c5,roughness:.85});
  const pyramidMat = new THREE.MeshStandardMaterial({color:0xc8a86b,roughness:.92});
  addStaticBoxesBatch(blockMat);
  addPyramidsBatch(pyramidMat);

  // Natural cover and sight-line breakers. Collision remains fully independent
  // from rendering, so static visuals can be instanced without changing gameplay.
  const trunkMat=new THREE.MeshStandardMaterial({color:0x60452f,roughness:1});
  const leafMat=new THREE.MeshStandardMaterial({color:0x315f37,roughness:1});
  const bushMat=new THREE.MeshStandardMaterial({color:0x3f7441,roughness:1});
  const rockMat=new THREE.MeshStandardMaterial({color:0x6b706f,roughness:.96});
  addNaturalObstaclesBatch(trunkMat,leafMat,bushMat,rockMat);
  addBuildingsBatch();

  const markerMat = new THREE.MeshStandardMaterial({color:0x49606f,roughness:.75});
  addMarkersBatch(markerMat);


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

  shotgunGroup = new THREE.Group();
  const sgMat=new THREE.MeshStandardMaterial({color:0x2b3135,roughness:.48,metalness:.30});
  const sgWood=new THREE.MeshStandardMaterial({color:0x5a4636,roughness:.82});
  const sgBody=new THREE.Mesh(new THREE.BoxGeometry(.19,.18,.82),sgMat);sgBody.position.set(0,.01,-.20);
  const sgBarrel=new THREE.Mesh(new THREE.CylinderGeometry(.04,.04,.78,10),sgMat);sgBarrel.rotation.x=Math.PI/2;sgBarrel.position.set(0,.04,-.90);
  const sgStock=new THREE.Mesh(new THREE.BoxGeometry(.18,.22,.38),sgWood);sgStock.position.set(0,-.05,.36);sgStock.rotation.x=-.10;
  shotgunPump=new THREE.Mesh(new THREE.BoxGeometry(.20,.16,.28),sgWood);shotgunPump.position.set(0,-.08,-.48);
  shotgunFlash=new THREE.Mesh(new THREE.SphereGeometry(.09,8,6),new THREE.MeshBasicMaterial({color:0xffd181,transparent:true,opacity:0}));shotgunFlash.position.set(0,.04,-1.30);
  shotgunGroup.add(sgBody,sgBarrel,sgStock,shotgunPump,shotgunFlash);shotgunGroup.position.set(.30,-.28,-.50);shotgunGroup.rotation.set(-.06,-.05,0);shotgunGroup.visible=false;

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
  camera.add(pistolGroup,assaultGroup,shotgunGroup,sniperGroup);
  mantleHands=new THREE.Group();
  const mantleGloveMat=new THREE.MeshStandardMaterial({color:0x171c20,roughness:.92});
  const mantleSleeveMat=new THREE.MeshStandardMaterial({color:0x344047,roughness:.96});
  for(const side of [-1,1]){
    const limb=new THREE.Group();
    const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.042,.30,4,8),mantleSleeveMat);
    arm.rotation.x=Math.PI/2;arm.position.set(0,-.06,.11);
    const hand=new THREE.Mesh(new THREE.SphereGeometry(.052,10,7),mantleGloveMat);
    hand.scale.set(1.15,.70,1.30);hand.position.set(0,.075,-.13);
    limb.position.set(side*.18,-.38,-.64);limb.rotation.z=side*.08;limb.userData.side=side;limb.userData.arm=arm;limb.userData.hand=hand;
    limb.add(arm,hand);mantleHands.add(limb);
  }
  mantleHands.visible=false;camera.add(mantleHands);scene.add(camera);

  animate();
}


function addTerrain(){
  const size=TERRAIN_SIZE,segments=TERRAIN_SEGMENTS;
  const geo=new THREE.PlaneGeometry(size,size,segments,segments),pos=geo.attributes.position;
  const colors=[];
  const low=new THREE.Color(0x587552),mid=new THREE.Color(0x78915f),high=new THREE.Color(0x807a65),peak=new THREE.Color(0x9a9586);
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
  const ground=new THREE.Mesh(geo,mat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=!isTouch;scene.add(ground);
}
function makeTerrainTexture(){
  const size=256,c=document.createElement('canvas');c.width=c.height=size;const x=c.getContext('2d');
  const image=x.createImageData(size,size);let seed=0x51f15e;
  const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    const i=(py*size+px)*4,n=rand(),wave=Math.sin(px*.19+Math.sin(py*.07))*5+Math.cos(py*.15)*4;
    const v=Math.max(168,Math.min(238,211+(n-.5)*30+wave));
    image.data[i]=Math.round(v*.96);image.data[i+1]=Math.round(v);image.data[i+2]=Math.round(v*.88);image.data[i+3]=255;
  }
  x.putImageData(image,0,0);
  x.globalAlpha=.22;x.strokeStyle='#758064';x.lineWidth=1;
  for(let i=0;i<34;i++){const y=(i*37)%size;x.beginPath();x.moveTo(0,y);x.bezierCurveTo(70,y+10,150,y-12,size,y+4);x.stroke();}
  x.globalAlpha=.16;x.fillStyle='#5d674d';for(let i=0;i<520;i++){const px=rand()*size,py=rand()*size,r=.4+rand()*1.5;x.beginPath();x.arc(px,py,r,0,Math.PI*2);x.fill();}
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(28,28);tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy?.()||1);return tex;
}
function addStaticInstancedMesh(geometry,material,transforms,{castShadow=true,receiveShadow=true}={}){
  if(!transforms.length)return null;
  const mesh=new THREE.InstancedMesh(geometry,material,transforms.length),dummy=new THREE.Object3D();
  for(let i=0;i<transforms.length;i++){
    const t=transforms[i];dummy.position.set(t.x||0,t.y||0,t.z||0);dummy.rotation.set(t.rx||0,t.ry||0,t.rz||0);dummy.scale.set(t.sx??1,t.sy??1,t.sz??1);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  }
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=castShadow&&!isTouch;mesh.receiveShadow=receiveShadow&&!isTouch;mesh.computeBoundingBox?.();mesh.computeBoundingSphere?.();scene.add(mesh);return mesh;
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
function addStaticBoxesBatch(mat){
  const transforms=STATIC_BOXES.map(o=>({x:o.x,y:terrainHeight(o.x,o.z)+o.h/2,z:o.z,sx:o.w,sy:o.h,sz:o.d}));
  addStaticInstancedMesh(new THREE.BoxGeometry(1,1,1),mat,transforms);
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
    const materials={
      wall:new THREE.MeshStandardMaterial({color:b.tall?0x929aa0:0xa8adb0,roughness:.9}),
      trim:new THREE.MeshStandardMaterial({color:b.tall?0x39444d:0x4f5961,roughness:.75}),
      floor:new THREE.MeshStandardMaterial({color:0x6d7478,roughness:.95}),
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

  $('createBtn').addEventListener('click',createMatch);
  $('refreshBtn').addEventListener('click',refreshMatches);
  $('enterFullscreenBtn').addEventListener('click',()=>{ensureAudio();void shell.enterFullscreenFromGesture();});
  $('exitAppBtn').addEventListener('click',()=>{void shell.exitFullscreenFromGesture();});
  $('musicBtn').addEventListener('click',()=>{ensureAudio();toggleMasterMute();});
  $('lobbyMusicBtn').addEventListener('click',()=>{ensureAudio();toggleMasterMute();});
  $('settingsBtn').addEventListener('click',openPlayerSettings);
  $('lobbySettingsBtn').addEventListener('click',openPlayerSettings);
  $('lobbyExitFullscreenBtn').addEventListener('click',()=>{void shell.exitFullscreenFromGesture();});
  $('pauseSettingsBtn').addEventListener('click',openPlayerSettings);
  $('settingsCloseBtn').addEventListener('click',closePlayerSettings);
  $('settingsDoneBtn').addEventListener('click',closePlayerSettings);
  $('settingsDefaultsBtn').addEventListener('click',resetPlayerSettings);
  for(const [id,key] of [['playerLookSensitivity','lookSensitivity'],['playerAdsSensitivity','adsSensitivity'],['playerTouchSensitivity','touchSensitivity'],['playerMasterVolume','masterVolume'],['playerSfxVolume','sfxVolume'],['playerMusicVolume','musicVolume']])$(id).addEventListener('input',()=>updatePlayerSettingFromUI(id,key));
  $('playerGraphics').addEventListener('change',()=>{playerSettings={...playerSettings,graphics:$('playerGraphics').value};savePlayerSettings();applyGraphicsQuality();});
  $('joinBtn').addEventListener('click', () => joinMatch(normalizeCode(codeInput.value)));
  codeInput.addEventListener('blur', () => { codeInput.value = normalizeCode(codeInput.value); });
  codeInput.addEventListener('keydown', e => { if(e.key==='Enter'){ e.preventDefault(); joinMatch(normalizeCode(codeInput.value)); } });
  $('resumeBtn').addEventListener('click', resumeFromGesture);
  $('copyBtn').addEventListener('click', copyInvite);
  $('teamSwitchBtn').addEventListener('click',()=>requestTeamChange(pendingTeam?myTeam:(myTeam==='blue'?'red':'blue')));
  $('adminBtn').addEventListener('click',()=>openAdminPanel('match'));
  $('adminCloseBtn').addEventListener('click',closeAdminPanel);
  $('adminSaveBtn').addEventListener('click',saveAdminSettings);
  $('adminResetBtn').addEventListener('click',resetActiveAdminTab);
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
  $('setBotDifficulty').addEventListener('change',()=>{$('botDifficultyHelp').textContent=botDifficultyDescription($('setBotDifficulty').value);});
  $('fullBtn').addEventListener('click',()=>{void shell.exitFullscreenFromGesture();});
  $('leaveBtn').addEventListener('click',leaveMatch);
  $('lobbyLeaveBtn').addEventListener('click',leaveMatch);
  $('lobbyCopyBtn').addEventListener('click',copyInvite);
  for(const btn of lobbyTeamButtons)btn.addEventListener('click',()=>{if(socket?.readyState===WebSocket.OPEN)send({t:'team',team:btn.dataset.lobbyTeamChoice});});
  for(const btn of lobbyPrimaryButtons)btn.addEventListener('click',()=>{const primary=PRIMARY_WEAPONS.includes(btn.dataset.lobbyPrimaryChoice)?btn.dataset.lobbyPrimaryChoice:'assault';if(socket?.readyState===WebSocket.OPEN)send({t:'loadout',primaryWeapon:primary});});
  for(const btn of lobbyModeButtons)btn.addEventListener('click',()=>{if(isMatchAdmin&&socket?.readyState===WebSocket.OPEN&&matchState.status==='waiting')send({t:'lobbyMode',mode:btn.dataset.lobbyModeChoice});});
  $('lobbyGodBtn').addEventListener('click',()=>{if(isMatchAdmin&&socket?.readyState===WebSocket.OPEN)send({t:'god',enabled:!godMode});});
  for(const el of [lobbyBlueBotCount,lobbyRedBotCount,lobbyFfaBotCount,lobbyBotDifficulty])el.addEventListener('change',sendLobbyBotConfig);
  $('lobbyMatchSettingsBtn').addEventListener('click',()=>openAdminPanel('match'));
  $('lobbyManagePlayersBtn').addEventListener('click',()=>openAdminPanel('players'));
  $('lobbyStartBtn').addEventListener('click',async()=>{
    if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN||matchState.status!=='waiting')return;
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
    if(!shell.canPlay || hp<=0) return;
    const sens=aimSensitivityScale()*playerSettings.lookSensitivity;yaw -= e.movementX*.0023*sens; pitch -= e.movementY*.0020*sens; pitch = THREE.MathUtils.clamp(pitch,-1.28,1.28);
  });
  document.addEventListener('keydown', e => {
    if(isEditableTarget(e.target)) return;
    if(e.code==='Escape'&&!e.repeat&&shell.panel){
      e.preventDefault();
      if(shell.panel===SHELL_PANEL.SETTINGS){closePlayerSettings();return;}
      if(shell.panel===SHELL_PANEL.ADMIN){closeAdminPanel();return;}
    }
    if(!shell.inMatch)return;
    if((e.code==='KeyM'||e.code==='Escape')&&!e.repeat){
      e.preventDefault();
      if(scoreboardOpen){scoreboardOpen=false;return;}
      if(!shell.paused)openPause();
      return;
    }
    if(!shell.canPlay)return;
    if(['KeyW','KeyA','KeyS','KeyD','Space','KeyC','KeyR','KeyQ','KeyB','KeyF','KeyG','Digit1','Digit2','Tab'].includes(e.code)) e.preventDefault();
    keys.add(e.code);
    if(e.code==='Space' && !e.repeat) tryJump();
    if(e.code==='KeyC' && !e.repeat) toggleCrouch();
    if(e.code==='KeyR' && !e.repeat) doReload();
    if(e.code==='Digit1' && !e.repeat) switchWeapon(primaryWeapon);
    if(e.code==='Digit2' && !e.repeat) switchWeapon('pistol');
    if(e.code==='KeyF' && !e.repeat) beginEquipmentAim('flash');
    if(e.code==='KeyG' && !e.repeat) beginEquipmentAim('sticky');
    if(e.code==='KeyQ' && !e.repeat) switchWeapon(currentWeapon==='pistol'?primaryWeapon:'pistol');
    if(e.code==='KeyB' && !e.repeat) toggleFireMode();
    if(e.code==='Tab'&&!e.repeat){scoreboardOpen=true;scoreboardScroll=0;clearFireInput();cancelEquipmentAim();}
  });
  document.addEventListener('keyup', e => {
    if(isEditableTarget(e.target))return;
    keys.delete(e.code);
    if(e.code==='Tab')scoreboardOpen=false;
    if(e.code==='KeyF'&&equipmentAim.kind==='flash'){releaseEquipmentAim();}
    if(e.code==='KeyG'&&equipmentAim.kind==='sticky'){releaseEquipmentAim();}
  });
  document.addEventListener('mouseup',e=>{if(e.button===0)mouseFireDown=false;});
  document.addEventListener('selectstart',e=>{if(!isEditableTarget(e.target))e.preventDefault();});
  document.addEventListener('dragstart',e=>e.preventDefault());
  canvas.addEventListener('wheel',onScoreboardWheel,{passive:false});
}

function isEditableTarget(target){
  return !!target && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable);
}
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
  ensureAudio();
  if(!isTouch&&document.pointerLockElement!==canvas){void shell.capturePointerFromGesture();return;}
  const p=canvasPoint(e);
  if(isTouch || e.pointerType==='touch' || e.pointerType==='pen'){
    e.preventDefault();
    try{canvas.setPointerCapture(e.pointerId)}catch{}
    const layout=hudLayout||computeHudLayout();
    if(scoreboardOpen){
      const panel=scoreboardPanel;
      if(panel?.close&&pointInRect(p.x,p.y,panel.close)){scoreboardOpen=false;scoreboardDrag=null;touchRoles.set(e.pointerId,'scoreboard-close');return;}
      if(panel&&pointInRect(p.x,p.y,panel)&&!touchRoleActive('scoreboard-scroll')){scoreboardDrag={startY:p.y,startScroll:scoreboardScroll};touchRoles.set(e.pointerId,'scoreboard-scroll');return;}
      return;
    }
    if(!sniperScopeActive()&&pointInRect(p.x,p.y,layout.team)){touchRoles.set(e.pointerId,'scoreboard');toggleScoreboard();return;}
    if(pointInRect(p.x,p.y,layout.menu)){
      touchRoles.set(e.pointerId,'menu');
      openPause();
      return;
    }
    if(pointInCircle(p.x,p.y,layout.aim)){touchRoles.set(e.pointerId,'aimtoggle');toggleAim();return;}
    if(pointInCircle(p.x,p.y,layout.leftFire)){
      touchVisual.fireUntil=performance.now()+150;pressTouchFire(e.pointerId);return;
    }
    if(pointInCircle(p.x,p.y,layout.crouch)){touchRoles.set(e.pointerId,'crouch');toggleCrouch();return;}
    if(pointInCircle(p.x,p.y,layout.flash)){touchVisual.flashUntil=performance.now()+160;if(beginEquipmentAim('flash'))touchRoles.set(e.pointerId,'equipment');return;}
    if(pointInCircle(p.x,p.y,layout.sticky)){touchVisual.stickyUntil=performance.now()+160;if(beginEquipmentAim('sticky'))touchRoles.set(e.pointerId,'equipment');return;}
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
  if(!isTouch&&e.button===0)mouseFireDown=false;
}

function resetTouchInput(){
  touchRoles.clear();mouseFireDown=false;joy.x=joy.y=0;joy.centerX=joy.centerY=0;scoreboardDrag=null;cancelEquipmentAim();setAim(false);
}

function updateJoy(x,y,center){
  let dx=x-center.x,dy=y-center.y;const max=center.r*.46;const len=Math.hypot(dx,dy)||1;
  if(len>max){dx=dx/len*max;dy=dy/len*max;}
  joy.x=dx/max;joy.y=dy/max;
}

function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(viewW/r.width),y:(e.clientY-r.top)*(viewH/r.height)};}
function pointInCircle(x,y,c){return Math.hypot(x-c.x,y-c.y)<=c.r;}
function pointNearCircle(x,y,c,padding=0){return Math.hypot(x-c.x,y-c.y)<=c.r+padding;}
function joystickSpawnAllowed(p,layout){return p.x<=layout.moveBoundary&&![layout.leftFire,layout.crouch,layout.flash,layout.sticky].some(c=>pointNearCircle(p.x,p.y,c,TOUCH_JOY_BUTTON_PADDING));}
function pointInRect(x,y,r){return !!r&&x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h;}
function onScoreboardWheel(e){if(!scoreboardOpen||!scoreboardPanel)return;e.preventDefault();scoreboardScroll=Math.max(0,Math.min(scoreboardPanel.maxScroll,scoreboardScroll+e.deltaY));}

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
    const botMeta=document.createElement('div');botMeta.className='match-meta';const roomMode=normalizeGameMode(room.mode),roomSpec=gameModeSpec(roomMode),scoreText=roomSpec.scoreType==='team'?`${Number(room.blueScore)||0}-${Number(room.redScore)||0} / ${Number(room.scoreLimit)||roomSpec.scoreLimit}`:roomSpec.scoreType==='player'?`First ${Number(room.scoreLimit)||roomSpec.scoreLimit}`:'Open play';botMeta.textContent=`${room.custom?'CUSTOM · ':''}${roomSpec.short} · ${String(room.matchStatus||'waiting').toUpperCase()} · ${scoreText} · Bots ${blueBots+redBots}`;if(room.custom)codeEl.classList.add('custom-match');
    const teamCounts=document.createElement('div');teamCounts.className='team-counts';
    if(roomSpec.teamBased){const blueChip=document.createElement('span');blueChip.className='team-chip blue';blueChip.textContent=`BLUE ${blue}`;const redChip=document.createElement('span');redChip.className='team-chip red';redChip.textContent=`RED ${red}`;teamCounts.append(blueChip,redChip);}else{const ffaChip=document.createElement('span');ffaChip.className='team-chip ffa';ffaChip.textContent=`COMBATANTS ${blue+red}`;teamCounts.append(ffaChip);}
    left.append(codeEl,botMeta,teamCounts);
    const meta=document.createElement('div');meta.className='match-meta';meta.textContent=`${Number(room.players)||0}/${Number(room.maxPlayers)||0}`;
    const btn=document.createElement('button');btn.className='btn icon-btn';btn.title=`Join ${room.code}`;btn.setAttribute('aria-label',`Join ${room.code}`);btn.innerHTML='<svg class="ui-icon"><use href="#i-enter"/></svg>';btn.addEventListener('click',()=>joinMatch(room.code));
    row.append(left,meta,btn);matchList.append(row);
  }
  
}

async function createMatch(){
  shell.beginConnection('Creating lobby…');
  myName=safeName();myTeam=preferredTeam;godMode=false;primaryWeapon=preferredPrimary;pendingTeam='';
  localStorage.setItem('breachName',myName);disableMenu(true);setStatus('Creating lobby…');
  try{
    const response=await fetch(`${ONLINE_API}/rooms`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:PROTOCOL_VERSION,client:clientId,auth:clientAuth}),cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not create lobby.');connectMatch(data.code);
  }catch(err){shell.cancelConnection();setStatus(err.message||'Could not create lobby.','error');disableMenu(false);}
}
async function joinMatch(code){
  if(code.length!==ROOM_CODE_LENGTH){setStatus('Enter a 4-character room code.','error');return;}
  shell.beginConnection(`Joining ${code}…`);myName=safeName();myTeam=preferredTeam;godMode=false;primaryWeapon=preferredPrimary;pendingTeam='';
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
    const ticketResponse=await fetch(`${ONLINE_API}/rooms/${currentRoom}/ticket`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({protocol:PROTOCOL_VERSION,client:clientId,auth:clientAuth,name:myName||safeName(),team:myTeam,primaryWeapon}),cache:'no-store'});
    const ticketData=await ticketResponse.json();if(!ticketResponse.ok)throw new Error(ticketData.error||'Could not authorize match connection.');ticket=String(ticketData.ticket||'');if(!ticket)throw new Error('Server did not issue a join ticket.');
  }catch(err){if(!shell.inMatch&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus(err.message||'Could not join match.','error');}else scheduleReconnect();return;}
  const url=`${apiToWs(ONLINE_API)}/rooms/${currentRoom}/socket?protocol=${PROTOCOL_VERSION}&ticket=${encodeURIComponent(ticket)}`;
  let ws;try{ws=new WebSocket(url);socket=ws;}catch{if(!shell.inMatch&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus('Could not open multiplayer connection.','error');}else scheduleReconnect();return;}
  ws.addEventListener('open',()=>{if(ws!==socket)return;reconnectAttempt=0;if(reconnecting)showToast('Reconnected');});
  ws.addEventListener('message',e=>{if(ws!==socket)return;try{handleMessage(JSON.parse(e.data))}catch{}});
  ws.addEventListener('close',e=>{
    if(ws!==socket)return;
    if(!roomSessionActive()&&!reconnecting){shell.cancelConnection();disableMenu(false);setStatus(e.reason||'Could not join match.','error');return;}
    if(roomSessionActive()&&e.code!==1000){showToast('Connection lost · reconnecting');scheduleReconnect();}
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
function matchClockText(){const m=matchState,now=serverNow(),spec=gameModeSpec(m.mode);if(m.status==='warmup')return `START ${(Math.max(0,m.warmupEndsAt-now)/1000).toFixed(1)}`;if(m.status==='active'){if(spec.scoreType==='none')return 'SANDBOX';const sec=Math.max(0,Math.ceil((m.endsAt-now)/1000)),min=Math.floor(sec/60);return `${min}:${String(sec%60).padStart(2,'0')}`;}if(m.status==='ended'){if(m.winner==='draw')return 'DRAW';if(m.winnerName)return `${String(m.winnerName).toUpperCase()} WINS`;return `${String(m.winner||'').toUpperCase()} WINS`;}return 'LOBBY';}

function handleMessage(m){
  if(m.t==='welcome'){
    if(Number(m.protocol)!==PROTOCOL_VERSION){showToast('CLIENT / SERVER VERSION MISMATCH');leaveMatch();return;}
    if(Number.isFinite(Number(m.serverTime)))serverClockOffset=Number(m.serverTime)-Date.now();
    currentRoom=m.code;isMatchAdmin=!!m.isAdmin;matchOwnerId=String(m.ownerClientId||'');applyWorldSettings(m.settings||DEFAULT_WORLD_SETTINGS);botConfig=normalizeBotConfig(m.botConfig);matchState=normalizeClientMatch(m.match);matchCustom=!!m.custom;myTeam=m.self.team||myTeam;rememberTeam(myTeam);selfColor=TEAM_COLORS[myTeam]||m.self.color||selfColor;godMode=!!m.self.godMode;verticalVelocity=Number.isFinite(Number(m.self.verticalVelocity))?Number(m.self.verticalVelocity):0;moveVelocityX=moveVelocityZ=0;onGround=m.self.grounded!==false;lastGroundedAt=onGround?performance.now():0;jumpBufferedUntil=0;crouched=!!m.self.crouched;crouchWanted=crouched;crouchBlend=crouched?1:0;jumpSeq=Math.max(0,Math.floor(Number(m.self.jumpSeq)||0));traversal=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;hp=m.self.hp??100;myStats={kills:Number(m.self.kills)||0,deaths:Number(m.self.deaths)||0};wastedUntil=m.self.wastedUntil||0;primaryWeapon=PRIMARY_WEAPONS.includes(m.self.primaryWeapon)?m.self.primaryWeapon:primaryWeapon;rememberPrimary(primaryWeapon);pendingTeam=m.self.pendingTeam||'';currentWeapon=(m.self.weapon==='pistol'||m.self.weapon===primaryWeapon)?m.self.weapon:primaryWeapon;ammo=normalizeClientAmmo(m.self.ammo);equipment=normalizeEquipment(m.self.equipment);pendingWeapon='';reloadRequestPending=false;reloadUntil=m.self.reloadAt||0;reloadWeapon=m.self.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;warmWeaponAudio(currentWeapon);syncLocalWeaponModel();
    yaw=m.self.yaw||0;pitch=m.self.pitch||0;viewRecoilPitch=viewRecoilYaw=0;pendingGameSnapshot=gameSnapshot(m.self,m.players||[],m.bots||[]);replaceLobbyParticipants(m.players||[],m.bots||[]);
    syncModeVisuals();syncLocalStatus();syncPauseContext();if(matchState.status==='waiting')showLobby();else{void enterGame(pendingGameSnapshot);}return;
  }
  if(m.t==='join'){upsertLobbyParticipant(m.player);if(shell.inMatch&&engineReady)upsertRemote(m.player,true);syncPauseContext();renderAdminPlayers();syncLobby();showToast(`${m.player.name} joined`);return;}
  if(m.t==='leave'){const lobbyRow=lobbyParticipants.get(String(m.id||'')),r=remotes.get(m.id);if((lobbyRow&&!lobbyRow.bot)||(r&&!r.bot))showToast(`${lobbyRow?.name||r?.name||'Player'} left`);removeLobbyParticipant(m.id);if(engineReady)removeRemote(m.id);syncPauseContext();renderAdminPlayers();syncLobby();return;}
  if(m.t==='lobbyPlayer'){
    const p=m.player;if(!p?.id)return;
    if(p.id===clientId){myTeam=p.team||myTeam;rememberTeam(myTeam);primaryWeapon=PRIMARY_WEAPONS.includes(p.primaryWeapon)?p.primaryWeapon:primaryWeapon;rememberPrimary(primaryWeapon);currentWeapon=primaryWeapon;godMode=!!p.godMode;ammo=normalizeClientAmmo(p.ammo);equipment=normalizeEquipment(p.equipment);selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;syncLocalWeaponModel();}else{upsertLobbyParticipant(p);if(shell.inMatch&&engineReady)upsertRemote(p,true);}
    syncPauseContext();syncLobby();return;
  }
  if(m.t==='state'){const r=remotes.get(m.id);if(r)updateRemoteTarget(r,m);return;}
  if(m.t==='traverse'){handleTraversalMessage(m);return;}
  if(m.t==='correction'){applyServerCorrection(m);return;}
  if(m.t==='botState'){for(const b of m.bots||[])upsertRemote(b,false);return;}
  if(m.t==='shot'){handleShot(m);return;}
  if(m.t==='bulletEnd'){removeBullet(m.id);return;}
  if(m.t==='equipment'){equipment=normalizeEquipment(m.equipment);return;}
  if(m.t==='throwable'){spawnThrowableVisual(m);return;}
  if(m.t==='throwableState'){updateThrowableVisual(m);return;}
  if(m.t==='throwableImpact'){handleThrowableImpact(m);return;}
  if(m.t==='throwAck'){if(m.accepted===false)removeThrowableVisual(m.id);return;}
  if(m.t==='throwableEnd'){removeThrowableVisual(m.id);return;}
  if(m.t==='flashDetonate'){soundTacticalDetonation('flash',m);spawnDetonationFx('flash',m);removeThrowableVisual(m.id);return;}
  if(m.t==='flashEffect'){applyFlashEffect(m);return;}
  if(m.t==='explosion'){soundTacticalDetonation(m.kind||'sticky',m);spawnDetonationFx(m.kind||'sticky',m);removeThrowableVisual(m.id);return;}
  if(m.t==='loadout'){applyAuthoritativeLoadout(m);syncLobby();return;}
  if(m.t==='weapon'){const r=remotes.get(m.id);if(r){r.weapon=m.weapon||'pistol';r.swapStartedAt=performance.now();syncRemoteWeapon(r);}return;}
  if(m.t==='reload'){const r=remotes.get(m.id);if(r){r.reloadUntil=Number(m.reloadAt)||0;r.reloadStartedAt=serverNow();r.reloadWeapon=m.weapon||r.weapon;if(r.reloadWeapon!=='shotgun'&&r.reloadUntil)playSpatialCue(reloadSoundId(r.reloadWeapon),r.group.position.x,r.group.position.y+1,r.group.position.z,34,.72);}return;}
  if(m.t==='reloadShell'){const r=remotes.get(m.id);if(r){r.reloadUntil=Number(m.reloadAt)||0;r.reloadStartedAt=r.reloadUntil?serverNow():0;r.reloadWeapon=r.reloadUntil?'shotgun':'';playSpatialCue('reloadShotgun',r.group.position.x,r.group.position.y+1,r.group.position.z,34,.72);}return;}
  if(m.t==='god'){if(typeof m.custom==='boolean')matchCustom=m.custom;if(m.id===clientId){godMode=!!m.enabled;syncLobby();showToast(godMode?'GOD MODE ENABLED':'GOD MODE DISABLED');}else{const row=lobbyParticipants.get(String(m.id||''));if(row)row.godMode=!!m.enabled;const r=remotes.get(m.id);if(r){r.godMode=!!m.enabled;if(r.godRing)r.godRing.visible=r.godMode;}}renderAdminPlayers();syncLobby();return;}
  if(m.t==='adminRole'){if(m.id===clientId){isMatchAdmin=!!m.enabled;syncPauseContext();if(!isMatchAdmin&&shell.panel===SHELL_PANEL.ADMIN)closeAdminPanel();showToast(isMatchAdmin?'ADMIN PRIVILEGES GRANTED':'ADMIN PRIVILEGES REMOVED');}else{const row=lobbyParticipants.get(String(m.id||''));if(row)row.admin=!!m.enabled;const r=remotes.get(m.id);if(r)r.admin=!!m.enabled;}renderAdminPlayers();syncLobby();return;}
  if(m.t==='teamQueued'){if(m.id===clientId){pendingTeam=m.pendingTeam||'';syncPauseContext();showToast(pendingTeam?`TEAM SWITCH QUEUED · ${pendingTeam.toUpperCase()}`:'TEAM SWITCH CANCELED');syncLobby();}return;}
  if(m.t==='match'){matchState=normalizeClientMatch(m.match);matchCustom=!!m.custom;if(shell.panel===SHELL_PANEL.ADMIN&&m.rulesUpdated){if(m.by===clientId||activeAdminTab!=='match')populateAdminMatch(matchState);if(m.by===clientId&&activeAdminTab==='match')setAdminStatus('Score / time applied.','ok');}if(matchState.status==='waiting'){syncLobby();syncModeVisuals();}return;}
  if(m.t==='matchReset'){matchState=normalizeClientMatch(m.match);matchCustom=!!m.custom;myStats={kills:0,deaths:0};const players=m.players||[],bots=m.bots||[],self=players.find(pl=>pl?.id===clientId)||null;if(self){myTeam=self.team||myTeam;pendingTeam='';primaryWeapon=PRIMARY_WEAPONS.includes(self.primaryWeapon)?self.primaryWeapon:primaryWeapon;}pendingGameSnapshot=gameSnapshot(self,players,bots);replaceLobbyParticipants(players,bots);syncModeVisuals();if(shell.inLobby||!engineReady){void enterGame(pendingGameSnapshot,{resetRound:true});}else applyGameSnapshot(pendingGameSnapshot,{resetRound:true});showToast(`ROUND ${matchState.round}`);return;}
  if(m.t==='blocked'){handleBlocked(m);return;}
  if(m.t==='kill'){handleKill(m);return;}
  if(m.t==='settings'){applyWorldSettings(m.settings||DEFAULT_WORLD_SETTINGS);if(typeof m.custom==='boolean')matchCustom=m.custom;const section=m.section==='advanced'?'advanced':'gameplay';if(shell.panel===SHELL_PANEL.ADMIN){if(m.by===clientId){if(section==='advanced')populateAdminWeapons(worldSettings);else populateAdminGameplay(worldSettings);setAdminStatus(section==='advanced'?'Weapons applied.':'Gameplay applied.','ok');}else if(activeAdminTab!==section){if(section==='advanced')populateAdminWeapons(worldSettings);else populateAdminGameplay(worldSettings);}}syncLobby();showToast(section==='advanced'?'WEAPON RULES UPDATED':'GAMEPLAY RULES UPDATED');return;}
  if(m.t==='bots'){botConfig=normalizeBotConfig(m.config);syncLobbyBots(m.bots||[]);if(shell.inMatch&&engineReady)syncBotRoster(m.bots||[]);syncLobby();if(shell.panel===SHELL_PANEL.ADMIN){populateAdminBots(botConfig);if(activeAdminTab==='bots')setAdminStatus('Bot settings applied.','ok');}showToast(`BOTS · ${botConfig.difficulty.toUpperCase()}`);return;}
  if(m.t==='notice'){showToast(m.text||'Server notice');if(shell.panel===SHELL_PANEL.ADMIN)setAdminStatus(m.text||'Server notice',m.tone==='error'?'error':'');return;}
  if(m.t==='pong'){const echoed=Number(m.clientAt)||lastPingLocalAt;if(echoed&&Number.isFinite(Number(m.at))){const received=Date.now(),mid=echoed+(received-echoed)/2,estimate=Number(m.at)-mid;serverClockOffset=serverClockOffset*.7+estimate*.3;}return;}
  if(m.t==='health'){if(m.id===clientId){hp=Math.max(0,Math.min(100,Number(m.hp)||0));syncLocalStatus();}else{const r=remotes.get(m.id);if(r)r.hp=Math.max(0,Math.min(100,Number(m.hp)||0));}return;}
  if(m.t==='hit'){handleHit(m);return;}
  if(m.t==='respawn'){handleRespawn(m.player);return;}
}

async function enterGame(snapshot=pendingGameSnapshot,{resetRound=false}={}){
  stopIntroMusic();shell.beginConnection('Loading game…');
  if(!(await prepareGameRuntime())){shell.cancelConnection();if(matchState.status==='waiting')shell.enterLobby();return;}
  if(snapshot)applyGameSnapshot(snapshot,{resetRound});
  await shell.enterMatch();syncPauseContext();disableMenu(false);setStatus('Ready.');
  const url=new URL(location.href);url.searchParams.set('room',currentRoom);history.replaceState(null,'',url);onResize();
}

function leaveMatch(){
  shell.leaveToMenu();disableMenu(false);serverClockOffset=0;lastPingLocalAt=0;clearTimeout(reconnectTimer);if(socket){try{socket.close(1000,'Left match')}catch{}}socket=null;currentRoom='';isMatchAdmin=false;matchOwnerId='';lobbyParticipants.clear();pendingGameSnapshot=null;applyWorldSettings(DEFAULT_WORLD_SETTINGS);
  resetTouchInput();clearRemotes();clearBullets();clearThrowables();clearTacticalFx();keys.clear();hp=100;wastedUntil=0;godMode=false;pendingTeam='';matchState=normalizeClientMatch(null);matchCustom=false;primaryWeapon=preferredPrimary;currentWeapon=primaryWeapon;crouchWanted=false;crouched=false;crouchBlend=0;viewFeetY=NaN;verticalVelocity=moveVelocityX=moveVelocityZ=0;lastGroundedAt=0;jumpBufferedUntil=0;viewRecoilPitch=viewRecoilYaw=0;traversal=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;ammo=freshClientAmmo();equipment=freshClientEquipment();reloadRequestPending=false;lastStateSent=0;lastSentState={x:NaN,y:NaN,z:NaN,yaw:NaN,pitch:NaN,ads:false,crouched:false,grounded:true,moveX:0,moveZ:0};pendingWeapon='';reloadUntil=0;reloadWeapon='';reloadStartedAt=0;weaponSwapStartedAt=0;deathAnimStartedAt=0;localMoveAmount=0;landingKick=0;nextFootstepAt=0;footstepSide=0;shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;fireReadyAt=freshClientFireReady();clearFireInput();localEquipmentCooldownUntil=0;lastSimHeartbeat=0;cancelEquipmentAim();killFeed.length=0;bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;lastShotVisualAt=0;myStats={kills:0,deaths:0};scoreboardOpen=false;killConfirmUntil=0;killConfirmHeadshot=false;killConfirmDistance=0;headshotUntil=0;announcerCurrent=null;announcerQueue.length=0;setAim(false);syncLocalWeaponModel();
  const url=new URL(location.href);url.searchParams.delete('room');history.replaceState(null,'',url);refreshMatches();
}

function normalizeBotConfig(value){const v=value&&typeof value==='object'?value:{};const blueBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(v.blueBots)||0))),redBots=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number(v.redBots)||0)));const diff=['easy','normal','hard','elite'].includes(String(v.difficulty||'normal').toLowerCase())?String(v.difficulty||'normal').toLowerCase():'normal';return{blueBots,redBots,difficulty:diff};}
function botDifficultyDescription(diff){return({easy:'Forgiving aim and slower reactions.',normal:'Faster pressure, tighter aim and active strafing.',hard:'Aggressive pursuit, fast strafing and accurate sustained fire.',elite:'Relentless pursuit, evasive strafing, long range and near-instant reactions.'})[diff]||'Faster pressure and tighter aim.';}
function populateAdminBots(value){const x=normalizeBotConfig(value),ffa=currentGameMode()==='ffa';$('adminBlueBotsWrap').classList.toggle('hide',ffa);$('adminRedBotsWrap').classList.toggle('hide',ffa);$('adminFfaBotsWrap').classList.toggle('hide',!ffa);$('setBlueBots').value=x.blueBots;$('setRedBots').value=x.redBots;$('setFfaBots').value=x.blueBots+x.redBots;$('setBotDifficulty').value=x.difficulty;$('botDifficultyHelp').textContent=botDifficultyDescription(x.difficulty);}
function collectAdminBots(){if(currentGameMode()==='ffa'){const total=Math.max(0,Math.min(MAX_BOTS,Math.floor(Number($('setFfaBots').value)||0)));return normalizeBotConfig({blueBots:Math.ceil(total/2),redBots:Math.floor(total/2),difficulty:$('setBotDifficulty').value});}return normalizeBotConfig({blueBots:$('setBlueBots').value,redBots:$('setRedBots').value,difficulty:$('setBotDifficulty').value});}
function syncBotRoster(list){const incoming=new Set((list||[]).map(b=>b.id));for(const [id,r] of remotes){if(r.bot&&!incoming.has(id))removeRemote(id);}for(const b of list||[])upsertRemote(b,true);syncPauseContext();}
function setAdminStatus(text,tone=''){const el=$('adminStatus');el.textContent=text;el.className=`admin-status ${tone}`;}
let activeAdminTab='match',adminPanelContext='settings';
function availableAdminTabs(){return [...document.querySelectorAll('[data-admin-tab]')].filter(tab=>!tab.classList.contains('hide'));}
function syncAdminContext(){
  const inLobby=!!shell.inLobby,playersOnly=inLobby&&adminPanelContext==='players';
  for(const tab of document.querySelectorAll('[data-admin-tab]')){
    const id=tab.dataset.adminTab;
    tab.classList.toggle('hide',inLobby&&(playersOnly?id!=='players':id==='bots'||id==='players'));
  }
  $('adminEyebrow').textContent=inLobby?(playersOnly?'LOBBY ROSTER':'LOBBY'):'CUSTOM MATCH';
  $('adminTitle').textContent=inLobby?(playersOnly?'Manage players':'Advanced match settings'):'Match control';
  $('adminDescription').textContent=inLobby?(playersOnly?'Manage player God Mode and admin access without mixing roster actions into match rules.':'Fine-tune score, movement, combat and weapons. Core mode/bot choices stay in the lobby.'):'Change live match rules and player administration.';
}
function switchAdminTab(tab){
  const tabs=availableAdminTabs(),requested=tabs.find(btn=>btn.dataset.adminTab===tab);
  activeAdminTab=requested?.dataset.adminTab||tabs[0]?.dataset.adminTab||'match';
  for(const page of document.querySelectorAll('[data-admin-page]'))page.classList.toggle('hide',page.dataset.adminPage!==activeAdminTab);
  for(const b of document.querySelectorAll('[data-admin-tab]')){const active=b.dataset.adminTab===activeAdminTab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
  const players=activeAdminTab==='players';$('adminResetBtn').classList.toggle('hide',players);$('adminSaveBtn').classList.toggle('hide',players);document.querySelector('.admin-shell').dataset.page=activeAdminTab;if(players)renderAdminPlayers(true);
}
function populateAdminMatch(value=matchState){const m=normalizeClientMatch(value),spec=gameModeSpec(m.mode),sandbox=spec.scoreType==='none';$('setScoreLimit').value=sandbox?'':m.scoreLimit;$('setTimeLimit').value=sandbox?'':Math.round(m.timeLimitMs/60000);$('setScoreLimit').disabled=sandbox;$('setTimeLimit').disabled=sandbox;const note=$('adminMatchNote');if(note)note.textContent=sandbox?'Sandbox has no score limit or time limit.':m.mode==='ffa'?`Free For All: first to ${m.scoreLimit} eliminations or highest score after ${Math.round(m.timeLimitMs/60000)} minutes.`:`Team Deathmatch: first team to ${m.scoreLimit} eliminations or highest score after ${Math.round(m.timeLimitMs/60000)} minutes.`;}
function collectAdminMatch(){const spec=currentModeSpec();if(spec.scoreType==='none')return{scoreLimit:0,timeLimitMs:0};return{scoreLimit:Math.max(5,Math.min(100,Math.round(Number($('setScoreLimit').value)||spec.scoreLimit))),timeLimitMs:Math.max(120000,Math.min(1800000,Math.round((Number($('setTimeLimit').value)||spec.timeLimitMs/60000)*60000)))}};
function populateAdminGameplay(value){const x=normalizeWorldSettings(value);$('setRunSpeed').value=x.movement.runSpeed;$('setWalkSpeed').value=x.movement.walkSpeed;$('setJumpHeight').value=x.movement.jumpHeight;$('setGravity').value=x.movement.gravity;$('setRegenDelay').value=(x.combat.regenDelayMs/1000).toFixed(1);$('setRegenRate').value=x.combat.regenPerSecond;$('setRespawnDelay').value=(x.combat.respawnMs/1000).toFixed(1);}
function populateAdminWeapons(value){const x=normalizeWorldSettings(value);for(const name of WEAPON_ORDER){const cap=name[0].toUpperCase()+name.slice(1),w=x.weapons[name];$(`set${cap}Damage`).value=w.damage;$(`set${cap}Speed`).value=w.speed;$(`set${cap}Reload`).value=(w.reloadMs/1000).toFixed(2);$(`set${cap}Cooldown`).value=Math.round(60000/w.cooldownMs);}}
function populateAdminSettings(value){populateAdminGameplay(value);populateAdminWeapons(value);}
function collectAdminGameplayPatch(){return{movement:{runSpeed:$('setRunSpeed').value,walkSpeed:$('setWalkSpeed').value,jumpHeight:$('setJumpHeight').value,gravity:$('setGravity').value},combat:{regenDelayMs:Number($('setRegenDelay').value)*1000,regenPerSecond:$('setRegenRate').value,respawnMs:Number($('setRespawnDelay').value)*1000}};}
function collectAdminWeaponsPatch(){return{weapons:Object.fromEntries(WEAPON_ORDER.map(name=>{const cap=name[0].toUpperCase()+name.slice(1);return[name,{damage:$(`set${cap}Damage`).value,speed:$(`set${cap}Speed`).value,reloadMs:Number($(`set${cap}Reload`).value)*1000,cooldownMs:60000/Math.max(24,Number($(`set${cap}Cooldown`).value)||60)}]}))};}
function adminPlayerSnapshot(){if(shell.inLobby)return lobbySnapshot().filter(r=>!r.bot).map(r=>({id:r.id,name:r.name,team:r.team,godMode:!!r.godMode,admin:!!r.admin,self:!!r.self}));return[{id:clientId,name:myName||'You',team:myTeam,godMode,admin:isMatchAdmin,self:true},...Array.from(remotes.values()).filter(r=>!r.bot).map(r=>({id:r.id,name:r.name,team:r.team,godMode:!!r.godMode,admin:!!r.admin,self:false}))];}
function renderAdminPlayers(force=false){
  const root=$('adminPlayerList');if(!root)return;if(!force&&(shell.panel!==SHELL_PANEL.ADMIN||activeAdminTab!=='players'))return;root.innerHTML='';
  for(const pl of adminPlayerSnapshot()){
    const row=document.createElement('div');row.className='admin-player-row';const owner=pl.id===matchOwnerId,self=!!pl.self;
    const godAction=shell.inLobby&&self?'':`<button class="btn admin-mini ${pl.godMode?'active':''}" data-admin-god="${pl.id}">${pl.godMode?'God Mode On':'God Mode Off'}</button>`;
    const roleAction=(owner||self)?`<button class="btn admin-mini ${pl.admin?'active':''}" disabled>${owner?'Owner':pl.admin?'Admin':'Player'}</button>`:`<button class="btn admin-mini ${pl.admin?'active':''}" data-admin-role="${pl.id}">${pl.admin?'Admin':'Make Admin'}</button>`;
    row.innerHTML=`<div class="admin-player-identity"><span class="admin-team-dot ${currentModeSpec().teamBased?pl.team:'ffa'}"></span><div><strong>${escapeHtml(pl.name)}${self?' (You)':''}</strong><small>${owner?'MATCH OWNER':pl.admin?'ADMIN':'PLAYER'} · ${currentModeSpec().teamBased?String(pl.team||'blue').toUpperCase():'FFA'}</small></div></div><div class="admin-player-actions">${godAction}${roleAction}</div>`;root.appendChild(row);
  }
  for(const btn of root.querySelectorAll('[data-admin-god]'))btn.addEventListener('click',()=>{const id=btn.dataset.adminGod,pl=adminPlayerSnapshot().find(x=>x.id===id);if(pl)send({t:'adminPlayer',targetId:id,action:'god',enabled:!pl.godMode});});
  for(const btn of root.querySelectorAll('[data-admin-role]'))btn.addEventListener('click',()=>{const id=btn.dataset.adminRole,pl=adminPlayerSnapshot().find(x=>x.id===id);if(pl&&!pl.self)send({t:'adminPlayer',targetId:id,action:'admin',enabled:!pl.admin});});
}
function requestTeamChange(team){if(!shell.inMatch||socket?.readyState!==WebSocket.OPEN)return;const next=team==='red'?'red':'blue';send({t:'team',team:next});showToast(next===myTeam?'CANCELING TEAM SWITCH':`SWITCH TO ${next.toUpperCase()} ON RESPAWN`);}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function applyRemoteTeamVisual(r,team){if(!r)return;const next=team==='red'?'red':'blue';r.team=next;r.color=remoteDisplayColor(next);if(r.body?.material?.color)r.body.material.color.set(remoteDisplayColor(next));if(r.tag){r.group.remove(r.tag);r.tag.material?.map?.dispose?.();r.tag.material?.dispose?.();r.tag=makeNameTag(r.bot?`[BOT] ${r.name}`:r.name,remoteDisplayColor(next));r.tag.position.set(0,2.18,0);r.group.add(r.tag);}}
function openAdminPanel(initialTab='match'){if(!isMatchAdmin){showToast('ADMIN ACCESS REQUIRED');return;}adminPanelContext=shell.inLobby&&initialTab==='players'?'players':'settings';syncAdminContext();populateAdminMatch(matchState);populateAdminSettings(worldSettings);populateAdminBots(botConfig);switchAdminTab(initialTab);setAdminStatus(adminPanelContext==='players'?'Player changes apply immediately.':matchCustom?'CUSTOM rules active.':'Standard match rules active.');shell.openPanel(SHELL_PANEL.ADMIN);renderAdminPlayers(true);}
function closeAdminPanel(){adminPanelContext='settings';shell.closePanel(SHELL_PANEL.ADMIN);}
function resetActiveAdminTab(){if(activeAdminTab==='match'){const spec=currentModeSpec();populateAdminMatch({...matchState,mode:spec.id,scoreLimit:spec.scoreLimit,timeLimitMs:spec.timeLimitMs});}else if(activeAdminTab==='gameplay')populateAdminGameplay({...worldSettings,movement:DEFAULT_WORLD_SETTINGS.movement,combat:DEFAULT_WORLD_SETTINGS.combat});else if(activeAdminTab==='advanced')populateAdminWeapons({...worldSettings,weapons:DEFAULT_WORLD_SETTINGS.weapons});else if(activeAdminTab==='bots')populateAdminBots({blueBots:0,redBots:0,difficulty:'normal'});}
function saveAdminSettings(){
  if(!isMatchAdmin||socket?.readyState!==WebSocket.OPEN){setAdminStatus('Admin connection unavailable.','error');return;}
  if(activeAdminTab==='match'){send({t:'adminMatch',rules:collectAdminMatch()});setAdminStatus('Applying score / time…');return;}
  if(activeAdminTab==='gameplay'){send({t:'adminSettings',section:'gameplay',patch:collectAdminGameplayPatch()});setAdminStatus('Applying gameplay…');return;}
  if(activeAdminTab==='advanced'){send({t:'adminSettings',section:'advanced',patch:collectAdminWeaponsPatch()});setAdminStatus('Applying weapons…');return;}
  if(activeAdminTab==='bots'){const bots=collectAdminBots();if(bots.blueBots+bots.redBots>MAX_BOTS){setAdminStatus(`Maximum ${MAX_BOTS} bots per match.`,'error');return;}send({t:'adminBots',...bots});setAdminStatus('Updating bots…');}
}

function openPause(){if(!shell.inMatch||shell.paused)return;shell.pause('user-pause');}
async function copyInvite(){
  const url=new URL(location.href);url.searchParams.set('room',currentRoom);try{await navigator.clipboard.writeText(url.toString());showToast('Invite copied');}catch{showToast(`Match code: ${currentRoom}`);}
}

function gameSnapshot(self,players=[],bots=[]){return {self:self||null,players:Array.isArray(players)?players:[],bots:Array.isArray(bots)?bots:[]};}
function applyGameSnapshot(snapshot,{resetRound=false}={}){
  if(!engineReady||!position||!snapshot)return false;
  if(resetRound){killFeed.length=0;clearBullets();clearThrowables();clearTacticalFx();}
  clearRemotes();
  const self=snapshot.self||snapshot.players.find(player=>player?.id===clientId)||null;
  if(self)handleRespawn(self);
  for(const player of snapshot.players){if(player?.id&&player.id!==clientId)upsertRemote(player,true);}
  for(const bot of snapshot.bots)upsertRemote(bot,true);
  syncPauseContext();return true;
}
function makeRemote(player){
  const group=new THREE.Group(),model=new THREE.Group();group.add(model);
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
  const shotgun=new THREE.Mesh(new THREE.BoxGeometry(.15,.12,.74),gunMat.clone());shotgun.position.set(.45,1.10,-.41);shotgun.visible=false;
  const sniper=new THREE.Mesh(new THREE.BoxGeometry(.12,.10,.82),gunMat.clone());sniper.position.set(.45,1.10,-.45);sniper.visible=false;
  const godRing=new THREE.Mesh(new THREE.TorusGeometry(.42,.035,6,28),new THREE.MeshBasicMaterial({color:0xffdd67,transparent:true,opacity:.9}));godRing.rotation.x=Math.PI/2;godRing.position.y=2.03;godRing.visible=!!player.godMode;
  model.add(body,head,armL,armR,legL,legR,pistol,assault,shotgun,sniper,godRing);group.position.set(player.x||0,player.y||0,player.z||0);scene.add(group);
  const tag=makeNameTag(player.bot?`[BOT] ${player.name||'Bot'}`:(player.name||'Player'),remoteDisplayColor(team));tag.position.set(0,2.18,0);group.add(tag);
  const now=performance.now();
  const remote={id:player.id,name:player.name||'Player',color:remoteDisplayColor(team),team,bot:!!player.bot,weapon:player.weapon||'pistol',primaryWeapon:PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:'assault',group,model,tag,target:new THREE.Vector3(player.x||0,player.y||0,player.z||0),targetYaw:player.yaw||0,hp:player.hp??100,kills:Number(player.kills)||0,deaths:Number(player.deaths)||0,armL,armR,legL,legR,body,head,pistol,assault,shotgun,sniper,godRing,godMode:!!player.godMode,admin:!!player.admin,lastSeen:now,lastNetAt:now,lastNetX:player.x||0,lastNetY:player.y||0,lastNetZ:player.z||0,moveSpeed:0,airborne:false,ads:!!player.ads,crouched:!!player.crouched,crouchBlend:player.crouched?1:0,animPhase:Math.random()*Math.PI*2,deathPose:player.hp<=0?1:0,reloadUntil:Number(player.reloadAt)||0,reloadStartedAt:0,reloadWeapon:player.reloadWeapon||'',swapStartedAt:0,fireKickUntil:0,revealedUntil:0,nextFootstepAt:now+300+Math.random()*260,footstepSide:Math.random()<.5?0:1,traversal:player.traversal?traversalPlanFromServer({id:player.id,accepted:true,...player.traversal}):null};tag.visible=remote.hp>0;
  syncRemoteWeapon(remote);return remote;
}
function makeNameTag(name,color){
  const c=document.createElement('canvas');c.width=512;c.height=128;const x=c.getContext('2d');x.fillStyle='rgba(5,10,15,.78)';x.beginPath();x.roundRect(24,16,464,96,28);x.fill();x.strokeStyle=color;x.lineWidth=6;x.stroke();x.fillStyle='#fff';x.font='800 48px system-ui';x.textAlign='center';x.textBaseline='middle';x.fillText(name,256,64);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthTest:true}));sprite.scale.set(2.2,.55,1);return sprite;
}
function updateRemoteTarget(r,player,instant=false){
  const now=performance.now(),x=Number(player.x)||0,y=Number(player.y)||0,z=Number(player.z)||0,elapsed=Math.max(.016,(now-r.lastNetAt)/1000),dist=Math.hypot(x-r.lastNetX,z-r.lastNetZ);
  r.moveSpeed=THREE.MathUtils.lerp(r.moveSpeed,Math.min(16,dist/elapsed),.55);r.airborne=y>worldSupportHeight(x,z,y)+.08;r.ads=player.ads??r.ads;r.crouched=player.crouched??r.crouched;r.lastNetAt=now;r.lastNetX=x;r.lastNetY=y;r.lastNetZ=z;r.target.set(x,y,z);r.targetYaw=Number(player.yaw)||0;r.lastSeen=now;
  if(Number(player.reloadAt)>0){r.reloadUntil=Number(player.reloadAt);r.reloadWeapon=player.reloadWeapon||r.weapon;if(!r.reloadStartedAt)r.reloadStartedAt=serverNow();}
  if(instant){r.group.position.copy(r.target);r.group.rotation.y=r.targetYaw;}
}
function upsertRemote(player,instant=false){if(!player?.id||player.id===clientId)return;let r=remotes.get(player.id);if(!r){r=makeRemote(player);remotes.set(player.id,r);}const oldTeam=r.team;r.name=player.name||r.name;r.bot=!!player.bot;r.team=player.team||r.team;r.color=remoteDisplayColor(r.team);r.admin=player.admin??r.admin;r.weapon=player.weapon||r.weapon;if(PRIMARY_WEAPONS.includes(player.primaryWeapon))r.primaryWeapon=player.primaryWeapon;r.hp=player.hp??r.hp;r.kills=Number(player.kills??r.kills)||0;r.deaths=Number(player.deaths??r.deaths)||0;r.godMode=player.godMode??r.godMode;if(player.traversal&&typeof player.traversal==='object'&&Number(player.traversal.seq)!==Number(r.traversal?.seq))r.traversal=traversalPlanFromServer({id:player.id,accepted:true,...player.traversal});else if(player.bot&&player.traversal===null)r.traversal=null;if(r.godRing)r.godRing.visible=!!r.godMode;if(oldTeam!==r.team)applyRemoteTeamVisual(r,r.team);syncRemoteWeapon(r);updateRemoteTarget(r,player,instant);}
function removeRemote(id){const r=remotes.get(id);if(!r)return;scene.remove(r.group);r.group.traverse(o=>{if(o.geometry)o.geometry.dispose?.();if(o.material){if(o.material.map)o.material.map.dispose?.();o.material.dispose?.();}});remotes.delete(id);}
function clearRemotes(){for(const id of [...remotes.keys()])removeRemote(id);}

function handleBlocked(m){
  if(m.attacker===clientId){hitUntil=performance.now()+180;soundShield();showToast('BLOCKED');}
  if(m.target===clientId){hurtUntil=performance.now()+220;soundShield();showToast('GOD MODE');}
}
function handleHit(m){
  const targetRemote=remotes.get(m.target);if(targetRemote){targetRemote.hp=m.hp;if(m.wasted)targetRemote.traversal=null;flashRemote(targetRemote);}
  if(m.attacker===clientId){showHitmarker(!!m.headshot);if(m.headshot)soundHeadshot();else soundHitmarker(m.weapon||'pistol');}
  if(m.target===clientId){
    hp=m.hp;knockX+=m.knockback?.x||0;knockZ+=m.knockback?.z||0;verticalVelocity=Math.max(verticalVelocity,m.knockback?.y||0);onGround=false;addDamageFeedback(m);syncLocalStatus();showHurt();soundHurt();
    if(m.wasted){traversal=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;wastedUntil=m.respawnAt||serverNow()+worldSettings.combat.respawnMs;deathAnimStartedAt=performance.now();clearFireInput();cancelEquipmentAim();showToast('ELIMINATED');}
  }
  
}
function addDamageFeedback(m){
  const damage=Math.max(1,Number(m.damage)||1),kx=Number(m.knockback?.x)||0,kz=Number(m.knockback?.z)||0;
  if(Math.hypot(kx,kz)>.01){const bearing=Math.atan2(kx,kz),relative=normalizeAngle(bearing-yaw);damageIndicators.push({angle:relative,until:performance.now()+1150,strength:Math.min(1,.35+damage/95)});if(damageIndicators.length>6)damageIndicators.shift();}
  const count=Math.max(2,Math.min(9,Math.ceil(damage/18)));for(let i=0;i<count;i++){const edge=Math.random(),side=Math.floor(Math.random()*4);let x,y;if(side===0){x=.05+edge*.9;y=.04+Math.random()*.20;}else if(side===1){x=.78+Math.random()*.18;y=.08+edge*.82;}else if(side===2){x=.05+edge*.9;y=.76+Math.random()*.20;}else{x=.04+Math.random()*.18;y=.08+edge*.82;}bloodSplats.push({x,y,r:.006+Math.random()*.018,stretch:.7+Math.random()*1.8,rot:Math.random()*Math.PI,until:performance.now()+6500+Math.random()*3500,alpha:.28+Math.random()*.38});}
  if(bloodSplats.length>42)bloodSplats.splice(0,bloodSplats.length-42);
}
function drawBloodSplatter(c,w,h,now,missingHealth){for(let i=bloodSplats.length-1;i>=0;i--){const s=bloodSplats[i],remain=(s.until-now)/8500;if(remain<=0){bloodSplats.splice(i,1);continue;}const a=s.alpha*Math.min(1,remain*2)*Math.max(.18,missingHealth);c.save();c.translate(s.x*w,s.y*h);c.rotate(s.rot);c.scale(s.stretch,1);c.fillStyle=`rgba(118,0,15,${a})`;c.beginPath();c.arc(0,0,s.r*Math.min(w,h),0,Math.PI*2);c.fill();c.fillStyle=`rgba(76,0,8,${a*.72})`;c.beginPath();c.arc(s.r*Math.min(w,h)*.65,-s.r*Math.min(w,h)*.35,s.r*Math.min(w,h)*.42,0,Math.PI*2);c.fill();c.restore();}}
function drawDamageIndicators(c,w,h,now){for(let i=damageIndicators.length-1;i>=0;i--){const d=damageIndicators[i],remain=(d.until-now)/1150;if(remain<=0){damageIndicators.splice(i,1);continue;}const radius=Math.min(w,h)*.26,x=w/2-Math.sin(d.angle)*radius,y=h/2-Math.cos(d.angle)*radius,rot=d.angle;c.save();c.translate(x,y);c.rotate(rot);c.globalAlpha=Math.min(1,remain*2)*d.strength;c.strokeStyle='#ff334d';c.fillStyle='rgba(255,30,55,.28)';c.lineWidth=3.2;c.beginPath();c.moveTo(-18,8);c.lineTo(0,-9);c.lineTo(18,8);c.stroke();c.beginPath();c.moveTo(-13,6);c.lineTo(0,-5);c.lineTo(13,6);c.lineTo(0,1);c.closePath();c.fill();c.restore();}}
function handleRespawn(player){viewRecoilPitch=viewRecoilYaw=0;
  if(!player?.id)return;
  if(player.id===clientId){hp=Math.max(0,Math.min(100,Number(player.hp??100)||0));myStats={kills:Number(player.kills??myStats.kills)||0,deaths:Number(player.deaths??myStats.deaths)||0};wastedUntil=0;lastWastedBy='';lastWastedWeapon='';bloodSplats.length=0;damageIndicators.length=0;flashUntil=flashPeakUntil=0;hurtUntil=hitUntil=0;lastShotVisualAt=0;localEquipmentCooldownUntil=0;myTeam=player.team||myTeam;pendingTeam=player.pendingTeam||'';selfColor=currentModeSpec().teamBased?(TEAM_COLORS[myTeam]||selfColor):TEAM_COLORS.blue;primaryWeapon=PRIMARY_WEAPONS.includes(player.primaryWeapon)?player.primaryWeapon:primaryWeapon;currentWeapon=(player.weapon==='pistol'||player.weapon===primaryWeapon)?player.weapon:primaryWeapon;sniperZoomLevel=0;adsWanted=false;crouchWanted=false;crouched=false;crouchBlend=0;ammo=normalizeClientAmmo(player.ammo);equipment=normalizeEquipment(player.equipment);pendingWeapon='';reloadRequestPending=false;reloadUntil=player.reloadAt||0;reloadWeapon=player.reloadWeapon||'';reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;deathAnimStartedAt=0;landingKick=0;nextFootstepAt=0;shotgunPumpStartedAt=0;shotgunPumpSoundPlayed=false;fireReadyAt=freshClientFireReady();clearFireInput();warmWeaponAudio(currentWeapon);syncLocalWeaponModel();traversal=null;traversalIntentUntil=0;traversalIntentSeq=0;traversalConsumedIntentSeq=0;position.set(player.x,player.y,player.z);clearCorrectionView();resetViewVertical();verticalVelocity=Number.isFinite(Number(player.verticalVelocity))?Number(player.verticalVelocity):0;moveVelocityX=moveVelocityZ=0;onGround=player.grounded!==false;lastGroundedAt=onGround?performance.now():0;jumpBufferedUntil=0;jumpSeq=Math.max(jumpSeq,Math.floor(Number(player.jumpSeq)||0));knockX=knockZ=0;camera.rotation.z=0;syncLocalStatus();showToast('Back in');return;}
  upsertRemote(player,true);const r=remotes.get(player.id);if(r){r.hp=100;}
}
function flashRemote(r){const old=r.body.material.emissive?.clone?.();r.body.material.emissive=new THREE.Color(0x8a1020);setTimeout(()=>{if(r.body?.material)r.body.material.emissive=old||new THREE.Color(0x000000)},120);}
function showHitmarker(headshot=false){hitUntil=performance.now()+190;if(headshot)headshotUntil=performance.now()+280;}
function showHurt(){hurtUntil=performance.now()+650;}
function showToast(text){toastText=String(text||'');toastUntil=performance.now()+1600;}
function syncLocalStatus(){if(hp<=0)setAim(false);syncPauseContext();}

function currentPlayerHeight(){return crouched?CROUCH_HEIGHT:PLAYER_HEIGHT;}
function canStandHere(){return !blocked(position.x,position.z,position.y,PLAYER_HEIGHT);}
function expFollow(current,target,rate,dt){return current+(target-current)*(1-Math.exp(-Math.max(0,rate)*Math.max(0,dt)));}
function approachVector(x,z,targetX,targetZ,maxDelta){const dx=targetX-x,dz=targetZ-z,d=Math.hypot(dx,dz);if(d<=maxDelta||d<1e-7)return{x:targetX,z:targetZ};const scale=maxDelta/d;return{x:x+dx*scale,z:z+dz*scale};}
function smoothstep01(value){const t=THREE.MathUtils.clamp(value,0,1);return t*t*(3-2*t);}
function resetViewVertical(){viewFeetY=position?position.y:NaN;}
function clearCorrectionView(){correctionViewX=0;correctionViewY=0;correctionViewZ=0;}
function traversalPlanFromServer(m){
  const durationMs=Math.max(1,Number(m.durationMs)||1),elapsed=Math.max(0,serverNow()-(Number(m.startedAt)||serverNow()));
  return {seq:Math.max(0,Math.floor(Number(m.seq)||0)),mode:m.mode==='vault'?'vault':'mantle',role:String(m.role||''),startX:Number(m.startX)||0,startY:Number(m.startY)||0,startZ:Number(m.startZ)||0,endX:Number(m.endX)||0,endY:Number(m.endY)||0,endZ:Number(m.endZ)||0,peakY:Number(m.peakY)||Number(m.endY)||0,durationMs,startedAt:performance.now()-Math.min(durationMs,elapsed)};
}
function handleTraversalMessage(m){
  if(m.id===clientId){
    if(m.accepted===false){traversal=null;const x=Number(m.x),y=Number(m.y),z=Number(m.z);if(Number.isFinite(x)&&Number.isFinite(y)&&Number.isFinite(z)){position.set(x,y,z);clearCorrectionView();resetViewVertical();}return;}
    traversal=traversalPlanFromServer(m);verticalVelocity=0;onGround=false;return;
  }
  const r=remotes.get(m.id);if(!r||m.accepted===false)return;r.traversal=traversalPlanFromServer(m);
}

function applyServerCorrection(m){
  const cx=Number(m.x),cy=Number(m.y),cz=Number(m.z);
  const nextX=Number.isFinite(cx)?cx:position.x,nextY=Number.isFinite(cy)?cy:position.y,nextZ=Number.isFinite(cz)?cz:position.z;
  const visualX=position.x+correctionViewX,visualY=Number.isFinite(viewFeetY)?viewFeetY:position.y+correctionViewY,visualZ=position.z+correctionViewZ;
  const errorX=visualX-nextX,errorY=visualY-nextY,errorZ=visualZ-nextZ,error=Math.hypot(errorX,errorY,errorZ);
  position.set(nextX,nextY,nextZ);
  if(error>CORRECTION_HARD_SNAP_DISTANCE||Math.abs(errorY)>.9){traversal=null;clearCorrectionView();resetViewVertical();}
  else{
    const horizontal=Math.hypot(errorX,errorZ),scale=horizontal>CORRECTION_MAX_HORIZONTAL?CORRECTION_MAX_HORIZONTAL/horizontal:1;
    correctionViewX=errorX*scale;correctionViewZ=errorZ*scale;correctionViewY=THREE.MathUtils.clamp(errorY,-CORRECTION_MAX_VERTICAL,CORRECTION_MAX_VERTICAL);
  }
  if(typeof m.crouched==='boolean'){crouched=m.crouched;if(crouched)crouchWanted=true;else if(!crouchWanted)crouched=false;}
  if(m.vertical){const serverVy=Number(m.verticalVelocity);if(Number.isFinite(serverVy))verticalVelocity=serverVy;onGround=typeof m.grounded==='boolean'?m.grounded:Math.abs(position.y-worldSupportHeight(position.x,position.z,position.y))<=.08;}
}
function updateCorrectionView(dt){
  const decay=Math.exp(-CORRECTION_VIEW_RATE*Math.max(0,dt));correctionViewX*=decay;correctionViewY*=decay;correctionViewZ*=decay;
  if(Math.abs(correctionViewX)<.0003)correctionViewX=0;if(Math.abs(correctionViewY)<.0003)correctionViewY=0;if(Math.abs(correctionViewZ)<.0003)correctionViewZ=0;
}
function updateViewVertical(dt){
  const target=position.y+correctionViewY;if(traversal){viewFeetY=target;return viewFeetY;}if(!Number.isFinite(viewFeetY)||Math.abs(target-viewFeetY)>VIEW_VERTICAL_SNAP_DISTANCE){viewFeetY=target;return viewFeetY;}
  const rate=onGround?(target>=viewFeetY?GROUND_VIEW_UP_RATE:GROUND_VIEW_DOWN_RATE):AIR_VIEW_RATE;viewFeetY=expFollow(viewFeetY,target,rate,dt);
  if(Math.abs(target-viewFeetY)<.0005)viewFeetY=target;return viewFeetY;
}
function updateCrouchState(dt=0){
  const next=crouchWanted||(crouched&&!canStandHere());crouched=next;
  const target=crouched?1:0;crouchBlend=expFollow(crouchBlend,target,CROUCH_VIEW_RATE,Math.max(.001,dt));if(Math.abs(target-crouchBlend)<.002)crouchBlend=target;
}
function setCrouch(active){crouchWanted=!!active;if(crouchWanted)crouched=true;else if(canStandHere())crouched=false;sendCurrentState(true);}
function toggleCrouch(){if(!shell.canPlay||hp<=0||traversal)return;const next=!crouchWanted;if(!next&&!canStandHere()){crouched=true;crouchWanted=false;showToast('NEED CLEARANCE');sendCurrentState(true);return;}setCrouch(next);}
function traversalDirection(){
  const input=movementInput();if(input.len<.15)return null;
  const sin=Math.sin(yaw),cos=Math.cos(yaw),dx=input.mx*cos+input.mz*sin,dz=-input.mx*sin+input.mz*cos,len=Math.hypot(dx,dz);return len>.001?{x:dx/len,z:dz/len}:null;
}
function traversalCandidate(direction,airborne=!onGround){
  if(!direction||traversal)return null;
  return findTraversalCandidate({x:position.x,y:position.y,z:position.z,dirX:direction.x,dirZ:direction.z,height:currentPlayerHeight(),radius:PLAYER_RADIUS,airborne});
}
function beginTraversal(candidate,direction,{playJump=false}={}){
  if(!candidate||!direction||traversal||!shell.canPlay||hp<=0)return false;
  const now=performance.now(),seq=++traversalSeq,plan=createTraversalPlan(candidate,position.x,position.y,position.z,now,seq);if(!plan)return false;
  traversal={...plan,dirX:direction.x,dirZ:direction.z};traversalConsumedIntentSeq=traversalIntentSeq;traversalIntentUntil=0;verticalVelocity=0;onGround=false;landingKick=0;setAim(false);clearFireInput();cancelEquipmentAim();
  sendCurrentState(true);send({t:'traverse',seq,dirX:round3(direction.x),dirZ:round3(direction.z)});if(playJump)soundJump();return true;
}
function tryTraversal({vaultOnly=false}={}){
  const direction=traversalDirection(),candidate=traversalCandidate(direction,!onGround);if(!candidate||vaultOnly&&candidate.mode!=='vault')return false;return beginTraversal(candidate,direction,{playJump:onGround});
}
function updateTraversal(now){
  if(!traversal)return false;const pose=traversalPose(traversal,now);if(!pose){traversal=null;return false;}
  position.set(pose.x,pose.y,pose.z);verticalVelocity=0;onGround=false;
  if(pose.done){position.set(traversal.endX,traversal.endY,traversal.endZ);traversal=null;onGround=true;landingKick=.32;nextFootstepAt=now+120;soundLanding(.28);sendCurrentState(true);}
  return true;
}
function startPlayerJump(now=performance.now(),{allowTraversal=true}={}){
  if(crouched||crouchWanted){crouchWanted=false;if(!canStandHere()){crouched=true;showToast('NEED CLEARANCE');sendCurrentState(true);return false;}crouched=false;}
  if(allowTraversal&&onGround&&tryTraversal({vaultOnly:true}))return true;
  jumpBufferedUntil=0;jumpSeq+=1;verticalVelocity=Math.sqrt(2*worldSettings.movement.gravity*worldSettings.movement.jumpHeight);onGround=false;landingKick=0;sendCurrentState(true);soundJump();return true;
}
function tryJump(){
  if(!shell.canPlay||hp<=0||traversal)return;const now=performance.now();traversalIntentSeq+=1;traversalIntentUntil=now+560;
  if(onGround||now-lastGroundedAt<=COYOTE_TIME_MS){startPlayerJump(now);return;}
  if(tryTraversal()){jumpBufferedUntil=0;return;}
  jumpBufferedUntil=now+JUMP_BUFFER_MS;
}
function movementInput(){
  let mx=0,mz=0;
  if(shell.canPlay&&hp>0){
    if(isTouch){mx=joy.x;mz=joy.y;}
    else{if(keys.has('KeyA'))mx--;if(keys.has('KeyD'))mx++;if(keys.has('KeyW'))mz--;if(keys.has('KeyS'))mz++;}
  }
  const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len;}
  moveInput.mx=mx;moveInput.mz=mz;moveInput.len=Math.min(1,len);return moveInput;
}
function statePayload(){const input=movementInput();return {t:'state',x:round3(position.x),y:round3(position.y),z:round3(position.z),yaw:round3(yaw),pitch:round3(pitch),ads:adsWanted,crouched,grounded:onGround,jumpSeq,moveX:round3(input.mx),moveZ:round3(input.mz)};}
function stateChanged(p){return !Number.isFinite(lastSentState.x)||Math.abs(p.x-lastSentState.x)>.008||Math.abs(p.y-lastSentState.y)>.008||Math.abs(p.z-lastSentState.z)>.008||Math.abs(normalizeAngle(p.yaw-lastSentState.yaw))>.0025||Math.abs(p.pitch-lastSentState.pitch)>.0025||Math.abs(p.moveX-lastSentState.moveX)>.02||Math.abs(p.moveZ-lastSentState.moveZ)>.02||p.ads!==lastSentState.ads||p.crouched!==lastSentState.crouched||p.grounded!==lastSentState.grounded;}
function sendCurrentState(force=false){
  const now=performance.now(),p=statePayload(),changed=stateChanged(p),interval=changed?ACTIVE_STATE_INTERVAL:IDLE_STATE_INTERVAL;
  if(!force&&now-lastStateSent<interval)return false;
  lastStateSent=now;lastSentState={x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,ads:p.ads,crouched:p.crouched,grounded:p.grounded,moveX:p.moveX,moveZ:p.moveZ};send(p);return true;
}
function applyAuthoritativeLoadout(m){
  if(PRIMARY_WEAPONS.includes(m.primaryWeapon)){primaryWeapon=m.primaryWeapon;if(shell.inLobby)rememberPrimary(primaryWeapon);}if(typeof m.pendingTeam==='string')pendingTeam=m.pendingTeam;
  const serverWeapon=(m.weapon==='pistol'||m.weapon===primaryWeapon)?m.weapon:currentWeapon;
  if(!pendingWeapon||serverWeapon===pendingWeapon){currentWeapon=serverWeapon;if(pendingWeapon===serverWeapon)pendingWeapon='';}
  syncClientAmmo(m.ammo);
  reloadUntil=Math.max(0,Number(m.reloadAt)||0);
  reloadWeapon=m.reloadWeapon||'';
  reloadStartedAt=reloadUntil?reloadUntil-weaponRules(reloadWeapon||currentWeapon).reloadMs:0;
  reloadRequestPending=false;
  if(m.action==='weapon'&&m.accepted!==false){pendingWeapon='';delayFire(Number(m.retryAfterMs)||0,m.weapon);}
  if(m.action==='reloadShell')soundReload('shotgun');
  if(m.action==='fire'&&m.accepted===false&&(m.reason==='cooldown'||m.reason==='weapon_switch'))delayFire(Math.max(8,Math.min(180,Number(m.retryAfterMs)||35)),m.weapon);
  syncLocalWeaponModel();
}
function freshClientFireReady(){return Object.fromEntries(WEAPON_ORDER.map(name=>[name,0]));}
function touchRoleActive(role){for(const value of touchRoles.values())if(value===role)return true;return false;}
function fireInputHeld(){return mouseFireDown||touchRoleActive('fire');}
function clearFireInput(){mouseFireDown=false;for(const [id,role] of touchRoles)if(role==='fire')touchRoles.delete(id);}
function delayFire(ms,weapon=currentWeapon){weapon=WEAPON_SPECS[weapon]?weapon:currentWeapon;if(ms>0)fireReadyAt[weapon]=Math.max(fireReadyAt[weapon]||0,performance.now()+ms);}
function pressMouseFire(){if(mouseFireDown)return;const wasHeld=fireInputHeld();mouseFireDown=true;if(!wasHeld)requestShot();}
function pressTouchFire(pointerId){if(touchRoles.has(pointerId))return;const wasHeld=fireInputHeld();touchRoles.set(pointerId,'fire');if(!wasHeld)requestShot();}
const VIEW_RECOIL=Object.freeze({
  pistol:{pitch:.0025,yaw:.0010,maxPitch:.0050},assault:{pitch:.0012,yaw:.0008,maxPitch:.0042},shotgun:{pitch:.0070,yaw:.0024,maxPitch:.0110},sniper:{pitch:.0110,yaw:.0030,maxPitch:.0160}
});
function applyViewRecoil(weapon){
  const r=VIEW_RECOIL[weapon]||VIEW_RECOIL.pistol,adsScale=adsWanted?.72:1;
  viewRecoilPitch=Math.min(r.maxPitch,viewRecoilPitch+r.pitch*adsScale);
  viewRecoilYaw=THREE.MathUtils.clamp(viewRecoilYaw+((Math.random()-.5)*2*r.yaw)*adsScale,-.006,.006);
}
function updateViewRecoil(dt){
  const follow=1-Math.exp(-Math.max(0,dt)*24);
  viewRecoilPitch=THREE.MathUtils.lerp(viewRecoilPitch,0,follow);
  viewRecoilYaw=THREE.MathUtils.lerp(viewRecoilYaw,0,follow);
  if(Math.abs(viewRecoilPitch)<.00002)viewRecoilPitch=0;if(Math.abs(viewRecoilYaw)<.00002)viewRecoilYaw=0;
}
function requestShot(){
  const now=performance.now(),interruptShotgunReload=!godMode&&currentWeapon==='shotgun'&&!!reloadUntil&&(ammo.shotgun||0)>0;
  if(!shell.canPlay||matchState.status!=='active'||hp<=0||traversal||now<(fireReadyAt[currentWeapon]||0)||(!godMode&&(reloadRequestPending||(reloadUntil&&!interruptShotgunReload))))return false;
  if(!godMode&&(ammo[currentWeapon]||0)<=0){doReload();return false;}
  if(interruptShotgunReload){reloadUntil=0;reloadWeapon='';reloadStartedAt=0;reloadRequestPending=false;}
  const shotYaw=round3(yaw),shotPitch=round3(pitch);fireReadyAt[currentWeapon]=now+weaponRules(currentWeapon).cooldownMs;sendCurrentState(true);send({t:'fire',weapon:currentWeapon,yaw:shotYaw,pitch:shotPitch});applyViewRecoil(currentWeapon);return true;
}
function updateFireControl(now){if(fireInputHeld()&&currentWeapon==='assault'&&assaultFireMode==='auto'&&now>=(fireReadyAt[currentWeapon]||0))requestShot();}
function doReload(){
  const spec=WEAPON_SPECS[currentWeapon];
  if(!shell.canPlay||hp<=0||traversal)return;
  if(godMode){reloadUntil=0;reloadRequestPending=false;return;}
  if((ammo[currentWeapon]||0)>=spec.mag)return;
  if(reloadRequestPending)return;
  if(reloadUntil)return;
  setAim(false);reloadRequestPending=true;send({t:'reload',weapon:currentWeapon});if(currentWeapon!=='shotgun')soundReload(currentWeapon);
}
function nextWeapon(weapon){return weapon==='pistol'?primaryWeapon:'pistol';}
function switchWeapon(weapon){
  weapon=weapon==='pistol'?'pistol':primaryWeapon;
  if(!shell.canPlay||hp<=0||traversal||weapon===currentWeapon)return;
  setAim(false);sniperZoomLevel=0;currentWeapon=weapon;pendingWeapon=weapon;reloadRequestPending=false;reloadUntil=0;reloadWeapon='';reloadStartedAt=0;weaponSwapStartedAt=performance.now();delayFire(120,weapon);warmWeaponAudio(weapon);syncLocalWeaponModel();send({t:'weapon',weapon});showToast(WEAPON_SPECS[weapon].name);
}
function setAim(active){adsWanted=!!active&&shell.canPlay&&hp>0&&!reloadUntil&&!traversal;if(!adsWanted&&currentWeapon==='sniper')sniperZoomLevel=0;else if(adsWanted&&currentWeapon==='sniper'&&sniperZoomLevel===0)sniperZoomLevel=1;}
function toggleAim(){if(traversal)return;if(currentWeapon==='sniper'&&shell.canPlay&&hp>0&&!reloadUntil){if(!adsWanted){adsWanted=true;sniperZoomLevel=1;showToast('SNIPER 4X');}else if(sniperZoomLevel===1){sniperZoomLevel=2;showToast('SNIPER 8X');}else{adsWanted=false;sniperZoomLevel=0;}return;}setAim(!adsWanted);}
function toggleFireMode(){if(currentWeapon!=='assault'){showToast('FIRE MODE · ASSAULT ONLY');return;}assaultFireMode=assaultFireMode==='semi'?'auto':'semi';clearFireInput();touchVisual.modeUntil=performance.now()+180;localStorage.setItem('breachAssaultFireMode',assaultFireMode);showToast(assaultFireMode==='auto'?'ASSAULT · AUTO':'ASSAULT · SEMI');}
function normalizeClientAmmo(value){const v=value&&typeof value==='object'?value:{};return Object.fromEntries(WEAPON_ORDER.map(name=>{const spec=WEAPON_SPECS[name];return[name,Math.max(0,Math.min(spec.mag,Number(v[name]??spec.mag)))]}));}
function syncClientAmmo(value){const v=value&&typeof value==='object'?value:{};for(const name of WEAPON_ORDER){const spec=WEAPON_SPECS[name];ammo[name]=Math.max(0,Math.min(spec.mag,Number(v[name]??spec.mag)));}}
function normalizeEquipment(v){v=v&&typeof v==='object'?v:{};return Object.fromEntries(Object.entries(EQUIPMENT_CAPS).map(([name,cap])=>[name,Math.max(0,Math.min(cap,Number(v[name]??cap)))]));}
function beginEquipmentAim(kind){const now=performance.now();kind=kind==='sticky'?'sticky':'flash';if(!shell.canPlay||matchState.status!=='active'||hp<=0||traversal||now<localEquipmentCooldownUntil||(!godMode&&(equipment[kind]||0)<=0))return false;if(equipmentAim.kind)return false;equipmentAim={kind,startedAt:now};showTrajectory();if(kind==='flash')touchVisual.flashUntil=now+220;else touchVisual.stickyUntil=now+220;return true;}
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
  if(kind==='flash')touchVisual.flashUntil=now+160;else touchVisual.stickyUntil=now+160;
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


function syncLocalWeaponModel(){if(pistolGroup)pistolGroup.visible=currentWeapon==='pistol';if(assaultGroup)assaultGroup.visible=currentWeapon==='assault';if(shotgunGroup)shotgunGroup.visible=currentWeapon==='shotgun';if(sniperGroup)sniperGroup.visible=currentWeapon==='sniper';syncPauseContext();}
function syncRemoteWeapon(r){if(!r)return;if(r.pistol)r.pistol.visible=r.weapon==='pistol';if(r.assault)r.assault.visible=r.weapon==='assault';if(r.shotgun)r.shotgun.visible=r.weapon==='shotgun';if(r.sniper)r.sniper.visible=r.weapon==='sniper';}
function bulletGeometry(radius){const key=String(radius);let g=bulletGeometryCache.get(key);if(!g){g=new THREE.SphereGeometry(radius,8,6);bulletGeometryCache.set(key,g);}return g;}
function bulletMaterial(color){const key=String(color);let m=bulletMaterialCache.get(key);if(!m){m=new THREE.MeshBasicMaterial({color});bulletMaterialCache.set(key,m);}return m;}
function acquireBulletMesh(radius,color){const mesh=bulletMeshPool.pop()||new THREE.Mesh();mesh.geometry=bulletGeometry(radius);mesh.material=bulletMaterial(color);mesh.visible=true;return mesh;}
function releaseBulletMesh(mesh){if(!mesh)return;scene.remove(mesh);mesh.visible=false;if(bulletMeshPool.length<192)bulletMeshPool.push(mesh);}
function handleShot(m){
  if(!m?.id||bullets.has(m.id))return;const packetAge=Number.isFinite(Number(m.at))?Math.max(0,serverNow()-Number(m.at)):0;if(packetAge>520)return;
  const color=m.weapon==='sniper'?0xb8efff:m.weapon==='shotgun'?0xffa95d:m.weapon==='assault'?0xffd37d:(m.ownerId===clientId?0xfff1a8:(remotes.get(m.ownerId)?.bot?0xff9b6b:0xffd27a));
  const radius=m.weapon==='sniper'?.045:m.weapon==='assault'?.05:.055,mesh=acquireBulletMesh(radius,color);mesh.position.set(m.x,m.y,m.z);scene.add(mesh);
  bullets.set(m.id,{mesh,v:new THREE.Vector3(m.vx,m.vy,m.vz),born:performance.now(),lifetimeMs:Number(m.lifetimeMs)||3600});
  if(m.ownerId===clientId){
    const w=m.weapon||currentWeapon;if(m.consumeAmmo!==false&&!godMode){ammo[w]=Math.max(0,(ammo[w]||0)-1);}lastShotVisualAt=performance.now();soundShot(w);if(w==='shotgun'){shotgunPumpStartedAt=performance.now();shotgunPumpSoundPlayed=false;}if(w==='sniper')sniperFlash.material.opacity=1;else if(w==='shotgun')shotgunFlash.material.opacity=1;else if(w==='assault')assaultFlash.material.opacity=1;else pistolFlash.material.opacity=1;
  }else{
    const r=remotes.get(m.ownerId);if(r){r.fireKickUntil=performance.now()+170;r.revealedUntil=performance.now()+1500;playSpatialCue(weaponShotSoundId(m.weapon),m.x,m.y,m.z,95,.95);}
  }
}
function removeBullet(id){const b=bullets.get(id);if(!b)return;releaseBulletMesh(b.mesh);bullets.delete(id);}
function clearBullets(){for(const id of [...bullets.keys()])removeBullet(id);}
function updateBullets(dt){const now=performance.now();for(const [id,b] of bullets){b.mesh.position.addScaledVector(b.v,dt);if(now-b.born>b.lifetimeMs+250)removeBullet(id);}}

function disposeObject3D(root){if(!root)return;root.traverse?.(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))for(const m of o.material)m?.dispose?.();else o.material?.dispose?.();});}
function spawnThrowableVisual(m){
  if(!m?.id)return;
  const existing=throwables.get(m.id);if(existing){updateThrowableVisual(m);return;}
  const root=new THREE.Group(),flash=m.kind==='flash';
  const bodyMat=new THREE.MeshStandardMaterial({color:flash?0xd7dde0:0x4b5632,roughness:.68,metalness:.42,emissive:flash?0x111111:0x130900,emissiveIntensity:.12});
  const body=new THREE.Mesh(flash?new THREE.CylinderGeometry(.10,.10,.24,10):new THREE.OctahedronGeometry(.14,1),bodyMat);if(flash)body.rotation.z=Math.PI/2;root.add(body);
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(.045,.055,.075,8),new THREE.MeshStandardMaterial({color:0x252a2c,roughness:.55,metalness:.7}));cap.position.y=.13;root.add(cap);
  let indicator=null;if(!flash){indicator=new THREE.Mesh(new THREE.SphereGeometry(.025,6,5),new THREE.MeshBasicMaterial({color:0xff4b29,transparent:true,opacity:1}));indicator.position.set(.10,.04,.07);root.add(indicator);}
  root.position.set(m.x,m.y,m.z);scene.add(root);
  const at=Number(m.at)||serverNow(),fuseAt=Number(m.fuseAt)||at+(m.kind==='sticky'?1850:1650);throwables.set(m.id,{root,mesh:root,body,indicator,kind:m.kind,ownerId:m.ownerId,target:new THREE.Vector3(m.x,m.y,m.z),snapshotPos:new THREE.Vector3(m.x,m.y,m.z),snapshotVel:new THREE.Vector3(m.vx||0,m.vy||0,m.vz||0),snapshotAt:at,fuseAt,nextBeepAt:m.kind==='sticky'?at+170:0,born:performance.now(),stuck:!!m.stuck,rolling:!!m.rolling});
  if(m.ownerId===clientId)soundThrowableThrow(m.kind);
  else playSpatialCue(m.kind==='sticky'?'stickyThrow':'flashThrow',m.x,m.y,m.z,30,.55);
}
function updateThrowableVisual(m){
  const g=throwables.get(m.id);if(!g)return;
  g.snapshotPos.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);g.target.copy(g.snapshotPos);g.snapshotAt=Number(m.at)||serverNow();if(Number.isFinite(Number(m.fuseAt)))g.fuseAt=Number(m.fuseAt);g.stuck=!!m.stuck;g.rolling=!!m.rolling;
  if(g.stuck)g.snapshotVel.set(0,0,0);else g.snapshotVel.set(Number(m.vx)||0,Number(m.vy)||0,Number(m.vz)||0);
}
function handleThrowableImpact(m){soundThrowableImpact(m.kind||'flash',m);updateThrowableVisual(m);}
function removeThrowableVisual(id){const g=throwables.get(id);if(!g)return;scene.remove(g.root||g.mesh);disposeObject3D(g.root||g.mesh);throwables.delete(id);}
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
  if(!scene||!THREE)return;const sticky=kind==='sticky',root=new THREE.Group();root.position.set(Number(m.x)||0,Number(m.y)||0,Number(m.z)||0);
  const core=new THREE.Mesh(new THREE.SphereGeometry(1,14,10),new THREE.MeshBasicMaterial({color:sticky?0xff8a35:0xffffff,transparent:true,opacity:1,depthWrite:false,blending:THREE.AdditiveBlending}));core.scale.setScalar(.08);root.add(core);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.62,.82,28),new THREE.MeshBasicMaterial({color:sticky?0xffb15c:0xeafaff,transparent:true,opacity:.92,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending}));ring.rotation.x=-Math.PI/2;ring.scale.setScalar(.15);root.add(ring);
  const light=new THREE.PointLight(sticky?0xff7a2e:0xffffff,sticky?11:15,sticky?17:22,2);root.add(light);
  const particles=[];const count=sticky?18:10;for(let i=0;i<count;i++){const p=new THREE.Mesh(new THREE.SphereGeometry(sticky?.035:.025,5,4),new THREE.MeshBasicMaterial({color:sticky?(i%3?0xff9c45:0xffe0a0):0xffffff,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending}));const a=Math.random()*Math.PI*2,e=.15+Math.random()*.8,speed=(sticky?4.5:6)+Math.random()*(sticky?7:5);const dir=new THREE.Vector3(Math.cos(a)*Math.cos(e),Math.sin(e),Math.sin(a)*Math.cos(e)).multiplyScalar(speed);root.add(p);particles.push({mesh:p,v:dir});}
  scene.add(root);tacticalFx.push({kind,root,core,ring,light,particles,age:0,duration:sticky?.72:.48});
}
function updateTacticalFx(dt){for(let i=tacticalFx.length-1;i>=0;i--){const f=tacticalFx[i];f.age+=dt;const p=Math.min(1,f.age/f.duration),sticky=f.kind==='sticky';f.core.scale.setScalar((sticky?3.8:5.5)*(1-Math.pow(1-p,3))+.05);f.core.material.opacity=(1-p)*(sticky?.62:.88);f.ring.scale.setScalar(.2+p*(sticky?7.5:10));f.ring.material.opacity=(1-p)*(sticky?.72:.86);f.light.intensity=(sticky?11:15)*Math.pow(1-p,2);for(const q of f.particles){q.v.y-=9*dt;q.mesh.position.addScaledVector(q.v,dt);q.mesh.material.opacity=Math.max(0,1-p);q.mesh.scale.setScalar(1+p*1.8);}if(p>=1){scene.remove(f.root);disposeObject3D(f.root);tacticalFx.splice(i,1);}}}
function clearTacticalFx(){for(const f of tacticalFx){scene.remove(f.root);disposeObject3D(f.root);}tacticalFx.length=0;}
function applyFlashEffect(m){const power=Math.max(0,Math.min(1,Number(m.power)||0));if(power<=0)return;const now=performance.now(),duration=Math.max(350,Number(m.durationMs)||700+power*2600);flashPeakUntil=Math.max(flashPeakUntil,now+180+power*520);flashUntil=Math.max(flashUntil,now+duration);}
function animate(){
  requestAnimationFrame(animate);
  const rawFrameDt=Math.max(0,clock.getDelta()),frameDt=Math.min(rawFrameDt,CLIENT_MAX_FRAME_SEC);
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
  const visualDt=Math.min(frameDt,.10);updateAim(visualDt);updateRemoteVisuals(visualDt);updateWeaponView(visualDt);updateBullets(visualDt);updateThrowables(visualDt);updateTacticalFx(visualDt);updateEquipmentTrajectory();
  renderer.autoClear=true;renderer.render(scene,camera);
  if(shell.canPlay){renderer.autoClear=false;renderer.clearDepth();renderer.render(hudScene,hudCamera);renderer.autoClear=true;drawHud(performance.now());}
}
function maintainNetwork(){
  const now=performance.now(),stateSent=sendCurrentState(false);sendSimulationHeartbeat(stateSent);
  if(now-lastPing<=15000)return;
  lastPing=now;lastPingLocalAt=Date.now();send({t:'ping',clientAt:lastPingLocalAt});
}
function updatePausedNetwork(){if(traversal)updateTraversal(performance.now());maintainNetwork();}
function updateGameSimulation(dt){const now=performance.now();if(hp>0){updateCrouchState(dt);updateMovement(dt);updateFireControl(now);}}
function updateGameFrame(dt){
  const now=performance.now();updateCorrectionView(dt);updateViewRecoil(dt);
  const deathP=hp<=0?THREE.MathUtils.clamp((now-(deathAnimStartedAt||now))/700,0,1):0,deathEase=deathP*deathP*(3-2*deathP),viewY=updateViewVertical(dt),stanceEase=smoothstep01(crouchBlend),traversePose=traversal?traversalPose(traversal,now):null,traverseWave=traversePose?Math.sin(Math.PI*traversePose.progress):0;camera.position.set(position.x+correctionViewX,viewY+THREE.MathUtils.lerp(PLAYER_HEIGHT,CROUCH_HEIGHT,stanceEase)-.42*deathEase-.055*traverseWave,position.z+correctionViewZ);camera.rotation.y=yaw+viewRecoilYaw;camera.rotation.x=pitch+viewRecoilPitch+.10*deathEase-.045*traverseWave;camera.rotation.z=.72*deathEase;
  maintainNetwork();
}
function updateMovement(dt){
  const now=performance.now();if(updateTraversal(now)){localMoveAmount=THREE.MathUtils.lerp(localMoveAmount,0,Math.min(1,dt*10));moveVelocityX=moveVelocityZ=0;return;}
  if(onGround)lastGroundedAt=now;
  if((keys.has('Space')||touchRoleActive('jump'))&&traversalConsumedIntentSeq!==traversalIntentSeq)traversalIntentUntil=Math.max(traversalIntentUntil,now+110);
  const input=movementInput(),mx=input.mx,mz=input.mz,len=input.len,movement=worldSettings.movement;
  const targetSpeed=(adsWanted?movement.walkSpeed:movement.runSpeed)*(crouched?CROUCH_SPEED_MULTIPLIER:1),sin=Math.sin(yaw),cos=Math.cos(yaw);
  const targetX=(mx*cos+mz*sin)*targetSpeed,targetZ=(-mx*sin+mz*cos)*targetSpeed;
  if(onGround){const next=approachVector(moveVelocityX,moveVelocityZ,targetX,targetZ,(len>.04?GROUND_ACCELERATION:GROUND_BRAKING)*dt);moveVelocityX=next.x;moveVelocityZ=next.z;}
  else if(len>.04){const next=approachVector(moveVelocityX,moveVelocityZ,targetX,targetZ,AIR_ACCELERATION*dt);moveVelocityX=next.x;moveVelocityZ=next.z;const airSpeed=Math.hypot(moveVelocityX,moveVelocityZ),airCap=movement.runSpeed;if(airSpeed>airCap){moveVelocityX=moveVelocityX/airSpeed*airCap;moveVelocityZ=moveVelocityZ/airSpeed*airCap;}}
  const knock=advanceKnockback(knockX,knockZ,dt),dx=moveVelocityX*dt+knock.dx,dz=moveVelocityZ*dt+knock.dz,startX=position.x,startZ=position.z;
  knockX=knock.xVelocity;knockZ=knock.zVelocity;
  const horizontalMove=moveHorizontal(dx,dz);if(horizontalMove?.blocked){moveVelocityX*=.64;moveVelocityZ*=.64;}
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

function moveHorizontal(dx,dz){
  const next=sweepHorizontalMovement({
    x:position.x,y:position.y,z:position.z,dx,dz,grounded:onGround,arenaLimit:ARENA_LIMIT,followDrop:GROUND_FOLLOW_DROP,
    supportHeight:(x,z,y)=>worldSupportHeight(x,z,y,crouched),
    blockedAt:(x,z,y,fromX,fromZ)=>worldMoveBlockedAt(x,z,y,fromX,fromZ,currentPlayerHeight(),PLAYER_RADIUS)||remoteActorBlocked(x,z,y,fromX,fromZ),
  });
  position.set(next.x,next.y,next.z);onGround=next.grounded;return next;
}
function blocked(x,z,y=position?.y??terrainHeight(x,z),playerHeight=currentPlayerHeight()){return worldBlockedAt(x,z,y,playerHeight,PLAYER_RADIUS);}
function round3(n){return Math.round(n*1000)/1000;}

function updateRemoteVisuals(dt){
  const now=performance.now(),srv=serverNow();
  for(const r of remotes.values()){
    const netFollow=1-Math.exp(-dt*(r.bot?15:20));r.group.position.lerp(r.target,netFollow);let d=normalizeAngle(r.targetYaw-r.group.rotation.y);r.group.rotation.y+=d*netFollow;
    const dead=r.hp<=0;r.deathPose=THREE.MathUtils.lerp(r.deathPose,dead?1:0,Math.min(1,dt*(dead?5.5:12)));const dp=r.deathPose*r.deathPose*(3-2*r.deathPose);r.model.rotation.z=1.34*dp;r.model.rotation.x=.10*dp;r.model.position.y=-.18*dp;if(r.tag)r.tag.visible=!dead;
    if(!dead){
      r.crouchBlend=THREE.MathUtils.lerp(r.crouchBlend,r.crouched?1:0,Math.min(1,dt*12));r.model.scale.y=THREE.MathUtils.lerp(1,CROUCH_HEIGHT/PLAYER_HEIGHT,r.crouchBlend);if(r.tag)r.tag.position.y=THREE.MathUtils.lerp(2.18,1.48,r.crouchBlend);
      const traversalPoseNow=r.traversal?traversalPose(r.traversal,now):null,traversing=!!traversalPoseNow&&!traversalPoseNow.done;if(r.traversal&&traversalPoseNow?.done)r.traversal=null;
      const move=THREE.MathUtils.clamp(r.moveSpeed/(worldSettings.movement.runSpeed*.75),0,1),running=move>.08&&!r.airborne&&!traversing;r.animPhase+=dt*(running?5.5+move*6:1.8);const swing=running?Math.sin(r.animPhase)*.68*move:Math.sin(r.animPhase)*.035;
      if(running&&now>=r.nextFootstepAt){playSpatialCue(r.footstepSide?'footstepRight':'footstepLeft',r.group.position.x,r.group.position.y,r.group.position.z,30,.48);r.footstepSide^=1;r.nextFootstepAt=now+THREE.MathUtils.lerp(540,315,move);}else if(!running)r.nextFootstepAt=Math.max(r.nextFootstepAt,now+120);
      r.legL.rotation.x=r.airborne?-.34:swing;r.legR.rotation.x=r.airborne?.34:-swing;r.armL.rotation.x=r.airborne?.28:-swing*.72;r.armR.rotation.x=r.airborne?-.20:swing*.52;r.armL.rotation.z=-.12;r.armR.rotation.z=.12;
      if(traversing){const p=traversalPoseNow.progress,wave=Math.sin(Math.PI*p);r.armL.rotation.x=-1.55-wave*.35;r.armR.rotation.x=-1.55-wave*.35;r.armL.rotation.z=-.24;r.armR.rotation.z=.24;r.legL.rotation.x=.48*wave;r.legR.rotation.x=-.30*wave;r.body.rotation.x=-.18*wave;r.head.rotation.x=.08*wave;}
      const reloadActive=r.reloadUntil>srv;if(!reloadActive){r.reloadUntil=0;r.reloadStartedAt=0;}const total=weaponRules(r.reloadWeapon||r.weapon)?.reloadMs||650,reloadP=reloadActive?THREE.MathUtils.clamp((srv-(r.reloadStartedAt||srv))/Math.max(1,total),0,1):0,reloadCurve=Math.sin(Math.PI*reloadP);const swapP=r.swapStartedAt?THREE.MathUtils.clamp((now-r.swapStartedAt)/360,0,1):1,swapCurve=swapP<1?Math.sin(Math.PI*swapP):0;if(swapP>=1)r.swapStartedAt=0;const kick=now<r.fireKickUntil?Math.sin(Math.PI*THREE.MathUtils.clamp((r.fireKickUntil-now)/170,0,1))*.18:0;
      r.armR.rotation.x+=reloadCurve*.95+kick;r.armR.rotation.z=.12-reloadCurve*.28;const lower=reloadCurve*.24+swapCurve*.34+(traversing?Math.sin(Math.PI*traversalPoseNow.progress)*.34:0);
      r.pistol.position.set(.45,1.08-lower,-.25+kick*.20);r.assault.position.set(.45,1.09-lower,-.38+kick*.24);r.shotgun.position.set(.45,1.10-lower,-.41+kick*.26);r.sniper.position.set(.45,1.10-lower,-.45+kick*.28);r.pistol.rotation.z=-reloadCurve*.45-swapCurve*.35;r.assault.rotation.z=-reloadCurve*.42-swapCurve*.35;r.shotgun.rotation.z=-reloadCurve*.34-swapCurve*.35;r.sniper.rotation.z=-reloadCurve*.25-swapCurve*.35;
      if(!traversing){r.body.rotation.x=r.airborne?-.08:running?Math.sin(r.animPhase*2)*.025:Math.sin(r.animPhase)*.012;r.head.rotation.x=r.ads?-.045:0;}
    }
    if(r.godRing?.visible){r.godRing.rotation.z+=dt*1.8;r.godRing.material.opacity=.66+.24*Math.sin(now*.004+r.group.position.x);}
  }
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
  shotgunGroup.position.set(THREE.MathUtils.lerp(.30,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.20,a)+commonY,THREE.MathUtils.lerp(-.50,-.44,a)+.17*recoil+commonZ);shotgunGroup.rotation.set(THREE.MathUtils.lerp(-.06,0,a)+.15*recoil+reloadCurve*.14,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12,-reloadRoll*.8-swapRoll-deathRoll);
  sniperGroup.position.set(THREE.MathUtils.lerp(.28,0,a)+commonX,THREE.MathUtils.lerp(-.28,-.18,a)+commonY,THREE.MathUtils.lerp(-.48,-.42,a)+.18*recoil+commonZ);sniperGroup.rotation.set(THREE.MathUtils.lerp(-.055,0,a)+.16*recoil+reloadCurve*.10,THREE.MathUtils.lerp(-.05,0,a)-reloadCurve*.12,-reloadRoll*.65-swapRoll-deathRoll);
  if(pistolMag)pistolMag.position.y=-.25-(reloading&&currentWeapon==='pistol'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.18)/.62,0,1))*.20:0);
  if(assaultMag)assaultMag.position.y=-.20-(reloading&&currentWeapon==='assault'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.15)/.68,0,1))*.28:0);
  if(sniperBolt)sniperBolt.position.z=-.12+(reloading&&currentWeapon==='sniper'?Math.sin(Math.PI*THREE.MathUtils.clamp((reloadP-.20)/.55,0,1))*.18:0);
  const traversalViewActive=!!traversePoseNow;sniperGroup.visible=!traversalViewActive&&currentWeapon==='sniper'&&adsBlend<.94;shotgunGroup.visible=!traversalViewActive&&currentWeapon==='shotgun';assaultGroup.visible=!traversalViewActive&&currentWeapon==='assault';pistolGroup.visible=!traversalViewActive&&currentWeapon==='pistol';
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
      mantleHands.position.set(0,-.01+pull*.05,-.02-reach*.06+pull*.03);mantleHands.rotation.x=-.08-reach*.10+pull*.13;
      mantleHands.children.forEach((limb,i)=>{const side=limb.userData.side|| (i?1:-1),stagger=vault?(i?-.07:.04):0,wave=Math.sin(Math.PI*THREE.MathUtils.clamp(traverseP+stagger,0,1));limb.position.x=side*(.18-.018*reach);limb.position.y=-.38+.10*reach-.05*pull+(vault?side*.018*wave:0);limb.position.z=-.64-.06*reach+.06*pull;limb.rotation.x=(vault?side*.12:0)*wave;limb.rotation.z=side*(.08-.12*reach);});
    }
  }
  pistolFlash.material.opacity=Math.max(0,pistolFlash.material.opacity-dt*18);assaultFlash.material.opacity=Math.max(0,assaultFlash.material.opacity-dt*22);shotgunFlash.material.opacity=Math.max(0,shotgunFlash.material.opacity-dt*20);sniperFlash.material.opacity=Math.max(0,sniperFlash.material.opacity-dt*18);
}
function normalizeAngle(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}

function applyViewportSize(metrics=shell.viewport){
  const nextW=Math.max(1,Math.round(metrics?.w||1)),nextH=Math.max(1,Math.round(metrics?.h||1));
  const sizeChanged=nextW!==viewW||nextH!==viewH;
  viewW=nextW;viewH=nextH;
  if(!camera||!renderer)return;
  const aspect=viewW/viewH;
  camera.aspect=aspect;
  const maxHorizontalFov=104*Math.PI/180;
  const landscapeVFov=2*Math.atan(Math.tan(maxHorizontalFov/2)/Math.max(1,aspect))*180/Math.PI;
  baseFov=THREE.MathUtils.clamp(landscapeVFov,58,72);
  if(adsBlend<.01)camera.fov=baseFov;
  camera.updateProjectionMatrix();
  if(sizeChanged){renderer.setSize(viewW,viewH,false);resizeHudOverlay();}
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
  const mapSize=compact?96:(isTouch?112:140),menuW=compact?36:42,menuH=compact?32:36;
  const teamW=compact?208:(isTouch?248:292),teamH=compact?32:36,joyR=compact?54:(isTouch?62:0);
  const fireR=compact?37:43,leftFireR=compact?32:37,aimR=compact?27:31,jumpR=compact?29:33,reloadR=compact?21:24,swapR=compact?23:26,modeR=swapR,equipR=compact?23:27,crouchR=compact?22:26;
  const bottom=safe.bottom+margin,weaponW=compact?158:(isTouch?174:198),weaponH=compact?50:(isTouch?54:58);
  const killW=compact?220:(isTouch?252:300),killH=compact?70:(isTouch?104:128);
  const teamX=(viewW-teamW)/2,teamY=safe.top+margin,moveBoundary=viewW*MOBILE_MOVE_ZONE_RATIO;
  const defaultJoyX=safe.left+joyR+margin;
  const defaultJoyY=viewH-bottom-joyR;
  const leftSpan=Math.max(120,moveBoundary-safe.left);
  const leftFireX=Math.max(safe.left+leftFireR+8,Math.min(moveBoundary-leftFireR-10,safe.left+leftSpan*.30));
  const equipX=Math.max(safe.left+equipR+8,Math.min(moveBoundary-equipR-10,safe.left+leftSpan*.63));
  const leftFireY=Math.max(safe.top+leftFireR+52,Math.min(viewH-bottom-leftFireR-118,viewH*.31));
  const crouchX=leftFireX,crouchY=Math.max(safe.top+crouchR+70,Math.min(viewH-bottom-crouchR-92,leftFireY+leftFireR+crouchR+9));
  const flashY=Math.max(safe.top+equipR+74,Math.min(viewH-bottom-equipR-112,viewH*.36));
  const stickyY=Math.max(flashY+equipR*2+8,Math.min(viewH-bottom-equipR-62,viewH*.54));
  const fireX=viewW-safe.right-margin-fireR,fireY=viewH-bottom-fireR;
  const aimX=fireX-fireR-aimR-11,aimY=fireY;
  const jumpX=fireX,jumpY=fireY-fireR-jumpR-11;
  const reloadX=aimX-aimR-reloadR-9,reloadY=fireY;
  const swapX=aimX,swapY=jumpY;
  const modeX=reloadX,modeY=jumpY;
  const weaponLift=isTouch?(fireR*3.75+8):0;
  return{compact,safe,moveBoundary,
    map:{x:viewW-safe.right-margin-mapSize,y:safe.top+margin,w:mapSize,h:mapSize},kill:{x:safe.left+margin,y:safe.top+margin,w:killW,h:killH},
    team:{x:teamX,y:teamY,w:teamW,h:teamH},god:{x:teamX-31,y:teamY,w:25,h:teamH},menu:{x:teamX+teamW+7,y:teamY,w:menuW,h:menuH},
    weapon:{x:viewW-safe.right-margin-weaponW,y:viewH-bottom-weaponH-weaponLift,w:weaponW,h:weaponH},joy:{x:defaultJoyX,y:defaultJoyY,r:joyR},
    leftFire:{x:leftFireX,y:leftFireY,r:leftFireR},crouch:{x:crouchX,y:crouchY,r:crouchR},flash:{x:equipX,y:flashY,r:equipR},sticky:{x:equipX,y:stickyY,r:equipR},
    fire:{x:fireX,y:fireY,r:fireR},aim:{x:aimX,y:aimY,r:aimR},jump:{x:jumpX,y:jumpY,r:jumpR},
    reload:{x:reloadX,y:reloadY,r:reloadR},swap:{x:swapX,y:swapY,r:swapR},mode:{x:modeX,y:modeY,r:modeR}
  };
}

function drawHud(now){
  const hudInterval=isTouch?33:16;
  if(now-hudLastDraw<hudInterval)return;hudLastDraw=now;if(!hudLayout)hudLayout=computeHudLayout();
  const c=hudCtx,s=hudScale,w=viewW,h=viewH,L=hudLayout,scoped=sniperScopeActive();
  c.setTransform(s,0,0,s,0,0);c.clearRect(0,0,w,h);c.textBaseline='middle';
  if(now<flashUntil){const a=now<flashPeakUntil?1:Math.max(0,(flashUntil-now)/Math.max(1,flashUntil-flashPeakUntil));c.fillStyle=`rgba(255,255,255,${Math.min(.96,a*.92)})`;c.fillRect(0,0,w,h);}c.lineCap='round';c.lineJoin='round';
  const missingHealth=Math.max(0,Math.min(1,(100-hp)/100)),hurtPulse=now<hurtUntil?Math.max(0,(hurtUntil-now)/700):0,damageAlpha=Math.min(.82,missingHealth*.58+hurtPulse*.38);
  if(damageAlpha>.01){const g=c.createRadialGradient(w/2,h/2,Math.min(w,h)*.10,w/2,h/2,Math.max(w,h)*.72);g.addColorStop(0,'rgba(255,18,40,0)');g.addColorStop(.58,`rgba(255,18,40,${damageAlpha*.12})`);g.addColorStop(.82,`rgba(185,0,22,${damageAlpha*.42})`);g.addColorStop(1,`rgba(125,0,16,${damageAlpha})`);c.fillStyle=g;c.fillRect(0,0,w,h);}
  drawBloodSplatter(c,w,h,now,missingHealth);
  if(scoped)drawScopeMask(c,w,h);else{drawKillFeed(c,L.kill,now);drawMiniMap(c,L.map);drawTeamBar(c,L.team);}
  if(godMode)drawGodBadge(c,L.god,now);drawMenuButton(c,L.menu);drawWeapon(c,L.weapon);
  const headshotHit=now<headshotUntil;
  if(scoped)drawScopeReticle(c,w,h,now<hitUntil,headshotHit);else drawWeaponCrosshair(c,w/2,h/2,currentWeapon,now<hitUntil,adsBlend,headshotHit);
  drawDamageIndicators(c,w,h,now);
  drawAnnouncer(c,w,h,now);drawMatchStatus(c,w,h);
  if(isTouch)drawTouchControls(c,L,now);
  if(killConfirmUntil>now)drawKillConfirm(c,w,h,now);
  if(scoreboardOpen)drawScoreboard(c,L);
  if(toastText&&now<toastUntil){c.font='800 11px system-ui';const tw=Math.min(w-30,c.measureText(toastText).width+24),tx=(w-tw)/2,ty=(scoped?L.safe.top+12:L.team.y+L.team.h+9);roundRect(c,tx,ty,tw,28,8,HUD_SURFACE,HUD_LINE);c.fillStyle='#fff';c.textAlign='center';c.fillText(toastText,w/2,ty+14);}
  if(hp<=0){c.fillStyle='rgba(24,3,8,.48)';c.fillRect(0,0,w,h);c.textAlign='center';c.fillStyle='#ff6676';c.font=`1000 ${L.compact?34:48}px system-ui`;c.fillText('ELIMINATED',w/2,h/2-19);c.font='900 11px system-ui';c.fillStyle='#ffd8dd';if(lastWastedBy)c.fillText(`${lastWastedBy}${lastWastedWeapon?' · '+weaponLabel(lastWastedWeapon):''}`,w/2,h/2+14);c.font='800 11px system-ui';c.fillStyle='#c8b4b8';c.fillText(`Respawning in ${Math.max(1,Math.ceil((wastedUntil-serverNow())/1000))}`,w/2,h/2+36);}
  hudTexture.needsUpdate=true;
}
function drawMatchStatus(c,w,h){
  if(matchState.status==='active')return;
  const text=matchState.status==='warmup'?matchClockText():matchState.status==='ended'?matchClockText():'WAITING FOR MATCH';
  const sub=matchState.status==='ended'?`Round ${matchState.round} · restarting shortly`:matchState.status==='warmup'?`Round ${matchState.round}`:'Waiting for players';
  c.save();c.textAlign='center';c.fillStyle='rgba(6,9,12,.70)';roundRect(c,w/2-128,h*.34-32,256,64,10,'rgba(6,9,12,.72)','rgba(255,255,255,.15)');c.fillStyle='#fff';c.font='1000 19px system-ui';c.fillText(text,w/2,h*.34-8);c.fillStyle=HUD_MUTED;c.font='850 9px system-ui';c.fillText(sub,w/2,h*.34+15);c.restore();
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
    const rows=allCombatStats(),leader=rows[0],limit=Math.max(1,matchState.scoreLimit||spec.scoreLimit);c.fillStyle=HUD_ACCENT;c.fillRect(r.x,r.y,3,r.h);c.fillStyle=TEAM_COLORS.red;c.fillRect(r.x+r.w-3,r.y,3,r.h);
    c.textAlign='left';c.font=`900 ${r.h<=32?7:8}px system-ui`;c.fillStyle='#dfe8ee';c.fillText('YOU',r.x+10,r.y+r.h/2);c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(myStats.kills||0),r.x+37,r.y+r.h/2);
    c.textAlign='center';c.font='1000 8px system-ui';c.fillStyle=matchState.status==='ended'?HUD_ACCENT:'#dbe4ea';c.fillText(clock,mid,r.y+r.h/2-4);c.font='800 6px system-ui';c.fillStyle='#69747d';c.fillText(`FFA · FIRST ${limit}`,mid,r.y+r.h/2+7);
    c.textAlign='right';c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(leader?.kills||0),r.x+r.w-37,r.y+r.h/2);c.font=`900 ${r.h<=32?7:8}px system-ui`;c.fillStyle='#ff9ca4';c.fillText('LEAD',r.x+r.w-10,r.y+r.h/2);return;
  }
  const rows=allCombatStats(),bluePlayers=rows.filter(p=>p.team==='blue').length,redPlayers=rows.filter(p=>p.team==='red').length,t=teamScores();c.fillStyle=TEAM_COLORS.blue;c.fillRect(r.x,r.y,3,r.h);c.fillStyle=TEAM_COLORS.red;c.fillRect(r.x+r.w-3,r.y,3,r.h);
  c.textAlign='left';c.font=`900 ${r.h<=32?7:8}px system-ui`;c.fillStyle='#8fc8ff';c.fillText('BLUE',r.x+10,r.y+r.h/2);c.textAlign='right';c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(spec.scoreType==='none'?bluePlayers:t.blue),mid-40,r.y+r.h/2);
  c.textAlign='center';c.font='1000 8px system-ui';c.fillStyle=matchState.status==='ended'?HUD_ACCENT:'#dbe4ea';c.fillText(clock,mid,r.y+r.h/2-4);c.font='800 6px system-ui';c.fillStyle='#69747d';c.fillText(spec.scoreType==='none'?'SANDBOX':`${matchCustom?'CUSTOM · ':''}FIRST ${Math.max(1,matchState.scoreLimit||spec.scoreLimit)}`,mid,r.y+r.h/2+7);
  c.textAlign='left';c.font=`1000 ${r.h<=32?14:16}px system-ui`;c.fillStyle='#fff';c.fillText(String(spec.scoreType==='none'?redPlayers:t.red),mid+40,r.y+r.h/2);c.textAlign='right';c.font=`900 ${r.h<=32?7:8}px system-ui`;c.fillStyle='#ff9ca4';c.fillText('RED',r.x+r.w-10,r.y+r.h/2);
}
function toggleScoreboard(){if(!shell.canPlay)return;scoreboardOpen=!scoreboardOpen;scoreboardDrag=null;if(scoreboardOpen){scoreboardScroll=0;touchRoles.clear();clearFireInput();cancelEquipmentAim();joy.x=joy.y=0;}}
function drawScoreboard(c,L){
  const rows=allCombatStats(),w=Math.min(viewW-L.safe.left-L.safe.right-28,L.compact?500:620),rowH=L.compact?24:27,headH=43,maxH=viewH-L.safe.top-L.safe.bottom-34;
  const visibleH=Math.min(maxH,Math.max(150,headH+Math.min(rows.length,7)*rowH+14)),x=(viewW-w)/2,y=Math.max(L.safe.top+L.team.h+15,(viewH-visibleH)/2);
  const bodyTop=y+headH,bodyH=visibleH-headH-9,contentH=rows.length*rowH,maxScroll=Math.max(0,contentH-bodyH);
  scoreboardScroll=Math.max(0,Math.min(maxScroll,scoreboardScroll));scoreboardPanel={x,y,w,h:visibleH,maxScroll,close:{x:x+w-42,y:y+5,w:32,h:28}};
  c.fillStyle='rgba(0,0,0,.44)';c.fillRect(0,0,viewW,viewH);roundRect(c,x,y,w,visibleH,12,'rgba(9,11,13,.97)','rgba(255,255,255,.18)');
  c.textAlign='left';c.fillStyle='#fff';c.font='1000 13px system-ui';c.fillText('SCOREBOARD',x+14,y+17);c.fillStyle='#737e87';c.font='900 8px system-ui';c.fillText(maxScroll?`${isTouch?'DRAG':'WHEEL'} TO SCROLL`:'ALL PLAYERS',x+108,y+17);
  roundRect(c,x+w-40,y+6,28,25,7,'rgba(255,255,255,.08)','rgba(255,255,255,.14)');c.fillStyle='#fff';c.font='1000 13px system-ui';c.textAlign='center';c.fillText('×',x+w-26,y+18.5);
  const nameX=x+14,kX=x+w-112,dX=x+w-67,kdX=x+w-18;c.fillStyle='#737e87';c.font='900 8px system-ui';c.textAlign='right';c.fillText('K',kX,y+35);c.fillText('D',dX,y+35);c.fillText('K/D',kdX,y+35);
  c.save();c.beginPath();c.rect(x+7,bodyTop,w-14,bodyH);c.clip();let ry=bodyTop-scoreboardScroll;
  for(const p of rows){if(ry+rowH>=bodyTop&&ry<=bodyTop+bodyH){const self=p.id===clientId;if(self){c.fillStyle='rgba(255,255,255,.06)';c.fillRect(x+7,ry,w-14,rowH-1);}c.fillStyle=p.id===clientId?HUD_ACCENT:(currentModeSpec().teamBased?(TEAM_COLORS[p.team]||'#fff'):TEAM_COLORS.red);c.fillRect(x+8,ry+5,3,rowH-10);c.textAlign='left';c.font=`${self?'1000':'850'} 10px system-ui`;c.fillStyle=self?'#fff':'#d6e0e8';c.fillText(`${p.godMode?'◆ ':''}${p.bot?'[BOT] ':''}${p.name}`,nameX,ry+rowH/2);c.textAlign='right';c.fillStyle='#fff';c.fillText(String(p.kills),kX,ry+rowH/2);c.fillStyle='#b9c5cf';c.fillText(String(p.deaths),dX,ry+rowH/2);c.fillText(p.deaths?(p.kills/p.deaths).toFixed(2):p.kills?String(p.kills):'0.00',kdX,ry+rowH/2);}ry+=rowH;}c.restore();
  if(maxScroll>0){const trackY=bodyTop+3,trackH=bodyH-6,thumbH=Math.max(24,trackH*(bodyH/contentH)),thumbY=trackY+(trackH-thumbH)*(scoreboardScroll/maxScroll);roundRect(c,x+w-6,trackY,2,trackH,1,'rgba(255,255,255,.08)');roundRect(c,x+w-7,thumbY,4,thumbH,2,'rgba(255,255,255,.35)');}
}

function drawKillConfirm(c,w,h,now){const remain=Math.max(0,Math.min(1,(killConfirmUntil-now)/1450)),a=Math.min(1,remain*2.5);c.save();c.globalAlpha=a;c.textAlign='center';c.fillStyle='#fff';c.font='1000 16px system-ui';c.fillText('ELIMINATED',w/2,h/2+48);c.fillStyle=killConfirmHeadshot?'#ffd36d':'#f0c96a';c.font='900 10px system-ui';const extra=killConfirmHeadshot?' · HEADSHOT':'';c.fillText(`${killConfirmName}${killConfirmWeapon?' · '+weaponLabel(killConfirmWeapon):''}${extra}`,w/2,h/2+68);c.restore();}
function queueAnnouncer(title,subtitle='',duration=1500,priority=1){const item={title:String(title||''),subtitle:String(subtitle||''),duration,priority};if(!item.title)return;if(announcerCurrent&&priority>announcerCurrent.priority){announcerQueue.unshift(announcerCurrent);announcerCurrent=null;}announcerQueue.push(item);announcerQueue.sort((a,b)=>b.priority-a.priority);}
function drawAnnouncer(c,w,h,now){if(announcerCurrent&&now>=announcerCurrent.until)announcerCurrent=null;if(!announcerCurrent&&announcerQueue.length){const next=announcerQueue.shift();announcerCurrent={...next,start:now,until:now+next.duration};soundAnnouncer(next.priority); }if(!announcerCurrent)return;const a=announcerCurrent,life=(now-a.start)/a.duration,fade=Math.min(1,life*6,(1-life)*5),scale=1+Math.max(0,.12-life*.45);c.save();c.translate(w/2,Math.max(62,h*.28));c.scale(scale,scale);c.globalAlpha=Math.max(0,fade);c.textAlign='center';c.shadowColor='rgba(0,0,0,.75)';c.shadowBlur=10;c.fillStyle='#fff';c.font=`1000 ${Math.max(20,Math.min(32,h*.065))}px system-ui`;c.fillText(a.title,0,0);if(a.subtitle){c.fillStyle=HUD_ACCENT;c.font=`900 ${Math.max(10,Math.min(14,h*.032))}px system-ui`;c.fillText(a.subtitle,0,25);}c.restore();}
function weaponLabel(w){return WEAPON_SPECS[w]?.name||'PISTOL';}
function drawWeapon(c,r){
  const spec=WEAPON_SPECS[currentWeapon],count=Math.max(0,Math.floor(ammo[currentWeapon]||0)),unlimited=!!godMode;
  const accent=currentWeapon==='sniper'?'#8edcff':currentWeapon==='shotgun'?'#ffad69':currentWeapon==='assault'?HUD_ACCENT:'#f4f6f7';
  roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);c.fillStyle=accent;c.fillRect(r.x,r.y,2.5,r.h);
  const left=r.x+10,top=r.y+11,right=r.x+r.w-9,mode=currentWeapon==='assault'?assaultFireMode.toUpperCase():'SEMI';
  c.textAlign='left';c.fillStyle='#fff';c.font=`1000 ${r.w<180?8.5:9.5}px system-ui`;c.fillText(spec.name,left,top);
  c.fillStyle=HUD_MUTED;c.font='850 6.5px system-ui';c.fillText(`${mode} · ${currentWeapon==='sniper'?sniperZoomLabel():(adsWanted?'ADS':'HIP')}`,left,top+13);
  c.textAlign='right';c.fillStyle=unlimited?HUD_ACCENT:count<=3?'#ff747d':'#fff';c.font=`1000 ${r.h<=60?22:24}px system-ui`;c.fillText(unlimited?'∞':String(count),right-23,top+6);c.fillStyle='#69747d';c.font='900 7px system-ui';c.fillText(unlimited?'∞':`/ ${spec.mag}`,right,top+8);
  const bx=left,by=r.y+r.h-7,bw=r.w-19,bh=2.5;roundRect(c,bx,by,bw,bh,2,'rgba(255,255,255,.09)');
  if(unlimited)roundRect(c,bx,by,bw,bh,2,HUD_ACCENT);else if(reloadUntil){const total=weaponRules(reloadWeapon||currentWeapon).reloadMs,remain=Math.max(0,reloadUntil-serverNow()),q=Math.max(0,Math.min(1,1-remain/total));roundRect(c,bx,by,bw*q,bh,2,HUD_ACCENT);c.fillStyle=HUD_ACCENT;c.font='900 6.5px system-ui';c.textAlign='left';c.fillText('RELOADING',left,by-7);}else roundRect(c,bx,by,bw*(count/spec.mag),bh,2,accent);
}
function minimapDotColor(rmt){return modeFriendly(rmt.team)?(!rmt.bot?'#62ef86':TEAM_COLORS[rmt.team]):TEAM_COLORS.red;}
function getMinimapStatic(w,h){
  const key=`${Math.round(w)}x${Math.round(h)}`;if(minimapStaticCache?.key===key)return minimapStaticCache.canvas;
  const q=document.createElement('canvas');q.width=Math.max(1,Math.round(w));q.height=Math.max(1,Math.round(h));const c=q.getContext('2d'),iw=q.width,ih=q.height,terrainCells=12,cellW=iw/terrainCells,cellH=ih/terrainCells;
  c.fillStyle='rgba(190,202,194,.18)';c.fillRect(0,0,iw,ih);for(let gy=0;gy<terrainCells;gy++)for(let gx=0;gx<terrainCells;gx++){const wx=-ARENA_LIMIT+(gx+.5)/terrainCells*ARENA_LIMIT*2,wz=-ARENA_LIMIT+(gy+.5)/terrainCells*ARENA_LIMIT*2,hv=terrainHeight(wx,wz),t=Math.max(0,Math.min(1,(hv+2.4)/16.2));c.fillStyle=`rgba(${Math.round(72+88*t)},${Math.round(102+55*t)},${Math.round(70+38*t)},${.18+.28*t})`;c.fillRect(gx*cellW,gy*cellH,cellW+.5,cellH+.5);}const toX=x=>(x+ARENA_LIMIT)/(ARENA_LIMIT*2)*iw,toY=z=>(z+ARENA_LIMIT)/(ARENA_LIMIT*2)*ih;c.fillStyle='rgba(210,216,220,.34)';for(const b of mapObstacles){if(b.type==='box'){const x1=toX(b.x-b.w/2),x2=toX(b.x+b.w/2),y1=toY(b.z-b.d/2),y2=toY(b.z+b.d/2);c.fillRect(x1,y1,x2-x1,y2-y1);}else if(b.type==='pyramid'){const px=toX(b.x),py=toY(b.z),rr=b.base/(ARENA_LIMIT*2)*iw*.55;c.beginPath();c.moveTo(px,py-rr);c.lineTo(px+rr,py+rr);c.lineTo(px-rr,py+rr);c.closePath();c.fill();}else{const px=toX(b.x),py=toY(b.z),rr=Math.max(1.3,(b.r||1)/(ARENA_LIMIT*2)*iw*1.6);c.beginPath();c.arc(px,py,rr,0,Math.PI*2);c.fillStyle=b.type==='tree'?'rgba(48,105,56,.72)':b.type==='bush'?'rgba(73,124,66,.58)':'rgba(156,160,158,.60)';c.fill();c.fillStyle='rgba(210,216,220,.34)';}}minimapStaticCache={key,canvas:q};return q;
}
function drawMiniMap(c,r){
  roundRect(c,r.x,r.y,r.w,r.h,9,HUD_SURFACE,HUD_LINE);const pad=8,ix=r.x+pad,iy=r.y+pad,iw=r.w-pad*2,ih=r.h-pad*2;c.save();c.beginPath();c.rect(ix,iy,iw,ih);c.clip();c.drawImage(getMinimapStatic(iw,ih),ix,iy,iw,ih);c.strokeStyle='rgba(255,255,255,.24)';c.lineWidth=1;c.strokeRect(ix+.5,iy+.5,iw-1,ih-1);const toX=x=>ix+(x+ARENA_LIMIT)/(ARENA_LIMIT*2)*iw,toY=z=>iy+(z+ARENA_LIMIT)/(ARENA_LIMIT*2)*ih,now=performance.now();
  for(const rmt of remotes.values()){if(!modeFriendly(rmt.team)&&now>=rmt.revealedUntil)continue;const px=toX(rmt.group.position.x),py=toY(rmt.group.position.z);c.beginPath();c.arc(px,py,3.4,0,Math.PI*2);const humanTeammate=!rmt.bot&&modeFriendly(rmt.team);c.fillStyle=minimapDotColor(rmt);c.fill();if(modeFriendly(rmt.team)){c.strokeStyle=humanTeammate?'#d8ffe3':'#fff';c.lineWidth=1;c.stroke();}}
  const px=toX(position.x),py=toY(position.z);c.save();c.translate(px,py);c.rotate(-yaw);c.beginPath();c.moveTo(0,-6);c.lineTo(4.5,5);c.lineTo(0,3);c.lineTo(-4.5,5);c.closePath();c.fillStyle=selfColor;c.fill();c.strokeStyle='#fff';c.lineWidth=1.2;c.stroke();c.restore();c.restore();c.fillStyle='#fff';c.font=`900 ${r.w<110?8:9}px system-ui`;c.textAlign='left';c.fillText(currentRoom||'----',r.x+9,r.y+r.h-8);c.textAlign='right';c.fillStyle='#c7d3dd';const humanCount=[...remotes.values()].filter(v=>!v.bot).length+1,botTotal=[...remotes.values()].filter(v=>v.bot).length;c.fillText(`${humanCount}P · ${botTotal}B`,r.x+r.w-9,r.y+r.h-8);c.textAlign='center';c.fillStyle='#65717a';c.font='800 6px system-ui';c.fillText(`v${APP_VERSION}`,r.x+r.w/2,r.y+r.h-8);
}
function handleKill(m){
  if(!m?.attacker||!m?.victim)return;const update=p=>{if(!p)return;if(p.id===clientId){myStats.kills=Number(p.kills)||0;myStats.deaths=Number(p.deaths)||0;}else{const r=remotes.get(p.id);if(r){r.kills=Number(p.kills)||0;r.deaths=Number(p.deaths)||0;}}};update(m.attacker);update(m.victim);
  if(m.victim.id===clientId){lastWastedBy=m.attacker.name||'Player';lastWastedWeapon=m.weapon||'';}
  const mine=m.attacker.id===clientId&&m.victim.id!==clientId,multi=Math.max(0,Number(m.multiKill)||0),distance=Math.max(0,Number(m.distance)||0);
  if(mine){
    killConfirmName=m.victim.name||'Player';killConfirmWeapon=m.weapon||'pistol';killConfirmHeadshot=!!m.headshot;killConfirmDistance=distance;killConfirmUntil=performance.now()+1450;soundKill();
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
  let y=r.y;for(const item of killFeed){const h=22,weapon=`${WEAPON_SPECS[item.weapon]?.short||'PST'}${item.headshot?' HS':''}`;if(y+h>r.y+r.h)break;
    roundRect(c,r.x,y,r.w,h,6,'rgba(9,11,13,.76)','rgba(255,255,255,.09)');
    const teamBased=currentModeSpec().teamBased,attackerColor=teamBased?(TEAM_COLORS[item.attacker.team]||'#fff'):(item.attacker.id===clientId?HUD_ACCENT:TEAM_COLORS.red),victimColor=teamBased?(TEAM_COLORS[item.victim.team]||'#fff'):(item.victim.id===clientId?HUD_ACCENT:TEAM_COLORS.red);c.fillStyle=attackerColor;c.fillRect(r.x,y,2,h);
    c.font='900 8px system-ui';c.textAlign='left';c.fillStyle='#fff';const attacker=item.attacker.name||'Player',victim=item.victim.name||'Player';c.fillText(attacker,r.x+8,y+h/2);
    const aw=c.measureText(attacker).width;c.fillStyle=item.headshot?HUD_ACCENT:'#6f7982';c.font='900 7px system-ui';c.fillText(`  ${weapon}  `,r.x+10+aw,y+h/2);
    const ww=c.measureText(`  ${weapon}  `).width;c.fillStyle=victimColor;c.font='900 8px system-ui';c.fillText(victim,r.x+12+aw+ww,y+h/2);y+=h+4;
  }
}
function drawGodBadge(c,r,now){const pulse=.6+.4*Math.sin(now*.005);roundRect(c,r.x,r.y,r.w,r.h,8,`rgba(215,255,88,${.10+.04*pulse})`,'rgba(215,255,88,.44)');const cx=r.x+r.w/2,cy=r.y+r.h/2;c.save();c.translate(cx,cy);c.strokeStyle=HUD_ACCENT;c.lineWidth=1.5;c.beginPath();c.moveTo(0,-7);c.lineTo(6,-4);c.lineTo(5,3);c.quadraticCurveTo(3,7,0,8);c.quadraticCurveTo(-3,7,-5,3);c.lineTo(-6,-4);c.closePath();c.stroke();c.beginPath();c.moveTo(-2,0);c.lineTo(0,2);c.lineTo(3,-3);c.stroke();c.restore();}
function drawMenuButton(c,r){roundRect(c,r.x,r.y,r.w,r.h,8,HUD_SURFACE,HUD_LINE);const cx=r.x+r.w/2,cy=r.y+r.h/2;c.save();c.strokeStyle='rgba(245,249,252,.92)';c.lineWidth=1.8;c.lineCap='round';for(const off of [-5,0,5]){c.beginPath();c.moveTo(cx-7,cy+off);c.lineTo(cx+7,cy+off);c.stroke();}c.restore();}
function drawWeaponCrosshair(c,x,y,weapon,hit,ads=0,headshot=false){const color=headshot?'#ffd36d':hit?'#fff':'rgba(255,255,255,.86)',gap=accuracyCrosshairRadius();c.save();c.strokeStyle=color;c.fillStyle=color;c.lineWidth=hit?2.35:1.65;c.lineCap='round';
  if(weapon==='shotgun'){const r=Math.max(8,gap),arc=.50;c.beginPath();for(let i=0;i<4;i++){const a=i*Math.PI/2-arc/2;c.arc(x,y,r,a,a+arc);}c.stroke();c.beginPath();c.arc(x,y,1.5,0,Math.PI*2);c.fill();}
  else{const len=weapon==='assault'?8:weapon==='sniper'?6:5.5,inner=Math.max(3.5,gap);if(weapon==='sniper')c.lineWidth=1.2;c.beginPath();c.moveTo(x-inner-len,y);c.lineTo(x-inner,y);c.moveTo(x+inner,y);c.lineTo(x+inner+len,y);c.moveTo(x,y-inner-len);c.lineTo(x,y-inner);c.moveTo(x,y+inner);c.lineTo(x,y+inner+len);c.stroke();c.beginPath();c.arc(x,y,weapon==='assault'?1.35:weapon==='sniper'?1.1:1.6,0,Math.PI*2);c.fill();}
  c.restore();}
function drawScopeMask(c,w,h){const r=Math.min(w,h)*.43,cx=w/2,cy=h/2;c.save();c.beginPath();c.rect(0,0,w,h);c.arc(cx,cy,r,0,Math.PI*2,true);c.fillStyle='rgba(0,0,0,.94)';c.fill('evenodd');c.strokeStyle='rgba(255,255,255,.22)';c.lineWidth=2;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();c.restore();}
function drawScopeReticle(c,w,h,hit,headshot=false){const r=Math.min(w,h)*.43,cx=w/2,cy=h/2;c.save();c.beginPath();c.arc(cx,cy,r-2,0,Math.PI*2);c.clip();c.strokeStyle=headshot?'#ffd36d':hit?'#fff':'rgba(20,20,20,.86)';c.lineWidth=1.2;c.beginPath();c.moveTo(cx-r,cy);c.lineTo(cx+r,cy);c.moveTo(cx,cy-r);c.lineTo(cx,cy+r);c.stroke();c.fillStyle=headshot?'#ffd36d':hit?'#fff':'rgba(15,15,15,.92)';c.beginPath();c.arc(cx,cy,2,0,Math.PI*2);c.fill();for(let i=1;i<=4;i++){const off=i*18;c.beginPath();c.moveTo(cx-5,cy+off);c.lineTo(cx+5,cy+off);c.stroke();}c.fillStyle='rgba(255,255,255,.76)';c.font='900 10px system-ui';c.textAlign='center';c.fillText(sniperZoomLabel(),cx,cy-r+18);c.restore();}
function drawTouchControls(c,L,now){
  c.save();if(touchRoleActive('joy')){const j={x:joy.centerX,y:joy.centerY,r:L.joy.r};c.beginPath();c.arc(j.x,j.y,j.r,0,Math.PI*2);c.fillStyle='rgba(9,11,13,.42)';c.fill();c.strokeStyle='rgba(255,255,255,.24)';c.lineWidth=1.5;c.stroke();c.beginPath();c.arc(j.x,j.y,j.r*.72,0,Math.PI*2);c.strokeStyle='rgba(255,255,255,.08)';c.stroke();const max=j.r*.45,sx=j.x+joy.x*max,sy=j.y+joy.y*max;c.beginPath();c.arc(sx,sy,j.r*.40,0,Math.PI*2);c.fillStyle='rgba(215,255,88,.16)';c.fill();c.strokeStyle='rgba(215,255,88,.42)';c.stroke();c.fillStyle='rgba(255,255,255,.58)';c.font='900 7px system-ui';c.textAlign='center';c.fillText('MOVE',j.x,j.y+j.r*.70);}c.restore();
  drawRoundControl(c,L.leftFire,now<touchVisual.fireUntil,'fire');drawRoundControl(c,L.crouch,crouched,'crouch');drawRoundControl(c,L.flash,equipmentAim.kind==='flash'||now<touchVisual.flashUntil,'flash');drawRoundControl(c,L.sticky,equipmentAim.kind==='sticky'||now<touchVisual.stickyUntil,'sticky');
  drawRoundControl(c,L.fire,now<touchVisual.fireUntil,'fire');drawRoundControl(c,L.aim,adsWanted,'aim');drawRoundControl(c,L.jump,now<touchVisual.jumpUntil,'jump');
  drawRoundControl(c,L.reload,now<touchVisual.reloadUntil||!!reloadUntil,'reload');drawRoundControl(c,L.swap,now<touchVisual.swapUntil,'swap');
  if(currentWeapon==='assault')drawRoundControl(c,L.mode,now<touchVisual.modeUntil||assaultFireMode==='auto','mode');
}
function drawRoundControl(c,b,active,type){
  c.save();c.beginPath();c.arc(b.x,b.y,b.r,0,Math.PI*2);const hot=type==='fire',aim=type==='aim';c.fillStyle=active?(aim?'rgba(215,255,88,.30)':hot?'rgba(255,95,103,.48)':'rgba(215,255,88,.22)'):(hot?'rgba(60,22,25,.56)':'rgba(9,11,13,.62)');c.fill();c.strokeStyle=active?(aim?HUD_ACCENT:hot?'rgba(255,132,139,.86)':HUD_ACCENT):(hot?'rgba(255,115,123,.52)':'rgba(255,255,255,.22)');c.lineWidth=active?2:1.4;c.stroke();drawControlIcon(c,b.x,b.y-b.r*.08,b.r,type,active);
  const label=type==='fire'?'FIRE':type==='aim'?(currentWeapon==='sniper'?(adsWanted?(sniperZoomLevel===1?'8X NEXT':'EXIT 8X'):'4X ADS'):'ADS'):type==='jump'?(traversal?'CLIMB':'JUMP'):type==='crouch'?(crouched?'STAND':'CROUCH'):type==='reload'?'RELOAD':type==='swap'?'SWAP':type==='mode'?assaultFireMode.toUpperCase():type==='flash'?(equipmentAim.kind==='flash'?'RELEASE':`FLASH ${godMode?'∞':equipment.flash}`):type==='sticky'?(equipmentAim.kind==='sticky'?'RELEASE':`STICKY ${godMode?'∞':equipment.sticky}`):'';c.textAlign='center';c.fillStyle=active?'#fff':'rgba(230,243,249,.68)';c.font=`900 ${Math.max(6.5,Math.min(8,b.r*.22))}px system-ui`;c.fillText(label,b.x,b.y+b.r*.56);c.restore();
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



function weaponShotSoundId(weapon='pistol'){return weapon==='shotgun'?'shotShotgun':weapon==='sniper'?'shotSniper':weapon==='assault'?'shotAssault':'shotPistol';}
function soundShot(weapon='pistol'){playSoundCue(weaponShotSoundId(weapon));}
function reloadSoundId(weapon=currentWeapon){return weapon==='shotgun'?'reloadShotgun':weapon==='sniper'?'reloadSniper':weapon==='assault'?'reloadAssault':'reloadPistol';}
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
function soundThrowableThrow(kind='flash'){playSoundCue(kind==='sticky'?'stickyThrow':'flashThrow');}
function soundThrowableImpact(kind='flash',m){if(!m)return;playSpatialCue(kind==='sticky'?'stickyImpact':'flashImpact',Number(m.x)||0,Number(m.y)||0,Number(m.z)||0,32,.85);}

function semtexBeepInterval(remainingMs){const p=1-THREE.MathUtils.clamp(Number(remainingMs||0)/1850,0,1);return Math.round(THREE.MathUtils.lerp(360,85,Math.pow(p,1.22)));}
function soundSemtexBeep(g,remainingMs){if(!g?.root)return;const p=1-THREE.MathUtils.clamp(Number(remainingMs||0)/1850,0,1),rate=1+p*.10,interval=semtexBeepInterval(remainingMs)/1000,pos=g.root.position;playSpatialCue('semtexBeep',pos.x,pos.y,pos.z,44,1,{playbackRate:rate,maxDuration:Math.max(.055,Math.min(.18,interval*.72))});}

function soundTacticalDetonation(kind,m){if(!m)return;playSpatialCue(kind==='flash'?'flashDetonate':'grenadeExplosion',Number(m.x)||0,Number(m.y)||0,Number(m.z)||0,kind==='sticky'?70:58,1);}
document.addEventListener('pointerdown',()=>{void ensureAudio();if(!shell.inMatch&&!masterMuted)startIntroMusic();},{capture:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)void gameAudio.resume();});
