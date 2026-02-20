// Pre-configured sandbox templates for common use cases
// For MVP, we use the default E2B sandbox. These templates
// are reserved for future expansion.

export const SANDBOX_TEMPLATES = {
  default: {
    id: 'default',
    name: 'Default Python',
    description: 'Python 3.11 with basic tools',
    preInstalledPackages: [],
  },
  datascience: {
    id: 'datascience',
    name: 'Data Science',
    description: 'Python with pandas, numpy, matplotlib pre-installed',
    preInstalledPackages: ['pandas', 'numpy', 'matplotlib'],
  },
  web: {
    id: 'web',
    name: 'Web Scraping',
    description: 'Python with requests, beautifulsoup4 pre-installed',
    preInstalledPackages: ['requests', 'beautifulsoup4', 'lxml'],
  },
} as const
