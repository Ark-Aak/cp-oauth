export type ReauthPurpose =
    | 'email_change'
    | 'password_change'
    | 'mfa_change'
    | 'passkey_add'
    | 'passkey_delete'
    | 'binding_change';
export type TwoFactorMethod = 'email_otp' | 'totp';
export type AuthResult =
    | { authenticated: true; redirect: string; verificationEmailSent?: boolean }
    | { requiresTwoFactor: true; method: TwoFactorMethod; challengeId: string; redirect: string }
    | { reauthToken: string; expiresIn: 300; purpose: ReauthPurpose; redirect: string }
    | { bound: true; redirect: string };
