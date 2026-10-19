const express = require('express');
const router = express.Router();
const characterService = require('../services/characterService');
const dbService = require('../services/dbService');
const { requireAuth } = require('../middleware/auth');
const { eligibility } = require('../services/matchAccess');

// GET /api/match/characters
router.get('/characters', (req, res) => {
  res.set('Cache-Control','no-store');
  const version=characterService.catalogVersion();
  if(req.query.version===version)return res.json({success:true,version,unchanged:true});
  const characters = characterService.getAllCharacters();
  return res.json({ success: true, version, characters });
});

router.get('/eligibility', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ success: true, ...eligibility(req.user) });
});

// POST /api/match/request
router.post('/request', requireAuth, require('../services/legalService').requireAcceptance, (req, res) => {
  const user = req.user;
  const access = eligibility(user);
  if (!access.canMatch) return res.status(402).json({
    success: false, error: 'INSUFFICIENT_HEARTS', ...access,
    message: user.phone
      ? '대화를 시작할 하트가 부족합니다. 하트 충전 후 새로운 상대를 만나보세요.'
      : '휴대폰 번호를 연동하면 첫 인증 시 100하트를 받을 수 있습니다. 번호 연동 전에는 결제할 수 없습니다.'
  });
  const { filters, characterId } = req.body;
  if (characterId !== undefined && (typeof characterId !== 'string' || !characterService.isPublished(characterId))) {
    return res.status(400).json({ success: false, error: '대화 상대를 찾을 수 없습니다.' });
  }
  const matchedChar = characterId ? characterService.getCharacterById(characterId)
    : characterService.findMatch(filters || user.matchFilter, user.metCharIds || []);
  if(!matchedChar)return res.status(404).json({success:false,error:'조건에 맞는 공개 캐릭터가 없습니다.'});

  // 추천 로깅 (7:3 Bandit telemetry)
  const mode = matchedChar._matchMode || (characterId ? 'direct_choice' : 'popular_exploitation');
  if (dbService.recordMatchRecommendation) {
    dbService.recordMatchRecommendation(user.id, matchedChar.id, mode, filters || user.matchFilter);
  }

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
    character: characterService.publicProfile(matchedChar),
    matchMode: mode,
    ...access
  });
});

// POST /api/match/recall-previous
router.post('/recall-previous', requireAuth, require('../services/legalService').requireAcceptance, (req, res) => {
  const user = req.user;
  const requestedId = typeof req.body.characterId === 'string' ? req.body.characterId : user.prevCharId;
  if (!requestedId || !(user.metCharIds || []).includes(requestedId)) {
    return res.status(400).json({ success: false, error: '이전에 만난 인연 정보가 없습니다.' });
  }

  const prevChar = characterService.getCharacterById(requestedId);
  if (!prevChar||!characterService.isPublished(requestedId)&&!user.savedRooms?.[requestedId]) {
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
    character: characterService.publicProfile(prevChar),
    heartsRemaining: nextHearts
  });
});

module.exports = router;
