import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import User from './models/User.js';
import Booking, { BOOKING_SERVICES } from './models/Booking.js';
import { sendVerificationCode } from './mailer.js';

// Import our MongoDB Model
import Hero from './models/Hero.js';
import AboutUs from './models/AboutUs.js';
import ServicesPage, { SERVICE_CARD_COUNT, DEFAULT_CARDS } from './models/ServicesPage.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_TEXT_LENGTH = 500;

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

// Health check / heartbeat target (no DB work, responds instantly)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()) });
});

// ---------- Auth (only @jobmed.co.za emails) ----------
const ALLOWED_DOMAIN = '@jobmed.co.za';
const ALLOWED_EXTRA_EMAILS = new Set(['shaunzurcher@gmail.com']);
const ALLOWED_MESSAGE = `Only ${ALLOWED_DOMAIN} email addresses are allowed`;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('JWT_SECRET is not set in the server environment.');
  process.exit(1);
}

const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
const isAllowedEmail = (email) =>
  ALLOWED_EXTRA_EMAILS.has(email) ||
  (/^[^\s@]+@[^\s@]+$/.test(email) && email.endsWith(ALLOWED_DOMAIN) && email.indexOf('@') === email.length - ALLOWED_DOMAIN.length);
const signToken = (user) => jwt.sign({ sub: user._id, email: user.email }, JWT_SECRET, { expiresIn: '8h' });

app.post('/api/auth/register', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!isAllowedEmail(email)) {
    return res.status(400).json({ error: ALLOWED_MESSAGE });
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return res.status(400).json({ error: 'Password must be 8-128 characters' });
  }
  try {
    const existing = await User.findOne({ email });
    if (existing?.verified) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    // Re-registering an unverified address replaces the pending account.
    const user = existing || new User({ email });
    user.passwordHash = await bcrypt.hash(password, 12);
    await issueCode(user);
    res.status(201).json({ pendingVerification: true, email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register' });
  }
});

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const hashCode = (code) => crypto.createHmac('sha256', JWT_SECRET).update(code).digest('hex');

async function issueCode(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  user.codeHash = hashCode(code);
  user.codeExpires = new Date(Date.now() + CODE_TTL_MS);
  user.codeAttempts = 0;
  await user.save();
  await sendVerificationCode(user.email, code);
}

app.post('/api/auth/verify', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';
  if (!isAllowedEmail(email) || !/^\d{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid email or code' });
  }
  try {
    const user = await User.findOne({ email });
    if (!user || user.verified || !user.codeHash || !user.codeExpires || user.codeExpires < new Date()) {
      return res.status(400).json({ error: 'Code expired or invalid. Request a new code.' });
    }
    if (user.codeAttempts >= MAX_CODE_ATTEMPTS) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }
    const expected = Buffer.from(user.codeHash);
    const actual = Buffer.from(hashCode(code));
    if (!crypto.timingSafeEqual(expected, actual)) {
      user.codeAttempts += 1;
      await user.save();
      return res.status(400).json({ error: 'Incorrect code' });
    }
    user.verified = true;
    user.codeHash = '';
    user.codeExpires = undefined;
    await user.save();
    res.json({ token: signToken(user), email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to verify' });
  }
});

app.post('/api/auth/resend', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!isAllowedEmail(email)) return res.status(400).json({ error: 'Invalid email' });
  try {
    const user = await User.findOne({ email });
    const cooledDown = user?.codeExpires && user.codeExpires.getTime() - Date.now() > CODE_TTL_MS - 30000;
    if (user && !user.verified && !cooledDown) await issueCode(user);
    // Same response either way so accounts can't be enumerated.
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const { password } = req.body;
  if (!isAllowedEmail(email)) {
    return res.status(403).json({ error: ALLOWED_MESSAGE });
  }
  try {
    const user = typeof password === 'string' ? await User.findOne({ email }) : null;
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!user.verified) {
      return res.status(403).json({ error: 'Email not verified', unverified: true });
    }
    res.json({ token: signToken(user), email: user.email });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log in' });
  }
});

function verifyBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    return isAllowedEmail(payload.email) ? payload : null;
  } catch {
    return null;
  }
}

app.get('/api/auth/me', (req, res) => {
  const payload = verifyBearer(req);
  if (!payload) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ email: payload.email });
});

// Public booking form submissions are the only non-GET call that needs no token.
const isPublicBooking = (req) => req.method === 'POST' && req.path === '/bookings';

// All non-GET API calls (content edits, uploads) require a valid admin token.
app.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.path.startsWith('/auth/') || isPublicBooking(req)) return next();
  if (!verifyBearer(req)) return res.status(401).json({ error: 'Login required' });
  next();
});

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Atlas connected securely.');
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
};
connectDB();

// Cloudinary Configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Stream uploads directly to Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'jobmed_uploads',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Helper: Get or create the initial Hero document
async function getOrCreateHero() {
  let hero = await Hero.findOne();
  if (!hero) {
    hero = await Hero.create({
      title: "Welcome to Jobmed",
      description: "Update your content in the admin panel."
    });
  }
  return hero;
}

