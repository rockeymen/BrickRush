// ============================================================================
//  icons.js — 升级卡片缩略图绘制（2D Canvas）
//  每种升级画一个有辨识度的小图标；不同弹球样式各不相同。
// ============================================================================

function drawUpgradeIcon(ctx, id) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;

    // 背景柔光
    const bg = ctx.createRadialGradient(cx, cy, 4, cx, cy, W * 0.6);
    bg.addColorStop(0, 'rgba(120,90,200,0.25)');
    bg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    const ball = (x, y, r, color, glow) => {
        ctx.save();
        ctx.shadowColor = glow || color; ctx.shadowBlur = 16;
        const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, color); g.addColorStop(1, color);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    };

    if (id === 'addNormal') {
        ball(cx - 12, cy + 6, 20, '#ffd54a');
        ball(cx + 16, cy - 10, 14, '#ffd54a');
        ctx.fillStyle = '#fff'; ctx.font = 'bold 30px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.fillText('+', cx + 34, cy + 22);
    } else if (id === 'power') {
        ball(cx, cy + 8, 22, '#ff7a3a');
        // 上箭头
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffb070'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.moveTo(cx, cy - 34); ctx.lineTo(cx + 16, cy - 12); ctx.lineTo(cx + 6, cy - 12);
        ctx.lineTo(cx + 6, cy); ctx.lineTo(cx - 6, cy); ctx.lineTo(cx - 6, cy - 12); ctx.lineTo(cx - 16, cy - 12); ctx.closePath(); ctx.fill();
    } else if (id === 'speed') {
        ball(cx + 8, cy, 18, '#ffd54a');
        ctx.strokeStyle = '#9af6ff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.shadowColor = '#9af6ff'; ctx.shadowBlur = 10;
        for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(cx - 34 - i * 0, cy - 14 + i * 14); ctx.lineTo(cx - 12, cy - 14 + i * 14); ctx.stroke(); }
    } else if (id === 'splitPlus') {
        ball(cx, cy + 2, 16, '#ffe85a', '#ff4fd8');
        ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.shadowColor = '#ff4fd8'; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(cx, cy + 2, 32, -Math.PI * 0.2, Math.PI * 1.25); ctx.stroke();
        ctx.fillStyle = '#fff8b8'; ctx.font = 'bold 24px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffd54a'; ctx.shadowBlur = 10; ctx.fillText('+5', cx, cy - 34);
    } else if (id === 'fireDuration') {
        ball(cx, cy + 20, 12, '#ff5a24', '#ff9a24');
        ctx.fillStyle = '#ff7a24'; ctx.shadowColor = '#ff5a24'; ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 38);
        ctx.bezierCurveTo(cx + 24, cy - 10, cx + 18, cy + 22, cx, cy + 38);
        ctx.bezierCurveTo(cx - 24, cy + 14, cx - 16, cy - 14, cx, cy - 38);
        ctx.fill();
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath();
        ctx.moveTo(cx + 2, cy - 16);
        ctx.bezierCurveTo(cx + 13, cy - 3, cx + 9, cy + 15, cx, cy + 26);
        ctx.bezierCurveTo(cx - 10, cy + 10, cx - 6, cy - 5, cx + 2, cy - 16);
        ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 25px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffcf70'; ctx.shadowBlur = 10; ctx.fillText('+1s', cx, cy - 44);
    } else if (id === 'chainLinks') {
        ball(cx - 26, cy + 18, 10, '#7cf7ff', '#7cf7ff');
        ball(cx + 2, cy - 4, 11, '#7cf7ff', '#7cf7ff');
        ball(cx + 30, cy + 18, 10, '#7cf7ff', '#7cf7ff');
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = '#7cf7ff'; ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(cx - 38, cy + 28);
        ctx.lineTo(cx - 8, cy - 10);
        ctx.lineTo(cx + 8, cy + 6);
        ctx.lineTo(cx + 38, cy - 28);
        ctx.stroke();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#7cf7ff'; ctx.shadowBlur = 10; ctx.fillText('+1', cx, cy - 42);
    } else if (id === 'spikeDamage') {
        ball(cx, cy + 8, 14, '#e6eef7', '#ffffff');
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'miter';
        ctx.shadowColor = '#dce8ff'; ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(cx - 34, cy + 22);
        ctx.lineTo(cx - 10, cy + 2);
        ctx.lineTo(cx + 2, cy + 12);
        ctx.lineTo(cx + 28, cy - 18);
        ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 27px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10; ctx.fillText('+10%', cx, cy - 38);
    } else if (id === 'explode') {
        ball(cx, cy, 14, '#ff7a2f');
        ctx.strokeStyle = '#ff7a30'; ctx.lineWidth = 4; ctx.shadowColor = '#ff7a30'; ctx.shadowBlur = 12;
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 20); ctx.lineTo(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36); ctx.stroke(); }
    } else if (id === 'pierce') {
        ball(cx, cy, 20, '#b56bff');
        // 穿刺箭
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.shadowColor = '#d8b0ff'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.moveTo(cx - 38, cy + 16); ctx.lineTo(cx + 34, cy - 18); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx + 40, cy - 22); ctx.lineTo(cx + 22, cy - 22); ctx.lineTo(cx + 30, cy - 6); ctx.closePath(); ctx.fill();
    } else if (id === 'slow') {
        ball(cx, cy, 18, '#8eeeff', '#5fdcff');
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.shadowColor = '#8eeeff'; ctx.shadowBlur = 12;
        for (let i = 0; i < 6; i++) {
            const a = i * Math.PI / 3;
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 34, cy + Math.sin(a) * 34); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24);
            ctx.lineTo(cx + Math.cos(a + 0.34) * 18, cy + Math.sin(a + 0.34) * 18);
            ctx.stroke();
        }
    } else if (id === 'chain') {
        ball(cx - 14, cy + 10, 12, '#7cf7ff', '#7cf7ff');
        ball(cx + 18, cy - 14, 14, '#7cf7ff', '#7cf7ff');
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.shadowColor = '#7cf7ff'; ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(cx - 34, cy + 22);
        ctx.lineTo(cx - 10, cy - 4);
        ctx.lineTo(cx + 2, cy + 7);
        ctx.lineTo(cx + 34, cy - 26);
        ctx.stroke();
    } else if (id === 'fire') {
        ball(cx, cy + 10, 15, '#ff5a24', '#ff9a24');
        ctx.fillStyle = '#ff7a24'; ctx.shadowColor = '#ff5a24'; ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 42);
        ctx.bezierCurveTo(cx + 26, cy - 14, cx + 20, cy + 18, cx, cy + 34);
        ctx.bezierCurveTo(cx - 24, cy + 13, cx - 18, cy - 14, cx, cy - 42);
        ctx.fill();
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath();
        ctx.moveTo(cx + 2, cy - 20);
        ctx.bezierCurveTo(cx + 14, cy - 5, cx + 10, cy + 14, cx, cy + 24);
        ctx.bezierCurveTo(cx - 12, cy + 10, cx - 7, cy - 6, cx + 2, cy - 20);
        ctx.fill();
    } else if (id === 'spike') {
        ball(cx, cy, 16, '#e6eef7', '#ffffff');
        ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#dce8ff'; ctx.shadowBlur = 14;
        for (let i = 0; i < 8; i++) {
            const a = i * Math.PI / 4;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a - 0.12) * 18, cy + Math.sin(a - 0.12) * 18);
            ctx.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42);
            ctx.lineTo(cx + Math.cos(a + 0.12) * 18, cy + Math.sin(a + 0.12) * 18);
            ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = '#283044'; ctx.lineWidth = 3; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.moveTo(cx - 24, cy - 2); ctx.lineTo(cx - 6, cy + 6); ctx.lineTo(cx + 4, cy - 8); ctx.lineTo(cx + 24, cy + 2); ctx.stroke();
    } else if (id === 'hblast') {
        ball(cx, cy, 18, '#ff4d4d');
        ctx.fillStyle = 'rgba(255,77,77,0.85)'; ctx.shadowColor = '#ff4d4d'; ctx.shadowBlur = 14;
        ctx.fillRect(6, cy - 5, W - 12, 10);
    } else if (id === 'vblast') {
        ball(cx, cy, 18, '#ff4ecf');
        ctx.fillStyle = 'rgba(255,78,207,0.85)'; ctx.shadowColor = '#ff4ecf'; ctx.shadowBlur = 14;
        ctx.fillRect(cx - 5, 6, 10, H - 12);
    }
}

if (typeof window !== 'undefined') window.drawUpgradeIcon = drawUpgradeIcon;
