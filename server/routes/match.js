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
  const selectionFilters=filters||user.matchFilter||{};
  const metIds=new Set([...(user.metCharIds||[]),...Object.keys(user.savedRooms||{})]);
  const allowRepeat=req.body.allowRepeat===true;
  let matchedChar=characterId?characterService.getCharacterById(characterId):characterService.findMatch(selectionFilters,[...metIds]);
  if(matchedChar&&metIds.has(matchedChar.id)&&!allowRepeat)return res.status(409).json({success:false,error:'MATCH_ALREADY_MET',message:'이미 만난 상대입니다. 대화 목록에서 이어가세요.',metCharIds:[...metIds]});
  if(!matchedChar&&allowRepeat){
    const pool=characterService.getAllCharacters().filter(c=>characterService.matchesFilters(c,selectionFilters)&&metIds.has(c.id)&&!user.savedRooms?.[c.id]?.roomLeft&&c.id!==req.body.excludeCharacterId);
    const activity=require('../../roomList').activity;
    pool.sort((a,b)=>Number(Boolean(user.savedRooms?.[b.id]))-Number(Boolean(user.savedRooms?.[a.id]))||activity(user.savedRooms?.[a.id]||{})-activity(user.savedRooms?.[b.id]||{}));
    matchedChar=pool[0]||null;
  }
  if(!matchedChar){
    const eligible=characterService.getAllCharacters().filter(c=>characterService.matchesFilters(c,selectionFilters));
    return res.status(404).json({success:false,error:eligible.length?'MATCH_POOL_EXHAUSTED':'NO_MATCHING_CHARACTERS',message:eligible.length?'선택한 조건의 새로운 상대를 모두 만났어요. 조건을 바꾸거나 대화 목록에서 이전 상대와 이어가세요.':'조건에 맞는 공개 캐릭터가 없습니다. 매칭 조건을 바꿔주세요.'});
  }
  const repeated=metIds.has(matchedChar.id);
  if(repeated&&user.savedRooms?.[matchedChar.id]?.roomLeft)return res.status(400).json({success:false,error:'ROOM_LEFT',message:'종료된 대화는 다시 소개하지 않습니다. 다른 상대를 선택해주세요.'});

  // 추천 로깅 (7:3 Bandit telemetry)
  const mode = matchedChar._matchMode || (characterId ? 'direct_choice' : 'popular_exploitation');
  if (dbService.recordMatchRecommendation) {
    dbService.recordMatchRecommendation(user.id, matchedChar.id, mode, filters || user.matchFilter);
  }

  // Update met character history
  metIds.add(matchedChar.id);

  dbService.updateUser(user.id, {
    metCharIds: [...metIds],
    prevCharId: matchedChar.id
  });

  return res.json({
    success: true,
    character: characterService.publicProfile(matchedChar),
    matchMode: mode,
    repeated,
    metCharIds:[...metIds],
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

  if(require('../services/aiReports').isHeld(requestedId))return res.status(503).json({success:false,error:'CHARACTER_UNDER_REVIEW',message:'이 캐릭터는 답변 점검 중입니다. 하트는 차감되지 않았습니다.',costDeducted:0});
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
