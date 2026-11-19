/**
 * Calling other people's servers safely (webhooks out, pull connectors in).
 *
 *  - https only (plain http only in local development, with
 *    WEBHOOKS_ALLOW_PRIVATE=true or OUTBOUND_ALLOW_PRIVATE=true)
 *  - never a private, loopback or link-local address — checked when the
 *    connection is made, so a DNS answer can't be switched to an internal
 *    address after the URL was checked
 *  - redirects are followed only on request, each hop checked again, and the
 *    credentials are dropped if a redirect leaves the original host
 *  - a time limit and a size limit on every response
 */
const dns = require('dns');
const net = require('net');
const http = require('http');
const https = require('https');
const { ValidationError } = require('./errors/errorTypes');

const allowInsecure = () => process.env.NODE_ENV !== 'production'
  && (process.env.WEBHOOKS_ALLOW_PRIVATE === 'true' || process.env.OUTBOUND_ALLOW_PRIVATE === 'true');

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || a >= 224;
  }
  const v = String(address).toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
  return v === '::' || v === '::1' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9')
    || v.startsWith('fea') || v.startsWith('feb') || v.startsWith('ff');
}

/** dns.lookup that refuses internal addresses — used for every connection. */
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }];
    const bad = list.find((a) => isPrivateAddress(a.address));
    if (bad && !allowInsecure()) return callback(new Error(`Refusing to call an internal address (${bad.address})`));
    const first = list[0];
    if (options.all) return callback(null, list);
    return callback(null, first.address, first.family);
  });
}

/**
 * A URL we may call, normalised — or a ValidationError saying why not.
 * `credentialsMessage` is what to say when someone puts user:pass in the URL.
 */
function checkUrl(raw, { credentialsMessage = 'Leave credentials out of the URL' } = {}) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new ValidationError('That is not a valid URL'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && allowInsecure())) throw new ValidationError('The URL must start with https://');
  if (url.username || url.password) throw new ValidationError(credentialsMessage);
  if (!allowInsecure() && (net.isIP(url.hostname) ? isPrivateAddress(url.hostname) : /^(localhost|.*\.local|.*\.internal)$/i.test(url.hostname))) {
    throw new ValidationError('The URL must be reachable on the public internet');
  }
  if (url.href.length > 2000) throw new ValidationError('The URL is too long');
  return url.href;
}

/** A failure talking to the other server, with a message fit to show an admin. */
class OutboundError extends Error {
  constructor(message, status = null) {
    super(message);
    this.status = status;
  }
}

/**
 * One request. Resolves { status, headers, body (text), ms, url (after redirects) }.
 * Rejects with an OutboundError on a network failure, a timeout or a response
 * over `maxBytes`. Non-2xx statuses resolve; the caller decides.
 */
function request(urlString, {
  method = 'GET', headers = {}, body = null, timeoutMs = 10_000, maxBytes = 1_000_000, maxRedirects = 0, truncate = false, secretHeaders = [],
} = {}) {
  const secret = new Set(['authorization', 'cookie', ...secretHeaders.map((h) => String(h).toLowerCase())]);
  const started = Date.now();
  const once = (target, hopHeaders, redirectsLeft) => new Promise((resolve, reject) => {
    let url;
    try { url = new URL(checkUrl(target)); } catch (e) { reject(new OutboundError(e.message)); return; }
    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(url, {
      method,
      headers: { 'Accept-Encoding': 'identity', ...hopHeaders, ...(body != null ? { 'Content-Length': Buffer.byteLength(body) } : {}) },
      timeout: timeoutMs,
      lookup: safeLookup,
    }, (res) => {
      const status = res.statusCode;
      if ([301, 302, 303, 307, 308].includes(status) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const next = new URL(res.headers.location, url);
        // Credentials only go to the host they were given for.
        const nextHeaders = next.host === url.host ? hopHeaders
          : Object.fromEntries(Object.entries(hopHeaders).filter(([k]) => !secret.has(k.toLowerCase())));
        once(next.href, nextHeaders, redirectsLeft - 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      let size = 0;
      let done = false;
      res.on('data', (chunk) => {
        if (done) return;
        size += chunk.length;
        if (size > maxBytes) {
          done = true;
          if (truncate) {
            chunks.push(chunk.subarray(0, chunk.length - (size - maxBytes)));
            res.destroy();
            resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - started, url: url.href });
          } else {
            res.destroy();
            reject(new OutboundError(`The response is larger than ${Math.round(maxBytes / 1_000_000)} MB`, status));
          }
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => {
        if (done) return;
        done = true;
        resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), ms: Date.now() - started, url: url.href });
      });
      res.on('error', (e) => { if (!done) { done = true; reject(new OutboundError(e.message, status)); } });
    });
    req.on('timeout', () => { req.destroy(new OutboundError(`No response within ${Math.round(timeoutMs / 1000)} seconds`)); });
    req.on('error', (e) => reject(e instanceof OutboundError ? e : new OutboundError(e.message)));
    req.end(body == null ? undefined : body);
  });
  return once(urlString, headers, maxRedirects);
}

module.exports = { allowInsecure, isPrivateAddress, safeLookup, checkUrl, request, OutboundError };
