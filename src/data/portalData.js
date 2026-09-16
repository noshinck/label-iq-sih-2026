const consumerData = {
  brandName: 'LabelIQ',
  navLinks: ['Product', 'Rule Engine', 'Verification'],
  categories: ['All', 'Food', 'Cosmetics', 'Medical', 'Household', 'Textiles'],
  steps: [
    {
      number: '01',
      title: 'Upload label',
      description: 'Drag a photo of any packaged commodity - front or back label.'
    },
    {
      number: '02',
      title: 'AI extraction',
      description: 'OCR reads every declaration. The rule engine maps each field to LM(PC) Rules, 2011.'
    },
    {
      number: '03',
      title: 'Instant report',
      description: 'Each item is flagged Pass, Fail, or Needs Review with statutory citation and correction advice.'
    }
  ]
};

const businessData = {
  company: { name: 'SunJoy Foods', role: 'Manufacturer', gstin: '06AAJCS1234A1ZX' },
  metrics: {
    scannedCount: 7,
    scannedPeriod: 'All time',
    compliantRate: '43%',
    compliantSubtitle: '3 of 7 pass',
    pendingReview: 1,
    pendingSubtitle: 'Awaiting scan',
    violationsCount: 6,
    violationsSubtitle: 'Across all SKUs'
  },
  products: [
    { name: 'SunJoy Fine Atta 1 kg', category: 'Food', sku: 'SJF-WW-1KG', type: 'Retail', destination: 'Domestic', lastChecked: '16 Sep 2025', status: 'Non-Compliant', flagCount: '2x' },
    { name: 'SunJoy Fine Atta 5 kg', category: 'Food', sku: 'SJF-WW-5KG', type: 'Retail', destination: 'Domestic', lastChecked: '15 Sep 2025', status: 'Compliant', flagCount: null },
    { name: 'SunJoy Maida 1 kg', category: 'Food', sku: 'SJF-MD-1KG', type: 'Retail', destination: 'Domestic', lastChecked: '14 Sep 2025', status: 'Needs Review', flagCount: '1x' },
    { name: 'SunJoy Suji Premium 500 g', category: 'Food', sku: 'SJF-SJ-500G', type: 'Retail', destination: 'Export', lastChecked: '13 Sep 2025', status: 'Compliant', flagCount: null },
    { name: 'SunJoy Besan 500 g', category: 'Food', sku: 'SJF-BS-500G', type: 'Retail', destination: 'Domestic', lastChecked: '12 Sep 2025', status: 'Non-Compliant', flagCount: '3x' },
    { name: 'SunJoy Daliya 500 g', category: 'Food', sku: 'SJF-DL-500G', type: 'Retail', destination: 'Domestic', lastChecked: '11 Sep 2025', status: 'Compliant', flagCount: null },
    { name: 'SunJoy Atta 10 kg Bulk', category: 'Food', sku: 'SJF-WW-10KG', type: 'Bulk', destination: 'B2B', lastChecked: '10 Sep 2025', status: 'Pending', flagCount: null }
  ]
};

const legalData = {
  officer: {
    initials: 'RK',
    name: 'Insp. R. K. Sharma',
    role: 'Enforcement Officer',
    region: 'Legal Metrology Directorate - Haryana Region'
  },
  metrics: {
    totalCases: 6,
    awaitingAction: 1,
    investigating: 2,
    verifiedViolations: 2
  },
  filters: [
    { label: 'All (6)', active: true },
    { label: 'New (1)', active: false },
    { label: 'Investigating', active: false },
    { label: 'Verified', active: false },
    { label: 'Dismissed', active: false }
  ],
  cases: [
    { id: 'CAS-2025-09-1842', title: 'NutriGold Protein Bar 30g', status: 'New', statusStyle: 'bg-[#eef2ff] text-[#4f46e5]', dotColor: 'bg-red-500', date: '16 Sep 2025', source: 'Consumer - Priya Mehta - Food', rules: ['Rule 6(1)(g)', 'Rule 6(1)(h)'] },
    { id: 'CAS-2025-09-1841', title: 'GlowPure Face Cream 50g', status: 'Under Investigation', statusStyle: 'bg-[#fffbeb] text-[#b45309]', dotColor: 'bg-red-500', date: '15 Sep 2025', source: 'Field - Insp. R. K. Sharma - Cosmetics', rules: ['Rule 6(1)(d)', 'Rule 13'] },
    { id: 'CAS-2025-09-1839', title: 'CleanMax Detergent 1 kg', status: 'Under Investigation', statusStyle: 'bg-[#fffbeb] text-[#b45309]', dotColor: 'bg-amber-500', date: '14 Sep 2025', source: 'Industry - RetailFirst Ltd. - Household', rules: ['Rule 10', 'Rule 6(1)(c)'] },
    { id: 'CAS-2025-09-1835', title: 'HealWell Antiseptic 200 ml', status: 'Verified Violation', statusStyle: 'bg-[#fef2f2] text-[#dc2626]', dotColor: 'bg-red-500', date: '12 Sep 2025', source: 'Consumer - Rajesh Kumar - Medical', rules: ['Rule 6(1)(e)'] },
    { id: 'CAS-2025-09-1831', title: 'SunJoy Fine Atta 1 kg', status: 'Verified Violation', statusStyle: 'bg-[#fef2f2] text-[#dc2626]', dotColor: 'bg-amber-500', date: '10 Sep 2025', source: 'Field - Insp. S. Patel - Food', rules: ['Rule 6(1)(g)', 'Rule 6(1)(h)', 'Rule 6(1)(i)'] },
    { id: 'CAS-2025-09-1824', title: 'FeatherSoft Bedsheets', status: 'Dismissed', statusStyle: 'bg-[#f1f5f9] text-[#64748b]', dotColor: 'bg-slate-400', date: '7 Sep 2025', source: 'Consumer - Ananya Singh - Textile', rules: ['Rule 6(2)'] }
  ]
};

module.exports = {
  consumerData,
  businessData,
  legalData
};
