/**
 * Qantara Fellowship: the six-month roadmap, one chained roadmap per month.
 *
 *   Month 1  Basics                         (resources: Full Stack Engineering Roadmap sheet)
 *   Month 2  Multi-vendor marketplace       (resources: the Edorax course)
 *   Month 3  DevOps, AI and system design   (resources to be added)
 *   Month 4  Large project, part 1
 *   Month 5  Large project, part 2
 *   Month 6  Interview prep
 *
 * Sources: "Qantara Fellowship, six months from fundamentals to employment"
 * (the programme plan) and "Full Stack Engineering Roadmap: JS to Multi-Vendor
 * Marketplace" (months 1 and 2, with their resources).
 *
 * Built through the same service the admin Roadmaps page uses
 * (createOrgRoadmap, setNextLinks), so the result is exactly what an admin would
 * have made by hand: org roadmaps, published, in the programme's library, each
 * linked to the next. Finishing a month (the mentor approves its last step)
 * assigns the next month automatically.
 *
 * Steps are handed out one at a time (the next is assigned when the current one
 * is submitted), so each step's due offset is that step's own length; a week's
 * steps add up to seven days.
 *
 * Safe to run twice: if all six months already exist it only makes sure they are
 * chained; if only some exist it stops without writing anything.
 *
 * Preview: node scripts/build-qantara-roadmap.js --program "<name or id>" --dry-run
 * Run:     node scripts/build-qantara-roadmap.js --program "<name or id>"
 * Options: --workspace <slug>   (default: devweekends)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { Op } = require('sequelize');
const { models, sequelize } = require('../src/db');
const { runWithRequestContext } = require('../src/utils/auditContext');

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const DRY_RUN = process.argv.includes('--dry-run');

// ── Small HTML helpers (step descriptions render as rich text) ──────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const p = (s) => `<p>${s}</p>`;
const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const h = (s) => `<p><strong>${esc(s)}</strong></p>`;

// ── Resources ───────────────────────────────────────────────────────────────
const EDORAX_MARKETPLACE = { title: 'Edorax: Multi-vendor Marketplace course', url: 'https://www.edorax.com/courses/multi-vendor-marketplace', resourceType: 'course' };
const R = {
  jsBasics: { title: 'JS Tutorial for Beginners', url: 'https://youtu.be/XIOLqoPHCJ4?si=8SBR7bB03tprOU5A' },
  jsAdvanced: { title: 'Advanced JS', url: 'https://youtu.be/R9I85RhI7Cg?si=1HdTd2VCRNF5pjPr' },
  jsAsync: { title: 'Async JS', url: 'https://youtu.be/exBgWAIeIeg?si=5hxSSgSrr6WNa_QC' },
  git: { title: 'Git & GitHub Full Course', url: 'https://youtu.be/mAFoROnOfHs?si=ToXDVqnO2TfLa0O7' },
  node: { title: 'Node.js crash course', url: 'https://youtu.be/32M1al-Y6Ag?si=GoXwfBby0116IroE' },
  express: { title: 'Express.js', url: 'https://youtu.be/CnH3kAXSrmU?si=cAbeVtrc0Dc8KYtz' },
  reactBasics: { title: 'React Beginners Track (playlist)', url: 'https://www.youtube.com/playlist?list=PLC3y8-rFHvwg9D7EOSEBabuutIdKZN5V3' },
  reactMini: { title: 'React JS Project: Responsive Tour and Travel Website (Beginner)', url: 'https://www.youtube.com/results?search_query=React+JS+Project+Responsive+Tour+Travel+Website+Beginner' },
  reactHooks: { title: 'React 15 Projects, hooks-based (pick the smaller ones)', url: 'https://youtu.be/5ZdHfJVAY-s?si=Pm3sapLjBZobOhxa' },
  mongo: { title: 'MongoDB manual', url: 'https://www.mongodb.com/docs/manual/', resourceType: 'document' },
  mernCrud: { title: 'MERN Stack CRUD Operations: full walkthrough', url: 'https://youtu.be/enOsPhp2Z6Q?si=mBWP4hRN48b_5kpR' },
  mernAuth: { title: 'MERN Auth', url: 'https://youtu.be/7BTsepZ9xp8?si=FC4nZgfK6-Cvc5cT' },
};

// ── The weekly rhythm, shared by every month ────────────────────────────────
const rhythm = ({ friday, saturday, thursdayTheme, softSkills }) => [
  h('How each week runs:'),
  ul([
    `<strong>Weekdays:</strong> 1 to 1.5 hours of soft skills (${esc(softSkills)}). The rest of the day is technical work.`,
    '<strong>Thursday:</strong> group discussion with your group of 7 and its mentor (1 hour), then build.',
    `<strong>Friday:</strong> partner special topic (1 hour), then ${friday}.`,
    `<strong>Saturday:</strong> ${saturday}`,
    '<strong>Sunday:</strong> reading and a lab, 2 hours. The rest of the day is free.',
  ]),
  p(`<strong>Thursday theme this month:</strong> ${esc(thursdayTheme)}.`),
].join('');

const ARTICLE = 'This week’s article is published on your personal site and shared on Medium, dev.to, daily.dev, LinkedIn, X, Hashnode and Substack (link it)';
const PRS = 'Work merged through pull requests, each one reviewed by your mentor';

/**
 * The weekly check-in for the interview months (1 and 3): the Edorax interview
 * that assesses the week, plus the article. Kept as its own step so a mentor can
 * see each week's score in one place rather than hunting through the builds.
 */
