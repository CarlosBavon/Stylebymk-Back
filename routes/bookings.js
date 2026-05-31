const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const { sendBookingConfirmation } = require("../utils/sendEmail");
const crypto = require("crypto");
const { createCalendarEvent, deleteCalendarEvent } = require("../utils/calendar");

function generateBookingCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Helper: Convert "YYYY-MM-DD" to a local date string for validation (no timezone)
function getLocalDateFromString(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day); // local timezone
}

// List of allowed services (same as frontend)
const allowedServices = [
  "Cornrows",
  "Almond Twists",
  "Basket Weave Braids",
  "Boho Braids",
  "Box Braids",
  "Butterfly Locs",
  "Crochet Cornrows",
  "Crochet Locs",
  "Curved Cornrows",
  "Distressed Locs",
  "Dutch Braids",
  "Faux Locs",
  "Feed-in Cornrows",
  "Fishtail Braids",
  "Flat Twists",
  "French Braids",
  "Fulani Braids",
  "Ghana Braids",
  "Goddess Locs",
  "Havana Twists",
  "Heart Cornrows",
  "Invisible Braids",
  "Jumbo Box Braids",
  "Kinky Twists",
  "Knotless Box Braids",
  "Lemonade Braids",
  "Marley Twists",
  "Micro Braids",
  "Nubian Twists",
  "Passion Twists",
  "Pixie Braids",
  "Rope Braids",
  "Rope Twists",
  "Senegalese Twists",
  "Sisterlocks",
  "Small Box Braids",
  "Soft Locs",
  "Spring Twists",
  "Stitch Braids",
  "Straight Back Cornrows",
  "Three-Strand Twists",
  "Traditional Locs",
  "Tree Braids",
  "Triangle Box Braids",
  "Tribal Braids",
  "Two-Strand Twists",
  "Waterfall Braids",
  "Zigzag Cornrows"
];

// GET /slots/:date – use string date to fetch bookings (no timezone conversion)
router.get("/slots/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }

    // Find all bookings for the exact date string
    const bookings = await Booking.find({ date: dateStr }, "time");

    // Convert booked start times to minutes from midnight
    const bookedStarts = bookings.map((b) => {
      const [hours, minutes] = b.time.split(":").map(Number);
      return hours * 60 + minutes;
    });

    // Generate all possible start times (every 30 min from 8:00 to 15:30)
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
    if (!possibleStarts.includes(15 * 60 + 30)) {
      possibleStarts.push(15 * 60 + 30);
    }
    const allStartTimes = [...new Set(possibleStarts)].sort((a, b) => a - b);

    // Block slots that overlap with existing bookings (duration 90 min)
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

// POST / (create booking) – store date as string, use string queries
router.post(
  "/",
  [
    body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters").escape(),
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("phone").matches(/^0[0-9]{9}$/).withMessage("Phone number must be 10 digits starting with 0"),
    body("date")
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage("Date must be in YYYY-MM-DD format")
      .custom((dateStr) => {
        // Use local date for validation (no UTC conversion)
        const [year, month, day] = dateStr.split("-").map(Number);
        const bookingDateLocal = new Date(year, month - 1, day);
        const todayLocal = new Date();
        todayLocal.setHours(0, 0, 0, 0);
        if (bookingDateLocal < todayLocal) throw new Error("Cannot book for a past date");
        if (bookingDateLocal.getTime() === todayLocal.getTime()) throw new Error("Same-day bookings are not allowed");
        return true;
      }),
    body("time").matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage("Time must be in HH:MM format (24-hour)"),
    body("service").isIn(allowedServices).withMessage("Invalid service selected"),
  ],
  async (req, res) => {
    console.log("Received booking request:", req.body);
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { name, email, phone, date: dateStr, time, service } = req.body;

      // Check availability using string date (no timezone)
      const existingBooking = await Booking.findOne({
        date: dateStr,
        time: time,
      });
      if (existingBooking) {
        return res.status(409).json({
          success: false,
          message: "This time slot is no longer available. Please choose another time.",
        });
      }

      // Save the booking with date as string
      const booking = new Booking({
        name,
        email,
        phone,
        date: dateStr,
        time,
        service,
        bookingCode: generateBookingCode(),
      });
      await booking.save();

      // Create Google Calendar events (calendar.js expects string date)
      let clientEventId = null, adminEventId = null;
      try {
        clientEventId = await createCalendarEvent(booking, false);
        adminEventId = await createCalendarEvent(booking, true);
        booking.clientEventId = clientEventId;
        booking.adminEventId = adminEventId;
        await booking.save();
        console.log(`✅ Calendar events created for booking ${booking.bookingCode}`);
      } catch (calError) {
        console.error("⚠️ Calendar event creation failed (non‑blocking):", calError.message);
      }

      await sendBookingConfirmation(booking);
      res.status(201).json({
        success: true,
        message: "Booking created!",
        bookingCode: booking.bookingCode,
      });
      console.log("Booking saved successfully");
    } catch (error) {
      console.error("Booking error:", error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// POST /cancel – unchanged (works with string date)
router.post(
  "/cancel",
  [
    body("bookingCode").trim().isLength({ min: 1, max: 20 }).escape(),
    body("email").isEmail().normalizeEmail(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { bookingCode, email } = req.body;
      const booking = await Booking.findOne({ bookingCode, email });
      if (!booking) {
        return res.status(404).json({
          success: false,
          message: "Booking not found. Check code and email.",
        });
      }
      // Delete calendar events if they exist
      try {
        if (booking.clientEventId) await deleteCalendarEvent(booking.clientEventId);
        if (booking.adminEventId) await deleteCalendarEvent(booking.adminEventId);
        console.log(`🗑️ Calendar events deleted for booking ${booking.bookingCode}`);
      } catch (calError) {
        console.error("⚠️ Could not delete calendar events:", calError.message);
      }
      await Booking.deleteOne({ _id: booking._id });
      res.json({ success: true, message: "Booking cancelled successfully." });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

module.exports = router;
