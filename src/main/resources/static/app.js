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
  const memberOwner = $("member-owner");
  const memberYou = $("member-you");
  const memberList = $("member-list");
  const memberAdd = $("member-add");
  const memberClaim = $("member-claim");
  const memberHint = $("member-hint");
  const reqFrom = $("req-from");
  const reqInto = $("req-into");
  const requestList = $("request-list");

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
    memberList.innerHTML = "";
    memberOwner.textContent = "-";
    memberYou.hidden = true;
    memberAdd.hidden = true;
    memberClaim.hidden = true;
    memberHint.textContent = "";
    reqFrom.innerHTML = "";
    reqInto.innerHTML = "";
    requestList.innerHTML = "";
  }

  async function selectProject(name) {
    state.project = name;
    await Promise.all([loadBranches(), loadMembers(), loadRequests()]);
  }

  // ----- 멤버 / 권한 -----
  async function loadMembers() {
    const m = await api(`/projects/${enc(state.project)}/members`);
    memberOwner.textContent = m.owner || "(없음)";
    memberYou.hidden = !m.isOwner;

    memberList.innerHTML = "";
    m.members.forEach((name) => {
      const li = document.createElement("li");
      const isOwner = name === m.owner;
      const label = document.createElement("span");
      label.className = "m-name";
      label.innerHTML = `${escapeHtml(name)}` +
        (isOwner ? ` <span class="member-badge">소유자</span>` : "") +
        (name === state.user ? ` <span class="member-you">나</span>` : "");
      li.appendChild(label);
      // 소유자만 다른 멤버를 내보낼 수 있음 (소유자 자신은 못 내보냄)
      if (m.isOwner && !isOwner) {
        const del = document.createElement("button");
        del.className = "member-del";
        del.textContent = "×";
        del.title = "멤버 내보내기";
        del.onclick = () => removeMember(name);
        li.appendChild(del);
      }
      memberList.appendChild(li);
    });
    if (m.members.length === 0) {
      memberList.innerHTML = '<li class="empty" style="border:none">아직 멤버가 없습니다</li>';
    }

    // 소유자면 초대칸, 관리자 없는 프로젝트면 '관리자 되기' 버튼
    memberAdd.hidden = !m.isOwner;
    memberClaim.hidden = m.hasOwner;

    if (!m.hasOwner) {
      memberHint.textContent = "관리자가 없는 프로젝트입니다. 지금은 누구나 변경할 수 있어요. '관리자 되기'로 소유권을 가져오면 멤버만 변경하도록 잠글 수 있습니다.";
    } else if (m.canWrite) {
      memberHint.textContent = "당신은 이 프로젝트의 멤버입니다. 변경할 수 있어요.";
    } else {
      memberHint.textContent = "당신은 이 프로젝트의 멤버가 아닙니다. 보기만 가능하고, 소유자에게 초대를 요청하세요.";
    }
  }

  async function addMember() {
    const name = $("member-name").value.trim();
    if (!name) return notify("초대할 아이디를 입력하세요", true);
    await api(`/projects/${enc(state.project)}/members`, {
      method: "POST",
      body: JSON.stringify({ username: name }),
    });
    $("member-name").value = "";
    notify(`'${name}' 을(를) 멤버로 추가했습니다`);
    await loadMembers();
  }

  async function removeMember(name) {
    if (!confirm(`'${name}' 을(를) 이 프로젝트에서 내보낼까요?`)) return;
    await api(`/projects/${enc(state.project)}/members/${enc(name)}`, { method: "DELETE" });
    notify(`'${name}' 을(를) 내보냈습니다`);
    await loadMembers();
  }

  async function claimProject() {
    await api(`/projects/${enc(state.project)}/claim`, { method: "POST" });
    notify("이제 이 프로젝트의 관리자입니다");
    await loadMembers();
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
    fillSelect(reqFrom, branches);
    fillSelect(reqInto, branches);
    const mainIdx = branches.indexOf("main");
    if (branches.length > 1) {
      mergeInto.selectedIndex = mainIdx >= 0 ? mainIdx : 0;
      reqInto.selectedIndex = mainIdx >= 0 ? mainIdx : 0;
    }

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

  // ----- 합치기 요청 (Pull Request) -----
  async function loadRequests() {
    const list = await api(`/projects/${enc(state.project)}/requests`);
    requestList.innerHTML = "";
    if (list.length === 0) {
      requestList.innerHTML = '<li class="empty" style="border:none">아직 합치기 요청이 없습니다. 위에서 하나 올려보세요.</li>';
      return;
    }
    list.forEach((r) => requestList.appendChild(buildRequestItem(r)));
  }

  async function createRequest() {
    if (!state.project) return notify("프로젝트를 먼저 선택하세요", true);
    const title = $("req-title").value.trim();
    const desc = $("req-desc").value.trim();
    const from = reqFrom.value, into = reqInto.value;
    if (!title) return notify("요청 제목을 입력하세요", true);
    if (from === into) return notify("서로 다른 작업공간을 선택하세요", true);
    await api(`/projects/${enc(state.project)}/requests`, {
      method: "POST",
      body: JSON.stringify({ title, desc, from, into }),
    });
    $("req-title").value = "";
    $("req-desc").value = "";
    notify("합치기 요청을 올렸습니다");
    await loadRequests();
  }

  const REQ_BADGE = {
    "열림": { cls: "open", text: "열림" },
    "합쳐짐": { cls: "merged", text: "합쳐짐" },
    "닫힘": { cls: "closed", text: "닫힘" },
  };

  function buildRequestItem(r) {
    const li = document.createElement("li");
    li.className = "req-item";

    // 머리: 번호 + 제목 + 상태뱃지
    const head = document.createElement("div");
    head.className = "req-head";
    const badge = REQ_BADGE[r.status] || { cls: "open", text: r.status };
    head.innerHTML =
      `<span class="req-id">#${r.id}</span>` +
      `<span class="req-title">${escapeHtml(r.title)}</span>` +
      `<span class="req-badge ${badge.cls}">${escapeHtml(badge.text)}</span>`;
    li.appendChild(head);

    // 흐름: from → into
    const flow = document.createElement("div");
    flow.className = "req-flow";
    flow.innerHTML = `${escapeHtml(r.from)} <span class="merge-arrow">→</span> ${escapeHtml(r.into)}`;
    li.appendChild(flow);

    // 본문: 설명 + 메타
    const body = document.createElement("div");
    body.className = "req-body";
    let bodyHtml = "";
    if (r.desc) bodyHtml += `<div class="req-desc">${escapeHtml(r.desc)}</div>`;
    const when = new Date(r.createdAt).toLocaleString("ko-KR");
    bodyHtml += `<div class="req-meta">${escapeHtml(r.author)} 님이 올림 · ${when}</div>`;
    body.innerHTML = bodyHtml;
    li.appendChild(body);

    // 상태 줄: 열린 요청은 지금 시점의 충돌 점검 결과를 보여줌
    if (r.status === "열림") {
      const line = document.createElement("div");
      if (r.upToDate) {
        line.className = "req-status-line info";
        line.textContent = "이미 최신 — 합칠 변경이 없습니다.";
      } else if (r.clean) {
        line.className = "req-status-line ok";
        line.textContent = `안전하게 합칠 수 있습니다 ✅ (바뀌는 파일 ${r.changes.length}개)`;
      } else {
        line.className = "req-status-line conflict";
        line.textContent = `겹친 부분(충돌) ⚠️ — ${r.conflicts.join(", ")}. '합치기' 카드에서 먼저 해결하세요.`;
      }
      li.appendChild(line);
    } else if (r.status === "합쳐짐") {
      const line = document.createElement("div");
      line.className = "req-status-line info";
      line.textContent = `${escapeHtml(r.mergedBy || "-")} 님이 합쳤습니다.`;
      li.appendChild(line);
    }

    // 승인자
    const appr = document.createElement("div");
    appr.className = "req-approvals";
    if (r.approvals.length) {
      appr.innerHTML = "승인: " + r.approvals.map((a) => `<span class="member-badge">${escapeHtml(a)} ✔</span>`).join(" ");
    } else {
      appr.textContent = r.status === "열림" ? "아직 승인이 없습니다." : "";
    }
    li.appendChild(appr);

    // 작업 버튼 (열린 요청만)
    if (r.status === "열림") {
      const actions = document.createElement("div");
      actions.className = "req-actions";

      const approveBtn = document.createElement("button");
      approveBtn.className = "btn";
      approveBtn.textContent = r.approvals.includes(state.user) ? "승인함 ✔" : "승인하기";
      approveBtn.disabled = r.approvals.includes(state.user);
      approveBtn.onclick = wrap(() => approveRequest(r.id));
      actions.appendChild(approveBtn);

      const mergeBtn = document.createElement("button");
      mergeBtn.className = "btn btn--primary";
      mergeBtn.textContent = "합치기";
      mergeBtn.disabled = !r.canMerge;
      if (!r.canMerge && r.approvals.length === 0) mergeBtn.title = "먼저 승인이 필요합니다";
      mergeBtn.onclick = wrap(() => mergeRequest(r.id));
      actions.appendChild(mergeBtn);

      const diffBtn = document.createElement("button");
      diffBtn.className = "btn";
      diffBtn.textContent = "변경 내용 보기";
      const diffBox = document.createElement("div");
      diffBox.className = "diff-output";
      diffBox.hidden = true;
      diffBtn.onclick = wrap(async () => {
        if (!diffBox.hidden) { diffBox.hidden = true; return; }
        const d = await api(`/projects/${enc(state.project)}/diff?from=${enc(r.from)}&into=${enc(r.into)}`);
        diffBox.hidden = false;
        renderDiff(diffBox, d.diff);
      });
      actions.appendChild(diffBtn);

      const closeBtn = document.createElement("button");
      closeBtn.className = "btn btn--ghost";
      closeBtn.textContent = "닫기";
      closeBtn.onclick = wrap(() => closeRequest(r.id));
      actions.appendChild(closeBtn);

      li.appendChild(actions);
      li.appendChild(diffBox);
    }

    return li;
  }

  async function approveRequest(id) {
    await api(`/projects/${enc(state.project)}/requests/${id}/approve`, { method: "POST" });
    notify("승인했습니다");
    await loadRequests();
  }

  async function mergeRequest(id) {
    await api(`/projects/${enc(state.project)}/requests/${id}/merge`, { method: "POST" });
    notify("합쳤습니다! (요청이 처리됨)");
    await Promise.all([loadRequests(), loadBranches(state.branch)]);
  }

  async function closeRequest(id) {
    if (!confirm("이 합치기 요청을 닫을까요?")) return;
    await api(`/projects/${enc(state.project)}/requests/${id}/close`, { method: "POST" });
    notify("요청을 닫았습니다");
    await loadRequests();
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
    renderDiff(diffOutput, r.diff);
  }

  // diff 텍스트를 색깔 입혀 container 에 그린다 (+초록/-빨강/@@파랑)
  function renderDiff(container, diff) {
    if (!diff || !diff.trim()) {
      container.innerHTML = '<span class="empty">변경 내용이 없습니다.</span>';
      return;
    }
    container.innerHTML = diff.split("\n").map((l) => {
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
  $("btn-add-member").onclick = wrap(addMember);
  $("btn-claim").onclick = wrap(claimProject);
  $("btn-new-request").onclick = wrap(createRequest);
  $("req-title").addEventListener("keydown", (e) => { if (e.key === "Enter") wrap(createRequest)(); });
  $("member-name").addEventListener("keydown", (e) => { if (e.key === "Enter") wrap(addMember)(); });

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
