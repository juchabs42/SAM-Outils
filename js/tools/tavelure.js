// Outil en cours d'intégration (version provisoire).
export async function mount(root, ctx) {
  ctx.filters({ location: false, period: false });
  root.innerHTML = `<div class="sam-tool-error" style="background:#f7f7f9;border-color:#e5e7eb;color:#3a3f47">
    <strong>Intégration en cours.</strong><br>Cet outil arrive dans la prochaine mise à jour de SAM Outils.</div>`;
}
