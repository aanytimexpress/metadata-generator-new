// public/app.js

const API_BASE = '';

let authToken = null;
let chosenFiles = [];
let generatedItems = [];

function setLoggedIn(token) {
  authToken = token;
  localStorage.setItem('meta_token', token);
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
}

function setLoggedOut() {
  authToken = null;
  localStorage.removeItem('meta_token');
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('appSection').classList.add('hidden');
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
    resultList.innerHTML = '<p class="text-slate-400">No metadata generated yet.</p>';
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
      <p class="text-[11px] mt-1"><span class="font-semibold">Keywords:</span> ${item.keywords.join(', ')}</p>
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

    const formData = new FormData();
    chosenFiles.forEach(f => formData.append('files', f));

    formData.append('titleLength', titleLenInput.value);
    formData.append('descLength', descLenInput.value);
    formData.append('keywordCount', kwCountInput.value);
    formData.append('exportProfile', exportProfile.value);

    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    try {
      const res = await fetch(API_BASE + '/api/generate-from-images', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + authToken,
          // Content-Type দেওয়া যাবে না, browser নিজে boundary সেট করবে
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        generateError.textContent = data.error || 'Generation failed';
        generateError.classList.remove('hidden');
        return;
      }

      generatedItems = data.items || [];
      renderResults();
    } catch (e) {
      generateError.textContent = 'Network error: ' + e.message;
      generateError.classList.remove('hidden');
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate Metadata from Images';
    }
  });

  // export CSV
  document.getElementById('exportCsvBtn').addEventListener('click', () => {
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
});
