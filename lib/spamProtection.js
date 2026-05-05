import crypto from 'crypto';

export const SPAM_TOKEN_FIELD = 'spamToken';
export const SPAM_HONEYPOT_FIELD = 'website';

const DEFAULT_MIN_SUBMIT_MS = 2_500;
const DEFAULT_MAX_SUBMIT_MS = 2 * 60 * 60 * 1_000;
const DEFAULT_WINDOW_MS = 10 * 60 * 1_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_SESSION_KEY = 'spamProtection';

function normalizeIp(ip) {
    return String(ip || 'unknown').split(',')[0].trim() || 'unknown';
}

function hasHoneypotValue(body) {
    return String(body?.[SPAM_HONEYPOT_FIELD] || '').trim().length > 0;
}

function getFormChallenges(session, sessionKey, formName) {
    session[sessionKey] ||= {};
    session[sessionKey][formName] ||= {};
    return session[sessionKey][formName];
}

function pruneChallenges(challenges, currentTime, maxSubmitMs) {
    for (const [token, issuedAt] of Object.entries(challenges)) {
        if (currentTime - issuedAt > maxSubmitMs) {
            delete challenges[token];
        }
    }
}

export function createSpamProtection(options = {}) {
    const now = options.now || (() => Date.now());
    const tokenFactory = options.tokenFactory || (() => crypto.randomBytes(24).toString('hex'));
    const minSubmitMs = options.minSubmitMs ?? DEFAULT_MIN_SUBMIT_MS;
    const maxSubmitMs = options.maxSubmitMs ?? DEFAULT_MAX_SUBMIT_MS;
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const sessionKey = options.sessionKey || DEFAULT_SESSION_KEY;
    const attemptsByKey = new Map();

    function createChallenge(session, formName) {
        if (!session) {
            throw new Error('Spam protection needs an active session.');
        }

        const currentTime = now();
        const challenges = getFormChallenges(session, sessionKey, formName);
        pruneChallenges(challenges, currentTime, maxSubmitMs);

        const token = tokenFactory();
        challenges[token] = currentTime;

        return {
            token,
            tokenField: SPAM_TOKEN_FIELD,
            honeypotField: SPAM_HONEYPOT_FIELD,
        };
    }

    function recordAttempt(formName, ip, currentTime) {
        const key = `${formName}:${normalizeIp(ip)}`;
        const recentAttempts = (attemptsByKey.get(key) || []).filter((timestamp) => {
            return currentTime - timestamp < windowMs;
        });

        recentAttempts.push(currentTime);
        attemptsByKey.set(key, recentAttempts);

        return recentAttempts.length <= maxAttempts;
    }

    function verifySubmission({ session, formName, body = {}, ip }) {
        const currentTime = now();

        if (!recordAttempt(formName, ip, currentTime)) {
            return { ok: false, reason: 'rate_limited', status: 429 };
        }

        if (hasHoneypotValue(body)) {
            return { ok: false, reason: 'honeypot_filled', status: 400 };
        }

        const challenges = session?.[sessionKey]?.[formName];
        if (!challenges) {
            return { ok: false, reason: 'missing_challenge', status: 400 };
        }

        const token = String(body[SPAM_TOKEN_FIELD] || '');
        const issuedAt = challenges[token];

        if (typeof issuedAt !== 'number') {
            pruneChallenges(challenges, currentTime, maxSubmitMs);
            return { ok: false, reason: 'invalid_challenge', status: 400 };
        }

        delete challenges[token];

        const elapsedMs = currentTime - issuedAt;
        if (elapsedMs < minSubmitMs) {
            return { ok: false, reason: 'submitted_too_fast', status: 400 };
        }

        if (elapsedMs > maxSubmitMs) {
            return { ok: false, reason: 'challenge_expired', status: 400 };
        }

        pruneChallenges(challenges, currentTime, maxSubmitMs);
        return { ok: true };
    }

    return {
        createChallenge,
        verifySubmission,
    };
}
