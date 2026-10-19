import { loadConfig } from './config.js'; import { Database } from './database.js'; import { startTelemetry } from './telemetry.js';
import { createClient } from 'redis';
import { OutboxWorker } from './outbox.js';
const config=loadConfig();await startTelemetry(config);const {createApp}=await import('./app.js');const db=new Database(config),redis=createClient({url:config.REDIS_URL});await Promise.all([db.connect(),redis.connect()]);const worker=new OutboxWorker(db,redis);worker.start();const server=createApp(db,config,redis).listen(config.PORT,'0.0.0.0');
async function shutdown(){worker.stop();server.close(async()=>{await Promise.all([db.close(),redis.quit()]);process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.once('SIGINT',()=>{void shutdown();});process.once('SIGTERM',()=>{void shutdown();});
