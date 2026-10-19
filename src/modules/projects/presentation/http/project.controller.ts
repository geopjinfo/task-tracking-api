import type { Request,Response } from 'express';
import { AppError } from '../../../../shared/errors/app-error.js';
import type { ProjectService } from '../../application/project.service.js';
import { createProjectBody,invitationParams,inviteBody,memberParams,projectIdParams,updateProjectBody } from './project.schemas.js';

const actor=(req:Request):string=>{if(!req.auth)throw new AppError(401,'AUTH_REQUIRED','Authentication is required');return req.auth.userId;};
export class ProjectController{
 constructor(private readonly service:ProjectService){}
 create=async(req:Request,res:Response):Promise<void>=>{res.status(201).json(await this.service.create(actor(req),createProjectBody.parse(req.body)));};
 list=async(req:Request,res:Response):Promise<void>=>{res.json({items:await this.service.list(actor(req))});};
 get=async(req:Request,res:Response):Promise<void>=>{const {projectId}=projectIdParams.parse(req.params);res.json(await this.service.get(projectId,actor(req)));};
 update=async(req:Request,res:Response):Promise<void>=>{const {projectId}=projectIdParams.parse(req.params),body=updateProjectBody.parse(req.body),changes:{name?:string;description?:string}={};if(body.name!==undefined)changes.name=body.name;if(body.description!==undefined)changes.description=body.description;res.json(await this.service.update(projectId,actor(req),changes));};
 members=async(req:Request,res:Response):Promise<void>=>{const {projectId}=projectIdParams.parse(req.params);res.json({items:await this.service.listMembers(projectId,actor(req))});};
 invite=async(req:Request,res:Response):Promise<void>=>{const {projectId}=projectIdParams.parse(req.params),body=inviteBody.parse(req.body),result=await this.service.invite(projectId,actor(req),body.email,body.role);res.status(201).json(result.invitation);};
 accept=async(req:Request,res:Response):Promise<void>=>{const {token}=invitationParams.parse(req.params);res.json(await this.service.accept(token,actor(req)));};
 reject=async(req:Request,res:Response):Promise<void>=>{const {token}=invitationParams.parse(req.params);res.json(await this.service.reject(token,actor(req)));};
 removeMember=async(req:Request,res:Response):Promise<void>=>{const {projectId,userId}=memberParams.parse(req.params);await this.service.removeMember(projectId,userId,actor(req));res.status(204).end();};
}
