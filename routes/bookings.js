const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const {
  sendBookingConfirmation,
  sendCancellationEmail,
} = require("../utils/sendEmail");
const crypto = require("crypto");

function generateBookingCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Get booking details by code (for cancellation)
router.get("/details/:bookingCode", async (req, res) => {
  try {
    const { bookingCode } = req.params;
    const { email } = req.query;

    const booking = await Booking.findOne({ bookingCode, email });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    res.json({
      success: true,
      booking: {
        name: booking.name,
        email: booking.email,
        service: booking.service,
        date: booking.date,
        time: booking.time,
        totalAmount: booking.totalAmount,
        depositAmount: booking.depositAmount,
        remainingAmount: booking.remainingAmount,
        depositPaid: booking.depositPaid,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get available slots
router.get("/slots/:date", async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    const bookings = await Booking.find(
      {
        date: { $gte: startOfDay, $lte: endOfDay },
      },
      "time",
    );

    const bookedStarts = bookings.map((b) => {
      const [hours, minutes] = b.time.split(":").map(Number);
      return hours * 60 + minutes;
    });

    const possibleStarts = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 15 && minute === 30) {
          possibleStarts.push(hour * 60 + minute);
        } else if (hour < 15) {
          possibleStarts.push(hour * 60 + minute);
        }
      }
    }
    possibleStarts.push(15 * 60 + 30);

    const allStartTimes = [...new Set(possibleStarts)].sort((a, b) => a - b);

    const blockedStarts = new Set();
    for (let booked of bookedStarts) {
      const blockStart = booked;
      const blockEnd = booked + 90;
      for (let t of allStartTimes) {
        if (t >= blockStart && t < blockEnd) {
          blockedStarts.add(t);
        }
      }
    }

    const availableTimes = allStartTimes
      .filter((t) => !blockedStarts.has(t))
      .map((t) => {
        const hours = Math.floor(t / 60);
        const minutes = t % 60;
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      });

    res.json({
      success: true,
      bookedSlots: bookings.map((b) => b.time),
      availableTimes,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create booking (after deposit payment)
router.post("/", async (req, res) => {
  console.log("Received booking request:", req.body);
  try {
    const booking = new Booking({
      ...req.body,
      bookingCode: generateBookingCode(),
      depositPaid: true,
      paymentStatus: "completed",
    });
    await booking.save();
    await sendBookingConfirmation(booking);
    res.status(201).json({
      success: true,
      message: "Booking created!",
      bookingCode: booking.bookingCode,
    });
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Cancel booking with penalty
router.post("/cancel", async (req, res) => {
  try {
    const { bookingCode, email, penaltyAmount, refundAmount } = req.body;
    const booking = await Booking.findOne({ bookingCode, email });

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found. Check code and email.",
      });
    }

    // Send cancellation email with penalty details
    await sendCancellationEmail(booking, penaltyAmount, refundAmount);

    await Booking.deleteOne({ _id: booking._id });
    res.json({
      success: true,
      message: "Booking cancelled successfully.",
      penaltyAmount,
      refundAmount,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
