(function () {
const AUDIT_KEY = 'yt_audit_conf_threshold';
// Soglia default per “Verificate”
const DEFAULT_THRESHOLD = 0.25;

function getThreshold() {
try {
const v = localStorage.getItem(AUDIT_KEY);
const n = v ? Number(v) : NaN;
return Number.isFinite(n) ? n : DEFAULT_THRESHOLD;
} catch {
return DEFAULT_THRESHOLD;
}
}

function setThreshold(v) {
try {
const n = Math.max(0, Math.min(1, Number(v)));
localStorage.setItem(AUDIT_KEY, String(n));
return n;
} catch {
return DEFAULT_THRESHOLD;
}
}

// Espone una piccola API globale per la UI
window.YTAUDIT = {
getThreshold,
setThreshold,
version: 'v2'
};

// Se vuoi mostrare la soglia nella pagina
document.addEventListener('DOMContentLoaded', () => {
const info = document.querySelector('[data-yt-audit-info]');
if (info) {
info.textContent = Soglia verifica ${getThreshold()}. Clic su Guarda video apre modale;
}
});
})();
