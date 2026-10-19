import { describe,expect,it,vi } from 'vitest';
import { OutboxWorker } from '../../src/modules/notifications/application/outbox.worker.js';
import type { NotificationRepository } from '../../src/modules/notifications/application/ports/notification.repository.js';
import type { OutboxRepository } from '../../src/modules/notifications/application/ports/outbox.repository.js';
import type { OutboxEvent } from '../../src/modules/notifications/domain/events.js';

const event=(attempts=1):OutboxEvent=>({id:'019a0000-0000-7000-8000-000000000001',event:{type:'task.completed',taskId:'019a0000-0000-7000-8000-000000000002',projectId:'019a0000-0000-7000-8000-000000000003',actorId:'019a0000-0000-7000-8000-000000000004',title:'Done'},status:'processing',attempts,availableAt:new Date(),createdAt:new Date()});
const queue=(record:OutboxEvent)=>{const markProcessed=vi.fn(async()=>undefined),retry=vi.fn(async()=>undefined),markFailed=vi.fn(async()=>undefined),repository:OutboxRepository={append:vi.fn(async()=>undefined),claim:vi.fn(async()=>record),markProcessed,retry,markFailed};return {repository,markProcessed,retry,markFailed};};
const inbox=()=>{const insertIfAbsent=vi.fn(async()=>true),repository:NotificationRepository={insertIfAbsent,list:vi.fn(async()=>({items:[]})),unreadCount:vi.fn(async()=>0),markRead:vi.fn(async()=>true),markAllRead:vi.fn(async()=>undefined)};return {repository,insertIfAbsent};};

describe('OutboxWorker',()=>{
 it('deduplicates recipients, excludes the actor, and publishes only new notifications',async()=>{const record=event(),outbox=queue(record),notifications=inbox(),publish=vi.fn(async()=>undefined),worker=new OutboxWorker(outbox.repository,notifications.repository,{projectMembers:vi.fn(async()=>[record.event.actorId,'019a0000-0000-7000-8000-000000000005','019a0000-0000-7000-8000-000000000005']),isProjectMember:vi.fn(async()=>true)},{publish});await worker.tick();expect(notifications.insertIfAbsent).toHaveBeenCalledOnce();expect(publish).toHaveBeenCalledOnce();expect(outbox.markProcessed).toHaveBeenCalledWith(record.id,expect.any(Date));});
 it('backs off transient failures and terminally fails the tenth attempt',async()=>{const transient=queue(event(2)),terminal=queue(event(10)),notifications=inbox(),publisher={publish:vi.fn(async()=>{throw new Error('redis unavailable');})},resolver={projectMembers:vi.fn(async()=>['019a0000-0000-7000-8000-000000000005']),isProjectMember:vi.fn(async()=>true)};await new OutboxWorker(transient.repository,notifications.repository,resolver,publisher).tick();expect(transient.retry).toHaveBeenCalledOnce();await new OutboxWorker(terminal.repository,notifications.repository,resolver,publisher).tick();expect(terminal.markFailed).toHaveBeenCalledWith(event(10).id,'PROCESSING_FAILED');});
});
