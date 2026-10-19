export type InvitationMail={to:string;acceptUrl:string;idempotencyKey:string};

export interface MailerPort{
 sendInvitation(message:InvitationMail):Promise<void>;
}
