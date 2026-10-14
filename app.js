/* SCF AFRICA CONNECT | Smart Coinlet Firm */
(() => {
  "use strict";

  const SUPABASE_URL = "https://vulbvlardmvvxdhqyopn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_hve5CvGEO3tyocvupHOv9w_zEVEaN9a";
  const SUPPORT_EMAIL = "smartcoin@gmail.com";
  const PAYD_LINKS = { Kenya: {
    1: "https://app.payd.money/link/scf",
    2: "https://app.payd.money/link/scfkl2",
    3: "https://app.payd.money/link/scfkl3",
    4: "https://app.payd.money/link/scfkl4"
  }};
  const THEME_ORDER = ["sky-blue", "lavender", "forest-green", "rose-pink", "light-mode"];
  const THEME_INTERVAL = 40 * 60 * 1000;
  const THEME_KEY = "scf_theme_rotation_started_v1";
  const $ = id => document.getElementById(id);

  let db = null;
  try {
    if (window.supabase?.createClient) db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  } catch (error) { console.error("SCF Supabase initialization:", error); }

  let currentUser = null;
  let currentProfile = null;
  let dashboardRequest = 0;
  let busy = false;

  function notice(message, type = "info") {
    const el = $("notice");
    if (!el) { console.log("[SCF]", message); return; }
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
    ["authView", "activationView", "pendingView", "dashboardView"].forEach(view => {
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
      currentUser = null; currentProfile = null; dashboardRequest++;
      showView("authView"); switchMode("login"); return;
    }
    currentUser = user; currentProfile = null;
    try {
      const profile = await loadProfile(user);
      if (currentUser?.id !== user.id) return;
      if (!profile) {
        showView("authView");
        notice("Your authentication account exists, but your SCF profile was not found. Please contact support.", "error");
        return;
      }
      currentProfile = profile;
      if (profile.account_status === "approved") { showDashboard(profile); return; }
      if (["awaiting_activation", "rejected"].includes(profile.account_status)) {
        showView("activationView"); updatePayLink();
        if (profile.account_status === "rejected") notice("Your submission needs attention. Contact support before making another payment.", "error");
        return;
      }
      if ($("pendingLabel")) $("pendingLabel").textContent = profile.account_status === "payment_review" ? "Payment under review" : "Pending approval";
      showView("pendingView");
    } catch (error) {
      console.error("Profile routing:", error);
      showView("authView");
      notice("Could not load your SCF profile. Check your database permissions and profile record, then try again.", "error");
    }
  }

  async function refreshStatus() {
    if (!currentUser) { notice("Please log in first.", "error"); return; }
    try {
      const profile = await loadProfile(currentUser);
      if (!profile) throw new Error("Your SCF profile was not found. Please contact support.");
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
      if (!data.user) { notice("We could not confirm the registration response. Please try logging in or contact support.", "error"); return; }
      if (!data.session) {
        switchMode("login");
        notice("Registration received. Check your email if Supabase requires confirmation, then log in. Your profile should be created by the database trigger.", "success");
        return;
      }
      await routeUser(data.user);
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

  function updatePayLink() {
    const countryEl = $("payCountry"), levelEl = $("payLevel"), area = $("payLinkArea");
    if (!countryEl || !levelEl || !area) return;
    const country = countryEl.value, level = levelEl.value, url = PAYD_LINKS[country]?.[level];
    area.replaceChildren();
    if (!url) {
      const message = document.createElement("div");
      message.className = "pay-unavailable";
      message.textContent = `${country} · Level ${level}: payment link is not configured. Contact support before paying.`;
      area.appendChild(message); return;
    }
    const link = document.createElement("a");
    link.className = "pay-link"; link.href = url; link.target = "_blank";
    link.rel = "noopener noreferrer"; link.textContent = `Payd · ${country} · Level ${level} ↗`;
    area.appendChild(link);
  }

  async function submitProof(event) {
    event.preventDefault(); clearNotice();
    if (busy) return;
    const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
    busy = true; setBusy(button, true);
    try {
      requireDatabase();
      if (!currentUser || !currentProfile) throw new Error("Please log in again before submitting your payment reference.");
      if (!["awaiting_activation", "rejected"].includes(currentProfile.account_status)) throw new Error("Your account is not currently eligible to submit a new reference.");
      const fd = new FormData(form);
      const reference = String(fd.get("reference") || "").trim();
      const country = $("payCountry")?.value || "";
      const level = Number($("payLevel")?.value);
      if (!reference) throw new Error("Enter the payment reference from your receipt.");
      if (!Number.isInteger(level) || level < 1 || level > 4) throw new Error("Please choose a valid membership level.");
      if (!PAYD_LINKS[country]?.[level]) throw new Error("A payment link is not configured for this country and level. Contact support before paying.");
      const { error } = await db.from("payment_submissions").insert({
        user_id: currentUser.id, country, membership_level: level,
        payment_provider: "Payd", payment_reference: reference, status: "pending"
      });
      if (error) throw error;
      form.reset(); updatePayLink();
      notice("Your payment reference was submitted for manual review. Your account will not be approved automatically.", "success");
      await refreshStatus();
    } catch (error) { showError(error); }
    finally { busy = false; setBusy(button, false); }
  }

  function showDashboard(profile) {
    if (profile?.account_status !== "approved") { showView("pendingView"); return; }
    showView("dashboardView");
    if ($("memberName")) $("memberName").textContent = (profile.full_name || profile.email || "Member").split(" ")[0];
    if ($("dashStatus")) $("dashStatus").textContent = profile.account_status;
    if ($("refCode")) $("refCode").textContent = profile.referral_code || "Not assigned";
    if ($("refCount")) $("refCount").textContent = "Referral count not connected";
    if ($("copyReferral")) $("copyReferral").disabled = !profile.referral_code;
    if ($("circleFeed")) $("circleFeed").textContent = "Verified circle milestones will appear here when connected.";
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
    setMessage(walletContent, "Loading wallet…"); walletCard.appendChild(walletContent);
    const tasksCard = createCard("📋 Available Tasks"), tasksContent = document.createElement("div");
    setMessage(tasksContent, "Loading tasks…"); tasksCard.appendChild(tasksContent);
    const withdrawalsCard = createCard("🏦 Withdrawal History"), withdrawalsContent = document.createElement("div");
    setMessage(withdrawalsContent, "Loading withdrawal history…"); withdrawalsCard.appendChild(withdrawalsContent);
    panel.append(walletCard, tasksCard, withdrawalsCard, createActionButton("↻ Refresh dashboard", () => loadDashboardData().catch(showError)));

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
      console.error("Wallet:", walletResult.error);
    } else if (!walletResult.data) setMessage(walletContent, "No wallet record found. Contact support.");
    else {
      const wallet = walletResult.data, currency = wallet.currency || "KES";
      walletContent.append(createText("Available balance"), createText(money(wallet.available_balance, currency)),
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
      const amount = document.createElement("strong");
      amount.textContent = money(request.amount, request.currency || "KES");
      item.append(amount, createText("Status: " + (request.status || "unknown")),
        createText(request.created_at ? "Requested: " + new Date(request.created_at).toLocaleString() : "Request date unavailable"));
      if (request.admin_note) item.appendChild(createText("Admin note: " + request.admin_note));
      withdrawalsContent.appendChild(item);
    });
  }

  async function logout() {
    try {
      requireDatabase();
      const { error } = await db.auth.signOut();
      if (error) throw error;
      currentUser = null; currentProfile = null; dashboardRequest++;
      showView("authView"); switchMode("login");
      notice("You have been logged out.", "success");
    } catch (error) { showError(error); }
  }

  async function copyReferral() {
    const code = currentProfile?.referral_code;
    if (!code) { notice("Your referral code has not been assigned yet.", "error"); return; }
    const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      notice("Your invite link has been copied.", "success");
    } catch (error) {
      console.error("Copy link:", error);
      notice("Copy is unavailable in this browser. Share this link: " + link);
    }
  }

  function shareInvite() {
    const code = currentProfile?.referral_code;
    if (!code) { notice("Your referral code has not been assigned yet.", "error"); return; }
    const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;
    const message = `Join SCF Africa Connect — Connect, Grow, Learn and Earn: ${link}`;
    if (navigator.share) {
      navigator.share({ title: "SCF Africa Connect", text: message, url: link }).catch(error => {
        if (error?.name !== "AbortError") notice(message);
      });
    } else copyReferral();
  }

  function contactSupport() {
    const subject = encodeURIComponent("SCF Africa Connect support");
    const body = encodeURIComponent("Hello SCF Support,\n\nI need help with my account.\n\n" + `Account email: ${currentUser?.email || ""}\n`);
    location.href = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  function applyTheme() {
    try {
      let started = Number(localStorage.getItem(THEME_KEY));
      if (!Number.isFinite(started) || started <= 0) {
        started = Date.now(); localStorage.setItem(THEME_KEY, String(started));
      }
      const elapsed = Math.max(0, Date.now() - started);
      document.documentElement.dataset.theme = THEME_ORDER[Math.floor(elapsed / THEME_INTERVAL) % THEME_ORDER.length];
    } catch (error) {
      console.warn("SCF theme rotation:", error);
      document.documentElement.dataset.theme = THEME_ORDER[0];
    }
  }

  /* ---------------- EVENT LISTENERS ---------------- */

  function bindEvents() {
    $("signupForm")?.addEventListener("submit", signup);
    $("loginForm")?.addEventListener("submit", login);
    $("proofForm")?.addEventListener("submit", submitProof);

    document.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        switchMode(tab.dataset.mode);
      });
    });

    $("payCountry")?.addEventListener("change", updatePayLink);
    $("payLevel")?.addEventListener("change", updatePayLink);

    $("checkStatus")?.addEventListener("click", refreshStatus);
    $("checkPending")?.addEventListener("click", refreshStatus);

    [
      "logoutActivation",
      "logoutPending",
      "dashLogout"
    ].forEach(id => {
      $(id)?.addEventListener("click", async () => {
        if (!db) return;
        const { error } = await db.auth.signOut();
        if (error) showError(error);
        else await routeUser(null);
      });
    });

    $("copyReferral")?.addEventListener("click", copyReferral);

    $("shareInvite")?.addEventListener("click", shareReferral);

    $("showSupport")?.addEventListener("click", contactSupport);

    $("resetPassword")?.addEventListener("click", resetPassword);
  }

  /* ---------------- REFERRALS AND SUPPORT ---------------- */

  async function copyReferral() {
    const code = currentProfile?.referral_code;
    if (!code) {
      notice("Your referral code has not been assigned yet.", "error");
      return;
    }

    const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;

    try {
      await navigator.clipboard.writeText(link);
      notice("Referral link copied!", "success");
    } catch {
      notice(link, "info");
    }
  }

  async function shareReferral() {
    const code = currentProfile?.referral_code;
    if (!code) {
      notice("Your referral code has not been assigned yet.", "error");
      return;
    }

    const link = `${location.origin}${location.pathname}?ref=${encodeURIComponent(code)}`;
    const message = `Join SCF Africa Connect — Connect, Grow, Learn and Earn: ${link}`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "SCF Africa Connect",
          text: message
        });
      } catch (error) {
        if (error?.name !== "AbortError") notice(message);
      }
    } else {
      await copyReferral();
    }
  }

  function contactSupport() {
    const subject = encodeURIComponent("SCF Africa Connect support");
    const body = encodeURIComponent(
      "Hello SCF Support,\n\nI need help with my account.\n\n"
    );

    location.href =
      `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
  }

  async function resetPassword() {
    if (!db) {
      notice("Supabase did not load.", "error");
      return;
    }

    const email = String(
      $("loginForm")?.elements.email?.value || ""
    ).trim().toLowerCase();

    if (!email) {
      notice("Enter your email address first.", "error");
      return;
    }

    const redirectTo = `${location.origin}${location.pathname}`;

    const { error } = await db.auth.resetPasswordForEmail(email, {
      redirectTo
    });

    if (error) showError(error);
    else notice("If the email is registered, a password-reset link will be sent.", "success");
  }

  /* ---------------- STARTUP ---------------- */

  async function startApp() {
    const year = $("year");
    if (year) year.textContent = new Date().getFullYear();

    updatePayLink();
    applyTheme();
    bindEvents();

    if (!db) {
      notice("Supabase did not load. Please refresh the page.", "error");
      return;
    }

    try {
      const { data, error } = await db.auth.getSession();
      if (error) throw error;

      await routeUser(data.session?.user || null);

      if (!authListenerRegistered) {
        authListenerRegistered = true;

        db.auth.onAuthStateChange((_event, session) => {
          setTimeout(() => {
            routeUser(session?.user || null);
          }, 0);
        });
      }
    } catch (error) {
      showError(error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startApp, { once: true });
  } else {
    startApp();
  }
})();
