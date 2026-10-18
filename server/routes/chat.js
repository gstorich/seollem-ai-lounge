const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const characters = require('../services/characterService');
const config = require('../config');
const generatedTurn = require('../services/generatedTurn');
const {requireAuth} = require('../middleware/auth');
router.use(requireAuth);
function characterAndId(req,res) {
  const {characterId}=req.body;
  const requestId=req.body.messageId || crypto.randomUUID();
  if(typeof characterId!=='string'||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) {res.status(400).json({success:false,error:'요청 형식이 올바르지 않습니다.'});return null;}
  const character=characters.getCharacterById(characterId);
  if(!character){res.status(404).json({success:false,error:'대화 상대를 찾을 수 없습니다.'});return null;}
  return {character,requestId};
}
router.post('/send',async(req,res)=>{
  const {message,chatHistory=[]}=req.body;
  if(typeof message!=='string'||!message.trim()||message.length>2000||!Array.isArray(chatHistory)||chatHistory.length>12||chatHistory.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>2000)) return res.status(400).json({success:false,error:'메시지 내용을 확인해주세요. (최대 2,000자)'});
  const value=characterAndId(req,res);if(!value)return;
  return generatedTurn(req,res,{...value,message:message.trim(),kind:'chat',cost:config.heartsPerMessage,userMessage:{}});
});
router.post('/greeting',async(req,res)=>{
  const value=characterAndId(req,res);if(!value)return;
  return generatedTurn(req,res,{...value,message:'새 대화가 연결되었습니다. 상대는 아직 아무 말도 하지 않았습니다. 처음 말을 거는 자연스러운 짧은 인사 한 번을 보내세요. 혼잣말로 근황을 보고하거나 상대의 나이·성별·현재 상태를 추측하지 마세요.',kind:'greeting',cost:0});
});
router.post('/gift',async(req,res)=>{
  const value=characterAndId(req,res);if(!value)return;
  const {giftKey,customMsg=''}=req.body;
  const gift=typeof giftKey==='string'&&Object.hasOwn(require('../services/gifts.json'),giftKey)?require('../services/gifts.json')[giftKey]:null;
  if(!gift||typeof customMsg!=='string'||customMsg.length>500)return res.status(400).json({success:false,error:'선물 정보를 확인해주세요.'});
  const message=gift.name+' 선물을 보냈습니다.'+(customMsg?' 메시지 카드: '+customMsg:'');
  return generatedTurn(req,res,{...value,message,kind:'gift',cost:gift.cost,userMessage:{giftKey,mediaType:'gift',giftName:gift.name,giftImage:gift.image}});
});
module.exports=router;
