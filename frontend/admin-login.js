
"use strict";

/* =========================================================
   CAMPUSACHIEVE — ADMIN LOGIN
   PIET | Pure Vanilla JavaScript
   ========================================================= */

/* ---------- 1. DOM elements ---------- */

const loginForm = document.getElementById("adminLoginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const messageElement = document.getElementById("msg");

/* ---------- 2. Additional HTML elements ---------- */

const pietLogo = document.getElementById("pietLogo");
const logoFallback = document.getElementById("logoFallback");
const toggleButton = document.getElementById("togglePassword");

/* ---------- 3. Logo fallback ---------- */

function showPietFallback() {
  if (pietLogo && logoFallback) {
    pietLogo.hidden = true;
    logoFallback.hidden = false;
  }
}

if (pietLogo && logoFallback) {
  pietLogo.addEventListener("error", showPietFallback);

  if (pietLogo.complete && pietLogo.naturalWidth === 0) {
    showPietFallback();
  }
}

/* ---------- 4. Password Show/Hide ---------- */

if (passwordInput && toggleButton) {
  toggleButton.addEventListener("click", () => {
    const passwordVisible = passwordInput.type === "text";

    passwordInput.type = passwordVisible ? "password" : "text";
    toggleButton.textContent = passwordVisible ? "Show" : "Hide";

    toggleButton.setAttribute(
      "aria-pressed",
      String(!passwordVisible)
    );
  });
}

/* ---------- 5. Check required HTML elements ---------- */

if (
  !loginForm ||
  !emailInput ||
  !passwordInput ||
  !loginButton ||
  !messageElement
) {
  console.error(
    "Admin login initialisation failed: required HTML elements are missing."
  );
} else {
  /* ---------- 6. API helper ---------- */

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options
    });

    const contentType = response.headers.get("content-type") || "";
    let data;

    if (contentType.includes("application/json")) {
      data = await response.json();
    } else {
      const text = await response.text();

      data = {
        error: text || "The server returned an unexpected response."
      };
    }

    if (!response.ok) {
      throw new Error(
        data.error ||
        data.message ||
        "Unable to sign in. Please check your credentials."
      );
    }

    return data;
  }

  /* ---------- 7. Display status and errors ---------- */

  function showMessage(message, type = "") {
    messageElement.textContent = message;

    messageElement.classList.remove("success", "error", "warning");

    if (type) {
      messageElement.classList.add(type);
    }
  }

  /* ---------- 8. Button loading state ---------- */

  function setLoginLoading(isLoading) {
    loginButton.disabled = isLoading;
    emailInput.readOnly = isLoading;
    passwordInput.readOnly = isLoading;

    if (isLoading) {
      loginButton.textContent = "Signing in...";
      loginButton.setAttribute("aria-busy", "true");
    } else {
      loginButton.innerHTML =
        'Sign in to dashboard <span aria-hidden="true">→</span>';

      loginButton.removeAttribute("aria-busy");
    }
  }

  /* ---------- 9. Validate credentials ---------- */

  function validateCredentials(email, password) {
    if (!email || !password) {
      showMessage(
        "Please enter both your administrator email and password.",
        "error"
      );

      return false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      showMessage("Please enter a valid email address.", "error");
      emailInput.focus();

      return false;
    }

    return true;
  }

  /* ---------- 10. Handle login form submission ---------- */

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginButton.disabled) {
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    showMessage("");

    if (!validateCredentials(email, password)) {
      return;
    }

    setLoginLoading(true);
    showMessage("Verifying your administrator credentials...");

    try {
      const data = await api("/auth/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });

      showMessage(
        "Login successful. Opening your dashboard...",
        "success"
      );

      if (data.mustChangePassword) {
        window.location.assign("/admin-dashboard.html");
        return;
      }

      window.location.assign("/admin-dashboard.html");

    } catch (error) {
      showMessage(
        error.message || "Login failed. Please try again.",
        "error"
      );

      passwordInput.value = "";
      passwordInput.focus();

    } finally {
      setLoginLoading(false);
    }
  });

  /* ---------- 11. Clear errors while typing ---------- */

  emailInput.addEventListener("input", () => {
    if (messageElement.classList.contains("error")) {
      showMessage("");
    }
  });

  passwordInput.addEventListener("input", () => {
    if (messageElement.classList.contains("error")) {
      showMessage("");
    }
  });

  /* ---------- 12. Initialise login form ---------- */

  setLoginLoading(false);
  showMessage("");
}
