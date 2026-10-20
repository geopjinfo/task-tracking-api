import { loadConfig } from './config/index.js';
import type { User } from './modules/identity/domain/user.js';
import { Database } from './platform/database/mongo.database.js';
import { seedDevelopment } from './seeding/development-seed.js';

async function main():Promise<void>{
  const config=loadConfig(),database=new Database(config);
  await database.connect();
  try{console.log(`Development seed ${await seedDevelopment(database.collection<User>('users'),config.NODE_ENV)}`);}
  finally{await database.close();}
}

await main();
