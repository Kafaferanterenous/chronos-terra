/* moon.js — Earth–Moon tidal visualizer (Three.js + NASA Blue Marble / night-lights).
   Loaded after app.js. Exposes window.MoonView = { enter(), leave() }.
   Frame co-rotates with Earth: the Sun stays fixed over the day-side (seasonal wobble only),
   while the Moon's sub-point sweeps the planet once per ~24.8 h as the timeline advances. */
(function () {
  'use strict';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const EARTH_R = 6371;              // km
  const MOON_R = 1737.4;             // km
  const MOON_MR = 1 / 81.3004;       // Moon/Earth mass ratio
  const SUN_MR = 332946.05;          // Sun/Earth mass ratio
  const MOON_D0 = 384400;            // km mean distance
  const SUN_D0 = 1.495978707e8;      // km (1 AU)

  const M = {
    active: false, built: false, err: null,
    date: Date.now(),
    bulge: 0.6,          // 0..1 → exaggeration 10^(4.5+2b)
    arrows: true, terminator: true, clouds: true, quakes: true, eruptions: true, qdays: 3,
    scale: 1, orbitR: 5,
    volcsReady: false, cloudTex: null
  };
  const ARROW_ROWS = 5, ARROW_COLS = 12;
  const QCOL = ['#ffd166', '#ff9f43', '#ff6b6b', '#ff2e63'];

  function norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }
  function norm180(x) { x = norm360(x); return x > 180 ? x - 360 : x; }
  function wrapDays(ms) { return (ms - (ms % 86400000)) / 86400000; }

  /* ---------- astronomy (Meeus low precision) ---------- */
  function jy(ms) { return (ms / 86400000 + 2440587.5 - 2451545.0) / 36525; }

  function gmstDeg(T) {
    const jd = T * 36525 + 2451545.0;
    let g = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000;
    return norm360(g);
  }
  function eclToEq(lam, beta, T, dist) {
    const eps = (23.4392911 - 0.0130042 * T) * D2R;
    const se = Math.sin(eps), ce = Math.cos(eps);
    const sl = Math.sin(lam), cl = Math.cos(lam), sb = Math.sin(beta), tb = Math.tan(beta);
    return {
      ra: norm360(Math.atan2(sl * ce - tb * se, cl) * R2D),
      dec: Math.asin(sb * ce + Math.cos(beta) * se * sl) * R2D,
      dist: dist
    };
  }
  function sunPos(T) {
    const L = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
    const g = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T) * D2R;
    const lam = (L + 1.914602 * Math.sin(g) + 0.019993 * Math.sin(2 * g) + 0.000289 * Math.sin(3 * g)) * D2R;
    const distAU = 1.000140 - 0.01670863 * Math.cos(g) - 0.000140 * Math.cos(2 * g);
    return eclToEq(lam, 0, T, distAU * SUN_D0);
  }
  function moonPos(T) {
    const ms = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T) * D2R;
    const mm = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T) * D2R;
    const dm = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T) * D2R;
    const fm = norm360(93.2720993 + 483202.0175273 * T - 0.0034029 * T * T) * D2R;
    const lm = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T);
    const e1 = 1 - 0.002516 * T - 0.0000074 * T * T;
    let lam = lm;
    lam += 6.288774 * e1 * Math.sin(mm);
    lam += 1.274027 * Math.sin(2 * dm - mm);
    lam += 0.658314 * Math.sin(2 * dm);
    lam += 0.213618 * e1 * Math.sin(2 * mm);
    lam -= 0.185116 * e1 * Math.sin(ms);
    lam -= 0.114332 * Math.sin(2 * fm);
    lam += 0.058793 * e1 * Math.sin(2 * dm - 2 * mm);
    lam += 0.057122 * e1 * Math.sin(2 * dm - mm - ms);
    lam += 0.053320 * Math.sin(2 * dm + mm);
    lam += 0.045758 * e1 * Math.sin(2 * dm - 2 * fm);
    lam -= 0.040923 * Math.sin(mm - ms);
    lam -= 0.034720 * Math.sin(dm);
    lam -= 0.030383 * e1 * Math.sin(mm + ms);
    lam += 0.010674 * Math.sin(4 * dm - mm);
    lam += 0.010034 * Math.sin(3 * mm);
    lam += 0.008548 * Math.sin(4 * dm - 2 * mm);
    lam -= 0.007888 * Math.sin(2 * dm + ms);
    lam += 0.006366 * Math.sin(2 * dm - mm + ms);
    lam += 0.005741 * Math.sin(ms - 2 * mm);
    let beta = 0; /* radians */
    beta += 5.128122 * Math.sin(fm) * D2R;
    beta += 0.280602 * e1 * Math.sin(mm + fm) * D2R;
    beta += 0.277693 * e1 * Math.sin(mm - fm) * D2R;
    beta += 0.173237 * Math.sin(2 * dm - fm) * D2R;
    beta += 0.055413 * Math.sin(2 * dm + fm - mm) * D2R;
    beta += 0.046272 * e1 * Math.sin(2 * dm - fm - mm) * D2R;
    beta += 0.032573 * e1 * Math.sin(2 * dm + fm) * D2R;
    const dist = 385000.56
      - 20905.355 * Math.cos(mm)
      - 3699.111 * Math.cos(2 * dm - mm)
      - 2955.968 * Math.cos(2 * dm)
      - 569.925 * Math.cos(2 * mm)
      + 48.888 * Math.cos(ms);
    return eclToEq(lam * D2R, beta, T, dist);
  }
  /* phase illumination from elongation between body dirs */
  function elongation(a, b) {
    let d = norm360(Math.abs(a - b));
    if (d > 180) d = 360 - d;
    return d;
  }
  function phaseName(elong) {
    if (elong < 30) return 'new moon';
    if (elong < 80) return 'waxing crescent';
    if (elong < 100) return 'first quarter';
    if (elong < 150) return 'waxing gibbous';
    if (elong < 180) return 'full moon';
    if (elong < 230) return 'waning gibbous';
    if (elong < 260) return 'last quarter';
    if (elong < 330) return 'waning crescent';
    return 'new moon';
  }
  /* ra/dec → unit vector with +X = RA0, +Y = north celestial pole, z = -cos·sin(ra) */
  function raDecToVec(ra, dec) {
    const cd = Math.cos(dec * D2R), sd = Math.sin(dec * D2R);
    return new THREE.Vector3(cd * Math.cos(ra * D2R), sd, -cd * Math.sin(ra * D2R));
  }
  /* geographic lat/lon (deg east) → unit vector in the co-rotating frame (world) */
  function latLonToVec(lat, lon) {
    const cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
    const cL = Math.cos(lon * D2R), sL = Math.sin(lon * D2R);
    return new THREE.Vector3(cl * cL, sl, -cl * sL);
  }
  function subPointBody(body, gst) {
    return { lat: body.dec, lon: norm180(gst - body.ra) };
  }
  function tideK(body, distKm) {
    return 1.5 * body.mr * Math.pow(EARTH_R / distKm, 3) * EARTH_R; // km — static equilibrium coefficient K
  }

  /* ---------- scene ---------- */
  let renderer, scene, camera;
  let globe, globeMat, clouds, sunLight, atmosphere, moonMesh, sunSprite;
  let arrowMesh, arrowInst = [];
  let quakePts, volcanoPts, eruptionPts;
  let subMoonDot, subSunDot, moonLabel, sunLabel, meridian, equator, axis;
  let stars;
  let raf = 0, lastT = 0, tick = 0;
  const TMP = new THREE.Vector3(), TMP2 = new THREE.Vector3(), Q = new THREE.Quaternion(), MAT = new THREE.Matrix4();

  function makeCloudTexture() {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * 256, y = Math.random() * 128;
      const r = 4 + Math.random() * 22;
      const a = 0.10 + Math.random() * 0.22;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, 'rgba(255,255,255,' + a + ')');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  function labelSprite(text, color, size) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.font = 'bold 46px Segoe UI, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,.8)'; g.shadowBlur = 8;
    g.fillStyle = color;
    g.fillText(text, 64, 32);
    const t = new THREE.CanvasTexture(c);
    t.minFilter = THREE.LinearFilter;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(size, size / 2, 1);
    return sp;
  }

  function buildScene() {
    const wrap = document.getElementById('moonStage');
    renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    wrap.appendChild(renderer.domElement);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040c);

    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    camera.position.set(0, 0.55, M.orbitR + 3.6);
    camera.lookAt(0, 0, 0);

    const amb = new THREE.AmbientLight(0x405074, 0.5);
    scene.add(amb);
    sunLight = new THREE.DirectionalLight(0xffffff, 1.6);
    sunLight.position.copy(raDecToVec(281, -23)).multiplyScalar(40);
    scene.add(sunLight);

    /* Earth — custom shader: day/night textures + terminator + tidal bulge displacement */
    const day = new THREE.TextureLoader().load('vendor/earth-day.jpg');
    const night = new THREE.TextureLoader().load('vendor/earth-night.jpg');
    globeMat = new THREE.ShaderMaterial({
      uniforms: {
        uDay: { value: day }, uNight: { value: night },
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uBulgeA: { value: 0 },
        uBulgeDir: { value: new THREE.Vector3(1, 0, 0) },
        uTerm: { value: 1 }
      },
      vertexShader: [
        'uniform float uBulgeA;',
        'uniform vec3 uBulgeDir;',
        'varying vec2 vUv;',
        'varying vec3 vNormal;',
        'varying vec3 vWorldPos;',
        'void main(){',
        '  vec3 p = position;',
        '  vec3 n = normalize(p);',
        '  float ct = dot(n, uBulgeDir);',
        '  float disp = uBulgeA * (3.0*ct*ct - 1.0) * 0.5;',
        '  p = p * (1.0 + clamp(disp, -0.06, 0.06));',
        '  vUv = uv;',
        '  vNormal = normalize(mat3(modelMatrix) * normal);',
        '  vec4 wp = modelMatrix * vec4(p, 1.0);',
        '  vWorldPos = wp.xyz;',
        '  gl_Position = projectionMatrix * viewMatrix * wp;',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform sampler2D uDay;',
        'uniform sampler2D uNight;',
        'uniform vec3 uSunDir;',
        'uniform float uTerm;',
        'varying vec2 vUv;',
        'varying vec3 vNormal;',
        'varying vec3 vWorldPos;',
        'void main(){',
        '  vec3 n = normalize(vNormal);',
        '  vec3 sun = normalize(uSunDir);',
        '  float ndl = dot(n, sun);',
        '  vec3 day = texture2D(uDay, vUv).rgb;',
        '  vec3 night = texture2D(uNight, vUv).rgb;',
        '  float term = smoothstep(-0.18, 0.02, ndl);',
        '  vec3 col = mix(night * 1.9, day, term);',
        '  float limb = clamp(abs(dot(n, normalize(vWorldPos))), 0.0, 1.0);',
        '  col = mix(col * 0.25, col, smoothstep(0.6, 0.95, limb));',
        '  vec3 twilight = vec3(0.85, 0.38, 0.16) * 0.55 * clamp(1.0 - abs(ndl) * 6.0, 0.0, 1.0);',
        '  col += twilight * (1.0 - term);',
        '  if (uTerm < 0.5) { col = day; }',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    globe = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 72), globeMat);
    scene.add(globe);

    if (M.clouds) {
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(1.012, 64, 40),
        new THREE.MeshBasicMaterial({ map: makeCloudTexture(), transparent: true, opacity: 0.35, depthWrite: false })
      );
      scene.add(clouds);
    }

    atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.048, 64, 48),
      new THREE.ShaderMaterial({
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.BackSide,
        uniforms: { uInt: { value: 0.55 } },
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uInt; varying vec3 vN; void main(){ float i = pow(clamp(vN.z + 0.12, 0.0, 1.0), 2.5); gl_FragColor = vec4(0.35, 0.65, 1.0, i * uInt); }'
      })
    );
    scene.add(atmosphere);

    /* Moon */
    moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(MOON_R / EARTH_R, 48, 32),
      new THREE.MeshStandardMaterial({ color: 0xc9c4b4, roughness: 0.9, metalness: 0.05 })
    );
    scene.add(moonMesh);

    sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9
    }));
    sunSprite.scale.set(2.6, 2.6, 1);
    scene.add(sunSprite);
    function glowTexture() {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,245,200,0.9)');
      grd.addColorStop(0.35, 'rgba(255,210,90,0.35)');
      grd.addColorStop(1, 'rgba(255,180,50,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    }

    /* orbit meridian (great circle of the Moon's overpass longitude) + equator + axis */
    meridian = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.5 })
    );
    equator = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0x5ea8ff, transparent: true, opacity: 0.28 })
    );
    equator.geometry.setFromPoints(circlePoints(0, 360, 0));
    axis = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.25, 0), new THREE.Vector3(0, 1.25, 0)]),
      new THREE.LineBasicMaterial({ color: 0x9b6bff, transparent: true, opacity: 0.4 })
    );
    scene.add(meridian, equator, axis);

    /* tide force arrows (instanced cones floating on the surface) */
    const coneGeo = new THREE.ConeGeometry(0.016, 0.055, 6);
    coneGeo.translate(0, 0.0275, 0);
    arrowMesh = new THREE.InstancedMesh(coneGeo, new THREE.MeshBasicMaterial({ color: 0xffd76a }), ARROW_ROWS * ARROW_COLS * 2);
    scene.add(arrowMesh);

    /* sub-lunar & sub-solar surface dots */
    subMoonDot = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffd76a }));
    subSunDot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 16), new THREE.MeshBasicMaterial({ color: 0x7dfff0 }));
    scene.add(subMoonDot, subSunDot);
    moonLabel = labelSprite('☾', '#ffe08a', 0.6);
    sunLabel = labelSprite('☀', '#8fffe8', 0.5);
    scene.add(moonLabel, sunLabel);

    /* quake + volcano point clouds */
    quakePts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 })
    );
    quakePts.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    quakePts.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    volcanoPts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size: 3.2, sizeAttenuation: false, color: 0xc9401f, transparent: true, opacity: 0.9 })
    );
    volcanoPts.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    eruptionPts = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.PointsMaterial({ size: 4.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95 })
    );
    eruptionPts.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    eruptionPts.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3));
    scene.add(quakePts, volcanoPts, eruptionPts);

    /* stars */
    const sn = 800, sp = new Float32Array(sn * 3);
    for (let i = 0; i < sn; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(180);
      sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.85, sizeAttenuation: false, color: 0x9fb4e8, transparent: true, opacity: 0.8 }));
    scene.add(stars);

    buildVolcanoes();
    wireControls();
    wireOrbit();
    resize();
  }

  function circlePoints(lat, lonStart, lonEnd) {
    const pts = [];
    for (let a = 0; a <= 360; a += 4) {
      pts.push(latLonToVec(lat, lonStart + (a / 360) * (lonEnd - lonStart)));
    }
    return pts;
  }
  function meridianPoints(mdir) {
    /* great circle through north pole and moon direction */
    const up = TMP2.set(0, 1, 0);
    const east = TMP.copy(up).cross(mdir);       // perpendicular
    if (east.length() < 1e-6) east.set(1, 0, 0);
    east.normalize();
    const fwd = new THREE.Vector3().crossVectors(mdir, east).normalize();
    const pts = [];
    for (let a = 0; a <= 360; a += 4) {
      const r = a * D2R;
      pts.push(new THREE.Vector3().copy(east).multiplyScalar(Math.cos(r)).addScaledVector(fwd, Math.sin(r)).normalize());
    }
    return pts;
  }
  function buildVolcanoes() {
    try {
      if (!S.volcs || !S.volcs.v) { M.volcsReady = false; buildVolcanoesT = setTimeout(buildVolcanoes, 1500); return; }
      const v = S.volcs.v;
      const arr = new Float32Array(v.length * 3);
      for (let i = 0; i < v.length; i++) {
        const a = v[i];
        const p = latLonToVec(a[2], a[3]);
        arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z;
      }
      volcanoPts.geometry.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      M.volcsReady = true;
    } catch (e) { M.volcsReady = false; }
  }
  let buildVolcanoesT = 0;

  /* ---------- per-frame update ---------- */
  function update(dt) {
    if (!M.active) return;
    if (S.winStart || S.winEnd) M.date = S.winEnd || Date.now();
    const d = new Date(M.date);
    const T = jy(M.date);
    const gst = gmstDeg(T);
    const sun = sunPos(T);
    const moon = moonPos(T);

    const sunSp = subPointBody(sun, gst);
    const moonSp = subPointBody(moon, gst);
    const sunDir = latLonToVec(sunSp.lat, sunSp.lon);
    const moonDir = latLonToVec(moonSp.lat, moonSp.lon);

    globeMat.uniforms.uSunDir.value.copy(sunDir);
    sunLight.position.copy(sunDir).multiplyScalar(40);
    globeMat.uniforms.uTerm.value = M.terminator ? 1 : 0;
    if (clouds) { cloudMeshRot += dt * 0.012; clouds.rotation.y = cloudMeshRot; }

    /* tides: combined moon + sun equilibrium bulge, exaggerated */
    const Km = tideK({ mr: MOON_MR }, moon.dist);
    const KSun = tideK({ mr: SUN_MR }, sun.dist);
    const EXAG = Math.pow(10, 4.5 + 2.0 * M.bulge);
    const sumA = (Km + KSun) * EXAG;
    /* bulge direction = weighted sum of the two axes */
    const bdir = TMP.copy(moonDir).multiplyScalar(Km).addScaledVector(sunDir, KSun).normalize();
    globeMat.uniforms.uBulgeA.value = sumA;
    globeMat.uniforms.uBulgeDir.value.copy(bdir);

    /* moon position + sub-marker */
    moonMesh.position.copy(moonDir).multiplyScalar(M.orbitR);
    const sr = 1 + 0.012;
    subMoonDot.position.copy(moonDir).multiplyScalar(sr);
    subSunDot.position.copy(sunDir).multiplyScalar(sr);
    moonLabel.position.copy(moonDir).multiplyScalar(1.09);
    sunLabel.position.copy(sunDir).multiplyScalar(1.07);
    meridian.geometry.setFromPoints(meridianPoints(moonDir));
    sunSprite.position.copy(sunDir).multiplyScalar(9.5);

    updateArrows(moonDir, sunDir, Km, KSun, EXAG);
    updateQuakes();
    updateEruptions();

    if (tick % 4 === 0) updateReadout(d, sun, moon, sunSp, moonSp);
    tick++;
  }

  function updateArrows(moonDir, sunDir, Km, KSun, EXAG) {
    if (!M.arrows) { arrowMesh.visible = false; return; }
    arrowMesh.visible = true;
    let k = 0;
    const nrm = Math.max(Km, KSun) || 1e-9;
    const zY = new THREE.Vector3(0, 1, 0);
    const dirT = new THREE.Vector3(), posT = new THREE.Vector3(), compT = new THREE.Vector3();
    const scaleT = new THREE.Vector3(1, 1, 1);
    for (let r = 0; r < ARROW_ROWS; r++) {
      const lat = -60 + r * 30;
      for (let c = 0; c < ARROW_COLS; c++) {
        const lon = -180 + c * 30 + (r % 2 ? 15 : 0);
        const p = latLonToVec(lat, lon);
        for (let b = 0; b < 2; b++) {
          const axis = b === 0 ? moonDir : sunDir;
          const K = b === 0 ? Km : KSun;
          const th = Math.acos(Math.max(-1, Math.min(1, p.dot(axis))));
          const comp = compT.copy(axis).addScaledVector(p, -p.dot(axis));
          let dir;
          if (comp.lengthSq() < 1e-10) { dir = dirT.set(1, 0, 0); }
          else { dir = comp.normalize(); }
          if (p.dot(axis) < 0) dir.multiplyScalar(-1);
          const str = Math.abs(Math.sin(2 * th)) * (K / nrm);
          const len = 0.06 + 0.30 * Math.min(1, str);
          Q.setFromUnitVectors(zY, dir);
          posT.copy(p).multiplyScalar(1.008).addScaledVector(dir, len * 0.5);
          scaleT.set(1, len / 0.055, 1);
          MAT.compose(posT, Q, scaleT);
          arrowMesh.setMatrixAt(k, MAT);
          k++;
        }
      }
    }
    for (; k < arrowMesh.count; k++) {
      MAT.makeScale(0, 0, 0);
      arrowMesh.setMatrixAt(k, MAT);
    }
    arrowMesh.instanceMatrix.needsUpdate = true;
  }

  let qDayCache = { day: -1, days: 0, count: 0, lo: 0, hi: 0, sorted: false, arr: null };
  function updateQuakes() {
    if (!M.quakes || !S_q_ready()) { quakePts.visible = false; return; }
    quakePts.visible = true;
    const tArr = S.q.t;
    const day = Math.floor(M.date / 86400000);
    if (qDayCache.day !== day || qDayCache.days !== M.qdays || !qDayCache.sorted) {
      qDayCache.day = day;
      qDayCache.days = M.qdays;
      if (!qDayCache.sorted) {
        /* ensure ascending */
        let sorted = true;
        for (let i = 1; i < tArr.length; i++) { if (tArr[i] < tArr[i - 1]) { sorted = false; break; } }
        if (!sorted) { const order = Array.from({ length: tArr.length }, (_, i) => i).sort((a, b) => tArr[a] - tArr[b]); qDayCache.arr = order; }
        qDayCache.sorted = true;
      }
      const loSec = (day - M.qdays) * 86400, hiSec = (day + M.qdays + 1) * 86400;
      binaryBounds(loSec, hiSec, qDayCache.arr || null, v => {
        qDayCache.lo = v[0]; qDayCache.hi = v[1]; qDayCache.count = v[2];
      });
    }
    const n = qDayCache.count;
    if (n === 0) { quakePts.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3)); quakePts.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(0), 3)); return; }
    const maxPts = 4000;
    const kk = Math.min(n, maxPts);
    const pos = new Float32Array(kk * 3), col = new Float32Array(kk * 3);
    const step = Math.max(1, Math.floor(n / maxPts));
    let o = 0;
    const idx = qDayCache.arr || new Int32Array(0);
    for (let i = qDayCache.lo; i < qDayCache.hi && o < kk; i += step) {
      const j = idx.length ? idx[i] : i;
      const mag = S.q.m[j];
      const syzCol = (SET.syz !== 'off') && S.q.syz && S.q.syz[j];
      const c = syzCol ? '#ffd23f' : QCOL[mag >= 7.5 ? 3 : mag >= 6.5 ? 2 : mag >= 5.5 ? 1 : 0];
      const p = latLonToVec(S.q.la[j], S.q.lo[j]);
      pos[o * 3] = p.x; pos[o * 3 + 1] = p.y; pos[o * 3 + 2] = p.z;
      const C = new THREE.Color(c);
      col[o * 3] = C.r; col[o * 3 + 1] = C.g; col[o * 3 + 2] = C.b;
      o++;
    }
    const og = quakePts.geometry;
    og.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, o * 3), 3));
    og.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, o * 3), 3));
  }
  function S_q_ready() { return !!(S && S.q && S.q.t); }

  let erupCache = { day: -1, days: 0, out: [] };
  function updateEruptions() {
    if (!M.eruptions) { eruptionPts.visible = false; return; }
    if (!S.volcs || !S.volcs.e || !S.volcs.v || !S.volcsByNum) { eruptionPts.visible = false; return; }
    eruptionPts.visible = true;
    const e = S.volcs.e;
    const day = Math.floor(M.date / 86400000);
    if (erupCache.day !== day || erupCache.days !== M.qdays) {
      erupCache.day = day; erupCache.days = M.qdays;
      const lo = (day - M.qdays) * 86400000, hi = (day + M.qdays + 1) * 86400000;
      const out = [];
      for (let i = 0; i < e.length; i++) {
        const mo = e[i][1];
        if (mo == null) continue;
        const t = Date.UTC(e[i][0], mo - 1, 15);
        if (t >= lo && t <= hi) out.push(i);
      }
      erupCache.out = out;
    }
    const list = erupCache.out;
    const syzOn = (SET.syz !== 'off') && S.eruptionSyz;
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3);
    let n = 0;
    for (let o = 0; o < list.length; o++) {
      const i = list[o];
      const vi = S.volcsByNum.get(e[i][2]);
      if (vi == null) continue;
      const a = S.volcs.v[vi];
      const p = latLonToVec(a[2], a[3]);
      pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
      const C = new THREE.Color((syzOn && S.eruptionSyz[i]) ? 0xffd23f : 0xff5a3c);
      col[n * 3] = C.r; col[n * 3 + 1] = C.g; col[n * 3 + 2] = C.b;
      n++;
    }
    eruptionPts.geometry.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, n * 3), 3));
    eruptionPts.geometry.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, n * 3), 3));
  }
  function binaryBounds(loSec, hiSec, order, done) {
    const t = S.q.t;
    const at = order || null;
    const len = t.length;
    let lo = 0, hi = len - 1, a = 0, b = len - 1;
    /* binary search lower bound */
    let L = 0, R = len;
    while (L < R) { const m = (L + R) >> 1; const j = at ? at[m] : m; if (t[j] < loSec) L = m + 1; else R = m; }
    a = L;
    L = 0; R = len;
    while (L < R) { const m = (L + R) >> 1; const j = at ? at[m] : m; if (t[j] <= hiSec) L = m + 1; else R = m; }
    b = L;
    done([a, b, b - a]);
  }

  function updateReadout(d, sun, moon, sunSp, moonSp) {
    const el = document.getElementById('moonInfo');
    if (!el) return;
    const elong = elongation(sun.ra, moon.ra);
    const illum = (1 - Math.cos(elong * D2R)) / 2;
    const KsunCur = tideK({ mr: SUN_MR }, sun.dist) * Math.pow(SUN_D0 / sun.dist, 3);
    const KmoonCur = tideK({ mr: MOON_MR }, moon.dist) * Math.pow(MOON_D0 / moon.dist, 3);
    const lat = (x) => Math.abs(x).toFixed(1) + '°' + (x >= 0 ? 'N' : 'S');
    const lon = (x) => Math.abs(x).toFixed(1) + '°' + (x >= 0 ? 'E' : 'W');
    el.innerHTML =
      '<span class="mr"><b>📅</b> ' + d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC</span>' +
      '<span class="mr"><b>☾</b> ' + Math.round(illum * 100) + '% · ' + phaseName(elong) + '</span>' +
      '<span class="mr"><b>distance</b> ' + Math.round(moon.dist).toLocaleString() + ' km</span>' +
      '<span class="mr"><b>sub-lunar</b> ' + lat(moonSp.lat) + ', ' + lon(moonSp.lon) + '</span>' +
      '<span class="mr"><b>sub-solar</b> ' + lat(sunSp.lat) + ', ' + lon(sunSp.lon) + '</span>' +
      '<span class="mr"><b>tide</b> moon ' + (KmoonCur * 100000).toFixed(0) + ' cm · sun ' + (KsunCur * 100000).toFixed(0) + ' cm <i>(static eq.)</i></span>';
  }

  function renderLoop(now) {
    if (!M.active) return;
    raf = requestAnimationFrame(renderLoop);
    if (!lastT) lastT = now;
    const dt = Math.min(0.25, (now - lastT) / 1000);
    lastT = now;
    update(dt);
    renderer.render(scene, camera);
  }

  /* ---------- controls ---------- */
  function wireControls() {
    const b = (id) => document.getElementById(id);
    if (b('moonBulge')) {
      b('moonBulge').addEventListener('input', (e) => {
        M.bulge = +e.target.value;
        const ex = Math.pow(10, 4.5 + 2.0 * M.bulge);
        const lbl = b('moonBulgeLbl'); if (lbl) lbl.textContent = '×' + (ex >= 1000 ? (ex / 1000).toFixed(0) + 'k' : ex.toFixed(0));
      });
    }
    if (b('moonArrows')) b('moonArrows').addEventListener('change', (e) => { M.arrows = e.target.checked; });
    if (b('moonTerm')) b('moonTerm').addEventListener('change', (e) => { M.terminator = e.target.checked; });
    if (b('moonClouds')) b('moonClouds').addEventListener('change', (e) => { if (clouds) { clouds.visible = M.clouds = e.target.checked; } });
    if (b('moonQuakes')) b('moonQuakes').addEventListener('change', (e) => { M.quakes = e.target.checked; });
    if (b('moonEruptions')) b('moonEruptions').addEventListener('change', (e) => { M.eruptions = e.target.checked; });
    if (b('moonQdays')) b('moonQdays').addEventListener('change', (e) => { M.qdays = +e.target.value; });
    if (b('moonSpd')) {
      const chips = b('moonSpd').querySelectorAll('button');
      const refresh = () => {
        const cur = (+SET.speed || 10) * 24;   /* days/s -> hours per second */
        chips.forEach(bt => bt.classList.toggle('on', Math.abs((+bt.dataset.h || 0) - cur) < 0.01));
      };
      chips.forEach(bt => bt.addEventListener('click', () => {
        SET.speed = (+bt.dataset.h || 24) / 24;
        const sel = b('setSpeed'); if (sel) sel.value = String(SET.speed);
        if (typeof saveSet === 'function') saveSet();
        refresh();
      }));
      refresh();
    }
  }

  /* ---------- orbit camera ---------- */
  function wireOrbit() {
    const dom = renderer.domElement;
    let dragging = false, px = 0, py = 0, theta = 0, phi = -0.06, dist = M.orbitR + 3.6;
    dom.addEventListener('pointerdown', (e) => {
      dragging = true; px = e.clientX; py = e.clientY;
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      /* MapLibre-globe feel: the planet follows the cursor (drag right -> spins right,
         drag down -> tips the north toward you) */
      theta += (e.clientX - px) * 0.005;
      phi += (e.clientY - py) * 0.005;
      phi = Math.max(-1.4, Math.min(1.4, phi));
      px = e.clientX; py = e.clientY;
      setCam();
    });
    const up = (e) => { dragging = false; };
    dom.addEventListener('pointerup', up); dom.addEventListener('pointercancel', up);
    dom.addEventListener('wheel', (e) => {
      e.preventDefault();
      dist = Math.max(2.1, Math.min(30, dist * (1 + e.deltaY * 0.0012)));
      setCam();
    }, { passive: false });
    dom.addEventListener('dblclick', (e) => {
      dist = Math.max(2.1, dist * 0.6);
      setCam();
    });
    function setCam() {
      const sp = Math.cos(phi), r = dist;
      camera.position.set(r * sp * Math.sin(theta), Math.sin(phi) * r, r * sp * Math.cos(theta));
      camera.lookAt(0, 0, 0);
    }
    window.addEventListener('resize', resize);
  }
  function resize() {
    const wrap = document.getElementById('moonStage');
    if (!wrap || !renderer) return;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.MoonView = {
    enter() {
      if (M.err) return;
      if (!M.built) {
        try { buildScene(); M.built = true; }
        catch (e) {
          M.err = String(e && e.message || e); M.built = false;
          console.error('moon build failed:', e);
          if (renderer && renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
          renderer = null;
        }
      }
      if (!M.built) return;
      M.active = true;
      lastT = 0;
      resize();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(renderLoop);
    },
    leave() {
      M.active = false;
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };
  /* cloud rotate var */
  let cloudMeshRot = 0;
})();