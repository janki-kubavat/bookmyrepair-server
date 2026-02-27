const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

await resend.emails.send({
  from: "onboarding@resend.dev",
  to: booking.email,
  subject: subject,
  html: html,
});
