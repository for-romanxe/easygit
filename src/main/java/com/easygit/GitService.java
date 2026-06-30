package com.easygit;

import org.eclipse.jgit.api.Git;
import org.eclipse.jgit.api.MergeResult;
import org.eclipse.jgit.api.ResetCommand;
import org.eclipse.jgit.diff.DiffEntry;
import org.eclipse.jgit.diff.DiffFormatter;
import org.eclipse.jgit.lib.ObjectId;
import org.eclipse.jgit.lib.Repository;
import org.eclipse.jgit.merge.MergeStrategy;
import org.eclipse.jgit.merge.ResolveMerger;
import org.eclipse.jgit.revwalk.RevCommit;
import org.eclipse.jgit.revwalk.RevWalk;
import org.eclipse.jgit.treewalk.TreeWalk;
import org.eclipse.jgit.util.io.DisabledOutputStream;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Git 엔진(JGit)을 감싼 서비스.
 * GitHub의 복잡한 개념을 한국어 개념으로 단순화해 제공한다.
 *  - 저장소(repository) = 프로젝트
 *  - 브랜치(branch)     = 작업공간
 *  - 커밋(commit)       = 찰칵(기록)
 *  - 머지(merge)        = 합치기
 */
@Service
public class GitService {

    private final File root;
    private final Map<String, Object> locks = new ConcurrentHashMap<>();

    public GitService(@Value("${easygit.data-dir:data/repos}") String dataDir) {
        this.root = new File(dataDir);
        //noinspection ResultOfMethodCallIgnored
        this.root.mkdirs();
    }

    private Object lock(String project) {
        return locks.computeIfAbsent(project, k -> new Object());
    }

    private File dir(String project) {
        return new File(root, project);
    }

    private Git open(String project) throws IOException {
        File d = dir(project);
        if (!new File(d, ".git").exists()) {
            throw new IllegalArgumentException("프로젝트를 찾을 수 없습니다: " + project);
        }
        return Git.open(d);
    }

    // ---------------------------------------------------------------- 프로젝트

    /** 모든 프로젝트 이름 목록. */
    public List<String> projects() {
        File[] children = root.listFiles(File::isDirectory);
        List<String> out = new ArrayList<>();
        if (children != null) {
            for (File c : children) {
                if (new File(c, ".git").exists()) out.add(c.getName());
            }
        }
        out.sort(String::compareTo);
        return out;
    }

    /** 새 프로젝트 생성(첫 찰칵 포함). */
    public void createProject(String name, String author) throws Exception {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("프로젝트 이름을 입력하세요.");
        File d = dir(name);
        if (d.exists()) throw new IllegalArgumentException("이미 있는 프로젝트입니다: " + name);

        String who = (author == null || author.isBlank()) ? "사용자" : author;
        try (Git git = Git.init().setDirectory(d).setInitialBranch("main").call()) {
            Files.writeString(new File(d, "README.md").toPath(),
                    "# " + name + "\n\n새 프로젝트입니다.\n");
            git.add().addFilepattern("README.md").call();
            git.commit().setMessage("프로젝트 생성")
                    .setAuthor(who, who + "@easygit.local").call();
        }
    }

    // ---------------------------------------------------------------- 작업공간(브랜치)

    public List<String> branches(String project) throws IOException, org.eclipse.jgit.api.errors.GitAPIException {
        try (Git git = open(project)) {
            List<String> out = new ArrayList<>();
            git.branchList().call()
                    .forEach(r -> out.add(Repository.shortenRefName(r.getName())));
            out.sort(String::compareTo);
            return out;
        }
    }

    public void createBranch(String project, String name, String from) throws Exception {
        if (name == null || name.isBlank()) throw new IllegalArgumentException("작업공간 이름을 입력하세요.");
        synchronized (lock(project)) {
            try (Git git = open(project)) {
                git.branchCreate().setName(name).setStartPoint(from).call();
            }
        }
    }

    public void deleteBranch(String project, String name) throws Exception {
        if ("main".equals(name)) throw new IllegalArgumentException("main 작업공간은 삭제할 수 없습니다.");
        synchronized (lock(project)) {
            try (Git git = open(project)) {
                // 지우려는 작업공간이 현재 위치면 main 으로 옮긴 뒤 삭제
                if (name.equals(git.getRepository().getBranch())) {
                    git.checkout().setName("main").call();
                }
                git.branchDelete().setBranchNames(name).setForce(true).call();
            }
        }
    }

