import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { NextFunction, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config.js';
import type { Database } from './database.js';
import { AppError, newId, requestContext } from './shared.js';

export type UserDoc = { id: string; emailNormalized: string; displayName: string; passwordHash: string; createdAt: Date; updatedAt: Date };
type SessionDoc = { id: string; userId: string; familyId: string; tokenHash: string; expiresAt: Date; rotatedAt?: Date; revokedAt?: Date; createdAt: Date };
const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export class AuthService {
  private readonly key: Uint8Array;
  constructor(private readonly db: Database, private readonly config: Config) { this.key = new TextEncoder().encode(config.JWT_SECRET); }
  async register(email: string, displayName: string, password: string): Promise<{ user: Omit<UserDoc,'passwordHash'>; accessToken: string; refreshToken: string }> {
    const now = new Date(); const user: UserDoc = { id: newId(), emailNormalized: email.trim().toLowerCase(), displayName: displayName.trim(), passwordHash: await argon2.hash(password, { type: argon2.argon2id }), createdAt: now, updatedAt: now };
    try { await this.db.collection<UserDoc>('users').insertOne(user); } catch (error: unknown) { if (String(error).includes('E11000')) throw new AppError(409,'EMAIL_EXISTS','An account already exists for this email'); throw error; }
    const tokens = await this.createSession(user.id); return { user: this.safeUser(user), ...tokens };
  }
  async login(email: string, password: string): Promise<{ user: Omit<UserDoc,'passwordHash'>; accessToken: string; refreshToken: string }> {
    const user = await this.db.collection<UserDoc>('users').findOne({ emailNormalized: email.trim().toLowerCase() });
    if (!user || !(await argon2.verify(user.passwordHash, password))) throw new AppError(401,'INVALID_CREDENTIALS','Email or password is incorrect');
    const tokens = await this.createSession(user.id); return { user: this.safeUser(user), ...tokens };
  }
  async refresh(raw: string): Promise<{ accessToken: string; refreshToken: string }> {
    const sessions = this.db.collection<SessionDoc>('sessions'); const session = await sessions.findOne({ tokenHash: hashToken(raw) });
    if (!session) throw new AppError(401,'INVALID_REFRESH_TOKEN','Refresh token is invalid');
    if (session.rotatedAt || session.revokedAt) { await sessions.updateMany({ familyId: session.familyId }, { $set: { revokedAt: new Date() } }); throw new AppError(401,'REFRESH_REUSE_DETECTED','Session family has been revoked'); }
    if (session.expiresAt <= new Date()) throw new AppError(401,'REFRESH_TOKEN_EXPIRED','Refresh token has expired');
    await sessions.updateOne({ id: session.id }, { $set: { rotatedAt: new Date() } }); return this.createSession(session.userId, session.familyId);
  }
  async logout(raw: string | undefined): Promise<void> { if (raw) await this.db.collection<SessionDoc>('sessions').updateOne({ tokenHash: hashToken(raw) }, { $set: { revokedAt: new Date() } }); }
  async verify(token: string): Promise<{ userId: string; sessionId: string }> {
    try { const { payload } = await jwtVerify(token, this.key, { issuer: this.config.JWT_ISSUER, audience: this.config.JWT_AUDIENCE, algorithms: ['HS256'] }); if (!payload.sub || typeof payload.sid !== 'string') throw new Error('claims'); return { userId: payload.sub, sessionId: payload.sid }; } catch { throw new AppError(401,'INVALID_ACCESS_TOKEN','Access token is invalid or expired'); }
  }
  private async createSession(userId: string, familyId = newId()): Promise<{ accessToken: string; refreshToken: string }> {
    const id = newId(), refreshToken = randomBytes(48).toString('base64url'), now = new Date(), expiresAt = new Date(now.getTime() + this.config.REFRESH_TOKEN_TTL_DAYS*86400000);
    await this.db.collection<SessionDoc>('sessions').insertOne({ id,userId,familyId,tokenHash:hashToken(refreshToken),createdAt:now,expiresAt });
    const accessToken = await new SignJWT({ sid:id }).setProtectedHeader({ alg:'HS256' }).setSubject(userId).setIssuer(this.config.JWT_ISSUER).setAudience(this.config.JWT_AUDIENCE).setIssuedAt().setExpirationTime(`${String(this.config.ACCESS_TOKEN_TTL_SECONDS)}s`).sign(this.key);
    return { accessToken, refreshToken };
  }
  private safeUser(user:UserDoc):Omit<UserDoc,'passwordHash'>{return {id:user.id,emailNormalized:user.emailNormalized,displayName:user.displayName,createdAt:user.createdAt,updatedAt:user.updatedAt};}
}
export const authMiddleware = (auth: AuthService) => async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try { const value=req.header('authorization'); if (!value?.startsWith('Bearer ')) throw new AppError(401,'AUTH_REQUIRED','Authentication is required'); req.auth=await auth.verify(value.slice(7)); const ctx=requestContext.getStore(); if(ctx) ctx.userId=req.auth.userId; next(); } catch(error:unknown){ next(error); }
};
