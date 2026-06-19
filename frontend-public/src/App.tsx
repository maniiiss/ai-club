import React, { useState } from 'react';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import AILab from './components/AILab';
import KanbanBoard from './components/KanbanBoard';
import OpsCenter from './components/OpsCenter';
import { Tab, Project, Agent, Log, Task, Recommendation } from './types';
import { 
  initialProjects, 
  initialAgents, 
  initialLogs, 
  initialTasks, 
  initialRecommendations 
} from './data';
import { 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  X, 
  CheckCircle, 
  ChevronRight,
  PlusCircle,
  Code2,
  FolderLock
} from 'lucide-react';

export default function App() {
  // Global Orcherstrated States
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [logs, setLogs] = useState<Log[]>(initialLogs);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(initialRecommendations);
  const [unreadCount, setUnreadCount] = useState(2);

  // AI Assistant side drawer chat simulator
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([
    {
      sender: 'ai',
      text: '您好, 首席研究员。我是 Aether R&D 自主微型大模型服务智能体。我可以帮您推演白板规划、生成 IEEE 标准要求规整，或者自动重构 Staging 容器时延运维指标。',
      time: '自适应计算就绪'
    }
  ]);

  // Global Log generator
  const handleAddNewLog = (user: string, action: string, type: 'code' | 'doc' | 'system' | 'user') => {
    const newLog: Log = {
      id: 'l-' + Date.now(),
      user: user,
      action: action.includes(' ') ? action.split(' ')[0] : action,
      detail: action.includes(' ') ? action.split(' ').slice(1).join(' ') : '操作完成',
      timestamp: '刚刚',
      iconName: type === 'code' ? 'commit' : type === 'doc' ? 'description' : type === 'system' ? 'rocket_launch' : 'plus',
      type: type
    };
    setLogs([newLog, ...logs]);
  };

  // Chat message submission matching smart helper intents
  const handleSendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = {
      sender: 'user',
      text: chatInput,
      time: '刚刚'
    };

    setChatMessages(prev => [...prev, userMsg]);
    const normalizedInput = chatInput.toLowerCase();
    setChatInput('');

    // Trigger cool simulated AI responses based on matching intents
    setTimeout(() => {
      let responseText = '收到分析指标，我正在全网对比 Aether 数据库。请问需要我以此生成测试用例并挂载至 CI/CD 看板吗？';
      let actionHook: (() => void) | undefined = undefined;

      if (normalizedInput.includes('kanban') || normalizedInput.includes('任务') || normalizedInput.includes('看板')) {
        responseText = '已检测到看板关键字。我可以在 Kanban Board 泳道中为您自动分配新任务: [优化 WebGL 顶点渲染着色器]。需要我帮您创建并指派首发研发卡片吗？';
        actionHook = () => {
          const newTask: Task = {
            id: 't-ai-' + Date.now(),
            title: '优化 WebGL 顶点渲染着色器',
            category: 'Frontend',
            priority: 'high',
            status: 'todo',
            commentsCount: 0,
            assigneeAvatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZS6iipjm5ymTV4hDYZpZxYKnMGmJ1ja77wOedUCC7mgYzma2GDqhBsQtf7m3ZFwjLLJ5PaEFm5pIB5mLfkMlXO__3dBO5Ueze8v-io5ipWXkFKp2Y8G79UOm4_F8X-tFFviC1c42FR6NPDGlSeOs1RGLEnUWzKzQdpbnwEjNR-_2K0AJ5YKGM6RUKzx0vxabynHWY9NGd4_jo_GDYc6E-J2MHHjJ5vJzn__zMje3M97b2iIUUpALQrztu-7CKfNeH0ZlVBrx01n8',
            checklists: [
              { id: 'ch1', text: '整理着色器 WebGL 代码', completed: false },
              { id: 'ch2', text: '通过 Aether 神经模拟验证', completed: true }
            ]
          };
          setTasks([newTask, ...tasks]);
          handleAddNewLog('AI 助理', '在 Kanban 看板中挂架了优化着色器卡片', 'code');
        };
      } else if (normalizedInput.includes('ops') || normalizedInput.includes('运维') || normalizedInput.includes('监控')) {
        responseText = '已捕捉到基础设施需求。当前 Ops Center 的 CPU 使用率为 78%，存在 2 项推荐优化。需要我现在帮您对 Redis 进行自动物理重组分片，从而将全球平均响应时延压低 14ms 吗？';
        actionHook = () => {
          // Apply optimization
          setRecommendations(recommendations.map(r => ({ ...r, applied: true })));
          handleAddNewLog('AI 助理', '触发 Redis 极致物理重组分片，降低集群负载', 'system');
        };
      } else if (normalizedInput.includes('labs') || normalizedInput.includes('需求') || normalizedInput.includes('biometrics')) {
        responseText = '已激活 Labs 架构重构分析：Apple FaceID 和 Android BiometricPrompt 已分析就绪。建议使用 WebAuthn 原生跨端安全回调库，时延能稳定压缩在 300ms 以内。您现在可以切换到 Labs 进行草稿校验。';
      }

      setChatMessages(prev => [...prev, {
        sender: 'ai',
        text: responseText,
        time: '自适应计算就绪',
        action: actionHook ? { label: '套用该 AI 建议方案', execute: actionHook } : undefined
      }]);
    }, 1500);
  };

  return (
    <div className="min-h-screen flex flex-col font-sans select-none antialiased bg-slate-50/20">
      
      {/* Shared top Navigation Header */}
      <Header 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        onLaunchAssistant={() => setAssistantOpen(!assistantOpen)}
        unreadCount={unreadCount}
        setUnreadCount={setUnreadCount}
      />

      {/* Primary Dynamic Tab Page Render Stage */}
      <main className="flex-grow w-full max-w-7xl mx-auto px-6 md:px-10 py-8 flex flex-col">
        {activeTab === 'dashboard' && (
          <Dashboard 
            projects={projects} 
            setProjects={setProjects}
            agents={agents}
            setAgents={setAgents}
            logs={logs}
            setLogs={setLogs}
            setActiveTab={setActiveTab}
            onPostLog={handleAddNewLog}
          />
        )}

        {activeTab === 'labs' && (
          <AILab onPostLog={handleAddNewLog} />
        )}

        {activeTab === 'kanban' && (
          <KanbanBoard 
            tasks={tasks}
            setTasks={setTasks}
            onPostLog={handleAddNewLog}
          />
        )}

        {activeTab === 'ops' && (
          <OpsCenter 
            recommendations={recommendations}
            setRecommendations={setRecommendations}
            onPostLog={handleAddNewLog}
          />
        )}

        {/* Modular Documentation View (Docs) */}
        {activeTab === 'docs' && (
          <div className="flex-1 bg-white border border-slate-200/60 rounded-3xl p-8 shadow-sm flex flex-col">
            <h1 className="text-xl font-bold text-slate-800 tracking-tight font-sans mb-2">研发核心规范文档集 (Docs Center)</h1>
            <p className="text-xs text-slate-500 mb-6">Aether R&D 高等人工智能协同研发操作指南及技术白皮书。</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              <div className="border border-slate-150 rounded-2xl p-5 flex flex-col gap-3.5">
                <span className="text-[10px] font-extrabold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-md w-fit font-mono">规范章程 01</span>
                <h3 className="text-xs font-bold text-slate-800 font-sans">研发体系高可靠与容灾规范</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium">
                  所有新规划在 Agile Engine 看板中的微服务或关键模块，必须搭载全生命周期自动化 CI/CD 管线。单元测试 (Jest) 以及端到端单元测试 (Cypress) 必须 100% 通过后才能同步至 Staging 预发布集群进行热部署重载。
                </p>
              </div>

              <div className="border border-slate-150 rounded-2xl p-5 flex flex-col gap-3.5">
                <span className="text-[10px] font-extrabold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-md w-fit font-mono">规范章程 02</span>
                <h3 className="text-xs font-bold text-slate-800 font-sans">AI 翻译与架构转换安全阈值</h3>
                <p className="text-xs text-slate-600 leading-relaxed font-sans font-medium">
                  为确保生体验证（如 FaceID）以及分布式大表并发查询时不会引发物理时延雪崩，系统底层时延上限锁死在 300ms 以内。在此设计标准下，研发人员在 Labs 中编辑的任何草稿规范将直接受到 Aether Standardizer 自愈核准检验。
                </p>
              </div>

            </div>

            <div className="mt-10 p-6 bg-slate-50 rounded-2xl border border-slate-150 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800">对规范仍有疑问?</h4>
                <p className="text-xs text-slate-500 mt-1">您可以一键激活右下角 Aether 智能助理，即刻针对所有 API 协议与架构章程进行现场检索。</p>
              </div>
              
              <button 
                onClick={() => setAssistantOpen(true)}
                className="text-xs font-bold text-white bg-blue-650 hover:bg-blue-700 px-4.5 py-2.5 rounded-xl shadow cursor-pointer transition shrink-0"
              >
                在侧板咨询 Aether
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Global Brand Footer Segment */}
      <footer className="w-full py-12 px-10 border-t border-slate-200/50 bg-slate-50 select-none flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-extrabold text-blue-650 font-sans flex items-center gap-1">Aether R&D Dashboard</span>
        </div>
        <p className="text-xs text-slate-400 font-medium">
          © 2024 Aether Labs. Powered by NextGen AI.
        </p>
        <div className="flex gap-4">
          <a href="#" className="text-xs text-slate-400 hover:text-blue-600 underline font-medium">Privacy Policy</a>
          <a href="#" className="text-xs text-slate-400 hover:text-blue-600 underline font-medium">Terms of Service</a>
          <a href="#" className="text-xs text-slate-400 hover:text-blue-600 underline font-medium">R&D Manifesto</a>
        </div>
      </footer>

      {/* Floating AI Assistant Chat side drawer */}
      {assistantOpen && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-[380px] bg-white border-l border-slate-200/60 shadow-2xl z-50 flex flex-col animate-slideLeft">
          
          {/* Drawer Header details */}
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
            <div className="flex items-center gap-2.5">
              <div className="h-10 w-10 rounded-xl bg-blue-105 text-blue-650 flex items-center justify-center relative">
                <Bot className="h-5 w-5 animate-bounce" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
              </div>

              <div>
                <h3 className="text-xs font-bold text-slate-800">Aether 自主微核智能助理</h3>
                <span className="text-[10px] text-slate-400 font-mono">微服务协同计算模型</span>
              </div>
            </div>

            <button 
              onClick={() => setAssistantOpen(false)}
              className="p-1.5 hover:bg-slate-250 rounded-xl text-slate-400 hover:text-slate-700 transition cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </div>

          {/* Quick instructions hint */}
          <div className="bg-blue-50/50 p-3.5 border-b border-blue-50 flex flex-col gap-1 select-none">
            <span className="text-[10px] font-bold text-blue-800 font-mono">✨ 快捷提示：</span>
            <p className="text-[10px] text-indigo-750 leading-relaxed font-sans">
              输入 "<span className="font-bold underline text-blue-650">kanban</span>" 体验智能卡片创建；输入 "<span className="font-bold underline text-blue-650">ops</span>" 指挥缓存优化；或随时咨询生体验证机制。
            </p>
          </div>

          {/* Messages block viewport info */}
          <div className="flex-grow overflow-y-auto p-4.5 flex flex-col gap-4">
            {chatMessages.map((msg, index) => (
              <div 
                key={index} 
                className={`flex gap-2.5 items-start ${msg.sender === 'user' ? 'justify-end' : ''}`}
              >
                {msg.sender === 'ai' && (
                  <div className="h-7 w-7 rounded-lg bg-blue-100 text-blue-650 flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                )}

                <div className={`flex flex-col gap-1.5 max-w-[80%] ${msg.sender === 'user' ? 'items-end' : ''}`}>
                  <div className={`p-3.5 rounded-2xl text-[11px] leading-relaxed font-sans ${
                    msg.sender === 'user' 
                      ? 'bg-blue-650 text-white rounded-tr-none shadow-sm' 
                      : 'bg-slate-100 text-slate-700 rounded-tl-none'
                  }`}>
                    {msg.text}

                    {/* Quick simulated recommendation hook action */}
                    {msg.action && (
                      <button
                        onClick={() => {
                          msg.action.execute();
                          setChatMessages(prev => [...prev, {
                            sender: 'ai',
                            text: `🎉 Aether System: 成功套用该 AI 建议。您可以在对应的 ${activeTab === 'kanban' ? 'Kanban 看板' : 'Ops 监控中心'} 看到相应实体状态已无痕更新！`,
                            time: '自适应计算就绪'
                          }]);
                        }}
                        className="mt-3.5 w-full text-center bg-white text-blue-650 hover:bg-slate-50 py-2 rounded-lg font-bold transition shadow-sm select-none cursor-pointer border border-slate-200"
                      >
                        {msg.action.label}
                      </button>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono pl-1">{msg.time}</span>
                </div>

                {msg.sender === 'user' && (
                  <div className="h-7 w-7 rounded-lg bg-slate-200 text-slate-700 font-mono text-[10px] font-bold flex items-center justify-center shrink-0">
                    我
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Message query submit box */}
          <form onSubmit={handleSendChatMessage} className="p-3 border-t border-slate-100 flex gap-2">
            <input 
              type="text" 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="向 Aether 助理输入您的想法指令..."
              className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 flex-grow focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500"
            />
            <button 
              type="submit" 
              className="p-2.5 bg-blue-650 text-white hover:bg-blue-700 rounded-xl transition shadow shadow-blue-500/10 cursor-pointer shrink-0"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

        </div>
      )}

    </div>
  );
}
