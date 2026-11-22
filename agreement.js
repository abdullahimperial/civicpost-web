'use strict';
(() => {
  const entry = document.getElementById('opening-agreement');
  const version = document.documentElement.dataset.webAgreement;
  // The existing privacy menu clears this key. Old informational notices have a different value.
  const storageKey = 'civicpost-notice-v1';

  function openApp(moveFocus) {
    const template = document.getElementById('civicpost-app');
    const shell = template.content;
    const scripts = Array.from(shell.querySelectorAll('script[src]'), placeholder => {
      const script = document.createElement('script');
      script.async = false;
      script.src = placeholder.getAttribute('src');
      placeholder.remove();
      return script;
    });
    if (moveFocus) {
      scripts[scripts.length - 1].addEventListener('load', () => {
        if (document.activeElement === document.body) document.getElementById('panel')?.focus();
      });
    }
    entry.replaceWith(shell);
    template.remove();
    for (const script of scripts) document.head.appendChild(script);
  }

  let remembered = false;
  try { remembered = localStorage.getItem(storageKey) === version; } catch {}
  if (remembered) {
    openApp(false);
    return;
  }

  const accept = document.getElementById('agreement-accept');
  const decline = document.getElementById('agreement-decline');
  const choice = document.getElementById('agreement-choice');
  const declined = document.getElementById('agreement-declined');
  accept.disabled = decline.disabled = false;
  accept.addEventListener('click', () => {
    try { localStorage.setItem(storageKey, version); } catch {}
    openApp(true);
  });
  decline.addEventListener('click', () => {
    choice.hidden = true;
    declined.hidden = false;
    declined.querySelector('p').focus();
  });
  document.getElementById('agreement-review').addEventListener('click', () => {
    declined.hidden = true;
    choice.hidden = false;
    accept.focus();
  });
})();
