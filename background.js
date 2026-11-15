// Toolbar icon: open the menu in the current Facebook tab, or open Facebook first.
const FACEBOOK = /^https:\/\/(www|web|accountscenter)\.facebook\.com\//;

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !FACEBOOK.test(tab.url)) {
    await chrome.storage.local.set({ fbAdDisableOpen: Date.now() });
    await chrome.tabs.create({ url: 'https://www.facebook.com/settings/' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'fb-ad-disable-open' });
  } catch (e) {
    // The tab was open before the extension was installed: inject, then the script reads the flag.
    await chrome.storage.local.set({ fbAdDisableOpen: Date.now() });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['fb-ad-disable.js'] });
  }
});
