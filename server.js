const express = require('express');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
  session({
    secret: 'labeliq-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }
  })
);

// User database with assigned portal roles
// Default credentials for testing:
// Consumer:  admin / admin123
// Business:  business_user / admin123
// Legal:     inspector / admin123
const users = [
  { username: 'admin', password: 'admin123', role: 'consumer' },
  { username: 'business_user', password: 'admin123', role: 'business' },
  { username: 'inspector', password: 'admin123', role: 'legal' }
];

// Helper: Role validation middleware factory
function checkPortalAuth(requiredRole) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.redirect(`/signin?portal=${requiredRole}`);
    }
    if (req.session.user.role !== requiredRole) {
      return res.status(403).render('unauthorized', {
        userRole: req.session.user.role,
        attemptedRole: requiredRole
      });
    }
    next();
  };
}

// -------------------------------------------------------------
// Authentication Routes
// -------------------------------------------------------------

// Sign In (GET) - remembers which portal the user tried to access
app.get('/signin', (req, res) => {
  const portal = req.query.portal || 'consumer';
  res.render('signin', { error: null, portal });
});

// Sign In (POST)
app.post('/signin', (req, res) => {
  const { username, password, targetPortal } = req.body;
  const user = users.find(u => u.username === username && u.password === password);

  if (!user) {
    return res.render('signin', { 
      error: 'Invalid credentials.', 
      portal: targetPortal || 'consumer' 
    });
  }

  // Enforce portal match
  if (targetPortal && user.role !== targetPortal) {
    return res.render('signin', {
      error: `Access Denied: Account role is "${user.role.toUpperCase()}", but you are signing into "${targetPortal.toUpperCase()}".`,
      portal: targetPortal
    });
  }

  // Save session
  req.session.user = {
    username: user.username,
    role: user.role
  };

  // Redirect to correct destination
  if (user.role === 'business') return res.redirect('/business');
  if (user.role === 'legal') return res.redirect('/legal');
  return res.redirect('/');
});

// Sign Out
app.get('/signout', (req, res) => {
  const targetPortal = req.query.portal || 'consumer';
  req.session.destroy(() => {
    res.redirect(`/signin?portal=${targetPortal}`);
  });
});

// -------------------------------------------------------------
// Protected Portal Routes
// -------------------------------------------------------------

// 1. Consumer Portal (Restricted to 'consumer' role)
app.get('/', checkPortalAuth('consumer'), (req, res) => {
  const consumerData = {
    brandName: 'LabelIQ',
    currentUser: req.session.user.username,
    navLinks: ['Product', 'Rule Engine', 'Verification'],
    categories: ['All', 'Food', 'Cosmetics', 'Medical', 'Household', 'Textiles'],
    steps: [
      { number: '01', title: 'Upload label', description: 'Drag a photo of any packaged commodity — front or back label.' },
      { number: '02', title: 'AI extraction', description: 'OCR reads every declaration. The rule engine maps each field to LM(PC) Rules, 2011.' },
      { number: '03', title: 'Instant report', description: 'Each item is flagged Pass, Fail, or Needs Review with statutory citation and correction advice.' }
    ]
  };
  res.render('index', { data: consumerData });
});

