import { loadConfig } from '../config/index.js';
import { startTelemetry } from '../platform/telemetry/telemetry.js';

export async function runWorker():Promise<void>{
 const config=loadConfig(),telemetry=await startTelemetry(config),{startWorkerRuntime}=await import('./worker-runtime.js');
 let runtime;
 try{runtime=await startWorkerRuntime(config,telemetry);}catch(error:unknown){await telemetry.shutdown();throw error;}
 await new Promise<void>(resolve=>{
  const stop=(signal:string):void=>{void runtime.shutdown(signal).finally(resolve);};
  process.once('SIGINT',()=>stop('SIGINT'));process.once('SIGTERM',()=>stop('SIGTERM'));
 });
}
