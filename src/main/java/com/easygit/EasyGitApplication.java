package com.easygit;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 쉬운깃 - 한국어 협업 도구.
 * Git 엔진(JGit)을 내장하여, 별도 서버 없이 이 앱 하나로
 * 작업공간 관리 · 변경 올리기 · 충돌 점검 · 합치기를 제공한다.
 */
@SpringBootApplication
public class EasyGitApplication {
    public static void main(String[] args) {
        SpringApplication.run(EasyGitApplication.class, args);
    }
}
