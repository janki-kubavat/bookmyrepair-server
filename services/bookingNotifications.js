const axios = require("axios");
const nodemailer = require("nodemailer");

let cachedTransporter = null;

const isPlaceholderValue = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return (
    normalized.includes("replace_with") ||
    normalized.includes("your_new_16_char") ||
    normalized.includes("app_password_here") ||
    normalized.includes("example")
  );
};

const normalizePhoneForWhatsApp = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/[^\d+]/g, "");
  if (!cleaned) return "";

  if (cleaned.startsWith("+")) return cleaned;

  const defaultCountryCode = process.env.DEFAULT_COUNTRY_CODE || "+91";
  return `${defaultCountryCode}${cleaned}`;
};

const getMailTransporter = () => {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || isPlaceholderValue(pass)) return null;

  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }

  return cachedTransporter;
};

const bookingSummaryText = (booking) => {
  const technicianName = booking.technicianName || booking.technician || "";
  const technicianPhone = booking.technicianPhone || "";
  const liveLocation = booking.mapUrl || "";
  const pickupAddress = booking.pickupAddress || "";
  const pickupPhone = booking.pickupPhone || "";
  const pickupMapUrl = booking.pickupMapUrl || "";

  const lines = [
    `Booking ID: ${booking.trackingId || booking._id || "-"}`,
    `Customer: ${booking.name || "-"}`,
    `Phone: ${booking.phone || "-"}`,
    `Email: ${booking.email || "-"}`,
    `Device: ${booking.brand || "-"} ${booking.model || "-"}`,
    `Issue: ${booking.service || "-"}`,
    `Service Mode: ${booking.pickupOption || "Pickup & Drop"}`,
    `Address: ${booking.address || booking.location || "-"}`,
    `Status: ${booking.status || "Pending"}`,
  ];

  if (technicianName) {
    lines.push(`Technician: ${technicianName}`);
  }

  if (technicianPhone) {
    lines.push(`Technician Phone: ${technicianPhone}`);
  }

  if (liveLocation) {
    lines.push(`Live Location: ${liveLocation}`);
  }

  if (pickupAddress) {
    lines.push(`Pickup Location: ${pickupAddress}`);
  }

  if (pickupPhone) {
    lines.push(`Pickup Phone: ${pickupPhone}`);
  }

  if (pickupMapUrl) {
    lines.push(`Pickup Map: ${pickupMapUrl}`);
  }

  return lines.join("\n");
};

