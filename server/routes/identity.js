const router=require('express').Router(),{requireAuth}=require('../middleware/auth'),gateway=require('../services/portoneGateway'),service=require('../services/identityService');
router.get('/config',(req,res)=>res.json({success:true,enabled:gateway.ready('identity'),mode:gateway.settings.mode}));
router.use(requireAuth);
router.get('/status',(req,res)=>res.json({success:true,...service.status(req.user)}));
const handle=fn=>async(req,res)=>{try{res.json({success:true,...await fn(req)});}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'IDENTITY_PROVIDER_ERROR',message:e.message==='IDENTITY_NOT_READY'?'본인확인 서비스는 준비 중입니다.':'본인확인 결과를 확인하지 못했습니다. 다시 확인하거나 고객센터로 문의해주세요.'});}};
router.post('/prepare',require('../services/legalService').requireAcceptance,handle(req=>service.create(req.user)));
router.post('/complete',handle(req=>service.complete(req.user,req.body.identityVerificationId)));
module.exports=router;
