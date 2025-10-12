const api = typeof browser !== 'undefined' ? browser : chrome;

api.runtime.onInstalled.addListener(() => {
  api.contextMenus.create({
    id: 'addToBookmarks',
    title: 'Add to Bookmarks',
    contexts: ['page', 'link']
  });
});

api.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'addToBookmarks') {
    let url, title;
    
    if (info.linkUrl) {
      url = info.linkUrl;
      title = info.selectionText || info.linkUrl;
    } else {
      url = info.pageUrl || (tab ? tab.url : null); 
      title = tab ? tab.title : 'New Bookmark';
    }

    if (!url) {
        return;
    }
    
    const data = await api.storage.local.get(['bookmarks']);
    const bookmarks = data.bookmarks || [];
    
    const exists = bookmarks.find(b => b.url === url);
    if (exists) {
      api.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Bookmark Manager',
        message: 'This page is already bookmarked'
      });
      return;
    }
    
    const bookmark = {
      id: generateId(),
      title: title,
      url: url,
      description: '',
      tags: [],
      folder: '',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    bookmarks.push(bookmark);
    
    await api.storage.local.set({ bookmarks });
    
    api.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Bookmark Added',
      message: `"${title}" has been added to your bookmarks`
    });
  }
});

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}