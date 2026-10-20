import { describe,expect,it,vi } from 'vitest';
import { seedDevelopment } from '../../src/seeding/development-seed.js';
import type { User } from '../../src/modules/identity/domain/user.js';

describe('development seed',()=>{
 it('is import-safe, idempotent, and isolated from database startup',async()=>{
  const insertOne=vi.fn(async()=>({acknowledged:true,insertedId:'id'}));
  const created=await seedDevelopment({findOne:vi.fn(async()=>null),insertOne},'development');
  expect(created).toBe('created');
  expect(insertOne).toHaveBeenCalledOnce();
  const existing:User={id:'existing',emailNormalized:'demo@example.test',displayName:'Demo',passwordHash:'hash',createdAt:new Date(),updatedAt:new Date()};
  expect(await seedDevelopment({findOne:vi.fn(async()=>existing),insertOne},'test')).toBe('exists');
  expect(insertOne).toHaveBeenCalledOnce();
 });
 it('refuses production execution before touching storage',async()=>{
  const findOne=vi.fn();
  await expect(seedDevelopment({findOne,insertOne:vi.fn()},'production')).rejects.toThrow(/disabled/);
  expect(findOne).not.toHaveBeenCalled();
 });
});
