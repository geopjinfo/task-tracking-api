import { loadConfig } from './config.js'; import { Database } from './database.js'; import { startTelemetry } from './telemetry.js';
const config=loadConfig();await startTelemetry(config);const {createApp}=await import('./app.js');const db=new Database(config);await db.connect();const server=createApp(db,config).listen(config.PORT,'0.0.0.0');
async function shutdown(){server.close(async()=>{await db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();}
process.once('SIGINT',()=>{void shutdown();});process.once('SIGTERM',()=>{void shutdown();});
