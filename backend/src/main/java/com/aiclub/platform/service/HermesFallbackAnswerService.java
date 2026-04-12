package com.aiclub.platform.service;

import com.aiclub.platform.dto.HermesActionSummary;
import com.aiclub.platform.dto.HermesSelectionCard;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Hermes tool loop 被平台中断时的本地总结器。
 * 这里只处理歧义选择、写操作确认和工具循环失败三类场景。
 */
@Service
public class HermesFallbackAnswerService {

    /**
     * 多候选歧义场景下，明确要求用户先完成对象选择。
     */
    public String composeSelectionSummary(List<HermesSelectionCard> selectionCards) {
        StringBuilder builder = new StringBuilder("我已经帮你查到候选对象了，但当前还不能确定你具体指的是哪一个。\n\n");
        for (HermesSelectionCard selectionCard : selectionCards) {
            builder.append("请先确认“")
                    .append(defaultString(selectionCard.slot()))
                    .append("”对应的对象。\n");
        }
        builder.append("\n你可以直接点击下方候选卡片，我会按你选中的对象继续处理。");
        return builder.toString().trim();
    }

    /**
     * 写工具被转成待确认动作时，返回一段简短说明。
     */
    public String composeActionSummary(List<HermesActionSummary> actions) {
        StringBuilder builder = new StringBuilder("我已经根据当前上下文准备好了可执行动作，但出于安全考虑需要你先确认。\n\n");
        for (HermesActionSummary action : actions) {
            builder.append("- ")
                    .append(defaultString(action.title()))
                    .append("：")
                    .append(defaultString(action.description()))
                    .append('\n');
        }
        builder.append("\n如果你确认无误，直接点击下方动作卡片即可继续。");
        return builder.toString().trim();
    }

    /**
     * 工具循环失败但平台已经确定不能继续时，返回一段清晰错误说明。
     */
    public String composeFailureSummary(String message) {
        String safeMessage = defaultString(message);
        if (safeMessage.isBlank()) {
            safeMessage = "本轮工具调用没有成功完成，你可以稍后重试，或者换一种更明确的问法。";
        }
        return safeMessage;
    }

    private String defaultString(String value) {
        return value == null ? "" : value.trim();
    }
}