const interviewWeek = (week, topic, { dsa = false, last = [] } = {}) => ({
  title: `Week ${week}: Edorax interview and article`,
  type: 'assignment',
  difficulty: 'medium',
  effort: 's',
  dueOffsetDays: 1,
  description: [
    p(`Friday ends with the Edorax interview on this week’s topic: <strong>${esc(topic)}</strong>. Work through the interview guides and the learning labs first; everything you need to pass is in the guides.`),
    p('Saturday is your second attempt: work on the gaps from Friday and retake it to improve your score.'),
    p('Saturday is also article day: one hour to write up what you learned this week.'),
  ].join(''),
  deliverable: 'Your Edorax interview score (screenshot or link) and the link to this week’s article',
  criteria: [
    `Edorax interview on ${topic} taken, with the final score shared`,
    ARTICLE,
    ...(dsa ? ['DSA practice for the week logged: the problems you solved'] : []),
    ...last,
  ],
});

// ── Month 1 ────────────────────────────────────────────────────────────────
const MONTH_1 = {
  name: 'Qantara Month 1: Basics',
  skillTags: ['javascript', 'git', 'nodejs', 'express', 'react', 'mongodb', 'mern'],
  description: [
    p('Month 1 of 6 of the Qantara Fellowship. From JavaScript to a complete MERN application.'),
    ul([
      '<strong>Goal:</strong> a deployed Expense Tracker, built with the full MERN stack.',
      '<strong>How it is taught:</strong> video tutorials, one area a week.',
      '<strong>Assessed by:</strong> the weekly Edorax interview.',
      '<strong>Ends with:</strong> the Expense Tracker live and all four weekly interviews done. Finishing this month starts Month 2.',
    ]),
    rhythm({
      friday: 'the labs, then the Edorax interview',
      saturday: 'tech talk on the week’s topic, then the article (1 hour), then labs and a second interview attempt to improve your score.',
      thursdayTheme: 'How to learn fast and ask good questions',
      softSkills: 'Communication, then Professional and Business Communication',
    }),
  ].join(''),
  steps: [
    // Week 1: JavaScript and Git
    {
      title: 'Week 1: JavaScript basics', type: 'video', difficulty: 'easy', effort: 'm', dueOffsetDays: 2,
      description: p('Functions, arrays, objects, the DOM and events. Code along with the video rather than only watching it.'),
      deliverable: 'A GitHub repo with small DOM exercises (for example a counter, a to-do list or a quiz)',
      criteria: ['Uses functions, arrays and objects comfortably', 'Selects DOM elements and handles events', 'At least two small interactive exercises pushed to GitHub'],
      resources: [R.jsBasics],
    },
    {
      title: 'Week 1: Advanced JavaScript', type: 'video', difficulty: 'medium', effort: 'm', dueOffsetDays: 2,
      description: p('ES6+ syntax, modules and prototypes.'),
      deliverable: 'A GitHub repo with your code-along exercises',
      criteria: ['Uses destructuring, spread, arrow functions and template literals', 'Splits code into ES modules with import and export', 'Can explain how prototypes and classes relate'],
      resources: [R.jsAdvanced],
    },
    {
      title: 'Week 1: Async JavaScript', type: 'video', difficulty: 'medium', effort: 's', dueOffsetDays: 1,
      description: p('Promises, async/await and fetch.'),
      deliverable: 'A small page that fetches data from a public API and shows it, pushed to GitHub',
      criteria: ['Uses fetch with async/await', 'Handles loading and error states', 'Can explain the difference between callbacks, promises and async/await'],
      resources: [R.jsAsync],
    },
    {
      title: 'Week 1: Git and GitHub', type: 'assignment', difficulty: 'easy', effort: 's', dueOffsetDays: 1,
      description: p('Commits, branches, and pushing a repository. From now on every piece of work lives on GitHub.'),
      deliverable: 'A GitHub repo showing a clear commit history and a branch merged through a pull request',
      criteria: ['Meaningful commit messages', 'At least one feature branch merged through a pull request', 'README explaining what the repo contains'],
      resources: [R.git],
    },
    interviewWeek(1, 'JavaScript'),

    // Week 2: Node.js and Express
    {
      title: 'Week 2: Node.js', type: 'video', difficulty: 'medium', effort: 'm', dueOffsetDays: 2,
      description: p('npm, modules, the event loop and a basic HTTP server.'),
      deliverable: 'A GitHub repo with a basic Node.js HTTP server',
      criteria: ['Initialises a project with npm and uses packages', 'Can explain the event loop', 'A server that answers at least two routes'],
      resources: [R.node],
    },
    {
      title: 'Week 2: Express', type: 'video', difficulty: 'medium', effort: 'm', dueOffsetDays: 2,
      description: p('Routes, middleware and a CRUD API.'),
      deliverable: 'A GitHub repo with an Express CRUD API (in memory is fine this week)',
      criteria: ['Create, read, update and delete routes', 'At least one custom middleware (for example logging or validation)', 'Sensible status codes and error responses'],
      resources: [R.express],
    },
    {
      title: 'Week 2: Database fundamentals', type: 'reading', difficulty: 'easy', effort: 's', dueOffsetDays: 2,
      description: p('The ideas behind every database you will use: tables and documents, keys, relationships, indexes, and how create, read, update and delete map to queries. This prepares you for MongoDB next week.'),
      deliverable: 'Short notes (in a repo or a document) explaining the core database ideas in your own words',
      criteria: ['Explains the difference between SQL and document databases', 'Explains primary keys, relationships and indexes', 'Sketches the data model for an expense tracker'],
      resources: [],
    },
    interviewWeek(2, 'Node.js and Express'),

    // Week 3: React and MongoDB
    {
      title: 'Week 3: React basics', type: 'video', difficulty: 'medium', effort: 'm', dueOffsetDays: 2,
      description: p('Components, props, state, effects and forms.'),
      deliverable: 'A GitHub repo with a small React app using state, effects and a form',
      criteria: ['Builds components that take props', 'Manages state with useState and side effects with useEffect', 'A controlled form'],
      resources: [R.reactBasics],
    },
    {
      title: 'Week 3: React mini-project', type: 'project', difficulty: 'easy', effort: 's', dueOffsetDays: 1,
      description: p('Practise reusable components and a responsive UI.'),
      deliverable: 'A deployed demo URL and the GitHub repo',
      criteria: ['Reusable components', 'Works on a phone and a laptop'],
      resources: [R.reactMini],
    },
    {
      title: 'Week 3: React hooks projects', type: 'project', difficulty: 'medium', effort: 's', dueOffsetDays: 1,
      description: p('Practise hooks and API calls. Pick the smaller examples; the point is practice, not finishing all of them.'),
      deliverable: 'A GitHub repo with the hooks projects you built',
      criteria: ['At least two small apps that call an API', 'Custom hook used at least once'],
      resources: [R.reactHooks],
    },
    {
      title: 'Week 3: MongoDB and Mongoose', type: 'reading', difficulty: 'medium', effort: 's', dueOffsetDays: 1,
      description: p('Connect a database, build models and save expenses.'),
      deliverable: 'Your Express API from week 2 now saving expenses to MongoDB with Mongoose',
      criteria: ['Connects to MongoDB (Atlas or local)', 'An Expense model with validation', 'CRUD routes read and write the database'],
      resources: [R.mongo],
    },
    {
      title: 'Week 3: MERN CRUD example', type: 'video', difficulty: 'medium', effort: 's', dueOffsetDays: 1,
      description: p('Study a full-stack CRUD app end to end: how the React client talks to the Express API and the database.'),
      deliverable: 'Notes or a code-along repo of the full-stack CRUD flow',
      criteria: ['Can trace a request from a React button to the database and back'],
      resources: [R.mernCrud],
    },
    interviewWeek(3, 'databases (MongoDB) and React', { last: [] }),

    // Week 4: the MERN Expense Tracker
    {
      title: 'Week 4: Expense Tracker, full MERN CRUD', type: 'project', difficulty: 'medium', effort: 'l', dueOffsetDays: 3,
      description: p('Build the Expense Tracker UI and connect it to your API and MongoDB.'),
      deliverable: 'The Expense Tracker GitHub repo with the full CRUD flow working locally',
      criteria: ['Add, list, edit and delete expenses from the UI', 'Totals or a simple summary of spending', 'Errors are shown to the user, not swallowed', PRS],
      resources: [R.mernCrud],
    },
    {
      title: 'Week 4: Expense Tracker, authentication and deploy', type: 'project', difficulty: 'medium', effort: 'l', dueOffsetDays: 3,
      description: p('Add a basic login, then deploy the frontend and the backend.'),
      deliverable: 'The live Expense Tracker URL and its GitHub repo',
      criteria: ['Sign up and log in; each user sees only their own expenses', 'Frontend and backend deployed and talking to each other', 'README with setup steps and the live link'],
      resources: [R.mernAuth],
    },
    interviewWeek(4, 'the MERN app', {
      last: ['Month 1 complete: the Expense Tracker is live and all four weekly interviews are done'],
    }),
  ],
};

