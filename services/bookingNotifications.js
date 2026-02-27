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

/* ===========================
   BOOKING CONFIRMATION
=========================== */
const sendBookingConfirmation = async (booking) => {
  try {
    const mailer = getTransporter();
    const bookingId = booking.trackingId || booking._id;

    const html = `
      <div style="font-family:Arial;">
        <h2>Booking Confirmed</h2>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Status:</strong> ${booking.status}</p>
        <p>Your repair request has been received successfully.</p>
      </div>
    `;

    await mailer.sendMail({
      from: process.env.GMAIL_USER,
      to: booking.email,
      subject: `Booking Confirmed - ${bookingId}`,
      html,
    });

  } catch (error) {
    console.error("Booking email error:", error.message);
  }
};

/* ===========================
   STATUS UPDATE EMAIL
=========================== */
const sendStatusUpdateEmail = async (booking, previousStatus) => {
  try {
    const mailer = getTransporter();
    const bookingId = booking.trackingId || booking._id;

    const html = `
      <div style="font-family:Arial;">
        <h2>Booking Status Updated</h2>
        <p><strong>Booking ID:</strong> ${bookingId}</p>
        <p><strong>Previous Status:</strong> ${previousStatus}</p>
        <p><strong>Current Status:</strong> ${booking.status}</p>
        ${booking.adminNote ? `<p><strong>Admin Note:</strong> ${booking.adminNote}</p>` : ""}
        <br/>
        <p>Thank you for choosing us.</p>
      </div>
    `;

    await mailer.sendMail({
      from: process.env.GMAIL_USER,
      to: booking.email,
      subject: `Booking Update - ${booking.status}`,
      html,
    });

  } catch (error) {
    console.error("Status email error:", error.message);
  }
};

module.exports = {
  sendBookingConfirmation,
  sendStatusUpdateEmail,
};