    // ---------------------------------------------------------------- 파일

    public List<String> files(String project, String branch) throws IOException {
        try (Git git = open(project)) {
            Repository repo = git.getRepository();
            ObjectId id = resolve(repo, branch);
            List<String> out = new ArrayList<>();
            try (RevWalk rw = new RevWalk(repo); TreeWalk tw = new TreeWalk(repo)) {
                RevCommit commit = rw.parseCommit(id);
                tw.addTree(commit.getTree());
                tw.setRecursive(true);
                while (tw.next()) out.add(tw.getPathString());
            }
            return out;
        }
    }

    public String fileContent(String project, String branch, String path) throws IOException {
        try (Git git = open(project)) {
            Repository repo = git.getRepository();
            ObjectId id = resolve(repo, branch);
            try (RevWalk rw = new RevWalk(repo)) {
                RevCommit commit = rw.parseCommit(id);
                try (TreeWalk tw = TreeWalk.forPath(repo, path, commit.getTree())) {
                    if (tw == null) return "";
                    return new String(repo.open(tw.getObjectId(0)).getBytes(), StandardCharsets.UTF_8);
                }
            }
        }
    }

    /** 변경 올리기 = 파일 쓰고 add + 찰칵(commit). */
    public void commit(String project, String branch, String path, String content,
                       String message, String author) throws Exception {
        if (path == null || path.isBlank()) throw new IllegalArgumentException("파일 경로를 입력하세요.");
        String who = (author == null || author.isBlank()) ? "사용자" : author;
        String msg = (message == null || message.isBlank()) ? "변경" : message;
        synchronized (lock(project)) {
            try (Git git = open(project)) {
                git.checkout().setName(branch).call();
                File f = new File(dir(project), path);
                //noinspection ResultOfMethodCallIgnored
                if (f.getParentFile() != null) f.getParentFile().mkdirs();
                Files.writeString(f.toPath(), content == null ? "" : content);
                git.add().addFilepattern(path).call();
                git.commit().setMessage(msg).setAuthor(who, who + "@easygit.local").call();
            }
        }
    }

    public List<CommitDto> history(String project, String branch) throws Exception {
        try (Git git = open(project)) {
            Repository repo = git.getRepository();
            ObjectId id = resolve(repo, branch);
            List<CommitDto> out = new ArrayList<>();
            for (RevCommit c : git.log().add(id).call()) {
                out.add(new CommitDto(
                        c.getName().substring(0, 7),
                        c.getShortMessage(),
                        c.getAuthorIdent().getName(),
                        c.getAuthorIdent().getWhenAsInstant().toString()));
            }
            return out;
        }
    }

    // ---------------------------------------------------------------- 충돌 점검 / 합치기

    /** 합치기 전에 충돌이 있는지 미리 점검(작업공간/working tree 를 건드리지 않음). */
    public MergeCheck checkMerge(String project, String from, String into) throws IOException {
        try (Git git = open(project)) {
            Repository repo = git.getRepository();
            ObjectId fromId = resolve(repo, from);
            ObjectId intoId = resolve(repo, into);
            try (RevWalk rw = new RevWalk(repo)) {
                RevCommit fromC = rw.parseCommit(fromId);
                RevCommit intoC = rw.parseCommit(intoId);

                // 가져올 변경이 이미 모두 반영돼 있으면 = 이미 최신
                boolean upToDate = rw.isMergedInto(fromC, intoC);

                List<String> changes = diffFiles(repo, intoC, fromC);

                // in-core(메모리) 머지로 시험 → 작업 디렉터리에 영향 없음
                ResolveMerger merger = (ResolveMerger) MergeStrategy.RECURSIVE.newMerger(repo, true);
                boolean clean = merger.merge(intoC, fromC);
                List<String> conflicts = clean ? List.of() : new ArrayList<>(merger.getUnmergedPaths());

                return new MergeCheck(clean, upToDate, conflicts, changes);
            }
        }
    }

