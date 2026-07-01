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
record AddMemberReq(String username) {}
record CreateRequestReq(String title, String desc, String from, String into) {}

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

/** 합치기 요청 상세 (요청 정보 + 지금 시점의 충돌 점검 결과). */
record RequestView(
        int id, String title, String desc,
        String from, String into, String author,
        String status, long createdAt,
        List<String> approvals, String mergedBy,
        boolean clean, boolean upToDate,
        List<String> conflicts, List<String> changes,
        boolean canMerge   // 지금 로그인한 사람이 이 요청을 합칠 수 있는지
) {}

/** 프로젝트 멤버/권한 현황. */
record MembersView(
        String owner,             // 소유자(없으면 null)
        List<String> members,     // 소유자 포함 멤버 목록
        boolean hasOwner,         // 소유자가 지정돼 있는지
        boolean isOwner,          // 지금 로그인한 사람이 소유자인지
        boolean canWrite          // 지금 로그인한 사람이 변경할 수 있는지
) {}
