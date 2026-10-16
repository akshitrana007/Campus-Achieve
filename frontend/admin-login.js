
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


/* ---------- 2. Check required HTML elements ---------- */

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


  /* ---------- 3. API helper ---------- */

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options
    });

    const contentType =
      response.headers.get("content-type") || "";

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


  /* ---------- 4. Display status and errors ---------- */

  function showMessage(message, type = "") {
    messageElement.textContent = message;

    messageElement.classList.remove(
      "success",
      "error",
      "warning"
    );

    if (type) {
      messageElement.classList.add(type);
    }
  }


  /* ---------- 5. Button loading state ---------- */

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


  /* ---------- 6. Validate credentials ---------- */

  function validateCredentials(email, password) {
    if (!email || !password) {
      showMessage(
        "Please enter both your administrator email and password.",
        "error"
      );

      return false;
    }

    // Correct email validation pattern
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
      showMessage(
        "Please enter a valid email address.",
        "error"
      );

      emailInput.focus();
      return false;
    }

    return true;
  }


  /* ---------- 7. Handle login form submission ---------- */

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

    showMessage(
      "Verifying your administrator credentials..."
    );

    try {
      await api("/auth/admin/login", {
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

      /*
       * This path must be served by your Express backend.
       * If your server uses a different dashboard route,
       * change this URL to match server.js.
       */

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


  /* ---------- 8. Clear errors while typing ---------- */

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


  /* ---------- 9. Initialise login form ---------- */

  setLoginLoading(false);
  showMessage("");

}
