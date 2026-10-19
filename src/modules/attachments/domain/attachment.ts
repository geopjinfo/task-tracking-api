export type AttachmentStatus='pending'|'ready'|'failed'|'deleted';
export type Attachment={id:string;taskId:string;projectId:string;uploaderId:string;objectKey:string;fileName:string;mimeType:string;sizeBytes:number;status:AttachmentStatus;createdAt:Date;completedAt?:Date;deletedAt?:Date;failureCode?:string};
