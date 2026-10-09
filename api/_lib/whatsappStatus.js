// WhatsApp answers "accepted" (HTTP 200) to almost every send; whether it was really delivered is
// only reported later, as a webhook "status". Failures used to vanish without a trace — this is
// why OTP codes could silently not arrive. Only failures are logged, with the recipient reduced
// to its last four digits.

export const extractFailedStatuses = (body) => {
  const failures = [];
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const statuses = Array.isArray(change?.value?.statuses) ? change.value.statuses : [];
      for (const status of statuses) {
        if (status?.status !== 'failed') continue;
        const error = Array.isArray(status.errors) ? status.errors[0] : null;
        failures.push({
          code: error?.code ?? null,
          title: String(error?.title || error?.message || '').slice(0, 120),
          to: String(status.recipient_id || '').slice(-4)
        });
      }
    }
  }
  return failures;
};

export const logFailedStatuses = (body) => {
  for (const failure of extractFailedStatuses(body)) {
    console.error('[whatsapp-status] delivery failed', failure.code, failure.title, `to …${failure.to}`);
  }
};
