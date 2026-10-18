// Only explicit user statements establish facts; persona preferences and AI replies do not.
const addressTerms=['누나','오빠','언니','형','자기','여보','선배님'];
function buildRelationshipContext(character,messages=[]){
 let age=null,gender=null,name=null,requestedAddress=null;
 const rejected=new Set();
 for(const message of messages){
  if(!['user'].includes(message.sender||message.role))continue;
  const text=String(message.text??message.content??'').trim();
  for(const term of addressTerms){
   const quoted=`["'“‘]?${term}["'”’]?`;
   if(new RegExp(quoted+'(?:라고|라곤|라|로)?\\s*(?:부르지\\s*마|하지\\s*마|안\\s*불|말고)').test(text)){
    rejected.add(term);if(requestedAddress===term)requestedAddress=null;
   }else if(new RegExp(quoted+'(?:라고|라|로)\\s*(?:불러(?:줘|요|도\\s*(?:돼|되|괜찮))|불러주세요|불러도\\s*좋)').test(text)){
    rejected.delete(term);requestedAddress=term;
   }
  }
  // Quoted or hypothetical statements are not confirmed biography.
  if(/["“”'‘’]|가정|만약|이라면|이면|라면/.test(text))continue;
  const ageMatch=text.match(/(?:^|\s)(?:저는|전|나는|난|제\s*나이는|내\s*나이는)\s*(\d{2})\s*(?:살|세)(?!\s*(?:아니|은\s*아니|이\s*아니))/);
  const bareAge=text.match(/^(\d{2})\s*(?:살|세)(?:이에요|이야|입니다|예요|에요|요|이구|이고|여자|남자|여성|남성|[.!\s]|$)/);
  const value=Number(ageMatch?.[1]||bareAge?.[1]);if(value>=18&&value<=99)age=value;
  const genderMatch=text.match(/(?:^|\s)(?:저는|전|나는|난|\d{2}\s*(?:살|세)(?:이고|이고요|인)?\s*)\s*(여자|여성|남자|남성)(?:예요|에요|야|입니다|이고|이에요|요|[.!\s]|$)/);
  if(genderMatch)gender=['여자','여성'].includes(genderMatch[1])?'female':'male';
  const nameMatch=text.match(/(?:제|내)\s*이름은\s*([가-힣]{2,5}?)(?:이에요|예요|입니다|이야)/);if(nameMatch)name=nameMatch[1];
 }
 const allowed=[];
 if(requestedAddress)allowed.push(requestedAddress);
 if(!requestedAddress&&age!==null&&gender&&age>character.age){
  const term=character.gender==='male'?(gender==='female'?'누나':'형'):(gender==='male'?'오빠':'언니');
  if(!rejected.has(term)&&!allowed.includes(term))allowed.push(term);
 }
 return {age,gender,name,requestedAddress,allowedAddressTerms:allowed.filter(term=>!rejected.has(term)),rejectedAddressTerms:[...rejected]};
}
module.exports={buildRelationshipContext};
