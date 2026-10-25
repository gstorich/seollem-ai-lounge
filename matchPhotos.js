(function(root){
  'use strict';
  function photoKey(avatar){
    if(typeof avatar!=='string'||!avatar.trim())return '';
    try{
      const url=new URL(avatar.trim(),'https://azitchat.com/');
      url.hash='';
      if(['azitchat.com','www.azitchat.com'].includes(url.hostname))return url.pathname;
      return url.href;
    }catch{return avatar.trim();}
  }
  function roomPhotoOwners(rooms,lookup){
    const owners=new Map();
    // Retained closed rooms count too; deleting a room removes its photo exclusion.
    for(const id of Object.keys(rooms||{})){
      const key=photoKey(lookup(id)?.avatar);
      if(!key)continue;
      if(!owners.has(key))owners.set(key,new Set());
      owners.get(key).add(id);
    }
    return owners;
  }
  function conflicts(character,owners){
    const ids=owners.get(photoKey(character?.avatar));
    if(!ids)return false;
    for(const id of ids)if(id!==character.id)return true;
    return false;
  }
  const api={photoKey,roomPhotoOwners,conflicts};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.AzitMatchPhotos=api;
})(typeof window!=='undefined'?window:globalThis);
