"""Rebuild local ad drafts. Does not contact ad platforms or publish campaigns."""
import csv, json, html
from pathlib import Path
from urllib.parse import urlencode
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent
CAMPAIGN = 'azit_purchase_kr_m40_70_v1'
def url(source, content):
    return 'https://azitchat.com/?' + urlencode(dict(utm_source=source, utm_medium='cpc' if source=='google' else 'paid_social', utm_campaign=CAMPAIGN, utm_content=content))
def csv_file(name, rows):
    with (OUT/name).open('w', encoding='utf-8-sig', newline='') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
def width(s):
    import unicodedata
    return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in s)

headlines=['아지트챗 AI 대화','AI 캐릭터와 채팅','나만의 편안한 대화','일상 이야기를 나눠요','다양한 성격의 AI','브라우저로 간편하게','나누던 대화를 이어요','가상 캐릭터와 대화','취향에 맞는 AI 찾기','첫 대화는 무료 체험','대화마다 하트 사용','아지트챗에서 시작']
descriptions=['가상의 AI 캐릭터와 나누는 일상 대화. 무료 체험 후 하트로 이어가세요.', '각자의 성격과 말투를 가진 AI 캐릭터. 실제 사람 연결 서비스가 아닙니다.', '하트 상품과 이용 조건을 확인하세요. AI 답변 1회에 3.7하트를 사용합니다.', '만 18세 이상 이용 가능한 AI 채팅. 상품·가격·환불 조건을 확인하세요.']
assert all(width(s)<=30 for s in headlines)
assert all(width(s)<=90 for s in descriptions)
search=[]
for group,content in [('AI 대화','search_ai'),('캐릭터 대화','search_character')]:
    row={'Campaign':CAMPAIGN,'Ad group':group,'Ad type':'Responsive search ad','Status':'Paused','Final URL':url('google',content),'Headline 1 position':'1'}
    row.update({f'Headline {i+1}':s for i,s in enumerate(headlines)})
    row.update({f'Description {i+1}':s for i,s in enumerate(descriptions)})
    search.append(row)
csv_file('google-rsa-drafts.csv',search)
keywords=[]
for group,terms in [('AI 대화',['AI 대화','AI 채팅','AI 대화 서비스','아지트챗']),('캐릭터 대화',['AI 캐릭터 채팅','캐릭터 AI 대화','가상 캐릭터 대화','AI 친구 대화'])]:
    for term in terms:
        keywords.append({'Campaign':CAMPAIGN,'Ad group':group,'Keyword':term,'Match type':'Exact','Status':'Paused'})
csv_file('google-keywords.csv',keywords)
csv_file('negative-keywords.csv',[{'Keyword':k,'Match type':'Phrase','Scope':'Campaign'} for k in ['실제 만남','조건만남','성매매','미성년','19금','야한','누드','노출','무료 무제한','채용','알바','오픈소스','API','코딩']])

creative_data=[
 ('meta_conversation','편안한 대화 한 번','오늘의 이야기를\nAI와 나눠보세요', '오늘의 작은 이야기부터 가볍게. 가상의 AI 캐릭터와 대화하고, 무료 체험 후 하트로 이어가세요. 실제 사람 연결 서비스가 아닙니다.'),
 ('meta_character','각자의 성격, 다른 대화','내 취향의 AI\n캐릭터를 만나세요', '차분한 말투부터 유쾌한 이야기까지. 서로 다른 성격의 AI 캐릭터를 만나보세요. 대화 상대는 가상의 AI이며, 체험 후 하트가 사용됩니다.'),
 ('meta_continue','이야기를 이어가는 공간','나누던 이야기를\n다시 이어가세요', '휴대폰 번호를 연결하면 계정에 보관된 대화를 이어갈 수 있어요. AI 캐릭터와 나누는 1:1 대화, 아지트챗에서 시작하세요. 무료 체험 후 하트를 사용합니다.')]
csv_file('meta-copy-drafts.csv',[{'Campaign':CAMPAIGN,'Status':'DRAFT_LOCAL_ONLY','Objective':'Sales','Conversion':'Purchase','Creative':key,'Headline':title,'Primary text':body,'CTA':'자세히 알아보기','Facebook URL':url('facebook',key),'Instagram URL':url('instagram',key)} for key,title,hero,body in creative_data])
csv_file('campaign-links.csv',[{'Platform':source,'Creative':content,'URL':url(source,content)} for source,contents in [('google',['search_ai','search_character']),('facebook',[c[0] for c in creative_data]),('instagram',[c[0] for c in creative_data])] for content in contents])

