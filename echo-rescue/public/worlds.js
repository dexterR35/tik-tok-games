const themes = [
  { id:'moss',name:'Moss Circuit',biome:'garden',region:'THE OVERGROWN OUTPOST',color:'#b9ef72',secondary:'#82dfba',background:'#172b38',rock:'#7e657e',ground:'#8cbf72',path:'#e8d7b3',description:'A winding expedition through overgrown ruins and suspended garden bridges.',difficulty:'A gentle beginning',stars:1,mapPosition:[-10,0,3] },
  { id:'frost',name:'Glacier Relay',biome:'ice',region:'THE FROZEN FREQUENCY',color:'#8ddaff',secondary:'#a8aaff',background:'#192a49',rock:'#6a7baa',ground:'#abddea',path:'#e0f3f0',description:'A long frozen ridge with frost jets, crystal arches and broken crossings.',difficulty:'Keep your cool',stars:2,mapPosition:[-5,2,-3] },
  { id:'ember',name:'Ember Foundry',biome:'lava',region:'THE HEART OF THE FURNACE',color:'#ffb474',secondary:'#ff807c',background:'#332338',rock:'#75516b',ground:'#b17164',path:'#e6b497',description:'A sprawling factory route with pistons, suspended platforms and molten machinery.',difficulty:'Things are heating up',stars:3,mapPosition:[0,0,1] },
  { id:'cloud',name:'Cloudline Gardens',biome:'cloud',region:'A LITTLE CLOSER TO THE STARS',color:'#f4b4e0',secondary:'#bfacff',background:'#302945',rock:'#a08aad',ground:'#b7a2cf',path:'#f2ddd9',description:'A twisting sky route of pink canopies, wind fans and distant floating islands.',difficulty:'Hold on to your antenna',stars:3,mapPosition:[5.5,2.5,-3] },
  { id:'core',name:'Singularity Core',biome:'core',region:'WHERE THE ECHOES BEGIN',color:'#b8a1ff',secondary:'#77eee0',background:'#202039',rock:'#594d80',ground:'#78669f',path:'#c4b9df',description:'The longest route: reactor arches, energy gates and five-piece void crossings.',difficulty:'One last second chance',stars:4,mapPosition:[11,.4,2] },
];
const courses = [
  {length:3200,duration:95,speed:54,gaps:[[395,480,2],[930,1045,3],[1490,1610,3],[2110,2240,3],[2710,2840,3]],hazards:[680,1240,1880,2500,3000],type:'laser'},
  {length:3700,duration:105,speed:58,gaps:[[350,455,2],[880,1020,3],[1360,1500,3],[1900,2040,3],[2440,2590,4],[3080,3230,4]],hazards:[650,1190,1690,2240,2850,3440],type:'frost'},
  {length:4200,duration:115,speed:60,gaps:[[420,550,3],[1000,1150,4],[1620,1780,4],[2250,2430,4],[2930,3110,4],[3610,3790,4]],hazards:[270,760,1370,1990,2680,3340,4000],type:'piston'},
  {length:4600,duration:125,speed:62,gaps:[[360,480,3],[970,1110,3],[1600,1760,4],[2240,2400,4],[2870,3040,4],[3500,3670,4],[4110,4280,4]],hazards:[700,1390,2010,2630,3280,3910,4450],type:'wind'},
  {length:5200,duration:140,speed:64,gaps:[[380,525,3],[1040,1210,4],[1750,1930,4],[2450,2650,5],[3190,3390,5],[3920,4120,5],[4650,4860,5]],hazards:[240,790,1490,2190,2900,3650,4400,5070],type:'laser'},
];
export const WORLDS = themes.map((theme,index)=>{
  const course=courses[index],gaps=course.gaps.map(([from,to,pieces])=>({from,to,pieces}));
  const fastGaps=gaps.map((gap,i)=>({...gap,from:gap.from-70-i%2*15,to:gap.to-45-i%2*15}));
  const checkpoints=Array.from({length:Math.floor(course.length/650)},(_,i)=>(i+1)*650).filter(x=>x<course.length-100).map(x=>{const gap=gaps.find(g=>x>g.from-40&&x<g.to+40);return gap?gap.to+60:x;});
  return {...theme,length:course.length,duration:course.duration,speed:course.speed,gaps,fastGaps,checkpoints,hazards:course.hazards.map((x,i)=>({x,type:course.type,period:index===0?5:3.7+i%2*.5,active:index===0?2:1.7,offset:i*.6})),hint:'Build bridge pieces, protect E-07, and reach the next checkpoint.'};
});
export const hazardActive=(hazard,time)=>((time+hazard.offset)%hazard.period)<hazard.active;
export function memoryPositions(world,gaps=world.gaps){return [.18,.52,.94].map(fraction=>{let x=Math.round(world.length*fraction);const gap=gaps.find(g=>x>g.from-20&&x<g.to+20);return gap?gap.to+35:x;});}
export const MEMORY_POSITIONS=memoryPositions(WORLDS[0]);
export function trackPoint(x){return {x:(x-65)/42,y:Math.sin(x/540)*.65,z:Math.sin(x/310)*2+Math.sin(x/730)*1.6};}
export function trackTangent(x){const a=trackPoint(x),b=trackPoint(x+8),length=Math.hypot(b.x-a.x,b.z-a.z);return {x:(b.x-a.x)/length,z:(b.z-a.z)/length};}
export function followPose(x){const p=trackPoint(x),ahead=trackPoint(x+140),t=trackTangent(x);return {position:{x:p.x-t.x*9-t.z*8,y:p.y+8.2,z:p.z-t.z*9+t.x*8},target:{x:ahead.x,y:p.y+1.1,z:ahead.z},yaw:Math.atan2(t.x,t.z)};}
export function sanitizeProgress(value){const clean={};for(const world of WORLDS){const record=value?.[world.id];if(record&&Number.isInteger(record.stars)&&record.stars>=1&&record.stars<=3)clean[world.id]={stars:record.stars,bestTime:Number.isFinite(record.bestTime)&&record.bestTime>0?record.bestTime:world.duration};}return clean;}
