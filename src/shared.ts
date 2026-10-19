import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { v7 as uuidv7 } from 'uuid';
import { ZodError } from 'zod';

export type RequestContext = { requestId: string; userId?: string; projectId?: string };
export const requestContext = new AsyncLocalStorage<RequestContext>();
export const contextMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.header('x-request-id')?.slice(0, 100) || uuidv7();
  res.setHeader('x-request-id', requestId);
  requestContext.run({ requestId }, next);
};
export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) { super(message); }
}
export const asyncRoute = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction): void => { void fn(req, res).catch(next); };
export const errorHandler = (error: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  const requestId = requestContext.getStore()?.requestId;
  if (error instanceof ZodError) { res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues, requestId } }); return; }
  if (error instanceof AppError) { res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details, requestId } }); return; }
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId } });
};
export const notFound = (_req: Request, res: Response): void => { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found', requestId: requestContext.getStore()?.requestId } }); };
export const newId = (): string => uuidv7();
