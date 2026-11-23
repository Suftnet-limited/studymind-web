/** Where a scanned QR code / shared link lands. Override per environment with NEXT_PUBLIC_SITE_URL (staging, local). */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://ciquis.com').replace(/\/+$/, '');

/** Join codes are CIQ-XXXX, but lecturers may also use their own course codes (e.g. CSC109). Same charset the backend accepts. */
const JOIN_CODE = /^[A-Za-z0-9_-]{3,64}$/;

export const isJoinCode = (value: string) => JOIN_CODE.test(value);

export const joinUrl = (code: string) => `${SITE_URL}/join/${encodeURIComponent(code)}`;
