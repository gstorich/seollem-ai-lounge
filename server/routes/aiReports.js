const router=require('express').Router(),reports=require('../services/aiReports'),{rateLimit}=require('express-rate-limit');
router.use(require('../middleware/auth').requireAuth,(req,res,next)=>{res.set('Cache-Control','no-store');next();});
const page=req=>Math.max(0,Math.min(10000,parseInt(req.query.page)||0));
router.get('/',(req,res)=>res.json({success:true,...reports.mine(req.user.id,page(req))}));
router.get('/:id',(req,res)=>{const report=reports.ownDetail(req.params.id,req.user.id);return report?res.json({success:true,report}):res.status(404).json({success:false,error:'신고를 찾을 수 없습니다.'});});
router.post('/',rateLimit({windowMs:60000,limit:10,standardHeaders:true,legacyHeaders:false}),async(req,res)=>{try{const result=await reports.create(req.user.id,req.body);res.status(result.duplicate?200:201).json({success:true,...result});}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'신고를 접수하지 못했습니다. 잠시 후 다시 시도해주세요.'});}});
module.exports=router;
