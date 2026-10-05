import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import mongoose from 'mongoose';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

// Import our MongoDB Model
import Hero from './models/Hero.js';
import AboutUs from './models/AboutUs.js';
import ServicesPage, { SERVICE_CARD_COUNT, DEFAULT_CARDS } from './models/ServicesPage.js';

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_TEXT_LENGTH = 500;

const app = express();
app.use(cors());
app.use(express.json({ limit: '100kb' }));

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

app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message });
  }
  next();
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Jobmed admin API listening on http://localhost:${PORT}`);
});

