// Operator-created QA grants, separate from identity-provider verification.
const db=require('./dbService');
db.sql.exec(`CREATE TABLE IF NOT EXISTS adult_test_access(user_id TEXT PRIMARY KEY,phone TEXT NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,actor TEXT NOT NULL)`);
function active(user,now=Date.now()){
 if(process.env.NODE_ENV==='production')return null;
 if(!user?.phone||user.isTester!==true||user.identityVerification?.verified===true&&user.identityVerification.isAdult===false)return null;
 const row=db.sql.prepare('SELECT * FROM adult_test_access WHERE user_id=? AND phone=?').get(user.id,user.phone);
 return row&&row.actor==='operator'&&row.created_at>0&&row.created_at<=now&&row.expires_at>now&&row.expires_at-row.created_at<=24*3600000?{enabled:true,expiresAt:row.expires_at}:null;
}
module.exports={active};
