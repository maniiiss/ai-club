# code-processing

代码处理服务，基于 FastAPI 构建，提供代码扫描和 MR 审查功能。

主要功能：

- 代码扫描
- MR 审查
- 代码分析
- Diff 解析
- Prompt 生成与处理

## 启动

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -e .
uvicorn app.main:app --reload --port 9000
```

默认启动地址：`http://localhost:9000`

## API 文档

启动后访问：`http://localhost:9000/docs`
