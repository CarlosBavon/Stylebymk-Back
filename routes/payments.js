const express = require("express");
const router = express.Router();
const mpesaService = require("../services/mpesaService");
const crypto = require("crypto");

// Store pending transactions temporarily (in production, use Redis or database)
const pendingTransactions = new Map();

// Initiate STK Push
router.post("/stkpush", async (req, res) => {
  try {
    const {
      phoneNumber,
      amount,
      accountReference,
      transactionDesc,
      bookingData,
      totalAmount,
      depositAmount,
      remainingAmount,
    } = req.body;

    // Validate phone number
    if (!phoneNumber || !phoneNumber.match(/^254[0-9]{9}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number format. Use 254XXXXXXXXX",
      });
    }

    const response = await mpesaService.stkPush(
      phoneNumber,
      amount,
      accountReference,
      transactionDesc,
    );

    if (response.ResponseCode === "0") {
      // Store transaction details for later
      pendingTransactions.set(response.CheckoutRequestID, {
        checkoutRequestID: response.CheckoutRequestID,
        merchantRequestID: response.MerchantRequestID,
        amount,
        phoneNumber,
        accountReference,
        bookingData,
        totalAmount,
        depositAmount,
        remainingAmount,
        status: "pending",
        createdAt: new Date(),
      });

      res.json({
        success: true,
        checkoutRequestID: response.CheckoutRequestID,
        merchantRequestID: response.MerchantRequestID,
        message: "STK Push sent successfully",
      });
    } else {
      res.status(400).json({
        success: false,
        message: response.ResponseDescription || "Failed to initiate payment",
      });
    }
  } catch (error) {
    console.error("STK Push error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Query payment status
router.get("/status/:checkoutRequestId", async (req, res) => {
  try {
    const { checkoutRequestId } = req.params;
    const pendingTx = pendingTransactions.get(checkoutRequestId);

    // If we have no record, assume still pending (not failed)
    if (!pendingTx) {
      return res.json({
        success: false,
        resultCode: 1,
        resultDesc: "Transaction initializing, please wait...",
      });
    }

    // Query Safaricom for status
    const response = await mpesaService.queryStatus(checkoutRequestId);
    console.log("Query status response:", JSON.stringify(response, null, 2));

    // Handle known result codes
    if (response.ResultCode === "0") {
      // Success
      pendingTx.status = "completed";
      pendingTx.mpesaReceiptNumber =
        response.ResultDesc.match(/[A-Z0-9]{10,}/)?.[0] || "N/A";
      pendingTransactions.set(checkoutRequestId, pendingTx);

      return res.json({
        success: true,
        resultCode: 0,
        resultDesc: response.ResultDesc,
        mpesaReceiptNumber: pendingTx.mpesaReceiptNumber,
        transactionId: checkoutRequestId,
      });
    } else if (response.ResultCode === "1037") {
      // Timeout - still pending? Or user didn't act. Keep as pending for now.
      return res.json({
        success: false,
        resultCode: 1,
        resultDesc: "Waiting for user to complete payment...",
      });
    } else if (response.ResultCode === "1032") {
      // User cancelled - permanent failure
      pendingTx.status = "failed";
      pendingTransactions.set(checkoutRequestId, pendingTx);
      return res.json({
        success: false,
        resultCode: 1032,
        resultDesc: "Payment cancelled by user",
      });
    } else if (response.ResultCode && response.ResultCode !== "1") {
      // Any other error code - treat as failure
      pendingTx.status = "failed";
      pendingTransactions.set(checkoutRequestId, pendingTx);
      return res.json({
        success: false,
        resultCode: response.ResultCode,
        resultDesc: response.ResultDesc || "Payment failed",
      });
    } else {
      // No result code yet - still pending
      return res.json({
        success: false,
        resultCode: 1,
        resultDesc: "Processing payment...",
      });
    }
  } catch (error) {
    console.error("Status query error:", error);
    // On error, assume pending, don't fail immediately
    return res.json({
      success: false,
      resultCode: 1,
      resultDesc: "Payment status check in progress",
    });
  }
});
// M-Pesa Callback URL (to be configured in Daraja)
router.post("/callback", async (req, res) => {
  console.log("M-Pesa Callback received:", JSON.stringify(req.body, null, 2));

  try {
    const { Body } = req.body;
    if (Body && Body.stkCallback) {
      const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } =
        Body.stkCallback;

      const pendingTx = pendingTransactions.get(CheckoutRequestID);
      if (pendingTx) {
        if (ResultCode === 0) {
          pendingTx.status = "completed";
          // Extract receipt number from metadata
          const metadata = CallbackMetadata?.Item || [];
          const receiptItem = metadata.find(
            (item) => item.Name === "MpesaReceiptNumber",
          );
          pendingTx.mpesaReceiptNumber = receiptItem?.Value || "N/A";
          pendingTransactions.set(CheckoutRequestID, pendingTx);
        } else {
          pendingTx.status = "failed";
          pendingTransactions.set(CheckoutRequestID, pendingTx);
        }
      }
    }

    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (error) {
    console.error("Callback error:", error);
    res.json({ ResultCode: 1, ResultDesc: "Failed" });
  }
});

module.exports = router;
