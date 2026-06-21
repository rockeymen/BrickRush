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
    } else if (id === 'freeze') {
        ball(cx, cy, 20, '#5fd8ff');
        // 减速箭头
        ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.shadowColor = '#bff3ff'; ctx.shadowBlur = 10;
        for (let i = 0; i < 3; i++) {
            const y = cy - 28 + i * 16;
            ctx.beginPath(); ctx.moveTo(cx - 18, y); ctx.lineTo(cx, y + 14); ctx.lineTo(cx + 18, y); ctx.stroke();
        }
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
