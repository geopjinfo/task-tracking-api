import type { Db,Document } from 'mongodb';

export interface MigrationRecord extends Document{
 id:string;
 description:string;
 appliedAt:Date;
}

interface Migration{
 id:string;
 description:string;
 up:(database:Db)=>Promise<void>;
}

const initialIndexes:Migration={
 id:'001-initial-indexes',
 description:'Create application uniqueness, query, worker, and TTL indexes',
 up:async database=>{await Promise.all([
  database.collection('users').createIndex({id:1},{unique:true}),database.collection('users').createIndex({emailNormalized:1},{unique:true}),
  database.collection('sessions').createIndex({tokenHash:1},{unique:true}),database.collection('sessions').createIndex({familyId:1}),database.collection('sessions').createIndex({userId:1,revokedAt:1}),database.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}),
  database.collection('projects').createIndex({id:1},{unique:true}),database.collection('projects').createIndex({ownerId:1,createdAt:-1}),
  database.collection('memberships').createIndex({projectId:1,userId:1},{unique:true}),database.collection('memberships').createIndex({userId:1,createdAt:-1}),
  database.collection('invitations').createIndex({tokenHash:1},{unique:true}),database.collection('invitations').createIndex({projectId:1,status:1,emailNormalized:1},{unique:true,partialFilterExpression:{status:'pending'}}),database.collection('invitations').createIndex({expiresAt:1},{expireAfterSeconds:0,partialFilterExpression:{status:'pending'}}),
  database.collection('tasks').createIndex({id:1},{unique:true}),database.collection('tasks').createIndex({projectId:1,createdAt:-1,id:-1}),database.collection('tasks').createIndex({projectId:1,status:1,createdAt:-1,id:-1}),database.collection('tasks').createIndex({projectId:1,assigneeId:1,createdAt:-1,id:-1}),database.collection('tasks').createIndex({assigneeId:1,createdAt:-1,id:-1}),database.collection('tasks').createIndex({projectId:1,dueDate:1,id:1}),database.collection('tasks').createIndex({title:'text',description:'text'}),
  database.collection('comments').createIndex({id:1},{unique:true}),database.collection('comments').createIndex({taskId:1,createdAt:1,id:1}),database.collection('attachments').createIndex({id:1},{unique:true}),database.collection('attachments').createIndex({objectKey:1},{unique:true}),database.collection('attachments').createIndex({taskId:1,createdAt:1,id:1}),database.collection('attachments').createIndex({status:1,createdAt:1}),
  database.collection('notifications').createIndex({id:1},{unique:true}),database.collection('notifications').createIndex({deliveryKey:1},{unique:true}),database.collection('notifications').createIndex({recipientId:1,projectId:1,createdAt:-1,id:-1}),database.collection('notifications').createIndex({recipientId:1,projectId:1,readAt:1,createdAt:-1}),
  database.collection('outbox_events').createIndex({id:1},{unique:true}),database.collection('outbox_events').createIndex({status:1,availableAt:1,leaseUntil:1,createdAt:1,id:1}),
  database.collection('ai_usage').createIndex({id:1},{unique:true}),database.collection('ai_usage').createIndex({userId:1,projectId:1,createdAt:-1}),
  database.collection('email_deliveries').createIndex({id:1},{unique:true}),database.collection('email_deliveries').createIndex({invitationId:1,deliveryKind:1},{unique:true}),database.collection('email_deliveries').createIndex({status:1,availableAt:1,leaseUntil:1,createdAt:1,id:1})
 ])}
};

export const migrations:readonly Migration[]=[initialIndexes];

export async function runMigrations(database:Db):Promise<void>{
 const ledger=database.collection<MigrationRecord>('_schema_migrations');
 await ledger.createIndex({id:1},{unique:true});
 const applied=new Set((await ledger.find({},{projection:{id:1}}).toArray()).map(record=>record.id));
 for(const migration of migrations){
  if(applied.has(migration.id))continue;
  await migration.up(database);
  await ledger.updateOne(
   {id:migration.id},
   {$setOnInsert:{id:migration.id,description:migration.description,appliedAt:new Date()}},
   {upsert:true}
  );
 }
}
