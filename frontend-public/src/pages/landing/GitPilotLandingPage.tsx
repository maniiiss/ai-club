import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Bot,
  ClipboardList,
  Code2,
  FolderKanban,
  LayoutDashboard,
  LaptopMinimal,
  Palette,
  Rocket,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchLatestDesktopRelease } from '@/src/api/desktop-release'
import { BrandMark } from '@/src/components/common/BrandMark'
import { formatDesktopArtifactSize, selectDesktopInstaller } from '@/src/lib/desktop-release'
import type { DesktopReleaseLatest } from '@/src/types/desktop-release'
import './GitPilotLandingPage.css'

/**
 * 业务意图：宣传页展示桌面端真实工作台截图，让用户看到实际产品而不是抽象示意图。
 * Work 与 Design 的截图先保留在页面中，并通过状态文案明确标记为开发中。
 */
const ModeScreenshot = ({
  src,
  alt,
  mode,
  status,
}: {
  src: string
  alt: string
  mode: 'code' | 'work' | 'design'
  status?: string
}) => (
  <figure className={`mode-preview mode-preview--${mode} mode-preview--screenshot`}>
    <img className="mode-preview__image" src={src} alt={alt} loading="lazy" decoding="async" />
    {status && <figcaption className="mode-preview__status">{status}</figcaption>}
  </figure>
)

/**
 * 业务意图：用 Web 端能力卡片补齐公众端产品叙事，说明桌面端之外的团队协作与交付入口。
 */
const WebFeatureCard = ({ icon: Icon, eyebrow, title, description }: {
  icon: LucideIcon
  eyebrow: string
  title: string
  description: string
}) => (
  <article className="gitpilot-landing__web-card">
    <div className="gitpilot-landing__web-card-icon"><Icon /></div>
    <p>{eyebrow}</p>
    <h3>{title}</h3>
    <span>{description}</span>
  </article>
)

