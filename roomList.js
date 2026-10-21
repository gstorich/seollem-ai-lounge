(function(root){
 function latest(room){const messages=room.messages||[],last=messages[messages.length-1];return (room.lastMessage?.createdAt||0)>(last?.createdAt||0)?room.lastMessage:last||room.lastMessage;}
 function activity(room){return Number(latest(room)?.createdAt)||Number(room.lastActivityAt)||Number(room.firstMetAt)||Number(room.updatedAt)||0;}
 function summary(room){const last=latest(room);return {charId:room.charId,roomLeft:Boolean(room.roomLeft),partnerLeftAt:room.partnerLeftAt,partnerLeftReplyId:room.partnerLeftReplyId,firstMetAt:room.firstMetAt,updatedAt:room.updatedAt,lastActivityAt:activity(room),unreadCount:Number(room.unreadCount)||0,summaryOnly:true,messages:[],...(last?{lastMessage:{id:last.id,sender:last.sender,text:String(last.text||'').slice(0,180),time:last.time,createdAt:last.createdAt}}:{})};}
 function page(rooms,characters,{query='',filter='all',page=1,pageSize=30}={}){
  const catalog=new Map(characters.map(c=>[c.id,c])),needle=query.trim().toLocaleLowerCase();
  const entries=Object.values(rooms||{}).filter(room=>{
   const char=catalog.get(room.charId);if(!char)return false;
   if(filter==='unread'&&!(room.unreadCount>0)||filter==='open'&&room.roomLeft||filter==='closed'&&!room.roomLeft)return false;
   return !needle||[char.name,char.job,latest(room)?.text].join(' ').toLocaleLowerCase().includes(needle);
  }).sort((a,b)=>activity(b)-activity(a)||String(a.charId).localeCompare(String(b.charId)));
  const pages=Math.max(1,Math.ceil(entries.length/pageSize)),current=Math.min(pages,Math.max(1,Number(page)||1));
  return {entries:entries.slice((current-1)*pageSize,current*pageSize),total:entries.length,page:current,pages};
 }
 function trimCache(rooms,keepIds=[],limit=8){
  const keep=new Set(keepIds.filter(Boolean));
  const cached=Object.values(rooms||{}).filter(room=>!room.summaryOnly&&!keep.has(room.charId)).sort((a,b)=>activity(b)-activity(a));
  for(const room of cached.slice(limit))rooms[room.charId]=summary(room);
  for(const room of Object.values(rooms||{}))if(room.summaryOnly&&room.messages?.length&&!keep.has(room.charId))rooms[room.charId]=summary(room);
 }
 const api={latest,activity,summary,page,trimCache};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AzitRoomList=api;
})(typeof window!=='undefined'?window:globalThis);
