// ============================================================================
//  music.js — 背景音乐曲目清单（真实 mp3 文件）
//
//  全部来自 Kevin MacLeod（incompetech.com），授权 Creative Commons BY 4.0
//  （免费、可商用，注明出处即可）。统一为轻松明亮的休闲曲风（Wallpaper 同系）。
//  游戏与试听页共用此清单。
// ============================================================================

const MUSIC_TRACKS = [
    { id: 'wallpaper', file: 'assets/audio/wallpaper.mp3', name: '壁纸 Wallpaper', nameEn: 'Wallpaper', desc: '轻盈明亮，舒缓放松（推荐）', descEn: 'Light and bright, relaxing' },
    { id: 'easylemon', file: 'assets/audio/easylemon.mp3', name: '轻松柠檬', nameEn: 'Easy Lemon', desc: '悠闲明快，清新', descEn: 'Easygoing and breezy' },
    { id: 'elevator', file: 'assets/audio/elevator.mp3', name: '当地天气·电梯版', nameEn: 'Local Forecast - Elevator', desc: '轻松愉悦，俏皮', descEn: 'Light and cheery, playful' },
    { id: 'thinking', file: 'assets/audio/thinking.mp3', name: '思考时光', nameEn: 'Thinking Music', desc: '轻快灵动，俏皮', descEn: 'Light, bouncy, playful' },
    { id: 'carefree', file: 'assets/audio/carefree.mp3', name: '无忧 Carefree', nameEn: 'Carefree', desc: '悠闲尤克里里，惬意', descEn: 'Breezy ukulele, cozy' },
    { id: 'brightly', file: 'assets/audio/brightly.mp3', name: '明亮花俏', nameEn: 'Brightly Fancy', desc: '明媚轻盈，温暖', descEn: 'Bright and warm' },
    { id: 'porridge', file: 'assets/audio/porridge.mp3', name: '惬意粥时光', nameEn: 'Pleasant Porridge', desc: '舒服轻松，可爱', descEn: 'Pleasant and cute' },
    { id: 'sardana', file: 'assets/audio/sardana.mp3', name: '萨达纳', nameEn: 'Sardana', desc: '明朗轻快，悠扬', descEn: 'Bright and melodic' },
    { id: 'osaka', file: 'assets/audio/osaka.mp3', name: '前往大阪', nameEn: 'Off to Osaka', desc: '轻巧灵动，俏皮', descEn: 'Light, lively, playful' },
    { id: 'cattails', file: 'assets/audio/cattails.mp3', name: '香蒲', nameEn: 'Cattails', desc: '轻松明亮，愉快', descEn: 'Light, bright, happy' },
    { id: 'beachfront', file: 'assets/audio/beachfront.mp3', name: '海滨庆典', nameEn: 'Beachfront Celebration', desc: '阳光欢快，轻松', descEn: 'Sunny and upbeat' }
];

if (typeof window !== 'undefined') window.MUSIC_TRACKS = MUSIC_TRACKS;
