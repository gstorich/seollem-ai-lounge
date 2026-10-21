const router=require('express').Router(),{rateLimit}=require('express-rate-limit'),{requireAuth}=require('../middleware/auth'),service=require('../services/paymentService'),gateway=require('../services/portoneGateway'),db=require('../services/dbService');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
const messages={REFUND_PURCHASE_USED:'해당 구매분을 일부라도 사용하면 일반 환불을 신청할 수 없습니다. 법령상 환급 사유는 고객센터로 문의해주세요.',REFUND_WINDOW_EXPIRED:'구매 후 7일이 지나 일반 환불을 신청할 수 없습니다. 법령상 환급 사유는 고객센터로 문의해주세요.',REFUND_DATE_UNCONFIRMED:'구매 시각 확인이 필요합니다. 고객센터로 환불을 문의해주세요.',REFUND_REJECTED:'결제대행사에서 환불을 거절했습니다. 보류된 미사용 하트는 원래 유효기간으로 복원되었습니다. 고객센터로 문의해주세요.',PAYMENT_NOT_READY:'실결제 서비스는 준비 중입니다.',PHONE_VERIFICATION_REQUIRED:'휴대폰 번호 연동 후 결제할 수 있습니다.',REFUND_CHECK_PENDING:'환불 결과를 확인 중입니다. 중복 신청하지 마세요. 보류된 하트는 확인 완료 전까지 사용할 수 없습니다.',NO_REFUNDABLE_HEARTS:'이 주문에 환불 가능한 미사용 하트가 없습니다.',PAYMENT_BUSY:'결제 결과를 확인 중입니다. 잠시 후 다시 확인해주세요.'};
const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'PAYMENT_PROVIDER_ERROR',message:messages[e.message]||'처리 결과를 확인하지 못했습니다. 결제 내역에서 다시 확인하거나 고객센터로 문의해주세요.'});}};
router.get('/packages',(req,res)=>res.json({success:true,packages:Object.fromEntries(require('../../products.json').map(p=>[p.id,p]))}));
router.get('/config',(req,res)=>res.json({success:true,enabled:gateway.ready('payment'),mode:gateway.settings.mode,provider:gateway.settings.provider==='inicis'?'KG이니시스':'다날',methods:gateway.ready('payment')?['card']:[]}));
router.post('/webhook',rateLimit({windowMs:60000,limit:90,standardHeaders:true,legacyHeaders:false}),handle(async(req,res)=>{
 const id=req.body.data?.paymentId||req.body.merchant_uid,imp=req.body.imp_uid;
 if(typeof id!=='string'||!/^azit_[a-f0-9]{32}$/.test(id))return res.sendStatus(400);
 const order=service.get(id);if(!order)return res.sendStatus(200);
 if(order.apiVersion!==2&&(typeof imp!=='string'||!/^imp_[a-zA-Z0-9_]+$/.test(imp)))return res.sendStatus(400);
 // Webhook payloads only trigger an authenticated provider lookup. Never credit from a body.
 await service.reconcile(id,order.apiVersion===2?undefined:imp);res.json({success:true});
}));
router.use(requireAuth);
router.get('/orders',(req,res)=>res.json({success:true,orders:service.list(req.user.id)}));
router.use((req,res,next)=>{if(!req.user.phone)return res.status(403).json({success:false,error:'PHONE_VERIFICATION_REQUIRED',message:messages.PHONE_VERIFICATION_REQUIRED});if(!gateway.ready('payment'))return res.status(503).json({success:false,error:'PAYMENT_NOT_READY',message:messages.PAYMENT_NOT_READY});next();});
router.post('/prepare',require('../services/legalService').requireAcceptance,rateLimit({windowMs:60000,limit:5,standardHeaders:true,legacyHeaders:false}),handle(async(req,res)=>{if(req.body.purchaseConfirmed!==true)return res.status(400).json({success:false,error:'PURCHASE_CONFIRMATION_REQUIRED',message:'상품·가격·이용기간과 환불 조건을 확인해주세요.'});res.json({success:true,...service.create(req.user,req.body.pkgKey)});}));
router.post('/verify',handle(async(req,res)=>{const id=req.body.orderId;if(typeof id!=='string'||service.get(id)?.userId!==req.user.id)return res.sendStatus(404);if(req.body.impUid!==undefined&&(typeof req.body.impUid!=='string'||!/^imp_[a-zA-Z0-9_]+$/.test(req.body.impUid)))return res.sendStatus(400);const o=await service.reconcile(id,req.body.impUid);res.json({success:true,order:service.publicOrder(o),currentHearts:db.getUser(req.user.id).hearts});}));
router.post('/orders/:id/refund',handle(async(req,res)=>res.json({success:true,order:await service.refund(req.params.id,req.user.id),currentHearts:db.getUser(req.user.id).hearts})));
module.exports=router;
