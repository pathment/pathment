const industrySegments = [
  {
    name: 'Engineering and Product',
    focus: 'Accelerate onboarding and skill depth for technical teams.',
  },
  {
    name: 'Sales and Revenue',
    focus: 'Scale high-quality coaching and improve field performance.',
  },
  {
    name: 'Operations and Compliance',
    focus: 'Standardize critical workflows without losing human guidance.',
  },
  {
    name: 'Leadership Development',
    focus: 'Create internal pipelines for future managers and leads.',
  },
];

const coreCapabilities = [
  'Structured programs with clear milestones and outcomes',
  'Smart mentor-mentee matching based on skills and availability',
  'AI-guided roadmaps to personalize learning progression',
  'Task and submission workflows with actionable mentor feedback',
  'Role-based dashboards for admins, mentors, and mentees',
  'Progress analytics to monitor completion, quality, and impact',
];

const tenantTrustPoints = [
  {
    title: 'Single-Tenant Isolation',
    description:
      'Each customer environment can run with its own database and backend process for strict data separation.',
  },
  {
    title: 'Subdomain-Based Deployment',
    description:
      'Run each organization on dedicated subdomains while keeping centralized operations and governance.',
  },
  {
    title: 'Production-Ready Controls',
    description:
      'TLS, role permissions, and operational observability designed for enterprise rollouts.',
  },
];

const outcomes = [
  {
    metric: 'Faster Time-to-Skill',
    detail: 'Move learners from orientation to productive delivery in fewer cycles.',
  },
  {
    metric: 'Lower Training Waste',
    detail: 'Replace generic one-size training with practical mentor-led execution.',
  },
  {
    metric: 'Higher Retention',
    detail: 'Show people a visible growth path that keeps talent engaged and advancing.',
  },
];

export default function HomePage() {
  return (
    <main className="landing-shell">
      <div className="ambient-glow ambient-glow-left" aria-hidden="true" />
      <div className="ambient-glow ambient-glow-right" aria-hidden="true" />

      <header className="top-nav">
        <a href="#" className="brand">
          PATHMENT
        </a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#why">Why Pathment</a>
          <a href="#industries">Industries</a>
          <a href="#platform">Platform</a>
          <a href="#trust">Trust</a>
        </nav>
        <a className="btn btn-ghost" href="mailto:hello@pathment.me">
          Contact
        </a>
      </header>

      <section className="hero">
        <p className="eyebrow">Built for serious teams, not checkbox training</p>
        <h1>
          Mentorship infrastructure for industries that need real capability growth.
        </h1>
        <p className="hero-copy">
          Pathment helps organizations design role-specific mentorship programs,
          match people intelligently, and prove learning outcomes with measurable
          performance data.
        </p>
        <div className="hero-actions">
          <a className="btn btn-solid" href="mailto:hello@pathment.me?subject=Pathment%20Demo%20Request">
            Book Demo
          </a>
          <a className="btn btn-outline" href="https://devweekends.pathment.me">
            View Live Tenant
          </a>
        </div>
        <div className="hero-band" aria-label="Pathment outcomes">
          <article>
            <h2>Program Clarity</h2>
            <p>Define progression by level, role, and target competency.</p>
          </article>
          <article>
            <h2>Execution Quality</h2>
            <p>Mentors assign, review, and coach through practical submissions.</p>
          </article>
          <article>
            <h2>Leadership Visibility</h2>
            <p>Admins monitor completion, momentum, and mentor effectiveness.</p>
          </article>
        </div>
      </section>

      <section id="why" className="section-block">
        <div>
          <p className="section-kicker">Why Pathment</p>
          <h2>Training spend should create capability, not content archives.</h2>
        </div>
        <div className="outcome-grid">
          {outcomes.map((item) => (
            <article key={item.metric} className="surface-card">
              <h3>{item.metric}</h3>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="industries" className="section-block">
        <div>
          <p className="section-kicker">Industry Fit</p>
          <h2>Purpose-built for operational teams where performance matters.</h2>
        </div>
        <div className="segment-grid">
          {industrySegments.map((segment) => (
            <article key={segment.name} className="surface-card">
              <h3>{segment.name}</h3>
              <p>{segment.focus}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="platform" className="section-block">
        <div>
          <p className="section-kicker">Platform Capabilities</p>
          <h2>Everything needed to run mentorship as a business system.</h2>
        </div>
        <ul className="capability-list">
          {coreCapabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>

      <section id="trust" className="section-block">
        <div>
          <p className="section-kicker">Deployment and Trust</p>
          <h2>Designed for isolated tenant operations and controlled scale.</h2>
        </div>
        <div className="trust-grid">
          {tenantTrustPoints.map((point) => (
            <article key={point.title} className="surface-card">
              <h3>{point.title}</h3>
              <p>{point.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="closing-cta">
        <p className="section-kicker">Launch Pathment</p>
        <h2>
          Turn mentoring expertise into repeatable, measurable capability growth.
        </h2>
        <p>
          Start with one industry team, validate outcomes, then scale across your
          organization with confidence.
        </p>
        <div className="hero-actions">
          <a className="btn btn-solid" href="mailto:hello@pathment.me?subject=Start%20Pathment%20Pilot">
            Start a Pilot
          </a>
          <a className="btn btn-outline" href="mailto:hello@pathment.me?subject=Pathment%20Architecture%20Review">
            Request Architecture Review
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <p>Pathment</p>
        <p>AI-powered mentorship infrastructure for measurable workforce growth.</p>
      </footer>
    </main>
  );
}
