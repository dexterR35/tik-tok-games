export class FramePump {
  constructor(present){this.present=present;this.lastRaf=performance.now();this.lastPresent=0;this.source='animation-frame';this.running=false;this.recovering=false;this.stableRaf=0;}
  start(){
    this.running=true;const render=(now,source)=>{if(!this.running||document.hidden||now-this.lastPresent<7)return;this.lastPresent=now;this.source=source;this.present(now);};
    const raf=now=>{if(!this.running)return;this.stableRaf=now-this.lastRaf<45?this.stableRaf+1:0;this.lastRaf=now;if(this.recovering&&this.stableRaf>=12)this.recovering=false;if(!this.recovering)render(now,'animation-frame');requestAnimationFrame(raf);};requestAnimationFrame(raf);
    try{this.worker=new Worker(new URL('./frame-timer-worker.js',import.meta.url),{type:'module'});this.worker.onmessage=()=>{const now=performance.now();if(now-this.lastRaf>100)this.recovering=true;if(this.recovering)render(now,'occlusion-recovery');};}catch{this.worker=null;}
    window.addEventListener('pagehide',()=>{this.running=false;this.worker?.terminate();},{once:true});
  }
}
