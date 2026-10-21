const db=require('./dbService'),{verifiedAdult}=require('./contentAccess');
const sql=db.sql,retention=30*86400000;
sql.exec(`CREATE TABLE IF NOT EXISTS safety_events(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,character_id TEXT NOT NULL,request_id TEXT NOT NULL,kind TEXT NOT NULL,reason TEXT NOT NULL,age_group TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS safety_events_time ON safety_events(created_at);`);
function ageGroup(user){const v=user?.identityVerification;return verifiedAdult(user)?'adult':user?.phone&&['portone_danal','portone_inicis'].includes(v?.method)&&v.verified===true&&Number.isSafeInteger(v.verifiedAt)&&v.verifiedAt>0&&v.verifiedAt<=Date.now()&&/^identity_[a-f0-9-]{36}$/.test(v.verificationId||'')&&v.isAdult===false?'under19':'unknown';}
function prune(){sql.prepare('DELETE FROM safety_events WHERE created_at<?').run(Date.now()-retention);}
function record(userId,characterId,requestId,kind,error){
 const known=['ADULT_VERIFICATION_REQUIRED','CONTENT_NOT_ALLOWED','LLM_INVALID_SAFETY'];
 const reason=known.includes(error?.message)?error.message:error?.safetyCheckFailed?'SAFETY_CHECK_UNAVAILABLE':null;
 if(!['ADULT_VERIFICATION_REQUIRED','CONTENT_NOT_ALLOWED','LLM_INVALID_SAFETY','SAFETY_CHECK_UNAVAILABLE'].includes(reason))return;
 prune();sql.prepare('INSERT INTO safety_events(user_id,character_id,request_id,kind,reason,age_group,created_at) VALUES(?,?,?,?,?,?,?)').run(userId,String(characterId),String(requestId),kind,reason,ageGroup(db.getUser(userId)),Date.now());
}
function list(page=0,days=30){prune();const since=Date.now()-Math.min(30,days)*86400000;
 const total=sql.prepare('SELECT count(*) n FROM safety_events WHERE created_at>=?').get(since).n;
 const counts=sql.prepare('SELECT age_group,reason,count(*) n FROM safety_events WHERE created_at>=? GROUP BY age_group,reason').all(since);
 const items=sql.prepare('SELECT * FROM safety_events WHERE created_at>=? ORDER BY id DESC LIMIT 30 OFFSET ?').all(since,page*30);
 return {total,counts,items,retentionDays:30};
}
const timer=setInterval(prune,3600000);timer.unref();
module.exports={record,list,ageGroup};
