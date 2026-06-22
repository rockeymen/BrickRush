// ============================================================================
//  music.js — 背景音乐曲目清单（真实 mp3 文件）
//
//  当前只保留正式游戏使用的默认背景音乐。
//  分裂时刻音乐由 AudioManager 直接加载。
// ============================================================================

const MUSIC_TRACKS = [
    { id: 'wallpaper', file: 'assets/audio/wallpaper.mp3', name: '壁纸 Wallpaper', nameEn: 'Wallpaper', desc: '默认背景音乐', descEn: 'Default background music' }
];

if (typeof window !== 'undefined') window.MUSIC_TRACKS = MUSIC_TRACKS;
