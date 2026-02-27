const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendBookingEmail = async (booking) => {
  try {
    console.log("Email function started");
    console.log("Sending to:", booking.email);

    const bookingId = booking.trackingId || booking._id;

    await resend.emails.send({
      from: "BookMyRepair <onboarding@resend.dev>",
      to: booking.email,
      subject: `Booking Confirmed - ${bookingId}`,
      html: `
        <h2>Booking Confirmed</h2>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
      `,
    });

    console.log("Email sent successfully");
  } catch (err) {
    console.error("Email error:", err);
  }
};

module.exports = { sendBookingEmail };
