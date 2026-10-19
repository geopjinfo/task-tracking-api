import { createClient } from 'redis';import type { Config } from '../../config/index.js';
export type RedisClient=ReturnType<typeof createClient>;
export const createRedisClient=(config:Config):RedisClient=>{const client=createClient({url:config.REDIS_URL,socket:{connectTimeout:5000,reconnectStrategy:retries=>Math.min(100*2**retries,3000)}});client.on('error',()=>{return;});return client;};
