const router=require('express').Router();
const service=require('../services/wellbeingService');
router.use(require('../middleware/auth').requireAuth);
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/',(req,res)=>res.json({success:true,records:service.list(req.user.id),sharingEnabled:false}));
function save(req,res){try{const record=service.save(req.user.id,req.body,req.params.id);return record?res.json({success:true,record}):res.status(404).json({success:false,error:'기록을 찾을 수 없습니다.'});}catch(e){return res.status(e.status||400).json({success:false,error:e.message});}}
router.post('/',save);router.put('/:id',save);
router.delete('/:id',(req,res)=>service.remove(req.user.id,req.params.id)?res.json({success:true}):res.status(404).json({success:false,error:'기록을 찾을 수 없습니다.'}));
module.exports=router;
