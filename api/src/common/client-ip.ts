/**
 * The visitor's IP. Behind Cloudflare the real address is in CF-Connecting-IP; X-Forwarded-For
 * is not used because its first entry is whatever the client sent.
 */
export function clientIp(req: any): string | undefined {
  const cf = req.headers?.['cf-connecting-ip']
  if (typeof cf === 'string' && cf.trim()) return cf.trim()
  return req.socket?.remoteAddress || undefined
}
