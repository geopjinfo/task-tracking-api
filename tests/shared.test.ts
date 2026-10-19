import { describe,expect,it } from 'vitest'; import { newId } from '../src/shared.js';
describe('identifiers',()=>{it('creates UUID identifiers',()=>expect(newId()).toMatch(/^[0-9a-f-]{36}$/));});
