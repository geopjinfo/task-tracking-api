import type { RequestHandler } from 'express';
type RateLimitRedis={incr(key:string):Promise<number>;expire(key:string,seconds:number):Promise<number>};

export function createAuthRateLimiter(redis:RateLimitRedis):RequestHandler{
 return async(req,res,next)=>{
  try{
   const key=`rate:auth:${req.ip??'unknown'}`;
   const count=await redis.incr(key);if(count===1)await redis.expire(key,60);
   res.setHeader('RateLimit-Limit','20');res.setHeader('RateLimit-Remaining',String(Math.max(0,20-count)));
   if(count>20){res.setHeader('Retry-After','60');res.status(429).json({error:{code:'RATE_LIMITED',message:'Too many authentication requests'}});return;}
   next();
  }catch(error:unknown){req.log.error({err:error},'authentication rate limiter unavailable');res.status(503).json({error:{code:'DEPENDENCY_UNAVAILABLE',message:'Authentication protection is temporarily unavailable'}});}
 };
}
