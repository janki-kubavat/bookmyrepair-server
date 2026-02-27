const nodemailer = require("nodemailer");

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  return transporter;
};

const sendBookingEmail = async (booking, previousStatus = null) => {
  try {
    const mailer = getTransporter();
    const bookingId = booking.trackingId || booking._id;

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
        <p>Thank you for choosing us.</p>
      </div>
    `;

    await mailer.sendMail({
      from: process.env.GMAIL_USER,
      to: booking.email,
      subject,
      html,
    });

    console.log("Email sent successfully");

  } catch (error) {
    console.error("Email error:", error.message);
  }
};

module.exports = { sendBookingEmail };
