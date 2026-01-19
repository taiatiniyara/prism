import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !port || !user || !pass) {
        throw new Error("SMTP configuration is incomplete.");
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465, // true for 465, false for other ports
            auth: {
                user,
                pass,
            },
        });
    }

    return { transporter, user } as const;
}

interface EmailOptions {
    to: string;
    subject: string;
    html?: string;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
    const { transporter, user } = getTransporter();
    const mailOptions = {
        from: `"PRISM - PPA Benchmarking Platform" <${user}>`,
        to: options.to,
        subject: options.subject,
        html: options.html || "",
    };
    await transporter.sendMail(mailOptions);
}