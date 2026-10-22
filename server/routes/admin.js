const router=require('express').Router();
const jwt=require('jsonwebtoken');
const config=require('../config');
const {checkPassword,passwordVersion,cookieName,requireAdmin,requireAdminOrigin}=require('../middleware/admin');
const ops=require('../services/operationsService');
const sms=require('../services/smsService');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(requireAdminOrigin);
const {rateLimit}=require('express-rate-limit');
router.post('/session',rateLimit({windowMs:15*60000,limit:5,skipSuccessfulRequests:true,standardHeaders:true,legacyHeaders:false,message:{error:'로그인 시도가 많습니다. 15분 후 다시 시도해주세요.'}}),(req,res)=>{
 if(!checkPassword(req.body.password))return res.status(401).json({success:false,error:'비밀번호를 확인해주세요.'});
 const token=jwt.sign({role:'admin',version:passwordVersion()},config.jwtSecret,{audience:'azit-admin',expiresIn:'1h'});
 res.cookie(cookieName,token,{httpOnly:true,secure:config.nodeEnv==='production',sameSite:'strict',path:'/',maxAge:3600000});
 ops.audit('operator','admin_login','session');res.json({success:true});
});
router.use(requireAdmin);
router.use('/ai-reports',require('./adminAiReports'));
router.use('/characters',require('./adminCharacters'));
router.use('/commerce',require('./adminCommerce'));
router.get('/funnel',(req,res)=>res.json({success:true,...require('../services/funnelInsights').insights(req.query.days)}));
router.get('/acquisitions',(req,res)=>{const days=[7,30,90,0].includes(Number(req.query.days))?Number(req.query.days):30;const db=require('../services/dbService');const stats=db.getAcquisitionStats(days);ops.audit(req.admin.id,'acquisition_stats_view','acquisitions',{days});res.json({success:true,...stats});});
router.get('/advertising',(req,res)=>res.json({success:true,...require('../services/advertisingService').diagnostics()}));
router.get('/session',(req,res)=>res.json({success:true,operator:'관리자'}));
router.delete('/session',(req,res)=>{res.clearCookie(cookieName,{httpOnly:true,secure:config.nodeEnv==='production',sameSite:'strict',path:'/'});res.json({success:true});});
const page=req=>Math.max(0,Math.min(10000,parseInt(req.query.page)||0));
router.get('/overview',(req,res)=>res.json({success:true,...ops.overview([7,30,90].includes(Number(req.query.days))?Number(req.query.days):30),runtime:{model:config.geminiModel,smsConfigured:sms.configured(),uptimeSeconds:Math.floor(process.uptime()),paymentEnabled:require('../services/portoneGateway').ready('payment')},analytics:{measurementId:ops.setting('ga_measurement_id')??config.gaMeasurementId,propertyId:ops.setting('ga_property_id')??config.gaPropertyId}}));
router.get('/safety-monitoring',(req,res)=>{const result=require('../services/safetyMonitoring').list(page(req),[7,30].includes(Number(req.query.days))?Number(req.query.days):30);ops.audit(req.admin.id,'safety_monitoring_view','events',{page:page(req)});res.json({success:true,...result});});
router.get('/customers',(req,res)=>res.json({success:true,...ops.users(String(req.query.q||'').slice(0,80),page(req),req.query.kind,req.query.engagement)}));
router.get('/customers/:id',(req,res)=>{const customer=ops.customer(req.params.id);if(!customer)return res.sendStatus(404);ops.audit(req.admin.id,'customer_view',req.params.id);res.json({success:true,customer});});
const conversations=require('../services/conversationService');
const chatKind=req=>['members','guests'].includes(req.query.kind)?req.query.kind:'all';
const chatDays=req=>[7,30,90].includes(Number(req.query.days))?Number(req.query.days):0;
router.get('/conversations',async(req,res,next)=>{try{const result=await conversations.rooms({kind:chatKind(req),days:chatDays(req),q:String(req.query.q||'').slice(0,100),userId:String(req.query.userId||'').slice(0,100),characterId:String(req.query.characterId||'').slice(0,100),page:page(req)});ops.audit(req.admin.id,'conversation_list',chatKind(req),{page:page(req),filtered:Boolean(req.query.q||req.query.userId||req.query.characterId)});res.json({success:true,...result});}catch(e){next(e);}});
router.get('/conversations/:userId/:characterId',async(req,res,next)=>{try{
 const conversation=await conversations.transcript(req.params.userId,req.params.characterId,req.query.latest==='1'?null:page(req));if(!conversation)return res.sendStatus(404);
 ops.audit(req.admin.id,'conversation_view',req.params.userId,{characterId:req.params.characterId,page:conversation.page});res.json({success:true,conversation});
}catch(e){next(e);}});
router.get('/conversation-insights',(req,res)=>res.json({success:true,...conversations.insights(chatKind(req),chatDays(req)||30)}));
router.get('/matching-insights',(req,res)=>{
  const days=[7,30,90].includes(Number(req.query.days))?Number(req.query.days):30;
  const db=require('../services/dbService'),characters=require('../services/characterService');
  const bandit=db.getMatchingBanditStats(days),turns=db.getCharacterTurnStats(days),catalog=characters.getAllCharacters();
  const all=catalog.map(c=>{
    const s=turns[c.id]||{totalMessages:0,userTurns:0,uniqueUsers:0};
    return {id:c.id,name:c.name,age:c.age,gender:c.gender||'female',job:c.job,traitKey:c.traitKey,scenario:c.conceptTitle||c.bio||'',userTurns:s.userTurns,totalMessages:s.totalMessages,uniqueUsers:s.uniqueUsers,isPopular:s.userTurns>=3};
  });
  const popular=all.filter(c=>c.isPopular).sort((a,b)=>b.userTurns-a.userTurns||b.totalMessages-a.totalMessages);
  const cold=all.filter(c=>!c.isPopular).sort((a,b)=>a.userTurns-b.userTurns);
  const traitCounts={},ageDecades={};
  popular.forEach(c=>{
    traitCounts[c.traitKey]=(traitCounts[c.traitKey]||0)+1;
    const decade=`${Math.floor(c.age/10)*10}대`;
    ageDecades[decade]=(ageDecades[decade]||0)+1;
  });
  res.json({
    success:true,
    bandit,
    popularCandidates:popular.slice(0,30),
    coldCandidates:cold.slice(0,30),
    popularTotal:popular.length,
    coldTotal:cold.length,
    traitsAnalysis:{
      traits:Object.entries(traitCounts).sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,count})),
      ageDecades:Object.entries(ageDecades).sort((a,b)=>b[1]-a[1]).map(([key,count])=>({key,count}))
    }
  });
});
router.post('/customers/:id/notes',(req,res)=>{const body=String(req.body.body||'').trim();if(!body||body.length>3000)return res.status(400).json({error:'메모는 1~3,000자입니다.'});if(!ops.addNote(req.admin.id,req.params.id,body))return res.sendStatus(404);res.json({success:true});});
router.post('/customers/:id/hearts',(req,res)=>{
 const {delta,reason,requestId}=req.body;
 if(!Number.isFinite(delta)||delta===0||Math.abs(delta)>10000||Math.abs(delta*10-Math.round(delta*10))>1e-7||typeof reason!=='string'||reason.trim().length<3||reason.length>500||typeof requestId!=='string'||! /^[a-f0-9-]{36}$/.test(requestId))return res.status(400).json({error:'하트는 0.1 단위, 최대 10,000개이며 처리 사유가 필요합니다.'});
 try{res.json({success:true,...ops.adjust(req.admin.id,req.params.id,delta,reason.trim(),requestId)});}catch(e){res.status(400).json({error:e.message});}
});
router.post('/customers/:id/adult-verification',(req,res)=>{
 const {isAdult,reason}=req.body;
 if(typeof isAdult!=='boolean')return res.status(400).json({error:'성인 인증 여부(true/false)가 필요합니다.'});
 if(isAdult)return res.status(403).json({success:false,error:'VERIFIED_IDENTITY_REQUIRED',message:'성인인증은 본인확인 기관의 검증 결과로만 부여할 수 있습니다.'});
 const result=ops.setAdultVerification(req.admin.id,req.params.id,isAdult,String(reason||'').trim().slice(0,500));
 if(!result)return res.sendStatus(404);
 res.json({success:true,...result});
});
router.get('/tickets',(req,res)=>res.json({success:true,...ops.tickets(null,['open','in_progress','answered','closed'].includes(req.query.status)?req.query.status:'all',page(req))}));
router.get('/tickets/:id',(req,res)=>{const ticket=ops.getTicket(req.params.id);if(!ticket)return res.sendStatus(404);ops.audit(req.admin.id,'ticket_view',ticket.id);res.json({success:true,ticket});});
router.post('/tickets/:id/replies',(req,res)=>{const body=String(req.body.body||'').trim();if(!body||body.length>5000)return res.status(400).json({error:'답변은 1~5,000자입니다.'});try{const ticket=ops.reply(req.params.id,req.admin.id,body,req.body.internal===true);if(!ticket)return res.sendStatus(404);res.json({success:true,ticket});}catch(e){res.status(400).json({error:e.message});}});
router.patch('/tickets/:id',(req,res)=>{if(!['open','in_progress','answered','closed'].includes(req.body.status))return res.status(400).json({error:'상태를 확인해주세요.'});if(!ops.setStatus(req.params.id,req.admin.id,req.body.status))return res.sendStatus(404);res.json({success:true});});
router.get('/audit',(req,res)=>res.json({success:true,items:ops.audits(page(req))}));
router.put('/analytics',(req,res)=>{const id=String(req.body.measurementId||'').trim(),property=String(req.body.propertyId||'').trim();if((id&&!/^G-[A-Z0-9]{6,20}$/.test(id))||(property&&!/^\d{5,20}$/.test(property)))return res.status(400).json({error:'GA4 측정 ID와 속성 ID를 확인해주세요.'});ops.setAnalytics(req.admin.id,id,property);res.json({success:true});});
module.exports=router;
