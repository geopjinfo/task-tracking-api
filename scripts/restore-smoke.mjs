import { spawnSync } from 'node:child_process';

const run=(args,input)=>{const result=spawnSync('docker',['compose',...args],{encoding:'utf8',input});if(result.status!==0)throw new Error(result.stderr||result.stdout||`docker ${args.join(' ')} failed`);return result.stdout.trim();};
const source='task_tracking_restore_source',target='task_tracking_restore_target',archive='/tmp/task-tracking-restore.archive';
const key=`restore-smoke-${Date.now()}.txt`,backup='task-tracking-restore-backup';
try{
  run(['exec','-T','mongo','mongosh','--quiet','--eval',`db.getSiblingDB('${source}').evidence.insertOne({kind:'restore-smoke',createdAt:new Date()})`]);
  run(['exec','-T','mongo','mongodump','--db',source,`--archive=${archive}`]);
  run(['exec','-T','mongo','mongorestore',`--archive=${archive}`,'--drop',`--nsFrom=${source}.*`,`--nsTo=${target}.*`]);
  const restored=run(['exec','-T','mongo','mongosh','--quiet','--eval',`db.getSiblingDB('${target}').evidence.countDocuments({kind:'restore-smoke'})`]);
  if(!restored.endsWith('1'))throw new Error(`MongoDB restore verification returned ${restored}`);
  run(['exec','-T','minio','sh','-c','mc alias set restore http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null']);
  run(['exec','-T','minio','mc','mb','--ignore-existing',`restore/${backup}`]);
  run(['exec','-T','minio','mc','pipe',`restore/task-attachments/${key}`],'restore-smoke');
  run(['exec','-T','minio','mc','cp',`restore/task-attachments/${key}`,`restore/${backup}/${key}`]);
  run(['exec','-T','minio','mc','rm',`restore/task-attachments/${key}`]);
  run(['exec','-T','minio','mc','cp',`restore/${backup}/${key}`,`restore/task-attachments/${key}`]);
  run(['exec','-T','minio','mc','stat',`restore/task-attachments/${key}`]);
  console.log('MongoDB and MinIO backup/restore smoke passed');
}finally{
  run(['exec','-T','mongo','mongosh','--quiet','--eval',`db.getSiblingDB('${source}').dropDatabase();db.getSiblingDB('${target}').dropDatabase()`]);
  run(['exec','-T','mongo','rm','-f',archive]);
  run(['exec','-T','minio','mc','rm','--force',`restore/task-attachments/${key}`]);
  run(['exec','-T','minio','mc','rb','--force',`restore/${backup}`]);
}
