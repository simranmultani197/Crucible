import type { SandboxRuntime } from '@/lib/sandbox/provider'
import { executeCode } from '@/lib/sandbox/executor'
import { installPackages } from '@/lib/sandbox/manager'
import { inspectCodeRisk, type CodeRiskCheck } from '@/lib/usage/budgets'
import { evaluateEgressPolicy } from '@/lib/security/egress'
import { mcpManager } from '@/lib/mcp/manager'

// ---------------------------------------------------------------------------
// Tool Definitions — Anthropic tool_use format
// ---------------------------------------------------------------------------

export const AGENT_TOOLS = [
  {
    name: 'execute_code' as const,
    description:
      'Write and execute Python or JavaScript code in a sandboxed environment. ' +
      'The sandbox has network access, file system at /home/user/, and pre-installed Python 3.13. ' +
      'Use this for data analysis, web scraping, file generation, calculations, and any task requiring code execution. ' +
      'When creating charts with matplotlib, use plt.savefig() (never plt.show()). ' +
      'For plotly, use fig.write_html() with include_plotlyjs=True. ' +
      'Save output files to /home/user/.',
    input_schema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string' as const,
          description: 'The complete, runnable code to execute.',
        },
        language: {
          type: 'string' as const,
          enum: ['python', 'javascript'],
          description: 'Programming language. Defaults to python.',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'install_packages' as const,
    description:
      'Install Python (pip) or JavaScript (npm) packages in the sandbox. ' +
      'Call this before execute_code if your code needs packages that are not pre-installed. ' +
      'Common pre-installed: standard library only. Popular packages like requests, numpy, pandas, matplotlib must be installed first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        packages: {
          type: 'array' as const,
          items: { type: 'string' as const },
          description: 'List of package names to install.',
        },
        language: {
          type: 'string' as const,
          enum: ['python', 'javascript'],
          description: 'Package manager to use. Defaults to python (pip).',
        },
      },
      required: ['packages'],
    },
  },
  {
    name: 'read_file' as const,
    description:
      'Read the contents of a file from the sandbox filesystem. ' +
      'Useful for inspecting generated output, verifying results, or reading uploaded files. ' +
      'Returns text content (binary files are not supported).',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'Absolute path to the file, e.g. /home/user/data.csv',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file' as const,
    description:
      'Write text content to a file in the sandbox filesystem. ' +
      'Useful for creating configuration files, input data, or writing code files. ' +
      'Parent directories must already exist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: {
          type: 'string' as const,
          description: 'Absolute path for the file, e.g. /home/user/input.json',
        },
        content: {
          type: 'string' as const,
          description: 'The text content to write to the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
]

// ---------------------------------------------------------------------------
// Tool Input Types
// ---------------------------------------------------------------------------

export interface ExecuteCodeInput {
  code: string
  language?: 'python' | 'javascript'
}

export interface InstallPackagesInput {
  packages: string[]
  language?: 'python' | 'javascript'
}

export interface ReadFileInput {
  path: string
}

export interface WriteFileInput {
  path: string
  content: string
}

// ---------------------------------------------------------------------------
// Tool Result
// ---------------------------------------------------------------------------

export interface ToolExecutionResult {
  success: boolean
  output: string
  blocked?: boolean
  blockReason?: string
  riskCheck?: CodeRiskCheck
  executionTimeMs?: number
  files?: Array<{ name: string; path: string; size: number }>
}

// ---------------------------------------------------------------------------
// Pre-execution Safety Check
// ---------------------------------------------------------------------------

export function preExecutionSafetyCheck(
  code: string,
  allowDangerousActions: boolean
): { allowed: boolean; riskCheck: CodeRiskCheck; egressBlocked: string[] } {
  const riskCheck = inspectCodeRisk(code)
  const egressPolicy = evaluateEgressPolicy(code)
  const egressBlocked = egressPolicy.enabled ? egressPolicy.blockedHosts : []

  const allowed =
    (!riskCheck.requiresApproval || allowDangerousActions) &&
    egressBlocked.length === 0

  return { allowed, riskCheck, egressBlocked }
}

// ---------------------------------------------------------------------------
// Tool Executor — routes tool calls to sandbox operations
// ---------------------------------------------------------------------------

export async function executeToolCall(
  toolName: string,
  toolInput: Record<string, unknown>,
  sandbox: SandboxRuntime,
  options: {
    timeoutMs: number
    allowDangerousActions: boolean
  }
): Promise<ToolExecutionResult> {
  switch (toolName) {
    case 'execute_code': {
      const input = toolInput as unknown as ExecuteCodeInput
      const language = input.language || 'python'

      // Safety check before every execution
      const safety = preExecutionSafetyCheck(
        input.code,
        options.allowDangerousActions
      )
      if (!safety.allowed) {
        const reasons = [
          ...safety.riskCheck.reasons,
          ...safety.egressBlocked.map((h) => `Egress blocked: ${h}`),
        ]
        return {
          success: false,
          output: `Execution blocked by safety policy: ${reasons.join('; ')}`,
          blocked: true,
          blockReason: reasons.join('; '),
          riskCheck: safety.riskCheck,
        }
      }

      const result = await executeCode(sandbox, input.code, language, {
        timeoutMs: options.timeoutMs,
      })
      return {
        success: result.success,
        output: result.success
          ? result.output || result.stdout || '(no output)'
          : `Error:\n${result.error || result.stderr}`,
        executionTimeMs: result.executionTimeMs,
        files: result.files,
        riskCheck: safety.riskCheck,
      }
    }

    case 'install_packages': {
      const input = toolInput as unknown as InstallPackagesInput
      const language = input.language || 'python'
      const result = await installPackages(sandbox, input.packages, language)
      return {
        success: result.success,
        output: result.success
          ? `Successfully installed: ${input.packages.join(', ')}`
          : `Package installation failed: ${result.output}`,
      }
    }

    case 'read_file': {
      const input = toolInput as unknown as ReadFileInput
      try {
        const content = await sandbox.readFile(input.path, { format: 'text' })
        const text = typeof content === 'string' ? content : '[binary data]'
        // Truncate large files to avoid context overload
        return {
          success: true,
          output:
            text.length > 8000
              ? text.slice(0, 8000) + '\n...[truncated — file is larger than 8KB]'
              : text,
        }
      } catch (error) {
        return {
          success: false,
          output: `Failed to read file: ${String(error)}`,
        }
      }
    }

    case 'write_file': {
      const input = toolInput as unknown as WriteFileInput
      try {
        await sandbox.writeFile(input.path, input.content)
        return {
          success: true,
          output: `File written successfully: ${input.path} (${input.content.length} bytes)`,
        }
      } catch (error) {
        return {
          success: false,
          output: `Failed to write file: ${String(error)}`,
        }
      }
    }

    default: {
      // Check if this is an MCP tool
      if (mcpManager.isMCPTool(toolName)) {
        return mcpManager.callTool(toolName, toolInput)
      }
      return {
        success: false,
        output: `Unknown tool: ${toolName}`,
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Get All Tools — merges sandbox tools with dynamically discovered MCP tools
// ---------------------------------------------------------------------------

export function getAllTools(): Array<(typeof AGENT_TOOLS)[number] | { name: string; description: string; input_schema: Record<string, unknown> }> {
  const mcpTools = mcpManager.getAnthropicTools()
  return [...AGENT_TOOLS, ...mcpTools]
}
