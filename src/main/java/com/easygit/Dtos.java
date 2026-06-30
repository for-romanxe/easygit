package com.easygit;

import java.util.List;

/** 요청/응답에 쓰는 데이터 묶음들. */

// --- 요청(Request) ---
record CreateProjectReq(String name, String author) {}
record CreateBranchReq(String name, String from) {}
record CommitReq(String branch, String path, String content, String message, String author) {}
record MergeReq(String from, String into) {}
record Resolution(String path, String content) {}
record ResolveReq(String from, String into, List<Resolution> resolutions) {}

// --- 응답(Response) ---
record CommitDto(String id, String message, String author, String when) {}

/** 충돌 점검 결과. */
record MergeCheck(
        boolean clean,            // true = 충돌 없음(안전)
        boolean upToDate,         // true = 가져올 변경이 없음(이미 최신)
        List<String> conflicts,   // 충돌난 파일들
        List<String> changes      // 이 합치기로 바뀌는 파일 목록
) {}

/** 합치기 실행 결과. */
record MergeOutcome(boolean success, String message, String status) {}

/** 충돌난 파일 하나의 양쪽 내용. */
record ConflictFile(String path, String intoContent, String fromContent) {}

/** AI 리뷰 결과. */
record ReviewResult(boolean available, String review) {}
