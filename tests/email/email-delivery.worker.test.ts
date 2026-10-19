import { describe,expect,it,vi } from 'vitest';
import { EmailDeliveryWorker } from '../../src/modules/email/application/email-delivery.worker.js';
import type { EmailDeliveryRepository } from '../../src/modules/email/application/ports/email-delivery.repository.js';
import type { InvitationEmailDelivery } from '../../src/modules/email/domain/email-delivery.js';

const delivery=(attempts=1):InvitationEmailDelivery=>({id:'delivery-1',invitationId:'invitation-1',deliveryKind:'invitation',idempotencyKey:'invitation:invitation-1',recipientEmailNormalized:'member@example.com',acceptUrl:'http://localhost:3000/invitations/token/accept',status:'processing',attempts,availableAt:new Date(),createdAt:new Date()});
const queue=(record:InvitationEmailDelivery)=>{const markSent=vi.fn(async()=>undefined),retry=vi.fn(async()=>undefined),markFailed=vi.fn(async()=>undefined),repository:EmailDeliveryRepository={claim:vi.fn(async()=>record),markSent,retry,markFailed};return {repository,markSent,retry,markFailed};};

describe('EmailDeliveryWorker',()=>{
 it('sends a claimed invitation once and marks it sent',async()=>{const pending=queue(delivery()),sendInvitation=vi.fn(async()=>undefined),worker=new EmailDeliveryWorker(pending.repository,{sendInvitation});await worker.tick();expect(sendInvitation).toHaveBeenCalledWith({to:'member@example.com',acceptUrl:'http://localhost:3000/invitations/token/accept',idempotencyKey:'invitation:invitation-1'});expect(pending.markSent).toHaveBeenCalledWith('delivery-1',expect.any(Date));});

 it('retries transient failures and terminally fails the tenth attempt',async()=>{const transient=queue(delivery(2)),terminal=queue(delivery(10)),mailer={sendInvitation:vi.fn(async()=>{throw new Error('SMTP unavailable');})};await new EmailDeliveryWorker(transient.repository,mailer).tick();expect(transient.retry).toHaveBeenCalledWith('delivery-1',expect.any(Date),'DELIVERY_FAILED');await new EmailDeliveryWorker(terminal.repository,mailer).tick();expect(terminal.markFailed).toHaveBeenCalledWith('delivery-1','DELIVERY_FAILED');});

 it('rejects a delivery whose sensitive URL is missing',async()=>{const invalid=delivery();delete invalid.acceptUrl;const pending=queue(invalid),sendInvitation=vi.fn(async()=>undefined);await new EmailDeliveryWorker(pending.repository,{sendInvitation}).tick();expect(sendInvitation).not.toHaveBeenCalled();expect(pending.markFailed).toHaveBeenCalledWith('delivery-1','INVALID_DELIVERY');});
});
