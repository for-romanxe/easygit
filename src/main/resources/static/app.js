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
  const commitAuthor = $("commit-author");
  const mergeFrom = $("merge-from");
  const mergeInto = $("merge-into");
  const mergeResult = $("merge-result");
  const btnMerge = $("btn-merge");
  const btnResolve = $("btn-resolve");
  const conflictEditor = $("conflict-editor");
  const reviewOutput = $("review-output");
  const historyList = $("history-list");
  const toast = $("toast");

  // ----- API 도우미 -----
  async function api(path, options) {
    const res = await fetch("/api" + path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "요청 실패");
    return data;
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
      li.textContent = b;
      li.onclick = () => selectBranch(b);
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
      li.classList.toggle("is-active", li.textContent === branch));
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
        author: commitAuthor.value,
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

  // 충돌난 파일들을 화면에서 직접 고쳐 해결
  async function openResolver() {
    const from = mergeFrom.value, into = mergeInto.value;
    const files = await api(`/projects/${enc(state.project)}/conflict?from=${enc(from)}&into=${enc(into)}`);
    if (files.length === 0) return notify("충돌 파일이 없습니다", true);

    conflictEditor.hidden = false;
    conflictEditor.innerHTML = "";
    files.forEach((f) => {
      const box = document.createElement("div");
      box.className = "conflict-file";
      box.innerHTML =
        `<h4>⚠️ ${escapeHtml(f.path)}</h4>` +
        `<div class="conflict-sides">` +
          `<div><label>'${escapeHtml(into)}' 쪽</label><pre>${escapeHtml(f.intoContent)}</pre></div>` +
          `<div><label>'${escapeHtml(from)}' 쪽</label><pre>${escapeHtml(f.fromContent)}</pre></div>` +
        `</div>` +
        `<div class="conflict-final"><label>최종 내용 (이대로 저장됩니다)</label>` +
          `<textarea data-path="${escapeHtml(f.path)}"></textarea></div>`;
      // 기본값: 합칠 대상(into) 내용으로 시작
      box.querySelector("textarea").value = f.intoContent;
      conflictEditor.appendChild(box);
    });

    const apply = document.createElement("button");
    apply.className = "btn btn--primary";
    apply.textContent = "이렇게 해결하고 합치기";
    apply.onclick = wrap(doResolve);
    conflictEditor.appendChild(apply);
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
  $("btn-new-branch").onclick = wrap(newBranch);
  $("btn-commit").onclick = wrap(commitChange);
  $("btn-check").onclick = wrap(checkMerge);
  $("btn-merge").onclick = wrap(doMerge);
  $("btn-resolve").onclick = wrap(openResolver);
  $("btn-review").onclick = wrap(getReview);

  // 에러를 토스트로 보여주는 래퍼
  function wrap(fn) {
    return async () => {
      try { await fn(); }
      catch (e) { notify(e.message, true); }
    };
  }

  // ----- 시작 -----
  loadProjects().catch((e) => notify(e.message, true));
})();
