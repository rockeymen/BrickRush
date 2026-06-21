// ============================================================================
//  game.js — 游戏逻辑（数据驱动，渲染交给 Renderer3D）
//
//  玩法：弹球自动连发、墙壁/砖块反弹、回收后朝当前瞄准方向重发。砖块从顶部
//  「单独」下落（非整排）、速度统一、带血量数字。砖块越过红线扣基地血。
//  击碎砖块得经验，普通升级强化基础属性；高级弹球由特殊砖块发放。
//
//  弹球物理鲁棒性（杜绝“卡死/消失”）：每帧速度归一化、强制最小垂直分量、
//  回收用 dist≤捕获半径 或 ≤单步位移 判定、墙壁钳位。砖块为矩形 → 圆-AABB 碰撞。
// ============================================================================

class Game {
    constructor() {
        this.wrapper = document.getElementById('game-wrapper');
        this.canvas = document.getElementById('gameCanvas');

        this.W = CONFIG.designWidth;
        this.H = CONFIG.designHeight;
        this.fieldBottom = CONFIG.fieldBottom;
        this.gunX = this.W / 2;
        this.gunY = this.fieldBottom + CONFIG.turretDrop; // 炮塔再往下挪（红线不动）
        this.redLineY = this.fieldBottom - CONFIG.redLineGap; // 防线（怪越此线扣血），在炮台上方留缓冲
        this.dangerY = this.redLineY;
        this.cellW = this.W / CONFIG.cols;  // 格子大小（砖块大小=格子）

        this.lang = this.detectLanguage();
        this.state = 'INSTRUCTIONS';
        this.previousState = 'PLAYING';
        this.frame = 0;
        this.uid = 0;
        this.bigBallDiameter = CONFIG.ballRadius * 2;
        this.minBallLaunchGap = this.bigBallDiameter; // 一个大球的直径
        this.initialBallLaunchGap = CONFIG.ballRadius * 5; // 初始两球间隔：5 个基础球直径
        this.ballQueueGap = this.minBallLaunchGap;
        this.lastBallLaunchFrame = -Infinity;

        this.audio = new AudioManager();
        this.reset();

        this.renderer = new Renderer3D(this, this.canvas);
        this.resize();
        window.addEventListener('resize', () => this.resize());

        this.initInput();
        this.updateLanguage();
        document.getElementById('instruction-modal').style.display = 'flex';
        requestAnimationFrame(t => this.loop(t));
    }

    reset() {
        this.wave = 1;
        this.kills = 0;
        this.level = 1;
        this.exp = 0;
        this.expNeed = this.getExpNeed(1);
        this.baseHp = CONFIG.baseHp;
        this.pendingLevelUps = 0;
        this.pendingAdvancedUpgrades = 0;
        this.upgradeMode = 'normal';

        this.power = CONFIG.base.power;
        this.speed = CONFIG.base.speed;

        this.bricks = [];
        this.balls = [];
        this.fx = [];
        this.floatTexts = [];
        this.aimAngle = -Math.PI / 2.2;
        this.aiming = false;

        this.spawnTimer = 120;
        this.waveTimer = 0;
        this.megaTimer = CONFIG.brick.megaIntervalBase;
        this.lastBallLaunchFrame = -Infinity;
        this.splitTimer = 0;
        this.splitToastTimer = 0;
        this.introSpecialQueue = ['advanced', 'reward'];
        if (this.audio && this.audio.stopSplitFever) this.audio.stopSplitFever(false);

        this.addBall('normal');
        this.addBall('normal'); // 初始 2 颗（排队同角度连发，每击 -1 血）
        this.balls.forEach(ball => { ball.launchGap = this.initialBallLaunchGap; });

        // 开局放 4 个 2 血的弱怪：消灭 3 个左右触发第一次升级（新手引导）
        const cw = this.cellW, hw = cw / 2, hh = cw / 2;
        [0, 2, 3, 5].forEach(i => {
            this.bricks.push({ uid: ++this.uid, x: cw * (i + 0.5), y: CONFIG.topWallY + hh, hw, hh, hp: 2, maxHp: 2, slowed: 0, exp: 2, speed: CONFIG.brick.speed });
        });
        this.updateSplitUi();
    }

    getExpNeed(level) {
        // 普通升级只提供基础成长，节奏放慢，特殊弹球改由高级砖块发放
        if (level <= 3) return [0, 5, 9, 14][level];
        return Math.floor(8 + level * 4 + level * level * 1.25);
    }

