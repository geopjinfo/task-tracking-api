import type { InvitationEmailDelivery } from '../../domain/email-delivery.js';

export interface EmailDeliveryRepository{
 claim(now:Date,leaseUntil:Date):Promise<InvitationEmailDelivery|null>;
 markSent(id:string,at:Date):Promise<void>;
 retry(id:string,availableAt:Date,errorCode:string):Promise<void>;
 markFailed(id:string,errorCode:string):Promise<void>;
}
