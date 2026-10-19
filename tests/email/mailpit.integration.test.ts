import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { z } from 'zod';
import { loadConfig } from '../../src/config/index.js';
import { EmailDeliveryWorker } from '../../src/modules/email/application/email-delivery.worker.js';
import type { InvitationEmailDelivery } from '../../src/modules/email/domain/email-delivery.js';
import { MongoEmailDeliveryRepository } from '../../src/modules/email/infrastructure/persistence/mongo-email-delivery.repository.js';
import { SmtpMailer } from '../../src/modules/email/infrastructure/smtp/smtp-mailer.js';
import type { User } from '../../src/modules/identity/domain/user.js';
import { MongoUserRepository } from '../../src/modules/identity/infrastructure/persistence/mongo-user.repository.js';
import { createProjectModule } from '../../src/modules/projects/project.module.js';
import { Database } from '../../src/platform/database/mongo.database.js';

const databaseName=`mailpit_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/5',JWT_SECRET:'mailpit-integration-secret-at-least-32-chars',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin',SMTP_HOST:'localhost',SMTP_PORT:'1025',MAIL_FROM:'tasks@localhost.test'});
const database=new Database(config);

beforeAll(async()=>{await database.connect();await fetch('http://localhost:8025/api/v1/messages',{method:'DELETE'});});
afterAll(async()=>{await database.client.db().dropDatabase();await database.close();});

describe('Mailpit invitation delivery',()=>{
 it('captures one invitation and clears its raw token URL after delivery',async()=>{
  const users=new MongoUserRepository(database.collection<User>('users'));
  const projects=createProjectModule(database,users,config.PUBLIC_URL);
  const ownerId=randomUUID();
  await database.collection<User>('users').insertOne({id:ownerId,emailNormalized:'owner@example.com',displayName:'Owner',passwordHash:'unused',createdAt:new Date(),updatedAt:new Date()});
  const project=await projects.service.create(ownerId,{name:'Mail delivery',description:''});
  const created=await projects.service.invite(project.id,ownerId,'mailpit-member@example.com','member');
  const stored=await database.collection<InvitationEmailDelivery>('email_deliveries').findOne({invitationId:created.invitation.id});
  expect(stored).toMatchObject({status:'pending',attempts:0,idempotencyKey:`invitation:${created.invitation.id}`});
  expect(stored?.acceptUrl).toContain(created.token);

  const repository=new MongoEmailDeliveryRepository(database.collection<InvitationEmailDelivery>('email_deliveries'));
  const worker=new EmailDeliveryWorker(repository,new SmtpMailer(config.SMTP_HOST,config.SMTP_PORT,config.MAIL_FROM));
  await worker.tick();
  await worker.tick();

  const sent=await database.collection<InvitationEmailDelivery>('email_deliveries').findOne({invitationId:created.invitation.id});
  expect(sent).toMatchObject({status:'sent',attempts:1});
  expect(sent).not.toHaveProperty('acceptUrl');
  const response=await fetch('http://localhost:8025/api/v1/messages');
  const mailbox=z.object({messages:z.array(z.object({To:z.array(z.object({Address:z.string()})),Subject:z.string()}))}).parse(await response.json());
  const matches=mailbox.messages.filter(message=>message.To.some(to=>to.Address==='mailpit-member@example.com'));
  expect(matches).toHaveLength(1);
  expect(matches[0]?.Subject).toBe('You have been invited to a project');
 });

 it('retains the invitation and schedules a retry when SMTP fails',async()=>{
  const users=new MongoUserRepository(database.collection<User>('users'));
  const projects=createProjectModule(database,users,config.PUBLIC_URL);
  const ownerId=randomUUID();
  await database.collection<User>('users').insertOne({id:ownerId,emailNormalized:'failure-owner@example.com',displayName:'Owner',passwordHash:'unused',createdAt:new Date(),updatedAt:new Date()});
  const project=await projects.service.create(ownerId,{name:'Failure isolation',description:''});
  const created=await projects.service.invite(project.id,ownerId,'smtp-down@example.com','member');
  const repository=new MongoEmailDeliveryRepository(database.collection<InvitationEmailDelivery>('email_deliveries'));
  await new EmailDeliveryWorker(repository,{sendInvitation:async()=>{throw new Error('SMTP unavailable');}}).tick();
  expect(await database.collection('invitations').findOne({id:created.invitation.id})).toMatchObject({status:'pending'});
  expect(await database.collection('email_deliveries').findOne({invitationId:created.invitation.id})).toMatchObject({status:'pending',attempts:1,lastErrorCode:'DELIVERY_FAILED'});
 });
});
