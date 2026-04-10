# 编码与中文防乱码约定

## 统一规则
- 仓库所有源码文件统一使用 UTF-8
- 行尾统一使用 LF
- 不要使用 PowerShell 的 `Set-Content`、`Out-File`、`>`、`>>` 直接修改包含中文的源码
- 推荐使用 VS Code / IntelliJ 直接编辑，或使用 Python 显式指定 `encoding="utf-8"`

## VS Code
本仓库已提供：
- `.editorconfig`
- `.vscode/settings.json`
- `.vscode/tasks.json`

打开仓库后，VS Code 会默认按 UTF-8 保存。

## 检查脚本
运行下面命令检查疑似乱码：

```bash
python scripts/check_encoding.py
```

也可以在 VS Code 中执行任务：`检查编码乱码`

## 安全写文件示例
```python
from pathlib import Path

Path("example.txt").write_text("中文内容", encoding="utf-8")
```
