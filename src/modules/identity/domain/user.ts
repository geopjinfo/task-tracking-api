export type User={id:string;emailNormalized:string;displayName:string;passwordHash:string;createdAt:Date;updatedAt:Date};
export type PublicUser={id:string;email:string;displayName:string;createdAt:Date;updatedAt:Date};
export const publicUser=(user:User):PublicUser=>({id:user.id,email:user.emailNormalized,displayName:user.displayName,createdAt:user.createdAt,updatedAt:user.updatedAt});
