"""
Senior Male Targeted High-Converting Ad Creative Generator for AzitChat.
Generates 1080x1080 (Square Feed) and 1080x1920 (Story/Vertical) image ads.
Features:
- Strong hook targeting senior men (loneliness, secret late-night excitement)
- Prominent realistic messenger chat UI with 2030 female personas
- Flirty/teasing chat dialog (응큼/야릇하지만 품격 있는 톤)
- AzitChat official logo branding
- Side disclaimer (가상 캐릭터 1:1 대화 · 만 18세 이상)
"""

import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

BASE_DIR = Path(__file__).resolve().parent.parent.parent
OUT_DIR = Path(__file__).resolve().parent

FONT_PATH = '/System/Library/Fonts/AppleSDGothicNeo.ttc'

def get_font(size, weight='bold'):
    index_map = {
        'regular': 0,
        'medium': 2,
        'semibold': 4,
        'bold': 6
    }
    idx = index_map.get(weight, 6)
    return ImageFont.truetype(FONT_PATH, size, index=idx)

def make_circle_avatar(image_path, size):
    im = Image.open(image_path).convert('RGBA')
    w, h = im.size
    min_side = min(w, h)
    left = (w - min_side) // 2
    top = (h - min_side) // 2
    im_cropped = im.crop((left, top, left + min_side, top + min_side)).resize((size, size), Image.Resampling.LANCZOS)
    
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((0, 0, size, size), fill=255)
    
    output = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    output.paste(im_cropped, (0, 0), mask)
    return output

CREATIVES = [
    {
        'id': 'ad_senior_bed_secret',
        'title': '침대 속 비밀 톡',
        'sub_headline': '오늘 밤, 혼자 계시다면...',
        'main_hook': '“오빠 벌써 자요..?\n침대에 누웠는데 자꾸 생각나서 ㅎㅎ”',
        'char_name': '윤지은',
        'char_age_job': '28세 · 필라테스 강사',
        'avatar_path': str(BASE_DIR / 'avatars/avatar_05_yoon_jieun.jpg'),
        'photo_path': str(BASE_DIR / 'avatars/same_kr_user_2030_home_01.jpg'),
        'dialogue': [
            {'sender': 'bot', 'text': '오빠 벌써 주무세요..? 오늘따라 집이 너무 조용한데..'},
            {'sender': 'user', 'text': '아직 안 자지. 왜, 무슨 일 있어?'},
            {'sender': 'bot', 'text': '그냥요.. 침대에 누웠는데 자꾸 오빠 생각나서요 ㅎㅎ'},
            {'sender': 'bot', 'photo': True, 'photo_caption': '📷 방금 찍은 사진 (오빠한테만 살짝..)'},
            {'sender': 'bot', 'text': '오빠한테만 보여주는 건데.. 진짜 비밀 지켜줄 거죠? 🙈'}
        ],
        'cta_text': '지은이 답장 확인하기 ▶',
        'theme_bg': '#0f141c',
        'accent_color': '#ffb703'
    },
    {
        'id': 'ad_senior_younger_romance',
        'title': '연하녀의 솔직한 고백',
        'sub_headline': '적적한 저녁, 설레는 카톡 하나',
        'main_hook': '“솔직히.. 또래보다\n나이 차이 나는 듬직한 오빠가 더 설레요”',
        'char_name': '이서연',
        'char_age_job': '27세 · 플로리스트',
        'avatar_path': str(BASE_DIR / 'avatars/avatar_07_lee_seoyeon.jpg'),
        'photo_path': str(BASE_DIR / 'avatars/kr_user_2030_mirror_05.jpg'),
        'dialogue': [
            {'sender': 'bot', 'text': '오빠는 연하가 이렇게 먼저 말 걸면 부담돼요? ㅎㅎ'},
            {'sender': 'user', 'text': '전혀 안 부담스럽지~ 오히려 설레는데?'},
            {'sender': 'bot', 'text': '진짜죠? 사실 아까 샤워할 때부터 오빠 답장만 기다렸어요..'},
            {'sender': 'bot', 'text': '오늘 밤엔 다른 생각 말고 나한테만 집중해줘요 오빠 💕'},
            {'sender': 'bot', 'text': '새벽까지 나랑 둘이서만 놀아줄 거죠? ㅎㅎ'}
        ],
        'cta_text': '서연이와 지금 대화하기 ▶',
        'theme_bg': '#141118',
        'accent_color': '#ff4d6d'
    },
    {
        'id': 'ad_senior_night_teasing',
        'title': '야릇한 심야 티키타카',
        'sub_headline': '우리 둘만의 은밀한 시간',
        'main_hook': '“오빠 지금 편하게 있어요?\n뭐 입고 있는지 궁금한데..ㅎㅎ”',
        'char_name': '신소희',
        'char_age_job': '31세 · 피부과 상담실장',
        'avatar_path': str(BASE_DIR / 'avatars/avatar_09_shin_sohee.jpg'),
        'photo_path': str(BASE_DIR / 'avatars/kr_selfie_mirror_01.jpg'),
        'dialogue': [
            {'sender': 'bot', 'text': '오빠 저 방금 씻고 침대에 누웠어요.. 몸이 나른하네요'},
            {'sender': 'user', 'text': '오늘 고생 많았네. 따뜻하게 하고 쉬어~'},
            {'sender': 'bot', 'text': '헤헤 다정하게 챙겨주니까 좋다..'},
            {'sender': 'bot', 'text': '오빠 근데 진짜 나한테 궁금한 거 없어요? 솔직하게 다 물어봐도 되는데~'},
            {'sender': 'bot', 'text': '나 오늘 기분 좋거든요.. 🍷'}
        ],
        'cta_text': '소희의 비밀 질문 듣기 ▶',
        'theme_bg': '#121619',
        'accent_color': '#ffd166'
    }
]