/** GitPilot 公开介绍页，仅通过固定链接访问，不挂载到产品导航。 */
export const GitPilotLandingPage = () => {
  const [release, setRelease] = useState<DesktopReleaseLatest | null>(null)
  const [releaseLoading, setReleaseLoading] = useState(true)
  const [releaseError, setReleaseError] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetchLatestDesktopRelease()
      .then((latest) => { if (!cancelled) setRelease(latest) })
      .catch(() => { if (!cancelled) setReleaseError(true) })
      .finally(() => { if (!cancelled) setReleaseLoading(false) })
    return () => { cancelled = true }
  }, [])
  const nsisInstaller = release ? selectDesktopInstaller(release.installers, 'nsis') : null
  const msiInstaller = release ? selectDesktopInstaller(release.installers, 'msi') : null
  const downloadUrl = nsisInstaller?.downloadUrl ?? msiInstaller?.downloadUrl ?? null
  const downloadLabel = release ? `下载 Windows 版 v${release.version}` : '下载 Windows 桌面端'
  return (
    <div className="gitpilot-landing">
      <header className="gitpilot-landing__nav">
        <Link className="gitpilot-landing__brand" to="/gitpilot" aria-label="GitPilot 介绍页">
          <BrandMark className="h-8 w-8 rounded-lg" />
          <span>GitPilot</span>
        </Link>
      </header>

      <main>
        <section className="gitpilot-landing__hero">
          <p className="gitpilot-landing__eyebrow">GitPilot <span /> Desktop + Web</p>
          <h1>桌面端与 Web 端<br />协同完成每一项工作</h1>
          <p>GitPilot 用 Web 端承接团队协作与项目交付，再用桌面端的 Code、Work、Design 模式把工作推进到更深处。</p>
          <div className="gitpilot-landing__actions">
            <a className={`gitpilot-landing__button gitpilot-landing__button--primary ${!downloadUrl ? 'is-disabled' : ''}`} href={downloadUrl ?? '#'} download={!downloadUrl ? undefined : true} onClick={(event) => { if (!downloadUrl) event.preventDefault() }}><ArrowDownToLine /> {downloadLabel}</a>
            <Link className="gitpilot-landing__button gitpilot-landing__button--secondary" to="/register">进入 GitPilot Web <ArrowRight /></Link>
          </div>
          <DesktopReleaseSummary loading={releaseLoading} error={releaseError} release={release} nsisInstaller={nsisInstaller} msiInstaller={msiInstaller} />
        </section>

        <section className="gitpilot-landing__mode-intro">
          <p>一个 GitPilot，连接 Web 与 Desktop</p>
          <div><span>01 Code</span><span>02 Work <em>开发中</em></span><span>03 Design <em>开发中</em></span></div>
        </section>

        <section className="gitpilot-landing__web">
          <div className="gitpilot-landing__web-copy">
            <p className="gitpilot-landing__mode-index"><LayoutDashboard /> Web / 公众端</p>
            <h2>团队协作与项目交付<br />在 Web 端一站完成</h2>
            <p>无需安装，登录 Web 端即可管理项目、组织需求、沉淀知识、跟进开发测试，并通过 GitPilot 助手获得有上下文的 AI 支持。</p>
            <div className="gitpilot-landing__web-note"><span /> 随时打开，团队共享同一份进展</div>
          </div>
          <div className="gitpilot-landing__web-grid">
            <WebFeatureCard icon={FolderKanban} eyebrow="Workspace" title="工作台与项目" description="查看项目概览、成员、动态和关键进展，快速进入正在推进的工作。" />
            <WebFeatureCard icon={ClipboardList} eyebrow="Plan" title="需求与规划" description="管理需求、迭代和工作项，明确负责人、优先级、计划日期与协作关系。" />
            <WebFeatureCard icon={BookOpen} eyebrow="Knowledge" title="知识库与聊天室" description="把项目文档、经验资料和团队讨论放在同一个可检索的上下文里。" />
            <WebFeatureCard icon={Bot} eyebrow="Assistant" title="GitPilot AI 助手" description="结合当前项目与页面上下文回答问题，辅助总结、分析，并在写入前请求确认。" />
            <WebFeatureCard icon={Code2} eyebrow="Delivery" title="开发、测试与执行" description="连接代码结构、测试计划和执行中心，让需求到验证的过程可追踪。" />
            <WebFeatureCard icon={Rocket} eyebrow="Release" title="发布与设计版本" description="管理发布流程和设计版本，让交付结果、界面方案与项目历史持续沉淀。" />
          </div>
        </section>

        <section className="gitpilot-landing__mode gitpilot-landing__mode--code">
          <div className="gitpilot-landing__mode-copy">
            <p className="gitpilot-landing__mode-index"><Code2 /> 01 / Code</p>
            <h2>在本地项目里<br />完成真实编码任务</h2>
            <p>Code 是面向仓库的 Agent 工作台。它围绕一项任务组织会话、工具调用和验证结果，让每一步代码改动都清楚可见。</p>
            <ul><li>多会话与流式任务执行</li><li>读取、编辑、命令、验证各自归位</li><li>本地项目与受控执行边界</li></ul>
          </div>
          <ModeScreenshot mode="code" src="/gitpilot-code-mode.png" alt="GitPilot Code 模式真实工作台截图" />
        </section>

        <section className="gitpilot-landing__mode gitpilot-landing__mode--work">
          <ModeScreenshot mode="work" src="/gitpilot-work-mode.png" alt="GitPilot Work 模式真实工作台截图（开发中）" status="Work 模式开发中" />
          <div className="gitpilot-landing__mode-copy">
            <p className="gitpilot-landing__mode-index"><FolderKanban /> 02 / Work <span className="gitpilot-landing__mode-status">开发中</span></p>
            <h2>让任务、协作和成果<br />在一个空间里推进</h2>
            <p>Work 是与团队工作节奏对齐的独立空间，目前正在开发中。你可以围绕事项组织材料、计划和讨论，再把明确的下一步交给 Agent 或协作者。</p>
            <ul><li>任务与阶段性成果集中管理</li><li>团队讨论直接关联当前工作</li><li>与 GitPilot Web 项目协作保持衔接</li></ul>
          </div>
        </section>

        <section className="gitpilot-landing__mode gitpilot-landing__mode--design">
          <div className="gitpilot-landing__mode-copy">
            <p className="gitpilot-landing__mode-index"><Palette /> 03 / Design <span className="gitpilot-landing__mode-status">开发中</span></p>
            <h2>用对话持续打磨<br />可运行的界面原型</h2>
            <p>Design 将需求转化为可预览的页面修订，目前正在开发中。它让设计规范、页面版本和 AI 的修改过程保持在同一个项目上下文中。</p>
            <ul><li>自然语言驱动页面与组件设计</li><li>桌面与移动端原型预览</li><li>修订版本与项目设计规范沉淀</li></ul>
          </div>
          <ModeScreenshot mode="design" src="/gitpilot-design-mode.png" alt="GitPilot Design 模式真实工作台截图（开发中）" status="Design 模式开发中" />
        </section>

        <section className="gitpilot-landing__final-cta">
          <LaptopMinimal />
          <h2>从你的下一项工作开始</h2>
          <p>现在提供 Windows 版 GitPilot Desktop。</p>
          <a className={`gitpilot-landing__button gitpilot-landing__button--primary ${!downloadUrl ? 'is-disabled' : ''}`} href={downloadUrl ?? '#'} download={!downloadUrl ? undefined : true} onClick={(event) => { if (!downloadUrl) event.preventDefault() }}><ArrowDownToLine /> {downloadLabel}</a>
        </section>
      </main>

      <footer className="gitpilot-landing__footer">
        <div><BrandMark className="h-6 w-6 rounded-md" /><span>GitPilot</span></div>
        <span>AI 驱动的研发协作平台</span>
        <span>&copy; {new Date().getFullYear()} GitPilot</span>
      </footer>
    </div>
  )
}