// ── Month 2 ────────────────────────────────────────────────────────────────
const marketplaceWeek = (week, title, what, criteria, extra = {}) => ({
  title: `Week ${week}: ${title}`,
  type: 'project',
  difficulty: extra.difficulty || 'hard',
  effort: 'xl',
  dueOffsetDays: 7,
  description: [
    p(`${what} Follow the Edorax Multi-vendor Marketplace course, one course week per week.`),
    p('Your marketplace is your own variant: its own use case and design. Build it, do not copy the reference.'),
    ...(extra.note ? [p(extra.note)] : []),
  ].join(''),
  deliverable: extra.deliverable || 'Your marketplace repo with this week’s work merged through reviewed pull requests',
  criteria: [...criteria, PRS, ARTICLE],
  resources: [EDORAX_MARKETPLACE],
});

const MONTH_2 = {
  name: 'Qantara Month 2: Multi-vendor marketplace',
  skillTags: ['mern', 'react', 'nodejs', 'mongodb', 'architecture', 'marketplace'],
  description: [
    p('Month 2 of 6 of the Qantara Fellowship. Each fellow builds a multi-vendor marketplace with a variant, use case and design of their own.'),
    ul([
      '<strong>Goal:</strong> a live marketplace, unique to you.',
      '<strong>How it is taught:</strong> the Edorax Multi-vendor Marketplace course, one course week per week, with videos for the most important areas.',
      '<strong>Assessed by:</strong> whether the project works and ships, your mentor’s reviews of your pull requests, and the Loom demo.',
      '<strong>Ends with:</strong> the marketplace live and the Loom demo submitted here on Pathment. Finishing this month starts Month 3.',
    ]),
    rhythm({
      friday: 'project build',
      saturday: 'tech talk (software architecture in weeks 5 to 7, Docker in week 8), then the article (1 hour), then labs.',
      thursdayTheme: 'Reading a large codebase without getting lost',
      softSkills: 'Cause, Effect and Systems Thinking, then How to Write Good Articles',
    }),
  ].join(''),
  steps: [
    marketplaceWeek(5, 'Marketplace foundations', 'Choose your unique variant and design, then set up the project, the data models and the roles.', [
      'Your variant, use case and design agreed with your mentor before you build',
      'Project set up with a clear structure (client and server)',
      'Data models for users, vendors, products and orders',
      'Roles in place: buyer, seller and admin',
    ], { difficulty: 'medium' }),
    marketplaceWeek(6, 'Seller experience', 'Seller registration, the seller dashboard and product management.', [
      'A seller can register and log in',
      'Seller dashboard showing their own products and orders',
      'Product create, edit and delete, limited to the seller’s own products',
    ]),
    marketplaceWeek(7, 'Buyer experience', 'Catalog, product details, cart, checkout and orders.', [
      'Catalog with search or filters, and a product details page',
      'Cart and checkout',
      'Orders created and visible to both the buyer and the seller',
    ]),
    marketplaceWeek(8, 'Finish and deploy', 'Test, fix issues, deploy, and submit the repo with a Loom demo.', [
      'Main flows tested and the known bugs fixed',
      'Deployed and working at a public URL',
      'README with setup steps, architecture notes and the live link',
      'A Loom demo walking through the buyer and seller journeys',
    ], { deliverable: 'The live marketplace URL, the GitHub repo and the Loom demo link', note: 'Saturday’s talk this week is Docker, ahead of Month 3.' }),
  ],
};