// Helper: Extract public ID from Cloudinary URL for deletion
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split('/');
  const filename = parts[parts.length - 1];
  const publicId = filename.split('.')[0];
  return `jobmed_uploads/${publicId}`;
};

function isValidText(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_TEXT_LENGTH;
}

function isValidOptionalText(value) {
  return typeof value === 'string' && value.length <= MAX_TEXT_LENGTH;
}

app.get('/api/hero', async (req, res) => {
  try {
    const hero = await getOrCreateHero();
    res.json(hero);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load hero content' });
  }
});

app.put('/api/hero', async (req, res) => {
  const { title, badge, tagline, description, secondaryEnabled, secondaryText, services } = req.body;

  if (![title, badge, tagline, description].every(isValidText)) {
    return res.status(400).json({ error: 'title, badge, tagline and description are required text fields' });
  }
  if (secondaryEnabled !== undefined && typeof secondaryEnabled !== 'boolean') {
    return res.status(400).json({ error: 'secondaryEnabled must be a boolean' });
  }
  if (secondaryText !== undefined && !isValidOptionalText(secondaryText)) {
    return res.status(400).json({ error: 'secondaryText must be text' });
  }

  try {
    const updated = await Hero.findOneAndUpdate(
      {}, 
      { title, badge, tagline, description, secondaryEnabled, secondaryText, ...(services && { services }) },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save hero content' });
  }
});

app.post('/api/hero/background', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  try {
    const hero = await getOrCreateHero();
    const previousImage = hero.backgroundImage;

    // req.file.path contains the live Cloudinary URL
    hero.backgroundImage = req.file.path; 
    await hero.save();

    // Destroy the old image in the cloud
    if (previousImage?.includes('cloudinary.com')) {
      const publicId = getPublicIdFromUrl(previousImage);
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    res.json(hero);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save background image' });
  }
});

app.post('/api/hero/secondary-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  try {
    const hero = await getOrCreateHero();
    const previousImage = hero.secondaryImage;

    hero.secondaryImage = req.file.path; 
    await hero.save();

    if (previousImage?.includes('cloudinary.com')) {
      const publicId = getPublicIdFromUrl(previousImage);
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
    }

    res.json(hero);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save secondary image' });
  }
});

// Helper: Get or create the initial AboutUs document
async function getOrCreateAboutUs() {
  let about = await AboutUs.findOne();
  if (!about) {
    about = await AboutUs.create({});
  }
  return about;
}

app.get('/api/about', async (req, res) => {
  try {
    const about = await getOrCreateAboutUs();
    res.json(about);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load about us content' });
  }
});

app.put('/api/about', async (req, res) => {
  const { heroOverlayText, mission, vision } = req.body;
  try {
    const updated = await AboutUs.findOneAndUpdate(
      {}, 
      { heroOverlayText, mission, vision },
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save about us content' });
  }
});

app.post('/api/about/hero-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
  try {
    const about = await getOrCreateAboutUs();
    const previousImage = about.heroImage;
    about.heroImage = req.file.path; 
    await about.save();
    if (previousImage?.includes('cloudinary.com')) {
      const publicId = getPublicIdFromUrl(previousImage);
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
    }
    res.json(about);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save about us hero image' });
  }
});

app.post('/api/about/badge-image/:index', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
  try {
    const index = parseInt(req.params.index);
    const about = await getOrCreateAboutUs();
    const previousImage = about.badges[index];
    about.badges[index] = req.file.path; 
    await about.save();
    if (previousImage?.includes('cloudinary.com')) {
      const publicId = getPublicIdFromUrl(previousImage);
      if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
    }
    res.json(about);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save badge image' });
  }
});

// =========================================================
// SERVICES PAGE: text -> MongoDB, images -> Cloudinary
// =========================================================

async function getOrCreateServicesPage() {
  let page = await ServicesPage.findOne();
  if (!page) {
    page = await ServicesPage.create({});
  }
  // Backfill any missing cards so there are always exactly SERVICE_CARD_COUNT,
  // and default descriptions for cards saved before that field existed.
  let changed = false;
  for (let i = page.cards.length; i < SERVICE_CARD_COUNT; i++) {
    page.cards.push({ ...DEFAULT_CARDS[i] });
    changed = true;
  }
  page.cards.forEach((card, i) => {
    if (card.description === undefined) {
      card.description = DEFAULT_CARDS[i]?.description ?? '';
      changed = true;
    }
  });
  if (changed) await page.save();
  return page;
}

async function destroyCloudinaryImage(url) {
  if (!url?.includes('cloudinary.com')) return;
  const publicId = getPublicIdFromUrl(url);
  if (publicId) await cloudinary.uploader.destroy(publicId).catch(() => {});
}

function parseCardIndex(raw) {
  const index = Number.parseInt(raw, 10);
  return Number.isInteger(index) && index >= 0 && index < SERVICE_CARD_COUNT ? index : null;
}

