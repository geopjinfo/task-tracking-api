import type { EmailDeliveryRepository } from './ports/email-delivery.repository.js';
import type { MailerPort } from './ports/mailer.js';

export class EmailDeliveryWorker{
 private timer?:NodeJS.Timeout;
 private running=false;

 constructor(private readonly deliveries:EmailDeliveryRepository,private readonly mailer:MailerPort){}

 start():void{
  this.timer=setInterval(()=>{void this.tick();},1000);
  this.timer.unref();
 }

 stop():void{if(this.timer)clearInterval(this.timer);}

 async tick():Promise<void>{
  if(this.running)return;
  this.running=true;
  let claimed:{id:string;attempts:number}|undefined;
  try{
   const now=new Date();
   const delivery=await this.deliveries.claim(now,new Date(now.getTime()+30000));
   if(!delivery)return;
   claimed={id:delivery.id,attempts:delivery.attempts};
   if(!delivery.acceptUrl){await this.deliveries.markFailed(delivery.id,'INVALID_DELIVERY');return;}
   await this.mailer.sendInvitation({to:delivery.recipientEmailNormalized,acceptUrl:delivery.acceptUrl,idempotencyKey:delivery.idempotencyKey});
   await this.deliveries.markSent(delivery.id,new Date());
  }catch{
   if(claimed){
    if(claimed.attempts>=10)await this.deliveries.markFailed(claimed.id,'DELIVERY_FAILED');
    else{
     const base=1000*2**Math.max(0,claimed.attempts-1);
     const jitter=Math.floor(Math.random()*Math.min(1000,base/5));
     await this.deliveries.retry(claimed.id,new Date(Date.now()+Math.min(60000,base+jitter)),'DELIVERY_FAILED');
    }
   }
  }finally{this.running=false;}
 }
}
