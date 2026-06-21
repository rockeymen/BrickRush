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
        this.feverGain = null;
        this.feverNodes = [];
        this.splitMusicWasPlaying = false;
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

    setVolume(value) {
        this.ensure();
        this.volume = Math.max(0, Math.min(1, Number(value) / 100));
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.outputGain(), this.ctx.currentTime, 0.02);
        this.musicEl.volume = this.musicEnabled ? this.musicLevel() : 0;
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
        if (!this.ctx || !this.musicEnabled) return;
        this.stopSplitFever(false);
        this.splitMusicWasPlaying = !this.musicEl.paused;
        this.musicEl.pause();

        const now = this.ctx.currentTime;
        const fever = this.ctx.createGain();
        fever.gain.setValueAtTime(0.0001, now);
        fever.gain.exponentialRampToValueAtTime(0.36, now + 0.12);
        fever.connect(this.master);
        this.feverGain = fever;

        const addTone = (freq, type, volume, filterFreq, bendTo = null) => {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, now);
            if (bendTo) osc.frequency.exponentialRampToValueAtTime(bendTo, now + 10);
            filter.type = 'lowpass';
            filter.frequency.value = filterFreq;
            gain.gain.value = volume;
            osc.connect(filter); filter.connect(gain); gain.connect(fever);
            osc.start(now);
            this.feverNodes.push(osc, filter, gain);
            return gain;
        };

        const bassGain = addTone(92, 'sawtooth', 0.075, 260, 128);
        addTone(184, 'triangle', 0.032, 620, 256);
        addTone(552, 'square', 0.018, 1600, 736);

        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'square';
        lfo.frequency.value = 8;
        lfoGain.gain.value = 0.045;
        lfo.connect(lfoGain); lfoGain.connect(bassGain.gain);
        lfo.start(now);
        this.feverNodes.push(lfo, lfoGain);

        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.28;
        const noise = this.ctx.createBufferSource();
        const high = this.ctx.createBiquadFilter();
        const noiseGain = this.ctx.createGain();
        noise.buffer = buffer; noise.loop = true;
        high.type = 'highpass'; high.frequency.value = 1800;
        noiseGain.gain.value = 0.025;
        noise.connect(high); high.connect(noiseGain); noiseGain.connect(fever);
        noise.start(now);
        this.feverNodes.push(noise, high, noiseGain);
    }

    stopSplitFever(resumeMusic = true) {
        if (!this.ctx || !this.feverGain) return;
        const now = this.ctx.currentTime;
        this.feverGain.gain.cancelScheduledValues(now);
        this.feverGain.gain.setTargetAtTime(0.0001, now, 0.05);
        const fever = this.feverGain;
        const nodes = this.feverNodes.slice();
        window.setTimeout(() => {
            nodes.forEach(n => {
                try { if (n.stop) n.stop(); } catch (e) {}
                try { if (n.disconnect) n.disconnect(); } catch (e) {}
            });
            try { fever.disconnect(); } catch (e) {}
        }, 160);
        this.feverNodes = [];
        this.feverGain = null;
        if (resumeMusic && this.musicEnabled && this.splitMusicWasPlaying) this.startMusic();
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
