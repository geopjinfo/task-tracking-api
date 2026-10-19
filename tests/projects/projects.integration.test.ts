import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { createProjectModule } from '../../src/modules/projects/project.module.js';
import type { User } from '../../src/modules/identity/domain/user.js';
import { MongoUserRepository } from '../../src/modules/identity/infrastructure/persistence/mongo-user.repository.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { createRedisClient } from '../../src/platform/redis/redis.client.js';

const databaseName=`projects_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/1',JWT_SECRET:'projects-integration-secret-at-least-32-chars',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'});
const database=new Database(config),redis=createRedisClient(config),authResponse=z.object({user:z.object({id:z.string(),email:z.string()}),accessToken:z.string()}),projectResponse=z.object({id:z.string(),name:z.string()}),taskResponse=z.object({id:z.string(),version:z.number(),assigneeId:z.string().optional()});
let app:ReturnType<typeof createApp>,projectModule:ReturnType<typeof createProjectModule>;
const register=async(email:string):Promise<{id:string;token:string}>=>{const response=await request(app).post('/api/v1/auth/register').send({email,displayName:email.split('@')[0],password:'correct horse battery staple'});expect(response.status).toBe(201);const body=authResponse.parse(response.body);return {id:body.user.id,token:body.accessToken};};
const bearer=(token:string):{Authorization:string}=>({Authorization:`Bearer ${token}`});

beforeAll(async()=>{await Promise.all([database.connect(),redis.connect()]);await redis.flushDb();app=createApp(database,config,redis);projectModule=createProjectModule(database,new MongoUserRepository(database.collection<User>('users')));});
afterAll(async()=>{await database.client.db().dropDatabase();if(redis.isOpen)await redis.quit();await database.close();});

describe('project and membership workflows',()=>{
 it('enforces isolation, roles, single-use invitations, and deterministic unassignment',async()=>{
  const owner=await register('owner@example.com'),member=await register('member@example.com'),admin=await register('admin@example.com'),outsider=await register('outsider@example.com');
  const created=await request(app).post('/api/v1/projects').set(bearer(owner.token)).send({name:'Delivery',description:'Core project'});expect(created.status).toBe(201);const project=projectResponse.parse(created.body);
  const ownerMembership=await database.collection('memberships').findOne({projectId:project.id,userId:owner.id});expect(ownerMembership).toMatchObject({role:'owner'});
  expect((await request(app).get(`/api/v1/projects/${project.id}`).set(bearer(outsider.token))).status).toBe(404);
  const outsiderProjects=await request(app).get('/api/v1/projects').set(bearer(outsider.token));expect(z.object({items:z.array(z.unknown())}).parse(outsiderProjects.body).items).toHaveLength(0);

  expect((await request(app).post(`/api/v1/projects/${project.id}/invitations`).set(bearer(outsider.token)).send({email:'member@example.com'})).status).toBe(404);
  const invitation=await projectModule.service.invite(project.id,owner.id,' MEMBER@example.com ','member');
  const stored=await database.collection('invitations').findOne({id:invitation.invitation.id});expect(stored).not.toHaveProperty('token');expect(stored?.tokenHash).not.toBe(invitation.token);
  const delivery=await database.collection('email_deliveries').findOne({invitationId:invitation.invitation.id});expect(delivery).toMatchObject({recipientEmailNormalized:'member@example.com',status:'pending',attempts:0});expect(delivery?.acceptUrl).toContain(invitation.token);
  const accepted=await request(app).post(`/api/v1/invitations/${invitation.token}/accept`).set(bearer(member.token));expect(accepted.status).toBe(200);
  expect((await request(app).post(`/api/v1/invitations/${invitation.token}/accept`).set(bearer(member.token))).status).toBe(200);
  expect((await request(app).patch(`/api/v1/projects/${project.id}`).set(bearer(member.token)).send({name:'Denied'})).status).toBe(404);
  const adminInvitation=await projectModule.service.invite(project.id,owner.id,'admin@example.com','admin');expect((await request(app).post(`/api/v1/invitations/${adminInvitation.token}/accept`).set(bearer(admin.token))).status).toBe(200);
  expect((await request(app).patch(`/api/v1/projects/${project.id}`).set(bearer(admin.token)).send({description:'Changed by admin'})).status).toBe(200);
  const adminInvite=await request(app).post(`/api/v1/projects/${project.id}/invitations`).set(bearer(admin.token)).send({email:'future@example.com',role:'member'});expect(adminInvite.status).toBe(201);expect(adminInvite.body).not.toHaveProperty('token');expect(adminInvite.body).not.toHaveProperty('tokenHash');
  const updated=await request(app).patch(`/api/v1/projects/${project.id}`).set(bearer(owner.token)).send({name:'Delivery Updated'});expect(updated.status).toBe(200);expect(projectResponse.parse(updated.body).name).toBe('Delivery Updated');
  const members=await request(app).get(`/api/v1/projects/${project.id}/members`).set(bearer(member.token));expect(z.object({items:z.array(z.unknown())}).parse(members.body).items).toHaveLength(3);

  const taskCreated=await request(app).post(`/api/v1/projects/${project.id}/tasks`).set(bearer(owner.token)).send({title:'Assigned work',assigneeId:member.id});expect(taskCreated.status).toBe(201);const task=taskResponse.parse(taskCreated.body);
  expect((await request(app).delete(`/api/v1/projects/${project.id}/members/${owner.id}`).set(bearer(owner.token))).status).toBe(409);
  expect((await request(app).delete(`/api/v1/projects/${project.id}/members/${member.id}`).set(bearer(owner.token))).status).toBe(204);
  const unassigned=taskResponse.parse(await database.collection('tasks').findOne({id:task.id}));expect(unassigned.assigneeId).toBeUndefined();expect(unassigned.version).toBe(task.version+1);
  expect((await request(app).get(`/api/v1/projects/${project.id}`).set(bearer(member.token))).status).toBe(404);

  const rejectedInvitation=await projectModule.service.invite(project.id,owner.id,'outsider@example.com','member');
  expect((await request(app).post(`/api/v1/invitations/${rejectedInvitation.token}/reject`).set(bearer(outsider.token))).status).toBe(200);
  expect((await request(app).post(`/api/v1/invitations/${rejectedInvitation.token}/reject`).set(bearer(outsider.token))).status).toBe(200);
  expect((await request(app).post(`/api/v1/invitations/${rejectedInvitation.token}/accept`).set(bearer(outsider.token))).status).toBe(409);
 });

 it('rolls back invitation creation when its delivery intent cannot be persisted',async()=>{
  const owner=await register('transaction-owner@example.com');
  const project=await projectModule.service.create(owner.id,{name:'Atomic invitation',description:''});
  const deliveries=database.collection('email_deliveries');
  await deliveries.createIndex({recipientEmailNormalized:1},{unique:true,name:'test_unique_delivery_recipient'});
  await deliveries.insertOne({id:randomUUID(),invitationId:randomUUID(),deliveryKind:'invitation',idempotencyKey:`test:${randomUUID()}`,recipientEmailNormalized:'collision@example.com',acceptUrl:'http://localhost/unused',status:'pending',attempts:0,availableAt:new Date(),createdAt:new Date()});
  await expect(projectModule.service.invite(project.id,owner.id,'collision@example.com','member')).rejects.toMatchObject({status:409,code:'INVITATION_EXISTS'});
  expect(await database.collection('invitations').countDocuments({projectId:project.id,emailNormalized:'collision@example.com'})).toBe(0);
  await deliveries.dropIndex('test_unique_delivery_recipient');
 });
});
