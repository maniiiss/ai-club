import { createInterface } from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'

export interface TerminalMenuItem {
  value: string
  label: string
  description: string
}

/** 按用户已输入的命令前缀筛选菜单，保证 `/` 一出现就有可见候选项。 */
export const filterMenuItems = (buffer: string, items: readonly TerminalMenuItem[]) => {
  const query = buffer.trim().toLowerCase()
  if (!query.startsWith('/')) return []
  return items.filter((item) => item.value.toLowerCase().startsWith(query))
}

interface TerminalInput {
  readonly input: NodeJS.ReadStream
  readonly output: NodeJS.WriteStream
}

const ANSI = {
  clearLine: '\u001b[2K',
  cursorUp: (count: number) => `\u001b[${count}A`,
  cursorDown: (count: number) => `\u001b[${count}B`,
  cursorColumn: (count: number) => `\u001b[${count}G`,
}

const supportsColor = (output: NodeJS.WriteStream) => Boolean(output.isTTY && !process.env.NO_COLOR)
const paint = (output: NodeJS.WriteStream, code: string, value: string) => supportsColor(output) ? `\u001b[${code}m${value}\u001b[0m` : value

/**
 * GitPilot 的终端输入控制器。
 * 业务意图：把命令菜单和输入编辑放在同一层，避免 Agent 执行期间残留 raw mode 或破坏用户终端状态。
 */
export class TerminalUi {
  private readonly input: NodeJS.ReadStream
  private readonly output: NodeJS.WriteStream

  constructor(options: Partial<TerminalInput> = {}) {
    this.input = options.input || process.stdin
    this.output = options.output || process.stdout
  }

  private canUseRawMode() {
    return Boolean(this.input.isTTY && typeof this.input.setRawMode === 'function' && this.output.isTTY)
  }

  private async readFallback(prompt: string) {
    const readline = createInterface({ input: this.input, output: this.output })
    try {
      return await readline.question(prompt)
    } finally {
      readline.close()
    }
  }

  private renderMenu(prompt: string, buffer: string, items: TerminalMenuItem[], selectedIndex: number, previousMenuLines: number) {
    if (previousMenuLines > 0) {
      this.output.write(ANSI.cursorDown(previousMenuLines))
      for (let index = 0; index < previousMenuLines; index += 1) {
        this.output.write(`${ANSI.clearLine}\r`)
        if (index < previousMenuLines - 1) this.output.write(ANSI.cursorUp(1))
      }
      // 清理完最后一行后，光标仍在第一条菜单行，需要回到输入行再重绘。
      this.output.write(ANSI.cursorUp(1))
    }

    this.output.write(`\r${ANSI.clearLine}${prompt}${buffer}`)
    if (items.length === 0) return 0

    for (const [index, item] of items.entries()) {
      const selected = index === selectedIndex
      const prefix = selected ? '  › ' : '    '
      const line = `${prefix}${item.value.padEnd(12)} ${item.description}`
      this.output.write(`\n${selected ? paint(this.output, '48;5;214;30', line) : paint(this.output, '90', line)}`)
    }
    this.output.write(`\n${paint(this.output, '90', '  ↑↓ select  Enter confirm  Esc close')}`)
    const menuLines = items.length + 1
    this.output.write(ANSI.cursorUp(menuLines))
    this.output.write(ANSI.cursorColumn(prompt.length + buffer.length + 1))
    return menuLines
  }

  /** 读取一行；当输入以 / 开始时，菜单会在按键过程中实时刷新。 */
  async readLine(prompt: string, getMenuItems: (buffer: string) => TerminalMenuItem[] = () => []): Promise<string> {
    if (!this.canUseRawMode()) return this.readFallback(prompt)

    emitKeypressEvents(this.input)
    this.input.setRawMode!(true)
    this.input.resume()

    let buffer = ''
    let selectedIndex = 0
    let renderedMenuLines = 0

    return new Promise<string>((resolve) => {
      const cleanup = (value: string) => {
        this.input.removeListener('keypress', onKeypress)
        this.input.setRawMode!(false)
        if (renderedMenuLines > 0) {
          this.output.write(ANSI.cursorDown(renderedMenuLines))
          for (let index = 0; index < renderedMenuLines; index += 1) {
            this.output.write(`${ANSI.clearLine}\r`)
            if (index < renderedMenuLines - 1) this.output.write(ANSI.cursorUp(1))
          }
          this.output.write(ANSI.cursorUp(1))
        }
        this.output.write(`\r${ANSI.clearLine}${prompt}${value === '/exit' ? '' : value}\n`)
        resolve(value)
      }

      const render = () => {
        const items = buffer.startsWith('/') ? getMenuItems(buffer) : []
        if (selectedIndex >= items.length) selectedIndex = Math.max(0, items.length - 1)
        renderedMenuLines = this.renderMenu(prompt, buffer, items, selectedIndex, renderedMenuLines)
        return items
      }

      const onKeypress = (character: string, key: { name?: string; ctrl?: boolean; meta?: boolean; sequence?: string }) => {
        if (key.ctrl && key.name === 'c') return cleanup('/exit')
        if (key.name === 'return' || key.name === 'enter') {
          const items = buffer.startsWith('/') ? getMenuItems(buffer) : []
          if (items.length > 0 && buffer.trim().length > 0) return cleanup(items[selectedIndex]?.value || buffer)
          return cleanup(buffer)
        }
        if (key.name === 'escape') {
          if (buffer.startsWith('/')) {
            buffer = ''
            selectedIndex = 0
            render()
            return
          }
          return cleanup('')
        }
        if (key.name === 'up' || key.name === 'down') {
          const items = buffer.startsWith('/') ? getMenuItems(buffer) : []
          if (items.length > 0) {
            selectedIndex = key.name === 'up'
              ? (selectedIndex - 1 + items.length) % items.length
              : (selectedIndex + 1) % items.length
            render()
          }
          return
        }
        if (key.name === 'backspace') {
          buffer = buffer.slice(0, -1)
          selectedIndex = 0
          render()
          return
        }
        if (!key.ctrl && !key.meta && character && character >= ' ') {
          buffer += character
          selectedIndex = 0
          render()
        }
      }

      this.input.on('keypress', onKeypress)
      render()
    })
  }

  async select(prompt: string, items: TerminalMenuItem[]): Promise<string> {
    const result = await this.readLine(prompt, () => items)
    return result
  }

  printCommandMenu(items: TerminalMenuItem[]) {
    this.output.write('\n')
    for (const item of items) this.output.write(`  ${item.value.padEnd(12)} ${item.description}\n`)
  }
}
