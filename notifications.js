(function(){
 const api=window.ApiClient;
 const supported=window.isSecureContext&&'Notification'in window&&'serviceWorker'in navigator&&'PushManager'in window;
 let config=null,epoch=0,polling=false;
 const button=document.getElementById('btnBrowserNotifications'),status=document.getElementById('notificationStatus'),toggle=document.getElementById('allowFirstContact');
 function explain(text){if(status)status.textContent=text;}
 function keyBytes(key){return Uint8Array.from(atob(key.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-key.length%4)%4)),c=>c.charCodeAt(0));}
 async function registration(){return navigator.serviceWorker.register('/notification-worker.js',{scope:'/'});}
 async function subscribe(){
   const reg=await registration();await navigator.serviceWorker.ready;
   const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(config.publicKey)});
   await api.request('/notifications/subscribe','POST',{subscription:sub.toJSON()});
   localStorage.setItem('azit_push_enabled','1');
   button.textContent='이 브라우저 알림 끄기';explain('새 메시지 알림이 켜져 있어요. 대화 내용은 알림에 표시하지 않아요.');
 }
 async function unsubscribe(){
   localStorage.setItem('azit_push_enabled','0');
   if(supported){const reg=await navigator.serviceWorker.getRegistration('/');const sub=await reg?.pushManager.getSubscription();
     if(sub){await api.request('/notifications/unsubscribe','POST',{endpoint:sub.endpoint});await sub.unsubscribe();}}
   button.textContent='브라우저 알림 허용';explain('이 브라우저 알림이 꺼져 있어요. 먼저 온 메시지는 대화 목록에서 확인할 수 있어요.');
 }
 async function initialize(){
   const generation=++epoch;
   try{
     config=await api.request('/notifications');if(generation!==epoch)return;
     toggle.checked=config.enabled;
     if(!supported){button.disabled=true;explain(/iPhone|iPad/.test(navigator.userAgent)?'아이폰·아이패드는 홈 화면에 추가한 뒤 알림을 켜주세요.':'이 브라우저에서는 푸시 알림을 지원하지 않아요.');return;}
     button.disabled=!config.pushAvailable;
     if(!config.pushAvailable){explain('브라우저 알림을 준비 중이에요.');return;}
     if(Notification.permission==='granted'&&localStorage.getItem('azit_push_enabled')==='1')await subscribe();
     else{button.textContent='브라우저 알림 허용';explain(Notification.permission==='denied'?'브라우저의 사이트 설정에서 알림 차단을 해제해주세요.':'허용하면 사이트를 닫아도 새 메시지 알림을 받을 수 있어요.');}
   }catch{explain('알림 설정을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');}
 }
 button?.addEventListener('click',async()=>{
   if(!supported||!config?.pushAvailable)return;
   button.disabled=true;
   try{
     if(localStorage.getItem('azit_push_enabled')==='1')await unsubscribe();
     else{
       const permission=await Notification.requestPermission();
       if(permission==='granted')await subscribe();
       else explain('알림이 허용되지 않았어요. 대화 목록에서는 계속 확인할 수 있어요.');
     }
   }catch{explain('알림을 설정하지 못했어요. 브라우저 설정을 확인한 뒤 다시 시도해주세요.');}
   finally{button.disabled=false;}
 });
 toggle?.addEventListener('change',async()=>{
   toggle.disabled=true;
   try{await api.request('/notifications','PUT',{enabled:toggle.checked});config.enabled=toggle.checked;}
   catch{toggle.checked=!toggle.checked;explain('설정을 저장하지 못했어요. 다시 시도해주세요.');}
   finally{toggle.disabled=false;}
 });
 async function poll(){
   if(polling||!api.isConnected()||document.visibilityState!=='visible')return;
   polling=true;const generation=epoch;
   try{const inbox=await api.request('/notifications/inbox?visible=1');if(generation===epoch)window.dispatchEvent(new CustomEvent('azit-contact-inbox',{detail:inbox.items}));}
   catch{}finally{polling=false;}
 }
 function notifyAiMessage(char, text) {
   if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
   if (typeof document !== 'undefined' && document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus())) return;
   try {
     const title = char?.name || '아지트챗';
     const body = (text || '새 메시지가 도착했어요').slice(0, 100);
     const icon = char?.avatar || '/app-icon.png';
     if (typeof Notification === 'function') {
       const n = new Notification(title, {
         body,
         icon,
         tag: 'azit-msg-' + (char?.id || 'chat')
       });
       n.onclick = function() {
         if (typeof window !== 'undefined' && window.focus) window.focus();
         if (char?.id) window.dispatchEvent(new CustomEvent('azit-open-contact', { detail: char.id }));
         n.close();
       };
     }
   } catch {}
 }
 window.AzitNotifications={logout:unsubscribe,subscribe,notifyAiMessage};
 window.addEventListener('azit-account-ready',()=>{initialize();poll();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')poll();});
 navigator.serviceWorker?.addEventListener('message',event=>{
   if(event.data?.type==='azit-open-contact')window.dispatchEvent(new CustomEvent('azit-open-contact',{detail:event.data.characterId}));
 });
 setInterval(poll,30000);
})();
