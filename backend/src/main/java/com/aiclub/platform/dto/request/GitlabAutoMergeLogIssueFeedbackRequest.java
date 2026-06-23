package com.aiclub.platform.dto.request;

/**
 * 自动合并日志分享页单条问题反馈请求。
 *
 * <p>由分享页（匿名访问，凭 token 鉴权）提交，每条 issue 独立评价。</p>
 */
public class GitlabAutoMergeLogIssueFeedbackRequest {

    /** issueId，来自 detail_markdown 中的 {@code <!-- issue-id: xxx -->} 注释。 */
    private String issueId;

    /** 评价：CORRECT（分析正确） / INCORRECT（分析错误）。 */
    private String verdict;

    /** 可选理由文本，最长 2000 字符。 */
    private String reason;

    /** 前端生成的浏览器指纹 SHA-256 值，服务端会再做一次 hash 后入库。 */
    private String fingerprint;

    /** issue 所在区块：NEWLY_RAISED（本次新增问题） / PENDING（当前仍需处理问题）。 */
    private String section;

    public String getIssueId() {
        return issueId;
    }

    public void setIssueId(String issueId) {
        this.issueId = issueId;
    }

    public String getVerdict() {
        return verdict;
    }

    public void setVerdict(String verdict) {
        this.verdict = verdict;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getFingerprint() {
        return fingerprint;
    }

    public void setFingerprint(String fingerprint) {
        this.fingerprint = fingerprint;
    }

    public String getSection() {
        return section;
    }

    public void setSection(String section) {
        this.section = section;
    }
}