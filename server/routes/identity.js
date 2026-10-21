const router=require('express').Router(),{requireAuth}=require('../middleware/auth'),gateway=require('../services/portoneGateway'),service=require('../services/identityService');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/config',(req,res)=>res.json({success:true,enabled:gateway.ready('identity'),mode:gateway.settings.mode,provider:gateway.settings.identityProvider==='INICIS_UNIFIED'?'KG이니시스 통합인증':'다날'}));
router.use(requireAuth);
router.get('/status',(req,res)=>res.json({success:true,...service.status(req.user)}));
const handle=fn=>async(req,res)=>{try{res.json({success:true,...await fn(req)});}catch(e){res.status(e.status||503).json({success:false,error:e.status?e.message:'IDENTITY_PROVIDER_ERROR',message:({IDENTITY_NOT_READY:'이니시스 본인확인 서비스 개통을 준비 중입니다.',PHONE_VERIFICATION_REQUIRED:'휴대폰 번호를 연결한 뒤 인증할 수 있습니다.',IDENTITY_EXPIRED:'인증 요청 시간이 만료됐습니다. 새로 시작해주세요.',IDENTITY_MISMATCH:'인증 정보가 연결된 계정과 일치하지 않습니다. 같은 휴대폰 번호로 인증해주세요.',IDENTITY_RATE_LIMIT:'인증 요청이 많습니다. 잠시 후 다시 시도해주세요.'})[e.message]||'본인확인 결과를 확인하지 못했습니다. 다시 확인하거나 고객센터로 문의해주세요.'});}};
router.post('/prepare',require('../services/legalService').requireAcceptance,handle(req=>service.create(req.user)));
router.post('/complete',handle(req=>service.complete(req.user,req.body.identityVerificationId)));
module.exports=router;
