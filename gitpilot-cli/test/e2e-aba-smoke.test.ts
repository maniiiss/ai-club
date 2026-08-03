/**
 * 端到端原生安装态切换冒烟（设计文档 §14.4 第 6 步的 headless 等价）。
 *
 * 驱动真实 sidecar 二进制 + 本地慢速 OpenAI 兼容流式服务，执行长任务 A 的 A/B/A 切换：
 *  1. 启动长任务 A；
 *  2. 切到任务 B，确认侧栏（list_sessions）保持 A 的运行摘要；
 *  3. 切回 A，确认 runId/startedAt 连续（计时与活动工具不丢）；
 *  4. 再切走等待 A 在后台完成；
 *  5. 切回 A，确认显示精确总耗时（endedAt 已写）且中间过程可展开（messages 非空）。
 *
 * 仅当 sidecar 二进制已构建时运行；缺少二进制时跳过（不阻断单测）。
 */
import { spawn } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDECAR = join(__dirname, "..", "..", "gitpilot-desktop", "src-tauri", "binaries", "gitpilot-rpc-x86_64-pc-windows-msvc.exe");

describe.skipIf(!existsSync(SIDECAR))("执行快照 A/B/A 原生安装态切换冒烟（真实 sidecar）", () => {
	it("长任务 A 切走再切回保持 runId/startedAt 连续，完成后显示精确总耗时", async () => {
		const agentDir = join(tmpdir(), `pi-aba-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const workdir = join(tmpdir(), `pi-aba-work-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(join(agentDir, "sessions"), { recursive: true });
		mkdirSync(workdir, { recursive: true });
		writeFileSync(join(workdir, "target.txt"), "hello from target\n");

		// 第 1 次请求返回 read 工具调用（快速完成 -> 助手消息落盘 -> 会话文件创建），
		// 第 2 次请求慢速流式输出，使 A 在“文件已存在”的前提下保持 running。
		let reqCount = 0;
		const server = createServer((req, res) => {
			if (req.method !== "POST" || !req.url.endsWith("/chat/completions")) {
				res.writeHead(404);
				res.end();
				return;
			}
			res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
			const id = "chatcmpl-smoke";
			const chunk = (delta: Record<string, unknown>, finishReason: string | null = null) =>
				`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: "mock-1", choices: [{ index: 0, delta, finish_reason: finishReason }] })}\n\n`;
			let body = "";
			req.on("data", (d) => {
				body += d;
			});
			req.on("end", async () => {
				reqCount += 1;
				if (reqCount === 1) {
					res.write(chunk({ role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_read", type: "function", function: { name: "read", arguments: "" } }] }));
					await new Promise((r) => setTimeout(r, 50));
					res.write(chunk({ tool_calls: [{ index: 0, function: { arguments: '{"path":"target.txt"}' } }] }));
					res.write(chunk({}, "tool_calls"));
					res.write("data: [DONE]\n\n");
					res.end();
				} else {
					res.write(chunk({ role: "assistant", content: "" }));
					const pieces = ["任务", "A", "已", "执行", "完毕", "。"];
					for (const p of pieces) {
						await new Promise((r) => setTimeout(r, 600));
						res.write(chunk({ content: p }));
					}
					await new Promise((r) => setTimeout(r, 200));
					res.write(chunk({}, "stop"));
					res.write("data: [DONE]\n\n");
					res.end();
				}
			});
		});
		await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
		const port = (server.address() as { port: number }).port;
		const baseUrl = `http://127.0.0.1:${port}/v1`;

		writeFileSync(join(agentDir, "models.json"), JSON.stringify({
			providers: { mock: { baseUrl, api: "openai-completions", apiKey: "dummy", models: [{ id: "mock-1" }] } },
		}));

		const child = spawn(SIDECAR, ["--mode", "rpc"], {
			cwd: workdir,
			env: { ...process.env, PI_CODING_AGENT_DIR: agentDir },
			stdio: ["pipe", "pipe", "pipe"],
		});
		let buf = "";
		const pending = new Map<string, (resp: any) => void>();
		const readyP = new Promise<void>((resolve) => {
			child.stdout.on("data", (d) => {
				buf += d.toString();
				let i;
				while ((i = buf.indexOf("\n")) >= 0) {
					const line = buf.slice(0, i).trim();
					buf = buf.slice(i + 1);
					if (!line) continue;
					let obj: any;
					try {
						obj = JSON.parse(line);
					} catch {
						continue;
					}
					if (obj.type === "ready") {
						resolve();
						continue;
					}
					if (obj.type === "response" && obj.id && pending.has(obj.id)) {
						pending.get(obj.id)!(obj);
						pending.delete(obj.id);
					}
				}
			});
		});
		const send = (cmd: Record<string, unknown>, timeout = 30000): Promise<any> => {
			const id = `r${Math.random().toString(36).slice(2)}`;
			return new Promise((resolve, reject) => {
				const t = setTimeout(() => reject(new Error(`timeout ${cmd.type}`)), timeout);
				pending.set(id, (o) => {
					clearTimeout(t);
					resolve(o);
				});
				child.stdin.write(JSON.stringify({ ...cmd, id }) + "\n");
			});
		};
		const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

		try {
			await readyP;
			expect((await send({ type: "set_model", provider: "mock", modelId: "mock-1" })).success).toBe(true);

			// 1. 启动长任务 A
			const sessionAPath = (await send({ type: "get_state" })).data.sessionFile;
			expect((await send({ type: "prompt", message: "执行任务A" })).success).toBe(true);
			await wait(1500); // 等待 read 工具完成、慢速续跑开始

			const stateRunning = (await send({ type: "get_state" })).data;
			expect(stateRunning.execution.status).toBe("running");
			expect(typeof stateRunning.execution.runId).toBe("string");
			expect(typeof stateRunning.execution.startedAt).toBe("number");
			const runIdA = stateRunning.execution.runId;
			const startedAtA = stateRunning.execution.startedAt;

			// 2. 切到任务 B：A 被挂起，侧栏保持 A 运行摘要
			const newB = await send({ type: "new_session" });
			expect(newB.success && !newB.data.cancelled).toBe(true);
			const list1 = (await send({ type: "list_sessions", scope: "all" })).data;
			const itemA = list1.sessions.find((s: any) => s.path.replace(/\\/g, "/") === sessionAPath.replace(/\\/g, "/"));
			expect(itemA?.execution?.status).toBe("running");

			// 3. 切回 A：runId/startedAt 连续（计时与活动工具不丢）
			const swA = await send({ type: "switch_session", sessionPath: sessionAPath });
			expect(swA.data.snapshot).toBeTruthy();
			expect(swA.data.snapshot.execution.runId).toBe(runIdA);
			expect(swA.data.snapshot.execution.startedAt).toBe(startedAtA);
			expect(swA.data.snapshot.execution.status).toBe("running");

			// 4. 再切走（new_session），等待 A 在后台完成
			expect((await send({ type: "new_session" })).data.cancelled).toBe(false);
			let completedA: any = null;
			for (let k = 0; k < 40 && !completedA; k++) {
				await wait(500);
				const list = (await send({ type: "list_sessions", scope: "all" })).data;
				const a = list.sessions.find((s: any) => s.path.replace(/\\/g, "/") === sessionAPath.replace(/\\/g, "/"));
				if (a?.execution?.status === "completed") completedA = a.execution;
			}
			expect(completedA?.status).toBe("completed");

			// 5. 切回 A：精确总耗时（endedAt 已写），中间过程可展开（messages 非空）
			const swA2 = await send({ type: "switch_session", sessionPath: sessionAPath });
			const snapA2 = swA2.data.snapshot;
			expect(snapA2.execution.runId).toBe(runIdA);
			expect(snapA2.execution.startedAt).toBe(startedAtA);
			expect(typeof snapA2.execution.endedAt).toBe("number");
			expect(snapA2.execution.endedAt - snapA2.execution.startedAt).toBeGreaterThan(0);
			expect(Array.isArray(snapA2.messages) && snapA2.messages.length).toBeGreaterThan(0);
		} finally {
			child.kill("SIGTERM");
			server.close();
			try {
				rmSync(agentDir, { recursive: true, force: true });
			} catch {}
			try {
				rmSync(workdir, { recursive: true, force: true });
			} catch {}
		}
	}, 60000);
});
