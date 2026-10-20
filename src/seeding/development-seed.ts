import argon2 from 'argon2';
import type { User } from '../modules/identity/domain/user.js';
import { newId } from '../shared/ids.js';

export interface UserStore{
 findOne(filter:{emailNormalized:string}):Promise<User|null>;
 insertOne(user:User):Promise<unknown>;
}

export async function seedDevelopment(users:UserStore,nodeEnvironment:string):Promise<'created'|'exists'>{
 if(nodeEnvironment==='production')throw new Error('Development seed is disabled in production');
 const emailNormalized='demo@example.test';
 if(await users.findOne({emailNormalized}))return 'exists';
 const now=new Date();
 await users.insertOne({id:newId(),emailNormalized,displayName:'Demo User',passwordHash:await argon2.hash('demo-password-change-me',{type:argon2.argon2id}),createdAt:now,updatedAt:now});
 return 'created';
}
