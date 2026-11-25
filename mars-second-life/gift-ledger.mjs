// Profile picture URL from a tiktok-live-connector user object (field names differ between versions).
export function avatarOf(user){const p=user?.profilePicture;const url=(p?.urls||p?.url||[])[0];return typeof url==='string'&&/^https:\/\//.test(url)?url.slice(0,500):null;}

// TikTok repeats the final message of streak gifts. Count only newly received gifts.
export class GiftLedger {
  constructor() { this.streaks=new Map();this.messages=new Map();this.nextSweep=0; }
  consume(event,now=Date.now()) {
    if(now>=this.nextSweep){
      this.nextSweep=now+1000;
      for(const [key,value] of this.streaks)if(now-value.at>60000)this.streaks.delete(key);
      for(const [key,at] of this.messages)if(now-at>60000)this.messages.delete(key);
    }
    while(this.messages.size>=50000)this.messages.delete(this.messages.keys().next().value);
    while(this.streaks.size>=30000)this.streaks.delete(this.streaks.keys().next().value);
    const messageId=event.msgId?String(event.msgId):'';
    if(messageId&&this.messages.has(messageId))return null;
    if(messageId)this.messages.set(messageId,now);
    const details=event.giftDetails||event.extendedGiftInfo||{};
    const coins=Math.max(1,Number(details.diamondCount||details.diamond_count||event.diamondCount)||1);
    const repeat=Math.max(1,Number(event.repeatCount)||1);
    const user=String(event.user?.nickname||event.user?.uniqueId||'LIVE VIEWER').slice(0,40);
    const avatar=avatarOf(event.user);
    let count=repeat;
    if(Number(details.giftType??event.giftType)===1){
      const key=`${event.user?.userId||event.user?.uniqueId||''}:${event.giftId||details.giftId||''}:${event.groupId||event.comboId||''}`;
      const previous=this.streaks.get(key);
      const newStreak=!previous||(previous.closed&&!event.repeatEnd)||repeat<(previous?.repeat||0);
      count=Math.max(0,repeat-(newStreak?0:previous.repeat));
      this.streaks.set(key,{repeat,at:now,closed:!!event.repeatEnd});
    }
    if(!count)return null;
    return {type:'gift',user,avatar,coins,count:Math.min(1000000,count),name:String(details.giftName||event.giftName||'Gift').slice(0,60)};
  }
}
