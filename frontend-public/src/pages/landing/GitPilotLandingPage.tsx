import {
  ArrowDownToLine,
  ArrowRight,
  Braces,
  CheckCircle2,
  Code2,
  FileCode2,
  FolderKanban,
  LaptopMinimal,
  Palette,
  Play,
  Sparkles,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '@/src/components/common/BrandMark'
import './GitPilotLandingPage.css'

const desktopDownloadUrl = '/downloads/gitpilot-desktop-windows-x64.exe'

/** Code 模式使用本地仓库和受控工具执行，展示任务到验证的闭环。 */
const CodeModePreview = () => (
  <div className="mode-preview mode-preview--code" aria-label="Code 模式工作台示意">
    <div className="preview-titlebar"><span className="preview-window-dot" /><b>GitPilot</b><span>Code / ai-club</span></div>
    <div className="code-preview-body">
      <aside><p>任务</p><strong>实现平台介绍页</strong><span>进行中</span><strong>修复发布权限</strong><span>已完成</span></aside>
      <div className="code-preview-chat">
        <p className="code-preview-label"><Sparkles /> GitPilot 正在执行</p>
        <h4>实现平台介绍页</h4>
        <p>我会先查看现有路由和页面样式，再新增一个不进入导航的公开页面。</p>
        <div><FileCode2 /> <span>读取</span><code>src/app/router.tsx</code><CheckCircle2 /></div>
        <div><Braces /> <span>修改</span><code>GitPilotLandingPage.tsx</code><Play /></div>
        <footer>继续补充要求，或按 Enter 发送 <kbd>Enter</kbd></footer>
      </div>
      <aside className="code-preview-run"><p>执行过程</p><b>读取项目结构</b><span>完成</span><b>编写介绍页</b><span>进行中</span><b>构建验证</b><span>等待</span></aside>
    </div>
  </div>
)

/** Work 模式将个人任务、团队事项与交付节奏收敛在独立工作空间。 */
const WorkModePreview = () => (
  <div className="mode-preview mode-preview--work" aria-label="Work 模式工作台示意">
    <div className="preview-titlebar"><span className="preview-window-dot" /><b>GitPilot</b><span>Work / 产品协作</span></div>
    <div className="work-preview-body">
      <aside><p>我的空间</p><b>本周重点</b><span className="work-preview-active">平台介绍页</span><span>发布准备</span><span>技术设计评审</span></aside>
      <div className="work-preview-main">
        <div className="work-preview-heading"><div><small>当前工作</small><h4>平台介绍页</h4></div><span>进行中</span></div>
        <p>梳理桌面端 Code、Work、Design 三种模式的价值与使用场景。</p>
        <div className="work-preview-check"><CheckCircle2 /> 明确页面信息架构 <b>完成</b></div>
        <div className="work-preview-check"><CheckCircle2 /> 组织三个模式的版式 <b>进行中</b></div>
        <div className="work-preview-comment"><span>刘畅</span><p>Design 模式需要强调可预览与持续修改。</p></div>
      </div>
    </div>
  </div>
)

/** Design 模式面向页面原型与设计规范，预览只展示受控的设计产出。 */
const DesignModePreview = () => (
  <div className="mode-preview mode-preview--design" aria-label="Design 模式工作台示意">
    <div className="preview-titlebar"><span className="preview-window-dot" /><b>GitPilot</b><span>Design / 产品介绍页</span></div>
    <div className="design-preview-body">
      <aside><p>页面</p><b>Landing page</b><span className="design-preview-active">首页</span><span>功能说明</span><span>下载页</span><p>规范</p><span>品牌色与字体</span></aside>
      <div className="design-preview-canvas">
        <div className="design-preview-topline"><span>Desktop</span><span>1280 px</span></div>
        <div className="design-preview-artboard">
          <span className="design-preview-logo">GitPilot</span>
          <div className="design-preview-hero-text"><b>Make work<br />move forward.</b><span>One workspace for your team.</span><i /></div>
          <div className="design-preview-window"><span /><span /><span /></div>
        </div>
      </div>
      <aside className="design-preview-inspector"><p>属性</p><b>Hero title</b><span>文字 / 64 px</span><div><i /><i /><i /></div><p>AI 设计</p><strong><Sparkles /> 生成中</strong></aside>
    </div>
  </div>
)

/** GitPilot 公开介绍页，仅通过固定链接访问，不挂载到产品导航。 */
export const GitPilotLandingPage = () => {
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
          <p className="gitpilot-landing__eyebrow">GitPilot Desktop <span /> Windows</p>
          <h1>一个桌面端<br />三种工作方式</h1>
          <p>GitPilot Desktop 将代码任务、团队工作和界面设计置于各自清晰的工作模式中，让 Agent 在正确的上下文里持续推进。</p>
          <div className="gitpilot-landing__actions">
            <a className="gitpilot-landing__button gitpilot-landing__button--primary" href={desktopDownloadUrl} download><ArrowDownToLine /> 下载 Windows 桌面端</a>
            <Link className="gitpilot-landing__button gitpilot-landing__button--secondary" to="/register">进入 GitPilot Web <ArrowRight /></Link>
          </div>
        </section>

        <section className="gitpilot-landing__mode-intro">
          <p>三种模式，共用一个 GitPilot</p>
          <div><span>01 Code</span><span>02 Work</span><span>03 Design</span></div>
        </section>

        <section className="gitpilot-landing__mode gitpilot-landing__mode--code">
          <div className="gitpilot-landing__mode-copy">
            <p className="gitpilot-landing__mode-index"><Code2 /> 01 / Code</p>
            <h2>在本地项目里<br />完成真实编码任务</h2>
            <p>Code 是面向仓库的 Agent 工作台。它围绕一项任务组织会话、工具调用和验证结果，让每一步代码改动都清楚可见。</p>
            <ul><li>多会话与流式任务执行</li><li>读取、编辑、命令、验证各自归位</li><li>本地项目与受控执行边界</li></ul>
          </div>
          <CodeModePreview />
        </section>

        <section className="gitpilot-landing__mode gitpilot-landing__mode--work">
          <WorkModePreview />
          <div className="gitpilot-landing__mode-copy">
            <p className="gitpilot-landing__mode-index"><FolderKanban /> 02 / Work</p>
            <h2>让任务、协作和成果<br />在一个空间里推进</h2>
            <p>Work 是与团队工作节奏对齐的独立空间。你可以围绕事项组织材料、计划和讨论，再把明确的下一步交给 Agent 或协作者。</p>
            <ul><li>任务与阶段性成果集中管理</li><li>团队讨论直接关联当前工作</li><li>与 GitPilot Web 项目协作保持衔接</li></ul>
          </div>
        </section>

        <section className="gitpilot-landing__mode gitpilot-landing__mode--design">
          <div className="gitpilot-landing__mode-copy">
            <p className="gitpilot-landing__mode-index"><Palette /> 03 / Design</p>
            <h2>用对话持续打磨<br />可运行的界面原型</h2>
            <p>Design 将需求转化为可预览的页面修订。它让设计规范、页面版本和 AI 的修改过程保持在同一个项目上下文中。</p>
            <ul><li>自然语言驱动页面与组件设计</li><li>桌面与移动端原型预览</li><li>修订版本与项目设计规范沉淀</li></ul>
          </div>
          <DesignModePreview />
        </section>

        <section className="gitpilot-landing__final-cta">
          <LaptopMinimal />
          <h2>从你的下一项工作开始</h2>
          <p>现在提供 Windows 版 GitPilot Desktop。</p>
          <a className="gitpilot-landing__button gitpilot-landing__button--primary" href={desktopDownloadUrl} download><ArrowDownToLine /> 下载 Windows 桌面端</a>
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