app.get('/api/services-page', async (req, res) => {
  try {
    res.json(await getOrCreateServicesPage());
  } catch (err) {
    res.status(500).json({ error: 'Failed to load services page content' });
  }
});

app.put('/api/services-page', async (req, res) => {
  const { heroTitle, heroSubtitle, heroBodyText, cards } = req.body;

  if (!isValidText(heroTitle)) {
    return res.status(400).json({ error: 'Hero title is required (max 500 characters)' });
  }
  if (![heroSubtitle, heroBodyText].every((v) => v === undefined || isValidOptionalText(v))) {
    return res.status(400).json({ error: 'Hero subtitle/body must be text (max 500 characters)' });
  }
  if (cards !== undefined) {
    const validCards =
      Array.isArray(cards) &&
      cards.length === SERVICE_CARD_COUNT &&
      cards.every(
        (c) =>
          c &&
          isValidText(c.title) &&
          isValidOptionalText(c.description ?? '') &&
          isValidOptionalText(c.link ?? '') &&
          isValidOptionalText(c.iconKey ?? '')
      );
    if (!validCards) {
      return res.status(400).json({ error: `Exactly ${SERVICE_CARD_COUNT} cards are required, each with a title` });
    }
  }

  try {
    const page = await getOrCreateServicesPage();
    page.heroTitle = heroTitle;
    if (heroSubtitle !== undefined) page.heroSubtitle = heroSubtitle;
    if (heroBodyText !== undefined) page.heroBodyText = heroBodyText;

    if (cards) {
      // Only text fields come from the client; iconImage is managed by the upload routes.
      cards.forEach((c, i) => {
        page.cards[i].title = c.title;
        page.cards[i].description = c.description ?? '';
        page.cards[i].link = c.link ?? '';
        page.cards[i].iconKey = c.iconKey ?? '';
      });
    }

    await page.save();
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save services page content' });
  }
});

app.post('/api/services-page/hero-image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
  try {
    const page = await getOrCreateServicesPage();
    const previousImage = page.heroImage;
    page.heroImage = req.file.path;
    await page.save();
    await destroyCloudinaryImage(previousImage);
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save services hero image' });
  }
});

app.post('/api/services-page/card-icon/:index', upload.single('image'), async (req, res) => {
  const index = parseCardIndex(req.params.index);
  if (index === null) return res.status(400).json({ error: 'Invalid card index' });
  if (!req.file) return res.status(400).json({ error: 'No image file uploaded' });
  try {
    const page = await getOrCreateServicesPage();
    const previousImage = page.cards[index].iconImage;
    page.cards[index].iconImage = req.file.path;
    await page.save();
    await destroyCloudinaryImage(previousImage);
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save card icon' });
  }
});

// Remove a custom icon so the card falls back to its built-in icon.
app.delete('/api/services-page/card-icon/:index', async (req, res) => {
  const index = parseCardIndex(req.params.index);
  if (index === null) return res.status(400).json({ error: 'Invalid card index' });
  try {
    const page = await getOrCreateServicesPage();
    const previousImage = page.cards[index].iconImage;
    page.cards[index].iconImage = '';
    await page.save();
    await destroyCloudinaryImage(previousImage);
    res.json(page);
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove card icon' });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { fullName, email, serviceRequested, companyName, message = '' } = req.body;
  const normalizedEmail = normalizeEmail(email);

  if (!isValidText(fullName) || !isValidText(companyName)) {
    return res.status(400).json({ error: 'Full name and company name are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }
  if (!BOOKING_SERVICES.includes(serviceRequested)) {
    return res.status(400).json({ error: 'Please select a valid service' });
  }
  if (typeof message !== 'string' || message.length > 2000) {
    return res.status(400).json({ error: 'Message must be text (max 2000 characters)' });
  }

  try {
    const booking = new Booking({ fullName, email: normalizedEmail, serviceRequested, companyName, message });
    await booking.save();
    res.status(201).json({ success: true, id: booking._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save booking' });
  }
});

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Jobmed admin API listening on http://localhost:${PORT}`);
  startKeepAlive();
});

/**
 * Keep-alive heartbeat.
 * Render's free tier spins the service down after 15 min of inactivity, which
 * causes a slow cold start (and missing images) for the next visitor.
 * Pinging our own public URL every 10 min keeps the instance warm.
 * RENDER_EXTERNAL_URL is injected automatically by Render, so this is a no-op locally.
 */
function startKeepAlive() {
  const baseUrl = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
  if (!baseUrl) return;

  const INTERVAL_MS = 10 * 60 * 1000;
  const healthUrl = `${baseUrl.replace(/\/$/, '')}/api/health`;

  setInterval(async () => {
    try {
      const res = await fetch(healthUrl);
      console.log(`[keep-alive] ${res.status} ${new Date().toISOString()}`);
    } catch (error) {
      console.error('[keep-alive] ping failed:', error.message);
    }
  }, INTERVAL_MS);

  console.log(`[keep-alive] pinging ${healthUrl} every ${INTERVAL_MS / 60000} min`);
}

