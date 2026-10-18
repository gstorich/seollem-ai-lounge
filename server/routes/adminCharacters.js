// Mounted behind the existing admin cookie and origin/CSRF checks.
const router=require('express').Router(),registry=require('../services/characterRegistry'),preview=require('../services/characterPreview'),ops=require('../services/operationsService');
const handle=fn=>(req,res)=>{try{fn(req,res);}catch(e){res.status(e.status||400).json({success:false,error:e.message});}};
router.get('/',handle((req,res)=>res.json({success:true,...registry.list({q:String(req.query.q||'').slice(0,100),page:Math.max(0,Math.min(10000,parseInt(req.query.page)||0)),kind:['custom','builtin'].includes(req.query.kind)?req.query.kind:'all'})})));
router.get('/assets',handle((req,res)=>res.json({success:true,items:registry.assets(String(req.query.q||'').slice(0,100))})));
router.post('/',handle((req,res)=>{
 const character=registry.save(registry.newId(),req.body.definition,0);ops.audit(req.admin.id,'character_draft_create',character.id,{revision:character.revision});res.status(201).json({success:true,character});
}));
router.get('/:id',handle((req,res)=>{const character=registry.detail(req.params.id);if(!character)return res.status(404).json({success:false,error:'캐릭터를 찾을 수 없습니다.'});res.json({success:true,character});}));
router.put('/:id',handle((req,res)=>{
 if(!registry.detail(req.params.id))return res.status(404).json({success:false,error:'캐릭터를 찾을 수 없습니다.'});
 const character=registry.save(req.params.id,req.body.definition,req.body.revision);ops.audit(req.admin.id,'character_draft_save',character.id,{revision:character.revision});res.json({success:true,character});
}));
router.post('/:id/publish',handle((req,res)=>{const character=registry.publish(req.params.id,req.body.revision);ops.audit(req.admin.id,'character_publish',character.id,{revision:character.publishedRevision});res.json({success:true,character});}));
router.post('/:id/pause',handle((req,res)=>{const character=registry.pause(req.params.id);ops.audit(req.admin.id,'character_pause',character.id);res.json({success:true,character});}));
const {rateLimit}=require('express-rate-limit');
router.post('/:id/preview',rateLimit({windowMs:60000,limit:12,standardHeaders:true,legacyHeaders:false,message:{success:false,error:'테스트 요청이 많습니다. 잠시 후 다시 시도해주세요.'}}),async(req,res)=>{
 try{const result=await preview.send(req.params.id,req.body,req.admin.id);res.json({success:true,...result});}
 catch(e){res.status(e.status||503).json({success:false,error:e.message,sessionId:e.sessionId,costDeducted:0});}
});
module.exports=router;