// 2. Business Portal (Restricted to 'business' role)
app.get('/business', checkPortalAuth('business'), (req, res) => {
  const businessData = {
    company: { name: 'SunJoy Foods', role: 'Manufacturer', gstin: '06AAJCS1234A1ZX' },
    currentUser: req.session.user.username,
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
  res.render('business', { data: businessData });
});

// 3. Legal Authority Portal (Restricted to 'legal' role)
app.get('/legal', checkPortalAuth('legal'), (req, res) => {
  const legalData = {
    officer: {
      initials: 'RK',
      name: 'Insp. R. K. Sharma',
      role: 'Enforcement Officer',
      region: 'Legal Metrology Directorate — Haryana Region'
    },
    currentUser: req.session.user.username,
    metrics: { totalCases: 6, awaitingAction: 1, investigating: 2, verifiedViolations: 2 },
    filters: [
      { label: 'All (6)', active: true },
      { label: 'New (1)', active: false },
      { label: 'Investigating', active: false },
      { label: 'Verified', active: false },
      { label: 'Dismissed', active: false }
    ],
    cases: [
      { id: 'CAS-2025-09-1842', title: 'NutriGold Protein Bar 30g', status: 'New', statusStyle: 'bg-[#eef2ff] text-[#4f46e5]', dotColor: 'bg-red-500', date: '16 Sep 2025', source: 'Consumer — Priya Mehta · Food', rules: ['Rule 6(1)(g)', 'Rule 6(1)(h)'] },
      { id: 'CAS-2025-09-1841', title: 'GlowPure Face Cream 50g', status: 'Under Investigation', statusStyle: 'bg-[#fffbeb] text-[#b45309]', dotColor: 'bg-red-500', date: '15 Sep 2025', source: 'Field — Insp. R. K. Sharma · Cosmetics', rules: ['Rule 6(1)(d)', 'Rule 13'] },
      { id: 'CAS-2025-09-1839', title: 'CleanMax Detergent 1 kg', status: 'Under Investigation', statusStyle: 'bg-[#fffbeb] text-[#b45309]', dotColor: 'bg-amber-500', date: '14 Sep 2025', source: 'Industry — RetailFirst Ltd. · Household', rules: ['Rule 10', 'Rule 6(1)(c)'] },
      { id: 'CAS-2025-09-1835', title: 'HealWell Antiseptic 200 ml', status: 'Verified Violation', statusStyle: 'bg-[#fef2f2] text-[#dc2626]', dotColor: 'bg-red-500', date: '12 Sep 2025', source: 'Consumer — Rajesh Kumar · Medical', rules: ['Rule 6(1)(e)'] },
      { id: 'CAS-2025-09-1831', title: 'SunJoy Fine Atta 1 kg', status: 'Verified Violation', statusStyle: 'bg-[#fef2f2] text-[#dc2626]', dotColor: 'bg-amber-500', date: '10 Sep 2025', source: 'Field — Insp. S. Patel · Food', rules: ['Rule 6(1)(g)', 'Rule 6(1)(h)', 'Rule 6(1)(i)'] },
      { id: 'CAS-2025-09-1824', title: 'FeatherSoft Bedsheets', status: 'Dismissed', statusStyle: 'bg-[#f1f5f9] text-[#64748b]', dotColor: 'bg-slate-400', date: '7 Sep 2025', source: 'Consumer — Ananya Singh · Textile', rules: ['Rule 6(2)'] }
    ]
  };
  res.render('legal', { data: legalData });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
// Sign Out route
app.get('/signout', (req, res) => {
  const targetPortal = req.query.portal || 'consumer';
  
  // 1. Clears the logged-in session data from the server
  req.session.destroy((err) => {
    // 2. Redirects directly to the sign-in page without needing an HTML file
    res.redirect(`/signin?portal=${targetPortal}`);
  });
});
// Sign Up (GET)
app.get('/signup', (req, res) => {
  const portal = req.query.portal || 'consumer';
  res.render('signup', { error: null, portal });
});

// Sign Up (POST)
app.post('/signup', (req, res) => {
  const { username, password, confirmPassword, portal } = req.body;
  const targetPortal = portal || 'consumer';

  if (!username || !password) {
    return res.render('signup', { error: 'All fields are required.', portal: targetPortal });
  }

  if (password !== confirmPassword) {
    return res.render('signup', { error: 'Passwords do not match.', portal: targetPortal });
  }

  const existingUser = users.find(u => u.username === username);
  if (existingUser) {
    return res.render('signup', { error: 'Username already exists.', portal: targetPortal });
  }

  // Add new user with the selected portal role
  users.push({ username, password, role: targetPortal });

  // Log in immediately
  req.session.user = { username, role: targetPortal };

  // Redirect to corresponding portal
  if (targetPortal === 'business') return res.redirect('/business');
  if (targetPortal === 'legal') return res.redirect('/legal');
  return res.redirect('/');
});
// Instant Mock Google Sign-In / Sign-Up for Consumer Portal
app.get('/auth/google/mock', (req, res) => {
  const googleUser = {
    username: 'google_consumer',
    role: 'consumer'
  };

  // Find or register the Google user in the users array
  let existing = users.find(u => u.username === googleUser.username);
  if (!existing) {
    users.push({ ...googleUser, password: 'oauth_dummy_password' });
  }

  // Create session and redirect directly into the Consumer Portal
  req.session.user = googleUser;
  res.redirect('/');
});