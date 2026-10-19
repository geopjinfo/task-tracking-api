import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config/index.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { createRedisClient } from '../../src/platform/redis/redis.client.js';

const databaseName=`identity_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({
 NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379',JWT_SECRET:'identity-integration-secret-at-least-32-chars',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'
});
const database=new Database(config),redis=createRedisClient(config);
let app:ReturnType<typeof createApp>;
const responseSchema=z.object({user:z.object({email:z.string(),displayName:z.string()}).passthrough(),accessToken:z.string()});
const errorSchema=z.object({error:z.object({code:z.string()})});
const cookie=(response:request.Response):string=>{const value:unknown=response.headers['set-cookie'],parsed=z.union([z.string(),z.array(z.string()).min(1)]).parse(value),header=typeof parsed==='string'?parsed:(parsed[0]??'');return header.split(';')[0]??'';};

beforeAll(async()=>{await Promise.all([database.connect(),redis.connect()]);await redis.flushDb();app=createApp(database,config,redis);});
afterAll(async()=>{await database.client.db().dropDatabase();if(redis.isOpen)await redis.quit();await database.close();});

describe('identity HTTP flows',()=>{
 it('registers a normalized unique user without exposing the password hash',async()=>{
  const response=await request(app).post('/api/v1/auth/register').send({email:'  Person@Example.COM ',displayName:' Person ',password:'correct horse battery staple'});
  const body=responseSchema.parse(response.body);expect(response.status).toBe(201);expect(body.user).toMatchObject({email:'person@example.com',displayName:'Person'});expect(body.user).not.toHaveProperty('passwordHash');expect(body.accessToken).toEqual(expect.any(String));
  const duplicate=await request(app).post('/api/v1/auth/register').send({email:'person@example.com',displayName:'Other',password:'correct horse battery staple'});
  expect(duplicate.status).toBe(409);expect(errorSchema.parse(duplicate.body).error.code).toBe('EMAIL_EXISTS');
 });

 it('uses a generic login error and returns a limited-lived access token',async()=>{
  const denied=await request(app).post('/api/v1/auth/login').send({email:'person@example.com',password:'incorrect password'});
  expect(denied.status).toBe(401);expect(errorSchema.parse(denied.body).error.code).toBe('INVALID_CREDENTIALS');
  const accepted=await request(app).post('/api/v1/auth/login').send({email:'PERSON@example.com',password:'correct horse battery staple'});
  expect(accepted.status).toBe(200);expect(responseSchema.parse(accepted.body).accessToken).toEqual(expect.any(String));expect(cookie(accepted)).toContain('refresh_token=');
 });

 it('requires trusted-origin evidence and revokes a refresh family after replay',async()=>{
  const login=await request(app).post('/api/v1/auth/login').send({email:'person@example.com',password:'correct horse battery staple'}),firstCookie=cookie(login);
  expect((await request(app).post('/api/v1/auth/refresh').set('Cookie',firstCookie)).status).toBe(403);
  const rotated=await request(app).post('/api/v1/auth/refresh').set('Origin','http://localhost:3000').set('Cookie',firstCookie);
  expect(rotated.status).toBe(200);const secondCookie=cookie(rotated);
  const replay=await request(app).post('/api/v1/auth/refresh').set('Origin','http://localhost:3000').set('Cookie',firstCookie);
  expect(replay.status).toBe(401);expect(errorSchema.parse(replay.body).error.code).toBe('REFRESH_REUSE_DETECTED');
  const familyMember=await request(app).post('/api/v1/auth/refresh').set('Origin','http://localhost:3000').set('Cookie',secondCookie);
  expect(familyMember.status).toBe(401);
 });

 it('reads and updates only the authenticated profile and revokes every session',async()=>{
  const login=await request(app).post('/api/v1/auth/login').send({email:'person@example.com',password:'correct horse battery staple'}),access=responseSchema.parse(login.body).accessToken,refreshCookie=cookie(login);
  const updated=await request(app).patch('/api/v1/users/me').set('Authorization',`Bearer ${access}`).send({displayName:'Updated Person'});
  expect(updated.status).toBe(200);expect(updated.body).toMatchObject({email:'person@example.com',displayName:'Updated Person'});
  const profile=await request(app).get('/api/v1/users/me').set('Authorization',`Bearer ${access}`);
  expect(profile.status).toBe(200);expect(profile.body).not.toHaveProperty('passwordHash');
  expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
  expect((await request(app).post('/api/v1/auth/logout-all').set('Authorization',`Bearer ${access}`)).status).toBe(204);
  expect((await request(app).post('/api/v1/auth/refresh').set('Origin','http://localhost:3000').set('Cookie',refreshCookie)).status).toBe(401);
 });

 it('fails closed after the per-IP authentication limit',async()=>{
  await redis.flushDb();let status=0;
  for(let index=0;index<21;index+=1)status=(await request(app).post('/api/v1/auth/login').send({})).status;
  expect(status).toBe(429);
 });

 it('applies security headers and restricts credentialed CORS',async()=>{
  await redis.flushDb();
  const allowed=await request(app).options('/api/v1/auth/login').set('Origin','http://localhost:3000').set('Access-Control-Request-Method','POST');
  expect(allowed.status).toBe(204);expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');expect(allowed.headers['access-control-allow-credentials']).toBe('true');
  const denied=await request(app).options('/api/v1/auth/login').set('Origin','https://attacker.example').set('Access-Control-Request-Method','POST');
  expect(denied.headers['access-control-allow-origin']).toBe('http://localhost:3000');expect(denied.headers['access-control-allow-origin']).not.toBe('https://attacker.example');
  const response=await request(app).get('/health/live');
  expect(response.headers['x-content-type-options']).toBe('nosniff');expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');expect(response.headers['strict-transport-security']).toContain('max-age=');expect(response.headers['x-powered-by']).toBeUndefined();
 });
});
