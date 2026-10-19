import { randomUUID } from 'node:crypto';
import { CreateBucketCommand,DeleteBucketCommand,S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { z } from 'zod';
import { createApp,type BackgroundWorkers } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { createRedisClient } from '../../src/platform/redis/redis.client.js';

const databaseName=`e2e_test_${randomUUID().replaceAll('-','')}`,bucket=`e2e-${randomUUID()}`;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/7',JWT_SECRET:'end-to-end-secret-at-least-32-characters',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:bucket,S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin',SMTP_HOST:'localhost',SMTP_PORT:'1025',MAIL_FROM:'tasks@localhost.test'});
const database=new Database(config),redis=createRedisClient(config),s3=new S3Client({endpoint:config.S3_ENDPOINT,region:config.S3_REGION,forcePathStyle:true,credentials:{accessKeyId:config.S3_ACCESS_KEY,secretAccessKey:config.S3_SECRET_KEY}});
const auth=z.object({user:z.object({id:z.string()}),accessToken:z.string()}),id=z.object({id:z.string()}),task=z.object({id:z.string(),version:z.number(),status:z.string()}),intent=z.object({attachmentId:z.string(),uploadUrl:z.url()}),download=z.object({downloadUrl:z.url()}),mailbox=z.object({messages:z.array(z.object({ID:z.string(),To:z.array(z.object({Address:z.string()}))}))}),mail=z.object({Text:z.string()}),notificationPage=z.object({items:z.array(z.object({type:z.string()}))});
let app:ReturnType<typeof createApp>,workers:BackgroundWorkers;
const bearer=(token:string):{Authorization:string}=>({Authorization:`Bearer ${token}`});

beforeAll(async()=>{await Promise.all([database.connect(),redis.connect(),s3.send(new CreateBucketCommand({Bucket:bucket}))]);await redis.flushDb();await fetch('http://localhost:8025/api/v1/messages',{method:'DELETE'});app=createApp(database,config,redis,undefined,value=>{workers=value;});});
afterAll(async()=>{await database.client.db().dropDatabase();if(redis.isOpen)await redis.quit();await database.close();await s3.send(new DeleteBucketCommand({Bucket:bucket}));});

describe('core release journey',()=>{
 it('registers, invites by email, collaborates, stores a private attachment, and reconciles notifications',async()=>{
  const owner=auth.parse((await request(app).post('/api/v1/auth/register').send({email:'journey-owner@example.com',displayName:'Owner',password:'correct horse battery staple'})).body);
  const member=auth.parse((await request(app).post('/api/v1/auth/register').send({email:'journey-member@example.com',displayName:'Member',password:'correct horse battery staple'})).body);
  const project=id.parse((await request(app).post('/api/v1/projects').set(bearer(owner.accessToken)).send({name:'Release project'})).body);
  const invited=await request(app).post(`/api/v1/projects/${project.id}/invitations`).set(bearer(owner.accessToken)).send({email:'journey-member@example.com',role:'member'});
  expect(invited.status).toBe(201);expect(invited.body).not.toHaveProperty('token');
  await workers.email.tick();

  const messages=mailbox.parse(await (await fetch('http://localhost:8025/api/v1/messages')).json()).messages;
  const invitationMessage=messages.find(message=>message.To.some(recipient=>recipient.Address==='journey-member@example.com'));
  expect(invitationMessage).toBeDefined();if(!invitationMessage)throw new Error('invitation message missing');
  const message=mail.parse(await (await fetch(`http://localhost:8025/api/v1/message/${invitationMessage.ID}`)).json());
  const tokenMatch=message.Text.match(/\/invitations\/([^/\s]+)\/accept/);expect(tokenMatch).not.toBeNull();const invitationToken=tokenMatch?.[1];if(!invitationToken)throw new Error('invitation token missing');
  expect((await request(app).post(`/api/v1/invitations/${invitationToken}/accept`).set(bearer(member.accessToken))).status).toBe(200);

  const created=task.parse((await request(app).post(`/api/v1/projects/${project.id}/tasks`).set(bearer(owner.accessToken)).send({title:'Ship release',assigneeId:member.user.id})).body);
  await workers.notifications.tick();
  const started=task.parse((await request(app).patch(`/api/v1/tasks/${created.id}/status`).set(bearer(member.accessToken)).send({status:'in_progress',version:created.version})).body);
  const completed=task.parse((await request(app).patch(`/api/v1/tasks/${created.id}/status`).set(bearer(member.accessToken)).send({status:'done',version:started.version})).body);expect(completed.status).toBe('done');
  const commentResponse=await request(app).post(`/api/v1/tasks/${created.id}/comments`).set(bearer(member.accessToken)).send({body:'Release completed'});expect(commentResponse.status).toBe(201);

  const upload=intent.parse((await request(app).post(`/api/v1/tasks/${created.id}/attachments/upload-intents`).set(bearer(member.accessToken)).send({fileName:'evidence.txt',contentType:'text/plain',size:8})).body);
  expect((await fetch(upload.uploadUrl,{method:'PUT',headers:{'content-type':'text/plain'},body:'evidence'})).ok).toBe(true);
  expect((await request(app).post(`/api/v1/tasks/${created.id}/attachments/complete`).set(bearer(member.accessToken)).send({attachmentId:upload.attachmentId})).status).toBe(200);
  const signed=download.parse((await request(app).get(`/api/v1/attachments/${upload.attachmentId}/download`).set(bearer(owner.accessToken))).body);
  expect(await (await fetch(signed.downloadUrl)).text()).toBe('evidence');

  await workers.notifications.tick();await workers.notifications.tick();
  const memberInbox=notificationPage.parse((await request(app).get('/api/v1/notifications').set(bearer(member.accessToken))).body);expect(memberInbox.items.some(item=>item.type==='task.assigned')).toBe(true);
  const ownerInbox=notificationPage.parse((await request(app).get('/api/v1/notifications').set(bearer(owner.accessToken))).body);expect(ownerInbox.items.some(item=>item.type==='task.completed')).toBe(true);expect(ownerInbox.items.some(item=>item.type==='task.commented')).toBe(true);
  expect((await request(app).delete(`/api/v1/attachments/${upload.attachmentId}`).set(bearer(member.accessToken))).status).toBe(204);
 });
});
