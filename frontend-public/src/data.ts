import { Project, Agent, Log, Task, Recommendation } from './types';

// Avatars hotlinks provided in the HTML reference
export const AVATAR_LEAD = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDZS6iipjm5ymTV4hDYZpZxYKnMGmJ1ja77wOedUCC7mgYzma2GDqhBsQtf7m3ZFwjLLJ5PaEFm5pIB5mLfkMlXO__3dBO5Ueze8v-io5ipWXkFKp2Y8G79UOm4_F8X-tFFviC1c42FR6NPDGlSeOs1RGLEnUWzKzQdpbnwEjNR-_2K0AJ5YKGM6RUKzx0vxabynHWY9NGd4_jo_GDYc6E-J2MHHjJ5vJzn__zMje3M97b2iIUUpALQrztu-7CKfNeH0ZlVBrx01n8';
export const AVATAR_RESEARCHER = 'https://lh3.googleusercontent.com/aida-public/AB6AXuA78iHkkkPfkstwYZaYqsMvEOTg5MAe-C2S8A-GCncWS-BwJXNaeyXOB0uHk_tK4wvKyUnTtrmyjd3iofUVJw2XuD4YKYNPSKkMyU0zcWxTUTc0qvlOf8QqJKrDqcGNnJsDIjfIPC9crZk-tE7FTZ9gYzeSYcek-tG7HGXVvdLfUNpZUaUwXEe5_Xy1stRpCke-_FRbQRqIFcvsnepz7orIzVScViRLnBGzqZ5GptDsYd3OlqW2UAo_iCVipdV4wlP3NYV6Q12aNKk';
export const AVATAR_MEMBER_1 = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDujLQZIA7LYZ7VoMBnC-4iR6YzMVLg3uypLuCk-mW3BUXj-5d5ErT-hxgh--8pLoZqVWbvzufRJbRpEMr2WUosWfYJIjE3jafIWjnK1sevqLXFtxKq8_DCMVMSEPxdilZqdqLjM9RUbNRnKCcDJMcOd4Sba-1p2lvSo6EPHb-oq5Hj-GIQvvzdJ2lW_v4fyT8mHIxLxbJrQe4QytJTkSQwuAceF5BKHOywWQS5Q2Vv-QleoLnqrWn_0DsbQLEhGEtAAFd5jBMPvC4';
export const AVATAR_MEMBER_2 = 'https://lh3.googleusercontent.com/aida-public/AB6AXuCWPhvfAoEymM5xmCu3QoI44OhRJbX5s7djKsLHtgU1uYA-qrw0cvvrwzwuGgWcgNvf-TAHtBBsqqMQd5TwefTssBQC0Mulz6EBtjq_CW_8tuF8e2-DlVeQIdjS9Ic0V63kjd4VKVKlBe3p21Pw19T1Yde1d9rX7mPY6iWpQvCtWP_LZs8xNOSNFFCNENvqGBBQvT_ZLp4KnCPZaGbgjXv3vAKCuBx1grzLh40TCrrZAw8dLzCoRVBpK9fhTYSFm1ZfPL52cwPEWnU';
export const AVATAR_MEMBER_3 = 'https://lh3.googleusercontent.com/aida-public/AB6AXuBbpVGtLf39I5gj6pliLWLc55Izhb35SQPGZA5mx4st8X-dYD_YsHdbNX8Zq46HOQcyGWi2dU4Dog6jcSRrrj1jSTEOs8e5S_1ZDXneaC0Mwis5l384mOT55M-NYBS-KxMHbSlGpn24SOPqrhxhJsGgUxYH41W52JoeCoZWQ_GVEuXDWAq1093sxEBvbJFTBqlD4leviSIPoQSXIAUzRkjCUwQExaHYQhrORKUSe6rt6p7qD5x8SrySON4xtiU1Bl-cLKLgwtuGgtQ';
export const AVATAR_MEMBER_4 = 'https://lh3.googleusercontent.com/aida-public/AB6AXuC9r0ZU5xujF6uOH5y13U-Zge6mJ7_ryqcmZccBBm01IWcASjRJYLsCFWRqLw9KlLXhOQFSjZ6QEhiTGJfqUq3tNl1vkkeNDIVGjVem7EuWUwO8DP4UREeR_ZlPMl7AdIS-Lbar8OgKl1MPH_molCEZLdQ_1JHoJ84BBuVYDKTxqm9Ggt04eAW4pC1TCn6A6Pg_snu4kCjxQtlC5YwT4XT6915qRn78wVE5cIHopQOqHhGF078EWnmakt90wywwc6kRVFM-L-_emsY';
export const AVATAR_MEMBER_5 = 'https://lh3.googleusercontent.com/aida-public/AB6AXuD7I1ideXBf8pZM1heIyJDsC0KJvHp_t0xF1ty3zblS66fWtaGNvhyfjF9x1KAOhyY2_VpJwXxNhl2Z-PCHHaYjIGnh0tkJr4PkrgM0gpsOGr6z5cyQukbnj7XdOyRQh1WJ_EpZSxKNYBxxW6oT8ly6N_hTU4OkN6XGnTpmr81SJcQx7kTPcEI_gBumr8RWheXnWDQzdgSfGHctcZgA7sDAyzPaxjjF9ck9hnSUMA_Pl7oi8InxoKLyhaY09jRhPnA4QE5-X9WTbOU';

