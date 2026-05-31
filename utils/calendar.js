const { google } = require('googleapis');

// OAuth2 client setup 
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground' 
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
});

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

/**
 * Create a calendar event for a booking.
 * @param {Object} booking - The booking object.
 * @param {boolean} isAdmin - If true, creates event on admin's calendar (no guest).
 * @returns {Promise<string>} - The Google Calendar event ID.
 */
const createCalendarEvent = async (booking, isAdmin = false) => {
    // booking.date
    const year = booking.date.getFullYear();
    const month = String(booking.date.getMonth() + 1).padStart(2, '0');
    const day = String(booking.date.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;

    // Combine date and time
    const startDateTime = new Date(`${dateStr}T${booking.time}:00+03:00`);
    if (isNaN(startDateTime.getTime())) {
        throw new Error(`Invalid date/time: ${dateStr} ${booking.time}`);
    }
    const endDateTime = new Date(startDateTime.getTime() + 90 * 60000); // 1.5 hours

    const event = {
        summary: isAdmin
            ? `Booking: ${booking.name} - ${booking.service}`
            : `Your hairstyle appointment - ${booking.service}`,
        description: isAdmin
            ? `Client: ${booking.name}\nPhone: ${booking.phone}\nEmail: ${booking.email}\nBooking code: ${booking.bookingCode}`
            : `Thank you for booking with StylesbyMK.\nBooking code: ${booking.bookingCode}\nTo cancel, please use the cancellation page.`,
        start: {
            dateTime: startDateTime.toISOString(),
            timeZone: 'Africa/Nairobi',
        },
        end: {
            dateTime: endDateTime.toISOString(),
            timeZone: 'Africa/Nairobi',
        },
        attendees: isAdmin ? [] : [{ email: booking.email }], // client gets invite email
        reminders: { useDefault: true },
    };
 
    const calendarId = 'primary';
    const response = await calendar.events.insert({
        calendarId,
        resource: event,
        sendUpdates: 'all', // sends email invite to attendees
    });
    return response.data.id;
};

/**
 * Delete a calendar event by its ID.
 * @param {string} eventId - The Google Calendar event ID.
 * @returns {Promise<void>}
 */
const deleteCalendarEvent = async (eventId) => {
    if (!eventId) return;
    const calendarId = 'primary';
    await calendar.events.delete({
        calendarId,
        eventId,
    });
};

module.exports = { createCalendarEvent, deleteCalendarEvent };