import mongoose from 'mongoose';

const aboutUsSchema = new mongoose.Schema({
  heroImage: { type: String, default: '' },
  heroOverlayText: { type: String, default: '' },
  badges: { type: [String], default: ['', '', '', ''] },
  mission: { type: String, default: '' },
  vision: { type: String, default: '' },
});

export default mongoose.model('AboutUs', aboutUsSchema);
