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
    backFeatures: { type: String, default: '' },
  },
  { _id: false }
);

export const DEFAULT_CARDS = [
  {
    title: 'Occupational Health Services',
    description: 'Comprehensive baseline & annual surveillance tailored to keep your team compliant and healthy.',
    link: '/services/occupational-health',
    iconKey: 'users',
    backFeatures: 'Baseline Medicals\nAnnual Surveillance\nExit Medicals\nBiological Monitoring',
  },
  {
    title: 'Mobile Medicals',
    description: 'Our fully equipped mobile units deploy directly to your site, with zero downtime for your workforce.',
    link: '/services/mobile-medicals',
    iconKey: 'ambulance',
    backFeatures: 'On-site medicals\nFlexible scheduling\nReduce employee downtime\nCompanies < 50 employees within 100km',
  },
  {
    title: 'Clinic Services',
    description: 'Walk-in services for routine check-ups and specialized occupational care.',
    link: '/services/clinic',
    iconKey: 'hospital',
    backFeatures: 'Walk-in routine checkups\nSpecialised care\nImmediate injury response\nHealth consultations',
  },
  {
    title: 'Health Screening & Testing',
    description: 'Targeted screening including audiometry, spirometry, and comprehensive vision testing.',
    link: '/services/screening',
    iconKey: 'stethoscope',
    backFeatures: 'HIV & TB Testing\nCholesterol & Glucose\nLung Function Tests\nHearing & Vision Tests\nDrug & Alcohol Testing\nCustomised Screening Packages',
  },
  {
    title: 'SHEQ Support',
    description: 'Safety, Health, Environment, and Quality compliance made simple and sustainable.',
    link: '/services/sheq',
    iconKey: 'shield-check',
    backFeatures: 'Safety Audits\nRisk Assessments\nQuality Control\nCompliance Consulting',
  },
  {
    title: 'Employee Wellness',
    description: 'Holistic wellness programs designed to boost workplace morale and long-term productivity.',
    link: '/services/wellness',
    iconKey: 'heart-pulse',
    backFeatures: 'Wellness days\nHealth awareness talks\nChronic disease screening\nMental health support\nNutrition & lifestyle guidance',
  },
  {
    title: 'Vaccinations',
    description: 'Workplace and individual vaccination programmes, including flu, hepatitis and more.',
    link: '/services/vaccinations',
    iconKey: 'syringe',
    backFeatures: 'Flu Vaccines\nHepatitis A & B\nTetanus Shots\nOn-site Vaccination Clinics',
  },
  {
    title: 'Travel & General Health',
    description: 'Pre-travel consultations, travel vaccines and everyday general health care.',
    link: '/services/travel',
    iconKey: 'plane',
    backFeatures: 'Yellow Fever\nMalaria Prophylaxis\nTravel Health Kits\nInternational Certificates',
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
