const nodemailer = require("nodemailer");
const axios = require("axios");

const createTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp-relay.sendinblue.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

const testSMTPConnection = async () => {
  try {
    const transporter = createTransporter();
    await transporter.verify();
    console.log("✅ SMTP server is ready");
  } catch (err) {
    console.error("❌ SMTP connection failed:", err);
  }
};

const sendEmail = async (to, subject, html) => {
  try {
    await axios.post(
      "https://api.brevo.com/v3/smtp/email",
      {
        sender: { email: process.env.EMAIL_USER, name: "MK Hairstylist" },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      },
      {
        headers: {
          "api-key": process.env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
      },
    );
    return true;
  } catch (err) {
    console.error(err.response?.data || err.message);
    return false;
  }
};

const sendBookingConfirmation = async (booking) => {
  const cancelLink = `${process.env.FRONTEND_URL}/cancel?code=${booking.bookingCode}&email=${encodeURIComponent(booking.email)}`;

  // Include deposit information in the email
  const customerHtml = `
    <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #D4AF37; padding: 20px; border-radius: 10px;">
      <h1 style="color: #D4AF37;">Booking Confirmation</h1>
      <p>Dear ${booking.name},</p>
      <p>Your booking has been confirmed for ${new Date(booking.date).toLocaleDateString()} at ${booking.time}.</p>
      <p><strong>Service:</strong> ${booking.service}</p>
      <p><strong>Total Price:</strong> KES ${booking.totalAmount}</p>
      <p><strong>Deposit Paid (10%):</strong> KES ${booking.depositAmount}</p>
      <p><strong>Remaining to pay at salon:</strong> KES ${booking.remainingAmount}</p>
      <p>Booking Code: <strong>${booking.bookingCode}</strong></p>
      <p>To cancel your appointment, click <a href="${cancelLink}">here</a> or use code ${booking.bookingCode} on our cancellation page.</p>
      <p style="color: #ff4444;"><strong>Cancellation Policy:</strong> A 2% penalty of total price applies to cancellations (deducted from deposit).</p>
      <hr style="border-color: #D4AF37;">
      <p style="color: #888;">MK Hairstylist - Where Style Meets Elegance</p>
    </div>
  `;

  const adminHtml = `
    <div style="font-family: 'Poppins', sans-serif;">
      <h2 style="color: #D4AF37;">New Booking Received</h2>
      <p><strong>Name:</strong> ${booking.name}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Date:</strong> ${new Date(booking.date).toLocaleDateString()}</p>
      <p><strong>Time:</strong> ${booking.time}</p>
      <p><strong>Service:</strong> ${booking.service}</p>
      <p><strong>Total:</strong> KES ${booking.totalAmount}</p>
      <p><strong>Deposit Paid:</strong> KES ${booking.depositAmount}</p>
      <p><strong>M-Pesa Receipt:</strong> ${booking.mpesaReceiptNumber || "N/A"}</p>
    </div>
  `;

  await sendEmail(
    booking.email,
    "Booking Confirmation - MK Hairstylist",
    customerHtml,
  );
  await sendEmail(process.env.ADMIN_EMAIL, "New Booking Alert", adminHtml);
};

const sendEnquiryNotification = async (enquiry) => {
  const adminHtml = `
    <div style="font-family: 'Poppins', sans-serif;">
      <h2 style="color: #D4AF37;">New Enquiry Received</h2>
      <p><strong>Name:</strong> ${enquiry.name}</p>
      <p><strong>Email:</strong> ${enquiry.email}</p>
      <p><strong>Message:</strong> ${enquiry.message}</p>
    </div>
  `;
  await sendEmail(
    process.env.ADMIN_EMAIL,
    "New Enquiry - MK Hairstylist",
    adminHtml,
  );
};

const sendContactNotification = async (contact) => {
  const adminHtml = `
    <div style="font-family: 'Poppins', sans-serif;">
      <h2 style="color: #D4AF37;">New Contact Message</h2>
      <p><strong>Name:</strong> ${contact.name}</p>
      <p><strong>Email:</strong> ${contact.email}</p>
      <p><strong>Subject:</strong> ${contact.subject}</p>
      <p><strong>Message:</strong> ${contact.message}</p>
    </div>
  `;
  await sendEmail(
    process.env.ADMIN_EMAIL,
    "New Contact Message - MK Hairstylist",
    adminHtml,
  );
};

// NEW: Send cancellation email with penalty details
const sendCancellationEmail = async (booking, penaltyAmount, refundAmount) => {
  const customerHtml = `
    <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #D4AF37; padding: 20px; border-radius: 10px;">
      <h1 style="color: #D4AF37;">Booking Cancellation Confirmation</h1>
      <p>Dear ${booking.name},</p>
      <p>Your booking for ${booking.service} on ${new Date(booking.date).toLocaleDateString()} at ${booking.time} has been cancelled.</p>
      
      <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #D4AF37; margin-top: 0;">Refund Summary</h3>
        <p><strong>Deposit Paid:</strong> KES ${booking.depositAmount}</p>
        <p><strong>Penalty (2% of total price):</strong> -KES ${penaltyAmount.toFixed(2)}</p>
        <p><strong>Refund Amount:</strong> KES ${refundAmount.toFixed(2)}</p>
      </div>
      
      <p>The refund will be processed to your M-Pesa number within 3-5 business days.</p>
      <hr style="border-color: #D4AF37;">
      <p style="color: #888;">MK Hairstylist - Where Style Meets Elegance</p>
    </div>
  `;

  const adminHtml = `
    <div style="font-family: 'Poppins', sans-serif;">
      <h2 style="color: #D4AF37;">Booking Cancelled</h2>
      <p><strong>Name:</strong> ${booking.name}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Phone:</strong> ${booking.phone}</p>
      <p><strong>Service:</strong> ${booking.service}</p>
      <p><strong>Deposit Paid:</strong> KES ${booking.depositAmount}</p>
      <p><strong>Penalty (2%):</strong> KES ${penaltyAmount.toFixed(2)}</p>
      <p><strong>To Refund:</strong> KES ${refundAmount.toFixed(2)}</p>
    </div>
  `;

  await sendEmail(
    booking.email,
    "Booking Cancelled - MK Hairstylist",
    customerHtml,
  );
  await sendEmail(
    process.env.ADMIN_EMAIL,
    "Booking Cancelled Alert",
    adminHtml,
  );
};

module.exports = {
  sendBookingConfirmation,
  sendEnquiryNotification,
  sendContactNotification,
  sendCancellationEmail, // Export new function
};
