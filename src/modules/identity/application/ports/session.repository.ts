import type { Session } from '../../domain/session.js';
export type RotationResult='rotated'|'invalid'|'expired'|'reused';
export interface SessionRepository{
 insert(session:Session):Promise<void>;
 rotate(tokenHash:string,replacement:Session,at:Date):Promise<RotationResult>;
 revokeFamily(familyId:string,at:Date):Promise<void>;
 revokeByTokenHash(tokenHash:string,at:Date):Promise<void>;
 revokeByUserId(userId:string,at:Date):Promise<void>;
}
