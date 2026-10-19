import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';

const apiBase=process.env.API_BASE_URL??'http://127.0.0.1:3000/api/v1';
const mongoUri=process.env.LOAD_MONGODB_URI??'mongodb://127.0.0.1:27017/task_tracking?replicaSet=rs0&directConnection=true';
const requestCount=200,concurrency=20,email=`load-${randomUUID()}@example.com`;

const json=async(path,options={})=>{
 const response=await fetch(`${apiBase}${path}`,{...options,headers:{'content-type':'application/json',...options.headers}});
 const body=await response.json().catch(()=>undefined);
 if(!response.ok)throw new Error(`${options.method??'GET'} ${path} returned ${response.status}: ${JSON.stringify(body)}`);
 return body;
};

const registered=await json('/auth/register',{method:'POST',body:JSON.stringify({email,displayName:'Load Smoke',password:'correct horse battery staple'})});
const authorization={authorization:`Bearer ${registered.accessToken}`};
const project=await json('/projects',{method:'POST',headers:authorization,body:JSON.stringify({name:'Load smoke'})});
await Promise.all(Array.from({length:100},(_,index)=>json(`/projects/${project.id}/tasks`,{method:'POST',headers:authorization,body:JSON.stringify({title:`Indexed task ${String(index).padStart(3,'0')}`})})));

const durations=[];
for(let offset=0;offset<requestCount;offset+=concurrency){
 const batch=Array.from({length:Math.min(concurrency,requestCount-offset)},async()=>{
  const started=performance.now();
  await json(`/projects/${project.id}/tasks?limit=20&sort=createdAt&order=desc`,{headers:authorization});
  durations.push(performance.now()-started);
 });
 await Promise.all(batch);
}
durations.sort((left,right)=>left-right);
const percentile=value=>durations[Math.ceil((value/100)*durations.length)-1]??0;
const findIndexName=value=>{
 if(!value||typeof value!=='object')return undefined;
 if(typeof value.indexName==='string')return value.indexName;
 for(const nested of Object.values(value)){const found=findIndexName(nested);if(found)return found;}
 return undefined;
};

const client=new MongoClient(mongoUri);
await client.connect();
const explanation=await client.db().collection('tasks').find({projectId:project.id}).sort({createdAt:-1,id:-1}).limit(20).explain('executionStats');
const execution=explanation.executionStats;
const result={requests:requestCount,concurrency,p50Ms:Number(percentile(50).toFixed(2)),p95Ms:Number(percentile(95).toFixed(2)),p99Ms:Number(percentile(99).toFixed(2)),indexPlan:execution?.executionStages?.inputStage?.stage??execution?.executionStages?.stage,indexName:findIndexName(explanation.queryPlanner?.winningPlan),totalDocsExamined:execution?.totalDocsExamined,totalKeysExamined:execution?.totalKeysExamined};
await client.db().collection('projects').deleteOne({id:project.id});
await client.db().collection('memberships').deleteMany({projectId:project.id});
await client.db().collection('tasks').deleteMany({projectId:project.id});
await client.db().collection('sessions').deleteMany({userId:registered.user.id});
await client.db().collection('users').deleteOne({id:registered.user.id});
await client.close();

console.log(JSON.stringify(result,null,2));
if(result.p95Ms>300)process.exitCode=1;
