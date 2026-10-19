import type { Task, TaskStatus } from '../../domain/task.entity.js';
import type { NotificationEvent } from '../../../notifications/domain/events.js';

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
  insert(task: Task,event?:NotificationEvent): Promise<void>;
  findById(id: string): Promise<Task | null>;
  search(query: TaskQuery): Promise<TaskPage>;
  update(task: Task, expectedVersion: number,event?:NotificationEvent): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
