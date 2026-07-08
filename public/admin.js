const adminForm = document.querySelector('#adminForm');
const adminToken = document.querySelector('#adminToken');
const eventList = document.querySelector('#eventList');
const existingEventCards = document.querySelector('#existingEventCards');
const addEvent = document.querySelector('#addEvent');
const configStatus = document.querySelector('#configStatus');

let events = [];
let activeEventId = '';

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status ${type}`.trim();
}

function showToast(message) {
  let toast = document.querySelector('.toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.append(toast);
  }

  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 1800);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function slugify(value) {
  const slug = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || `event-${Math.random().toString(16).slice(2, 8)}`;
}

function eventUrl(eventId) {
  return `${window.location.origin}/e/${encodeURIComponent(eventId)}`;
}

function ensureAdminToken() {
  if (!adminToken.value) {
    throw new Error('请先输入管理员密钥。');
  }
}

async function persistEvents() {
  ensureAdminToken();

  const response = await fetch('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-token': adminToken.value
    },
    body: JSON.stringify({
      activeEventId,
      events
    })
  });
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || '保存失败。');
  }

  events = result.events || [];
  activeEventId = result.activeEventId || events[0]?.id || '';
  renderAdmin();
  return result;
}

function renderEditorPlaceholder() {
  eventList.innerHTML = '<p class="empty-state">使用下方卡片的 Edit 编辑活动，或点击「新增活动」建立新链接。</p>';
}

function renderExistingEvents() {
  existingEventCards.innerHTML = '';

  if (!events.length) {
    existingEventCards.innerHTML = '<p class="empty-state">还没有活动。点击「新增活动」开始建立链接。</p>';
    return;
  }

  events.forEach((event, index) => {
    const card = document.createElement('article');
    card.className = 'existing-event-card';
    card.innerHTML = `
      <div class="event-card-top">
        <span class="event-status ${event.enabled === false ? 'off' : ''}">${event.enabled === false ? 'Disabled' : 'Enabled'}</span>
        ${event.id === activeEventId ? '<span class="event-status default">Homepage</span>' : ''}
      </div>
      <h3>${escapeHtml(event.title || event.id)}</h3>
      <p>${escapeHtml(event.description || 'No label')}</p>
      <dl>
        <div>
          <dt>Slug</dt>
          <dd>${escapeHtml(event.id)}</dd>
        </div>
        <div>
          <dt>Folder</dt>
          <dd>${escapeHtml(event.folderId)}</dd>
        </div>
      </dl>
      <div class="link-row">
        <a class="event-link" href="${eventUrl(event.id)}" target="_blank" rel="noreferrer">${eventUrl(event.id)}</a>
      </div>
      <div class="folder-actions card-actions">
        <button type="button" class="secondary-action edit-existing">Edit</button>
        <a class="secondary-action card-link-action" href="${eventUrl(event.id)}" target="_blank" rel="noreferrer">Open</a>
        <button type="button" class="secondary-action copy-existing">Copy link</button>
        <button type="button" class="secondary-action danger-action delete-existing">Delete</button>
      </div>
    `;

    card.querySelector('.edit-existing').addEventListener('click', () => {
      openEventModal(index);
    });
    card.querySelector('.copy-existing').addEventListener('click', async () => {
      await navigator.clipboard.writeText(eventUrl(event.id));
      showToast('链接已复制');
      setStatus(configStatus, '链接已复制。', 'success');
    });
    card.querySelector('.delete-existing').addEventListener('click', async () => {
      const confirmed = window.confirm(`删除「${event.title || event.id}」这个活动链接吗？`);

      if (!confirmed) {
        return;
      }

      try {
        events.splice(index, 1);
        if (!events.some((item) => item.id === activeEventId)) {
          activeEventId = events[0]?.id || '';
        }
        await persistEvents();
        showToast('活动已删除');
        setStatus(configStatus, '活动已删除。', 'success');
      } catch (error) {
        setStatus(configStatus, error.message, 'error');
      }
    });

    existingEventCards.append(card);
  });
}

function renderAdmin() {
  renderEditorPlaceholder();
  renderExistingEvents();
}

function closeEventModal() {
  document.querySelector('.modal-backdrop')?.remove();
}

function openEventModal(index = null) {
  const isEditing = index !== null;
  const source = isEditing
    ? events[index]
    : {
        id: slugify(`event-${events.length + 1}`),
        title: `活动 ${events.length + 1}`,
        folderId: '',
        description: '',
        enabled: true
      };

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <form class="event-modal" id="eventModalForm">
      <div class="modal-heading">
        <div>
          <p class="eyebrow">${isEditing ? 'EDIT EVENT' : 'NEW EVENT'}</p>
          <h2>${isEditing ? '编辑活动链接' : '新增活动链接'}</h2>
        </div>
        <button type="button" class="icon-action close-modal" aria-label="Close">×</button>
      </div>

      <label class="mini-field">
        <span>活动标题</span>
        <input id="modalEventTitle" value="${escapeHtml(source.title)}" maxlength="120" placeholder="活动标题" required />
      </label>
      <label class="mini-field">
        <span>链接代号</span>
        <input id="modalEventId" value="${escapeHtml(source.id)}" placeholder="acs-prayer" required />
      </label>
      <label class="mini-field">
        <span>Google Drive folder ID</span>
        <input id="modalFolderId" value="${escapeHtml(source.folderId)}" placeholder="Google Drive folder ID" required />
      </label>
      <label class="mini-field">
        <span>备注 / 显示标签</span>
        <textarea id="modalEventDescription" placeholder="显示在上传页右上角">${escapeHtml(source.description || '')}</textarea>
      </label>
      <label class="check-row">
        <input id="modalActiveEvent" type="checkbox" ${source.id === activeEventId ? 'checked' : ''} />
        <span>设为首页默认活动</span>
      </label>
      <label class="check-row">
        <input id="modalEnabled" type="checkbox" ${source.enabled !== false ? 'checked' : ''} />
        <span>启用上传链接</span>
      </label>

      <div class="modal-actions">
        <button type="button" class="secondary-action close-modal">取消</button>
        <button type="submit" class="primary-action">${isEditing ? '保存修改' : '建立活动'}</button>
      </div>
    </form>
  `;

  document.body.append(backdrop);

  const form = backdrop.querySelector('#eventModalForm');
  const titleInput = backdrop.querySelector('#modalEventTitle');
  const idInput = backdrop.querySelector('#modalEventId');
  const closeButtons = backdrop.querySelectorAll('.close-modal');

  titleInput.addEventListener('input', () => {
    if (!idInput.dataset.touched && !isEditing) {
      idInput.value = slugify(titleInput.value);
    }
  });
  idInput.addEventListener('input', () => {
    idInput.dataset.touched = 'true';
    idInput.value = slugify(idInput.value);
  });
  closeButtons.forEach((button) => button.addEventListener('click', closeEventModal));
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeEventModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const nextEvent = {
      id: slugify(idInput.value),
      title: titleInput.value.trim(),
      folderId: backdrop.querySelector('#modalFolderId').value.trim(),
      description: backdrop.querySelector('#modalEventDescription').value.trim(),
      enabled: backdrop.querySelector('#modalEnabled').checked
    };

    if (!nextEvent.title || !nextEvent.folderId) {
      setStatus(configStatus, '请填写活动标题和 folder ID。', 'error');
      return;
    }

    const duplicate = events.some((item, itemIndex) => item.id === nextEvent.id && itemIndex !== index);
    if (duplicate) {
      setStatus(configStatus, '链接代号已经存在，请换一个。', 'error');
      return;
    }

    try {
      if (isEditing) {
        events[index] = nextEvent;
      } else {
        events.push(nextEvent);
      }

      if (backdrop.querySelector('#modalActiveEvent').checked || !activeEventId) {
        activeEventId = nextEvent.id;
      }

      await persistEvents();
      closeEventModal();
      showToast(isEditing ? '活动已更新' : '活动已建立');
      setStatus(configStatus, isEditing ? '活动已更新。' : '活动已建立。', 'success');
    } catch (error) {
      setStatus(configStatus, error.message, 'error');
    }
  });

  titleInput.focus();
}

async function fetchConfig() {
  const response = await fetch('/api/config', {
    headers: {
      'x-admin-token': adminToken.value
    }
  });
  const config = await response.json();

  if (!response.ok) {
    throw new Error(config.error || 'Unable to load settings.');
  }

  events = config.events || [];
  activeEventId = config.activeEventId || events[0]?.id || '';
  renderAdmin();
}

adminToken.addEventListener('change', async () => {
  if (!adminToken.value) {
    return;
  }

  try {
    setStatus(configStatus, '正在读取活动...');
    await fetchConfig();
    setStatus(configStatus, '活动已读取。', 'success');
  } catch (error) {
    setStatus(configStatus, error.message, 'error');
  }
});

addEvent.addEventListener('click', () => {
  try {
    ensureAdminToken();
    openEventModal();
  } catch (error) {
    setStatus(configStatus, error.message, 'error');
  }
});

adminForm.addEventListener('submit', (event) => {
  event.preventDefault();
});

renderAdmin();
setStatus(configStatus, '输入管理员密钥后读取活动。');
