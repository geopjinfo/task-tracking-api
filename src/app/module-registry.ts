import type { Router } from 'express';
export type HttpModule={routes:Router};
export const registerModules=(router:Router,modules:readonly HttpModule[]):void=>{for(const module of modules)router.use(module.routes);};