function DesktopReleaseSummary({ loading, error, release, nsisInstaller, msiInstaller }: { loading: boolean; error: boolean; release: DesktopReleaseLatest | null; nsisInstaller: ReturnType<typeof selectDesktopInstaller>; msiInstaller: ReturnType<typeof selectDesktopInstaller> }) {
  if (loading) return <div className="gitpilot-landing__release-summary is-loading" aria-live="polite">正在读取最新稳定版…</div>
  if (error || !release) return <div className="gitpilot-landing__release-summary is-muted" aria-live="polite">当前暂无可下载的 Windows stable 版本，请稍后再试。</div>
  return <div className="gitpilot-landing__release-summary" aria-label="最新 Windows stable 版本">
    <div className="gitpilot-landing__release-summary-head"><span className="gitpilot-landing__release-kicker">最新 stable</span><strong>v{release.version}</strong><span>{releaseDateLabel(release.publishedAt)}</span></div>
    <div className="gitpilot-landing__release-links">
      {nsisInstaller && <a href={nsisInstaller.downloadUrl} download>NSIS 安装包 <small>{formatDesktopArtifactSize(nsisInstaller.fileSize)}</small></a>}
      {msiInstaller && <a href={msiInstaller.downloadUrl} download>MSI 备用包 <small>{formatDesktopArtifactSize(msiInstaller.fileSize)}</small></a>}
    </div>
    <div className="gitpilot-landing__release-checksum"><span>SHA-256</span><code>{(nsisInstaller ?? msiInstaller)?.sha256}</code></div>
  </div>
}

function releaseDateLabel(value: string | null): string {
  if (!value) return '待定日期'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('zh-CN', { dateStyle: 'medium' })
}