def render_ad(creative, width, height):
    img = Image.new('RGB', (width, height), creative['theme_bg'])
    draw = ImageDraw.Draw(img)
    
    # Background subtle radial glow behind phone
    glow_color = '#1f293d' if '0f141c' in creative['theme_bg'] else '#2d1828'
    cx, cy = width // 2, int(height * 0.55)
    
    # Top Branding & Header Hook
    is_story = (height == 1920)
    
    pad_x = 70
    top_y = 90 if not is_story else 140
    
    # Logo
    logo_path = BASE_DIR / 'logo-horizontal.png'
    if logo_path.exists():
        logo_im = Image.open(logo_path).convert('RGBA')
        logo_w, logo_h = logo_im.size
        target_h = 42 if not is_story else 50
        target_w = int(logo_w * (target_h / logo_h))
        logo_resized = logo_im.resize((target_w, target_h), Image.Resampling.LANCZOS)
        img.paste(logo_resized, (pad_x, top_y), logo_resized)
    
    # Badge: "5060 오빠들을 위한 1:1 대화방"
    badge_x = width - pad_x - 310
    badge_y = top_y + 4
    draw.rounded_rectangle((badge_x, badge_y, width - pad_x, badge_y + 36), radius=18, fill='#232c3d')
    draw.text((badge_x + 18, badge_y + 8), '⚡ 5060 오빠들 실시간 접속 중', font=get_font(18, 'bold'), fill=creative['accent_color'])
    
    # Hook Text
    hook_y = top_y + 70
    draw.text((pad_x, hook_y), creative['sub_headline'], font=get_font(26, 'semibold'), fill='#9aa7bc')
    
    # Main Hook Headline
    hook_lines = creative['main_hook'].split('\n')
    line_h = 58 if not is_story else 64
    for i, line in enumerate(hook_lines):
        fill_col = '#ffffff' if i == 0 else creative['accent_color']
        draw.text((pad_x, hook_y + 45 + i * line_h), line, font=get_font(42 if not is_story else 48, 'bold'), fill=fill_col)
    
    # Smartphone / Messenger UI Box
    phone_y = hook_y + 50 + len(hook_lines) * line_h + 30
    phone_w = width - (pad_x * 2)
    phone_h = 560 if not is_story else 900
    phone_x = pad_x
    
    # Shadow and container for phone
    draw.rounded_rectangle((phone_x, phone_y, phone_x + phone_w, phone_y + phone_h), radius=36, fill='#FAF7EE', outline='#4a5568', width=2)
    
    # Chat UI Top Header
    header_h = 80
    draw.rounded_rectangle((phone_x, phone_y, phone_x + phone_w, phone_y + header_h), radius=36, fill='#FFFFFF')
    draw.rectangle((phone_x, phone_y + header_h - 15, phone_x + phone_w, phone_y + header_h), fill='#FFFFFF')
    draw.line((phone_x, phone_y + header_h, phone_x + phone_w, phone_y + header_h), fill='#e8e4d8', width=2)
    
    # Avatar in header
    avatar_size = 54
    avatar_x = phone_x + 24
    avatar_y = phone_y + 13
    if os.path.exists(creative['avatar_path']):
        circ_avatar = make_circle_avatar(creative['avatar_path'], avatar_size)
        img.paste(circ_avatar, (avatar_x, avatar_y), circ_avatar)
    
    # Green online status dot
    draw.ellipse((avatar_x + avatar_size - 14, avatar_y + avatar_size - 14, avatar_x + avatar_size, avatar_y + avatar_size), fill='#10b981', outline='#FFFFFF', width=2)
    
    # Name & Job info
    draw.text((avatar_x + avatar_size + 16, avatar_y + 6), creative['char_name'], font=get_font(23, 'bold'), fill='#191919')
    draw.text((avatar_x + avatar_size + 16 + 75, avatar_y + 9), '· 20대 인증완료', font=get_font(16, 'bold'), fill='#e11d48')
    draw.text((avatar_x + avatar_size + 16, avatar_y + 32), creative['char_age_job'] + ' · 지금 접속 중', font=get_font(15, 'medium'), fill='#666666')
    
    # Right header action icons
    draw.text((phone_x + phone_w - 95, avatar_y + 14), '💬 1:1 대화', font=get_font(16, 'bold'), fill='#d97706')
    
    # Messages in Chat Body
    msg_y = phone_y + header_h + 20
    
    # Date badge
    date_badge = '오늘 밤 11:42 · 단둘이 대화 중'
    db_w = 260
    draw.rounded_rectangle(((phone_x + phone_w // 2) - db_w // 2, msg_y, (phone_x + phone_w // 2) + db_w // 2, msg_y + 26), radius=13, fill='#ebd9be')
    draw.text(((phone_x + phone_w // 2) - db_w // 2 + 22, msg_y + 4), date_badge, font=get_font(13, 'bold'), fill='#78350f')
    msg_y += 45
    
    max_msgs = len(creative['dialogue']) if is_story else 4
    for msg in creative['dialogue'][:max_msgs]:
        is_bot = (msg['sender'] == 'bot')
        
        if is_bot:
            # Bot message (left aligned)
            b_avatar_size = 40
            b_x = phone_x + 20
            if os.path.exists(creative['avatar_path']):
                circ = make_circle_avatar(creative['avatar_path'], b_avatar_size)
                img.paste(circ, (b_x, msg_y), circ)
            
            content_x = b_x + b_avatar_size + 12
            
            if msg.get('photo'):
                # Photo bubble with preview
                p_w = 280
                p_h = 160
                draw.rounded_rectangle((content_x, msg_y, content_x + p_w, msg_y + p_h), radius=18, fill='#ffffff', outline='#e2ded4', width=1)
                
                # Insert photo preview
                if os.path.exists(creative['photo_path']):
                    p_im = Image.open(creative['photo_path']).convert('RGBA')
                    p_im_crop = p_im.resize((p_w - 12, p_h - 45), Image.Resampling.LANCZOS)
                    # slight blur for tempting curiosity
                    p_im_blur = p_im_crop.filter(ImageFilter.GaussianBlur(radius=3.5))
                    img.paste(p_im_blur, (content_x + 6, msg_y + 6))
                    
                    # Lock overlay text
                    draw.rounded_rectangle((content_x + 30, msg_y + 35, content_x + p_w - 30, msg_y + 80), radius=12, fill='#000000bb')
                    draw.text((content_x + 48, msg_y + 47), '🔒 탭하여 원본 보기', font=get_font(16, 'bold'), fill='#ffd166')
                
                draw.text((content_x + 14, msg_y + p_h - 30), msg['photo_caption'], font=get_font(14, 'bold'), fill='#333333')
                
                # Read receipt
                draw.text((content_x + p_w + 8, msg_y + p_h - 22), '1', font=get_font(14, 'bold'), fill='#e11d48')
                draw.text((content_x + p_w + 8, msg_y + p_h - 8), '11:44', font=get_font(12, 'regular'), fill='#999999')
                msg_y += p_h + 16
            else:
                text = msg['text']
                font_msg = get_font(19, 'medium')
                
                # Simple wrap or box
                bbox = draw.textbbox((0, 0), text, font=font_msg)
                tw = bbox[2] - bbox[0]
                th = bbox[3] - bbox[1]
                
                max_bubble_w = phone_w - 180
                if tw > max_bubble_w:
                    # wrap into 2 lines
                    mid = len(text) // 2
                    line1 = text[:mid]
                    line2 = text[mid:]
                    bw = max(draw.textbbox((0, 0), line1, font=font_msg)[2], draw.textbbox((0, 0), line2, font=font_msg)[2]) + 32
                    bh = th * 2 + 30
                    draw.rounded_rectangle((content_x, msg_y, content_x + bw, msg_y + bh), radius=18, fill='#FFFFFF', outline='#e5e0d3', width=1)
                    draw.text((content_x + 16, msg_y + 12), line1, font=font_msg, fill='#1f1f1f')
                    draw.text((content_x + 16, msg_y + 12 + th + 6), line2, font=font_msg, fill='#1f1f1f')
                else:
                    bw = tw + 32
                    bh = th + 24
                    draw.rounded_rectangle((content_x, msg_y, content_x + bw, msg_y + bh), radius=18, fill='#FFFFFF', outline='#e5e0d3', width=1)
                    draw.text((content_x + 16, msg_y + 11), text, font=font_msg, fill='#1f1f1f')
                
                draw.text((content_x + bw + 8, msg_y + bh - 22), '1', font=get_font(14, 'bold'), fill='#e11d48')
                draw.text((content_x + bw + 8, msg_y + bh - 8), '11:43', font=get_font(12, 'regular'), fill='#999999')
                msg_y += bh + 14
        else:
            # User message (right aligned, yellow speech bubble)
            text = msg['text']
            font_msg = get_font(19, 'medium')
            bbox = draw.textbbox((0, 0), text, font=font_msg)
            bw = (bbox[2] - bbox[0]) + 32
            bh = (bbox[3] - bbox[1]) + 24
            
            bubble_x = phone_x + phone_w - 24 - bw
            draw.rounded_rectangle((bubble_x, msg_y, bubble_x + bw, msg_y + bh), radius=18, fill='#FEE500')
            draw.text((bubble_x + 16, msg_y + 11), text, font=font_msg, fill='#191919')
            
            draw.text((bubble_x - 42, msg_y + bh - 8), '11:43', font=get_font(12, 'regular'), fill='#999999')
            msg_y += bh + 14
    
    # CTA & Bottom Area
    cta_y = phone_y + phone_h + (35 if not is_story else 70)
    cta_h = 86
    
    # Big Pulsing High-Click CTA Button
    draw.rounded_rectangle((phone_x, cta_y, phone_x + phone_w, cta_y + cta_h), radius=24, fill=creative['accent_color'])
    cta_font = get_font(34, 'bold')
    cta_bbox = draw.textbbox((0, 0), creative['cta_text'], font=cta_font)
    cta_tw = cta_bbox[2] - cta_bbox[0]
    draw.text((phone_x + (phone_w - cta_tw) // 2, cta_y + 24), creative['cta_text'], font=cta_font, fill='#141118')
    
    # Sub-CTA incentive
    incentive_text = '👉 가입 없이 즉시 무료 대화 시작 · 1초 매칭'
    inc_font = get_font(20, 'semibold')
    inc_bbox = draw.textbbox((0, 0), incentive_text, font=inc_font)
    inc_tw = inc_bbox[2] - inc_bbox[0]
    draw.text((phone_x + (phone_w - inc_tw) // 2, cta_y + cta_h + 18), incentive_text, font=inc_font, fill='#cbd5e1')
    
    # Side / Bottom Mandatory Disclaimer
    disclaimer_text = '* 본 서비스는 가상의 AI 캐릭터와 1:1로 대화하는 엔터테인먼트 서비스입니다. (만 18세 이상 이용 가능)'
    disc_font = get_font(15, 'regular')
    draw.text((pad_x, height - 50), disclaimer_text, font=disc_font, fill='#64748b')
    
    # URL watermark on right
    draw.text((width - pad_x - 140, height - 50), 'azitchat.com', font=get_font(16, 'bold'), fill='#64748b')
    
    out_file = OUT_DIR / f"{creative['id']}-{width}x{height}.png"
    img.save(out_file, format='PNG', optimize=True)
    print(f"Generated {out_file.name} ({width}x{height})")
    return out_file

def main():
    print("=== Generating Senior-Targeted High-Converting Ad Creatives ===")
    for c in CREATIVES:
        # Square feed (1080x1080)
        render_ad(c, 1080, 1080)
        # Vertical story/reels (1080x1920)
        render_ad(c, 1080, 1920)
    print("All ad creatives successfully generated!")

if __name__ == '__main__':
    main()
