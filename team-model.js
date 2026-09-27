// blue/red are legacy protocol/storage IDs. Alpha/Bravo are faction labels; colors are presentation outputs only.
export const TEAM_IDS=Object.freeze(['blue','red']);
export const TEAM_META=Object.freeze({
  blue:Object.freeze({id:'blue',key:'alpha',label:'ALPHA',color:'#54a9ff'}),
  red:Object.freeze({id:'red',key:'bravo',label:'BRAVO',color:'#ff3b45'}),
});
export const RELATIONSHIP=Object.freeze({SELF:'self',FRIENDLY_HUMAN:'friendly-human',FRIENDLY_BOT:'friendly-bot',ENEMY:'enemy'});
export const RELATIONSHIP_COLORS=Object.freeze({
  [RELATIONSHIP.SELF]:'#d7ff58',
  [RELATIONSHIP.FRIENDLY_HUMAN]:'#62ef86',
  [RELATIONSHIP.FRIENDLY_BOT]:'#54a9ff',
  [RELATIONSHIP.ENEMY]:'#ff3b45',
});
export function normalizeTeam(value){const v=String(value||'').trim().toLowerCase();return v==='red'||v==='bravo'?'red':'blue';}
export function otherTeam(value){return normalizeTeam(value)==='red'?'blue':'red';}
export function teamLabel(value){return TEAM_META[normalizeTeam(value)].label;}
export function teamKey(value){return TEAM_META[normalizeTeam(value)].key;}
export function factionColor(value){return TEAM_META[normalizeTeam(value)].color;}
export function relationshipFor({viewerTeam,actorTeam,teamBased=true,self=false,bot=false}={}){
  if(self)return RELATIONSHIP.SELF;
  if(!teamBased||normalizeTeam(actorTeam)!==normalizeTeam(viewerTeam))return RELATIONSHIP.ENEMY;
  return bot?RELATIONSHIP.FRIENDLY_BOT:RELATIONSHIP.FRIENDLY_HUMAN;
}
export function relationshipColor(role){return RELATIONSHIP_COLORS[role]||RELATIONSHIP_COLORS[RELATIONSHIP.ENEMY];}
