chrome.tabs.query({active:true,currentWindow:true}, tabs => {document.querySelector("#target").textContent = tabs[0]?.url || "no active website";});
