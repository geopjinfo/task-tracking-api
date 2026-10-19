import type { User } from '../../domain/user.js';
export interface UserRepository{insert(user:User):Promise<boolean>;findById(id:string):Promise<User|null>;findByEmail(emailNormalized:string):Promise<User|null>;updateDisplayName(id:string,displayName:string):Promise<User|null>;}
