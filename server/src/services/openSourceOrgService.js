const { models, Sequelize, sequelize } = require('../db');
const { ValidationError } = require('../utils/errors/errorTypes');
const { Op } = Sequelize;

function normalizeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl.trim());
    const pathname = parsed.pathname.replace(/\/+$/, '');
    return `${parsed.protocol}//${parsed.host}${pathname}${parsed.search}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

async function list({ search } = {}) {
  const where = search ? { name: { [Op.iLike]: `%${search}%` } } : {};
  return models.OpenSourceOrg.findAll({ where, order: [['name', 'ASC']], limit: 50 });
}

async function findOrCreate({ name, url, userId }) {
  if (!name || !url) throw new ValidationError('name and url are required');

  const trimmedName = name.trim();
  const normUrl = normalizeUrl(url);

  const existing = await models.OpenSourceOrg.findOne({
    where: {
      [Op.or]: [
        sequelize.where(sequelize.fn('lower', sequelize.col('name')), trimmedName.toLowerCase()),
        sequelize.where(sequelize.fn('lower', sequelize.col('url')), normUrl.toLowerCase()),
        sequelize.where(sequelize.fn('lower', sequelize.col('url')), `${normUrl.toLowerCase()}/`),
      ]
    }
  });

  if (existing) return { org: existing, created: false };

  const org = await models.OpenSourceOrg.create({ name: trimmedName, url: normUrl, createdBy: userId });
  return { org, created: true };
}

async function searchGithubOrgs(query) {
  if (!query || !query.trim()) return [];
  const token = process.env.GITHUB_TOKEN;
  const headers = {
    'User-Agent': 'Pathment-App',
    'Accept': 'application/vnd.github+json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(query.trim())}+type:org&per_page=8`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((g) => ({
      id: null,
      name: g.login,
      url: g.html_url,
      avatar: g.avatar_url,
      source: 'github'
    }));
  } catch {
    return [];
  }
}

module.exports = { list, findOrCreate, searchGithubOrgs };

