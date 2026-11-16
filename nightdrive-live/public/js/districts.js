import {CELL} from './simulation.js';
export const DISTRICTS=[
  {name:'RIVERSIDE',short:'Riverside',road:'Quayside Drive',color:'#759a91',id:'01',style:'river'},
  {name:'OLD QUARTER',short:'Old Quarter',road:'Mercer Street',color:'#aa9179',id:'02',style:'brick'},
  {name:'CENTRAL HEIGHTS',short:'Central Heights',road:'Foundry Avenue',color:'#8097ac',id:'03',style:'tower'},
  {name:'EAST WORKS',short:'East Works',road:'Depot Road',color:'#9b9e89',id:'04',style:'industrial'},
];
export const mod=(n,d)=>(n%d+d)%d;
export function districtAt(x,z){const col=Math.floor(x/CELL),row=Math.floor(-z/(CELL*5));return DISTRICTS[mod(Math.floor(col/3)+row,4)];}
export function isRiverCell(cx){return mod(cx,8)===3;}
export function streetAt(x,z,kind){const d=districtAt(x,z);return kind==='highway'?'METRO EXPRESSWAY':d.road.toUpperCase();}
