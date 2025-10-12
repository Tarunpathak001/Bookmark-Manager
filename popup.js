let bookmarks = [];
let folders = [];
let currentView = 'list';
let editingBookmarkId = null;
let editingFolderId = null;
let selectMode = false;
let selectedBookmarks = new Set();
let draggedBookmark = null;

const bookmarksList = document.getElementById('bookmarksList');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const topBar = document.querySelector('.top-bar');
const folderFilter = document.getElementById('folderFilter');
const listViewBtn = document.getElementById('listView');
const gridViewBtn = document.getElementById('gridView');
const addCurrentPageBtn = document.getElementById('addCurrentPage');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const bookmarkModal = document.getElementById('bookmarkModal');
const folderModal = document.getElementById('folderModal');
const bookmarkForm = document.getElementById('bookmarkForm');
const folderForm = document.getElementById('folderForm');
const foldersList = document.getElementById('foldersList');
const addFolderBtn = document.getElementById('addFolderBtn');
const selectModeBtn = document.getElementById('selectModeBtn');
const bulkActionsBar = document.getElementById('bulkActionsBar');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const cancelSelectBtn = document.getElementById('cancelSelectBtn');
const selectedCountSpan = document.getElementById('selectedCount');

document.addEventListener('DOMContentLoaded', () => {
  loadData();
  setupEventListeners();
});

async function loadData() {
  const data = await chrome.storage.local.get(['bookmarks', 'folders']);
  bookmarks = data.bookmarks || [];
  folders = data.folders || [];
  renderBookmarks();
  renderFolders();
  updateFolderSelects();
}

async function saveBookmarks() {
  await chrome.storage.local.set({ bookmarks });
  renderBookmarks();
  renderFolders();
}

