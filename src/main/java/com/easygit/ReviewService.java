package com.easygit;

import com.anthropic.client.AnthropicClient;
import com.anthropic.client.okhttp.AnthropicOkHttpClient;
import com.anthropic.models.messages.Message;
import com.anthropic.models.messages.MessageCreateParams;
import com.anthropic.models.messages.ThinkingConfigAdaptive;
import org.springframework.stereotype.Service;

import java.util.stream.Collectors;

/**
 * Claude(클로드)를 이용한 자동 코드 리뷰.
 * 환경변수 ANTHROPIC_API_KEY 가 있을 때만 동작하고, 없으면 안내 메시지를 돌려준다.
 */
@Service
public class ReviewService {

    private final GitService git;

    public ReviewService(GitService git) {
        this.git = git;
    }

    public ReviewResult review(String project, String from, String into) {
        String key = System.getenv("ANTHROPIC_API_KEY");
        if (key == null || key.isBlank()) {
            return new ReviewResult(false,
                    "AI 리뷰를 사용하려면 ANTHROPIC_API_KEY 환경변수를 설정하고 앱을 다시 실행하세요.\n"
                    + "예) export ANTHROPIC_API_KEY=sk-ant-... 후  ./run.sh");
        }

        String diff;
        try {
            diff = git.diffText(project, from, into);
        } catch (Exception e) {
            return new ReviewResult(true, "변경 내용을 읽지 못했습니다: " + e.getMessage());
        }
        if (diff == null || diff.isBlank()) {
            return new ReviewResult(true, "변경 내용이 없어 리뷰할 것이 없습니다.");
        }

        String prompt = """
                아래는 합치기 요청의 코드 변경(diff)입니다.
                한국어로 코드 리뷰를 해주세요. 다음을 중점적으로 봐주세요:
                버그, 보안 취약점, 비효율적인 코드, 더 단순하게 만들 수 있는 부분.
                문제가 없으면 "특별한 문제는 보이지 않습니다" 라고 답하세요.
                간결하게, 항목별로 정리해 주세요.

                ```diff
                %s
                ```
                """.formatted(diff);

        try {
            AnthropicClient client = AnthropicOkHttpClient.builder().apiKey(key).build();
            MessageCreateParams params = MessageCreateParams.builder()
                    .model("claude-opus-4-8")
                    .maxTokens(8000L)
                    .thinking(ThinkingConfigAdaptive.builder().build())
                    .addUserMessage(prompt)
                    .build();

            Message response = client.messages().create(params);
            String text = response.content().stream()
                    .flatMap(b -> b.text().stream())
                    .map(t -> t.text())
                    .collect(Collectors.joining("\n"))
                    .trim();

            if (text.isBlank()) text = "(리뷰 내용을 받지 못했습니다)";
            return new ReviewResult(true, text);

        } catch (Exception e) {
            return new ReviewResult(true, "AI 리뷰 호출에 실패했습니다: " + e.getMessage());
        }
    }
}
