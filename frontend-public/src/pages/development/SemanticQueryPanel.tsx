/** 项目成员的只读语义查询面板；必须先预览并由用户确认后才会请求执行。 */
import { useCallback, useEffect, useState } from 'react'
import { Database, Play, Search, ShieldCheck } from 'lucide-react'
import { executeProjectDataQuery, interpretProjectDataQuery, listProjectSemanticModels, previewProjectDataQuery } from '@/src/api/dataWorkbench'
import { Button } from '@/src/components/common/Button'
import { Card } from '@/src/components/common/Card'
import { EmptyState } from '@/src/components/common/EmptyState'
import { Select } from '@/src/components/common/Select'
import { getErrorMessage } from '@/src/lib/utils'
import type { QueryExecution, QueryInterpretation, QueryPreview, SemanticModelItem } from '@/src/types/dataWorkbench'

export const SemanticQueryPanel = ({ projectId }: { projectId: number }) => {
  const [models, setModels] = useState<SemanticModelItem[]>([]); const [modelId, setModelId] = useState(''); const [text, setText] = useState('查询本周订单数量');
  const [interpretation, setInterpretation] = useState<QueryInterpretation | null>(null); const [preview, setPreview] = useState<QueryPreview | null>(null); const [result, setResult] = useState<QueryExecution | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => { try { const data = await listProjectSemanticModels(projectId); const published = data.filter((item) => item.status === 'PUBLISHED'); setModels(published); setModelId((current) => current || String(published[0]?.id || '')) } catch (e) { setError(getErrorMessage(e)) } }, [projectId])
  useEffect(() => { load() }, [load])
  const interpret = async () => { if (!modelId || !text.trim()) return; setBusy(true); setError(null); setPreview(null); setResult(null); try { setInterpretation(await interpretProjectDataQuery(projectId, { semanticModelId: Number(modelId), text: text.trim() })) } catch (e) { setError(getErrorMessage(e)) } finally { setBusy(false) } }
  const previewQuery = async () => { if (!interpretation) return; setBusy(true); setError(null); try { setPreview(await previewProjectDataQuery(projectId, interpretation.requestId)) } catch (e) { setError(getErrorMessage(e)) } finally { setBusy(false) } }
  const execute = async () => { if (!preview) return; setBusy(true); setError(null); try { setResult(await executeProjectDataQuery(projectId, preview.requestId, preview.previewToken)) } catch (e) { setError(getErrorMessage(e)) } finally { setBusy(false) } }
  if (models.length === 0) return <Card title="语义数据查询"><EmptyState title="暂无已发布语义模型" description="请由项目管理员完成数据源扫描、语义定义并发布后再使用查询。" icon={<Database className="h-6 w-6" />} /></Card>
  return <div className="space-y-4"><Card title="自然语言数据查询"><div className="space-y-3"><Select label="业务口径" value={modelId} onChange={setModelId} options={models.map((m) => ({ value: String(m.id), label: `${m.name} · v${m.versionNo}` }))} /><textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[110px] w-full rounded-lg border border-[var(--color-border-strong)] p-3 text-sm" /><div className="flex gap-2"><Button loading={busy} onClick={interpret} icon={<Search className="h-4 w-4" />}>理解问题</Button><Button disabled={!interpretation} loading={busy} variant="secondary" onClick={previewQuery} icon={<ShieldCheck className="h-4 w-4" />}>预览 DSL</Button><Button disabled={!preview} loading={busy} onClick={execute} icon={<Play className="h-4 w-4" />}>确认并执行</Button></div>{error && <p className="text-sm text-red-600">{error}</p>}</div></Card>{interpretation && <Card title="理解与口径"><pre className="overflow-auto text-xs">{JSON.stringify(interpretation, null, 2)}</pre></Card>}{preview && <Card title="SQL 摘要（参数已脱敏）"><pre className="overflow-auto text-xs">{preview.sqlSummary}</pre></Card>}{result && <Card title="查询结果"><p className="mb-3 text-sm text-[var(--color-text-secondary)]">{result.summary}</p><pre className="max-h-80 overflow-auto text-xs">{JSON.stringify(result.rows, null, 2)}</pre></Card>}</div>
}