FONT='/System/Library/Fonts/AppleSDGothicNeo.ttc'
def font(size):return ImageFont.truetype(FONT,size,index=0)
for key,title,hero,body in creative_data:
    for w,h in [(1080,1080),(1080,1920)]:
        image=Image.new('RGB',(w,h),'#f6f3eb');d=ImageDraw.Draw(image)
        y=88 if h==1080 else 260
        d.text((80,y),'AZITCHAT  /  아지트챗',font=font(30),fill='#275342')
        d.text((80,y+75),hero,font=font(68),fill='#173b30',spacing=14)
        card_y=y+290
        d.rounded_rectangle((80,card_y,1000,card_y+280),radius=32,fill='white')
        d.text((120,card_y+28),'AI 캐릭터 대화 예시 · 실제 이용 후기 아님',font=font(25),fill='#66776c')
        d.rounded_rectangle((120,card_y+85,670,card_y+155),radius=22,fill='#e5eee6')
        d.text((145,card_y+103),'오늘은 산책하기 좋은 날이네요',font=font(31),fill='#1f4b3b')
        d.rounded_rectangle((330,card_y+178,960,card_y+248),radius=22,fill='#f5ebd4')
        d.text((355,card_y+196),'그러게요, 저도 잠깐 걷고 싶어요',font=font(31),fill='#594b30')
        d.rounded_rectangle((80,card_y+320,1000,card_y+414),radius=24,fill='#275342')
        cta='AI 대화 시작하기';box=d.textbbox((0,0),cta,font=font(38))
        d.text(((w-(box[2]-box[0]))/2,card_y+346),cta,font=font(38),fill='white')
        d.text((80,card_y+450),'가상의 AI 캐릭터 · 실제 사람 연결 아님',font=font(28),fill='#4c5d52')
        d.text((80,card_y+495),'만 18세 이상 · 무료 체험 후 하트 사용',font=font(27),fill='#4c5d52')
        d.text((80,h-100),'azitchat.com',font=font(28),fill='#275342')
        image.save(OUT/f'{key}-{w}x{h}.png')

plan={
 'status':'LOCAL_DRAFT_NOT_PUBLISHED','as_of_kst':'2026-10-20','goal':'verified_paid_purchase',
 'requested_audience':{'country':'KR','gender':'male','min_age':40,'max_age':70},
 'budget':{'instruction':'lowest platform-accepted daily budget','amount':None,'currency':'KRW','reason':'Account and campaign-specific minimum must be checked in UI; no spend authorized or started.'},
 'meta':{'objective':'Sales','event':'Purchase','campaigns':1,'ad_sets':1,'ads':3,'account_confirmed':False,'pixel_id':None,'age_upper_bound':'Confirm UI; 65+ may include users over 70. Do not silently expand.','audience_expansion':'Do not use suggested-only gender/age for a strict audience requirement.'},
 'google':{'type':'Search','goal':'Purchase','campaigns':1,'ad_groups':2,'account_confirmed':False,'conversion_action':None,'networks':['Google Search'],'search_partners':False,'display':False,'age_limitation':'35–44 includes 35–39; 65+ includes 71+. No exact 40–70 targeting. Hold audience configuration pending choice; do not silently substitute.','unknown_demographics':'exclude for strict male/age requirement','bidding':'Maximize conversions only after verified purchase tracking; no invented target CPA.'},
 'production_payment_check':{'path':'/api/payment/config','enabled':False,'mode':'test','methods':[]},
 'launch_gates':['Complete new ad account onboarding and terms/billing','Production payment enabled and approved','Verified purchase/duplicate/refund tests','Ads privacy consent and Google/Meta attribution validated','Dating/companionship policy classification and certification/permission as applicable','Age-boundary decision','Minimum budget verified in selected account','Explicit activation instruction']}
(OUT/'campaign-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')