async function saveFolders() {
  await chrome.storage.local.set({ folders });
  renderFolders();
  updateFolderSelects();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getFolderName(folderId) {
  const folder = folders.find(f => f.id === folderId);
  return folder ? folder.name : 'Unknown';
}

function setupEventListeners() {
  listViewBtn.addEventListener('click', () => setView('list'));
  gridViewBtn.addEventListener('click', () => setView('grid'));
  
  searchInput.addEventListener('input', renderBookmarks);
  searchInput.addEventListener('focus', () => topBar.classList.add('search-focused'));
  searchInput.addEventListener('blur', () => topBar.classList.remove('search-focused'));
  
  folderFilter.addEventListener('change', renderBookmarks);
  addCurrentPageBtn.addEventListener('click', addCurrentPage);
  
  importBtn.addEventListener('click', () => document.getElementById('importFile').click());
  exportBtn.addEventListener('click', exportBookmarks);
  document.getElementById('importFile').addEventListener('change', importBookmarks);
  
  document.getElementById('closeModal').addEventListener('click', closeBookmarkModal);
  document.getElementById('cancelBtn').addEventListener('click', closeBookmarkModal);
  bookmarkForm.addEventListener('submit', saveBookmark);
  
  document.getElementById('closeFolderModal').addEventListener('click', closeFolderModal);
  document.getElementById('cancelFolderBtn').addEventListener('click', closeFolderModal);
  addFolderBtn.addEventListener('click', openFolderModal);
  folderForm.addEventListener('submit', saveFolder);
  
  bookmarkModal.addEventListener('click', (e) => {
    if (e.target === bookmarkModal) closeBookmarkModal();
  });
  folderModal.addEventListener('click', (e) => {
    if (e.target === folderModal) closeFolderModal();
  });
  
  selectModeBtn.addEventListener('click', toggleSelectMode);
  bulkDeleteBtn.addEventListener('click', bulkDeleteBookmarks);
  cancelSelectBtn.addEventListener('click', toggleSelectMode);
}

function setView(view) {
  currentView = view;
  listViewBtn.classList.toggle('active', view === 'list');
  gridViewBtn.classList.toggle('active', view === 'grid');
  bookmarksList.classList.toggle('grid-view', view === 'grid');
}

function renderBookmarks() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedFolder = folderFilter.value;

  let filtered = bookmarks.filter(bookmark => {
    const matchesSearch = !searchTerm ||
      bookmark.title.toLowerCase().includes(searchTerm) ||
      bookmark.url.toLowerCase().includes(searchTerm) ||
      (bookmark.description && bookmark.description.toLowerCase().includes(searchTerm)) ||
      (bookmark.tags && bookmark.tags.some(tag => tag.toLowerCase().includes(searchTerm)));

    const matchesFolder = selectedFolder === 'all' || bookmark.folder === selectedFolder;

    return matchesSearch && matchesFolder;
  });

  if (filtered.length === 0) {
    bookmarksList.innerHTML = '';
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');

  bookmarksList.innerHTML = filtered.map(bookmark => `
    <div class="bookmark-card ${selectMode ? 'select-mode' : ''}"
         data-id="${bookmark.id}"
         draggable="${!selectMode}">
      ${selectMode ? `<input type="checkbox" class="bookmark-checkbox" data-id="${bookmark.id}" ${selectedBookmarks.has(bookmark.id) ? 'checked' : ''}>` : ''}
      <div class="bookmark-header">
        <div class="bookmark-title" title="${escapeHtml(bookmark.title)}">
          ${escapeHtml(bookmark.title)}
        </div>
        <div class="bookmark-actions">
          <button class="bookmark-action-btn edit-btn" title="Edit">✎</button>
          <button class="bookmark-action-btn delete-btn" title="Delete">🗑</button>
        </div>
      </div>
      <div class="bookmark-url" title="${escapeHtml(bookmark.url)}">
        ${escapeHtml(bookmark.url)}
      </div>
      ${bookmark.description ? `
        <div class="bookmark-description">${escapeHtml(bookmark.description)}</div>
      ` : ''}
      <div class="bookmark-meta">
        ${bookmark.folder ? `
          <span class="bookmark-folder">${escapeHtml(getFolderName(bookmark.folder))}</span>
        ` : ''}
        ${bookmark.tags && bookmark.tags.length > 0 ? bookmark.tags.map(tag => `
          <span class="bookmark-tag">${escapeHtml(tag)}</span>
        `).join('') : ''}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.bookmark-card').forEach(card => {
    const id = card.dataset.id;

    const checkbox = card.querySelector('.bookmark-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if (e.target.checked) {
          selectedBookmarks.add(id);
        } else {
          selectedBookmarks.delete(id);
        }
        updateSelectedCount();
      });
    }

    card.addEventListener('click', (e) => {
      if (selectMode) {
        if (checkbox && !e.target.classList.contains('bookmark-action-btn')) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      } else if (!e.target.classList.contains('bookmark-action-btn')) {
        const bookmark = bookmarks.find(b => b.id === id);
        if (bookmark) {
          chrome.tabs.create({ url: bookmark.url });
        }
      }
    });

    if (!selectMode) {
      card.addEventListener('dragstart', (e) => {
        draggedBookmark = id;
        card.classList.add('dragging');
      });

      card.addEventListener('dragend', (e) => {
        card.classList.remove('dragging');
        draggedBookmark = null;
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        document.querySelectorAll('.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggedBookmark && draggedBookmark !== id) {
          card.classList.add('drag-over');
        }
      });

      card.addEventListener('dragleave', (e) => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');

        if (draggedBookmark && draggedBookmark !== id) {
          const draggedIndex = bookmarks.findIndex(b => b.id === draggedBookmark);
          const targetIndex = bookmarks.findIndex(b => b.id === id);

          if (draggedIndex !== -1 && targetIndex !== -1) {
            const [removed] = bookmarks.splice(draggedIndex, 1);
            bookmarks.splice(targetIndex, 0, removed);
            await saveBookmarks();
          }
        }
      });
    }

    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditBookmarkModal(id);
    });

    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBookmark(id);
    });
  });
}

function renderFolders() {
  if (folders.length === 0) {
    foldersList.innerHTML = '<p style="padding: 12px; color: #999; font-size: 12px;">No folders yet</p>';
    return;
  }

  foldersList.innerHTML = folders.map(folder => {
    const count = bookmarks.filter(b => b.folder === folder.id).length;
    return `
      <div class="folder-item" data-id="${folder.id}">
        <span class="folder-name">${escapeHtml(folder.name)}</span>
        <span class="folder-count">${count}</span>
        <div class="folder-actions">
          <button class="folder-action-btn edit-folder-btn" title="Rename">✎</button>
          <button class="folder-action-btn delete-folder-btn" title="Delete">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.folder-item').forEach(item => {
    const id = item.dataset.id;

    item.addEventListener('click', (e) => {
      if (!e.target.classList.contains('folder-action-btn')) {
        folderFilter.value = id;
        renderBookmarks();
      }
    });

    item.querySelector('.edit-folder-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openEditFolderModal(id);
    });

    item.querySelector('.delete-folder-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteFolder(id);
    });
    
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (draggedBookmark) {
        item.classList.add('drag-over-folder');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over-folder');
    });

    item.addEventListener('drop', async (e) => {
      e.preventDefault();
      item.classList.remove('drag-over-folder');
      
      if (draggedBookmark) {
        const folderId = item.dataset.id;
        const bookmarkIndex = bookmarks.findIndex(b => b.id === draggedBookmark);

        if (bookmarkIndex !== -1) {
          bookmarks[bookmarkIndex].folder = folderId;
          bookmarks[bookmarkIndex].updatedAt = Date.now();
          await saveBookmarks();
        }
        draggedBookmark = null;
      }
    });
  });
}

