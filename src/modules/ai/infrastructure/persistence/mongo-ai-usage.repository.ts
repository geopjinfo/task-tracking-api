import type { Collection } from 'mongodb';import type { AiUsage,AiUsageRepository } from '../../application/ports/ai-usage.repository.js';
export class MongoAiUsageRepository implements AiUsageRepository{constructor(private readonly collection:Collection<AiUsage>){}async insert(usage:AiUsage):Promise<void>{await this.collection.insertOne(usage);}}
