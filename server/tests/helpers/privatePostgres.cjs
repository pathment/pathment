const { existsSync, mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Sequelize } = require('sequelize');

// Never loads dotenv or DATABASE_URL. Each caller owns its cluster and socket.
module.exports = async function withPrivatePostgres(operation) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pathment-isolation-'));
  const data = path.join(dir, 'data');
  const windows = process.platform === 'win32';
  const defaultBin = windows
    ? ['18', '17', '16', '15', '14', '13']
        .map(version => path.join(process.env.ProgramFiles || 'C:\\Program Files', 'PostgreSQL', version, 'bin'))
        .find(candidate => existsSync(path.join(candidate, 'initdb.exe')))
    : '/usr/lib/postgresql/16/bin';
  const bin = process.env.MIGRATION_TEST_PG_BIN || defaultBin;
  if (!bin) throw new Error('PostgreSQL test binaries not found; set MIGRATION_TEST_PG_BIN');
  // A detached postgres process inherits pg_ctl's pipe handles on Windows,
  // which makes execFileSync wait forever even after pg_ctl itself exits.
  const run = (name, args) => execFileSync(path.join(bin, name + (windows ? '.exe' : '')), args, {
    stdio: windows ? 'ignore' : 'pipe', windowsHide: true
  });
  let db;
  let started = false;
  try {
    run('initdb', ['-D', data, '-A', 'trust', '-U', 'isolation_test', '--no-locale']);
    let port;
    if (windows) {
      port = await new Promise((resolve, reject) => {
        const listener = require('node:net').createServer();
        listener.on('error', reject);
        listener.listen(0, '127.0.0.1', () => {
          const selected = listener.address().port;
          listener.close(error => error ? reject(error) : resolve(selected));
        });
      });
    }
    run('pg_ctl', ['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', windows ? `-F -h 127.0.0.1 -p ${port}` : `-F -k ${dir} -h ''`, '-w', 'start']);
    started = true;
    db = new Sequelize('postgres', 'isolation_test', '', { dialect: 'postgres', host: windows ? '127.0.0.1' : dir, ...(port ? { port } : {}), logging: false });
    await operation(db);
  } finally {
    if (db) await db.close();
    if (started) run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(dir, { recursive: true, force: true });
  }
};
