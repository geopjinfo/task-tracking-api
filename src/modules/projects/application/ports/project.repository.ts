import type { Invitation,Membership,Project,Role } from '../../domain/project.js';
import type { InvitationEmailDelivery } from '../../../email/domain/email-delivery.js';
import type { TransactionContext } from '../../../../platform/database/transaction-manager.js';

export interface ProjectRepository{
 createWithOwner(project:Project,membership:Membership,context?:TransactionContext):Promise<void>;
 listForUser(userId:string):Promise<Project[]>;
 findProject(id:string):Promise<Project|null>;
 updateProject(id:string,changes:{name?:string;description?:string;updatedAt:Date}):Promise<Project|null>;
 findMembership(projectId:string,userId:string):Promise<Membership|null>;
 listMemberships(projectId:string):Promise<Membership[]>;
 insertInvitationWithDelivery(invitation:Invitation,delivery:InvitationEmailDelivery,context?:TransactionContext):Promise<boolean>;
 findInvitationByTokenHash(tokenHash:string):Promise<Invitation|null>;
 acceptInvitation(invitationId:string,userId:string,role:Exclude<Role,'owner'>,at:Date,context?:TransactionContext):Promise<'accepted'|'already-accepted'|'unavailable'>;
 rejectInvitation(invitationId:string,at:Date):Promise<'rejected'|'already-rejected'|'unavailable'>;
 removeMembershipAndUnassign(projectId:string,userId:string,at:Date,context?:TransactionContext):Promise<boolean>;
}
