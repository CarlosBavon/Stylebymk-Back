const { google } = require("googleapis");

const auth = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  ["https://www.googleapis.com/auth/calendar"],
);

const calendar = google.calendar({ version: "v3", auth });

const createCalendarEvent = async (booking, isAdmin = false) => {
  const startDateTime = new Date(`${booking.date}T${booking.time}:00+03:00`); // EAT
  const endDateTime = new Date(startDateTime.getTime() + 90 * 60000);

  const event = {
    summary: isAdmin
      ? `Booking: ${booking.name} - ${booking.service}`
      : `Your hairstyle appointment - ${booking.service}`,
    description: isAdmin
      ? `Client: ${booking.name}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nBooking code: ${booking.bookingCode}`
      : `Thank you for booking with StylesbyMK.\nBooking code: ${booking.bookingCode}\nTo cancel, use the cancellation page.`,
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
    sendUpdates: "all",
  });
  return response.data.id;
};

module.exports = { createCalendarEvent };
