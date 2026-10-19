import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import type { Config } from './config.js';

export class Database {
  readonly client: MongoClient; db?: Db;
  constructor(config: Config) { this.client = new MongoClient(config.MONGODB_URI); }
  async connect(): Promise<void> { await this.client.connect(); this.db = this.client.db(); await this.indexes(); }
  collection<T extends Document>(name: string): Collection<T> { if (!this.db) throw new Error('Database is not connected'); return this.db.collection<T>(name); }
  async ping(): Promise<void> { if (!this.db) throw new Error('Database is not connected'); await this.db.command({ ping: 1 }); }
  async close(): Promise<void> { await this.client.close(); }
  private async indexes(): Promise<void> {
    await Promise.all([
      this.collection('users').createIndex({ emailNormalized: 1 }, { unique: true }),
      this.collection('sessions').createIndex({ tokenHash: 1 }, { unique: true }),
      this.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.collection('memberships').createIndex({ projectId: 1, userId: 1 }, { unique: true }),
      this.collection('invitations').createIndex({ tokenHash: 1 }, { unique: true }),
      this.collection('tasks').createIndex({ projectId: 1, createdAt: -1, id: -1 }),
      this.collection('tasks').createIndex({ title: 'text', description: 'text' }),
      this.collection('comments').createIndex({ taskId: 1, createdAt: 1 }),
      this.collection('notifications').createIndex({ recipientId: 1, createdAt: -1, id: -1 }),
      this.collection('notifications').createIndex({ deliveryKey: 1 }, { unique: true }),
      this.collection('outbox_events').createIndex({ status: 1, availableAt: 1, leaseUntil: 1 })
    ]);
  }
}
