package com.easygit;

import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * /api/** 는 로그인해야 호출할 수 있게 막는다 (인증 관련 /api/auth/** 는 예외).
 * 정적 파일(화면)은 통과시킨다.
 */
@Component
public class AuthFilter implements Filter {

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest r = (HttpServletRequest) req;
        String path = r.getRequestURI();

        if (path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
            if (r.getSession().getAttribute("user") == null) {
                HttpServletResponse w = (HttpServletResponse) res;
                w.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                w.setContentType("application/json;charset=UTF-8");
                w.getWriter().write("{\"error\":\"로그인이 필요합니다\"}");
                return;
            }
        }
        chain.doFilter(req, res);
    }
}
