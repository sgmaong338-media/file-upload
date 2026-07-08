const uploadForm = document.querySelector('#uploadForm');
const fileInput = document.querySelector('#fileInput');
const fileLabel = document.querySelector('#fileLabel');
const uploadStatus = document.querySelector('#uploadStatus');
const uploadProgress = document.querySelector('#uploadProgress');
const progressBar = document.querySelector('#progressBar');
const progressValue = document.querySelector('#progressValue');
const dropZone = document.querySelector('.drop-zone');
const eventTitle = document.querySelector('#eventTitle');
const targetLabel = document.querySelector('#targetLabel');
const eventMatch = window.location.pathname.match(/^\/e\/([^/]+)/);
const eventId = eventMatch ? decodeURIComponent(eventMatch[1]) : '';

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function setProgress(percent, isVisible = true) {
  const normalized = Math.max(0, Math.min(100, Math.round(percent)));
  uploadProgress.classList.toggle('is-visible', isVisible);
  uploadProgress.setAttribute('aria-hidden', isVisible ? 'false' : 'true');
  progressBar.style.width = `${normalized}%`;
  progressValue.textContent = `${normalized}%`;
}

function resetProgress() {
  setProgress(0, false);
}

function uploadWithProgress(url, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress((event.loaded / event.total) * 100);
      }
    });

    request.addEventListener('load', () => {
      let result = {};

      try {
        result = request.responseText ? JSON.parse(request.responseText) : {};
      } catch {
        reject(new Error('上传失败。'));
        return;
      }

      if (request.status < 200 || request.status >= 300) {
        reject(new Error(result.error || '上传失败。'));
        return;
      }

      resolve(result);
    });

    request.addEventListener('error', () => {
      reject(new Error('网络中断，请再试一次。'));
    });

    request.open('POST', url);
    request.send(formData);
  });
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
  const uploadUrl = eventId ? `/api/events/${encodeURIComponent(eventId)}/upload` : '/api/upload';

  button.disabled = true;
  setProgress(0);
  setStatus(uploadStatus, '正在上传... 0%');

  try {
    const result = await uploadWithProgress(uploadUrl, formData, (percent) => {
      setProgress(percent);
      setStatus(
        uploadStatus,
        percent >= 100
          ? '文件已接收，正在送到 Google Drive...'
          : `正在上传... ${Math.round(percent)}%`
      );
    });

    setProgress(100);
    setStatus(uploadStatus, `上传完成：${result.name}`, 'success');
    uploadForm.reset();
    fileLabel.textContent = '选择文件';
  } catch (error) {
    setStatus(uploadStatus, error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

resetProgress();

loadPublicConfig().catch((error) => {
  setStatus(uploadStatus, error.message, 'error');
});
