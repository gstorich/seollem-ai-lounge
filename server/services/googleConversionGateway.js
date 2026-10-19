'use strict';
// Data Manager multi-source events use the SAME website conversion and transaction
// ID as gtag. Never create a second primary goal for the server fallback.
const env=process.env;
let token;
function ready(){return Boolean(env.GOOGLE_ADS_OAUTH_CLIENT_ID&&env.GOOGLE_ADS_OAUTH_CLIENT_SECRET&&env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN&&/^\d{10}$/.test(env.GOOGLE_ADS_CUSTOMER_ID||'')&&/^\d+$/.test(env.GOOGLE_ADS_PURCHASE_ACTION_ID||''));}
async function access(){
 if(token&&token.until>Date.now()+60000)return token.value;
 const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_ADS_OAUTH_CLIENT_ID,client_secret:env.GOOGLE_ADS_OAUTH_CLIENT_SECRET,refresh_token:env.GOOGLE_ADS_OAUTH_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});
 const b=await res.json();if(!res.ok||!b.access_token)throw Error('GOOGLE_AUTH_FAILED');token={value:b.access_token,until:Date.now()+(Number(b.expires_in)||3600)*1000};return token.value;
}
function payload(data,at){
 const adIdentifiers={};for(const k of ['gclid','gbraid','wbraid'])if(data.context?.[k])adIdentifiers[k]=data.context[k];
 if(!Object.keys(adIdentifiers).length)throw Error('NO_AD_IDENTIFIER');
 const account={accountType:'GOOGLE_ADS',accountId:env.GOOGLE_ADS_CUSTOMER_ID};
 return {destinations:[{operatingAccount:account,loginAccount:{accountType:'GOOGLE_ADS',accountId:env.GOOGLE_ADS_LOGIN_CUSTOMER_ID||env.GOOGLE_ADS_CUSTOMER_ID},productDestinationId:env.GOOGLE_ADS_PURCHASE_ACTION_ID}],encoding:'HEX',consent:{adUserData:'CONSENT_GRANTED',adPersonalization:'CONSENT_DENIED'},events:[{eventTimestamp:new Date(at).toISOString(),transactionId:data.transaction_id,eventSource:'WEB',conversionValue:data.value,currency:'KRW',adIdentifiers}],validateOnly:false};
}
async function send(data,at){
 const body=payload(data,at);
 const res=await fetch('https://datamanager.googleapis.com/v1/events:ingest',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await access(),...(env.GOOGLE_ADS_QUOTA_PROJECT?{'X-Goog-User-Project':env.GOOGLE_ADS_QUOTA_PROJECT}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const b=await res.json();if(!res.ok||typeof b.requestId!=='string')throw Error('GOOGLE_INGEST_FAILED');return {requestId:b.requestId,warnings:Boolean(b.fieldWarnings?.length)};
}
module.exports={ready,payload,send};
