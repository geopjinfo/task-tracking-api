export type GenerationRequest={system:string;input:string;maxTokens:number};
export type GenerationResult={text:string;model:string;inputUnits:number;outputUnits:number};
export interface AiProvider{generate(request:GenerationRequest):Promise<GenerationResult>}
