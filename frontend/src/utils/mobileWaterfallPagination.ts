import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue'

interface PaginationState {
  page: number
  size: number
  total: number
}

interface UseMobileWaterfallPaginationOptions {
  isMobileViewport: Ref<boolean>
  loading: Ref<boolean>
  itemCount: Ref<number>
  pagination: PaginationState
  loadPage: () => Promise<void>
  batchSize?: number
}

/**
 * 为移动端列表提供瀑布流式的“继续加载”能力：
 * 1. 桌面端仍沿用原有 page/size 分页；
 * 2. 手机端固定请求第一页，但逐步放大 size，形成连续滚动体验；
 * 3. 通过底部哨兵自动触发下一段加载，避免每个页面重复写一套 observer。
 */
export function useMobileWaterfallPagination(options: UseMobileWaterfallPaginationOptions) {
  const batchSize = options.batchSize ?? options.pagination.size
  const mobileVisibleCount = ref(batchSize)
  const sentinelRef = ref<HTMLElement | null>(null)
  const loadingMore = ref(false)
  let observer: IntersectionObserver | null = null

  const requestPage = computed(() => (options.isMobileViewport.value ? 1 : options.pagination.page))
  const requestSize = computed(() => (options.isMobileViewport.value ? mobileVisibleCount.value : options.pagination.size))
  const showDesktopPagination = computed(() => !options.isMobileViewport.value)
  const hasMoreMobileItems = computed(() => options.isMobileViewport.value && options.itemCount.value < options.pagination.total)

  const teardownObserver = () => {
    observer?.disconnect()
    observer = null
  }

  const resetMobilePagination = () => {
    mobileVisibleCount.value = batchSize
    options.pagination.page = 1
  }

  const loadMore = async () => {
    if (!hasMoreMobileItems.value || options.loading.value || loadingMore.value) {
      return
    }

    loadingMore.value = true
    try {
      mobileVisibleCount.value += batchSize
      await options.loadPage()
    } finally {
      loadingMore.value = false
    }
  }

  watch(
    [options.isMobileViewport, sentinelRef, hasMoreMobileItems],
    ([isMobile, sentinel, hasMore]) => {
      teardownObserver()

      if (!isMobile || !hasMore || typeof IntersectionObserver === 'undefined' || !sentinel) {
        return
      }

      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore()
        }
      }, {
        rootMargin: '160px 0px'
      })

      observer.observe(sentinel)
    },
    { immediate: true }
  )

  watch(
    () => options.isMobileViewport.value,
    (isMobile, wasMobile) => {
      if (isMobile === wasMobile) {
        return
      }
      resetMobilePagination()
      if (!options.loading.value) {
        void options.loadPage()
      }
    }
  )

  onBeforeUnmount(() => {
    teardownObserver()
  })

  return {
    sentinelRef,
    requestPage,
    requestSize,
    showDesktopPagination,
    hasMoreMobileItems,
    loadingMore,
    resetMobilePagination,
    loadMore
  }
}
