package com.easygit;

import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 한국어 협업 도구의 REST API. 화면(app.js)이 이 주소들을 호출한다. */
@RestController
@RequestMapping("/api")
public class RepoController {

    private final GitService git;
    private final ReviewService review;
    private final GiteaService gitea;
    private final MemberService members;
    private final MergeRequestService requests;

    public RepoController(GitService git, ReviewService review, GiteaService gitea,
                          MemberService members, MergeRequestService requests) {
        this.git = git;
        this.review = review;
        this.gitea = gitea;
        this.members = members;
        this.requests = requests;
    }

    // --- 프로젝트 ---
    @GetMapping("/projects")
    public List<String> projects() {
        return git.projects();
    }

    @PostMapping("/projects")
    public Map<String, String> createProject(@RequestBody CreateProjectReq req, HttpSession session) throws Exception {
        String me = currentUser(session);
        git.createProject(req.name(), me);
        members.setOwner(req.name(), me); // 만든 사람이 소유자
        return Map.of("name", req.name());
    }

    // --- 작업공간(브랜치) ---
    @GetMapping("/projects/{project}/branches")
    public List<String> branches(@PathVariable String project) throws Exception {
        return git.branches(project);
    }

    @PostMapping("/projects/{project}/branches")
    public Map<String, String> createBranch(@PathVariable String project,
                                            @RequestBody CreateBranchReq req, HttpSession session) throws Exception {
        members.requireWrite(project, currentUser(session));
        git.createBranch(project, req.name(), req.from());
        return Map.of("name", req.name());
    }

    @DeleteMapping("/projects/{project}/branches/{name}")
    public Map<String, String> deleteBranch(@PathVariable String project,
                                            @PathVariable String name, HttpSession session) throws Exception {
        members.requireWrite(project, currentUser(session));
        git.deleteBranch(project, name);
        return Map.of("status", "ok");
    }

    // --- 파일 / 변경 올리기 ---
    @GetMapping("/projects/{project}/files")
    public List<String> files(@PathVariable String project, @RequestParam String branch) throws Exception {
        return git.files(project, branch);
    }

    @GetMapping("/projects/{project}/file")
    public Map<String, String> file(@PathVariable String project,
                                    @RequestParam String branch,
                                    @RequestParam String path) throws Exception {
        return Map.of("content", git.fileContent(project, branch, path));
    }

    @PostMapping("/projects/{project}/commit")
    public Map<String, String> commit(@PathVariable String project,
                                      @RequestBody CommitReq req, HttpSession session) throws Exception {
        // 변경한 사람은 로그인한 사용자로 기록 (수동 이름 입력 대신)
        members.requireWrite(project, currentUser(session));
        git.commit(project, req.branch(), req.path(), req.content(), req.message(), currentUser(session));
        return Map.of("status", "ok");
    }

    @GetMapping("/projects/{project}/history")
    public List<CommitDto> history(@PathVariable String project, @RequestParam String branch) throws Exception {
        return git.history(project, branch);
    }

    // --- 충돌 점검 / 합치기 ---
    @GetMapping("/projects/{project}/check-merge")
    public MergeCheck checkMerge(@PathVariable String project,
                                 @RequestParam String from,
                                 @RequestParam String into) throws Exception {
        return git.checkMerge(project, from, into);
    }

    @PostMapping("/projects/{project}/merge")
    public MergeOutcome merge(@PathVariable String project,
                              @RequestBody MergeReq req, HttpSession session) throws Exception {
        members.requireWrite(project, currentUser(session));
        return git.merge(project, req.from(), req.into());
    }

    // --- 충돌 해결 ---
    @GetMapping("/projects/{project}/conflict")
    public List<ConflictFile> conflict(@PathVariable String project,
                                       @RequestParam String from,
                                       @RequestParam String into) throws Exception {
        return git.conflictDetail(project, from, into);
    }

    @PostMapping("/projects/{project}/resolve-merge")
    public MergeOutcome resolveMerge(@PathVariable String project,
                                     @RequestBody ResolveReq req, HttpSession session) {
        members.requireWrite(project, currentUser(session));
        return git.resolveMerge(project, req.from(), req.into(), req.resolutions(), currentUser(session));
    }

    // --- 변경 내용(diff) 보기 ---
    @GetMapping("/projects/{project}/diff")
    public Map<String, String> diff(@PathVariable String project,
                                    @RequestParam String from,
                                    @RequestParam String into) throws Exception {
        return Map.of("diff", git.diffText(project, from, into));
    }

    // --- AI 리뷰 ---
    @GetMapping("/projects/{project}/review")
    public ReviewResult review(@PathVariable String project,
                               @RequestParam String from,
                               @RequestParam String into) {
        return review.review(project, from, into);
    }

    // --- 실제 Gitea 서버에 올리기 ---
    @PostMapping("/projects/{project}/publish")
    public Map<String, Object> publish(@PathVariable String project, HttpSession session) {
        members.requireWrite(project, currentUser(session));
        return gitea.publish(project);
    }

    // --- 멤버(권한) ---
    @GetMapping("/projects/{project}/members")
    public MembersView membersView(@PathVariable String project, HttpSession session) {
        String me = currentUser(session);
        return new MembersView(
                members.owner(project),
                members.members(project),
                members.hasOwner(project),
                me.equals(members.owner(project)),
                members.canWrite(project, me));
    }

