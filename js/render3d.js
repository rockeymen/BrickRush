// ============================================================================
//  render3d.js — Three.js 渲染层（数据驱动）
//
//  每帧读取 Game 状态（monsters / balls / fx / floatTexts）并用 Map 复用 Mesh、
//  清扫消失实体。坐标映射：worldX=(x-W/2)/10，worldZ=(y-fieldBottom/2)/10。
//  相机：正交斜俯视（霓虹暗色赛博风），固定 9:16。
// ============================================================================

class Renderer3D {
    constructor(game, canvas) {
        this.game = game;
        this.canvas = canvas;
        this.S = 0.1;

        this.scene = new THREE.Scene();
        this.scene.background = this._makeBgTexture();
        this.scene.environment = this._makeEnvTexture();
        this.scene.fog = new THREE.Fog(0x140a2e, 95, 240);

        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        this.viewSize = 40;
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
        this.camera.position.set(0, 80, 62);
        this.camera.lookAt(0, 0, 6);
        this.camera.updateMatrixWorld();
        this._camUp = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

        this.raycaster = new THREE.Raycaster();
        this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

        this._setupLights();

        this.geoCache = {}; this.matCache = {}; this.texCache = {};
        this.brickMap = new Map();
        this.ballMap = new Map();
        this.fxMap = new Map();
        this.floatMap = new Map();
        this._seen = new Set();

        this._buildField();
        this._buildTurret();
        this._buildAimLine();
        this.resize();
    }

    wx(x) { return (x - this.game.W / 2) * this.S; }
    wz(y) { return (y - this.game.fieldBottom / 2) * this.S; }
    ws(v) { return v * this.S; }

    getGeo(k, f) { if (!this.geoCache[k]) this.geoCache[k] = f(); return this.geoCache[k]; }
    getMat(k, f) { if (!this.matCache[k]) this.matCache[k] = f(); return this.matCache[k]; }

    glowMat(color, emi = 0.6, opts = {}) {
        const key = 'g_' + color + '_' + emi + '_' + (opts.metalness || 0) + '_' + (opts.transparent ? 't' + opts.opacity : '') + (opts.roughness || '');
        return this.getMat(key, () => new THREE.MeshStandardMaterial({
            color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: emi,
            metalness: opts.metalness != null ? opts.metalness : 0.3, roughness: opts.roughness != null ? opts.roughness : 0.45,
            flatShading: opts.flat !== false, transparent: !!opts.transparent, opacity: opts.opacity != null ? opts.opacity : 1,
            envMapIntensity: opts.envMapIntensity != null ? opts.envMapIntensity : 1.0
        }));
    }

