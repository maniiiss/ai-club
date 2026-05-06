package com.aiclub.platform.service;

import com.aiclub.platform.domain.model.DashboardShortcutEntryEntity;
import com.aiclub.platform.domain.model.UserEntity;
import com.aiclub.platform.dto.DashboardShortcutEntrySummary;
import com.aiclub.platform.dto.DashboardShortcutOverview;
import com.aiclub.platform.dto.request.DashboardShortcutAdminRequest;
import com.aiclub.platform.dto.request.SaveDashboardShortcutEntriesRequest;
import com.aiclub.platform.dto.request.SaveDashboardShortcutEntryItemRequest;
import com.aiclub.platform.exception.UnauthorizedException;
import com.aiclub.platform.repository.DashboardShortcutEntryRepository;
import com.aiclub.platform.repository.UserRepository;
import com.aiclub.platform.security.AuthContext;
import com.aiclub.platform.security.AuthContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 管理首页“常用系统访问入口”的系统级与个人级读写。
 */
@Service
@Transactional(readOnly = true)
public class DashboardShortcutEntryService {

    public static final String SCOPE_SYSTEM = "SYSTEM";
    public static final String SCOPE_USER = "USER";
    private static final int SHORTCUT_LIMIT = 20;

    private final DashboardShortcutEntryRepository dashboardShortcutEntryRepository;
    private final UserRepository userRepository;

    public DashboardShortcutEntryService(DashboardShortcutEntryRepository dashboardShortcutEntryRepository,
                                         UserRepository userRepository) {
        this.dashboardShortcutEntryRepository = dashboardShortcutEntryRepository;
        this.userRepository = userRepository;
    }

    /**
     * 聚合首页需要展示的系统入口与个人入口。
     */
    public DashboardShortcutOverview getCurrentUserShortcutOverview() {
        return new DashboardShortcutOverview(
                listSystemEntries(true),
                listCurrentUserEntries()
        );
    }

    /**
     * 读取系统级入口列表。
     * 管理后台默认需要看到全部记录，因此可选择是否包含禁用项。
     */
    public List<DashboardShortcutEntrySummary> listSystemEntries(boolean enabledOnly) {
        return dashboardShortcutEntryRepository.findAllByScopeTypeOrderBySortOrderAscIdAsc(SCOPE_SYSTEM).stream()
                .filter((entity) -> !enabledOnly || entity.isEnabled())
                .map(this::toSummary)
                .toList();
    }

    /**
     * 读取当前登录用户的个人入口列表。
     */
    public List<DashboardShortcutEntrySummary> listCurrentUserEntries() {
        return dashboardShortcutEntryRepository.findAllByScopeTypeAndOwnerUser_IdOrderBySortOrderAscIdAsc(SCOPE_USER, requireCurrentUserId())
                .stream()
                .map(this::toSummary)
                .toList();
    }

    /**
     * 用前端提交的最新列表覆盖当前用户个人入口，并保留已有条目的稳定ID。
     */
    @Transactional
    public List<DashboardShortcutEntrySummary> saveCurrentUserEntries(SaveDashboardShortcutEntriesRequest request) {
        validateItemCount(request.items().size());
        Long currentUserId = requireCurrentUserId();
        UserEntity currentUser = userRepository.findById(currentUserId)
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        List<DashboardShortcutEntryEntity> existingEntries = dashboardShortcutEntryRepository
                .findAllByScopeTypeAndOwnerUser_IdOrderBySortOrderAscIdAsc(SCOPE_USER, currentUserId);
        Map<Long, DashboardShortcutEntryEntity> existingEntryMap = new LinkedHashMap<>();
        existingEntries.forEach((entry) -> {
            if (entry.getId() != null) {
                existingEntryMap.put(entry.getId(), entry);
            }
        });

        List<DashboardShortcutEntryEntity> savingEntries = new ArrayList<>();
        for (int index = 0; index < request.items().size(); index++) {
            SaveDashboardShortcutEntryItemRequest itemRequest = request.items().get(index);
            DashboardShortcutEntryEntity targetEntry = resolveUserEntry(itemRequest, existingEntryMap, currentUser);
            fillEntry(targetEntry, itemRequest.name(), itemRequest.url(), itemRequest.icon(), itemRequest.enabled(), index);
            targetEntry.setScopeType(SCOPE_USER);
            targetEntry.setOwnerUser(currentUser);
            savingEntries.add(targetEntry);
        }

        if (!existingEntryMap.isEmpty()) {
            dashboardShortcutEntryRepository.deleteAll(existingEntryMap.values());
        }

        dashboardShortcutEntryRepository.saveAll(savingEntries);
        savingEntries.sort(Comparator.comparing(DashboardShortcutEntryEntity::getSortOrder).thenComparing(DashboardShortcutEntryEntity::getId));
        return savingEntries.stream().map(this::toSummary).toList();
    }

    /**
     * 新增系统级入口。
     */
    @Transactional
    public DashboardShortcutEntrySummary createSystemEntry(DashboardShortcutAdminRequest request) {
        DashboardShortcutEntryEntity entity = new DashboardShortcutEntryEntity();
        entity.setScopeType(SCOPE_SYSTEM);
        entity.setOwnerUser(null);
        fillEntry(entity, request.name(), request.url(), request.icon(), request.enabled(), normalizeSortOrder(request.sortOrder()));
        return toSummary(dashboardShortcutEntryRepository.save(entity));
    }

