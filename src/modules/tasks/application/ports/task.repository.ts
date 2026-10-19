import type { Task, TaskStatus } from '../../domain/task.entity.js';

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
  insert(task: Task): Promise<void>;
  findById(id: string): Promise<Task | null>;
  search(query: TaskQuery): Promise<TaskPage>;
  update(task: Task, expectedVersion: number): Promise<boolean>;
  delete(id: string): Promise<boolean>;
}
