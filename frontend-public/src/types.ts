export type Tab = 'dashboard' | 'labs' | 'kanban' | 'ops' | 'docs';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'conducting' | 'archived'; // 进行中 | 已归档
  suggestion?: string;
  updatedText?: string;
}

export interface Agent {
  id: string;
  name: string;
  task: string;
  status: 'active' | 'idle';
}

export interface Log {
  id: string;
  user: string;
  action: string;
  detail: string;
  timestamp: string;
  iconName: 'commit' | 'description' | 'rocket_launch' | 'plus';
  type: 'code' | 'doc' | 'system' | 'user';
}

export interface Task {
  id: string;
  title: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'inprogress' | 'review';
  commentsCount: number;
  commitsCount?: number;
  assigneeAvatar: string;
  checklists?: { id: string; text: string; completed: boolean }[];
}

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  badge: 'optimization' | 'reallocation';
  applied: boolean;
  icon: string;
  impact: {
    latency: number; // change in ms, e.g. -5ms
    errorRate: number; // e.g. -0.01%
    cpuUsage: number; // e.g. -12%
  };
}

export interface StandardRequirement {
  id: string;
  code: string;
  title: string;
  content: string;
}
