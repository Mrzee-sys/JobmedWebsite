import mongoose from 'mongoose';

// Each card stores its text in Mongo; the icon is either a built-in icon key
// (mapped to an emoji on the frontend) or a custom Cloudinary image URL.
const serviceCardSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    // No default on purpose: lets the server backfill per-card default copy for
    // documents created before this field existed.
    description: { type: String },
    link: { type: String, default: '' },
    iconKey: { type: String, default: '' },
    iconImage: { type: String, default: '' },
  },
  { _id: false }
);

export const DEFAULT_CARDS = [
  {
    title: 'Occupational Health Services',
    description: 'Comprehensive baseline & annual surveillance tailored to keep your team compliant and healthy.',
    link: '/services/occupational-health',
    iconKey: 'users',
  },
  {
    title: 'Mobile Medicals',
    description: 'Our fully equipped mobile units deploy directly to your site, with zero downtime for your workforce.',
    link: '/services/mobile-medicals',
    iconKey: 'ambulance',
  },
  {
    title: 'Clinic Services',
    description: 'Walk-in services for routine check-ups and specialized occupational care.',
    link: '/services/clinic',
    iconKey: 'hospital',
  },
  {
    title: 'Health Screening & Testing',
    description: 'Targeted screening including audiometry, spirometry, and comprehensive vision testing.',
    link: '/services/screening',
    iconKey: 'stethoscope',
  },
  {
    title: 'SHEQ Support',
    description: 'Safety, Health, Environment, and Quality compliance made simple and sustainable.',
    link: '/services/sheq',
    iconKey: 'shield-check',
  },
  {
    title: 'Employee Wellness',
    description: 'Holistic wellness programs designed to boost workplace morale and long-term productivity.',
    link: '/services/wellness',
    iconKey: 'heart-pulse',
  },
  {
    title: 'Vaccinations',
    description: 'Workplace and individual vaccination programmes, including flu, hepatitis and more.',
    link: '/services/vaccinations',
    iconKey: 'syringe',
  },
  {
    title: 'Travel & General Health',
    description: 'Pre-travel consultations, travel vaccines and everyday general health care.',
    link: '/services/travel',
    iconKey: 'plane',
  },
];

const servicesPageSchema = new mongoose.Schema({
  heroTitle: { type: String, default: 'Our Services' },
  heroSubtitle: { type: String, default: 'Comprehensive Occupational Health Solutions' },
  heroBodyText: {
    type: String,
    default:
      'From medicals and health screenings to workplace wellness and SHEQ support, we provide tailored services to meet your business needs.',
  },
  heroImage: { type: String, default: '' },
  cards: { type: [serviceCardSchema], default: () => DEFAULT_CARDS.map((c) => ({ ...c })) },
});

export const SERVICE_CARD_COUNT = DEFAULT_CARDS.length;

export default mongoose.model('ServicesPage', servicesPageSchema);
