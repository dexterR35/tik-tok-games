export function createDemoState(){return {key:'',shield:-99,cube:-99,boost:-99,heal:-99};}
export function runDemo(game,state){
  if(game.phase!=='running'||game.paused||game.robot.rescued)return;
  const key=`${game.levelIndex}:${game.loop}`;if(state.key!==key)Object.assign(state,createDemoState(),{key});
  const r=game.robot,gap=game.nextGap,danger=game.hazards.some(h=>h.x>=r.x&&h.x-r.x<150);
  if((game.time>.5&&game.time<1)||(danger&&r.shieldUntil<game.time+1.5))if(game.time-state.shield>1.2){game.send('shield','mika · demo');state.shield=game.time;}
  if(gap&&gap.from-r.x<200&&!game.bridgeAt(gap)&&game.time-state.cube>.24){game.send('cube','noodle.bot · demo');state.cube=game.time;}
  if(game.time>2&&r.boostUntil<game.time&&game.time-state.boost>5){game.send('boost','pixelpilot · demo');state.boost=game.time;}
  if(r.hearts<3&&game.time-state.heal>1){game.send('heal','lunamoth · demo');state.heal=game.time;}
}
