package com.easygit;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;

/**
 * 실제 Gitea 서버(로컬)에 프로젝트를 올리는(호스팅) 연동.
 * 토큰은 GITEA_TOKEN 환경변수 또는 token-file 에서 읽는다. 없으면 기능을 건너뛴다.
 */
@Service
public class GiteaService {

    private final GitService git;
    private final String url;
    private final String user;
    private final String tokenFile;

    public GiteaService(GitService git,
                        @Value("${easygit.gitea.url:http://localhost:3000}") String url,
                        @Value("${easygit.gitea.user:easyadmin}") String user,
                        @Value("${easygit.gitea.token-file:}") String tokenFile) {
        this.git = git;
        this.url = url.replaceAll("/+$", "");
        this.user = user;
        this.tokenFile = tokenFile;
    }

    public Map<String, Object> publish(String project) {
        Map<String, Object> out = new HashMap<>();
        String token = token();
        if (token.isBlank()) {
            out.put("available", false);
            out.put("message", "Gitea가 설정되지 않았습니다. Gitea 서버를 띄우고 토큰을 등록하세요.");
            return out;
        }
        try {
            String repo = giteaName(project);
            createRepo(repo, token);
            String remote = url + "/" + user + "/" + repo + ".git";
            git.pushToRemote(project, remote, user, token);
            out.put("available", true);
            out.put("message", "Gitea에 올렸습니다.");
            out.put("url", url + "/" + user + "/" + repo);
            out.put("repo", repo);
        } catch (Exception e) {
            out.put("available", true);
            out.put("message", "Gitea 올리기 실패: " + e.getMessage());
        }
        return out;
    }

    // --- 내부 ---
    private String token() {
        String env = System.getenv("GITEA_TOKEN");
        if (env != null && !env.isBlank()) return env.trim();
        if (tokenFile != null && !tokenFile.isBlank()) {
            try {
                return Files.readString(Path.of(tokenFile)).trim();
            } catch (Exception ignore) {
            }
        }
        return "";
    }

    /** Gitea 저장소 이름 규칙(영문/숫자/.-_)에 맞게 변환. 한글 등이 있으면 해시를 붙여 구분. */
    private String giteaName(String project) {
        String s = project.replaceAll("[^A-Za-z0-9._-]", "-")
                .replaceAll("-{2,}", "-")
                .replaceAll("^[-.]+|[-.]+$", "");
        boolean changed = !s.equals(project);
        if (s.isBlank()) s = "repo";
        if (changed) s = s + "-" + Integer.toHexString(project.hashCode() & 0xffffff);
        return s;
    }

    private void createRepo(String repo, String token) throws Exception {
        String body = "{\"name\":\"" + repo + "\",\"private\":true,\"auto_init\":false}";
        HttpRequest req = HttpRequest.newBuilder(URI.create(url + "/api/v1/user/repos"))
                .header("Authorization", "token " + token)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8))
                .build();
        HttpResponse<String> resp = HttpClient.newHttpClient()
                .send(req, HttpResponse.BodyHandlers.ofString());
        int sc = resp.statusCode();
        // 201 = 생성됨, 409 = 이미 있음 → 둘 다 정상
        if (sc != 201 && sc != 409) {
            throw new RuntimeException("저장소 생성 실패(" + sc + "): " + resp.body());
        }
    }
}
