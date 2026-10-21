const express = require('express');
const crypto = require('node:crypto');
const router = express.Router();
const characters = require('../services/characterService');
const config = require('../config');
const generatedTurn = require('../services/generatedTurn');
const {requireAuth} = require('../middleware/auth');
router.use(requireAuth,require('../services/legalService').requireAcceptance);
function characterAndId(req,res) {
  const {characterId}=req.body;
  const requestId=req.body.messageId || crypto.randomUUID();
  if(typeof characterId!=='string'||typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) {res.status(400).json({success:false,error:'요청 형식이 올바르지 않습니다.'});return null;}
  const character=characters.getCharacterById(characterId);
  if(!character){res.status(404).json({success:false,error:'대화 상대를 찾을 수 없습니다.'});return null;}
  if(!characters.isPublished(characterId)&&!req.user.savedRooms?.[characterId]){res.status(404).json({success:false,error:'현재 공개되지 않은 캐릭터입니다.'});return null;}
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
  return generatedTurn(req,res,{...value,message:'새 대화가 연결되었습니다. 상대는 아직 아무 말도 하지 않은 낯선 사람입니다. 이 캐릭터의 고유 성향과 첫마디 연출에 따라 지금 보내고 싶은 짧은 첫 메시지를 쓰세요. 정중한 인사부터 할 필요는 없습니다. 반말 캐릭터는 처음부터 편하게 안녕, ㅎㅇ, 뭐해 등으로 짧게 말을 트세요. 사용자 신상·외모·이전 관계를 지어내지 마세요.',kind:'greeting',cost:0});
});
router.post('/idle-followup',async(req,res)=>{
  const value=characterAndId(req,res);if(!value)return;
  const idle=require('../services/idleFollowUp');
  const followUp=idle.state(req.user.id,value.character.id);
  if(!followUp.eligible||req.body.userMessageId!==followUp.userMessageId||req.body.lastReplyId!==followUp.lastReplyId)return res.json({success:true,skipped:true,costDeducted:0});
  return generatedTurn(req,res,{character:value.character,requestId:followUp.requestId,followUp,kind:'proactive',cost:0,message:'서버 요청: 사용자가 마지막 답변 뒤 아직 답장하지 않은 상황입니다. 실제 지난 대화와 캐릭터의 성격·말투를 참고해 자연스럽게 이어갈 짧은 연락 하나를 생성하세요. 답장을 재촉하거나 죄책감을 주지 말고 직전 표현·안부 질문을 반복하지 마세요. 연락을 원하지 않거나 대화가 끝났거나 적절히 이어갈 소재가 없으면 roomLeft:true로 표시하세요. 이 요청은 사용자의 새 발화가 아닙니다.'});
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
