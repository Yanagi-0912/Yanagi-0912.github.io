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
    revenue: {
      half: { 2: 340, 3: 420, 4: 460, 5: 525, 6: 565, 7: 605, 8: 645 },
      full: { 2: 675, 3: 840, 4: 920, 5: 1045, 6: 1130, 7: 1210, 8: 1285 },
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

  const DATE = '2026-08-21';

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
      id: 'C001', name: '陳林秀英', address: '西區民生路 12 號 3F',
      pos: { x: 2500, y: 1800 }, phone: '04-2301-1122',
      family: { name: '陳先生', phone: '0912-345-678' },
      careLevel: 6, requiredSkills: ['tube'], requiredGender: 'F',
      specialNeeds: '鼻胃管餵食，家中養狗，長輩怕生需個性溫和者',
      designatedCaregivers: ['W004'], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C002', name: '林國棟', address: '北區進化路 88 號',
      pos: { x: 1200, y: 2600 }, phone: '04-2233-4455',
      family: { name: '林小姐', phone: '0922-111-333' },
      careLevel: 4, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '行動需助行器，午餐需備餐',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C003', name: '王玉蘭', address: '東區自由路 45 號 5F',
      pos: { x: 3800, y: 2200 }, phone: '04-2211-6677',
      family: { name: '王太太', phone: '0933-222-444' },
      careLevel: 8, requiredSkills: ['tube', 'body'], requiredGender: null,
      specialNeeds: '長期臥床，需管路照護與翻身拍背',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W002',
    },
    {
      id: 'C004', name: '李水木', address: '中區三民路 7 號',
      pos: { x: 900, y: 1200 }, phone: '04-2255-8899',
      family: { name: '李先生', phone: '0955-666-777' },
      careLevel: 3, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '獨居，需家務協助與陪伴',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C005', name: '張美珠', address: '南屯區公益路 200 號',
      pos: { x: 3100, y: 3400 }, phone: '04-2477-1234',
      family: { name: '張小姐', phone: '0966-888-999' },
      careLevel: 5, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '需女性居服員協助沐浴',
      designatedCaregivers: ['W001'], excludedCaregivers: [], lastServedBy: 'W001',
    },
    {
      id: 'C006', name: '黃阿土', address: '東區振興路 33 號',
      pos: { x: 4200, y: 900 }, phone: '04-2260-3344',
      family: { name: '黃先生', phone: '0977-333-222' },
      careLevel: 7, requiredSkills: ['rehab', 'body'], requiredGender: null,
      specialNeeds: '中風復健期，需復能訓練',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W003',
    },
    {
      id: 'C007', name: '吳秀琴', address: '北屯區文心路 500 號',
      pos: { x: 1800, y: 3900 }, phone: '04-2422-5566',
      family: { name: '吳先生', phone: '0988-444-555' },
      careLevel: 2, requiredSkills: ['house'], requiredGender: null,
      specialNeeds: '輕度失能，主要需陪同就醫與家務',
      designatedCaregivers: [], excludedCaregivers: ['W005'], lastServedBy: 'W001',
    },
    {
      id: 'C008', name: '劉福生', address: '北區學士路 21 號',
      pos: { x: 2900, y: 600 }, phone: '04-2206-7788',
      family: { name: '劉小姐', phone: '0910-222-111' },
      careLevel: 5, requiredSkills: ['body'], requiredGender: null,
      specialNeeds: '糖尿病，需協助備餐控糖',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W006',
    },
    {
      id: 'C009', name: '蔡月娥', address: '西屯區青海路 66 號',
      pos: { x: 600, y: 3200 }, phone: '04-2314-9900',
      family: { name: '蔡先生', phone: '0937-777-888' },
      careLevel: 6, requiredSkills: ['body'], requiredGender: 'F',
      specialNeeds: '輕度失智，需固定居服員以降低焦慮',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W004',
    },
    {
      id: 'C010', name: '鄭天賜', address: '北屯區崇德路 150 號',
      pos: { x: 3600, y: 4100 }, phone: '04-2247-1357',
      family: { name: '鄭太太', phone: '0921-555-444' },
      careLevel: 3, requiredSkills: ['rehab'], requiredGender: null,
      specialNeeds: '術後復能，需肌力訓練',
      designatedCaregivers: [], excludedCaregivers: [], lastServedBy: 'W005',
    },
  ];

  // 當日案件：[個案, 服務類型, 最早可開始, 最晚可開始, 服務時長]
  const RAW_CASES = [
    ['C001', 'half', 420, 440, 90],
    ['C004', 'half', 420, 450, 120],
    ['C008', 'half', 450, 480, 90],
    ['C002', 'full', 480, 510, 210],
    ['C006', 'half', 480, 500, 120],
    ['C009', 'half', 510, 540, 90],
    ['C003', 'full', 540, 570, 240],
    ['C007', 'half', 600, 630, 90],
    ['C005', 'half', 660, 690, 120],
    ['C010', 'half', 690, 720, 90],
    ['C001', 'half', 780, 810, 90],
    ['C004', 'half', 840, 870, 90],
    ['C006', 'half', 870, 900, 120],
    ['C002', 'half', 930, 960, 90],
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
