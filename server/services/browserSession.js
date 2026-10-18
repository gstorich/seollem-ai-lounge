// Recovery cookie is used only at bootstrap, never as authorization for account mutations.
const jwt=require('jsonwebtoken');
const config=require('../config');
const db=require('./dbService');
const name=config.nodeEnv==='production'?'__Host-azit_guest':'azit_guest';
const options={httpOnly:true,secure:config.nodeEnv==='production',sameSite:'strict',path:'/',maxAge:365*86400000};
function restore(req){
 const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1);
 try{const data=jwt.verify(value||'',config.jwtSecret,{audience:'azit-guest-recovery'});const user=db.getUser(data.userId);return user&&!user.phone?user:null;}catch{return null;}
}
function save(res,user){
 if(user.phone)return res.clearCookie(name,options);
 res.cookie(name,jwt.sign({userId:user.id},config.jwtSecret,{audience:'azit-guest-recovery',expiresIn:'365d'}),options);
}
module.exports={restore,save};
