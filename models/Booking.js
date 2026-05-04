const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  date: { type: Date, required: true },
  time: { type: String, required: true },
  service: { type: String, required: true },
  bookingCode: { type: String, unique: true },
  // New deposit fields
  depositPaid: { type: Boolean, default: false },
  depositAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  remainingAmount: { type: Number, default: 0 },
  mpesaReceiptNumber: { type: String },
  transactionId: { type: String },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed"],
    default: "pending",
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Booking", bookingSchema);