    // ---------------- 语言 / HUD ----------------
    detectLanguage() {
        const langs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'zh'];
        return langs.some(l => /^zh/i.test(l)) ? 'zh' : 'en';
    }
    text(key, data = {}) {
        let v = I18N[this.lang][key] != null ? I18N[this.lang][key] : (I18N.zh[key] || key);
        if (typeof v === 'string') Object.keys(data).forEach(k => v = v.replace(`{${k}}`, data[k]));
        return v;
    }
    upgradeText(id) { return I18N[this.lang].upgrades[id] || I18N.zh.upgrades[id] || { name: id, desc: '' }; }

    updateLanguage() {
        document.documentElement.lang = this.text('htmlLang');
        document.title = this.text('title');
        const set = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
        set('label-wave', this.text('wave'));
        set('label-kills', this.text('kills'));
        set('label-hp', this.text('hp'));
        set('splitTimerLabel', this.text('splitTime'));
        set('instructionTitle', this.text('instructionsTitle'));
        set('instructionCopy', this.text('instructionsCopy'));
        set('startBtn', this.text('start'));
        set('instructionLanguageBtn', this.text('language'));
        set('menuTitle', this.text('menu'));
        set('restartBtn', this.text('restart'));
        set('languageBtn', this.text('language'));
        set('sfxBtn', this.text(this.audio.sfxEnabled ? 'sfxOn' : 'sfxOff'));
        set('musicBtn', this.text(this.audio.musicEnabled ? 'musicOn' : 'musicOff'));
        set('volumeLabel', this.text('volume'));
        set('resumeBtn', this.text('resume'));
        set('restartTitle', this.text('restartTitle'));
        set('restartCopy', this.text('restartCopy'));
        set('confirmRestartBtn', this.text('confirmRestart'));
        set('cancelRestartBtn', this.text('cancel'));
        set('gameoverTitle', this.text('gameover'));
        set('goRestartBtn', this.text('restart'));
        set('upgradeTitle', this.text('upgradeTitle'));
        if (this.menuBtn) this.menuBtn.setAttribute('aria-label', this.text('menu'));
        this.updateVolumeUi();
        this.updateHud();
        if (this.state === 'UPGRADE') this.renderUpgradeCards();
        if (this.state === 'GAMEOVER') document.getElementById('final-score').innerText = this.text('finalScore', { wave: this.wave, kills: this.kills });
    }

    updateHud() {
        const set = (id, t) => { const el = document.getElementById(id); if (el) el.innerText = t; };
        set('wave-val', this.wave);
        set('kills-val', this.kills);
        set('level-val', 'Lv.' + this.level);
        const hpPct = Math.max(0, this.baseHp) / CONFIG.baseHp * 100;
        const hpFill = document.getElementById('hp-fill');
        if (hpFill) { hpFill.style.width = hpPct + '%'; hpFill.style.background = hpPct > 50 ? '#4ade5a' : (hpPct > 25 ? '#ffd23d' : '#ff4d4d'); }
        set('hp-text', Math.max(0, Math.ceil(this.baseHp)));
        const expFill = document.getElementById('exp-fill');
        if (expFill) expFill.style.width = Math.min(100, this.exp / this.expNeed * 100) + '%';
        this.updateSplitUi();
    }
    updateVolumeUi() {
        const value = Math.round(this.audio.volume * 100);
        const s = document.getElementById('volumeSlider'); if (s) s.value = value;
        const v = document.getElementById('volumeValue'); if (v) v.innerText = value + '%';
    }
    updateSplitUi() {
        const box = document.getElementById('splitTimer');
        if (!box) return;
        const active = this.splitTimer > 0;
        box.classList.toggle('active', active);
        box.classList.toggle('pop', this.splitToastTimer > 0);
        const val = document.getElementById('splitTimerVal');
        if (val) val.innerText = Math.max(0, Math.ceil(this.splitTimer / 60));
        const banner = document.getElementById('splitBanner');
        if (banner) {
            banner.innerText = this.text('splitToast');
            banner.classList.toggle('active', this.splitToastTimer > 0);
        }
        const wash = document.getElementById('splitFeverWash');
        if (wash) wash.classList.toggle('active', active);
        if (this.wrapper) this.wrapper.classList.toggle('split-fever', active);
    }
    endSplitTime() {
        this.splitTimer = 0;
        this.balls = this.balls.filter(ball => !ball.splitClone);
        this.balls.forEach(ball => { ball.splitDepth = 0; ball.splitCd = 0; });
        this.audio.stopSplitFever(true);
        this.arrangeBallQueue();
        this.updateSplitUi();
    }

    // ---------------- 状态切换 ----------------
    startGame() {
        this.audio.resume();
        if (this.audio.musicEnabled) this.audio.startMusic();
        this.audio.play('ui');
        document.getElementById('instruction-modal').style.display = 'none';
        this.state = 'PLAYING';
    }
    openMenu() {
        if (this.state === 'GAMEOVER' || this.state === 'UPGRADE') return;
        this.previousState = this.state === 'MENU' ? this.previousState : this.state;
        this.state = 'MENU';
        this.audio.play('ui');
        document.getElementById('menu-modal').style.display = 'flex';
    }
    closeMenu() { document.getElementById('menu-modal').style.display = 'none'; this.state = this.previousState || 'PLAYING'; }
    showRestartConfirm() { document.getElementById('menu-modal').style.display = 'none'; document.getElementById('restart-confirm-modal').style.display = 'flex'; }
    cancelRestart() { document.getElementById('restart-confirm-modal').style.display = 'none'; document.getElementById('menu-modal').style.display = 'flex'; }
    confirmRestart() { location.reload(); }

    toggleLanguage() { this.lang = this.lang === 'zh' ? 'en' : 'zh'; this.audio.play('ui'); this.updateLanguage(); }
    toggleSfx() { this.audio.toggleSfx(); this.updateLanguage(); }
    toggleMusic() { this.audio.toggleMusic(); this.updateLanguage(); }
    setVolume(v) { this.audio.setVolume(v); this.updateVolumeUi(); }

    gameOver() {
        if (this.state === 'GAMEOVER') return;
        this.state = 'GAMEOVER';
        this.audio.play('gameover');
        this.audio.stopMusic();
        document.getElementById('final-score').innerText = this.text('finalScore', { wave: this.wave, kills: this.kills });
        document.getElementById('gameover-screen').style.display = 'flex';
    }

    // ---------------- 弹球 ----------------
    setBallVel(ball) { ball.vx = Math.cos(this.aimAngle) * this.speed; ball.vy = Math.sin(this.aimAngle) * this.speed; }
    setBallVelAngle(ball, angle) { ball.vx = Math.cos(angle) * this.speed; ball.vy = Math.sin(angle) * this.speed; }
    ballRadius(type) { return type === 'normal' ? CONFIG.ballRadius * 0.5 : CONFIG.ballRadius; }
    queuedBalls() { return this.balls.filter(b => b.state === 'waiting').sort((a, b) => a.uid - b.uid); }
    firstQueuedBall() { return this.queuedBalls()[0] || null; }
    arrangeBallQueue() {
        const q = this.queuedBalls();
        q.forEach((ball, i) => {
            const off = (i - (q.length - 1) / 2) * this.ballQueueGap;
            ball.x = this.gunX + off;
            ball.y = this.gunY - 1;
            ball.vx = 0;
            ball.vy = 0;
        });
    }
    queueBall(ball) {
        ball.state = 'waiting';
        ball.wait = 0;
        ball.hits = {};
        this.arrangeBallQueue();
    }
    canLaunchQueuedBall(ball) {
        if (this.firstQueuedBall() !== ball) return false;
        const framesSinceLaunch = this.frame - this.lastBallLaunchFrame;
        return !Number.isFinite(this.lastBallLaunchFrame) || framesSinceLaunch * this.speed >= (ball.launchGap || this.minBallLaunchGap);
    }
    launchQueuedBall(ball) {
        ball.x = this.gunX;
        ball.y = this.gunY - 1;
        ball.state = 'active';
        ball.hits = {};
        this.setBallVel(ball);
        this.lastBallLaunchFrame = this.frame;
        ball.lastLaunchFrame = this.frame;
        if (this.splitTimer <= 0) {
            ball.splitDepth = 0;
            ball.splitCd = 0;
        }
        ball.launchGap = this.minBallLaunchGap;
        this.audio.play('shoot');
    }
    addBall(type) {
        if (this.balls.length >= CONFIG.maxBalls) return;
        const ball = { uid: ++this.uid, x: this.gunX, y: this.gunY - 1, vx: 0, vy: 0, state: 'waiting', wait: 0, launchGap: this.minBallLaunchGap, type, r: this.ballRadius(type), hitCd: 0, splitDepth: 0, splitCd: 0, splitClone: false, hits: {} };
        this.balls.push(ball);
        this.queueBall(ball);
    }
    splitBall(ball) {
        const bc = CONFIG.brick;
        if (this.splitTimer <= 0 || ball.splitCd > 0 || (ball.splitDepth || 0) >= bc.splitMaxDepth) return;
        if (this.balls.length >= CONFIG.maxBalls) return;
        const nextDepth = (ball.splitDepth || 0) + 1;
        const baseAngle = Math.atan2(ball.vy, ball.vx);
        const offset = 0.22;
        ball.splitDepth = nextDepth;
        ball.splitCd = 10;
        this.setBallVelAngle(ball, baseAngle - offset);
        const clone = {
            uid: ++this.uid,
            x: ball.x,
            y: ball.y,
            vx: 0,
            vy: 0,
            state: 'active',
            wait: 0,
            launchGap: this.minBallLaunchGap,
            type: ball.type,
            r: ball.r,
            hitCd: 3,
            splitDepth: nextDepth,
            splitCd: 10,
            splitClone: true,
            hits: {}
        };
        this.setBallVelAngle(clone, baseAngle + offset);
        this.balls.push(clone);
        this.fx.push({ kind: 'split', x: ball.x, y: ball.y, r: 26, life: 12, maxLife: 12, alpha: 1, color: '#ffe85a' });
        this.audio.play('pickup');
    }
    triggerSplitTime() {
        const bc = CONFIG.brick;
        this.splitTimer = bc.splitDurationFrames;
        this.splitToastTimer = 90;
        this.balls.forEach(ball => { ball.splitDepth = 0; ball.splitCd = 0; });
        this.floatTexts.push({ x: this.W / 2, y: this.H * 0.34, str: this.text('splitToast'), c: '#ffe85a', s: 44, life: 80, maxLife: 80 });
        this.fx.push({ kind: 'split', x: this.W / 2, y: this.redLineY - 90, r: 42, life: 22, maxLife: 22, alpha: 1, color: '#ffe85a' });
        this.audio.play('levelup');
        this.audio.startSplitFever();
        this.updateSplitUi();
    }

    // ---------------- 升级 ----------------
    triggerLevelUp() {
        this.level++;
        this.exp -= this.expNeed;
        this.expNeed = this.getExpNeed(this.level);
        this.pendingLevelUps++;
        this.audio.play('levelup');
    }
    openUpgrade(mode = 'normal') {
        this.state = 'UPGRADE';
        this.upgradeMode = mode;
        const pool = (mode === 'advanced' ? CONFIG.advancedUpgradePool : CONFIG.upgradePool).slice();
        this.upgradeChoices = [];
        for (let i = 0; i < 3 && pool.length; i++) this.upgradeChoices.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        this.renderUpgradeCards();
        document.getElementById('upgrade-modal').style.display = 'flex';
    }
    renderUpgradeCards() {
        const list = document.getElementById('cardList');
        if (!list) return;
        list.innerHTML = '';
        const title = document.getElementById('upgradeTitle');
        if (title) title.innerText = this.text(this.upgradeMode === 'advanced' ? 'advancedUpgradeTitle' : 'upgradeTitle');
        (this.upgradeChoices || []).forEach(id => {
            const t = this.upgradeText(id);
            const card = document.createElement('div');
            card.className = 'card';
            card.onclick = () => this.chooseUpgrade(id);
            const cv = document.createElement('canvas');
            cv.width = 120; cv.height = 120; cv.className = 'card-icon';
            drawUpgradeIcon(cv.getContext('2d'), id);
            card.appendChild(cv);
            const nm = document.createElement('div'); nm.className = 'card-name'; nm.innerText = t.name; card.appendChild(nm);
            const ds = document.createElement('div'); ds.className = 'card-desc'; ds.innerText = t.desc; card.appendChild(ds);
            list.appendChild(card);
        });
    }
    chooseUpgrade(id) {
        this.applyUpgrade(id);
        this.audio.play('upgrade');
        if (this.upgradeMode === 'advanced') this.pendingAdvancedUpgrades = Math.max(0, this.pendingAdvancedUpgrades - 1);
        else this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
        if (this.pendingAdvancedUpgrades > 0) this.openUpgrade('advanced');
        else if (this.pendingLevelUps > 0) this.openUpgrade('normal');
        else { document.getElementById('upgrade-modal').style.display = 'none'; this.state = 'PLAYING'; this.upgradeMode = 'normal'; }
        this.updateHud();
    }
    applyUpgrade(id) {
        switch (id) {
            case 'addNormal': this.addBall('normal'); break;
            case 'power': this.power += 1; break;
            case 'speed': this.speed = Math.min(24, this.speed + 1.4); break;
            case 'explode': this.addBall('explode'); break;
            case 'pierce': this.addBall('pierce'); break;
            case 'hblast': this.addBall('hblast'); break;
            case 'vblast': this.addBall('vblast'); break;
        }
    }

    // ---------------- 砖块 ----------------
    // 候选位置(中心 x、半宽 hw、半高 hh)是否可放置：与现有砖在 x 上重叠且仍靠近顶部 → 不可
    canPlace(x, hw, hh) {
        const cw = this.cellW, yTop = CONFIG.topWallY + hh;
        for (const br of this.bricks) {
            if (Math.abs(br.x - x) < (hw + br.hw - 1) && (br.y - br.hh) < yTop + cw) return false;
        }
        return true;
    }
    shouldSpawnAdvancedBrick() {
        const b = CONFIG.brick;
        const chance = Math.min(b.advancedChanceMax, b.advancedChance + Math.max(0, this.wave - 1) * b.advancedChancePerWave);
        return this.wave >= 2 && Math.random() < chance;
    }
    shouldSpawnMegaRewardBrick() {
        return Math.random() < CONFIG.brick.rewardWithMegaChance;
    }
    hasSpecialBrick() {
        return this.bricks.some(br => br.kind === 'advanced' || br.kind === 'reward');
    }
    getBrickExp(hp, mega = false) {
        const base = mega ? 5 : 1;
        const scale = mega ? 1.35 : 0.75;
        return Math.max(mega ? 8 : 2, Math.round(base + Math.sqrt(Math.max(1, hp)) * scale));
    }
    getAdvancedBrickHp() {
        const b = CONFIG.brick;
        const fieldHigh = this.bricks.reduce((best, br) => {
            if (br.kind === 'advanced' || br.kind === 'reward') return best;
            return Math.max(best, br.maxHp || br.hp || 0);
        }, 0);
        const waveTarget = b.advancedHpBase + this.wave * b.advancedHpPerWave;
        const fieldTarget = fieldHigh > 0 ? fieldHigh * 0.72 : 0;
        return Math.max(12, Math.min(100, Math.round(Math.max(waveTarget, fieldTarget))));
    }
    spawnSmallSpecialBrick(kind) {
        if (this.hasSpecialBrick()) return false;
        const b = CONFIG.brick;
        const cw = this.cellW, hw = cw / 2, hh = cw / 2;
        const yTop = CONFIG.topWallY + hh;
        const free = [];
        for (let i = 0; i < CONFIG.cols; i++) {
            const cx = cw * (i + 0.5);
            if (this.canPlace(cx, hw, hh)) free.push(cx);
        }
        if (!free.length) return false;
        const x = free[Math.floor(Math.random() * free.length)];
        const split = kind === 'reward';
        const hp = split
            ? Math.max(3, Math.round(b.rewardHpBase + this.wave * b.rewardHpPerWave))
            : this.getAdvancedBrickHp();
        this.bricks.push({
            uid: ++this.uid, x, y: yTop, hw, hh,
            hp, maxHp: hp, slowed: 0, exp: 0, speed: b.speed, kind
        });
        return true;
    }
    spawnIntroSpecialBrick() {
        if (!this.introSpecialQueue || this.introSpecialQueue.length === 0) return false;
        const kind = this.introSpecialQueue[0];
        if (!this.spawnSmallSpecialBrick(kind)) return false;
        this.introSpecialQueue.shift();
        return true;
    }

    spawnBrick() {
        const b = CONFIG.brick;
        const cw = this.cellW, hw = cw / 2, hh = cw / 2;
        const yTop = CONFIG.topWallY + hh;
        // 按列对齐：选一个可放置的列
        const free = [];
        for (let i = 0; i < CONFIG.cols; i++) {
            const cx = cw * (i + 0.5);
            if (this.canPlace(cx, hw, hh)) free.push(cx);
        }
        if (!free.length) return;
        const x = free[Math.floor(Math.random() * free.length)];
        if (this.spawnIntroSpecialBrick()) return;
        if (this.shouldSpawnAdvancedBrick()) { this.spawnSmallSpecialBrick('advanced'); return; }
        // 血量按波数提升；小概率出老怪（血量特别大、移动缓慢）
        const low = b.hpLow + (this.wave - 1) * b.hpLowPerWave;
        let hp = Math.round(low + Math.random() * (b.hpSpread + this.wave * b.hpSpreadPerWave));
        let speed = b.speed;
        const r = Math.random();
        if (this.wave >= 2 && r < b.bossChance) { hp = Math.round(hp * b.bossMul); speed = b.speed * b.bossSpeedMul; }
        else if (r < b.bossChance + b.toughChance) { hp = Math.round(hp * b.toughMul); }
        hp = Math.max(3, hp);
        this.bricks.push({
            uid: ++this.uid, x, y: yTop, hw, hh,
            hp, maxHp: hp, slowed: 0, exp: this.getBrickExp(hp), speed
        });
    }

    // 大型怪：占 2×2 格、超厚血、极慢
    spawnMega() {
        const b = CONFIG.brick;
        const cw = this.cellW, hw = cw, hh = cw; // 2 列宽 × 2 行高
        const yTop = CONFIG.topWallY + hh;
        const pairs = [];
        for (let i = 0; i < CONFIG.cols - 1; i++) pairs.push(i);
        // 随机顺序找一对可放置的相邻列
        for (let n = pairs.length - 1; n > 0; n--) { const j = Math.floor(Math.random() * (n + 1)); [pairs[n], pairs[j]] = [pairs[j], pairs[n]]; }
        for (const i of pairs) {
            const x = cw * (i + 1); // 两列交界处
            if (this.canPlace(x, hw, hh)) {
                const low = b.hpLow + (this.wave - 1) * b.hpLowPerWave;
                const base = Math.round(low + Math.random() * (b.hpSpread + this.wave * b.hpSpreadPerWave));
                const hp = Math.max(40, Math.round(base * b.megaMul));
                this.bricks.push({
                    uid: ++this.uid, x, y: yTop, hw, hh,
                    hp, maxHp: hp, slowed: 0, exp: this.getBrickExp(hp, true), speed: b.speed * b.megaSpeedMul
                });
                if (this.shouldSpawnMegaRewardBrick()) this.spawnSmallSpecialBrick('reward');
                return true;
            }
        }
        return false;
    }

    // 防重叠分离：任意两块重叠时把上方那块顶上去（处理减速导致的追尾）
    separateBricks() {
        const list = this.bricks;
        for (let pass = 0; pass < 2; pass++) {
            for (let a = 0; a < list.length; a++) {
                for (let c = a + 1; c < list.length; c++) {
                    const A = list[a], B = list[c];
                    const ox = (A.hw + B.hw) - Math.abs(A.x - B.x);
                    const oy = (A.hh + B.hh) - Math.abs(A.y - B.y);
                    if (ox > 0 && oy > 0) {
                        const up = A.y < B.y ? A : B, lo = A.y < B.y ? B : A;
                        up.y = lo.y - (A.hh + B.hh);
                    }
                }
            }
        }
    }

    // ---------------- 输入（仅点击/拖拽转向） ----------------
    initInput() {
        this.menuBtn = document.getElementById('menuBtn');
        const onField = (e) => e.target === this.canvas;
        const aim = (clientX, clientY) => {
            if (this.state !== 'PLAYING') return;
            const p = this.renderer.screenToDesign(clientX, clientY);
            if (!p) return;
            const ty = Math.min(p.y, this.gunY - 30);
            let ang = Math.atan2(ty - this.gunY, p.x - this.gunX);
            ang = Math.max(-Math.PI + 0.16, Math.min(-0.16, ang));
            this.aimAngle = ang;
        };
        this.wrapper.addEventListener('mousedown', e => { if (onField(e)) { this.aiming = true; aim(e.clientX, e.clientY); } });
        window.addEventListener('mousemove', e => { if (this.aiming) aim(e.clientX, e.clientY); });
        window.addEventListener('mouseup', () => { this.aiming = false; });
        this.wrapper.addEventListener('touchstart', e => { if (onField(e) && e.touches[0]) { this.aiming = true; aim(e.touches[0].clientX, e.touches[0].clientY); } }, { passive: true });
        this.wrapper.addEventListener('touchmove', e => { if (!this.aiming) return; e.preventDefault(); if (e.touches[0]) aim(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
        window.addEventListener('touchend', () => { this.aiming = false; });
    }
    resize() { if (this.renderer) this.renderer.resize(); }

    // ---------------- 主循环 ----------------
    loop() {
        if (this.state === 'PLAYING' && this.pendingAdvancedUpgrades > 0) this.openUpgrade('advanced');
        else if (this.state === 'PLAYING' && this.pendingLevelUps > 0) this.openUpgrade('normal');
        if (this.state === 'PLAYING') this.update();
        if (this.renderer) this.renderer.render();
        requestAnimationFrame(() => this.loop());
    }

    update() {
        this.frame++;
        if (this.splitTimer > 0) {
            this.splitTimer--;
            if (this.splitToastTimer > 0) this.splitToastTimer--;
            if (this.splitTimer <= 0) this.endSplitTime();
            this.updateSplitUi();
        } else if (this.splitToastTimer > 0) {
            this.splitToastTimer--;
            this.updateSplitUi();
        }

        if (++this.waveTimer >= 900) { this.waveTimer = 0; this.wave++; this.updateHud(); this.floatTexts.push({ x: this.W / 2, y: this.H * 0.32, str: (this.lang === 'zh' ? '第 ' + this.wave + ' 波' : 'WAVE ' + this.wave), c: '#fff', s: 30, life: 60, maxLife: 60 }); }

        const bc = CONFIG.brick;
        const interval = Math.max(bc.spawnIntervalMin, bc.spawnIntervalBase - this.wave * 5);
        if (--this.spawnTimer <= 0) {
            this.spawnBrick();
            this.spawnTimer = interval;
        }
        // 间或出大型怪（2×2 超厚血），第 3 波后才出现
        if (--this.megaTimer <= 0) {
            if (this.wave >= 3 && this.spawnMega()) this.megaTimer = bc.megaIntervalBase + Math.floor(Math.random() * 600);
            else this.megaTimer = 120; // 太早/太挤，稍后再试
        }

        // 砖块下落（每块自己的速度；保留 slowed 状态用于兼容）
        for (const br of this.bricks) {
            if (br.slowed > 0) br.slowed--;
            br.y += (br.speed != null ? br.speed : bc.speed) * (br.slowed > 0 ? bc.slowFactor : 1);
        }
        // 防重叠
        this.separateBricks();
        // 越过红线 → 扣基地血
        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const br = this.bricks[i];
            if (br.y + br.hh >= this.dangerY) {
                const dmg = Math.min(30, Math.ceil(5 + this.wave * 1.2)); // 越线伤害与波数挂钩、设上限（不随血量暴涨）
                this.baseHp -= dmg;
                this.fx.push({ kind: 'breach', x: br.x, y: this.redLineY, r: 30, life: 16, maxLife: 16, alpha: 1, color: '#ff3b4e' });
                this.floatTexts.push({ x: br.x, y: this.redLineY - 16, str: '-' + dmg, c: '#ff5566', s: 18, life: 40, maxLife: 40 });
                this.audio.play('impact');
                this.bricks.splice(i, 1);
                this.updateHud();
                if (this.baseHp <= 0) { this.gameOver(); return; }
            }
        }

        // 弹球
        this.arrangeBallQueue();
        const W = this.W;
        for (let i = this.balls.length - 1; i >= 0; i--) {
            const ball = this.balls[i];
            const R = ball.r;
            if (ball.hitCd > 0) ball.hitCd--;
            if (ball.splitCd > 0) ball.splitCd--;
            if (ball.state === 'active') {
                ball.x += ball.vx; ball.y += ball.vy;
                if (ball.x < R) { ball.x = R; ball.vx = Math.abs(ball.vx); }
                else if (ball.x > W - R) { ball.x = W - R; ball.vx = -Math.abs(ball.vx); }
                if (ball.y < CONFIG.topWallY + R) { ball.y = CONFIG.topWallY + R; ball.vy = Math.abs(ball.vy); }
                if (ball.y >= this.gunY) { ball.y = this.gunY; ball.state = 'returning'; }
                else { this.collideBricks(ball); this.normalizeBall(ball); }
            } else if (ball.state === 'returning') {
                const dx = this.gunX - ball.x, dy = this.gunY - ball.y, dist = Math.hypot(dx, dy);
                const step = this.speed * 3;
                if (dist <= CONFIG.captureRadius || dist <= step) {
                    this.queueBall(ball);
                    if (this.canLaunchQueuedBall(ball)) this.launchQueuedBall(ball);
                } else { ball.x += dx / dist * step; ball.y += dy / dist * step; }
            } else if (ball.state === 'waiting') {
                if (this.canLaunchQueuedBall(ball)) this.launchQueuedBall(ball);
            }
        }

        // 清理被打碎的砖块 → 经验
        for (let i = this.bricks.length - 1; i >= 0; i--) {
            const br = this.bricks[i];
            if (br.hp <= 0) {
                this.kills++;
                if (br.kind === 'reward') this.triggerSplitTime();
                if (br.kind === 'advanced') {
                    this.pendingAdvancedUpgrades++;
                    this.floatTexts.push({ x: br.x, y: br.y, str: this.text('advancedUpgradeTitle'), c: '#bff3ff', s: 22, life: 50, maxLife: 50 });
                }
                this.fx.push({ kind: 'pop', x: br.x, y: br.y, r: br.hw * 1.8, life: 14, maxLife: 14, alpha: 1, color: '#ffd54a' });
                if (br.exp > 0) {
                    this.exp += br.exp;
                    this.floatTexts.push({ x: br.x, y: br.y, str: '+' + br.exp, c: '#9af6ff', s: 14, life: 30, maxLife: 30 });
                }
                this.bricks.splice(i, 1);
                this.audio.play('break');
                while (this.exp >= this.expNeed) this.triggerLevelUp();
                this.updateHud();
            }
        }

        for (let i = this.fx.length - 1; i >= 0; i--) { const f = this.fx[i]; f.life--; f.alpha = Math.max(0, f.life / f.maxLife); if (f.life <= 0) this.fx.splice(i, 1); }
        for (let i = this.floatTexts.length - 1; i >= 0; i--) { if (--this.floatTexts[i].life <= 0) this.floatTexts.splice(i, 1); }
    }

    // 圆-AABB 碰撞：弹球与砖块
    collideBricks(ball) {
        const R = ball.r;
        if (ball.type === 'pierce') {
            for (const br of this.bricks) {
                const ox = (br.hw + R) - Math.abs(ball.x - br.x), oy = (br.hh + R) - Math.abs(ball.y - br.y);
                if (ox > 0 && oy > 0) {
                    if (!ball.hits[br.uid] || this.frame - ball.hits[br.uid] > 8) {
                        ball.hits[br.uid] = this.frame; br.hp -= this.power; this.audio.play('impact');
                        this.splitBall(ball);
                    }
                }
            }
            return;
        }
        if (ball.hitCd > 0) return;
        // 取重叠且圆心最近的砖块
        let best = null, bestD = Infinity, bOx = 0, bOy = 0;
        for (const br of this.bricks) {
            const ox = (br.hw + R) - Math.abs(ball.x - br.x), oy = (br.hh + R) - Math.abs(ball.y - br.y);
            if (ox > 0 && oy > 0) {
                const d = Math.hypot(ball.x - br.x, ball.y - br.y);
                if (d < bestD) { bestD = d; best = br; bOx = ox; bOy = oy; }
            }
        }
        if (!best) return;

        best.hp -= this.power;
        ball.hitCd = 2;
        this.splitBall(ball);

        if (ball.type === 'explode') {
            const rad = 156;
            this.fx.push({ kind: 'splash', x: ball.x, y: ball.y, r: rad, life: 13, maxLife: 13, alpha: 1, color: '#ff7a2f' });
            for (const br of this.bricks) if (br !== best && Math.hypot(br.x - ball.x, br.y - ball.y) < rad) br.hp -= this.power * 0.55;
            this.audio.play('blast');
        } else if (ball.type === 'hblast') {
            const band = 26;
            this.fx.push({ kind: 'hblast', x: ball.x, y: ball.y, r: band, life: 14, maxLife: 14, alpha: 1, color: '#ff4d4d' });
            for (const br of this.bricks) if (br !== best && Math.abs(br.y - ball.y) < band + br.hh) br.hp -= this.power * 0.85;
            this.audio.play('blast');
        } else if (ball.type === 'vblast') {
            const band = 26;
            this.fx.push({ kind: 'vblast', x: ball.x, y: ball.y, r: band, life: 14, maxLife: 14, alpha: 1, color: '#ff4ecf' });
            for (const br of this.bricks) if (br !== best && Math.abs(br.x - ball.x) < band + br.hw) br.hp -= this.power * 0.85;
            this.audio.play('blast');
        } else {
            this.audio.play('impact');
        }

        // 反弹（按最小穿透轴）
        if (bOx < bOy) { const s = ball.x < best.x ? -1 : 1; ball.x = best.x + s * (best.hw + R + 0.5); ball.vx = s * Math.abs(ball.vx); }
        else { const s = ball.y < best.y ? -1 : 1; ball.y = best.y + s * (best.hh + R + 0.5); ball.vy = s * Math.abs(ball.vy); }
    }

    normalizeBall(ball) {
        const sp = this.speed;
        let { vx, vy } = ball;
        const mag = Math.hypot(vx, vy) || 1;
        vx = vx / mag * sp; vy = vy / mag * sp;
        const minVy = sp * 0.22;
        if (Math.abs(vy) < minVy) {
            const sign = vy < 0 ? -1 : 1;
            vy = sign * minVy;
            vx = (vx < 0 ? -1 : 1) * Math.sqrt(Math.max(0, sp * sp - vy * vy));
        }
        ball.vx = vx; ball.vy = vy;
    }
}