// ── Month 3 ────────────────────────────────────────────────────────────────
// Resources for this month will be added later; the steps carry the full brief.
const MONTH_3 = {
  name: 'Qantara Month 3: DevOps, AI and system design',
  skillTags: ['docker', 'ci-cd', 'aws', 'llm', 'rag', 'ai-agents', 'system-design', 'dsa'],
  description: [
    p('Month 3 of 6 of the Qantara Fellowship. Shipping the marketplace properly, then adding AI to it, then planning your large project.'),
    ul([
      '<strong>Goal:</strong> the marketplace on AWS with CI/CD, RAG search and an agent; your large project planned and approved.',
      '<strong>How it is taught:</strong> Edorax courses and labs, with much tested on LocalStack.',
      '<strong>Assessed by:</strong> the weekly Edorax interview.',
      '<strong>Runs in parallel:</strong> system design, all month. DSA starts this month: a few problems every week.',
      '<strong>Ends with:</strong> an approved plan for your large project. Approving it starts Month 4.',
    ]),
    rhythm({
      friday: 'the labs, then the Edorax interview',
      saturday: 'tech talk on the week’s topic, then the article (1 hour), then labs and a second interview attempt to improve your score.',
      thursdayTheme: 'Shipping and building with AI',
      softSkills: 'Ownership and Initiative, then Think Clearly',
    }),
  ].join(''),
  steps: [
    {
      title: 'Week 9: Docker and CI/CD', type: 'project', difficulty: 'medium', effort: 'l', dueOffsetDays: 6,
      description: [
        p('Containerise your work and automate how it ships.'),
        ul(['Deploy your personal blog with Docker on a free cloud.', 'Add a CI/CD pipeline to the marketplace that builds and tests every pull request.']),
      ].join(''),
      deliverable: 'The personal blog’s live URL, its Dockerfile, and a link to the marketplace’s passing pipeline',
      criteria: ['Personal blog runs from a Docker image on a free cloud', 'A Dockerfile (and compose file if needed) for the marketplace', 'CI runs the build and tests on every pull request'],
      resources: [],
    },
    interviewWeek(9, 'Docker and CI/CD', { dsa: true }),
    {
      title: 'Week 10: AWS', type: 'project', difficulty: 'hard', effort: 'l', dueOffsetDays: 6,
      description: p('Put the marketplace on AWS, deployed by your pipeline. Practise the services on LocalStack first, then use real AWS where credits allow.'),
      deliverable: 'The marketplace running on AWS (or on LocalStack where AWS is not available yet), with the deployment described in the README',
      criteria: ['Core services understood and used: compute, storage (S3) and the database', 'Deployment runs from the CI/CD pipeline, not by hand', 'Secrets kept out of the repo', 'README explains the AWS setup'],
      resources: [],
    },
    interviewWeek(10, 'AWS', { dsa: true }),
    {
      title: 'Week 11: LLMs and RAG', type: 'project', difficulty: 'hard', effort: 'l', dueOffsetDays: 6,
      description: p('How large language models work, and retrieval-augmented generation (RAG): embeddings, a vector store, retrieval and grounded answers. Add RAG search to the marketplace.'),
      deliverable: 'RAG search working in your marketplace, with a short write-up of how it works',
      criteria: ['Products (or their descriptions) embedded and stored in a vector store', 'Search answers questions using the retrieved products', 'Answers are grounded: no made-up products'],
      resources: [],
    },
    interviewWeek(11, 'LLMs and RAG', { dsa: true }),
    {
      title: 'Week 12: AI agent', type: 'project', difficulty: 'hard', effort: 'l', dueOffsetDays: 4,
      description: p('Agents: a model that plans and calls tools. Add an agent to the marketplace, for example a shopping assistant for buyers or a helper for sellers.'),
      deliverable: 'An AI agent working in your marketplace, with a short demo',
      criteria: ['The agent uses at least two tools (for example product search and the cart)', 'Handles failures and says when it cannot help', 'Demo shows a real task done end to end'],
      resources: [],
    },
    interviewWeek(12, 'agents', { dsa: true }),
    {
      title: 'Week 12: Large project plan', type: 'assignment', difficulty: 'medium', effort: 'm', dueOffsetDays: 2,
      description: [
        p('Plan the individual AI-powered product you will build in months 4 and 5 and put in front of real users. Your mentor approves the plan before Month 4 starts.'),
        ul(['The problem and who has it', 'Who your first five users will be', 'The main user journey and the MVP scope', 'The AI feature and why it needs AI', 'Architecture, data model and stack', 'A week-by-week plan for weeks 13 to 20']),
      ].join(''),
      deliverable: 'Your project plan document (link)',
      criteria: ['The problem and the target users are specific', 'MVP scope fits in four weeks', 'The AI feature is clear and useful', 'Architecture and stack chosen, with reasons', 'Plan approved by your mentor'],
      resources: [],
    },
  ],
};

