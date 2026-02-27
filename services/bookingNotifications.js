const { Resend } = require("resend");

const resend = new Resend(process.re_hGYqjRmP_PT3uME3FttpDaSJiCPzqeQFj);

const sendBookingEmail = async (booking, previousStatus = null) => {
  try {
    console.log("Email function started");

    const bookingId = booking.trackingId || booking._id;

    let subject = `Booking Confirmed - ${bookingId}`;
    let title = "Booking Confirmed";

    if (previousStatus) {
      subject = `Booking Update - ${booking.status}`;
      title = "Booking Status Updated";
    }

    const html = `
      <div style="font-family: Arial;">
        <h2>${title}</h2>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        <br/>
        <p>Thank you for choosing us.</p>
      </div>
    `;

    await resend.emails.send({
      from: "onboarding@resend.dev",
      to: booking.email,
      subject: subject,
      html: html,
    });

    console.log("Email sent successfully");

  } catch (error) {
    console.error("Email error:", error.message);
  }
};

module.exports = { sendBookingEmail };
