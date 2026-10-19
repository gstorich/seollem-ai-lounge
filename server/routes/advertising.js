const router=require('express').Router(),ads=require('../services/advertisingService');
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.use(require('../middleware/auth').requireAuth);
router.put('/context',(req,res)=>res.json({success:true,...ads.updateContext(req.user,{...req.body,userAgent:req.get('user-agent')})}));
router.get('/pending',(req,res)=>res.json({success:true,events:ads.pending(req.user)}));
router.post('/ack',(req,res)=>{ads.acknowledge(req.user,req.body.id,req.body.destination);res.json({success:true});});
module.exports=router;
