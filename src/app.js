const express = require('express');
const path = require('path');
const session = require('express-session');

const authRoutes = require('./routes/authRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const inspectionRoutes = require('./routes/inspectionRoutes');
const portalRoutes = require('./routes/portalRoutes');
const systemRoutes = require('./routes/systemRoutes');
const { hydrateSession } = require('./services/sessionCookie');

const app = express();
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'labeliq-dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: 'lax',
      secure: Boolean(process.env.VERCEL || process.env.NODE_ENV === 'production')
    }
  })
);

app.use(hydrateSession);

app.use(authRoutes);
app.use(assistantRoutes);
app.use(inspectionRoutes);
app.use(portalRoutes);
app.use(systemRoutes);

app.use((req, res) => {
  res.status(404).send('Page not found');
});

module.exports = app;
