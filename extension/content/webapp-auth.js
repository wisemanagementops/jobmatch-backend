/**
 * webapp-auth.js
 * Content script that runs on the JobMatch AI webapp
 * Automatically syncs authentication with the extension
 */

(function() {
  console.log('JobMatch AI: Auth sync script loaded');

  // Send auth token to extension
  function sendAuthToExtension() {
    const token = localStorage.getItem('token');
    
    if (token) {
      console.log('JobMatch AI: Found token, sending to extension');
      
      // Send message to extension
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'setAuth',
          token: token
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('JobMatch AI: Extension not available', chrome.runtime.lastError.message);
          } else {
            console.log('JobMatch AI: Auth synced with extension', response);
          }
        });
      }
    } else {
      console.log('JobMatch AI: No token found');
      // Tell extension user is logged out
      if (chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'clearAuth'
        });
      }
    }
  }

  // Send auth immediately when script loads
  sendAuthToExtension();

  // Listen for storage changes (login/logout)
  window.addEventListener('storage', (event) => {
    if (event.key === 'token') {
      console.log('JobMatch AI: Token changed, syncing...');
      sendAuthToExtension();
    }
  });

  // Also check periodically in case storage event doesn't fire
  // (happens when change is in same tab)
  let lastToken = localStorage.getItem('token');
  setInterval(() => {
    const currentToken = localStorage.getItem('token');
    if (currentToken !== lastToken) {
      console.log('JobMatch AI: Token changed (poll), syncing...');
      lastToken = currentToken;
      sendAuthToExtension();
    }
  }, 1000);

  // Listen for custom event from webapp (for immediate sync after login)
  window.addEventListener('jobmatch-auth-changed', () => {
    console.log('JobMatch AI: Auth change event received');
    sendAuthToExtension();
  });

})();
