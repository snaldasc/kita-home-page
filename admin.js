document.addEventListener("DOMContentLoaded", async () => {
  const config = window.KITA_SUPABASE || {};
  const content = document.getElementById("admin-content");
  if (!config.url || !config.key || !window.supabase) {
    content.innerHTML = '<div class="blocked">Supabase ist nicht konfiguriert.</div>';
    return;
  }

  const client = window.supabase.createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const { data: { session } } = await client.auth.getSession();
  if (!session) {
    content.innerHTML = '<div class="blocked">Bitte zuerst als Admin anmelden.</div>';
    return;
  }

  const { data: profile } = await client.from("user_profiles").select("is_admin").eq("id", session.user.id).maybeSingle();
  if (!profile?.is_admin) {
    content.innerHTML = '<div class="blocked">Kein Zugriff. Diese Seite ist nur für Admins sichtbar.</div>';
    return;
  }

  const renderRequests = async () => {
    const { data, error } = await client.from("user_profiles").select("id, first_name, last_name, email, created_at").eq("approved", false).eq("is_admin", false).order("created_at", { ascending: true });
    if (error) {
      content.innerHTML = `<div class="blocked">Registrierungen konnten nicht geladen werden: ${error.message}</div>`;
      return;
    }
    if (!data.length) {
      content.innerHTML = '<p class="message">Keine offenen Registrierungsanfragen.</p>';
      return;
    }
    content.innerHTML = `<div class="request-list">${data.map((request) => `
      <article class="request" data-user-id="${request.id}">
        <div><strong>${escapeHtml(`${request.first_name} ${request.last_name}`.trim() || "Ohne Namen")}</strong><small>${escapeHtml(request.email)}</small></div>
        <div class="actions"><button class="approve" type="button" data-action="approve">Freigeben</button><button class="reject" type="button" data-action="reject">Ablehnen</button></div>
      </article>
    `).join("")}</div>`;
    content.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => updateRequest(button)));
  };

  const updateRequest = async (button) => {
    const row = button.closest("[data-user-id]");
    const id = row.dataset.userId;
    if (button.dataset.action === "approve") {
      const { error } = await client.from("user_profiles").update({ approved: true }).eq("id", id);
      if (error) {
        content.insertAdjacentHTML("afterbegin", `<p class="message">Freigabe fehlgeschlagen: ${escapeHtml(error.message)}</p>`);
        return;
      }
    } else {
      const { error } = await client.from("user_profiles").delete().eq("id", id);
      if (error) {
        content.insertAdjacentHTML("afterbegin", `<p class="message">Ablehnung fehlgeschlagen: ${escapeHtml(error.message)}</p>`);
        return;
      }
    }
    await renderRequests();
  };

  const escapeHtml = (value) => String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  await renderRequests();
});