sections='''
<p class="status">ローカル下書き · 미게시 · 지출 0원</p>
<h1>아지트챗 광고 집행 준비</h1><p class="lead">구매 전환 · 한국 남성 40~70세 · 각 플랫폼 최소 일예산</p>
<p>갱신일: 2026년 10월 20일(KST), 준비 시작 10월 19일. 광고 계정에는 아직 캠페인을 저장하거나 게시하지 않았습니다. 아래 파일은 검토·입력용 초안입니다.</p>
<h2>현재 집행을 막는 항목</h2>
<ol><li><b>운영 결제 비활성:</b> 공개 API /api/payment/config에서 enabled=false, mode=test, methods=[]를 확인했습니다. 구매 최적화 캠페인은 결제 개통 전 집행하지 않습니다.</li>
<li><b>구매 전환 미연결:</b> GA4는 존재하지만 purchase 이벤트, Google Ads 구매 전환 액션, Meta Pixel/CAPI 연결은 확인되지 않았습니다. 가입·충전 화면 클릭을 구매로 대체하지 않습니다.</li>
<li><b>새 광고 계정 생성 확인:</b> Google 아지트챗 486-641-2529의 가입 제출이 완료됐습니다. 한국·KRW·한국 시간대이며 기존 8691 카드가 연결되었습니다. 이전 거부 문구는 새로고침 후 사라졌습니다. 광고 태그 AW-18522897509는 발급됐지만 사이트에 설치하지 않았습니다. Meta는 Maybeworks의 아지트챗 | AzitChat 1605877847474052 생성이 확인됐고 결제 수단은 아직 연결되지 않았습니다. <a href="account-status.json">최신 계정 상태</a>. 어느 플랫폼에도 캠페인을 게시하지 않았으며, 신규 광고주 프로모션 재수령을 전제로 예산을 잡지 않습니다.</li>
<li><b>연령 범위:</b> Google의 35–44 / 45–54 / 55–64 / 65+ 구간으로는 40~70세를 정확히 지정할 수 없습니다. 45–64세로 좁힐지, 35–44·65+까지 포함할지 결정이 필요합니다. Meta도 최대 연령 UI가 65+라면 70세 상한을 보장할 수 없습니다. 요청 범위를 임의 확대하지 않습니다.</li>
<li><b>서비스 심사:</b> 가상 연애·성인 대화 설정이 실제 소스에 있습니다. 일반 대화 광고만으로 전체 서비스를 일반 카테고리로 확정하지 않습니다. Google 동반자/데이트 분류와 인증 필요 여부, Meta 분류·허용 여부를 계정에서 확인해야 합니다. 광고·서비스 내부 모두 AI 고지가 필요합니다.</li></ol>
<h2>최소 비용 운영안</h2><p>Meta 판매 캠페인 1개·광고 세트 1개·소재 3종, Google 검색 캠페인 1개·광고 그룹 2개로 구성했습니다. 키워드는 일치검색부터 사용하고 검색 파트너·디스플레이 확장은 제외합니다. 구매 목표를 유지하며 리타기팅·고객 목록 업로드는 초기안에 포함하지 않습니다.</p>
<p>최저 일예산은 선택한 계정의 통화·최적화·입찰·캠페인 설정에 따라 UI에서 검증해야 합니다. 임의의 금액을 플랫폼 최저라고 표기하지 않았습니다. 금액 확정 전 예산은 비워두었습니다. 최소 예산에서는 구매가 드물어 학습이 느리고 성과 보장이 어렵습니다. Google 평균 일예산은 하루의 엄격한 지출 상한이 아니므로 소액 집행에도 월 한도와 실제 청구를 확인합니다.</p>
<h2>구매 이벤트 구현·검증 명세</h2>
<p><b>성공 조건:</b> 운영 모드 주문에서 PG 서버 조회 검증이 성공하고, paid 상태와 유료 하트 지급이 같은 DB 트랜잭션으로 확정된 시점. SDK 성공 콜백, 번호 인증, 결제창 열기, pending, 테스트 주문은 구매가 아닙니다.</p>
<p><b>필드:</b> GA4 purchase(transaction_id=개인정보 없는 주문 식별자, value=실제 결제 KRW 금액, currency=KRW, items=상품 ID·상품명·가격·수량). Meta Purchase(value, currency)와 event_id를 동일 주문에 안정적으로 매핑합니다. 전화번호·이름·대화·성인인증 정보는 보내지 않습니다. Google 거래 중복 방지와 Meta 브라우저/CAPI event_id 중복 제거를 각각 검증합니다.</p>
<p><b>안정성:</b> 결제 DB 커밋과 함께 전환 outbox를 만들고 웹훅·재조회·새로고침·여러 탭·워커 재시도에도 주문당 한 번만 전달합니다. 결제와 광고 전송을 분리해 광고 장애가 결제 지급을 막지 않게 합니다. 브라우저만으로 결제 콜백을 추적하면 리디렉션·브라우저 종료 구매를 놓칠 수 있습니다. 환불은 PG 검증 후 GA4 refund 및 Google 구매 전환 조정 경로를 따로 구현합니다. Meta 조정은 지원되는 방식부터 확인합니다.</p>
<p><b>동의:</b> 현행 코드는 분석 동의만 받고 광고 저장·광고 사용자 데이터·개인화는 거부합니다. 이를 광고 동의로 간주하지 않습니다. 광고용 동의 UI·고지·철회와 Google/Meta 수집 제한을 먼저 설계하고, 동의 없는 Pixel/CAPI·향상된 전환을 켜지 않습니다. 보관·해외 처리·제3자 제공 범위는 실제 계약과 법적 검토로 확정합니다.</p>
<p><b>인수 검증:</b> 승인된 PG 테스트 환경에서 성공·실패·취소·부분 환불·중복 웹훅·지연 결제·새로고침·동의 거부·동의 철회·DNT·테스터 제외를 확인합니다. 광고 플랫폼 테스트 도구에서 KRW 금액과 중복 제거를 검증하고 운영 구매와 테스트를 분리합니다. 실거래 확인이 필요하면 운영자가 승인한 소액으로 별도 진행합니다.</p>
<h2>이번에 보완한 분석</h2><p>홈 화면의 analytics.js에 고정 캠페인 토큰 허용 목록을 추가했습니다. 동의한 일반 방문자만 승인된 source/medium/campaign/content를 GA4 페이지 URL에 보냅니다. 전화번호·대화·임의 UTM·검색어·gclid·fbclid는 제외합니다. 동의 거부·DNT·관리자·테스터 제외를 유지합니다. 이 변경은 로컬 검증까지 완료했고 운영 배포 전입니다.</p>
<p>UTM은 채널별 방문 분석용이며 Google 클릭 식별자를 보관하는 구매 귀속 구현을 대신하지 않습니다. 아직 광고 구매 귀속이나 ROAS 측정이 가능하다는 뜻은 아닙니다. 새 캠페인 토큰은 코드 허용 목록과 함께 갱신해야 합니다.</p>
<h2>문구와 소재</h2><p>실제 사람·실제 만남·무제한 무료·성적 서비스·효능 보장을 암시하지 않습니다. ‘외로우신 중년 남성’처럼 개인 특성을 단정하지 않습니다. 이미지 속 대화는 제작한 예시이며 고객 대화나 이용 후기가 아닙니다. 광고에 상품 가격을 추가할 때는 운영 결제와 상품 구성을 먼저 확인합니다.</p>
'''.replace('ローカル下書き','로컬 초안')
cards=''
for key,title,hero,body in creative_data:
    cards+=f'<article><img src="{key}-1080x1080.png" alt="{html.escape(title)} 광고 소재 초안"><h3>{html.escape(title)}</h3><p>{html.escape(body)}</p><p><a href="{key}-1080x1080.png">정사각형 PNG</a> · <a href="{key}-1080x1920.png">스토리 PNG</a></p></article>'
