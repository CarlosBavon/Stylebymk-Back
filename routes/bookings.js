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

// GET /slots/:date – unchanged (still shows 30‑min slots)
router.get("/slots/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }

    const bookings = await Booking.find({ date: dateStr }, "time");
    const bookedStarts = bookings.map((b) => {
      const [hours, minutes] = b.time.split(":").map(Number);
      return hours * 60 + minutes;
    });

    // Generate all possible start times (every 30 min from 8:00 to 17:00)
    const possibleStarts = [];
    for (let hour = 8; hour <= 17; hour++) {
      for (let minute of [0, 30]) {
        if (hour === 17 && minute === 30) continue;
        possibleStarts.push(hour * 60 + minute);
      }
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

// POST / (create booking) – with variable duration validation
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

      // 1. Get duration for the chosen service
      const duration = getDuration(service);

      // 2. Convert start time to minutes
      const [startHour, startMin] = time.split(":").map(Number);
      const startMinutes = startHour * 60 + startMin;
      const endMinutes = startMinutes + duration;

      // 3. Check if appointment fits within working hours (8:00 AM – 5:00 PM)
      const CLOSE_MINUTES = 17 * 60; // 5:00 PM = 1020 minutes
      if (endMinutes > CLOSE_MINUTES) {
        return res.status(400).json({
          success: false,
          message: `This service lasts ${duration / 60} hour(s) and would finish after 5:00 PM. Please choose an earlier time.`
        });
      }

      // 4. Check for overlapping bookings using their actual durations
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

      // 5. Save the booking
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

      // 6. Create Google Calendar event (duration will be passed via calendar.js)
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
