// Run after a verified backup, with the archive worker stopped. No new volume is allocated.
const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
function reclaim(file){
 const before=fs.statSync(file).size,space=fs.statfsSync(path.dirname(file));
 // VACUUM needs a temporary database. Refuse when existing disk space is tight.
 if(space.bavail*space.bsize < before*3+64*1024*1024)throw Error('INSUFFICIENT_EXISTING_DISK_SPACE');
 const sql=new DatabaseSync(file);
 try{
  sql.exec('PRAGMA busy_timeout=5000');
  if(sql.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('DATABASE_INTEGRITY_FAILED');
  if(sql.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy)throw Error('DATABASE_BUSY');
  sql.exec('PRAGMA auto_vacuum=INCREMENTAL; VACUUM;');
  if(sql.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('DATABASE_INTEGRITY_FAILED');
  if(sql.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy)throw Error('DATABASE_BUSY');
  if(sql.prepare('PRAGMA auto_vacuum').get().auto_vacuum!==2)throw Error('INCREMENTAL_VACUUM_NOT_ENABLED');
  return {beforeBytes:before,afterBytes:fs.statSync(file).size,incrementalVacuum:true,verified:true};
 }finally{sql.close();}
}
module.exports={reclaim};
if(require.main===module){try{if(!process.argv[2])throw Error('Expected SQLite file path');console.log(JSON.stringify(reclaim(process.argv[2])));}catch(e){console.error('Database reclaim failed:',e.message);process.exitCode=1;}}
