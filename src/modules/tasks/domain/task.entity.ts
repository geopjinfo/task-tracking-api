import { AppError } from '../../../shared/errors/app-error.js';

export type TaskStatus = 'todo' | 'in_progress' | 'done';

export type TaskProps = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId?: string;
  dueDate?: Date;
  completedAt?: Date;
  version: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export class Task {
  private constructor(private props: TaskProps) {}

  static create(props: Omit<TaskProps, 'status' | 'version'>): Task {
    if(props.dueDate&&props.dueDate.getTime()<=Date.now())throw new AppError(422,'INVALID_DUE_DATE','Due date must be in the future');
    return new Task({ ...props, status: 'todo', version: 1 });
  }

  static restore(props: TaskProps): Task {
    return new Task({ ...props });
  }

  snapshot(): Readonly<TaskProps> {
    return { ...this.props };
  }

  update(input: { title?: string; description?: string; dueDate?: Date|null }): void {
    if (input.title !== undefined) this.props.title = input.title;
    if (input.description !== undefined) this.props.description = input.description;
    if(input.dueDate===null)delete this.props.dueDate;else if(input.dueDate!==undefined){if(input.dueDate.getTime()<=Date.now())throw new AppError(422,'INVALID_DUE_DATE','Due date must be in the future');this.props.dueDate=input.dueDate;}
    this.touch();
  }

  assign(assigneeId: string | undefined): void {
    if (assigneeId === undefined) delete this.props.assigneeId;
    else this.props.assigneeId = assigneeId;
    this.touch();
  }

  transition(next: TaskStatus): void {
    const allowed: Record<TaskStatus, readonly TaskStatus[]> = {
      todo: ['in_progress'],
      in_progress: ['todo', 'done'],
      done: ['in_progress'],
    };
    if (!allowed[this.props.status].includes(next)) {
      throw new AppError(422, 'INVALID_STATUS_TRANSITION', `Cannot move a task from ${this.props.status} to ${next}`);
    }
    this.props.status = next;
    if(next==='done')this.props.completedAt=new Date();else delete this.props.completedAt;
    this.touch();
  }

  markPersisted(version:number):void{this.props.version=version;}

  private touch(): void {
    this.props.updatedAt = new Date();
  }
}
