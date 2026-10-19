import type { Database } from './database.js';
import { AppError } from './shared.js';
export type Role = 'owner'|'admin'|'member';
export type MembershipDoc = { id:string; projectId:string; userId:string; role:Role; createdAt:Date };
const rank: Record<Role,number>={member:1,admin:2,owner:3};
export async function requireRole(db:Database,projectId:string,userId:string,minimum:Role='member'):Promise<MembershipDoc>{ const membership=await db.collection<MembershipDoc>('memberships').findOne({projectId,userId}); if(!membership||rank[membership.role]<rank[minimum]) throw new AppError(404,'RESOURCE_NOT_FOUND','Resource was not found'); return membership; }
