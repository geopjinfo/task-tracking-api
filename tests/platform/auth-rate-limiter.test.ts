import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe,expect,it,vi } from 'vitest';
import { createAuthRateLimiter } from '../../src/platform/redis/auth-rate-limiter.js';

describe('authentication rate limiter',()=>{
 it('fails closed when Redis is unavailable',async()=>{
  const app=express(),logger=pino({level:'silent'});
  app.use(pinoHttp({logger}),createAuthRateLimiter({incr:vi.fn(async()=>{throw new Error('offline');}),expire:vi.fn(async()=>0)}));
  app.post('/login',(_req,res)=>res.status(200).end());
  const response=await request(app).post('/login');
  expect(response.status).toBe(503);expect(response.body).toEqual({error:{code:'DEPENDENCY_UNAVAILABLE',message:'Authentication protection is temporarily unavailable'}});
 });
});
