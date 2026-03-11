const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS
  }
});

const sendBookingEmail = async (booking) => {

  const mailOptions = {
    from: `"BookMyRepair" <${process.env.GMAIL_USER}>`,
    to: booking.email,
    subject: `Booking Confirmed - ${booking.trackingId}`,

    html: `
      <h2>📱 Booking Confirmed</h2>

      <p>Hello <b>${booking.name}</b></p>

      <p><b>Tracking ID:</b> ${booking.trackingId}</p>

      <p><b>Brand:</b> ${booking.brand}</p>
      <p><b>Model:</b> ${booking.model}</p>

      <p><b>Service:</b> ${booking.service}</p>

      <p><b>Pickup Option:</b> ${booking.pickupOption}</p>

      <p><b>Address:</b> ${booking.address}</p>

      <br/>

      <p>Thank you for choosing BookMyRepair.</p>
    `
  };

  await transporter.sendMail(mailOptions);
};

module.exports = { sendBookingEmail };
