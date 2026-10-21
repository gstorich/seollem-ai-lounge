const db=require('./dbService'),{verifiedAdult}=require('./contentAccess');
const sql=db.sql,retention=30*86400000;
sql.exec(`CREATE TABLE IF NOT EXISTS safety_events(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,character_id TEXT NOT NULL,request_id TEXT NOT NULL,kind TEXT NOT NULL,reason TEXT NOT NULL,age_group TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS safety_events_time ON safety_events(created_at);`);
// Additive migration preserves existing monitoring history.
const columns=new Set(sql.prepare('PRAGMA table_info(safety_events)').all().map(c=>c.name));
for(const field of ['stage','category'])if(!columns.has(field))sql.exec(`ALTER TABLE safety_events ADD COLUMN ${field} TEXT NOT NULL DEFAULT 'unknown'`);
function ageGroup(user){if(require('./adultTestAccess').active(user))return 'adult_test';const v=user?.identityVerification;return verifiedAdult(user)?'adult':user?.phone&&['portone_danal','portone_inicis'].includes(v?.method)&&v.verified===true&&Number.isSafeInteger(v.verifiedAt)&&v.verifiedAt>0&&v.verifiedAt<=Date.now()&&/^identity_[a-f0-9-]{36}$/.test(v.verificationId||'')&&v.isAdult===false?'under19':'unknown';}
function prune(){sql.prepare('DELETE FROM safety_events WHERE created_at<?').run(Date.now()-retention);}
function record(userId,characterId,requestId,kind,error){
 const known=['ADULT_VERIFICATION_REQUIRED','CONTENT_NOT_ALLOWED','LLM_INVALID_SAFETY'];
 const reason=known.includes(error?.message)?error.message:error?.safetyCheckFailed?'SAFETY_CHECK_UNAVAILABLE':null;
 if(!['ADULT_VERIFICATION_REQUIRED','CONTENT_NOT_ALLOWED','LLM_INVALID_SAFETY','SAFETY_CHECK_UNAVAILABLE'].includes(reason))return;
 const stage=['input','output'].includes(error?.safetyStage)?error.safetyStage:'unknown';
 const category=['adultTransition','sexualContent','explicitContent','sexualMinors','nonConsensualSex','realPersonSexualization','seriousHarm'].includes(error?.safetyCategory)?error.safetyCategory:'unknown';
 prune();sql.prepare('INSERT INTO safety_events(user_id,character_id,request_id,kind,reason,age_group,created_at,stage,category) VALUES(?,?,?,?,?,?,?,?,?)').run(userId,String(characterId),String(requestId),kind,reason,ageGroup(db.getUser(userId)),Date.now(),stage,category);
}
function list(page=0,days=30){prune();const since=Date.now()-Math.min(30,days)*86400000;
 const total=sql.prepare('SELECT count(*) n FROM safety_events WHERE created_at>=?').get(since).n;
 const counts=sql.prepare('SELECT age_group,reason,count(*) n FROM safety_events WHERE created_at>=? GROUP BY age_group,reason').all(since);
 const items=sql.prepare('SELECT * FROM safety_events WHERE created_at>=? ORDER BY id DESC LIMIT 30 OFFSET ?').all(since,page*30);
 const stages=sql.prepare('SELECT stage,kind,count(*) n FROM safety_events WHERE created_at>=? GROUP BY stage,kind').all(since);
 const characters=sql.prepare('SELECT character_id,count(*) n FROM safety_events WHERE created_at>=? GROUP BY character_id ORDER BY n DESC LIMIT 20').all(since);
 return {total,counts,items,stages,characters,retentionDays:30};
}
const timer=setInterval(prune,3600000);timer.unref();
module.exports={record,list,ageGroup};
