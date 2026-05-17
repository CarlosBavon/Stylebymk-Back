const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const servicePrices = require("../utils/servicePrices");
const { stkPush } = require("../utils/mpesa");
const { createCalendarEvent } = require("../utils/calendar");
const { sendBookingConfirmation } = require("../utils/sendEmail");
const crypto = require("crypto");

function generateBookingCode() {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

// Helper: Validate date format YYYY-MM-DD
function isValidDateString(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

// Helper: Convert minutes since midnight to HH:MM string
function minutesToTimeString(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

// GET available slots (unchanged from previous version, but expects date string in YYYY-MM-DD)
router.get("/slots/:date", async (req, res) => {
  try {
    const dateStr = req.params.date;
    if (!isValidDateString(dateStr)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD.",
        });
    }

    // Find all bookings for that exact date string
    const bookings = await Booking.find({ date: dateStr }, "time");

    // Generate all possible start times (every 30 min from 8:00 to 15:30)
    const allStartMinutes = [];
    for (let mins = 8 * 60; mins <= 15 * 60 + 30; mins += 30) {
      allStartMinutes.push(mins);
    }

    // Convert booked times to minutes
    const bookedMinutes = bookings.map((b) => {
      const [h, m] = b.time.split(":").map(Number);
      return h * 60 + m;
    });

    // Block any start time that falls inside any booked 90‑min window
    const blockedMinutes = new Set();
    for (let booked of bookedMinutes) {
      for (let candidate of allStartMinutes) {
        if (candidate >= booked && candidate < booked + 90) {
          blockedMinutes.add(candidate);
        }
      }
    }

    const availableTimes = allStartMinutes
      .filter((m) => !blockedMinutes.has(m))
      .map(minutesToTimeString);

    res.json({ success: true, availableTimes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 1. Create booking (pending payment)
router.post("/", async (req, res) => {
  try {
    const { name, email, phone, date, time, service } = req.body;
    // Validation
    if (!name || !email || !phone || !date || !time || !service) {
      return res
        .status(400)
        .json({ success: false, message: "All fields are required." });
    }
    if (!isValidDateString(date)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Invalid date format. Use YYYY-MM-DD.",
        });
    }

    const todayStr = new Date().toISOString().split("T")[0];
    if (date < todayStr) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot book for a past date." });
    }
    if (date === todayStr) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Same-day bookings are not allowed. Please choose tomorrow or later.",
        });
    }

    // Check if slot still available
    const existing = await Booking.findOne({ date, time });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Time slot no longer available." });
    }

    const total = servicePrices[service];
    if (!total)
      return res
        .status(400)
        .json({ success: false, message: "Invalid service" });

    const deposit = total * 0.15;
    const balance = total - deposit;

    const booking = new Booking({
      name,
      email,
      phone,
      date, // store as string YYYY-MM-DD
      time,
      service,
      totalPrice: total,
      depositPercent: 15,
      depositAmount: deposit,
      balance,
      paymentStatus: "pending",
      bookingCode: generateBookingCode(),
    });
    await booking.save();
    res
      .status(201)
      .json({
        success: true,
        bookingCode: booking.bookingCode,
        depositAmount: deposit,
        totalPrice: total,
      });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Booking failed" });
  }
});

// 2. Initiate M-Pesa STK Push
router.post("/initiate-payment", async (req, res) => {
  try {
    const { bookingCode, phoneNumber } = req.body;
    const booking = await Booking.findOne({ bookingCode });
    if (!booking)
      return res
        .status(404)
        .json({ success: false, message: "Booking not found" });
    if (booking.paymentStatus !== "pending") {
      return res
        .status(400)
        .json({ success: false, message: "Payment already processed" });
    }

    // Format phone number to 2547XXXXXXXX
    let phone = phoneNumber.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "254" + phone.slice(1);
    if (!phone.startsWith("254")) phone = "254" + phone;

    const response = await stkPush(
      phone,
      booking.depositAmount,
      booking.bookingCode,
      `Deposit for ${booking.service}`,
    );
    booking.mpesaCheckoutID = response.CheckoutRequestID;
    await booking.save();
    res.json({ success: true, checkoutRequestID: response.CheckoutRequestID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "STK push failed" });
  }
});

// 3. M-Pesa Callback URL
router.post("/callback", async (req, res) => {
  const { Body } = req.body;
  if (Body && Body.stkCallback) {
    const { ResultCode, CheckoutRequestID, CallbackMetadata } =
      Body.stkCallback;
    const booking = await Booking.findOne({
      mpesaCheckoutID: CheckoutRequestID,
    });
    if (!booking) return res.json({ ResultCode: 0 });

    if (ResultCode === 0) {
      // Payment successful
      let amount = 0,
        receipt = "";
      if (CallbackMetadata && CallbackMetadata.Item) {
        for (let item of CallbackMetadata.Item) {
          if (item.Name === "Amount") amount = item.Value;
          if (item.Name === "MpesaReceiptNumber") receipt = item.Value;
        }
      }
      booking.paymentStatus = "paid";
      booking.depositPaid = amount;
      booking.mpesaReceipt = receipt;
      await booking.save();

      // Create Google Calendar events (client + admin)
      try {
        const clientEventId = await createCalendarEvent(booking, false);
        const adminEventId = await createCalendarEvent(booking, true);
        booking.googleEventId = clientEventId; // store client event id
        await booking.save();
      } catch (err) {
        console.error("Calendar error:", err);
      }

      // Send confirmation emails
      await sendBookingConfirmation(booking);
    } else {
      booking.paymentStatus = "failed";
      await booking.save();
    }
  }
  res.json({ ResultCode: 0 });
});

// 4. Poll payment status
router.get("/status/:bookingCode", async (req, res) => {
  const booking = await Booking.findOne({
    bookingCode: req.params.bookingCode,
  });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  res.json({ success: true, paymentStatus: booking.paymentStatus });
});

// 5. Cancel booking (only if not paid, or with note that deposit is non-refundable)
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
    if (booking.paymentStatus === "paid") {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Paid bookings cannot be cancelled online. Deposit is non-refundable. Please contact the salon.",
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