export const initialProjects: Project[] = [
  {
    id: 'p1',
    name: 'Project Alpha-7',
    description: '神经网络架构优化与超参数调整。',
    status: 'conducting',
    suggestion: 'AI 建议: 增加层深度以提高精度'
  },
  {
    id: 'p2',
    name: 'Nexus Core V2',
    description: '核心数据流处理引擎升级。',
    status: 'archived',
    suggestion: '已于 2 天前完成部署'
  }
];

export const initialAgents: Agent[] = [
  {
    id: 'a1',
    name: '代码审查代理',
    task: '正在分析 PR #402',
    status: 'active'
  },
  {
    id: 'a2',
    name: '性能监控代理',
    task: '检测到延迟波动',
    status: 'active'
  },
  {
    id: 'a3',
    name: '文档生成代理',
    task: '空闲',
    status: 'idle'
  }
];

export const initialLogs: Log[] = [
  {
    id: 'l1',
    user: '张伟',
    action: '提交了代码到',
    detail: 'main 分支',
    timestamp: '10 分钟前',
    iconName: 'commit',
    type: 'code'
  },
  {
    id: 'l2',
    user: '李娜',
    action: '更新了项目需求文档',
    detail: '45 分钟前',
    timestamp: '45 分钟前',
    iconName: 'description',
    type: 'doc'
  },
  {
    id: 'l3',
    user: '系统',
    action: '成功部署了',
    detail: 'v2.4.0-beta',
    timestamp: '2 小时前',
    iconName: 'rocket_launch',
    type: 'system'
  }
];

export const initialTasks: Task[] = [
  {
    id: 't1',
    title: 'Implement WebGL Shader Backgrounds',
    category: 'Frontend',
    priority: 'medium',
    status: 'todo',
    commentsCount: 2,
    assigneeAvatar: AVATAR_LEAD,
    checklists: [
      { id: 'c1', text: 'Parse configuration json', completed: false },
      { id: 'c2', text: 'Inject three.js dependency', completed: false }
    ]
  },
  {
    id: 't2',
    title: 'Sync Semantic Navigation State Logic',
    category: 'API Integration',
    priority: 'high',
    status: 'inprogress',
    commentsCount: 0,
    commitsCount: 4,
    assigneeAvatar: AVATAR_RESEARCHER
  },
  {
    id: 't3',
    title: 'Update Token Variables for Glassmorphism',
    category: 'Design System',
    priority: 'low',
    status: 'review',
    commentsCount: 1,
    assigneeAvatar: AVATAR_MEMBER_1
  }
];

export const initialRecommendations: Recommendation[] = [
  {
    id: 'r1',
    title: 'Scale down DB Replicas',
    description: 'Traffic pattern suggests -20% capacity needed.',
    badge: 'optimization',
    applied: false,
    icon: 'tune',
    impact: { latency: 1, errorRate: 0.00, cpuUsage: -12 }
  },
  {
    id: 'r2',
    title: 'Re-allocate Cache',
    description: 'Optimize Redis shards for lower latency.',
    badge: 'reallocation',
    applied: false,
    icon: 'memory',
    impact: { latency: -14, errorRate: -0.01, cpuUsage: -8 }
  }
];

export const initialRequirementText = `The user authentication module needs to be completely rewritten to support biometrics.

Currently, we only support email/password and standard OAuth. We need to integrate Apple FaceID and Android BiometricPrompt.

It should fallback seamlessly if hardware isn't available.`;
