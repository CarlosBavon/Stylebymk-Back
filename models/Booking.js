const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true }, // format 2547XXXXXXXX
  date: { type: String, required: true }, // YYYY-MM-DD
  time: { type: String, required: true }, // HH:MM
  service: { type: String, required: true },
  totalPrice: { type: Number, required: true },
  depositPercent: { type: Number, default: 15 },
  depositAmount: { type: Number, required: true }, // 15% of total
  balance: { type: Number, required: true },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "cancelled"],
    default: "pending",
  },
  mpesaCheckoutID: { type: String },
  mpesaReceipt: { type: String },
  bookingCode: { type: String, unique: true },
  googleEventId: { type: String }, // store calendar event ID
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Booking", bookingSchema);
