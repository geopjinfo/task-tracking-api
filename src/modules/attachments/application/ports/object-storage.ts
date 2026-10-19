export type ObjectMetadata={contentLength:number;contentType?:string};
export interface ObjectStorage{createUploadUrl(input:{key:string;contentType:string;sizeBytes:number;expiresInSeconds:number}):Promise<string>;head(key:string):Promise<ObjectMetadata|null>;createDownloadUrl(input:{key:string;fileName:string;expiresInSeconds:number}):Promise<string>;delete(key:string):Promise<void>;}
