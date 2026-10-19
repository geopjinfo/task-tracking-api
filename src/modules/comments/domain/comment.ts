export type Comment={id:string;taskId:string;projectId:string;authorId:string;body:string;createdAt:Date;updatedAt:Date;deletedAt?:Date};
export const presentComment=(comment:Comment):Comment=>comment.deletedAt?{...comment,body:'[deleted]'}:comment;
