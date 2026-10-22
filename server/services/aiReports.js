// Reports concern generated AI content, never disputes between human users.
const crypto=require('node:crypto'),db=require('./dbService');
const sql=db.sql;
const categories={sexual_minors:'미성년자 관련 성적 내용',non_consensual:'비동의·강압적 내용',sexual:'원치 않는 성적 내용',harm:'위험·범죄·혐오 내용',privacy:'개인정보·실존 인물 침해',quality:'반복·맥락 오류·부적절한 말투',other:'기타'};
const states={open:'접수',reviewing:'검토 중',resolved:'조치 완료',dismissed:'문제 없음'};
const outcomes={review:'검토 시작',improved:'개선 조치 기록',no_issue:'문제 없음',hold_character:'캐릭터 제공 일시 중지',resume_character:'캐릭터 제공 재개',note:'검토 메모'};
sql.exec(`CREATE TABLE IF NOT EXISTS ai_content_reports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,character_id TEXT NOT NULL,message_id TEXT NOT NULL,category TEXT NOT NULL,detail TEXT NOT NULL,snapshot TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',public_reply TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,UNIQUE(user_id,character_id,message_id));
CREATE INDEX IF NOT EXISTS ai_report_queue ON ai_content_reports(status,updated_at);
CREATE TABLE IF NOT EXISTS ai_report_actions(id INTEGER PRIMARY KEY,report_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,note TEXT NOT NULL,public_reply TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ai_report_history ON ai_report_actions(report_id,id);
CREATE TABLE IF NOT EXISTS ai_character_holds(character_id TEXT PRIMARY KEY,report_id TEXT NOT NULL,actor TEXT NOT NULL,reason TEXT NOT NULL,created_at INTEGER NOT NULL);`);
function fail(message,status=400){throw Object.assign(Error(message),{status});}
function validId(v){return typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);}
function isHeld(id){return Boolean(sql.prepare('SELECT 1 FROM ai_character_holds WHERE character_id=?').get(id));}
function assertAvailable(id){if(isHeld(id))throw Object.assign(Error('CHARACTER_UNDER_REVIEW'),{status:503,characterHeld:true});}
function summary(r){return {id:r.id,characterId:r.character_id,characterName:require('./characterService').getCharacterById(r.character_id)?.name||r.character_id,messageId:r.message_id,category:r.category,status:r.status,publicReply:r.public_reply,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at};}
function owned(id,userId){const r=sql.prepare('SELECT * FROM ai_content_reports WHERE id=?').get(id);return r&&db.resolveUserId(r.user_id)===db.resolveUserId(userId)?r:null;}
async function create(userId,input){
 const {characterId,messageId,category,detail=''}=input;
 if(!validId(characterId)||!validId(messageId)||!Object.hasOwn(categories,category)||typeof detail!=='string'||detail.length>1500)fail('신고 내용과 사유를 확인해주세요. 설명은 1,500자 이내입니다.');
 userId=db.resolveUserId(userId);
 const find=messageId=>sql.prepare('SELECT * FROM conversation_messages WHERE user_id=? AND character_id=? AND message_id=?').get(userId,characterId,messageId);
 // Split presentation bubbles refer to one durable provider response.
 const target=find(messageId)||(/_\d+$/.test(messageId)?find(messageId.replace(/_\d+$/,'')):null);
 if(!target||JSON.parse(target.data).sender!=='ai')fail('내 대화의 AI 답변만 신고할 수 있습니다.',404);
 const existing=sql.prepare('SELECT * FROM ai_content_reports WHERE user_id=? AND character_id=? AND message_id=?').get(userId,characterId,target.message_id);
 if(existing)return {report:summary(existing),duplicate:true};
 if(sql.prepare('SELECT count(*) n FROM ai_content_reports WHERE user_id=? AND created_at>?').get(userId,Date.now()-86400000).n>=20)fail('하루 최대 20건까지 신고할 수 있습니다. 추가 신고는 고객센터로 문의해주세요.',429);
 const before=sql.prepare('SELECT * FROM conversation_messages WHERE user_id=? AND character_id=? AND (created_at<? OR (created_at=? AND message_id<?)) ORDER BY created_at DESC,message_id DESC LIMIT 4').all(userId,characterId,target.created_at,target.created_at,target.message_id).reverse();
 const after=sql.prepare('SELECT * FROM conversation_messages WHERE user_id=? AND character_id=? AND (created_at>? OR (created_at=? AND message_id>?)) ORDER BY created_at,message_id LIMIT 2').all(userId,characterId,target.created_at,target.created_at,target.message_id);
 const rows=[...before,target,...after];
 let hydrated;
 try{hydrated=await require('./conversationArchive').hydrateRows(rows);}catch{fail('대화 기록을 불러오지 못했습니다. 잠시 후 다시 신고해주세요.',503);}
 const messages=hydrated.map(m=>({id:m.id,sender:m.sender,text:String(m.text||m.voiceText||'').slice(0,12000),createdAt:m.createdAt,target:m.id===target.message_id}));
 return db.transaction(()=>{
  userId=db.resolveUserId(userId);
  // Recheck after the asynchronous archive read, including concurrent duplicates.
  const same=sql.prepare('SELECT * FROM ai_content_reports WHERE user_id=? AND character_id=? AND message_id=?').get(userId,characterId,target.message_id);
  if(same)return {report:summary(same),duplicate:true};
  if(sql.prepare('SELECT count(*) n FROM ai_content_reports WHERE user_id=? AND created_at>?').get(userId,Date.now()-86400000).n>=20)fail('하루 최대 20건까지 신고할 수 있습니다.',429);
  const id=crypto.randomUUID(),now=Date.now();
  sql.prepare("INSERT INTO ai_content_reports(id,user_id,character_id,message_id,category,detail,snapshot,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").run(id,userId,characterId,target.message_id,category,detail.trim(),JSON.stringify({messages}),now,now);
  sql.prepare("INSERT INTO ai_report_actions(report_id,actor,action,note,public_reply,created_at) VALUES(?,?,'submitted','','',?)").run(id,'reporter',now);
  return {report:summary(sql.prepare('SELECT * FROM ai_content_reports WHERE id=?').get(id)),duplicate:false};
 });
}
function prune(){const cutoff=Date.now()-365*86400000;sql.prepare("UPDATE ai_character_holds SET report_id='' WHERE report_id IN (SELECT id FROM ai_content_reports WHERE created_at<?)").run(cutoff);sql.prepare('DELETE FROM ai_report_actions WHERE report_id IN (SELECT id FROM ai_content_reports WHERE created_at<?)').run(cutoff);sql.prepare('DELETE FROM ai_content_reports WHERE created_at<?').run(cutoff);}
const timer=setInterval(prune,3600000);timer.unref();prune();
function mine(userId,page=0){userId=db.resolveUserId(userId);const where='user_id=?';return {items:sql.prepare(`SELECT * FROM ai_content_reports WHERE ${where} ORDER BY created_at DESC LIMIT 20 OFFSET ?`).all(userId,page*20).map(summary),total:sql.prepare(`SELECT count(*) n FROM ai_content_reports WHERE ${where}`).get(userId).n,categories,states};}
function ownDetail(id,userId){const r=owned(id,userId);if(!r)return null;return {...summary(r),detail:r.detail,messages:JSON.parse(r.snapshot).messages};}
function list({status='all',page=0}={}){const where=Object.hasOwn(states,status)?'WHERE status=?':'',args=where?[status]:[];return {items:sql.prepare(`SELECT * FROM ai_content_reports ${where} ORDER BY updated_at DESC LIMIT 30 OFFSET ?`).all(...args,page*30).map(r=>({...summary(r),excerpt:JSON.parse(r.snapshot).messages.find(m=>m.target)?.text.slice(0,180)||''})),total:sql.prepare(`SELECT count(*) n FROM ai_content_reports ${where}`).get(...args).n,counts:sql.prepare('SELECT status,count(*) n FROM ai_content_reports GROUP BY status').all(),holds:sql.prepare('SELECT character_id characterId,report_id reportId,created_at createdAt FROM ai_character_holds').all().map(h=>({...h,characterName:require('./characterService').getCharacterById(h.characterId)?.name||h.characterId})),categories,states,outcomes};}
function get(id){const r=sql.prepare('SELECT * FROM ai_content_reports WHERE id=?').get(id);if(!r)return null;return {...summary(r),detail:r.detail,messages:JSON.parse(r.snapshot).messages,held:isHeld(r.character_id),actions:sql.prepare('SELECT action,note,public_reply publicReply,created_at createdAt FROM ai_report_actions WHERE report_id=? ORDER BY id').all(id)};}
function act(id,actor,input){
 const {action,note='',publicReply='',version}=input;
 if(!Object.hasOwn(outcomes,action)||typeof note!=='string'||note.trim().length<5||note.length>3000||typeof publicReply!=='string'||publicReply.length>1500||!Number.isSafeInteger(version))fail('조치와 검토 근거(5~3,000자)를 입력해주세요.');
 if(['improved','no_issue','hold_character','resume_character'].includes(action)&&publicReply.trim().length<5)fail('신고자에게 안내할 결과를 5자 이상 입력해주세요.');
 return db.transaction(()=>{
  const r=sql.prepare('SELECT * FROM ai_content_reports WHERE id=?').get(id);if(!r)fail('신고를 찾을 수 없습니다.',404);if(r.version!==version)fail('다른 작업으로 변경되었습니다. 다시 열어주세요.',409);
  if(action==='hold_character'){const h=sql.prepare('SELECT report_id FROM ai_character_holds WHERE character_id=?').get(r.character_id);if(h&&h.report_id!==id)fail('다른 신고에서 이미 중지한 캐릭터입니다. 중지 목록에서 확인해주세요.',409);}
  if(action==='hold_character')sql.prepare('INSERT INTO ai_character_holds VALUES(?,?,?,?,?) ON CONFLICT(character_id) DO UPDATE SET report_id=excluded.report_id,actor=excluded.actor,reason=excluded.reason,created_at=excluded.created_at').run(r.character_id,id,actor,'AI 답변 신고 검토에 따른 제공 중지',Date.now());
  if(action==='resume_character'){
   const hold=sql.prepare('SELECT report_id FROM ai_character_holds WHERE character_id=?').get(r.character_id);
   if(!hold)fail('현재 제공 중지 상태가 아닙니다.',409);
   if(hold.report_id!==id)fail('다른 신고에서 중지했습니다. 해당 신고에서 검토 후 재개해주세요.',409);
   sql.prepare('DELETE FROM ai_character_holds WHERE character_id=?').run(r.character_id);
  }
  const state=action==='no_issue'?'dismissed':['improved','hold_character','resume_character'].includes(action)?'resolved':action==='review'?'reviewing':r.status,now=Date.now();
  sql.prepare('UPDATE ai_content_reports SET status=?,public_reply=?,version=version+1,updated_at=? WHERE id=?').run(state,publicReply.trim()||r.public_reply,now,id);
  sql.prepare('INSERT INTO ai_report_actions(report_id,actor,action,note,public_reply,created_at) VALUES(?,?,?,?,?,?)').run(id,actor,action,note.trim(),publicReply.trim(),now);
  sql.prepare('INSERT INTO admin_audit(actor,action,target,details,created_at) VALUES(?,?,?,?,?)').run(actor,'ai_report_'+action,id,JSON.stringify({characterId:r.character_id}),now);
  return get(id);
 });
}
function transfer(from,to){sql.prepare('UPDATE ai_content_reports SET user_id=? WHERE user_id=?').run(to,from);}
function releaseHold(characterId,actor,{createdAt,note='',publicReply=''}){
 if(typeof note!=='string'||note.trim().length<5||note.length>3000||typeof publicReply!=='string'||publicReply.trim().length<5||publicReply.length>1500)fail('재개 근거와 신고자 안내를 각각 5자 이상 입력해주세요.');
 return db.transaction(()=>{const h=sql.prepare('SELECT * FROM ai_character_holds WHERE character_id=?').get(characterId);if(!h||h.created_at!==createdAt)fail('제공 중지 상태가 변경되었습니다. 다시 조회해주세요.',409);const r=sql.prepare('SELECT * FROM ai_content_reports WHERE id=?').get(h.report_id);const now=Date.now();sql.prepare('DELETE FROM ai_character_holds WHERE character_id=?').run(characterId);if(r){sql.prepare("UPDATE ai_content_reports SET status='resolved',public_reply=?,version=version+1,updated_at=? WHERE id=?").run(publicReply.trim(),now,r.id);sql.prepare("INSERT INTO ai_report_actions(report_id,actor,action,note,public_reply,created_at) VALUES(?,?,'resume_character',?,?,?)").run(r.id,actor,note.trim(),publicReply.trim(),now);}sql.prepare('INSERT INTO admin_audit(actor,action,target,details,created_at) VALUES(?,?,?,?,?)').run(actor,'ai_character_resume',characterId,JSON.stringify({note:note.trim()}),now);return {characterId,held:false};});
}
function holdVersion(){return crypto.createHash('sha256').update(JSON.stringify(sql.prepare('SELECT character_id FROM ai_character_holds ORDER BY character_id').all())).digest('hex').slice(0,12);}
module.exports={holdVersion,releaseHold,prune,create,mine,ownDetail,list,get,act,isHeld,assertAvailable,transfer,categories,states};
