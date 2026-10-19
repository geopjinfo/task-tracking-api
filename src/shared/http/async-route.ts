import type { NextFunction,Request,Response } from 'express';
export type AsyncHandler=(request:Request,response:Response)=>Promise<void>;
export const asyncRoute=(handler:AsyncHandler)=>(request:Request,response:Response,next:NextFunction):void=>{void handler(request,response).catch(next);};
