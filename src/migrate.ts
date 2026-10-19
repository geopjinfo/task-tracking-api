import { loadConfig } from './config/index.js';
import { Database } from './platform/database/mongo.database.js';
import { MigrationRunner } from './platform/database/migrations.js';
const command=process.argv[2]??'up';
if(!['up','down','status'].includes(command))throw new Error('Usage: migrate [up|down|status]');
const database=new Database(loadConfig());
try{await database.connect({runMigrations:false});const runner=new MigrationRunner(database.raw());const result=command==='up'?await runner.up():command==='down'?await runner.down():await runner.status();for(const item of result)process.stdout.write(`${item.version.toString().padStart(3,'0')} ${item.state.padEnd(7)} ${item.name} ${item.checksum.slice(0,12)}\n`);}finally{await database.close();}