    @PostMapping("/projects/{project}/members")
    public MembersView addMember(@PathVariable String project,
                                 @RequestBody AddMemberReq req, HttpSession session) {
        String me = currentUser(session);
        members.addMember(project, me, req.username());
        return membersView(project, session);
    }

    @DeleteMapping("/projects/{project}/members/{name}")
    public MembersView removeMember(@PathVariable String project,
                                    @PathVariable String name, HttpSession session) {
        String me = currentUser(session);
        members.removeMember(project, me, name);
        return membersView(project, session);
    }

    /** 소유자 없는(옛) 프로젝트의 관리자가 되기. */
    @PostMapping("/projects/{project}/claim")
    public MembersView claim(@PathVariable String project, HttpSession session) {
        String me = currentUser(session);
        members.claim(project, me);
        return membersView(project, session);
    }

    // --- 합치기 요청 (Pull Request) ---
    @GetMapping("/projects/{project}/requests")
    public List<RequestView> listRequests(@PathVariable String project, HttpSession session) throws Exception {
        List<RequestView> out = new java.util.ArrayList<>();
        for (MergeRequestService.Req r : requests.list(project)) {
            out.add(toView(project, r, currentUser(session)));
        }
        return out;
    }

    @PostMapping("/projects/{project}/requests")
    public RequestView createRequest(@PathVariable String project,
                                     @RequestBody CreateRequestReq req, HttpSession session) throws Exception {
        String me = currentUser(session);
        members.requireWrite(project, me);
        MergeRequestService.Req r = requests.create(project, req.title(), req.desc(), req.from(), req.into(), me);
        return toView(project, r, me);
    }

    @GetMapping("/projects/{project}/requests/{id}")
    public RequestView getRequest(@PathVariable String project, @PathVariable int id,
                                  HttpSession session) throws Exception {
        return toView(project, requests.get(project, id), currentUser(session));
    }

    @PostMapping("/projects/{project}/requests/{id}/approve")
    public RequestView approveRequest(@PathVariable String project, @PathVariable int id,
                                      HttpSession session) throws Exception {
        String me = currentUser(session);
        members.requireWrite(project, me);
        requests.approve(project, id, me);
        return toView(project, requests.get(project, id), me);
    }

    @PostMapping("/projects/{project}/requests/{id}/merge")
    public RequestView mergeRequest(@PathVariable String project, @PathVariable int id,
                                    HttpSession session) throws Exception {
        String me = currentUser(session);
        members.requireWrite(project, me);
        MergeRequestService.Req r = requests.get(project, id);
        if (!"열림".equals(r.status)) throw new IllegalArgumentException("이미 처리된 요청입니다.");
        if (r.approvals.isEmpty()) throw new IllegalArgumentException("최소 1명의 승인이 필요합니다.");
        MergeCheck chk = git.checkMerge(project, r.from, r.into);
        if (!chk.clean()) {
            throw new IllegalArgumentException("겹친 부분(충돌)이 있어 바로 합칠 수 없습니다. '합치기' 카드에서 충돌을 먼저 해결하세요.");
        }
        MergeOutcome outcome = git.merge(project, r.from, r.into);
        if (!outcome.success()) throw new IllegalArgumentException(outcome.message());
        requests.markMerged(project, id, me);
        return toView(project, requests.get(project, id), me);
    }

    @PostMapping("/projects/{project}/requests/{id}/close")
    public RequestView closeRequest(@PathVariable String project, @PathVariable int id,
                                    HttpSession session) throws Exception {
        String me = currentUser(session);
        members.requireWrite(project, me);
        requests.close(project, id);
        return toView(project, requests.get(project, id), me);
    }

    @PostMapping("/projects/{project}/requests/{id}/comments")
    public RequestView commentRequest(@PathVariable String project, @PathVariable int id,
                                      @RequestBody AddCommentReq req, HttpSession session) throws Exception {
        String me = currentUser(session);
        members.requireWrite(project, me);
        requests.addComment(project, id, me, req.text());
        return toView(project, requests.get(project, id), me);
    }

    /** 저장된 요청 + 지금 시점의 충돌 점검을 합쳐 화면용으로 변환. */
    private RequestView toView(String project, MergeRequestService.Req r, String me) throws Exception {
        boolean clean = false, upToDate = false;
        List<String> conflicts = List.of(), changes = List.of();
        if ("열림".equals(r.status)) {
            MergeCheck chk = git.checkMerge(project, r.from, r.into);
            clean = chk.clean();
            upToDate = chk.upToDate();
            conflicts = chk.conflicts();
            changes = chk.changes();
        }
        boolean canMerge = "열림".equals(r.status) && clean && !upToDate
                && !r.approvals.isEmpty() && members.canWrite(project, me);
        List<CommentView> comments = new java.util.ArrayList<>();
        if (r.comments != null) {
            for (MergeRequestService.Comment c : r.comments) {
                comments.add(new CommentView(c.author, c.text, c.createdAt));
            }
        }
        return new RequestView(r.id, r.title, r.desc, r.from, r.into, r.author,
                r.status, r.createdAt, r.approvals, r.mergedBy,
                clean, upToDate, conflicts, changes, canMerge, comments);
    }

    // --- 데모 ---
    @PostMapping("/demo")
    public Map<String, String> demo() throws Exception {
        return Map.of("name", git.seedDemo());
    }

    private String currentUser(HttpSession session) {
        Object u = session.getAttribute("user");
        return u == null ? "사용자" : u.toString();
    }

    // --- 오류를 한국어 메시지로 변환 ---
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handle(Exception e) {
        String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", msg));
    }
}
