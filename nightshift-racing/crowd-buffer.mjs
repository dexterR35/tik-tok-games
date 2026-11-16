import {giftTier,validCount} from './dist/rules.js';

// A fixed-size accumulator: ten thousand viewers still produce <= 5 events per tick.
export class CrowdBuffer {
  constructor(){this.likes=0;this.lastUser='THE CROWD';this.gifts=new Map();this.receivedLikes=0;this.receivedGifts=0;}
  like(count,user='THE CROWD'){count=validCount(count);this.likes+=count;this.receivedLikes+=count;this.lastUser=String(user).slice(0,40);}
  gift(event){const tier=giftTier(event.coins);const old=this.gifts.get(tier);const count=validCount(event.count,1e6);if(!count)return;this.receivedGifts+=count;this.gifts.set(tier,{type:'gift',tier,coins:event.coins,count:(old?.count||0)+count,user:String(event.user||'THE CROWD').slice(0,40)});}
  flush(){const events=[];if(this.likes)events.push({type:'like',count:this.likes,user:this.lastUser});events.push(...this.gifts.values());this.likes=0;this.gifts.clear();return events;}
  clear(){this.likes=0;this.gifts.clear();}
}
