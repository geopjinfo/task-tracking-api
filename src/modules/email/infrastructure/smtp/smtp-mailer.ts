import nodemailer from 'nodemailer';
import type { MailerPort,InvitationMail } from '../../application/ports/mailer.js';

export class SmtpMailer implements MailerPort{
 private readonly transport;

 constructor(host:string,port:number,private readonly from:string){
  this.transport=nodemailer.createTransport({host,port,secure:false});
 }

 async sendInvitation(message:InvitationMail):Promise<void>{
  await this.transport.sendMail({
   from:this.from,
   to:message.to,
   subject:'You have been invited to a project',
   text:`You have been invited to collaborate on a project. Accept the invitation: ${message.acceptUrl}\n\nThis invitation expires in 72 hours.`,
   html:`<p>You have been invited to collaborate on a project.</p><p><a href="${escapeHtml(message.acceptUrl)}">Accept invitation</a></p><p>This invitation expires in 72 hours.</p>`,
   messageId:`<${message.idempotencyKey}@task-tracking.local>`
  });
 }
}

const escapeHtml=(value:string):string=>value.replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
