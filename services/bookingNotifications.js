const { Resend } = require("resend");

const resend = new Resend(process.env.re_hGYqjRmP_PT3uME3FttpDaSJiCPzqeQFj);

const sendBookingEmail = async (booking, previousStatus = null) => {
  try {
    console.log("📩 Email function started");

    if (!booking.email) {
      console.log("❌ No email provided");
      return;
    }

    const bookingId = booking.trackingId || booking._id;

    let subject = `Booking Confirmed - ${bookingId}`;
    let title = "Booking Confirmed";

    if (previousStatus) {
      subject = `Booking Update - ${booking.status}`;
      title = "Booking Status Updated";
    }

    const html = `
      <div style="font-family: Arial; padding:20px;">
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

    const response = await resend.emails.send({
 from: "BookMyRepair <bookmyrepair01@gmail.com>", // MUST use this if no domain verified
      to: booking.email,
      subject: subject,
      html: html,
    });

    console.log("✅ Email sent successfully");
    console.log("Resend Response:", response);

  } catch (error) {
    console.error("❌ Email error:", error);
  }
};

module.exports = { sendBookingEmail };
