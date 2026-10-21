// Push only: no page caching, session tokens, or conversation bodies.
self.addEventListener('push',event=>{
 let data;try{data=event.data.json();}catch{data={};}
 const characterId=typeof data.characterId==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(data.characterId)?data.characterId:null;
 event.waitUntil(self.registration.showNotification('아지트챗',{
   body:'대화 상대에게 새 메시지가 왔어요',tag:typeof data.tag==='string'?data.tag:'azit-contact',
   icon:'/app-icon.png?v=20261022-identity',badge:'/notification-badge.png?v=20261022-identity',data:{characterId},renotify:true
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const id=event.notification.data?.characterId;
 const path=id?'/?chat='+encodeURIComponent(id):'/';
 event.waitUntil((async()=>{
   const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
   const client=windows.find(w=>new URL(w.url).origin===self.location.origin&&new URL(w.url).pathname==='/');
   if(client){await client.focus();client.postMessage({type:'azit-open-contact',characterId:id});}
   else await self.clients.openWindow(path);
 })());
});
