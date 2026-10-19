import { loadConfig } from './config/index.js';
import { Database } from './platform/database/mongo.database.js';

const database=new Database(loadConfig());
try{
 await database.connect();
}finally{
 await database.close();
}
