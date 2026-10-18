const router=require('express').Router(),db=require('../services/dbService'),store=require('../services/proactiveStore'),push=require('../services/pushService');
router.use(require('../middleware/auth').requireAuth);
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/',(req,res)=>res.json({success:true,enabled:Boolean(store.preferences(req.user.id).enabled),pushAvailable:push.ready,publicKey:push.ready?push.publicKey:null}));
router.put('/',(req,res)=>{
 if(typeof req.body.enabled!=='boolean')return res.status(400).json({success:false,error:'설정을 확인해주세요.'});
 store.setEnabled(req.user.id,req.body.enabled);res.json({success:true});
});
router.post('/subscribe',(req,res)=>{
 if(!push.ready)return res.status(503).json({success:false,error:'알림 설정을 준비 중입니다.'});
 try{push.subscribe(req.user.id,req.body.subscription);res.json({success:true});}
 catch{return res.status(400).json({success:false,error:'브라우저 알림 정보를 확인해주세요.'});}
});
router.post('/unsubscribe',(req,res)=>{
 if(req.body.all===true)db.sql.prepare('DELETE FROM push_subscriptions WHERE user_id=?').run(req.user.id);
 else if(typeof req.body.endpoint==='string')db.sql.prepare('DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?').run(req.user.id,req.body.endpoint);
 res.json({success:true});
});
router.get('/inbox',(req,res)=>{
 if(req.query.visible==='1')store.seen(req.user.id,Date.now());
 res.json({success:true,items:store.inbox(req.user.id)});
});
module.exports=router;
