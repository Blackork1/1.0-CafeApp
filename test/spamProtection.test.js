import test from 'node:test';
import assert from 'node:assert/strict';

import { createSpamProtection } from '../lib/spamProtection.js';

test('accepts a real form submission after the minimum wait and consumes the challenge', () => {
    let now = 1_000;
    const spamProtection = createSpamProtection({
        now: () => now,
        tokenFactory: () => 'token-1',
        minSubmitMs: 2_000,
        maxSubmitMs: 60_000,
    });
    const session = {};

    const challenge = spamProtection.createChallenge(session, 'eventbuchung');
    now += 2_500;

    const result = spamProtection.verifySubmission({
        session,
        formName: 'eventbuchung',
        body: {
            spamToken: challenge.token,
            website: '',
        },
        ip: '203.0.113.10',
    });

    assert.equal(result.ok, true);

    const replay = spamProtection.verifySubmission({
        session,
        formName: 'eventbuchung',
        body: {
            spamToken: challenge.token,
            website: '',
        },
        ip: '203.0.113.10',
    });

    assert.equal(replay.ok, false);
    assert.equal(replay.reason, 'invalid_challenge');
});

test('rejects honeypot submissions and forms submitted too quickly', () => {
    let now = 10_000;
    const spamProtection = createSpamProtection({
        now: () => now,
        tokenFactory: () => `token-${now}`,
        minSubmitMs: 2_000,
    });
    const session = {};

    const honeypotChallenge = spamProtection.createChallenge(session, 'tischreservierung');
    now += 3_000;
    const honeypot = spamProtection.verifySubmission({
        session,
        formName: 'tischreservierung',
        body: {
            spamToken: honeypotChallenge.token,
            website: 'https://spam.example',
        },
        ip: '203.0.113.20',
    });

    assert.equal(honeypot.ok, false);
    assert.equal(honeypot.reason, 'honeypot_filled');

    const quickChallenge = spamProtection.createChallenge(session, 'tischreservierung');
    now += 500;
    const tooQuick = spamProtection.verifySubmission({
        session,
        formName: 'tischreservierung',
        body: {
            spamToken: quickChallenge.token,
            website: '',
        },
        ip: '203.0.113.20',
    });

    assert.equal(tooQuick.ok, false);
    assert.equal(tooQuick.reason, 'submitted_too_fast');
});

test('rate limits repeated submissions from the same ip and form', () => {
    let now = 50_000;
    let token = 0;
    const spamProtection = createSpamProtection({
        now: () => now,
        tokenFactory: () => `token-${++token}`,
        minSubmitMs: 0,
        windowMs: 60_000,
        maxAttempts: 2,
    });
    const session = {};

    for (let i = 0; i < 2; i++) {
        const challenge = spamProtection.createChallenge(session, 'eventbuchung');
        const result = spamProtection.verifySubmission({
            session,
            formName: 'eventbuchung',
            body: {
                spamToken: challenge.token,
                website: '',
            },
            ip: '203.0.113.30',
        });

        assert.equal(result.ok, true);
    }

    const blockedChallenge = spamProtection.createChallenge(session, 'eventbuchung');
    const blocked = spamProtection.verifySubmission({
        session,
        formName: 'eventbuchung',
        body: {
            spamToken: blockedChallenge.token,
            website: '',
        },
        ip: '203.0.113.30',
    });

    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'rate_limited');
});
