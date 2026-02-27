const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

const sendBookingEmail = async (booking, previousStatus = null) => {
  try {
    console.log("Email function started");

    const bookingId = booking.trackingId || booking._id;

    console.log("Sending email to:", booking.email);

    let subject = `Booking Confirmed - ${bookingId}`;
    let title = "Booking Confirmed";

    if (previousStatus) {
      subject = `Booking Update - ${booking.status}`;
      title = "Booking Status Updated";
    }

    const html = `
      <div style="font-family:Arial;">
        <h2>${title}</h2>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        ${
          previousStatus
            ? `<p><strong>Previous Status:</strong> ${previousStatus}</p>`
            : ""
        }
        ${
          booking.adminNote
            ? `<p><strong>Admin Note:</strong> ${booking.adminNote}</p>`
            : ""
        }
        <br/>
        <p>Thank you for choosing BookMyRepair.</p>
      </div>
    `;

    await resend.emails.send({
      from: "BookMyRepair <onboarding@resend.dev>", // safe default sender
      to: booking.email,
      subject,
      html,
    });

    console.log("Email sent successfully");

  } catch (error) {
    console.error("Email error:", error);
  }
};

module.exports = { sendBookingEmail };
