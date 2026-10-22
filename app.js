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
    if (button) { button.disabled = state; button.setAttribute("aria-busy", state ? "true" : "false"); }
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
    event.preventDefault(); clearNotice();
    if (busy) return;
    const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
    busy = true; setBusy(button, true);
    try {
      requireDatabase();
      if (!currentUser || !currentProfile) throw new Error("Please log in before requesting activation.");
      const level = Number($("activationLevel")?.value);
      const phone = phoneClean($("activationPhone")?.value);
      if (!Number.isInteger(level) || level < 1 || level > 4) throw new Error("Choose a membership level from 1 to 4.");
      if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Enter a valid phone number with country code, for example +2547XXXXXXXX.");
      const { data, error } = await db.functions.invoke("scholarbridge-activation", { body: { action: "request", membership_level: level, phone } });
      if (error) throw error;
      if (!data?.request?.id) throw new Error(data?.error || "The activation request was not saved.");
      currentActivationRequest = data.request;
      $("verificationForm")?.classList.add("hidden");
      if ($("verificationMessage")) $("verificationMessage").textContent = `Your Level ${level} request is recorded for ${phone}. Please wait for the administrator to assign your position number and send it through WhatsApp.`;
      const phoneField = $("activationPhone"); if (phoneField) phoneField.value = phone;
      showView("verificationView");
      notice("Activation request sent. Your account remains locked until the administrator reviews your position number, confirms payment and approves the account.", "success");
    } catch (error) { showError(error); }
    finally { busy = false; setBusy(button, false); }
  }

  async function verifyActivationCode(event) {
    event.preventDefault(); clearNotice();
    if (busy) return;
    const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
    busy = true; setBusy(button, true);
    try {
      requireDatabase();
      if (!currentUser || !currentActivationRequest?.id) throw new Error("Your activation request was not found. Refresh the status or submit a new request.");
      const positionNumber = String(new FormData(form).get("position_number") || "").trim();
      if (!/^\d{4}$/.test(positionNumber)) throw new Error("Enter the four-digit Scholarbrige position number sent to you.");
      const { data, error } = await db.functions.invoke("scholarbridge-activation", { body: { action: "submit_position", request_id: currentActivationRequest.id, position_number: positionNumber } });
      if (error) throw error;
      if (!data?.submitted) throw new Error(data?.error || "Your position number could not be submitted.");
      form.reset();
      await routeUser(currentUser);
      notice("Position number submitted. Please wait for the administrator's manual review.", "success");
    } catch (error) { showError(error); }
    finally { busy = false; setBusy(button, false); }
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
      return old && old.status !== r.status;
    });
    if (adminQueueInitialized && (newlyArrived.length || changedStates.length)) {
      playAdminAlarm();
      if ("Notification" in window && Notification.permission === "granted") {
        const submitted = changedStates.filter(r => r.status === "position_submitted").length;
        const accepted = changedStates.filter(r => r.status === "position_accepted").length;
        const bits = [];
        if (newlyArrived.length) bits.push(`${newlyArrived.length} new activation request(s)`);
        if (submitted) bits.push(`${submitted} position number submission(s) need review`);
        if (accepted) bits.push(`${accepted} position number(s) accepted`);
        new Notification(`${BRAND_NAME}: action needed`, { body: bits.join("; ") || "An activation request changed. Review the admin queue." });
      }
    }
    previousAdminRequestIds = newIds;
    previousAdminRequestState = new Map(requests.map(r => [r.id, { status: r.status }]));
    adminQueueInitialized = true;
    if (status) status.textContent = `${requests.length} activation request(s). Assign position numbers manually, review the number submitted by each member, and confirm payment separately.`;
    list.replaceChildren();
    if (!requests.length) { list.appendChild(createText("No pending activation requests.")); return; }
    requests.forEach(request => {
      const item = document.createElement("article"); item.className = "activation-request";
      const heading = document.createElement("strong"); heading.textContent = `${request.full_name || "Member"} · Level ${request.membership_level}`; item.appendChild(heading);
      item.appendChild(createText(`${request.email || "No email"} · ${request.phone}`));
      item.appendChild(createText(`Status: ${request.status.replaceAll("_", " ")} · Requested ${new Date(request.created_at).toLocaleString()}`));
      const assigned = document.createElement("p"); assigned.className = "position-number-line"; assigned.textContent = `Position number assigned by admin: ${request.assigned_position_number || "Not assigned"}`; item.appendChild(assigned);
      const submitted = document.createElement("p"); submitted.className = "position-number-line"; submitted.textContent = `Position number submitted by member: ${request.submitted_position_number || "Not submitted"}`; item.appendChild(submitted);
      const actions = document.createElement("div"); actions.className = "activation-actions";
      if (["requested", "position_issued"].includes(request.status)) {
        actions.appendChild(createActionButton(request.status === "position_issued" ? "Resend assigned position number" : "Assign position number", async () => {
          const entered = window.prompt("Enter the four-digit position number you want to assign. Keep deleted members' numbers unused.", request.assigned_position_number || "");
          if (entered === null) return;
          const positionNumber = entered.trim();
          if (!/^\d{4}$/.test(positionNumber)) { notice("Enter exactly four digits for the position number.", "error"); return; }
          const waWindow = window.open("about:blank", "_blank");
          try {
            const { data: result, error: invokeError } = await db.functions.invoke("scholarbridge-activation", { body: { action: "issue_position", request_id: request.id, position_number: positionNumber } });
            if (invokeError) throw invokeError;
            if (!result?.issued || !result?.phone) throw new Error(result?.error || "Could not assign this position number. It may already be in use.");
            const digits = result.phone.replace(/\D/g, "");
            const message = `Hello ${result.full_name || "there"}, your Scholarbrige Academic Hub position number is ${result.position_number}. Enter this number on the Scholarbrige website to continue. This is a position/reference number, not a bank PIN or password.`;
            const wa = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
            if (waWindow) { waWindow.opener = null; waWindow.location.href = wa; }
            else {
              try { await navigator.clipboard.writeText(message); notice("WhatsApp was blocked. The message was copied; open WhatsApp and paste it.", "info"); }
              catch { window.prompt("Copy this Scholarbrige message and send it to the member on WhatsApp:", message); }
            }
            notice(`Position number ${result.position_number} assigned. Send the prefilled WhatsApp message.`, "success");
            await loadAdminActivationQueue();
          } catch (e) { if (waWindow) waWindow.close(); showError(e); }
        }));
      }
      if (request.status === "position_submitted") {
        actions.appendChild(createActionButton("Accept number · mini-approve", async () => {
          if (!window.confirm(`Accept the submitted position number ${request.submitted_position_number || "(not shown)"} for ${request.full_name}?`)) return;
          try {
            const { data: result, error: invokeError } = await db.functions.invoke("scholarbridge-activation", { body: { action: "mini_approve", request_id: request.id } });
            if (invokeError) throw invokeError;
            if (!result?.approved) throw new Error(result?.error || "Mini approval did not complete.");
            notice("Position accepted. The member can continue to the waiting-approval page.", "success");
            await loadAdminActivationQueue();
          } catch (e) { showError(e); }
        }));
        actions.appendChild(createActionButton("Decline number", async () => {
          if (!window.confirm(`Decline this submitted position number for ${request.full_name}? The member will be asked to contact support or submit a new request.`)) return;
          try {
            const { data: result, error: invokeError } = await db.functions.invoke("scholarbridge-activation", { body: { action: "mini_decline", request_id: request.id } });
            if (invokeError) throw invokeError;
            if (!result?.declined) throw new Error(result?.error || "Decline action did not complete.");
            notice("Position submission declined.", "success");
            await loadAdminActivationQueue();
          } catch (e) { showError(e); }
        }));
      }
      if (request.status === "position_accepted") {
        actions.appendChild(createActionButton("Final approve after confirming payment", async () => {
          const confirmed = window.confirm(`Have you independently confirmed the activation payment in your bank app for ${request.full_name || request.email}, Level ${request.membership_level}? Only approve if the payment is confirmed.`);
          if (!confirmed) return;
          try {
            const { data: result, error: invokeError } = await db.functions.invoke("scholarbridge-activation", { body: { action: "approve", request_id: request.id, payment_confirmed: true } });
            if (invokeError) throw invokeError;
            if (!result?.approved) throw new Error(result?.error || "Final approval did not complete.");
            notice("Account approved. Existing profile, wallet and referral records were preserved.", "success");
            await loadAdminActivationQueue();
          } catch (e) { showError(e); }
        }));
      }
      item.appendChild(actions); list.appendChild(item);
    });
  }

  let insightTimer = null;
  function startInsightPopups() {
    const messages = [
      ["Research reminder", "Use credible sources and check publication dates before citing information."],
      ["Academic writing tip", "Build each paragraph around one clear point, supported by evidence and explanation."],
      ["Referencing habit", "Record source details as you research so you can cite them accurately later."],
      ["Study discipline", "Break large assignments into research, outline, drafting, revision and proofreading."],
      ["Account safety", "Never share your password or a one-time verification code with anyone." ]
    ];
    let box = $("scfPopupNotice");
    if (!box) { box = document.createElement("aside"); box.id = "scfPopupNotice"; box.setAttribute("role", "status"); document.body.appendChild(box); }
    if (insightTimer) clearInterval(insightTimer);
    let index = 0;
    const show = () => {
      if (!$("dashboardView") || $("dashboardView").classList.contains("hidden")) { box.classList.remove("visible"); return; }
      const [heading, message] = messages[index % messages.length]; index++;
      box.replaceChildren(); const title = document.createElement("strong"); title.textContent = heading;
      const body = document.createElement("span"); body.textContent = message; box.append(title, body);
      box.classList.add("visible");
      setTimeout(() => box.classList.remove("visible"), 6500);
    };
    show(); insightTimer = setInterval(show, 12000);
  }


  function updateSalePrice() {
    const level = Number($("sellAccountLevel")?.value);
    const target = $("sellAccountPrice");
    if (target) target.textContent = Number.isInteger(level) && Object.hasOwn(ACCOUNT_SALE_PRICES, level)
      ? `Indicative transfer price: ${money(ACCOUNT_SALE_PRICES[level])}. Final eligibility and any transfer must be reviewed by an administrator.`
      : "Choose a level to see the indicative price.";
  }

  async function submitAccountSale(event) {
    event.preventDefault(); clearNotice();
    if (busy) return;
    const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
    busy = true; setBusy(button, true);
    try {
      requireDatabase();
      if (!currentUser || currentProfile?.account_status !== "approved") throw new Error("Only approved members can request an account transfer review.");
      if (!form.elements.sale_terms.checked) throw new Error("Please confirm the account-transfer terms.");
      const level = Number(form.elements.account_level.value);
      if (!Number.isInteger(level) || !Object.hasOwn(ACCOUNT_SALE_PRICES, level)) throw new Error("Choose a valid account level.");
      const { data, error } = await db.functions.invoke("scholarbridge-activation", { body: { action: "sale_request", account_level: level } });
      if (error) throw error;
      if (!data?.request?.id) throw new Error(data?.error || "Could not submit your account sale request.");
      if ($("sellAccountStatus")) $("sellAccountStatus").textContent = `Request submitted for Level ${level} at indicative price ${money(data.request.listing_price)}. Status: awaiting admin review.`;
      notice("Your account transfer request was submitted for administrator review.", "success");
      form.reset(); updateSalePrice();
      await loadAdminSaleQueue();
    } catch (error) { showError(error); }
    finally { busy = false; setBusy(button, false); }
  }

  async function loadAdminSaleQueue() {
    const panel = $("adminSalePanel"), list = $("adminSaleQueue"), status = $("adminSaleStatus");
    if (!panel || !list || !currentProfile || currentProfile.role !== "admin" || currentProfile.account_status !== "approved") return;
    panel.classList.remove("hidden");
    const { data, error } = await db.from("account_sale_requests").select("id,user_id,full_name,email,account_level,listing_price,status,created_at").in("status", ["requested","under_review"]).order("created_at", { ascending: true }).limit(100);
    if (error) { if (status) status.textContent = "Could not load sale requests. Confirm the account_sale_requests migration is installed."; return; }
    const requests = data || [];
    if (status) status.textContent = `${requests.length} account transfer request(s) awaiting review. Confirm eligibility and follow a documented transfer process; never request passwords.`;
    list.replaceChildren();
    if (!requests.length) { list.appendChild(createText("No account sale requests awaiting review.")); return; }
    requests.forEach(r => {
      const item = document.createElement("article"); item.className = "sale-request-item";
      const heading = document.createElement("strong"); heading.textContent = `${r.full_name || "Member"} · Level ${r.account_level} · ${money(r.listing_price)}`;
      item.append(heading, createText(`${r.email || "No email"} · Submitted ${new Date(r.created_at).toLocaleString()}`), createText(`Status: ${r.status.replaceAll("_", " ")}`));
      list.appendChild(item);
    });
  }

  function updateCosmicDayNight() {
    const sky = $("cosmicSky");
    if (!sky) return;
    const hour = new Date().getHours();
    sky.classList.toggle("night", hour >= 18 || hour < 6);
    sky.setAttribute("aria-label", hour >= 18 || hour < 6 ? "Night sky with moon and spinning Earth" : "Day sky with sun and spinning Earth");
  }

  function showDashboard(profile) {
    if (profile?.account_status !== "approved") { showView("pendingView"); return; }
    showView("dashboardView");
    if ($("memberName")) $("memberName").textContent = (profile.full_name || profile.email || "Member").split(" ")[0];
    if ($("dashStatus")) $("dashStatus").textContent = profile.account_status;
    if ($("refCode")) $("refCode").textContent = profile.referral_code || "Not assigned";
    if ($("refCount")) $("refCount").textContent = "Invite friends and build your Scholarbrige Circle";
    startInsightPopups();
    if ($("copyReferral")) $("copyReferral").disabled = !profile.referral_code;
    if ($("circleFeed")) $("circleFeed").textContent = "Verified community milestones and referral achievements will be shared here.";
    if (profile.role === "admin") {
      loadAdminActivationQueue().catch(error => console.error("Activation queue:", error));
      loadAdminSaleQueue().catch(error => console.error("Sale queue:", error));
      if (adminQueueTimer) clearInterval(adminQueueTimer);
      adminQueueTimer = setInterval(() => { loadAdminActivationQueue().catch(error => console.error("Activation queue:", error)); loadAdminSaleQueue().catch(error => console.error("Sale queue:", error)); }, 20000);
    } else {
      $("adminActivationPanel")?.classList.add("hidden");
      if (adminQueueTimer) { clearInterval(adminQueueTimer); adminQueueTimer = null; }
    }
    loadDashboardData().catch(error => {
      console.error("Dashboard load error:", error);
      notice("Your dashboard opened, but some information could not be loaded. Use Refresh dashboard to try again.", "error");
    });
  }

  async function loadDashboardData() {
    if (!db || !currentUser || !currentProfile || currentProfile.account_status !== "approved") return;
    const userId = currentUser.id, requestId = ++dashboardRequest, dashboard = $("dashboardView");
    if (!dashboard) return;
    let panel = $("scfLiveDashboard");
    if (!panel) {
      panel = document.createElement("div"); panel.id = "scfLiveDashboard";
      panel.style.cssText = "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;margin-top:20px;";
      dashboard.appendChild(panel);
    }
    panel.replaceChildren();

    const walletCard = createCard("💰 My Wallet"), walletContent = document.createElement("div");
    walletCard.classList.add("scf-wallet-card");
    setMessage(walletContent, "Loading wallet…"); walletCard.appendChild(walletContent);
    const tasksCard = createCard("📋 Available Tasks"), tasksContent = document.createElement("div");
    setMessage(tasksContent, "Loading tasks…"); tasksCard.appendChild(tasksContent);
    const withdrawalsCard = createCard("🏦 Withdrawal History"), withdrawalsContent = document.createElement("div");
    setMessage(withdrawalsContent, "Loading withdrawal history…"); withdrawalsCard.appendChild(withdrawalsContent);
    const insightsCard = createCard("✍️ Scholarbrige Learning Tips");
    insightsCard.classList.add("scf-insights-card");
    const insights = document.createElement("div");
    ["Market reminder: check reliable sources before acting on financial news.", "Trading discipline: never risk money you cannot afford to lose.", "Build consistently: budget first, save regularly, and avoid guaranteed-profit promises.", "Quote: A good financial decision is one you understand before you make it."].forEach((line, index) => {
      const item = createText(line); item.className = "scf-insight-item"; insights.appendChild(item);
    });
    insightsCard.appendChild(insights);
    panel.append(walletCard, insightsCard, tasksCard, withdrawalsCard, createActionButton("↻ Refresh dashboard", () => loadDashboardData().catch(showError)));

    const results = await Promise.all([
      db.from("wallets").select("currency,available_balance,reserved_balance,total_withdrawn").eq("user_id", userId).maybeSingle(),
      db.from("tasks").select("id,title,description,task_type,reward_points,reward_kes,requires_review").eq("is_active", true).order("created_at", { ascending: false }),
      db.from("withdrawal_requests").select("id,amount,currency,status,created_at,admin_note").eq("user_id", userId).order("created_at", { ascending: false }).limit(10)
    ]);
    if (requestId !== dashboardRequest || !currentUser || currentUser.id !== userId || currentProfile?.account_status !== "approved") return;
    const [walletResult, tasksResult, withdrawalsResult] = results;

    walletContent.replaceChildren();
    if (walletResult.error) {
      setMessage(walletContent, "Wallet unavailable. Check its SELECT policy.");
      const headline = $("walletHeadline"); if (headline) headline.textContent = "Unavailable";
      console.error("Wallet:", walletResult.error);
    } else if (!walletResult.data) { setMessage(walletContent, "No wallet record found. Contact support."); const headline = $("walletHeadline"); if (headline) headline.textContent = "Not found"; }
    else {
      const wallet = walletResult.data, currency = wallet.currency || "KES";
      const headline = $("walletHeadline"); if (headline) headline.textContent = money(wallet.available_balance, currency);
      const balance = createText(money(wallet.available_balance, currency)); balance.className = "scf-wallet-balance";
      walletContent.append(createText("Available balance"), balance,
        createText("Reserved: " + money(wallet.reserved_balance, currency)),
        createText("Total withdrawn: " + money(wallet.total_withdrawn, currency)));
    }

    tasksContent.replaceChildren();
    if (tasksResult.error) {
      setMessage(tasksContent, "Tasks unavailable. Check the tasks SELECT policy.");
      console.error("Tasks:", tasksResult.error);
    } else if (!tasksResult.data?.length) setMessage(tasksContent, "No active tasks available.");
    else tasksResult.data.forEach(task => {
      const article = document.createElement("article");
      article.style.cssText = "padding:13px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px;overflow-wrap:anywhere;";
      const title = document.createElement("h4"); title.textContent = task.title;
      article.append(title, createText(task.description || "No description provided."),
        createText(`${Number(task.reward_points || 0)} points`),
        createText("Cash reward: " + money(task.reward_kes || 0, "KES")),
        createText(task.requires_review ? "Completion requires administrator review." : "Completion rules are not configured."),
        createText("Task completion is not enabled yet."));
      tasksContent.appendChild(article);
    });

    withdrawalsContent.replaceChildren();
    if (withdrawalsResult.error) {
      setMessage(withdrawalsContent, "Withdrawal history unavailable. Check its SELECT policy.");
      console.error("Withdrawals:", withdrawalsResult.error);
    } else if (!withdrawalsResult.data?.length) setMessage(withdrawalsContent, "You have no withdrawal requests yet.");
    else withdrawalsResult.data.forEach(request => {
      const item = document.createElement("article");
      item.style.cssText = "padding:12px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere;";
      c
