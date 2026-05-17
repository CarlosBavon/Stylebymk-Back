const { google } = require("googleapis");

// Load credentials from environment variables
const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!clientEmail || !privateKey) {
  console.error(
    "❌ Missing Google Calendar credentials in environment variables",
  );
}

const auth = new google.auth.JWT(clientEmail, null, privateKey, [
  "https://www.googleapis.com/auth/calendar",
]);

const calendar = google.calendar({ version: "v3", auth });

const createCalendarEvent = async (booking, isAdmin = false) => {
  try {
    // booking.date is expected as string "YYYY-MM-DD"
    let dateStr = booking.date;
    if (dateStr instanceof Date) {
      const year = dateStr.getFullYear();
      const month = String(dateStr.getMonth() + 1).padStart(2, "0");
      const day = String(dateStr.getDate()).padStart(2, "0");
      dateStr = `${year}-${month}-${day}`;
    }

    // Combine date and time, assume time is in "HH:MM" format
    const startDateTime = new Date(`${dateStr}T${booking.time}:00+03:00`); // East Africa Time
    if (isNaN(startDateTime.getTime())) {
      throw new Error(`Invalid date/time: ${dateStr} ${booking.time}`);
    }
    const endDateTime = new Date(startDateTime.getTime() + 90 * 60000); // 1.5 hours later

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
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: "Africa/Nairobi",
      },
      attendees: isAdmin ? [] : [{ email: booking.email }],
      reminders: { useDefault: true },
      sendUpdates: "all", // send email invitation to attendees
    };

    // Calendar ID: 'primary' for main calendar of the authenticated account
    const calendarId = isAdmin
      ? process.env.GOOGLE_CALENDAR_ID || "primary"
      : "primary";

    const response = await calendar.events.insert({
      calendarId,
      resource: event,
      sendUpdates: "all",
    });

    console.log(
      `✅ Calendar event created for ${isAdmin ? "admin" : "client"}: ${response.data.id}`,
    );
    return response.data.id;
  } catch (error) {
    console.error("❌ Failed to create calendar event:", error.message);
    throw error;
  }
};

module.exports = { createCalendarEvent };
