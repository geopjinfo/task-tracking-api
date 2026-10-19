import type { Task, TaskStatus } from '../../domain/task.entity.js';
import type { NotificationEvent } from '../../../notifications/domain/events.js';
import type { TransactionContext } from '../../../../platform/database/transaction-manager.js';

export type TaskQuery = {
  projectId?: string;
  projectIds?: string[];
  assigneeId?: string;
  status?: TaskStatus;
  search?: string;
  dueFrom?: Date;
  dueTo?: Date;
  cursor?: string;
  limit: number;
  sort: 'createdAt' | 'dueDate';
  order: 'asc' | 'desc';
};

export type TaskPage = { items: Task[]; nextCursor?: string };

export interface TaskRepository {
  insert(task: Task,event?:NotificationEvent,context?:TransactionContext): Promise<void>;
  findById(id: string): Promise<Task | null>;
  search(query: TaskQuery): Promise<TaskPage>;
  update(task: Task, expectedVersion: number,event?:NotificationEvent,context?:TransactionContext): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
