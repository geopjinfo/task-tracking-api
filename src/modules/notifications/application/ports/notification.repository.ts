import type { Notification } from '../../domain/events.js';
export type NotificationPage={items:Notification[];nextCursor?:string};
export interface NotificationRepository{insertIfAbsent(notification:Notification):Promise<boolean>;list(recipientId:string,projectIds:string[],limit:number,cursor?:string):Promise<NotificationPage>;unreadCount(recipientId:string,projectIds:string[]):Promise<number>;markRead(id:string,recipientId:string,projectIds:string[],at:Date):Promise<boolean>;markAllRead(recipientId:string,projectIds:string[],at:Date):Promise<void>;}
