export type ProjectStatus='active'|'archived';
export type Project={id:string;name:string;description:string;ownerId:string;status:ProjectStatus;createdAt:Date;updatedAt:Date};
export type Role='owner'|'admin'|'member';
export type Membership={id:string;projectId:string;userId:string;role:Role;createdAt:Date};
export type InvitationStatus='pending'|'accepted'|'rejected';
export type Invitation={id:string;projectId:string;emailNormalized:string;role:Exclude<Role,'owner'>;tokenHash:string;status:InvitationStatus;expiresAt:Date;createdBy:string;createdAt:Date;acceptedAt?:Date;rejectedAt?:Date};
