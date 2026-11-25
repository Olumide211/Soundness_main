# Social-post + chat screen layout specs (points, 390x844 logical, render texture at 3x = 1170x2532). CC0.
import json, os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
post = {
 'screen': {'w': 390, 'h': 844, 'scale': 3, 'cornerRadius': 47, 'bg': '#0B0B0F', 'safeTop': 54, 'safeBottom': 34},
 'statusBar': {'y': 18, 'time': '9:41', 'font': 'Inter 600 15', 'color': '#FFFFFF'},
 'topBar': {'y': 62, 'h': 44, 'left': {'text': 'cancel', 'font': 'Inter 400 16', 'color': '#FFFFFF', 'x': 16},
            'right': {'type': 'pill', 'text': 'post', 'x': 302, 'w': 72, 'h': 34, 'r': 17, 'bg': '#FFFFFF', 'fg': '#0B0B0F', 'font': 'Inter 600 15',
                      'disabledOpacity': 0.45, 'pressFrame': 792}},
 'composer': {'avatar': {'x': 16, 'y': 122, 'size': 40, 'src': 'svg/avatar_breezeog.svg'},
              'name': {'text': 'BreezeOg', 'x': 68, 'y': 128, 'font': 'Inter 700 15', 'color': '#FFFFFF'},
              'handle': {'text': '@BreezeOg1', 'x': 148, 'y': 128, 'font': 'Inter 400 15', 'color': '#8A8F98'},
              'input': {'x': 68, 'y': 154, 'font': 'Inter 400 20', 'color': '#FFFFFF', 'placeholder': "what's happening?", 'placeholderColor': '#5A5F68',
                        'typed': 'hello world', 'caret': {'w': 2, 'h': 24, 'color': '#7C5CFF', 'blinkPeriodFrames': 16}}},
 'keyboard': {'y': 548, 'h': 296, 'bg': '#16161B', 'keyBg': '#2A2A31', 'keyR': 6, 'rows': ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
              'keyW': 33, 'keyH': 42, 'gapX': 6, 'gapY': 12, 'font': 'Inter 400 22', 'pressedKeyHighlight': '#4A4A55', 'popupOnPress': True,
              'hideAfterFrame': 796, 'hideDurationFrames': 10},
 'publishedPost': {'appearFrame': 798, 'y': 122, 'cardPaddingX': 16, 'name': 'BreezeOg', 'handle': '@BreezeOg1 · now', 'body': 'hello world', 'bodyFont': 'Inter 400 22',
                   'actionsY': 214, 'actions': [{'icon': 'reply', 'from': 0, 'to': 128, 'x': 68}, {'icon': 'repost', 'from': 0, 'to': 342, 'x': 150},
                                                 {'icon': 'like', 'from': 0, 'to': 2400, 'display': '2.4K', 'x': 232, 'activeColor': '#FF4D6D'}, {'icon': 'views', 'from': 0, 'to': 18000, 'display': '18K', 'x': 314}],
                   'countUp': {'startFrame': 804, 'endFrame': 836, 'spring': {'mass': 1, 'stiffness': 120, 'damping': 18}, 'font': 'GeistMono 500 14', 'tabularNums': True},
                   'replyBubbles': {'count': 6, 'spawnFrames': [810, 815, 819, 824, 828, 832], 'size': [26, 44], 'riseMetres': 0.06, 'fade': 18, 'color': '#1C1C22', 'dotColor': '#8A8F98'}},
 'typingSchedule': None,
 'noRealLogos': True,
}
text = 'hello world'; f0 = 735; frames = []
gaps = [5, 4, 4, 5, 4, 8, 5, 4, 4, 5, 4]  # hand-tuned human rhythm, space has a longer gap
t = f0
for ch, g in zip(text, gaps):
    frames.append({'char': ch, 'frame': t}); t += g
