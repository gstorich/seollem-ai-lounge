const router=require('express').Router(),db=require('../services/dbService'),service=require('../services/paymentService'),gateway=require('../services/portoneGateway'),ops=require('../services/operationsService');
const events=require('../services/commerceEvents');
router.get('/events',(req,res)=>{const result=events.overview(req.query);ops.audit(req.admin.id,'commerce_events_view','events',{days:result.days,tests:req.query.tests==='1'});res.json({success:true,...result});});
router.get('/events/:flow/:id',(req,res)=>{if(!events.flows.has(req.params.flow))return res.sendStatus(400);ops.audit(req.admin.id,'commerce_timeline_view',req.params.id,{flow:req.params.flow});res.json({success:true,items:events.timeline(req.params.flow,req.params.id)});});
router.post('/events/:flow/:id/case',(req,res)=>{
 const {flow,id}=req.params,{note,state}=req.body||{};
 if(!events.flows.has(flow)||!['open','resolved'].includes(state)||typeof note!=='string'||note.length>1000||!events.timeline(flow,id).length)return res.sendStatus(400);
 db.sql.prepare('INSERT INTO commerce_cases VALUES(?,?,?,?,?) ON CONFLICT(flow,flow_id) DO UPDATE SET note=excluded.note,state=excluded.state,updated_at=excluded.updated_at').run(flow,id,note.trim(),state,Date.now());
 ops.audit(req.admin.id,'commerce_case_'+state,id,{flow});res.json({success:true});
});
router.post('/identity/:id/check',async(req,res)=>{try{
 const row=db.sql.prepare('SELECT user_id FROM identity_requests WHERE id=?').get(req.params.id);if(!row)return res.sendStatus(404);
 ops.audit(req.admin.id,'identity_reconcile',req.params.id);
 const result=await require('../services/identityService').complete(db.getUser(row.user_id),req.params.id);
 res.json({success:true,verified:result.verified,isAdult:result.isAdult});
 }catch(e){res.status(e.status||503).json({success:false,error:events.safe(e.message)});}
});
router.get('/',(req,res)=>{const page=Math.max(0,Math.min(10000,parseInt(req.query.page)||0)),total=db.sql.prepare('SELECT count(*) n FROM payment_orders').get().n;const items=db.sql.prepare('SELECT data FROM payment_orders ORDER BY created_at DESC LIMIT 30 OFFSET ?').all(page*30).map(r=>{const o=JSON.parse(r.data);return {...service.publicOrder(o),userId:o.userId};});const totals=db.sql.prepare("SELECT coalesce(sum(CASE WHEN json_extract(data,'$.grantId') IS NOT NULL THEN json_extract(data,'$.price') ELSE 0 END),0) gross,coalesce(sum(json_extract(data,'$.cancelledAmount')),0) refunded FROM payment_orders").get();res.json({success:true,total,items,totals,paymentEnabled:gateway.ready('payment'),identityEnabled:gateway.ready('identity'),mode:gateway.settings.mode});});
const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'결제대행사 처리 결과를 확인하지 못했습니다.'});}};
router.post('/:id/check',handle(async(req,res)=>{const o=await service.reconcile(req.params.id);ops.audit(req.admin.id,'payment_reconcile',o.id);res.json({success:true,order:service.publicOrder(o)});}));
router.post('/:id/refund',handle(async(req,res)=>{const o=service.get(req.params.id);if(!o)return res.sendStatus(404);ops.audit(req.admin.id,'payment_refund_request',o.id);const order=await service.refund(o.id,o.userId);ops.audit(req.admin.id,'payment_refund_result',o.id,{status:order.status});res.json({success:true,order});}));
module.exports=router;
