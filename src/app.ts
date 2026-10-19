import cookieParser from 'cookie-parser'; import cors from 'cors'; import express from 'express';
import pino from 'pino'; import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import type { RedisClient } from './platform/redis/redis.client.js';
import type { Config } from './config.js'; import type { Database } from './database.js';
import { asyncRoute, contextMiddleware, errorHandler, notFound } from './shared.js';
import { createTaskModule } from './modules/tasks/task.module.js';
import { createIdentityModule } from './modules/identity/identity.module.js';
import { createProjectModule } from './modules/projects/project.module.js';
import { createCommentModule } from './modules/comments/comment.module.js';
import { createAttachmentModule } from './modules/attachments/attachment.module.js';
import { createNotificationModule } from './modules/notifications/notification.module.js';
import type { OutboxWorker } from './modules/notifications/application/outbox.worker.js';
import { createAiModule } from './modules/ai/ai.module.js';
import { createEmailModule } from './modules/email/email.module.js';
import type { EmailDeliveryWorker } from './modules/email/application/email-delivery.worker.js';
import { registerModules } from './app/module-registry.js';
import { createAuthRateLimiter } from './platform/redis/auth-rate-limiter.js';


export type BackgroundWorkers={notifications:OutboxWorker;email:EmailDeliveryWorker};

export function createApp(db:Database,config:Config,redis:RedisClient,injectedLogger?:Logger,registerWorkers?:(workers:BackgroundWorkers)=>void){
 const app=express();
 const logger=injectedLogger??pino({level:config.LOG_LEVEL,redact:['req.headers.authorization','req.headers.cookie','password','token','refreshToken','OPENROUTER_API_KEY']});
 app.disable('x-powered-by');app.set('trust proxy',config.TRUST_PROXY);app.use(contextMiddleware,pinoHttp({logger}),cors({origin:config.PUBLIC_URL,credentials:true}),express.json({limit:'1mb'}),cookieParser());
 const api=express.Router(),protectedApi=express.Router(),identity=createIdentityModule(db,config,createAuthRateLimiter(redis)),projects=createProjectModule(db,identity.userRepository,config.PUBLIC_URL),taskModule=createTaskModule(db,projects.access),comments=createCommentModule(db,taskModule.service),attachments=createAttachmentModule(db,config,taskModule.service,projects.access),notifications=createNotificationModule(db,redis,projects.access),email=createEmailModule(db,config),ai=createAiModule(db,redis,config,projects.access,taskModule.service,comments.service);registerWorkers?.({notifications:notifications.worker,email:email.worker});
 api.use('/auth',identity.publicRoutes);protectedApi.use(identity.authentication,identity.profileRoutes);
 registerModules(protectedApi,[projects,taskModule,comments,attachments,notifications,ai]);
 api.use(protectedApi); app.use('/api/v1',api);
 app.get('/health/live',(_req,res)=>res.json({status:'ok'}));app.get('/health/ready',asyncRoute(async(_req,res)=>{await Promise.all([db.ping(),redis.ping()]);res.json({status:'ready'});}));
 app.use(notFound,errorHandler); return app;
}
