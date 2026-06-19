import React, { useState } from 'react';
import { Project, Agent, Log, Tab } from '../types';
import { 
  FolderOpen, 
  Cpu, 
  Zap, 
  ClipboardCheck, 
  Brain, 
  CheckCircle2, 
  GitCommit, 
  FileText, 
  Rocket, 
  ArrowUpRight, 
  Plus, 
  Check,
  Send,
  Sparkles,
  HelpCircle
} from 'lucide-react';

interface DashboardProps {
  projects: Project[];
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  agents: Agent[];
  setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
  logs: Log[];
  setLogs: React.Dispatch<React.SetStateAction<Log[]>>;
  setActiveTab: (tab: Tab) => void;
  onPostLog: (user: string, message: string, type: 'code' | 'doc' | 'system' | 'user') => void;
}

export default function Dashboard({
  projects,
  setProjects,
  agents,
  setAgents,
  logs,
  setLogs,
  setActiveTab,
  onPostLog
}: DashboardProps) {
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projName, setProjName] = useState('');
  const [projDesc, setProjDesc] = useState('');
  const [projSuggest, setProjSuggest] = useState('');

  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [agentActionPrompt, setAgentActionPrompt] = useState('');
  
  const [custLogText, setCustLogText] = useState('');
  const [custLogUser, setCustLogUser] = useState('我');

  // Add Project helper
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projName || !projDesc) return;
    
    const newProj: Project = {
      id: 'p-' + Date.now(),
      name: projName,
      description: projDesc,
      status: 'conducting',
      suggestion: projSuggest ? `AI 建议: ${projSuggest}` : 'AI 建议: 等待系统静态分析'
    };

    setProjects([newProj, ...projects]);
    onPostLog('首席研究员', `开启了新研发项目: ${projName}`, 'user');
    
    // reset
    setProjName('');
    setProjDesc('');
    setProjSuggest('');
    setNewProjectOpen(false);
  };

  // Switch agent status
  const toggleAgent = (id: string, currentStatus: 'active' | 'idle') => {
    setAgents(agents.map(a => {
      if (a.id === id) {
        const nextStatus = currentStatus === 'active' ? 'idle' : 'active';
        const nextTask = nextStatus === 'idle' ? '空闲' : '分析中...';
        
        onPostLog('系统', `AI 代理 [${a.name}] 状态切换为: ${nextStatus === 'active' ? '运行中' : '挂起停止'}`, 'system');
        return { ...a, status: nextStatus, task: nextTask };
      }
      return a;
    }));
  };

  const submitCustomLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!custLogText.trim()) return;
    onPostLog(custLogUser || '匿名研究员', custLogText, 'user');
    setCustLogText('');
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50/50">
      
      {/* Dynamic Statistics Cards */}
      <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 select-none">
        
        {/* Active Projects Card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-650">
              <FolderOpen className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold font-mono text-emerald-650 bg-emerald-50 px-2 py-0.5 rounded-full">
              +12%
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 font-sans">活跃项目</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight">{projects.filter(p => p.status === 'conducting').length + 22}</h3>
            <span className="text-xs text-slate-400 font-mono">个进行中</span>
          </div>
        </div>

        {/* Completed Core Tasks */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700">
              <Cpu className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-cyan-650 bg-cyan-50 px-2.5 py-0.5 rounded-full font-sans">
              完成
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 font-sans">AI 任务已完成</p>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight font-sans">1,284</h3>
            <span className="text-xs text-emerald-650 font-bold font-sans">已上线</span>
          </div>
        </div>

        {/* System Uptime */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-650">
              <Zap className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-indigo-650 bg-indigo-50 px-2 py-0.5 rounded-full font-sans">
              正常
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 font-sans">系统运行时间</p>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight font-sans">99.9%</h3>
            <span className="text-xs text-slate-400 font-mono">集群高可用</span>
          </div>
        </div>

        {/* Pending Review Queue */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm hover:shadow-md transition-all duration-200 group">
          <div className="flex justify-between items-start mb-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-orange-650 bg-orange-50 px-2 py-0.5 rounded-full font-sans">
              待办
            </span>
          </div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1 font-sans">待处理评审</p>
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-4xl font-extrabold text-slate-800 tracking-tight">18</h3>
            <span className="text-xs text-slate-400 font-mono">PR分析待确认</span>
          </div>
        </div>

      </section>

      {/* Grid Content Layout */}
      <div className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Cols: Recent Projects & Quick Project Creator */}
        <div className="lg:col-span-2 flex flex-col gap-6">

          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-slate-800">近期研发项目</h2>
              <p className="text-xs text-slate-500 mt-0.5">活跃的系统优化和数据重塑内核</p>
            </div>
            
            <button
              onClick={() => setNewProjectOpen(!newProjectOpen)}
              className="flex items-center gap-1.5 text-xs font-bold text-blue-650 bg-blue-50 hover:bg-blue-100/80 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              创建研发项目
            </button>
          </div>

          {/* Collapsible / Floating Create Form */}
          {newProjectOpen && (
            <form onSubmit={handleCreateProject} className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm flex flex-col gap-4 animate-fadeIn">
              <h3 className="text-xs font-bold text-blue-650 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="h-4 w-4" />
                新项目方案设计
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 font-mono">方案代号 (如 CodeEngine V3)</label>
                  <input
                    type="text"
                    required
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    placeholder="输入项目代号"
                    className="text-xs bg-slate-50 rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-500 font-mono">AI 引领建议 (可选)</label>
                  <input
                    type="text"
                    value={projSuggest}
                    onChange={(e) => setProjSuggest(e.target.value)}
                    placeholder="例如: 采用多播流进行链路分发"
                    className="text-xs bg-slate-50 rounded-xl border border-slate-200 px-3.5 py-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-500 font-mono">项目目标与功能定义</label>
                <textarea
                  required
                  rows={2}
                  value={projDesc}
                  onChange={(e) => setProjDesc(e.target.value)}
                  placeholder="简单描述此方案需解决的问题以及架构设计理念..."
                  className="text-xs bg-slate-50 rounded-xl border border-slate-200 p-3 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white resize-none"
                />
              </div>
              <div className="flex justify-end gap-2.5 mt-2">
                <button
                  type="button"
                  onClick={() => setNewProjectOpen(false)}
                  className="text-xs text-slate-500 px-4 py-2 hover:bg-slate-100 rounded-xl transition"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="text-xs font-bold text-white bg-blue-650 hover:bg-blue-700 px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer"
                >
                  确认启动
                </button>
              </div>
            </form>
          )}

          {/* Projects View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {projects.map((proj) => (
              <div 
                key={proj.id} 
                className="bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-slate-800 font-sans">{proj.name}</span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full ${
                      proj.status === 'conducting' 
                        ? 'bg-cyan-50 text-cyan-700' 
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {proj.status === 'conducting' ? '进行中' : '已归档'}
                    </span>
                  </div>

                  <p className="text-xs leading-relaxed text-slate-600 mb-4">{proj.description}</p>
                </div>

                <div className={`flex items-center gap-2 text-[11px] font-medium border-t border-slate-100 pt-3 ${
                  proj.status === 'conducting' ? 'text-blue-600' : 'text-slate-400'
                }`}>
                  {proj.status === 'conducting' ? (
                    <Brain className="h-4 w-4 text-blue-500 shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">{proj.suggestion}</span>
                </div>
              </div>
            ))}

            {/* Empty State / Quick Link */}
            <div className="border border-dashed border-slate-200 rounded-2xl p-5 flex flex-col justify-center items-center text-center bg-slate-50/20">
              <FolderOpen className="h-8 w-8 text-slate-300 mb-2" />
              <h4 className="text-xs font-bold text-slate-600">需要扩展更多子研发模块?</h4>
              <p className="text-[10px] text-slate-400 max-w-xs mt-1">您可以利用 Aether AI 实验功能, 自定义定义虚拟环境微服务</p>
              <button 
                onClick={() => setActiveTab('kanban')}
                className="text-[11px] font-bold text-blue-650 hover:underline mt-3"
              >
                去看板规划任务 &rarr;
              </button>
            </div>

          </div>

        </div>

        {/* Right 1 Col: Active AI Agents Manager */}
        <div className="flex flex-col gap-6">
          
          <div>
            <h2 className="text-lg font-bold text-slate-800">活跃 AI 代理</h2>
            <p className="text-xs text-slate-500 mt-0.5">多线程智能协同执行体反馈</p>
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm flex flex-col gap-4">
            
            {agents.map((agent) => (
              <div 
                key={agent.id} 
                className="flex items-center justify-between p-1 hover:bg-slate-50/50 rounded-xl transition"
              >
                <div className="flex items-center gap-3">
                  {/* Flashing Status indicator */}
                  <div className="relative">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                      agent.status === 'active' 
                        ? 'bg-blue-600' 
                        : 'bg-slate-350'
                    }`} />
                    {agent.status === 'active' && (
                      <span className="absolute -inset-0.5 rounded-full bg-blue-500/40 animate-ping" />
                    )}
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-800 font-sans">{agent.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">{agent.task}</p>
                  </div>
                </div>

                <button
                  onClick={() => toggleAgent(agent.id, agent.status)}
                  className={`text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition cursor-pointer ${
                    agent.status === 'active'
                      ? 'border-slate-200 text-slate-600 hover:bg-slate-100'
                      : 'border-blue-200 text-blue-650 hover:bg-blue-50 bg-blue-50/50'
                  }`}
                >
                  {agent.status === 'active' ? '暂停' : '重呼'}
                </button>
              </div>
            ))}

            <div className="mt-2 bg-gradient-to-r from-blue-50 to-indigo-50/50 p-3 rounded-xl border border-blue-50 flex items-start gap-2.5">
              <Sparkles className="h-4.5 w-4.5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <h5 className="text-[11px] font-bold text-blue-900">AI 助理活跃态</h5>
                <p className="text-[10px] leading-relaxed text-indigo-750 mt-0.5">
                  代码、监控和文档三大核心智能体已于后台挂载，将实时同步在 Kanban 和 Ops Center。
                </p>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Dynamic Team logs/activities Feed */}
      <section className="mt-10 flex flex-col gap-6">
        
        <div>
          <h2 className="text-lg font-bold text-slate-800">团队动态 & 实时运行流</h2>
          <p className="text-xs text-slate-500 mt-0.5">研发过程中的关键行为与发布周期记录</p>
        </div>

        <div className="rounded-2xl border border-slate-200/60 bg-white overflow-hidden shadow-sm">
          
          <div className="flex flex-col divide-y divide-slate-100">
            {logs.map((log) => {
              const fetchLogIcon = (icon: string) => {
                switch(icon) {
                  case 'commit': return <GitCommit className="h-4 w-4 text-blue-600" />;
                  case 'description': return <FileText className="h-4 w-4 text-cyan-700" />;
                  case 'rocket_launch': return <Rocket className="h-4 w-4 text-indigo-650" />;
                  default: return <Plus className="h-4 w-4 text-slate-600" />;
                }
              };

              const fetchBgColor = (icon: string) => {
                switch(icon) {
                  case 'commit': return 'bg-blue-50 border border-blue-100';
                  case 'description': return 'bg-cyan-50 border border-cyan-100';
                  case 'rocket_launch': return 'bg-indigo-50 border border-indigo-100';
                  default: return 'bg-slate-50 border border-slate-100';
                }
              };

              return (
                <div 
                  key={log.id} 
                  className="p-4.5 flex items-center gap-4 hover:bg-slate-50/30 transition animate-fadeIn"
                >
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${fetchBgColor(log.iconName)}`}>
                    {fetchLogIcon(log.iconName)}
                  </div>

                  <div className="flex-grow">
                    <p className="text-xs text-slate-700">
                      <span className="font-bold text-slate-800 pr-1.5">{log.user}</span> 
                      {log.action}
                      <span className={`pl-1 ${
                        log.type === 'code' ? 'text-blue-600 font-mono font-medium' :
                        log.type === 'doc' ? 'text-cyan-700 font-mono font-medium' :
                        'text-indigo-650 font-bold'
                      }`}> {log.detail}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.timestamp}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Custom Logging Input Form */}
          <form onSubmit={submitCustomLog} className="bg-slate-50 p-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-1.5 shrink-0 w-full sm:w-auto">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">署名:</span>
              <input 
                type="text" 
                value={custLogUser}
                onChange={(e) => setCustLogUser(e.target.value)}
                placeholder="我的称号" 
                className="text-xs bg-transparent border-none p-0 focus:ring-0 text-slate-700 w-24 font-bold"
              />
            </div>

            <div className="flex-grow flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-1.5 w-full">
              <input 
                type="text"
                required
                value={custLogText}
                onChange={(e) => setCustLogText(e.target.value)}
                placeholder="在此向团队流发送您对科研或部署的记录信息..."
                className="text-xs bg-transparent border-none p-1 focus:ring-0 text-slate-700 font-sans w-full"
              />
              <button 
                type="submit" 
                className="p-1.5 bg-blue-50 text-blue-650 hover:bg-blue-650 hover:text-white rounded-lg transition shrink-0 cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>
          </form>

        </div>

      </section>

    </div>
  );
}
