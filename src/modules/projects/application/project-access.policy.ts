import { AppError } from '../../../shared/errors/app-error.js';
import type { Membership,Role } from '../domain/project.js';
import type { ProjectRepository } from './ports/project.repository.js';

const rank:Record<Role,number>={member:1,admin:2,owner:3};
export class ProjectAccessPolicy{
 constructor(private readonly repository:ProjectRepository){}
 async require(projectId:string,userId:string,minimum:Role='member'):Promise<Membership>{const membership=await this.repository.findMembership(projectId,userId);if(!membership||rank[membership.role]<rank[minimum])throw new AppError(404,'RESOURCE_NOT_FOUND','Resource was not found');return membership;}
 async requireMember(projectId:string,userId:string):Promise<void>{await this.require(projectId,userId);}
 async requireAdmin(projectId:string,userId:string):Promise<void>{await this.require(projectId,userId,'admin');}
}
