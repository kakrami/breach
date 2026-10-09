/* Match presentation consumes authoritative state. It does not decide winners or
 * infer scores from a roster, whose membership can change during a match. */
import { gameModeSpec, GAME_MODES } from './game-config.js?v=2.22.1';
import { normalizeMatchState } from './match-model.js?v=2.22.1';

const count=value=>Number.isFinite(Number(value))?Math.max(0,Math.floor(Number(value))):0;
const KDA=Object.freeze([{key:'kills',label:'K',width:36},{key:'deaths',label:'D',width:34},{key:'ratio',label:'K/D',width:44}]);
const ACTIVITY=Object.freeze([{key:'kills',label:'ELIM',width:44},{key:'deaths',label:'D',width:34}]);
const INFECTION_STATS=Object.freeze([{key:'survival',label:'SURV',width:49},{key:'conversions',label:'CONV',width:43},{key:'assists',label:'AST',width:34},{key:'damage',label:'DMG',width:46}]);
export function matchSurvivalText(value){const seconds=Math.floor(count(value)/1000);return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
export function matchResultStat(player,key){
  if(key==='ratio')return(count(player.kills)/Math.max(1,count(player.deaths))).toFixed(2);
  if(key==='survival')return matchSurvivalText(player.survivalMs);
  if(key==='damage')return String(Math.max(0,Math.round(Number(player.infectionStats?.damage)||0)));
  if(['conversions','assists'].includes(key))return String(count(player.infectionStats?.[key]));
  return String(count(player[key]));
}

export function matchScoreboardPresentation(match={},options={}){
  const spec=gameModeSpec(match.mode),mode=spec.id,final=!!options.final,roundEnd=!!options.roundEnd&&!final;
  const blue=count(match.blueScore),red=count(match.redScore),custom=options.custom?'CUSTOM · ':'';
  const result={mode,teamBased:mode==='tdm'||mode==='infection'&&!final,groupLabels:{blue:'ALPHA',red:'BRAVO'},rosterTitle:'PLAYERS',statColumns:KDA,teamScores:{blue,red},title:final?'MATCH COMPLETE':'SCOREBOARD',subtitle:custom+spec.name,summary:'',detail:'',accent:'#d7ff58'};
  const reason=match.reason==='score'?'SCORE LIMIT':match.reason==='time'?'TIME LIMIT':'';
  if(mode==='zombies'){
    result.rosterTitle='SURVIVORS';result.statColumns=ACTIVITY;
    result.summary=`WAVE ${count(match.wave)} ${final?'REACHED':match.nextWaveAt?'COMPLETE':'IN PROGRESS'} · ${count(match.wavesCleared)} WAVES CLEARED`;
    result.detail=`${blue} ZOMBIES ELIMINATED`;
    if(final){const overrun=match.reason==='overrun';result.title=overrun?'OVERRUN':'RUN COMPLETE';if(overrun)result.accent='#ff6973';}
  }else if(mode==='sandbox'){
    result.statColumns=ACTIVITY;result.summary='PRACTICE SESSION';
    if(final)result.title=['host','host_return'].includes(match.reason)?'SESSION ENDED':'SESSION COMPLETE';
  }else if(mode==='infection'){
    result.statColumns=final||roundEnd?INFECTION_STATS:INFECTION_STATS.slice(1);result.groupLabels={blue:'SURVIVORS',red:'INFECTED'};
    result.teamScores=undefined;result.rosterTitle=final?'MATCH TOTALS':'PLAYERS';
    const round=count(match.infectionRound),rounds=Math.max(1,count(options.rounds||5));
    const completed=blue+red,roundLabel=final?(match.reason==='rounds'&&completed>=rounds?`${completed}/${rounds} ROUNDS COMPLETE`:`ENDED ${match.infectionPhase==='roundEnd'?'AFTER':'DURING'} ROUND ${round}/${rounds}`):`ROUND ${round}/${rounds}`;
    result.subtitle+=` · ${roundLabel}`;
    result.summary=`SURVIVORS ${blue} · INFECTED ${red}${final||roundEnd?' · ROUND WINS':''}`;
    if(final||roundEnd){
      const winner=final?match.winner:match.infectionWinner,scope=final?'MATCH':'ROUND';
      result.title=winner==='draw'?`${scope} DRAW`:winner==='blue'?`SURVIVORS WIN ${scope}`:winner==='red'?`INFECTED WIN ${scope}`:`${scope} COMPLETE`;
    }
  }else if(final){
    const winner=String(match.winner||''),hasWinner=mode==='tdm'?['blue','red'].includes(winner):!!match.winnerId;
    const draw=winner==='draw',won=mode==='tdm'?winner===options.selfTeam:String(match.winnerId)===String(options.selfId);
    result.title=draw?'DRAW':hasWinner&&!options.spectator?(won?'VICTORY':'DEFEAT'):'MATCH COMPLETE';
    result.accent=draw||!hasWinner||options.spectator?'#d7ff58':won?'#8ff0a9':'#ff6973';
    if(reason)result.subtitle+=' · '+reason;
    if(mode==='tdm')result.summary=`ALPHA ${blue} · BRAVO ${red}${hasWinner?' · '+(winner==='blue'?'ALPHA':'BRAVO')+' WINS':''}`;
    else{const name=String(options.rows?.find(p=>String(p.id)===String(match.winnerId))?.name||match.winnerName||'');result.summary=draw?'NO INDIVIDUAL WINNER':hasWinner?(name?`WINNER · ${name}`:'WINNER RECORDED'):'MATCH COMPLETE';}
  }else if(mode==='tdm')result.summary=`ALPHA ${blue} · BRAVO ${red}`;
  return result;
}

const frozen=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))frozen(child);Object.freeze(value);}return value;};
export function normalizeRoomResult(value){
  if(!value||value.schemaVersion!==1||!Object.hasOwn(GAME_MODES,value.match?.mode)||value.match?.status!=='ended'||!Array.isArray(value.players)||value.players.length>24)return null;
  const sessionId=String(value.sessionId||'').slice(0,64),endedAt=Number(value.endedAt);
  if(!sessionId||sessionId!==value.match.sessionId||!Number.isFinite(endedAt)||endedAt<=0||endedAt>8640000000000000||Number(value.match.endedAt)!==endedAt)return null;
  const match=normalizeMatchState(value.match,endedAt,value.match),ids=new Set(),players=[];
  for(const entry of value.players){
    const id=String(entry?.id||'').slice(0,80);if(!id||ids.has(id))return null;ids.add(id);
    const row={id,name:Array.from(String(entry.name||'Player')).slice(0,24).join(''),team:entry.team==='red'?'red':'blue',bot:!!entry.bot,kills:count(entry.kills),deaths:count(entry.deaths)};
    if(match.mode==='infection'){for(const key of ['infectionStats','infectionTotals'])row[key]=Object.fromEntries(['conversions','assists','damage','supplies'].map(stat=>[stat,Math.max(0,Number(entry[key]?.[stat])||0)]));row.survivalMs=count(entry.survivalMs);row.survivalTotalMs=count(entry.survivalTotalMs);row.cash=count(entry.cash);}
    if(match.mode!=='zombies'||!row.bot)players.push(row);
  }
  return frozen({schemaVersion:1,completion:value.completion==='practice'?'practice':'completed',version:String(value.version||'').slice(0,32),protocol:count(value.protocol),buildId:String(value.buildId||'').slice(0,80),sessionId,endedAt,mapId:String(value.mapId||'').slice(0,40),mapName:Array.from(String(value.mapName||value.mapId||'Map')).slice(0,64).join(''),custom:!!value.custom,match,players});
}
export function mergeRoomResult(previous,value,{replace=false}={}){
  const next=normalizeRoomResult(value);if(!next)return replace||value===null?null:previous;
  if(!replace&&previous&&(next.endedAt<previous.endedAt||next.sessionId===previous.sessionId))return previous;
  return next;
}
export function retainedMatchPresentation(result,{selfId,rounds=5}={}){
  const self=result.players.find(p=>String(p.id)===String(selfId)),match=result.match,presentation=matchScoreboardPresentation(match,{final:true,selfId,selfTeam:self?.team,spectator:!self,custom:result.custom,rounds,rows:result.players});
  const completed=new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date(result.endedAt));
  return{...presentation,kind:'results',allowClose:true,selfId,contextLine:`LAST RESULT · ${completed}`,rows:result.players.map(p=>({...p,infectionStats:p.infectionTotals,survivalMs:p.survivalTotalMs})).sort((a,b)=>(gameModeSpec(match.mode).teamBased?a.team.localeCompare(b.team):0)||(b.kills-a.kills)||(a.deaths-b.deaths)||(a.id===selfId?-1:b.id===selfId?1:0)||a.name.localeCompare(b.name)),footerLines:[...(match.mode==='infection'&&self?[`YOUR SURVIVAL ${matchSurvivalText(self.survivalTotalMs)} · ${self.cash} CREDITS`]:[]),result.mapName]};
}
