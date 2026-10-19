import type { Collection } from 'mongodb';
import type { EmailDeliveryRepository } from '../../application/ports/email-delivery.repository.js';
import type { InvitationEmailDelivery } from '../../domain/email-delivery.js';

export class MongoEmailDeliveryRepository implements EmailDeliveryRepository{
 constructor(private readonly deliveries:Collection<InvitationEmailDelivery>){}

 claim(now:Date,leaseUntil:Date):Promise<InvitationEmailDelivery|null>{
  return this.deliveries.findOneAndUpdate(
   {status:{$in:['pending','processing']},availableAt:{$lte:now},$or:[{leaseUntil:{$exists:false}},{leaseUntil:{$lte:now}}]},
   {$set:{status:'processing',leaseUntil},$inc:{attempts:1}},
   {sort:{createdAt:1,id:1},returnDocument:'after'}
  );
 }

 async markSent(id:string,at:Date):Promise<void>{
  await this.deliveries.updateOne({id,status:'processing'},{$set:{status:'sent',sentAt:at},$unset:{leaseUntil:'',acceptUrl:'',lastErrorCode:''}});
 }

 async retry(id:string,availableAt:Date,errorCode:string):Promise<void>{
  await this.deliveries.updateOne({id,status:'processing'},{$set:{status:'pending',availableAt,lastErrorCode:errorCode},$unset:{leaseUntil:''}});
 }

 async markFailed(id:string,errorCode:string):Promise<void>{
  await this.deliveries.updateOne({id},{$set:{status:'failed',lastErrorCode:errorCode},$unset:{leaseUntil:'',acceptUrl:''}});
 }
}
