const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const llmService = require('../services/llmService');
const dbService = require('../services/dbService');
const { requireAuth } = require('../middleware/auth');
const config = require('../config');

// POST /api/chat/send
router.post('/send', requireAuth, async (req, res) => {
  const user = req.user;
  const { characterId, message, chatHistory = [], affection = 30 } = req.body;

  if (!characterId || !message || !message.trim()) {
    return res.status(400).json({ success: false, error: '대화 상대와 메시지 내용이 필요합니다.' });
  }

  const character = characterService.getCharacterById(characterId);
  if (!character) {
    return res.status(404).json({ success: false, error: '대화 상대를 찾을 수 없습니다.' });
  }

  // Heart deduction verification on server
  const cost = config.heartsPerMessage;
  if (!user.isVipUnlimited && user.hearts < cost) {
    return res.status(402).json({
      success: false,
      error: 'INSUFFICIENT_HEARTS',
      required: cost,
      current: user.hearts,
      message: `${character.name}님과의 대화에 필요한 하트가 부족합니다. 충전 후 바로 이어가보세요!`
    });
  }

  // Deduct heart
  let nextHearts = user.hearts;
  if (!user.isVipUnlimited) {
    nextHearts = Math.max(0, user.hearts - cost);
    dbService.updateUser(user.id, { hearts: nextHearts });
  }

  // Prepare full message history for LLM
  const historyWithUserMsg = [
    ...chatHistory,
    { role: 'user', content: message.trim() }
  ];

  try {
    const result = await llmService.generateReply(character, historyWithUserMsg, { affection });

    return res.json({
      success: true,
      partnerReply: result.text,
      roomLeft: result.roomLeft,
      heartsRemaining: nextHearts,
      costDeducted: user.isVipUnlimited ? 0 : cost,
      isAiGenerated: result.isAiGenerated
    });
  } catch (err) {
    console.error('[CHAT ERROR]', err);
    return res.status(500).json({
      success: false,
      error: '답장 생성 중 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
    });
  }
});

// POST /api/chat/gift
router.post('/gift', requireAuth, (req, res) => {
  const user = req.user;
  const { characterId, giftKey, giftCost } = req.body;

  const cost = parseInt(giftCost, 10) || 50;
  if (!user.isVipUnlimited && user.hearts < cost) {
    return res.status(402).json({
      success: false,
      error: 'INSUFFICIENT_HEARTS',
      required: cost,
      current: user.hearts,
      message: `선물을 보내기에 하트가 부족합니다. (필요: ${cost}개, 보유: ${user.hearts}개)`
    });
  }

  let nextHearts = user.hearts;
  if (!user.isVipUnlimited) {
    nextHearts = Math.max(0, user.hearts - cost);
    dbService.updateUser(user.id, { hearts: nextHearts });
  }

  // Realistic proof photo mapping
  const PROOF_PHOTOS = {
    coffee: 'gifts/thanks_coffee.jpg',
    dessert: 'gifts/thanks_dessert.jpg',
    macaron: 'gifts/thanks_macaron.jpg',
    chicken: 'gifts/thanks_chicken.jpg',
    icecream: 'gifts/thanks_icecream.jpg',
    handcream: 'gifts/thanks_handcream.jpg',
    maskpack: 'gifts/thanks_maskpack.jpg',
    cake: 'gifts/thanks_cake.jpg',
    wine: 'gifts/thanks_wine.jpg',
    ginseng: 'gifts/thanks_ginseng.jpg',
    flower: 'gifts/thanks_flower.jpg',
    spa: 'gifts/thanks_spa.jpg'
  };

  const proofUrl = PROOF_PHOTOS[giftKey] || 'gifts/thanks_coffee.jpg';

  return res.json({
    success: true,
    proofUrl,
    heartsRemaining: nextHearts,
    costDeducted: user.isVipUnlimited ? 0 : cost
  });
});

module.exports = router;
