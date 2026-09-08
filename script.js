document.addEventListener("DOMContentLoaded", async () => {
  const loadingStyle = document.createElement("style");
  loadingStyle.textContent = `
    .content-loading [data-field], .content-loading [data-image-field] { visibility: hidden; }
    .floating-box-layer { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
    .floating-base-layer { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; width: min(1100px, calc(100% - 32px)); margin: 28px auto; }
    .floating-base-layer:empty { display: none; }
    .floating-box { position: absolute; width: min(360px, calc(100vw - 32px)); padding: 24px 22px 18px; border: 1px solid rgba(67,59,53,.12); border-radius: 18px; background: #fffdf9; box-shadow: 0 18px 36px rgba(37,74,61,.16); pointer-events: auto; cursor: move; }
    .floating-base-layer .floating-box { position: relative; left: auto !important; top: auto !important; width: 100%; }
    .floating-box::before { content: ""; position: absolute; top: -7px; left: 50%; width: 18px; height: 18px; border: 3px solid #f8d7c7; border-radius: 50%; background: #c75c4e; box-shadow: 0 3px 5px rgba(67,59,53,.25); transform: translateX(-50%); }
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
    .floating-box-add { position: fixed; right: 22px; bottom: 22px; z-index: 30; display: none; border: 0; border-radius: 999px; padding: 12px 17px; background: #254a3d; color: #fff; box-shadow: 0 12px 25px rgba(37,74,61,.25); cursor: pointer; font: inherit; font-weight: 700; }
    body.editor-enabled .floating-box-add { display: block; }
    .floating-box-history { position: fixed; right: 22px; bottom: 76px; z-index: 30; display: none; gap: 6px; }
    body.editor-enabled .floating-box-history { display: flex; }
    .floating-box-history button { width: 34px; height: 34px; border: 0; border-radius: 50%; background: #e8e1d7; color: #254a3d; box-shadow: 0 8px 18px rgba(37,74,61,.14); cursor: pointer; font-size: 1.2rem; }
    .floating-box-history button:disabled { opacity: .4; cursor: default; }
    @media (max-width: 700px) { .floating-base-layer { grid-template-columns: 1fr; } }
    @media (max-width: 560px) { .floating-box-add, .floating-box-history { right: 16px; } .floating-box-add { bottom: 16px; } .floating-box-history { bottom: 70px; } }
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
  let floatingHistory = [];
  let floatingHistoryIndex = -1;
  let restoringFloatingHistory = false;
  const contentPage = (() => {
    const fileName = window.location.pathname.split("/").pop().toLowerCase();
    if (fileName.includes("ausschreibung")) return "jobs";
    if (fileName.includes("raeumlichkeiten")) return "rooms";
    if (fileName.includes("gruppen")) return "groups";
    return "home";
  })();

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
    if (floatingAddButton) floatingAddButton.hidden = !hasEditAccess();
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
      element.setAttribute("contenteditable", "true");
      element.classList.add("is-editable");
    });
    document.querySelectorAll("[data-image-field]").forEach((element) => {
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
        imageScale: box.imageScale || 100,
        imageX: box.imageX || 0,
        imageY: box.imageY || 0,
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
            imageScale: Number(value.imageScale) || 100,
            imageX: Number(value.imageX) || 0,
            imageY: Number(value.imageY) || 0,
            order: Number(value.order) || 0,
            placement: value.placement === "top" ? "top" : "bottom"
          };
        } catch {
          return { key: entry.key, title: "Neuer Kasten", text: entry.value || "Inhalt ergänzen", image: "", imageScale: 100, imageX: 0, imageY: 0, order: 0, placement: "bottom" };
        }
      })
      .sort((first, second) => (first.order || 0) - (second.order || 0));

    const boxMarkup = (box) => `
      <article class="job-box" draggable="false" data-job-box-key="${escapeHtml(box.key)}" data-job-box-placement="${box.placement || "bottom"}" data-image-scale="${box.imageScale || 100}" data-image-x="${box.imageX || 0}" data-image-y="${box.imageY || 0}">
        <button class="job-box-delete" type="button" title="Kasten löschen" aria-label="Kasten löschen">×</button>
        <button class="job-box-drag-handle" type="button" draggable="false" title="Kasten verschieben">↕ Verschieben</button>
        <div class="job-box-image">
          ${box.image ? `<img src="${escapeHtml(box.image)}" alt="" draggable="false" data-job-box-image />` : `<span class="job-box-placeholder">Noch kein Bild eingefügt</span>`}
        </div>
        <h3 data-job-box-field="title">${escapeHtml(box.title)}</h3>
        <p data-job-box-field="text">${escapeHtml(box.text)}</p>
        <div class="job-box-tools">
          <button class="cta small secondary job-box-image-button" type="button">Bild auswählen</button>
          <button class="cta small secondary job-box-layer-up" type="button">Ebene hoch</button>
          <button class="cta small secondary job-box-order-left" type="button" title="Kasten nach vorne verschieben">←</button>
          <button class="cta small secondary job-box-order-right" type="button" title="Kasten nach hinten verschieben">→</button>
          <input class="job-box-upload" type="file" accept="image/png,image/jpeg,image/webp" />
          <label>Größe <input type="range" min="60" max="180" value="${box.imageScale || 100}" data-job-box-control="scale" /></label>
          <label>Horizontal <input type="range" min="-30" max="30" value="${box.imageX || 0}" data-job-box-control="x" /></label>
          <label>Vertikal <input type="range" min="-30" max="30" value="${box.imageY || 0}" data-job-box-control="y" /></label>
        </div>
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
      bindJobBoxReorderDrag(card, card);
      const imageFrame = card.querySelector(".job-box-image");
      const image = card.querySelector("[data-job-box-image]");
      if (imageFrame && image) bindJobBoxImageDrag(imageFrame, card);
    });
  };

  const bindJobBoxReorderDrag = (handle, card) => {
    let dragState = null;

    handle.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess()) return;
      if (event.target.closest(".job-box-image, .job-box-tools, .job-box-delete, input, select, textarea, a")) return;
      if (!event.target.closest("[contenteditable=\"true\"]")) event.preventDefault();
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
    updateFloatingHistoryButtons();
    setStatus("Änderung angewendet");
  };

  const undoFloatingChange = () => applyFloatingHistory(floatingHistoryIndex - 1);
  const redoFloatingChange = () => applyFloatingHistory(floatingHistoryIndex + 1);

  const handleFloatingHistoryShortcut = (event) => {
    if (!hasEditAccess() || !event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.target.closest("[contenteditable=\"true\"], input, textarea")) return;
    if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoFloatingChange();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoFloatingChange();
    }
  };

  const ensureFloatingBoxUI = () => {
    if (document.getElementById("floating-box-layer")) return;
    const floatingMarkup = `
      <div id="floating-base-layer" class="floating-base-layer"></div>
      <div id="floating-box-layer" class="floating-box-layer"></div>
      <button id="floating-box-add" class="floating-box-add" type="button">+ Kasten hinzufügen</button>
      <div class="floating-box-history" aria-label="Änderungsverlauf">
        <button id="floating-box-undo" type="button" title="Rückgängig">←</button>
        <button id="floating-box-redo" type="button" title="Wiederholen">→</button>
      </div>
    `;
    const footer = document.querySelector("footer");
    if (footer) footer.insertAdjacentHTML("beforebegin", floatingMarkup);
    else document.body.insertAdjacentHTML("beforeend", floatingMarkup);
    document.getElementById("floating-box-add").addEventListener("click", addFloatingBox);
    document.getElementById("floating-box-undo").addEventListener("click", undoFloatingChange);
    document.getElementById("floating-box-redo").addEventListener("click", redoFloatingChange);
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
    <article class="floating-box ${Number(box.layer || 1) <= 1 ? "floating-base-box" : "floating-overlay-box"}" data-floating-key="${escapeHtml(box.key)}" data-left="${box.left || 16}" data-top="${box.top || 16}" data-layer="${box.layer || (contentPage === "jobs" ? 2 : 1)}" data-image-scale="${box.imageScale || 100}" data-image-x="${box.imageX || 0}" data-image-y="${box.imageY || 0}" style="left:${box.left || 16}px;top:${box.top || 16}px;z-index:${box.layer || (contentPage === "jobs" ? 2 : 1)}">
      <button class="floating-box-delete" type="button" aria-label="Kasten löschen">×</button>
      <div class="floating-box-image">${box.image ? `<img src="${escapeHtml(box.image)}" alt="" draggable="false" data-floating-image />` : ""}</div>
      <h3 data-floating-field="title" contenteditable="false">${escapeHtml(box.title)}</h3>
      <p data-floating-field="text" contenteditable="false">${escapeHtml(box.text)}</p>
      <div class="floating-box-tools">
        <button type="button" data-floating-upload-button>Bild auswählen</button>
        <button type="button" data-floating-layer="up">Ebene hoch</button>
        <button type="button" data-floating-layer="down">Ebene runter</button>
        <input type="file" accept="image/png,image/jpeg,image/webp" data-floating-upload />
        <label>Größe <input type="range" min="60" max="180" value="${box.imageScale || 100}" data-floating-control="scale" /></label>
        <label>X <input type="range" min="-30" max="30" value="${box.imageX || 0}" data-floating-control="x" /></label>
        <label>Y <input type="range" min="-30" max="30" value="${box.imageY || 0}" data-floating-control="y" /></label>
      </div>
    </article>
  `;

  const renderFloatingBoxes = (entries) => {
    ensureFloatingBoxUI();
    const layer = document.getElementById("floating-box-layer");
    const baseLayer = document.getElementById("floating-base-layer");
    floatingBoxEntries = entries.filter((entry) => entry.page === contentPage && entry.key.startsWith("floating_box_")).map((entry) => {
      try {
        return { ...JSON.parse(entry.value || "{}"), key: entry.key };
      } catch {
        return { key: entry.key, title: "Neue Information", text: entry.value || "Inhalt ergänzen", left: 32, top: window.scrollY + 120, layer: 1 };
      }
    });
    if (contentPage === "jobs") {
      floatingBoxEntries.forEach((entry, index) => { entry.layer = Math.max(2, Number(entry.layer) || index + 2); });
    } else if (!floatingBoxEntries.some((entry) => Number(entry.layer) > 1)) {
      floatingBoxEntries.forEach((entry, index) => { entry.layer = index + 1; });
    }
    const baseBoxes = floatingBoxEntries.filter((entry) => Number(entry.layer || 1) <= 1);
    const overlayBoxes = floatingBoxEntries.filter((entry) => Number(entry.layer || 1) > 1);
    baseLayer.innerHTML = baseBoxes.map(floatingBoxMarkup).join("");
    layer.innerHTML = overlayBoxes.map(floatingBoxMarkup).join("");
    document.querySelectorAll(".floating-box").forEach((card) => {
      const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
      card.querySelectorAll("[data-floating-field]").forEach((field) => {
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
      if (image) {
        imageFrame.addEventListener("load", () => {}, true);
        bindFloatingImageDrag(imageFrame, card);
        updateFloatingImage(card);
      }
      bindFloatingBoxDrag(card, box);
    });
  };

  const bindFloatingBoxDrag = (card, box) => {
    let state = null;
    const isBaseBox = Number(card.dataset.layer || 1) <= 1;
    card.addEventListener("pointerdown", (event) => {
      if (!hasEditAccess() || event.target.closest(".floating-box-image, .floating-box-tools, .floating-box-delete, input, button")) return;
      if (!event.target.closest("[contenteditable=\"true\"]")) event.preventDefault();
      card.setPointerCapture(event.pointerId);
      state = { id: event.pointerId, x: event.clientX, y: event.clientY, left: Number(card.dataset.left), top: Number(card.dataset.top), targetKey: card.dataset.floatingKey };
      card.classList.add("is-dragging");
    });
    card.addEventListener("pointermove", (event) => {
      if (!state || state.id !== event.pointerId) return;
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
    box.text = card.querySelector('[data-floating-field="text"]').textContent.trim() || "Inhalt ergänzen";
    box.left = Number(card.dataset.left);
    box.top = Number(card.dataset.top);
    box.imageScale = Number(card.dataset.imageScale) || 100;
    box.imageX = Number(card.dataset.imageX) || 0;
    box.imageY = Number(card.dataset.imageY) || 0;
    box.layer = Number(card.dataset.layer) || 1;
    const error = await persistFloatingBox(box);
    if (!error) recordFloatingHistory();
    setStatus(error ? "Fehler beim Speichern." : "Kasten gespeichert");
  };

  const moveFloatingLayer = async (card, direction) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const box = floatingBoxEntries.find((entry) => entry.key === card.dataset.floatingKey);
    if (!box) return;
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
        imageScale: box.imageScale || 100,
        imageX: box.imageX || 0,
        imageY: box.imageY || 0,
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
    jobBoxEntries.push({ key: baseKey, title: box.title, text: box.text, image: box.image || "", imageScale: box.imageScale || 100, imageX: box.imageX || 0, imageY: box.imageY || 0, order: jobBoxEntries.length, placement: "bottom" });
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
    const { error } = await supabaseClient.from("site_content").delete().eq("page", contentPage).eq("key", key);
    if (error) { setStatus("Fehler beim Löschen."); return; }
    floatingBoxEntries = floatingBoxEntries.filter((entry) => entry.key !== key);
    renderFloatingBoxes(floatingBoxEntries.map((entry) => ({ page: contentPage, key: entry.key, value: JSON.stringify(entry) })));
    recordFloatingHistory();
    setStatus("Kasten gelöscht");
  };

  const addFloatingBox = async () => {
    if (!supabaseClient || !hasEditAccess()) {
      setStatus("Bitte zuerst anmelden.");
      return;
    }
    const box = { key: `floating_box_${Date.now()}`, title: "Neue Information", text: "Hier kannst du deinen Text eintragen.", left: Math.max(16, (window.innerWidth - 360) / 2), top: window.scrollY + 120, image: "", imageScale: 100, imageX: 0, imageY: 0, layer: contentPage === "jobs" ? 2 : 1 };
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

  const convertBaseBoxToFloating = async (button) => {
    if (!supabaseClient || !hasEditAccess()) return;
    const card = button.closest(".job-box");
    const key = card.dataset.jobBoxKey;
    const baseBox = jobBoxEntries.find((entry) => entry.key === key);
    if (!baseBox) return;
    const highestLayer = Math.max(1, ...floatingBoxEntries.map((entry) => Number(entry.layer) || 1));
    const rect = card.getBoundingClientRect();
    const floatingBox = {
      key: `floating_box_${Date.now()}`,
      title: baseBox.title,
      text: baseBox.text,
      image: baseBox.image || "",
      imageScale: baseBox.imageScale || 100,
      imageX: baseBox.imageX || 0,
      imageY: baseBox.imageY || 0,
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

    data.forEach((entry) => {
      const page = entry.page || "home";
      const key = entry.key;
      const value = entry.value || "";

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

    renderJobBoxes(data);
    renderFloatingBoxes(data);
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
