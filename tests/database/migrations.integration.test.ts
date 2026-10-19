import { randomUUID } from 'node:crypto';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { loadConfig } from '../../src/config/index.js';
import { Database } from '../../src/platform/database/mongo.database.js';
import { migrations,type MigrationRecord } from '../../src/platform/database/migrations.js';

const databaseName=`migration_test_${randomUUID().replaceAll('-','')}`;
const config=loadConfig({
 NODE_ENV:'test',LOG_LEVEL:'silent',PUBLIC_URL:'http://localhost:3000',
 MONGODB_URI:`mongodb://localhost:27017/${databaseName}?replicaSet=rs0&directConnection=true`,
 REDIS_URL:'redis://localhost:6379/9',JWT_SECRET:'migration-test-secret-at-least-32-characters',
 S3_ENDPOINT:'http://localhost:9000',S3_BUCKET:'task-attachments',S3_ACCESS_KEY:'minioadmin',S3_SECRET_KEY:'minioadmin'
});
const database=new Database(config);

beforeAll(async()=>database.connect());
afterAll(async()=>{await database.client.db().dropDatabase();await database.close()});

describe('database migrations',()=>{
 it('records every applied migration exactly once across repeated startup',async()=>{
  await database.close();
  await database.connect();
  const records=await database.collection<MigrationRecord>('_schema_migrations').find().sort({id:1}).toArray();
  expect(records.map(record=>record.id)).toEqual(migrations.map(migration=>migration.id));
  expect(records).toHaveLength(migrations.length);
  expect(records.every(record=>record.appliedAt instanceof Date)).toBe(true);
 });
});
