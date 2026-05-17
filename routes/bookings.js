const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const { sendBookingConfirmation } = require("../utils/sendEmail");
const { createCalendarEvent } = require("../utils/calendar"); // ✅ new import
const crypto = require("crypto");

function generateBookingCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Helper: Convert "YYYY-MM-DD" to UTC Date object (midnight)
function getUTCDateFromString(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
}

router.get("/slots/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    // Validate format
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

    // Get all bookings for the day (all are confirmed – no payment status)
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
        if (hour === 15 && minute === 30) {
          possibleStarts.push(hour * 60 + minute);
        } else if (hour < 15) {
          possibleStarts.push(hour * 60 + minute);
        }
      }
    }
    // Ensure 15:30 is included only once
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

router.post("/", async (req, res) => {
  console.log("Received booking request:", req.body);
  try {
    const { name, email, phone, date: dateStr, time, service } = req.body;

    // Validation
    if (!name || !email || !phone || !dateStr || !time || !service) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD.",
        });
    }

    const bookingDate = getUTCDateFromString(dateStr);
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    // Reject past dates
    if (bookingDate < todayUTC) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot book for a past date." });
    }
    // Reject today (same-day bookings not allowed)
    if (bookingDate.getTime() === todayUTC.getTime()) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Same-day bookings are not allowed. Please choose tomorrow or later.",
        });
    }

    // Check if the selected time is still available
    const startOfDay = new Date(bookingDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existingBooking = await Booking.findOne({
      date: { $gte: startOfDay, $lte: endOfDay },
      time: time,
    });
    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message:
          "This time slot is no longer available. Please choose another time.",
      });
    }

    // Create booking
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

    // ✅ CREATE GOOGLE CALENDAR EVENTS (client + admin)
    try {
      // Client calendar event (sends invite to client's email)
      const clientEventId = await createCalendarEvent(booking, false);
      // Admin calendar event (adds to admin's calendar)
      const adminEventId = await createCalendarEvent(booking, true);
      // Optionally store the client event ID (if your model has a field for it)
      booking.googleEventId = clientEventId;
      await booking.save();
      console.log(`Calendar events created for booking ${booking.bookingCode}`);
    } catch (calError) {
      // Non‑blocking: log error but do not fail the booking
      console.error("Failed to create calendar events:", calError);
    }

    // Send confirmation email (email template includes calendar info)
    await sendBookingConfirmation(booking);

    res.status(201).json({
      success: true,
      message:
        "Booking created! A calendar invitation has been sent to your email.",
      bookingCode: booking.bookingCode,
    });
    console.log("Booking saved successfully");
  } catch (error) {
    console.error("Booking error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/cancel", async (req, res) => {
  try {
    const { bookingCode, email } = req.body;
    const booking = await Booking.findOne({ bookingCode, email });
    if (!booking) {
      return res.status(404).json({
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
