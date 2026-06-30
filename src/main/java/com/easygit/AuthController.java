package com.easygit;

import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/** 로그인 / 회원가입 / 로그아웃 / 현재 사용자 확인. */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    public Map<String, String> register(@RequestBody Map<String, String> body, HttpSession session) {
        String u = body.get("username");
        auth.register(u, body.get("password"));
        session.setAttribute("user", u);
        return Map.of("user", u);
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, String>> login(@RequestBody Map<String, String> body, HttpSession session) {
        String u = body.get("username");
        if (auth.login(u, body.get("password"))) {
            session.setAttribute("user", u);
            return ResponseEntity.ok(Map.of("user", u));
        }
        return ResponseEntity.status(401).body(Map.of("error", "아이디 또는 비밀번호가 올바르지 않습니다."));
    }

    @PostMapping("/logout")
    public Map<String, String> logout(HttpSession session) {
        session.invalidate();
        return Map.of("status", "ok");
    }

    @GetMapping("/me")
    public Map<String, Object> me(HttpSession session) {
        Map<String, Object> m = new HashMap<>();
        m.put("user", session.getAttribute("user"));
        return m;
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> err(Exception e) {
        String msg = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }
}
