import { newId } from '../../../shared/ids.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { Task, type TaskStatus } from '../domain/task.entity.js';
import type { TaskPage, TaskQuery, TaskRepository } from './ports/task.repository.js';
import type { NotificationEvent } from '../../notifications/domain/events.js';

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
    const event:NotificationEvent|undefined=input.assigneeId?{type:'task.assigned',taskId:task.snapshot().id,projectId:input.projectId,actorId:input.actorId,assigneeId:input.assigneeId,title:task.snapshot().title}:undefined;
    await this.repository.insert(task,event);
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
    const snapshot=task.snapshot();
    await this.persist(task,expectedVersion,{type:'task.updated',taskId:snapshot.id,projectId:snapshot.projectId,actorId,title:snapshot.title});
    return task;
  }

  async transition(id: string, actorId: string, expectedVersion: number, status: TaskStatus): Promise<Task> {
    const task = await this.get(id, actorId);
    task.transition(status);
    const snapshot=task.snapshot(),event:NotificationEvent|undefined=status==='done'?{type:'task.completed',taskId:snapshot.id,projectId:snapshot.projectId,actorId,title:snapshot.title}:undefined;
    await this.persist(task, expectedVersion,event);
    return task;
  }

  async assign(id: string, actorId: string, expectedVersion: number, assigneeId?: string): Promise<Task> {
    const task = await this.required(id);
    const projectId = task.snapshot().projectId;
    await this.access.requireAdmin(projectId, actorId);
    if (assigneeId) await this.access.requireMember(projectId, assigneeId);
    const previous=task.snapshot().assigneeId;task.assign(assigneeId);const snapshot=task.snapshot();let event:NotificationEvent|undefined;if(assigneeId&&assigneeId!==previous)event=previous?{type:'task.reassigned',taskId:snapshot.id,projectId,actorId,assigneeId,title:snapshot.title}:{type:'task.assigned',taskId:snapshot.id,projectId,actorId,assigneeId,title:snapshot.title};
    await this.persist(task, expectedVersion,event);
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

  private async persist(task: Task, version: number,event?:NotificationEvent): Promise<void> {
    if (!(await this.repository.update(task, version,event))) throw new AppError(409, 'VERSION_CONFLICT', 'Task was changed by another request');task.markPersisted(version+1);
  }
}
