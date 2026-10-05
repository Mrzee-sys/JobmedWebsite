import mongoose from 'mongoose';

const heroSchema = new mongoose.Schema({
  title: { type: String, required: true },
  badge: { type: String, default: '' },
  tagline: { type: String, default: '' },
  description: { type: String, required: true },
  backgroundImage: { type: String, default: '' },
  secondaryEnabled: { type: Boolean, default: false },
  secondaryText: { type: String, default: '' },
  secondaryImage: { type: String, default: '' },
  services: [{
    id: String,
    title: String,
    icon: String,
    blurb: String
  }]
}, { timestamps: true });

export default mongoose.model('Hero', heroSchema, 'hero');