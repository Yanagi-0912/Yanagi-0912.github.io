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
    // 服務收費：依長照等級的時薪換算，長時案有級距折扣（見 priceOf）
    hourlyRate: { 2: 240, 3: 280, 4: 310, 5: 350, 6: 380, 7: 410, 8: 450 },
    lengthDiscount: [[360, 0.85], [180, 0.90], [90, 0.95], [0, 1.00]],

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

  const DATE = '2026-08-25';

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
      id: 'C001', name: '賴素珍', address: '中區三民路 238 號',
      pos: { x: 1212, y: 746 }, phone: '04-2757-8142',
      family: { name: '蔡小姐', phone: '0924-347-641' },
      careLevel: 4, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '需陪同復健，家屬白天不在',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C002', name: '周秀英', address: '中區三民路 27 號',
      pos: { x: 1611, y: 3463 }, phone: '04-2649-2218',
      family: { name: '黃先生', phone: '0914-224-855' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '需協助沐浴與更衣',
      designatedCaregivers: ['W004'], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C003', name: '賴秀琴', address: '中區三民路 175 號 6F',
      pos: { x: 2038, y: 1629 }, phone: '04-2656-4228',
      family: { name: '陳小姐', phone: '0981-136-624' },
      careLevel: 3, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '需協助沐浴與更衣',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C004', name: '楊榮華', address: '西區民生路 120 號',
      pos: { x: 4944, y: 916 }, phone: '04-2303-2287',
      family: { name: '黃先生', phone: '0932-970-726' },
      careLevel: 2, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '聽力退化，說話需大聲清楚',
      designatedCaregivers: [], excludedCaregivers: ['W005'], lastServedBy: 'W002',
    },
    {
      id: 'C005', name: '賴萬得', address: '西區民生路 214 號',
      pos: { x: 2540, y: 3808 }, phone: '04-2629-9551',
      family: { name: '郭先生', phone: '0933-357-886' },
      careLevel: 5, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '怕生，需個性溫和者',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C006', name: '楊天賜', address: '南區忠明南路 215 號',
      pos: { x: 3597, y: 3426 }, phone: '04-2600-1950',
      family: { name: '王先生', phone: '0976-970-769' },
      careLevel: 8, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '輕度失智，需固定居服員以免焦慮',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C007', name: '陳素珍', address: '北屯區崇德路 19 號',
      pos: { x: 1396, y: 3130 }, phone: '04-2779-9328',
      family: { name: '楊先生', phone: '0945-352-154' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '長期臥床，需翻身拍背',
      designatedCaregivers: ['W004'], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C008', name: '曾桂英', address: '中區三民路 171 號 6F',
      pos: { x: 2264, y: 2463 }, phone: '04-2778-8146',
      family: { name: '黃小姐', phone: '0947-532-851' },
      careLevel: 3, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '鼻胃管餵食，家中養狗',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C009', name: '吳國棟', address: '中區三民路 160 號',
      pos: { x: 2179, y: 1043 }, phone: '04-2200-9213',
      family: { name: '廖小姐', phone: '0910-488-417' },
      careLevel: 2, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '獨居，需家務協助與陪伴',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C010', name: '劉秀琴', address: '中區三民路 104 號',
      pos: { x: 4412, y: 3323 }, phone: '04-2758-2776',
      family: { name: '郭小姐', phone: '0954-948-578' },
      careLevel: 8, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '怕生，需個性溫和者',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C011', name: '徐水木', address: '北區進化路 130 號 3F',
      pos: { x: 2911, y: 3559 }, phone: '04-2366-2118',
      family: { name: '廖先生', phone: '0987-655-235' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '鼻胃管餵食，家中養狗',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C012', name: '許福生', address: '西區向上路 93 號 5F',
      pos: { x: 4232, y: 2970 }, phone: '04-2285-2033',
      family: { name: '吳小姐', phone: '0913-502-897' },
      careLevel: 2, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: ['W001'], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C013', name: '陳金枝', address: '西區向上路 148 號',
      pos: { x: 2305, y: 781 }, phone: '04-2768-5401',
      family: { name: '劉先生', phone: '0930-709-596' },
      careLevel: 5, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: ['W004'], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C014', name: '陳火旺', address: '北屯區崇德路 9 號 2F',
      pos: { x: 2845, y: 3615 }, phone: '04-2567-2486',
      family: { name: '許先生', phone: '0915-243-540' },
      careLevel: 8, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '長期臥床，需翻身拍背',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C015', name: '王萬得', address: '東區樂業路 122 號',
      pos: { x: 3130, y: 1897 }, phone: '04-2312-1756',
      family: { name: '許先生', phone: '0937-168-542' },
      careLevel: 2, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '需陪同復健，家屬白天不在',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C016', name: '蔡秀英', address: '北區進化路 125 號 3F',
      pos: { x: 4155, y: 4509 }, phone: '04-2767-2770',
      family: { name: '吳小姐', phone: '0926-441-945' },
      careLevel: 6, requiredSkills: ['tube'], requiredGender: null,
      specialNeeds: '聽力退化，說話需大聲清楚',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C017', name: '曾清風', address: '北區進化路 240 號',
      pos: { x: 681, y: 973 }, phone: '04-2524-8677',
      family: { name: '鄭先生', phone: '0952-349-610' },
      careLevel: 8, requiredSkills: ['rehab'], requiredGender: null,
      specialNeeds: '中風後右側無力，需協助移位',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
    {
      id: 'C018', name: '李清風', address: '西屯區台灣大道 223 號 4F',
      pos: { x: 3022, y: 3038 }, phone: '04-2505-7602',
      family: { name: '廖先生', phone: '0919-776-822' },
      careLevel: 5, requiredSkills: ['body', 'house'], requiredGender: null,
      specialNeeds: '三樓無電梯，需體力較好者',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C019', name: '李月娥', address: '東區自由路 218 號',
      pos: { x: 3528, y: 4002 }, phone: '04-2700-5258',
      family: { name: '楊小姐', phone: '0928-536-912' },
      careLevel: 7, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '行動需助行器，午餐需備餐',
      designatedCaregivers: [], excludedCaregivers: ['W005'], lastServedBy: 'W004',
    },
    {
      id: 'C020', name: '蔡碧雲', address: '東區樂業路 72 號',
      pos: { x: 4849, y: 4020 }, phone: '04-2210-5528',
      family: { name: '吳小姐', phone: '0916-802-400' },
      careLevel: 5, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '怕生，需個性溫和者',
      designatedCaregivers: [], excludedCaregivers: ['W001'], lastServedBy: 'W006',
    },
  ];

  // 當日案件：[個案, 最早可開始, 最晚可開始, 服務時長]
  const RAW_CASES = [
    ['C012', 425, 454, 60],
    ['C019', 445, 481, 45],
    ['C006', 447, 480, 45],
    ['C010', 452, 489, 60],
    ['C004', 454, 494, 30],
    ['C005', 455, 478, 30],
    ['C001', 480, 505, 480],
    ['C002', 497, 524, 210],
    ['C017', 502, 533, 60],
    ['C003', 542, 570, 180],
    ['C007', 565, 588, 45],
    ['C018', 565, 587, 60],
    ['C014', 568, 599, 45],
    ['C009', 607, 632, 90],
    ['C005', 664, 695, 60],
    ['C008', 676, 714, 60],
    ['C013', 696, 734, 60],
    ['C007', 781, 804, 60],
    ['C016', 788, 825, 60],
    ['C020', 793, 819, 30],
    ['C015', 794, 829, 60],
    ['C006', 843, 879, 45],
    ['C011', 844, 873, 90],
    ['C004', 904, 927, 30],
    ['C008', 985, 1015, 45],
  ];

  // 服務類型由時長推導，收費 = 時薪 × 時數 × 級距折扣（取 5 元整數）
  function typeOf(d) {
    return d <= 30 ? 'short' : d <= 45 ? 'mid' : d <= 60 ? 'long'
         : d <= 120 ? 'ext' : d < 360 ? 'halfday' : 'fullday';
  }
  function priceOf(duration, careLevel) {
    const rate = PARAMS.hourlyRate[careLevel];
    const disc = PARAMS.lengthDiscount.find((r) => duration >= r[0])[1];
    return Math.round(rate * (duration / 60) * disc / 5) * 5;
  }

  const clientIndex = {};
  clients.forEach((c) => { clientIndex[c.id] = c; });

  const cases = RAW_CASES.map((row, i) => {
    const [clientId, earliest, latest, duration] = row;
    const level = clientIndex[clientId].careLevel;
    return {
      id: `${DATE.replace(/-/g, '')}-${String(i + 1).padStart(3, '0')}`,
      clientId,
      date: DATE,
      serviceType: typeOf(duration),
      window: { earliest, latest },
      duration,
      revenue: priceOf(duration, level),
      assignedTo: null,
      actual: { arrivedAt: null, finishedAt: null },
    };
  });

  const DATA = { PARAMS, SKILL_LABEL, DATE, caregivers, clients, cases, typeOf, priceOf };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else global.DATA = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
