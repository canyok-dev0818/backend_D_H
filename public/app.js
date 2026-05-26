const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function apiBase() {
  const v = $('#apiBase').value.trim();
  return v || window.location.origin;
}

function userId() {
  return $('#userId').value.trim() || 'demo-user';
}

function showResult(containerId, status, data, rawText) {
  const box = $(containerId);
  box.hidden = false;
  const codeEl = box.querySelector('.code');
  const timeEl = box.querySelector('.time');
  const pre = box.querySelector('pre');
  codeEl.textContent = `HTTP ${status}`;
  codeEl.className = 'code ' + (status >= 200 && status < 300 ? 'ok' : 'err');
  timeEl.textContent = new Date().toLocaleTimeString();
  pre.textContent =
    rawText ?? (typeof data === 'string' ? data : JSON.stringify(data, null, 2));
}

async function request(method, path, options = {}) {
  const url = apiBase().replace(/\/$/, '') + path;
  const headers = { Accept: 'application/json', ...options.headers };
  let body = options.body;
  if (body !== undefined && typeof body === 'object') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body });
  let data;
  const text = await res.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function checkHealth() {
  const pill = $('#healthStatus');
  pill.className = 'status-pill pending';
  pill.textContent = 'Проверка…';
  try {
    const { status, data } = await request('GET', '/health');
    if (status === 200 && data?.status === 'ok') {
      pill.className = 'status-pill ok';
      pill.textContent = 'Сервис доступен';
    } else {
      pill.className = 'status-pill err';
      pill.textContent = `Ошибка HTTP ${status}`;
    }
  } catch (e) {
    pill.className = 'status-pill err';
    pill.textContent = 'Нет связи с API';
  }
}

function switchPanel(name) {
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === `panel-${name}`));
}

function defaultPostBody() {
  return {
    setPreference: {
      notificationType: 'marketing_email',
      channel: 'email',
      enabled: false,
    },
  };
}

function defaultEvalBody() {
  return {
    userId: userId(),
    notificationType: 'marketing_sms',
    channel: 'sms',
    region: 'EU',
    datetime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

$('#apiBase').value = window.location.origin;

$('#btnHealth').addEventListener('click', checkHealth);

$$('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
});

$('#btnGetPrefs').addEventListener('click', async () => {
  const { status, data } = await request('GET', `/users/${encodeURIComponent(userId())}/preferences`);
  showResult('#result-prefs', status, data);
});

$('#btnPostPrefs').addEventListener('click', async () => {
  let body;
  try {
    body = JSON.parse($('#postBody').value);
  } catch {
    showResult('#result-update', 0, null, 'Ошибка: невалидный JSON в теле запроса');
    return;
  }
  const key = $('#idempotencyKey').value.trim() || `ui-${Date.now()}`;
  const { status, data } = await request('POST', `/users/${encodeURIComponent(userId())}/preferences`, {
    headers: { 'Idempotency-Key': key },
    body,
  });
  showResult('#result-update', status, data);
});

$('#btnFillSetPref').addEventListener('click', () => {
  $('#postBody').value = JSON.stringify(defaultPostBody(), null, 2);
});

$('#btnFillQuiet').addEventListener('click', () => {
  $('#postBody').value = JSON.stringify(
    {
      quietHours: { timezone: 'Europe/Moscow', start: '22:00', end: '08:00' },
    },
    null,
    2,
  );
});

$('#btnFillBoth').addEventListener('click', () => {
  $('#postBody').value = JSON.stringify(
    {
      setPreference: {
        notificationType: 'marketing_push',
        channel: 'push',
        enabled: true,
      },
      quietHours: { timezone: 'Europe/Moscow', start: '22:00', end: '08:00' },
    },
    null,
    2,
  );
});

$('#btnEvaluate').addEventListener('click', async () => {
  let body;
  try {
    body = JSON.parse($('#evalBody').value);
  } catch {
    showResult('#result-eval', 0, null, 'Ошибка: невалидный JSON');
    return;
  }
  body.userId = body.userId || userId();
  const { status, data } = await request('POST', '/evaluate', { body });
  showResult('#result-eval', status, data);
});

$('#btnDefaults').addEventListener('click', async () => {
  const { status, data } = await request('GET', '/defaults');
  showResult('#result-system', status, data);
});

$('#btnPolicies').addEventListener('click', async () => {
  const { status, data } = await request('GET', '/policies');
  showResult('#result-system', status, data);
});

$$('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const uid = userId();
    switch (btn.dataset.preset) {
      case 'new-user':
        switchPanel('preferences');
        $('#userId').value = `user-${Date.now()}`;
        await $('#btnGetPrefs').click();
        break;
      case 'disable-marketing':
        switchPanel('update');
        $('#idempotencyKey').value = `disable-mkt-${Date.now()}`;
        $('#postBody').value = JSON.stringify(defaultPostBody(), null, 2);
        await $('#btnPostPrefs').click();
        break;
      case 'quiet-hours':
        switchPanel('update');
        $('#idempotencyKey').value = `qh-${Date.now()}`;
        $('#btnFillBoth').click();
        await $('#btnPostPrefs').click();
        break;
      case 'eval-eu-sms':
        switchPanel('evaluate');
        $('#evalBody').value = JSON.stringify(defaultEvalBody(), null, 2);
        await $('#btnEvaluate').click();
        break;
      case 'eval-tx-email':
        switchPanel('evaluate');
        $('#evalBody').value = JSON.stringify(
          {
            userId: uid,
            notificationType: 'transactional_email',
            channel: 'email',
            region: 'US',
            datetime: '2026-05-21T12:00:00Z',
          },
          null,
          2,
        );
        await $('#btnEvaluate').click();
        break;
      default:
        break;
    }
  });
});

$('#postBody').value = JSON.stringify(defaultPostBody(), null, 2);
$('#evalBody').value = JSON.stringify(defaultEvalBody(), null, 2);

checkHealth();
