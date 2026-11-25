// Real-clock sun position (NOAA simplified solar equations). Pure functions so
// the lighting can be tested in Node and driven by the browser clock.
const RAD=Math.PI/180;
export const clamp01=v=>Math.max(0,Math.min(1,v));
export const smoothstep=(a,b,v)=>{const t=clamp01((v-a)/(b-a));return t*t*(3-2*t);};

// Longitude is estimated from the standard (non-DST) timezone offset unless
// supplied. Latitude defaults to 45°N (Bucharest is 44.4°N).
export function defaultLocation(date=new Date()){
  const y=date.getFullYear(),jan=new Date(y,0,1).getTimezoneOffset(),jul=new Date(y,6,1).getTimezoneOffset();
  const standard=Math.max(jan,jul);
  return {lat:45,lon:Math.max(-180,Math.min(180,-standard/4))};
}

export function sunPosition(date,lat,lon){
  const jd=date.getTime()/86400000+2440587.5,t=(jd-2451545)/36525;
  const l0=(280.46646+t*(36000.76983+t*.0003032))%360;
  const m=357.52911+t*(35999.05029-.0001537*t);
  const e=.016708634-t*(.000042037+.0000001267*t);
  const c=Math.sin(m*RAD)*(1.914602-t*(.004817+.000014*t))+Math.sin(2*m*RAD)*(.019993-.000101*t)+Math.sin(3*m*RAD)*.000289;
  const trueLong=l0+c,omega=125.04-1934.136*t,lambda=trueLong-.00569-.00478*Math.sin(omega*RAD);
  const eps0=23+(26+(21.448-t*(46.815+t*(.00059-t*.001813)))/60)/60,eps=eps0+.00256*Math.cos(omega*RAD);
  const decl=Math.asin(Math.sin(eps*RAD)*Math.sin(lambda*RAD));
  const y=Math.tan(eps*RAD/2)**2;
  const eqTime=4/RAD*(y*Math.sin(2*l0*RAD)-2*e*Math.sin(m*RAD)+4*e*y*Math.sin(m*RAD)*Math.cos(2*l0*RAD)-.5*y*y*Math.sin(4*l0*RAD)-1.25*e*e*Math.sin(2*m*RAD));
  const utcMinutes=date.getUTCHours()*60+date.getUTCMinutes()+date.getUTCSeconds()/60;
  let tst=(utcMinutes+eqTime+4*lon)%1440;if(tst<0)tst+=1440;
  const ha=(tst/4<0?tst/4+180:tst/4-180)*RAD;
  const latR=lat*RAD;
  const cosZen=Math.sin(latR)*Math.sin(decl)+Math.cos(latR)*Math.cos(decl)*Math.cos(ha);
  const zen=Math.acos(Math.max(-1,Math.min(1,cosZen)));
  const elevation=90-zen/RAD;
  let azimuth=Math.atan2(Math.sin(ha),Math.cos(ha)*Math.sin(latR)-Math.tan(decl)*Math.cos(latR))/RAD+180;
  azimuth=(azimuth+360)%360;
  return {elevation,azimuth};
}

// A few keyframes by sun elevation: [elevation, zenith, horizon, sunColor, ambientSky, ambientGround]
const KEYS=[
  [-18,'#03060d','#0b1220','#7f96c8','#26304a','#0d0f14'],
  [-9,'#0a1328','#1c2440','#8ba0d0','#2d3858','#121419'],
  [-4,'#1b2850','#7a4d58','#ff9a6a','#4d4a68','#1d1b1e'],
  [0,'#355178','#e58a5a','#ffb27a','#8a7d88','#3a3530'],
  [6,'#5a7ea6','#efc49a','#ffd2a0','#b9b8b2','#5a5a50'],
  [18,'#7097b8','#cfd5cb','#ffecd2','#d9e3e5','#737567'],
  [60,'#6a92b6','#c3d0d2','#fff4e4','#dde7ea','#77796b'],
];
const hex=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const toHex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
function interp(elevation,index){
  const e=Math.max(KEYS[0][0],Math.min(KEYS.at(-1)[0],elevation));
  let i=0;while(i<KEYS.length-2&&KEYS[i+1][0]<e)i++;
  const a=KEYS[i],b=KEYS[i+1],t=smoothstep(a[0],b[0],e),ca=hex(a[index]),cb=hex(b[index]);
  return toHex(ca.map((v,k)=>v+(cb[k]-v)*t));
}

export function phaseName(elevation,rising){
  if(elevation<-6)return 'NIGHT';
  if(elevation<8)return rising?'SUNRISE':'SUNSET';
  if(elevation<20)return rising?'MORNING':'EVENING';
  return 'DAY';
}

// Everything the renderer and HUD need, derived from one clock reading.
export function lightingAt(date,location=defaultLocation(date)){
  const {elevation,azimuth}=sunPosition(date,location.lat,location.lon);
  const later=sunPosition(new Date(date.getTime()+600000),location.lat,location.lon).elevation;
  const night=1-smoothstep(-9,3,elevation);
  const day=smoothstep(-3,22,elevation);
  const twilight=clamp01(1-Math.abs(elevation+1)/9);
  return {
    elevation,azimuth,night,day,twilight,rising:later>elevation,phase:phaseName(elevation,later>elevation),
    zenith:interp(elevation,1),horizon:interp(elevation,2),sunColor:interp(elevation,3),
    ambientSky:interp(elevation,4),ambientGround:interp(elevation,5),
    sunIntensity:2.15*smoothstep(-2,14,elevation),moonIntensity:.42*night,
    ambientIntensity:.62+1.45*day+.75*twilight*(1-day),exposure:1.03+.32*night,
    lampsOn:elevation<4,
  };
}

// Parse an optional ?time=HH:MM override, keeping today's date.
export function clockFrom(search,now=new Date()){
  const p=new URLSearchParams(search),time=p.get('time');
  if(time&&/^\d{1,2}:\d{2}$/.test(time)){const [h,m]=time.split(':').map(Number);const d=new Date(now);d.setHours(h,m,0,0);return d;}
  return now;
}
