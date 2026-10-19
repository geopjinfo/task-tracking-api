import { z } from 'zod';
export const notificationEventSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('task.assigned'),taskId:z.uuid(),projectId:z.uuid(),actorId:z.uuid(),assigneeId:z.uuid(),title:z.string().max(200)}),
 z.object({type:z.literal('task.reassigned'),taskId:z.uuid(),projectId:z.uuid(),actorId:z.uuid(),assigneeId:z.uuid(),title:z.string().max(200)}),
 z.object({type:z.literal('task.completed'),taskId:z.uuid(),projectId:z.uuid(),actorId:z.uuid(),title:z.string().max(200)}),
 z.object({type:z.literal('task.commented'),taskId:z.uuid(),projectId:z.uuid(),actorId:z.uuid(),commentId:z.uuid(),title:z.string().max(200)})
]);
export type NotificationEvent=z.infer<typeof notificationEventSchema>;
export type OutboxEvent={id:string;event:NotificationEvent;status:'pending'|'processing'|'processed'|'failed';attempts:number;availableAt:Date;leaseUntil?:Date;createdAt:Date;processedAt?:Date;lastErrorCode?:string};
export type Notification={id:string;eventId:string;recipientId:string;projectId:string;taskId:string;type:NotificationEvent['type'];title:string;body:string;deliveryKey:string;createdAt:Date;readAt?:Date};
