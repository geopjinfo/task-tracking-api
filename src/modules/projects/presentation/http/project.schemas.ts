import { z } from 'zod';
export const projectIdParams=z.object({projectId:z.uuid()});
export const memberParams=projectIdParams.extend({userId:z.uuid()});
export const invitationParams=z.object({token:z.string().min(20).max(200)});
export const createProjectBody=z.object({name:z.string().trim().min(2).max(120),description:z.string().max(2000).default('')});
export const updateProjectBody=z.object({name:z.string().trim().min(2).max(120).optional(),description:z.string().max(2000).optional()}).refine(value=>value.name!==undefined||value.description!==undefined,{message:'At least one field is required'});
export const inviteBody=z.object({email:z.string().trim().email(),role:z.enum(['admin','member']).default('member')});
