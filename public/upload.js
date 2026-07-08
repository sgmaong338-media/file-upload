const uploadForm = document.querySelector('#uploadForm');
const fileInput = document.querySelector('#fileInput');
const fileLabel = document.querySelector('#fileLabel');
const uploadStatus = document.querySelector('#uploadStatus');
const dropZone = document.querySelector('.drop-zone');
const eventTitle = document.querySelector('#eventTitle');
const targetLabel = document.querySelector('#targetLabel');
const eventMatch = window.location.pathname.match(/^\/e\/([^/]+)/);
const eventId = eventMatch ? decodeURIComponent(eventMatch[1]) : '';

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

async function loadPublicConfig() {
  const response = await fetch(eventId ? `/api/events/${encodeURIComponent(eventId)}/public` : '/api/public-config');
  if (!response.ok) {
    throw new Error('Unable to load event settings.');
  }

  const config = await response.json();
  eventTitle.textContent = config.eventTitle || '文件上传';
  targetLabel.textContent = config.activeTargetName || 'SYNC READY';
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  fileLabel.textContent = file ? file.name : '选择文件';
});

dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropZone.classList.add('dragging');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragging');
});

dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');

  if (event.dataTransfer.files.length) {
    fileInput.files = event.dataTransfer.files;
    fileLabel.textContent = event.dataTransfer.files[0].name;
  }
});

uploadForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (!fileInput.files.length) {
    setStatus(uploadStatus, '请选择一个文件。', 'error');
    return;
  }

  const button = uploadForm.querySelector('button');
  const formData = new FormData(uploadForm);

  button.disabled = true;
  setStatus(uploadStatus, '正在上传...');

  try {
    const response = await fetch(eventId ? `/api/events/${encodeURIComponent(eventId)}/upload` : '/api/upload', {
      method: 'POST',
      body: formData
    });
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || '上传失败。');
    }

    setStatus(uploadStatus, `上传完成：${result.name}`, 'success');
    uploadForm.reset();
    fileLabel.textContent = '选择文件';
  } catch (error) {
    setStatus(uploadStatus, error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

loadPublicConfig().catch((error) => {
  setStatus(uploadStatus, error.message, 'error');
});
