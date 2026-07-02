package com.easygit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * "합치기 요청"(GitHub 의 Pull Request 에 해당) 저장/관리.
 * data/requests.json 에 프로젝트별 요청 목록을 저장한다.
 * 흐름: 요청 올리기 → (충돌 점검·diff·AI리뷰) → 승인 → 합치기.
 */
@Service
public class MergeRequestService {

    /** 합치기 요청 하나. (Jackson 저장용 public 필드) */
    public static class Req {
        public int id;
        public String title;
        public String desc;
        public String from;          // 가져올 작업공간
        public String into;          // 합칠 대상
        public String author;        // 요청을 올린 사람
        public String status = "열림"; // 열림 | 합쳐짐 | 닫힘
        public long createdAt;
        public List<String> approvals = new ArrayList<>(); // 승인한 사람들
        public String mergedBy;      // 합친 사람(합쳐졌을 때)
        public List<Comment> comments = new ArrayList<>(); // 댓글/토론
    }

    /** 합치기 요청에 달린 댓글 하나. */
    public static class Comment {
        public String author;
        public String text;
        public long createdAt;
    }

    private final File file = new File("data/requests.json");
    private final ObjectMapper om = new ObjectMapper();
    private final Map<String, List<Req>> map = new ConcurrentHashMap<>();

    public MergeRequestService() {
        load();
    }

    private void load() {
        try {
            if (file.exists()) {
                map.putAll(om.readValue(file, new TypeReference<Map<String, List<Req>>>() {}));
            }
        } catch (Exception ignore) {
        }
    }

    private synchronized void save() {
        try {
            if (file.getParentFile() != null) file.getParentFile().mkdirs();
            om.writeValue(file, map);
        } catch (Exception ignore) {
        }
    }

    /** 최신 요청이 위로 오도록 역순 반환. */
    public List<Req> list(String project) {
        List<Req> l = map.getOrDefault(project, List.of());
        List<Req> copy = new ArrayList<>(l);
        copy.sort((a, b) -> Integer.compare(b.id, a.id));
        return copy;
    }

    public Req get(String project, int id) {
        for (Req r : map.getOrDefault(project, List.of())) {
            if (r.id == id) return r;
        }
        throw new IllegalArgumentException("해당 합치기 요청을 찾을 수 없습니다.");
    }

    public Req create(String project, String title, String desc, String from, String into, String author) {
        if (title == null || title.isBlank()) throw new IllegalArgumentException("요청 제목을 입력하세요.");
        if (from == null || into == null || from.equals(into))
            throw new IllegalArgumentException("서로 다른 작업공간을 골라야 합니다.");
        List<Req> l = map.computeIfAbsent(project, k -> new ArrayList<>());
        Req r = new Req();
        r.id = l.stream().mapToInt(x -> x.id).max().orElse(0) + 1;
        r.title = title.trim();
        r.desc = desc == null ? "" : desc.trim();
        r.from = from;
        r.into = into;
        r.author = author;
        r.createdAt = System.currentTimeMillis();
        l.add(r);
        save();
        return r;
    }

    public Req approve(String project, int id, String user) {
        Req r = get(project, id);
        if (!"열림".equals(r.status)) throw new IllegalArgumentException("열려 있는 요청만 승인할 수 있습니다.");
        if (!r.approvals.contains(user)) r.approvals.add(user);
        save();
        return r;
    }

    public Req markMerged(String project, int id, String user) {
        Req r = get(project, id);
        r.status = "합쳐짐";
        r.mergedBy = user;
        save();
        return r;
    }

    public Req addComment(String project, int id, String author, String text) {
        if (text == null || text.isBlank()) throw new IllegalArgumentException("댓글 내용을 입력하세요.");
        Req r = get(project, id);
        Comment c = new Comment();
        c.author = author;
        c.text = text.trim();
        c.createdAt = System.currentTimeMillis();
        if (r.comments == null) r.comments = new ArrayList<>();
        r.comments.add(c);
        save();
        return r;
    }

    public Req close(String project, int id) {
        Req r = get(project, id);
        if ("합쳐짐".equals(r.status)) throw new IllegalArgumentException("이미 합쳐진 요청은 닫을 수 없습니다.");
        r.status = "닫힘";
        save();
        return r;
    }
}
