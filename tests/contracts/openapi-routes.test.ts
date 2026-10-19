import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import request,{type Response} from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { createRedisClient } from '../../src/platform/redis/redis.client.js';

const documentSchema=z.object({paths:z.record(z.string(),z.record(z.string(),z.unknown()))});
const errorSchema=z.object({error:z.object({code:z.string()})});
const methods=['get','post','patch','delete'] as const;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/contracts_test_${randomUUID().replaceAll('-','')}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/8',JWT_SECRET:'contract-test-secret-at-least-32-characters',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'key',S3_SECRET_KEY:'secret'});
const database=new Database(config),redis=createRedisClient(config);

const probe=(app:ReturnType<typeof createApp>,method:typeof methods[number],path:string):Promise<Response>=>{
 if(method==='get')return request(app).get(path);
 if(method==='post')return request(app).post(path).send({});
 if(method==='patch')return request(app).patch(path).send({});
 return request(app).delete(path);
};

describe('OpenAPI route parity',()=>{
 beforeAll(async()=>{await Promise.all([database.connect(),redis.connect()]);});
 afterAll(async()=>{await database.client.db().dropDatabase();if(redis.isOpen)await redis.quit();await database.close();});
 it('has a registered application route for every documented operation',async()=>{
  const raw:unknown=parse(await readFile(new URL('../../docs/openapi.yaml',import.meta.url),'utf8'));
  const document=documentSchema.parse(raw),app=createApp(database,config,redis);
  for(const [template,pathItem] of Object.entries(document.paths))for(const method of methods){
   if(!(method in pathItem))continue;
   const concrete=template.replaceAll('{projectId}','00000000-0000-4000-8000-000000000001').replaceAll('{taskId}','00000000-0000-4000-8000-000000000002').replaceAll('{userId}','00000000-0000-4000-8000-000000000003').replaceAll('{commentId}','00000000-0000-4000-8000-000000000004').replaceAll('{attachmentId}','00000000-0000-4000-8000-000000000005').replaceAll('{notificationId}','00000000-0000-4000-8000-000000000006').replaceAll('{token}','a'.repeat(32));
   const response=await probe(app,method,`/api/v1${concrete}`);
   const parsed=errorSchema.safeParse(response.body);
   expect(parsed.success?parsed.data.error.code:undefined,`${method.toUpperCase()} ${template}`).not.toBe('ROUTE_NOT_FOUND');
  }
 });
});