    /** 실제 합치기. 충돌나면 합치지 않고 원상복구한다. */
    public MergeOutcome merge(String project, String from, String into) throws Exception {
        synchronized (lock(project)) {
            try (Git git = open(project)) {
                Repository repo = git.getRepository();
                git.checkout().setName(into).call();
                MergeResult res = git.merge()
                        .include(resolve(repo, from))
                        .setMessage("합치기: " + from + " → " + into)
                        .call();
                MergeResult.MergeStatus st = res.getMergeStatus();
                if (!st.isSuccessful()) {
                    // 충돌 등 실패 → 안전하게 되돌리기
                    git.reset().setMode(ResetCommand.ResetType.HARD).setRef(into).call();
                    return new MergeOutcome(false,
                            "충돌이 있어 합치지 못했습니다. 먼저 겹친 부분을 정리하세요.", st.name());
                }
                return new MergeOutcome(true,
                        "'" + from + "' 의 변경을 '" + into + "' 에 합쳤습니다.", st.name());
            }
        }
    }

    // ---------------------------------------------------------------- 충돌 해결

    /** 충돌난 각 파일의 양쪽(합칠 대상/가져올) 내용을 돌려준다. 화면에서 직접 고치도록. */
    public List<ConflictFile> conflictDetail(String project, String from, String into) throws IOException {
        MergeCheck check = checkMerge(project, from, into);
        List<ConflictFile> out = new ArrayList<>();
        for (String path : check.conflicts()) {
            out.add(new ConflictFile(path, safeFile(project, into, path), safeFile(project, from, path)));
        }
        return out;
    }

    private String safeFile(String project, String branch, String path) {
        try {
            return fileContent(project, branch, path);
        } catch (Exception e) {
            return "";
        }
    }

    /** 사용자가 직접 정리한 내용으로 충돌을 해결하면서 합치기(2-부모 합치기 기록 생성). */
    public MergeOutcome resolveMerge(String project, String from, String into,
                                     List<Resolution> resolutions, String author) {
        String who = (author == null || author.isBlank()) ? "사용자" : author;
        synchronized (lock(project)) {
            try (Git git = open(project)) {
                Repository repo = git.getRepository();
                git.checkout().setName(into).call();
                MergeResult res = git.merge()
                        .include(resolve(repo, from))
                        .setCommit(false)            // 우리가 직접 정리 후 기록한다
                        .setMessage("합치기: " + from + " → " + into)
                        .call();

                if (res.getMergeStatus() == MergeResult.MergeStatus.ALREADY_UP_TO_DATE) {
                    return new MergeOutcome(true, "이미 최신 상태입니다.", res.getMergeStatus().name());
                }

                // 사용자가 정리한 내용을 파일에 쓰고 등록
                if (resolutions != null) {
                    for (Resolution r : resolutions) {
                        File f = new File(dir(project), r.path());
                        if (f.getParentFile() != null) f.getParentFile().mkdirs();
                        Files.writeString(f.toPath(), r.content() == null ? "" : r.content());
                        git.add().addFilepattern(r.path()).call();
                    }
                }
                // 충돌 없이 자동 합쳐진 파일들도 함께 등록
                git.add().addFilepattern(".").call();

                // MERGE_HEAD 가 설정돼 있어 2-부모 합치기 기록이 만들어진다
                git.commit().setMessage("합치기(충돌 해결): " + from + " → " + into)
                        .setAuthor(who, who + "@easygit.local").call();
                return new MergeOutcome(true, "충돌을 해결하고 합쳤습니다.", "MERGED");

            } catch (Exception e) {
                abortMerge(project, into);
                return new MergeOutcome(false, "합치기에 실패했습니다: " + e.getMessage(), "ERROR");
            }
        }
    }

    private void abortMerge(String project, String into) {
        try (Git git = open(project)) {
            git.reset().setMode(ResetCommand.ResetType.HARD).setRef(into).call();
            git.getRepository().writeMergeHeads(null);
            git.getRepository().writeMergeCommitMsg(null);
        } catch (Exception ignore) {
            // 되돌리기 실패는 무시
        }
    }

    /** 합치기 요청에서 'from' 이 도입하는 변경(diff)을 텍스트로 — AI 리뷰용. */
    public String diffText(String project, String from, String into) throws IOException {
        try (Git git = open(project)) {
            Repository repo = git.getRepository();
            ObjectId fromId = resolve(repo, from);
            ObjectId intoId = resolve(repo, into);
            try (RevWalk walk = new RevWalk(repo)) {
                RevCommit fromC = walk.parseCommit(fromId);
                RevCommit baseCommit = mergeBase(repo, fromId, intoId);
                var baseTree = (baseCommit != null) ? baseCommit.getTree() : null;

                java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
                try (DiffFormatter df = new DiffFormatter(out)) {
                    df.setRepository(repo);
                    var oldIter = (baseTree != null)
                            ? new org.eclipse.jgit.treewalk.CanonicalTreeParser(null, repo.newObjectReader(), baseTree)
                            : new org.eclipse.jgit.treewalk.EmptyTreeIterator();
                    var newIter = new org.eclipse.jgit.treewalk.CanonicalTreeParser(
                            null, repo.newObjectReader(), fromC.getTree());
                    df.format(df.scan(oldIter, newIter));
                }
                return out.toString(StandardCharsets.UTF_8);
            }
        }
    }

