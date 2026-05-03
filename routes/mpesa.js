const express = require("express");
const router = express.Router();
const { stkPush } = require("../utils/mpesa");
const Booking = require("../models/Booking");

// Initiate STK Push for booking deposit
router.post("/initiate", async (req, res) => {
  const { bookingCode, phoneNumber, amount } = req.body;
  try {
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
    let formattedPhone = phoneNumber.toString().replace(/\D/g, "");
    if (formattedPhone.startsWith("0"))
      formattedPhone = "254" + formattedPhone.slice(1);
    if (!formattedPhone.startsWith("254"))
      formattedPhone = "254" + formattedPhone;

    const response = await stkPush(
      formattedPhone,
      amount,
      bookingCode,
      `Deposit for ${booking.service}`,
    );
    // Save CheckoutRequestID for later query
    booking.mpesaCheckoutID = response.CheckoutRequestID;
    await booking.save();
    res.json({
      success: true,
      checkoutRequestID: response.CheckoutRequestID,
      merchantRequestID: response.MerchantRequestID,
    });
  } catch (error) {
    res
      .status(500)
      .json({
        success: false,
        message: "STK push failed",
        error: error.message,
      });
  }
});

// Callback URL (publicly accessible)
router.post("/callback", async (req, res) => {
  console.log("M-Pesa callback received:", JSON.stringify(req.body));
  const { Body } = req.body;
  if (Body && Body.stkCallback) {
    const {
      ResultCode,
      ResultDesc,
      MerchantRequestID,
      CheckoutRequestID,
      CallbackMetadata,
    } = Body.stkCallback;
    if (ResultCode === 0) {
      // Payment successful
      const { Amount, MpesaReceiptNumber, PhoneNumber } =
        CallbackMetadata.Item.reduce((acc, item) => {
          acc[item.Name] = item.Value;
          return acc;
        }, {});
      // Find booking by CheckoutRequestID (must be stored)
      const booking = await Booking.findOne({
        mpesaCheckoutID: CheckoutRequestID,
      });
      if (booking) {
        booking.depositPaid = Amount;
        booking.paymentStatus = "deposit_paid";
        booking.mpesaReceipt = MpesaReceiptNumber;
        await booking.save();
        // Send confirmation email
        const { sendBookingConfirmation } = require("../utils/sendEmail");
        await sendBookingConfirmation(booking);
      }
    } else {
      // Payment failed
      console.log("Payment failed:", ResultDesc);
    }
  }
  res.json({ ResultCode: 0, ResultDesc: "Success" });
});

// Query payment status (for polling from frontend)
router.get("/status/:bookingCode", async (req, res) => {
  const { bookingCode } = req.params;
  const booking = await Booking.findOne({ bookingCode });
  if (!booking)
    return res
      .status(404)
      .json({ success: false, message: "Booking not found" });
  res.json({
    success: true,
    paymentStatus: booking.paymentStatus,
    depositPaid: booking.depositPaid,
  });
});

module.exports = router;
