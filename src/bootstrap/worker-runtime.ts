import type { Logger } from 'pino';
import type { BackgroundWorkers } from '../app.js';
import type { Config } from '../config/index.js';
import { Database } from '../platform/database/mongo.database.js';
import { createLogger } from '../platform/logging/logger.js';
import { createRedisClient,type RedisClient } from '../platform/redis/redis.client.js';
import type { Telemetry } from '../platform/telemetry/telemetry.js';
import type { Runtime } from './runtime.js';

export async function startWorkerRuntime(config:Config,telemetry:Telemetry):Promise<Runtime>{
 const logger:Logger=createLogger(config),database=new Database(config),redis:RedisClient=createRedisClient(config);
 await Promise.all([database.connect(),redis.connect()]);
 const {createApp}=await import('../app.js');
 let workers:BackgroundWorkers|undefined;
 createApp(database,config,redis,logger,value=>{workers=value;});
 if(!workers)throw new Error('Background workers were not registered');
 workers.notifications.start();workers.email.start();logger.info('background worker started');
 let stopping=false;
 return {shutdown:async(reason:string)=>{if(stopping)return;stopping=true;logger.info({reason},'worker shutdown started');workers?.notifications.stop();workers?.email.stop();const results=await Promise.allSettled([redis.quit(),database.close(),telemetry.shutdown()]);for(const result of results)if(result.status==='rejected')logger.error({err:result.reason},'worker shutdown component failed');logger.info('worker shutdown complete');}};
}
