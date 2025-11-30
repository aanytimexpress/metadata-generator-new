// public/app.js

const API_BASE = '';

let authToken = null;
let keywordFormat = 'single';
let generatedItems = [];
let chosenFiles = [];
let lastEngine = 'local-demo';

// ---- helper for auth headers ----
function getAuthHeaders() {
  return authToken ? { Authorization: 'Bearer ' + authToken } : {};
}

function updateEngineInfo(engine) {
  lastEngine = engine || 'unknown';
  const el = document.getElementById('engineInfo');
  if (!el) return;

  if (lastEngine === 'gemini') {
    el.textContent = 'Engine: Gemini (AI model active)';
  } else if (lastEngine === 'fallback-local') {
    el.textContent = 'Engine: local fallback (Gemini error, using backup)';
  } else if (lastEngine === 'local') {
    el.textContent = 'Engine: local demo generator';
  } else if (lastEngine === 'local-demo') {
    el.textContent = 'Engine: local-demo';
  } else {
    el.textContent = 'Engine: ' + lastEngine;
  }
}

// ---- Gemini status load ----
async function loadGeminiStatus() {
  const statusEl = document.getElementById('geminiStatusText');
  if (!statusEl || !authToken) return;

  statusEl.textContent = 'Checking Gemini status...';

  try {
    const res = await fetch(API_BASE + '/api/gemini-status', {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    });

    if (!res.ok) {
      statusEl.textContent = 'Not connected – using local demo generator.';
      updateEngineInfo('local');
      return;
    }

    const data = await res.json();
    if (data.active) {
      statusEl.textContent =
        'Connected to Gemini (' +
        (data.model || 'unknown model') +
        ', source: ' +
        (data.source || 'manual') +
        ').';
      updateEngineInfo('gemini');
    } else {
      statusEl.textContent =
        'Not connected – using local demo generator.';
      updateEngineInfo('local');
    }
  } catch (e) {
    console.error(e);
    statusEl.textContent = 'Error checking Gemini status.';
    updateEngineInfo('local');
  }
}

// ---- Gemini config save ----
async function saveGeminiConfig() {
  const apiKeyInput = document.getElementById('geminiApiKey');
  const modelInput = document.getElementById('geminiModel');
  const statusEl = document.getElementById('geminiStatusText');

  const apiKey = apiKeyInput.value.trim();
  const model = modelInput.value.trim();

  if (!authToken) {
    alert('Please login first.');
    return;
  }

  if (!apiKey) {
    alert('Please paste your Gemini API key.');
    return;
  }

  statusEl.textContent = 'Saving Gemini settings...';

  try {
    const res = await fetch(API_BASE + '/api/gemini-config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        apiKey,
        model: model || undefined,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert('Failed to configure Gemini: ' + (data.error || 'Unknown error'));
      statusEl.textContent = 'Failed to configure Gemini.';
      updateEngineInfo('local');
      return;
    }

    statusEl.textContent =
      'Connected to Gemini (' +
      (data.model || 'unknown model') +
      ', source: ' +
      (data.source || 'manual') +
      ').';
    updateEngineInfo('gemini');

    apiKeyInput.value = '';
  } catch (e) {
    console.error(e);
    alert('Something went wrong while saving Gemini settings.');
    statusEl.textContent = 'Error saving Gemini settings.';
    updateEngineInfo('local');
  }
}

function setLoggedIn(token) {
  authToken = token;
  localStorage.setItem('meta_token', token);
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  loadGeminiStatus();
}

function setLoggedOut() {
  authToken = null;
  localStorage.removeItem('meta_token');
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('appSection').classList.add('hidden');
  const statusEl = document.getElementById('geminiStatusText');
  if (statusEl) {
    statusEl.textContent = 'No AI Key – using local demo generator.';
  }
  updateEngineInfo('local-demo');
}

function renderFileList() {
  const fileListEl = document.getElementById('fileList');
  const fileCountEl = document.getElementById('fileCount');
  fileCountEl.textContent = `(${chosenFiles.length})`;
  fileListEl.innerHTML = '';
  if (!chosenFiles.length) {
    fileListEl.textContent = 'No files uploaded yet';
    return;
  }
  chosenFiles.forEach(f => {
    const p = document.createElement('p');
    p.textContent = f.name;
    fileListEl.appendChild(p);
  });
}

function renderResults() {
  const resultList = document.getElementById('resultList');
  const resultCount = document.getElementById('resultCount');
  resultList.innerHTML = '';
  if (!generatedItems.length) {
    resultList.innerHTML =
      '<p class="text-slate-400">No metadata generated yet.</p>';
    resultCount.textContent = '0 items';
    return;
  }
  resultCount.textContent = generatedItems.length + ' items';

  generatedItems.forEach(item => {
    const div = document.createElement('div');
    div.className = 'border border-slate-200 rounded p-2';
    div.innerHTML = `
      <p class="font-semibold text-[11px] text-slate-900">${item.filename}</p>
      <p class="text-[11px] mt-1"><span class="font-semibold">Title:</span> ${item.title}</p>
      <p class="text-[11px] mt-1"><span class="font-semibold">Description:</span> ${item.description}</p>
      <p class="text-[11px] mt-1"><span class="font-semibold">Keywords:</span> ${item.keywords.join(
        ', '
      )}</p>
    `;
    resultList.appendChild(div);
  });
}

