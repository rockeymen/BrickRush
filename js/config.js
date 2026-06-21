// ============================================================================
//  config.js — 游戏配置 / 弹球与怪物参数 / 升级池 / 多语言
//
//  逻辑坐标固定为设计分辨率（9:16）。y：0=顶部(出怪,远)，fieldBottom=底部(炮塔,近)。
// ============================================================================

const CONFIG = {
    designWidth: 450,
    designHeight: 800,
    fieldBottom: 800,      // 炮塔所在 y（贴近画面底部）
    topWallY: 36,
    redLineGap: 80,        // 红线（防线）在炮塔上方的距离，留出缓冲带
    turretDrop: 26,        // 炮塔在场地近端基础上再往下挪（红线不动）
    cols: 6,               // 一行 6 格
    ballRadius: 7,
    captureRadius: 18,

    base: { power: 1, speed: 12.8 },  // 每颗球每击 -1 血；默认球速翻倍

    baseHp: 200,           // 基地生命（砖块越线扣血）

    // 砖块（大小=格子，按列对齐下落，带数字，不重叠）
    brick: {
        speed: 0.336,           // 普通砖统一下落速度（原 0.48 的 70%）
        slowFactor: 0.5,        // 减速弹命中后，砖块移动速度变为 50%
        rewardChance: 0.08,
        rewardChancePerWave: 0.006,
        rewardChanceMax: 0.16,
        rewardHpBase: 4,
        rewardHpPerWave: 1.6,
        splitDurationFrames: 600,
        splitMaxDepth: 2,
        spawnIntervalBase: 168, // 密度减半（生成间隔翻倍）
        spawnIntervalMin: 56,
        toughChance: 0.22, toughMul: 2.6,
        bossChance: 0.14, bossMul: 5.5, bossSpeedMul: 0.5,    // 老怪：血量特别大、移动缓慢
        megaIntervalBase: 1450, megaMul: 11, megaSpeedMul: 0.4, // 大型怪：占 2×2 格、超厚血、极慢
        hpLow: 3, hpLowPerWave: 10,     // 首波低血可清，随波数快速变厚（中后期明显加倍）
        hpSpread: 2, hpSpreadPerWave: 7
    },

    // 弹球类型外观色（横/纵爆破、爆炸球仅用颜色区分）
    ballColors: {
        normal: '#ffd54a',
        pierce: '#b56bff',
        freeze: '#5fd8ff',
        explode: '#ff7a2f',
        hblast: '#ff4d4d',
        vblast: '#ff4ecf',
        return: '#5a5a6a'
    },

    // 升级池（id 与 I18N.upgrades 对应；icon 决定卡片缩略图画法）
    upgradePool: ['addNormal', 'power', 'speed', 'explode', 'pierce', 'freeze', 'hblast', 'vblast'],
    maxBalls: 40
};

const I18N = {
    zh: {
        htmlLang: 'zh-CN',
        title: 'Brick Rush',
        wave: '波数',
        level: '等级',
        kills: '击杀',
        hp: '基地',
        splitTime: '分裂时间',
        splitToast: '分裂时间!',
        menu: '菜单',
        restart: '重新开始',
        language: 'Language: English',
        sfxOn: '游戏音效: 开', sfxOff: '游戏音效: 关',
        musicOn: '背景音乐: 开', musicOff: '背景音乐: 关',
        volume: '音量',
        resume: '继续游戏',
        restartTitle: '重新开始?', restartCopy: '当前进度不会保留，确定重新开始吗?',
        confirmRestart: '确认重开', cancel: '取消',
        instructionsTitle: '操作说明',
        instructionsCopy: '点击或拖动屏幕调整发射方向，弹球自动连发并反弹。击碎单独下落的砖块获得经验，升级时从三张卡片中三选一强化弹球。别让砖块越过红线！',
        start: '开始游戏',
        gameover: '防线告破', finalScore: '坚守到第 {wave} 波 · 击杀 {kills}',
        upgradeTitle: '选择强化',
        upgrades: {
            addNormal: { name: '增加弹球', desc: '+1 颗普通弹球' },
            power: { name: '攻击强化', desc: '所有弹球攻击力 +1' },
            speed: { name: '球速强化', desc: '所有弹球速度提升' },
            explode: { name: '爆炸弹球', desc: '+1 颗爆炸弹，命中产生范围爆炸' },
            pierce: { name: '穿刺弹球', desc: '+1 颗穿刺弹，穿透怪物不反弹' },
            freeze: { name: '减速弹球', desc: '+1 颗减速弹，命中使砖块速度降低 50%' },
            hblast: { name: '横向爆破弹', desc: '+1 颗，命中引发横向冲击波' },
            vblast: { name: '纵向爆破弹', desc: '+1 颗，命中引发纵向冲击波' }
        }
    },
    en: {
        htmlLang: 'en',
        title: 'Brick Rush',
        wave: 'Wave',
        level: 'Lv',
        kills: 'Kills',
        hp: 'Base',
        splitTime: 'Split Time',
        splitToast: 'Split Time!',
        menu: 'Menu',
        restart: 'Restart',
        language: '语言: 中文',
        sfxOn: 'SFX: On', sfxOff: 'SFX: Off',
        musicOn: 'Music: On', musicOff: 'Music: Off',
        volume: 'Volume',
        resume: 'Resume',
        restartTitle: 'Restart?', restartCopy: 'Current progress will be lost. Restart now?',
        confirmRestart: 'Restart', cancel: 'Cancel',
        instructionsTitle: 'How to Play',
        instructionsCopy: 'Tap or drag to aim. Balls auto-fire and bounce. Break the blocks falling one by one for EXP, and pick 1 of 3 upgrade cards when you level up. Don\'t let blocks cross the red line!',
        start: 'Start',
        gameover: 'Line Breached', finalScore: 'Held to wave {wave} · {kills} kills',
        upgradeTitle: 'Choose an Upgrade',
        upgrades: {
            addNormal: { name: 'Extra Ball', desc: '+1 normal ball' },
            power: { name: 'Power Up', desc: 'All balls +1 damage' },
            speed: { name: 'Speed Up', desc: 'All balls move faster' },
            explode: { name: 'Explosive Ball', desc: '+1 ball that blasts an area on hit' },
            pierce: { name: 'Pierce Ball', desc: '+1 ball that pierces through' },
            freeze: { name: 'Slow Ball', desc: '+1 ball that slows blocks by 50%' },
            hblast: { name: 'H-Blast Ball', desc: '+1 ball, horizontal shockwave' },
            vblast: { name: 'V-Blast Ball', desc: '+1 ball, vertical shockwave' }
        }
    }
};
