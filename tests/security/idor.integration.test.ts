import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import type { Attachment } from '../../src/modules/attachments/domain/attachment.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { createRedisClient } from '../../src/platform/redis/redis.client.js';

const databaseName=`idor_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/6',JWT_SECRET:'idor-integration-secret-at-least-32-characters',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'});
const database=new Database(config),redis=createRedisClient(config),auth=z.object({user:z.object({id:z.string()}),accessToken:z.string()}),identifier=z.object({id:z.string()});
let app:ReturnType<typeof createApp>;
const bearer=(token:string):{Authorization:string}=>({Authorization:`Bearer ${token}`});
const register=async(email:string)=>auth.parse((await request(app).post('/api/v1/auth/register').send({email,displayName:email,password:'correct horse battery staple'})).body);

beforeAll(async()=>{await Promise.all([database.connect(),redis.connect()]);await redis.flushDb();app=createApp(database,config,redis);});
afterAll(async()=>{await database.client.db().dropDatabase();if(redis.isOpen)await redis.quit();await database.close();});

describe('cross-project identifier isolation',()=>{
 it('conceals every project-owned resource from another project member',async()=>{
  const ownerA=await register('owner-a@example.com'),ownerB=await register('owner-b@example.com');
  const projectA=identifier.parse((await request(app).post('/api/v1/projects').set(bearer(ownerA.accessToken)).send({name:'Project A'})).body);
  await request(app).post('/api/v1/projects').set(bearer(ownerB.accessToken)).send({name:'Project B'});
  const task=identifier.parse((await request(app).post(`/api/v1/projects/${projectA.id}/tasks`).set(bearer(ownerA.accessToken)).send({title:'Private task'})).body);
  const comment=identifier.parse((await request(app).post(`/api/v1/tasks/${task.id}/comments`).set(bearer(ownerA.accessToken)).send({body:'Private comment'})).body);
  const attachment:Attachment={id:randomUUID(),taskId:task.id,projectId:projectA.id,uploaderId:ownerA.user.id,objectKey:`${projectA.id}/${task.id}/private`,fileName:'private.txt',mimeType:'text/plain',sizeBytes:5,status:'ready',createdAt:new Date(),completedAt:new Date()};
  await database.collection<Attachment>('attachments').insertOne(attachment);
  const token=ownerB.accessToken;

  const checks=[
   request(app).get(`/api/v1/projects/${projectA.id}`).set(bearer(token)),
   request(app).patch(`/api/v1/projects/${projectA.id}`).set(bearer(token)).send({name:'Stolen'}),
   request(app).get(`/api/v1/projects/${projectA.id}/members`).set(bearer(token)),
   request(app).post(`/api/v1/projects/${projectA.id}/invitations`).set(bearer(token)).send({email:'intruder@example.com'}),
   request(app).get(`/api/v1/projects/${projectA.id}/tasks`).set(bearer(token)),
   request(app).get(`/api/v1/tasks/${task.id}`).set(bearer(token)),
   request(app).patch(`/api/v1/tasks/${task.id}`).set(bearer(token)).send({title:'Stolen',version:1}),
   request(app).patch(`/api/v1/tasks/${task.id}/status`).set(bearer(token)).send({status:'in_progress',version:1}),
   request(app).patch(`/api/v1/tasks/${task.id}/assignee`).set(bearer(token)).send({assigneeId:ownerB.user.id,version:1}),
   request(app).delete(`/api/v1/tasks/${task.id}`).set(bearer(token)),
   request(app).get(`/api/v1/tasks/${task.id}/comments`).set(bearer(token)),
   request(app).post(`/api/v1/tasks/${task.id}/comments`).set(bearer(token)).send({body:'Intrusion'}),
   request(app).patch(`/api/v1/comments/${comment.id}`).set(bearer(token)).send({body:'Changed'}),
   request(app).delete(`/api/v1/comments/${comment.id}`).set(bearer(token)),
   request(app).get(`/api/v1/attachments/${attachment.id}/download`).set(bearer(token)),
   request(app).delete(`/api/v1/attachments/${attachment.id}`).set(bearer(token))
  ];
  for(const check of checks)expect((await check).status).toBe(404);
  expect(await database.collection('tasks').findOne({id:task.id})).toMatchObject({title:'Private task'});
  expect(await database.collection('comments').findOne({id:comment.id})).toMatchObject({body:'Private comment'});
  expect(await database.collection('attachments').findOne({id:attachment.id})).toMatchObject({status:'ready'});
 });
});