window.addEventListener('load', () => {
  const saved = localStorage.getItem('meta_token');
  if (saved) setLoggedIn(saved);
  else setLoggedOut();

  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const loginError = document.getElementById('loginError');

  loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    loginError.classList.add('hidden');
    loginError.textContent = '';

    if (!email || !password) {
      loginError.textContent = 'Email এবং password দিন।';
      loginError.classList.remove('hidden');
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';

    try {
      const res = await fetch(API_BASE + '/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        loginError.textContent = data.error || 'Login failed';
        loginError.classList.remove('hidden');
        return;
      }
      setLoggedIn(data.token);
    } catch (e) {
      loginError.textContent = 'Network error: ' + e.message;
      loginError.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Login';
    }
  });

  logoutBtn.addEventListener('click', () => {
    setLoggedOut();
  });

  // sliders
  const titleLenInput = document.getElementById('titleLength');
  const titleLenValue = document.getElementById('titleLenValue');
  titleLenInput.addEventListener('input', () => {
    titleLenValue.textContent = titleLenInput.value;
  });

  const kwCountInput = document.getElementById('keywordCount');
  const kwCountValue = document.getElementById('kwCountValue');
  kwCountInput.addEventListener('input', () => {
    kwCountValue.textContent = kwCountInput.value;
  });

  const descLenInput = document.getElementById('descLength');
  const descLenValue = document.getElementById('descLenValue');
  descLenInput.addEventListener('input', () => {
    descLenValue.textContent = descLenInput.value;
  });

  // keyword format
  const kfmtButtons = document.querySelectorAll('.kfmt-btn');
  kfmtButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      kfmtButtons.forEach(b =>
        b.classList.remove('bg-white', 'shadow', 'text-slate-800')
      );
      kfmtButtons.forEach(b => b.classList.add('text-slate-600'));
      btn.classList.add('bg-white', 'shadow', 'text-slate-800');
      keywordFormat = btn.dataset.kfmt;
    });
  });

  // file handling
  const fileInput = document.getElementById('fileInput');
  const chooseFilesBtn = document.getElementById('chooseFilesBtn');
  const clearFilesBtn = document.getElementById('clearFilesBtn');

  chooseFilesBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    chosenFiles = Array.from(fileInput.files || []);
    renderFileList();
  });
  clearFilesBtn.addEventListener('click', () => {
    chosenFiles = [];
    fileInput.value = '';
    renderFileList();
  });

  // generate
  const generateBtn = document.getElementById('generateBtn');
  const generateError = document.getElementById('generateError');
  const exportProfile = document.getElementById('exportProfile');

  generateBtn.addEventListener('click', async () => {
    generateError.classList.add('hidden');
    generateError.textContent = '';

    if (!authToken) {
      generateError.textContent = 'Please login first.';
      generateError.classList.remove('hidden');
      return;
    }
    if (!chosenFiles.length) {
      generateError.textContent = 'Please choose at least one image.';
      generateError.classList.remove('hidden');
      return;
    }

    const filenames = chosenFiles.map(f => f.name);
    const body = {
      filenames,
      titleLength: Number(titleLenInput.value),
      descLength: Number(descLenInput.value),
      keywordCount: Number(kwCountInput.value),
      keywordFormat,
      includeKeywords: document.getElementById('includeKeywords').value,
      excludeKeywords: document.getElementById('excludeKeywords').value,
      exportProfile: exportProfile.value,
    };

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
      const res = await fetch(API_BASE + '/api/generate-metadata', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        generateError.textContent = data.error || 'Generation failed';
        generateError.classList.remove('hidden');
        updateEngineInfo(data.ai || 'error');
        return;
      }
      updateEngineInfo(data.ai || 'unknown');
      generatedItems = data.items || [];
      renderResults();
    } catch (e) {
      generateError.textContent = 'Network error: ' + e.message;
      generateError.classList.remove('hidden');
      updateEngineInfo('error');
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Metadata';
    }
  });

  // export csv
  document
    .getElementById('exportCsvBtn')
    .addEventListener('click', () => {
      if (!generatedItems.length) return;
      let csv = 'filename,title,description,keywords\n';
      generatedItems.forEach(item => {
        const row = [
          `"${item.filename.replace(/"/g, '""')}"`,
          `"${item.title.replace(/"/g, '""')}"`,
          `"${item.description.replace(/"/g, '""')}"`,
          `"${item.keywords.join('; ').replace(/"/g, '""')}"`,
        ].join(',');
        csv += row + '\n';
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'metadata_export.csv';
      a.click();
      URL.revokeObjectURL(url);
    });

  // Gemini save button
  const saveGeminiBtn = document.getElementById('saveGeminiBtn');
  if (saveGeminiBtn) {
    saveGeminiBtn.addEventListener('click', saveGeminiConfig);
  }
});
