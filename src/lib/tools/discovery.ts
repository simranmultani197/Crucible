import { TOOL_REGISTRY } from './registry'
import type { ToolEntry } from '@/types/tools'

export function discoverTools(
  query: string,
  suggestedPackages: string[],
  language: string
): ToolEntry[] {
  const queryLower = query.toLowerCase()
  const matched: Array<{ tool: ToolEntry; score: number }> = []

  for (const tool of TOOL_REGISTRY) {
    let score = 0

    // Match against capabilities
    for (const cap of tool.capabilities) {
      if (queryLower.includes(cap)) {
        score += 2
      }
    }

    // Match against suggested packages from router
    const toolPackages = tool.packages[language as 'python' | 'javascript'] || []
    for (const pkg of suggestedPackages) {
      if (toolPackages.includes(pkg)) {
        score += 3
      }
    }

    // Match against tool name/description
    if (queryLower.includes(tool.name.toLowerCase())) {
      score += 2
    }

    if (score > 0) {
      matched.push({ tool, score })
    }
  }

  // Sort by score, return top matches
  return matched
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((m) => m.tool)
}

export function getPackagesToInstall(tools: ToolEntry[], language: string): string[] {
  const packages = new Set<string>()
  for (const tool of tools) {
    const pkgs = tool.packages[language as 'python' | 'javascript'] || []
    pkgs.forEach((p) => packages.add(p))
  }
  return Array.from(packages)
}
