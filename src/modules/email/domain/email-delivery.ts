export type EmailDeliveryStatus='pending'|'processing'|'sent'|'failed';

export type InvitationEmailDelivery={
 id:string;
 invitationId:string;
 deliveryKind:'invitation';
 idempotencyKey:string;
 recipientEmailNormalized:string;
 acceptUrl?:string;
 status:EmailDeliveryStatus;
 attempts:number;
 availableAt:Date;
 createdAt:Date;
 leaseUntil?:Date;
 sentAt?:Date;
 lastErrorCode?:string;
};
