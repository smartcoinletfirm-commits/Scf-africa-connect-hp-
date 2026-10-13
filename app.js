/* =========================================================
   SCF AFRICA CONNECT | SMART COINLET FIRM
   Authentication • Activation • Dashboard • Wallet • Tasks
   Supabase-powered member dashboard
   ========================================================= */

(() => {
  "use strict";

  const SUPABASE_URL = "https://vulbvlardmvvxdhqyopn.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_hve5CvGEO3tyocvupHOv9w_zEVEaN9a";
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
  let dashboardRequest = 0;

  const themes = [
    {
      bg: "#07140d",
      surface: "#0d2116",
      surface2: "#112b1c",
      text: "#eff8f1",
      muted: "#a8bcae",
      accent: "#69e69a",
      accent2: "#b4f4c9",
      line: "#244633"
    },
    {
      bg: "#07111e",
      surface: "#0d1e32",
      surface2: "#122943",
      text: "#eef6ff",
      muted: "#a9bdd3",
      accent: "#69c7ff",
      accent2: "#c2eaff",
      line: "#24435f"
    },
    {
      bg: "#160e20",
      surface: "#24162f",
      surface2: "#32203f",
      text: "#fbf1ff",
      muted: "#c5b0d1",
      accent: "#d5a1ff",
      accent2: "#f0d9ff",
      line: "#4a3159"
    },
    {
      bg: "#19140b",
      surface: "#292012",
      surface2: "#392b16",
      text: "#fff7e7",
      muted: "#d0c1a3",
      accent: "#f2c56b",
      accent2: "#ffebba",
      line: "#5b4726"
    }
  ];

  /* ---------------- NOTICES ---------------- */

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

  function showError(error) {
    console.error("SCF error:", error);
    notice(
      error?.message || "Something went wrong. Please try again.",
      "error"
    );
  }

  /* ---------------- PAGE NAVIGATION ---------------- */

  function showView(id) {
    [
      "authView",
      "activationView",
      "pendingView",
      "dashboardView"
    ].forEach(view => {
      $(view)?.classList.toggle("hidden", view !== id);
    });

    clearNotice();
  }

  function switchMode(mode) {
    document.querySelectorAll(".tab").forEach(tab => {
      tab.classList.toggle("active", tab.dataset.mode === mode);
    });

    $("signupForm")?.classList.toggle("hidden", mode !== "signup");
    $("loginForm")?.classList.toggle("hidden", mode !== "login");

    clearNotice();
  }

  /* ---------------- PROFILE ---------------- */

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
      .select(
        "id,full_name,email,phone,role,account_status," +
        "referral_code,referred_by,country,education_level"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function routeUser(user) {
    currentUser = user;
    currentProfile = null;

    try {
      const profile = await loadProfile(user);
      currentProfile = profile;

      if (!profile) {
        showView("authView");
        notice(
          "Your login exists but your SCF profile is missing. " +
          "Please contact support.",
          "error"
        );
        return;
      }

      if (profile.account_status === "approved") {
        showDashboard(profile);
        return;
      }

      if (
        ["awaiting_activation", "rejected"].includes(
          profile.account_status
        )
      ) {
        showView("activationView");
        updatePayLink();

        if (profile.account_status === "rejected") {
          notice(
            "Your previous submission needs attention. " +
            "Contact support before paying again.",
            "info"
          );
        }
        return;
      }

      if ($("pendingLabel")) {
        $("pendingLabel").textContent =
          profile.account_status === "payment_review"
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

  /* ---------------- DASHBOARD ---------------- */

  function showDashboard(profile) {
    showView("dashboardView");

    if ($("memberName")) {
      $("memberName").textContent =
        (profile.full_name || profile.email || "Member").split(" ")[0];
    }

    if ($("dashStatus")) {
      $("dashStatus").textContent = profile.account_status || "unknown";
    }

    if ($("refCode")) {
      $("refCode").textContent = profile.referral_code || "Not assigned";
    }

    if ($("refCount")) {
      $("refCount").textContent =
        "Referral count will appear when connected.";
    }

    if ($("copyReferral")) {
      $("copyReferral").disabled = !profile.referral_code;
    }

    if ($("circleFeed")) {
      $("circleFeed").textContent =
        "Your circle updates will appear here when verified milestones are available.";
    }

    loadDashboardData();
  }

  /* ---------------- DASHBOARD UI HELPERS ---------------- */

  function createCard(titleText) {
    const card = document.createElement("section");

    card.style.cssText = [
      "padding:18px",
      "border:1px solid var(--line)",
      "border-radius:14px",
      "background:var(--surface)",
      "color:var(--text)",
      "min-width:0"
    ].join(";");

    const title = document.createElement("h3");
    title.textContent = titleText;
    title.style.marginTop = "0";

    card.appendChild(title);
    return card;
  }

  function createText(text) {
    const p = document.createElement("p");
    p.textContent = text;
    p.style.color = "var(--muted)";
    return p;
  }

  function createActionButton(label, callback) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.cssText = [
      "padding:10px 14px",
      "border:1px solid var(--line)",
      "border-radius:9px",
      "background:var(--surface2)",
      "color:var(--text)",
      "cursor:pointer"
    ].join(";");

    button.addEventListener("click", callback);
    return button;
  }

  function money(value, currency = "KES") {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return `${currency} —`;
    }

    return `${currency} ${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
  }

  function setMessage(container, message) {
    container.replaceChildren(createText(message));
  }

  /* ---------------- REAL WALLET, TASKS & WITHDRAWALS ---------------- */

  async function loadDashboardData() {
    if (!db || !currentUser || !currentProfile) return;

    if (currentProfile.account_status !== "approved") return;

    const userId = currentUser.id;
    const requestId = ++dashboardRequest;
    const dashboard = $("dashboardView");

    if (!dashboard) return;

    let panel = $("scfLiveDashboard");

    if (!panel) {
      panel = document.createElement("div");
      panel.id = "scfLiveDashboard";
      panel.style.cssText =
        "display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr));gap:16px;margin-top:20px;";
      dashboard.appendChild(panel);
    }

    panel.replaceChildren();

    const walletCard = createCard("💰 My Wallet");
    const walletContent = document.createElement("div");
    setMessage(walletContent, "Loading your wallet…");
    walletCard.appendChild(walletContent);

    const tasksCard = createCard("📋 Available Tasks");
    const tasksContent = document.createElement("div");
    setMessage(tasksContent, "Loading available tasks…");
    tasksCard.appendChild(tasksContent);

    const withdrawalsCard = createCard("🏦 Withdrawal History");
    const withdrawalsContent = document.createElement("div");
    setMessage(withdrawalsContent, "Loading withdrawal history…");
    withdrawalsCard.appendChild(withdrawalsContent);

    const refreshButton = createActionButton(
      "↻ Refresh dashboard",
      () => loadDashboardData()
    );

    panel.append(
      walletCard,
      tasksCard,
      withdrawalsCard,
      refreshButton
    );

    const [walletResult, tasksResult, withdrawalsResult] =
      await Promise.all([
        db
          .from("wallets")
          .select(
            "currency,available_balance,reserved_balance,total_withdrawn"
          )
          .eq("user_id", userId)
          .maybeSingle(),

        db
          .from("tasks")
          .select(
            "id,title,description,task_type,reward_points," +
            "reward_kes,requires_review"
          )
          .eq("is_active", true)
          .order("created_at", { ascending: false }),

        db
          .from("withdrawal_requests")
          .select(
            "id,amount,currency,status,created_at,admin_note"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10)
      ]);

    if (
      requestId !== dashboardRequest ||
      !currentUser ||
      currentUser.id !== userId
    ) {
      return;
    }

    /* WALLET */

    walletContent.replaceChildren();

    if (walletResult.error) {
      setMessage(
        walletContent,
        "Unable to load your wallet. Check the wallets SELECT policy."
      );
      console.error("Wallet load error:", walletResult.error);
    } else if (!walletResult.data) {
      setMessage(
        walletContent,
        "No wallet record was found for your account. Contact support."
      );
    } else {
      const wallet = walletResult.data;
      const currency = wallet.currency || "KES";

      const balanceLabel = createText("Available balance");
      balanceLabel.style.marginBottom = "4px";

      const balance = document.createElement("p");
      balance.textContent = money(wallet.available_balance, currency);
      balance.style.cssText =
        "font-size:1.5rem;font-weight:bold;color:var(--accent);margin:4px 0 16px;";

      const reserved = createText(
        "Reserved: " + money(wallet.reserved_balance, currency)
      );

      const withdrawn = createText(
        "Total withdrawn: " + money(wallet.total_withdrawn, currency)
      );

      walletContent.append(
        balanceLabel,
        balance,
        reserved,
        withdrawn
      );
    }

    /* TASKS */

    tasksContent.replaceChildren();

    if (tasksResult.error) {
      setMessage(
        tasksContent,
        "Unable to load tasks. Check the tasks SELECT policy."
      );
      console.error("Tasks load error:", tasksResult.error);
    } else if (!tasksResult.data?.length) {
      setMessage(tasksContent, "No active tasks are available right now.");
    } else {
      tasksResult.data.forEach(task => {
        const taskCard = document.createElement("article");
        taskCard.style.cssText =
          "padding:13px;margin-bottom:12px;border:1px solid var(--line);border-radius:10px;overflow-wrap:anywhere;";

        const title = document.createElement("h4");
        title.textContent = task.title;

        const description = createText(task.description || "No description provided.");

        const points = createText(
          `${Number(task.reward_points || 0)} points`
        );

        const cash = createText(
          `Cash reward: ${money(task.reward_kes || 0, "KES")}`
        );

        const review = createText(
          task.requires_review
            ? "Completion requires administrator review."
            : "Task completion rules must be configured."
        );

        const unavailable = createText(
          "Task completion is not enabled yet."
        );
        unavailable.style.fontSize = "0.85rem";

        taskCard.append(
          title,
          description,
          points,
          cash,
          review,
          unavailable
        );

        tasksContent.appendChild(taskCard);
      });
    }

    /* WITHDRAWAL HISTORY */

    withdrawalsContent.replaceChildren();

    if (withdrawalsResult.error) {
      setMessage(
        withdrawalsContent,
        "Unable to load withdrawal history. Check the withdrawal SELECT policy."
      );
      console.error(
        "Withdrawal history error:",
        withdrawalsResult.error
      );
    } else if (!withdrawalsResult.data?.length) {
      setMessage(
        withdrawalsContent,
        "You have no withdrawal requests yet."
      );
    } else {
      withdrawalsResult.data.forEach(request => {
        const item = document.createElement("article");
        item.style.cssText =
          "padding:12px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere;";

        const amount = document.createElement("strong");
        amount.textContent = money(request.amount, request.currency || "KES");

        const status = createText(
          "Status: " + (request.status || "unknown")
        );

        const date = createText(
          request.created_at
            ? "Requested: " + new Date(request.created_at).toLocaleString()
            : "Request date unavailable"
        );

        item.append(amount, status, date);

        if (request.admin_note) {
          item.appendChild(
            createText("Admin note: " + request.admin_note)
          );
        }

        withdrawalsContent.appendChild(item);
      });
    }
  }

  /* ---------------- PAYD ACTIVATION ---------------- */

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
        `${country || "Selected country"} payment link is not configured. ` +
        "Contact support before paying.";
      area.appendChild(message);
    }
  }

  /* ---------------- SIGNUP ---------------- */

  async function signup(event) {
    event.preventDefault();
    clearNotice();

    if (!db) {
      return notice(
        "Supabase did not load. Check your configuration.",
        "error"
      );
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
      return notice(
        "Please complete your name, email, and phone number.",
        "error"
      );
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
          "Registration received. If email confirmation is enabled, " +
          "confirm your email, then log in. Your SCF profile should be " +
          "created automatically.",
          "success"
        );
      } else if (data.user) {
        await routeUser(data.user);
      } else {
        notice(
          "Registration response received. Please log in.",
          "success"
        );
      }
    } catch (error) {
      showError(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* ---------------- LOGIN ---------------- */

  async function login(event) {
    event.preventDefault();
    clearNotice();

    if (!db) {
      return notice("Supabase did not load.", "error");
    }

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

  /* ---------------- PAYMENT REFERENCE SUBMISSION ---------------- */

  async function submitProof(event) {
    event.preventDefault();
    clearNotice();

    if (!db || !currentUser || !currentProfile) {
      return notice(
        "Please log in again before submitting your payment reference.",
        "error"
      );
    }

    if (
      !["awaiting_activation", "rejected"].includes(
        currentProfile.account_status
      )
    ) {
      return notice(
        "Your account is not currently eligible to submit a new reference.",
        "error"
      );
    }

    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');

    if (button) button.disabled = true;

    const fd = new FormData(form);
    const reference = String(fd.get("reference") || "").trim();
    const country =
      $("payCountry")?.value || currentProfile.country || "";
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
      const { error } = await db
        .from("payment_submissions")
        .insert({
          user_id: currentUser.id,
          country,
          membership_level: level,
          payment_provider: "Payd",
          payment_reference: reference,
          status: "submitted"
        });

      if (error) throw error;

      notice(
        "Your reference was submitted. Your account remains locked " +
        "while the administrator reviews it.",
        "success"
      );

      await refreshStatus();
    } catch (error) {
      showError(error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  /* ------------
