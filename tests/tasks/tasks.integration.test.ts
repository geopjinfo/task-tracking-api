import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import type { User } from '../../src/modules/identity/domain/user.js';
import { MongoUserRepository } from '../../src/modules/identity/infrastructure/persistence/mongo-user.repository.js';
import { createProjectModule } from '../../src/modules/projects/project.module.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { createRedisClient } from '../../src/platform/redis/redis.client.js';
import { newId } from '../../src/shared/ids.js';

const databaseName=`tasks_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/2',JWT_SECRET:'tasks-integration-secret-at-least-32-characters',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'});
const database=new Database(config),redis=createRedisClient(config),authSchema=z.object({user:z.object({id:z.string()}),accessToken:z.string()}),taskSchema=z.object({id:z.string(),projectId:z.string(),title:z.string(),status:z.enum(['todo','in_progress','done']),assigneeId:z.string().optional(),dueDate:z.coerce.date().optional(),completedAt:z.coerce.date().optional(),version:z.number()});
let app:ReturnType<typeof createApp>,projects:ReturnType<typeof createProjectModule>;
const bearer=(token:string):{Authorization:string}=>({Authorization:`Bearer ${token}`});
const register=async(email:string):Promise<{id:string;token:string}>=>{const response=await request(app).post('/api/v1/auth/register').send({email,displayName:email.split('@')[0],password:'correct horse battery staple'});const parsed=authSchema.parse(response.body);return {id:parsed.user.id,token:parsed.accessToken};};
const items=(body:unknown):z.infer<typeof taskSchema>[]=>z.object({items:z.array(taskSchema)}).parse(body).items;

beforeAll(async()=>{await Promise.all([database.connect(),redis.connect()]);await redis.flushDb();app=createApp(database,config,redis);projects=createProjectModule(database,new MongoUserRepository(database.collection<User>('users')));});
afterAll(async()=>{await database.client.db().dropDatabase();if(redis.isOpen)await redis.quit();await database.close();});

describe('task workflows',()=>{
 it('enforces lifecycle, access, filters, stable cursors, and optimistic concurrency',async()=>{
  const owner=await register('task-owner@example.com'),member=await register('task-member@example.com'),outsider=await register('task-outsider@example.com'),project=await projects.service.create(owner.id,{name:'Task Project',description:''}),invitation=await projects.service.invite(project.id,owner.id,'task-member@example.com','member');await projects.service.accept(invitation.token,member.id);
  expect((await request(app).post(`/api/v1/projects/${project.id}/tasks`).set(bearer(owner.token)).send({title:'Past',dueDate:'2020-01-01T00:00:00.000Z'})).status).toBe(422);
  expect((await request(app).post(`/api/v1/projects/${project.id}/tasks`).set(bearer(owner.token)).send({title:'Wrong assignee',assigneeId:outsider.id})).status).toBe(404);
  const dueDates=['2030-01-01T00:00:00.000Z','2030-02-01T00:00:00.000Z','2030-03-01T00:00:00.000Z','2030-04-01T00:00:00.000Z'],created:z.infer<typeof taskSchema>[]=[];
  for(let index=0;index<4;index+=1){const response=await request(app).post(`/api/v1/projects/${project.id}/tasks`).set(bearer(owner.token)).send({title:index===1?'Searchable release task':`Task ${String(index)}`,description:index===1?'unique phrase': '',assigneeId:member.id,dueDate:dueDates[index]});expect(response.status).toBe(201);created.push(taskSchema.parse(response.body));}
  const first=created[0];if(!first)throw new Error('task setup failed');
  expect((await request(app).get(`/api/v1/tasks/${first.id}`).set(bearer(outsider.token))).status).toBe(404);
  const updated=await request(app).patch(`/api/v1/tasks/${first.id}`).set(bearer(member.token)).send({title:'Updated title',dueDate:null,version:1});expect(updated.status).toBe(200);const updatedTask=taskSchema.parse(updated.body);expect(updatedTask.version).toBe(2);expect(updatedTask.dueDate).toBeUndefined();
  expect((await request(app).patch(`/api/v1/tasks/${first.id}`).set(bearer(member.token)).send({title:'Stale',version:1})).status).toBe(409);
  expect((await request(app).patch(`/api/v1/tasks/${first.id}/status`).set(bearer(member.token)).send({status:'done',version:2})).status).toBe(422);
  const started=await request(app).patch(`/api/v1/tasks/${first.id}/status`).set(bearer(member.token)).send({status:'in_progress',version:2});expect(taskSchema.parse(started.body).version).toBe(3);
  const completed=await request(app).patch(`/api/v1/tasks/${first.id}/status`).set(bearer(member.token)).send({status:'done',version:3});expect(taskSchema.parse(completed.body).completedAt).toBeInstanceOf(Date);
  expect((await request(app).patch(`/api/v1/tasks/${first.id}/assignee`).set(bearer(member.token)).send({assigneeId:owner.id,version:4})).status).toBe(404);
  const assigned=await request(app).patch(`/api/v1/tasks/${first.id}/assignee`).set(bearer(owner.token)).send({assigneeId:owner.id,version:4});expect(taskSchema.parse(assigned.body)).toMatchObject({assigneeId:owner.id,version:5});

  const filtered=await request(app).get(`/api/v1/projects/${project.id}/tasks`).query({search:'unique phrase',assigneeId:member.id,dueFrom:'2030-01-15',dueTo:'2030-03-15'}).set(bearer(member.token));expect(items(filtered.body).map(task=>task.title)).toEqual(['Searchable release task']);
  const pageOne=await request(app).get(`/api/v1/projects/${project.id}/tasks`).query({limit:2,sort:'createdAt',order:'asc'}).set(bearer(member.token)),parsedPage=z.object({items:z.array(taskSchema),nextCursor:z.string()}).parse(pageOne.body);
  const pageTwo=await request(app).get(`/api/v1/projects/${project.id}/tasks`).query({limit:2,sort:'createdAt',order:'asc',cursor:parsedPage.nextCursor}).set(bearer(member.token)),allIds=[...parsedPage.items,...items(pageTwo.body)].map(task=>task.id);expect(new Set(allIds).size).toBe(4);
  expect((await request(app).get(`/api/v1/projects/${project.id}/tasks`).query({cursor:'not-a-cursor'}).set(bearer(member.token))).status).toBe(422);

  const hiddenProjectId=newId(),now=new Date();await database.collection('tasks').insertOne({id:newId(),projectId:hiddenProjectId,title:'Hidden assignment',description:'',status:'todo',assigneeId:member.id,version:1,createdBy:outsider.id,createdAt:now,updatedAt:now});
  const assignedToMember=await request(app).get('/api/v1/tasks/assigned-to-me').set(bearer(member.token));expect(assignedToMember.status,JSON.stringify(assignedToMember.body)).toBe(200);expect(items(assignedToMember.body).some(task=>task.title==='Hidden assignment')).toBe(false);
  const deletable=created[3];if(!deletable)throw new Error('task setup failed');expect((await request(app).delete(`/api/v1/tasks/${deletable.id}`).set(bearer(member.token))).status).toBe(404);expect((await request(app).delete(`/api/v1/tasks/${deletable.id}`).set(bearer(owner.token))).status).toBe(204);
 });
 it('allows exactly one concurrent update for the same version',async()=>{
  const owner=await register('task-race-owner@example.com'),project=await projects.service.create(owner.id,{name:'Task race',description:''});
  const created=taskSchema.parse((await request(app).post(`/api/v1/projects/${project.id}/tasks`).set(bearer(owner.token)).send({title:'Race'})).body);
  const results=await Promise.all([request(app).patch(`/api/v1/tasks/${created.id}`).set(bearer(owner.token)).send({title:'Winner A',version:1}),request(app).patch(`/api/v1/tasks/${created.id}`).set(bearer(owner.token)).send({title:'Winner B',version:1})]);
  expect(results.map(result=>result.status).sort()).toEqual([200,409]);
  expect(await database.collection('tasks').findOne({id:created.id})).toMatchObject({version:2});
  expect(await database.collection('outbox_events').countDocuments({'event.type':'task.updated','event.taskId':created.id})).toBe(1);
 });
});
