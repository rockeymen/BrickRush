// ============================================================================
//  audio.js — 音频管理（mp3 背景音乐 + 程序化音效）
//
//  背景音乐用 HTMLAudioElement 播放本地 mp3（见 music.js / MUSIC_TRACKS），
//  通过 MediaElementSource 接入 musicGain 做统一音量控制。音效全程序化合成。
// ============================================================================

class AudioManager {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.sfxGain = null;
        this.musicGain = null;
        this.limiter = null;

        const saved = this.loadSettings();
        this.sfxEnabled = saved.sfx;
        this.musicEnabled = saved.music;
        this.volume = saved.volume;
        this.musicTrack = (function () { try { return localStorage.getItem('neonBallzMusicTrack') || 'wallpaper'; } catch (e) { return 'wallpaper'; } })();

        // 校验：若保存的曲目已不存在，回退到第一首
        let track = (typeof MUSIC_TRACKS !== 'undefined') ? MUSIC_TRACKS.find(t => t.id === this.musicTrack) : null;
        if (!track && typeof MUSIC_TRACKS !== 'undefined' && MUSIC_TRACKS.length) { track = MUSIC_TRACKS[0]; this.musicTrack = track.id; }
        this.musicEl = new Audio(track ? track.file : '');
        this.musicEl.loop = true;
        this.musicEl.preload = 'auto';
        this.musicSource = null;
        this.feverEl = new Audio('assets/audio/pixel-peeker-polka-faster.mp3');
        this.feverEl.loop = true;
        this.feverEl.preload = 'auto';
        this.splitMusicWasPlaying = false;
        this.musicFadeId = null;
        this.feverFadeId = null;
        this.lastPlayed = {};
    }

    loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('neonBallzAudio') || '{}');
            return {
                sfx: saved.sfx !== false,
                music: saved.music !== false,
                volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.4
            };
        } catch (e) {
            return { sfx: true, music: true, volume: 0.4 };
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('neonBallzAudio', JSON.stringify({ sfx: this.sfxEnabled, music: this.musicEnabled, volume: this.volume }));
        } catch (e) {}
    }

    ensure() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.limiter = this.ctx.createDynamicsCompressor();
        this.limiter.threshold.value = -8; this.limiter.knee.value = 10; this.limiter.ratio.value = 8;
        this.limiter.attack.value = 0.003; this.limiter.release.value = 0.18;
        this.master.gain.value = this.outputGain();
        this.sfxGain.gain.value = this.sfxEnabled ? 0.95 : 0;
        // 注意：背景音乐用 <audio> 元素直接播放，不接入 WebAudio 图。
        // 否则在 file:// 下 createMediaElementSource 会因 CORS 输出静音。
        this.musicEl.volume = this.musicEnabled ? this.musicLevel() : 0;
        this.sfxGain.connect(this.master);
        this.master.connect(this.limiter);
        this.limiter.connect(this.ctx.destination);
    }

    resume() {
        this.ensure();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    outputGain() { return this.volume * 2.2; }
    musicLevel() { return Math.min(1, this.volume * 0.9); }
    feverLevel() { return Math.min(1, this.volume * 1.05); }

    cancelFade(kind) {
        const key = kind + 'FadeId';
        if (this[key]) {
            cancelAnimationFrame(this[key]);
            this[key] = null;
        }
    }

    fadeElement(audio, to, duration = 900, kind = 'music', done = null) {
        if (!audio) return;
        this.cancelFade(kind);
        const from = audio.volume;
        const start = performance.now();
        const tick = now => {
            const t = Math.min(1, (now - start) / duration);
            const eased = t * t * (3 - 2 * t);
            audio.volume = from + (to - from) * eased;
            if (t < 1) this[kind + 'FadeId'] = requestAnimationFrame(tick);
            else {
                this[kind + 'FadeId'] = null;
                if (done) done();
            }
        };
        this[kind + 'FadeId'] = requestAnimationFrame(tick);
    }

    setVolume(value) {
        this.ensure();
        this.volume = Math.max(0, Math.min(1, Number(value) / 100));
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.outputGain(), this.ctx.currentTime, 0.02);
        this.musicEl.volume = this.musicEnabled ? this.musicLevel() : 0;
        if (this.feverEl) this.feverEl.volume = this.musicEnabled ? this.feverLevel() : 0;
        this.saveSettings();
        return this.volume;
    }

    toggleSfx() {
        this.ensure();
        this.sfxEnabled = !this.sfxEnabled;
        if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? 0.95 : 0, this.ctx.currentTime, 0.02);
        if (this.sfxEnabled) this.play('ui');
        this.saveSettings();
        return this.sfxEnabled;
    }

    toggleMusic() {
        this.ensure();
        this.musicEnabled = !this.musicEnabled;
        this.musicEl.volume = this.musicEnabled ? this.musicLevel() : 0;
        if (this.feverEl) this.feverEl.volume = this.musicEnabled ? this.feverLevel() : 0;
        if (this.musicEnabled) this.startMusic();
        else this.stopMusic();
        this.saveSettings();
        return this.musicEnabled;
    }

    setTrack(id) {
        this.musicTrack = id;
        try { localStorage.setItem('neonBallzMusicTrack', id); } catch (e) {}
        const track = (typeof MUSIC_TRACKS !== 'undefined') && MUSIC_TRACKS.find(t => t.id === id);
        if (track) {
            const wasPlaying = !this.musicEl.paused;
            this.musicEl.src = track.file;
            this.musicEl.volume = this.musicEnabled ? this.musicLevel() : 0;
            if (wasPlaying && this.musicEnabled) this.musicEl.play().catch(() => {});
        }
    }

    startMusic() {
        this.resume();
        if (!this.musicEnabled) return;
        this.musicEl.volume = this.musicLevel();
        this.musicEl.play().catch(() => {});
    }

    stopMusic() {
        this.musicEl.pause();
    }

    startSplitFever() {
        this.resume();
        if (!this.musicEnabled) return;
        this.stopSplitFever(false);
        this.cancelFade('music');
        this.cancelFade('fever');
        this.splitMusicWasPlaying = !this.musicEl.paused;
        this.musicEl.pause();
        this.feverEl.volume = this.feverLevel();
        this.feverEl.currentTime = 0;
        this.feverEl.play().catch(() => {});
    }

    stopSplitFever(resumeMusic = true) {
        if (!this.feverEl) return;
        this.cancelFade('fever');
        this.cancelFade('music');
        const shouldResumeMusic = resumeMusic && this.musicEnabled && this.splitMusicWasPlaying;
        if (shouldResumeMusic) {
            this.musicEl.volume = 0;
            this.musicEl.play().catch(() => {});
            this.fadeElement(this.musicEl, this.musicLevel(), 900, 'music');
            this.fadeElement(this.feverEl, 0, 900, 'fever', () => {
                this.feverEl.pause();
                this.feverEl.currentTime = 0;
                this.feverEl.volume = this.feverLevel();
            });
        } else {
            this.feverEl.pause();
            this.feverEl.currentTime = 0;
            this.feverEl.volume = this.feverLevel();
        }
        this.splitMusicWasPlaying = false;
    }

    // ---------- 程序化音效 ----------
    tone(freq, duration, type = 'sine', volume = 0.2, dest = this.sfxGain, bendTo = null) {
        if (!this.ctx || !dest) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);
        if (bendTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, bendTo), now + duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        osc.connect(gain); gain.connect(dest);
        osc.start(now); osc.stop(now + duration + 0.03);
    }

    noise(duration, volume = 0.15, frequency = 800, filterType = 'lowpass') {
        if (!this.ctx || !this.sfxGain) return;
        const now = this.ctx.currentTime;
        const buffer = this.ctx.createBuffer(1, Math.max(1, this.ctx.sampleRate * duration), this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        src.buffer = buffer; filter.type = filterType; filter.frequency.value = frequency;
        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        src.connect(filter); filter.connect(gain); gain.connect(this.sfxGain);
        src.start(now); src.stop(now + duration);
    }

    play(type) {
        if (!this.sfxEnabled) return;
        this.resume();
        if (!this.ctx) return;
        const nowMs = performance.now();
        const limits = { shoot: 45, impact: 32, break: 28, slow: 90, blast: 70, levelup: 400, pickup: 120, upgrade: 120, ui: 120, gameover: 800 };
        if (this.lastPlayed[type] && nowMs - this.lastPlayed[type] < (limits[type] || 40)) return;
        this.lastPlayed[type] = nowMs;

        if (type === 'shoot') this.tone(680, 0.05, 'triangle', 0.14, this.sfxGain, 920);
        else if (type === 'impact') this.tone(300, 0.04, 'square', 0.1, this.sfxGain, 200);
        else if (type === 'break') { this.tone(520, 0.06, 'triangle', 0.14, this.sfxGain, 760); this.noise(0.05, 0.1, 2600, 'highpass'); }
        else if (type === 'slow') { this.tone(900, 0.11, 'sine', 0.13, this.sfxGain, 1300); this.noise(0.05, 0.06, 4200, 'highpass'); }
        else if (type === 'blast') { this.tone(220, 0.1, 'triangle', 0.2, this.sfxGain, 90); this.noise(0.08, 0.18, 1600, 'highpass'); }
        else if (type === 'levelup') { this.tone(660, 0.12, 'sine', 0.2, this.sfxGain, 990); this.tone(990, 0.16, 'sine', 0.16, this.sfxGain, 1480); this.tone(1320, 0.2, 'sine', 0.12, this.sfxGain, 1980); }
        else if (type === 'upgrade') { this.tone(660, 0.1, 'sine', 0.2, this.sfxGain, 990); this.tone(990, 0.12, 'sine', 0.14, this.sfxGain, 1480); }
        else if (type === 'pickup') this.tone(880, 0.09, 'sine', 0.16, this.sfxGain, 1320);
        else if (type === 'ui') this.tone(820, 0.05, 'sine', 0.16, this.sfxGain, 1040);
        else if (type === 'gameover') { this.tone(330, 0.5, 'sawtooth', 0.26, this.sfxGain, 90); this.noise(0.4, 0.2, 1400); }
    }
}
