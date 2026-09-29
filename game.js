(() => {
  'use strict';
  document.documentElement.lang = 'tr';

  /* ═════════ Yardımcılar ═════════ */
  const $ = (id) => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const FONT_NUM = '"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif';
  const FONT_DISPLAY = '"Bungee", Impact, "Arial Black", sans-serif';

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    const r = Math.round((n >> 16) + (t - (n >> 16)) * p);
    const g = Math.round(((n >> 8) & 255) + (t - ((n >> 8) & 255)) * p);
    const b = Math.round((n & 255) + (t - (n & 255)) * p);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Türkçe kısaltmalar: bin, milyon, milyar, trilyon, katrilyon... sonrası üslü gösterim
  const SUFFIX = ['', 'B', 'M', 'Mr', 'T', 'Kt', 'Kn', 'Sk', 'Sp', 'Ok', 'No', 'Dc'];
  function fmt(n) {
    if (!isFinite(n)) return '∞';
    if (n < 10 && n % 1 !== 0) return (Math.floor(n * 10) / 10).toFixed(1).replace('.', ',');
    if (n < 1000) return String(Math.floor(n));
    if (n >= 1e36) return n.toExponential(2).replace('.', ',').replace('e+', 'e');
    let i = 0;
    while (n >= 1000 && i < SUFFIX.length - 1) { n /= 1000; i++; }
    let s = n >= 100 ? String(Math.floor(n)) : n >= 10 ? (Math.floor(n * 10) / 10).toFixed(1) : (Math.floor(n * 100) / 100).toFixed(2);
    if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s.replace('.', ',') + SUFFIX[i];
  }
  const kg = (v) => (v < 1000 ? `${Math.floor(v)} kg` : `${fmt(v / 1000)} t`);
  const dec = (x) => String(Math.round(x * 100) / 100).replace('.', ',');
  const pct = (x) => String(Math.round(x * 1000) / 10).replace('.', ',');
  const upperTR = (s) => s.toLocaleUpperCase('tr-TR');
  const lowerTR = (s) => s.toLocaleLowerCase('tr-TR');
  function roman(n) {
    let s = '';
    for (const [c, v] of [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]]) while (n >= v) { s += c; n -= v; }
    return s;
  }


  /* ═════════ Maden ayarı: config.json (sunucuyla ortak) ═════════ */
  // Sunucu katman canını bu dosyadan hesaplar. Buradaki kopya sadece dosya okunamazsa kullanılır.
  const DEFAULT_CFG = {
    layerM: 4,
    mines: [
      { name: 'Çayır Ocağı', layers: 10, hp0: 1500, grow: 1.40, gpd: 0.15, xp: 10, gems: 1 },
      { name: 'Kömür Ocağı', layers: 12, hp0: 30000, grow: 1.39, gpd: 0.3, xp: 16, gems: 2 },
      { name: 'Altın Madeni', layers: 14, hp0: 600000, grow: 1.38, gpd: 0.6, xp: 26, gems: 3 },
      { name: 'Safir Mağarası', layers: 16, hp0: 12000000, grow: 1.37, gpd: 1.2, xp: 42, gems: 4 },
      { name: 'Çekirdek Kuyusu', layers: 18, hp0: 240000000, grow: 1.36, gpd: 2.4, xp: 68, gems: 5 },
      { name: 'Derinlik Kapısı', layers: 20, hp0: 4800000000, grow: 1.35, gpd: 4.8, xp: 110, gems: 6 },
    ],
  };
  let CFG = DEFAULT_CFG;
  let MINES = CFG.mines;
  let LM = CFG.layerM;   // bir katmanın kalınlığı (metre)

  /* ═════════ Damarlar: her madenin katmanları kendi renklerinde ═════════ */
  const PER_BIOME = 10;
  const BIOMES = [
    { name: 'Toprak',        top: '#9b6a3f', mid: '#7a4e2b', low: '#5a3719', fleck: '#b9895a', vein: '#d9a466' },
    { name: 'Kil',           top: '#b0603f', mid: '#8c4730', low: '#6a3122', fleck: '#cf8a68', vein: '#eeb08c' },
    { name: 'Kum Taşı',      top: '#c9a25a', mid: '#a78343', low: '#826330', fleck: '#e3c689', vein: '#fbe3a8' },
    { name: 'Granit',        top: '#8c8f96', mid: '#6d7078', low: '#4f525a', fleck: '#b7b9bf', vein: '#e6cfc6' },
    { name: 'Kömür',         top: '#45464b', mid: '#333438', low: '#1f2023', fleck: '#16171a', vein: '#a9b3c6' },
    { name: 'Bakır',         top: '#9a6a4c', mid: '#7a5039', low: '#5b3a29', fleck: '#d8894d', vein: '#4fd1a3' },
    { name: 'Demir',         top: '#7d7f86', mid: '#61636a', low: '#46484e', fleck: '#b5714a', vein: '#e0915a' },
    { name: 'Gümüş',         top: '#9aa3ad', mid: '#7b838d', low: '#5a6069', fleck: '#d9dee4', vein: '#f4f8ff' },
    { name: 'Altın',         top: '#6f5a33', mid: '#574524', low: '#3f3118', fleck: '#8a7443', vein: '#ffd045' },
    { name: 'Bazalt',        top: '#3d3f44', mid: '#2e3034', low: '#212226', fleck: '#55585e', vein: '#8fb3c9' },
    { name: 'Zümrüt',        top: '#2f5b4a', mid: '#244739', low: '#18332a', fleck: '#3f7a62', vein: '#46f0a0' },
    { name: 'Kristal',       top: '#3f5f8f', mid: '#314b73', low: '#233756', fleck: '#6f93c7', vein: '#8ff0ff' },
    { name: 'Yakut',         top: '#5a2330', mid: '#461a25', low: '#32111a', fleck: '#7a3040', vein: '#ff4d6d' },
    { name: 'Safir',         top: '#243a6b', mid: '#1b2d55', low: '#13203d', fleck: '#34508a', vein: '#5aa8ff' },
    { name: 'Obsidyen',      top: '#2d2735', mid: '#221d29', low: '#18141d', fleck: '#463b52', vein: '#b28bff' },
    { name: 'Ametist',       top: '#4a2e66', mid: '#3a2352', low: '#29183b', fleck: '#5e3d80', vein: '#d59bff' },
    { name: 'Magma',         top: '#5e2419', mid: '#471a12', low: '#32110b', fleck: '#7a3322', vein: '#ff8a2a' },
    { name: 'Kadim Kalıntı', top: '#5b5446', mid: '#474136', low: '#332f26', fleck: '#7a715e', vein: '#e9d8a6' },
    { name: 'Çekirdek',      top: '#6b3a10', mid: '#522c0c', low: '#3a1f08', fleck: '#8a4c16', vein: '#ffd27a' },
    { name: 'Yıldız Taşı',   top: '#2c2c5a', mid: '#212147', low: '#171735', fleck: '#40407a', vein: '#e6f0ff' },
  ];
  for (const b of BIOMES) b.back = shade(b.mid, -0.62);
  const BEDROCK = { name: 'Ana Kaya', top: '#2b2a2e', mid: '#1f1e22', low: '#141316', fleck: '#3a383f', vein: '#55525c', back: '#0e0d10' };
  // m. madenin k. katmanının damarı; son katman "ana damar"
  const biomeOf = (m, k) => BIOMES[(m * 3 + Math.floor(k / 3)) % BIOMES.length];
  const isCore = (m, k) => k === MINES[m].layers - 1;

  /* ═════════ Denge (tüm sayılar burada) ═════════ */
  const CRIT_BASE = 0.03, DIVE_SPEED = 2.4, RECOVER = 0.07;
  const GRAV = 25;              // düşüş ivmesi (m/sn²), son hız yok
  const FIRE_H = 35;            // bu yükseklikten sonra karakter alev alır
  const FIRE_GRAV = 1.4;        // alevdeyken daha hızlı hızlanır
  const DROP_BASE = 1.06;       // düşüş hasarı her metrede ×1,06 katlanır
  const BREAK_BONUS = 0.5;      // katman patlayınca değerinin yarısı daha, katkı payına göre
  const KG_LAYER = 30;          // katman başına cevher ağırlığı (derinlik ve maden zorluğuyla artar)
  const WALK_SPD = 6;
  const HOLE_M = 4, LADDER_DX = -1.65, MINE_X0 = 10, MINE_GAP = 16, CAMP_X = -3, GATE_R = 2.4;
  const dec3 = (x) => String(Math.round(x * 1000) / 1000).replace('.', ',');

  const layerHp = (m, k) => Math.ceil(MINES[m].hp0 * Math.pow(MINES[m].grow, k) * (isCore(m, k) ? 2 : 1));
  const layerKg = (m, k) => KG_LAYER * (1 + 0.15 * k) * (1 + 0.5 * m);
  const layerXp = (m, k) => MINES[m].xp * (1 + 0.25 * k);
  const clearXp = (m) => MINES[m].xp * MINES[m].layers * 1.5;
  const layerGems = (m, k) => MINES[m].gems * (1 + 0.2 * k);
  const mineX = (i) => MINE_X0 + i * MINE_GAP;
  const xpNeed = (L) => Math.ceil(80 * Math.pow(1.18, L - 1));
  const unlocked = (i) => i === 0 || (S.clears[i - 1] || 0) > 0;

  /* ─── Yetenek ağacı: her seviyede 1 puan, kampta dağıtılır, sıfırlanmaz ─── */
  const BRANCHES = [
    { id: 'kir', name: 'Kırıcı',   desc: 'Ham hasar ve kritik' },
    { id: 'gok', name: 'Gökyüzü',  desc: 'Düşüş, alev ve merdiven' },
    { id: 'ser', name: 'Servet',   desc: 'Altın, taşıma, sefer başlangıcı' },
    { id: 'ekp', name: 'Ekip',     desc: 'Aynı madendeki takım arkadaşlarını güçlendirir' },
    { id: 'cev', name: 'Çeviklik', desc: 'Vuruş hızı, kritik şansı, çevrimdışı' },
    { id: 'san', name: 'Şans',     desc: 'Altın yağmuru, çifte darbe, hazine' },
  ];
  const ROW_NEED = [0, 5, 10]; // o daldaki satırı açmak için gereken puan
  const SKILLS = [
    { id: 'a1', br: 'kir', row: 0, max: 5, name: 'Ağır Yumruk',     d: (r) => `Hasar ×${dec(Math.pow(1.1, r))} (her sv ×1,1)` },
    { id: 'a2', br: 'kir', row: 0, max: 5, name: 'Sert Kafa',       d: (r) => `Kritik hasarı +${dec(0.4 * r)}` },
    { id: 'a3', br: 'kir', row: 1, max: 3, name: 'Fay Hattı',       d: (r) => `Canı %30'un altındaki katmana +%${15 * r} hasar` },
    { id: 'a4', br: 'kir', row: 1, max: 3, name: 'Deprem',          d: (r) => `Her 10. vuruş ×${3 + Math.max(1, r)}` },
    { id: 'a5', br: 'kir', row: 2, max: 1, name: 'Titan',           d: () => 'Tüm hasar ×1,5' },
    { id: 'b1', br: 'gok', row: 0, max: 5, name: 'Hafif Kemik',     d: (r) => `Düşüş her metrede ×${dec3(DROP_BASE + 0.004 * r)}` },
    { id: 'b2', br: 'gok', row: 0, max: 5, name: 'Çelik Merdiven',  d: (r) => `Tırmanma hızı ×${dec(Math.pow(1.15, r))}` },
    { id: 'b3', br: 'gok', row: 1, max: 3, name: 'Kuyruklu Yıldız', d: (r) => `Alev ${FIRE_H - 4 * r} m düşüşte başlar` },
    { id: 'b4', br: 'gok', row: 1, max: 3, name: 'Meteor',          d: (r) => `Alevli iniş ×${dec(2 + 0.5 * r)}` },
    { id: 'b5', br: 'gok', row: 2, max: 1, name: 'Gök Gürültüsü',   d: () => 'Tüm düşüş hasarı ×1,5' },
    { id: 'c1', br: 'ser', row: 0, max: 5, name: 'Altın Göz',       d: (r) => `Altın ×${dec(Math.pow(1.1, r))} (her sv ×1,1)` },
    { id: 'c2', br: 'ser', row: 0, max: 5, name: 'Geniş Sırt',      d: (r) => `Çanta ve asansör kapasitesi ×${dec(Math.pow(1.2, r))}` },
    { id: 'c3', br: 'ser', row: 1, max: 3, name: 'Tüccar',          d: (r) => `Sefer yükseltmeleri %${6 * r} ucuz` },
    { id: 'c4', br: 'ser', row: 1, max: 3, name: 'Hazırlık',        d: (r) => `Her sefere Güç ve Zıplama Sv ${2 * r} ile başla` },
    { id: 'c5', br: 'ser', row: 2, max: 1, name: 'Otomasyon',       d: () => 'Her sefere Otomatik ve Yük Asansörü alınmış başla' },
    { id: 'd1', br: 'ekp', row: 0, max: 5, name: 'Moral Şarkısı',   d: (r) => `Takım arkadaşlarına hasar ×${dec(Math.pow(1.06, r))}`, team: true },
    { id: 'd2', br: 'ekp', row: 0, max: 5, name: 'Ekip Ruhu',       d: (r) => `Madendeki her takım arkadaşı için sana +%${4 * r} hasar` },
    { id: 'd3', br: 'ekp', row: 1, max: 3, name: 'Usta Öğretmen',   d: (r) => `Takım arkadaşlarına tecrübe +%${10 * r}`, team: true },
    { id: 'd4', br: 'ekp', row: 1, max: 3, name: 'Ortak Kese',      d: (r) => `Takım arkadaşlarına altın +%${6 * r}`, team: true },
    { id: 'd5', br: 'ekp', row: 2, max: 1, name: 'Savaş Borusu',    d: () => 'Takım arkadaşlarına kritik şansı +%8 ve vuruş hızı +%8', team: true },
    { id: 'e1', br: 'cev', row: 0, max: 5, name: 'Çevik Bacak',     d: (r) => `Vuruş hızı ×${dec(Math.pow(1.05, r))}` },
    { id: 'e2', br: 'cev', row: 0, max: 5, name: 'Keskin Göz',      d: (r) => `Kritik şansı +%${2 * r}` },
    { id: 'e3', br: 'cev', row: 1, max: 3, name: 'İkinci Rüzgar',   d: (r) => `Hızlı iniş ×${dec(1.25 + 0.15 * r)}` },
    { id: 'e4', br: 'cev', row: 1, max: 3, name: 'Uzun Nefes',      d: (r) => `Sen yokken ${2 + 2 * r} saate kadar, %${50 + 10 * r} verimle kazar` },
    { id: 'e5', br: 'cev', row: 2, max: 1, name: 'Fırtına',         d: () => 'Vuruş hızı ×1,25' },
    { id: 'f1', br: 'san', row: 0, max: 5, name: 'Altın Yağmuru',   d: (r) => `Vuruşların %${2 * r}'i 5 kat altın döker` },
    { id: 'f2', br: 'san', row: 0, max: 5, name: 'Çifte Darbe',     d: (r) => `Vuruşların %${3 * r}'i iki kez vurur` },
    { id: 'f3', br: 'san', row: 1, max: 3, name: 'Hazine Avcısı',   d: (r) => `Patlama payın ×${dec(Math.pow(1.3, r))}` },
    { id: 'f4', br: 'san', row: 1, max: 3, name: 'Elmas Kokusu',    d: (r) => `Elmas ×${dec(Math.pow(1.25, r))}` },
    { id: 'f5', br: 'san', row: 2, max: 1, name: 'Son Darbe',       d: () => 'Katmanı sen patlatırsan değerinin yarısı kadar ekstra altın' },
  ];
  const SKILL = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
  const sk = (id) => (S && S.skills[id]) || 0;
  const spentIn = (br) => SKILLS.reduce((a, s) => a + (s.br === br ? sk(s.id) : 0), 0);
  const spentAll = () => SKILLS.reduce((a, s) => a + sk(s.id), 0);
  const freePoints = () => S.level - spentAll();

  /* ─── Başarılar: zor barajlar, küçük ama birikerek büyüyen kalıcı bonuslar ─── */
  const ACH_BONUS = [1, 2, 4, 8, 16, 32, 64]; // her kademe yüzde
  const ACHS = [
    { id: 'dmg',    name: 'Yıkıcı',          stat: 'dmg',    what: 'toplam hasar',           eff: 'hasar',          tiers: [1e5, 1e7, 1e9, 1e11, 1e13, 1e15, 1e17] },
    { id: 'layers', name: 'Kazıcı',          stat: 'layers', what: 'kırılan katman (payın)', eff: 'cevher değeri',  tiers: [3, 15, 60, 250, 1000, 4000, 15000] },
    { id: 'fall',   name: 'Paraşütsüz',      stat: 'fall',   what: 'düşülen metre',          eff: 'düşüş hasarı',   tiers: [200, 2000, 1e4, 5e4, 2e5, 1e6, 5e6] },
    { id: 'fire',   name: 'Ateş Yürüyüşü',   stat: 'fire',   what: 'alevli iniş',            eff: 'alev hasarı',    tiers: [1, 10, 50, 200, 1000, 5000, 25000] },
    { id: 'crit',   name: 'Keskin Nişancı',  stat: 'crits',  what: 'kritik vuruş',           eff: 'kritik hasarı',  tiers: [50, 500, 5000, 5e4, 5e5, 5e6, 5e7] },
    { id: 'clears', name: 'Maden Fatihi',    stat: 'clears', what: 'tamamlanan maden',       eff: 'tecrübe',        tiers: [1, 3, 10, 25, 60, 150, 400] },
    { id: 'team',   name: 'Ekip Oyuncusu',   stat: 'team',   what: 'birlikte kırılan katman', eff: 'altın',         tiers: [1, 10, 50, 200, 1000, 5000, 25000] },
    { id: 'climb',  name: 'Merdiven Kurdu',  stat: 'climb',  what: 'tırmanılan metre',       eff: 'tırmanma hızı',  tiers: [100, 1000, 5000, 25000, 1e5, 5e5, 2e6] },
    { id: 'hits',   name: 'Vuruş Makinesi',  stat: 'hits',   what: 'toplam vuruş',           eff: 'vuruş hızı',     tiers: [500, 5000, 5e4, 2e5, 1e6, 5e6, 2e7] },
  ];
  const ACH = Object.fromEntries(ACHS.map((a) => [a.id, a]));
  const achTier = (a) => { let t = 0; while (t < a.tiers.length && (S.stats[a.stat] || 0) >= a.tiers[t]) t++; return t; };
  const achPct = (id) => ACH_BONUS.slice(0, achTier(ACH[id])).reduce((x, y) => x + y, 0);
  const achX = (id) => 1 + achPct(id) / 100;
  function stat(key, v) { // başarı ilerlemesi; kademe atlayınca kutla
    const a = ACHS.find((x) => x.stat === key), before = a ? achTier(a) : 0;
    S.stats[key] = (S.stats[key] || 0) + v; dirty = true;
    if (a && achTier(a) > before) {
      const t = achTier(a);
      fx.banner = { title: `BAŞARI: ${upperTR(a.name)} ${roman(t)}`, sub: `Kalıcı ${a.eff} +%${ACH_BONUS[t - 1]} (toplam +%${achPct(a.id)})`, t: 0 };
      sfxCoin(true);
    }
  }

  /* ─── Takım aurası: aynı madendeki arkadaşların Ekip yetenekleri sana işler ─── */
  let TA = { dmg: 0, xp: 0, gold: 0, crit: 0, spd: 0, n: 0 };
  const myAura = () => ({ dmg: Math.pow(1.06, sk('d1')) - 1, xp: 0.1 * sk('d3'), gold: 0.06 * sk('d4'), crit: sk('d5') ? 0.08 : 0, spd: sk('d5') ? 0.08 : 0 });
  function computeTeam() {
    const a = { dmg: 0, xp: 0, gold: 0, crit: 0, spd: 0, n: 0 };
    if (underground()) {
      for (const o of Net.others.values()) {
        const p = o.pos || {};
        if (!inMineOf(p, S.mine) || !p.u) continue;
        a.n++;
        const au = p.au || {};
        for (const k of ['dmg', 'xp', 'gold', 'crit', 'spd']) a[k] += clamp(num(au[k], 0), 0, 1);
      }
    }
    TA = a;
  }

  /* ─── Sefer: madene özel altın, yükseltme, elmas; maden bitince sıfırlanır ─── */
  const GEAR = ['', 'Deri', 'Demir', 'Çelik', 'Titanyum', 'Elmas', 'Obsidyen', 'Magma', 'Kuantum'];
  const GEAR_C = [null, '#7b4a27', '#707782', '#94a9bf', '#d3dbe2', '#7fe9ff', '#7a50e6', '#ff7a2a', '#ff52d9'];
  const TIER_MAX = GEAR.length - 1;
  const SLOTS = {
    helm:  { noun: 'Kask', base: 'Plastik Baret', baseC: '#f4b400', stat: 'altın', cost: 400, m: (t) => Math.pow(1.25, t) },
    glove: { noun: 'Eldiven', base: 'Çıplak El', baseC: '#f0c294', stat: 'kritik hasarı', cost: 300, m: (t) => 3 * Math.pow(1.15, t) },
    boot:  { noun: 'Bot', base: 'Çıplak Ayak', baseC: '#e7b48c', stat: 'hasar', cost: 250, m: (t) => Math.pow(1.3, t) },
  };
  const slotName = (s, t) => (t === 0 ? SLOTS[s].base : `${GEAR[t]} ${SLOTS[s].noun}`);
  const slotColor = (s, t) => (t === 0 ? SLOTS[s].baseC : GEAR_C[Math.min(t, TIER_MAX)]);
  function freshRun(inst) {
    const r = { inst, coins: 0, gems: 0, bagKg: 0, bagVal: 0, pile: { kg: 0, val: 0 }, auto: false, hitN: 0,
      lv: { power: 0, jump: 0, luck: 0, crit: 0, auto: 0, helm: 0, glove: 0, boot: 0, bag: 0, climb: 0, elev: 0, ecap: 0, espd: 0 },
      perk: { power: 0, gold: 0, fire: 0, speed: 0 } };
    r.lv.power = r.lv.jump = 2 * sk('c4');
    if (sk('c5')) { r.lv.auto = 1; r.lv.elev = 1; r.auto = true; }
    return r;
  }
  function runOf(m) { // madenin güncel seferi bittiyse yenisi açılır
    const inst = W.mines[m].inst;
    let r = S.runs[m];
    if (!r || r.inst !== inst) { r = S.runs[m] = freshRun(inst); }
    return r;
  }
  const R = () => runOf(S.mine);

  const jumpDur = (l) => Math.max(0.18, 0.72 * Math.pow(0.95, l));
  const dmgFor = (pl, r = R()) => 5 * Math.pow(1.07, pl) * SLOTS.boot.m(r.lv.boot) * Math.pow(1.12, r.perk.power) * Math.pow(1.1, sk('a1')) * (sk('a5') ? 1.5 : 1)
    * achX('dmg') * (1 + TA.dmg) * (1 + 0.04 * sk('d2') * Math.min(5, TA.n));
  const hitDmg = () => dmgFor(R().lv.power);
  const hpsFor = (jl, r = R()) => (1 / (jumpDur(jl) + RECOVER)) * Math.pow(1.05, sk('e1')) * (sk('e5') ? 1.25 : 1) * achX('hits') * (1 + TA.spd) * Math.pow(1.04, r.perk.speed);
  const hitsPerSec = () => hpsFor(R().lv.jump);
  const critCh = (l = R().lv.crit) => Math.min(0.75, CRIT_BASE + 0.03 * l + 0.02 * sk('e2') + TA.crit);
  const critX = (g = R().lv.glove) => (SLOTS.glove.m(g) + 0.4 * sk('a2')) * achX('crit');
  const avgHit = () => hitDmg() * (1 + critCh() * (critX() - 1));
  const goldX = (r = R()) => Math.pow(1.06, r.lv.luck) * SLOTS.helm.m(r.lv.helm) * Math.pow(1.12, r.perk.gold) * Math.pow(1.1, sk('c1')) * achX('layers') * achX('team') * (1 + TA.gold);
  const goldPerDmg = (m) => MINES[m].gpd * goldX(runOf(m));
  const bagCap = (l = R().lv.bag) => 40 * Math.pow(1.15, l) * Math.pow(1.2, sk('c2'));
  const climbSpd = (l = R().lv.climb) => 2 * Math.pow(1.08, l) * Math.pow(1.15, sk('b2')) * achX('climb');
  const elevCap = (l = R().lv.ecap) => 150 * Math.pow(1.15, l) * Math.pow(1.2, sk('c2'));
  const elevSpd = (l = R().lv.espd) => 3 * Math.pow(1.08, l);
  const costX = () => 1 - 0.06 * sk('c3');
  const xpX = () => achX('clears') * (1 + TA.xp);
  const diveX = () => 1.25 + 0.15 * sk('e3');
  const offCapH = () => 2 + 2 * sk('e4');
  const offEff = () => 0.5 + 0.1 * sk('e4');
  // Düşüş: hız arttıkça hasar katlanarak artar (eşdeğer yükseklik v²/2g). Alevde ivme ve güç artar.
  const dropBase = () => DROP_BASE + 0.004 * sk('b1');
  const fireH = () => FIRE_H - 4 * sk('b3');
  const fireV = () => Math.sqrt(2 * GRAV * fireH());
  const fireMult = () => (2 + 0.5 * sk('b4')) * achX('fire');
  function dropMultV(v, fire) {
    const hEq = (v * v) / (2 * GRAV);
    if (hEq < 0.5) return 1;
    return Math.pow(dropBase(), hEq) * (fire ? fireMult() : 1) * (sk('b5') ? 1.5 : 1) * achX('fall');
  }
  function dropMultH(h) { // merdivende gösterilen tahmin
    const fh = fireH();
    if (h <= fh) return dropMultV(Math.sqrt(2 * GRAV * h), false);
    return dropMultV(Math.sqrt(2 * GRAV * fh + 2 * GRAV * FIRE_GRAV * (h - fh)), true);
  }

  /* ═════════ Sefer yükseltmeleri (maden bitince sıfırlanır) ═════════ */
  const ICON = {
    power: '<svg viewBox="0 0 24 24"><path d="M12 3v10"/><path d="M7.5 9 12 13.5 16.5 9"/><path d="M4 18h16"/><path d="M7 21h10"/></svg>',
    jump:  '<svg viewBox="0 0 24 24"><path d="M12 11V3"/><path d="M8.5 6.5 12 3l3.5 3.5"/><path d="M6 14h12"/><path d="M8 17.5h8"/><path d="M6 21h12"/></svg>',
    boot:  '<svg viewBox="0 0 24 24"><path d="M7 3h6v8l5.5 2.5A2 2 0 0 1 20 15.3V18H5V4a1 1 0 0 1 1-1z"/><path d="M5 21h15"/><path d="M13 7H9"/></svg>',
    helm:  '<svg viewBox="0 0 24 24"><path d="M4.5 16a7.5 7.5 0 0 1 15 0"/><path d="M2.5 16h19v2.5h-19z"/><path d="M12 8.5V5.5"/><path d="M10.5 11.5h3"/></svg>',
    glove: '<svg viewBox="0 0 24 24"><path d="M8 21v-4.5L5.2 13a1.6 1.6 0 0 1 2.4-2.1L9 12.2V6a2 2 0 0 1 4 0v4h1V7a2 2 0 0 1 4 0v8a6 6 0 0 1-6 6z"/></svg>',
    luck:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/></svg>',
    crit:  '<svg viewBox="0 0 24 24"><path d="M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z"/></svg>',
    auto:  '<svg viewBox="0 0 24 24"><path d="M20 11a8 8 0 0 0-14.3-4.9"/><path d="M4 13a8 8 0 0 0 14.3 4.9"/><path d="M5 3v3.5h3.5"/><path d="M19 21v-3.5h-3.5"/></svg>',
    bag:   '<svg viewBox="0 0 24 24"><path d="M9 6V4.5a3 3 0 0 1 6 0V6"/><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8z"/></svg>',
    ladder:'<svg viewBox="0 0 24 24"><path d="M7 3v18M17 3v18M7 7.5h10M7 12h10M7 16.5h10"/></svg>',
    elev:  '<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M12 3v18"/><path d="M7.5 10 9 8.5 10.5 10M13.5 14l1.5 1.5 1.5-1.5"/></svg>',
    box:   '<svg viewBox="0 0 24 24"><path d="M3.5 8 12 3.5 20.5 8v8L12 20.5 3.5 16z"/><path d="M3.5 8 12 12.5 20.5 8M12 12.5v8"/></svg>',
    fast:  '<svg viewBox="0 0 24 24"><path d="M6 12l6-6 6 6"/><path d="M6 18l6-6 6 6"/></svg>',
    chest: '<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M3 13h18"/><path d="M5 9a7 5 0 0 1 14 0"/><path d="M11 12h2v3h-2z"/></svg>',
    moon:  '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>',
    wing:  '<svg viewBox="0 0 24 24"><path d="M12 21c-1-4-1-8 0-12M12 9c-2.5-4-6-5.5-9-5 1 4 4 7.5 9 8M12 9c2.5-4 6-5.5 9-5-1 4-4 7.5-9 8"/></svg>',
    flame: '<svg viewBox="0 0 24 24"><path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-3 5-3 8a6 6 0 0 0 6 6z"/></svg>',
  };

  function gearItem(slot, icon) {
    const sl = SLOTS[slot];
    return {
      id: slot, pane: 'gear', store: 'lv', key: slot, cur: 'gold', name: sl.noun, icon, max: TIER_MAX,
      cost: (l) => sl.cost * Math.pow(3.2, l),
      now:  (l) => `${slotName(slot, l)} · ${sl.stat} ×${dec(sl.m(l))}`,
      next: (l) => `${slotName(slot, l + 1)} · ${sl.stat} ×${dec(sl.m(l))} → ×${dec(sl.m(l + 1))}`,
    };
  }
  const ITEMS = [
    { id: 'power', pane: 'char', store: 'lv', key: 'power', cur: 'gold', name: 'Güç', icon: ICON.power, max: 35,
      cost: (l) => 15 * Math.pow(1.27, l),
      now: (l) => `Vuruş ${fmt(dmgFor(l))}`, next: (l) => `Vuruş ${fmt(dmgFor(l))} → ${fmt(dmgFor(l + 1))}` },
    { id: 'jump', pane: 'char', store: 'lv', key: 'jump', cur: 'gold', name: 'Zıplama', icon: ICON.jump, max: 27,
      cost: (l) => 40 * Math.pow(1.28, l),
      now: (l) => `${dec(hpsFor(l))} vuruş/sn`, next: (l) => `${dec(hpsFor(l))} → ${dec(hpsFor(l + 1))} vuruş/sn` },
    { id: 'luck', pane: 'char', store: 'lv', key: 'luck', cur: 'gold', name: 'Kazanç', icon: ICON.luck, max: 35,
      cost: (l) => 50 * Math.pow(1.27, l),
      now: (l) => `Cevher değeri ×${dec(Math.pow(1.06, l))}`, next: (l) => `Cevher değeri ×${dec(Math.pow(1.06, l))} → ×${dec(Math.pow(1.06, l + 1))}` },
    { id: 'crit', pane: 'char', store: 'lv', key: 'crit', cur: 'gold', name: 'Kritik', icon: ICON.crit, max: 15,
      cost: (l) => 120 * Math.pow(1.3, l),
      now: (l) => `%${pct(critCh(l))} şansla ×${dec(critX())} hasar`, next: (l) => `%${pct(critCh(l))} → %${pct(critCh(l + 1))} şansla ×${dec(critX())} hasar` },
    { id: 'auto', pane: 'char', store: 'lv', key: 'auto', cur: 'gold', name: 'Otomatik', icon: ICON.auto, max: 1,
      cost: () => 300,
      now: () => 'Dipteyken kendi zıplıyor, sen yokken de kazıyor', next: () => 'Dipteyken kendi zıplar, sen yokken de kazar' },
    gearItem('helm', ICON.helm),
    gearItem('glove', ICON.glove),
    gearItem('boot', ICON.boot),
    { id: 'bag', pane: 'haul', store: 'lv', key: 'bag', cur: 'gold', name: 'Çanta', icon: ICON.bag, max: 25,
      cost: (l) => 30 * Math.pow(1.32, l),
      now: (l) => `${kg(bagCap(l))} cevher taşır`, next: (l) => `${kg(bagCap(l))} → ${kg(bagCap(l + 1))}` },
    { id: 'climb', pane: 'haul', store: 'lv', key: 'climb', cur: 'gold', name: 'Tırmanma', icon: ICON.ladder, max: 30,
      cost: (l) => 40 * Math.pow(1.28, l),
      now: (l) => `Merdivende ${dec(climbSpd(l))} m/sn`, next: (l) => `Merdivende ${dec(climbSpd(l))} → ${dec(climbSpd(l + 1))} m/sn` },
    { id: 'elev', pane: 'haul', store: 'lv', key: 'elev', cur: 'gold', name: 'Yük Asansörü', icon: ICON.elev, max: 1,
      cost: () => 400,
      now: () => 'Çantandaki ve zemindeki cevheri kendisi taşıyıp satıyor', next: () => 'Çantandaki ve zemindeki cevheri kendisi yukarı taşıyıp satar' },
    { id: 'ecap', pane: 'haul', store: 'lv', key: 'ecap', cur: 'gold', name: 'Asansör Kapasitesi', icon: ICON.box, req: 'elev', max: 30,
      cost: (l) => 250 * Math.pow(1.3, l),
      now: (l) => `Seferde ${kg(elevCap(l))}`, next: (l) => `Seferde ${kg(elevCap(l))} → ${kg(elevCap(l + 1))}` },
    { id: 'espd', pane: 'haul', store: 'lv', key: 'espd', cur: 'gold', name: 'Asansör Hızı', icon: ICON.fast, req: 'elev', max: 30,
      cost: (l) => 200 * Math.pow(1.3, l),
      now: (l) => `${dec(elevSpd(l))} m/sn`, next: (l) => `${dec(elevSpd(l))} → ${dec(elevSpd(l + 1))} m/sn` },
    // Elmas: katman patladıkça payına göre gelir, bu seferde harcanır
    { id: 'g_power', pane: 'gem', store: 'perk', key: 'power', cur: 'gem', name: 'Kadim Güç', icon: ICON.power,
      cost: (l) => 2 + l, now: (l) => `Hasar ×${dec(Math.pow(1.12, l))}`, next: (l) => `Hasar ×${dec(Math.pow(1.12, l))} → ×${dec(Math.pow(1.12, l + 1))}` },
    { id: 'g_gold', pane: 'gem', store: 'perk', key: 'gold', cur: 'gem', name: 'Altın Damarı', icon: ICON.luck,
      cost: (l) => 2 + l, now: (l) => `Altın ×${dec(Math.pow(1.12, l))}`, next: (l) => `Altın ×${dec(Math.pow(1.12, l))} → ×${dec(Math.pow(1.12, l + 1))}` },
    { id: 'g_fire', pane: 'gem', store: 'perk', key: 'fire', cur: 'gem', name: 'Ateş Özü', icon: ICON.flame,
      cost: (l) => 3 + l, now: (l) => `Düşüş hasarı ×${dec(Math.pow(1.15, l))}`, next: (l) => `Düşüş hasarı ×${dec(Math.pow(1.15, l))} → ×${dec(Math.pow(1.15, l + 1))}` },
    { id: 'g_speed', pane: 'gem', store: 'perk', key: 'speed', cur: 'gem', name: 'Rüzgar Taşı', icon: ICON.fast, max: 10,
      cost: (l) => 3 + l, now: (l) => `Vuruş hızı ×${dec(Math.pow(1.04, l))}`, next: (l) => `Vuruş hızı ×${dec(Math.pow(1.04, l))} → ×${dec(Math.pow(1.04, l + 1))}` },
  ];
  const lvOf = (it) => R()[it.store][it.key];

  /* ═════════ Profil (kalıcı) & kayıt ═════════ */
  const LOCAL_KEY = 'derin-kazi-kayit-v1';
  const NAME_KEY = 'derin-kazi-ad';
  const onlineKey = (key) => 'derin-kazi-oyuncu-' + key;
  const STAT_KEYS = ['dmg', 'layers', 'fall', 'fire', 'crits', 'clears', 'team', 'climb', 'hits', 'gold'];
  function freshState() {
    return {
      v: 6, level: 1, xp: 0, xpTotal: 0, skills: {}, stats: Object.fromEntries(STAT_KEYS.map((k) => [k, 0])),
      clears: MINES.map(() => 0), runs: {}, mine: 0, sx: CAMP_X, under: false,
      sound: true, tips: {}, lastSeen: 0,
    };
  }
  let S = null;
  let dirty = false;
  const num = (v, def) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : def);
  const serialize = () => Object.assign({}, S, { lastSeen: Date.now() });
  function applySave(d) {
    S = freshState();
    if (!d || typeof d !== 'object' || d.v !== 6) return; // eski sürüm kayıtları yeni yapıya uymaz
    S.level = Math.max(1, Math.floor(num(d.level, 1)));
    S.xp = num(d.xp, 0); S.xpTotal = num(d.xpTotal, 0);
    for (const s of SKILLS) S.skills[s.id] = Math.min(s.max, Math.floor(num(d.skills && d.skills[s.id], 0)));
    if (spentAll() > S.level) S.skills = {};
    for (const k of STAT_KEYS) S.stats[k] = num(d.stats && d.stats[k], 0);
    S.clears = MINES.map((_, i) => Math.floor(num(d.clears && d.clears[i], 0)));
    S.mine = clamp(Math.floor(num(d.mine, 0)), 0, MINES.length - 1);
    S.sx = typeof d.sx === 'number' && isFinite(d.sx) ? d.sx : CAMP_X;
    S.under = !!d.under;
    if (d.runs && typeof d.runs === 'object') {
      for (const [m, r] of Object.entries(d.runs)) {
        if (!MINES[m] || !r || typeof r !== 'object') continue;
        const f = freshRun(num(r.inst, 0));
        for (const k of ['coins', 'gems', 'bagKg', 'bagVal', 'hitN']) f[k] = num(r[k], 0);
        for (const k of Object.keys(f.lv)) f.lv[k] = Math.floor(num(r.lv && r.lv[k], f.lv[k]));
        for (const k of Object.keys(f.perk)) f.perk[k] = Math.floor(num(r.perk && r.perk[k], 0));
        f.pile = { kg: num(r.pile && r.pile.kg, 0), val: num(r.pile && r.pile.val, 0) };
        f.auto = !!r.auto && f.lv.auto > 0;
        S.runs[m] = f;
      }
    }
    S.sound = d.sound !== false;
    S.tips = Object.assign({}, d.tips || {});
    S.lastSeen = num(d.lastSeen, 0);
  }
  function saveLocal() {
    dirty = false;
    try { localStorage.setItem(Net.online ? onlineKey(Net.key) : LOCAL_KEY, JSON.stringify(serialize())); } catch (e) { /* depolama kapalı olabilir */ }
    Net.wantSave = true;
  }
  function readLocal(key) { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }

  /* ═════════ Ortak madenler ═════════ */
  // W: madenlerin güncel hali (sunucudan, çevrimdışıysa yerel dünyadan)
  let W = null;
  const freshWorld = () => ({ mines: MINES.map((_, i) => ({ inst: 1, layer: 0, hp: layerHp(i, 0), n: 0, my: 0, myTotal: 0 })) });
  // Sunucu yokken aynı kurallarla çalışan yerel dünya (tek oyuncu)
  const Local = {
    KEY: 'derin-kazi-dunya-v2', w: null, inbox: [],
    load() {
      const d = readLocal(this.KEY);
      this.w = d && Array.isArray(d.mines) && d.mines.length === MINES.length ? d : { mines: MINES.map((_, i) => ({ inst: 1, layer: 0, hp: layerHp(i, 0) })) };
    },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.w)); } catch (e) { /* yok say */ } },
    hits(list) {
      for (const h of list) {
        let mine = this.w.mines[h.m];
        if (!mine || h.i !== mine.inst) continue;
        let E = h.dmg;
        while (E > 0) {
          if (E < mine.hp) { mine.hp -= E; break; }
          E = h.c ? E - mine.hp : 0;
          this.inbox.push({ type: 'break', m: h.m, i: mine.inst, k: mine.layer, share: 1, n: 1 });
          mine.layer++;
          if (mine.layer < MINES[h.m].layers) { mine.hp = layerHp(h.m, mine.layer); continue; }
          this.inbox.push({ type: 'clear', m: h.m, i: mine.inst, share: 1, n: 1 });
          this.w.mines[h.m] = mine = { inst: mine.inst + 1, layer: 0, hp: layerHp(h.m, 0) };
          break;
        }
      }
      this.save();
    },
    view() { return { mines: this.w.mines.map((m) => ({ inst: m.inst, layer: m.layer, hp: m.hp, n: 1, my: 1, myTotal: 1 })) }; },
  };

  // Ağ: sunucu varsa her 250 ms'de konum + vuruşlar gider; dünya, diğer oyuncular ve ödüller gelir
  const Net = {
    online: false, key: '', name: '', token: '', queue: [], busy: false, last: 0, lastSave: 0, wantSave: false,
    others: new Map(), failed: 0,
    async hello() {
      try {
        const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 2500);
        const r = await fetch('api/hello', { cache: 'no-store', signal: ctrl.signal });
        const j = r.ok ? await r.json() : null;
        return !!(j && j.ok && j.v === 2);
      } catch (e) { return false; }
    },
    async post(path, body) {
      const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const err = new Error(j.error || String(r.status)); err.code = j.error || String(r.status); throw err; }
      return j;
    },
    async login(name) {
      const j = await this.post('api/login', { name });
      Object.assign(this, { key: j.key, name: j.name, token: j.token, online: true, failed: 0 });
      try { localStorage.setItem(NAME_KEY, j.name); } catch (e) { /* yok say */ }
      return j;
    },
    hit(m, i, k, dmg, carry) { // vuruş hemen yerel görünüme işlenir; sunucuya sonra gider
      const h = { m, i, k, dmg };
      if (carry) h.c = 1;
      if (this.online) this.queue.push(h); else Local.hits([h]);
    },
    tick(now) {
      if (!this.online) {
        if (!Local.w) return;
        if (Local.inbox.length) { const ev = Local.inbox; Local.inbox = []; ev.forEach(onWorldEvent); }
        W = mergeView(Local.view());
        return;
      }
      const near = scene === 'mine' && [...this.others.values()].some((o) => inMineOf(o.pos, S.mine));
      if (this.busy || now - this.last < (near ? 110 : 250)) return;
      this.sync(now);
    },
    async sync(now) {
      const hits = this.queue; this.queue = [];
      const body = { key: this.key, token: this.token, pos: presence(), hits };
      if (this.wantSave && now - this.lastSave > 4000) { body.save = serialize(); this.lastSave = now; this.wantSave = false; }
      this.busy = true; this.last = now;
      try {
        const j = await this.post('api/sync', body);
        this.failed = 0; handleServer(j);
      } catch (err) {
        this.queue = hits.concat(this.queue);
        if (body.save) this.wantSave = true;
        if (err.code === 'session') { this.online = false; sessionTaken(); }
        else if (err.code === 'relogin') { try { handleServer(await this.login(this.name)); } catch (e) { this.failed++; } }
        else { this.failed++; this.last = now + Math.min(5000, 500 * this.failed); }
      } finally { this.busy = false; }
    },
    beacon() {
      if (!this.online || !navigator.sendBeacon) return;
      try { navigator.sendBeacon('api/save', new Blob([JSON.stringify({ key: this.key, token: this.token, save: serialize() })], { type: 'application/json' })); } catch (e) { /* yok say */ }
    },
  };
  // Sunucudan gelen dünyaya, henüz gönderilmemiş kendi vuruşlarımızı ekle (tahmin)
  function mergeView(view) {
    const w = { mines: view.mines.map((m) => Object.assign({}, m)) };
    for (const h of Net.queue) predictOn(w, h.m, h.i, h.dmg, h.c);
    return w;
  }
  function predictOn(w, m, i, dmg, carry) {
    let wm = w.mines[m], E = dmg;
    while (E > 0 && wm && wm.inst === i) {
      if (E < wm.hp) { wm.hp -= E; break; }
      E = carry ? E - wm.hp : 0;
      wm.layer++;
      if (wm.layer >= MINES[m].layers) { Object.assign(wm, { inst: wm.inst + 1, layer: 0, hp: layerHp(m, 0), n: 0, my: 0, myTotal: 0 }); break; }
      wm.hp = layerHp(m, wm.layer);
    }
  }
  function handleServer(j) {
    if (j.world) W = mergeView(j.world);
    if (Array.isArray(j.events)) j.events.forEach(onWorldEvent);
    if (Array.isArray(j.players)) {
      const seen = new Set();
      for (const p of j.players) {
        seen.add(p.key);
        const o = Net.others.get(p.key) || { rx: null, ry: 0, t: 0 };
        o.name = p.name; o.pos = p.pos || {}; o.seen = performance.now();
        Net.others.set(p.key, o);
        pushSnap(p.key, o);
      }
      for (const k of [...Net.others.keys()]) if (!seen.has(k)) Net.others.delete(k);
    }
  }

  /* ═════════ DOM ═════════ */
  const stage = $('stage'), cv = $('game'), ctx = cv.getContext('2d');
  const el = {
    purse: $('purse'), coins: $('coins'), depth: $('depthM'), biome: $('biome'), sub: $('hudSub'), subV: $('hudSubV'),
    stageTop: $('stageTop'), layer: $('layerLbl'), reward: $('reward'), hpFill: $('hpFill'), hpNum: $('hpNum'),
    hint: $('hint'), auto: $('autoBtn'), climb: $('climbBtn'), walkL: $('walkL'), walkR: $('walkR'),
    gate: $('gate'), gateTitle: $('gateTitle'), gateSub: $('gateSub'), gateBtn: $('gateBtn'),
    bagChip: $('bagChip'), bagFill: $('bagFill'), bagText: $('bagText'), elevChip: $('elevChip'), pileChip: $('pileChip'),
    who: $('who'), sound: $('soundBtn'), reset: $('resetBtn'),
    gemCount: $('gemCount'), runNote: $('runNote'), houseUi: $('houseUi'), goMines: $('goMines'), homeBtn: $('homeBtn'),
    mineSel: $('mineSel'), mineSelBack: $('mineSelBack'), mineCards: $('mineCards'),
    lvlNum: $('lvlNum'), lvlXp: $('lvlXp'), lvlFill: $('lvlFill'), heroStats: $('heroStats'), mineList: $('mineList'),
    spFree: $('spFree'), skillTree: $('skillTree'), respec: $('respecBtn'), skillNote: $('skillNote'), achList: $('achList'),
    modal: $('modal'), mTitle: $('modalTitle'), mBody: $('modalBody'), mOk: $('modalOk'), mCancel: $('modalCancel'),
    login: $('login'), loginForm: $('loginForm'), loginName: $('loginName'), loginErr: $('loginErr'), loginNote: $('loginNote'),
  };
  function setText(node, v) { if (node._v !== v) { node._v = v; node.textContent = v; } }
  function setHidden(node, h) { if (node.hidden !== h) node.hidden = h; }

  /* ═════════ Ses (WebAudio, dosya yok) ═════════ */
  let actx = null, noiseBuf = null;
  function unlockAudio() {
    if (!S || !S.sound) return;
    try {
      if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; actx = new AC(); }
      if (actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; }
  }
  const audio = () => (S && S.sound && actx && actx.state === 'running' ? actx : null);
  function env(g, t, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(a, freq, t, dur, type, vol) {
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    env(g, t, vol, dur); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function sfxThud(pitch, vol = 0.32) {
    const a = audio(); if (!a) return;
    const t = a.currentTime, o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160 * pitch, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.13);
    env(g, t, vol, 0.17); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + 0.2);
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.2), a.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const n = a.createBufferSource(), f = a.createBiquadFilter(), ng = a.createGain();
    n.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = 700; env(ng, t, vol * 0.6, 0.11);
    n.connect(f); f.connect(ng); ng.connect(a.destination); n.start(t); n.stop(t + 0.15);
  }
  function sfxCoin(big) {
    const a = audio(); if (!a) return;
    const t = a.currentTime;
    tone(a, 988, t, 0.09, 'square', 0.045); tone(a, 1319, t + 0.06, big ? 0.3 : 0.12, 'square', 0.045);
    if (big) tone(a, 1760, t + 0.14, 0.35, 'triangle', 0.06);
  }
  function sfxBuy() { const a = audio(); if (a) tone(a, 660, a.currentTime, 0.06, 'triangle', 0.06); }
  function sfxWhoosh() { const a = audio(); if (a) { tone(a, 220, a.currentTime, 0.25, 'sawtooth', 0.02); tone(a, 330, a.currentTime + 0.05, 0.3, 'sawtooth', 0.015); } }

  /* ═════════ Görünüm: 1 metre = view.bh piksel (yatay ve dikey) ═════════ */
  const view = { w: 300, h: 300, dpr: 1, bh: 50, G: 180, holeW: 180, u: 2, jumpH: 60 };
  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(1, r.width), h = Math.max(1, r.height);
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    Object.assign(view, { w, h, dpr });
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    view.bh = Math.round(clamp(Math.min(h * 0.14, w / 7), 36, 64));
    view.G = Math.round(clamp(h * 0.56, 120, h - view.bh * 1.8));
    view.holeW = HOLE_M * view.bh;
    view.u = view.bh / 28;
    view.jumpH = clamp(view.G - 28 * view.u - 64, 20, view.bh * 1.4);
  }

  /* ═════════ Hareket ═════════ */
  // Sahne: 'house' (evin içi, kalıcı gelişim) · 'mine' (menüden seçilen maden)
  // hero.mode: house (evde) · surface (maden ağzında) · bottom (dipte) · climb (merdivende) · fall (düşüyor)
  let scene = 'house';
  const hero = { mode: 'house', y: 0, vy: 0, lx: 1, hx: 0.5, fallFrom: 0, carry: 0, chain: 0, t: 0, fire: false, face: 1, walking: 0, inst: 0 };
  const anim = { phase: 'idle', t: 0, dur: 0.72, dive: false, queued: false, squash: 0 };
  const cam = { y: 0, x: MINE_X0 };
  const elev = { y: 0, phase: 'down', kg: 0, val: 0, wait: 0 };
  const input = { climb: false, left: false, right: false };
  const fx = { shake: 0, crater: 0, flash: 0, banner: null, tipT: 0 };
  const parts = [], texts = [], rings = [], flames = [];

  const underground = () => scene === 'mine' && hero.mode !== 'surface';
  const wmine = () => W.mines[S.mine];
  const floorM = (m = S.mine) => W.mines[m].layer * LM;
  const sxm = (xm) => (xm - cam.x) * view.bh + view.w / 2;
  const sy = (m) => view.G + (m - cam.y) * view.bh;
  const heroWX = () => mineX(S.mine) + hero.lx * LADDER_DX;
  const heroX = () => (scene === 'house' ? view.w * hero.hx : sxm(heroWX()));
  const pileX = () => sxm(mineX(S.mine) + HOLE_M * 0.22);
  const sink = () => view.bh * 0.3 * fx.crater * 0.75;
  const kick = (m) => { if (!reduceMotion) fx.shake = Math.max(fx.shake, m); };
  const bagFull = () => R().bagKg >= bagCap() - 1e-6;
  const addText = (x, y, text, color, size, max = 0.9) => { if (texts.length < 40) texts.push({ x, y, text, color, size, life: 0, max }); };
  function tip(key, text, secs) { if (S.tips[key]) return; S.tips[key] = true; dirty = true; showTip(text, secs); }
  function showTip(text, secs) { el.hint.textContent = text; el.hint.hidden = false; fx.tipT = secs; }

  function tapAction(fromKey, x) {
    unlockAudio();
    if (!el.modal.hidden || !el.login.hidden || !el.mineSel.hidden) return;
    if (fx.tipT <= 0) el.hint.hidden = true;
    if (scene === 'house') { if (fromKey || (x != null && x > view.w * 0.8)) openMineSelect(); return; } // kapıya dokun: madenler
    if (hero.mode === 'bottom') trySlam();
    else if (hero.mode === 'climb') startFall();
    else if (hero.mode === 'surface') jumpIn();
  }
  function jumpIn() {
    S.under = true; hero.lx = 1; hero.y = 0; hero.inst = wmine().inst;
    startFall();
  }
  function switchMine(i) { resetElevator(); S.mine = i; dirty = true; }
  // Evden menüyle seçilen madenin ağzına git
  function enterMine(i) {
    if (!MINES[i] || !unlocked(i)) return;
    closeMineSelect();
    if (i !== S.mine) switchMine(i);
    scene = 'mine'; S.under = false;
    Object.assign(hero, { mode: 'surface', y: 0, lx: 1, vy: 0, carry: 0, fire: false });
    hero.inst = wmine().inst; cam.x = mineX(i); cam.y = 0;
    parts.length = texts.length = rings.length = flames.length = 0;
    const n = insideCount(i);
    fx.banner = { title: upperTR(MINES[i].name), sub: `Katman ${W.mines[i].layer + 1}/${MINES[i].layers}${n ? ` · içeride ${n} madenci` : ''}`, t: 0 };
    tip('mine1', 'Dokun ya da aşağı ok: madene atla. Yukarı çıkınca ofiste satarsın, Ev ile eve dönersin', 5);
    autoGroup(); dirty = true;
  }
  function goHome() {
    if (underground()) return;
    resetElevator();
    scene = 'house'; S.under = false;
    Object.assign(hero, { mode: 'house', y: 0, lx: 1, vy: 0, carry: 0, fire: false });
    cam.y = 0; parts.length = texts.length = rings.length = flames.length = 0;
    autoGroup(); dirty = true;
  }
  function trySlam() {
    if (anim.phase === 'idle') { startJump(); return; }
    if (anim.phase === 'jump' && anim.t / anim.dur > 0.12) anim.dive = true;
    anim.queued = true;
  }
  function startJump() { anim.phase = 'jump'; anim.t = 0; anim.dur = jumpDur(R().lv.jump); anim.dive = false; }
  function startFall() {
    hero.mode = 'fall'; hero.vy = hero.y <= 0 ? 3 : 0; hero.fallFrom = hero.y;
    hero.carry = 0; hero.chain = 0; hero.fire = false;
    anim.phase = 'idle'; anim.queued = false;
  }

  /* ─── Vuruş: her darbe kendi hasarın kadar altın döker; katman kırılırsa kalan güç alttakine geçer ─── */
  function hitPower(mult, dive) { // tek vuruşun gücü: kritik, hızlı iniş, Deprem, Fay Hattı
    const r = R(), wm = wmine();
    r.hitN = (r.hitN || 0) + 1;
    const crit = Math.random() < critCh();
    let E = hitDmg() * mult * (crit ? critX() : 1) * (dive ? diveX() : 1);
    const quake = sk('a4') > 0 && r.hitN % 10 === 0;
    if (quake) E *= 3 + sk('a4');
    if (sk('a3') && wm.hp < layerHp(S.mine, wm.layer) * 0.3) E *= 1 + 0.15 * sk('a3');
    const double = Math.random() < 0.03 * sk('f2');   // Çifte Darbe
    if (double) E *= 2;
    const rain = Math.random() < 0.02 * sk('f1');     // Altın Yağmuru: bu vuruşun altını ×5
    if (crit) stat('crits', 1);
    stat('hits', 1);
    return { E, crit, quake, double, rain };
  }
  function strike(E, first, info) {
    const m = S.mine, wm = wmine(), x = heroX(), y = floorM();
    const k = wm.layer, maxHp = layerHp(m, k), b = biomeOf(m, k);
    const dealt = Math.min(E, wm.hp);
    spawnDebris(x, y, first ? (info.crit ? 14 : 9) : 5, b, first ? 1.2 : 0.8);
    if (first) {
      const label = (info.quake ? 'DEPREM ' : info.double ? 'ÇİFTE ' : info.crit ? 'KRİTİK ' : '') + fmt(E) + (info.mult > 1.05 ? `  ×${fmt(info.mult)}` : '');
      const color = info.quake ? '#ff9a7a' : info.crit ? '#ffd23f' : info.fire ? '#ff9a3c' : info.mult > 1.05 ? '#9fe8ff' : '#ffffff';
      addText(x + rand(-14, 14), y - 1.4, label, color, info.crit || info.quake || info.mult >= 5 ? 20 : 15);
      rings.push({ x, y, life: 0, max: 0.35, s: clamp(1 + Math.log10(info.mult) * 0.8, 1, 3) });
      kick(clamp(2.5 + Math.log10(info.mult) * 4 + (info.crit || info.quake ? 4 : 0), 2.5, 14));
      fx.flash = 1;
      sfxThud(info.crit ? 0.75 : info.fire ? 0.6 : 1);
    }
    stat('dmg', dealt);
    const rain = first && info.rain;
    dropOre(dealt * layerKg(m, k) / maxHp, dealt * goldPerDmg(m) * (rain ? 5 : 1), x, y, first ? (rain ? 14 : info.crit ? 5 : 3) : 1, false);
    if (rain) addText(x, y - 2.2, 'ALTIN YAĞMURU ×5', '#ffe066', 18, 1.2);
    const inst = wm.inst;
    predictOn(W, m, inst, dealt, false);
    Net.hit(m, inst, k, dealt, false);
    const broke = W.mines[m].inst !== inst || W.mines[m].layer > k;
    if (broke && sk('f5')) { // Son Darbe: katmanı patlatan sensin
      const extra = 0.5 * maxHp * goldPerDmg(m);
      dropOre(0.5 * layerKg(m, k), extra, x, y, 10, true);
      addText(x - 30, y - 1.9, 'SON DARBE +' + fmt(Math.floor(extra)), '#ffb35c', 16, 1.3);
    }
    if (W.mines[m].inst !== inst) return 0;           // madeni bitirdin: ganimet sunucudan gelecek
    if (W.mines[m].layer > k) { layerBroke(m, k, b, x, y); return E - dealt; }
    return 0;
  }
  function layerBroke(m, k, b, x, y) {
    hero.chain++; fx.crater = 0;
    const core = isCore(m, k);
    if (hero.chain <= 3) for (let j = 0; j < (core ? 22 : 14); j++) spawnDebris(x + rand(-view.holeW / 2, view.holeW / 2), y + rand(0, LM), 1, b, 0.8);
    kick(core ? 12 : 7);
    if (hero.chain === 1) sfxCoin(core);
    const nk = W.mines[m].layer;
    if (isCore(m, nk)) fx.banner = { title: 'ANA DAMAR', sub: `${MINES[m].name} · son katman: iki kat sağlam`, t: 0 };
    else if (nk % 3 === 0) fx.banner = { title: upperTR(biomeOf(m, nk).name), sub: `${nk * LM} m · ${MINES[m].name}`, t: 0 };
    if (nk === 1) setTimeout(() => tip('sell', 'Cevher çantanda: ▲ Tırman ile yukarı çık, ofiste altına çevir', 5), 1200);
    dirty = true;
  }
  function impact() { // olduğu yerde zıplayıp inince
    const dive = anim.dive;
    anim.dive = false; anim.squash = 1; hero.chain = 0;
    const p = hitPower(1, dive);
    const rest = strike(p.E, true, Object.assign(p, { mult: 1, fire: false }));
    if (rest > 0) { hero.mode = 'fall'; hero.carry = rest; hero.vy = 6; hero.fallFrom = hero.y; }
    else endChain();
    if (S.stats.hits === 4) tip('dive', 'Havadayken tekrar dokun: daha hızlı ve sert iniş', 4.5);
  }
  function contact() { // düşerken zemine değince
    let rest;
    if (hero.carry > 0) rest = strike(hero.carry, false, { crit: false, quake: false, double: false, rain: false, mult: 1, fire: false });
    else {
      const h = floorM() - hero.fallFrom;
      const mult = dropMultV(hero.vy, hero.fire) * Math.pow(1.15, R().perk.fire);
      if (h >= 1) stat('fall', h);
      if (hero.fire) stat('fire', 1);
      const p = hitPower(mult, false);
      rest = strike(p.E, true, Object.assign(p, { mult, fire: hero.fire }));
    }
    if (rest > 0) { hero.carry = rest; hero.vy = Math.max(hero.vy * 0.55, 7); return; }
    hero.mode = 'bottom'; hero.vy = 0; hero.carry = 0; hero.y = floorM(); hero.fire = false;
    endChain(); land();
  }
  function endChain() {
    if (hero.chain > 2) addText(heroX(), floorM() - 2, `${hero.chain} KATMAN!`, '#ffc93c', 24, 1.3);
    hero.chain = 0;
  }
  function land() {
    anim.squash = Math.max(anim.squash, 0.7);
    rings.push({ x: heroX(), y: floorM(), life: 0, max: 0.3, s: 0.8 });
    spawnDebris(heroX(), floorM(), 4, biomeOf(S.mine, wmine().layer), 0.6);
    kick(1.5);
  }

  // Cevher zemindeki yığına düşer; karakter çantasına sığdığı kadarını toplar, gerisi zeminde bekler
  function dropOre(kgAmt, val, x, y, n, big, m = S.mine) {
    const r = runOf(m);
    r.pile.kg += kgAmt; r.pile.val += val; dirty = true;
    if (m !== S.mine || !underground() || !n) return;
    const px = pileX();
    for (let i = 0; i < n; i++) {
      if (parts.length > 300) parts.shift();
      parts.push({ x: x + rand(-6, 6), y: y - 0.1, vx: (px - x) / rand(0.45, 0.8) + rand(-50, 50), vy: rand(big ? -9 : -6, -3),
        s: big ? Math.round(rand(3, 6)) : 3, c: '#ffcc33', life: 0, max: rand(0.8, 1.2), nug: true });
    }
    if (!big && val >= 1) addText(x + 32 + rand(-6, 6), y - 0.9, '+' + fmt(Math.floor(val)), '#ffd98a', 13, 0.7);
  }
  function updatePile(dt) {
    const r = R(), p = r.pile;
    if (hero.mode !== 'bottom' || p.kg <= 0) return;
    const room = bagCap() - r.bagKg;
    if (room <= 1e-6) {
      tip('bag', r.lv.elev ? 'Çanta doldu: cevher zeminde birikiyor, asansör gelince onu da alır' : 'Çanta doldu: cevher zeminde birikiyor. ▲ Tırman, ofiste sat, geri gelip topla', 5);
      return;
    }
    const mv = Math.min(p.kg, room, dt * (15 + p.kg * 1.5)), part = p.val * mv / p.kg;
    r.bagKg += mv; r.bagVal += part; p.kg -= mv; p.val -= part;
    if (p.kg < 1e-6) { p.kg = 0; p.val = 0; }
  }

  /* ─── Dünyadan gelen olaylar: patlama payı, maden bitişi ─── */
  let clearQueue = [];
  function onWorldEvent(ev) {
    if (!ev || typeof ev !== 'object' || !MINES[ev.m]) return;
    const share = clamp(num(ev.share, 0), 0, 1);
    if (ev.type === 'break') {
      gainXp(share * layerXp(ev.m, ev.k) * xpX());
      if (share > 0) stat('layers', share);
      if (ev.n > 1 && share > 0) stat('team', 1);
      const r = S.runs[ev.m];
      if (!r || r.inst !== ev.i) return; // biten sefer: altın ve elmas o seferle gitti
      const bonus = BREAK_BONUS * share * Math.pow(1.3, sk('f3')), val = bonus * layerHp(ev.m, ev.k) * goldPerDmg(ev.m);
      const here = ev.m === S.mine && underground();
      dropOre(bonus * layerKg(ev.m, ev.k), val, here ? heroX() : 0, here ? floorM() : 0, here ? (isCore(ev.m, ev.k) ? 28 : 16) : 0, true, ev.m);
      r.gems += layerGems(ev.m, ev.k) * share * Math.pow(1.25, sk('f4'));
      if (here && val >= 1) addText(heroX() + 26, floorM() - 1.2, `PATLADI +${fmt(Math.floor(val))}` + (share < 0.999 ? ` · payın %${Math.round(share * 100)}` : ''), '#ffc93c', 17, 1.4);
    } else if (ev.type === 'clear') {
      const xp = clearXp(ev.m) * (0.3 + 0.7 * share) * xpX();
      const firstClear = !S.clears[ev.m];
      S.clears[ev.m]++; stat('clears', 1);
      const lvBefore = S.level;
      gainXp(xp);
      delete S.runs[ev.m];
      if (ev.m === S.mine && underground()) { hero.mode = 'surface'; S.under = false; S.sx = mineX(ev.m) + LADDER_DX; placeHero(); }
      clearQueue.push({ m: ev.m, share, xp, n: ev.n, levels: S.level - lvBefore, unlock: firstClear && MINES[ev.m + 1] ? MINES[ev.m + 1].name : '' });
      sfxCoin(true);
    }
  }
  function showClears() {
    if (!clearQueue.length || !el.modal.hidden || !el.login.hidden) return;
    const c = clearQueue.shift();
    openModal({
      title: 'Maden tamamlandı',
      html: `<dl class="sum"><div><dt>${MINES[c.m].name}</dt><dd>${c.n} madenci</dd></div>
        <div><dt>Toplam hasar payın</dt><dd class="gold">%${pct(c.share)}</dd></div>
        <div><dt>Ganimet tecrübesi</dt><dd>+${fmt(c.xp)}${c.levels ? ` · ${c.levels} seviye` : ''}</dd></div></dl>
        <p class="sheet-note">Seferin sıfırlandı: altın, yükseltmeler ve elmas gitti. Başarıların, seviyen ve yetenek puanların kaldı.${c.unlock ? ` Yeni maden açıldı: ${c.unlock}.` : ''} Maden yeni seferle baştan açık.</p>`,
      ok: 'Kampa dön',
    });
  }
  function gainXp(x) {
    if (!(x > 0)) return;
    S.xp += x; S.xpTotal += x; dirty = true;
    while (S.xp >= xpNeed(S.level)) {
      S.xp -= xpNeed(S.level); S.level++;
      fx.banner = { title: `USTA ${S.level}`, sub: '+1 yetenek puanı: kampta Yetenek sekmesinden dağıt', t: 0 };
      sfxCoin(true);
    }
  }

  function arriveSurface() {
    hero.mode = 'surface'; hero.y = 0; hero.lx = 1; hero.vy = 0; hero.fire = false;
    S.under = false; S.sx = mineX(S.mine) + LADDER_DX;
    const r = R();
    if (r.bagVal > 0) {
      const g = r.bagVal;
      r.coins += g; stat('gold', g);
      addText(heroX() - 34, -1.6, '+' + fmt(Math.floor(g)) + ' altın', '#ffc93c', 20, 1.4);
      spawnCoins(heroX() - 30, -0.8, 10);
      sfxCoin(true); bumpPurse();
    }
    r.bagKg = 0; r.bagVal = 0; dirty = true;
    tip('surface', 'Altınla bu seferin yükseltmelerini al. Ev butonuyla eve dönüp yeteneklerini dağıtırsın', 5);
  }

  /* ─── Yük asansörü: dipte çantayı ve zemindeki yığını alır, yukarıda satar ─── */
  function resetElevator() {
    if (elev.val > 0 && S.runs[S.mine]) S.runs[S.mine].coins += elev.val;
    Object.assign(elev, { y: 0, phase: 'down', kg: 0, val: 0, wait: 0 });
  }
  function updateElev(dt) {
    const r = R();
    if (r.lv.elev < 1) return;
    const depth = floorM(), cap = elevCap(), spd = elevSpd();
    if (elev.phase === 'down') {
      elev.y += spd * dt;
      if (elev.y >= depth) { elev.y = depth; elev.phase = 'load'; elev.wait = 0; }
    } else if (elev.phase === 'load') {
      elev.y = depth;
      if (hero.mode === 'bottom' && r.bagKg > 0 && elev.kg < cap) {
        const mv = Math.min(r.bagKg, cap - elev.kg), part = r.bagVal * mv / r.bagKg;
        elev.kg += mv; elev.val += part; r.bagKg -= mv; r.bagVal -= part;
        if (r.bagKg < 1e-6) { r.bagKg = 0; r.bagVal = 0; }
      }
      const p = r.pile;
      if (p.kg > 0 && elev.kg < cap) {
        const mv = Math.min(p.kg, cap - elev.kg), part = p.val * mv / p.kg;
        elev.kg += mv; elev.val += part; p.kg -= mv; p.val -= part;
        if (p.kg < 1e-6) { p.kg = 0; p.val = 0; }
      }
      if (elev.kg > 0) elev.wait += dt;
      if (elev.kg >= cap - 1e-6 || (elev.kg > 0 && elev.wait > 4)) elev.phase = 'up';
    } else if (elev.phase === 'up') {
      elev.y -= spd * dt;
      if (elev.y <= 0) {
        elev.y = 0;
        if (elev.val > 0) {
          r.coins += elev.val; stat('gold', elev.val); dirty = true;
          addText(sxm(mineX(S.mine) + HOLE_M / 2 - 0.5), -1.6, '+' + fmt(Math.floor(elev.val)), '#ffc93c', 16, 1.2);
          bumpPurse();
          const a = audio(); if (a) tone(a, 880, a.currentTime, 0.08, 'triangle', 0.04);
        }
        elev.kg = 0; elev.val = 0; elev.phase = 'down';
      }
    }
  }

  function updateHero(dt) {
    hero.t += dt;
    if (hero.mode === 'house') { // evin içinde yürür
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      hero.walking = dir;
      if (dir) { hero.face = dir; hero.hx = clamp(hero.hx + dir * 0.32 * dt, 0.1, 0.86); if (fx.tipT <= 0) el.hint.hidden = true; }
      return;
    }
    if (hero.mode === 'surface') { hero.walking = 0; hero.y = 0; hero.lx = 1; return; }
    if (wmine().inst !== hero.inst) { arriveSurface(); return; } // sen içerideyken maden bitti
    const depth = floorM();
    if (hero.mode === 'bottom') {
      hero.lx = Math.max(0, hero.lx - dt * 6);
      if (hero.y < depth - 0.01) { hero.mode = 'fall'; hero.vy = 0; hero.fallFrom = hero.y; hero.carry = 0; hero.chain = 0; return; } // başkası kırdı
      hero.y = depth;
      if (input.climb && anim.phase === 'idle') {
        hero.mode = 'climb'; anim.queued = false;
        tip('ladder', `Bırakmak için dokun: yükseldikçe hasar katlanır, ${fireH()} m üstünde alev alırsın`, 6);
      }
    } else if (hero.mode === 'climb') {
      hero.lx = Math.min(1, hero.lx + dt * 6);
      if (input.climb && hero.lx >= 1) {
        const d = climbSpd() * dt;
        hero.y -= d; stat('climb', d);
        if (hero.y <= 0) arriveSurface();
      }
    } else if (hero.mode === 'fall') {
      if (!hero.fire && hero.carry <= 0 && hero.vy >= fireV()) {
        hero.fire = true; sfxWhoosh();
        tip('fire', 'ALEV ALDIN: bu hızda daha da hızlanırsın ve vuruşun katlanır', 4);
      }
      hero.vy += GRAV * (hero.fire ? FIRE_GRAV : 1) * dt;
      hero.y += hero.vy * dt;
      hero.lx = Math.max(0, hero.lx - dt * 2.5);
      if (hero.fire) for (let i = 0; i < 3; i++) flames.push({ x: rand(-8, 8), y: rand(-4, 4), life: 0, max: rand(0.25, 0.45), s: rand(4, 9) });
      if (hero.y >= floorM()) { hero.y = floorM(); contact(); }
    }
  }
  function updateAnim(dt) {
    if (anim.phase === 'jump') {
      const p = anim.t / anim.dur;
      anim.t += dt * (anim.dive && p >= 0.12 ? DIVE_SPEED : 1);
      if (anim.t >= anim.dur) { anim.phase = 'recover'; anim.t = 0; impact(); }
    } else if (anim.phase === 'recover') {
      anim.t += dt;
      if (anim.t >= RECOVER) anim.phase = 'idle';
    }
    const r = R();
    if (anim.phase === 'idle' && hero.mode === 'bottom' && !input.climb && (anim.queued || (r.auto && r.lv.auto > 0))) {
      anim.queued = false; startJump();
    }
    anim.squash = Math.max(0, anim.squash - dt * 5);
  }
  function updateCam(dt) {
    const ty = hero.mode === 'bottom' ? floorM() : hero.y;
    cam.y += (ty - cam.y) * Math.min(1, dt * (hero.mode === 'fall' ? 18 : 9));
    const up = (view.G - 70) / view.bh, down = (view.h - view.G - 60) / view.bh;
    if (ty - cam.y > down) cam.y = ty - down;
    if (cam.y - ty > up) cam.y = ty + up;
    const tx = mineX(S.mine);
    cam.x += (tx - cam.x) * Math.min(1, dt * 10);
    if (Math.abs(tx - cam.x) > 30) cam.x = tx;
  }

  /* ═════════ Parçacıklar ═════════ */
  function spawnDebris(x, y, n, b, spread) {
    const cols = [b.top, b.mid, b.fleck, b.low];
    for (let i = 0; i < n; i++) {
      if (parts.length > 300) parts.shift();
      parts.push({ x: x + rand(-8, 8) * spread, y: y - 0.04, vx: rand(-170, 170) * spread, vy: rand(-6.5, -1.8),
        s: Math.round(rand(2, 5.5)), c: cols[(Math.random() * cols.length) | 0], life: 0, max: rand(0.55, 0.95) });
    }
  }
  function spawnCoins(x, y, n) {
    for (let i = 0; i < n; i++) parts.push({ x: x + rand(-20, 20), y, vx: rand(-140, 140), vy: rand(-8, -4), s: 5, c: '#ffcc33', life: 0, max: 1.05 + i * 0.02, coin: true, px: 0, py: 0 });
  }
  function updateFx(dt) {
    const floor = underground() ? floorM() : 0;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      if (p.coin && p.life > 0.3) {
        if (!p.px) { p.px = p.x; p.py = sy(p.y); }
        const k = Math.min(1, dt * (4 + (p.life - 0.3) * 20));
        p.px += (22 - p.px) * k; p.py += (-40 - p.py) * k;
      } else {
        p.vy += 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (!p.coin && p.y > floor && p.vy > 0 && p.y - p.vy * dt <= floor) { p.y = floor; p.vy *= -0.3; p.vx *= 0.6; }
      }
    }
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life += dt; t.y -= 0.8 * dt; if (t.life >= t.max) texts.splice(i, 1); }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life += dt; if (r.life >= r.max) rings.splice(i, 1); }
    for (let i = flames.length - 1; i >= 0; i--) { const f = flames[i]; f.life += dt; f.y -= 60 * dt; if (f.life >= f.max) flames.splice(i, 1); }
  }

  /* ═════════ Diğer oyuncular ═════════ */
  function presence() {
    const r = R();
    return {
      sc: scene === 'house' ? 'h' : 'm', m: S.mine, u: underground() ? 1 : 0, y: Math.round(hero.y * 100) / 100,
      lx: Math.round(hero.lx * 100) / 100, md: hero.mode[0], a: anim.phase === 'jump' ? Math.round((anim.t / anim.dur) * 100) / 100 : -1,
      jd: Math.round(anim.dur * 100) / 100,
      f: hero.fire ? 1 : 0, w: hero.walking, lv: S.level, g: [r.lv.helm, r.lv.glove, r.lv.boot], au: myAura(),
    };
  }
  const SLOT_X = [0.95, -0.95, 1.35, -1.35, 0.55, -0.55];
  function slotOf(key) { let h = 0; for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0; return SLOT_X[Math.abs(h) % SLOT_X.length]; }
  const inMineOf = (p, i) => p && p.sc === 'm' && p.m === i;
  // Diğer oyuncunun maden içindeki konumu (metre): dipte kendi yeri, yüzeyde merdivenin yanında
  function otherX(key, p) {
    if (!p || !MINES[p.m]) return 0;
    const lx = num(p.lx, 0);
    return mineX(p.m) + (p.u ? lx * LADDER_DX + (1 - lx) * slotOf(key) : LADDER_DX - 0.6 - Math.abs(slotOf(key)) * 1.3);
  }
  // Takılmasın diye: karşı taraf 220 ms geriden, iki anlık görüntü arasında pürüzsüz çizilir; zıplama evresi yerelde ilerler
  const INTERP_MS = 220;
  function pushSnap(key, o) {
    const p = o.pos || {}, now = performance.now();
    const snap = { t: now, x: otherX(key, p), y: num(p.y, 0), a: typeof p.a === 'number' ? p.a : -1, jd: clamp(num(p.jd, 0.72), 0.1, 2) };
    o.snaps = o.snaps || [];
    const last = o.snaps[o.snaps.length - 1];
    if (last && (Math.abs(last.x - snap.x) > 15 || Math.abs(last.y - snap.y) > 25)) o.snaps.length = 0; // ışınlandı
    o.snaps.push(snap);
    if (o.snaps.length > 16) o.snaps.shift();
  }
  function updateOthers(dt) {
    const rt = performance.now() - INTERP_MS;
    for (const o of Net.others.values()) {
      o.t = (o.t || 0) + dt;
      const sn = o.snaps;
      if (!sn || !sn.length) continue;
      while (sn.length > 2 && sn[1].t <= rt) sn.shift();
      const s0 = sn[0], s1 = sn[1];
      if (!s1 || rt <= s0.t) { o.rx = s0.x; o.ry = s0.y; }
      else { const k = clamp((rt - s0.t) / Math.max(1, s1.t - s0.t), 0, 1); o.rx = s0.x + (s1.x - s0.x) * k; o.ry = s0.y + (s1.y - s0.y) * k; }
      let ph = s0.a >= 0 ? s0.a + Math.max(0, rt - s0.t) / (1000 * s0.jd) : -1;
      if ((ph < 0 || ph >= 1) && s1 && s1.a >= 0) { const q = s1.a - (s1.t - rt) / (1000 * s1.jd); ph = q >= 0 && q < 1 ? q : -1; }
      o.phase = ph >= 1 ? -1 : ph;
    }
  }

  /* ═════════ Katman dokuları (deterministik) ═════════ */
  const texCache = new Map();
  function texFor(k, core) {
    let t = texCache.get(k);
    if (t) return t;
    const r = mulberry32(k * 7919 + 101);
    const hard = !!core, bi = k % 12;
    const specks = [];
    const n = 30 + Math.floor(r() * 14);
    for (let i = 0; i < n; i++) specks.push({ x: r(), y: 0.1 + r() * 0.8, s: 2 + Math.floor(r() * 3), dark: r() < 0.45 });
    const nuggets = [];
    const nn = hard ? 9 : (r() < 0.22 + (bi % 12) * 0.05 ? 1 + Math.floor(r() * 2) : 0);
    for (let i = 0; i < nn; i++) nuggets.push({ x: r(), y: 0.25 + r() * 0.5, s: hard ? 3.5 + r() * 3 : 2.5 + r() * 2 });
    const cracks = [];
    for (let i = 0; i < 8; i++) {
      let a = 0.05 * Math.PI + (i / 7) * Math.PI * 0.9 + (r() - 0.5) * 0.3, x = 0, y = 0;
      const pts = [], segs = 3 + Math.floor(r() * 2);
      for (let j = 0; j < segs; j++) { a += (r() - 0.5) * 0.7; const len = 0.18 + r() * 0.22; x += Math.cos(a) * len * 1.6; y += Math.abs(Math.sin(a)) * len; pts.push([x, y]); }
      cracks.push(pts);
    }
    for (let i = cracks.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [cracks[i], cracks[j]] = [cracks[j], cracks[i]]; }
    t = { specks, nuggets, cracks, eL: Math.round((r() - 0.5) * 12), eR: Math.round((r() - 0.5) * 12) };
    texCache.set(k, t);
    if (texCache.size > 200) texCache.delete(texCache.keys().next().value);
    return t;
  }

  /* ═════════ Çizim: dünya ═════════ */
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  function drawSky(W_, y0, time) {
    const g = ctx.createLinearGradient(0, y0 - view.h, 0, y0);
    g.addColorStop(0, '#6ea8d6'); g.addColorStop(1, '#d4ebf3');
    ctx.fillStyle = g; ctx.fillRect(-12, -12, W_ + 24, y0 + 12);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const span = W_ + 160;
    for (let i = 0; i < 3; i++) {
      const cx = ((((time * (6 + i * 3) + i * 170 - cam.x * view.bh * 0.3) % span) + span) % span) - 80, cy = y0 - view.bh * (3.2 - i * 0.55);
      ctx.beginPath(); ctx.ellipse(cx, cy, 26 + i * 6, 8, 0, 0, Math.PI * 2); ctx.ellipse(cx + 16, cy - 6, 16, 9, 0, 0, Math.PI * 2); ctx.fill();
    }
    const hx = -cam.x * view.bh * 0.5, step = W_ * 0.9;
    const i0 = Math.floor(-hx / step) - 1;
    ctx.fillStyle = '#a3c9a6';
    for (let i = i0; i < i0 + 4; i++) { ctx.beginPath(); ctx.ellipse(hx + i * step + W_ * 0.16, y0, W_ * 0.34, view.bh * 1.1, 0, Math.PI, 0); ctx.fill(); }
    ctx.fillStyle = '#8bbb90';
    for (let i = i0; i < i0 + 4; i++) { ctx.beginPath(); ctx.ellipse(hx + i * step + W_ * 0.66, y0, W_ * 0.38, view.bh * 0.8, 0, Math.PI, 0); ctx.fill(); }
  }
  // Bir katman LM metre kalınlığında dev bir blok
  function drawLayer(m, k, y, x0, x1, H, bed) {
    const core = !bed && isCore(m, k), b = bed ? BEDROCK : biomeOf(m, k), t = texFor(m * 100 + k, core), w = x1 - x0;
    const g = ctx.createLinearGradient(0, y, 0, y + H);
    g.addColorStop(0, core ? shade(b.top, -0.15) : b.top); g.addColorStop(1, core ? shade(b.low, -0.1) : b.mid);
    ctx.fillStyle = g; ctx.fillRect(x0, y, w, H + 1);
    for (let row = 0; row < LM; row++) {
      const yy = y + row * (H / LM);
      for (const s of t.specks) if ((s.x * 7 + row) % 2 < 1.2) rect(Math.round(x0 + ((s.x + row * 0.37) % 1) * w), Math.round(yy + s.y * (H / LM)), s.s, s.s, s.dark ? b.low : b.fleck);
    }
    if (t.nuggets.length && !bed) {
      if (core) { ctx.shadowColor = b.vein; ctx.shadowBlur = 10; }
      ctx.fillStyle = b.vein;
      for (const nu of t.nuggets) {
        const nx = x0 + nu.x * w, ny = y + nu.y * H, s = nu.s * (core ? 1.4 : 1.1);
        ctx.beginPath(); ctx.moveTo(nx, ny - s); ctx.lineTo(nx + s, ny); ctx.lineTo(nx, ny + s); ctx.lineTo(nx - s, ny); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    rect(x0, y, w, 2, 'rgba(255,255,255,.08)'); rect(x0, y + H - 3, w, 3, 'rgba(0,0,0,.3)');
    if (core) { ctx.globalAlpha = 0.6; rect(x0, y + 5, w, 3, b.vein); rect(x0, y + H - 9, w, 3, b.vein); ctx.globalAlpha = 1; }
  }
  function drawHoleBand(m, k, y, L, Rr, H) {
    const b = biomeOf(m, k), t = texFor(m * 100 + k, false), l = L + t.eL, r = Rr + t.eR;
    rect(l, y, r - l, H + 1, b.back);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    for (const s of t.specks) { const sx = l + s.x * (r - l); if (sx < r - s.s) ctx.fillRect(Math.round(sx), Math.round(y + s.y * H), s.s, s.s); }
    rect(l, y + H - 2, r - l, 2, 'rgba(0,0,0,.3)');
    let sg = ctx.createLinearGradient(l, 0, l + 16, 0);
    sg.addColorStop(0, 'rgba(0,0,0,.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.fillRect(l, y, 16, H + 1);
    sg = ctx.createLinearGradient(r - 16, 0, r, 0);
    sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,.5)'); ctx.fillStyle = sg; ctx.fillRect(r - 16, y, 16, H + 1);
  }
  function drawGrass(y0, a, b) {
    if (b <= a) return;
    rect(a, y0 - 3, b - a, 7, '#4f8f36'); rect(a, y0 - 4, b - a, 3, '#76b94c');
    ctx.fillStyle = '#76b94c';
    const off = Math.round(cam.x * view.bh);
    for (let x = Math.ceil(a / 7) * 7; x < b - 2; x += 7) ctx.fillRect(x, y0 - 7 - (((x + off) * 13 % 3) + 3) % 3, 2, 4);
  }
  function drawLadder(x, yTop, yBot) {
    const a = Math.max(yTop, -20), b = Math.min(yBot, view.h + 20);
    if (b <= a) return;
    rect(x - 7, a, 3, b - a, '#6b4a2b'); rect(x + 4, a, 3, b - a, '#6b4a2b');
    rect(x - 6, a, 1, b - a, '#8d6840'); rect(x + 5, a, 1, b - a, '#8d6840');
    const step = view.bh / 3, first = yTop + Math.ceil((a - yTop) / step) * step;
    for (let y = first; y <= b; y += step) rect(x - 5, Math.round(y), 10, 2, '#9a7447');
  }
  function drawSurfaceStructures(i, cx, y0, dug) {
    const BH = view.bh, hw = view.holeW / 2;
    const ow = BH * 1.5, oh = BH * 0.95, ox = cx - hw - ow - 10;
    rect(ox, y0 - oh, ow, oh, '#c8a176'); rect(ox, y0 - oh, ow, 3, '#e0bd92');
    ctx.fillStyle = '#8a3b2a';
    ctx.beginPath(); ctx.moveTo(ox - 6, y0 - oh + 1); ctx.lineTo(ox + ow / 2, y0 - oh - BH * 0.45); ctx.lineTo(ox + ow + 6, y0 - oh + 1); ctx.fill();
    rect(ox + ow * 0.62, y0 - oh * 0.62, ow * 0.2, oh * 0.62, '#5d3b22'); rect(ox + ow * 0.14, y0 - oh * 0.66, ow * 0.3, oh * 0.3, '#9fd3e6');
    rect(ox + ow * 0.1, y0 - oh - 13, ow * 0.8, 13, '#2b2119');
    ctx.fillStyle = '#ffd35c'; ctx.font = `700 10px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OFİS', ox + ow / 2, y0 - oh - 6.5);
    const top = y0 - BH * 2.1;
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - hw + 6, y0); ctx.lineTo(cx + hw * 0.55, top); ctx.lineTo(cx + hw - 6, y0); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - hw * 0.35, y0 - BH * 0.9); ctx.lineTo(cx + hw * 0.92, y0 - BH * 0.9); ctx.stroke();
    const sx = cx + hw + 14, tw = 108, wm = W.mines[i], open = unlocked(i);
    rect(sx + 20, y0 - BH * 1.2, 4, BH * 1.2, '#5d3b22'); rect(sx, y0 - BH * 1.35, tw, 30, '#2b2119');
    ctx.textAlign = 'left'; ctx.fillStyle = '#f6ecdf';
    ctx.fillText(upperTR(MINES[i].name), sx + 5, y0 - BH * 1.35 + 10, tw - 9);
    ctx.fillStyle = open ? '#ffd35c' : '#ff9a7a';
    ctx.fillText(open ? `KATMAN ${wm.layer + 1}/${MINES[i].layers}` : 'KİLİTLİ', sx + 5, y0 - BH * 1.35 + 22, tw - 9);
    if (!dug && !open) for (let k = 0; k < 4; k++) rect(cx - hw - 4, y0 - 4 + k * 7, hw * 2 + 8, 5, k % 2 ? '#7a5634' : '#8d6840');
  }
  /* ─── Ev: madencinin evi (kalıcı gelişim burada) ─── */
  const houseFloor = () => Math.round(view.h * 0.7);
  function drawFlames(cx, by, time, n, h) {
    for (let i = 0; i < n; i++) {
      const fl = Math.sin(time * 9 + i * 1.7) * 3;
      ctx.fillStyle = i % 2 ? '#ffae3c' : '#ff6a1f';
      ctx.beginPath(); ctx.moveTo(cx - n * 2 + i * 4, by); ctx.lineTo(cx - n * 2 + 2 + i * 4, by - h - fl - (i === (n >> 1) ? 6 : 0)); ctx.lineTo(cx - n * 2 + 4 + i * 4, by); ctx.fill();
    }
  }
  function drawHouse(W_, H, time) {
    const fy = houseFloor(), BH = view.bh;
    // duvar: ahşap tahtalar
    let g = ctx.createLinearGradient(0, 0, 0, fy);
    g.addColorStop(0, '#4e321e'); g.addColorStop(1, '#6e4a2c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W_, fy);
    for (let x = 0; x < W_; x += 30) { rect(x, 0, 2, fy, 'rgba(0,0,0,.2)'); rect(x + 2, 0, 1, fy, 'rgba(255,255,255,.05)'); }
    rect(0, 0, W_, 10, '#3a2414'); rect(0, fy - 10, W_, 10, '#3a2414');
    // zemin tahtaları
    g = ctx.createLinearGradient(0, fy, 0, H); g.addColorStop(0, '#7a5230'); g.addColorStop(1, '#4a2f1a');
    ctx.fillStyle = g; ctx.fillRect(0, fy, W_, H - fy);
    for (let y = fy + 14, i = 0; y < H; y += 15, i++) { rect(0, y, W_, 2, 'rgba(0,0,0,.22)'); for (let x = (i % 2) * 40; x < W_; x += 80) rect(x, y - 13, 2, 13, 'rgba(0,0,0,.15)'); }
    // halı
    ctx.fillStyle = '#8a2f2a'; ctx.beginPath(); ctx.ellipse(W_ * 0.5, fy + 18, W_ * 0.28, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9a441'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(W_ * 0.5, fy + 18, W_ * 0.24, 9, 0, 0, Math.PI * 2); ctx.stroke();
    // pencere (sol): dışarıda gökyüzü ve tepeler
    const wx = W_ * 0.05, wy = fy * 0.2, ww = W_ * 0.22, wh = fy * 0.34;
    g = ctx.createLinearGradient(0, wy, 0, wy + wh); g.addColorStop(0, '#6ea8d6'); g.addColorStop(1, '#d4ebf3');
    ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
    ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    const cxl = wx + ((time * 8) % (ww + 40)) - 20; ctx.beginPath(); ctx.ellipse(cxl, wy + wh * 0.3, 14, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8bbb90'; ctx.beginPath(); ctx.ellipse(wx + ww * 0.3, wy + wh, ww * 0.5, wh * 0.35, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#6fa577'; ctx.beginPath(); ctx.ellipse(wx + ww * 0.85, wy + wh, ww * 0.45, wh * 0.25, 0, Math.PI, 0); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#3a2414'; ctx.lineWidth = 5; ctx.strokeRect(wx, wy, ww, wh);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
    rect(wx - 6, wy + wh, ww + 12, 6, '#3a2414');
    // şömine (orta): taşlar, ateş, sıcak ışık
    const fx0 = W_ * 0.5, fw = Math.min(W_ * 0.26, BH * 2.6), fh = fy * 0.42;
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) rect(fx0 - fw / 2 + c * (fw / 6) + (r % 2) * 4, fy - fh + r * (fh / 6), fw / 6 - 2, fh / 6 - 2, r % 2 ? '#6d6a66' : '#7d7a75');
    rect(fx0 - fw * 0.3, fy - fh * 0.55, fw * 0.6, fh * 0.55, '#1a120c');
    rect(fx0 - fw / 2 - 8, fy - fh - 8, fw + 16, 8, '#4a2f1b');
    drawFlames(fx0, fy - 4, time, 7, 20);
    g = ctx.createRadialGradient(fx0, fy - 20, 4, fx0, fy - 20, BH * 3);
    g.addColorStop(0, 'rgba(255,170,60,.35)'); g.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g; ctx.fillRect(fx0 - BH * 3, fy - 20 - BH * 3, BH * 6, BH * 6);
    // şöminenin üstünde maden haritası: açık madenler parlak
    const mx0 = fx0 - fw * 0.55, my0 = fy - fh - 8 - fy * 0.24, mw = fw * 1.1, mh = fy * 0.2;
    rect(mx0, my0, mw, mh, '#e8d4a6'); rect(mx0, my0, mw, 3, '#c9b07c');
    ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 1.5; ctx.beginPath();
    MINES.forEach((_, i) => { const px = mx0 + mw * (0.1 + 0.8 * i / Math.max(1, MINES.length - 1)), py = my0 + mh * (0.35 + 0.3 * Math.sin(i * 1.7)); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
    MINES.forEach((_, i) => {
      const px = mx0 + mw * (0.1 + 0.8 * i / Math.max(1, MINES.length - 1)), py = my0 + mh * (0.35 + 0.3 * Math.sin(i * 1.7));
      ctx.fillStyle = unlocked(i) ? (S.clears[i] ? '#2d7a4c' : '#c77d3a') : '#8a7a60';
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill();
    });
    // kupa rafı (sağ üst): her başarı kademesi bir kupa
    const cups = ACHS.reduce((a, x) => a + achTier(x), 0), sx0 = W_ * 0.66, sy0 = fy * 0.26, sw = W_ * 0.2;
    rect(sx0, sy0, sw, 5, '#3a2414'); rect(sx0, sy0 + 34, sw, 5, '#3a2414');
    for (let i = 0; i < Math.min(cups, 16); i++) {
      const row = i < 8 ? 0 : 1, col = i % 8, cx = sx0 + 6 + col * (sw - 12) / 7, cy = sy0 - 2 + row * 34;
      const c = i < 8 ? '#ffc93c' : '#d9dee4';
      rect(cx - 4, cy - 12, 8, 7, c); rect(cx - 1, cy - 5, 2, 3, c); rect(cx - 3, cy - 2, 6, 2, shade(c, -0.2));
    }
    ctx.font = `700 10px ${FONT_NUM}`; ctx.fillStyle = 'rgba(255,240,210,.75)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (cups) ctx.fillText(`${cups} kupa`, sx0 + sw / 2, sy0 + 52);
    // kapı (sağ): madenlere çıkış
    const dw = Math.min(W_ * 0.14, BH * 1.4), dh = fy * 0.55, dx = W_ - dw - 10;
    rect(dx, fy - dh, dw, dh, '#5b3a1f'); rect(dx + 4, fy - dh + 4, dw - 8, dh - 4, '#6f4727');
    rect(dx + dw - 12, fy - dh * 0.5, 5, 5, '#ffc93c');
    rect(dx - 4, fy - dh - 20, dw + 8, 16, '#2b2119');
    ctx.fillStyle = '#ffd35c'; ctx.fillText('MADENLER', dx + dw / 2, fy - dh - 12, dw + 4);
    // tavan lambası
    g = ctx.createRadialGradient(W_ * 0.5, 0, 4, W_ * 0.5, 0, H * 0.8);
    g.addColorStop(0, 'rgba(255,220,160,.12)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W_, H);
  }
  function drawMine(i, W_, H, BH) {
    const cx = sxm(mineX(i));
    const x0 = -12, x1 = W_ + 12; // menüden seçilen tek maden ekranı kaplar
    const M = MINES[i], wm = W.mines[i], layer = wm.layer, dug = layer > 0, LH = LM * BH;
    const L = Math.round(cx - view.holeW / 2), Rr = L + view.holeW;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, -20, x1 - x0, H + 40); ctx.clip();
    const top = Math.max(0, Math.floor((cam.y - view.G / BH) / LM) - 1), bot = Math.ceil((cam.y + (H - view.G) / BH) / LM) + 1;
    const xa = x0;
    for (let k = top; k <= bot; k++) {
      const y = Math.round(sy(k * LM));
      drawLayer(i, k, y, xa, x1, LH, k >= M.layers);
      if (k < layer) drawHoleBand(i, k, y, L, Rr, LH);
    }
    const y0 = sy(0);
    if (y0 > -BH * 3 && y0 < H + 10) { if (dug) { drawGrass(y0, xa, L); drawGrass(y0, Rr, x1); } else drawGrass(y0, xa, x1); }
    if (dug) {
      ctx.font = `700 10px ${FONT_NUM}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let k = Math.max(1, top); k <= Math.min(layer, bot); k++) {
        const y = sy(k * LM);
        rect(L - 12, y, 10, 2, 'rgba(255,240,210,.55)');
        ctx.fillStyle = 'rgba(255,240,210,.7)'; ctx.fillText(`${k * LM} m`, L - 15, y + 1);
      }
    }
    if (dug || unlocked(i)) drawLadder(cx + LADDER_DX * BH, sy(-0.9), sy(layer * LM));
    if (y0 > -BH * 4 && y0 < H + BH * 3) drawSurfaceStructures(i, cx, y0, dug);
    if (i === S.mine && R().lv.elev > 0) drawElevator(cx, BH);
    ctx.restore();
  }
  function drawElevator(cx, BH) {
    const x = cx + view.holeW / 2 - 24, top = sy(-2.1) + 8, cageB = sy(elev.y), cageT = cageB - BH * 1.05;
    ctx.strokeStyle = 'rgba(40,32,26,.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 2, top); ctx.lineTo(x + 2, cageT); ctx.stroke();
    if (cageT > view.h + 10 || cageB < -10) return;
    const w = 26;
    rect(x - w / 2 + 2, cageT, w, cageB - cageT, 'rgba(20,16,12,.55)');
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2 + 2, cageT, w, cageB - cageT);
    ctx.beginPath(); ctx.moveTo(x - w / 2 + 2, cageT + (cageB - cageT) / 2); ctx.lineTo(x + w / 2 + 2, cageT + (cageB - cageT) / 2); ctx.stroke();
    const f = elev.kg / Math.max(1, elevCap());
    if (f > 0) rect(x - w / 2 + 4, cageB - 2 - (cageB - cageT - 4) * f * 0.48, w - 4, (cageB - cageT - 4) * f * 0.48, '#ffcc33');
  }
  function drawDamage(y, cx) {
    const wm = wmine(), cf = fx.crater, BH = view.bh;
    if (cf < 0.02 && fx.flash <= 0) return;
    const L = cx - view.holeW / 2, Rr = cx + view.holeW / 2, k = wm.layer;
    const t = texFor(S.mine * 100 + k, isCore(S.mine, k)), b = biomeOf(S.mine, k), H = LM * BH;
    ctx.save(); ctx.beginPath(); ctx.rect(L, y, Rr - L, H); ctx.clip();
    if (fx.flash > 0) rect(L, y, Rr - L, H, `rgba(255,245,225,${0.14 * fx.flash})`);
    const nC = Math.ceil(cf * t.cracks.length), sc = BH * (0.6 + 1.6 * cf);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = 0; i < nC; i++) {
      ctx.beginPath(); ctx.moveTo(cx, y + 2);
      for (const p of t.cracks[i]) ctx.lineTo(cx + p[0] * sc, y + 2 + p[1] * sc * 1.6);
      ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 2.4; ctx.stroke();
    }
    if (cf > 0.02) { ctx.fillStyle = b.back; ctx.beginPath(); ctx.ellipse(cx, y, view.holeW * 0.36 * (0.35 + 0.65 * cf), BH * 0.5 * cf, 0, 0, Math.PI); ctx.fill(); }
    ctx.restore();
  }
  function drawPile(y) {
    const amount = R().pile.kg;
    if (amount < 0.3) return;
    const w = clamp(14 + 13 * Math.log2(1 + amount / 2), 14, view.holeW * 0.62), h = w * 0.3, px = pileX();
    ctx.fillStyle = '#9a6b08';
    ctx.beginPath(); ctx.ellipse(px, y + 1, w / 2, h, 0, Math.PI, 0); ctx.fill();
    const n = Math.min(46, 5 + Math.floor(w / 3.5));
    for (let i = 0; i < n; i++) {
      const a = ((i * 7919) % 101) / 101, b = ((i * 104729) % 97) / 97;
      const nx = px + (a - 0.5) * w * 0.9, top = h * Math.sqrt(Math.max(0, 1 - Math.pow((nx - px) / (w / 2), 2)));
      const s = 2 + (i % 3);
      rect(nx - s / 2, y + 1 - b * top * 0.9 - s / 2, s, s, i % 4 === 0 ? '#fff1a8' : i % 2 ? '#ffcc33' : '#e0a71c');
    }
  }

  /* ═════════ Çizim: karakterler ═════════ */
  function poseFor(md, a, t, walking, vy, climbing) {
    const P = { lift: 0, sx: 1, sy: 1, armL: 0.25, armR: 0.25, legL: 0, legR: 0 };
    if (md === 'f') { const fast = clamp(vy / 25, 0, 1); P.sx = 1 - 0.08 * fast; P.sy = 1 + 0.12 * fast; P.armL = P.armR = 2.3 + 0.4 * fast; return P; }
    if (md === 'c') { const ph = climbing ? Math.sin(t * 12) : 0; P.armL = 2.6 + 0.35 * ph; P.armR = 2.6 - 0.35 * ph; P.legL = ph * 1.4; P.legR = -ph * 1.4; return P; }
    if (walking) { const ph = Math.sin(t * 14); P.armL = 0.25 + 0.3 * ph; P.armR = 0.25 - 0.3 * ph; P.legL = ph * 1.2; P.legR = -ph * 1.2; return P; }
    if (a >= 0) {
      let arm = 0.25, lift = 0;
      if (a < 0.12) { const q = a / 0.12, s = Math.sin(q * Math.PI); P.sy = 1 - 0.22 * s; P.sx = 1 + 0.16 * s; arm = 0.25 + 0.6 * q; }
      else if (a < 0.55) { const q = (a - 0.12) / 0.43; lift = 1 - Math.pow(1 - q, 3); P.sy = 1.12 - 0.12 * q; P.sx = 0.92 + 0.08 * q; arm = 0.85 + 1.95 * q; }
      else { const q = (a - 0.55) / 0.45; lift = 1 - q * q; P.sy = 1 + 0.14 * q; P.sx = 1 - 0.08 * q; arm = 2.8 - 2.3 * q * q; }
      P.lift = lift * view.jumpH; P.armL = P.armR = arm;
    }
    return P;
  }
  const SKIN = '#f0c294', SHIRT = '#d65a31', OVERALL = '#35577f';
  function drawArm(px, py, a, side, glove, gloved, shirt) {
    ctx.save(); ctx.translate(px, py); ctx.rotate(-side * a);
    rect(-1.5, 0, 3, 6.5, shirt);
    if (gloved) { rect(-2.1, 5.4, 4.2, 3.4, glove); rect(-2.1, 5.4, 4.2, 0.9, shade(glove, 0.25)); } else rect(-1.7, 6, 3.4, 2.4, SKIN);
    ctx.restore();
  }
  // look: { g: [kask, eldiven, bot], bag: 0..1, shirt, squash }
  function drawMiner(x, feetY, pose, look) {
    const [ht, gt, bt] = look.g.map((v) => clamp(Math.floor(num(v, 0)), 0, TIER_MAX));
    const boot = slotColor('boot', bt), bootHi = shade(boot, 0.25), helm = slotColor('helm', ht), helmD = shade(helm, -0.22);
    const glove = slotColor('glove', gt), shirt = look.shirt || SHIRT;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(feetY));
    ctx.scale(view.u * pose.sx, view.u * pose.sy);
    rect(-5, -9 + pose.legL, 4, 6, OVERALL); rect(1, -9 + pose.legR, 4, 6, OVERALL);
    rect(-6.5, -3.5 + pose.legL, 6, 3.5, boot); rect(0.5, -3.5 + pose.legR, 6, 3.5, boot);
    rect(-6.5, -3.5 + pose.legL, 6, 1, bootHi); rect(0.5, -3.5 + pose.legR, 6, 1, bootHi);
    rect(-6, -17, 12, 8.5, shirt); rect(-4.5, -14.5, 9, 6, OVERALL);
    rect(-4.5, -17, 1.6, 3, OVERALL); rect(2.9, -17, 1.6, 3, OVERALL);
    if (look.bag != null) { rect(4.8, -15.5, 3.6, 6, '#6b4a2b'); if (look.bag > 0) rect(5.2, -10 - 5 * look.bag, 2.8, 5 * look.bag, look.bag >= 1 ? '#ff9a7a' : '#ffd35c'); }
    drawArm(-7.4, -16, pose.armL, -1, glove, gt > 0, shirt);
    drawArm(7.4, -16, pose.armR, 1, glove, gt > 0, shirt);
    rect(-4.5, -23.5, 9, 6.5, SKIN);
    rect(-2.8, -21.2, 1.4, 1.8, '#2b1a10'); rect(1.4, -21.2, 1.4, 1.8, '#2b1a10');
    if (look.squash > 0.3) rect(-1.2, -18.8, 2.4, 1, '#7a2e1a');
    rect(-5.5, -27, 11, 4, helm); rect(-4.5, -28, 9, 1.2, helm); rect(-7, -23.6, 14, 1.4, helmD); rect(-1.4, -26.6, 2.8, 2.4, '#fff4c7');
    ctx.restore();
  }
  function drawFire(x, feetY) { // düşerken alev: karakterin etrafında kızıl parıltı ve yukarı savrulan dilimler
    const u = view.u, cy = feetY - 14 * u;
    const g = ctx.createRadialGradient(x, cy, 4, x, cy, 30 * u);
    g.addColorStop(0, 'rgba(255,190,80,.55)'); g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 32 * u, cy - 32 * u, 64 * u, 64 * u);
    for (const f of flames) {
      const q = f.life / f.max;
      ctx.globalAlpha = 1 - q;
      rect(x + f.x * u - f.s / 2, feetY - 30 * u + f.y - f.s / 2 - 10, f.s, f.s * 1.6, q < 0.4 ? '#fff1a8' : q < 0.7 ? '#ffae3c' : '#ff5a1f');
    }
    ctx.globalAlpha = 1;
  }
  function drawTag(x, y, text, color) {
    ctx.font = `700 11px ${FONT_NUM}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = 'rgba(14,10,8,.7)'; ctx.fillRect(x - w / 2, y - 8, w, 16);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function drawOthers() {
    if (scene !== 'mine') return;
    for (const o of Net.others.values()) {
      const p = o.pos || {};
      if (!inMineOf(p, S.mine) || o.rx == null) continue;
      const x = sxm(o.rx);
      if (x < -40 || x > view.w + 40) continue;
      const pose = poseFor(p.md, p.md === 'b' ? o.phase : -1, o.t, false, 20, p.md === 'c');
      const feet = sy(o.ry) - pose.lift;
      if (p.f) drawFire(x, feet);
      drawMiner(x, feet, pose, { g: Array.isArray(p.g) ? p.g : [0, 0, 0], shirt: '#3f8f6b', squash: 0 });
      drawTag(x, feet - 34 * view.u, `${o.name} · ${p.lv || 1}`, '#bfeccf');
    }
  }
  function heroPoseNow() {
    let md = hero.mode === 'bottom' ? 'b' : hero.mode === 'climb' ? 'c' : hero.mode === 'fall' ? 'f' : 's';
    const a = anim.phase === 'jump' ? anim.t / anim.dur : -1;
    const P = poseFor(md, hero.mode === 'bottom' ? a : -1, hero.t, hero.mode === 'surface' && hero.walking !== 0, hero.vy, input.climb && hero.lx >= 1);
    if (anim.squash > 0 && hero.mode === 'bottom') { const s = anim.squash; P.sy *= 1 - 0.28 * s; P.sx *= 1 + 0.22 * s; }
    return P;
  }
  function drawRuler(W_, H) {
    if (!underground()) return;
    const depth = floorM(), total = MINES[S.mine].layers * LM;
    const x = W_ - 11, top = 72, bot = H - 70;
    if (bot - top < 60) return;
    const yOf = (m) => top + (bot - top) * clamp(m / total, 0, 1);
    rect(x - 1, top, 3, bot - top, 'rgba(14,10,8,.55)'); rect(x, top, 1, yOf(depth) - top, 'rgba(255,240,210,.7)');
    for (let k = 1; k < MINES[S.mine].layers; k++) rect(x - 2, yOf(k * LM), 5, 1, 'rgba(255,240,210,.35)');
    ctx.font = `700 9px ${FONT_NUM}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,240,210,.8)';
    ctx.fillText('0', x - 4, top); ctx.fillText(`${total} m`, x - 4, bot);
    if (R().lv.elev > 0) rect(x - 3, yOf(elev.y) - 3, 7, 6, '#6fe0fa');
    for (const o of Net.others.values()) if (inMineOf(o.pos, S.mine) && o.pos.u && o.rx != null) rect(x - 4, yOf(o.ry) - 2, 5, 4, '#bfeccf');
    const hy = yOf(hero.mode === 'bottom' ? depth : hero.y);
    ctx.fillStyle = '#ffc93c'; ctx.beginPath(); ctx.moveTo(x - 7, hy - 5); ctx.lineTo(x + 1, hy); ctx.lineTo(x - 7, hy + 5); ctx.fill();
  }

  function draw(time) {
    const W_ = view.w, H = view.h, BH = view.bh;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#120d0a'; ctx.fillRect(0, 0, W_, H);
    ctx.save();
    if (fx.shake > 0) ctx.translate(rand(-fx.shake, fx.shake), rand(-fx.shake, fx.shake) * 0.6);
    if (scene === 'house') drawHouse(W_, H, time);
    else {
      const y0 = sy(0);
      if (y0 > -20) drawSky(W_, y0, time);
      drawMine(S.mine, W_, H, BH);
      if (underground()) { drawDamage(Math.round(sy(floorM())), sxm(mineX(S.mine))); drawPile(sy(floorM()) + sink() * 0.5); }
      drawOthers();
    }

    // Sen
    const pose = heroPoseNow(), hx = heroX();
    const feetY = hero.mode === 'house' ? houseFloor() + 2 : hero.mode === 'bottom' ? sy(floorM()) + sink() - pose.lift : sy(hero.y);
    if (hero.mode === 'bottom') {
      const k = 1 - 0.55 * (pose.lift / view.jumpH);
      ctx.fillStyle = 'rgba(0,0,0,.32)';
      ctx.beginPath(); ctx.ellipse(hx, sy(floorM()) + sink() + 1, 9 * view.u * k, 2.2 * view.u * k, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (hero.mode === 'fall' && hero.vy > 12) {
      ctx.fillStyle = `rgba(255,240,210,${clamp((hero.vy - 12) / 40, 0.15, 0.6)})`;
      const len = clamp(hero.vy * 0.8, 10, 70);
      for (const dx of [-6, 0, 6]) ctx.fillRect(hx + dx * view.u - 1, feetY - 30 * view.u - len - Math.abs(dx), 2, len);
    } else if (anim.dive && anim.phase === 'jump') {
      ctx.fillStyle = 'rgba(255,240,210,.55)';
      for (const dx of [-6, 0, 6]) ctx.fillRect(hx + dx * view.u - 1, feetY - 30 * view.u - 14 - Math.abs(dx) * 1.5, 2, 12 + (dx === 0 ? 6 : 0));
    }
    if (hero.fire) drawFire(hx, feetY);
    drawMiner(hx, feetY, pose, { g: [R().lv.helm, R().lv.glove, R().lv.boot], bag: R().bagKg / Math.max(1, bagCap()), squash: anim.squash });
    if (Net.online) drawTag(hx, feetY - 34 * view.u, `${Net.name} · ${S.level}`, '#ffe7a8');

    for (const r of rings) {
      const q = r.life / r.max;
      ctx.strokeStyle = `rgba(255,236,210,${0.6 * (1 - q)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(r.x, sy(r.y), (10 + 34 * q) * view.u * 0.5 * r.s, (3 + 7 * q) * view.u * 0.5 * r.s, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of parts) {
      ctx.globalAlpha = Math.min(1, (p.max - p.life) * (p.coin ? 5 : 4));
      if (p.coin) {
        const px = p.px || p.x, py = p.px ? p.py : sy(p.y);
        ctx.fillStyle = '#b77a09'; ctx.beginPath(); ctx.arc(px, py, p.s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffcc33'; ctx.beginPath(); ctx.arc(px - 0.8, py - 0.8, p.s - 1.2, 0, Math.PI * 2); ctx.fill();
      } else if (p.nug) {
        const py = sy(p.y);
        rect(p.x - p.s / 2 - 1, py - p.s / 2 - 1, p.s + 2, p.s + 2, '#7a5200'); rect(p.x - p.s / 2, py - p.s / 2, p.s, p.s, '#ffcc33');
        rect(p.x - p.s / 2, py - p.s / 2, Math.max(1, p.s / 2), Math.max(1, p.s / 2), '#fff1a8');
      } else { ctx.fillStyle = p.c; ctx.fillRect(p.x - p.s / 2, sy(p.y) - p.s / 2, p.s, p.s); }
    }
    ctx.globalAlpha = 1;

    // Derinleştikçe karanlık, kask lambası etrafı aydınlık
    const dark = clamp((cam.y - 1) * 0.02, 0, 0.62);
    if (dark > 0) {
      const lx = hx, ly = feetY - 16 * view.u;
      const vg = ctx.createRadialGradient(lx, ly, BH * 1.3, lx, ly, Math.hypot(W_, H) * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, `rgba(0,0,0,${dark})`);
      ctx.fillStyle = vg; ctx.fillRect(-12, -12, W_ + 24, H + 24);
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (hero.mode === 'climb') { // bırakırsan: kaç metre, kaç kat hasar, alev var mı
      const h = floorM() - hero.y;
      if (h >= 1) {
        const m = dropMultH(h), onFire = h > fireH();
        const t = `↓ ${Math.floor(h)} m · ×${fmt(m)}${onFire ? ' · ALEV' : ` · alev ${Math.ceil(fireH() - h)} m sonra`}`;
        ctx.font = `700 13px ${FONT_NUM}`; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(20,12,6,.8)';
        const tx = clamp(hx + 90, 100, W_ - 100);
        ctx.strokeText(t, tx, feetY - 16 * view.u); ctx.fillStyle = onFire ? '#ffae3c' : '#9fe8ff'; ctx.fillText(t, tx, feetY - 16 * view.u);
      }
    }
    for (const t of texts) {
      const q = t.life / t.max, sc = q < 0.15 ? 0.7 + 2 * q : 1;
      ctx.globalAlpha = q > 0.6 ? (1 - q) / 0.4 : 1;
      ctx.font = `700 ${Math.round(t.size * sc)}px ${FONT_NUM}`; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(20,12,6,.75)';
      const ty = sy(t.y);
      ctx.strokeText(t.text, t.x, ty); ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, ty);
    }
    ctx.globalAlpha = 1;
    drawRuler(W_, H);
    if (fx.banner) {
      const bt = fx.banner.t, a = bt < 0.2 ? bt / 0.2 : bt > 2.4 ? Math.max(0, (2.9 - bt) / 0.5) : 1;
      const by = Math.min(view.G + BH * 1.2, H - 130) - (1 - Math.min(1, bt / 0.2)) * 10;
      ctx.globalAlpha = a; ctx.font = `20px ${FONT_DISPLAY}`;
      const tw = Math.min(W_ - 24, Math.max(ctx.measureText(fx.banner.title).width, 190) + 36);
      ctx.fillStyle = 'rgba(14,10,8,.82)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(W_ / 2 - tw / 2, by - 26, tw, 52, 10); else ctx.rect(W_ / 2 - tw / 2, by - 26, tw, 52); ctx.fill();
      ctx.fillStyle = '#ffc93c'; ctx.fillText(fx.banner.title, W_ / 2, by - 6, tw - 20);
      ctx.font = `600 12px ${FONT_NUM}`; ctx.fillStyle = '#f6ecdf'; ctx.fillText(fx.banner.sub, W_ / 2, by + 14, tw - 20);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ═════════ Arayüz ═════════ */
  let bumpAt = 0;
  function bumpPurse() {
    const now = performance.now();
    if (now - bumpAt < 150 || reduceMotion) return;
    bumpAt = now; el.purse.classList.remove('bump'); void el.purse.offsetWidth; el.purse.classList.add('bump');
  }
  const namesIn = (i) => [...Net.others.values()].filter((o) => inMineOf(o.pos, i)).map((o) => o.name);
  const insideCount = (i) => namesIn(i).length;
  let lastRatio = -1, lastCore = null, lastBag = -1;
  function refreshHud() {
    const under = underground(), m = S.mine, wm = wmine(), M = MINES[m], r = R();
    const home = scene === 'house';
    el.purse.classList.toggle('lvl', home);
    stage.classList.toggle('home', home);
    setText(el.coins, home ? `Usta ${S.level}` : fmt(Math.floor(r.coins)));
    setText(el.subV, home ? `${fmt(Math.floor(S.xp))}/${fmt(xpNeed(S.level))} tecrübe${freePoints() > 0 ? ` · ${freePoints()} yetenek puanı` : ''}`
      : `Usta ${S.level}${r.gems >= 1 ? ` · ${fmt(Math.floor(r.gems))} elmas` : ''}`);
    setText(el.depth, home ? 'Ev' : under ? `${Math.floor(hero.mode === 'bottom' ? floorM() : hero.y)} m` : 'Maden ağzı');
    setText(el.biome, home ? (Net.online ? `${Net.name} · madenci evi` : 'Madenci evi') : under ? `${M.name} · katman ${wm.layer + 1}/${M.layers}` : `${M.name} seferi`);
    setHidden(el.stageTop, !under);
    if (under) {
      const k = wm.layer, core = isCore(m, k), max = layerHp(m, k);
      if (core !== lastCore) { lastCore = core; el.layer.classList.toggle('hard', core); el.hpFill.classList.toggle('hard', core); }
      setText(el.layer, core ? 'Ana damar · son katman' : `${biomeOf(m, k).name} · katman ${k + 1}/${M.layers}`);
      setText(el.reward, wm.n > 1 ? `Payın %${Math.round(wm.my * 100)} · ${wm.n} kişi` : `Vuruş başı ~${fmt(avgHit() * goldPerDmg(m))} altın`);
      setText(el.hpNum, `${fmt(Math.ceil(wm.hp))} / ${fmt(max)}`);
      const ratio = Math.round(clamp(wm.hp / max, 0, 1) * 1000) / 1000;
      if (ratio !== lastRatio) { lastRatio = ratio; el.hpFill.style.transform = `scaleX(${ratio})`; }
    }
    const cap = bagCap(), bf = Math.round(clamp(r.bagKg / cap, 0, 1) * 100) / 100;
    setText(el.bagText, `Çanta ${kg(r.bagKg)} / ${kg(cap)}`);
    if (bf !== lastBag) { lastBag = bf; el.bagFill.style.transform = `scaleX(${bf})`; el.bagChip.classList.toggle('full', bf >= 1); }
    setHidden(el.bagChip, home || (!under && r.bagKg <= 0));
    setHidden(el.pileChip, !under || r.pile.kg < 0.5);
    if (r.pile.kg >= 0.5) setText(el.pileChip, `Zeminde ${kg(r.pile.kg)} · ${fmt(Math.floor(r.pile.val))} altın`);
    setHidden(el.elevChip, r.lv.elev < 1 || !under);
    if (r.lv.elev > 0 && under) setText(el.elevChip, elev.phase === 'load' ? `Asansör dipte ${kg(elev.kg)} / ${kg(elevCap())}` : elev.phase === 'up' ? `Asansör ↑ ${Math.floor(elev.y)} m` : `Asansör ↓ ${Math.floor(elev.y)} m`);
    setHidden(el.climb, !(hero.mode === 'bottom' || hero.mode === 'climb'));
    el.climb.classList.toggle('on', input.climb && hero.mode === 'climb');
    el.climb.classList.toggle('pulse', hero.mode === 'bottom' && bagFull() && r.pile.kg > 0 && r.lv.elev < 1);
    setHidden(el.walkL, !home); setHidden(el.walkR, !home);
    setHidden(el.houseUi, !home || !el.mineSel.hidden);
    setHidden(el.homeBtn, !(scene === 'mine' && hero.mode === 'surface'));
    setHidden(el.auto, !under || r.lv.auto < 1);
    el.auto.setAttribute('aria-pressed', String(r.auto));
    setText(el.auto, r.auto ? 'Oto: Açık' : 'Oto: Kapalı');
    refreshGate();
  }
  function refreshGate() { // maden ağzındayken üstte maden kartı
    const show = scene === 'mine' && hero.mode === 'surface';
    setHidden(el.gate, !show);
    if (!show) return;
    const i = S.mine, wm = W.mines[i], M = MINES[i], names = namesIn(i);
    setText(el.gateTitle, M.name);
    setText(el.gateSub, `Katman ${wm.layer + 1}/${M.layers}${names.length ? ` · içeride: ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}` : ''}${wm.myTotal > 0 && Net.online ? ` · payın %${Math.round(wm.myTotal * 100)}` : ''}`);
    setText(el.gateBtn, 'Aşağı atla ↓');
  }

  /* ─── Maden seçimi: evden menüyle ─── */
  const mineCards = [];
  function buildMineSelect() {
    el.mineCards.textContent = '';
    MINES.forEach((M, i) => {
      const card = document.createElement('article');
      card.className = 'mcard';
      card.innerHTML = `<div class="mc-top"><b>${M.name}</b><span class="mc-stars" aria-label="Zorluk ${i + 1}/6">${'★'.repeat(i + 1)}${'☆'.repeat(MINES.length - i - 1)}</span></div>
        <div class="mc-bar"><div class="mc-fill"></div></div>
        <div class="mc-info"></div><div class="mc-who"></div>
        <div class="mc-foot"><span class="mc-run"></span><button type="button" class="mc-go">Gir ▸</button></div>`;
      const go = card.querySelector('.mc-go');
      go.addEventListener('click', (e) => { e.currentTarget.blur(); if (unlocked(i)) enterMine(i); });
      mineCards.push({ card, go, fill: card.querySelector('.mc-fill'), info: card.querySelector('.mc-info'), who: card.querySelector('.mc-who'), run: card.querySelector('.mc-run') });
      el.mineCards.appendChild(card);
    });
  }
  function refreshMineSelect() {
    if (el.mineSel.hidden) return;
    MINES.forEach((M, i) => {
      const c = mineCards[i], wm = W.mines[i], open = unlocked(i), names = namesIn(i), r = S.runs[i];
      c.card.classList.toggle('locked', !open);
      c.fill.style.transform = `scaleX(${clamp(wm.layer / M.layers, 0, 1)})`;
      setText(c.info, open ? `Katman ${wm.layer + 1}/${M.layers} · ${M.layers * LM} m · cevher ×${dec(M.gpd / MINES[0].gpd)} · tecrübe ×${dec(M.xp / MINES[0].xp)}`
        : `Kilitli: önce ${MINES[i - 1].name} madenini bir kez tamamla`);
      setText(c.who, names.length ? `İçeride: ${names.join(', ')}` : open ? 'İçeride kimse yok' : '');
      setText(c.run, open ? `Tamamladın: ${S.clears[i]}${r && r.inst === wm.inst && r.coins >= 1 ? ` · seferin: ${fmt(Math.floor(r.coins))} altın` : ''}` : '');
      setText(c.go, open ? 'Gir ▸' : 'Kilitli');
      const d = String(!open);
      if (c.go.getAttribute('aria-disabled') !== d) c.go.setAttribute('aria-disabled', d);
    });
  }
  function openMineSelect() { el.mineSel.hidden = false; resetInput(); refreshMineSelect(); tip('select', 'Bir maden seç: içeride kim varsa onlarla aynı katmanlara vurursun', 4); }
  function closeMineSelect() { el.mineSel.hidden = true; }

  /* ─── Sefer yükseltmeleri ─── */
  const rows = {};
  const wallet = (it) => (it.cur === 'gem' ? R().gems : R().coins);
  const spend = (it, c) => { if (it.cur === 'gem') R().gems -= c; else R().coins -= c; };
  const locked = (it) => it.req && R().lv[it.req] < 1;
  const itemCost = (it, l) => Math.ceil(it.cost(l) * (it.cur === 'gold' ? costX() : 1));
  const DOT = { gold: '<span class="coin-dot sm" aria-hidden="true"></span>', gem: '<span class="gem-dot" aria-hidden="true"></span>' };
  function buildPanel() {
    const target = { char: $('charList'), gear: $('pane-gear'), haul: $('pane-haul'), gem: $('gemList') };
    for (const t of Object.values(target)) t.textContent = '';
    for (const it of ITEMS) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'up' + (it.cur === 'gem' ? ' gemcost' : ''); btn.id = 'up-' + it.id;
      btn.innerHTML = `<span class="up-ico" aria-hidden="true">${it.icon}</span>` +
        `<span class="up-main"><span class="up-name">${it.name}<span class="up-lv"></span></span><span class="up-desc"></span></span>` +
        `<span class="up-cost">${DOT[it.cur]}<span class="num up-cost-v"></span></span>`;
      target[it.pane].appendChild(btn);
      rows[it.id] = { btn, lv: btn.querySelector('.up-lv'), desc: btn.querySelector('.up-desc'), cost: btn.querySelector('.up-cost-v') };
      bindHold(btn, () => buy(it), (q) => buy(it, q));
    }
    buildSkills(); buildAchs(); buildMineSelect();
  }
  function refreshPanel() {
    const ready = { char: false, gear: false, haul: false, gem: false, skill: freePoints() > 0 && scene === 'house' };
    for (const it of ITEMS) {
      const r = rows[it.id], l = lvOf(it), lock = locked(it);
      const maxed = it.max != null && l >= it.max, c = maxed ? 0 : itemCost(it, l), can = !maxed && !lock && wallet(it) >= c;
      if (can) ready[it.pane] = true;
      const lvText = maxed ? 'MAKS' : it.max != null ? `Sv ${l}/${it.max}` : `Sv ${l}`;
      const descText = lock ? 'Önce Yük Asansörü al' : maxed ? it.now(l) : it.next(l);
      setText(r.lv, lvText); setText(r.desc, descText); setText(r.cost, maxed ? (it.max === 1 ? 'Alındı' : 'Tamam') : fmt(c));
      r.btn.classList.toggle('maxed', maxed);
      const dis = String(!can);
      if (r.btn.getAttribute('aria-disabled') !== dis) r.btn.setAttribute('aria-disabled', dis);
    }
    setText(el.gemCount, fmt(Math.floor(R().gems)));
    setText(el.runNote, `${MINES[S.mine].name} seferi · maden bitince altın, yükseltmeler ve elmas sıfırlanır`);
    // Kahraman
    setText(el.lvlNum, String(S.level));
    setText(el.lvlXp, `${fmt(Math.floor(S.xp))} / ${fmt(xpNeed(S.level))} tecrübe`);
    el.lvlFill.style.transform = `scaleX(${clamp(S.xp / xpNeed(S.level), 0, 1)})`;
    refreshHero(); refreshSkills(); refreshAchs();
    for (const t of ALL_TABS) {
      const dot = $('tab-' + t).querySelector('.tab-dot'), show = !!ready[t] && t !== curTab;
      if (dot.hidden === show) dot.hidden = !show;
    }
    const others = Net.others.size;
    setText(el.who, Net.online ? `${Net.name} · usta ${S.level}${others ? ` · ${others + 1} çevrimiçi` : ''}` : `Çevrimdışı · usta ${S.level}`);
  }
  function refreshHero() {
    const lines = [
      ['Hasar', `×${dec(Math.pow(1.1, sk('a1')) * (sk('a5') ? 1.5 : 1) * achX('dmg'))}`],
      ['Vuruş hızı', `×${dec(Math.pow(1.05, sk('e1')) * (sk('e5') ? 1.25 : 1) * achX('hits'))}`],
      ['Şans', `%${2 * sk('f1')} altın yağmuru · %${3 * sk('f2')} çifte darbe`],
      ['Kritik', `+%${2 * sk('e2')} şans · +${dec(0.4 * sk('a2'))} hasar · ×${dec(achX('crit'))}`],
      ['Düşüş', `metre başı ×${dec3(dropBase())} · ×${dec((sk('b5') ? 1.5 : 1) * achX('fall'))}`],
      ['Alev', `${fireH()} m'de başlar · ×${dec(fireMult())}`],
      ['Altın', `×${dec(Math.pow(1.1, sk('c1')) * achX('layers') * achX('team'))}`],
      ['Tırmanma', `×${dec(Math.pow(1.15, sk('b2')) * achX('climb'))}`],
      ['Tecrübe', `×${dec(achX('clears'))}`],
    ];
    const html = lines.map(([a, b]) => `<div><dt>${a}</dt><dd>${b}</dd></div>`).join('');
    if (el.heroStats._v !== html) { el.heroStats._v = html; el.heroStats.innerHTML = html; }
    const mines = MINES.map((M, i) => {
      const wm = W.mines[i], n = insideCount(i);
      const st = unlocked(i) ? `katman ${wm.layer + 1}/${M.layers}${n ? ` · içeride ${n}` : ''} · ${S.clears[i]} kez` : 'kilitli';
      return `<li class="${unlocked(i) ? '' : 'off'}"><b>${M.name}</b><span>${st}</span></li>`;
    }).join('');
    if (el.mineList._v !== mines) { el.mineList._v = mines; el.mineList.innerHTML = mines; }
  }

  /* ─── Yetenek ağacı ─── */
  const skillBtns = {};
  function buildSkills() {
    el.skillTree.textContent = '';
    for (const br of BRANCHES) {
      const box = document.createElement('section');
      box.className = 'branch';
      box.innerHTML = `<header><b>${br.name}</b><span class="br-desc">${br.desc}</span><span class="br-spent num" id="brs-${br.id}"></span></header>`;
      for (let row = 0; row < ROW_NEED.length; row++) {
        const line = document.createElement('div');
        line.className = 'sk-row';
        for (const s of SKILLS.filter((x) => x.br === br.id && x.row === row)) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'skill' + (s.team ? ' team' : '');
          b.innerHTML = `<span class="sk-name">${s.name}${s.team ? '<em>TAKIM</em>' : ''}</span><span class="sk-rank num"></span><span class="sk-desc"></span>`;
          b.addEventListener('click', (e) => { learn(s); e.currentTarget.blur(); });
          skillBtns[s.id] = { b, rank: b.querySelector('.sk-rank'), desc: b.querySelector('.sk-desc') };
          line.appendChild(b);
        }
        box.appendChild(line);
      }
      el.skillTree.appendChild(box);
    }
  }
  const rowOpen = (s) => spentIn(s.br) >= ROW_NEED[s.row];
  function learn(s) {
    if (scene !== 'house') { showTip('Yetenekler evde dağıtılır', 2.5); return; }
    if (freePoints() <= 0 || sk(s.id) >= s.max || !rowOpen(s)) return;
    S.skills[s.id] = sk(s.id) + 1; dirty = true; sfxBuy(); refreshPanel();
  }
  function refreshSkills() {
    setText(el.spFree, `${freePoints()} puan`);
    setText(el.skillNote, scene !== 'house' ? 'Madendesin: yetenekleri görmek serbest, dağıtmak evde' : 'Her seviyede 1 puan. Alt satırlar o dala 5 ve 10 puan verince açılır.');
    for (const br of BRANCHES) setText($('brs-' + br.id), `${spentIn(br.id)} puan`);
    for (const s of SKILLS) {
      const x = skillBtns[s.id], r = sk(s.id), open = rowOpen(s);
      setText(x.rank, `${r}/${s.max}`);
      setText(x.desc, !open ? `${ROW_NEED[s.row]} puanla açılır` : r >= s.max ? s.d(r) : r ? `${s.d(r)} → ${s.d(r + 1)}` : s.d(1));
      x.b.classList.toggle('have', r > 0);
      x.b.classList.toggle('full', r >= s.max);
      const dis = String(!open || r >= s.max || freePoints() <= 0 || scene !== 'house');
      if (x.b.getAttribute('aria-disabled') !== dis) x.b.setAttribute('aria-disabled', dis);
    }
  }
  el.respec.addEventListener('click', (e) => {
    e.currentTarget.blur();
    if (scene !== 'house') { showTip('Yetenekler evde sıfırlanır', 2.5); return; }
    if (!spentAll()) return;
    openModal({ title: 'Yetenekler sıfırlansın mı?', html: '<p class="sheet-note">Bütün puanlar geri gelir, yeniden dağıtabilirsin. Ücretsiz.</p>',
      ok: 'Sıfırla', cancel: 'Vazgeç', onOk: () => { S.skills = {}; dirty = true; refreshPanel(); } });
  });

  /* ─── Başarılar ─── */
  const achRows = {};
  function buildAchs() {
    el.achList.textContent = '';
    for (const a of ACHS) {
      const li = document.createElement('li');
      li.className = 'ach';
      li.innerHTML = `<div class="ach-head"><b>${a.name}</b><span class="ach-tier num"></span><span class="ach-bonus"></span></div>
        <div class="ach-track"><div class="ach-fill"></div></div><div class="ach-text num"></div>`;
      achRows[a.id] = { li, tier: li.querySelector('.ach-tier'), bonus: li.querySelector('.ach-bonus'), fill: li.querySelector('.ach-fill'), text: li.querySelector('.ach-text') };
      el.achList.appendChild(li);
    }
  }
  function refreshAchs() {
    for (const a of ACHS) {
      const x = achRows[a.id], t = achTier(a), v = S.stats[a.stat] || 0, maxed = t >= a.tiers.length;
      const prev = t ? a.tiers[t - 1] : 0, next = maxed ? a.tiers[a.tiers.length - 1] : a.tiers[t];
      setText(x.tier, t ? roman(t) : '—');
      setText(x.bonus, `${a.eff} +%${achPct(a.id)}`);
      x.fill.style.transform = `scaleX(${maxed ? 1 : clamp((v - prev) / (next - prev), 0, 1)})`;
      setText(x.text, maxed ? `${a.what}: ${fmt(v)} · tamamlandı` : `${a.what}: ${fmt(v)} / ${fmt(next)} → ${a.eff} +%${ACH_BONUS[t]}`);
      x.li.classList.toggle('got', t > 0);
    }
  }

  function flash(btn, cls, ms) {
    btn.classList.remove(cls); void btn.offsetWidth; btn.classList.add(cls);
    clearTimeout(btn['_t' + cls]); btn['_t' + cls] = setTimeout(() => btn.classList.remove(cls), ms);
  }
  function buy(it, quiet) {
    const r = R(), l = lvOf(it);
    if (it.max != null && l >= it.max) return false;
    const c = itemCost(it, l);
    if (locked(it) || wallet(it) < c) { if (!quiet) flash(rows[it.id].btn, 'nope', 300); return false; }
    spend(it, c);
    r[it.store][it.key] = l + 1;
    if (it.id === 'auto') r.auto = true;
    if (it.id === 'elev') { resetElevator(); tip('elev', 'Asansör dipte çantanı ve zemindeki cevheri alır, yukarıda satar', 4.5); }
    dirty = true; flash(rows[it.id].btn, 'bought', 220); sfxBuy(); refreshPanel();
    return true;
  }
  // Dokun: 1 kez al · Basılı tut: art arda al · Kaydırınca: hiçbir şey alma
  function bindHold(btn, once, repeat) {
    let timer = 0, rep = 0, held = false, active = false;
    const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = 0; active = false; };
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      unlockAudio(); active = true; held = false;
      timer = setTimeout(() => { held = true; if (!once()) { stop(); return; } rep = setInterval(() => { if (!repeat(true)) stop(); }, 85); }, 340);
    });
    btn.addEventListener('pointerup', () => { if (active && !held && once()) tip('hold', 'İpucu: butona basılı tutarsan art arda alır', 3.5); stop(); btn.blur(); });
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('click', (e) => { if (e.detail === 0) once(); });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /* ═════════ Sekmeler: Sefer (maden) ve Kamp (kalıcı) grupları ═════════ */
  const GROUPS = { run: ['char', 'gear', 'haul', 'gem'], camp: ['hero', 'skill', 'ach'] };
  const ALL_TABS = [...GROUPS.run, ...GROUPS.camp];
  let group = 'camp', curTab = 'hero';
  const lastTab = { run: 'char', camp: 'hero' };
  function setGroup(g) {
    group = g;
    for (const t of ALL_TABS) setHidden($('tab-' + t), !GROUPS[g].includes(t));
    selectTab(lastTab[g]);
  }
  let lastCtx = '';
  function autoGroup() { // evde kalıcı gelişim sekmeleri, madende sefer sekmeleri
    const ctxNow = scene === 'house' ? 'camp' : 'mine';
    if (ctxNow === lastCtx) return;
    lastCtx = ctxNow;
    setGroup(ctxNow === 'camp' ? 'camp' : 'run');
  }
  function selectTab(name) {
    curTab = name; lastTab[GROUPS.run.includes(name) ? 'run' : 'camp'] = name;
    for (const t of ALL_TABS) {
      const on = t === name;
      $('tab-' + t).setAttribute('aria-selected', String(on));
      $('pane-' + t).hidden = !on;
    }
    if (rows.power) refreshPanel();
  }
  for (const t of ALL_TABS) $('tab-' + t).addEventListener('click', (e) => { selectTab(t); e.currentTarget.blur(); });
  el.goMines.addEventListener('click', (e) => { e.currentTarget.blur(); openMineSelect(); });
  el.mineSelBack.addEventListener('click', (e) => { e.currentTarget.blur(); closeMineSelect(); });
  el.homeBtn.addEventListener('click', (e) => { e.currentTarget.blur(); goHome(); });

  /* ═════════ Pencere ═════════ */
  let modalOnOk = null;
  function openModal({ title, html, ok = 'Tamam', okClass = '', cancel = null, onOk = null }) {
    el.mTitle.textContent = title; el.mBody.innerHTML = html;
    el.mOk.textContent = ok; el.mOk.className = 'btn-main' + (okClass ? ' ' + okClass : '');
    el.mCancel.hidden = !cancel; if (cancel) el.mCancel.textContent = cancel;
    modalOnOk = onOk; el.modal.hidden = false; resetInput(); el.mOk.focus();
  }
  function closeModal(confirmed) {
    if (el.modal.hidden) return;
    el.modal.hidden = true;
    const fn = modalOnOk; modalOnOk = null;
    if (confirmed && fn) fn();
    stage.focus({ preventScroll: true });
  }
  el.mOk.addEventListener('click', () => closeModal(true));
  el.mCancel.addEventListener('click', () => closeModal(false));
  el.modal.addEventListener('pointerdown', (e) => { if (e.target === el.modal) closeModal(false); });

  /* ═════════ Giriş (kullanıcı adı) ═════════ */
  const NAME_RE = /^[a-zçğıöşü0-9_-]{2,16}$/;
  function showLogin(msg) {
    el.login.hidden = false; resetInput();
    setHidden(el.loginErr, !msg); if (msg) el.loginErr.textContent = msg;
    setTimeout(() => el.loginName.focus(), 50);
  }
  el.loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = el.loginName.value.trim();
    if (!NAME_RE.test(lowerTR(name))) { showLogin('Ad 2-16 karakter olmalı: harf, rakam, _ ya da -'); return; }
    try { await doLogin(name); } catch (err) { showLogin(err.code === 'ad' ? 'Bu ad kullanılamaz' : 'Sunucuya ulaşılamadı: Mac\'te server.py açık mı?'); }
  });
  async function doLogin(name) {
    const j = await Net.login(name);
    let save = j.save;
    if (!save || save.v !== 6) save = readLocal(onlineKey(j.key));
    applySave(save);
    W = mergeView(j.world);
    handleServer(j);
    placeHero();
    el.login.hidden = true;
    el.hint.hidden = S.stats.hits > 0;
    saveLocal(); refreshPanel(); refreshHud(); autoGroup();
    if (save && save.lastSeen) handleAway(Date.now() - save.lastSeen, !!save.under);
  }
  function sessionTaken() {
    openModal({ title: 'Başka cihazda açıldı', html: `<p class="sheet-note">${Net.name} karakteri başka bir cihazdan açıldı. Burada devam edersen diğer cihaz kapanır.</p>`,
      ok: 'Burada devam et', onOk: () => doLogin(Net.name).catch(() => showLogin('Sunucuya ulaşılamadı')) });
  }
  function placeHero() { // her girişte ve maden bitince: evin içinde
    scene = 'house'; S.under = false;
    Object.assign(hero, { mode: 'house', y: 0, lx: 1, hx: 0.5 });
    hero.inst = wmine().inst; hero.vy = 0; hero.carry = 0; hero.fire = false;
    cam.y = 0; cam.x = mineX(S.mine);
    closeMineSelect(); lastCtx = ''; autoGroup();
    parts.length = texts.length = rings.length = flames.length = 0;
    Object.assign(anim, { phase: 'idle', t: 0, dive: false, queued: false, squash: 0 });
    fx.crater = 0;
  }

  /* ═════════ Sen yokken: otomatik vuruşlar ortak madene toplu hasar olarak işlenir ═════════ */
  function durText(secs) { const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60); return h ? `${h} sa ${m} dk` : `${Math.max(1, m)} dk`; }
  function handleAway(ms, wasBottom) {
    const secs = ms / 1000, m = S.mine, r = R();
    if (!(secs >= 60) || r.lv.auto < 1 || !r.auto || !wasBottom) return;
    const capS = offCapH() * 3600, used = Math.min(secs, capS), eff = offEff();
    const dmg = avgHit() * hitsPerSec() * used * eff;
    const wm = wmine(), from = wm.layer, inst = wm.inst;
    const val = dmg * goldPerDmg(m), kgAmt = dmg * layerKg(m, from) / layerHp(m, from);
    stat('dmg', dmg);
    predictOn(W, m, inst, dmg, true); Net.hit(m, inst, from, dmg, true);
    let sold = 0;
    if (r.lv.elev > 0) { const trip = 2 * floorM() / elevSpd() + 4; const soldKg = Math.min(kgAmt, used * elevCap() / trip); sold = kgAmt > 0 ? val * soldKg / kgAmt : 0; r.coins += sold; stat('gold', sold); }
    const left = val - sold;
    if (left > 0) { r.pile.kg += kgAmt * (left / val); r.pile.val += left; }
    if (underground() && W.mines[m].inst === inst) { hero.y = floorM(); cam.y = hero.y; }
    saveLocal(); refreshPanel(); refreshHud();
    openModal({
      title: 'Sen yokken kazdı',
      html: `<dl class="sum"><div><dt>Süre</dt><dd>${durText(used)}</dd></div>
        <div><dt>Verdiğin hasar</dt><dd>${fmt(dmg)} <span class="muted">(katman ${from + 1} → ${W.mines[m].layer + 1})</span></dd></div>
        ${r.lv.elev > 0 ? `<div><dt>Asansörle satılan</dt><dd class="gold">+${fmt(Math.floor(sold))} altın</dd></div>` : ''}
        ${left > 1 ? `<div><dt>Zeminde biriken</dt><dd>${fmt(Math.floor(left))} altınlık cevher</dd></div>` : ''}</dl>
        <p class="sheet-note">Kırılan katmanların payı ve tecrübesi ayrıca geliyor. Verim %${Math.round(eff * 100)}, en fazla ${offCapH()} saat${secs > capS ? ' (fazlası sayılmadı)' : ''}.</p>`,
      ok: 'Topla',
    });
  }

  /* ═════════ Girdi ═════════ */
  function resetInput() { input.climb = false; input.left = false; input.right = false; }
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    const r = stage.getBoundingClientRect();
    tapAction(false, e.clientX - r.left);
  });
  stage.addEventListener('contextmenu', (e) => e.preventDefault());
  function holdButton(btn, key) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault(); unlockAudio(); input[key] = true;
      if (fx.tipT <= 0) el.hint.hidden = true;
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* yok say */ }
    });
    const off = () => { input[key] = false; };
    btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off); btn.addEventListener('lostpointercapture', off);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  holdButton(el.climb, 'climb'); holdButton(el.walkL, 'left'); holdButton(el.walkR, 'right');
  el.gateBtn.addEventListener('click', (e) => { e.currentTarget.blur(); if (scene === 'mine' && hero.mode === 'surface') jumpIn(); });
  // Klavye her zaman oyuna gider (yazı kutusu hariç): oklar ve boşluk başka düğmeleri tetiklemez
  const typing = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
  window.addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    if (!el.modal.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeModal(false); } return; }
    if (!el.mineSel.hidden) { if (e.key === 'Escape') { e.preventDefault(); closeMineSelect(); } return; }
    if (!el.login.hidden) return;
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === ' ' || e.code === 'Space') {
      e.preventDefault(); e.stopPropagation();
      if (document.activeElement && document.activeElement !== document.body && document.activeElement !== stage) document.activeElement.blur();
      unlockAudio();
      if (k === 'ArrowLeft') input.left = true;
      else if (k === 'ArrowRight') input.right = true;
      else if (k === 'ArrowUp') input.climb = true;
      else if (!e.repeat) tapAction(true);
    } else if (k === 'Enter' && e.target === stage) { e.preventDefault(); tapAction(true); }
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') input.left = false;
    else if (e.key === 'ArrowRight') input.right = false;
    else if (e.key === 'ArrowUp') input.climb = false;
  }, true);
  window.addEventListener('blur', resetInput);

  function applyToggles() { el.sound.setAttribute('aria-pressed', String(S.sound)); setText(el.sound, S.sound ? 'Ses: Açık' : 'Ses: Kapalı'); }
  el.auto.addEventListener('click', (e) => { const r = R(); r.auto = !r.auto; dirty = true; e.currentTarget.blur(); });
  el.sound.addEventListener('click', (e) => { S.sound = !S.sound; dirty = true; applyToggles(); if (S.sound) unlockAudio(); e.currentTarget.blur(); });
  el.who.addEventListener('click', () => {
    if (!Net.online) return;
    openModal({ title: 'Başka adla gir', html: `<p class="sheet-note">${Net.name} olarak oynuyorsun. Başka bir adla girersen bu karakter sunucuda kayıtlı kalır, aynı adla tekrar girince açılır.</p>`,
      ok: 'Adı değiştir', cancel: 'Vazgeç', onOk: () => { saveLocal(); Net.beacon(); try { localStorage.removeItem(NAME_KEY); } catch (e) { /* yok say */ } location.reload(); } });
  });
  el.reset.addEventListener('click', () => {
    openModal({
      title: 'Karakter silinsin mi?',
      html: '<p class="sheet-note">Bu karakterin seviyesi, yetenekleri, başarıları ve bütün seferleri silinir. Madenler herkes için olduğu gibi kalır. Geri alınamaz.</p>',
      ok: 'Sil ve baştan başla', okClass: 'danger', cancel: 'Vazgeç',
      onOk: () => {
        const sound = S.sound;
        S = freshState(); S.sound = sound;
        Object.assign(elev, { y: 0, phase: 'down', kg: 0, val: 0, wait: 0 });
        placeHero(); fx.tipT = 0; lastCtx = ''; autoGroup();
        el.hint.textContent = '◀ ▶ ile yürü, maden girişinde dokunup aşağı atla'; el.hint.hidden = false;
        Net.lastSave = 0; saveLocal(); applyToggles(); refreshPanel(); refreshHud();
      },
    });
  });
  let hiddenAt = 0, hiddenBottom = false;
  document.addEventListener('visibilitychange', () => {
    if (!S || !W) return;
    if (document.hidden) { hiddenAt = Date.now(); hiddenBottom = hero.mode === 'bottom'; resetInput(); saveLocal(); Net.beacon(); }
    else if (hiddenAt) { const away = Date.now() - hiddenAt; hiddenAt = 0; handleAway(away, hiddenBottom); }
  });
  window.addEventListener('pagehide', () => { if (S && W) { saveLocal(); Net.beacon(); } });

  /* ═════════ Döngü ═════════ */
  let lastSaveT = 0;
  function update(dt, now) {
    S.under = underground();
    computeTeam();
    updateHero(dt); updateAnim(dt); updatePile(dt); updateElev(dt); updateCam(dt); updateOthers(dt);
    const wm = wmine();
    const f = underground() ? 1 - wm.hp / layerHp(S.mine, wm.layer) : 0;
    fx.crater += (f - fx.crater) * Math.min(1, dt * 16);
    fx.flash = Math.max(0, fx.flash - dt * 7);
    fx.shake = fx.shake > 0.2 ? fx.shake * Math.pow(0.0008, dt) : 0;
    updateFx(dt);
    if (fx.tipT > 0) { fx.tipT -= dt; if (fx.tipT <= 0) el.hint.hidden = true; }
    if (fx.banner) { fx.banner.t += dt; if (fx.banner.t > 2.9) fx.banner = null; }
    Net.tick(now);
    autoGroup(); showClears();
    if (now - lastSaveT > 3000) { lastSaveT = now; saveLocal(); }
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (S && W && ready) { update(dt, now); draw(now / 1000); refreshHud(); }
    requestAnimationFrame(frame);
  }
  let ready = false;
  async function boot() {
    try {
      const r = await fetch('config.json', { cache: 'no-cache' });
      if (r.ok) { const c = await r.json(); if (c && c.version === 2 && Array.isArray(c.mines) && c.mines.length) CFG = c; }
    } catch (e) { /* dosya yoksa gömülü ayar kullanılır */ }
    MINES = CFG.mines; LM = CFG.layerM || 4;
    S = freshState(); W = freshWorld();
    buildPanel(); setGroup('camp');
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
    setInterval(() => { if (S && W && ready) { refreshPanel(); refreshMineSelect(); } }, 250);
    requestAnimationFrame((t) => { last = t; frame(t); });
    applyToggles();
    if (await Net.hello()) {
      ready = true;
      let stored = '';
      try { stored = localStorage.getItem(NAME_KEY) || ''; } catch (e) { /* yok say */ }
      el.loginNote.hidden = false;
      if (stored) { try { await doLogin(stored); return; } catch (e) { /* formu göster */ } }
      el.loginName.value = stored;
      showLogin();
      return;
    }
    // Sunucu yok: tek başına, yerel dünyada oyna
    const d = readLocal(LOCAL_KEY);
    applySave(d);
    Local.load();
    W = Local.view();
    placeHero(); ready = true;
    applyToggles(); refreshPanel(); refreshHud(); autoGroup();
    el.hint.hidden = S.stats.hits > 0;
    if (d && d.v === 6 && d.lastSeen) handleAway(Date.now() - d.lastSeen, !!d.under);
  }

  // Telefona uygulama olarak eklenince: çevrimdışı çalışsın, kayıt kalıcı depoda dursun
  const topLevel = (() => { try { return window.top === window.self; } catch (e) { return false; } })();
  if (topLevel && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { /* önbelleksiz de çalışır */ });
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* yok say */ }
  }
  boot();
})();
