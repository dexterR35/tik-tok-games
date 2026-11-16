import {planCityCell} from './city-plan.js';
self.onmessage=({data})=>{const plan=planCityCell(data.cx,data.cz);const groups={};const transfer=[];for(const [key,list]of Object.entries(plan.groups)){const buffer=new Float32Array(list);groups[key]=buffer;transfer.push(buffer.buffer);}self.postMessage({...plan,groups},transfer);};
