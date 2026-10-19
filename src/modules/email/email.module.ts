import type { Config } from '../../config/index.js';
import type { Database } from '../../database.js';
import { EmailDeliveryWorker } from './application/email-delivery.worker.js';
import type { InvitationEmailDelivery } from './domain/email-delivery.js';
import { MongoEmailDeliveryRepository } from './infrastructure/persistence/mongo-email-delivery.repository.js';
import { SmtpMailer } from './infrastructure/smtp/smtp-mailer.js';

export function createEmailModule(db:Database,config:Config){
 const repository=new MongoEmailDeliveryRepository(db.collection<InvitationEmailDelivery>('email_deliveries'));
 const mailer=new SmtpMailer(config.SMTP_HOST,config.SMTP_PORT,config.MAIL_FROM);
 return {worker:new EmailDeliveryWorker(repository,mailer)};
}
