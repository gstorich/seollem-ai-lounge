const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const dbService = require('../services/dbService');
const { requireAuth } = require('../middleware/auth');

// GET /api/match/characters
router.get('/characters', (req, res) => {
  const characters = characterService.getAllCharacters();
  return res.json({ success: true, characters });
});

// POST /api/match/request
router.post('/request', requireAuth, (req, res) => {
  const user = req.user;
  const { filters } = req.body;

  const matchedChar = characterService.findMatch(filters || user.matchFilter, user.metCharIds || []);

  // Update met character history
  const metIds = Array.isArray(user.metCharIds) ? [...user.metCharIds] : [];
  if (!metIds.includes(matchedChar.id)) {
    metIds.push(matchedChar.id);
  }

  dbService.updateUser(user.id, {
    metCharIds: metIds,
    prevCharId: matchedChar.id
  });

  return res.json({
    success: true,
    character: matchedChar
  });
});

// POST /api/match/recall-previous
router.post('/recall-previous', requireAuth, (req, res) => {
  const user = req.user;
  const requestedId = typeof req.body.characterId === 'string' ? req.body.characterId : user.prevCharId;
  if (!requestedId || !(user.metCharIds || []).includes(requestedId)) {
    return res.status(400).json({ success: false, error: '이전에 만난 인연 정보가 없습니다.' });
  }

  const prevChar = characterService.getCharacterById(requestedId);
  if (!prevChar) {
    return res.status(404).json({ success: false, error: '상대방 정보를 찾을 수 없습니다.' });
  }

  // Cost: 20 hearts if not VIP
  const cost = 20;
  if (!user.isVipUnlimited && user.hearts < cost) {
    return res.status(402).json({
      success: false,
      error: 'INSUFFICIENT_HEARTS',
      message: `하트가 부족합니다. (필요: ${cost}개, 보유: ${user.hearts}개)`
    });
  }

  const debited = dbService.transaction(() => dbService.debit(user.id, cost, 'recall'));
  if (!debited) return res.status(402).json({ success: false, error: '하트가 부족합니다.' });
  const nextHearts = debited.hearts;

  return res.json({
    success: true,
    character: prevChar,
    heartsRemaining: nextHearts
  });
});

module.exports = router;
