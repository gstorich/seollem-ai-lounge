const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../../index.html'),'utf8');
const source=html.slice(html.indexOf('    function showContentAccessNotice('),html.indexOf('    async function retryGeneratedReply('));
function element(){const children=new Map();return {children,classList:{add(){},remove(){}},setAttribute(){},appendChild(){},remove(){this.removed=true;},querySelector(id){if(!children.has(id))children.set(id,element());return children.get(id);}};}
let enabled=true,retries=0,posted=0,lastNotice;
const stored=new Map();
const context={location:{href:''},sessionStorage:{setItem:(k,v)=>stored.set(k,v)},document:{getElementById:()=>null,createElement:()=>lastNotice=element()},state:{verifiedPhone:'01000000000',currentChar:{id:'test'},messages:[]},chatContainer:{appendChild(){},querySelectorAll:()=>[],querySelector:()=>null},scrollToBottom(){},rememberSystemNotice(){return null;},saveAccountState(){},openPhoneAuthModal(){},ApiClient:{async flushState(){},async request(route){if(route==='/identity/config')return {enabled};if(route==='/identity/prepare')return {identityVerificationId:'synthetic'};if(route==='/identity/complete'){posted++;return {};}throw Error('Unexpected request: '+route);},async loadState(){return {user:{isAdult:true}};}},window:{PortOne:{async requestIdentityVerification(){return {};}}}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 assert(context.showContentAccessNotice({code:'ADULT_VERIFICATION_REQUIRED'},()=>retries++));
 const notice=lastNotice;
 await notice.querySelector('#startAdultVerifyBtn').onclick();
 assert.equal(posted,0);assert.equal(context.location.href,'/billing?intent=identity#identity');assert.equal(stored.get('azit-commerce-chat'),'test');assert.equal(retries,0,'Opening identity entry cannot resend a blocked turn');
 await notice.querySelector('#resumeAdultVerifyBtn').onclick();
 assert.equal(notice.querySelector('#resumeAdultVerifyBtn').textContent,'이 메시지 다시 시도');
 notice.querySelector('#resumeAdultVerifyBtn').onclick();assert.equal(retries,1,'Retry requires a separate user click');
 context.showContentAccessNotice({code:'ADULT_VERIFICATION_REQUIRED'},()=>retries++);
 const resumed=lastNotice;await resumed.querySelector('#resumeAdultVerifyBtn').onclick();assert.equal(retries,1,'Checking an existing identity also cannot auto-resend');
 enabled=false;context.showContentAccessNotice({code:'ADULT_VERIFICATION_REQUIRED'},()=>retries++);
 await lastNotice.querySelector('#startAdultVerifyBtn').onclick();assert.equal(posted,0,'Entry navigation cannot manufacture verification');assert.equal(retries,1);
 assert(context.showContentAccessNotice({code:'CONTENT_NOT_ALLOWED',safetyCategory:'seriousHarm',message:'24시간 자살예방 상담전화 ☎ 109'}));
 console.log('PASS content access UI: centered system notice, explicit post-verification retry and no client tester bypass');
})().catch(e=>{console.error(e);process.exitCode=1;});
