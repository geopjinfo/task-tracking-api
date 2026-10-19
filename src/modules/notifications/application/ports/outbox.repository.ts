import type { NotificationEvent,OutboxEvent } from '../../domain/events.js';
export interface OutboxWriter{append(event:NotificationEvent):Promise<void>}
export interface OutboxRepository extends OutboxWriter{claim(now:Date,leaseUntil:Date):Promise<OutboxEvent|null>;markProcessed(id:string,at:Date):Promise<void>;retry(id:string,availableAt:Date,errorCode:string):Promise<void>;markFailed(id:string,errorCode:string):Promise<void>;}