    /** 로컬 프로젝트의 모든 작업공간을 외부 원격(예: Gitea)으로 올린다(force). */
    public void pushToRemote(String project, String remoteUrl, String username, String token) throws Exception {
        synchronized (lock(project)) {
            try (Git git = open(project)) {
                git.push()
                        .setRemote(remoteUrl)
                        .setRefSpecs(new org.eclipse.jgit.transport.RefSpec("refs/heads/*:refs/heads/*"))
                        .setCredentialsProvider(
                                new org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider(username, token))
                        .setForce(true)
                        .call();
            }
        }
    }

    private RevCommit mergeBase(Repository repo, ObjectId a, ObjectId b) throws IOException {
        try (RevWalk walk = new RevWalk(repo)) {
            walk.setRevFilter(org.eclipse.jgit.revwalk.filter.RevFilter.MERGE_BASE);
            walk.markStart(walk.parseCommit(a));
            walk.markStart(walk.parseCommit(b));
            return walk.next();
        }
    }

    // ---------------------------------------------------------------- 데모

    /** 충돌이 나는 상황과 안전한 상황을 모두 보여주는 데모 프로젝트 생성. */
    public String seedDemo() throws Exception {
        String name = "데모-식당메뉴";
        if (dir(name).exists()) deleteRecursively(dir(name));

        createProject(name, "사장님");
        commit(name, "main", "메뉴.txt",
                "1. 김치찌개\n2. 된장찌개\n3. 비빔밥\n", "메뉴판 추가", "사장님");

        // 같은 줄(1번)을 서로 다르게 고치는 두 작업공간 → 합치면 충돌
        createBranch(name, "메뉴-수정A", "main");
        commit(name, "메뉴-수정A", "메뉴.txt",
                "1. 김치찌개 (매운맛)\n2. 된장찌개\n3. 비빔밥\n", "1번을 매운맛으로", "알바생A");

        createBranch(name, "메뉴-수정B", "main");
        commit(name, "메뉴-수정B", "메뉴.txt",
                "1. 김치전골\n2. 된장찌개\n3. 비빔밥\n", "1번을 전골로", "알바생B");

        // 새 파일만 추가하는 작업공간 → main 과 안전하게 합쳐짐
        createBranch(name, "공지-추가", "main");
        commit(name, "공지-추가", "공지.txt",
                "오늘은 정상 영업합니다.\n", "공지 파일 추가", "사장님");

        return name;
    }

    // ---------------------------------------------------------------- 내부 도우미

    private ObjectId resolve(Repository repo, String rev) throws IOException {
        ObjectId id = repo.resolve(rev);
        if (id == null) throw new IllegalArgumentException("작업공간을 찾을 수 없습니다: " + rev);
        return id;
    }

    /** 두 찰칵 사이에 바뀐 파일 목록을 한국어 라벨과 함께 반환. */
    private List<String> diffFiles(Repository repo, RevCommit base, RevCommit target) throws IOException {
        try (DiffFormatter df = new DiffFormatter(DisabledOutputStream.INSTANCE)) {
            df.setRepository(repo);
            List<DiffEntry> entries = df.scan(base.getTree(), target.getTree());
            List<String> out = new ArrayList<>();
            for (DiffEntry e : entries) {
                String path = e.getChangeType() == DiffEntry.ChangeType.DELETE
                        ? e.getOldPath() : e.getNewPath();
                out.add(label(e.getChangeType()) + " " + path);
            }
            return out;
        }
    }

    private String label(DiffEntry.ChangeType t) {
        return switch (t) {
            case ADD -> "추가";
            case MODIFY -> "수정";
            case DELETE -> "삭제";
            case RENAME -> "이름변경";
            case COPY -> "복사";
        };
    }

    private void deleteRecursively(File f) {
        File[] children = f.listFiles();
        if (children != null) for (File c : children) deleteRecursively(c);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }
}
