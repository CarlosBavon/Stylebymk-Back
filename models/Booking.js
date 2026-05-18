const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  service: { type: String, required: true },
  bookingCode: { type: String, unique: true },
  clientEventId: { type: String },   // Google Calendar event ID for the client invitation
  adminEventId: { type: String },    // Google Calendar event ID for the admin
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Booking', bookingSchema);