    _makeEnvTexture() {
        const c = document.createElement('canvas'); c.width = 256; c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 128);
        g.addColorStop(0.0, '#4a3a8e'); g.addColorStop(0.4, '#a85fd0'); g.addColorStop(0.5, '#ff9ae0');
        g.addColorStop(0.62, '#6a4ab0'); g.addColorStop(1.0, '#241a55');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 128);
        // 更亮、更大的高光斑 → 金属面反射出明亮的霓虹光，不发暗
        [[60, 38, '#aef6ff', 46], [180, 46, '#ffc4ee', 50], [128, 26, '#ffffff', 40], [220, 74, '#d8a8ff', 44], [40, 90, '#ffffff', 30]].forEach(([x, y, col, rr]) => {
            const rg = ctx.createRadialGradient(x, y, 0, x, y, rr);
            rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = rg; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
        });
        const tex = new THREE.CanvasTexture(c);
        tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    _makeBgTexture() {
        const c = document.createElement('canvas'); c.width = 4; c.height = 256;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0.0, '#1a0d40'); g.addColorStop(0.42, '#3d1466'); g.addColorStop(0.56, '#9c2f87');
        g.addColorStop(0.72, '#2a1052'); g.addColorStop(1.0, '#0a0620');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 4, 256);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    _glowTex() {
        if (this._gtex) return this._gtex;
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        this._gtex = new THREE.CanvasTexture(c);
        return this._gtex;
    }
    _glowDisc(color, radius, opacity = 0.85) {
        const m = new THREE.MeshBasicMaterial({ map: this._glowTex(), color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
        const d = new THREE.Mesh(this.getGeo('glowplane', () => new THREE.PlaneGeometry(1, 1)), m);
        d.scale.set(radius * 2, radius * 2, 1); d.rotation.x = -Math.PI / 2;
        return d;
    }
    _glowSprite(color, size, opacity = 0.9) {
        const m = new THREE.SpriteMaterial({ map: this._glowTex(), color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
        const s = new THREE.Sprite(m); s.scale.set(size, size, 1);
        return s;
    }

    _setupLights() {
        this.scene.add(new THREE.AmbientLight(0x8a7ab8, 1.15));
        this.scene.add(new THREE.HemisphereLight(0xff7ad0, 0x40308a, 0.85));
        const dir = new THREE.DirectionalLight(0xffffff, 2.1);
        dir.position.set(14, 50, 30); dir.castShadow = true;
        dir.shadow.mapSize.set(1024, 1024);
        dir.shadow.camera.near = 1; dir.shadow.camera.far = 170;
        dir.shadow.camera.left = -30; dir.shadow.camera.right = 30; dir.shadow.camera.top = 60; dir.shadow.camera.bottom = -60;
        dir.shadow.bias = -0.0008; this.scene.add(dir);
        const far = new THREE.PointLight(0xff5ec8, 1.2, 320, 1.2); far.position.set(0, 44, this.wz(0)); this.scene.add(far);
        const near = new THREE.PointLight(0x35e8ff, 1.0, 160); near.position.set(0, 22, this.wz(this.game.fieldBottom)); this.scene.add(near);
    }

    _buildField() {
        const W = this.game.W, H = this.game.fieldBottom;
        const fw = this.ws(W), fh = this.ws(H);
        const field = new THREE.Group();

        // 地面向近端延伸到炮塔下方，保证下移后的炮塔仍踩在地面上
        const farZ = -fh / 2;
        const nearZ = this.wz(this.game.gunY) + this.ws(30);
        const groundDepth = nearZ - farZ;
        const groundCZ = (nearZ + farZ) / 2;

        const ground = new THREE.Mesh(new THREE.PlaneGeometry(fw, groundDepth),
            new THREE.MeshStandardMaterial({ color: 0x180f3a, emissive: 0x120830, emissiveIntensity: 0.6, metalness: 0.3, roughness: 0.78 }));
        ground.rotation.x = -Math.PI / 2; ground.position.z = groundCZ; ground.receiveShadow = true; field.add(ground);
        this.groundMat = ground.material;

        const gridMat = new THREE.LineBasicMaterial({ color: 0x2bd6ff, transparent: true, opacity: 0.32 });
        this.gridMat = gridMat;
        const pts = []; const step = this.ws(this.game.cellW); const x0 = -fw / 2, x1 = fw / 2, z0 = -fh / 2, z1 = fh / 2;
        for (let x = x0; x <= x1 + 1e-3; x += step) pts.push(x, 0.02, z0, x, 0.02, z1);
        for (let z = z1; z >= z0 - 1e-3; z -= step) pts.push(x0, 0.02, z, x1, 0.02, z);
        const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        field.add(new THREE.LineSegments(gg, gridMat));

        const sun = this._glowSprite('#ff57c4', this.ws(540), 0.55); sun.position.set(0, this.ws(82), z0 - this.ws(30)); field.add(sun);
        const sun2 = this._glowSprite('#7a4bff', this.ws(330), 0.5); sun2.position.set(0, this.ws(46), z0 - this.ws(14)); field.add(sun2);

        const spawnBar = new THREE.Mesh(new THREE.BoxGeometry(fw, this.ws(5), this.ws(3)), this.glowMat('#36e6ff', 0.95));
        spawnBar.position.set(0, this.ws(2.5), this.wz(CONFIG.topWallY)); field.add(spawnBar);
        this.spawnBar = spawnBar;

        const lineZ = this.wz(this.game.redLineY);
        const redStrip = new THREE.Mesh(new THREE.PlaneGeometry(fw, this.ws(46)),
            new THREE.MeshBasicMaterial({ color: 0xc01030, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
        redStrip.rotation.x = -Math.PI / 2; redStrip.position.set(0, 0.05, lineZ - this.ws(23)); field.add(redStrip);
        const redBar = new THREE.Mesh(new THREE.BoxGeometry(fw, this.ws(6), this.ws(4)), this.glowMat('#ff2a44', 0.9));
        redBar.position.set(0, this.ws(3), lineZ); field.add(redBar);
        this.redBar = redBar;

        const wallMat = this.glowMat('#7a3bff', 0.7, { metalness: 0.4, roughness: 0.3 });
        this.wallMat = wallMat;
        const wallH = this.ws(16);
        for (const sx of [-1, 1]) {
            const wall = new THREE.Mesh(new THREE.BoxGeometry(this.ws(3), wallH, groundDepth), wallMat);
            wall.position.set(sx * (fw / 2 - this.ws(1.5)), wallH / 2, groundCZ); wall.castShadow = true; field.add(wall);
        }
        const topWall = new THREE.Mesh(new THREE.BoxGeometry(fw, wallH, this.ws(3)), wallMat);
        topWall.position.set(0, wallH / 2, farZ + this.ws(1.5)); field.add(topWall);

        this.scene.add(field); this.field = field;
    }

    _buildTurret() {
        const g = new THREE.Group();
        const accent = '#ff3b4e';
        const disc = this._glowDisc(accent, this.ws(40), 0.8); disc.position.y = 0.12; g.add(disc);
        const base = new THREE.Mesh(new THREE.CylinderGeometry(this.ws(15), this.ws(20), this.ws(10), 8), this.glowMat('#5a1020', 0.4, { metalness: 0.5, roughness: 0.3 }));
        base.position.y = this.ws(5); base.castShadow = true; g.add(base);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(this.ws(15), this.ws(2), 8, 20), this.glowMat(accent, 1.0));
        ring.rotation.x = Math.PI / 2; ring.position.y = this.ws(10); g.add(ring);
        const turn = new THREE.Group(); turn.position.y = this.ws(11);
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(this.ws(4), this.ws(5), this.ws(26), 12), this.glowMat('#ff7a88', 0.5, { metalness: 0.7, roughness: 0.25 }));
        barrel.rotation.x = Math.PI / 2; barrel.position.z = -this.ws(12); barrel.castShadow = true; turn.add(barrel);
        const muzzle = new THREE.Mesh(new THREE.SphereGeometry(this.ws(4.5), 10, 8), this.glowMat(accent, 1.1));
        muzzle.position.z = -this.ws(25); turn.add(muzzle);
        g.add(turn); this._turret = turn;
        g.position.set(this.wx(this.game.gunX), 0, this.wz(this.game.gunY));
        this.scene.add(g); this.turretGroup = g;
    }

    _buildAimLine() {
        this.aimGroup = new THREE.Group(); this.aimDots = [];
        const geo = this.getGeo('aimdot', () => new THREE.SphereGeometry(this.ws(2.6), 8, 6));
        for (let i = 0; i < 9; i++) {
            const dot = new THREE.Mesh(geo, this.glowMat('#ffd54a', 1.0, { transparent: true, opacity: 0.85 }));
            this.aimGroup.add(dot); this.aimDots.push(dot);
        }
        this.scene.add(this.aimGroup);
    }
    _updateAimLine() {
        const g = this.game; const show = g.state === 'PLAYING';
        this.aimGroup.visible = show; if (!show) return;
        const ca = Math.cos(g.aimAngle), sa = Math.sin(g.aimAngle);
        for (let i = 0; i < this.aimDots.length; i++) {
            const t = (i + 1) * 16;
            this.aimDots[i].position.set(this.wx(g.gunX + ca * t), this.ws(13), this.wz(g.gunY + sa * t));
            this.aimDots[i].material.opacity = 0.85 * (1 - i / this.aimDots.length);
        }
    }

    // ---------- 文字贴图 ----------
    _makeTextTexture(str, color) {
        const key = str + '|' + color;
        if (this.texCache[key]) return this.texCache[key];
        const c = document.createElement('canvas');
        const ctx = c.getContext('2d');
        ctx.font = 'bold 62px Arial';
        const textW = Math.ceil(ctx.measureText(str).width);
        c.width = Math.max(192, textW + 76); c.height = 104;
        ctx.font = 'bold 62px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 7;
        ctx.strokeStyle = 'rgba(0,0,0,0.78)';
        ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 10;
        ctx.strokeText(str, c.width / 2, c.height / 2);
        ctx.fillStyle = color;
        ctx.fillText(str, c.width / 2, c.height / 2);
        const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
        this.texCache[key] = tex; return tex;
    }
    _makeTextSprite(str, color, scale) {
        const tex = this._makeTextTexture(str, color);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
        const sp = new THREE.Sprite(mat);
        const aspect = tex.image ? tex.image.width / tex.image.height : 2;
        sp.scale.set(scale * aspect, scale, 1); sp.renderOrder = 1000;
        return sp;
    }
    _makeRewardTexture() {
        if (this.rewardTex) return this.rewardTex;
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 128, 128);
        g.addColorStop(0.0, '#00f5ff');
        g.addColorStop(0.18, '#46ff8a');
        g.addColorStop(0.36, '#fff05a');
        g.addColorStop(0.54, '#ff8a28');
        g.addColorStop(0.72, '#ff43d1');
        g.addColorStop(1.0, '#6b4dff');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        ctx.globalAlpha = 0.32;
        ctx.fillStyle = '#ffffff';
        for (let x = -128; x < 256; x += 28) {
            ctx.beginPath();
            ctx.moveTo(x, 0); ctx.lineTo(x + 10, 0); ctx.lineTo(x + 138, 128); ctx.lineTo(x + 128, 128);
            ctx.closePath(); ctx.fill();
        }
        ctx.globalAlpha = 1;
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
        this.rewardTex = tex; return tex;
    }
    _makeAdvancedTexture() {
        if (this.advancedTex) return this.advancedTex;
        const c = document.createElement('canvas'); c.width = 128; c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createLinearGradient(0, 0, 128, 128);
        g.addColorStop(0.0, '#182452');
        g.addColorStop(0.38, '#255eb8');
        g.addColorStop(0.72, '#6a32a6');
        g.addColorStop(1.0, '#1b1436');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
        ctx.globalAlpha = 0.42;
        ctx.fillStyle = '#aef6ff';
        for (let y = 14; y < 128; y += 28) {
            ctx.fillRect(0, y, 128, 8);
        }
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 128, 10);
        const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
        this.advancedTex = tex; return tex;
    }

    _makeCrackTexture(variant = 0, strokeScale = 1) {
        if (!this.crackTex) this.crackTex = {};
        const weight = Math.max(0.42, Math.min(1, strokeScale));
        const key = `${variant % 4}|${weight.toFixed(2)}`;
        if (this.crackTex[key]) return this.crackTex[key];
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 128, 128);
        ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
        const paths = [
            [[0, 72, 30, 62, 52, 76, 82, 42, 128, 54], [52, 76, 36, 108, 8, 126], [82, 42, 96, 10, 122, 0]],
            [[10, 0, 42, 36, 34, 62, 70, 78, 118, 128], [34, 62, 0, 88], [70, 78, 104, 44, 128, 28]],
            [[0, 34, 38, 46, 62, 28, 92, 70, 128, 64], [62, 28, 72, 0], [92, 70, 72, 110, 78, 128]],
            [[0, 104, 28, 82, 58, 88, 76, 54, 128, 18], [58, 88, 38, 126], [76, 54, 44, 24, 40, 0], [92, 42, 128, 92]]
        ];
        const strokePaths = (list, width, color) => {
            ctx.lineWidth = width;
            ctx.strokeStyle = color;
            for (const path of list) {
                ctx.beginPath();
                ctx.moveTo(path[0], path[1]);
                for (let i = 2; i < path.length; i += 2) ctx.lineTo(path[i], path[i + 1]);
                ctx.stroke();
            }
        };
        const idx = variant % 4;
        strokePaths(paths[idx], 8 * weight, 'rgba(30,34,48,0.82)');
        strokePaths(paths[idx], 4 * weight, 'rgba(255,255,255,0.98)');
        const branches = [
            [[46, 64, 18, 50], [82, 54, 112, 84]],
            [[44, 66, 72, 34], [82, 92, 54, 118]],
            [[46, 42, 22, 76], [86, 62, 118, 36]],
            [[42, 84, 16, 56], [76, 54, 104, 70]]
        ];
        strokePaths(branches[idx], 5 * weight, 'rgba(30,34,48,0.72)');
        strokePaths(branches[idx], 2.5 * weight, 'rgba(255,255,255,0.96)');
        const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
        this.crackTex[key] = tex; return tex;
    }

    _makeCrackSprite(scaleX, scaleZ = scaleX, variant = 0, strokeScale = 1) {
        const mat = new THREE.MeshBasicMaterial({
            map: this._makeCrackTexture(variant, strokeScale),
            transparent: true,
            opacity: 0.96,
            depthWrite: false,
            side: THREE.DoubleSide,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2
        });
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
        plane.rotation.x = -Math.PI / 2;
        plane.scale.set(scaleX, scaleZ, 1);
        plane.visible = false;
        return plane;
    }

    _makeFlameTexture() {
        if (this.flameTex) return this.flameTex;
        const c = document.createElement('canvas'); c.width = c.height = 96;
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 96, 96);
        ctx.shadowColor = '#ff5a24'; ctx.shadowBlur = 12;
        const g = ctx.createLinearGradient(0, 12, 0, 88);
        g.addColorStop(0, '#fff6a4'); g.addColorStop(0.42, '#ff9a24'); g.addColorStop(1, '#ff3c1f');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(48, 8);
        ctx.bezierCurveTo(76, 34, 70, 72, 48, 88);
        ctx.bezierCurveTo(18, 68, 28, 36, 48, 8);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,245,150,0.88)';
        ctx.beginPath();
        ctx.moveTo(51, 32);
        ctx.bezierCurveTo(62, 48, 60, 70, 48, 80);
        ctx.bezierCurveTo(34, 64, 40, 46, 51, 32);
        ctx.fill();
        const tex = new THREE.CanvasTexture(c); tex.needsUpdate = true;
        this.flameTex = tex; return tex;
    }

    _makeFlameSprite(scale) {
        const mat = new THREE.SpriteMaterial({ map: this._makeFlameTexture(), color: new THREE.Color('#ff8a24'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(scale * 0.72, scale, 1);
        sp.visible = false;
        return sp;
    }

    // ================= 砖块（带数字，单独下落） =================
    // 按当前血量分档：数值越高颜色越深、更危险；被打低后同步变浅
    _brickColor(br) {
        const hp = Math.max(1, Math.ceil(br.hp));
        const stops = [
            [2, '#9affc8'],      // 极低血：浅绿
            [8, '#35d8ff'],      // 低血：亮青
            [20, '#245cff'],     // 中低：饱和蓝
            [40, '#15308f'],     // 中等：深蓝
            [80, '#5b25c9'],     // 偏高：深紫
            [120, '#971b93'],    // 高血：紫红
            [180, '#8f1424'],    // 很高：深红
            [260, '#cf2a2d'],    // 危险：红色
            [380, '#dc761f'],    // 高危：橙色
            [520, '#f04b24'],    // 更高：红橙
            [700, '#b11d12'],    // 超高：暗红
            [900, '#6f1717'],    // 极高：深血红
            [1000, '#4a2030'],   // 临界：深紫红
            [Infinity, '#343a42'] // 1000+：最大深灰
        ];
        let hex = '#343a42';
        for (const [t, c] of stops) { if (hp <= t) { hex = c; break; } }
        return new THREE.Color(hex);
    }
    _createBrick(br) {
        const root = new THREE.Group();
        const bw = this.ws(br.hw * 2) * 0.92, bd = this.ws(br.hh * 2) * 0.92, bh = this.ws(34);
        const reward = br.kind === 'reward';
        const advanced = br.kind === 'advanced';
        if (advanced) {
            const chestW = bw * 0.92;
            const chestD = bd * 0.74;
            const bodyH = this.ws(18);
            const lidH = this.ws(13);
            const bodyMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#8c3f16'),
                emissive: new THREE.Color('#4a1706'),
                emissiveIntensity: 0.35,
                metalness: 0.32,
                roughness: 0.38,
                envMapIntensity: 1.45,
                flatShading: true
            });
            const lidMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#b45618'),
                emissive: new THREE.Color('#ff6a00'),
                emissiveIntensity: 0.42,
                metalness: 0.26,
                roughness: 0.3,
                envMapIntensity: 1.65,
                flatShading: true
            });
            const trimMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#ffd05a'),
                emissive: new THREE.Color('#ff8a00'),
                emissiveIntensity: 0.72,
                metalness: 0.82,
                roughness: 0.18,
                envMapIntensity: 2.0
            });
            const lockMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color('#fff0a0'),
                emissive: new THREE.Color('#ffb000'),
                emissiveIntensity: 1.05,
                metalness: 0.9,
                roughness: 0.16,
                envMapIntensity: 2.2
            });
            const body = new THREE.Mesh(new THREE.BoxGeometry(chestW, bodyH, chestD), bodyMat);
            body.position.y = bodyH * 0.5;
            body.castShadow = true; body.receiveShadow = true; root.add(body);
            const lid = new THREE.Mesh(new THREE.BoxGeometry(chestW * 1.03, lidH, chestD * 1.06), lidMat);
            lid.position.y = bodyH + lidH * 0.5;
            lid.castShadow = true; lid.receiveShadow = true; root.add(lid);
            const seam = new THREE.Mesh(new THREE.BoxGeometry(chestW * 1.08, this.ws(2.5), chestD * 1.12), trimMat);
            seam.position.y = bodyH + this.ws(0.6); root.add(seam);
            const topStripe = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.74, this.ws(2.2), chestD * 1.14), trimMat);
            topStripe.position.y = bodyH + lidH + this.ws(0.6); root.add(topStripe);
            const frontRail = new THREE.Mesh(new THREE.BoxGeometry(chestW * 0.82, this.ws(4), this.ws(4)), trimMat);
            frontRail.position.set(0, bodyH + this.ws(1.3), chestD * 0.6); root.add(frontRail);
            const bands = [];
            [-0.28, 0.28].forEach(xn => {
                const band = new THREE.Mesh(new THREE.BoxGeometry(this.ws(5), lidH + this.ws(3), chestD * 1.16), trimMat);
                band.position.set(chestW * xn, bodyH + lidH * 0.5, 0);
                band.castShadow = true; root.add(band); bands.push(band);
            });
            const lock = new THREE.Mesh(new THREE.BoxGeometry(this.ws(17), this.ws(11), this.ws(5)), lockMat);
            lock.position.set(0, bodyH + this.ws(2.2), chestD * 0.64);
            lock.castShadow = true; root.add(lock);
            const keyhole = new THREE.Mesh(new THREE.BoxGeometry(this.ws(4), this.ws(4), this.ws(5.5)), this.glowMat('#2b1630', 0.08, { metalness: 0.2, roughness: 0.5 }));
            keyhole.position.set(0, bodyH + this.ws(1.2), chestD * 0.69); root.add(keyhole);
            const glow = this._glowDisc('#ff9a22', Math.max(chestW, chestD) * 0.74, 0.34);
            glow.position.y = 0.09; root.add(glow);
            const label = this._makeTextSprite(String(Math.ceil(br.hp)), '#ffffff', this.ws(25));
            label.position.set(0, bodyH + lidH + this.ws(10), 0); root.add(label);
            const crackVariant = br.crackVariant != null ? br.crackVariant : (br.uid % 4);
            const crackStrokeScale = 1;
            const crack = this._makeCrackSprite(chestW * 1.0, chestD * 1.0, crackVariant, crackStrokeScale);
            crack.position.set(0, bodyH + lidH + this.ws(0.9), 0);
            root.add(crack);
            const flames = [-0.28, 0.02, 0.29].map((xn) => {
                const fl = this._makeFlameSprite(this.ws(26));
                fl.position.set(chestW * xn, bodyH + lidH + this.ws(8), this.ws(3));
                fl.visible = false; root.add(fl); return fl;
            });
            this.scene.add(root);
            const disposables = [body.geometry, body.material, lid.geometry, lid.material, seam.geometry, seam.material, topStripe.geometry, topStripe.material, frontRail.geometry, frontRail.material, lock.geometry, lock.material, keyhole.geometry, keyhole.material, glow.material, label.material, crack.geometry, crack.material];
            flames.forEach(fl => disposables.push(fl.material));
            bands.forEach(band => disposables.push(band.geometry, band.material));
            return { obj: root, mesh: body, lid, lock, label, crack, crackVariant, crackStrokeScale, flames, flameSpread: chestW * 0.55, kind: br.kind || 'normal', hpShown: Math.ceil(br.hp), bh: bodyH + lidH, slowShown: false, burnShown: false, armorShown: false, disposables };
        }
        const col = reward || advanced ? new THREE.Color('#ffffff') : this._brickColor(br);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), new THREE.MeshStandardMaterial({
            color: col,
            map: reward ? this._makeRewardTexture() : (advanced ? this._makeAdvancedTexture() : null),
            emissive: reward ? new THREE.Color('#ff4cff') : (advanced ? new THREE.Color('#2bd6ff') : col),
            emissiveIntensity: reward ? 0.9 : (advanced ? 0.52 : 0.42),
            metalness: reward ? 0.76 : (advanced ? 0.68 : 0.58),
            roughness: reward ? 0.16 : (advanced ? 0.24 : 0.26),
            flatShading: true,
            envMapIntensity: reward ? 2.1 : (advanced ? 1.65 : 1.4)
        }));
        mesh.position.y = bh / 2; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
        const label = this._makeTextSprite(String(Math.ceil(br.hp)), '#ffffff', this.ws(25));
        label.position.set(0, bh + this.ws(7), 0); root.add(label);
        const crackVariant = br.crackVariant != null ? br.crackVariant : (br.uid % 4);
        const crackStrokeScale = Math.min(1, this.ws(this.game.cellW * 0.92) / Math.max(bw, bd));
        const crack = this._makeCrackSprite(bw * 1.0, bd * 1.0, crackVariant, crackStrokeScale);
        crack.position.set(0, bh + this.ws(0.9), 0);
        root.add(crack);
        const flames = [-0.3, 0, 0.3].map((xn) => {
            const fl = this._makeFlameSprite(this.ws(24));
            fl.position.set(bw * xn, bh + this.ws(8), this.ws(3));
            fl.visible = false; root.add(fl); return fl;
        });
        this.scene.add(root);
        const disposables = [mesh.geometry, mesh.material, label.material, crack.geometry, crack.material];
        flames.forEach(fl => disposables.push(fl.material));
        return { obj: root, mesh, label, crack, crackVariant, crackStrokeScale, flames, flameSpread: bw * 0.55, kind: br.kind || 'normal', hpShown: Math.ceil(br.hp), bh, slowShown: false, burnShown: false, armorShown: false, disposables };
    }
    _updateBrick(rec, br) {
        rec.obj.position.set(this.wx(br.x), 0, this.wz(br.y));
        const hp = Math.ceil(br.hp);
        const slowed = br.slowed > 0;
        const burning = br.burning > 0;
        const armor = br.armorBreak > 0;
        if (hp !== rec.hpShown || slowed !== rec.slowShown || burning !== rec.burnShown || armor !== rec.armorShown) {
            rec.hpShown = hp; rec.slowShown = slowed; rec.burnShown = burning; rec.armorShown = armor;
            if (br.kind !== 'reward' && br.kind !== 'advanced') {
                const col = slowed ? new THREE.Color('#9fe8ff') : this._brickColor(br);
                rec.mesh.material.color.copy(col); rec.mesh.material.emissive.copy(col);
            }
            if (rec.crack) {
                const nextVariant = br.crackVariant != null ? br.crackVariant : (br.uid % 4);
                if (nextVariant !== rec.crackVariant) {
                    rec.crackVariant = nextVariant;
                    rec.crack.material.map = this._makeCrackTexture(nextVariant, rec.crackStrokeScale || 1);
                    rec.crack.material.needsUpdate = true;
                }
                rec.crack.visible = armor;
            }
            rec.label.material.map = this._makeTextTexture(String(hp), '#ffffff');
            rec.label.material.needsUpdate = true;
        }
        if (br.kind === 'reward') {
            const h = (this.game.frame * 0.012 + br.uid * 0.07) % 1;
            rec.mesh.material.color.setHSL(h, 0.92, slowed ? 0.78 : 0.62);
            rec.mesh.material.emissive.setHSL((h + 0.18) % 1, 0.9, 0.48);
        } else if (br.kind === 'advanced') {
            const pulse = 0.95 + Math.sin(this.game.frame * 0.08 + br.uid) * 0.16;
            rec.mesh.material.color.set(slowed ? '#a6743a' : '#8c3f16');
            rec.mesh.material.emissive.set(slowed ? '#3f6f7a' : '#4a1706');
            rec.mesh.material.emissiveIntensity = slowed ? 0.52 : 0.35;
            if (rec.lid) {
                rec.lid.material.color.set(slowed ? '#c89a5a' : '#b45618');
                rec.lid.material.emissive.set(slowed ? '#5fb8c8' : '#ff6a00');
                rec.lid.material.emissiveIntensity = slowed ? 0.45 : 0.36 + pulse * 0.12;
            }
            if (rec.lock) rec.lock.material.emissiveIntensity = slowed ? 0.7 : 0.88 + pulse * 0.18;
        }
        if (rec.flames) {
            const fallback = [{ x: -0.26, y: 0.84 }, { x: 0.2, y: 0.78 }, { x: 0.06, y: 1.0 }];
            const offsets = br.flameOffsets || fallback;
            const count = Math.max(0, Math.min(3, br.flameCount || 2));
            rec.flames.forEach((fl, i) => {
                fl.visible = burning && i < count;
                if (burning) {
                    const off = offsets[i] || fallback[i];
                    fl.position.x = (off.x || 0) * rec.flameSpread;
                    fl.position.y = rec.bh + this.ws(3 + (off.y || 0.8) * 14 + Math.sin(this.game.frame * 0.18 + br.uid + i) * 3);
                    fl.material.color.set('#ff8a24');
                    fl.material.opacity = 0.58 + 0.24 * Math.sin(this.game.frame * 0.22 + i);
                    const s = this.ws(20 + 5 * Math.sin(this.game.frame * 0.17 + i));
                    fl.scale.set(s * 0.72, s, 1);
                }
            });
        }
    }
    _syncBricks() {
        const seen = this._seen; seen.clear();
        for (const br of this.game.bricks) {
            seen.add(br.uid);
            let rec = this.brickMap.get(br.uid);
            if (!rec) { rec = this._createBrick(br); this.brickMap.set(br.uid, rec); }
            this._updateBrick(rec, br);
        }
        for (const [uid, rec] of this.brickMap) if (!seen.has(uid)) { this._removeRec(rec); this.brickMap.delete(uid); }
    }

    // ================= 弹球（基础球小一半，特殊球用颜色区分） =================
    _createBall(ball) {
        const r = this.ws(ball.r);
        const color = CONFIG.ballColors[ball.type] || CONFIG.ballColors.normal;
        const g = new THREE.Group();
        let core;
        if (ball.type === 'pierce') {
            core = new THREE.Mesh(this.getGeo('b_pierce', () => new THREE.ConeGeometry(r * 0.9, r * 2.6, 4)), this.glowMat(color, 1.1, { metalness: 0.3 }));
        } else {
            // normal / explode / hblast / vblast：统一球形，仅颜色不同
            core = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), this.glowMat(color, 1.1, { metalness: 0.2 }));
        }
        g.add(core);
        const halo = this._glowSprite(color, r * 4.2, 0.6); g.add(halo);
        this.scene.add(g);
        return { obj: g, core, halo, type: ball.type, color, disposables: [core.geometry, halo.material] };
    }
    _updateBall(rec, ball) {
        const returning = ball.state === 'returning';
        const color = returning ? CONFIG.ballColors.return : rec.color;
        rec.obj.position.set(this.wx(ball.x), this.ws(13), this.wz(ball.y));
        rec.halo.material.color.set(color);
        rec.halo.material.opacity = returning ? 0.22 : 0.6;
        if (rec.type === 'pierce') {
            rec.core.rotation.set(-Math.PI / 2, 0, 0);
            rec.core.rotation.z = -Math.atan2(ball.vx, -ball.vy);
        }
    }
    _syncBalls() {
        const seen = this._seen; seen.clear();
        for (const ball of this.game.balls) {
            seen.add(ball.uid);
            let rec = this.ballMap.get(ball.uid);
            if (!rec) { rec = this._createBall(ball); this.ballMap.set(ball.uid, rec); }
            this._updateBall(rec, ball);
        }
        for (const [uid, rec] of this.ballMap) if (!seen.has(uid)) { this._removeRec(rec); this.ballMap.delete(uid); }
    }

    // ================= 特效 =================
    _createFx(f) {
        let obj, dispos = [];
        if (f.kind === 'hblast') {
            const geo = new THREE.BoxGeometry(this.ws(this.game.W), this.ws(6), this.ws(f.r * 2));
            const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
            obj = new THREE.Mesh(geo, mat); obj.position.set(0, this.ws(8), this.wz(f.y)); dispos = [geo, mat];
        } else if (f.kind === 'vblast') {
            const geo = new THREE.BoxGeometry(this.ws(f.r * 2), this.ws(6), this.ws(this.game.fieldBottom));
            const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
            obj = new THREE.Mesh(geo, mat); obj.position.set(this.wx(f.x), this.ws(8), 0); dispos = [geo, mat];
        } else if (f.kind === 'chain') {
            const sx = this.wx(f.x), sz = this.wz(f.y), ex = this.wx(f.x2), ez = this.wz(f.y2);
            const midx = (sx + ex) / 2, midz = (sz + ez) / 2;
            const dx = ex - sx, dz = ez - sz;
            const side = new THREE.Vector3(-dz, 0, dx).normalize().multiplyScalar(this.ws(8));
            obj = new THREE.Group();
            const mats = [];
            [-0.75, 0, 0.75].forEach((offset, i) => {
                const jitter = side.clone().multiplyScalar(offset);
                const pts = [
                    new THREE.Vector3(sx + jitter.x * 0.2, this.ws(20 + i), sz + jitter.z * 0.2),
                    new THREE.Vector3(midx + side.x * (1.15 - i * 0.28), this.ws(27 - i), midz + side.z * (1.15 - i * 0.28)),
                    new THREE.Vector3(ex + jitter.x * 0.2, this.ws(20 + i), ez + jitter.z * 0.2)
                ];
                const curve = new THREE.CatmullRomCurve3(pts);
                const geo = new THREE.TubeGeometry(curve, 8, this.ws(i === 1 ? 1.65 : 1.05), 6, false);
                const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(i === 1 ? '#ffffff' : f.color), transparent: true, opacity: i === 1 ? 1 : 0.78, blending: THREE.AdditiveBlending, depthWrite: false });
                obj.add(new THREE.Mesh(geo, mat));
                dispos.push(geo, mat); mats.push(mat);
            });
            this.scene.add(obj);
            return { obj, kind: f.kind, materials: mats, disposables: dispos };
        } else if (f.kind === 'splash') {
            obj = new THREE.Group();
            const ringGeo = new THREE.RingGeometry(this.ws(f.r) * 0.84, this.ws(f.r), 36);
            const coreGeo = new THREE.CircleGeometry(this.ws(f.r) * 0.9, 36);
            const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
            const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
            ringMat.userData.opacityMul = 1;
            coreMat.userData.opacityMul = 1;
            const ring = new THREE.Mesh(ringGeo, ringMat);
            const core = new THREE.Mesh(coreGeo, coreMat);
            ring.rotation.x = -Math.PI / 2; core.rotation.x = -Math.PI / 2;
            obj.add(ring); obj.add(core);
            obj.position.set(this.wx(f.x), 0.2, this.wz(f.y));
            dispos = [ringGeo, ringMat, coreGeo, coreMat];
            this.scene.add(obj);
            return { obj, kind: f.kind, materials: [ringMat, coreMat], disposables: dispos };
        } else if (f.kind === 'flame') {
            const geo = new THREE.ConeGeometry(this.ws(f.r) * 0.45, this.ws(f.r) * 1.15, 8);
            const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
            obj = new THREE.Mesh(geo, mat); obj.position.set(this.wx(f.x), this.ws(18), this.wz(f.y)); dispos = [geo, mat];
        } else if (f.kind === 'crack') {
            const mat = new THREE.SpriteMaterial({ map: this._makeCrackTexture(f.variant || 0), color: new THREE.Color(f.color), transparent: true, opacity: 0.95, depthWrite: false });
            obj = new THREE.Sprite(mat); obj.scale.set(this.ws(f.r) * 1.8, this.ws(f.r) * 1.8, 1); obj.position.set(this.wx(f.x), this.ws(36), this.wz(f.y)); dispos = [mat];
        } else {
            const solid = f.kind === 'slow' || f.kind === 'spark';
            const geo = solid ? new THREE.CircleGeometry(this.ws(f.r), 28) : new THREE.RingGeometry(this.ws(f.r) * 0.35, this.ws(f.r), 28);
            const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(f.color), transparent: true, opacity: solid ? 0.5 : 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
            obj = new THREE.Mesh(geo, mat); obj.rotation.x = -Math.PI / 2; obj.position.set(this.wx(f.x), 0.2, this.wz(f.y)); dispos = [geo, mat];
        }
        this.scene.add(obj);
        return { obj, kind: f.kind, disposables: dispos };
    }
    _syncFx() {
        const seen = this._seen; seen.clear();
        for (const f of this.game.fx) {
            seen.add(f);
            let rec = this.fxMap.get(f);
            if (!rec) { rec = this._createFx(f); this.fxMap.set(f, rec); }
            const baseOp = f.kind === 'splash' ? 0.92 : (f.kind === 'chain' ? 1.0 : (f.kind === 'flame' ? 0.72 : (f.kind === 'crack' ? 0.95 : (f.kind === 'slow' || f.kind === 'spark' ? 0.5 : ((f.kind === 'hblast' || f.kind === 'vblast') ? 0.7 : 0.6)))));
            if (rec.materials) rec.materials.forEach(mat => { mat.opacity = Math.max(0, f.alpha) * baseOp * (mat.userData.opacityMul || 1); });
            else if (rec.obj.material) rec.obj.material.opacity = Math.max(0, f.alpha) * baseOp;
            // pop 环扩大
            if (f.kind === 'pop' || f.kind === 'breach' || f.kind === 'slow' || f.kind === 'spark' || f.kind === 'flame' || f.kind === 'crack') { const s = 1 + (1 - f.alpha) * 0.8; rec.obj.scale.set(s, s, s); }
        }
        for (const [f, rec] of this.fxMap) if (!seen.has(f)) { this._removeRec(rec); this.fxMap.delete(f); }
    }

    // ================= 浮动文字 =================
    _syncFloats() {
        const seen = this._seen; seen.clear();
        for (const f of this.game.floatTexts) {
            seen.add(f);
            let rec = this.floatMap.get(f);
            if (!rec) { const sp = this._makeTextSprite(String(f.str), f.c || '#fff', this.ws(f.s) * 1.2); this.scene.add(sp); rec = { obj: sp, disposables: [sp.material] }; this.floatMap.set(f, rec); }
            const rise = (f.maxLife - f.life) * this.ws(0.8);
            rec.obj.position.set(this.wx(f.x), this.ws(20) + rise, this.wz(f.y));
            rec.obj.material.opacity = Math.max(0, f.life / (f.maxLife || 36));
        }
        for (const [f, rec] of this.floatMap) if (!seen.has(f)) { this._removeRec(rec); this.floatMap.delete(f); }
    }

    render() {
        const fever = this.game.splitTimer > 0;
        const feverPulse = fever ? 0.5 + 0.5 * Math.sin(this.game.frame * 0.18) : 0;
        if (this.gridMat) {
            this.gridMat.color.setHSL(fever ? (0.12 + feverPulse * 0.08) : (0.5 + 0.16 * Math.sin(this.game.frame * 0.006)) % 1, fever ? 1 : 0.9, fever ? 0.64 + feverPulse * 0.18 : 0.6);
            this.gridMat.opacity = fever ? 0.5 + feverPulse * 0.28 : 0.32;
        }
        if (this.groundMat) {
            this.groundMat.emissive.set(fever ? '#4a1738' : '#120830');
            this.groundMat.emissiveIntensity = fever ? 0.9 + feverPulse * 0.55 : 0.6;
        }
        if (this.wallMat) {
            this.wallMat.emissive.set(fever ? '#ffd54a' : '#7a3bff');
            this.wallMat.emissiveIntensity = fever ? 1.0 + feverPulse * 0.65 : 0.7;
        }
        if (this.spawnBar) this.spawnBar.material.emissiveIntensity = fever ? 1.25 + feverPulse * 0.8 : 0.95;
        if (this.redBar) this.redBar.material.emissiveIntensity = fever ? 1.25 + feverPulse * 0.7 : 0.9;
        if (this._turret) { const a = this.game.aimAngle; this._turret.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); }
        this._syncBricks();
        this._syncBalls();
        this._syncFx();
        this._syncFloats();
        this._updateAimLine();
        this.renderer.render(this.scene, this.camera);
    }

    screenToDesign(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera({ x: ndcX, y: ndcY }, this.camera);
        const pt = new THREE.Vector3();
        if (!this.raycaster.ray.intersectPlane(this.groundPlane, pt)) return null;
        return { x: pt.x / this.S + this.game.W / 2, y: pt.z / this.S + this.game.fieldBottom / 2 };
    }

    _removeRec(rec) {
        if (!rec || !rec.obj) return;
        this.scene.remove(rec.obj);
        if (rec.disposables) rec.disposables.forEach(d => d && d.dispose && d.dispose());
    }

    resize() {
        const rect = this.canvas.getBoundingClientRect();
        const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
        this.renderer.setSize(w, h, false);
        const aspect = w / h;
        const halfW = this.ws(this.game.W) / 2;
        const halfDepth = this.ws(this.game.fieldBottom) * 0.42;
        this.viewSize = Math.max(halfW / aspect, halfDepth) + this.ws(4);
        const vs = this.viewSize;
        const yOff = vs * 0.2; // 把战场整体下移，炮台贴近底部，减少底部空挡
        this.camera.left = -vs * aspect; this.camera.right = vs * aspect; this.camera.top = vs + yOff; this.camera.bottom = -vs + yOff;
        this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
    }
}
