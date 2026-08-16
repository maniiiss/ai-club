import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(scriptDir, '..');
const openDesignRoot = path.resolve(desktopRoot, '..', '..', 'open-design');
const sourceRoot = path.join(openDesignRoot, 'design-systems');
const targetRoot = path.join(desktopRoot, 'src', 'design', 'presets');

// 品牌名保留可识别的中文译名，风格类预设使用稳定的中文产品名，避免页面出现一长串英文标题。
const titles = {
  agentic: '智能体工作台', airbnb: '爱彼迎旅行', airtable: '数据协作表格', ant: '蚂蚁企业服务', apple: '苹果简约', application: '通用应用界面',
  arc: '新潮浏览器', artistic: '艺术展陈', 'atelier-zero': '极简工作室', bento: '便当卡片布局', binance: '币安交易', bmw: '宝马驾控',
  'bmw-m': '宝马性能驾控', bold: '大胆排版', brutalism: '粗野排版', bugatti: '布加迪奢华', cafe: '咖啡馆氛围', cal: '日历日程', canva: '在线创作',
  cisco: '企业网络', claude: '克劳德对话', clay: '柔和黏土', claymorphism: '黏土拟态', clean: '清爽极简', clickhouse: '数据分析',
  'cloudflare-kumo': '云端极光', cohere: '企业智能', coinbase: '数字资产', colorful: '缤纷活力', composio: '自动化集成',
  contemporary: '当代艺术', corporate: '商务企业', cosmic: '宇宙探索', creative: '创意工作室', cursor: '开发工具', dashboard: '数据看板',
  default: '中性现代', discord: '社群聊天', dithered: '像素抖动', doodle: '手绘涂鸦', dramatic: '戏剧张力', duolingo: '多邻国学习',
  editorial: '编辑杂志', elegant: '典雅高级', elevenlabs: '语音实验室', energetic: '动感活力', enterprise: '企业管理', expo: '展会展示',
  expressive: '自由表现', fantasy: '奇幻世界', ferrari: '法拉利竞速', figma: '协作设计', flat: '扁平清晰', framer: '动效创作', friendly: '亲和友好',
  futuristic: '未来科技', github: '代码协作', glassmorphism: '玻璃拟态', gradient: '渐变色彩', hashicorp: '云原生工程', hud: '科幻抬头显示',
  huggingface: '开源模型', ibm: '企业蓝调', intercom: '客户沟通', kami: '和纸工艺', kraken: '深海交易', lamborghini: '兰博基尼运动', levels: '层级信息',
  'linear-app': '线性任务', lingo: '多语言协作', loom: '视频协作', lovable: '快速建站', luxury: '奢华质感', mastercard: '万事达支付', material: '材料设计',
  meta: '社交商店', minimal: '极简留白', minimax: '迷你麦克斯智能', mintlify: '开发者文档', miro: '白板协作', 'mission-control': '任务指挥中心',
  'mistral-ai': '密斯特拉尔智能', modern: '现代简约', mongodb: '文档数据库', mono: '单色极简', neobrutalism: '新粗野主义', neon: '霓虹夜色',
  neumorphism: '新拟态', nike: '耐克运动', notion: '知识笔记', nvidia: '英伟达科技', ollama: '本地模型', openai: '开放智能', 'opencode-ai': '开放开发',
  pacman: '吃豆人游戏', paper: '纸感排版', perplexity: '智能搜索', perspective: '透视构图', pinterest: '灵感收藏', playstation: '主机游戏',
  posthog: '产品分析', premium: '高级质感', professional: '专业商务', publication: '出版排版', raycast: '效率启动器', refined: '精致克制', renault: '雷诺汽车',
  replicate: '模型部署', resend: '邮件服务', retro: '复古像素', revolut: '数字金融', runwayml: '影像创作', sanity: '内容管理', sentry: '异常监控',
  shadcn: '简约组件', shopify: '电商商店', simple: '简明易用', skeumorphism: '拟物设计', slack: '团队沟通', sleek: '利落现代', spacex: '太空探索',
  spacious: '宽松留白', spotify: '音乐流媒体', starbucks: '星巴克咖啡', storytelling: '故事叙事', stripe: '在线支付', supabase: '后端服务',
  superhuman: '高效邮件', tesla: '特斯拉科技', tetris: '俄罗斯方块', theverge: '科技媒体', 'together-ai': '协同智能', 'tom-modern': '现代杂志',
  'totality-festival': '日食节庆', 'trading-terminal': '交易终端', uber: '优步出行', urdu: '乌尔都文字', vercel: '前端部署', vibrant: '鲜活多彩',
  vintage: '复古怀旧', vodafone: '沃达丰通信', voltagent: '智能代理框架', 'warm-editorial': '温暖编辑', warp: '现代终端', webex: '视频会议',
  webflow: '网页创作', wechat: '微信生态', wired: '科技杂志', wise: '国际汇款', 'x-ai': '艾克斯智能', xiaohongshu: '小红书生活', zapier: '自动化连接',
};

const viewportSets = [
  { name: '手机', width: 390, height: 844, category: 'mobile' },
  { name: '平板', width: 768, height: 1024, category: 'tablet' },
  { name: '桌面', width: 1440, height: 900, category: 'desktop' },
];

await mkdir(targetRoot, { recursive: true });
const entries = await readdir(sourceRoot, { withFileTypes: true });
let migrated = 0;
for (const entry of entries) {
  if (!entry.isDirectory() || entry.name === '_schema') continue;
  const id = entry.name;
  const sourceDir = path.join(sourceRoot, id);
  const sourceManifest = JSON.parse(await readFile(path.join(sourceDir, 'manifest.json'), 'utf8'));
  const title = titles[id] ?? `设计系统 ${id}`;
  const targetDir = path.join(targetRoot, id);
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const manifest = {
    schema: 'open-design.design-manifest.v1',
    title,
    description: `来自 Open Design 的${title}设计系统。`,
    entryFile: 'index.html',
    license: 'unknown',
    metadata: {
      source: 'Open Design',
      attribution: sourceManifest.source?.origin ?? 'Open Design design-systems catalog',
    },
    responsiveViewports: viewportSets,
  };
  await writeFile(path.join(targetDir, 'DESIGN-MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  await cp(path.join(sourceDir, 'DESIGN.md'), path.join(targetDir, 'DESIGN-HANDOFF.md'));
  await cp(path.join(sourceDir, 'components.html'), path.join(targetDir, 'index.html'));
  migrated += 1;
}
console.log(`Migrated ${migrated} Open Design presets into ${targetRoot}`);
