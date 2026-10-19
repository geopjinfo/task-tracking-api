import { z } from 'zod';
export const taskIdParams=z.object({taskId:z.uuid()});export const projectIdParams=z.object({projectId:z.uuid()});
export const createTaskBody=z.object({title:z.string().trim().min(1).max(200),description:z.string().max(10000).default(''),assigneeId:z.uuid().optional(),dueDate:z.coerce.date().optional()});
export const updateTaskBody=createTaskBody.partial().extend({dueDate:z.coerce.date().nullable().optional(),version:z.number().int().positive()});
export const taskStatusBody=z.object({status:z.enum(['todo','in_progress','done']),version:z.number().int().positive()});
export const taskAssigneeBody=z.object({assigneeId:z.uuid().nullable().optional(),version:z.number().int().positive()});
