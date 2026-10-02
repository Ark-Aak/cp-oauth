export interface ConfigValues {
    site_title: string;
    registration_enabled: string;
    home_recent_users_count: string;
    smtp_host: string;
    smtp_port: string;
    smtp_user: string;
    smtp_pass: string;
    smtp_from: string;
    turnstile_enabled: string;
    turnstile_site_key: string;
    turnstile_secret_key: string;
    codeforces_client_id: string;
    codeforces_client_secret: string;
    github_client_id: string;
    github_client_secret: string;
    google_client_id: string;
    google_client_secret: string;
    clist_client_id: string;
    clist_client_secret: string;
    username_refresh_cooldown: string;
}

export type ConfigKey = keyof ConfigValues;
export type SecretConfigKey =
    | 'smtp_pass'
    | 'turnstile_secret_key'
    | 'codeforces_client_secret'
    | 'github_client_secret'
    | 'google_client_secret'
    | 'clist_client_secret';
export type PublicConfigKey = Exclude<ConfigKey, SecretConfigKey>;

export interface AdminConfigResponse {
    values: Record<PublicConfigKey, string>;
    secrets: Record<SecretConfigKey, { configured: boolean }>;
}

export interface AdminConfigPatch {
    values?: Partial<Record<PublicConfigKey, string>>;
    secrets?: Partial<Record<SecretConfigKey, string>>;
    clearSecrets?: SecretConfigKey[];
}
