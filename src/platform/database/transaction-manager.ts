import { randomUUID } from 'node:crypto';
import type { ClientSession,MongoClient,TransactionOptions } from 'mongodb';
import { AppError } from '../../shared/errors/app-error.js';

export interface TransactionContext{readonly id:string;}
export interface TransactionManager{run<T>(work:(context:TransactionContext)=>Promise<T>):Promise<T>;}

const sessions=new WeakMap<TransactionContext,ClientSession>();
const options:TransactionOptions={readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'};

export function mongoSession(context:TransactionContext):ClientSession{
 const session=sessions.get(context);if(!session)throw new Error('Transaction context is not active');return session;
}

export async function withMongoTransaction<T>(client:MongoClient,context:TransactionContext|undefined,work:(session:ClientSession)=>Promise<T>):Promise<T>{
 if(context)return work(mongoSession(context));
 return client.withSession(session=>session.withTransaction(()=>work(session),options));
}

export class MongoTransactionManager implements TransactionManager{
 constructor(private readonly client:MongoClient){}
 async run<T>(work:(context:TransactionContext)=>Promise<T>):Promise<T>{
  const session=this.client.startSession(),context:TransactionContext=Object.freeze({id:randomUUID()});sessions.set(context,session);
  try{return await session.withTransaction(()=>work(context),options);}
  catch(error:unknown){
   if(error instanceof AppError)throw error;
   throw new AppError(503,'TRANSACTION_FAILED','The operation could not be committed safely');
  }finally{sessions.delete(context);await session.endSession();}
 }
}
