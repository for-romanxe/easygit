(() => {
  "use strict";

  // ----- 상태 -----
  const state = {
    project: null,
    branch: null,   // 파일 편집/기록 대상 작업공간
    branches: [],
  };

  // ----- DOM -----
  const $ = (id) => document.getElementById(id);
  const projectSelect = $("project-select");
  const branchList = $("branch-list");
  const currentBranchEl = $("current-branch");
  const fileList = $("file-list");
  const filePath = $("file-path");
  const fileContent = $("file-content");
  const commitMessage = $("commit-message");
  const mergeFrom = $("merge-from");
  const mergeInto = $("merge-into");
  const mergeResult = $("merge-result");
  const btnMerge = $("btn-merge");
  const btnResolve = $("btn-resolve");
  const conflictEditor = $("conflict-editor");
  const reviewOutput = $("review-output");
  const diffOutput = $("diff-output");
  const historyList = $("history-list");
  const toast = $("toast");
  const authOverlay = $("auth-overlay");
  const userChip = $("user-chip");
  const logoutBtn = $("btn-logout");

  // ----- API 도우미 -----
  async function api(path, options) {
    const res = await fetch("/api" + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (res.status === 401) {
      showLogin();
      throw new Error("로그인이 필요합니다");
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
  }

  // ----- 로그인 -----
  async function authPost(action, body) {
    const res = await fetch("/api/auth/" + action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "실패");
    return data;
  }

  function showLogin() {
    authOverlay.hidden = false;
    userChip.hidden = true;
    logoutBtn.hidden = true;
    state.user = null;
  }

  function onLoggedIn(user) {
    state.user = user;
    userChip.textContent = "👤 " + user;
    userChip.hidden = false;
    logoutBtn.hidden = false;
    authOverlay.hidden = true;
    $("auth-msg").textContent = "";
    $("auth-pass").value = "";
    loadProjects().catch((e) => notify(e.message, true));
  }

  async function doAuth(action) {
    const username = $("auth-user").value.trim();
    const password = $("auth-pass").value;
    try {
      const d = await authPost(action, { username, password });
      onLoggedIn(d.user);
    } catch (e) {
      $("auth-msg").textContent = e.message;
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    notify("로그아웃했습니다");
    showLogin();
  }

  let toastTimer;
  function notify(msg, isError) {
    toast.textContent = msg;
    toast.classList.toggle("is-error", !!isError);
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.hidden = true), 2600);
  }

  // ----- 프로젝트 -----
  async function loadProjects(selectName) {
    const projects = await api("/projects");
    projectSelect.innerHTML = "";
    if (projects.length === 0) {
      const opt = new Option("(프로젝트 없음 — 데모를 만들어 보세요)", "");
      projectSelect.add(opt);
      state.project = null;
      clearProjectView();
      return;
    }
    projects.forEach((p) => projectSelect.add(new Option(p, p)));
    const pick = selectName && projects.includes(selectName) ? selectName : projects[0];
    projectSelect.value = pick;
    await selectProject(pick);
  }

  function clearProjectView() {
    branchList.innerHTML = '<li class="empty">프로젝트를 먼저 선택하세요</li>';
    fileList.innerHTML = "";
    historyList.innerHTML = "";
    mergeFrom.innerHTML = "";
    mergeInto.innerHTML = "";
    currentBranchEl.textContent = "-";
  }

  async function selectProject(name) {
    state.project = name;
    await loadBranches();
  }

  // ----- 작업공간(브랜치) -----
  async function loadBranches(keepBranch) {
    const branches = await api(`/projects/${enc(state.project)}/branches`);
    state.branches = branches;

    branchList.innerHTML = "";
    branches.forEach((b) => {
      const li = document.createElement("li");
      li.dataset.branch = b;
      const name = document.createElement("span");
      name.textContent = b;
      name.onclick = () => selectBranch(b);
      li.appendChild(name);
      if (b !== "main") {
        const del = document.createElement("button");
        del.className = "branch-del";
        del.textContent = "×";
        del.title = "이 작업공간 삭제";
        del.onclick = (e) => { e.stopPropagation(); deleteBranch(b); };
        li.appendChild(del);
      }
      branchList.appendChild(li);
    });

    // 합치기 드롭다운 채우기
    fillSelect(mergeFrom, branches);
    fillSelect(mergeInto, branches);
    if (branches.length > 1) mergeInto.selectedIndex = branches.indexOf("main") >= 0 ? branches.indexOf("main") : 0;

    const pick = keepBranch && branches.includes(keepBranch) ? keepBranch
      : (branches.includes("main") ? "main" : branches[0]);
    if (pick) await selectBranch(pick);
  }

  async function selectBranch(branch) {
    state.branch = branch;
    currentBranchEl.textContent = branch;
    [...branchList.children].forEach((li) =>
      li.classList.toggle("is-active", li.dataset.branch === branch));
    await Promise.all([loadFiles(), loadHistory()]);
  }

  // ----- 파일 -----
  async function loadFiles() {
    const files = await api(`/projects/${enc(state.project)}/files?branch=${enc(state.branch)}`);
    fileList.innerHTML = "";
    if (files.length === 0) {
      fileList.innerHTML = '<li class="empty">파일 없음</li>';
      return;
    }
    files.forEach((f) => {
      const li = document.createElement("li");
      li.textContent = f;
      li.onclick = () => openFile(f, li);
      fileList.appendChild(li);
    });
  }

  async function openFile(path, li) {
    const data = await api(`/projects/${enc(state.project)}/file?branch=${enc(state.branch)}&path=${enc(path)}`);
    filePath.value = path;
    fileContent.value = data.content;
    [...fileList.children].forEach((el) => el.classList.toggle("is-active", el === li));
  }

  async function commitChange() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    if (!filePath.value.trim()) return notify("파일 경로를 입력하세요", true);
    await api(`/projects/${enc(state.project)}/commit`, {
      method: "POST",
      body: JSON.stringify({
        branch: state.branch,
        path: filePath.value.trim(),
        content: fileContent.value,
        message: commitMessage.value,
      }),
    });
    notify("변경을 올렸습니다 (찰칵!)");
    commitMessage.value = "";
    await Promise.all([loadFiles(), loadHistory()]);
  }

  // ----- 찰칵 기록 -----
  async function loadHistory() {
    const commits = await api(`/projects/${enc(state.project)}/history?branch=${enc(state.branch)}`);
    historyList.innerHTML = "";
    commits.forEach((c) => {
      const li = document.createElement("li");
      const when = new Date(c.when).toLocaleString("ko-KR");
      li.innerHTML = `<div class="h-msg">${escapeHtml(c.message)}</div>` +
        `<div class="h-meta">${escapeHtml(c.author)} · ${when} · ${c.id}</div>`;
      historyList.appendChild(li);
    });
  }

  // ----- 충돌 점검 / 합치기 -----
  async function checkMerge() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    const from = mergeFrom.value, into = mergeInto.value;
    conflictEditor.hidden = true;
    diffOutput.hidden = true;
    reviewOutput.hidden = true;
    if (from === into) return showMergeResult("info", "같은 작업공간끼리는 합칠 수 없습니다.", null);

    const r = await api(`/projects/${enc(state.project)}/check-merge?from=${enc(from)}&into=${enc(into)}`);

    if (r.upToDate) {
      showMergeResult("info", `'${into}' 에는 '${from}' 의 변경이 이미 모두 들어 있습니다.`, null);
      btnMerge.disabled = true;
      btnResolve.hidden = true;
      return;
    }
    if (r.clean) {
      showMergeResult("ok", `안전하게 합칠 수 있습니다. 충돌 없음 ✅`, { changes: r.changes });
      btnMerge.disabled = false;
      btnResolve.hidden = true;
    } else {
      showMergeResult("conflict", `겹친 부분(충돌)이 있습니다 ⚠️ — 합치기 전에 정리가 필요합니다.`,
        { conflicts: r.conflicts, changes: r.changes });
      btnMerge.disabled = true;
      btnResolve.hidden = false; // 직접 해결 버튼 노출
    }
  }

  // 충돌난 파일들을 줄 단위로 '이쪽/저쪽' 선택해 해결
  async function openResolver() {
    const from = mergeFrom.value, into = mergeInto.value;
    const files = await api(`/projects/${enc(state.project)}/conflict?from=${enc(from)}&into=${enc(into)}`);
    if (files.length === 0) return notify("충돌 파일이 없습니다", true);

    conflictEditor.hidden = false;
    conflictEditor.innerHTML = "";
    files.forEach((f) => conflictEditor.appendChild(buildConflictFile(f, into, from)));

    const apply = document.createElement("button");
    apply.className = "btn btn--primary";
    apply.textContent = "이렇게 해결하고 합치기";
    apply.onclick = wrap(doResolve);
    conflictEditor.appendChild(apply);
  }

  // 파일 하나의 줄 단위 선택 UI를 만든다
  function buildConflictFile(f, into, from) {
    const box = document.createElement("div");
    box.className = "conflict-file";

    const intoLines = f.intoContent.split("\n");
    const fromLines = f.fromContent.split("\n");
    const n = Math.max(intoLines.length, fromLines.length);
    const sel = []; // 각 줄의 선택: 'into' | 'from' | null(같은 줄)

    const ta = document.createElement("textarea");
    ta.dataset.path = f.path;

    function recompute() {
      const out = [];
      for (let i = 0; i < n; i++) {
        const a = intoLines[i] ?? "", b = fromLines[i] ?? "";
        out.push(sel[i] === "from" ? b : a);
      }
      ta.value = out.join("\n");
    }

    const rows = document.createElement("div");
    rows.className = "merge-rows";
    for (let i = 0; i < n; i++) {
      const a = intoLines[i] ?? "", b = fromLines[i] ?? "";
      const row = document.createElement("div");
      if (a === b) {
        sel[i] = null;
        row.className = "merge-row common";
        row.textContent = a || " ";
      } else {
        sel[i] = "into"; // 기본은 '이쪽'
        row.className = "merge-row choice";
        const left = mkPick("이쪽", a, true);
        const right = mkPick("저쪽", b, false);
        left.onclick = () => { sel[i] = "into"; left.classList.add("is-on"); right.classList.remove("is-on"); recompute(); };
        right.onclick = () => { sel[i] = "from"; right.classList.add("is-on"); left.classList.remove("is-on"); recompute(); };
        row.appendChild(left);
        row.appendChild(right);
      }
      rows.appendChild(row);
    }
    recompute();

    const h = document.createElement("h4");
    h.innerHTML = `⚠️ ${escapeHtml(f.path)} <small style="color:var(--muted);font-weight:400">— 겹친 줄에서 '이쪽/저쪽'을 골라보세요</small>`;
    const lab = document.createElement("label");
    lab.className = "final-label";
    lab.textContent = "최종 내용 (직접 고쳐도 됩니다 — 이대로 저장)";

    box.append(h, rows, lab, ta);
    return box;
  }

  function mkPick(tag, text, on) {
    const b = document.createElement("button");
    b.className = "pick" + (on ? " is-on" : "");
    b.innerHTML = `<span class="pick-tag">${tag}</span>${escapeHtml(text) || "(빈 줄)"}`;
    return b;
  }

  async function doResolve() {
    const from = mergeFrom.value, into = mergeInto.value;
    const resolutions = [...conflictEditor.querySelectorAll("textarea")].map((t) => ({
      path: t.dataset.path,
      content: t.value,
    }));
    const r = await api(`/projects/${enc(state.project)}/resolve-merge`, {
      method: "POST",
      body: JSON.stringify({ from, into, resolutions }),
    });
    if (r.success) {
      notify(r.message);
      conflictEditor.hidden = true;
      mergeResult.hidden = true;
      btnResolve.hidden = true;
      await loadBranches(state.branch);
    } else {
      notify(r.message, true);
    }
  }

  // AI 자동 리뷰
  async function getReview() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    const from = mergeFrom.value, into = mergeInto.value;
    if (from === into) return notify("서로 다른 작업공간을 선택하세요", true);
    reviewOutput.hidden = false;
    reviewOutput.className = "review-output is-loading";
    reviewOutput.textContent = "🤖 Claude 가 코드를 리뷰하는 중입니다... (수십 초 걸릴 수 있어요)";
    try {
      const r = await api(`/projects/${enc(state.project)}/review?from=${enc(from)}&into=${enc(into)}`);
      reviewOutput.className = "review-output";
      reviewOutput.textContent = (r.available ? "🤖 Claude 리뷰\n\n" : "ℹ️ ") + r.review;
    } catch (e) {
      reviewOutput.className = "review-output";
      reviewOutput.textContent = "리뷰 실패: " + e.message;
    }
  }

  function showMergeResult(kind, title, detail) {
    mergeResult.hidden = false;
    mergeResult.className = "merge-result " +
      (kind === "ok" ? "is-ok" : kind === "conflict" ? "is-conflict" : "is-info");
    let html = `<h3>${escapeHtml(title)}</h3>`;
    if (detail && detail.conflicts && detail.conflicts.length) {
      html += `<div><span class="tag-conflict">겹친 파일:</span><ul>` +
        detail.conflicts.map((c) => `<li>${escapeHtml(c)}</li>`).join("") + `</ul></div>`;
    }
    if (detail && detail.changes && detail.changes.length) {
      html += `<div>바뀌는 파일:<ul>` +
        detail.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("") + `</ul></div>`;
    }
    mergeResult.innerHTML = html;
  }

  async function doMerge() {
    const from = mergeFrom.value, into = mergeInto.value;
    const r = await api(`/projects/${enc(state.project)}/merge`, {
      method: "POST",
      body: JSON.stringify({ from, into }),
    });
    if (r.success) {
      notify(r.message);
      btnMerge.disabled = true;
      btnResolve.hidden = true;
      mergeResult.hidden = true;
      conflictEditor.hidden = true;
      await loadBranches(state.branch);
    } else {
      showMergeResult("conflict", r.message, null);
      notify(r.message, true);
    }
  }

  // ----- 새 프로젝트 / 작업공간 / 데모 -----
  async function newProject() {
    const name = prompt("새 프로젝트 이름을 입력하세요");
    if (!name) return;
    await api("/projects", { method: "POST", body: JSON.stringify({ name, author: "사용자" }) });
    notify(`프로젝트 '${name}' 생성`);
    await loadProjects(name);
  }

  async function newBranch() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    const name = $("branch-name").value.trim();
    if (!name) return notify("작업공간 이름을 입력하세요", true);
    await api(`/projects/${enc(state.project)}/branches`, {
      method: "POST",
      body: JSON.stringify({ name, from: state.branch || "main" }),
    });
    $("branch-name").value = "";
    notify(`작업공간 '${name}' 생성 ('${state.branch}' 에서 복사)`);
    await loadBranches(name);
  }

  async function deleteBranch(name) {
    if (!confirm(`작업공간 '${name}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    try {
      await api(`/projects/${enc(state.project)}/branches/${enc(name)}`, { method: "DELETE" });
      notify(`작업공간 '${name}' 삭제`);
      await loadBranches(state.branch === name ? "main" : state.branch);
    } catch (e) {
      notify(e.message, true);
    }
  }

  // 변경 내용(diff) 보기 — API 키 없이도 동작
  async function showDiff() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    const from = mergeFrom.value, into = mergeInto.value;
    if (from === into) return notify("서로 다른 작업공간을 선택하세요", true);
    const r = await api(`/projects/${enc(state.project)}/diff?from=${enc(from)}&into=${enc(into)}`);
    diffOutput.hidden = false;
    if (!r.diff || !r.diff.trim()) {
      diffOutput.innerHTML = '<span class="empty">변경 내용이 없습니다.</span>';
      return;
    }
    diffOutput.innerHTML = r.diff.split("\n").map((l) => {
      let cls = "";
      if (l.startsWith("+") && !l.startsWith("+++")) cls = "add";
      else if (l.startsWith("-") && !l.startsWith("---")) cls = "del";
      else if (l.startsWith("@@")) cls = "hunk";
      return `<span class="dl ${cls}">${escapeHtml(l) || " "}</span>`;
    }).join("");
  }

  // 실제 Gitea 서버에 현재 프로젝트 올리기
  async function publishGitea() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    notify("Gitea에 올리는 중...");
    const r = await api(`/projects/${enc(state.project)}/publish`, { method: "POST" });
    notify(r.message, !r.available);
    const link = $("gitea-link");
    if (r.url) {
      link.href = r.url;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
  }

  async function makeDemo() {
    const r = await api("/demo", { method: "POST" });
    notify("데모 프로젝트를 만들었습니다");
    await loadProjects(r.name);
    showMergeResult("info",
      "데모 안내: '메뉴-수정B' → '메뉴-수정A' 합치기를 점검하면 충돌이 보이고, '공지-추가' → 'main' 은 안전합니다.",
      null);
  }

  // ----- 유틸 -----
  function fillSelect(sel, items) {
    sel.innerHTML = "";
    items.forEach((i) => sel.add(new Option(i, i)));
  }
  function enc(s) { return encodeURIComponent(s); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ----- 이벤트 바인딩 -----
  projectSelect.onchange = () => selectProject(projectSelect.value);
  $("btn-new-project").onclick = wrap(newProject);
  $("btn-demo").onclick = wrap(makeDemo);
  $("btn-gitea").onclick = wrap(publishGitea);
  $("btn-new-branch").onclick = wrap(newBranch);
  $("btn-commit").onclick = wrap(commitChange);
  $("btn-check").onclick = wrap(checkMerge);
  $("btn-merge").onclick = wrap(doMerge);
  $("btn-resolve").onclick = wrap(openResolver);
  $("btn-review").onclick = wrap(getReview);
  $("btn-diff").onclick = wrap(showDiff);

  $("auth-login").onclick = () => doAuth("login");
  $("auth-register").onclick = () => doAuth("register");
  $("auth-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth("login"); });
  logoutBtn.onclick = wrap(logout);

  // 에러를 토스트로 보여주는 래퍼
  function wrap(fn) {
    return async () => {
      try { await fn(); }
      catch (e) { notify(e.message, true); }
    };
  }

  // ----- 시작: 로그인 상태 확인 -----
  (async () => {
    try {
      const me = await (await fetch("/api/auth/me")).json();
      if (me.user) onLoggedIn(me.user);
      else showLogin();
    } catch {
      showLogin();
    }
  })();
})();
