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

// Helper: Convert "YYYY-MM-DD" to UTC Date object (midnight)
function getUTCDateFromString(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

// List of allowed services (must match frontend and servicePrices)
const allowedServices = [
  "Cornrows",
  "Twists",
  "Barrel Twists",
  "Senegalese Twists",
  "Box Braids",
  "Locs (Dreadlocks)",
  "Faux Locs",
  "Goddess Locs",
  "Knotless Braids",
  "Feed-in Braids",
  "Fulani Braids",
  "Crochet Braids"
];

// GET /slots/:date (no validation needed except date format – already checked)
router.get("/slots/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD.",
      });
    }
    const targetDate = getUTCDateFromString(dateStr);
    const startOfDay = new Date(targetDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setUTCHours(23, 59, 59, 999);
    const bookings = await Booking.find(
      { date: { $gte: startOfDay, $lte: endOfDay } },
      "time"
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
    if (!possibleStarts.includes(15 * 60 + 30)) {
      possibleStarts.push(15 * 60 + 30);
    }
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

// POST / (create booking) with validation
router.post(
  "/",
  [
    body("name").trim().isLength({ min: 2, max: 50 }).withMessage("Name must be between 2 and 50 characters").escape(),
    body("email").isEmail().withMessage("Valid email is required").normalizeEmail(),
    body("phone").isMobilePhone().withMessage("Valid phone number is required"),
    body("date")
      .matches(/^\d{4}-\d{2}-\d{2}$/)
      .withMessage("Date must be in YYYY-MM-DD format")
      .custom((dateStr) => {
        const [year, month, day] = dateStr.split("-").map(Number);
        const bookingDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);
        if (bookingDate < todayUTC) throw new Error("Cannot book for a past date");
        if (bookingDate.getTime() === todayUTC.getTime()) throw new Error("Same-day bookings are not allowed");
        return true;
      }),
    body("time").matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage("Time must be in HH:MM format (24-hour)"),
    body("service").isIn(allowedServices).withMessage("Invalid service selected"),
  ],
  async (req, res) => {
    console.log("Received booking request:", req.body);
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }
    try {
      const { name, email, phone, date: dateStr, time, service } = req.body;
      const bookingDate = getUTCDateFromString(dateStr);
      const startOfDay = new Date(bookingDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const endOfDay = new Date(bookingDate);
      endOfDay.setUTCHours(23, 59, 59, 999);
      // Double-check availability
      const existingBooking = await Booking.findOne({
        date: { $gte: startOfDay, $lte: endOfDay },
        time: time,
      });
      if (existingBooking) {
        return res.status(409).json({
          success: false,
          message: "This time slot is no longer available. Please choose another time.",
        });
      }
      const booking = new Booking({
        name,
        email,
        phone,
        date: bookingDate,
        time,
        service,
        bookingCode: generateBookingCode(),
      });
      await booking.save();
      // Create Google Calendar events
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

// POST /cancel – simple validation for bookingCode and email
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