files=['campaign-plan.json','google-rsa-drafts.csv','google-keywords.csv','negative-keywords.csv','meta-copy-drafts.csv','campaign-links.csv']
links='<h2>입력용 파일</h2><p>CSV는 입력용 초안이며 계정·예산·연령·전환 설정을 포함하는 완전한 일괄 업로드 패키지가 아닙니다. Google RSA는 헤드라인 1에 AI 문구를 고정하도록 초안을 작성했고, 한글의 2칸 계산으로 제목 30·설명 90 제한을 검사했습니다.</p><ul>'+''.join(f'<li><a href="{f}">{f}</a></li>' for f in files)+'</ul>'
sources='''<h2>공식 확인 자료</h2><ul>
<li><a href="https://support.google.com/adspolicy/answer/15328393">Google 데이트·동반자 정책과 인증</a></li>
<li><a href="https://support.google.com/google-ads/answer/2580383">Google 인구통계 타기팅</a></li>
<li><a href="https://support.google.com/google-ads/answer/6385083">Google 평균 일예산</a></li>
<li><a href="https://support.google.com/google-ads/answer/7684791">Google 검색 광고 자산 제한</a></li>
<li><a href="https://support.google.com/analytics/answer/11242870">Google 수동 캠페인 구분</a></li>
<li><a href="https://transparency.meta.com/policies/ad-standards/">Meta 광고 정책</a> — 공식 세부 정책 페이지는 이번 도구에서 읽지 못했습니다. 분류·예산·연령 제한은 선택 계정 UI에서 추가 확인해야 합니다.</li></ul>'''
(OUT/'review.html').write_text('<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>아지트챗 광고 준비안</title><style>body{font:17px/1.8 system-ui,sans-serif;color:#233e32;background:#f6f3eb;margin:0}main{max-width:1050px;margin:auto;padding:48px 24px}h1{font-size:40px;line-height:1.3}h2{margin-top:48px}a{color:#275e48}li{margin-bottom:14px}.lead{font-size:23px}.status{display:inline-block;padding:5px 16px;border-radius:30px;background:#e7ddc3}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}article{background:white;padding:18px;border-radius:20px}img{width:100%;border-radius:12px}</style><main>'+sections+'<div class="grid">'+cards+'</div>'+links+sources+'</main></html>',encoding='utf-8')
print('Built review.html, 6 CSV/JSON files and 6 PNG drafts; search ad width validation passed.')
