/* Scholarbrige Academic Hub | Academic writing and student support */
(() => {
  "use strict";

  const SUPABASE_URL = "https://vulbvlardmvvxdhqyopn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hve5CvGEO3tyocvupHOv9w_zEVEaN9a";
  const SUPPORT_EMAIL = "smartcoin@gmail.com";
  const THEME_ORDER = ["sky-blue", "lavender", "forest-green", "rose-pink", "light-mode"];
  const THEME_INTERVAL = 40 * 60 * 1000;
  const THEME_KEY = "scf_theme_rotation_started_v1";
  const REVIEW_DURATION_MS = 6 * 60 * 60 * 1000;
  const REVIEW_KEY_PREFIX = "scholarbridge_review_started_v1:";
  const BRAND_NAME = "Scholarbrige Academic Hub";
  const ACCOUNT_SALE_PRICES = { 1: 0, 2: 0, 3: 0, 4: 4200, 5: 12880, 6: 18000.80 };
  const ACTIVATION_FEES = { 1: 500, 2: 1005, 3: 1780, 4: 2670 };
  let currentActivationRequest = null;
  let adminQueueTimer = null;
  let previousAdminRequestIds = new Set();
  let previousAdminRequestState = new Map();
  let adminQueueInitialized = false;
  let alarmAudioContext = null;
  let reviewTimer = null;
  const $ = id => document.getElementById(id);

  let db = null;
  try {
    if (window.supabase?.createClient) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  } catch (error) { console.error("SCF Supabase initialization:", error); }

  let currentUser = null;
  let currentProfile = null;
  let dashboardRequest = 0;
  let busy = false;
let authListenerRegistered = false;
  function notice(message, type = "info") {
    const el = $("notice");
    if (!el) { console.log("[Scholarbrige]", message); return; }
    el.textContent = String(message || "Something went wrong.");
    el.className = `notice ${type}`;
    el.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function clearNotice() { $("notice")?.classList.add("hidden"); }
  function showError(error) {
    console.error("SCF error:", error);
    notice(error?.message || "Something went wrong. Please try again.", "error");
  }
  function requireDatabase() {
    if (!db) throw new Error("Supabase did not load. Check your internet connection and script configuration.");
  }
  function showView(id) {
    ["authView", "activationView", "verificationView", "pendingView", "dashboardView"].forEach(view => {
      $(view)?.classList.toggle("hidden", view !== id);
    });
    clearNotice();
  }
  function switchMode(mode) {
    document.querySelectorAll(".tab").forEach(tab => tab.classList.toggle("active", tab.dataset.mode === mode));
    $("signupForm")?.classList.toggle("hidden", mode !== "signup");
    $("loginForm")?.classList.toggle("hidden", mode !== "login");
    clearNotice();
  }
  function setBusy(button, state) {
  // Support calls such as setBusy(true) and setBusy(false).
  if (typeof button === "boolean") {
    state = button;
    button = null;
  }

  // If no button was supplied, do not try to disable anything.
  if (!button || typeof button !== "object") return;

  if (!("disabled" in button)) return;

  button.disabled = Boolean(state);
  button.setAttribute("aria-busy", state ? "true" : "false");
  }
  function phoneClean(value) { return String(value || "").trim().replace(/[()\s-]/g, ""); }
  function getReferral() { return (new URLSearchParams(location.search).get("ref") || "").trim().toUpperCase(); }
  function money(value, currency = "KES") {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return `${currency} —`;
    return `${currency} ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  function createText(text) {
    const p = document.createElement("p");
    p.textContent = String(text ?? "");
    p.style.color = "var(--muted)";
    return p;
  }
  function createCard(titleText) {
    const card = document.createElement("section");
    card.style.cssText = "padding:18px;border:1px solid var(--line);border-radius:14px;background:var(--surface);color:var(--text);min-width:0;";
    const title = document.createElement("h3");
    title.textContent = titleText;
    title.style.marginTop = "0";
    card.appendChild(title);
    return card;
  }
  function setMessage(container, message) { container.replaceChildren(createText(message)); }
  function createActionButton(label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = "padding:10px 14px;border:1px solid var(--line);border-radius:9px;background:var(--surface2);color:var(--text);cursor:pointer;";
    button.addEventListener("click", callback);
    return button;
  }

  async function loadProfile(user) {
    requireDatabase();
    if (!user?.id) throw new Error("Please log in again.");
    const { data, error } = await db.from("profiles")
      .select("id,full_name,email,phone,role,account_status,referral_code,referred_by,country,education_level")
      .eq("id", user.id).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function routeUser(user) {
    if (!user) {
      currentUser = null; currentProfile = null; currentActivationRequest = null; dashboardRequest++;
      previousAdminRequestIds = new Set(); adminQueueInitialized = false;
      if (reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
      if (adminQueueTimer) { clearInterval(adminQueueTimer); adminQueueTimer = null; }
      showView("authView"); switchMode("login"); return;
    }
    currentUser = user; currentProfile = null;
    try {
      const profile = await loadProfile(user);
      if (currentUser?.id !== user.id) return;
      if (!profile) {
        showView("authView");
        notice("Your authentication account exists, but your Scholarbrige profile was not found. Please contact support.", "error");
        return;
      }
      currentProfile = profile;
      if (profile.account_status === "approved") {
        if (reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
        localStorage.removeItem(REVIEW_KEY_PREFIX + user.id);
        currentActivationRequest = null;
        showDashboard(profile); return;
      }

      const { data: activation, error: activationError } = await db.from("activation_requests")
        .select("id,user_id,phone,membership_level,status,created_at,verified_at,full_name,email")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (activationError) throw activationError;
      currentActivationRequest = activation || null;
      const activationPhoneField = $("activationPhone");
      if (activationPhoneField && !activationPhoneField.value) activationPhoneField.value = activation?.phone || profile.phone || "";

      if (activation && ["requested", "position_issued", "position_submitted"].includes(activation.status)) {
        const form = $("verificationForm");
        if (form) form.classList.toggle("hidden", activation.status !== "position_issued");
        if ($("verificationMessage")) {
          if (activation.status === "requested") $("verificationMessage").textContent = `Your Level ${activation.membership_level} request is recorded for ${activation.phone}. Please wait while the administrator assigns your position number and sends it on WhatsApp.`;
          else if (activation.status === "position_issued") $("verificationMessage").textContent = `Your position number has been assigned. Check WhatsApp and enter the four-digit position number below.`;
          else $("verificationMessage").textContent = "Your submitted position number is awaiting the administrator's manual review. Use Refresh my status to check for the decision.";
        }
        showView("verificationView"); return;
      }
      if (activation && activation.status === "position_accepted") {
        const fee = ACTIVATION_FEES[Number(activation.membership_level)];
        const direction = $("paymentDirection");
        if (direction && fee !== undefined) {
          direction.classList.remove("hidden");
          direction.replaceChildren();
          const heading = document.createElement("strong"); heading.textContent = "Activation payment instructions";
          const line = document.createElement("p"); line.textContent = `You are about to pay ${money(fee)} to Sasa Pay for Level ${activation.membership_level} account activation.`;
          const caution = document.createElement("p"); caution.textContent = "Before sending money, confirm the official Sasa Pay recipient and payment instructions with Scholarbrige support. Never share your M-Pesa PIN or bank OTP. Payment is reviewed manually and does not guarantee work or income.";
          direction.append(heading, line, caution);
        }
        if ($("pendingLabel")) $("pendingLabel").textContent = "Position accepted · awaiting payment confirmation and system approval";
        const startAt = activation.verified_at ? Date.parse(activation.verified_at) : Date.parse(activation.created_at);
        localStorage.setItem(REVIEW_KEY_PREFIX + user.id, String(Number.isFinite(startAt) ? startAt : Date.now()));
        showView("pendingView"); startReviewCountdown(Number.isFinite(startAt) ? startAt : Date.now()); return;
      }
      if (["rejected", "expired"].includes(activation?.status) || ["awaiting_activation", "rejected"].includes(profile.account_status)) {
        showView("activationView");
        const phone = $("activationPhone"); if (phone && profile.phone && !phone.value) phone.value = profile.phone;
        if (activation?.status === "rejected" || profile.account_status === "rejected") notice("Your position number was declined or your previous request needs attention. Contact support or submit a new request.", "error");
        return;
      }
      if ($("pendingLabel")) $("pendingLabel").textContent = "Account waiting for system approval";
      showView("pendingView"); startReviewCountdown(Date.now());
    } catch (error) {
      console.error("Profile routing:", error);
      showView("authView");
      notice("Could not load your Scholarbrige profile or activation request. Confirm the Scholarbrige SQL migration and policies have been applied, then try again.", "error");
    }
  }

  function startReviewCountdown(startAt) {
    if (reviewTimer) clearInterval(reviewTimer);
    const tick = () => {
      const remaining = Math.max(0, REVIEW_DURATION_MS - (Date.now() - startAt));
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      const display = $("reviewCountdown");
      if (display) display.textContent = [hours, minutes, seconds].map(n => String(n).padStart(2, "0")).join(":");
      const expired = $("reviewExpired");
      if (expired) expired.classList.toggle("hidden", remaining > 0);
      const message = $("reviewMessage");
      if (message) message.textContent = remaining > 0
        ? "Your account is under system checks and manual approval. The process usually takes less than six hours. Please keep your login details safe."
        : "The six-hour review estimate has elapsed and your account is still awaiting manual approval. Please contact Scholarbrige support for an update.";
      if (remaining <= 0 && reviewTimer) { clearInterval(reviewTimer); reviewTimer = null; }
    };
    tick();
    if (Date.now() - startAt < REVIEW_DURATION_MS) reviewTimer = setInterval(tick, 1000);
  }

  async function refreshStatus() {
    if (!currentUser) { notice("Please log in first.", "error"); return; }
    try {
      const profile = await loadProfile(currentUser);
      if (!profile) throw new Error("Your Scholarbrige profile was not found. Please contact support.");
      await routeUser(currentUser);
    } catch (error) { showError(error); }
  }

  async function signup(event) {
    event.preventDefault(); clearNotice();
    if (busy) return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    busy = true; setBusy(button, true);
    try {
      requireDatabase();
      const fd = new FormData(form);
      const fullName = String(fd.get("full_name") || "").trim();
      const email = String(fd.get("email") || "").trim().toLowerCase();
      const phone = phoneClean(fd.get("phone"));
      const password = String(fd.get("password") || "");
      const country = String(fd.get("country") || "");
      const education = String(fd.get("education_level") || "");
      const referral = (getReferral() || String(fd.get("referral_code") || "")).trim().toUpperCase();
      if (!fullName || !email || !phone) throw new Error("Please enter your full name, email and phone number.");
      if (password.length < 8) throw new Error("Your password must contain at least 8 characters.");
      if (fd.get("age_confirmed") !== "on") throw new Error("Please confirm that you are at least 18 years old.");
      const { data, error } = await db.auth.signUp({
        email, password,
      
        options: { data: { full_name: fullName, phone, country, education_level: education, age_confirmed: true, referral_code: referral || null } }
      });
      
      if (error) throw error;

if (data.user) {
  await routeUser(data.user);
  notice("Registration successful! Continue with Scholarbrige membership activation.", "success");
} else {
  throw new Error("Registration could not be completed. Please try again.");
}
    } catch (error) { showError(error); }
    finally { busy = false; setBusy(button, false); }
  }

  async function login(event) {
    event.preventDefault(); clearNotice();
    if (busy) return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    busy = true; setBusy(button, true);
    try {
      requireDatabase();
      const fd = new FormData(form);
      const email = String(fd.get("email") || "").trim().toLowerCase();
      const password = String(fd.get("password") || "");
      if (!email || !password) throw new Error("Enter your email address and password.");
      const { data, error } = await db.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await routeUser(data.user);
    } catch (error) { showError(error); }
    finally { busy = false; setBusy(button, false); }
  }

  async function resetPassword() {
    try {
      requireDatabase();
      const email = String($("loginForm")?.querySelector('[name="email"]')?.value || "").trim().toLowerCase();
      if (!email) throw new Error("Enter your email address in the login form first.");
      const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) throw error;
      notice("If password reset is available for this account, check your email for the reset link.", "success");
    } catch (error) { showError(error); }
  }

  async function requestActivation(event) {
  event.preventDefault();

  try {
    requireDatabase();

    if (!currentUser) {
      throw new Error("Please log in before requesting activation.");
    }

    const level = Number($("activationLevel")?.value);
    const phone = phoneClean($("activationPhone")?.value);

    if (!Number.isInteger(level) || level < 1 || level > 4) {
      throw new Error("Please select a valid membership level.");
    }

    if (!phone) {
      throw new Error("Please enter your payment phone number.");
    }

    setBusy(true);

    const { data, error } = await db.rpc("scf_submit_activation", {
  p_full_name: currentProfile?.full_name || currentUser.user_metadata?.full_name || "",
  p_phone: phone,
  p_membership_level: level
});

if (error) throw error;

    notice("Activation request submitted. Continue to the verification screen.", "success");

    await routeUser(currentUser);

  } catch (error) {
    showError(error);
  } finally {
    setBusy(false);
  }
  }
   

  async function verifyActivationCode(event) {
  event.preventDefault();

  try {
    requireDatabase();

    if (!currentUser) {
      throw new Error("Please log in before submitting your code.");
    }

    const input = document.querySelector(
      '#verificationForm [name="position_number"]'
    );

    const code = input?.value.trim() || "";

    if (!/^[A-Za-z0-9-]{2,50}$/.test(code)) {
      throw new Error("Please enter a valid FBK reference code.");
    }

    setBusy(true);

    const { error } = await db
      .from("fbk_code_submissions")
      .insert({
        user_id: currentUser.id,
        submitted_code: code
      });

    if (error) throw error;

    input.value = "";

const verificationView = document.getElementById("verificationView");
const pendingView = document.getElementById("pendingView");

if (!pendingView) {
  throw new Error("Awaiting review page not found.");
}

if (verificationView) {
  verificationView.classList.add("hidden");
}

pendingView.classList.remove("hidden");
pendingView.style.display = "block";

const reviewStart = Date.now();
localStorage.setItem(
  REVIEW_KEY_PREFIX + currentUser.id,
  String(reviewStart)
);

if (typeof startReviewCountdown === "function") {
  startReviewCountdown(reviewStart);
}

if ($("pendingLabel")) {
  $("pendingLabel").textContent =
    "Your FBK reference has been submitted. Your account is awaiting review.";
}

pendingView.scrollIntoView({
  behavior: "smooth",
  block: "start"
});
  } catch (error) {
  console.error("FBK submission error:", error);
  notice(
    "FBK submission failed: " + (error?.message || String(error)),
    "error"
  );
} finally {
  setBusy(false);
  }
  }

  async function refreshActivationStatus() {
    if (!currentUser) { notice("Please log in first.", "error"); return; }
    await routeUser(currentUser);
  }

  function playAdminAlarm() {
    // Browser audio must be unlocked by the admin pressing the alert-enable button.
    if (!alarmAudioContext) return;
    try {
      const start = alarmAudioContext.currentTime;
      for (let i = 0; i < 7; i++) {
        const oscillator = alarmAudioContext.createOscillator();
        const gain = alarmAudioContext.createGain();
        oscillator.type = "sawtooth";
        oscillator.frequency.value = i % 2 ? 980 : 720;
        gain.gain.setValueAtTime(0.0001, start + i * 0.32);
        gain.gain.exponentialRampToValueAtTime(0.16, start + i * 0.32 + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + i * 0.32 + 0.22);
        oscillator.connect(gain); gain.connect(alarmAudioContext.destination);
        oscillator.start(start + i * 0.32); oscillator.stop(start + i * 0.32 + 0.24);
      }
    } catch (error) { console.warn("Admin alarm unavailable:", error); }
  }

  async function loadAdminActivationQueue() {
    const panel = $("adminActivationPanel"), list = $("adminActivationQueue"), status = $("adminQueueStatus");
    if (!panel || !list || !currentProfile || currentProfile.role !== "admin" || currentProfile.account_status !== "approved") return;
    panel.classList.remove("hidden");
    const { data, error } = await db.from("activation_requests")
      .select("id,user_id,full_name,email,phone,membership_level,status,created_at,updated_at,assigned_position_number,submitted_position_number,position_issued_at,position_submitted_at,verified_at")
      .in("status", ["requested", "position_issued", "position_submitted", "position_accepted"])
      .not("user_id", "is", null)
      .order("created_at", { ascending: true }).limit(100);
    if (error) { if (status) status.textContent = "Could not load requests. Confirm the position-number migration and activation_requests admin SELECT policy are installed."; return; }
    const requests = data || [];
    const newIds = new Set(requests.map(r => r.id));
    const newlyArrived = requests.filter(r => !previousAdminRequestIds.has(r.id) && r.status === "requested");
    const changedStates = requests.filter(r => {
      const old = previousAdminRequestState.get(r.id);
      return old && old.status !== r.status
