export function ok(res, data = null, meta = undefined) {
  return res.json({ ok: true, data, ...(meta ? { meta } : {}) });
}

export function fail(res, status, message, code = undefined) {
  return res.status(status).json({
    ok: false,
    error: { message, ...(code ? { code } : {}) },
  });
}
