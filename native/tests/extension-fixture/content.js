chrome.storage.local.get(['visits'], ({visits}) => {
  const count = (visits || 0) + 1;
  chrome.storage.local.set({visits:count}, () => {document.body.dataset.lunaExtension = String(count);});
});