    /**
     * 更新系统级入口。
     */
    @Transactional
    public DashboardShortcutEntrySummary updateSystemEntry(Long id, DashboardShortcutAdminRequest request) {
        DashboardShortcutEntryEntity entity = requireSystemEntry(id);
        fillEntry(entity, request.name(), request.url(), request.icon(), request.enabled(), normalizeSortOrder(request.sortOrder()));
        return toSummary(dashboardShortcutEntryRepository.save(entity));
    }

    /**
     * 删除系统级入口。
     */
    @Transactional
    public void deleteSystemEntry(Long id) {
        dashboardShortcutEntryRepository.delete(requireSystemEntry(id));
    }

    /**
     * 校验并清洗用户级目标入口，确保只能改动自己名下的数据。
     */
    private DashboardShortcutEntryEntity resolveUserEntry(SaveDashboardShortcutEntryItemRequest itemRequest,
                                                          Map<Long, DashboardShortcutEntryEntity> existingEntryMap,
                                                          UserEntity currentUser) {
        if (itemRequest.id() == null) {
            DashboardShortcutEntryEntity entity = new DashboardShortcutEntryEntity();
            entity.setScopeType(SCOPE_USER);
            entity.setOwnerUser(currentUser);
            return entity;
        }

        DashboardShortcutEntryEntity existingEntry = existingEntryMap.remove(itemRequest.id());
        if (existingEntry == null) {
            throw new IllegalArgumentException("快捷入口不存在或无权访问");
        }
        return existingEntry;
    }

    /**
     * 系统级入口必须严格命中 SYSTEM 作用域，避免误删用户个人配置。
     */
    private DashboardShortcutEntryEntity requireSystemEntry(Long id) {
        DashboardShortcutEntryEntity entity = dashboardShortcutEntryRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("快捷入口不存在"));
        if (!SCOPE_SYSTEM.equalsIgnoreCase(entity.getScopeType())) {
            throw new IllegalArgumentException("快捷入口不存在");
        }
        return entity;
    }

    /**
     * 统一填充入口字段，并做基本清洗校验。
     */
    private void fillEntry(DashboardShortcutEntryEntity entity,
                           String name,
                           String url,
                           String icon,
                           Boolean enabled,
                           Integer sortOrder) {
        entity.setName(normalizeName(name));
        entity.setUrl(normalizeUrl(url));
        entity.setIcon(normalizeIcon(icon));
        entity.setEnabled(Boolean.TRUE.equals(enabled));
        entity.setSortOrder(normalizeSortOrder(sortOrder));
    }

    /**
     * 入口名称按前后端一致规则做 trim 清洗。
     */
    private String normalizeName(String name) {
        String normalized = name == null ? "" : name.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("快捷入口名称不能为空");
        }
        return normalized;
    }

    /**
     * 链接地址要求为带协议头的完整地址，避免首页直接跳出到非法脚本协议。
     */
    private String normalizeUrl(String url) {
        String normalized = url == null ? "" : url.trim();
        if (normalized.isBlank()) {
            throw new IllegalArgumentException("快捷入口链接地址不能为空");
        }
        try {
            var uri = UriComponentsBuilder.fromUriString(normalized).build().toUri();
            String scheme = uri.getScheme();
            if (scheme == null) {
                throw new IllegalArgumentException("快捷入口链接地址必须包含协议头");
            }
            String normalizedScheme = scheme.toLowerCase(Locale.ROOT);
            if (!"http".equals(normalizedScheme) && !"https".equals(normalizedScheme)) {
                throw new IllegalArgumentException("快捷入口链接地址仅支持 http 或 https");
            }
            return normalized;
        } catch (IllegalArgumentException exception) {
            if (exception.getMessage() != null && exception.getMessage().contains("快捷入口")) {
                throw exception;
            }
            throw new IllegalArgumentException("快捷入口链接地址格式不正确");
        }
    }

    /**
     * 图标允许为空，前端会回退到默认 Link 图标；
     * 如果传的是上传后的图片 URL，则按原样保存供首页直接展示。
     */
    private String normalizeIcon(String icon) {
        return icon == null ? "" : icon.trim();
    }

    /**
     * 排序值统一收口到非负整数。
     */
    private Integer normalizeSortOrder(Integer sortOrder) {
        return sortOrder == null || sortOrder < 0 ? 0 : sortOrder;
    }

    private void validateItemCount(int size) {
        if (size > SHORTCUT_LIMIT) {
            throw new IllegalArgumentException("快捷入口数量不能超过20");
        }
    }

    /**
     * 从线程上下文里提取当前登录用户ID。
     */
    private Long requireCurrentUserId() {
        return AuthContextHolder.get()
                .map(AuthContext::userId)
                .orElseThrow(() -> new UnauthorizedException("Not logged in"));
    }

    /**
     * 转成前端消费的轻量摘要对象。
     */
    private DashboardShortcutEntrySummary toSummary(DashboardShortcutEntryEntity entity) {
        return new DashboardShortcutEntrySummary(
                entity.getId(),
                entity.getScopeType(),
                entity.getName(),
                entity.getUrl(),
                entity.getIcon(),
                entity.isEnabled(),
                entity.getSortOrder()
        );
    }
}
