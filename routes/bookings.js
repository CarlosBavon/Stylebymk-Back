const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const Booking = require("../models/Booking");
const { sendBookingConfirmation } = require("../utils/sendEmail");
const crypto = require("crypto");
const { createCalendarEvent, deleteCalendarEvent } = require("../utils/calendar");
const { getDuration } = require("../utils/serviceDurations");

function generateBookingCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// List of allowed services
const allowedServices = [
  "Cornrows",
  "Twists",
  "Barrel Twists",
  "Locs (Dreadlocks)",
];

// GET /slots/:date?service=...
router.get("/slots/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    const service = req.query.service; // optional, e.g., "Locs (Dreadlocks)"
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }

    // All existing bookings for the day
    const existingBookings = await Booking.find({ date: dateStr });

    // Duration for the selected service (default 90 min if not provided)
    const duration = service ? getDuration(service) : 90;

    // Generate all possible start times (8:00 to 17:00, every 30 min, excluding 17:30)
    const allStartTimes = [];
    for (let hour = 8; hour <= 17; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 17 && minute === 30) continue;
        allStartTimes.push(hour * 60 + minute);
      }
    }

    const CLOSE_MINUTES = 17 * 60; // 5:00 PM
    const blockedStarts = new Set();

    // 1. Block times that would exceed closing time for this service
    for (let t of allStartTimes) {
      if (t + duration > CLOSE_MINUTES) {
        blockedStarts.add(t);
      }
    }

    // 2. Block times that overlap with any existing booking (using their actual durations)
    for (let existing of existingBookings) {
      const existingDuration = getDuration(existing.service);
      const [exHour, exMin] = existing.time.split(":").map(Number);
      const exStart = exHour * 60 + exMin;
      const exEnd = exStart + existingDuration;

      for (let t of allStartTimes) {
        const newEnd = t + duration;
        if (t < exEnd && newEnd > exStart) {
          blockedStarts.add(t);
        }
      }
    }

    const availableTimes = allStartTimes
      .filter(t => !blockedStarts.has(t))
      .map(t => {
        const hours = Math.floor(t / 60);
        const minutes = t % 60;
        return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      });

    res.json({ success: true, availableTimes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST / (create booking) – unchanged (already uses variable duration)
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

      const duration = getDuration(service);
      const [startHour, startMin] = time.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = startMinutes + duration;

      const CLOSE_MINUTES = 17 * 60;
      if (endMinutes > CLOSE_MINUTES) {
        return res.status(400).json({
          success: false,
          message: `This service lasts ${duration / 60} hour(s) and would finish after 5:00 PM. Please choose an earlier time.`
        });
      }

      const existingBookings = await Booking.find({ date: dateStr });
      for (let existing of existingBookings) {
        const existingDuration = getDuration(existing.service);
        const [exHour, exMin] = existing.time.split(":").map(Number);
        const exStart = exHour * 60 + exMin;
        const exEnd = exStart + existingDuration;

        if (startMinutes < exEnd && endMinutes > exStart) {
          return res.status(409).json({
            success: false,
            message: "This time overlaps with an existing booking. Please choose another time."
          });
        }
      }

      const booking = new Booking({
        name, email, phone, date: dateStr, time, service,
        bookingCode: generateBookingCode(),
      });
      await booking.save();

      let calendarEventId = null;
      try {
        calendarEventId = await createCalendarEvent(booking, false);
        booking.calendarEventId = calendarEventId;
        await booking.save();
        console.log(`✅ Calendar event created for booking ${booking.bookingCode}`);
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

// POST /cancel – unchanged
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
      try {
        if (booking.calendarEventId) await deleteCalendarEvent(booking.calendarEventId);
        console.log(`🗑️ Calendar event deleted for booking ${booking.bookingCode}`);
      } catch (calError) {
        console.error("⚠️ Could not delete calendar event:", calError.message);
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
