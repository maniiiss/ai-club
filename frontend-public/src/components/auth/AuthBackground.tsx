/**
 * 认证页动态背景。
 * 用 Git 分支路径承载项目上下文，用沿路径移动的微光表达 AI 正在协作，
 * 该组件只负责视觉装饰，不参与认证交互，也不阻挡表单事件。
 */
export const AuthBackground = () => {
  return (
    <div
      className="auth-background"
      data-auth-background
      aria-hidden="true"
    >
      <div className="auth-background-grid" />
      <svg
        className="auth-background-art"
        viewBox="0 0 1600 1000"
        preserveAspectRatio="none"
        role="presentation"
      >
        <defs>
          <linearGradient id="auth-route-main" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="var(--auth-route-orange)" stopOpacity="0.16" />
            <stop offset="0.42" stopColor="var(--auth-route-orange)" stopOpacity="0.98" />
            <stop offset="1" stopColor="var(--auth-route-blue)" stopOpacity="0.94" />
          </linearGradient>
          <linearGradient id="auth-route-secondary" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--auth-route-teal)" stopOpacity="0.14" />
            <stop offset="0.55" stopColor="var(--auth-route-teal)" stopOpacity="0.86" />
            <stop offset="1" stopColor="var(--auth-route-blue)" stopOpacity="0.78" />
          </linearGradient>
          <filter id="auth-node-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="9" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path
          id="git-branch-route-main"
          className="git-branch-route git-branch-route--main"
          d="M-80 880C180 850 220 700 420 680C640 658 650 470 850 450C1110 424 1100 220 1710 140"
          stroke="url(#auth-route-main)"
        />
        <path
          id="git-branch-route-secondary"
          className="git-branch-route git-branch-route--secondary"
          d="M-60 280C220 260 250 420 480 430C710 440 780 630 1020 620C1250 610 1290 760 1660 790"
          stroke="url(#auth-route-secondary)"
        />
        <path
          id="git-branch-route-spur"
          className="git-branch-route git-branch-route--spur"
          d="M410 682C560 730 590 830 760 850C930 870 980 780 1020 620"
          stroke="var(--auth-route-soft)"
        />

        <g className="auth-background-node" filter="url(#auth-node-glow)">
          <circle cx="420" cy="680" r="8" fill="var(--auth-route-orange)" />
          <circle cx="850" cy="450" r="7" fill="var(--auth-route-teal)" />
          <circle cx="1020" cy="620" r="8" fill="var(--auth-route-blue)" />
          <circle cx="760" cy="850" r="6" fill="var(--auth-route-teal)" />
        </g>

        <g className="auth-background-spark" fill="none" stroke="var(--auth-route-soft)" strokeLinecap="round">
          <path d="M1160 170l5 15 15 5-15 5-5 15-5-15-15-5 15-5 5-15z" />
          <path d="M1320 520l3 9 9 3-9 3-3 9-3-9-9-3 9-3 3-9z" />
        </g>
      </svg>

      <span className="auth-background-particle auth-background-particle--one" />
      <span className="auth-background-particle auth-background-particle--two" />
      <span className="auth-background-particle auth-background-particle--three" />
      <span className="auth-background-particle auth-background-particle--four" />
    </div>
  )
}