function updateFolderSelects() {
  const filterOptions = folders.map(f =>
    `<option value="${f.id}">${escapeHtml(f.name)}</option>`
  ).join('');
  folderFilter.innerHTML = `<option value="all">All Folders</option>${filterOptions}`;

  const formOptions = folders.map(f =>
    `<option value="${f.id}">${escapeHtml(f.name)}</option>`
  ).join('');
  document.getElementById('bookmarkFolder').innerHTML = `<option value="">No folder</option>${formOptions}`;
}

async function addCurrentPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  document.getElementById('modalTitle').textContent = 'Add Bookmark';
  document.getElementById('bookmarkTitle').value = tab.title;
  document.getElementById('bookmarkUrl').value = tab.url;
  document.getElementById('bookmarkDescription').value = '';
  document.getElementById('bookmarkTags').value = '';
  document.getElementById('bookmarkFolder').value = '';
  editingBookmarkId = null;
  bookmarkModal.classList.remove('hidden');
}

function openEditBookmarkModal(id) {
  const bookmark = bookmarks.find(b => b.id === id);
  if (!bookmark) return;

  document.getElementById('modalTitle').textContent = 'Edit Bookmark';
  document.getElementById('bookmarkTitle').value = bookmark.title;
  document.getElementById('bookmarkUrl').value = bookmark.url;
  document.getElementById('bookmarkDescription').value = bookmark.description || '';
  document.getElementById('bookmarkTags').value = bookmark.tags ? bookmark.tags.join(', ') : '';
  document.getElementById('bookmarkFolder').value = bookmark.folder || '';
  editingBookmarkId = id;
  bookmarkModal.classList.remove('hidden');
}

function closeBookmarkModal() {
  bookmarkModal.classList.add('hidden');
  bookmarkForm.reset();
  editingBookmarkId = null;
}

async function saveBookmark(e) {
  e.preventDefault();

  const title = document.getElementById('bookmarkTitle').value.trim();
  const url = document.getElementById('bookmarkUrl').value.trim();
  const description = document.getElementById('bookmarkDescription').value.trim();
  const tagsInput = document.getElementById('bookmarkTags').value.trim();
  const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()).filter(t => t) : [];
  const folder = document.getElementById('bookmarkFolder').value;

  if (!title || !url) return;

  if (editingBookmarkId) {
    const index = bookmarks.findIndex(b => b.id === editingBookmarkId);
    if (index !== -1) {
      bookmarks[index] = {
        ...bookmarks[index],
        title,
        url,
        description,
        tags,
        folder,
        updatedAt: Date.now()
      };
    }
  } else {
    if (bookmarks.some(b => b.url === url)) {
      alert('This page is already bookmarked');
      return;
    }

    const bookmark = {
      id: generateId(),
      title,
      url,
      description,
      tags,
      folder,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    bookmarks.push(bookmark);
  }

  await saveBookmarks();
  closeBookmarkModal();
}

async function deleteBookmark(id) {
  if (!confirm('Delete this bookmark?')) return;

  bookmarks = bookmarks.filter(b => b.id !== id);
  await saveBookmarks();
}

function openFolderModal() {
  document.getElementById('folderModalTitle').textContent = 'New Folder';
  document.getElementById('folderName').value = '';
  editingFolderId = null;
  folderModal.classList.remove('hidden');
}

function openEditFolderModal(id) {
  const folder = folders.find(f => f.id === id);
  if (!folder) return;

  document.getElementById('folderModalTitle').textContent = 'Rename Folder';
  document.getElementById('folderName').value = folder.name;
  editingFolderId = id;
  folderModal.classList.remove('hidden');
}

function closeFolderModal() {
  folderModal.classList.add('hidden');
  folderForm.reset();
  editingFolderId = null;
}

async function saveFolder(e) {
  e.preventDefault();

  const name = document.getElementById('folderName').value.trim();
  if (!name) return;

  if (editingFolderId) {
    const index = folders.findIndex(f => f.id === editingFolderId);
    if (index !== -1) {
      folders[index].name = name;
    }
  } else {
    const folder = {
      id: generateId(),
      name,
      createdAt: Date.now()
    };
    folders.push(folder);
  }

  await saveFolders();
  closeFolderModal();
}

async function deleteFolder(id) {
  const count = bookmarks.filter(b => b.folder === id).length;
  const message = count > 0
    ? `Delete this folder? ${count} bookmark(s) will be moved to "No folder".`
    : 'Delete this folder?';

  if (!confirm(message)) return;

  bookmarks.forEach(bookmark => {
    if (bookmark.folder === id) {
      bookmark.folder = '';
    }
  });

  folders = folders.filter(f => f.id !== id);
  await saveFolders();
  await saveBookmarks();
}

