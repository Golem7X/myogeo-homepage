'use strict';
/* ── Admin login page — Telegram OTP flow ── */

// Redirect if already logged in
fetch('/admin/api/data').then(function (r) {
  if (r.ok) location.replace('/admin/');
});

var COOLDOWN_S  = 60;
var cooldownEnd = 0;
var cooldownTimer = null;

var sendBtn     = document.getElementById('send-btn');
var verifyBtn   = document.getElementById('verify-btn');
var otpInput    = document.getElementById('otp');
var msgEl       = document.getElementById('msg');
var cooldownEl  = document.getElementById('cooldown');
var phaseSend   = document.getElementById('phase-send');
var phaseVerify = document.getElementById('phase-verify');
var step1       = document.getElementById('step1');
var step2       = document.getElementById('step2');

function setMsg(text, type) {
  msgEl.textContent = text;
  msgEl.className = 'msg' + (type ? ' ' + type : '');
}

/* ── Send code ─────────────────────────────────────────────────────────── */
sendBtn.addEventListener('click', sendCode);
document.getElementById('resend-link').addEventListener('click', function (e) {
  e.preventDefault(); sendCode();
});

function sendCode() {
  if (Date.now() < cooldownEnd) return;
  sendBtn.disabled = true;
  sendBtn.innerHTML = '<span class="tg-icon">⏳</span> Sending…';
  setMsg('');

  fetch('/admin/api/send-code', { method: 'POST' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) {
        phaseVerify.classList.remove('hidden');
        step1.classList.remove('active'); step1.classList.add('done');
        step2.classList.add('active');
        otpInput.focus();
        setMsg('✓ Code sent! Check your Telegram bot.', 'ok');
        startCooldown();
      } else {
        setMsg(d.error || 'Failed to send code.', '');
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<span class="tg-icon">✈️</span> Send code to Telegram';
      }
    })
    .catch(function () {
      setMsg('Network error — try again.', '');
      sendBtn.disabled = false;
      sendBtn.innerHTML = '<span class="tg-icon">✈️</span> Send code to Telegram';
    });
}

function startCooldown() {
  cooldownEnd = Date.now() + COOLDOWN_S * 1000;
  sendBtn.innerHTML = '<span class="tg-icon">✈️</span> Send code to Telegram';
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = setInterval(function () {
    var left = Math.ceil((cooldownEnd - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(cooldownTimer);
      sendBtn.disabled = false;
      cooldownEl.textContent = '';
    } else {
      sendBtn.disabled = true;
      cooldownEl.textContent = 'Resend available in ' + left + 's';
    }
  }, 1000);
}

/* ── Verify code ───────────────────────────────────────────────────────── */
otpInput.addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '').slice(0, 6);
  if (this.value.length === 6) verifyCode();
});

verifyBtn.addEventListener('click', verifyCode);

function verifyCode() {
  var code = otpInput.value.trim();
  if (code.length !== 6) { setMsg('Enter the full 6-digit code.', ''); return; }
  verifyBtn.disabled = true; verifyBtn.textContent = 'Verifying…';
  setMsg('', '');

  fetch('/admin/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code }),
  })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) {
        step2.classList.remove('active'); step2.classList.add('done');
        setMsg('✓ Verified! Redirecting…', 'ok');
        setTimeout(function () { location.replace('/admin/'); }, 600);
      } else {
        setMsg(d.error || 'Invalid code — try again.', '');
        otpInput.value = '';
        otpInput.focus();
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify & Sign in';
      }
    })
    .catch(function () {
      setMsg('Network error — try again.', '');
      verifyBtn.disabled = false;
      verifyBtn.textContent = 'Verify & Sign in';
    });
}
