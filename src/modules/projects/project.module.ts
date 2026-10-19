import type { Database } from '../../database.js';
import type { UserRepository } from '../identity/application/ports/user.repository.js';
import { ProjectService } from './application/project.service.js';
import type { Invitation,Membership,Project } from './domain/project.js';
import { MongoProjectRepository } from './infrastructure/persistence/mongo-project.repository.js';
import { ProjectController } from './presentation/http/project.controller.js';
import { projectRoutes } from './presentation/http/project.routes.js';
export function createProjectModule(db:Database,users:UserRepository){const repository=new MongoProjectRepository(db.collection<Project>('projects'),db.collection<Membership>('memberships'),db.collection<Invitation>('invitations'),db.collection('tasks'),db.client),service=new ProjectService(repository,users),controller=new ProjectController(service);return {service,access:service.access,routes:projectRoutes(controller)};}
