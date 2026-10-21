(function(root){
 function merge(...lists){const messages=new Map();for(const list of lists)for(const m of list||[])if(m?.id)messages.set(m.id,{...messages.get(m.id),...m});
  // The provider's complete reply is durable. Bubble fragments are presentation
  // details and must never replace the complete response during navigation.
  for(const [id,m] of messages)if(m.sender==='ai'&&/^reply_/.test(id)){const base=id.replace(/_\d+$/,'');if(base!==id&&messages.get(base)?.sender==='ai')messages.delete(id);}
  return [...messages.values()].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
 }
 const api={merge};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.AzitMessageDelivery=api;
})(typeof window!=='undefined'?window:globalThis);
