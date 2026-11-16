import {CELL,random} from './simulation.js';
import {districtAt,isRiverCell} from './districts.js';

// Pure, deterministic planning. A module worker runs this away from the render loop.
export function planCityCell(cx,cz){
  const r=random((Math.imul(cx,73856093)^Math.imul(cz,19349663))>>>0),groups={};
  const district=districtAt((cx+.5)*CELL,(cz+.5)*CELL),river=isRiverCell(cx);
  function add(key,x,y,z,w,h,d,rot=0,tileX=1,tileY=1){(groups[key]??=[]).push(x,y,z,w,h,d,rot,tileX,tileY);}
  const box=(key,x,y,z,w,h,d,rot=0)=>add(key,x,y,z,w,h,d,rot);
  // Roads terminate at the junction boundary. There are no coplanar road slabs.
  box('asphalt',0,-.07,120,28,.14,196);box('asphalt',120,-.07,0,196,.14,28);box('asphalt',0,-.07,0,44,.14,44);
  box('terrain',120,river?-2.2:-.40,120,240,.2,240);
  for(const offset of [-12.6,-.5,.5,12.6]){const mat=Math.abs(offset)<1?'yellow':'marking';box(mat,offset,.024,120,.11,.008,182);box(mat,120,.024,offset,182,.008,.11);}
  for(let k=44;k<206;k+=11)for(const offset of [-7.8,-4.2,4.2,7.8]){box('marking',offset,.025,k,.12,.008,3.5);box('marking',k,.025,offset,3.5,.008,.12);}
  // Road details are painted above the road, not competing with its depth.
  for(let k=-11;k<12;k+=2.5){box('marking',k,.026,29,1.1,.008,3.8);box('marking',29,.026,k,3.8,.008,1.1);}
  box('marking',6.6,.028,36,11.5,.008,.35);box('marking',36,.028,-6.6,.35,.008,11.5);
  box('paving',120,.035,18,204,.20,8);box('paving',18,.035,120,8,.20,204);
  box('paving',120,.035,222,204,.20,8);box('paving',222,.035,120,8,.20,204);
  for(let k=28;k<224;k+=8){box('curb',k,.145,14.6,7.7,.12,.35);box('curb',14.6,.145,k,.35,.12,7.7);}
  if(river){
    box('water',120,-1.25,120,174,.07,240);box('paving',27,-.4,120,10,1.0,240);box('paving',213,-.4,120,10,1.0,240);
    box('quay',33,-.7,120,2.5,2.0,240);box('quay',207,-.7,120,2.5,2.0,240);
    // East/west roads are bridges across the canal.
    box('bridge',120,-.27,0,196,.35,28);
    for(const side of [-1,1]){box('metal',120,.85,side*15,192,.09,.08);box('metal',120,.44,side*15,192,.06,.08);for(let k=30;k<216;k+=8)box('metal',k,.48,side*15,.07,.95,.07);}
  }else{
    box('paving',120,-.02,120,188,.18,188);
    box('alley',120,.081,120,8,.012,190);box('alley',120,.081,120,190,.012,8);
    const park=(district.style==='river'&&r()<.22)||((cx*13+cz*7)%11===0);
    if(park){
      box('grass',120,.09,120,174,.025,174);box('paving',120,.12,120,7,.025,174);box('paving',120,.12,120,174,.025,7);
      box('water',82,.15,90,28,.03,20);box('curb',82,.16,79,30,.2,.5);box('curb',82,.16,101,30,.2,.5);
      for(let i=0;i<23;i++)tree(42+r()*156,42+r()*156,4+r()*3);
    }else{
      const positions=district.style==='industrial'?[63,177]:[44,87,152,195];
      for(const x of positions)for(const z of positions){
        const industry=district.style==='industrial',tower=district.style==='tower';
        const w=industry?75+r()*7:27+r()*9,d=industry?68+r()*10:27+r()*10;
        const h=industry?8+r()*9:tower?24+Math.pow(r(),1.5)*68:8+r()*18;
        const facade=industry?'warehouse':tower?(r()<.5?'glass':'stone'):r()<.65?'brick':'plaster';
        add(facade,x,h/2+.14,z,w,h,d,0,w/23,h/24);
        box('roof',x,h+.22,z,w+.45,.35,d+.45);box('stoneTrim',x,1.7,z,w+.1,3.1,d+.1);
        box('cornice',x,h-.20,z,w+.8,.18,d+.8);
        for(let y=4;y<h-2;y+=tower?12:3.5){box('cornice',x,y,z,w+.14,.10,d+.14);}
        if(tower&&h>38){const topH=h*.16;add(facade,x,h+topH/2,z,w*.72,topH,d*.72,0,w*.72/23,topH/24);box('roof',x,h+topH+.2,z,w*.73,.35,d*.73);}
        for(let i=0;i<3;i++){const tx=x-w*.28+i*w*.28;
          box('shopGlass',tx,1.53,z-d/2-.065,w*.23,2.28,.06);
          box('awning',tx,2.9,z-d/2-.5,w*.25,.16,1.05);
          box('metal',tx-w*.12,1.4,z-d/2-.12,.055,2.45,.08);
        }
        // Recessed entrances, balconies and facade pilasters cast real depth.
        if(!industry&&!tower){
          for(const side of [-1,1])box('stoneTrim',x+side*(w/2-.6),h/2,z-d/2-.15,.45,h,.35);
          for(let y=6;y<h-1;y+=3.5)for(const offset of [-w*.28,w*.28]){
            box('stoneTrim',x+offset,y,z-d/2-.62,w*.22,.15,1.25);
            box('metal',x+offset,y+.65,z-d/2-1.15,w*.22,.07,.05);
            for(let k=-2;k<=2;k++)box('metal',x+offset+k*w*.04,y+.35,z-d/2-1.15,.035,.65,.04);
          }
        }
        box('roofPlant',x+w*.22,h+1,z,3+r()*3,1.4,2+r()*3);box('metal',x-w*.25,h+1.5,z+d*.2,.15,2.5,.15);
      }
    }
  }
  function tree(x,z,height=5){
    add('trunk',x,height*.32,z,.23,height*.64,.23);
    for(let i=0;i<5;i++){const angle=i/5*Math.PI*2,jitter=r()*.4;add('foliage',x+Math.sin(angle)*1.1,height*(.76+jitter*.2),z+Math.cos(angle)*1.0,1.8+r()*.5,2.0+r(),1.8+r()*.4);}
  }
  for(let k=42;k<224;k+=42){
    for(const swap of [false,true]){
      const x=swap?k:17,z=swap?17:k;
      box('metal',x,3.7,z,.12,7.4,.12);box('metal',swap?x:x-1.7,7.4,swap?z-1.7:z,swap?.12:3.4,.10,swap?3.4:.12);
      box('lamp',swap?x:x-3.3,7.35,swap?z-3.3:z,swap?.48:.75,.12,swap?.75:.48);
      if(k%84===42)tree(swap?k+9:23,swap?23:k+9,4.5+r());
      box('metal',swap?k+10:20,.38,swap?20:k+10,swap?2.7:.65,.12,swap?.65:2.7);
      box('bench',swap?k+10:20,.68,swap?20:k+10,swap?2.7:.65,.12,swap?.65:2.7);
    }
    box('drain',12.2,.026,k,.45,.018,.85);
  }
  return {cx,cz,district:district.name,river,groups};
}
