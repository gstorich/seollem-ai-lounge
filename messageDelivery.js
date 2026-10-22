(function(root){
 function merge(...lists){const messages=new Map();for(const list of lists)for(const m of list||[])if(m?.id)messages.set(m.id,{...messages.get(m.id),...m});
  // The provider's complete reply is durable. Bubble fragments are presentation
  // details and must never replace the complete response during navigation.
  for(const [id,m] of messages)if(m.sender==='ai'&&/^reply_/.test(id)){const base=id.replace(/_\d+$/,'');if(base!==id&&messages.get(base)?.sender==='ai')messages.delete(id);}
  const answered=new Set();
  for(const [id,m] of messages)if(m.sender==='ai'&&id.startsWith('reply_')){const request=id.slice(6);answered.add(request);const base=request.replace(/_\d+$/,'');if(!messages.has(request)&&messages.get(base)?.sender==='user')answered.add(base);}
  for(const [id,m] of messages)if(m.sender==='user'&&(m.awaitingReply===false||answered.has(id))){messages.set(id,{...m,failed:false,isFailed:false,failReason:null,awaitingReply:false});answered.add(id);}
  for(const [id,m] of messages)if(m.sender==='system'&&['generation_error','delivery_pending'].includes(m.systemKind)&&answered.has(m.requestId))messages.delete(id);
  return [...messages.values()].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
 }
 function presentation(sender,id,visibleIds){
  const visible=new Set(visibleIds);
  if(!id)return {skip:false,remove:[]};
  if(visible.has(id))return {skip:true,remove:[]};
  if(sender!=='ai'||!/^reply_/.test(id))return {skip:false,remove:[]};
  const base=id.replace(/_\d+$/,'');
  // A recovered complete response already contains every animated fragment.
  if(base!==id)return {skip:visible.has(base),remove:[]};
  return {skip:false,remove:[...visible].filter(key=>key.replace(/_\d+$/,'')===id&&key!==id)};
 }
 const api={merge,presentation};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AzitMessageDelivery=api;
})(typeof window!=='undefined'?window:globalThis);
