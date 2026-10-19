import type { Invitation,Membership,Project,Role } from '../../domain/project.js';

export interface ProjectRepository{
 createWithOwner(project:Project,membership:Membership):Promise<void>;
 listForUser(userId:string):Promise<Project[]>;
 findProject(id:string):Promise<Project|null>;
 updateProject(id:string,changes:{name?:string;description?:string;updatedAt:Date}):Promise<Project|null>;
 findMembership(projectId:string,userId:string):Promise<Membership|null>;
 listMemberships(projectId:string):Promise<Membership[]>;
 insertInvitation(invitation:Invitation):Promise<boolean>;
 findInvitationByTokenHash(tokenHash:string):Promise<Invitation|null>;
 acceptInvitation(invitationId:string,userId:string,role:Exclude<Role,'owner'>,at:Date):Promise<'accepted'|'already-accepted'|'unavailable'>;
 rejectInvitation(invitationId:string,at:Date):Promise<'rejected'|'already-rejected'|'unavailable'>;
 removeMembershipAndUnassign(projectId:string,userId:string,at:Date):Promise<boolean>;
}
