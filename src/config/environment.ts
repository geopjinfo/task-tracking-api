import { z } from 'zod';

const environmentSchema=z.object({
 NODE_ENV:z.enum(['development','test','production']).default('development'),PORT:z.coerce.number().int().min(1).max(65535).default(3000),PUBLIC_URL:z.url().default('http://localhost:3000'),TRUST_PROXY:z.coerce.number().int().min(0).max(2).default(0),
 MONGODB_URI:z.string().min(1),REDIS_URL:z.string().min(1),
 JWT_SECRET:z.string().min(32),JWT_ISSUER:z.string().min(1).default('task-tracking-api'),JWT_AUDIENCE:z.string().min(1).default('task-tracking-client'),ACCESS_TOKEN_TTL_SECONDS:z.coerce.number().int().min(60).max(3600).default(900),REFRESH_TOKEN_TTL_DAYS:z.coerce.number().int().min(1).max(90).default(30),COOKIE_SECURE:z.stringbool().default(false),
 S3_ENDPOINT:z.url(),S3_REGION:z.string().default('us-east-1'),S3_BUCKET:z.string().min(3),S3_ACCESS_KEY:z.string().min(1),S3_SECRET_KEY:z.string().min(1),
 SMTP_HOST:z.string().min(1).default('mailpit'),SMTP_PORT:z.coerce.number().int().min(1).max(65535).default(1025),MAIL_FROM:z.email().default('tasks@localhost.test'),
 OPENROUTER_API_KEY:z.string().min(1).optional(),OPENROUTER_MODEL:z.string().min(1).default('openai/gpt-4.1-mini'),OPENROUTER_TIMEOUT_MS:z.coerce.number().int().min(1000).max(30000).default(10000),
 OTEL_ENABLED:z.stringbool().default(false),OTEL_EXPORTER_OTLP_ENDPOINT:z.url().default('http://otel-collector:4318'),LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default('info'),SHUTDOWN_TIMEOUT_MS:z.coerce.number().int().min(1000).max(30000).default(10000)
}).superRefine((value,context)=>{if(value.NODE_ENV==='production'&&!value.COOKIE_SECURE)context.addIssue({code:'custom',path:['COOKIE_SECURE'],message:'COOKIE_SECURE must be true in production'});if(value.NODE_ENV==='production'&&value.JWT_SECRET.toLowerCase().includes('replace'))context.addIssue({code:'custom',path:['JWT_SECRET'],message:'JWT_SECRET placeholder is forbidden in production'});});
export type Config=z.infer<typeof environmentSchema>;
export const loadConfig=(environment:NodeJS.ProcessEnv=process.env):Config=>environmentSchema.parse(environment);
