import type { Comment } from '../../domain/comment.js';
import type { NotificationEvent } from '../../../notifications/domain/events.js';
import type { TransactionContext } from '../../../../platform/database/transaction-manager.js';
export type CommentPage={items:Comment[];nextCursor?:string};
export interface CommentRepository{insert(comment:Comment,event:NotificationEvent,context?:TransactionContext):Promise<void>;findById(id:string):Promise<Comment|null>;list(taskId:string,limit:number,cursor?:string):Promise<CommentPage>;updateBody(id:string,authorId:string,body:string,at:Date):Promise<Comment|null>;softDelete(id:string,authorId:string,at:Date):Promise<boolean>;}
