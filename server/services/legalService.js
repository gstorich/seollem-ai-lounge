const db=require('./dbService');
const version='2026-10-19.2';
const documents={terms:'/terms',privacy:'/privacy',refund:'/refund',safety:'/safety',changes:'/policies'};
db.sql.exec('CREATE TABLE IF NOT EXISTS legal_acceptance_events(id INTEGER PRIMARY KEY,user_id TEXT NOT NULL,version TEXT NOT NULL,action TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL)');
function knownUnder18(user){return user?.identityVerification?.verified===true&&user.identityVerification.isAtLeast18===false;}
function accepted(user){return !knownUnder18(user)&&user?.legalAcceptance?.version===version&&user.legalAcceptance.atLeast18===true;}
function status(user){return {accepted:accepted(user),version,documents,minimumAge:18,acceptedAt:user.legalAcceptance?.acceptedAt||null,knownUnder18:knownUnder18(user)};}
function accept(id,input){return db.transaction(()=>{
 const user=db.getUser(id);if(!user)throw Object.assign(Error('계정을 확인해주세요.'),{status:401});
 if(knownUnder18(user))throw Object.assign(Error('현재 AI 대화는 만 18세 이상만 이용할 수 있습니다.'),{status:403});
 if(input.version!==version||input.termsAccepted!==true||input.privacyAcknowledged!==true||input.aiNoticeAcknowledged!==true||input.atLeast18!==true)throw Object.assign(Error('최신 이용약관과 개인정보·AI 안내, 만 18세 이상 여부를 각각 확인해주세요.'),{status:400});
 if(accepted(user))return status(user);
 const value={version,atLeast18:true,termsAccepted:true,privacyAcknowledged:true,aiNoticeAcknowledged:true,acceptedAt:Date.now()};
 db.sql.prepare('INSERT INTO legal_acceptance_events(user_id,version,action,data,created_at) VALUES(?,?,?,?,?)').run(id,version,'accept',JSON.stringify(value),value.acceptedAt);
 return status(db.updateUser(id,{legalAcceptance:value}));
});}
function revoke(id){return db.transaction(()=>{db.sql.prepare('INSERT INTO legal_acceptance_events(user_id,version,action,data,created_at) VALUES(?,?,?,?,?)').run(id,version,'stop','{}',Date.now());return status(db.updateUser(id,{legalAcceptance:null}));});}
function requireAcceptance(req,res,next){const user=db.getUser(req.user.id);if(knownUnder18(user))return res.status(403).json({success:false,error:'MINIMUM_AGE_REQUIRED',message:'현재 AI 대화는 만 18세 이상만 이용할 수 있습니다.',costDeducted:0});if(!accepted(user))return res.status(428).json({success:false,error:'LEGAL_ACCEPTANCE_REQUIRED',message:'이용약관과 AI·개인정보 안내를 확인해주세요.',costDeducted:0,...status(user)});next();}
module.exports={version,documents,status,accept,revoke,accepted,knownUnder18,requireAcceptance};
