const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { sequelize, models } = require('../src/db');

const CATEGORIES = [
  'Mind and Mindset', 'Spiritual', 'Technology', 'Personal Development', 'Leadership',
  'Career', 'Motivation', 'Productivity', 'Communication', 'Entrepreneurship'
];

const TALKS = [
  ['How great leaders inspire action', 'Simon Sinek', 'https://www.youtube.com/watch?v=qp0HIF3SfI4', ['Leadership', 'Motivation']],
  ['Why good leaders make you feel safe', 'Simon Sinek', 'https://www.youtube.com/watch?v=lmyZMtPVodo', ['Leadership']],
  ['The power of believing that you can improve', 'Carol Dweck', 'https://www.youtube.com/watch?v=_X0mgOOSpLU', ['Mind and Mindset', 'Personal Development']],
  ['Grit: the power of passion and perseverance', 'Angela Duckworth', 'https://www.youtube.com/watch?v=H14bBuluwB8', ['Mind and Mindset', 'Motivation']],
  ['The power of vulnerability', 'Brene Brown', 'https://www.youtube.com/watch?v=iCvmsMzlF7o', ['Personal Development', 'Communication']],
  ['How to make stress your friend', 'Kelly McGonigal', 'https://www.youtube.com/watch?v=RcGyVTAoXEU', ['Mind and Mindset']],
  ['Inside the mind of a master procrastinator', 'Tim Urban', 'https://www.youtube.com/watch?v=arj7oStGLkU', ['Productivity']],
  ['Quit social media', 'Cal Newport', 'https://www.youtube.com/watch?v=3E7hkPZ-HTk', ['Productivity']],
  ['How to speak so that people want to listen', 'Julian Treasure', 'https://www.youtube.com/watch?v=eIho2S0ZahI', ['Communication']],
  ['Your body language may shape who you are', 'Amy Cuddy', 'https://www.youtube.com/watch?v=Ks-_Mh1QhMc', ['Communication', 'Personal Development']],
  ['Why you will fail to have a great career', 'Larry Smith', 'https://www.youtube.com/watch?v=jqsMXYL7-ho', ['Career']],
  ['Stanford commencement address', 'Steve Jobs', 'https://www.youtube.com/watch?v=UF8uR6Z6KLc', ['Career', 'Motivation']],
  ['The single biggest reason why startups succeed', 'Bill Gross', 'https://www.youtube.com/watch?v=bNpx7gpSqbY', ['Entrepreneurship']],
  ['How to start a movement', 'Derek Sivers', 'https://www.youtube.com/watch?v=V74AxCqOTvg', ['Entrepreneurship', 'Leadership']],
  ['Simple made easy', 'Rich Hickey', 'https://www.youtube.com/watch?v=SxdOUGdseq4', ['Technology']],
  ['Inventing on principle', 'Bret Victor', 'https://www.youtube.com/watch?v=PUv66718DII', ['Technology']],
  ['What if money was no object', 'Alan Watts', 'https://www.youtube.com/watch?v=7sDhXUSN6Kc', ['Spiritual', 'Career']]
];

const keyOf = (url) => {
  const parsed = new URL(url);
  parsed.hash = '';
  return parsed.toString().toLowerCase().replace(/\/$/, '');
};

async function seedTalks() {
  const slug = String(process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends').toLowerCase();
  const org = await models.Organization.findOne({ where: { slug }, skipOrganizationScope: true });
  if (!org) throw new Error(`Organization "${slug}" not found. Run migrations first.`);
  const scope = { organizationId: org.id };
  const opts = { skipOrganizationScope: true };

  const byName = {};
  for (const name of CATEGORIES) {
    const nameKey = name.toLowerCase();
    const [row] = await models.TalkCategory.findOrCreate({
      where: { ...scope, nameKey },
      defaults: { ...scope, name, nameKey },
      ...opts
    });
    byName[name] = row;
  }

  let added = 0;
  for (const [title, speaker, url, cats] of TALKS) {
    const urlKey = keyOf(url);
    const [talk, created] = await models.Talk.findOrCreate({
      where: { ...scope, urlKey },
      defaults: { ...scope, title, speaker, url, urlKey },
      ...opts
    });
    if (!created) continue;
    await models.TalkCategoryLink.bulkCreate(cats.map((c) => ({ talkId: talk.id, categoryId: byName[c].id })));
    added += 1;
  }
  console.log(`Talks seed done: ${CATEGORIES.length} categories, ${added} new talks`);
}

seedTalks()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => sequelize.close());
