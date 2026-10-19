import type { ClientSession,MongoClient } from 'mongodb';
export type Transaction=ClientSession;
export interface TransactionManager{run<T>(work:(transaction:Transaction)=>Promise<T>):Promise<T>;}
export class MongoTransactionManager implements TransactionManager{constructor(private readonly client:MongoClient){}async run<T>(work:(transaction:Transaction)=>Promise<T>):Promise<T>{const session=this.client.startSession();try{return await session.withTransaction(()=>work(session));}finally{await session.endSession();}}}
