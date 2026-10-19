import { AsyncLocalStorage } from 'node:async_hooks';import type { NextFunction,Request,Response } from 'express';import { newId } from '../ids.js';
export type RequestContext={requestId:string;userId?:string;projectId?:string};
export const requestContext=new AsyncLocalStorage<RequestContext>();
export const contextMiddleware=(request:Request,response:Response,next:NextFunction):void=>{const requestId=request.header('x-request-id')?.slice(0,100)||newId();response.setHeader('x-request-id',requestId);requestContext.run({requestId},next);};
