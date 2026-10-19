import type { Collection,Filter,UpdateFilter } from 'mongodb';
import { z } from 'zod';
import { decodeCursor,encodeCursor } from '../../../../shared/pagination.js';
import type { TaskPage,TaskQuery,TaskRepository } from '../../application/ports/task.repository.js';
import type { Task } from '../../domain/task.entity.js';
import type { TaskDocument } from './task.document.js';
import { TaskMapper } from './task.mapper.js';

const cursorSchema=z.object({value:z.string().nullable(),id:z.uuid()});
export class MongoTaskRepository implements TaskRepository{
 constructor(private readonly collection:Collection<TaskDocument>){}
 async insert(task:Task):Promise<void>{await this.collection.insertOne(TaskMapper.toDocument(task));}
 async findById(id:string):Promise<Task|null>{const found=await this.collection.findOne({id});return found?TaskMapper.toDomain(found):null;}
 async search(query:TaskQuery):Promise<TaskPage>{
  const filter:Filter<TaskDocument>={};
  if(query.projectId)filter.projectId=query.projectId;else if(query.projectIds)filter.projectId={$in:query.projectIds};
  if(query.assigneeId)filter.assigneeId=query.assigneeId;if(query.status)filter.status=query.status;if(query.search)filter.$text={$search:query.search};
  if(query.dueFrom||query.dueTo)filter.dueDate={...(query.dueFrom?{$gte:query.dueFrom}:{}),...(query.dueTo?{$lte:query.dueTo}:{})};
  if(query.cursor){const cursor=decodeCursor(query.cursor,cursorSchema),boundary=this.boundary(query.sort,query.order,cursor.value,cursor.id);filter.$and=[boundary];}
  const direction=query.order==='asc'?1:-1,documents=await this.collection.find(filter).sort({[query.sort]:direction,id:direction}).limit(query.limit+1).toArray(),hasMore=documents.length>query.limit,visible=documents.slice(0,query.limit),items=visible.map(document=>TaskMapper.toDomain(document)),last=visible.at(-1);
  if(!hasMore||!last)return {items};const value=query.sort==='createdAt'?last.createdAt.toISOString():(last.dueDate?.toISOString()??null);return {items,nextCursor:encodeCursor({value,id:last.id})};
 }
 async update(task:Task,expectedVersion:number):Promise<boolean>{const document=TaskMapper.toDocument(task),id=document.id,fields:Partial<TaskDocument>={...document};delete fields.id;delete fields.version;const unset:Record<string,true>={};if(!document.assigneeId)unset.assigneeId=true;if(!document.dueDate)unset.dueDate=true;if(!document.completedAt)unset.completedAt=true;const update:UpdateFilter<TaskDocument>={$set:fields,$inc:{version:1}};if(Object.keys(unset).length)update.$unset=unset;const result=await this.collection.updateOne({id,version:expectedVersion},update);return result.modifiedCount===1;}
 async delete(id:string):Promise<boolean>{return (await this.collection.deleteOne({id})).deletedCount===1;}
 private boundary(sort:'createdAt'|'dueDate',order:'asc'|'desc',value:string|null,id:string):Filter<TaskDocument>{const comparison=order==='asc'?'$gt':'$lt',date=value?new Date(value):null;if(sort==='createdAt'&&date)return {$or:[{createdAt:{[comparison]:date}},{createdAt:date,id:{[comparison]:id}}]};if(date)return {$or:[{dueDate:{[comparison]:date}},{dueDate:date,id:{[comparison]:id}}]};return order==='asc'?{$or:[{dueDate:{$exists:false},id:{$gt:id}},{dueDate:{$exists:true}}]}:{dueDate:{$exists:false},id:{$lt:id}};}
}
