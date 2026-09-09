document.addEventListener("DOMContentLoaded", async () => {
  const loadingStyle = document.createElement("style");
  loadingStyle.textContent = `
    .content-loading [data-field], .content-loading [data-image-field] { visibility: hidden; }
    .floating-box-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
    .floating-base-layer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; width: min(1100px, calc(100% - 32px)); margin: 28px auto; }
    .floating-base-layer:empty { display: none; }
    .floating-base-slot { width: min(1100px, calc(100% - 32px)); margin: 28px auto; }
    .floating-base-slot .floating-box { position: relative; left: auto !important; top: auto !important; width: 100%; }
    .floating-box { position: absolute; width: min(360px, calc(100vw - 32px)); padding: 24px 22px 18px; border: 1px solid rgba(111,83,38,.22); border-radius: 3px; background: #fff2a8; box-shadow: 4px 8px 18px rgba(67,59,53,.2); pointer-events: auto; cursor: move; }
    .floating-base-layer .floating-box { position: relative; left: auto !important; top: auto !important; width: 100%; }
    .floating-box::before { content: ""; position: absolute; top: -7px; left: 50%; width: 18px; height: 18px; border: 3px solid #f8d7c7; border-radius: 50%; background: #c75c4e; box-shadow: 0 3px 5px rgba(67,59,53,.25); transform: translateX(-50%); }
    .floating-box.floating-base-locked::before { display: none; }
    .floating-box.is-dragging { opacity: .55; }
    .floating-box.drag-target { outline: 3px solid rgba(77,109,95,.3); }
    .floating-box h3 { margin: 0 0 8px; color: #254a3d; }
    .floating-box p { margin: 0; white-space: pre-wrap; color: rgba(47,42,39,.78); }
    .floating-box-image { height: 170px; margin: -24px -22px 18px; overflow: hidden; display: grid; place-items: center; background: rgba(77,109,95,.08); touch-action: none; }
    .floating-box-image img { width: 100%; height: 100%; object-fit: contain; transform-origin: center; }
    .floating-box-tools { display: none; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 16px; color: #433b35; font-size: .76rem; }
    body.editor-enabled .floating-box-tools { display: flex; }
    .floating-box-tools input[type=range] { width: 72px; }
    .floating-box-tools input[type=file] { display: none; }
    .floating-box-tools button, .floating-box-delete { border: 0; border-radius: 999px; padding: 6px 10px; background: #e8e1d7; color: #254a3d; cursor: pointer; }
    .floating-box-tools .floating-layer-button { display: none; }
    body.editor-enabled .floating-box-tools .floating-layer-button { display: inline-block; }
    .floating-box-delete { position: absolute; top: 10px; right: 10px; padding: 2px 8px; display: none; }
    body.editor-enabled .floating-box-delete { display: block; }
    .floating-box-add-actions { position: fixed; right: 22px; bottom: 22px; z-index: 30; display: none; gap: 8px; flex-wrap: wrap; }
    body.editor-enabled .floating-box-add-actions { display: flex; }
    .floating-box-add { border: 0; border-radius: 999px; padding: 12px 17px; background: #254a3d; color: #fff; box-shadow: 0 12px 25px rgba(37,74,61,.25); cursor: pointer; font: inherit; font-weight: 700; }
    .floating-box-history { position: fixed; right: 22px; bottom: 76px; z-index: 30; display: none; gap: 6px; }
    body.editor-enabled .floating-box-history { display: flex; }
    .floating-box-history button { width: 34px; height: 34px; border: 0; border-radius: 50%; background: #e8e1d7; color: #254a3d; box-shadow: 0 8px 18px rgba(37,74,61,.14); cursor: pointer; font-size: 1.2rem; }
    .floating-box-history button:disabled { opacity: .4; cursor: default; }
    @media (max-width: 700px) { .floating-base-layer { grid-template-columns: 1fr; } }
    .floating-box-children { display: grid; gap: 10px; margin-top: 14px; }
    .floating-box-children .floating-box { position: relative; left: auto !important; top: auto !important; width: 100% !important; min-height: 0 !important; padding: 16px 14px 12px; box-shadow: 0 5px 12px rgba(67,59,53,.16); }
    .floating-box-tools select { max-width: 90px; border: 1px solid rgba(67,59,53,.18); border-radius: 6px; padding: 4px; background: #fffdf9; color: #254a3d; }
    @media (max-width: 560px) { .floating-box-add-actions, .floating-box-history { right: 16px; } .floating-box-add-actions { bottom: 16px; } .floating-box-history { bottom: 70px; } }
  `;
  document.head.appendChild(loadingStyle);
  document.body.classList.add("content-loading");

  const config = window.KITA_SUPABASE || {};
  const supabaseUrl = config.url || "";
  const supabaseKey = config.key || "";
  const loginTrigger = document.getElementById("login-trigger");
  const loginModal = document.getElementById("login-modal");
  const modalForm = document.getElementById("login-form");
  const modalMessage = document.getElementById("login-message");
  const logoutTrigger = document.getElementById("logout-trigger");
  const saveStatus = document.getElementById("save-status");

  if (logoutTrigger) {
    logoutTrigger.hidden = true;
    logoutTrigger.style.display = "none";
  }

  let supabaseClient = null;
  let currentUser = null;
  let currentProfile = null;
  let jobBoxEntries = [];
  let floatingBoxEntries = [];
  let contentLayoutEntries = [];
  let floatingHistory = [];
  let floatingHistoryIndex = -1;
  let contentLayoutHistory = [];
  let contentLayoutHistoryIndex = -1;
  let lastHistoryType = "floating";
  let restoringFloatingHistory = false;
  let restoringContentLayoutHistory = false;
  const contentPage = (() => {
    const fileName = window.location.pathname.split("/").pop().toLowerCase();
    if (fileName.includes("ausschreibung")) return "jobs";
    if (fileName.includes("raeumlichkeiten")) return "rooms";
    if (fileName.includes("gruppen")) return "groups";
    return "home";
  })();

  const isFixedPageElement = (element) => Boolean(element.closest("header, footer"));

  const setStatus = (message) => {
    if (saveStatus) saveStatus.textContent = message;
    if (modalMessage) modalMessage.textContent = message;
  };

  const hasEditAccess = () => Boolean(currentUser && currentProfile && (currentProfile.approved || currentProfile.is_admin));

  const loadCurrentProfile = async (user) => {
    if (!supabaseClient || !user) return null;
    const { data, error } = await supabaseClient.from("user_profiles").select("*").eq("id", user.id).maybeSingle();
    if (error) console.error(error);
    return data || null;
  };

  const setLoginState = (user, profile = currentProfile) => {
    const isLogged = Boolean(user);
    ensureFloatingBoxUI();
    const floatingAddButton = document.getElementById("floating-box-add");
    const baseAddButton = document.getElementById("base-box-add");
    if (floatingAddButton) floatingAddButton.hidden = !hasEditAccess();
    if (baseAddButton) baseAddButton.hidden = !hasEditAccess();
    const jobBoxAddButton = document.getElementById("add-job-box");
    if (jobBoxAddButton) jobBoxAddButton.hidden = !hasEditAccess();
    if (loginTrigger) {
      loginTrigger.hidden = false;
      loginTrigger.innerHTML = "✎";
      loginTrigger.setAttribute("title", hasEditAccess() ? "Bearbeiten aktiv" : isLogged ? "Freigabe ausstehend" : "Website bearbeiten");
      loginTrigger.classList.toggle("default", !hasEditAccess());
      loginTrigger.classList.toggle("active", hasEditAccess());
    }
    if (logoutTrigger) {
      logoutTrigger.hidden = !isLogged;
      logoutTrigger.style.display = isLogged ? "" : "none";
      logoutTrigger.innerHTML = "⎋";
      logoutTrigger.setAttribute("title", "Abmelden");
      logoutTrigger.classList.toggle("logout-light", isLogged);
    }

    const uploadPanel = document.getElementById("job-upload-panel");
    if (uploadPanel) {
      uploadPanel.hidden = !isLogged;
      uploadPanel.classList.toggle("editor-hidden", !isLogged);
    }

    document.body.classList.toggle("editor-enabled", hasEditAccess());
    document.querySelectorAll("[data-admin-link]").forEach((link) => link.remove());
    if (profile?.is_admin) {
      const nav = document.querySelector(".nav-links");
      if (nav) {
        const adminLink = document.createElement("a");
        adminLink.href = "admin.html";
        adminLink.textContent = "Admin";
        adminLink.dataset.adminLink = "true";
        nav.appendChild(adminLink);
      }
    }
    if (isLogged && !profile) setStatus("Dein Benutzerprofil fehlt. Bitte das aktualisierte Supabase-Schema ausführen.");
    else if (profile && isLogged && !hasEditAccess()) setStatus("Dein Konto wartet noch auf die Admin-Freigabe.");
  };

  const openModal = () => {
    if (!loginModal) return;
    loginModal.hidden = false;
    setStatus("");
  };

  const closeModal = () => {
    if (!loginModal) return;
    loginModal.hidden = true;
    if (modalForm) modalForm.reset();
    setStatus("");
  };

  const setupRegistration = () => {
    if (!loginModal || document.getElementById("registration-trigger")) return;
    const loginForm = document.getElementById("login-form");
    if (!loginForm) return;
    loginForm.insertAdjacentHTML("beforeend", '<button id="registration-trigger" class="cta secondary" type="button">Registrieren</button>');
    loginModal.insertAdjacentHTML("afterend", `
      <div id="registration-modal" class="login-modal" hidden>
        <div class="login-card">
          <div class="login-header"><h3>Registrieren</h3><button type="button" class="close-login" id="close-registration-modal">×</button></div>
          <form id="registration-form">
            <input id="registration-first-name" type="text" placeholder="Vorname" required />
            <input id="registration-last-name" type="text" placeholder="Nachname" required />
            <input id="registration-email" type="email" placeholder="E-Mail" required />
            <input id="registration-password" type="password" placeholder="Passwort" minlength="6" required />
            <button class="cta cta-primary" type="submit">Registrierung senden</button>
          </form>
          <div id="registration-message" class="save-status"></div>
        </div>
      </div>
    `);
    const registrationModal = document.getElementById("registration-modal");
    document.getElementById("registration-trigger").addEventListener("click", () => {
      loginModal.hidden = true;
      registrationModal.hidden = false;
    });
    document.getElementById("close-registration-modal").addEventListener("click", () => { registrationModal.hidden = true; });
    document.getElementById("registration-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const firstName = document.getElementById("registration-first-name").value.trim();
      const lastName = document.getElementById("registration-last-name").value.trim();
      const email = document.getElementById("registration-email").value.trim();
      const password = document.getElementById("registration-password").value;
      const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName } } });
      const message = document.getElementById("registration-message");
      if (error) {
        message.textContent = error.message;
        return;
      }
      message.textContent = "Registrierung eingegangen. Ein Admin muss dein Konto noch freigeben.";
      event.target.reset();
    });
  };

  if (loginTrigger) {
    loginTrigger.addEventListener("click", () => {
      if (!supabaseClient) {
        alert("Supabase ist noch nicht konfiguriert. Bitte füge URL und anon Key in supabase-config.js ein.");
        return;
      }
      if (hasEditAccess()) {
        document.body.classList.add("editing-mode");
        return;
      }
      openModal();
    });
  }

  if (logoutTrigger) {
    logoutTrigger.addEventListener("click", async () => {
      if (!supabaseClient) return;
      await supabaseClient.auth.signOut();
      currentUser = null;
      currentProfile = null;
      setLoginState(null);
      closeAllEditorFeatures();
      setStatus("Abgemeldet");
    });
  }

  const closeModalBtn = document.getElementById("close-login-modal");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);

  if (loginModal) {
    loginModal.addEventListener("click", (event) => {
      if (event.target === loginModal) closeModal();
    });
  }

  const closeAllEditorFeatures = () => {
    document.querySelectorAll("[data-field]").forEach((element) => {
      element.setAttribute("contenteditable", "false");
      element.classList.remove("is-editable");
    });
    document.querySelectorAll("[data-image-field]").forEach((element) => {
      element.classList.remove("is-editable");
    });
    setJobBoxEditingState();
  };

  const enableEditorFeatures = () => {
    document.querySelectorAll("[data-field]").forEach((element) => {
      if (isFixedPageElement(element)) {
        element.setAttribute("contenteditable", "false");
        element.classList.remove("is-editable");
        return;
      }
      element.setAttribute("contenteditable", "true");
      element.classList.add("is-editable");
    });
    document.querySelectorAll("[data-image-field]").forEach((element) => {
      if (isFixedPageElement(element)) {
        element.classList.remove("is-editable");
        return;
      }
      element.classList.add("is-editable");
    });
    setJobBoxEditingState();
  };

  const bindFieldSaving = () => {
    document.querySelectorAll("[data-field]").forEach((element) => {
      element.addEventListener("blur", async () => {
        if (!supabaseClient || !hasEditAccess()) return;
        const page = element.dataset.page || "home";
        const key = element.dataset.field;
        const value = element.textContent.trim();

        const { error } = await supabaseClient
          .from("site_content")
          .upsert({ page, key, value, updated_at: new Date().toISOString() }, { onConflict: "page,key" });

        if (error) {
          console.error(error);
          setStatus("Fehler beim Speichern.");
          return;
        }

        setStatus("Gespeichert");
      });
    });
  };

  const bindImageUploads = () => {
    if (!supabaseClient || !hasEditAccess()) return;

    document.querySelectorAll("[data-image-field]").forEach((imageElement) => {
      imageElement.addEventListener("click", () => {
        const field = imageElement.dataset.imageField;
        const input = document.getElementById(`file-input-${field}`);
        if (input) input.click();
      });

      const existingInput = document.getElementById(`file-input-${imageElement.dataset.imageField}`);
      if (existingInput) {
        existingInput.addEventListener("change", async (event) => {
          const file = event.target.files[0];
          if (!file) return;

          const allowed = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
          if (!allowed.includes(file.type)) {
            alert("Nur PNG, JPG oder WEBP Bilder sind erlaubt.");
            return;
          }

          const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
          const bucketName = "kita-files";
          const { data: uploadData, error: uploadError } = await supabaseClient.storage
            .from(bucketName)
            .upload(safeName, file, { upsert: true });

          if (uploadError) {
            console.error(uploadError);
            alert("Upload fehlgeschlagen.");
            return;
          }

          const publicUrl = supabaseClient.storage.from(bucketName).getPublicUrl(uploadData.path).data.publicUrl;
          const page = imageElement.dataset.page || "home";
          const key = imageElement.dataset.imageField;

          const { error } = await supabaseClient
            .from("site_content")
            .upsert({ page, key, value: publicUrl, updated_at: new Date().toISOString() }, { onConflict: "page,key" });

          if (!error) {
            imageElement.src = publicUrl;
            setStatus("Bild gespeichert");
          }

          event.target.value = "";
        });
      }
    });
  };

  const renderAttachments = async () => {
    const wrapper = document.getElementById("job-attachments");
    if (!wrapper || !supabaseClient) return;

    const { data, error } = await supabaseClient.from("job_documents").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      wrapper.innerHTML = "Keine Dokumente vorhanden.";
      return;
    }

    if (!data || data.length === 0) {
      wrapper.innerHTML = "Noch keine Dateien hochgeladen.";
      return;
    }

    wrapper.innerHTML = data
      .map((fileItem) => `
        <a class="attachment-item" href="${fileItem.url}" target="_blank" rel="noreferrer">
          ${fileItem.file_name}
        </a>
      `)
      .join("");
  };

  const bindJobUpload = () => {
    const input = document.getElementById("job-upload-input");
    const form = document.getElementById("job-upload-form");

    if (!input || !form || !supabaseClient) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = input.files[0];
      if (!file) {
        alert("Bitte eine Datei wählen.");
        return;
      }

      const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"];
      if (!allowed.includes(file.type)) {
        alert("Erlaubt sind PDF, PNG, JPG und WEBP-Dateien.");
        return;
      }

      const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
      const { data: uploadData, error: uploadError } = await supabaseClient.storage
        .from("job-files")
        .upload(safeName, file, { upsert: true });

      if (uploadError) {
        console.error(uploadError);
        alert("Datei konnte nicht hochgeladen werden.");
        return;
      }

      const publicUrl = supabaseClient.storage.from("job-files").getPublicUrl(uploadData.path).data.publicUrl;
      const { error } = await supabaseClient.from("job_documents").insert({
        file_name: file.name,
        url: publicUrl,
        mime_type: file.type
      });

      if (error) {
        console.error(error);
        alert("Datei konnte nicht gespeichert werden.");
        return;
      }

      form.reset();
      await renderAttachments();
      setStatus("Dokument hochgeladen");
    });
  };

  const escapeHtml = (value) => String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const safeBoxColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || "")) ? value : "";

  const setJobBoxEditingState = () => {
    document.querySelectorAll("[data-job-box-field]").forEach((element) => {
      element.setAttribute("contenteditable", hasEditAccess() ? "true" : "false");
      element.classList.toggle("is-editable", hasEditAccess());
    });
  };

  const persistJobBox = async (box) => {
    const { error } = await supabaseClient.from("site_content").upsert({
      page: "jobs",
      key: box.key,
      value: JSON.stringify({
        title: box.title,
        text: box.text,
        image: box.image || "",
        imageVisible: box.imageVisible !== false,
        imageScale: box.imageScale || 100,
        imageX: box.imageX || 0,
        imageY: box.imageY || 0,
        width: box.width || 0,
        height: box.height || 0,
        order: box.order || 0,
        placement: box.placement || "bottom"
      }),
      updated_at: new Date().toISOString()
    }, { onConflict: "page,key" });
    return error;
  };

  const updateJobBoxImageStyle = (card) => {
    const image = card.querySelector("[data-job-box-image]");
    if (!image) return;
    image.style.transform = `translate(${card.dataset.imageX || 0}%, ${card.dataset.imageY || 0}%) scale(${(Number(card.dataset.imageScale || 100) / 100).toFixed(2)})`;
  };

  const toggleJobBoxImage = async (card) => {
    const visible = card.dataset.imageVisible !== "true";
    card.dataset.imageVisible = String(visible);
    card.classList.toggle("image-disabled", !visible);
    card.querySelector(".job-box-image")?.classList.toggle("is-hidden", !visible);
    const button = card.querySelector(".job-box-image-toggle");
    if (button) button.textContent = visible ? "Bild ausblenden" : "Bild anzeigen";
    const box = jobBoxEntries.find((entry) => entry.key === card.dataset.jobBoxKey);
    if (!box) return;
    box.imageVisible = visible;
    await persistJobBox(box);
    setStatus(visible ? "Bild eingeblendet" : "Bild ausgeblendet");
  };

  const bindJobBoxResize = (handle, card) => {
    if (!handle) return;
    let state = null;
    handle.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess()) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      state = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: card.offsetWidth, height: card.offsetHeight };
    });
    handle.addEventListener("pointermove", (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      const width = Math.max(240, Math.min(720, state.width + event.clientX - state.startX));
      const height = Math.max(150, Math.min(720, state.height + event.clientY - state.startY));
      card.dataset.boxWidth = Math.round(width);
      card.dataset.boxHeight = Math.round(height);
      card.style.width = `${width}px`;
      card.style.minHeight = `${height}px`;
    });
    handle.addEventListener("pointerup", async (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      state = null;
      handle.releasePointerCapture(event.pointerId);
      await saveJobBoxControls(card);
    });
  };

  const fitJobBoxImage = (image) => {
    if (!image.naturalWidth || !image.naturalHeight) return;
    const frame = image.closest(".job-box-image");
    if (!frame) return;
    const ratio = image.naturalWidth / image.naturalHeight;
    const height = Math.max(140, Math.min(280, frame.clientWidth / ratio));
    frame.style.height = `${height}px`;
  };

  const bindJobBoxImageDrag = (frame, card) => {
    let dragState = null;

    frame.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess()) return;
      event.preventDefault();
      frame.setPointerCapture(event.pointerId);
      dragState = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        imageX: Number(card.dataset.imageX) || 0,
        imageY: Number(card.dataset.imageY) || 0
      };
    });

    frame.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const imageX = Math.max(-30, Math.min(30, dragState.imageX + ((event.clientX - dragState.startX) / frame.clientWidth) * 100));
      const imageY = Math.max(-30, Math.min(30, dragState.imageY + ((event.clientY - dragState.startY) / frame.clientHeight) * 100));
      card.dataset.imageX = imageX.toFixed(1);
      card.dataset.imageY = imageY.toFixed(1);
      card.querySelector('[data-job-box-control="x"]').value = imageX;
      card.querySelector('[data-job-box-control="y"]').value = imageY;
      updateJobBoxImageStyle(card);
    });

    frame.addEventListener("pointerup", async (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      dragState = null;
      frame.releasePointerCapture(event.pointerId);
      await saveJobBoxControls(card);
    });
  };

  const renderJobBoxes = (entries) => {
    const wrapper = document.getElementById("job-box-list");
    if (!wrapper) return;

    jobBoxEntries = entries
      .filter((entry) => entry && entry.key && entry.key.startsWith("job_box_"))
      .map((entry) => {
        if (entry.title !== undefined) return entry;
        try {
          const value = JSON.parse(entry.value || "{}");
          return {
            key: entry.key,
            title: value.title || "Neuer Kasten",
            text: value.text || "Inhalt ergänzen",
            image: value.image || "",
            imageVisible: value.imageVisible !== false,
            imageScale: Number(value.imageScale) || 100,
            imageX: Number(value.imageX) || 0,
            imageY: Number(value.imageY) || 0,
            width: Number(value.width) || 0,
            height: Number(value.height) || 0,
            order: Number(value.order) || 0,
            placement: value.placement === "top" ? "top" : "bottom"
          };
        } catch {
          return { key: entry.key, title: "Neuer Kasten", text: entry.value || "Inhalt ergänzen", image: "", imageVisible: true, imageScale: 100, imageX: 0, imageY: 0, width: 0, height: 0, order: 0, placement: "bottom" };
        }
      })
      .sort((first, second) => (first.order || 0) - (second.order || 0));

    const boxMarkup = (box) => `
      <article class="job-box${box.imageVisible === false ? " image-disabled" : ""}" draggable="false" data-job-box-key="${escapeHtml(box.key)}" data-job-box-placement="${box.placement || "bottom"}" data-image-visible="${box.imageVisible !== false}" data-image-scale="${box.imageScale || 100}" data-image-x="${box.imageX || 0}" data-image-y="${box.imageY || 0}" data-box-width="${box.width || 0}" data-box-height="${box.height || 0}">
        <button class="job-box-delete" type="button" title="Kasten löschen" aria-label="Kasten löschen">×</button>
        <button class="job-box-drag-handle" type="button" draggable="false" title="Kasten verschieben">↕ Verschieben</button>
        <div class="job-box-image${box.imageVisible === false ? " is-hidden" : ""}">
          ${box.image ? `<img src="${escapeHtml(box.image)}" alt="" draggable="false" data-job-box-image />` : `<span class="job-box-placeholder">Noch kein Bild eingefügt</span>`}
        </div>
        <h3 data-job-box-field="title">${escapeHtml(box.title)}</h3>
        <p data-job-box-field="text">${escapeHtml(box.text)}</p>
        <div class="job-box-tools">
          <button class="cta small secondary job-box-image-button" type="button">Bild auswählen</button>
          <button class="cta small secondary job-box-image-toggle" type="button">${box.imageVisible === false ? "Bild anzeigen" : "Bild ausblenden"}</button>
          <button class="cta small secondary job-box-layer-up" type="button">Frei positionieren</button>
          <button class="cta small secondary job-box-order-left" type="button" title="Kasten nach vorne verschieben">←</button>
          <button class="cta small secondary job-box-order-right" type="button" title="Kasten nach hinten verschieben">→</button>
          <input class="job-box-upload" type="file" accept="image/png,image/jpeg,image/webp" />
          <label>Größe <input type="range" min="60" max="180" value="${box.imageScale || 100}" data-job-box-control="scale" /></label>
          <label>Horizontal <input type="range" min="-30" max="30" value="${box.imageX || 0}" data-job-box-control="x" /></label>
          <label>Vertikal <input type="range" min="-30" max="30" value="${box.imageY || 0}" data-job-box-control="y" /></label>
        </div>
        <button class="job-box-resize-handle" type="button" title="Kastengröße ändern" aria-label="Kastengröße ändern">↘</button>
      </article>
    `;

    const topWrapper = document.getElementById("job-box-top-list");
    const bottomWrapper = document.getElementById("job-box-list");
    if (!topWrapper || !bottomWrapper) return;
    topWrapper.innerHTML = "";
    bottomWrapper.innerHTML = "";
    jobBoxEntries.forEach((box) => {
      (box.placement === "top" ? topWrapper : bottomWrapper).insertAdjacentHTML("beforeend", boxMarkup(box));
    });

    const section = topWrapper.closest(".job-boxes");

    setJobBoxEditingState();
    section.querySelectorAll("[data-job-box-image]").forEach((image) => {
      image.addEventListener("load", () => fitJobBoxImage(image));
      fitJobBoxImage(image);
      updateJobBoxImageStyle(image.closest(".job-box"));
    });
    section.querySelectorAll("[data-job-box-field]").forEach((element) => {
      element.addEventListener("blur", () => saveJobBox(element));
    });
    section.querySelectorAll(".job-box-delete").forEach((button) => {
      button.addEventListener("click", () => deleteJobBox(button));
    });
    section.querySelectorAll(".job-box-image-button").forEach((button) => {
      button.addEventListener("click", () => button.closest(".job-box").querySelector(".job-box-upload").click());
    });
    section.querySelectorAll(".job-box-image-toggle").forEach((button) => {
      button.addEventListener("click", () => toggleJobBoxImage(button.closest(".job-box")));
    });
    section.querySelectorAll(".job-box-layer-up").forEach((button) => {
      button.addEventListener("click", () => convertBaseBoxToFloating(button));
    });
    section.querySelectorAll(".job-box-order-left").forEach((button) => {
      button.addEventListener("click", () => moveBaseBoxByStep(button, -1));
    });
    section.querySelectorAll(".job-box-order-right").forEach((button) => {
      button.addEventListener("click", () => moveBaseBoxByStep(button, 1));
    });
    section.querySelectorAll(".job-box-upload").forEach((input) => {
      input.addEventListener("change", (event) => uploadJobBoxImage(event.target));
    });
    section.querySelectorAll("[data-job-box-control]").forEach((control) => {
      control.addEventListener("pointerdown", (event) => event.stopPropagation());
      control.addEventListener("input", () => {
        const card = control.closest(".job-box");
        const controlName = control.dataset.jobBoxControl;
        const dataName = controlName === "scale" ? "imageScale" : `image${controlName.toUpperCase()}`;
        card.dataset[dataName] = control.value;
        updateJobBoxImageStyle(card);
      });
      control.addEventListener("change", () => saveJobBoxControls(control.closest(".job-box")));
    });
    section.querySelectorAll(".job-box").forEach((card) => {
      if (card.dataset.boxWidth > 0) card.style.width = `${card.dataset.boxWidth}px`;
      card.style.minHeight = "";
      bindJobBoxReorderDrag(card, card);
      bindJobBoxResize(card.querySelector(".job-box-resize-handle"), card);
      const imageFrame = card.querySelector(".job-box-image");
      const image = card.querySelector("[data-job-box-image]");
      if (imageFrame && image) bindJobBoxImageDrag(imageFrame, card);
    });
  };

  const bindJobBoxReorderDrag = (handle, card) => {
    let dragState = null;

    handle.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess()) return;
      if (event.target.closest(".job-box-image, .job-box-tools, .job-box-delete, input, select, textarea, a, button, [contenteditable=\"true\"]")) return;
      event.preventDefault();
      handle.setPointerCapture(event.pointerId);
      dragState = {
        pointerId: event.pointerId,
        sourceKey: card.dataset.jobBoxKey,
        targetKey: card.dataset.jobBoxKey,
        targetPlacement: card.dataset.jobBoxPlacement || "bottom"
      };
      card.classList.add("is-dragging");
    });

    handle.addEventListener("pointermove", (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const pointTarget = document.elementFromPoint(event.clientX, event.clientY);
      const target = pointTarget?.closest(".job-box");
      const targetZone = pointTarget?.closest("[data-job-box-zone]");
      document.querySelectorAll(".job-box.drag-target").forEach((element) => element.classList.remove("drag-target"));
      document.querySelectorAll("[data-job-box-zone].drag-target-zone").forEach((element) => element.classList.remove("drag-target-zone"));
      if (target && target !== card) {
        dragState.targetKey = target.dataset.jobBoxKey;
        dragState.targetPlacement = target.dataset.jobBoxPlacement || "bottom";
        target.classList.add("drag-target");
      } else if (targetZone) {
        dragState.targetKey = "";
        dragState.targetPlacement = targetZone.dataset.jobBoxZone;
        targetZone.classList.add("drag-target-zone");
      }
    });

    handle.addEventListener("pointerup", async (event) => {
      if (!dragState || event.pointerId !== dragState.pointerId) return;
      const state = dragState;
      dragState = null;
      handle.releasePointerCapture(event.pointerId);
      card.classList.remove("is-dragging");
      document.querySelectorAll(".job-box.drag-target").forEach((element) => element.classList.remove("drag-target"));
      document.querySelectorAll("[data-job-box-zone].drag-target-zone").forEach((element) => element.classList.remove("drag-target-zone"));
      if (state.sourceKey !== state.targetKey || state.targetPlacement !== card.dataset.jobBoxPlacement) {
        await moveJobBox(state.sourceKey, state.targetKey, state.targetPlacement);
      }
    });
  };

  const saveJobBox = async (element) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const box = element.closest("[data-job-box-key]");
    if (!box) return;

    const key = box.dataset.jobBoxKey;
    const savedBox = jobBoxEntries.find((entry) => entry.key === key);
    savedBox.title = box.querySelector('[data-job-box-field="title"]').textContent.trim() || "Neuer Kasten";
    savedBox.text = box.querySelector('[data-job-box-field="text"]').textContent.trim() || "Inhalt ergänzen";
    const error = await persistJobBox(savedBox);

    setStatus(error ? "Fehler beim Speichern." : "Kasten gespeichert");
  };

  const saveJobBoxControls = async (card) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const box = jobBoxEntries.find((entry) => entry.key === card.dataset.jobBoxKey);
    box.imageScale = Number(card.dataset.imageScale) || 100;
    box.imageX = Number(card.dataset.imageX) || 0;
    box.imageY = Number(card.dataset.imageY) || 0;
    box.width = Number(card.dataset.boxWidth) || 0;
    box.height = 0;
    box.flowOffset = 0;
    box.flowX = Number(card.dataset.flowX) || 0;
    box.flowY = Number(card.dataset.flowY) || 0;
    box.flowAnchor = card.dataset.flowAnchor || box.flowAnchor || "";
    const error = await persistJobBox(box);
    setStatus(error ? "Fehler beim Speichern." : "Bildposition gespeichert");
  };

  const uploadJobBoxImage = async (input) => {
    if (!supabaseClient || !hasEditAccess() || !input.files[0]) return;
    const file = input.files[0];
    const allowed = ["image/png", "image/jpeg", "image/webp", "image/jpg"];
    if (!allowed.includes(file.type)) {
      alert("Nur PNG, JPG oder WEBP Bilder sind erlaubt.");
      return;
    }

    const card = input.closest(".job-box");
    const box = jobBoxEntries.find((entry) => entry.key === card.dataset.jobBoxKey);
    const safeName = `job-box-${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { data, error: uploadError } = await supabaseClient.storage.from("kita-files").upload(safeName, file, { upsert: true });
    if (uploadError) {
      console.error(uploadError);
      alert("Bild konnte nicht hochgeladen werden.");
      return;
    }

    box.image = supabaseClient.storage.from("kita-files").getPublicUrl(data.path).data.publicUrl;
    const error = await persistJobBox(box);
    if (error) {
      setStatus("Bild konnte nicht gespeichert werden.");
      return;
    }

    renderJobBoxes(jobBoxEntries);
    setStatus("Bild gespeichert");
  };

  const moveJobBox = async (sourceKey, targetKey, targetPlacement) => {
    const sourceIndex = jobBoxEntries.findIndex((entry) => entry.key === sourceKey);
    if (sourceIndex < 0) return;
    const [movedBox] = jobBoxEntries.splice(sourceIndex, 1);
    const placement = targetPlacement === "top" ? "top" : "bottom";
    movedBox.placement = placement;

    const placedBoxes = jobBoxEntries.filter((entry) => (entry.placement || "bottom") === placement);
    const otherBoxes = jobBoxEntries.filter((entry) => (entry.placement || "bottom") !== placement);
    const targetIndex = placedBoxes.findIndex((entry) => entry.key === targetKey);
    if (targetIndex < 0) placedBoxes.push(movedBox);
    else placedBoxes.splice(targetIndex, 0, movedBox);

    jobBoxEntries = placement === "top" ? [...placedBoxes, ...otherBoxes] : [...otherBoxes, ...placedBoxes];
    jobBoxEntries.forEach((entry, index) => { entry.order = index; });
    renderJobBoxes(jobBoxEntries);
    await Promise.all(jobBoxEntries.map((entry) => persistJobBox(entry)));
    setStatus("Reihenfolge gespeichert");
  };

  const moveBaseBoxByStep = async (button, direction) => {
    if (!hasEditAccess()) return;
    const card = button.closest(".job-box");
    const key = card.dataset.jobBoxKey;
    const placement = card.dataset.jobBoxPlacement || "bottom";
    const sameZone = jobBoxEntries.filter((entry) => (entry.placement || "bottom") === placement);
    const currentIndex = sameZone.findIndex((entry) => entry.key === key);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sameZone.length) return;
    [sameZone[currentIndex], sameZone[targetIndex]] = [sameZone[targetIndex], sameZone[currentIndex]];
    const otherZone = jobBoxEntries.filter((entry) => (entry.placement || "bottom") !== placement);
    jobBoxEntries = placement === "top" ? [...sameZone, ...otherZone] : [...otherZone, ...sameZone];
    jobBoxEntries.forEach((entry, index) => { entry.order = index; });
    renderJobBoxes(jobBoxEntries);
    await Promise.all(jobBoxEntries.map((entry) => persistJobBox(entry)));
    setStatus("Grundkasten verschoben");
  };

  const floatingSnapshot = () => JSON.parse(JSON.stringify(floatingBoxEntries));

  const updateFloatingHistoryButtons = () => {
    const undoButton = document.getElementById("floating-box-undo");
    const redoButton = document.getElementById("floating-box-redo");
    if (undoButton) undoButton.disabled = floatingHistoryIndex <= 0;
    if (redoButton) redoButton.disabled = floatingHistoryIndex >= floatingHistory.length - 1;
  };

  const recordFloatingHistory = (reset = false) => {
    if (restoringFloatingHistory) return;
    const snapshot = floatingSnapshot();
    if (reset) {
      floatingHistory = [snapshot];
      floatingHistoryIndex = 0;
    } else {
      floatingHistory = floatingHistory.slice(0, floatingHistoryIndex + 1);
      floatingHistory.push(snapshot);
      floatingHistoryIndex = floatingHistory.length - 1;
    }
    lastHistoryType = "floating";
    updateFloatingHistoryButtons();
  };

  const persistFloatingSnapshot = async (snapshot) => {
    if (!supabaseClient || !hasEditAccess()) return;
    await supabaseClient.from("site_content").delete().eq("page", contentPage).like("key", "floating_box_%");
    if (snapshot.length) {
      await supabaseClient.from("site_content").upsert(snapshot.map((box) => ({
        page: contentPage,
        key: box.key,
        value: JSON.stringify(box),
        updated_at: new Date().toISOString()
      })), { onConflict: "page,key" });
    }
  };

  const applyFloatingHistory = async (index) => {
    if (index < 0 || index >= floatingHistory.length) return;
    restoringFloatingHistory = true;
    floatingHistoryIndex = index;
    floatingBoxEntries = JSON.parse(JSON.stringify(floatingHistory[index]));
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    await persistFloatingSnapshot(floatingBoxEntries);
    restoringFloatingHistory = false;
    lastHistoryType = "floating";
    updateFloatingHistoryButtons();
    setStatus("Änderung angewendet");
  };

  const undoFloatingChange = () => applyFloatingHistory(floatingHistoryIndex - 1);
  const redoFloatingChange = () => applyFloatingHistory(floatingHistoryIndex + 1);
  const undoContentLayoutChange = () => applyContentLayoutHistory(contentLayoutHistoryIndex - 1);
  const redoContentLayoutChange = () => applyContentLayoutHistory(contentLayoutHistoryIndex + 1);

  const handleFloatingHistoryShortcut = (event) => {
    if (!hasEditAccess() || !event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target.closest("[contenteditable=\"true\"], input, textarea")) return;
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (lastHistoryType === "content" && contentLayoutHistoryIndex > 0) undoContentLayoutChange();
      else undoFloatingChange();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      if (lastHistoryType === "content" && contentLayoutHistoryIndex < contentLayoutHistory.length - 1) redoContentLayoutChange();
      else redoFloatingChange();
    }
  };

  const ensureFloatingBoxUI = () => {
    const bindAction = (id, handler) => {
      const button = document.getElementById(id);
      if (!button || button.dataset.bound === "true") return;
      button.dataset.bound = "true";
      button.addEventListener("click", handler);
    };
    if (document.getElementById("floating-box-layer")) {
      bindAction("floating-box-add", () => addFloatingBox());
      bindAction("base-box-add", () => addFloatingBox(null, true));
      bindAction("floating-box-undo", undoFloatingChange);
      bindAction("floating-box-redo", redoFloatingChange);
      return;
    }
    const floatingMarkup = `
      <div id="floating-base-layer" class="floating-base-layer"></div>
      <div id="floating-box-layer" class="floating-box-layer"></div>
      <div class="floating-box-add-actions"><button id="floating-box-add" class="floating-box-add" type="button">+ Post-it</button><button id="base-box-add" class="floating-box-add" type="button">+ Grundkasten</button></div>
      <div class="floating-box-history" aria-label="Änderungsverlauf">
        <button id="floating-box-undo" type="button" title="Rückgängig">←</button>
        <button id="floating-box-redo" type="button" title="Wiederholen">→</button>
      </div>
    `;
    const main = document.querySelector("main");
    const footer = document.querySelector("footer");
    if (main) main.insertAdjacentHTML("afterbegin", floatingMarkup);
    else if (footer) footer.insertAdjacentHTML("beforebegin", floatingMarkup);
    else document.body.insertAdjacentHTML("beforeend", floatingMarkup);
    bindAction("floating-box-add", () => addFloatingBox());
    bindAction("base-box-add", () => addFloatingBox(null, true));
    bindAction("floating-box-undo", undoFloatingChange);
    bindAction("floating-box-redo", redoFloatingChange);
    document.addEventListener("keydown", handleFloatingHistoryShortcut);
  };

  const persistFloatingBox = async (box) => {
    const { error } = await supabaseClient.from("site_content").upsert({
      page: contentPage,
      key: box.key,
      value: JSON.stringify(box),
      updated_at: new Date().toISOString()
    }, { onConflict: "page,key" });
    return error;
  };

  const updateFloatingImage = (card) => {
    const image = card.querySelector("[data-floating-image]");
    if (!image) return;
    image.style.transform = `translate(${card.dataset.imageX || 0}%, ${card.dataset.imageY || 0}%) scale(${(Number(card.dataset.imageScale || 100) / 100).toFixed(2)})`;
  };

  const toggleFloatingBoxImage = async (card) => {
    const visible = card.dataset.imageVisible !== "true";
    card.dataset.imageVisible = String(visible);
    card.classList.toggle("image-disabled", !visible);
    card.querySelector(".floating-box-image")?.classList.toggle("is-hidden", !visible);
    const button = card.querySelector("[data-floating-image-toggle]");
    if (button) button.textContent = visible ? "Bild ausblenden" : "Bild anzeigen";
    await saveFloatingBox(card);
    setStatus(visible ? "Bild eingeblendet" : "Bild ausgeblendet");
  };

  const applyFloatingTextFormat = async (card, targetName, format, value) => {
    const field = card.querySelector(`[data-floating-field="${targetName}"]`);
    if (!field) return;
    if (format === "size") field.style.fontSize = value;
    if (format === "weight") field.style.fontWeight = field.style.fontWeight === "700" ? "" : "700";
    if (format === "style") field.style.fontStyle = field.style.fontStyle === "italic" ? "" : "italic";
    await saveFloatingBox(card);
  };

  const addFloatingTextLine = async (card) => {
    const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
    if (!box) return;
    box.lines = [...(box.lines || []), ""];
    await persistFloatingBox(box);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    const lines = document.querySelectorAll(`[data-floating-key="${box.key}"] [data-floating-line]`);
    lines[lines.length - 1]?.focus();
  };

  const bindFloatingBoxResize = (handle, card) => {
    if (!handle) return;
    let state = null;
    handle.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess()) return;
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      state = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: card.offsetWidth, height: card.offsetHeight };
    });
    handle.addEventListener("pointermove", (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      const width = Math.max(240, Math.min(720, state.width + event.clientX - state.startX));
      const height = Math.max(150, Math.min(720, state.height + event.clientY - state.startY));
      card.dataset.boxWidth = Math.round(width);
      card.dataset.boxHeight = Math.round(height);
      card.style.width = `${width}px`;
      card.style.minHeight = `${height}px`;
    });
    handle.addEventListener("pointerup", async (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      state = null;
      handle.releasePointerCapture(event.pointerId);
      await saveFloatingBox(card);
    });
  };

  const bindFloatingBoxRadius = (control, card) => {
    if (!control) return;
    control.addEventListener("input", () => {
      card.dataset.borderRadius = control.value;
      card.style.borderRadius = `${control.value}px`;
    });
    control.addEventListener("change", () => saveFloatingBox(card));
  };

  const getFlowSections = () => [...document.querySelectorAll("main section")];

  const ensureFlowSectionAnchors = () => {
    getFlowSections().forEach((section, index) => {
      if (!section.dataset.flowAnchor) section.dataset.flowAnchor = `flow-section-${index}`;
    });
  };

  const getFlowAnchor = () => {
    const sections = getFlowSections();
    const viewportCenter = window.scrollY + window.innerHeight / 2;
    const section = sections.find((element) => element.getBoundingClientRect().top + window.scrollY >= viewportCenter) || sections[sections.length - 1];
    if (!section) return "";
    if (!section.dataset.flowAnchor) section.dataset.flowAnchor = `flow-section-${sections.indexOf(section)}`;
    return `[data-flow-anchor="${section.dataset.flowAnchor}"]`;
  };

  const moveFloatingFlowPosition = async (card, direction) => {
    const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
    if (!box || !box.baseLocked) return;
    const sections = getFlowSections();
    const anchorValue = String(box.flowAnchor || "").replace(/.*="|"\]$/g, "");
    const currentIndex = sections.findIndex((section) => section.dataset.flowAnchor === anchorValue);
    const targetIndex = Math.max(0, Math.min(sections.length - 1, currentIndex + direction));
    const target = sections[targetIndex];
    if (!target) return;
    if (!target.dataset.flowAnchor) target.dataset.flowAnchor = `flow-section-${targetIndex}`;
    box.flowAnchor = `[data-flow-anchor="${target.dataset.flowAnchor}"]`;
    await persistFloatingBox(box);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    setStatus(direction < 0 ? "Grundkasten oberhalb angeordnet" : "Grundkasten unterhalb angeordnet");
  };

  const snapToGrid = (value) => Math.round(Number(value) / 16) * 16;

  const resolveFloatingPosition = (card, left, top) => {
    const layer = card.dataset.layer || "2";
    let nextLeft = snapToGrid(Math.max(16, left));
    let nextTop = snapToGrid(Math.max(16, top));
    const width = card.offsetWidth;
    const height = card.offsetHeight;

    document.querySelectorAll(`.floating-box[data-layer="${layer}"]`).forEach((other) => {
      if (other === card) return;
      const otherLeft = Number(other.dataset.left);
      const otherTop = Number(other.dataset.top);
      const overlaps = nextLeft < otherLeft + other.offsetWidth && nextLeft + width > otherLeft && nextTop < otherTop + other.offsetHeight && nextTop + height > otherTop;
      if (overlaps) nextTop = snapToGrid(otherTop + other.offsetHeight + 16);
    });

    return { left: nextLeft, top: nextTop };
  };

  const bindFloatingImageDrag = (frame, card) => {
    let state = null;
    frame.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess()) return;
      event.preventDefault();
      frame.setPointerCapture(event.pointerId);
      state = { id: event.pointerId, x: event.clientX, y: event.clientY, imageX: Number(card.dataset.imageX) || 0, imageY: Number(card.dataset.imageY) || 0 };
    });
    frame.addEventListener("pointermove", (event) => {
      if (!state || state.id !== event.pointerId) return;
      const imageX = Math.max(-30, Math.min(30, state.imageX + ((event.clientX - state.x) / frame.clientWidth) * 100));
      const imageY = Math.max(-30, Math.min(30, state.imageY + ((event.clientY - state.y) / frame.clientHeight) * 100));
      card.dataset.imageX = imageX.toFixed(1);
      card.dataset.imageY = imageY.toFixed(1);
      card.querySelector('[data-floating-control="x"]').value = imageX;
      card.querySelector('[data-floating-control="y"]').value = imageY;
      updateFloatingImage(card);
    });
    frame.addEventListener("pointerup", async (event) => {
      if (!state || state.id !== event.pointerId) return;
      state = null;
      frame.releasePointerCapture(event.pointerId);
      await saveFloatingBox(card);
    });
  };

  const floatingBoxMarkup = (box) => `
    <article class="floating-box ${Number(box.layer || 1) <= 1 ? "floating-base-box" : "floating-overlay-box"}${box.baseLocked ? " floating-base-locked" : ""}${box.image && !box.title && !box.text && !(box.lines || []).length ? " floating-image-only" : ""}${box.imageVisible === false ? " image-disabled" : ""}" data-floating-key="${escapeHtml(box.key)}" data-left="${box.left || 16}" data-top="${box.top || 16}" data-layer="${box.layer || (contentPage === "jobs" ? 2 : 1)}" data-base-locked="${box.baseLocked === true}" data-background-color="${safeBoxColor(box.backgroundColor)}" data-border-radius="${box.borderRadius ?? 3}" data-flow-anchor="${escapeHtml(box.flowAnchor || "")}" data-flow-offset="${box.flowOffset || 0}" data-flow-x="${box.flowX || 0}" data-flow-y="${box.flowY || 0}" data-image-visible="${box.imageVisible !== false}" data-image-scale="${box.imageScale || 100}" data-image-x="${box.imageX || 0}" data-image-y="${box.imageY || 0}" data-box-width="${box.width || 0}" data-box-height="${box.height || 0}" style="left:${box.left || 16}px;top:${box.top || 16}px;z-index:${box.layer || (contentPage === "jobs" ? 2 : 1)};border-radius:${box.borderRadius ?? 3}px${box.baseLocked && box.flowX || box.flowY ? `;transform:translate(${box.flowX || 0}px,${box.flowY || 0}px)` : ""}${box.width ? `;width:${box.width}px` : ""}${safeBoxColor(box.backgroundColor) ? `;background-color:${safeBoxColor(box.backgroundColor)}` : ""}">
      <button class="floating-box-delete" type="button" aria-label="Kasten löschen">×</button>
      <div class="floating-box-image${box.imageVisible === false ? " is-hidden" : ""}">${box.image ? `<img src="${escapeHtml(box.image)}" alt="" draggable="false" data-floating-image />` : ""}</div>
      <h3 data-floating-field="title" data-placeholder="Überschrift" contenteditable="false" style="font-size:${escapeHtml(box.titleFontSize || "")};font-weight:${escapeHtml(box.titleFontWeight || "")};font-style:${escapeHtml(box.titleFontStyle || "")};">${escapeHtml(box.title)}</h3>
      <p data-floating-field="text" data-placeholder="Beschreibung" contenteditable="false" style="font-size:${escapeHtml(box.textFontSize || "")};font-weight:${escapeHtml(box.textFontWeight || "")};font-style:${escapeHtml(box.textFontStyle || "")};">${escapeHtml(box.text)}</p>
      ${(box.lines || []).map((line) => `<p data-floating-line data-placeholder="Weitere Textzeile" contenteditable="false">${escapeHtml(line)}</p>`).join("")}
      <div class="floating-box-tools">
        <button type="button" data-floating-upload-button>Bild auswählen</button>
        <button type="button" data-floating-image-toggle>${box.imageVisible === false ? "Bild anzeigen" : "Bild ausblenden"}</button>
        <button type="button" data-floating-add-child>+ Unterkasten</button>
        <button type="button" data-floating-format="title-weight"><strong>T</strong></button>
        <button type="button" data-floating-format="title-style"><em>T</em></button>
        <select data-floating-format-size="title" aria-label="Titelgröße"><option value="">Titelgröße</option><option value="1rem">Klein</option><option value="1.25rem">Mittel</option><option value="1.6rem">Groß</option></select>
        <button type="button" data-floating-format="text-weight"><strong>B</strong></button>
        <button type="button" data-floating-format="text-style"><em>I</em></button>
        <select data-floating-format-size="text" aria-label="Textgröße"><option value="">Textgröße</option><option value=".85rem">Klein</option><option value="1rem">Mittel</option><option value="1.15rem">Groß</option></select>
        ${box.baseLocked ? `<button type="button" data-floating-add-line>+ Textzeile</button><button type="button" data-floating-flow="up">↑ Oberhalb</button><button type="button" data-floating-flow="down">↓ Unterhalb</button><label class="floating-background-control">Hintergrund <input type="color" value="${safeBoxColor(box.backgroundColor) || "#fff2a8"}" data-floating-background /></label>` : `<button type="button" data-floating-layer="up">Ebene hoch</button><button type="button" data-floating-layer="down">Ebene runter</button>`}
        <label>Ecken <input type="range" min="0" max="40" value="${box.borderRadius ?? 3}" data-floating-radius /></label>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-floating-upload />
        <label>Größe <input type="range" min="60" max="180" value="${box.imageScale || 100}" data-floating-control="scale" /></label>
        <label>X <input type="range" min="-30" max="30" value="${box.imageX || 0}" data-floating-control="x" /></label>
        <label>Y <input type="range" min="-30" max="30" value="${box.imageY || 0}" data-floating-control="y" /></label>
      </div>
      <div class="floating-box-children">${floatingBoxEntries.filter((child) => child.parentKey === box.key).map((child) => floatingBoxMarkup(child)).join("")}</div>
      <button class="floating-box-move-handle" type="button" title="Kasten verschieben" aria-label="Kasten verschieben">↕</button>
      <button class="floating-box-resize-handle" type="button" title="Kastengröße ändern" aria-label="Kastengröße ändern">↘</button>
    </article>
  `;

  const renderFloatingBoxes = (entries) => {
    ensureFloatingBoxUI();
    ensureFlowSectionAnchors();
    const layer = document.getElementById("floating-box-layer");
    const baseLayer = document.getElementById("floating-base-layer");
    floatingBoxEntries = entries.filter((entry) => (!entry.page || entry.page === contentPage) && entry.key.startsWith("floating_box_")).map((entry) => {
      try {
        return { ...JSON.parse(entry.value || "{}"), key: entry.key };
      } catch {
        return { key: entry.key, title: "Neue Information", text: entry.value || "Inhalt ergänzen", left: 32, top: window.scrollY + 120, layer: 1 };
      }
    });
    floatingBoxEntries.forEach((entry, index) => {
      if (entry.baseLocked) entry.layer = 1;
      else if (entry.floatingOverlay) entry.layer = Math.max(2, Number(entry.layer) || index + 2);
    });
    if (contentPage === "jobs") {
      floatingBoxEntries.forEach((entry, index) => { if (!entry.baseLocked) entry.layer = Math.max(2, Number(entry.layer) || index + 2); });
    } else if (!floatingBoxEntries.some((entry) => Number(entry.layer) > 1)) {
      floatingBoxEntries.forEach((entry, index) => { if (!entry.baseLocked && !entry.floatingOverlay) entry.layer = index + 1; });
    }
    const baseBoxes = floatingBoxEntries.filter((entry) => Number(entry.layer || 1) <= 1 && !entry.parentKey);
    const overlayBoxes = floatingBoxEntries.filter((entry) => Number(entry.layer || 1) > 1 && !entry.parentKey);
    document.querySelectorAll(".floating-base-slot").forEach((slot) => slot.remove());
    baseLayer.innerHTML = "";
    baseBoxes.forEach((box) => {
      if (!box.flowAnchor) box.flowAnchor = getFlowAnchor();
      const slot = document.createElement("div");
      slot.className = "floating-base-slot";
      slot.dataset.floatingKey = box.key;
      slot.innerHTML = floatingBoxMarkup(box);
      const anchor = box.flowAnchor ? document.querySelector(box.flowAnchor) : null;
      if (anchor?.parentElement) anchor.parentElement.insertBefore(slot, anchor);
      else baseLayer.appendChild(slot);
    });
    layer.innerHTML = overlayBoxes.map(floatingBoxMarkup).join("");
    document.querySelectorAll(".floating-box").forEach((card) => {
      const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
      if (card.dataset.boxWidth > 0) card.style.width = `${card.dataset.boxWidth}px`;
      card.style.minHeight = "";
      card.querySelectorAll("[data-floating-field]").forEach((field) => {
        field.contentEditable = hasEditAccess() ? "true" : "false";
        field.addEventListener("blur", () => saveFloatingBox(card));
      });
      card.querySelectorAll("[data-floating-line]").forEach((field) => {
        field.contentEditable = hasEditAccess() ? "true" : "false";
        field.addEventListener("blur", () => saveFloatingBox(card));
      });
      card.querySelector(".floating-box-delete").addEventListener("click", () => deleteFloatingBox(card));
      card.querySelectorAll("[data-floating-layer]").forEach((button) => {
        button.addEventListener("click", () => moveFloatingLayer(card, button.dataset.floatingLayer));
      });
      const uploadButton = card.querySelector("[data-floating-upload-button]");
      const uploadInput = card.querySelector("[data-floating-upload]");
      uploadButton.addEventListener("click", () => uploadInput.click());
      uploadInput.addEventListener("change", () => uploadFloatingImage(card, uploadInput));
      card.querySelector("[data-floating-image-toggle]").addEventListener("click", () => toggleFloatingBoxImage(card));
      card.querySelector("[data-floating-add-child]").addEventListener("click", () => addFloatingBox(card.dataset.floatingKey, card.dataset.baseLocked === "true"));
      card.querySelector("[data-floating-add-line]")?.addEventListener("click", () => addFloatingTextLine(card));
      card.querySelectorAll("[data-floating-flow]").forEach((button) => {
        button.addEventListener("click", () => moveFloatingFlowPosition(card, button.dataset.floatingFlow === "up" ? -1 : 1));
      });
      card.querySelector("[data-floating-background]")?.addEventListener("input", (event) => {
        card.style.backgroundColor = event.target.value;
        card.dataset.backgroundColor = event.target.value;
      });
      card.querySelector("[data-floating-background]")?.addEventListener("change", () => saveFloatingBox(card));
      bindFloatingBoxRadius(card.querySelector("[data-floating-radius]"), card);
      card.querySelectorAll("[data-floating-format]").forEach((button) => {
        button.addEventListener("click", () => {
          const [targetName, format] = button.dataset.floatingFormat.split("-");
          applyFloatingTextFormat(card, targetName, format);
        });
      });
      card.querySelectorAll("[data-floating-format-size]").forEach((select) => {
        select.addEventListener("change", () => applyFloatingTextFormat(card, select.dataset.floatingFormatSize, "size", select.value));
      });
      card.querySelectorAll("[data-floating-control]").forEach((control) => {
        control.addEventListener("pointerdown", (event) => event.stopPropagation());
        control.addEventListener("input", () => {
          const name = control.dataset.floatingControl;
          card.dataset[name === "scale" ? "imageScale" : `image${name.toUpperCase()}`] = control.value;
          updateFloatingImage(card);
        });
        control.addEventListener("change", () => saveFloatingBox(card));
      });
      const imageFrame = card.querySelector(".floating-box-image");
      const image = card.querySelector("[data-floating-image]");
      if (image && !card.classList.contains("floating-image-only")) {
        imageFrame.addEventListener("load", () => {}, true);
        bindFloatingImageDrag(imageFrame, card);
        updateFloatingImage(card);
      }
      bindFloatingBoxResize(card.querySelector(".floating-box-resize-handle"), card);
      bindFloatingBoxDrag(card, box);
    });
  };

  const bindFloatingBoxDrag = (card, box) => {
    let state = null;
    const isBaseBox = Number(card.dataset.layer || 1) <= 1 && card.dataset.baseLocked !== "true";
    const isFlowBaseBox = card.dataset.baseLocked === "true";
    card.addEventListener("pointerdown", (event) => {
      const imageOnly = card.classList.contains("floating-image-only");
      const isMoveHandle = event.target.closest(".floating-box-move-handle");
      const eventBox = event.target.closest(".floating-box");
      if (eventBox !== card) return;
      if (!isMoveHandle && event.target.closest("[contenteditable=\"true\"]")) return;
      if (!hasEditAccess() || event.target.closest(".floating-box-tools, .floating-box-delete, input") || (!isMoveHandle && event.target.closest("button")) || (!imageOnly && event.target.closest(".floating-box-image"))) return;
      if (!event.target.closest("[contenteditable=\"true\"]")) event.preventDefault();
      card.setPointerCapture(event.pointerId);
      state = { id: event.pointerId, x: event.clientX, y: event.clientY, left: Number(card.dataset.left), top: Number(card.dataset.top), flowOffset: Number(card.dataset.flowOffset) || 0, flowX: Number(card.dataset.flowX) || 0, flowY: Number(card.dataset.flowY) || 0, targetKey: card.dataset.floatingKey };
      card.classList.add("is-dragging");
    });
    card.addEventListener("pointermove", (event) => {
      if (!state || state.id !== event.pointerId) return;
      if (isFlowBaseBox) {
        const flowX = state.flowX + event.clientX - state.x;
        const flowY = state.flowY + event.clientY - state.y;
        card.dataset.flowOffset = "0";
        card.dataset.flowX = Math.round(flowX);
        card.dataset.flowY = Math.round(flowY);
        card.style.transform = `translate(${flowX}px, ${flowY}px)`;
        return;
      }
      if (isBaseBox) {
        const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".floating-base-box");
        document.querySelectorAll(".floating-base-box.drag-target").forEach((element) => element.classList.remove("drag-target"));
        if (target && target !== card) {
          state.targetKey = target.dataset.floatingKey;
          target.classList.add("drag-target");
        }
        return;
      }
      const position = resolveFloatingPosition(card, state.left + event.clientX - state.x, state.top + event.clientY - state.y);
      card.dataset.left = position.left;
      card.dataset.top = position.top;
      card.style.left = `${position.left}px`;
      card.style.top = `${position.top}px`;
    });
    card.addEventListener("pointerup", async (event) => {
      if (!state || state.id !== event.pointerId) return;
      const finishedState = state;
      state = null;
      card.releasePointerCapture(event.pointerId);
      card.classList.remove("is-dragging");
      document.querySelectorAll(".floating-base-box.drag-target").forEach((element) => element.classList.remove("drag-target"));
      if (isFlowBaseBox) {
        await saveFloatingBox(card);
        return;
      }
      if (isBaseBox) {
        if (finishedState.targetKey !== card.dataset.floatingKey) await reorderBaseFloatingBox(card.dataset.floatingKey, finishedState.targetKey);
        return;
      }
      box.left = Number(card.dataset.left);
      box.top = Number(card.dataset.top);
      await saveFloatingBox(card);
    });
  };

  const reorderBaseFloatingBox = async (sourceKey, targetKey) => {
    const baseBoxes = floatingBoxEntries.filter((entry) => Number(entry.layer || 1) <= 1);
    const sourceIndex = baseBoxes.findIndex((entry) => entry.key === sourceKey);
    const targetIndex = baseBoxes.findIndex((entry) => entry.key === targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [moved] = baseBoxes.splice(sourceIndex, 1);
    baseBoxes.splice(targetIndex, 0, moved);
    const overlayBoxes = floatingBoxEntries.filter((entry) => Number(entry.layer || 1) > 1);
    floatingBoxEntries = [...baseBoxes, ...overlayBoxes];
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    await Promise.all(baseBoxes.map((entry, index) => {
      entry.order = index;
      return persistFloatingBox(entry);
    }));
    recordFloatingHistory();
    setStatus("Grundebene neu angeordnet");
  };

  const saveFloatingBox = async (card) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
    if (!box) return;
    box.title = card.querySelector('[data-floating-field="title"]').textContent.trim() || "Neue Information";
    box.text = card.querySelector('[data-floating-field="text"]').textContent.trim();
    if (box.baseLocked) box.title = card.querySelector('[data-floating-field="title"]').textContent.trim();
    box.lines = [...card.querySelectorAll("[data-floating-line]")].map((line) => line.textContent.trim());
    const titleField = card.querySelector('[data-floating-field="title"]');
    const textField = card.querySelector('[data-floating-field="text"]');
    box.titleFontSize = titleField.style.fontSize || "";
    box.titleFontWeight = titleField.style.fontWeight || "";
    box.titleFontStyle = titleField.style.fontStyle || "";
    box.textFontSize = textField.style.fontSize || "";
    box.textFontWeight = textField.style.fontWeight || "";
    box.textFontStyle = textField.style.fontStyle || "";
    box.left = Number(card.dataset.left);
    box.top = Number(card.dataset.top);
    box.imageScale = Number(card.dataset.imageScale) || 100;
    box.imageX = Number(card.dataset.imageX) || 0;
    box.imageY = Number(card.dataset.imageY) || 0;
    box.imageVisible = card.dataset.imageVisible !== "false";
    box.width = Number(card.dataset.boxWidth) || 0;
    box.height = 0;
    box.backgroundColor = safeBoxColor(card.dataset.backgroundColor || card.style.backgroundColor);
    box.borderRadius = Math.max(0, Math.min(40, Number(card.dataset.borderRadius) || 0));
    box.baseLocked = box.baseLocked === true || card.dataset.baseLocked === "true";
    box.floatingOverlay = box.floatingOverlay !== false && !box.baseLocked;
    if (box.baseLocked) box.layer = 1;
    else if (box.floatingOverlay) box.layer = Math.max(2, box.layer || 2);
    box.layer = Number(card.dataset.layer) || 1;
    const error = await persistFloatingBox(box);
    if (!error) recordFloatingHistory();
    setStatus(error ? "Fehler beim Speichern." : "Kasten gespeichert");
  };

  const moveFloatingLayer = async (card, direction) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
    if (!box) return;
    if (box.baseLocked) return;
    if (contentPage === "jobs" && direction === "down" && (Number(box.layer) || 2) <= 2) {
      await convertFloatingToBaseBox(box);
      return;
    }
    const ordered = [...floatingBoxEntries].sort((first, second) => (first.layer || 1) - (second.layer || 1));
    const currentIndex = ordered.findIndex((entry) => entry.key === box.key);
    const targetIndex = direction === "up" ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;
    [ordered[currentIndex].layer, ordered[targetIndex].layer] = [ordered[targetIndex].layer || 1, ordered[currentIndex].layer || 1];
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    await Promise.all(floatingBoxEntries.map((entry) => persistFloatingBox(entry)));
    recordFloatingHistory();
    setStatus(direction === "up" ? "Kasten eine Ebene höher" : "Kasten eine Ebene tiefer");
  };

  const convertFloatingToBaseBox = async (box) => {
    const baseKey = `job_box_${Date.now()}`;
    const baseBox = {
      page: "jobs",
      key: baseKey,
      value: JSON.stringify({
        title: box.title,
        text: box.text,
        image: box.image || "",
        imageVisible: box.imageVisible !== false,
        imageScale: box.imageScale || 100,
        imageX: box.imageX || 0,
        imageY: box.imageY || 0,
        width: box.width || 0,
        height: box.height || 0,
        order: jobBoxEntries.length,
        placement: "bottom"
      }),
      updated_at: new Date().toISOString()
    };
    const { error: insertError } = await supabaseClient.from("site_content").upsert(baseBox, { onConflict: "page,key" });
    if (insertError) {
      setStatus("Kasten konnte nicht in die Grundebene verschoben werden.");
      return;
    }
    const { error: deleteError } = await supabaseClient.from("site_content").delete().eq("page", "jobs").eq("key", box.key);
    if (deleteError) {
      setStatus("Kasten konnte nicht vollständig verschoben werden.");
      return;
    }
    jobBoxEntries.push({ key: baseKey, title: box.title, text: box.text, image: box.image || "", imageVisible: box.imageVisible !== false, imageScale: box.imageScale || 100, imageX: box.imageX || 0, imageY: box.imageY || 0, width: box.width || 0, height: box.height || 0, order: jobBoxEntries.length, placement: "bottom" });
    floatingBoxEntries = floatingBoxEntries.filter((entry) => entry.key !== box.key);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    renderJobBoxes(jobBoxEntries);
    recordFloatingHistory();
    setStatus("Kasten in die Grundebene verschoben");
  };

  const uploadFloatingImage = async (card, input) => {
    if (!supabaseClient || !hasEditAccess() || !input.files[0]) return;
    const file = input.files[0];
    if (!["image/png", "image/jpeg", "image/webp", "image/jpg"].includes(file.type)) return;
    const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
    const name = `floating-box-${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { data, error } = await supabaseClient.storage.from("kita-files").upload(name, file, { upsert: true });
    if (error) { setStatus("Bild konnte nicht hochgeladen werden."); return; }
    box.image = supabaseClient.storage.from("kita-files").getPublicUrl(data.path).data.publicUrl;
    await persistFloatingBox(box);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    setStatus("Bild gespeichert");
  };

  const deleteFloatingBox = async (card) => {
    if (!hasEditAccess() || !window.confirm("Diesen Kasten wirklich löschen?")) return;
    const key = card.dataset.floatingKey;
    const childKeys = [];
    let pendingParentKeys = [key];
    while (pendingParentKeys.length) {
      const nestedKeys = floatingBoxEntries.filter((entry) => pendingParentKeys.includes(entry.parentKey)).map((entry) => entry.key);
      childKeys.push(...nestedKeys);
      pendingParentKeys = nestedKeys;
    }
    const keysToDelete = [key, ...childKeys];
    const { error } = await supabaseClient.from("site_content").delete().eq("page", contentPage).in("key", keysToDelete);
    if (error) { setStatus("Fehler beim Löschen."); return; }
    floatingBoxEntries = floatingBoxEntries.filter((entry) => !keysToDelete.includes(entry.key));
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    setStatus("Kasten gelöscht");
  };

  const addFloatingBox = async (parentKey = null, fixedBase = false) => {
    if (!supabaseClient || !hasEditAccess()) {
      setStatus("Bitte zuerst anmelden.");
      return;
    }
    const uniqueId = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const main = document.querySelector("main");
    const mainTop = main ? main.getBoundingClientRect().top + window.scrollY : 0;
    const flowOffset = fixedBase ? Math.max(0, window.scrollY - mainTop + 24) : 0;
    const box = { key: `floating_box_${uniqueId}`, title: fixedBase ? "" : "Neue Information", text: fixedBase ? "" : "Hier kannst du deinen Text eintragen.", lines: [], left: Math.max(16, (window.innerWidth - 360) / 2), top: window.scrollY + 120, flowAnchor: fixedBase ? getFlowAnchor() : "", flowOffset, flowX: 0, image: "", imageScale: 100, imageX: 0, imageY: 0, layer: fixedBase ? 1 : 2, baseLocked: fixedBase, floatingOverlay: !fixedBase, parentKey };
    floatingBoxEntries.push(box);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    const newCard = document.querySelector(`[data-floating-key="${box.key}"]`);
    newCard?.querySelector('[data-floating-field="title"]').focus();
    const error = await persistFloatingBox(box);
    if (error) {
      floatingBoxEntries = floatingBoxEntries.filter((entry) => entry.key !== box.key);
      renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
      setStatus("Fehler beim Anlegen. Prüfe die Supabase-Schreibrechte.");
      return;
    }
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    setStatus("Kasten angelegt");
  };

  const deleteJobBox = async (button) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const box = button.closest("[data-job-box-key]");
    if (!box || !window.confirm("Diesen Kasten wirklich löschen?")) return;

    const key = box.dataset.jobBoxKey;
    const { error } = await supabaseClient.from("site_content").delete().eq("page", "jobs").eq("key", key);
    if (error) {
      setStatus("Fehler beim Löschen.");
      return;
    }

    jobBoxEntries = jobBoxEntries.filter((entry) => entry.key !== key);
    renderJobBoxes(jobBoxEntries);
    setStatus("Kasten gelöscht");
  };

  const ensureContentLayoutEditor = () => {
    let layer = document.getElementById("content-layout-editor-layer");
    if (layer) return layer;
    layer = document.createElement("div");
    layer.id = "content-layout-editor-layer";
    layer.className = "content-layout-editor-layer";
    document.body.appendChild(layer);
    window.addEventListener("scroll", updateContentLayoutEditorPositions, true);
    window.addEventListener("resize", updateContentLayoutEditorPositions);
    return layer;
  };

  const contentLayoutTargets = () => {
    const targets = [];
    const grouped = new Set();
    document.querySelectorAll(".card, .program-content, .room-content, .group-content, .hero-copy, .about-content, .section-header, .cta-banner > div").forEach((element) => {
      if (isFixedPageElement(element)) return;
      const field = element.querySelector("[data-field]");
      if (!field) return;
      const key = field.dataset.field;
      targets.push({ key: `content_${contentPage}_${key}`, element });
      element.querySelectorAll("[data-field]").forEach((child) => grouped.add(child));
    });
    document.querySelectorAll(`[data-field][data-page="${contentPage}"]`).forEach((element) => {
      if (grouped.has(element) || isFixedPageElement(element)) return;
      targets.push({ key: `content_${contentPage}_${element.dataset.field}`, element });
    });
    document.querySelectorAll(`[data-image-field][data-page="${contentPage}"]`).forEach((element) => {
      if (isFixedPageElement(element)) return;
      targets.push({ key: `image_${contentPage}_${element.dataset.imageField}`, element });
    });
    return targets;
  };

  const persistContentLayoutBox = async (box) => {
    if (!supabaseClient || !hasEditAccess()) return;
    await supabaseClient.from("site_content").upsert({
      page: contentPage,
      key: box.key,
      value: JSON.stringify(box),
      updated_at: new Date().toISOString()
    }, { onConflict: "page,key" });
  };

  const contentLayoutSnapshot = () => JSON.parse(JSON.stringify(contentLayoutEntries));

  const persistContentLayoutSnapshot = async (snapshot) => {
    if (!supabaseClient || !hasEditAccess()) return;
    await supabaseClient.from("site_content").delete().eq("page", contentPage).or("key.like.content_%,key.like.image_%");
    if (snapshot.length) {
      await supabaseClient.from("site_content").upsert(snapshot.map((box) => ({
        page: contentPage,
        key: box.key,
        value: JSON.stringify(box),
        updated_at: new Date().toISOString()
      })), { onConflict: "page,key" });
    }
  };

  const recordContentLayoutHistory = (reset = false) => {
    if (restoringContentLayoutHistory) return;
    const snapshot = contentLayoutSnapshot();
    if (reset) {
      contentLayoutHistory = [snapshot];
      contentLayoutHistoryIndex = 0;
    } else {
      contentLayoutHistory = contentLayoutHistory.slice(0, contentLayoutHistoryIndex + 1);
      contentLayoutHistory.push(snapshot);
      contentLayoutHistoryIndex = contentLayoutHistory.length - 1;
    }
    lastHistoryType = "content";
  };

  const saveContentLayoutChange = async (box) => {
    const index = contentLayoutEntries.findIndex((entry) => entry.key === box.key);
    if (index < 0) contentLayoutEntries.push(box);
    else contentLayoutEntries[index] = box;
    await persistContentLayoutBox(box);
    recordContentLayoutHistory();
  };

  const applyContentLayoutHistory = async (index) => {
    if (index < 0 || index >= contentLayoutHistory.length) return;
    restoringContentLayoutHistory = true;
    contentLayoutHistoryIndex = index;
    contentLayoutEntries = JSON.parse(JSON.stringify(contentLayoutHistory[index]));
    renderContentLayoutBoxes(contentLayoutEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    await persistContentLayoutSnapshot(contentLayoutEntries);
    restoringContentLayoutHistory = false;
    lastHistoryType = "content";
  };

  const updateContentLayoutEditorPositions = () => {
    document.querySelectorAll(".content-layout-box-editor").forEach((editor) => {
      const target = document.querySelector(`[data-content-layout-key="${CSS.escape(editor.dataset.layoutKey)}"]`);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      editor.style.left = `${rect.left + window.scrollX}px`;
      editor.style.top = `${rect.top + window.scrollY}px`;
      editor.style.width = `${rect.width}px`;
      editor.style.height = `${rect.height}px`;
    });
  };

  const bindContentLayoutDrag = (target, box, editor) => {
    let state = null;
    const dragHandle = editor.querySelector(".content-layout-move") || target;
    const startDrag = (event, source) => {
      if (!hasEditAccess() || (source === target && event.target.closest("input, textarea, select"))) return;
      state = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, x: box.x || 0, y: box.y || 0, source, dragging: false };
    };
    const moveDrag = (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (!state.dragging && distance < 4) return;
      if (!state.dragging) {
        state.dragging = true;
        event.preventDefault();
        state.source.setPointerCapture(event.pointerId);
        target.classList.add("is-layout-dragging");
      }
      box.x = Math.round(state.x + event.clientX - state.startX);
      box.y = Math.round(state.y + event.clientY - state.startY);
      target.style.transform = `translate(${box.x}px, ${box.y}px)`;
      updateContentLayoutEditorPositions();
    };
    const endDrag = async (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      const finishedState = state;
      state = null;
      if (!finishedState.dragging) return;
      finishedState.source.releasePointerCapture(event.pointerId);
      target.classList.remove("is-layout-dragging");
      await saveContentLayoutChange(box);
      setStatus("Basis-Kasten verschoben");
    };
    [target, dragHandle].filter((source, index, sources) => sources.indexOf(source) === index).forEach((source) => {
      source.addEventListener("pointerdown", (event) => startDrag(event, source));
      source.addEventListener("pointermove", moveDrag);
      source.addEventListener("pointerup", endDrag);
      source.addEventListener("pointercancel", endDrag);
    });
  };

  const bindContentLayoutResize = (handle, target, box) => {
    let state = null;
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      state = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, width: target.offsetWidth, height: target.offsetHeight };
    });
    handle.addEventListener("pointermove", (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      box.width = Math.max(120, Math.round(state.width + event.clientX - state.startX));
      box.height = Math.max(60, Math.round(state.height + event.clientY - state.startY));
      target.style.width = `${box.width}px`;
      target.style.minHeight = `${box.height}px`;
      updateContentLayoutEditorPositions();
    });
    handle.addEventListener("pointerup", async (event) => {
      if (!state || state.pointerId !== event.pointerId) return;
      state = null;
      handle.releasePointerCapture(event.pointerId);
      await saveContentLayoutChange(box);
      setStatus("Basis-Kastengröße gespeichert");
    });
  };

  const renderContentLayoutBoxes = (entries) => {
    const layer = ensureContentLayoutEditor();
    layer.innerHTML = "";
    contentLayoutEntries = entries.filter((entry) => entry.page === contentPage && (entry.key.startsWith("content_") || entry.key.startsWith("image_")))
      .map((entry) => {
        try { return { ...JSON.parse(entry.value || "{}"), key: entry.key }; }
        catch { return { key: entry.key, x: 0, y: 0, width: 0, height: 0, hidden: false }; }
      });
    const saved = new Map(contentLayoutEntries.map((entry) => [entry.key, entry]));
    contentLayoutTargets().forEach(({ key, element }) => {
      const box = saved.get(key) || { key, x: 0, y: 0, width: 0, height: 0, hidden: false };
      element.dataset.contentLayoutKey = key;
      element.classList.add("content-layout-target");
      element.hidden = Boolean(box.hidden);
      element.style.transform = `translate(${box.x || 0}px, ${box.y || 0}px)`;
      if (box.width) element.style.width = `${box.width}px`;
      if (box.height) element.style.minHeight = `${box.height}px`;
      const editor = document.createElement("div");
      editor.className = "content-layout-box-editor";
      editor.dataset.layoutKey = key;
      editor.innerHTML = `<button type="button" class="content-layout-move" aria-label="Kasten verschieben">↕</button><button type="button" class="content-layout-delete" aria-label="Kasten löschen">×</button><button type="button" class="content-layout-resize" aria-label="Kastengröße ändern">↘</button>`;
      layer.appendChild(editor);
      editor.querySelector(".content-layout-delete").addEventListener("click", async () => {
        box.hidden = true;
        element.hidden = true;
        await saveContentLayoutChange(box);
        setStatus("Basis-Kasten gelöscht");
      });
      bindContentLayoutResize(editor.querySelector(".content-layout-resize"), element, box);
      bindContentLayoutDrag(element, box, editor);
    });
    updateContentLayoutEditorPositions();
    if (!contentLayoutHistory.length || !restoringContentLayoutHistory) recordContentLayoutHistory(!contentLayoutHistory.length);
  };

  const convertBaseBoxToFloating = async (button) => {
    if (!supabaseClient || !hasEditAccess()) return;
    if (button.disabled) return;
    const card = button.closest(".job-box");
    const key = card.dataset.jobBoxKey;
    const baseBox = jobBoxEntries.find((entry) => entry.key === key);
    if (!baseBox) return;
    button.disabled = true;
    const highestLayer = Math.max(1, ...floatingBoxEntries.map((entry) => Number(entry.layer) || 1));
    const rect = card.getBoundingClientRect();
    const floatingBox = {
      key: `floating_box_${Date.now()}`,
      title: baseBox.title,
      text: baseBox.text,
      image: baseBox.image || "",
      imageVisible: baseBox.imageVisible !== false,
      imageScale: baseBox.imageScale || 100,
      imageX: baseBox.imageX || 0,
      imageY: baseBox.imageY || 0,
      width: baseBox.width || 0,
      height: baseBox.height || 0,
      left: Math.max(16, rect.left + window.scrollX),
      top: Math.max(16, rect.top + window.scrollY),
      layer: highestLayer + 1
    };
    const { error: insertError } = await persistFloatingBox(floatingBox);
    if (insertError) {
      setStatus("Kasten konnte nicht in eine obere Ebene verschoben werden.");
      return;
    }
    const { error: deleteError } = await supabaseClient.from("site_content").delete().eq("page", "jobs").eq("key", key);
    if (deleteError) {
      await supabaseClient.from("site_content").delete().eq("page", contentPage).eq("key", floatingBox.key);
      button.disabled = false;
      setStatus("Kasten konnte nicht vollständig verschoben werden.");
      return;
    }
    jobBoxEntries = jobBoxEntries.filter((entry) => entry.key !== key);
    floatingBoxEntries.push(floatingBox);
    renderJobBoxes(jobBoxEntries);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    setStatus("Kasten in obere Ebene verschoben");
  };

  const bindJobBoxes = () => {
    const addButton = document.getElementById("add-job-box");
    if (!addButton || addButton.dataset.bound === "true") return;

    addButton.dataset.bound = "true";
    addButton.addEventListener("click", async () => {
      if (!supabaseClient || !hasEditAccess()) return;
      const key = `job_box_${Date.now()}`;
      const newBox = { key, title: "Neue Information", text: "Hier kannst du deinen Text eintragen." };
      const { error } = await supabaseClient.from("site_content").upsert({
        page: "jobs",
        key,
        value: JSON.stringify({ title: newBox.title, text: newBox.text }),
        updated_at: new Date().toISOString()
      }, { onConflict: "page,key" });

      if (error) {
        setStatus("Fehler beim Anlegen.");
        return;
      }

      newBox.order = jobBoxEntries.length;
      newBox.placement = "bottom";
      jobBoxEntries.push(newBox);
      renderJobBoxes(jobBoxEntries);
      setStatus("Kasten angelegt");
    });
  };

  const fetchContent = async () => {
    if (!supabaseClient) return;

    const { data, error } = await supabaseClient.from("site_content").select("*");
    if (error) {
      console.warn("No content table yet or no access.", error.message);
      return;
    }

    const defaultContentValues = { hero_note: "Kindernähe & Aufmerksamkeit" };
    data.forEach((entry) => {
      const page = entry.page || "home";
      const key = entry.key;
      const value = entry.value || defaultContentValues[key] || "";

      document.querySelectorAll(`[data-field="${key}"][data-page="${page}"]`).forEach((element) => {
        if (element.tagName === "IMG") {
          element.src = value;
        } else {
          element.textContent = value;
        }
      });

      document.querySelectorAll(`[data-image-field="${key}"][data-page="${page}"]`).forEach((element) => {
        if (value) element.src = value;
      });
    });

    const localFloatingBoxes = floatingBoxEntries.filter((entry) => entry.key && entry.key.startsWith("floating_box_"));
    const fetchedKeys = new Set(data.filter((entry) => entry.page === contentPage).map((entry) => entry.key));
    const mergedContent = [...data, ...localFloatingBoxes.filter((entry) => !fetchedKeys.has(entry.key)).map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) }))];
    renderJobBoxes(mergedContent);
    renderFloatingBoxes(mergedContent);
    renderContentLayoutBoxes(mergedContent);
    recordFloatingHistory(true);
  };

  const setupLoginForm = () => {
    const form = document.getElementById("login-form");
    if (!form || !supabaseClient) return;
    setupRegistration();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.getElementById("login-email").value.trim();
      const password = document.getElementById("login-password").value;

      if (!email || !password) {
        setStatus("Bitte Email und Passwort eingeben.");
        return;
      }

      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        console.error(error);
        setStatus(error.message);
        return;
      }

      currentUser = data.user;
      currentProfile = await loadCurrentProfile(currentUser);
      setLoginState(currentUser, currentProfile);
      if (!currentProfile) {
        setStatus("Login erfolgreich, aber dein Benutzerprofil fehlt. Bitte das aktualisierte Supabase-Schema ausführen.");
        return;
      }
      if (!hasEditAccess()) {
        setStatus("Login erfolgreich. Dein Konto muss noch durch einen Admin freigegeben werden.");
        return;
      }
      if (hasEditAccess()) {
        enableEditorFeatures();
        bindFieldSaving();
        bindImageUploads();
        bindJobUpload();
      }
      bindJobBoxes();
      closeModal();
      await fetchContent();
      await renderAttachments();
      setStatus("Erfolgreich angemeldet");
    });
  };

  const initSupabase = async () => {
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes("YOUR_PROJECT_ID")) {
      if (loginTrigger) {
        loginTrigger.hidden = false;
        loginTrigger.innerHTML = "✎";
        loginTrigger.setAttribute("title", "Supabase einrichten");
      }
      document.body.classList.remove("content-loading");
      return;
    }

    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });

    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;
    currentProfile = await loadCurrentProfile(currentUser);
    setLoginState(currentUser, currentProfile);
    setupLoginForm();
    await fetchContent();
    await renderAttachments();
    document.body.classList.remove("content-loading");

    if (hasEditAccess()) {
      enableEditorFeatures();
      bindFieldSaving();
      bindImageUploads();
      bindJobUpload();
      bindJobBoxes();
    }
  };

  initSupabase();
});
