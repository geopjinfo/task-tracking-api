import { Task } from '../../domain/task.entity.js'; import type { TaskDocument } from './task.document.js';
export const TaskMapper={toDomain(document:TaskDocument):Task{return Task.restore(document);},toDocument(task:Task):TaskDocument{return {...task.snapshot()};}};
