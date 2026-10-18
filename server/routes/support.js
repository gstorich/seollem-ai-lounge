const router=require('express').Router();
const {rateLimit}=require('express-rate-limit');
const {requireAuth}=require('../middleware/auth');
const ops=require('../services/operationsService');
router.use(requireAuth,(req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(rateLimit({windowMs:60000,limit:30,standardHeaders:true,legacyHeaders:false}));
router.get('/tickets',(req,res)=>res.json({success:true,...ops.tickets(req.user.id,'all',Math.max(0,Math.min(10000,parseInt(req.query.page)||0)))}));
router.get('/tickets/:id',(req,res)=>{const ticket=ops.getTicket(req.params.id,req.user.id);if(!ticket)return res.status(404).json({error:'문의를 찾을 수 없습니다.'});res.json({success:true,ticket});});
router.post('/tickets',(req,res)=>{
 if(!req.user.phone)return res.status(403).json({error:'다른 기기에서도 답변을 확인할 수 있도록 휴대폰 인증 후 문의해주세요.'});
 const {category,subject,body}=req.body;
 if(!ops.categoryList.includes(category)||typeof subject!=='string'||!subject.trim()||subject.length>100||typeof body!=='string'||!body.trim()||body.length>5000)return res.status(400).json({error:'제목 100자, 내용 5,000자 이내로 작성해주세요.'});
 try{const ticket=ops.createTicket(req.user.id,category,subject.trim(),body.trim());ops.track('support_created',req.user.id);res.status(201).json({success:true,ticket});}catch(e){res.status(400).json({error:e.message});}
});
router.post('/tickets/:id/replies',(req,res)=>{const body=req.body.body;if(typeof body!=='string'||!body.trim()||body.length>5000)return res.status(400).json({error:'내용을 5,000자 이내로 작성해주세요.'});try{const ticket=ops.reply(req.params.id,req.user.id,body.trim(),false,null,req.user.id);if(!ticket)return res.status(404).json({error:'문의를 찾을 수 없습니다.'});res.json({success:true,ticket});}catch(e){res.status(400).json({error:e.message});}});
module.exports=router;
