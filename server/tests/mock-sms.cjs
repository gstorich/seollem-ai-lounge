// Loaded only by the isolated integration-test process, never in production.
const fs = require('node:fs');
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url) !== 'https://apis.aligo.in/send/') return originalFetch(url, options);
  const body = new URLSearchParams(options.body);
  const code = body.get('msg').match(/\[(\d{6})\]/)?.[1];
  fs.writeFileSync(process.env.SMS_CAPTURE_FILE, JSON.stringify({ phone: body.get('receiver'), code, body: body.get('msg') }));
  if (body.get('receiver') === '01000000999') return new Response(JSON.stringify({ result_code: -101, message: 'mock provider failure' }));
  return new Response(JSON.stringify({ result_code: 1, success_cnt: 1, error_cnt: 0, msg_id: 'mock-message' }));
};
