/**
 * An applicant's public GitHub, read as evidence for the AI review.
 *
 * Applicants paste "github.com/someone" into a form field and the review used
 * to read that as text — a link proves nothing on its own. This looks it up:
 * how long the account has existed, what they have built, in which languages,
 * and how recently. Only PUBLIC data, from GitHub's public API, and nothing is
 * stored beyond a short in-memory cache.
 *
 * Never throws: a missing account, a rate limit or a timeout becomes one line
 * of text saying so, and the review carries on from the form alone.
 * `GITHUB_TOKEN` (optional) raises GitHub's rate limit from 60 to 5000 an hour.
 */

const TIMEOUT_MS = 6000;
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map(); // username → { at, lines }

// GitHub usernames: alphanumeric and single hyphens, up to 39 characters.
const NAME = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;
const RESERVED = new Set(['orgs', 'settings', 'login', 'about', 'features', 'topics', 'collections', 'marketplace', 'sponsors', 'apps']);

/**
 * The GitHub username in an applicant's answers: from a github.com link
 * anywhere, or from a field whose question mentions GitHub and whose answer
 * is a bare name ("@ada" or "ada").
 */
function findUsername(labelledLines = [], rawResponses = {}) {
  const texts = [...labelledLines, ...Object.values(rawResponses || {}).map((v) => (typeof v === 'string' ? v : JSON.stringify(v ?? '')))];
  for (const t of texts) {
    const m = String(t).match(/github\.com\/([A-Za-z\d-]{1,39})(?=[/?#\s"]|$)/i);
    if (m && NAME.test(m[1]) && !RESERVED.has(m[1].toLowerCase())) return m[1];
  }
  for (const line of labelledLines) {
    const m = String(line).match(/^([^:]*github[^:]*):\s*@?([A-Za-z\d-]{1,39})\s*$/i);
    if (m && NAME.test(m[2])) return m[2];
  }
  return null;
}

async function getJson(url) {
  const headers = { Accept: 'application/vnd.github+json', 'User-Agent': 'Pathment-AI-Review' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) return { missing: true };
  if (!res.ok) throw new Error(res.status === 403 || res.status === 429 ? 'rate limited' : `HTTP ${res.status}`);
  return res.json();
}

const yearsSince = (iso) => Math.max(0, (Date.now() - new Date(iso).getTime()) / (365.25 * 86400000));

/**
 * Plain-text lines describing the profile, for the prompt. The model may
 * quote these lines verbatim as evidence, so they state facts, not opinions.
 */
async function profileLines(username) {
  const hit = cache.get(username.toLowerCase());
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.lines;

  let lines;
  try {
    const user = await getJson(`https://api.github.com/users/${encodeURIComponent(username)}`);
    if (user.missing) {
      lines = [`GitHub user "${username}" does not exist.`];
    } else {
      const repos = await getJson(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=pushed&per_page=50&type=owner`);
      const own = Array.isArray(repos) ? repos.filter((r) => !r.fork) : [];
      const langs = {};
      for (const r of own) if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
      const topLangs = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, n]) => `${l} (${n})`);
      const recent90 = own.filter((r) => r.pushed_at && Date.now() - new Date(r.pushed_at).getTime() < 90 * 86400000).length;
      const recent365 = own.filter((r) => r.pushed_at && Date.now() - new Date(r.pushed_at).getTime() < 365 * 86400000).length;
      const stars = own.reduce((s, r) => s + (r.stargazers_count || 0), 0);
      const notable = [...own]
        .sort((a, b) => (b.stargazers_count || 0) - (a.stargazers_count || 0) || new Date(b.pushed_at) - new Date(a.pushed_at))
        .slice(0, 8)
        .map((r) => `- ${r.name}${r.language ? ` [${r.language}]` : ''}${r.stargazers_count ? `, ${r.stargazers_count} stars` : ''}, last pushed ${String(r.pushed_at || '').slice(0, 10)}${r.description ? `: ${String(r.description).slice(0, 140)}` : ''}${r.homepage ? ` (live: ${r.homepage})` : ''}`);
      lines = [
        `GitHub user: ${user.login}${user.name ? ` (${user.name})` : ''}`,
        `Account age: ${yearsSince(user.created_at).toFixed(1)} years (created ${String(user.created_at).slice(0, 10)})`,
        `Public repositories they own (not forks): ${own.length} of ${user.public_repos} public`,
        `Followers: ${user.followers}`,
        `Repositories pushed in the last 90 days: ${recent90}; in the last year: ${recent365}`,
        `Stars across their own repositories: ${stars}`,
        topLangs.length ? `Languages across their repositories: ${topLangs.join(', ')}` : 'Languages across their repositories: none detected',
        ...(user.bio ? [`Bio: ${String(user.bio).slice(0, 200)}`] : []),
        ...(notable.length ? ['Repositories (most starred / most recent):', ...notable] : ['No public repositories of their own.']),
      ];
    }
  } catch (error) {
    lines = [`GitHub profile "${username}" could not be read (${error.name === 'TimeoutError' ? 'timed out' : error.message}); judge from the form only.`];
    return lines; // not cached: a transient failure should be retried next time
  }
  cache.set(username.toLowerCase(), { at: Date.now(), lines });
  return lines;
}

/** The GitHub evidence block for an applicant, or null when they gave no GitHub. */
async function githubEvidence(labelledLines, rawResponses) {
  const username = findUsername(labelledLines, rawResponses);
  if (!username) return null;
  return { username, lines: await profileLines(username) };
}

module.exports = { githubEvidence, findUsername, _cache: cache };
