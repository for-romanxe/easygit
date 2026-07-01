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
 * 프로젝트별 소유자/멤버(권한) 관리. data/members.json 에 저장한다.
 * - 프로젝트를 만든 사람이 소유자가 되고, 소유자가 멤버를 초대한다.
 * - 변경(쓰기) 작업은 멤버만 할 수 있다.
 * - 소유자 기록이 없는 옛 프로젝트는 누구나 쓸 수 있고, "관리자 되기"로 소유권을 가져올 수 있다.
 */
@Service
public class MemberService {

    /** 프로젝트 하나의 권한 정보. (Jackson 저장용으로 public 필드 사용) */
    public static class Rec {
        public String owner;
        public List<String> members = new ArrayList<>();
    }

    private final File file = new File("data/members.json");
    private final ObjectMapper om = new ObjectMapper();
    private final Map<String, Rec> map = new ConcurrentHashMap<>();

    public MemberService() {
        load();
    }

    private void load() {
        try {
            if (file.exists()) {
                map.putAll(om.readValue(file, new TypeReference<Map<String, Rec>>() {}));
            }
        } catch (Exception ignore) {
            // 손상된 파일은 무시하고 빈 상태로 시작
        }
    }

    private synchronized void save() {
        try {
            if (file.getParentFile() != null) file.getParentFile().mkdirs();
            om.writeValue(file, map);
        } catch (Exception ignore) {
        }
    }

    public boolean hasOwner(String project) {
        Rec r = map.get(project);
        return r != null && r.owner != null;
    }

    public String owner(String project) {
        Rec r = map.get(project);
        return r == null ? null : r.owner;
    }

    /** 소유자 + 멤버 전체 목록(소유자 포함, 중복 제거). */
    public List<String> members(String project) {
        Rec r = map.get(project);
        if (r == null) return List.of();
        List<String> all = new ArrayList<>();
        if (r.owner != null) all.add(r.owner);
        for (String m : r.members) if (!all.contains(m)) all.add(m);
        return all;
    }

    /** 프로젝트를 만든 사람을 소유자로 등록. */
    public void setOwner(String project, String user) {
        Rec r = map.computeIfAbsent(project, k -> new Rec());
        r.owner = user;
        if (!r.members.contains(user)) r.members.add(user);
        save();
    }

    /** 소유자 없는(옛) 프로젝트를 현재 사용자가 관리자로 가져감. */
    public void claim(String project, String user) {
        if (hasOwner(project)) throw new IllegalArgumentException("이미 관리자가 있는 프로젝트입니다.");
        setOwner(project, user);
    }

    public void addMember(String project, String actor, String username) {
        Rec r = requireOwner(project, actor);
        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("추가할 아이디를 입력하세요.");
        }
        String u = username.trim();
        if (!r.members.contains(u)) r.members.add(u);
        save();
    }

    public void removeMember(String project, String actor, String username) {
        Rec r = requireOwner(project, actor);
        if (username.equals(r.owner)) {
            throw new IllegalArgumentException("소유자는 내보낼 수 없습니다.");
        }
        r.members.remove(username);
        save();
    }

    /** 쓰기(변경) 권한: 소유자 없는 프로젝트는 누구나 허용, 있으면 멤버만. */
    public boolean canWrite(String project, String user) {
        if (!hasOwner(project)) return true;
        return members(project).contains(user);
    }

    /** 쓰기 권한이 없으면 예외. */
    public void requireWrite(String project, String user) {
        if (!canWrite(project, user)) {
            throw new IllegalArgumentException("이 프로젝트의 멤버만 변경할 수 있습니다. 소유자에게 초대를 요청하세요.");
        }
    }

    private Rec requireOwner(String project, String actor) {
        Rec r = map.get(project);
        if (r == null || r.owner == null) {
            throw new IllegalArgumentException("아직 관리자가 없는 프로젝트입니다. 먼저 '관리자 되기'를 하세요.");
        }
        if (!r.owner.equals(actor)) {
            throw new IllegalArgumentException("소유자만 멤버를 관리할 수 있습니다.");
        }
        return r;
    }
}
