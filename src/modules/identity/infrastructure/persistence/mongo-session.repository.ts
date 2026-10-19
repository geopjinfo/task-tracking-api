import type { Collection,MongoClient } from 'mongodb';
import type { RotationResult,SessionRepository } from '../../application/ports/session.repository.js';
import type { Session } from '../../domain/session.js';

export class MongoSessionRepository implements SessionRepository{
 constructor(private readonly sessions:Collection<Session>,private readonly client:MongoClient){}
 async insert(session:Session):Promise<void>{await this.sessions.insertOne(session);}
 async rotate(tokenHash:string,replacement:Session,at:Date):Promise<RotationResult>{
  return this.client.withSession(async mongoSession=>mongoSession.withTransaction(async()=>{
   const current=await this.sessions.findOne({tokenHash},{session:mongoSession});
   if(!current)return 'invalid';
   if(current.rotatedAt||current.revokedAt){await this.sessions.updateMany({familyId:current.familyId},{$set:{revokedAt:at}},{session:mongoSession});return 'reused';}
   if(current.expiresAt<=at)return 'expired';
   replacement.userId=current.userId;replacement.familyId=current.familyId;
   const updated=await this.sessions.updateOne({id:current.id,rotatedAt:{$exists:false},revokedAt:{$exists:false}},{$set:{rotatedAt:at}},{session:mongoSession});
   if(updated.modifiedCount!==1){await this.sessions.updateMany({familyId:current.familyId},{$set:{revokedAt:at}},{session:mongoSession});return 'reused';}
   await this.sessions.insertOne(replacement,{session:mongoSession});
   return 'rotated';
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}));
 }
 async revokeFamily(familyId:string,at:Date):Promise<void>{await this.sessions.updateMany({familyId,revokedAt:{$exists:false}},{$set:{revokedAt:at}});}
 async revokeByTokenHash(tokenHash:string,at:Date):Promise<void>{await this.sessions.updateOne({tokenHash,revokedAt:{$exists:false}},{$set:{revokedAt:at}});}
 async revokeByUserId(userId:string,at:Date):Promise<void>{await this.sessions.updateMany({userId,revokedAt:{$exists:false}},{$set:{revokedAt:at}});}
}
