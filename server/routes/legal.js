const router=require('express').Router(),{requireAuth}=require('../middleware/auth'),service=require('../services/legalService');
router.use(requireAuth,(req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/status',(req,res)=>res.json({success:true,...service.status(req.user)}));
router.post('/accept',(req,res)=>{try{res.json({success:true,...service.accept(req.user.id,req.body)});}catch(e){res.status(e.status||503).json({success:false,error:'LEGAL_ACCEPTANCE_FAILED',message:e.status?e.message:'동의 내역을 저장하지 못했습니다. 다시 시도해주세요.'});}});
router.post('/stop',(req,res)=>res.json({success:true,...service.revoke(req.user.id)}));
module.exports=router;