// ── Months 4 and 5: the large project ───────────────────────────────────────
const projectWeek = (week, title, what, criteria, extra = {}) => ({
  title: `Week ${week}: ${title}`,
  type: 'project',
  difficulty: extra.difficulty || 'hard',
  effort: 'xl',
  dueOffsetDays: 7,
  description: [p(what), ...(extra.talk ? [p(`Saturday: a 2-hour lab, then the talk on <strong>${esc(extra.talk)}</strong>, then the article (1 hour), then the project.`)] : [])].join(''),
  deliverable: extra.deliverable || 'This week’s work merged through reviewed pull requests, with a short progress note',
  criteria: [...criteria, PRS, ARTICLE],
  resources: [],
});

const MONTH_4 = {
  name: 'Qantara Month 4: Large project, part 1',
  skillTags: ['product', 'architecture', 'ai', 'full-stack', 'users'],
  description: [
    p('Month 4 of 6 of the Qantara Fellowship. You build your own AI-powered project, from the plan approved in Month 3, and put it in front of real users.'),
    ul([
      '<strong>Goal:</strong> a working first version of your project, used by five real people.',
      '<strong>How it is taught:</strong> building, with a project-focused weekly meeting.',
      '<strong>Assessed by:</strong> whether the project works and ships, your mentor’s reviews of your pull requests, and the Loom demo.',
      '<strong>Ends with:</strong> a first version used by five real users and a Loom demo. Finishing this month starts Month 5.',
    ]),
    rhythm({
      friday: 'project build',
      saturday: 'a 2-hour lab, then the tech talk, then the article (1 hour), then the project.',
      thursdayTheme: 'Scope, trade-offs and real users',
      softSkills: 'Decision-Making, then Collaboration and Conflict',
    }),
  ].join(''),
  steps: [
    projectWeek(13, 'Foundation', 'Set the project up to last: repository, structure, data model, authentication, CI, and a deployed skeleton.', [
      'Repo and project structure in place, with a README',
      'Data model and authentication working',
      'CI runs on every pull request',
      'A skeleton deployed at a public URL',
    ], { talk: 'software architecture and working in teams', difficulty: 'medium' }),
    projectWeek(14, 'Main user journey', 'Build the one journey your users came for, end to end.', [
      'The main user journey works from start to finish',
      'Real data, not placeholders',
      'Deployed after each merge',
    ], { talk: 'DevOps tools and AWS' }),
    projectWeek(15, 'The AI feature', 'Build the AI feature from your plan into the main journey.', [
      'The AI feature works inside the main journey',
      'Handles bad or empty model output gracefully',
      'Costs and limits considered (rate limits, token use)',
    ], { talk: 'RabbitMQ and microservices' }),
    projectWeek(16, 'First version and first users', 'Ship the first version and get it used by five real people. Collect their feedback.', [
      'First version live at a public URL',
      'Used by at least five real users (who they are and how they used it)',
      'Their feedback written down for Month 5',
      'A Loom demo of the first version',
    ], { talk: 'DevOps and AI agents', deliverable: 'The live URL, the Loom demo link, and your notes on the five users and their feedback' }),
  ],
};

