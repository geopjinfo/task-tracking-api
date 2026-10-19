import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { mongoSession } from '../../src/platform/database/transaction-manager.js';

const databaseName=`transaction_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,REDIS_URL:'redis://localhost:6379/9',JWT_SECRET:'transaction-test-secret-at-least-32-characters',S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'});
const database=new Database(config);

beforeAll(async()=>database.connect());
afterAll(async()=>{await database.raw().dropDatabase();await database.close();});

describe('transaction manager',()=>{
 it('rolls back every write when the unit of work fails',async()=>{
  await expect(database.transactions.run(async context=>{const session=mongoSession(context);await database.collection('projects').insertOne({id:randomUUID(),name:'Rollback',ownerId:randomUUID(),status:'active',createdAt:new Date(),updatedAt:new Date()},{session});await database.collection('memberships').insertOne({id:randomUUID(),projectId:randomUUID(),userId:randomUUID(),role:'owner',createdAt:new Date()},{session});throw new Error('planned failure');})).rejects.toMatchObject({code:'TRANSACTION_FAILED',status:503});
  expect(await database.collection('projects').countDocuments({name:'Rollback'})).toBe(0);
 });

 it('commits successful work and maps a duplicate transaction safely',async()=>{
  const id=randomUUID(),project={id,name:'Committed',ownerId:randomUUID(),status:'active',createdAt:new Date(),updatedAt:new Date()};
  await database.transactions.run(async context=>{await database.collection('projects').insertOne(project,{session:mongoSession(context)});});
  await expect(database.transactions.run(async context=>{await database.collection('projects').insertOne({...project,name:'Duplicate'},{session:mongoSession(context)});})).rejects.toMatchObject({code:'TRANSACTION_FAILED',status:503});
  expect(await database.collection('projects').countDocuments({id})).toBe(1);
 });
});
