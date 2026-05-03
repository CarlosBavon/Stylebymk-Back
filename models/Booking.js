const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true }, // Must be in format 2547XXXXXXXX
  date: { type: String, required: true },
  time: { type: String, required: true },
  service: { type: String, required: true },
  totalPrice: { type: Number, required: true },
  depositRequired: { type: Number, required: true }, // 20% of total
  depositPaid: { type: Number, default: 0 },
  balance: { type: Number, required: true }, // total - deposit
  paymentStatus: {
    type: String,
    enum: ["pending", "deposit_paid", "completed", "cancelled"],
    default: "pending",
  },
  mpesaReceipt: { type: String },
  bookingCode: { type: String, unique: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Booking", bookingSchema);
