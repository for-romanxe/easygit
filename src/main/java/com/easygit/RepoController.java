package com.easygit;

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

    public RepoController(GitService git, ReviewService review) {
        this.git = git;
        this.review = review;
    }

    // --- 프로젝트 ---
    @GetMapping("/projects")
    public List<String> projects() {
        return git.projects();
    }

    @PostMapping("/projects")
    public Map<String, String> createProject(@RequestBody CreateProjectReq req) throws Exception {
        git.createProject(req.name(), req.author());
        return Map.of("name", req.name());
    }

    // --- 작업공간(브랜치) ---
    @GetMapping("/projects/{project}/branches")
    public List<String> branches(@PathVariable String project) throws Exception {
        return git.branches(project);
    }

    @PostMapping("/projects/{project}/branches")
    public Map<String, String> createBranch(@PathVariable String project,
                                            @RequestBody CreateBranchReq req) throws Exception {
        git.createBranch(project, req.name(), req.from());
        return Map.of("name", req.name());
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
                                      @RequestBody CommitReq req) throws Exception {
        git.commit(project, req.branch(), req.path(), req.content(), req.message(), req.author());
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
                              @RequestBody MergeReq req) throws Exception {
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
                                     @RequestBody ResolveReq req) {
        return git.resolveMerge(project, req.from(), req.into(), req.resolutions());
    }

    // --- AI 리뷰 ---
    @GetMapping("/projects/{project}/review")
    public ReviewResult review(@PathVariable String project,
                               @RequestParam String from,
                               @RequestParam String into) {
        return review.review(project, from, into);
    }

    // --- 데모 ---
    @PostMapping("/demo")
    public Map<String, String> demo() throws Exception {
        return Map.of("name", git.seedDemo());
    }

    // --- 오류를 한국어 메시지로 변환 ---
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handle(Exception e) {
        String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", msg));
    }
}
