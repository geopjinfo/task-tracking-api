import type { TaskStatus } from '../../domain/task.entity.js';
export type TaskDocument = { id:string;projectId:string;title:string;description:string;status:TaskStatus;assigneeId?:string;dueDate?:Date;completedAt?:Date;version:number;createdBy:string;createdAt:Date;updatedAt:Date };
