export type AiUsage={id:string;userId:string;projectId:string;feature:'description_draft'|'task_summary';model:string;inputUnits:number;outputUnits:number;createdAt:Date};
export interface AiUsageRepository{insert(usage:AiUsage):Promise<void>}
