import nodemailer from "nodemailer";

const host = process.env.SMTPHOST || "smtp.example.com";
const port = Number(process.env.SMTPPORT) || 587;
const user = process.env.SMTPUSER || "user@example.com";
const pass = process.env.SMTPPASS || "password";

if (!host || !port || !user || !pass) {
    throw new Error("SMTP configuration is incomplete.");
}

const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
        user,
        pass,
    },
});

interface EmailOptions {
    to: string;
    subject: string;
    html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
    const mailOptions = {
        from: `"PRISM - PPA Benchmarking Platform" <${user}>`,
        to: options.to,
        subject: options.subject,
        html: options.html || "",
    };
    await transporter.sendMail(mailOptions);
}