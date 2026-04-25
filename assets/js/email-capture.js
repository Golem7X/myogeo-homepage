'use strict';

/* ── Email capture: rate-limited, honeypot-guarded ── */
(function () {
  var form = document.getElementById('notify-form');
  if (!form) return;

  var COOLDOWN_MS = 30000;
  var lastSubmit = 0;

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Honeypot: silently drop if the bot trap field is filled
    var honeypot = document.getElementById('notify-website');
    if (honeypot && honeypot.value) return;

    var msg = document.getElementById('notify-msg');
    var now = Date.now();
    if (now - lastSubmit < COOLDOWN_MS) {
      msg.textContent = 'Please wait a moment before submitting again.';
      msg.className = 'email-msg email-msg--err';
      return;
    }

    var emailField = document.getElementById('notify-email');
    var email = emailField.value.trim();
    if (!email || !emailField.checkValidity()) {
      msg.textContent = 'Please enter a valid email address.';
      msg.className = 'email-msg email-msg--err';
      return;
    }

    var btn = form.querySelector('.email-btn');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    lastSubmit = now;

    fetch('https://formspree.io/f/xpwzgrvq', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email: email })
    })
    .then(function (r) {
      if (r.ok) {
        msg.textContent = "You're on the list! We'll notify you at launch.";
        msg.className = 'email-msg email-msg--ok';
        form.reset();
      } else {
        throw new Error();
      }
    })
    .catch(function () {
      msg.innerHTML = 'Something went wrong — email us at <a href="mailto:support@myogeo.org">support@myogeo.org</a> to be notified.';
      msg.className = 'email-msg email-msg--err';
    })
    .finally(function () {
      btn.disabled = false;
      btn.textContent = 'Notify me';
    });
  });
})();
