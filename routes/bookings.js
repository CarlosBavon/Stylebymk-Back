const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const { sendBookingConfirmation } = require("../utils/sendEmail");
const crypto = require("crypto");

function generateBookingCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

router.get("/slots/:date", async (req, res) => {
  try {
    const date = new Date(req.params.date);
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    // Get all bookings for the day
    const bookings = await Booking.find(
      {
        date: { $gte: startOfDay, $lte: endOfDay },
      },
      "time",
    );

    // Convert booked start times to minutes from midnight
    const bookedStarts = bookings.map((b) => {
      const [hours, minutes] = b.time.split(":").map(Number);
      return hours * 60 + minutes;
    });

    // Generate all possible start times (every 30 min from 8:00 to 15:30)
    const possibleStarts = [];
    for (let hour = 8; hour <= 15; hour++) {
      for (let minute of [0, 30]) {
        // Skip 16:00 (hour=16) – not needed, loop stops at 15
        if (hour === 15 && minute === 30) {
          possibleStarts.push(hour * 60 + minute); // 15:30
        } else if (hour < 15) {
          possibleStarts.push(hour * 60 + minute);
        }
      }
    }
    // Add 15:30 explicitly if loop condition skipped it
    possibleStarts.push(15 * 60 + 30);
    
    // Remove duplicates and sort
    const allStartTimes = [...new Set(possibleStarts)].sort((a, b) => a - b);

    // A new booking of duration 90 min blocks slots that start during [start, start+90)
    const blockedStarts = new Set();
    for (let booked of bookedStarts) {
      const blockStart = booked;
      const blockEnd = booked + 90; // exclusive
      for (let t of allStartTimes) {
        if (t >= blockStart && t < blockEnd) {
          blockedStarts.add(t);
        }
      }
    }

    // Convert back to time strings
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

router.post("/", async (req, res) => {
  try {
    const booking = new Booking({
      ...req.body,
      bookingCode: generateBookingCode(),
    });
    await booking.save();
    await sendBookingConfirmation(booking);
    res.status(201).json({
      success: true,
      message: "Booking created!",
      bookingCode: booking.bookingCode,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/cancel", async (req, res) => {
  try {
    const { bookingCode, email } = req.body;
    const booking = await Booking.findOne({ bookingCode, email });
    if (!booking) {
      return res
        .status(404)
        .json({
          success: false,
          message: "Booking not found. Check code and email.",
        });
    }
    await Booking.deleteOne({ _id: booking._id });
    res.json({ success: true, message: "Booking cancelled successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
