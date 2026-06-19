import React, { useState } from 'react';
import { Task } from '../types';
import { 
  Kanban, 
  MessageSquare, 
  GitCommit, 
  User, 
  Plus, 
  Filter, 
  ChevronUp, 
  ChevronRight, 
  ChevronLeft,
  ChevronDown, 
  PlayCircle,
  Copy,
  Check,
  Terminal,
  GitBranch,
  ClipboardCheck,
  Sparkles,
  Award
} from 'lucide-react';
import { AVATAR_LEAD, AVATAR_MEMBER_1, AVATAR_MEMBER_2, AVATAR_MEMBER_3 } from '../data';

interface KanbanBoardProps {
  tasks: Task[];
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onPostLog: (user: string, message: string, type: 'code' | 'doc' | 'system' | 'user') => void;
}

export default function KanbanBoard({
  tasks,
  setTasks,
  onPostLog
}: KanbanBoardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCate, setTaskCate] = useState('Frontend');
  const [taskPrio, setTaskPrio] = useState<'low' | 'medium' | 'high'>('medium');
  const [taskStatus, setTaskStatus] = useState<'todo' | 'inprogress' | 'review'>('todo');

  const [codeCopied, setCodeCopied] = useState(false);

  // CI/CD Simulator
  const [cypressProgress, setCypressProgress] = useState(18);
  const [cypressFinished, setCypressFinished] = useState(false);
  const [bundleSizeState, setBundleSizeState] = useState<'Waiting' | 'Compressing' | 'Passed'>('Waiting');

  // Multi-avatars showcase list
  const activeMembers = [
    AVATAR_LEAD,
    AVATAR_MEMBER_1,
    AVATAR_MEMBER_2,
    AVATAR_MEMBER_3
  ];

  const handleCopyCode = () => {
    const code = `const determineNavState = (path) => {
  if (path.includes('/kanban')) {
    return 'Kanban';
  }
  /* AI Suggested Fallback */
  return SemanticMatcher.analyze(path);
};`;
    navigator.clipboard.writeText(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // Move task across lanes
  const moveTask = (id: string, dir: 'left' | 'right') => {
    setTasks(prevTasks => prevTasks.map(task => {
      if (task.id === id) {
        let nextStatus: 'todo' | 'inprogress' | 'review' = task.status;
        if (task.status === 'todo' && dir === 'right') nextStatus = 'inprogress';
        else if (task.status === 'inprogress' && dir === 'left') nextStatus = 'todo';
        else if (task.status === 'inprogress' && dir === 'right') nextStatus = 'review';
        else if (task.status === 'review' && dir === 'left') nextStatus = 'inprogress';
        
        onPostLog('首席研究员', `将 Kanban 任务 [${task.title}] 移动到 [${
          nextStatus === 'todo' ? '待开发' : nextStatus === 'inprogress' ? '开发中' : '代码审查'
        }]`, 'user');

        return { ...task, status: nextStatus };
      }
      return task;
    }));
  };

  // Toggle checklist subtasks
  const toggleSubtask = (taskId: string, subId: string) => {
    setTasks(prevTasks => prevTasks.map(task => {
      if (task.id === taskId && task.checklists) {
        const updatedCheck = task.checklists.map(sub => {
          if (sub.id === subId) {
            const nextVal = !sub.completed;
            onPostLog('系统', `${nextVal ? '完成' : '取消'}代码子任务 [${sub.text}]`, 'system');
            return { ...sub, completed: nextVal };
          }
          return sub;
        });
        return { ...task, checklists: updatedCheck };
      }
      return task;
    }));
  };

  // Create task helper
  const handleAddNewTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;

    const newTask: Task = {
      id: 't-' + Date.now(),
      title: taskTitle,
      category: taskCate,
      priority: taskPrio,
      status: taskStatus,
      commentsCount: 0,
      assigneeAvatar: activeMembers[Math.floor(Math.random() * activeMembers.length)]
    };

    setTasks([...tasks, newTask]);
    onPostLog('首席研究员', `规划了新科研白板工作: ${taskTitle}`, 'user');
    
    // reset
    setTaskTitle('');
    setCreateOpen(false);
  };

  // Simulate Cypress CI completion
  const triggerCypressComplete = () => {
    if (cypressFinished) return;
    setCypressProgress(24);
    setCypressFinished(true);
    setBundleSizeState('Compressing');
    onPostLog('系统', '[CI/CD] Cypress Integration tests successfully completed! (24/24 passed)', 'system');

    setTimeout(() => {
      setBundleSizeState('Passed');
      onPostLog('系统', '[CI/CD] Bundle check passed - Total client size compressed to 184kB', 'system');
    }, 2000);
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50/50">
      
      {/* Search and action bar header */}
      <div className="pb-6 mb-6 border-b border-slate-200/60 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 select-none">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight font-sans">
            Agile Kanban 板与代码管线 (Agile Engine)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            第 42 研发迭代周期 Active • 剩余估算时间 <span className="font-bold underline text-blue-600">14 天</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-1.5 mr-2">
            {activeMembers.map((pic, idx) => (
              <img 
                key={idx} 
                src={pic} 
                alt="Member" 
                className="w-8 h-8 rounded-full border-2 border-white object-cover shadow-sm bg-slate-100" 
              />
            ))}
            <div className="w-8 h-8 rounded-full border-2 border-white bg-slate-100 text-slate-500 font-mono text-[10px] font-bold flex items-center justify-center shadow-sm">
              +3
            </div>
          </div>

          <button
            onClick={() => setCreateOpen(!createOpen)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-blue-650 hover:bg-blue-700 px-4 py-2.5 rounded-xl transition duration-150 shadow-md shadow-blue-500/10 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            创建白板任务
          </button>
        </div>
      </div>

      {/* Task creator floating block */}
      {createOpen && (
        <form onSubmit={handleAddNewTask} className="mb-6 bg-white p-5 rounded-2xl border border-blue-100 shadow-sm flex flex-col gap-4 animate-fadeIn">
          <h3 className="text-xs font-bold text-blue-650 uppercase tracking-wider flex items-center gap-1.5">
            <Sparkles className="h-4.5 w-4.5" />
            新任务流挂载
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] font-bold text-slate-500 font-mono">分配模块（如 API Integration, UI）</label>
              <input
                type="text"
                required
                value={taskCate}
                onChange={(e) => setTaskCate(e.target.value)}
                placeholder="API Integration"
                className="text-xs bg-slate-50 rounded-xl border border-slate-200 px-3.5 py-2 text-slate-800"
              />
            </div>
            
            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] font-bold text-slate-500 font-mono">优先级设定</label>
              <select
                value={taskPrio}
                onChange={(e) => setTaskPrio(e.target.value as any)}
                className="text-xs bg-slate-50 rounded-xl border border-slate-200 px-3.5 py-2 text-slate-800"
              >
                <option value="low">Low (常规开发)</option>
                <option value="medium">Medium (重要迭代)</option>
                <option value="high">High (优先跟进)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5 col-span-1">
              <label className="text-[10px] font-bold text-slate-500 font-mono">首发泳道泳域</label>
              <select
                value={taskStatus}
                onChange={(e) => setTaskStatus(e.target.value as any)}
                className="text-xs bg-slate-50 rounded-xl border border-slate-200 px-3.5 py-2 text-slate-800"
              >
                <option value="todo">To Do (待研发)</option>
                <option value="inprogress">In Progress (开发中)</option>
                <option value="review">Review (代码审查)</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold text-slate-500 font-mono">白板任务主题</label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="例如: 部署 WebAuthn 验证协议与移动端安全回调..."
              className="text-xs bg-slate-50 rounded-xl border border-slate-200 px-3.5 py-2 text-slate-800"
            />
          </div>

          <div className="flex justify-end gap-2.5 mt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="text-xs text-slate-500 px-4 py-2 hover:bg-slate-100 rounded-xl transition"
            >
              取消
            </button>
            <button
              type="submit"
              className="text-xs font-bold text-white bg-blue-650 hover:bg-blue-700 px-4 py-2.5 rounded-xl shadow-md transition cursor-pointer"
            >
              挂架看板板
            </button>
          </div>
        </form>
      )}

      {/* Main Splits: board and pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start flex-1 min-h-[500px]">
        
        {/* Kanban Swimlanes (Spans 8 cols) */}
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-6 h-full items-start">
          
          {/* Lane 1: To Do */}
          <div className="flex flex-col gap-4 bg-slate-100/50 p-3.5 rounded-2xl border border-slate-200/40 min-h-[460px]">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
                待开始研发 (To Do)
              </span>
              <span className="bg-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 font-mono">
                {tasks.filter(t => t.status === 'todo').length}
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[550px] overflow-y-auto">
              {tasks.filter(t => t.status === 'todo').map((task) => (
                <div 
                  key={task.id} 
                  className="bg-white border border-slate-200/60 p-4.5 rounded-xl shadow-sm hover:shadow-md transition relative group"
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="bg-blue-50 text-blue-650 px-2.5 py-0.5 rounded text-[10px] font-bold">
                      {task.category}
                    </span>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveTask(task.id, 'right')}
                        className="p-1 hover:bg-slate-150 rounded text-slate-600 transition shrink-0 cursor-pointer"
                        title="Move to In Progress"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-800 leading-snug mb-3">
                    {task.title}
                  </h3>

                  {/* Optional dynamic subtask progress list */}
                  {task.checklists && task.checklists.length > 0 && (
                    <div className="bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100 flex flex-col gap-2">
                      <div className="flex items-center gap-1 text-[10px] font-bold text-blue-650">
                        <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                        AI 智能分发子任务
                      </div>
                      <div className="flex flex-col gap-2">
                        {task.checklists.map((sub) => (
                          <label key={sub.id} className="flex items-center gap-2 text-[11px] text-slate-600 cursor-pointer hover:text-slate-800">
                            <input 
                              type="checkbox" 
                              checked={sub.completed}
                              onChange={() => toggleSubtask(task.id, sub.id)}
                              className="h-3.5 w-3.5 rounded border-slate-300 text-blue-650 focus:ring-blue-500 shrink-0"
                            />
                            <span className={sub.completed ? 'line-through text-slate-400' : ''}>
                              {sub.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-slate-50 pt-2.5">
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                      <MessageSquare className="h-3.5 w-3.5 text-slate-350" />
                      {task.commentsCount}
                    </span>

                    <img 
                      src={task.assigneeAvatar} 
                      alt="Executor" 
                      className="w-5.5 h-5.5 rounded-full object-cover border border-slate-250 shrink-0" 
                    />
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Lane 2: In Progress */}
          <div className="flex flex-col gap-4 bg-slate-100/50 p-3.5 rounded-2xl border border-slate-200/40 min-h-[460px]">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
                开发调试中 (In Progress)
              </span>
              <span className="bg-cyan-50 text-cyan-650 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono">
                {tasks.filter(t => t.status === 'inprogress').length}
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[550px] overflow-y-auto">
              {tasks.filter(t => t.status === 'inprogress').map((task) => (
                <div 
                  key={task.id} 
                  className="bg-white border-t-4 border-blue-600 border-x border-b border-slate-200/60 p-4.5 rounded-xl shadow-sm hover:shadow-md transition relative group"
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="bg-cyan-50 text-cyan-700 px-2.5 py-0.5 rounded text-[10px] font-bold">
                      {task.category}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveTask(task.id, 'left')}
                        className="p-1 hover:bg-slate-150 rounded text-slate-600 transition shrink-0 cursor-pointer"
                        title="Return to Todo"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      <button 
                        onClick={() => moveTask(task.id, 'right')}
                        className="p-1 hover:bg-slate-150 rounded text-slate-600 transition shrink-0 cursor-pointer"
                        title="Send to Review"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-800 leading-snug mb-3">
                    {task.title}
                  </h3>

                  {/* Simple Progress indicators for active items */}
                  <div className="w-full bg-slate-100 rounded-full h-1 my-3.5 overflow-hidden">
                    <div className="bg-cyan-500 h-1 rounded-full animate-pulse transition-all" style={{ width: '65%' }} />
                  </div>

                  <div className="flex justify-between items-center border-t border-slate-50 pt-2.5">
                    <span className="text-[10px] text-cyan-700 flex items-center gap-1 font-mono font-medium">
                      <GitCommit className="h-3.5 w-3.5 text-cyan-500" />
                      {task.commitsCount || 2} commits
                    </span>

                    <img 
                      src={task.assigneeAvatar} 
                      alt="Executor" 
                      className="w-5.5 h-5.5 rounded-full object-cover border border-slate-250 shrink-0" 
                    />
                  </div>
                </div>
              ))}
            </div>

          </div>

          {/* Lane 3: Review */}
          <div className="flex flex-col gap-4 bg-slate-100/50 p-3.5 rounded-2xl border border-slate-200/40 min-h-[460px]">
            <div className="flex justify-between items-center px-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider font-sans">
                代码审查 (Review)
              </span>
              <span className="bg-purple-50 text-purple-650 px-2 py-0.5 rounded-full text-[10px] font-bold font-mono">
                {tasks.filter(t => t.status === 'review').length}
              </span>
            </div>

            <div className="flex flex-col gap-3 max-h-[550px] overflow-y-auto">
              {tasks.filter(t => t.status === 'review').map((task) => (
                <div 
                  key={task.id} 
                  className="bg-white border border-slate-200/60 p-4.5 rounded-xl shadow-sm hover:shadow-md transition relative group"
                >
                  <div className="flex justify-between items-center mb-2.5">
                    <span className="bg-purple-50 text-purple-650 px-2.5 py-0.5 rounded text-[10px] font-bold">
                      {task.category}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => moveTask(task.id, 'left')}
                        className="p-1 hover:bg-slate-150 rounded text-slate-600 transition shrink-0 cursor-pointer"
                        title="Return to In Progress"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="text-xs font-bold text-slate-800 leading-snug mb-4">
                    {task.title}
                  </h3>

                  <div className="flex justify-between items-center border-t border-slate-50 pt-2.5">
                    <span className="bg-rose-50 border border-rose-100 text-rose-600 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md uppercase tracking-wider font-mono">
                      Needs Fix
                    </span>

                    <img 
                      src={task.assigneeAvatar} 
                      alt="Executor" 
                      className="w-5.5 h-5.5 rounded-full object-cover border border-slate-250 shrink-0" 
                    />
                  </div>
                </div>
              ))}
            </div>

          </div>

        </div>

        {/* Right Panel (4 cols): Developer Insights Code Viewer & Jasmine / Jest Runner */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-1.5">
              <Terminal className="h-5 w-5 text-blue-650" />
              开发者洞察 (Dev Insights)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">静态语法分析与全量集成测试</p>
          </div>

          {/* Active Branch and Code block Viewer */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 font-sans">
                <GitBranch className="h-4 w-4 text-blue-600" />
                当前开发主分支
              </h3>
              <span className="text-[10px] font-bold text-blue-650 font-mono bg-blue-105 px-2.5 py-1 rounded">
                feat/semantic-nav
              </span>
            </div>

            <div className="p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5 font-sans">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-600 animate-ping" />
                  3 个待提交 PR 提交
                </span>
                <span className="text-[11px] text-blue-650 hover:underline cursor-pointer font-bold">查看 PR 流</span>
              </div>

              {/* Black box code block */}
              <div className="bg-neutral-900 rounded-xl p-4 overflow-x-auto relative group font-mono text-[11px] leading-relaxed text-slate-350">
                <button
                  onClick={handleCopyCode}
                  className="absolute top-3 right-3 text-slate-500 hover:text-white transition duration-150 cursor-pointer"
                  title="Copy snippet"
                >
                  {codeCopied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
                <pre>
{`const determineNavState = (path) => {
  if (path.includes('/kanban')) {
    return 'Kanban';
  }
  /* AI Suggested Fallback */
  return SemanticMatcher.analyze(path);
};`}
                </pre>
              </div>
            </div>
          </div>

          {/* Jest / Jasmine test suite progress indicator card */}
          <div className="bg-white border border-slate-200/60 rounded-2xl shadow-sm flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1.5 font-sans">
                <ClipboardCheck className="h-4.5 w-4.5 text-cyan-650" />
                全生命周期 CI/CD 管线
              </h3>
              
              <button
                onClick={triggerCypressComplete}
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 transition ${
                  cypressFinished 
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                    : 'bg-orange-50 text-orange-650 border border-orange-100 animate-pulse cursor-pointer'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${cypressFinished ? 'bg-emerald-600' : 'bg-orange-600 animate-ping'}`} />
                {cypressFinished ? '已通过' : 'Running'}
              </button>
            </div>

            <div className="p-4 flex flex-col gap-4">
              
              {/* Suite 1 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-baseline text-xs text-slate-600 font-sans font-medium">
                  <span>单元测试方案 (Jest core)</span>
                  <span className="font-mono text-slate-800">245 / 245</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '100%' }} />
                </div>
              </div>

              {/* Suite 2 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-baseline text-xs text-slate-600 font-sans font-medium">
                  <span>端到端集成测试 (Cypress)</span>
                  <span className="font-mono text-slate-800">{cypressProgress} / 24</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500" 
                    style={{ width: `${(cypressProgress / 24) * 100}%` }} 
                  />
                </div>
              </div>

              {/* Suite 3 */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-baseline text-xs text-slate-600 font-sans font-medium">
                  <span>打包装载瘦身检测</span>
                  <span className={`font-mono text-xs font-bold ${
                    bundleSizeState === 'Passed' ? 'text-emerald-600' : 
                    bundleSizeState === 'Compressing' ? 'text-orange-500 animate-pulse' : 'text-slate-400'
                  }`}>
                    {bundleSizeState === 'Passed' ? 'Passed (184kB)' : bundleSizeState}
                  </span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className={`h-1.5 rounded-full transition-all duration-500 ${
                      bundleSizeState === 'Passed' ? 'bg-emerald-500 w-full' :
                      bundleSizeState === 'Compressing' ? 'bg-orange-500 w-1/2 animate-pulse' : 'w-0'
                    }`} 
                  />
                </div>
              </div>

            </div>

            <div className="bg-slate-50 rounded-b-2xl p-3 text-center border-t border-slate-100">
              <span className="text-[11px] text-slate-500 flex items-center justify-center gap-1 font-sans">
                已挂载 CI-Engine • 预估校验耗时: 
                <span className="font-bold underline text-blue-600 font-mono">
                  {cypressFinished ? '0s (已锁定)' : '2m 14s'}
                </span>
              </span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
