const express = require('express');
const router = express.Router();
const db = require('../services/dbService');
const characters = require('../services/characterService');
const { requireAuth } = require('../middleware/auth');
router.use(requireAuth);
function snapshot(user) {
  return { success: true, user: { id: user.id, phone: user.phone, hearts: user.hearts,
    isVipUnlimited: user.isVipUnlimited, phoneBonusClaimed: user.phoneBonusClaimed, heartExpiry: db.getHeartSummary(user.id),
    isAdult: require('../services/contentAccess').verifiedAdult(user) },
    savedRooms: Object.fromEntries(Object.entries(user.savedRooms||{}).map(([id,room])=>[id,{...room,messages:(room.messages||[]).slice(-40)}])), roomCharacters:Object.keys(user.savedRooms||{}).map(id=>characters.publicProfile(characters.getCharacterById(id))).filter(Boolean), metCharIds: user.metCharIds || [], matchFilter: user.matchFilter,
    unlockedMedia: user.unlockedMedia || {}, prevCharId: user.prevCharId || null };
}
router.get('/hearts', (req,res) => {
  res.set('Cache-Control','no-store');
  res.json({success:true,hearts:db.getUser(req.user.id).hearts,summary:db.getHeartSummary(req.user.id),grants:db.getHeartGrants(req.user.id)});
});
router.get('/rooms/:id/messages',async(req,res)=>{res.set('Cache-Control','no-store');try{const result=await require('../services/conversationArchive').page(req.user.id,req.params.id,{before:req.query.before,limit:40});res.json({success:true,...result});}catch(e){res.status(e.status||503).json({success:false,error:e.status===400?'잘못된 조회 위치입니다.':'이전 대화를 불러오지 못했습니다. 다시 시도해주세요.'});}});
router.get('/sync',(req,res)=>{res.set('Cache-Control','no-store');const user=db.getUser(req.user.id),revision=db.sql.prepare('SELECT version FROM account_message_versions WHERE user_id=?').get(user.id)?.version||0,syncVersion=String(user.updatedAt)+':'+revision;if(req.query.after===syncVersion)return res.json({success:true,unchanged:true,syncVersion});res.json({...snapshot(user),syncVersion});});
router.get('/state', (req, res) => res.json(snapshot(db.getUser(req.user.id))));
const roomStrings = ['memorySummary', 'lastGreetingSlot'];
const roomNumbers = ['firstMetAt', 'photosSentCount', 'unreadCount', 'affection', 'turnCount', 'rudeStrikes', 'anger', 'updatedAt'];
const msgStrings = ['id', 'sender', 'text', 'time', 'systemKind', 'errorCode', 'requestId', 'requestKind', 'mediaType', 'mediaId', 'photoUrl', 'photoTitle', 'photoDesc', 'voiceText', 'durationText', 'giftEmoji', 'giftName', 'giftImage', 'giftBrand'];
function sanitizeRooms(rooms, existingRooms = {}) {
  if (!rooms || typeof rooms !== 'object' || Array.isArray(rooms) || Object.keys(rooms).length > 1250) throw new Error('Invalid rooms');
  const out = {};
  for (const [id, room] of Object.entries(rooms)) {
    if (!characters.getCharacterById(id) || (!characters.isPublished(id) && !existingRooms[id]) || !room || !Array.isArray(room.messages) || room.messages.length > 2000) throw new Error('Invalid room');
    const clean = { charId: id, roomLeft:Boolean(existingRooms[id]?.roomLeft),partnerLeftAt:existingRooms[id]?.partnerLeftAt,partnerLeftReplyId:existingRooms[id]?.partnerLeftReplyId, messages: [], userFacts: Array.isArray(room.userFacts) ? room.userFacts.filter(f => typeof f === 'string').slice(-25).map(f => f.slice(0,500)) : [] };
    for (const key of roomStrings) if (typeof room[key] === 'string') clean[key] = room[key].slice(0,2000);
    for (const key of roomNumbers) if (Number.isFinite(room[key])) clean[key] = Math.max(0,room[key]);
    for (const key of ['warned', 'bookmarked']) clean[key] = Boolean(room[key]);
    for (const message of room.messages) {
      if (!message || typeof message.id !== 'string' || message.id.length > 140 || !['user','ai','system'].includes(message.sender)) throw new Error('Invalid message');
      if(message.sender==='system'){
        if(message.systemKind==='partner_left'){
          // Canonical server notices already survive merges; clients cannot forge a departure.
          continue;
        }
        if(!['generation_error','content_notice'].includes(message.systemKind))throw Error('Invalid system notice');
      }
      const msg = {};
      for (const key of msgStrings) if (typeof message[key] === 'string') msg[key] = message[key].slice(0,key === 'text' ? 8000 : 2000);
      for (const key of ['photoUrl','giftImage']) if (msg[key] && !/^(avatars|gifts)\/[a-zA-Z0-9_.-]+$/.test(msg[key])) delete msg[key];
      msg.createdAt = Number.isFinite(message.createdAt) ? Math.min(Date.now(), Math.max(0, message.createdAt)) : Number((message.id.match(/^m_(\d{13})_/) || [])[1]) || Date.now();
      msg.awaitingReply = message.sender === 'user' && Boolean(message.awaitingReply);
      msg.isSecret = Boolean(message.isSecret);
      msg.unread = Boolean(message.unread);
      msg.cost = Number.isFinite(message.cost) ? Math.max(0,message.cost) : 0;
      clean.messages.push(msg);
    }
    out[id] = clean;
  }
  return out;
}
router.put('/state', (req, res) => {
  let rooms;
  try { rooms = sanitizeRooms(req.body.savedRooms || {}, db.getUser(req.user.id).savedRooms || {}); }
  catch { return res.status(400).json({ success: false, error: '대화 저장 형식이 올바르지 않습니다.' }); }
  const user = db.transaction(() => {
    const user = db.getUser(req.user.id);
    const metCharIds = [...new Set([...(user.metCharIds || []), ...(Array.isArray(req.body.metCharIds) ? req.body.metCharIds : [])])].filter(id => characters.getCharacterById(id)).slice(-1500);
    const updates = { savedRooms: db.mergeRooms(user.savedRooms, rooms), metCharIds };
    const prevCharId = req.body.prevCharId;
    if (characters.getCharacterById(prevCharId)) updates.prevCharId = prevCharId;
    const filter = req.body.matchFilter;
    if (filter && typeof filter === 'object') updates.matchFilter = Object.fromEntries(['ages','traits','regions'].map(key => [key, Array.isArray(filter[key]) ? filter[key].filter(x => typeof x === 'string').slice(0,20) : []]));
    if (filter && ['female','male'].includes(filter.gender)) updates.matchFilter.gender = filter.gender;
    return db.updateUser(user.id, updates);
  });
  // Deliberately excludes client-supplied balances, phone, VIP, or bonuses.
  return res.json({ success: true, hearts: user.hearts, updatedAt: user.updatedAt });
});
router.delete('/rooms/:id', (req, res) => {
  db.transaction(()=>{
  const user = db.getUser(req.user.id);
  const savedRooms = { ...user.savedRooms };
  delete savedRooms[req.params.id];
  db.updateUser(user.id, { savedRooms });
  db.resetConversationState(user.id,req.params.id);
  });
  return res.json({ success: true });
});
module.exports = router;