const bookingSummaryHtml = (booking) => {
  const technicianName = booking.technicianName || booking.technician || "";
  const technicianPhone = booking.technicianPhone || "";
  const liveLocation = booking.mapUrl || "";
  const pickupAddress = booking.pickupAddress || "";
  const pickupPhone = booking.pickupPhone || "";
  const pickupMapUrl = booking.pickupMapUrl || "";

  const rows = [
    ["Booking ID", booking.trackingId || booking._id || "-"],
    ["Customer", booking.name || "-"],
    ["Phone", booking.phone || "-"],
    ["Email", booking.email || "-"],
    ["Device", `${booking.brand || "-"} ${booking.model || "-"}`],
    ["Issue", booking.service || "-"],
    ["Service Mode", booking.pickupOption || "Pickup & Drop"],
    ["Address", booking.address || booking.location || "-"],
    ["Status", booking.status || "Pending"],
  ];

  if (technicianName) rows.push(["Technician", technicianName]);
  if (technicianPhone) rows.push(["Technician Phone", technicianPhone]);
  if (liveLocation) rows.push(["Live Location", liveLocation]);
  if (pickupAddress) rows.push(["Pickup Location", pickupAddress]);
  if (pickupPhone) rows.push(["Pickup Phone", pickupPhone]);
  if (pickupMapUrl) rows.push(["Pickup Map", pickupMapUrl]);

  const table = rows
    .map(([label, value]) => `<tr><td><strong>${label}</strong></td><td>${value}</td></tr>`)
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;">
      <p>Hello,</p>
      <p>Your repair booking has been created successfully.</p>
      <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;">
        ${table}
      </table>
      <p>Thank you for booking with us.</p>
    </div>
  `;
};

const sendBookingEmails = async (booking) => {
  const transporter = getMailTransporter();
  const mailFrom = process.env.GMAIL_USER;
  const adminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || process.env.GMAIL_USER || "").trim();
  const customerEmail = String(booking.email || "").trim().toLowerCase();

  const result = {
    configured: Boolean(transporter),
    customerSent: false,
    adminSent: false,
    errors: [],
  };

  if (!transporter) {
    result.errors.push("Email not configured. Set GMAIL_USER and valid GMAIL_APP_PASSWORD in serverdatabase/.env.");
    return result;
  }

  const subjectCustomer = `Booking Confirmed: ${booking.trackingId || booking._id || ""}`;
  const text = bookingSummaryText(booking);
  const html = bookingSummaryHtml(booking);

  if (customerEmail) {
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: customerEmail,
        subject: subjectCustomer,
        text: `Your booking is confirmed.\n\n${text}`,
        html,
      });
      result.customerSent = true;
    } catch (error) {
      result.errors.push(`Customer email failed: ${error.message}`);
    }
  }

  if (adminEmail) {
    try {
      await transporter.sendMail({
        from: mailFrom,
        to: adminEmail,
        subject: `New Repair Booking: ${booking.trackingId || booking._id || ""}`,
        text,
        html,
      });
      result.adminSent = true;
    } catch (error) {
      result.errors.push(`Admin email failed: ${error.message}`);
    }
  }

  return result;
};

const sendTwilioWhatsApp = async (toNumber, message) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM;

  if (!accountSid || !authToken || !fromNumber) return false;

  const body = new URLSearchParams({
    From: fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`,
    To: toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`,
    Body: message,
  });

  await axios.post(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, body, {
    auth: { username: accountSid, password: authToken },
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 12000,
  });

  return true;
};

const sendBookingWhatsApp = async (booking) => {
  const hasTwilioConfig = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM
  );

  const result = {
    configured: hasTwilioConfig,
    customerSent: false,
    adminSent: false,
    errors: [],
  };

  if (!hasTwilioConfig) {
    result.errors.push(
      "WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM in serverdatabase/.env."
    );
    return result;
  }

  const customerPhone = normalizePhoneForWhatsApp(booking.phone);
  const adminPhone = normalizePhoneForWhatsApp(process.env.ADMIN_WHATSAPP_TO || "");
  const message = `Booking Confirmed\n${bookingSummaryText(booking)}`;

  if (customerPhone) {
    try {
      await sendTwilioWhatsApp(customerPhone, message);
      result.customerSent = true;
    } catch (error) {
      result.errors.push(`Customer WhatsApp failed: ${error.message}`);
    }
  }

  if (adminPhone) {
    try {
      await sendTwilioWhatsApp(adminPhone, `New Booking Received\n${bookingSummaryText(booking)}`);
      result.adminSent = true;
    } catch (error) {
      result.errors.push(`Admin WhatsApp failed: ${error.message}`);
    }
  }

  return result;
};

const sendBookingNotifications = async (booking) => {
  const [email, whatsapp] = await Promise.all([sendBookingEmails(booking), sendBookingWhatsApp(booking)]);
  return { email, whatsapp };
};

const getStatusMessageLine = (status = "", booking = {}) => {
  const normalized = String(status).trim().toLowerCase();
  const technicianName = booking.technicianName || booking.technician || "";

  if (normalized === "pending") {
    return "Your phone repair is pending.";
  }

  if (normalized === "assigned") {
    return technicianName
      ? `Technician ${technicianName} has been assigned for your pickup.`
      : "A technician has been assigned for your pickup.";
  }

  if (normalized === "pickup started") {
    return technicianName
      ? `Technician ${technicianName} is on the way and should reach you in about 2 minutes.`
      : "Your technician is on the way and should reach you in about 2 minutes.";
  }

  if (normalized === "in service") {
    return "Your device is now in service.";
  }

  if (normalized === "in progress") {
    return "Your phone repair status is In Progress.";
  }

  if (normalized === "completed") {
    return "Your phone repair is completed.";
  }

  return `Your phone repair status is ${status || "updated"}.`;
};

const getStatusSubject = (status = "", booking = {}) => {
  const normalized = String(status).trim().toLowerCase();
  const bookingId = booking.trackingId || booking._id || "";
  const technicianName = booking.technicianName || booking.technician || "";

  if (normalized === "completed") {
    return `Final Confirmation: Repair Completed (${bookingId})`;
  }

  if (normalized === "assigned") {
    return technicianName
      ? `Technician Assigned: ${technicianName} (${bookingId})`
      : `Technician Assigned (${bookingId})`;
  }

  if (normalized === "pickup started") {
    return `Technician On The Way: ETA 2 Min (${bookingId})`;
  }

  return `Repair Status Update: ${status || "Updated"}`;
};

const buildStatusUpdateText = (booking, previousStatus = "") => {
  const currentStatus = booking.status || "Pending";
  const messageLine = getStatusMessageLine(currentStatus, booking);
  const bookingId = booking.trackingId || booking._id || "-";
  const service = booking.service || "-";
  const adminNote = booking.adminNote ? String(booking.adminNote).trim() : "";
  const technicianName = booking.technicianName || booking.technician || "";
  const technicianPhone = booking.technicianPhone || "";
  const mapUrl = booking.mapUrl || "";
  const pickupAddress = booking.pickupAddress || "";
  const pickupPhone = booking.pickupPhone || "";
  const pickupMapUrl = booking.pickupMapUrl || "";

  const lines = [
    messageLine,
    "",
    `Booking ID: ${bookingId}`,
    `Device: ${booking.brand || "-"} ${booking.model || "-"}`,
    `Issue: ${service}`,
    `Previous Status: ${previousStatus || "-"}`,
    `Current Status: ${currentStatus}`,
  ];

  if (technicianName) lines.push(`Technician: ${technicianName}`);
  if (technicianPhone) lines.push(`Technician Phone: ${technicianPhone}`);
  if (mapUrl) lines.push(`Live Location: ${mapUrl}`);
  if (pickupAddress) lines.push(`Pickup Location: ${pickupAddress}`);
  if (pickupPhone) lines.push(`Pickup Phone: ${pickupPhone}`);
  if (pickupMapUrl) lines.push(`Pickup Map: ${pickupMapUrl}`);

  if (adminNote) {
    lines.push(`Admin Update: ${adminNote}`);
  }

  return lines.join("\n");
};

const sendBookingStatusEmail = async (booking, previousStatus = "") => {
  const transporter = getMailTransporter();
  const mailFrom = process.env.GMAIL_USER;
  const customerEmail = String(booking.email || "").trim().toLowerCase();

  const result = {
    configured: Boolean(transporter),
    customerSent: false,
    errors: [],
  };

  if (!transporter) {
    result.errors.push("Email not configured. Set GMAIL_USER and valid GMAIL_APP_PASSWORD in serverdatabase/.env.");
    return result;
  }
  if (!customerEmail) return result;

  const currentStatus = booking.status || "Pending";
  const messageLine = getStatusMessageLine(currentStatus, booking);
  const subject = getStatusSubject(currentStatus, booking);
  const bookingId = booking.trackingId || booking._id || "-";
  const text = buildStatusUpdateText(booking, previousStatus);
  const service = booking.service || "-";
  const adminNote = booking.adminNote ? String(booking.adminNote).trim() : "";
  const technicianName = booking.technicianName || booking.technician || "";
  const technicianPhone = booking.technicianPhone || "";
  const mapUrl = booking.mapUrl || "";
  const pickupAddress = booking.pickupAddress || "";
  const pickupPhone = booking.pickupPhone || "";
  const pickupMapUrl = booking.pickupMapUrl || "";

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;">
      <p>${messageLine}</p>
      <p><strong>Booking ID:</strong> ${bookingId}</p>
      <p><strong>Device:</strong> ${booking.brand || "-"} ${booking.model || "-"}</p>
      <p><strong>Issue:</strong> ${service}</p>
      <p><strong>Previous Status:</strong> ${previousStatus || "-"}</p>
      <p><strong>Current Status:</strong> ${currentStatus}</p>
      ${technicianName ? `<p><strong>Technician:</strong> ${technicianName}</p>` : ""}
      ${technicianPhone ? `<p><strong>Technician Phone:</strong> ${technicianPhone}</p>` : ""}
      ${mapUrl ? `<p><strong>Live Location:</strong> <a href="${mapUrl}" target="_blank" rel="noreferrer">View Map</a></p>` : ""}
      ${pickupAddress ? `<p><strong>Pickup Location:</strong> ${pickupAddress}</p>` : ""}
      ${pickupPhone ? `<p><strong>Pickup Phone:</strong> ${pickupPhone}</p>` : ""}
      ${pickupMapUrl ? `<p><strong>Pickup Map:</strong> <a href="${pickupMapUrl}" target="_blank" rel="noreferrer">Open Pickup Map</a></p>` : ""}
      ${adminNote ? `<p><strong>Admin Update:</strong> ${adminNote}</p>` : ""}
    </div>
  `;

  try {
    await transporter.sendMail({
      from: mailFrom,
      to: customerEmail,
      subject,
      text,
      html,
    });
    result.customerSent = true;
  } catch (error) {
    result.errors.push(`Status email failed: ${error.message}`);
  }

  return result;
};

const sendBookingStatusWhatsApp = async (booking, previousStatus = "") => {
  const hasTwilioConfig = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM
  );

  const result = {
    configured: hasTwilioConfig,
    customerSent: false,
    errors: [],
  };

  if (!hasTwilioConfig) {
    result.errors.push(
      "WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM in serverdatabase/.env."
    );
    return result;
  }

  const customerPhone = normalizePhoneForWhatsApp(booking.phone);
  if (!customerPhone) return result;

  const message = buildStatusUpdateText(booking, previousStatus);

  try {
    await sendTwilioWhatsApp(customerPhone, message);
    result.customerSent = true;
  } catch (error) {
    result.errors.push(`Status WhatsApp failed: ${error.message}`);
  }

  return result;
};

const sendBookingStatusNotifications = async (booking, previousStatus = "") => {
  const [email, whatsapp] = await Promise.all([
    sendBookingStatusEmail(booking, previousStatus),
    sendBookingStatusWhatsApp(booking, previousStatus),
  ]);

  return { email, whatsapp };
};

module.exports = {
  sendBookingNotifications,
  sendBookingStatusEmail,
  sendBookingStatusNotifications,
};