const MONTH_5 = {
  name: 'Qantara Month 5: Large project, part 2',
  skillTags: ['production', 'security', 'testing', 'performance', 'monitoring', 'ai'],
  description: [
    p('Month 5 of 6 of the Qantara Fellowship. You bring your project to production standard.'),
    ul([
      '<strong>Goal:</strong> the project in production, with a case study and a showcase.',
      '<strong>How it is taught:</strong> building, with a project-focused weekly meeting.',
      '<strong>Assessed by:</strong> whether the project works and ships, your mentor’s reviews of your pull requests, and the Loom demo.',
      '<strong>Ends with:</strong> a production release and a showcase. Finishing this month starts Month 6.',
    ]),
    rhythm({
      friday: 'project build',
      saturday: 'a 2-hour lab, then the tech talk, then the article (1 hour), then the project.',
      thursdayTheme: 'What breaks in production and why',
      softSkills: 'Your Career Brand, then How to Plan and Structure Your Thinking',
    }),
  ].join(''),
  steps: [
    projectWeek(17, 'Feedback and AI improvement', 'Act on your first users’ feedback and make the AI feature better.', [
      'The most important feedback from Month 4 addressed',
      'The AI feature measurably better (show before and after)',
    ], { talk: 'AI agents in production' }),
    projectWeek(18, 'Security and testing', 'Make the project safe and prove it works.', [
      'Inputs validated, and authentication and authorisation checked',
      'Secrets out of the code, dependencies up to date',
      'Automated tests for the main journey, running in CI',
      'AI guardrails for unsafe or off-topic requests',
    ], { talk: 'AI in production: evaluation and guardrails' }),
    projectWeek(19, 'Performance and monitoring', 'Make it fast and know when it breaks.', [
      'Slow pages or queries found and fixed',
      'Error tracking and logging in production',
      'Uptime or health monitoring with alerts',
    ], { talk: 'system design' }),
    projectWeek(20, 'Release and showcase', 'Release to production, write the case study and present it.', [
      'Production release live',
      'A case study on your personal site: the problem, decisions, results and what you learned',
      'Presented at the showcase',
      'A Loom demo of the production release',
    ], { talk: 'AWS solution architecture', deliverable: 'The production URL, the case study link and the Loom demo link' }),
  ],
};

// ── Month 6 ────────────────────────────────────────────────────────────────
const careerWeek = (week, title, what, criteria, deliverable) => ({
  title: `Week ${week}: ${title}`,
  type: 'assignment',
  difficulty: 'medium',
  effort: 'l',
  dueOffsetDays: 7,
  description: [p(what), p('Keep building your project alongside: fix what users report, and add skills that match the jobs you are applying for.')].join(''),
  deliverable,
  criteria: [...criteria, ARTICLE],
  resources: [],
});