post['typingSchedule'] = {'firstFrame': f0, 'keystrokes': frames, 'lastFrame': frames[-1]['frame'], 'thumbTapDownFrames': 2, 'thumb': 'models/hand/generic-hand_right.glb'}
chat = {
 'screen': post['screen'],
 'header': {'y': 62, 'title': 'new chat', 'font': 'Inter 600 16', 'color': '#F4F4F6'},
 'userBubble': {'text': 'hello world', 'align': 'right', 'x2': 374, 'y': 140, 'padX': 14, 'padY': 10, 'r': 18, 'bg': '#1C1C22', 'font': 'Inter 400 17', 'appearFrame': 862},
 'reply': {'text': 'hello. what should we make today?', 'x': 16, 'y': 200, 'maxW': 330, 'font': 'Inter 400 22', 'lineHeight': 30, 'color': '#F4F4F6',
           'tokens': ['hello', '.', ' what', ' should', ' we', ' make', ' today', '?'],
           'tokenFrames': [880, 892, 904, 913, 922, 931, 942, 954], 'tokenFadeFrames': 5, 'tokenBlurPx': [6, 0],
           'cursor': {'w': 9, 'h': 22, 'r': 4.5, 'color': '#7C5CFF', 'glowPx': 14, 'glowOpacity': 0.65, 'hideFrame': 966}},
 'tokenParticles': {'perToken': 24, 'spawnAtTokenFrame': True, 'travelFrames': 22, 'curve': 'quadratic bezier from token centre up-right then into orb', 'colorFrom': '#FFFFFF', 'colorTo': '#7C5CFF', 'size': [1.5, 4]},
 'orb': {'centre': [195, 520], 'radiusStart': 6, 'radiusAtF1020': 120, 'growth': 'radius = 6 + 114*smoothstep(880,1020,f)', 'core': '#FFFFFF', 'halo': '#7C5CFF', 'haloRadiusMul': 3.2},
}
json.dump(post, open(os.path.join(ROOT, 'data', 'social_post_ui.json'), 'w'), indent=1)
json.dump(chat, open(os.path.join(ROOT, 'data', 'chat_ui.json'), 'w'), indent=1)

def mock_post():
    s = post['screen']; c = post['composer']
    keys = ''
    for ri, row in enumerate(post['keyboard']['rows']):
        w = len(row) * 39 - 6; x0 = (390 - w) / 2
        for i, ch in enumerate(row):
            x = x0 + i * 39; y = 560 + ri * 54
            keys += f'<rect x="{x}" y="{y}" width="33" height="42" rx="6" fill="#2A2A31"/><text x="{x+16.5}" y="{y+28}" text-anchor="middle" font-family="Inter" font-size="20" fill="#fff">{ch}</text>'
    return (f'<rect width="390" height="844" rx="47" fill="{s["bg"]}"/><text x="40" y="34" font-family="Inter" font-weight="600" font-size="15" fill="#fff">9:41</text>'
            f'<text x="16" y="90" font-family="Inter" font-size="16" fill="#fff">cancel</text><rect x="302" y="67" width="72" height="34" rx="17" fill="#fff"/>'
            f'<text x="338" y="89" text-anchor="middle" font-family="Inter" font-weight="600" font-size="15" fill="#0B0B0F">post</text>'
            f'<defs><linearGradient id="av" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7C5CFF"/><stop offset=".55" stop-color="#4C8DFF"/><stop offset="1" stop-color="#E0A458"/></linearGradient></defs><circle cx="36" cy="142" r="20" fill="url(#av)"/>'
            f'<text x="68" y="140" font-family="Inter" font-weight="700" font-size="15" fill="#fff">BreezeOg</text><text x="148" y="140" font-family="Inter" font-size="15" fill="#8A8F98">@BreezeOg1</text>'
            f'<text x="68" y="178" font-family="Inter" font-size="20" fill="#fff">hello world</text><rect x="178" y="160" width="2" height="24" fill="#7C5CFF"/>'
            f'<rect y="548" width="390" height="296" fill="#16161B"/>{keys}')
def mock_chat():
    return ('<rect width="390" height="844" rx="47" fill="#0B0B0F"/><text x="195" y="90" text-anchor="middle" font-family="Inter" font-weight="600" font-size="16" fill="#F4F4F6">new chat</text>'
            '<rect x="262" y="130" width="112" height="40" rx="18" fill="#1C1C22"/><text x="318" y="156" text-anchor="middle" font-family="Inter" font-size="17" fill="#F4F4F6">hello world</text>'
            '<text x="16" y="222" font-family="Inter" font-size="22" fill="#F4F4F6">hello. what should we make</text><text x="16" y="252" font-family="Inter" font-size="22" fill="#F4F4F6">today?</text>'
            '<rect x="94" y="234" width="9" height="22" rx="4.5" fill="#7C5CFF"/>'
            '<defs><radialGradient id="o"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff" stop-opacity=".9"/><stop offset=".55" stop-color="#7C5CFF" stop-opacity=".5"/><stop offset="1" stop-color="#7C5CFF" stop-opacity="0"/></radialGradient></defs>'
            '<circle cx="195" cy="520" r="250" fill="url(#o)"/>')
for name, body in [('ui_social_post_mock.svg', mock_post()), ('ui_chat_mock.svg', mock_chat())]:
    open(os.path.join(ROOT, 'svg', name), 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 390 844" width="390" height="844">{body}</svg>\n')
print(post['typingSchedule'])
