const nodemailer = require("nodemailer");

const sendBookingEmail = async (booking) => {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_PASS
    }
  });

  const mailOptions = {
    from: process.env.GMAIL_USER,
    to: booking.email,
    subject: "Booking Confirmation",
    html: `
      <h2>Booking Confirmed</h2>

      <p>Hello ${booking.name}</p>

      <p><b>Brand:</b> ${booking.brand}</p>
      <p><b>Model:</b> ${booking.model}</p>
      <p><b>Phone:</b> ${booking.phone}</p>
      <p><b>Primary Issue:</b> ${booking.primaryIssue}</p>
      <p><b>Secondary Issue:</b> ${booking.secondaryIssue}</p>
      <p><b>Pickup Type:</b> ${booking.pickupType}</p>
      <p><b>Address:</b> ${booking.address}</p>

      <p>Thank you for booking with us.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendBookingEmail };
