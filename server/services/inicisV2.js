const crypto=require('node:crypto');
const states={PAID:'paid',PARTIAL_CANCELLED:'cancelled',CANCELLED:'cancelled',FAILED:'failed',READY:'ready',PAY_PENDING:'ready',VIRTUAL_ACCOUNT_ISSUED:'ready'};
// Normalize provider data for the existing atomic heart/refund ledger.
function normalizePayment(p){
 if(!p||!states[p.status]||typeof p.transactionId!=='string'||!p.transactionId)throw Error('PORTONE_INVALID_PAYMENT');
 return {merchant_uid:p.id,imp_uid:'imp_v2_'+crypto.createHash('sha256').update(p.transactionId).digest('hex'),status:states[p.status],paid_at:p.paidAt?Math.floor(Date.parse(p.paidAt)/1000):0,amount:p.amount?.total,cancel_amount:p.amount?.cancelled,name:p.orderName,currency:p.currency,pay_method:p.method?.type==='PaymentMethodCard'?'card':p.method?.type,pg_provider:p.channel?.pgProvider==='INICIS_V2'?'inicis_v2':p.channel?.pgProvider,pg_id:p.channel?.pgMerchantId,custom_data:p.customData,store_id:p.storeId,channel_key:p.channel?.key,channel_type:p.channel?.type,api_version:p.version};
}
module.exports={normalizePayment};
