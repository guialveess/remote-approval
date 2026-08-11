'use strict';

const HARK_BASE_URL = 'https://hark.ryan.ceo/hooks';

/**
 * Send a Hark push notification for an approval request.
 *
 * @param {import('./store').Approval} approval
 * @returns {Promise<void>}
 */
async function sendHarkNotification(approval) {
  const token = process.env.HARK_WEBHOOK_TOKEN;
  if (!token) {
    console.warn('[hark] HARK_WEBHOOK_TOKEN is not set — skipping notification');
    return;
  }

  const serverUrl = process.env.SERVER_URL || '';
  const appDeepLink = process.env.APP_DEEP_LINK || 'remoteapproval://';
  const callbackSecret = process.env.CALLBACK_SECRET;

  if (!callbackSecret) {
    throw new Error('CALLBACK_SECRET must be set to send Hark notifications');
  }

  const { id, source, action, details } = approval;

  const body = {
    title: 'Remote Approval',
    body: `[${source}] ${action}: ${details.slice(0, 200)}`,
    url: `${appDeepLink}/approval/${id}`,
    response: {
      type: 'approval',
      expiration: 300,
      correlationId: id,
      webhook: {
        url: `${serverUrl}/callbacks/${id}`,
        method: 'POST',
        token: callbackSecret,
      },
    },
  };

  const url = `${HARK_BASE_URL}/${token}`;

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    throw new Error(`Hark request failed: ${err.message}`);
  }

  if (!res.ok) {
    let text = '';
    try {
      text = await res.text();
    } catch (_) {
      // ignore body read errors
    }
    throw new Error(`Hark returned ${res.status}: ${text}`);
  }
}

module.exports = { sendHarkNotification };
