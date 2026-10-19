const router=require('express').Router(),ads=require('../services/advertisingService');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(require('../middleware/auth').requireAuth);
router.put('/context',(req,res)=>res.json({success:true,...ads.updateContext(req.user,{...req.body,userAgent:req.get('user-agent')})}));
router.post('/event',(req,res)=>{try{const id=ads.clientEvent(req.user,req.body.name,req.body.key);res.json({success:true,id});}catch{res.status(400).json({success:false,error:'INVALID_AD_EVENT'});}});
router.get('/pending',(req,res)=>res.json({success:true,events:ads.pending(req.user)}));
router.post('/ack',(req,res)=>{ads.acknowledge(req.user,req.body.id,req.body.destination);res.json({success:true});});
module.exports=router;
