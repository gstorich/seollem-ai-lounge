const jwt=require('jsonwebtoken');
const crypto=require('node:crypto');
const config=require('../config');
const cookieName=config.nodeEnv==='production'?'__Host-azit_admin':'azit_admin';
const passwordVersion=()=>crypto.createHash('sha256').update(config.adminPasswordHash).digest('hex');
function checkPassword(password){
 if(typeof password!=='string'||password.length>200||!config.adminPasswordHash)return false;
 const [salt,hex]=config.adminPasswordHash.split(':');
 if(!/^[a-f0-9]{32}$/.test(salt||'')||!/^[a-f0-9]{128}$/.test(hex||''))return false;
 return crypto.timingSafeEqual(crypto.scryptSync(password,salt,64),Buffer.from(hex,'hex'));
}
function requireAdmin(req,res,next){
 res.set('Cache-Control','no-store');
 const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));
 try {
  const decoded=jwt.verify(cookie?.slice(cookieName.length+1)||'',config.jwtSecret,{audience:'azit-admin'});
  if(!config.adminPasswordHash||decoded.version!==passwordVersion()||decoded.role!=='admin')throw Error('denied');
  req.admin={id:'operator'};next();
 }catch{return res.status(401).json({success:false,error:'관리자 로그인이 필요합니다.'});}
}
function requireAdminOrigin(req,res,next){
 if(!['GET','HEAD'].includes(req.method)&&(!config.allowedOrigins.includes(req.headers.origin)||req.headers['x-azit-admin']!=='1'))return res.status(403).json({success:false,error:'관리자 요청 출처를 확인할 수 없습니다.'});
 next();
}
module.exports={checkPassword,passwordVersion,cookieName,requireAdmin,requireAdminOrigin};
