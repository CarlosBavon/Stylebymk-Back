const { google } = require("googleapis");

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/calendar"],
);

const calendar = google.calendar({ version: "v3", auth });

const createCalendarEvent = async (booking, isAdmin = false) => {
  const startDateTime = new Date(`${booking.date}T${booking.time}:00`);
  const endDateTime = new Date(startDateTime.getTime() + 90 * 60000); // 1.5h duration

  const event = {
    summary: isAdmin
      ? `Booking: ${booking.name} - ${booking.service}`
      : `Your hairstyle appointment - ${booking.service}`,
    description: isAdmin
      ? `Client: ${booking.name}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nDeposit paid: KSh ${booking.depositAmount}\nBalance: KSh ${booking.balance}`
      : `Thank you for your 15% deposit (KSh ${booking.depositAmount}). Balance of KSh ${booking.balance} to be paid at the salon.\nBooking code: ${booking.bookingCode}\nTo cancel, use the cancellation page.`,
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: "Africa/Nairobi",
    },
    end: { dateTime: endDateTime.toISOString(), timeZone: "Africa/Nairobi" },
    attendees: isAdmin ? [] : [{ email: booking.email }],
    reminders: { useDefault: true },
  };

  const calendarId = isAdmin ? process.env.GOOGLE_CALENDAR_ID : "primary";
  const response = await calendar.events.insert({
    calendarId,
    resource: event,
    sendUpdates: "all", // sends email to attendees
  });
  return response.data.id;
};

module.exports = { createCalendarEvent };
