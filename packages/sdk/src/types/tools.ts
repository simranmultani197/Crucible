export interface ToolEntry {
  id: string
  name: string
  description: string
  packages: {
    python?: string[]
    javascript?: string[]
  }
  capabilities: string[]
  category: string
}

export interface PackageInstallResult {
  success: boolean
  output: string
}
