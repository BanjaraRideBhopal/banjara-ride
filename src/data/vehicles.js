const activa6gRates = {
  rates: {
    "3 Hr": 190, "6 Hr": 340, "12 Hr": 480,
    "1 Day": 540, "2 Days": 1000, "3 Days": 1450, "4 Days": 1750,
    "5 Days": 2100, "6 Days": 2450, "7 Days": 2700,
    "15 Days": 5000, "1 Month": 8100, "3 Months": 18000,
  },
  lateChargePerHour: 65,
  securityDeposit: 800,
};

const activa5gRates = {
  rates: {
    "3 Hr": 160, "6 Hr": 300, "12 Hr": 380,
    "1 Day": 430, "2 Days": 800, "3 Days": 1100, "4 Days": 1400,
    "5 Days": 1650, "6 Days": 1900, "7 Days": 2200,
    "15 Days": 4500, "1 Month": 7100, "3 Months": 15000,
  },
  lateChargePerHour: 55,
  securityDeposit: 800,
};

const starCityRates = {
  rates: {
    "3 Hr": 160, "6 Hr": 300, "12 Hr": 400,
    "1 Day": 480, "2 Days": 900, "3 Days": 1300, "4 Days": 1600,
    "5 Days": 1800, "6 Days": 2100, "7 Days": 2300,
    "15 Days": 4700, "1 Month": 7100, "3 Months": 17000,
  },
  lateChargePerHour: 55,
  securityDeposit: 800,
};

const dreamYugaRates = {
  rates: {
    "3 Hr": 160, "6 Hr": 300, "12 Hr": 380,
    "1 Day": 430, "2 Days": 800, "3 Days": 1100, "4 Days": 1400,
    "5 Days": 1650, "6 Days": 1900, "7 Days": 2200,
    "15 Days": 4300, "1 Month": 6300, "3 Months": 13000,
  },
  lateChargePerHour: 55,
  securityDeposit: 800,
};

const shineBS6Rates = {
  rates: {
    "3 Hr": 190, "6 Hr": 340, "12 Hr": 480,
    "1 Day": 550, "2 Days": 1000, "3 Days": 1450, "4 Days": 1750,
    "5 Days": 2100, "6 Days": 2450, "7 Days": 2700,
    "15 Days": 5000, "1 Month": 8100, "3 Months": 17000,
  },
  lateChargePerHour: 65,
  securityDeposit: 800,
};

const gixxerRates = {
  rates: {
    "3 Hr": 200, "6 Hr": 380, "12 Hr": 550,
    "1 Day": 700, "2 Days": 1280, "3 Days": 1620, "4 Days": 2200,
    "5 Days": 2800, "6 Days": 3200, "7 Days": 3550,
    "15 Days": 6420, "1 Month": 8900, "3 Months": 22000,
  },
  lateChargePerHour: 75,
  securityDeposit: 800,
};

const thunderbirdRates = {
  rates: {
    "3 Hr": 267, "6 Hr": 535, "12 Hr": 802,
    "1 Day": 909, "2 Days": 1712, "3 Days": 2461, "4 Days": 3210,
    "5 Days": 3852, "6 Days": 4494, "7 Days": 4598,
    "15 Days": 9630, "1 Month": 12900, "3 Months": 30000,
  },
  lateChargePerHour: 110,
  securityDeposit: 1000,
};

const cb350Rates = {
  rates: {
    "3 Hr": 320, "6 Hr": 620, "12 Hr": 920,
    "1 Day": 1250, "2 Days": 2250, "3 Days": 3180, "4 Days": 4000,
    "5 Days": 4900, "6 Days": 5800, "7 Days": 6500,
    "15 Days": 12000, "1 Month": 16500, "3 Months": 40000,
  },
  lateChargePerHour: 120,
  securityDeposit: 1500,
};

export const vehicles = [
  {
    id: 1,
    type: 'Lectrix EV',
    registrations: ['MP04YH8685'],
    rates: {
      "6 Hr": 340, "12 Hr": 514,
      "1 Day": 599, "2 Days": 1050, "3 Days": 1500, "4 Days": 2000,
      "5 Days": 2400, "6 Days": 2800, "7 Days": 3100,
      "15 Days": 5500, "1 Month": 7025, "3 Months": 15000,
    },
    lateChargePerHour: 65,
    securityDeposit: 800,
  },
  { id: 2, type: 'Jupiter BS6', registrations: ['MP04ZD6010'], ...activa6gRates },
  {
    id: 3,
    type: 'Activa 6G',
    registrations: [
      'MP04YR5523', 'MP04ZA9765', 'MP04ZC1643', 'MP04UL2618', 'MP38S6057',
      'MP04ZK7670', 'MP04ZQ6498', 'MP04ZU0958', 'MP04ZW2835', 'MP04ZW3265',
      'MP04ZW3269', 'MP04ZW8614', 'MP04ZY7794', 'MP04YA1224', 'MP04YA1027',
      'MP04YA1080', 'MP04YA1056', 'MP04YA8780', 'MP04YB1143', 'MP04YA9538',
      'MP04YH0480', 'MP04YF0914', 'MP04YQ2197',
    ],
    ...activa6gRates,
  },
  {
    id: 4,
    type: 'Activa 5G',
    registrations: ['MP04UF4596', 'MP04UF4729', 'MP04UE0280', 'MP04UE0281'],
    ...activa5gRates,
  },
  { id: 5, type: 'StarCityPlus', registrations: ['MP04ZQ9887'], ...starCityRates },
  {
    id: 6,
    type: 'HF Delux',
    registrations: ['MP04YR6056', 'MP04YR5740', 'MP04YR5653'],
    ...starCityRates,
  },
  { id: 7, type: 'Dream Yuga', registrations: ['MP04QU5468'], ...dreamYugaRates },
  { id: 8, type: 'Splendor+', registrations: ['MP04QT7794'], ...dreamYugaRates },
  { id: 9, type: 'TVS Sport', registrations: ['MP04ML0524'], ...dreamYugaRates },
  { id: 10, type: 'Shine', registrations: ['MP04QT6138'], ...dreamYugaRates },
  {
    id: 11,
    type: 'Shine BS6',
    registrations: ['MP04ZF2527', 'MP04VF2469', 'MP04ZP3336', 'MP04VF2334', 'MP04VD6987', 'MP04YH2878', 'MP04YN6919'],
    ...shineBS6Rates,
  },
  {
    id: 12,
    type: 'Honda SP',
    registrations: ['MP04VC9332', 'MP04YS8465'],
    ...gixxerRates,
  },
  { id: 13, type: 'Pulsar 125', registrations: ['MP04YS5213'], ...gixxerRates },
  { id: 14, type: 'Gixxer', registrations: ['MP04QN7669'], ...gixxerRates },
  { id: 15, type: 'Thunderbird', registrations: ['MP04QF1727'], ...thunderbirdRates },
  { id: 16, type: 'CB 350', registrations: ['MP04ZU7811'], ...cb350Rates },
  { id: 17, type: 'Hunter 350', registrations: ['MP04ZW2275'], ...cb350Rates },
  { id: 18, type: 'Classic 350', registrations: ['MP04UM3438'], ...cb350Rates },
];
