import { newId } from '../../../shared/ids.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { Task, type TaskStatus } from '../domain/task.entity.js';
import type { TaskPage, TaskQuery, TaskRepository } from './ports/task.repository.js';

export interface TaskAccessPolicy {
  requireMember(projectId: string, userId: string): Promise<void>;
  requireAdmin(projectId: string, userId: string): Promise<void>;
  visibleProjectIds(userId:string):Promise<string[]>;
}

export class TaskService {
  constructor(private readonly repository: TaskRepository, private readonly access: TaskAccessPolicy) {}

  async create(input: { projectId: string; actorId: string; title: string; description: string; assigneeId?: string; dueDate?: Date }): Promise<Task> {
    await this.access.requireMember(input.projectId, input.actorId);
    if (input.assigneeId) await this.access.requireMember(input.projectId, input.assigneeId);
    const now = new Date();
    const task = Task.create({ id: newId(), projectId: input.projectId, title: input.title, description: input.description, createdBy: input.actorId, createdAt: now, updatedAt: now, ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}), ...(input.dueDate ? { dueDate: input.dueDate } : {}) });
    await this.repository.insert(task);
    return task;
  }

  async get(id: string, actorId: string): Promise<Task> {
    const task = await this.required(id);
    await this.access.requireMember(task.snapshot().projectId, actorId);
    return task;
  }

  async search(query: TaskQuery, actorId: string): Promise<TaskPage> {
    if (query.projectId) await this.access.requireMember(query.projectId, actorId);
    else query.projectIds=await this.access.visibleProjectIds(actorId);
    return this.repository.search(query);
  }

  async update(id: string, actorId: string, expectedVersion: number, changes: { title?: string; description?: string; dueDate?: Date|null }): Promise<Task> {
    const task = await this.get(id, actorId);
    task.update(changes);
    await this.persist(task, expectedVersion);
    return task;
  }

  async transition(id: string, actorId: string, expectedVersion: number, status: TaskStatus): Promise<Task> {
    const task = await this.get(id, actorId);
    task.transition(status);
    await this.persist(task, expectedVersion);
    return task;
  }

  async assign(id: string, actorId: string, expectedVersion: number, assigneeId?: string): Promise<Task> {
    const task = await this.required(id);
    const projectId = task.snapshot().projectId;
    await this.access.requireAdmin(projectId, actorId);
    if (assigneeId) await this.access.requireMember(projectId, assigneeId);
    task.assign(assigneeId);
    await this.persist(task, expectedVersion);
    return task;
  }

  async delete(id: string, actorId: string): Promise<void> {
    const task = await this.required(id);
    await this.access.requireAdmin(task.snapshot().projectId, actorId);
    if (!(await this.repository.delete(id))) throw new AppError(404, 'TASK_NOT_FOUND', 'Task was not found');
  }

  private async required(id: string): Promise<Task> {
    const task = await this.repository.findById(id);
    if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Task was not found');
    return task;
  }

  private async persist(task: Task, version: number): Promise<void> {
    if (!(await this.repository.update(task, version))) throw new AppError(409, 'VERSION_CONFLICT', 'Task was changed by another request');task.markPersisted(version+1);
  }
}
