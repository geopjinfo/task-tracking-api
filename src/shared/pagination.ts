import { Buffer } from 'node:buffer';import { z } from 'zod';import { AppError } from './errors/app-error.js';
export const paginationSchema=z.object({limit:z.coerce.number().int().min(1).max(100).default(20),cursor:z.string().max(1000).optional()});
export type Page<T>={items:T[];nextCursor?:string};
export const encodeCursor=(value:Record<string,string|number|null>):string=>Buffer.from(JSON.stringify(value),'utf8').toString('base64url');
export const decodeCursor=<T>(cursor:string,schema:z.ZodType<T>):T=>{try{return schema.parse(JSON.parse(Buffer.from(cursor,'base64url').toString('utf8')));}catch{throw new AppError(422,'INVALID_CURSOR','Pagination cursor is invalid');}};
