const config = require('../config');
module.exports = {
  configured() { return Boolean(config.aligoApiKey && config.aligoUserId && config.aligoSender); },
  async sendOtp(phone, code) {
    if (!this.configured()) throw new Error('SMS_NOT_CONFIGURED');
    const body = new URLSearchParams({ key: config.aligoApiKey, user_id: config.aligoUserId,
      sender: config.aligoSender, receiver: phone, msg: `[아지트챗] 인증번호 [${code}]를 5분 안에 입력해주세요. 타인에게 알려주지 마세요.`, msg_type: 'SMS' });
    if (config.aligoTestMode) body.set('testmode_yn', 'Y');
    const response = await fetch('https://apis.aligo.in/send/', { method: 'POST', body,
      signal: AbortSignal.timeout(12000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const result = await response.json();
    if (!response.ok || String(result.result_code) !== '1' || Number(result.success_cnt) !== 1) {
      // Never log provider responses containing phone numbers or message bodies.
      throw new Error(`SMS_PROVIDER_ERROR_${Number(result.result_code) || 0}`);
    }
    return String(result.msg_id || '');
  }
};
