import React, { useState } from 'react';
import { Tab } from '../types';
import { 
  Orbit, 
  Rocket, 
  Bell, 
  Settings, 
  Search, 
  User, 
  HelpCircle, 
  LogOut,
  Sparkles
} from 'lucide-react';
import { AVATAR_LEAD } from '../data';

interface HeaderProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  onLaunchAssistant: () => void;
  unreadCount: number;
  setUnreadCount: (count: number) => void;
}

export default function Header({ 
  activeTab, 
  setActiveTab, 
  onLaunchAssistant,
  unreadCount,
  setUnreadCount
}: HeaderProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const notifications = [
    { id: 1, text: '代码审查代理: PR #402 部署成功', time: '5分钟前', unread: true },
    { id: 2, text: '性能监控代理: 检测到延迟已恢复正常', time: '12分钟前', unread: true },
    { id: 3, text: '系统: 推荐进行 DB 节点缩容以节省 20% 成本', time: '1小时前', unread: false }
  ];

  const clearNotifications = () => {
    setUnreadCount(0);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-10">
        
        {/* Brand Logo & Name */}
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-650 text-white shadow-sm shadow-blue-500/20">
            <Orbit className="h-6 w-6 animate-[spin_40s_linear_infinite]" />
          </div>
          <span className="text-xl font-bold tracking-tight text-blue-650 font-sans">Aether R&D</span>
        </div>

        {/* Center Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'dashboard'
                ? 'text-blue-650 bg-blue-50/70 border-b-2 border-blue-650 rounded-b-none'
                : 'text-slate-500 hover:text-blue-620 hover:bg-slate-50'
            }`}
          >
            控制台
          </button>
          <button
            onClick={() => setActiveTab('labs')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'labs'
                ? 'text-blue-650 bg-blue-50/70 border-b-2 border-blue-650 rounded-b-none'
                : 'text-slate-500 hover:text-blue-620 hover:bg-slate-50'
            }`}
          >
            Labs
          </button>
          <button
            onClick={() => setActiveTab('kanban')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'kanban'
                ? 'text-blue-650 bg-blue-50/70 border-b-2 border-blue-650 rounded-b-none'
                : 'text-slate-500 hover:text-blue-620 hover:bg-slate-50'
            }`}
          >
            Kanban
          </button>
          <button
            onClick={() => setActiveTab('ops')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'ops'
                ? 'text-blue-650 bg-blue-50/70 border-b-2 border-blue-650 rounded-b-none'
                : 'text-slate-500 hover:text-blue-620 hover:bg-slate-50'
            }`}
          >
            Monitoring
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeTab === 'docs'
                ? 'text-blue-650 bg-blue-50/70 border-b-2 border-blue-650 rounded-b-none'
                : 'text-slate-500 hover:text-blue-620 hover:bg-slate-50'
            }`}
          >
            Docs
          </button>
        </nav>

        {/* Right Corner Actions */}
        <div className="flex items-center gap-4">
          
          {/* Launch Assistant CTA */}
          <button
            onClick={onLaunchAssistant}
            className="hidden lg:flex items-center gap-2 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-650 text-white px-4.5 py-2.5 rounded-full text-sm font-medium hover:opacity-95 active:scale-[0.98] transition-all shadow-md shadow-blue-500/10 cursor-pointer"
          >
            <Sparkles className="h-4.5 w-4.5 animate-pulse text-blue-100" />
            Launch AI Assistant
          </button>

          {/* Icon Actions */}
          <div className="flex gap-1.5 text-slate-500">
            {/* Notification triggers */}
            <div className="relative">
              <button 
                onClick={() => {
                  setNotificationsOpen(!notificationsOpen);
                  setProfileOpen(false);
                  setSettingsOpen(false);
                }}
                className={`p-2.5 hover:bg-slate-50 rounded-full transition-color flex items-center justify-center relative cursor-pointer ${
                  notificationsOpen ? 'bg-slate-100 text-blue-650' : ''
                }`}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2.5 w-80 bg-white border border-slate-150 rounded-2xl shadow-xl z-50 p-4">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-2">
                    <h4 className="text-sm font-bold text-slate-800">最新消息</h4>
                    {unreadCount > 0 && (
                      <button 
                        onClick={clearNotifications}
                        className="text-xs text-blue-650 hover:underline"
                      >
                        全部已读
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto">
                    {notifications.map((n) => (
                      <div key={n.id} className="p-2.5 hover:bg-slate-50 rounded-lg text-xs flex flex-col gap-1">
                        <div className="flex justify-between items-start">
                          <span className={`${n.unread ? 'font-bold text-slate-800' : 'text-slate-600'}`}>{n.text}</span>
                          {n.unread && <span className="h-1.5 w-1.5 rounded-full bg-blue-600 mt-1 shrink-0" />}
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">{n.time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Settings Trigger */}
            <div className="relative">
              <button 
                onClick={() => {
                  setSettingsOpen(!settingsOpen);
                  setProfileOpen(false);
                  setNotificationsOpen(false);
                }}
                className={`p-2.5 hover:bg-slate-50 rounded-full transition-color flex items-center justify-center cursor-pointer ${
                  settingsOpen ? 'bg-slate-100 text-blue-650' : ''
                }`}
              >
                <Settings className="h-5 w-5" />
              </button>

              {settingsOpen && (
                <div className="absolute right-0 mt-2.5 w-64 bg-white border border-slate-150 rounded-2xl shadow-xl z-50 p-4">
                  <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-1.5">
                    <Settings className="h-4 w-4" />
                    系统设定
                  </h4>
                  <div className="flex flex-col gap-2.5">
                    <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                      <span>启用神经网络优化器</span>
                      <input type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300 text-blue-650 focus:ring-blue-500" />
                    </label>
                    <label className="flex items-center justify-between text-xs text-slate-600 cursor-pointer">
                      <span>极简模式 (隐藏侧栏)</span>
                      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-650 focus:ring-blue-500" />
                    </label>
                    <div className="text-[10px] text-slate-400 font-mono mt-1 border-t border-slate-100 pt-2 flex justify-between">
                      <span>系统版本 :</span>
                      <span>v2.4.0-beta [Vite]</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Profile Dropdown */}
          <div className="relative">
            <button 
              onClick={() => {
                setProfileOpen(!profileOpen);
                setSettingsOpen(false);
                setNotificationsOpen(false);
              }}
              className="flex items-center gap-1 hover:opacity-90 transition-all cursor-pointer"
            >
              <img 
                src={AVATAR_LEAD} 
                alt="Lead Researcher Profile" 
                className="w-9 h-9 rounded-full border border-slate-200 object-cover shadow-sm ring-2 ring-blue-50/50" 
              />
            </button>

            {profileOpen && (
              <div className="absolute right-0 mt-2.5 w-56 bg-white border border-slate-150 rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex gap-2.5 items-center">
                  <img src={AVATAR_LEAD} alt="Active user" className="w-9 h-9 rounded-full object-cover border" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">首席高级研究员</h4>
                    <span className="text-[10px] text-slate-500 font-mono">lead@aetherlabs.ai</span>
                  </div>
                </div>
                <div className="p-1.5 flex flex-col gap-0.5">
                  <button 
                    onClick={() => { setActiveTab('dashboard'); setProfileOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs rounded-xl hover:bg-slate-50 text-slate-700"
                  >
                    <User className="h-4 w-4 text-slate-400" />
                    个人资料
                  </button>
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs rounded-xl hover:bg-slate-50 text-slate-700">
                    <HelpCircle className="h-4 w-4 text-slate-400" />
                    技术群组
                  </button>
                  <div className="border-t border-slate-100 my-1" />
                  <button className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-rose-600 rounded-xl hover:bg-rose-50">
                    <LogOut className="h-4 w-4" />
                    登出账户
                  </button>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </header>
  );
}
