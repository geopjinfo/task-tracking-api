import { Router } from 'express';import { asyncRoute } from '../../../../shared/http/async-route.js';import type { AiController } from './ai.controller.js';
export const aiRoutes=(controller:AiController):Router=>{const router=Router();router.post('/ai/tasks/description-draft',asyncRoute(controller.draft));router.post('/ai/tasks/:taskId/summary',asyncRoute(controller.summary));return router;};
