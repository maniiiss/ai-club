import React, { useState, useEffect } from 'react';
import { Recommendation, Log } from '../types';
import { 
  Network, 
  Settings2, 
  Layers, 
  Gauge,
  Activity, 
  Radio, 
  CheckCircle2, 
  RefreshCw, 
  AlertTriangle, 
  Zap, 
  Sliders, 
  Cpu, 
  Check,
  ChevronRight,
  TrendingDown,
  Sparkles,
  Award
} from 'lucide-react';

interface OpsCenterProps {
  recommendations: Recommendation[];
  setRecommendations: React.Dispatch<React.SetStateAction<Recommendation[]>>;
  onPostLog: (user: string, message: string, type: 'code' | 'doc' | 'system' | 'user') => void;
}

export default function OpsCenter({
  recommendations,
  setRecommendations,
  onPostLog
}: OpsCenterProps) {
  // Simulator State
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStep, setDeployStep] = useState('Standby');
  const [deployPercent, setDeployPercent] = useState(0);
  const [stagingVersion, setStagingVersion] = useState('v4.1.0-rc');
  const [productionVersion, setProductionVersion] = useState('v4.0.2');
  
  const [appliedCount, setAppliedCount] = useState(0);

  // Operational metrics that react to applied recommendations
  const [baseLatency, setBaseLatency] = useState(42);
  const [baseErrorRate, setBaseErrorRate] = useState(0.02);
  const [baseCpuUsage, setBaseCpuUsage] = useState(78);

  // Live Jitter Simulation
  const [jitter, setJitter] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      // Small harmless fluctuations to represent real-time telemetry
      setJitter(Number((Math.random() * 2 - 1).toFixed(2)));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const totalLatency = Math.max(12, Math.round(baseLatency + (jitter * 1.5)));
  const totalErrorRate = Math.max(0.00, Number((baseErrorRate + (jitter * 0.002)).toFixed(3)));
  const totalCpuUsage = Math.min(100, Math.max(15, Math.round(baseCpuUsage + (jitter * 0.8))));

  // Deploying staging cycle
  const handleDeployStaging = () => {
    if (isDeploying) return;
    setIsDeploying(true);
    setDeployPercent(0);
    onPostLog('系统', '启动 Staging 预发布集群测试与发布部署流', 'system');
    
    const steps = [
      { p: 15, text: 'Container validation check successful' },
      { p: 40, text: 'Core compilation verification... Passed' },
      { p: 65, text: 'Running Cypress system tests (18/24 complete)' },
      { p: 85, text: 'Hot module syncing and router routing redirection' },
      { p: 100, text: 'Syncing complete. Version v4.1.0-rc is active!' }
    ];

    let currentIdx = 0;
    
    const timer = setInterval(() => {
      if (currentIdx < steps.length) {
        const currentStep = steps[currentIdx];
        setDeployPercent(currentStep.p);
        setDeployStep(currentStep.text);
        onPostLog('系统', `[CI/CD] ${currentStep.text}`, 'system');
        currentIdx++;
      } else {
        clearInterval(timer);
        setIsDeploying(false);
        setDeployStep('Successful');
        // Update production version to staging version
        setProductionVersion('v4.1.0');
        setStagingVersion('v4.2.0-rc');
        onPostLog('系统', '部署管线已全量同步: 生产版本无缝切换至 v4.1.0', 'system');
      }
    }, 1800);
  };

  // Apply Recommendations
  const handleApplyOptimizer = () => {
    // Collect all unapplied recommendations
    const pending = recommendations.filter(r => !r.applied);
    if (pending.length === 0) return;

    // Apply all
    setRecommendations(recommendations.map(r => ({ ...r, applied: true })));
    setAppliedCount(appliedCount + pending.length);

    // Calculate sum of impacts
    let latCut = 0;
    let errCut = 0;
    let cpuCut = 0;

    pending.forEach(p => {
      latCut += p.impact.latency;
      errCut += p.impact.errorRate;
      cpuCut += p.impact.cpuUsage;
    });

    setBaseLatency(prev => Math.max(15, prev + latCut));
    setBaseErrorRate(prev => Math.max(0.005, prev + errCut));
    setBaseCpuUsage(prev => Math.max(20, prev + cpuCut));

    onPostLog('首席研究员', `触发了 AI 神经优化推荐器: 应用了 ${pending.length} 个优化措施`, 'user');
    onPostLog('系统', `节点重组成功: 整体时延降低 ${Math.abs(latCut)}ms, CPU 载荷降低 ${Math.abs(cpuCut)}%`, 'system');
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50/50">

      {/* Hero Header */}
      <div className="pb-6 mb-6 border-b border-slate-200/60 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 select-none">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold font-mono text-indigo-650 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-full w-fit">
            <Activity className="h-4 w-4 text-indigo-600 animate-pulse" />
            LIVE TELEMETRY
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-3">运维监控中心 (Ops Center)</h1>
          <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
            实时容器拓扑时延监控、分布式流性能洞察以及 AI 驱动的自主重组。
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-650 bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5 flex items-center gap-1.5 animate-pulse font-sans">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-600 shrink-0" />
            数据更新流: Live
          </span>
          <span className="text-xs text-slate-400 bg-white border border-slate-200 px-3 py-1.5 rounded-full font-mono">
            最后更新: 刚刚
          </span>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (8 cols): Deployment Pipeline & Sparklines */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          
          {/* Pipelines Node Panel */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Network className="h-4.5 w-4.5 text-blue-650" />
                  容器发布管线 (Deployment Pipeline)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">两地多活容灾与红绿测试节点</p>
              </div>
              <ChevronRight className="h-4.5 w-4.5 text-slate-350" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Production Node Box */}
              <div className="border border-slate-150 rounded-xl p-5 bg-gradient-to-br from-white to-slate-50/50 flex flex-col relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/20 rounded-bl-full pointer-events-none" />
                
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-650">
                      <Zap className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-800 font-sans">Production 生产节点</span>
                  </div>
                  <span className="bg-indigo-100/60 text-indigo-900 border border-indigo-205 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono">
                    {productionVersion}
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-3xl font-extrabold text-slate-800 font-sans tracking-tight">99.99%</span>
                  <span className="text-xs text-slate-400 font-mono">集群正常</span>
                </div>

                <div className="mt-auto pt-4 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500 font-sans">
                  <span className="text-emerald-650 font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> 稳定运行中
                  </span>
                  <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-mono">us-east-1 分支</span>
                </div>
              </div>

              {/* Staging Node Box (Interactive build simulator) */}
              <div className="border border-slate-150 rounded-xl p-5 bg-gradient-to-br from-white to-slate-50/50 flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-650">
                      <Sliders className="h-4.5 w-4.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-800 font-sans">Staging 仿真测试</span>
                  </div>
                  <span className="bg-slate-100 border border-slate-200 text-slate-600 px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono">
                    {stagingVersion}
                  </span>
                </div>

                <div className="flex flex-col gap-1 mb-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-xl font-extrabold text-slate-800 font-sans">
                      {isDeploying ? '发布中 (Deploying)' : '就绪 (Standby)'}
                    </span>
                    {isDeploying && (
                      <span className="text-xs text-blue-600 font-mono font-bold animate-pulse">{deployPercent}%</span>
                    )}
                  </div>
                  {isDeploying && (
                    <span className="text-[10px] text-slate-400 truncate max-w-xs">{deployStep}</span>
                  )}
                </div>

                {/* Staging deployment bar */}
                {isDeploying ? (
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-auto mb-2 overflow-hidden shadow-inner">
                    <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300 shadow-sm" style={{ width: `${deployPercent}%` }} />
                  </div>
                ) : (
                  <button
                    onClick={handleDeployStaging}
                    className="mt-auto mb-1 w-full text-xs font-bold border border-blue-200 text-blue-650 hover:bg-blue-650 hover:text-white bg-blue-50/50 px-3.5 py-2 rounded-xl transition cursor-pointer flex justify-center items-center gap-1.5"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    将 Staging 同步到生产节点
                  </button>
                )}

                <div className="flex justify-between items-center text-xs text-slate-400 font-sans mt-1">
                  <span className="flex items-center gap-1 text-[11px]">
                    <span className={`h-1.5 w-1.5 rounded-full ${isDeploying ? 'bg-orange-500 animate-pulse' : 'bg-blue-600'}`} />
                    {isDeploying ? '正在联调单元测试' : '已集成 24 个单测方案'}
                  </span>
                  <span className="font-mono text-[10px]">Staging-6</span>
                </div>
              </div>

            </div>

          </div>

          {/* Performance stats charts row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 select-none">
            
            {/* Latency card */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-sans">全球平均响应时延</span>
                <span className="text-blue-500 bg-blue-50 p-1.5 rounded-lg shrink-0">
                  <Activity className="h-4 w-4" />
                </span>
              </div>
              
              <div className="flex items-baseline gap-1.5 mb-4">
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight font-sans">
                  {totalLatency}
                </span>
                <span className="text-sm text-slate-400 font-mono">ms</span>
              </div>

              {/* Sparkline Canvas Drawing via SVG */}
              <div className="h-14 w-full mt-auto opacity-80 pt-2">
                <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gradient-lat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563eb" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#2563eb" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Fill route path */}
                  <path 
                    d={`M0,25 L10,23 L20,26 L30,22 L40,15 L50,22 L60,18 L70,${Math.max(5, 23 - (appliedCount * 3))} L80,${Math.max(5, 24 - (appliedCount * 3))} L90,${Math.max(5, 12 - (appliedCount * 2))} L100,${Math.max(5, 12 - (appliedCount * 2))} L100,30 L0,30 Z`}
                    fill="url(#gradient-lat)" 
                  />
                  {/* Line stroke */}
                  <path 
                    d={`M0,25 L10,23 L20,26 L30,22 L40,15 L50,22 L60,18 L70,${Math.max(5, 23 - (appliedCount * 3))} L80,${Math.max(5, 24 - (appliedCount * 3))} L90,${Math.max(5, 12 - (appliedCount * 2))} L100,${Math.max(5, 12 - (appliedCount * 2))}`}
                    fill="none" 
                    stroke="#2563eb" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                  />
                </svg>
              </div>
            </div>

            {/* Error Rate Card */}
            <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider font-sans">内核抛出错误率</span>
                <span className="text-rose-500 bg-rose-50 p-1.5 rounded-lg shrink-0">
                  <AlertTriangle className="h-4 w-4" />
                </span>
              </div>
              
              <div className="flex items-baseline gap-1.5 mb-4">
                <span className="text-3xl font-extrabold text-slate-800 tracking-tight font-sans">
                  {totalErrorRate}%
                </span>
                <span className="text-xs text-rose-600 font-bold font-mono">微时抛出</span>
              </div>

              {/* Sparkline Canvas Drawing via SVG */}
              <div className="h-14 w-full mt-auto opacity-80 pt-2">
                <svg viewBox="0 0 100 30" width="100%" height="100%" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="gradient-err" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Fill route path */}
                  <path 
                    d={`M0,28 L15,22 L30,26 L45,15 L60,28 L75,${Math.max(4, 25 - (appliedCount * 4))} L90,${Math.max(4, 22 - (appliedCount * 5))} L100,${Math.max(4, 18 - (appliedCount * 4))} L100,30 L0,30 Z`}
                    fill="url(#gradient-err)" 
                  />
                  {/* Line stroke */}
                  <path 
                    d={`M0,28 L15,22 L30,26 L45,15 L60,28 L75,${Math.max(4, 25 - (appliedCount * 4))} L90,${Math.max(4, 22 - (appliedCount * 5))} L100,${Math.max(4, 18 - (appliedCount * 4))}`}
                    fill="none" 
                    stroke="#f43f5e" 
                    strokeWidth="2.5" 
                    strokeLinecap="round" 
                  />
                </svg>
              </div>
            </div>

          </div>

        </div>

        {/* Right Column (4 cols): Round Utilization & AI Optimizer insights */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Circular compute ring gauge */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex flex-col items-center select-none">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-6 self-start font-sans">
              算力负载容量 (Compute Capacity)
            </h3>

            <div className="relative w-44 h-44 flex items-center justify-center">
              {/* SVG circular progress indicator base */}
              <svg className="w-full h-full absolute inset-0 -rotate-90" viewBox="0 0 36 36">
                {/* Background Ring */}
                <path 
                  className="text-slate-100" 
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="3.2" 
                />
                
                {/* Colored Progress Ring */}
                <path 
                  className="text-blue-600 transition-all duration-500 ease-out" 
                  strokeDasharray={`${totalCpuUsage}, 100`}
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeLinecap="round" 
                  strokeWidth="3.2" 
                />
              </svg>

              <div className="flex flex-col items-center justify-center text-center z-10">
                <span className="text-4xl font-extrabold text-slate-800 tracking-tight font-sans">
                  {totalCpuUsage}<span className="text-lg font-medium text-slate-500">%</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono mt-0.5">Utilized</span>
              </div>
            </div>

            <div className="w-full mt-6 grid grid-cols-2 gap-4 pt-4 border-t border-slate-100 text-center font-sans">
              <div className="border-r border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">CPU Cores</span>
                <span className="text-xs font-bold text-slate-800 mt-0.5 block">64 Cores [Xeon]</span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono block">Alloc Cache</span>
                <span className="text-xs font-bold text-slate-800 mt-0.5 block">512 GB [ECC]</span>
              </div>
            </div>
          </div>

          {/* AI Optimizer Panel with high-fidelity glow effect */}
          <div className="relative rounded-2xl bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl overflow-hidden group">
            {/* Glowing active outline */}
            <div className="absolute inset-0 border border-indigo-500/20 rounded-2xl group-hover:border-indigo-400/40 transition-colors pointer-events-none" />
            
            <div className="flex items-center gap-2 text-indigo-400 font-bold mb-4">
              <Sparkles className="h-5 w-5 animate-pulse text-cyan-400 shrink-0" />
              <h3 className="text-xs font-bold uppercase tracking-widest font-sans">AETHER OPTIMIZER</h3>
            </div>

            <p className="text-xs leading-relaxed text-slate-300 mb-6 font-sans">
              负载分析模型计算就绪。实时监控计算出以下 <span className="text-cyan-400 font-bold font-mono">2</span> 项系统重组方案：
            </p>

            <div className="flex flex-col gap-3.5 mb-6">
              {recommendations.map((rec) => (
                <div 
                  key={rec.id} 
                  className={`p-3 rounded-xl border transition-all flex items-start gap-3 ${
                    rec.applied 
                      ? 'bg-slate-900/40 border-slate-800 opacity-60' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                >
                  <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                    rec.applied ? 'bg-slate-800 text-slate-500' : 'bg-indigo-900/50 text-indigo-300'
                  }`}>
                    {rec.applied ? <Check className="h-4 w-4" /> : <Sliders className="h-4 w-4" />}
                  </span>
                  
                  <div className="flex-grow">
                    <div className="flex justify-between items-center">
                      <h4 className="text-xs font-bold text-slate-200">{rec.title}</h4>
                      {rec.applied && (
                        <span className="text-[9px] font-mono font-bold text-indigo-400 uppercase">已套用</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-sans leading-relaxed">{rec.description}</p>
                  </div>
                </div>
              ))}
            </div>

            {recommendations.some(r => !r.applied) ? (
              <button
                onClick={handleApplyOptimizer}
                className="w-full bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white rounded-xl py-3.5 text-xs font-bold hover:opacity-95 active:scale-[0.98] transition-all shadow-lg shadow-indigo-650/40 flex justify-center items-center gap-1.5 cursor-pointer"
              >
                <Award className="h-4 w-4 animate-bounce" />
                应用推荐参数重整方案
              </button>
            ) : (
              <div className="bg-slate-900/60 p-3 rounded-xl border border-indigo-500/20 text-center text-xs text-indigo-400 font-bold flex items-center justify-center gap-1.5 animate-pulse select-none">
                <Check className="h-4.5 w-4.5" />
                所有系统指标均已达到极致
              </div>
            )}
          </div>

        </div>

      </div>

    </div>
  );
}
