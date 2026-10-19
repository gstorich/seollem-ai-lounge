'use strict';
// One vocabulary shared by the outbox, browser configuration and diagnostics.
// Only purchase is a primary bidding objective. Upstream actions are secondary.
const events={
 page_view:{meta:'PageView',client:true},
 new_visit:{meta:'NewVisitor',custom:true,google:true},
 sign_up:{meta:'CompleteRegistration',google:true},
 first_chat:{meta:'Contact',google:true},
 view_pricing:{meta:'ViewContent',google:true,client:true},
 begin_checkout:{meta:'InitiateCheckout',google:true},
 purchase:{meta:'Purchase',google:true},
 refund:{google:true}
};
function google(name,setting){
 if(name==='refund')name='purchase';
 if(!events[name]?.google)return null;
 const actionId=setting(name==='purchase'?'google_purchase_action_id':'google_'+name+'_action_id')||(name==='purchase'?process.env.GOOGLE_ADS_PURCHASE_ACTION_ID:'');
 const label=setting(name==='purchase'?'google_purchase_label':'google_'+name+'_label');
 return {actionId,label};
}
module.exports={events,google};