const MONTH_6 = {
  name: 'Qantara Month 6: Interview prep',
  skillTags: ['interviews', 'career', 'cv', 'freelancing'],
  description: [
    p('Month 6 of 6 of the Qantara Fellowship. Interview preparation and job applications.'),
    ul([
      '<strong>Goal:</strong> four mock interviews, 25 applications and a hiring-partner showcase.',
      '<strong>How it is taught:</strong> mock interviews, case studies, and sessions led by career partners.',
      '<strong>Assessed by:</strong> mock interviews and tracked applications.',
      '<strong>Ends with:</strong> four mock interviews, 25 applications, the hiring-partner showcase and the career fair.',
    ]),
    rhythm({
      friday: 'interview prep and project build',
      saturday: 'a talk on the fellows’ weakest areas, then the article (1 hour), then interview prep and project build.',
      thursdayTheme: 'Remote job search, freelancing and offers',
      softSkills: 'The Founder Interview, for the full month',
    }),
  ].join(''),
  steps: [
    careerWeek(21, 'CV, LinkedIn and GitHub', 'Get your public profile ready: a CV reviewed by your mentor, LinkedIn, and a GitHub profile that shows your best work.', [
      'CV reviewed and updated after the review',
      'LinkedIn profile complete, with your projects and articles',
      'GitHub profile README, with the marketplace and the large project pinned',
      'Portfolio site linking everything',
    ], 'Links to your CV, LinkedIn, GitHub and portfolio'),
    careerWeek(22, 'Technical mock interviews', 'Two technical mock interviews, plus case-study practice on your own projects.', [
      'Two technical mock interviews done, with the feedback written down',
      'You can walk through the architecture of your large project and defend its trade-offs',
      'DSA practice continued, solving problems out loud',
    ], 'Notes from both technical mocks and what you changed after them'),
    careerWeek(23, 'Behavioural mocks and freelancing', 'Two behavioural mock interviews, and set up to freelance.', [
      'Two behavioural mock interviews done, with the feedback written down',
      'Your stories ready: a challenge, a conflict, a failure, a success',
      'A freelancing profile set up (for example Upwork) and one proposal written',
    ], 'Notes from both behavioural mocks, and your freelancing profile link'),
    careerWeek(24, 'Applications, showcase and career fair', 'Apply, present at the hiring-partner showcase, and take part in the career fair.', [
      'At least 25 applications sent and tracked (company, role, date, status)',
      'Presented at the hiring-partner showcase',
      'Took part in the career fair',
      'Fellowship complete: four mock interviews done in total',
    ], 'Your applications tracker (link) and notes from the showcase and the career fair'),
  ],
};

const MONTHS = [MONTH_1, MONTH_2, MONTH_3, MONTH_4, MONTH_5, MONTH_6];

/**
 * A roadmap's own description is shown as plain text (the library cards and the
 * pickers), unlike step descriptions, which render as rich text. Flatten it:
 * one line per paragraph or list item.
 */
