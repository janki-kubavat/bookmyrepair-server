const { Resend } = require("resend");
const resend = new Resend(process.env.re_hGYqjRmP_PT3uME3FttpDaSJiCPzqeQFj);

await resend.emails.send({
  from: "onboarding@resend.dev",
  to: booking.email,
  subject: subject,
  html: html,
});
