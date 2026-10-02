import { consola } from 'consola';
import nodemailer, { type Transporter } from 'nodemailer';
import { getConfig } from './config';
import { getSafeRedirectTarget } from '~/utils/auth-redirect';

const logger = consola.withTag('mailer');

const smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_from'] as const;
type MailConfig = Record<(typeof smtpKeys)[number] | 'site_title', string>;
let activeTransport: { config: MailConfig; transporter: Transporter } | undefined;

function escapeHtml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

async function deliverMail(
    to: string,
    render: (siteTitle: string) => { subject: string; html: string }
): Promise<boolean> {
    try {
        const config = await getConfig(['site_title', ...smtpKeys]);
        if (!config.smtp_host || !config.smtp_user) {
            logger.warn('SMTP is not configured; email was not sent');
            return false;
        }
        if (
            !activeTransport ||
            smtpKeys.some(key => activeTransport!.config[key] !== config[key])
        ) {
            activeTransport?.transporter.close();
            activeTransport = {
                config,
                transporter: nodemailer.createTransport({
                    host: config.smtp_host,
                    port: Number(config.smtp_port),
                    secure: Number(config.smtp_port) === 465,
                    auth: { user: config.smtp_user, pass: config.smtp_pass },
                    connectionTimeout: 10_000,
                    greetingTimeout: 10_000,
                    socketTimeout: 20_000
                })
            };
        }

        await activeTransport.transporter.sendMail({
            from: config.smtp_from,
            to,
            ...render(config.site_title)
        });
        logger.success('Email sent');
        return true;
    } catch {
        // SMTP/config errors may contain recipients, credentials and message bodies.
        logger.error('Email delivery failed');
        return false;
    }
}

export function sendMail(to: string, subject: string, html: string): Promise<boolean> {
    return deliverMail(to, () => ({ subject, html }));
}

export function sendVerificationEmail(
    to: string,
    token: string,
    baseUrl: string,
    redirect = '/'
): Promise<boolean> {
    return deliverMail(to, siteTitle => {
        const url = new URL('/api/auth/verify', baseUrl);
        url.searchParams.set('token', token);
        url.searchParams.set('redirect', getSafeRedirectTarget(redirect));
        const verifyUrl = escapeHtml(url.toString());
        return {
            subject: `Verify your email — ${siteTitle}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #171717;">${escapeHtml(siteTitle)}</h2>
                    <p>Please verify your email address by clicking the link below:</p>
                    <p><a href="${verifyUrl}" style="color: #000; font-weight: 600;">${verifyUrl}</a></p>
                    <p style="color: #666; font-size: 13px;">This link expires in 24 hours. If you did not request this email, please ignore it.</p>
                </div>
            `
        };
    });
}

export function sendPasswordResetEmail(
    to: string,
    token: string,
    baseUrl: string,
    redirect = '/'
): Promise<boolean> {
    return deliverMail(to, siteTitle => {
        const url = new URL('/reset-password', baseUrl);
        url.searchParams.set('token', token);
        url.searchParams.set('redirect', getSafeRedirectTarget(redirect));
        const resetUrl = escapeHtml(url.toString());
        return {
            subject: `Reset your password — ${siteTitle}`,
            html: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                    <h2 style="color: #171717;">${escapeHtml(siteTitle)}</h2>
                    <p>You requested a password reset. Click the link below to continue:</p>
                    <p><a href="${resetUrl}" style="color: #000; font-weight: 600;">${resetUrl}</a></p>
                    <p style="color: #666; font-size: 13px;">This link expires in 30 minutes. If this wasn't you, ignore this email.</p>
                </div>
            `
        };
    });
}

export function sendTwoFactorEmailCode(to: string, code: string): Promise<boolean> {
    return deliverMail(to, siteTitle => ({
        subject: `Your verification code — ${siteTitle}`,
        html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                <h2 style="color: #171717;">${escapeHtml(siteTitle)}</h2>
                <p>Your one-time verification code is:</p>
                <p style="font-size: 24px; font-weight: 700; letter-spacing: 0.3em;">${escapeHtml(code)}</p>
                <p style="color: #666; font-size: 13px;">This code expires in 10 minutes.</p>
            </div>
        `
    }));
}
