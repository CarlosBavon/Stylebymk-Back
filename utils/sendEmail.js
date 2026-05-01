const nodemailer = require("nodemailer");

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp-relay.sendinblue.com',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: false, // TLS
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    tls: {
      rejectUnauthorized: false
    },
    family: 4
  });
};

const sendEmail = async (to, subject, html) => {
  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"MK Hairstylist" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    console.error("Email error:", error);
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

module.exports = {
  sendBookingConfirmation,
  sendEnquiryNotification,
  sendContactNotification,
};