function exportBookmarks() {
  const html = generateBookmarksHtml();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bookmarks_${Date.now()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

function generateBookmarksHtml() {
  let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n';
  html += '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n';
  html += '<TITLE>Bookmarks</TITLE>\n';
  html += '<H1>Bookmarks</H1>\n';
  html += '<DL><p>\n';

  const noFolder = bookmarks.filter(b => !b.folder);
  const folderGroups = folders.map(folder => ({
    folder,
    bookmarks: bookmarks.filter(b => b.folder === folder.id)
  }));

  if (noFolder.length > 0) {
    noFolder.forEach(bookmark => {
      html += `    <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${Math.floor(bookmark.createdAt / 1000)}">${escapeHtml(bookmark.title)}</A>\n`;
    });
  }

  folderGroups.forEach(({ folder, bookmarks }) => {
    if (bookmarks.length > 0) {
      html += `    <DT><H3 ADD_DATE="${Math.floor(folder.createdAt / 1000)}">${escapeHtml(folder.name)}</H3>\n`;
      html += '    <DL><p>\n';
      bookmarks.forEach(bookmark => {
        html += `        <DT><A HREF="${escapeHtml(bookmark.url)}" ADD_DATE="${Math.floor(bookmark.createdAt / 1000)}">${escapeHtml(bookmark.title)}</A>\n`;
      });
      html += '    </DL><p>\n';
    }
  });

  html += '</DL><p>\n';
  return html;
}

function importBookmarks(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(event) {
    const html = event.target.result;
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const imported = parseBookmarksHtml(doc);

    if (imported.bookmarks.length === 0) {
      alert('No bookmarks found in file');
      return;
    }

    const folderMapping = {};
    
    imported.folders.forEach(importedFolder => {
      const existingFolder = folders.find(f => f.name === importedFolder.name);
      if (existingFolder) {
        folderMapping[importedFolder.id] = existingFolder.id;
      } else {
        const newFolder = {
          id: generateId(),
          name: importedFolder.name,
          createdAt: Date.now()
        };
        folders.push(newFolder);
        folderMapping[importedFolder.id] = newFolder.id;
      }
    });

    let importedCount = 0;
    let skippedCount = 0;

    imported.bookmarks.forEach(importedBookmark => {
      const existingBookmark = bookmarks.find(b => b.url === importedBookmark.url);
      
      if (existingBookmark) {
        skippedCount++;
        return;
      }

      const newBookmark = {
        id: generateId(),
        title: importedBookmark.title,
        url: importedBookmark.url,
        description: importedBookmark.description || '',
        tags: importedBookmark.tags || [],
        folder: folderMapping[importedBookmark.folder] || '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      bookmarks.push(newBookmark);
      importedCount++;
    });

    await saveFolders();
    await saveBookmarks();
    
    const message = `Import completed!\n• ${importedCount} bookmarks imported\n• ${skippedCount} bookmarks skipped (already exist)`;
    alert(message);
  };

  reader.readAsText(file);
  e.target.value = '';
}

function parseBookmarksHtml(doc) {
  const importedFolders = [];
  const importedBookmarks = [];
  let currentFolder = null;

  const dls = doc.querySelectorAll('DL');

  dls.forEach(dl => {
    const items = dl.querySelectorAll(':scope > DT');

    items.forEach(item => {
      const h3 = item.querySelector('H3');
      const a = item.querySelector('A');

      if (h3) {
        const folderName = h3.textContent.trim();
        const folderId = generateId();
        importedFolders.push({
          id: folderId,
          name: folderName,
          createdAt: Date.now()
        });
        currentFolder = folderId;
      } else if (a) {
        const url = a.getAttribute('HREF');
        const title = a.textContent.trim();

        if (url && title) {
          importedBookmarks.push({
            id: generateId(),
            title,
            url,
            description: '',
            tags: [],
            folder: currentFolder || '',
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
        }
      }
    });

    currentFolder = null;
  });

  return { folders: importedFolders, bookmarks: importedBookmarks };
}

function toggleSelectMode() {
  selectMode = !selectMode;
  selectModeBtn.classList.toggle('active', selectMode);

  if (selectMode) {
    selectedBookmarks.clear();
    bulkActionsBar.classList.remove('hidden');
  } else {
    bulkActionsBar.classList.add('hidden');
  }

  updateSelectedCount();
  renderBookmarks();
}

function updateSelectedCount() {
  const count = selectedBookmarks.size;
  selectedCountSpan.textContent = `${count} selected`;
  bulkDeleteBtn.disabled = count === 0;
}

async function bulkDeleteBookmarks() {
  const count = selectedBookmarks.size;
  if (count === 0) return;

  if (!confirm(`Delete ${count} bookmark(s)?`)) return;

  bookmarks = bookmarks.filter(b => !selectedBookmarks.has(b.id));
  selectedBookmarks.clear();
  await saveBookmarks();
  toggleSelectMode();
}