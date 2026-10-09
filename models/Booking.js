import mongoose from 'mongoose';

export const BOOKING_SERVICES = ['Mobile Medicals', 'Clinic Services', 'Health Screening', 'SHEQ Support'];

const bookingSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 200 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    serviceRequested: { type: String, required: true, enum: BOOKING_SERVICES },
    companyName: { type: String, required: true, trim: true, maxlength: 200 },
    message: { type: String, trim: true, maxlength: 2000, default: '' },
    status: { type: String, enum: ['pending', 'confirmed', 'cancelled'], default: 'pending' },
  },
  { timestamps: true }
);

export default mongoose.model('Booking', bookingSchema);
