const crypto=require('node:crypto'),zlib=require('node:zlib');
const enc=s=>encodeURIComponent(s).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase());
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function settings(){return {endpoint:process.env.AZIT_R2_ENDPOINT,bucket:process.env.AZIT_R2_BUCKET,access:process.env.AZIT_R2_ACCESS_KEY_ID,secret:process.env.AZIT_R2_SECRET_ACCESS_KEY,key:process.env.AZIT_ARCHIVE_KEY,prefix:process.env.AZIT_R2_PREFIX||'azitchat-private/v1'};}
function configured(){const c=settings();return Boolean(c.endpoint&&c.bucket&&c.access&&c.secret&&/^[a-f0-9]{64}$/.test(c.key||''));}
function pack(bytes){const key=Buffer.from(settings().key||'','hex');if(key.length!==32)throw Error('ARCHIVE_KEY_REQUIRED');const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(zlib.gzipSync(bytes)),cipher.final()]);return Buffer.concat([Buffer.from('AZR1'),iv,cipher.getAuthTag(),data]);}
function unpack(bytes){if(bytes.subarray(0,4).toString()!=='AZR1')throw Error('ARCHIVE_FORMAT');const decipher=crypto.createDecipheriv('aes-256-gcm',Buffer.from(settings().key||'','hex'),bytes.subarray(4,16));decipher.setAuthTag(bytes.subarray(16,32));return zlib.gunzipSync(Buffer.concat([decipher.update(bytes.subarray(32)),decipher.final()]),{maxOutputLength:256*1024*1024});}
async function request(method,key,body=Buffer.alloc(0),query={}){
 const c=settings();if(!configured())throw Error('R2_NOT_CONFIGURED');
 const endpoint=new URL(c.endpoint);if(endpoint.protocol!=='https:'||!endpoint.hostname.endsWith('.r2.cloudflarestorage.com'))throw Error('INVALID_R2_ENDPOINT');
 const uri='/'+enc(c.bucket)+(key?'/'+key.split('/').map(enc).join('/'):'');const qs=Object.keys(query).sort().map(k=>enc(k)+'='+enc(query[k])).join('&');
 const date=new Date().toISOString().replace(/[:-]|\.\d{3}/g,''),day=date.slice(0,8),scope=day+'/auto/s3/aws4_request',digest=hash(body);
 const headers={'host':endpoint.host,'x-amz-content-sha256':digest,'x-amz-date':date};const names=Object.keys(headers).sort();
 const canonical=[method,uri,qs,names.map(k=>k+':'+headers[k]+'\n').join(''),names.join(';'),digest].join('\n');
 const hmac=(key,data)=>crypto.createHmac('sha256',key).update(data).digest();let sign=hmac('AWS4'+c.secret,day);for(const part of ['auto','s3','aws4_request'])sign=hmac(sign,part);
 headers.Authorization='AWS4-HMAC-SHA256 Credential='+c.access+'/'+scope+', SignedHeaders='+names.join(';')+', Signature='+hmac(sign,'AWS4-HMAC-SHA256\n'+date+'\n'+scope+'\n'+hash(canonical)).toString('hex');
 const res=await fetch(endpoint.origin+uri+(qs?'?'+qs:''),{method,headers,...(['PUT','POST'].includes(method)?{body}:{}),signal:AbortSignal.timeout(method==='PUT'?60000:10000)});
 if(!res.ok)throw Error('R2_HTTP_'+res.status);return Buffer.from(await res.arrayBuffer());
}
async function putVerified(key,plain){const encrypted=pack(plain);await request('PUT',key,encrypted);const restored=unpack(await request('GET',key));if(hash(restored)!==hash(plain))throw Error('R2_VERIFY_FAILED');return {sha256:hash(plain),bytes:encrypted.length};}
async function get(key){return unpack(await request('GET',key));}
async function list(prefix){let token='',items=[];do{const xml=(await request('GET','',undefined,{'list-type':'2',prefix,...(token?{'continuation-token':token}:{})})).toString();const decode=s=>s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');for(const match of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)){const key=/<Key>([\s\S]*?)<\/Key>/.exec(match[1])?.[1];if(key)items.push(decode(key));}token=/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml)?.[1]||'';}while(token);return items;}
module.exports={configured,settings,hash,pack,unpack,putVerified,get,list,remove:key=>request('DELETE',key)};
