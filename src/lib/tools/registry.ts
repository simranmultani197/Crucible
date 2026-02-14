import type { ToolEntry } from '@/types/tools'

export const TOOL_REGISTRY: ToolEntry[] = [
  // Data Analysis
  {
    id: 'data-analysis',
    name: 'Data Analysis Suite',
    description: 'Pandas, NumPy for data manipulation and analysis',
    packages: { python: ['pandas', 'numpy'] },
    capabilities: ['csv', 'data', 'dataframe', 'analysis', 'statistics', 'table', 'spreadsheet', 'excel'],
    category: 'data',
  },
  {
    id: 'data-visualization',
    name: 'Data Visualization',
    description: 'Matplotlib and Plotly for creating charts and graphs',
    packages: { python: ['matplotlib', 'plotly'] },
    capabilities: ['chart', 'graph', 'plot', 'visualization', 'histogram', 'scatter', 'bar chart', 'pie chart'],
    category: 'data',
  },
  // Web Scraping
  {
    id: 'web-scraping',
    name: 'Web Scraping',
    description: 'Requests and BeautifulSoup for fetching and parsing web pages',
    packages: { python: ['requests', 'beautifulsoup4', 'lxml'] },
    capabilities: ['scrape', 'fetch', 'website', 'url', 'html', 'web page', 'download page', 'crawl'],
    category: 'web',
  },
  // Finance
  {
    id: 'finance',
    name: 'Financial Data',
    description: 'yfinance for stock prices and financial data',
    packages: { python: ['yfinance', 'pandas'] },
    capabilities: ['stock', 'price', 'finance', 'market', 'ticker', 'shares', 'portfolio', 'investment'],
    category: 'finance',
  },
  // API Interaction
  {
    id: 'api-client',
    name: 'API Client',
    description: 'Requests for making HTTP API calls',
    packages: { python: ['requests'] },
    capabilities: ['api', 'rest', 'http', 'endpoint', 'json', 'fetch data', 'call api'],
    category: 'web',
  },
  // Image Processing
  {
    id: 'image-processing',
    name: 'Image Processing',
    description: 'Pillow for image manipulation',
    packages: { python: ['Pillow'] },
    capabilities: ['image', 'resize', 'crop', 'filter', 'thumbnail', 'convert image', 'png', 'jpg'],
    category: 'media',
  },
  // PDF Processing
  {
    id: 'pdf',
    name: 'PDF Processing',
    description: 'PyPDF2 for reading and manipulating PDFs',
    packages: { python: ['PyPDF2', 'pdfplumber'] },
    capabilities: ['pdf', 'extract text', 'read pdf', 'pdf pages'],
    category: 'document',
  },
  // Machine Learning
  {
    id: 'ml-basic',
    name: 'Machine Learning',
    description: 'Scikit-learn for ML tasks',
    packages: { python: ['scikit-learn', 'pandas', 'numpy'] },
    capabilities: ['machine learning', 'predict', 'classify', 'regression', 'cluster', 'train model', 'ml'],
    category: 'ml',
  },
  // File Conversion
  {
    id: 'file-conversion',
    name: 'File Conversion',
    description: 'Tools for converting between file formats',
    packages: { python: ['pandas', 'openpyxl', 'python-pptx'] },
    capabilities: ['convert', 'xlsx', 'csv to json', 'json to csv', 'excel', 'transform'],
    category: 'document',
  },
  // Text Processing / NLP
  {
    id: 'nlp',
    name: 'Text Processing',
    description: 'NLTK for natural language processing',
    packages: { python: ['nltk'] },
    capabilities: ['sentiment', 'tokenize', 'nlp', 'text analysis', 'word frequency', 'language'],
    category: 'ml',
  },
  // Web Automation
  {
    id: 'web-automation',
    name: 'Web Automation',
    description: 'Selenium for browser automation',
    packages: { python: ['selenium', 'webdriver-manager'] },
    capabilities: ['automate browser', 'selenium', 'click', 'fill form', 'screenshot website'],
    category: 'web',
  },
  // Crypto
  {
    id: 'crypto-data',
    name: 'Cryptocurrency Data',
    description: 'Fetch crypto prices and data',
    packages: { python: ['requests', 'pandas'] },
    capabilities: ['crypto', 'bitcoin', 'ethereum', 'cryptocurrency', 'coin price'],
    category: 'finance',
  },
  // Date/Time
  {
    id: 'datetime',
    name: 'Date & Time Utilities',
    description: 'Arrow for advanced date/time operations',
    packages: { python: ['arrow', 'pytz'] },
    capabilities: ['timezone', 'date', 'time', 'convert timezone', 'schedule', 'calendar'],
    category: 'utility',
  },
  // Email
  {
    id: 'email',
    name: 'Email Utilities',
    description: 'Tools for parsing and creating emails',
    packages: { python: ['beautifulsoup4'] },
    capabilities: ['email', 'parse email', 'html email'],
    category: 'utility',
  },
  // QR Code
  {
    id: 'qrcode',
    name: 'QR Code Generator',
    description: 'Generate QR codes',
    packages: { python: ['qrcode', 'Pillow'] },
    capabilities: ['qr code', 'qr', 'barcode', 'generate qr'],
    category: 'utility',
  },
]
