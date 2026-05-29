function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.className = 'toast-item';

  const palette = {
    success: { icon: 'fa-circle-check', bg: 'rgba(9,20,9,0.95)', border: 'rgba(118,255,122,0.4)', color: '#76FF7A' },
    error: { icon: 'fa-triangle-exclamation', bg: 'rgba(20,9,9,0.95)', border: 'rgba(248,113,113,0.4)', color: '#f87171' },
    info: { icon: 'fa-circle-info', bg: 'rgba(9,9,20,0.95)', border: 'rgba(135,206,250,0.35)', color: '#87CEFA' }
  };

  const style = palette[type] || palette.success;
  toast.style.cssText = `background:${style.bg}; border:3px solid ${style.border}; color:${style.color};`;
  const icon = document.createElement('i');
  icon.className = `fa-solid ${style.icon}`;
  const text = document.createElement('span');
  text.textContent = message;
  toast.append(icon, text);

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  window.clearTimeout(toast._timeout);
  toast._timeout = window.setTimeout(() => {
    toast.classList.remove('visible');
    window.setTimeout(() => toast.remove(), 200);
  }, 2800);
}

export { showToast };
