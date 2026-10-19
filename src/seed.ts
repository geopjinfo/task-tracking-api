import argon2 from 'argon2';
import { loadConfig } from './config/index.js';
import type { User } from './modules/identity/domain/user.js';
import { Database } from './platform/database/mongo.database.js';
import { newId } from './shared/ids.js';

export async function seedDevelopment(database:Database,nodeEnvironment:string):Promise<'created'|'exists'>{
  if(nodeEnvironment==='production')throw new Error('Development seed is disabled in production');
  const users=database.collection<User>('users'),emailNormalized='demo@example.test';
  if(await users.findOne({emailNormalized}))return 'exists';
  const now=new Date();
  await users.insertOne({id:newId(),emailNormalized,displayName:'Demo User',passwordHash:await argon2.hash('demo-password-change-me',{type:argon2.argon2id}),createdAt:now,updatedAt:now});
  return 'created';
}

async function main():Promise<void>{
  const config=loadConfig(),database=new Database(config);
  await database.connect();
  try{console.log(`Development seed ${await seedDevelopment(database,config.NODE_ENV)}`);}
  finally{await database.close();}
}

await main();
