(() => {
  "use strict";

  const SUPABASE_URL = "https://vulbvlardmvvxdhqyopn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hve5CvGEO3tyocvupHOv9w_zEVEaN9a";
  const SUPPORT_EMAIL = "smartcoin@gmail.com";

  const PAYD_LINKS = {
    Kenya: {
      1: "https://app.payd.money/link/scf",
      2: "https://app.payd.money/link/scfkl2",
      3: "https://app.payd.money/link/scfkl3",
      4: "https://app.payd.money/link/scfkl4"
    }
  };

  const $ = id => document.getElementById(id);
  const db = window.supabase?.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
  );

  let currentUser = null;
  let currentProfile = null;
  let authListenerRegistered = false;

  const themes = [
    {bg:"#07140d",surface:"#0d2116",surface2:"#112b1c",text:"#eff8f1",muted:"#a8bcae",accent:"#69e69a",accent2:"#b4f4c9",line:"#244633"},
    {bg:"#07111e",surface:"#0d1e32",surface2:"#122943",text:"#eef6ff",muted:"#a9bdd3",accent:"#69c7ff",accent2:"#c2eaff",line:"#24435f"},
    {bg:"#160e20",surface:"#24162f",surface2:"#32203f",text:"#fbf1ff",muted:"#c5b0d1",accent:"#d5a1ff",accent2:"#f0d9ff",line:"#4a3159"},
    {bg:"#19140b",surface:"#292012",surface2:"#392b16",text:"#fff7e7",muted:"#d0c1a3",accent:"#f2c56b",accent2:"#ffebba",line:"#5b4726"}
  ];

  function notice(message, type = "info") {
    const el = $("notice");
    if (!el) {
      console.log(message);
      return;
    }
    el.textContent = String(message || "Something went wrong.");
    el.className = `notice ${type}`;
    el.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function clearNotice() {
    $("notice")?.classList.add("hidden");
  }

  function showView(id) {
    ["authView", "activationView", "pendingView", "dashboardView"]
      .forEach(view => {
        $(view)?.classList.toggle("hidden", view !== id);
      });
    clearNotice();
  }

  function showError(error) {
    notice(error?.message || "Something went wrong. Please try again.", "error");
  }

  function switchMode(mode) {
    document.querySelectorAll(".tab").forEach(tab =>
      tab.classList.toggle("active", tab.dataset.mode === mode)
    );
    $("signupForm")?.classList.toggle("hidden", mode !== "signup");
    $("loginForm")?.classList.toggle("hidden", mode !== "login");
    clearNotice();
  }

  function phoneClean(phone) {
    return String(phone || "").trim().replace(/[()\s-]/g, "");
  }

  function getReferral() {
    return (
      new URLSearchParams(location.search).get("ref") || ""
    ).trim().toUpperCase();
  }

  async function loadProfile(user) {
    const { data, error } = await db
      .from("profiles")
      .select("id,full_name,email,phone,role,account_status,referral_code,referred_by,country,education_level")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function routeUser(user) {
    currentUser = user;

    try {
      currentProfile = await loadProfile(user);

      if (!currentProfile) {
        showView("authView");
        notice(
          "Your login exists but your SCF profile is missing. Please contact support.",
          "error"
        );
        return;
      }

      if (currentProfile.account_status === "approved") {
        showDashboard(currentProfile);
        return;
      }

      if (
        ["awaiting_activation", "rejected"].includes(
          currentProfile.account_status
        )
      ) {
        showView("activationView");
        updatePayLink();

        if (currentProfile.account_status === "rejected") {
          notice(
            "Your previous submission needs attention. Contact support before paying again.",
            "info"
          );
        }
        return;
      }

      if ($("pendingLabel")) {
        $("pendingLabel").textContent =
          currentProfile.account_status === "payment_review"
            ? "Payment under review"
            : "Pending approval";
      }

      showView("pendingView");
    } catch (error) {
      showView("authView");
      notice(
        "Could not load your SCF profile: " +
          (error.message || "Unknown error"),
        "error"
      );
    }
  }

  function showDashboard(profile) {
    showView("dashboardView");

    if ($("memberName")) {
      $("memberName").textContent =
        (profile.full_name || profile.email || "member").split(" ")[0];
    }

    if ($("dashStatus")) {
      $("dashStatus").textContent = profile.account_status || "unknown";
    }

    if ($("refCode")) {
      $("refCode").textContent = profile.referral_code || "Not assigned";
    }

    if ($("refCount")) {
      $("refCount").textContent = "Referral count will appear when connected.";
    }

    if ($("copyReferral")) {
      $("copyReferral").disabled = !profile.referral_code;
    }

    if ($("circleFeed")) {
      $("circleFeed").textContent =
        "Your circle updates will appear here when verified milestones are available.";
    }
  }

  function updatePayLink() {
    const countryEl = $("payCountry");
    const levelEl = $("payLevel");
    const area = $("payLinkArea");

    if (!countryEl || !levelEl || !area) return;

    const country = countryEl.value;
    const level = levelEl.value;
    const url = PAYD_LINKS[country]?.[level];

    area.replaceChildren();

    if (url) {
      const link = document.createElement("a");
      link.className = "pay-link";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = `Payd · ${country} · Level ${level} ↗`;
      area.appendChild(link);
    } else {
      const message = document.createElement("div");
      message.className = "pay-unavailable";
      message.textContent =
        `${country || "Selected country"} payment link is not configured. Contact support before paying.`;
      area.appendChild(message);
    }
  }

  async function signup(event) {
    event.preventDefault();
    clearNotice();

    if (!db) {
      return notice("Supabase did not load. Check your configuration.", "error");
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    const fd = new FormData(form);
    const fullName = String(fd.get("full_name") || "").trim();
    const email = String(fd.get("email") || "").trim().toLowerCase();
    const phone = phoneClean(fd.get("phone"));
    const referral =
      getReferral() ||
      String(fd.get("referral_code") || "").trim().toUpperCase();

    if (!fullName || !email || !phone) {
      if (button) button.disabled = false;
      return notice("Please complete your name, email, and phone number.", "error");
    }

    const metadata = {
      full_name: fullName,
      phone,
      education_level: String(fd.get("education_level") || ""),
      country: String(fd.get("country") || ""),
      age_confirmed: fd.get("age_confirmed") === "on",
      referral_code: referral || null
    };

    try {
      const { data, error } = await db.auth.signUp({
        email,
        password: String(fd.get("password") || ""),
        options: { data: metadata }
      });

      if (error) throw error;

      if (data.user && !data.session) {
        switchMode("login");
        notice(
          "Registration received. If email confirmation is enabled, confirm your email, then log in. Your SCF profile should be created automatically.",
          "success"
        );
      } else if (data.user) {
        await routeUser(data.user);
      } else {
        notice("Registration response received. Please log in.", "success");
      }
    } catch (error) {
      showError(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function login(event) {
    event.preventDefault();
    clearNotice();

    if (!db) return notice("Supabase did not load. Check your configuration.", "error");

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    const fd = new FormData(form);

    try {
      const { data, error } = await db.auth.signInWithPassword({
        email: String(fd.get("email") || "").trim().toLowerCase(),
        password: String(fd.get("password") || "")
      });

      if (error) throw error;
      await routeUser(data.user);
    } catch (error) {
      showError(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function refreshStatus() {
    if (!db) return notice("Supabase is not connected.", "error");

    const { data, error } = await db.auth.getUser();
    if (error) return showError(error);

    if (!data.user) {
      currentUser = null;
      currentProfile = null;
      showView("authView");
      return;
    }

    await routeUser(data.user);
  }

  async function logout() {
    if (db) {
      const { error } = await db.auth.signOut();
      if (error) return showError(error);
    }

    currentUser = null;
    currentProfile = null;
    switchMode("login");
    showView("authView");
  }

  async function submitProof(event) {
    event.preventDefault();
    clearNotice();

    if (!db || !currentUser || !currentProfile) {
      return notice("Please log in again before submitting your payment reference.", "error");
    }

    if (!["awaiting_activation", "rejected"].includes(currentProfile.account_status)) {
      return notice("Your account is not currently eligible to submit a new reference.", "error");
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    const fd = new FormData(form);
    const reference = String(fd.get("reference") || "").trim();
    const country = $("payCountry")?.value || currentProfile.country || "";
    const level = Number($("payLevel")?.value);

    if (!reference) {
      if (button) button.disabled = false;
      return notice("Please enter your payment reference.", "error");
    }

    if (!Number.isInteger(level) || level < 1 || level > 4) {
      if (button) button.disabled = false;
      return notice("Please select a valid membership level.", "error");
    }

    try {
      const { error } = await db.from("payment_submissions").insert({
        user_id: currentUser.id,
        country,
        membership_level: level,
        payment_provider: "Payd",
        payment_reference: reference,
        status: "submitted"
      });

      if (error) throw error;

      notice(
        "Your reference was submitted. Your account remains locked while the administrator reviews it. If your status does not change, contact support.",
        "success"
      );

      await refreshStatus();
    } catch (error) {
      notice(
        "Could not submit reference: " +
          (error.message || "Please check the payment_submissions table and INSERT policy."),
        "error"
      );
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function copyInvite() {
    if (!currentProfile?.referral_code) {
      return notice(
        "Your referral code is not assigned yet. Ask the administrator to configure referral codes.",
        "info"
      );
    }

    const link =
      `${location.origin}${location.pathname}?ref=${encodeURIComponent(currentProfile.referral_code)}`;

    try {
      await navigator.clipboard.writeText(link);
      notice("Referral link copied. Share it with a friend!", "success");
    } catch {
      notice(link, "info");
    }
  }

  function applyTheme() {
    const cycle = 46060 * 1000;
    const theme = themes[Math.floor(Date.now() / cycle) % themes.length];

    Object.entries(theme).forEach(([key, value]) => {
      document.documentElement.style.setProperty("--" + key, value);
    });
  }

  function startCommunityCounter() {
    const el = $("communityCount");
    if (el) el.textContent = "SCF Africa Connect";
  }

  function wire() {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => switchMode(tab.dataset.mode));
    });

    $("signupForm")?.addEventListener("submit", signup);
    $("loginForm")?.addEventListener("submit", login);
    $("proofForm")?.addEventListener("submit", submitProof);

    $("payCountry")?.addEventListener("change", updatePayLink);
    $("payLevel")?.addEventListener("change", updatePayLink);

    ["checkStatus", "checkPending"].forEach(id => {
      $(id)?.addEventListener("click", refreshStatus);
    });

    ["logoutActivation", "logoutPending", "dashLogout"].forEach(id => {
      $(id)?.addEventListener("click", logout);
    });

    ["copyReferral", "shareInvite"].forEach(id => {
      $(id)?.addEventListener("click", copyInvite);
    });

    $("showSupport")?.addEventListener("click", () => {
      location.href = "mailto:" + SUPPORT_EMAIL;
    });

    $("resetPassword")?.addEventListener("click", async () => {
      if (!db) return notice("Supabase is not connected.", "error");

      const email = String(
        $("loginForm")?.elements?.email?.value || ""
      ).trim();

      if (!email) return notice("Enter your email address first.", "info");

      const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: location.href.split("?")[0]
      });

      if (error) showError(error);
      else notice("If password reset is enabled, check your email for a reset link.", "success");
    });
  }

  async function init() {
    if ($("year")) $("year").textContent = new Date().getFullYear();

    applyTheme();
    setInterval(applyTheme, 60000);
    startCommunityCounter();
    wire();
    updatePayLink();

    if (!db) {
      notice(
        "Supabase client did not load. Check your internet connection and make sure the Supabase JS library loads before app.js.",
        "error"
      );
      return;
    }

    const { data, error } = await db.auth.getSession();
    if (error) showError(error);

    if (data?.session?.user) {
      await routeUser(data.session.user);
    } else {
      showView("authView");
    }

    if (!authListenerRegistered) {
      authListenerRegistered = true;

      db.auth.onAuthStateChange((_event, session) => {
        if (session?.user && !currentUser) {
          setTimeout(() => routeUser(session.user), 0);
        }

        if (!session?.user) {
          currentUser = null;
          currentProfile = null;
        }
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
