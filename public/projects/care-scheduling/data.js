/* ==========================================================================
   data.js —— Demo 雛型的模擬資料
   資料結構依照「基本設計.md → 資料庫設計」
   時間一律為「距零時的分鐘數」；地點為抽象平面座標（公尺）
   ========================================================================== */
(function (global) {
  'use strict';

  const PARAMS = {
    H_max: 480,          // 當日工時上限（分鐘）
    T_c: 240,            // 連續工時上限（分鐘）
    restThreshold: 30,   // 空班達此長度視為休息，中斷連續工時累計
    speed: 300,          // 平均車速（公尺／分鐘）
    travelCostPerMeter: 0.005,   // 交通成本（元／公尺）
    workDaysPerMonth: 22,        // 月薪換算日成本用

    omega: { 2: 1.0, 3: 1.2, 4: 1.3, 5: 1.5, 6: 1.6, 7: 1.8, 8: 2.0 },
    omegaMax: 2.0,
    // 計時服務收費：依長照等級的時薪換算
    hourlyRate: { 2: 240, 3: 280, 4: 310, 5: 350, 6: 380, 7: 410, 8: 450 },
    revenue: {
      short: { 2: 120, 3: 140, 4: 155, 5: 175, 6: 190, 7: 205, 8: 225 },   // 30 分
      mid:   { 2: 180, 3: 210, 4: 233, 5: 263, 6: 285, 7: 308, 8: 338 },  // 45 分
      long:  { 2: 240, 3: 280, 4: 310, 5: 350, 6: 380, 7: 410, 8: 450 },   // 60 分
    },

    alpha: [0.3, 0.5, 0.2],    // 壓力指數三項：U_w, L_w, C_w
    lambda: [0.4, 0.4, 0.2],   // 罰分三項：P_fair, P_pref, P_idle
    theta: 0.3,                // 營運 ↔ 員工 取捨（0 = 純毛利，1 = 純公平）
    rho: 0.5,                  // 未排入案件的懲罰係數

    prefPenalty: { designatedMissed: 1.0, continuityBroken: 0.4 },
  };

  const SKILL_LABEL = {
    body: '身體照顧',
    house: '家務服務',
    tube: '管路照護',
    rehab: '復能訓練',
  };

  const DATE = '2026-08-24';

  const caregivers = [
    {
      id: 'W001', name: '王淑芬', title: '資深居服員', gender: 'F',
      personality: ['溫和', '細心'], skills: ['body', 'house'],
      payType: 'monthly', payRate: 36000, splitRatio: null,
      restDays: [0], available: { start: 420, end: 1020 },
      home: { x: 1500, y: 2400 }, onDuty: true,
    },
    {
      id: 'W002', name: '林美玲', title: '居服員', gender: 'F',
      personality: ['健談', '積極'], skills: ['body', 'tube'],
      payType: 'hourly', payRate: 220, splitRatio: null,
      restDays: [0, 6], available: { start: 480, end: 960 },
      home: { x: 3200, y: 1500 }, onDuty: true,
    },
    {
      id: 'W003', name: '陳建志', title: '居服員', gender: 'M',
      personality: ['沉穩', '有耐心'], skills: ['body', 'rehab'],
      payType: 'split', payRate: 0, splitRatio: 0.6,
      restDays: [6], available: { start: 420, end: 1020 },
      home: { x: 3900, y: 3300 }, onDuty: true,
    },
    {
      id: 'W004', name: '張雅婷', title: '資深居服員', gender: 'F',
      personality: ['溫和', '謹慎'], skills: ['body', 'house', 'tube'],
      payType: 'monthly', payRate: 34000, splitRatio: null,
      restDays: [0], available: { start: 420, end: 960 },
      home: { x: 900, y: 1800 }, onDuty: true,
    },
    {
      id: 'W005', name: '黃志明', title: '居服員', gender: 'M',
      personality: ['開朗', '外向'], skills: ['body', 'rehab'],
      payType: 'hourly', payRate: 210, splitRatio: null,
      restDays: [0, 6], available: { start: 540, end: 1080 },
      home: { x: 4300, y: 1200 }, onDuty: true,
    },
    {
      id: 'W006', name: '吳佩珊', title: '居服員', gender: 'F',
      personality: ['活潑', '健談'], skills: ['body', 'house'],
      payType: 'split', payRate: 0, splitRatio: 0.55,
      restDays: [0], available: { start: 420, end: 900 },
      home: { x: 1200, y: 3600 }, onDuty: true,
    },
  ];

  const clients = [
    {
      id: 'C001', name: '呂文雄', address: '北區進化路 35 號',
      pos: { x: 4016, y: 4391 }, phone: '04-2373-7345',
      family: { name: '邱先生', phone: '0962-672-291' },
      careLevel: 6, requiredSkills: ['rehab'], requiredGender: null,
      specialNeeds: '長期臥床，需翻身拍背',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C002', name: '張明德', address: '東區自由路 199 號',
      pos: { x: 1726, y: 3329 }, phone: '04-2703-3005',
      family: { name: '陳先生', phone: '0952-954-533' },
      careLevel: 3, requiredSkills: ['rehab'], requiredGender: null,
      specialNeeds: '糖尿病需注意飲食，備餐須低糖',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C003', name: '高月娥', address: '北區進化路 4 號 3F',
      pos: { x: 1790, y: 4648 }, phone: '04-2466-8743',
      family: { name: '謝小姐', phone: '0954-590-186' },
      careLevel: 3, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '鼻胃管餵食，家中養狗',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C004', name: '何桂英', address: '南區忠明南路 153 號 3F',
      pos: { x: 665, y: 894 }, phone: '04-2477-6585',
      family: { name: '江先生', phone: '0979-326-375' },
      careLevel: 6, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C005', name: '沈春枝', address: '中區三民路 107 號',
      pos: { x: 3990, y: 3553 }, phone: '04-2540-2179',
      family: { name: '沈先生', phone: '0968-179-972' },
      careLevel: 3, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C006', name: '施進財', address: '西區向上路 115 號',
      pos: { x: 2347, y: 2181 }, phone: '04-2555-1918',
      family: { name: '謝先生', phone: '0919-628-142' },
      careLevel: 2, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '需陪同復健，家屬白天不在',
      designatedCaregivers: [], excludedCaregivers: ['W002'], lastServedBy: 'W004',
    },
    {
      id: 'C007', name: '莊清風', address: '西區向上路 162 號 4F',
      pos: { x: 2526, y: 3760 }, phone: '04-2376-7199',
      family: { name: '李先生', phone: '0951-502-158' },
      careLevel: 3, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '需協助沐浴與更衣',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C008', name: '李榮華', address: '東區樂業路 95 號',
      pos: { x: 4088, y: 1398 }, phone: '04-2625-9964',
      family: { name: '高先生', phone: '0913-469-579' },
      careLevel: 2, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '需協助沐浴與更衣',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C009', name: '邱火旺', address: '北區進化路 163 號 6F',
      pos: { x: 3350, y: 4170 }, phone: '04-2525-1626',
      family: { name: '賴先生', phone: '0983-264-684' },
      careLevel: 8, requiredSkills: ['tube'], requiredGender: null,
      specialNeeds: '鼻胃管餵食，家中養狗',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C010', name: '陳水木', address: '東區自由路 215 號',
      pos: { x: 2745, y: 1438 }, phone: '04-2374-2413',
      family: { name: '許先生', phone: '0919-105-792' },
      careLevel: 4, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '需協助沐浴與更衣',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C011', name: '劉玉蘭', address: '西屯區台灣大道 62 號',
      pos: { x: 806, y: 2615 }, phone: '04-2735-8109',
      family: { name: '蘇小姐', phone: '0987-261-156' },
      careLevel: 8, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C012', name: '何碧雲', address: '東區樂業路 75 號',
      pos: { x: 3157, y: 1649 }, phone: '04-2676-4342',
      family: { name: '施小姐', phone: '0934-618-486' },
      careLevel: 6, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '行動需助行器，午餐需備餐',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C013', name: '施美珠', address: '東區自由路 49 號',
      pos: { x: 4428, y: 1213 }, phone: '04-2299-3101',
      family: { name: '周先生', phone: '0938-124-396' },
      careLevel: 8, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '輕度失智，需固定居服員以免焦慮',
      designatedCaregivers: ['W001'], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C014', name: '曾淑貞', address: '西區向上路 133 號 5F',
      pos: { x: 2068, y: 4482 }, phone: '04-2213-4300',
      family: { name: '蘇小姐', phone: '0951-680-537' },
      careLevel: 5, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '鼻胃管餵食，家中養狗',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C015', name: '楊水木', address: '西屯區台灣大道 125 號',
      pos: { x: 4313, y: 4293 }, phone: '04-2628-3094',
      family: { name: '周小姐', phone: '0928-840-835' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C016', name: '莊玉蘭', address: '南屯區公益路 141 號 3F',
      pos: { x: 3552, y: 3553 }, phone: '04-2542-8131',
      family: { name: '施先生', phone: '0938-531-783' },
      careLevel: 5, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '糖尿病需注意飲食，備餐須低糖',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C017', name: '林天賜', address: '西區向上路 132 號',
      pos: { x: 4579, y: 793 }, phone: '04-2436-2308',
      family: { name: '李先生', phone: '0988-418-910' },
      careLevel: 4, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '需陪同復健，家屬白天不在',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C018', name: '曾文雄', address: '東區樂業路 211 號',
      pos: { x: 5194, y: 977 }, phone: '04-2520-6573',
      family: { name: '王先生', phone: '0969-954-537' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '輕度失智，需固定居服員以免焦慮',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C019', name: '高玉蘭', address: '北屯區崇德路 74 號 6F',
      pos: { x: 3883, y: 3543 }, phone: '04-2395-5072',
      family: { name: '劉小姐', phone: '0912-657-290' },
      careLevel: 2, requiredSkills: ['tube'], requiredGender: null,
      specialNeeds: '怕生，需個性溫和者',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C020', name: '劉阿卻', address: '東區自由路 35 號 3F',
      pos: { x: 2143, y: 3429 }, phone: '04-2722-1013',
      family: { name: '楊小姐', phone: '0984-297-546' },
      careLevel: 6, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '糖尿病需注意飲食，備餐須低糖',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C021', name: '高秀英', address: '西區向上路 41 號 2F',
      pos: { x: 758, y: 1480 }, phone: '04-2579-8974',
      family: { name: '呂小姐', phone: '0951-761-430' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '長期臥床，需翻身拍背',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C022', name: '黃淑貞', address: '中區三民路 184 號',
      pos: { x: 3233, y: 1823 }, phone: '04-2676-9408',
      family: { name: '吳先生', phone: '0918-125-560' },
      careLevel: 8, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '聽力退化，說話需大聲清楚',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C023', name: '沈美珠', address: '東區自由路 158 號',
      pos: { x: 1338, y: 2073 }, phone: '04-2497-5797',
      family: { name: '洪小姐', phone: '0948-510-295' },
      careLevel: 8, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '需協助沐浴與更衣',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C024', name: '何金龍', address: '中區三民路 30 號 4F',
      pos: { x: 2510, y: 4726 }, phone: '04-2324-6289',
      family: { name: '莊先生', phone: '0932-659-353' },
      careLevel: 8, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W003',
    },
    {
      id: 'C025', name: '莊榮華', address: '中區三民路 43 號',
      pos: { x: 4307, y: 2274 }, phone: '04-2704-7423',
      family: { name: '洪先生', phone: '0964-879-252' },
      careLevel: 8, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '獨居，需家務協助與陪伴',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C026', name: '謝玉蘭', address: '西區向上路 111 號',
      pos: { x: 2839, y: 3379 }, phone: '04-2283-5158',
      family: { name: '李先生', phone: '0986-364-544' },
      careLevel: 6, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '需陪同復健，家屬白天不在',
      designatedCaregivers: ['W004'], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C027', name: '曾文雄', address: '西區民生路 159 號',
      pos: { x: 3909, y: 4570 }, phone: '04-2551-9061',
      family: { name: '謝先生', phone: '0932-713-251' },
      careLevel: 4, requiredSkills: ['tube'], requiredGender: null,
      specialNeeds: '三樓無電梯，需體力較好者',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C028', name: '鄭明德', address: '西區向上路 203 號 3F',
      pos: { x: 2219, y: 2290 }, phone: '04-2624-9712',
      family: { name: '劉先生', phone: '0946-513-449' },
      careLevel: 3, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '獨居，需家務協助與陪伴',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W003',
    },
    {
      id: 'C029', name: '謝招弟', address: '南區忠明南路 134 號',
      pos: { x: 3467, y: 3592 }, phone: '04-2282-2076',
      family: { name: '葉小姐', phone: '0953-788-229' },
      careLevel: 5, requiredSkills: ['tube'], requiredGender: null,
      specialNeeds: '輕度失智，需固定居服員以免焦慮',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C030', name: '郭進財', address: '西屯區台灣大道 163 號',
      pos: { x: 3729, y: 4360 }, phone: '04-2528-6380',
      family: { name: '李小姐', phone: '0937-568-803' },
      careLevel: 2, requiredSkills: ['rehab'], requiredGender: null,
      specialNeeds: '獨居，需家務協助與陪伴',
      designatedCaregivers: ['W003'], excludedCaregivers: [], lastServedBy: 'W003',
    },
  ];

  const RAW_CASES = [
    ['C027', 'short', 442, 482, 30],
    ['C004', 'short', 444, 478, 30],
    ['C003', 'mid', 446, 468, 45],
    ['C018', 'mid', 456, 487, 45],
    ['C007', 'short', 482, 511, 30],
    ['C030', 'long', 486, 523, 60],
    ['C025', 'long', 490, 517, 60],
    ['C002', 'long', 498, 533, 60],
    ['C001', 'short', 548, 571, 30],
    ['C008', 'long', 572, 610, 60],
    ['C009', 'long', 578, 609, 60],
    ['C005', 'mid', 601, 633, 45],
    ['C011', 'short', 602, 628, 30],
    ['C013', 'long', 605, 632, 60],
    ['C023', 'short', 607, 636, 30],
    ['C028', 'mid', 632, 663, 45],
    ['C017', 'short', 636, 673, 30],
    ['C026', 'short', 637, 666, 30],
    ['C006', 'mid', 638, 662, 45],
    ['C010', 'mid', 667, 687, 45],
    ['C014', 'short', 684, 704, 30],
    ['C015', 'short', 696, 733, 30],
    ['C024', 'short', 697, 736, 30],
    ['C004', 'long', 786, 818, 60],
    ['C022', 'short', 814, 839, 30],
    ['C008', 'long', 818, 846, 60],
    ['C030', 'long', 850, 871, 60],
    ['C025', 'short', 869, 901, 30],
    ['C019', 'long', 875, 907, 60],
    ['C012', 'mid', 876, 910, 45],
    ['C011', 'mid', 878, 904, 45],
    ['C007', 'long', 900, 939, 60],
    ['C024', 'short', 901, 921, 30],
    ['C026', 'long', 905, 926, 60],
    ['C016', 'mid', 921, 952, 45],
    ['C021', 'long', 922, 959, 60],
    ['C001', 'long', 929, 965, 60],
    ['C029', 'short', 931, 962, 30],
    ['C006', 'mid', 933, 973, 45],
    ['C015', 'mid', 963, 996, 45],
    ['C020', 'long', 965, 990, 60],
    ['C028', 'short', 968, 988, 30],
  ];

  const clientIndex = {};
  clients.forEach((c) => { clientIndex[c.id] = c; });

  const cases = RAW_CASES.map((row, i) => {
    const [clientId, serviceType, earliest, latest, duration] = row;
    const level = clientIndex[clientId].careLevel;
    return {
      id: `${DATE.replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`,
      clientId,
      date: DATE,
      serviceType,
      window: { earliest, latest },
      duration,
      revenue: PARAMS.revenue[serviceType][level],
      assignedTo: null,
      actual: { arrivedAt: null, finishedAt: null },
    };
  });

  const DATA = { PARAMS, SKILL_LABEL, DATE, caregivers, clients, cases };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else global.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
