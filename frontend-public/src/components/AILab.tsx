import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Save, 
  HelpCircle, 
  FileText, 
  FolderOpen, 
  Key, 
  Grid3X3, 
  Bold, 
  Heading1, 
  List, 
  Code, 
  Link, 
  RotateCw,
  FolderClosed,
  ArrowDown,
  ChevronRight,
  ClipboardList,
  Check,
  Plus
} from 'lucide-react';

interface AILabProps {
  onPostLog: (user: string, message: string, type: 'code' | 'doc' | 'system' | 'user') => void;
}

export default function AILab({ onPostLog }: AILabProps) {
  // Pre-loaded requirements designer code block
  const [editorText, setEditorText] = useState(
    `The user authentication module needs to be completely rewritten to support biometrics.\n\nCurrently, we only support email/password and standard OAuth. We need to integrate Apple FaceID and Android BiometricPrompt.\n\nIt should fallback seamlessly if hardware isn't available.`
  );

  const [savingState, setSavingState] = useState<'IDLE' | 'SAVING' | 'SAVED'>('IDLE');
  
  // Memory vault folders array
  const [vaultFiles, setVaultFiles] = useState([
    { id: 'v1', name: 'Project_Titan_Core', type: 'folder', active: true },
    { id: 'v2', name: 'Auth_v2_Specs.pdf', type: 'doc', active: true },
    { id: 'v3', name: 'API_Gateway_Rules', type: 'api', active: false }
  ]);
  const [newVaultName, setNewVaultName] = useState('');
  const [showInjectInput, setShowInjectInput] = useState(false);

  // Active Standard Requirements parsed reactively from keyword parsing
  const [standardReqs, setStandardReqs] = useState<any[]>([]);

  // Toggle Vault file active status
  const toggleVaultFile = (id: string) => {
    setVaultFiles(vaultFiles.map(file => {
      if (file.id === id) {
        const nextActive = !file.active;
        onPostLog('系统', `AI 重构知识库 [${file.name}] 已${nextActive ? '挂载至上下文' : '移出运行池'}`, 'doc');
        return { ...file, active: nextActive };
      }
      return file;
    }));
  };

  const handleAddVaultContext = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVaultName.trim()) return;
    const newContext = {
      id: 'v-' + Date.now(),
      name: newVaultName.trim(),
      type: 'doc',
      active: true
    };
    setVaultFiles([...vaultFiles, newContext]);
    onPostLog('首席研究员', `注入了自定义知识库上下文: ${newVaultName}`, 'user');
    setNewVaultName('');
    setShowInjectInput(false);
  };

  // Fuzzy Keyword Parsing Standardization Algorithm
  useEffect(() => {
    const textLower = editorText.toLowerCase();
    const parsed: any[] = [];

    // Checked standard rules
    if (textLower.includes('biometrics') || textLower.includes('face') || textLower.includes('fingerprint')) {
      parsed.push({
        code: 'REQ-AUTH-04',
        title: '生体验证前置握手安全条件',
        content: 'System MUST initiate biometric capability shake (hardware level sensor inquiry) prior to dispatching authentication challenge.'
      });
    }

    if (textLower.includes('faceid') || textLower.includes('biometricprompt') || textLower.includes('oauth')) {
      parsed.push({
        code: 'REQ-AUTH-05',
        title: '双端原生安全抽象框架',
        content: 'System MUST support standardized bridge abstraction wrapper for FaceID (Platform iOS) & BiometricPrompt (Platform Android) returning consistent fallback telemetry.'
      });
    }

    if (textLower.includes('fallback') || textLower.includes('hardware') || textLower.includes('password')) {
      parsed.push({
        code: 'REQ-AUTH-06',
        title: '双盲兜底安全备份方案',
        content: 'System MUST construct reliable local passphrase secure entry fallback UI within 150ms of negative biometric handshake telemetry.'
      });
    }

    if (textLower.includes('database') || textLower.includes('cache') || textLower.includes('db')) {
      parsed.push({
        code: 'REQ-DATA-01',
        title: '非易失缓存链路同步协议',
        content: 'System MUST coordinate cache write-through telemetry directly back to primary DB and scale replicas nodes accordingly on read burst configurations.'
      });
    }

    if (textLower.includes('latency') || textLower.includes('ms') || textLower.includes('speed')) {
      parsed.push({
        code: 'REQ-PERF-01',
        title: '单点超低空载时延墙',
        content: 'System handshake latency ceiling for biometric capability check MUST not cross 300ms under standard operational stress thresholds.'
      });
    }

    // Default template fallback if no terms matched
    if (parsed.length === 0) {
      parsed.push({
        code: 'REQ-GEN-01',
        title: '通用安全规范策略',
        content: 'System MUST satisfy standard OAuth security specifications and preserve end-to-end telemetry encryption layers.'
      });
    }

    setStandardReqs(parsed);
  }, [editorText]);

  // Test Case list generator state
  const [testCasesOpen, setTestCasesOpen] = useState(false);
  const [generatingCases, setGeneratingCases] = useState(false);
  const [renderedCases, setRenderedCases] = useState<any[]>([]);

  // Trigger test case generation
  const handleGenerateTestCases = () => {
    setGeneratingCases(true);
    setTestCasesOpen(true);
    
    setTimeout(() => {
      // Map standard parsed rules out to structured mock Test Cases
      const cases = standardReqs.map((req, idx) => ({
        id: `TC-AUTH-0${idx + 4}`,
        title: `Verify ${req.code} Specification`,
        scenario: `GIVEN: The client app initializes with text: "${editorText.split('\n')[0].slice(0, 35)}..."`,
        expect: `EXPECTED: System handles standard specification requirement [${req.code}] successfully according to neural analysis rules.`
      }));
      
      setRenderedCases(cases);
      setGeneratingCases(false);
      onPostLog('系统', `[AI Labs] 针对当前研发文档成功自动推演生成了 ${cases.length} 个 QA 测试用例`, 'system');
    }, 1500);
  };

  // Save Draft trigger
  const handleSaveDraft = () => {
    setSavingState('SAVING');
    setTimeout(() => {
      setSavingState('SAVED');
      onPostLog('首席研究员', '已在 Aether R&D 云实验仓中保存当前编写的 AI 需求草稿组', 'user');
      setTimeout(() => setSavingState('IDLE'), 2000);
    }, 1200);
  };

  // Calculate live typing dynamic line numbers
  const linesCount = editorText.split('\n').length;
  const lineNumbers = Array.from({ length: Math.max(10, linesCount + 2) }, (_, i) => i + 1);

  return (
    <div className="flex-1 flex flex-col bg-slate-50/50">

      {/* Lab Header */}
      <div className="pb-6 mb-6 border-b border-slate-200/60 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 select-none">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold font-mono text-purple-650 uppercase tracking-widest bg-purple-50 px-3 py-1.5 rounded-full w-fit">
            <Sparkles className="h-4 w-4 text-purple-600 animate-pulse" />
            LAB WORKSPACE ALPHA
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight mt-3">智能架构需求设计师 (Requirements Designer)</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            采用实时自适应神经转换模型，可在您键入非结构化需求草稿时，动态翻译成标准化规格。
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-indigo-900 bg-indigo-50 border border-indigo-100 rounded-full px-3 py-1.5 flex items-center gap-1 font-sans">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-650" />
            运行模型: Gemini-3.5-Flash Pro
          </span>
          <button
            onClick={handleSaveDraft}
            disabled={savingState === 'SAVING'}
            className="flex items-center gap-1.5 text-xs font-bold text-blue-650 hover:bg-blue-50 border border-blue-200 px-4 py-2.5 rounded-xl transition duration-150 cursor-pointer disabled:opacity-50"
          >
            <Save className={`h-4 w-4 ${savingState === 'SAVING' ? 'animate-spin' : ''}`} />
            {savingState === 'SAVING' ? '保存中...' : savingState === 'SAVED' ? '已保存!' : '保存需求草稿'}
          </button>
        </div>
      </div>

      {/* Main Splits: Split Editor and Side Optimizer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column (8 cols): Large Interactive formulation editor with synchronized line numbers */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="bg-white border border-slate-250/70 rounded-2xl shadow-sm overflow-hidden flex flex-col h-[520px] focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
            
            {/* Rich Editor Toolbar Mockup */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-center justify-between select-none">
              <div className="flex items-center gap-1.5 text-slate-500">
                <button className="p-1.5 hover:bg-slate-200 rounded transition"><Heading1 className="h-4 w-4" /></button>
                <button className="p-1.5 hover:bg-slate-200 rounded transition font-bold"><Bold className="h-4 w-4" /></button>
                <button className="p-1.5 hover:bg-slate-200 rounded transition"><List className="h-4 w-4" /></button>
                <div className="h-4 w-px bg-slate-200 mx-2" />
                <button className="p-1.5 hover:bg-slate-200 rounded transition"><Code className="h-4 w-4" /></button>
                <button className="p-1.5 hover:bg-slate-200 rounded transition"><Link className="h-4 w-4" /></button>
              </div>

              <div className="flex items-center gap-1.5 text-slate-400 font-mono text-[10px]">
                <RotateCw className="h-3.5 w-3.5 text-blue-500 animate-spin" />
                <span>实时联测分析运行中...</span>
              </div>
            </div>

            {/* Split Screen textarea space with line columns */}
            <div className="flex-grow flex relative bg-slate-50/20">
              
              {/* Dynamic Line counters */}
              <div className="w-12 bg-slate-50/60 border-r border-slate-200 text-right pr-3.5 py-4 text-xs font-mono select-none text-slate-400 font-medium leading-relaxed">
                {lineNumbers.map((num) => (
                  <div key={num}>{num}</div>
                ))}
              </div>

              {/* Editable Text Area client node */}
              <textarea
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder="在此描述您的研发方案或业务规则草稿。尝试打字提及类似: FaceID, biometrics, hardware, fallback, database, latency... 查看 AI 标准转换系统实时自适应变装功能..."
                className="flex-grow bg-transparent border-none p-4 text-xs text-slate-700 font-sans leading-relaxed focus:ring-0 focus:outline-none resize-none placeholder-slate-400"
              />
            </div>

            {/* Live Typing hint footer */}
            <div className="bg-slate-50 px-4 py-3 border-t border-slate-100 flex justify-between items-center text-[11px] text-slate-500 font-sans">
              <span>在方案中提及特定关键字触发规则匹配</span>
              <span className="font-mono text-[10px] text-slate-400">Total lines: {linesCount}</span>
            </div>

          </div>
        </div>

        {/* Right column (4 cols): Standardization response logs and Knowledge base chip files */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          
          {/* Standardization result cards block */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <Sparkles className="h-4.5 w-4.5 text-purple-650" />
                标准译本结构输出 (Standardization)
              </h3>
              <span className="bg-purple-50 text-purple-650 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider font-mono">Active</span>
            </div>

            {/* Simulated Live conversion flow cards inside list */}
            <div className="flex flex-col gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-mono block mb-1">Raw Content Parser Match:</span>
                <p className="text-slate-600 font-sans italic">
                  "{editorText.split('\n')[0].slice(0, 52)}..."
                </p>
              </div>

              <div className="flex justify-center my-0.5">
                <ArrowDown className="h-4 w-4 text-slate-350" />
              </div>

              {/* Reactive Translated output specs maps */}
              <div className="flex flex-col gap-3.5 max-h-[200px] overflow-y-auto">
                {standardReqs.map((req, idx) => (
                  <div key={idx} className="p-3.5 bg-purple-500/[0.04] border border-purple-500/10 rounded-xl relative overflow-hidden transition">
                    <span className="text-[9px] font-extrabold text-purple-700 uppercase font-mono px-1.5 py-0.5 bg-purple-105 rounded-md">
                      {req.code}
                    </span>
                    <h4 className="text-xs font-bold text-slate-800 mt-2 font-sans">{req.title}</h4>
                    <p className="text-[11px] leading-relaxed text-slate-600 mt-1 font-sans">{req.content}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Context Memory Vault container */}
          <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <FolderOpen className="h-4.5 w-4.5 text-cyan-650" />
                AI 上下文融合库 (Memory Vault)
              </h3>
              <button 
                onClick={() => setShowInjectInput(!showInjectInput)}
                className="text-[11px] font-bold text-blue-650 hover:underline shrink-0"
              >
                添加上下文
              </button>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed font-sans mb-3.5">
              以下索引的研发项目与文档规范，将自动合并进入 AI 重构模型的安全输入上下文机制。
            </p>

            {showInjectInput && (
              <form onSubmit={handleAddVaultContext} className="mb-3.5 flex gap-2 animate-fadeIn bg-slate-50 p-2.5 rounded-xl border border-slate-150">
                <input
                  type="text"
                  required
                  value={newVaultName}
                  onChange={(e) => setNewVaultName(e.target.value)}
                  placeholder="文件名/项目代号"
                  className="text-xs bg-white rounded-lg border border-slate-200 px-2 py-1 flex-grow focus:outline-none"
                />
                <button type="submit" className="text-[10px] font-bold text-white bg-blue-650 px-2.5 py-1 rounded-lg">创建</button>
              </form>
            )}

            <div className="flex flex-wrap gap-2.5">
              {vaultFiles.map((file) => (
                <button
                  key={file.id}
                  onClick={() => toggleVaultFile(file.id)}
                  className={`text-[11px] font-medium font-sans px-2.5 py-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                    file.active 
                      ? 'bg-cyan-50 text-cyan-700 border-cyan-200' 
                      : 'bg-white text-slate-500 border-slate-205 hover:bg-slate-50'
                  }`}
                >
                  <FileText className="h-3.5 w-3.5 mt-px" />
                  <span>{file.name}</span>
                </button>
              ))}

              <button 
                onClick={() => setShowInjectInput(true)}
                className="text-[11px] font-medium font-mono text-slate-400 border border-dashed border-slate-250 hover:border-blue-400 hover:text-blue-500 transition px-2.5 py-1.5 rounded-lg flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" />
                注入临时文本
              </button>
            </div>
          </div>

          {/* QA Test case generator click component */}
          <div 
            onClick={handleGenerateTestCases}
            className="rounded-2xl bg-gradient-to-r from-blue-650 via-blue-700 to-indigo-650 text-white p-5 cursor-pointer shadow-lg shadow-blue-500/10 hover:shadow-xl hover:shadow-blue-500/15 group relative overflow-hidden transition-all duration-300 transform"
          >
            <div className="absolute right-[-24px] top-[-24px] w-28 h-28 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all" />
            <div className="relative z-10 flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-bold tracking-tight flex items-center gap-1.5 font-sans">
                  <ClipboardList className="h-5 w-5 animate-pulse" />
                  推演自动化测试用例 (QA Suite)
                </h3>
                <p className="text-[11px] text-blue-100 font-sans mt-1 leading-relaxed">
                  一键针对上述所产出的标准化规格设计，自动推演编写 QA 测试场景和前置校验边界。
                </p>
              </div>

              <div className="flex justify-between items-center mt-1 border-t border-white/10 pt-3">
                <span className="text-[10px] font-bold font-mono bg-white/20 text-white px-2.5 py-1 rounded-full uppercase tracking-wider">
                  估算 {standardReqs.length * 3} 个测试场景
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-blue-650 shadow group-hover:scale-110 transition duration-150 shrink-0">
                  <ChevronRight className="h-4.5 w-4.5" />
                </span>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* Structured generated QA Case list floating modal */}
      {testCasesOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] animate-slideUp">
            
            <div className="flex justify-between items-center border-b border-slate-100 pb-4 mb-4 select-none">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5 font-sans">
                  <ClipboardList className="h-5 w-5 text-blue-600" />
                  自动推演的 AI 测试规格库
                </h3>
                <p className="text-xs text-slate-500">依据标准化规格，实时动态覆盖的端到端覆盖断言场景</p>
              </div>

              <span className="text-[10px] font-bold text-blue-650 bg-blue-50 px-2 py-0.5 rounded font-mono">
                {generatingCases ? '计算中...' : '推演成功'}
              </span>
            </div>

            <div className="flex-grow overflow-y-auto pr-1 flex flex-col gap-3.5 mb-5 select-none">
              {generatingCases ? (
                <div className="flex flex-col gap-3 justify-center items-center py-12">
                  <RotateCw className="h-8 w-8 text-blue-650 animate-spin" />
                  <span className="text-xs text-slate-500 font-sans animate-pulse">
                    正在执行大跨度安全链路分支测试推演... 请稍等
                  </span>
                </div>
              ) : (
                renderedCases.map((tc) => (
                  <div key={tc.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-150 flex gap-3">
                    <span className="text-[10px] font-extrabold text-blue-700 bg-blue-105 rounded-md px-2 py-1 shrink-0 h-fit font-mono">
                      {tc.id}
                    </span>
                    <div className="flex flex-col gap-1.5">
                      <h4 className="text-xs font-bold text-slate-800 font-sans">{tc.title}</h4>
                      <p className="text-[11px] font-mono text-slate-500 bg-white p-1.5 rounded-lg border border-slate-150 leading-relaxed font-semibold">
                        {tc.scenario}
                      </p>
                      <p className="text-[11px] leading-relaxed text-slate-600 font-sans font-medium">
                        {tc.expect}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-3 select-none">
              <button
                onClick={() => setTestCasesOpen(false)}
                className="text-xs text-slate-635 border border-slate-205 hover:bg-slate-50 px-4.5 py-2.5 rounded-xl transition font-sans"
              >
                关闭面板
              </button>
              
              {!generatingCases && (
                <button
                  onClick={() => {
                    setTestCasesOpen(false);
                    onPostLog('系统', `[CI/CD] 将 ${renderedCases.length} 个测试用例加入到开发管线中`, 'system');
                  }}
                  className="text-xs font-bold text-white bg-blue-650 hover:bg-blue-700 px-4.5 py-2.5 rounded-xl shadow-md transition cursor-pointer"
                >
                  套用并挂载
                </button>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
