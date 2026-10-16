"use strict";

(() => {
  /* ================= DOM HELPERS ================= */

  const $ = (id) => document.getElementById(id);

  const pageMessage = $("pageMessage");
  const profileForm = $("profileForm");
  const uploadForm = $("uploadForm");
  const certificateList = $("certificateList");

  let allCertificates = [];
  let currentStudent = null;

  /* ================= API HELPER ================= */

  async function api(url, options = {}) {
    let response;

    try {
      response = await fetch(url, {
        credentials: "same-origin",
        ...options
      });
    } catch (error) {
      throw new Error(
        "Server se connection nahi ho paaya. Check karein ki backend running hai."
      );
    }

    const contentType = response.headers.get("content-type") || "";
    let data = {};

    if (contentType.includes("application/json")) {
      data = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => "");

      data = {
        error: text.startsWith("<")
          ? `Server error (${response.status}). Backend terminal check karein.`
          : text || `Request failed (${response.status}).`
      };
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        `Request failed (${response.status}).`
      );
    }

    return data;
  }

  /* ================= MESSAGES ================= */

  function setMessage(element, message, type = "") {
    if (!element) return;

    element.textContent = message || "";

    element.classList.remove("success", "error", "warning");

    if (type) {
      element.classList.add(type);
    }

    const colors = {
      success: "#16845b",
      error: "#c83e4d",
      warning: "#946200"
    };

    element.style.color = colors[type] || "";
    element.style.overflowWrap = "anywhere";
  }

  function setButtonLoading(button, loading, normalText) {
    if (!button) return;

    button.disabled = loading;
    button.setAttribute("aria-busy", String(loading));

    button.textContent = loading
      ? "Uploading…"
      : normalText;
  }

  /* ================= SAFE VALUE HELPERS ================= */

  function getStudentObject(data) {
    return data?.student || data?.profile || data?.user || data || {};
  }

  function getField(object, ...keys) {
    for (const key of keys) {
      const value = object?.[key];

      if (value !== undefined && value !== null) {
        return value;
      }
    }

    return "";
  }

  function formatDate(value) {
    if (!value) return "Date not provided";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function normaliseCategory(category) {
    const value = String(category || "").toLowerCase();

    return value.includes("non")
      ? "non-academic"
      : "academic";
  }

  function getOriginalFilename(certificate) {
    return (
      certificate.original_filename ||
      certificate.file_name ||
      certificate.filename ||
      "Certificate file"
    );
  }

  /* ================= LOAD STUDENT PROFILE ================= */

  async function loadStudentProfile() {
    try {
      const data = await api("/api/me");

      if (data.authenticated === false) {
        setMessage(
          pageMessage,
          "Please sign in with your official college account.",
          "warning"
        );

        return false;
      }

      if (data.role && data.role !== "student") {
        setMessage(
          pageMessage,
          "This page is intended for student accounts.",
          "warning"
        );

        return false;
      }

      currentStudent = getStudentObject(data);

      const name = getField(
        currentStudent,
        "name",
        "full_name",
        "displayName"
      );

      $("welcomeName").textContent = name || "Student";
      $("studentName").value = name || "";

      $("registrationNo").value = getField(
        currentStudent,
        "registration_no",
        "registrationNo",
        "registration_number"
      );

      $("passingYear").value = getField(
        currentStudent,
        "year_of_passing",
        "yearOfPassing"
      );

      const semester = getField(
        currentStudent,
        "semester",
        "current_semester"
      );

      if (semester !== "") {
        $("semester").value = String(semester);
      }

      setMessage(pageMessage, "");

      return true;

    } catch (error) {
      setMessage(
        pageMessage,
        error.message || "Could not load your student profile.",
        "error"
      );

      return false;
    }
  }

  /* ================= SAVE STUDENT PROFILE ================= */

  profileForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = $("studentName").value.trim();
    const registrationNo = $("registrationNo").value.trim();
    const passingYear = Number($("passingYear").value);
    const semester = Number($("semester").value);

    const message = $("profileMessage");
    const button = $("saveProfileButton");

    setMessage(message, "");

    if (!name || !registrationNo) {
      setMessage(
        message,
        "Please enter your name and registration number.",
        "error"
      );
      return;
    }

    if (
      !Number.isInteger(passingYear) ||
      passingYear < 2020 ||
      passingYear > 2100
    ) {
      setMessage(message, "Please enter a valid passing year.", "error");
      return;
    }

    if (
      !Number.isInteger(semester) ||
      semester < 1 ||
      semester > 8
    ) {
      setMessage(message, "Please select a valid semester.", "error");
      return;
    }

    button.disabled = true;
    button.textContent = "Saving…";

    setMessage(message, "Saving your profile…");

    try {
      const payload = {
        name,
        registration_no: registrationNo,
        year_of_passing: passingYear,
        semester
      };

      await api("/api/student/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      setMessage(message, "Profile saved successfully.", "success");

      $("welcomeName").textContent = name;

      currentStudent = {
        ...(currentStudent || {}),
        ...payload
      };

    } catch (error) {
      setMessage(
        message,
        error.message || "Unable to save the profile.",
        "error"
      );

    } finally {
      button.disabled = false;
      button.textContent = "Save profile";
    }
  });

  /* ================= UPLOAD CERTIFICATE ================= */

  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = $("uploadButton");
    const message = $("uploadMessage");

    const category = $("category").value;
    const eventName = $("eventName").value.trim();
    const eventDate = $("eventDate").value;
    const fileInput = $("certificateFile");
    const file = fileInput.files?.[0];

    setMessage(message, "");

    /* Validate category */

    if (!["academic", "non-academic"].includes(category)) {
      setMessage(
        message,
        "Please select a valid certificate category.",
        "error"
      );
      return;
    }

    /* Validate event name */

    if (!eventName) {
      setMessage(
        message,
        "Please enter the event or certificate title.",
        "error"
      );

      $("eventName").focus();
      return;
    }

    if (eventName.length > 180) {
      setMessage(
        message,
        "Event title must be no longer than 180 characters.",
        "error"
      );
      return;
    }

    /* Validate file selection */

    if (!file) {
      setMessage(
        message,
        "Please select a certificate file.",
        "error"
      );

      fileInput.focus();
      return;
    }

    /* Backend supports only PDF, JPG and PNG */

    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png"
    ];

    const allowedExtensions = /\.(pdf|png|jpe?g)$/i;

    if (
      !allowedTypes.includes(file.type) ||
      !allowedExtensions.test(file.name)
    ) {
      setMessage(
        message,
        "Only PDF, JPG and PNG certificate files are supported.",
        "error"
      );
      return;
    }

    /*
     * IMPORTANT:
     * These names match server.js:
     * certificate, category, eventName, eventDate
     */

    const formData = new FormData();

    formData.append("category", category);
    formData.append("eventName", eventName);
    formData.append("eventDate", eventDate);
    formData.append("certificate", file);

    /* Show status immediately */

    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.textContent = "Uploading…";

    setMessage(
      message,
      "Uploading your certificate. Please wait…"
    );

    try {
      // Allow the browser to display the loading status before the request.
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const result = await api("/api/certificates", {
        method: "POST",
        body: formData
      });

      setMessage(
        message,
        result.message || "Certificate uploaded successfully.",
        "success"
      );

      uploadForm.reset();

      // Refresh records after successful upload.
      await loadCertificates();

    } catch (error) {
      console.error("Certificate upload failed:", error);

      setMessage(
        message,
        `Upload failed: ${error.message || "Please try again."}`,
        "error"
      );

    } finally {
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.innerHTML =
        'Upload certificate <span aria-hidden="true">↑</span>';
    }
  });

  /* ================= LOAD CERTIFICATE RECORDS ================= */

  async function loadCertificates() {
    certificateList.setAttribute("aria-busy", "true");
    certificateList.replaceChildren();

    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "Loading your certificates…";

    certificateList.appendChild(loading);

    try {
      const response = await api("/api/my-certificates");

      const records = Array.isArray(response)
        ? response
        : Array.isArray(response.certificates)
          ? response.certificates
          : Array.isArray(response.items)
            ? response.items
            : [];

      allCertificates = records;

      renderCertificates();

    } catch (error) {
      certificateList.replaceChildren();

      const errorBox = document.createElement("div");
      errorBox.className = "message error";
      errorBox.textContent =
        error.message || "Unable to load your certificates.";

      certificateList.appendChild(errorBox);

    } finally {
      certificateList.setAttribute("aria-busy", "false");
    }
  }

  /* ================= RENDER CERTIFICATE LIST ================= */

  function renderCertificates() {
    const searchInput = $("certificateSearch");
    const categorySelect = $("certificateFilter");

    const searchText = searchInput.value.trim().toLowerCase();
    const categoryFilter = categorySelect.value;

    const filteredCertificates = allCertificates.filter((certificate) => {
      const title = String(certificate.event_name || "").toLowerCase();
      const filename = getOriginalFilename(certificate).toLowerCase();

      const category = normaliseCategory(certificate.category);

      const matchesSearch =
        title.includes(searchText) ||
        filename.includes(searchText);

      const matchesCategory =
        categoryFilter === "all" ||
        category === categoryFilter;

      return matchesSearch && matchesCategory;
    });

    certificateList.replaceChildren();

    if (filteredCertificates.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";

      const heading = document.createElement("strong");

      heading.textContent = allCertificates.length
        ? "No matching certificates"
        : "No certificates yet";

      const description = document.createElement("p");

      description.textContent = allCertificates.length
        ? "Try a different search term or category."
        : "Upload your first certificate using the form above.";

      empty.append(heading, description);
      certificateList.appendChild(empty);

      return;
    }

    filteredCertificates.forEach((certificate) => {
      certificateList.appendChild(
        createCertificateCard(certificate)
      );
    });
  }

  /* ================= BUILD CERTIFICATE CARD ================= */

  function createCertificateCard(certificate) {
    const row = document.createElement("article");
    row.className = "certificate-item";

    const info = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent =
      certificate.event_name ||
      getOriginalFilename(certificate) ||
      "Certificate";

    const category = normaliseCategory(certificate.category);

    const badge = document.createElement("span");
    badge.className = `category-badge ${category}`;
    badge.textContent =
      category === "academic"
        ? "Academic"
        : "Non-Academic";

    const details = document.createElement("small");
    details.textContent =
      `${getOriginalFilename(certificate)} · ` +
      `${formatDate(certificate.event_date || certificate.uploaded_at)}`;

    info.append(title, badge, details);

    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.className = "button light";
    viewButton.textContent = "View";

    viewButton.addEventListener("click", () => {
      openCertificate(certificate, viewButton);
    });

    row.append(info, viewButton);

    return row;
  }

  /* ================= OPEN CERTIFICATE ================= */

  async function openCertificate(certificate, button) {
    if (!certificate.id) {
      setMessage(
        pageMessage,
        "This certificate record has no ID.",
        "error"
      );
      return;
    }

    const newTab = window.open("about:blank", "_blank");

    if (!newTab) {
      setMessage(
        pageMessage,
        "Your browser blocked the new tab. Allow pop-ups and try again.",
        "warning"
      );
      return;
    }

    newTab.opener = null;

    const previousText = button.textContent;

    button.disabled = true;
    button.textContent = "Opening…";

    try {
      const response = await api(
        `/api/certificates/${encodeURIComponent(certificate.id)}/file`
      );

      if (!response.url) {
        throw new Error(
          "The server did not return a certificate link."
        );
      }

      newTab.location.replace(response.url);

    } catch (error) {
      newTab.close();

      setMessage(
        pageMessage,
        error.message || "Unable to open this certificate.",
        "error"
      );

    } finally {
      button.disabled = false;
      button.textContent = previousText;
    }
  }

  /* ================= SEARCH & FILTER ================= */

  $("certificateSearch").addEventListener(
    "input",
    renderCertificates
  );

  $("certificateFilter").addEventListener(
    "change",
    renderCertificates
  );

  $("refreshCertificates").addEventListener("click", async () => {
    const button = $("refreshCertificates");

    button.disabled = true;
    button.textContent = "Refreshing…";

    try {
      await loadCertificates();

    } finally {
      button.disabled = false;
      button.textContent = "↻ Refresh list";
    }
  });

  /* ================= LOGOUT ================= */

  $("logout").addEventListener("click", async () => {
    const button = $("logout");

    button.disabled = true;
    button.textContent = "Signing out…";

    try {
      await fetch("/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });

    } catch (error) {
      console.error("Logout request failed:", error);

    } finally {
      window.location.assign("/");
    }
  });

  /* ================= INITIALISE DASHBOARD ================= */

  async function initialiseStudentDashboard() {
    try {
      await Promise.all([
        loadStudentProfile(),
        loadCertificates()
      ]);

    } catch (error) {
      console.error("Dashboard initialisation error:", error);

      setMessage(
        pageMessage,
        error.message || "Unable to initialise the dashboard.",
        "error"
      );
    }
  }

  initialiseStudentDashboard();

})();