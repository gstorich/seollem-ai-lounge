const router=require('express').Router(),reports=require('../services/aiReports'),ops=require('../services/operationsService');
router.get('/',(req,res)=>res.json({success:true,...reports.list({status:req.query.status,page:Math.max(0,Math.min(10000,parseInt(req.query.page)||0))})}));
router.post('/holds/:characterId/release',(req,res)=>{try{res.json({success:true,...reports.releaseHold(req.params.characterId,req.admin.id,req.body)});}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'재개 조치를 저장하지 못했습니다.'});}});
router.get('/:id',(req,res)=>{const report=reports.get(req.params.id);if(!report)return res.sendStatus(404);ops.audit(req.admin.id,'ai_report_view',report.id);res.json({success:true,report});});
router.post('/:id/actions',(req,res)=>{try{res.json({success:true,report:reports.act(req.params.id,req.admin.id,req.body)});}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'조치를 저장하지 못했습니다.'});}});
module.exports=router;
