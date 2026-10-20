import type { Attachment } from '../../domain/attachment.js';
export type AttachmentPage={items:Attachment[];nextCursor?:string};
export interface AttachmentRepository{insert(attachment:Attachment):Promise<void>;findById(id:string):Promise<Attachment|null>;listReady(taskId:string,limit:number,cursor?:string):Promise<AttachmentPage>;markReady(id:string,at:Date):Promise<Attachment|null>;markFailed(id:string,code:string,at:Date):Promise<void>;markDeleted(id:string,at:Date):Promise<boolean>;findStalePending(before:Date,limit:number):Promise<Attachment[]>;}
