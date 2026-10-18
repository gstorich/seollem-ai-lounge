const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const llmService = require('../services/llmService');
const dbService = require('../services/dbService');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');
const crypto = require('node:crypto');
const activeChats = new Set();

// POST /api/chat/send
router.post('/send', requireAuth, async (req, res) => {
  const { characterId, message, chatHistory = [] } = req.body;
  const requestId = req.body.messageId || crypto.randomUUID();
  if (typeof characterId !== 'string' || typeof message !== 'string' || !message.trim() || message.length > 2000 ||
      typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId) ||
      !Array.isArray(chatHistory) || chatHistory.length > 12 || chatHistory.some(m =>
        !m || !['user', 'assistant'].includes(m.role) || typeof m.content !== 'string' || m.content.length > 2000)) {
    return res.status(400).json({ success: false, error: '메시지 내용을 확인해주세요. (최대 2,000자)' });
  }
  const character = characterService.getCharacterById(characterId);
  if (!character) return res.status(404).json({ success: false, error: '대화 상대를 찾을 수 없습니다.' });
  const existing = dbService.getChatRequest(req.user.id, requestId);
  if (existing) {
    if (existing.status === 'pending') return res.status(409).json({ success: false, error: '답변을 생성 중입니다.' });
    return res.json({ ...existing, heartsRemaining: dbService.getUser(req.user.id).hearts });
  }
  if (activeChats.has(req.user.id)) return res.status(429).json({ success: false, error: '이전 답변을 받은 후 메시지를 보내주세요.' });
  let user;
  let history;
  dbService.transaction(() => {
    user = dbService.debit(req.user.id, config.heartsPerMessage, 'chat');
    if (!user) return;
    history = (user.savedRooms?.[characterId]?.messages || []).filter(m => ['user','ai'].includes(m.sender) && m.text && m.id !== requestId)
      .slice(-12).map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));
    dbService.appendMessages(user.id, characterId, [{ id: requestId, sender: 'user', text: message.trim(), createdAt: Date.now(), time: new Date().toLocaleTimeString('ko-KR', {timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}) }]);
    dbService.saveChatRequest(user.id, requestId, { status: 'pending' });
  });
  if (!user) return res.status(402).json({ success: false, error: 'INSUFFICIENT_HEARTS', message: '하트가 부족합니다.' });
  activeChats.add(user.id);
  try {
    const result = await llmService.generateReply(character, [...history, { role: 'user', content: message.trim() }], { affection: 30 });
    const replyId = `reply_${requestId}`;
    const response = dbService.transaction(() => {
      const current = dbService.appendMessages(user.id, characterId, [{ id: replyId, sender: 'ai', text: result.text, createdAt: Date.now(), time: new Date().toLocaleTimeString('ko-KR', {timeZone:'Asia/Seoul',hour:'numeric',minute:'2-digit'}) }]);
      const response = { success: true, partnerReply: result.text, replyId, roomLeft: result.roomLeft,
        heartsRemaining: current.hearts, costDeducted: user.isVipUnlimited ? 0 : config.heartsPerMessage, isAiGenerated: result.isAiGenerated };
      dbService.saveChatRequest(user.id, requestId, response);
      return response;
    });
    return res.json(response);
  } catch {
    // Retrying this message cannot charge it a second time.
    dbService.saveChatRequest(user.id, requestId, { success: false, error: '답변 생성에 실패했습니다. 잠시 후 다시 시도해주세요.' });
    return res.status(500).json({ success: false, error: '답변 생성에 실패했습니다.' });
  } finally { activeChats.delete(user.id); }
});

// POST /api/chat/gift
router.post('/gift', requireAuth, (req, res) => {
  const { characterId, giftKey } = req.body;
  const gift = typeof giftKey === 'string' && Object.hasOwn(require('../services/gifts.json'), giftKey) ? require('../services/gifts.json')[giftKey] : null;
  if (!gift || !characterService.getCharacterById(characterId)) return res.status(400).json({ success: false, error: '선물 정보를 확인해주세요.' });
  const giftMessageId = `gift_${crypto.randomUUID()}`;
  const user = dbService.transaction(() => {
    const user = dbService.debit(req.user.id, gift.cost, `gift:${giftKey}`);
    if (!user) return null;
    dbService.appendMessages(user.id, characterId, [{ id: giftMessageId, sender: 'user', text: `${gift.name} 선물을 보냈습니다.`, mediaType: 'gift', giftName: gift.name, giftImage: gift.image, createdAt: Date.now() }]);
    return user;
  });
  if (!user) return res.status(402).json({ success: false, error: '하트가 부족합니다.' });
  return res.json({ success: true, heartsRemaining: user.hearts, costDeducted: user.isVipUnlimited ? 0 : gift.cost, proofUrl: gift.proofImage, giftMessageId });
});
module.exports = router;
