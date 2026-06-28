export type FloatingPlacement = 'top' | 'bottom'

export interface FloatingDropdownInput {
  triggerRect: DOMRect
  viewportHeight: number
  scrollX: number
  scrollY: number
  preferredHeight?: number
  gap?: number
  viewportPadding?: number
}

export interface FloatingDropdownStyle {
  top: number
  left: number
  width: number
  maxHeight: number
  placement: FloatingPlacement
}

/**
 * 业务意图：下拉菜单渲染到 body 后脱离滚动容器裁剪，再按触发器视口位置选择向上或向下展开。
 */
export const computeFloatingDropdownStyle = ({
  triggerRect,
  viewportHeight,
  scrollX,
  scrollY,
  preferredHeight = 240,
  gap = 6,
  viewportPadding = 12,
}: FloatingDropdownInput): FloatingDropdownStyle => {
  const spaceBelow = viewportHeight - triggerRect.bottom - viewportPadding
  const spaceAbove = triggerRect.top - viewportPadding
  const placement: FloatingPlacement = spaceBelow >= preferredHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top'
  const availableHeight = placement === 'bottom' ? spaceBelow : spaceAbove
  const maxHeight = Math.max(96, Math.min(preferredHeight, availableHeight))
  const top = placement === 'bottom'
    ? scrollY + triggerRect.bottom + gap
    : scrollY + triggerRect.top - gap - maxHeight

  return {
    top,
    left: scrollX + triggerRect.left,
    width: triggerRect.width,
    maxHeight,
    placement,
  }
}
