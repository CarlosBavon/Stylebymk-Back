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
        sender: { email: process.env.EMAIL_USER, name: "StylesbyMK" },
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
  const customerHtml = `
    <div style="font-family: 'Poppins', sans-serif; max-width: 600px; margin: 0 auto; border: 2px solid #D4AF37; padding: 20px; border-radius: 10px;">
      <h1 style="color: #D4AF37;">Booking Confirmation</h1>
      <p>Dear ${booking.name},</p>
      <p>Your booking has been confirmed for ${new Date(booking.date).toLocaleDateString()} at ${booking.time}.</p>
      <p><strong>Service:</strong> ${booking.service}</p>
      <p>Booking Code: <strong>${booking.bookingCode}</strong></p>
      <p>To cancel your appointment, click <a href="${cancelLink}">here</a> or use code ${booking.bookingCode} on our cancellation page.</p>
      <hr style="border-color: #D4AF37;">
      <p style="color: #888;">StylesbyMK - Where Style Meets Elegance</p>
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
    </div>
  `;

  await sendEmail(
    booking.email,
    "Booking Confirmation - StylesbyMK",
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
    "New Enquiry - StylesbyMK",
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
    "New Contact Message - StylesbyMK",
    adminHtml,
  );
};

module.exports = {
  sendBookingConfirmation,
  sendEnquiryNotification,
  sendContactNotification,
};
