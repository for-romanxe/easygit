package com.easygit;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 아주 가벼운 사용자 인증.
 * data/users.json 에 사용자별 [salt, 해시]를 저장한다. 비밀번호는 SHA-256(salt+pw)로 해싱.
 * (학습용 로컬 도구 수준의 인증)
 */
@Service
public class AuthService {

    private final File file = new File("data/users.json");
    private final ObjectMapper om = new ObjectMapper();
    private final Map<String, String[]> users = new ConcurrentHashMap<>();

    public AuthService() {
        load();
    }

    private void load() {
        try {
            if (file.exists()) {
                users.putAll(om.readValue(file, new TypeReference<Map<String, String[]>>() {}));
            }
        } catch (Exception ignore) {
            // 손상된 파일은 무시하고 빈 상태로 시작
        }
    }

    private void save() {
        try {
            if (file.getParentFile() != null) file.getParentFile().mkdirs();
            om.writeValue(file, users);
        } catch (IOException ignore) {
        }
    }

    public void register(String username, String password) {
        if (username == null || username.isBlank() || password == null || password.isBlank()) {
            throw new IllegalArgumentException("아이디와 비밀번호를 입력하세요.");
        }
        if (username.length() < 2 || password.length() < 4) {
            throw new IllegalArgumentException("아이디는 2자, 비밀번호는 4자 이상이어야 합니다.");
        }
        if (users.containsKey(username)) {
            throw new IllegalArgumentException("이미 있는 아이디입니다.");
        }
        String salt = hex(rand());
        users.put(username, new String[]{salt, sha(salt + password)});
        save();
    }

    public boolean login(String username, String password) {
        String[] e = users.get(username);
        return e != null && e[1].equals(sha(e[0] + password));
    }

    // --- 내부 도우미 ---
    private byte[] rand() {
        byte[] b = new byte[12];
        new SecureRandom().nextBytes(b);
        return b;
    }

    private String hex(byte[] b) {
        return HexFormat.of().formatHex(b);
    }

    private String sha(String s) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
