package com.aiclub.platform.repository;

import com.aiclub.platform.domain.model.GitlabAutoMergeLogIssueFeedbackEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 自动合并日志逐条 issue 反馈仓库。
 *
 * <p>仓库职责：</p>
 * <ul>
 *     <li>upsert 用：按 (logId, issueId, fingerprintHash) 唯一查找已有反馈</li>
 *     <li>详情对话框打开时按当前指纹一次性拉取某条 log 下的所有反馈，前端按 issueId 回填</li>
 *     <li>未来 LLM 复盘智能体：按 issueId 聚合所有反馈、或按 projectId+verdict 抽样失败案例</li>
 * </ul>
 */
@Repository
public interface GitlabAutoMergeLogIssueFeedbackRepository extends JpaRepository<GitlabAutoMergeLogIssueFeedbackEntity, Long> {

    /** 用于 upsert 时定位"同来源对同 issue 已经反馈过的那条"。 */
    Optional<GitlabAutoMergeLogIssueFeedbackEntity> findByLog_IdAndIssueIdAndSubmitterFingerprintHash(
            Long logId, String issueId, String submitterFingerprintHash);

    /** 详情对话框打开后，按当前访问者指纹拉取该 log 的全部反馈，前端回显已有评价。 */
    List<GitlabAutoMergeLogIssueFeedbackEntity> findAllByLog_IdAndSubmitterFingerprintHashOrderByIssueIdAsc(
            Long logId, String submitterFingerprintHash);

    /** 未来 LLM 复盘智能体：按 issueId 在项目内汇总，看同一条问题被多少人评为 CORRECT/INCORRECT。 */
    List<GitlabAutoMergeLogIssueFeedbackEntity> findAllByProjectIdAndIssueIdOrderByCreatedAtDesc(
            Long projectId, String issueId);
}