const toPlain = (html) => html
  .replace(/<\/(p|li)>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .split('\n').map((l) => l.trim()).filter(Boolean)
  .join('\n');

/** Shape a step for the service (it reads `criteria`, `resources`, and the rest). */
const toServiceStep = (s) => ({
  title: s.title,
  description: s.description,
  type: s.type,
  difficulty: s.difficulty,
  effort: s.effort,
  dueOffsetDays: s.dueOffsetDays,
  deliverable: s.deliverable,
  criteria: s.criteria,
  resources: (s.resources || []).map((r) => ({ title: r.title, url: r.url, ...(r.resourceType ? { resourceType: r.resourceType } : {}) })),
});

/** Catch mistakes before anything is written. */
function validate(linearRoadmapService) {
  const names = new Set();
  for (const m of MONTHS) {
    linearRoadmapService._assertName(m.name);
    if (names.has(m.name)) throw new Error(`Duplicate month name: ${m.name}`);
    names.add(m.name);
    const steps = m.steps.map(toServiceStep);
    linearRoadmapService._assertSteps(steps);
    const titles = new Set();
    for (const s of steps) {
      if (titles.has(s.title)) throw new Error(`${m.name}: duplicate step title "${s.title}"`);
      titles.add(s.title);
      if (!['reading', 'video', 'project', 'assignment'].includes(s.type)) throw new Error(`${s.title}: unexpected type ${s.type}`);
      if (!['easy', 'medium', 'hard'].includes(s.difficulty)) throw new Error(`${s.title}: unexpected difficulty`);
      if (!Number.isInteger(s.dueOffsetDays) || s.dueOffsetDays < 1) throw new Error(`${s.title}: bad due offset`);
      if (!s.deliverable || !s.criteria.length) throw new Error(`${s.title}: deliverable and criteria are required`);
      for (const r of s.resources) if (!/^https:\/\//.test(r.url)) throw new Error(`${s.title}: resource is not https: ${r.url}`);
    }
  }
}

async function main() {
  await sequelize.authenticate();
  const linearRoadmapService = require('../src/services/linearRoadmapService');
  validate(linearRoadmapService);

  const slug = arg('--workspace', process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends');
  const organization = await models.Organization.findOne({ where: { slug }, skipOrganizationScope: true });
  if (!organization) throw new Error(`No workspace with slug "${slug}"`);

  await runWithRequestContext({ organizationId: organization.id, organizationSlug: organization.slug }, async () => {
    const wanted = arg('--program');
    if (!wanted) {
      const all = await models.Program.findAll({ attributes: ['id', 'name'] });
      throw new Error(`--program is required. Programmes in ${organization.name}:\n${all.map((x) => `    ${x.name}  (${x.id})`).join('\n')}`);
    }
    const program = /^[0-9a-f-]{36}$/i.test(wanted)
      ? await models.Program.findByPk(wanted)
      : await models.Program.findOne({ where: { name: wanted } });
    if (!program) throw new Error(`No programme matches "${wanted}" in ${organization.name}`);

    // The author recorded on the chain links: an admin of this workspace.
    const adminMembership = await models.OrganizationMembership.findOne({
      where: { organizationId: organization.id, role: { [Op.in]: ['owner', 'admin'] }, status: 'active' },
      attributes: ['userId'], order: [['created_at', 'ASC']],
    });
    const authorId = adminMembership ? adminMembership.userId : null;

    console.log(`Workspace: ${organization.name}`);
    console.log(`Programme: ${program.name} (${program.id})${DRY_RUN ? '   [dry run]' : ''}\n`);

    const existing = await models.Roadmap.findAll({
      where: { programId: program.id, name: { [Op.in]: MONTHS.map((m) => m.name) } },
      attributes: ['id', 'name'],
    });
    const byName = new Map(existing.map((r) => [r.name, r]));
    if (existing.length && existing.length < MONTHS.length) {
      throw new Error(`Only some months exist already (${existing.map((r) => r.name).join(', ')}). Nothing written; sort these out by hand first.`);
    }

    const roadmaps = [];
    for (const m of MONTHS) {
      const steps = m.steps.map(toServiceStep);
      const resourceCount = steps.reduce((n, s) => n + s.resources.length, 0);
      const days = steps.reduce((n, s) => n + s.dueOffsetDays, 0);
      if (byName.has(m.name)) {
        console.log(`  ℹ already there: ${m.name}`);
        roadmaps.push(byName.get(m.name));
        continue;
      }
      console.log(`  ${DRY_RUN ? '+' : '✓'} ${m.name}  (${steps.length} steps, ${resourceCount} resources, ${days} days of due offsets)`);
      if (DRY_RUN) {
        for (const s of steps) console.log(`       ${s.resources.length ? '🔗' : '  '} [${s.type}, ${s.dueOffsetDays}d] ${s.title}`);
        continue;
      }
      const created = await linearRoadmapService.createOrgRoadmap(authorId, {
        name: m.name,
        programId: program.id,
        description: toPlain(m.description),
        skillTags: m.skillTags,
        steps,
        published: true,
      });
      await models.Roadmap.update({ totalWeeks: 4 }, { where: { id: created.id } });
      roadmaps.push(created);
    }

    if (DRY_RUN) {
      console.log('\nChain: would link Month 1 -> 2 -> 3 -> 4 -> 5 -> 6\nDry run: nothing written.');
      return;
    }

    // Chain each month to the next (replaces only that month's outgoing link).
    for (let i = 0; i < roadmaps.length - 1; i += 1) {
      const next = await linearRoadmapService.getNextLinks(roadmaps[i].id);
      if (next.length === 1 && next[0].toRoadmapId === roadmaps[i + 1].id) continue;
      await linearRoadmapService.setNextLinks(authorId, roadmaps[i].id, [roadmaps[i + 1].id]);
    }

    // Read it all back, as the app will.
    console.log('\nVerify');
    for (let i = 0; i < roadmaps.length; i += 1) {
      const full = await linearRoadmapService.getRoadmap(roadmaps[i].id);
      const next = await linearRoadmapService.getNextLinks(roadmaps[i].id);
      const res = (full.steps || []).reduce((n, s) => n + (s.resources || []).length, 0);
      console.log(`  ${full.name}: ${full.steps.length} steps, ${res} resources, published=${full.published}, next -> ${next.map((n) => n.name).join(', ') || '(end)'}`);
    }
    console.log('\n✅ Six months, chained.');
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => { console.error('❌ Failed:', error.message); process.exit(1); });
