// Only explicit user statements establish facts; persona preferences and AI replies do not.
const addressTerms=['누나','오빠','언니','형','자기','여보','선배님','선배'];
function buildRelationshipContext(character,messages=[]){
 let age=null,gender=null,name=null,requestedAddress=null,speechRegister=null;
 const rejected=new Set();
 for(const message of messages){
  if(!['user'].includes(message.sender||message.role))continue;
  const text=String(message.text??message.content??'').trim();
  for(const term of addressTerms){
   const quoted=`["'“‘]?${term}["'”’]?`;
   if(new RegExp(quoted+'(?:이?라고|이?라곤|이?라|으?로)?\\s*(?:부르지\\s*마|하지\\s*마|안\\s*불|쓰지\\s*마|빼고|말고)').test(text)){
    rejected.add(term);if(requestedAddress===term)requestedAddress=null;
   }else if(
    new RegExp(quoted+'(?:이?라고|이?라곤|이?라|으?로)?\\s*(?:불러(?:줘|요|라|봐|줄래|주라|도\\s*(?:돼|되|괜찮|좋))?|부르면\\s*(?:돼|되|괜찮아|좋겠어|좋아)|불러주세요|해(?:줘|요|라|봐|줄래|주라|도\\s*(?:돼|되|괜찮|좋))?|해요|하면\\s*(?:돼|되|좋겠어|좋아))').test(text) ||
    new RegExp('(?:호칭(?:은)?|그쪽(?:말고|\\s*말고|이라고\\s*하지\\s*말고)?)\\s*'+quoted).test(text)
   ){
    rejected.delete(term);requestedAddress=term;
   }
  }
  // Quoted or hypothetical statements are not confirmed biography.
  if(/["“”'‘’]|가정|만약|이라면|이면|라면/.test(text))continue;
  if(/반말(?:은|로|을)?\s*(?:하지\s*마|쓰지\s*마|말아|그만)|말\s*놓지\s*마|존댓말(?:로|을)?\s*(?:말(?:해줘|해주세요|해요|해)|해줘|해주세요|해요|하세요|써줘|써주세요|써요|부탁)/.test(text))speechRegister='polite';
  else if(/말(?:을)?\s*(?:편하게|편히)\s*(?:하자|해도\s*(?:돼|괜찮아)|해줘)(?:요)?(?=$|[\s.!?])|말\s*(?:놓자|놔도\s*돼|놓아도\s*돼)(?:요)?(?=$|[\s.!?])|반말(?:로)?\s*(?:말)?(?:해도\s*돼|하자|해줘)(?:요)?(?=$|[\s.!?])|편하게\s*말해(?:줘|도\s*돼)(?:요)?(?=$|[\s.!?])/.test(text))speechRegister='casual';
  const ageMatch=text.match(/(?:^|\s)(?:저는|전|나는|난|제\s*나이는|내\s*나이는)\s*(\d{2})\s*(?:살|세)(?!\s*(?:아니|은\s*아니|이\s*아니))/);
  const bareAge=text.match(/^(\d{2})\s*(?:살|세)(?:이에요|이야|입니다|예요|에요|요|이구|이고|여자|남자|여성|남성|[.!\s]|$)/);
  const value=Number(ageMatch?.[1]||bareAge?.[1]);if(value>=18&&value<=99)age=value;
  const genderMatch=text.match(/(?:^|\s)(?:저는|전|나는|난|\d{2}\s*(?:살|세)(?:이고|이고요|인)?\s*)\s*(여자|여성|남자|남성)(?:예요|에요|야|입니다|이고|이에요|요|[.!\s]|$)/);
  if(genderMatch)gender=['여자','여성'].includes(genderMatch[1])?'female':'male';
  const nameMatch=text.match(/(?:제|내)\s*이름은\s*([가-힣]{2,5}?)(?:이에요|예요|입니다|이야)|([가-힣]{2,5}?)(?:이?라고|이?라)\s*불러(?:줘|요|라)?/);
  if(nameMatch)name=nameMatch[1]||nameMatch[2];
 }
 const allowed=[];
 if(requestedAddress)allowed.push(requestedAddress);
 if(!requestedAddress&&age!==null&&gender&&age>character.age){
  const term=character.gender==='male'?(gender==='female'?'누나':'형'):(gender==='male'?'오빠':'언니');
  if(!rejected.has(term)&&!allowed.includes(term))allowed.push(term);
 }
 // 명시적 말높임 요청이 없는 경우: 기존 대화 흐름에서 확립된 존댓말/반말의 자연스러운 연속성(관성) 감지
 if(!speechRegister&&messages.length>=2){
  let politeScore=0;
  let casualScore=0;
  for(const m of messages.slice(-10)){
   const content=String(m.text??m.content??'').trim();
   if(!content||content.length<2)continue;
   if(/^https?:\/\//i.test(content))continue;
   if(/(?:[요죠][.!?~]*$|습니다|십니까|세요|네요|드려요|할게요|해요|예요|이에요|거든요|잖아요|인걸요|텐데요)/.test(content)){
    politeScore++;
   }else if(/(?:[아어지자냐니네군마단][.!?~]*$|이야|했어|됐어|알았어|할게|갈게|올게|줄게)/.test(content)){
    casualScore++;
   }
  }
  if(politeScore>=2&&politeScore>=casualScore){
   speechRegister='polite';
  }else if(casualScore>=3&&casualScore>politeScore*2){
   speechRegister='casual';
  }
 }
 return {age,gender,name,requestedAddress,speechRegister,allowedAddressTerms:allowed.filter(term=>!rejected.has(term)),rejectedAddressTerms:[...rejected]};
}
module.exports={buildRelationshipContext};
