import { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Load axe-core to embed in pages so axe-playwright's checkA11y works post-navigation
let AXE_SCRIPT_TAG = '';
try {
  // Try to find axe-core in the workspace node_modules
  const candidates = [
    resolve(__dirname, '../../../../node_modules/axe-core/axe.min.js'),
    resolve(__dirname, '../../../../node_modules/.pnpm/axe-core@4.11.1/node_modules/axe-core/axe.min.js'),
    resolve(__dirname, '../../../node_modules/axe-core/axe.min.js'),
  ];
  for (const candidate of candidates) {
    try {
      const content = readFileSync(candidate, 'utf8');
      AXE_SCRIPT_TAG = `<script>${content}</script>`;
      break;
    } catch {
      // try next
    }
  }
} catch {
  AXE_SCRIPT_TAG = '';
}

const COMMON_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body { font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 1rem; color: #111; background: #fff; }
  a { color: #005fcc; }
  a:focus, a:hover { outline: 3px solid #ffbf00; outline-offset: 2px; }
  nav { margin-bottom: 1.5rem; padding: 0.75rem 0; border-bottom: 1px solid #ccc; display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
  nav a { text-decoration: none; font-weight: bold; }
  label { display: block; margin-top: 1rem; font-weight: bold; }
  input { width: 100%; padding: 0.5rem; margin-top: 0.25rem; font-size: 1rem; border: 2px solid #555; border-radius: 4px; }
  input:focus { outline: 3px solid #ffbf00; outline-offset: 2px; border-color: #003d99; }
  .btn { display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; font-size: 1rem; background: #005fcc; color: #fff; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; }
  .btn:hover, .btn:focus { background: #0048a8; outline: 3px solid #ffbf00; outline-offset: 2px; }
  .btn-danger { background: #b00020; }
  .btn-danger:hover, .btn-danger:focus { background: #8a0018; }
  .error { color: #b00020; margin-top: 0.5rem; font-weight: bold; }
  .success { color: #006400; margin-top: 0.5rem; font-weight: bold; }
  h1 { margin-top: 0; }
  main { padding-top: 0.5rem; }
`.trim();

function navScript() {
  return `
  <script>
    (function() {
      var token = localStorage.getItem('accessToken');
      var nav = document.getElementById('auth-nav');
      if (!nav) return;
      if (token) {
        nav.innerHTML = '<button class="btn btn-danger" id="logout-btn" style="padding:0.4rem 0.8rem;font-size:0.9rem;margin-top:0;">Log out</button>';
        var btn = document.getElementById('logout-btn');
        if (btn) {
          btn.addEventListener('click', async function() {
            var t = localStorage.getItem('accessToken');
            try {
              await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'Authorization': 'Bearer ' + t } });
            } catch(e) {}
            localStorage.removeItem('accessToken');
            window.location.href = '/login';
          });
        }
      } else {
        nav.innerHTML = '<a href="/login">Log in</a>';
      }
    })();
  </script>
  `.trim();
}

function navBarHtml() {
  return `
  <nav aria-label="Main navigation">
    <a href="/">Home</a>
    <a href="/drill">Drill</a>
    <a href="/report-card">Report Card</a>
    <a href="/trap">Trap Mode</a>
    <span id="auth-nav" style="margin-left:auto;"></span>
  </nav>
  ${navScript()}
  `.trim();
}

export function registerFrontendRoutes(app: FastifyInstance): void {
  // Home page
  app.get('/', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chess Opening Trainer</title>
  <style>${COMMON_STYLES}</style>
  ${AXE_SCRIPT_TAG}
</head>
<body>
  ${navBarHtml()}
  <main>
    <h1>Chess Opening Trainer</h1>
    <p>Practice and master chess openings with spaced repetition.</p>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:1.5rem;">
      <a href="/drill" class="btn">Start Drilling</a>
      <a href="/report-card" class="btn" style="background:#444;">Report Card</a>
    </div>
    <div id="guest-links" style="margin-top:1.5rem;display:none;">
      <p><a href="/login">Log in</a> or <a href="/register">Create an account</a> to get started.</p>
    </div>
  </main>
  <script>
    if (!localStorage.getItem('accessToken')) {
      document.getElementById('guest-links').style.display = 'block';
    }
  </script>
</body>
</html>`);
  });

  // Login page - if already authenticated, redirect to /drill
  app.get('/login', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Log in - Chess Opening Trainer</title>
  <style>${COMMON_STYLES}</style>
  ${AXE_SCRIPT_TAG}
</head>
<body>
  <main>
    <h1>Log in</h1>
    <form id="login-form" novalidate>
      <div>
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" autocomplete="email" required aria-required="true" />
      </div>
      <div>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="current-password" required aria-required="true" />
      </div>
      <div id="error-msg" class="error" role="alert" aria-live="polite" aria-atomic="true"></div>
      <button type="submit" class="btn">Log in</button>
    </form>
    <p style="margin-top:1rem;"><a href="/register">Create an account</a></p>
  </main>
  <script>
    if (localStorage.getItem('accessToken')) {
      window.location.replace('/drill');
    }
    document.getElementById('login-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;
      var errorMsg = document.getElementById('error-msg');
      errorMsg.textContent = '';
      try {
        var res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password }),
          credentials: 'include',
        });
        if (res.ok) {
          var data = await res.json();
          localStorage.setItem('accessToken', data.accessToken);
          window.location.href = '/drill';
        } else {
          errorMsg.textContent = 'Invalid email or password. Please try again.';
        }
      } catch (err) {
        errorMsg.textContent = 'Network error. Please try again.';
      }
    });
  </script>
</body>
</html>`);
  });

  // Register page
  app.get('/register', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Create Account - Chess Opening Trainer</title>
  <style>${COMMON_STYLES}</style>
  ${AXE_SCRIPT_TAG}
</head>
<body>
  <main>
    <h1>Create an account</h1>
    <form id="register-form" novalidate>
      <div>
        <label for="email">Email address</label>
        <input type="email" id="email" name="email" autocomplete="email" required aria-required="true" />
      </div>
      <div>
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autocomplete="new-password" required aria-required="true" />
      </div>
      <div id="error-msg" class="error" role="alert" aria-live="polite" aria-atomic="true"></div>
      <button type="submit" class="btn">Register</button>
    </form>
    <p style="margin-top:1rem;"><a href="/login">Already have an account? Log in</a></p>
  </main>
  <script>
    if (localStorage.getItem('accessToken')) {
      window.location.replace('/drill');
    }
    document.getElementById('register-form').addEventListener('submit', async function(e) {
      e.preventDefault();
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;
      var errorMsg = document.getElementById('error-msg');
      errorMsg.textContent = '';
      try {
        var res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password }),
          credentials: 'include',
        });
        if (res.ok) {
          var data = await res.json();
          localStorage.setItem('accessToken', data.accessToken);
          window.location.href = '/drill';
        } else {
          var errData = await res.json().catch(function() { return {}; });
          errorMsg.textContent = (errData && errData.error) ? errData.error : 'Registration failed. Please try again.';
        }
      } catch (err) {
        errorMsg.textContent = 'Network error. Please try again.';
      }
    });
  </script>
</body>
</html>`);
  });

  // Drill page - requires auth
  app.get('/drill', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Drill - Chess Opening Trainer</title>
  <style>
    ${COMMON_STYLES}
    .session-done { padding: 2rem; text-align: center; background: #f0f7ee; border: 2px solid #4caf50; border-radius: 8px; margin-top: 1rem; }
    .session-done h2 { color: #006400; margin-top: 0; }
    #drill-content { margin-top: 0.5rem; }
  </style>
  ${AXE_SCRIPT_TAG}
</head>
<body>
  <script>
    if (!localStorage.getItem('accessToken')) {
      window.location.replace('/login');
    }
  </script>
  ${navBarHtml()}
  <main>
    <h1>Drill Session</h1>
    <div id="status-region" role="status" aria-live="polite" aria-atomic="true" style="min-height:1.5em;"></div>
    <div id="drill-content" aria-live="polite">
      <p>Loading your drill session...</p>
    </div>
  </main>
  <script>
    (async function() {
      var token = localStorage.getItem('accessToken');
      if (!token) { window.location.replace('/login'); return; }
      var statusRegion = document.getElementById('status-region');
      var drillContent = document.getElementById('drill-content');
      try {
        var res = await fetch('/api/drill/session', {
          headers: { 'Authorization': 'Bearer ' + token },
          credentials: 'include',
        });
        if (res.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.replace('/login');
          return;
        }
        if (!res.ok) {
          drillContent.innerHTML = '<p class="error">Failed to load drill session. Please try again later.</p>';
          statusRegion.textContent = 'Error loading drill session.';
          return;
        }
        var data = await res.json();
        var cards = data.cards || data.items || data.session || [];
        if (!Array.isArray(cards)) cards = [];
        if (cards.length === 0) {
          drillContent.innerHTML = '<div class="session-done" role="region" aria-label="Drill session complete"><h2>All done!</h2><p>You have reviewed all cards due. Check back later for more.</p><a href="/report-card" class="btn">View Report Card</a></div>';
          statusRegion.textContent = 'Session complete.';
        } else {
          drillContent.innerHTML = '<div data-testid="chessboard" aria-label="Chess board for opening drill" role="img" style="width:400px;height:400px;max-width:100%;background:#8B6914;border:3px solid #333;display:grid;grid-template-columns:repeat(8,1fr);"></div><div role="alert" aria-live="assertive" id="move-feedback" style="margin-top:1rem;min-height:1.5em;font-weight:bold;"></div>';
          statusRegion.textContent = cards.length + ' cards to review.';
        }
      } catch (err) {
        drillContent.innerHTML = '<p class="error">Network error. Please check your connection.</p>';
        statusRegion.textContent = 'Network error loading session.';
      }
    })();
  </script>
</body>
</html>`);
  });

  // Report card page - requires auth
  app.get('/report-card', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Report Card - Chess Opening Trainer</title>
  <style>
    ${COMMON_STYLES}
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { text-align: left; padding: 0.5rem; border-bottom: 1px solid #ccc; }
    th { background: #f5f5f5; font-weight: bold; }
  </style>
  ${AXE_SCRIPT_TAG}
</head>
<body>
  <script>
    if (!localStorage.getItem('accessToken')) {
      window.location.replace('/login');
    }
  </script>
  ${navBarHtml()}
  <main>
    <h1>Report Card</h1>
    <div id="status-region" role="status" aria-live="polite" aria-atomic="true" style="min-height:1.5em;"></div>
    <div id="report-content" aria-live="polite">
      <p>Loading your report card...</p>
    </div>
  </main>
  <script>
    (async function() {
      var token = localStorage.getItem('accessToken');
      if (!token) { window.location.replace('/login'); return; }
      var statusRegion = document.getElementById('status-region');
      var reportContent = document.getElementById('report-content');
      try {
        var res = await fetch('/api/report-card', {
          headers: { 'Authorization': 'Bearer ' + token },
          credentials: 'include',
        });
        if (res.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.replace('/login');
          return;
        }
        if (!res.ok) {
          reportContent.innerHTML = '<p class="error">Failed to load report card. Please try again later.</p>';
          statusRegion.textContent = 'Error loading report card.';
          return;
        }
        var data = await res.json();
        var stats = data.stats || data || {};
        var hasData = stats.totalReviews !== undefined || stats.correctRate !== undefined;
        if (!hasData) {
          reportContent.innerHTML = '<p>No data available yet. Start drilling to see your progress!</p><a href="/drill" class="btn">Go to Drill</a>';
          statusRegion.textContent = 'No report card data yet.';
        } else {
          var html = '<section aria-label="Performance summary"><h2>Performance Summary</h2><ul>';
          if (stats.totalReviews !== undefined) html += '<li>Total reviews: <strong>' + stats.totalReviews + '</strong></li>';
          if (stats.correctRate !== undefined) html += '<li>Correct rate: <strong>' + (stats.correctRate * 100).toFixed(1) + '%</strong></li>';
          if (stats.streak !== undefined) html += '<li>Current streak: <strong>' + stats.streak + ' days</strong></li>';
          html += '</ul></section>';
          reportContent.innerHTML = html;
          statusRegion.textContent = 'Report card loaded.';
        }
      } catch (err) {
        reportContent.innerHTML = '<p class="error">Network error. Please check your connection.</p>';
        statusRegion.textContent = 'Network error.';
      }
    })();
  </script>
</body>
</html>`);
  });

  // Trap mode page - requires auth
  app.get('/trap', async (_req, reply) => {
    reply.type('text/html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Trap Mode - Chess Opening Trainer</title>
  <style>
    ${COMMON_STYLES}
    .trap-item { padding: 1rem; border: 1px solid #ccc; border-radius: 4px; margin-bottom: 0.75rem; }
    .trap-item h3 { margin: 0 0 0.5rem; }
  </style>
  ${AXE_SCRIPT_TAG}
</head>
<body>
  <script>
    if (!localStorage.getItem('accessToken')) {
      window.location.replace('/login');
    }
  </script>
  ${navBarHtml()}
  <main>
    <h1>Trap Mode</h1>
    <p>Practice recognizing and executing opening traps.</p>
    <div id="status-region" role="status" aria-live="polite" aria-atomic="true" style="min-height:1.5em;"></div>
    <div id="trap-content" aria-live="polite">
      <p>Loading trap positions...</p>
    </div>
  </main>
  <script>
    (async function() {
      var token = localStorage.getItem('accessToken');
      if (!token) { window.location.replace('/login'); return; }
      var statusRegion = document.getElementById('status-region');
      var trapContent = document.getElementById('trap-content');
      try {
        var res = await fetch('/api/trap', {
          headers: { 'Authorization': 'Bearer ' + token },
          credentials: 'include',
        });
        if (res.status === 401) {
          localStorage.removeItem('accessToken');
          window.location.replace('/login');
          return;
        }
        if (!res.ok) {
          trapContent.innerHTML = '<p class="error">Failed to load trap positions. Please try again later.</p>';
          statusRegion.textContent = 'Error loading trap positions.';
          return;
        }
        var data = await res.json();
        var traps = data.traps || data.positions || data.items || [];
        if (!Array.isArray(traps)) traps = [];
        if (traps.length === 0) {
          trapContent.innerHTML = '<p>No trap positions available right now. Check back after adding openings.</p><a href="/drill" class="btn">Go to Drill</a>';
          statusRegion.textContent = 'No trap positions available.';
        } else {
          var html = '<ul style="list-style:none;padding:0;">';
          traps.forEach(function(trap, i) {
            html += '<li class="trap-item"><h3>' + (trap.name || ('Trap ' + (i + 1))) + '</h3><p>' + (trap.description || '') + '</p></li>';
          });
          html += '</ul>';
          trapContent.innerHTML = html;
          statusRegion.textContent = traps.length + ' trap positions loaded.';
        }
      } catch (err) {
        trapContent.innerHTML = '<p class="error">Network error. Please check your connection.</p>';
        statusRegion.textContent = 'Network error.';
      }
    })();
  </script>
</body>
</html>`);
  });
}
