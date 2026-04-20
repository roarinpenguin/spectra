import { useState, useRef, useEffect, useMemo } from 'react'
import {
  Send,
  Loader2,
  Heart,
  Sparkles,
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Wifi,
  WifiOff,
  RefreshCw,
  X,
  Check,
  Key,
  Settings,
  Zap,
  Download,
  Plus,
  Trash2,
  Server,
  Edit2,
  Terminal,
  AlertTriangle,
  Library,
  BookOpen,
  Save,
  FolderOpen,
  Clock,
  Tag,
  Globe,
  ChevronUp,
  Lock,
  Upload,
  ShieldOff,
  ShieldCheck,
  Paperclip,
  FileText,
  FileJson,
  Image as ImageIcon,
  Archive,
  FileCode,
  Package,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import * as storage from './storage'
import * as evidenceStore from './evidenceStore'
import { api, streamQuery } from './api'
import { encryptVault, decryptVault, downloadVault, downloadPlain, pickJsonFile } from './crypto'
import { exportCaseBundle } from './bundleExport'
import { inspectBundle, importBundle } from './bundleImport'
import {
  ZoneProvider,
  ZoneControlsBar,
  useZoneSectionState,
  classifyZone,
  ZONES,
} from './zoneControls.jsx'
import remarkGfm from 'remark-gfm'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import mermaid from 'mermaid'

// Initialize mermaid with dark theme
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#7C3AED',
    primaryTextColor: '#F3F4F6',
    primaryBorderColor: '#5B21B6',
    lineColor: '#9CA3AF',
    secondaryColor: '#4C1D95',
    tertiaryColor: '#1F2937',
    background: '#111827',
    mainBkg: '#1F2937',
    nodeBorder: '#7C3AED',
    clusterBkg: '#1F2937',
    titleColor: '#E9D5FF',
    edgeLabelBackground: '#1F2937',
  },
  fontFamily: 'ui-sans-serif, system-ui, sans-serif',
})

// Generic Mermaid diagram renderer using mermaid.js
function MermaidDiagram({ content, chartId }) {
  const containerRef = useRef(null)
  const [svgContent, setSvgContent] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const renderDiagram = async () => {
      if (!content || !containerRef.current) return
      
      try {
        // Generate unique ID for this render
        const id = `mermaid-${chartId}-${Date.now()}`
        const { svg } = await mermaid.render(id, content.trim())
        setSvgContent(svg)
        setError(null)
      } catch (err) {
        console.error('Mermaid render error:', err)
        setError(err.message || 'Failed to render diagram')
      }
    }
    
    renderDiagram()
  }, [content, chartId])

  if (error) {
    return (
      <div className="my-4 bg-red-900/20 border border-red-500/30 rounded-xl p-4">
        <p className="text-red-400 text-sm mb-2">Failed to render Mermaid diagram</p>
        <pre className="bg-black/40 p-3 rounded-lg text-xs overflow-x-auto text-gray-300">{content}</pre>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className="my-4 bg-white/5 rounded-xl p-4 overflow-x-auto"
      data-chart-id={chartId}
      dangerouslySetInnerHTML={svgContent ? { __html: svgContent } : undefined}
    >
      {!svgContent && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
          <span className="ml-2 text-gray-400">Rendering diagram...</span>
        </div>
      )}
    </div>
  )
}

// SPECTRA Logo - Converging data streams forming unified insight
function SpectraLogo({ className = "w-10 h-10" }) {
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="spectraPurple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#A855F7" />
          <stop offset="50%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>
        <linearGradient id="spectraGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#C084FC" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      {/* Central eye/lens - unified insight */}
      <circle cx="24" cy="24" r="8" fill="url(#spectraPurple)" />
      <circle cx="24" cy="24" r="4" fill="#1a0f2e" />
      <circle cx="24" cy="24" r="2" fill="url(#spectraGlow)" />
      {/* Converging data streams from different sources */}
      <path d="M6 12 L18 20" stroke="url(#spectraGlow)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M6 36 L18 28" stroke="url(#spectraGlow)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M42 12 L30 20" stroke="url(#spectraGlow)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M42 36 L30 28" stroke="url(#spectraGlow)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      <path d="M24 4 L24 16" stroke="url(#spectraGlow)" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      {/* Data source nodes */}
      <circle cx="6" cy="12" r="3" fill="url(#spectraPurple)" opacity="0.7" />
      <circle cx="6" cy="36" r="3" fill="url(#spectraPurple)" opacity="0.7" />
      <circle cx="42" cy="12" r="3" fill="url(#spectraPurple)" opacity="0.7" />
      <circle cx="42" cy="36" r="3" fill="url(#spectraPurple)" opacity="0.7" />
      <circle cx="24" cy="4" r="3" fill="url(#spectraPurple)" opacity="0.7" />
      {/* Outer arc - spectrum */}
      <path d="M8 24 A16 16 0 0 1 40 24" stroke="url(#spectraPurple)" strokeWidth="1.5" fill="none" opacity="0.4" />
      <path d="M8 24 A16 16 0 0 0 40 24" stroke="url(#spectraPurple)" strokeWidth="1.5" fill="none" opacity="0.4" />
    </svg>
  )
}

const LLM_PROVIDERS = [
  { id: 'anthropic', name: 'Anthropic (Claude)', icon: '🟣' },
  { id: 'openai', name: 'OpenAI (GPT)', icon: '🟢' },
  { id: 'google', name: 'Google (Gemini)', icon: '🔵' },
]

const EXAMPLE_QUERIES = [
  { query: 'Is Salt Typhoon in my environment?' },
  { query: 'What are the top 10 critical alerts today?' },
  { query: 'Show me evidence of lateral movement in the last 7 days' },
  { query: 'What vulnerabilities should I prioritize?' },
  { query: 'Are there any cloud misconfigurations I should address?' },
  { query: 'Which endpoints have the most security issues?' },
]

// Purple color palette for charts
const CHART_COLORS = [
  '#A855F7', '#7C3AED', '#5B21B6', '#C084FC', '#9333EA',
  '#6B21A8', '#DDD6FE', '#8B5CF6', '#4C1D95', '#E9D5FF'
]

// Component to render Mermaid pie charts
function MermaidPieChart({ content, chartId }) {
  const [viewMode, setViewMode] = useState('pie')
  
  // Parse Mermaid pie chart syntax
  const parseData = () => {
    const lines = content.split('\n').filter(l => l.trim())
    let title = ''
    const data = []
    
    for (const line of lines) {
      const trimmed = line.trim()
      
      // Skip pie/showData directives
      if (trimmed.startsWith('pie') || trimmed === 'showData') continue
      
      // Extract title
      const titleMatch = trimmed.match(/^title\s+(.+)$/i)
      if (titleMatch) {
        title = titleMatch[1]
        continue
      }
      
      // Extract data entries: "label" : value
      const dataMatch = trimmed.match(/^["'](.+?)["']\s*:\s*(\d+(?:\.\d+)?)$/)
      if (dataMatch) {
        data.push({
          name: dataMatch[1].length > 25 ? dataMatch[1].substring(0, 23) + '…' : dataMatch[1],
          fullName: dataMatch[1],
          value: parseFloat(dataMatch[2])
        })
      }
    }
    
    // Add colors and limit to top 10
    return {
      title,
      chartData: data.slice(0, 10).map((item, idx) => ({
        ...item,
        color: CHART_COLORS[idx % CHART_COLORS.length]
      }))
    }
  }
  
  const { title, chartData } = parseData()
  const total = chartData.reduce((sum, item) => sum + item.value, 0)
  
  if (chartData.length === 0) {
    // If parsing failed, show raw content
    return (
      <pre className="bg-black/40 p-4 rounded-xl text-sm overflow-x-auto">
        <code>{content}</code>
      </pre>
    )
  }
  
  return (
    <div className="my-4">
      {title && (
        <h4 className="text-sm font-medium text-purple-300 mb-3">{title}</h4>
      )}
      
      {/* View mode toggle */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setViewMode('pie')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            viewMode === 'pie' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          Pie Chart
        </button>
        <button
          onClick={() => setViewMode('bar')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            viewMode === 'bar' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          Bar Chart
        </button>
        <button
          onClick={() => setViewMode('table')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            viewMode === 'table' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          Table
        </button>
      </div>
      
      {/* Pie chart view */}
      {viewMode === 'pie' && (
        <div className="bg-white/5 rounded-xl p-4" data-chart-id={chartId}>
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name} (${((value/total)*100).toFixed(1)}%)`}
                labelLine={{ stroke: '#9CA3AF', strokeWidth: 1 }}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6'
                }}
                formatter={(value, name, props) => [
                  `${value.toLocaleString()} (${((value/total)*100).toFixed(1)}%)`, 
                  props.payload.fullName
                ]}
              />
              <Legend 
                layout="horizontal" 
                verticalAlign="bottom"
                wrapperStyle={{ fontSize: '10px', paddingTop: '10px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 text-center mt-2">
            Top {chartData.length} results • Total: {total.toLocaleString()}
          </p>
        </div>
      )}
      
      {/* Bar chart view */}
      {viewMode === 'bar' && (
        <div className="bg-white/5 rounded-xl p-4">
          <ResponsiveContainer width="100%" height={Math.max(300, chartData.length * 35)}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
              <XAxis type="number" stroke="#9CA3AF" fontSize={10} />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="#9CA3AF" 
                fontSize={10}
                width={150}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6'
                }}
                formatter={(value, name, props) => [value.toLocaleString(), props.payload.fullName]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      
      {/* Table view */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto bg-white/5 rounded-xl">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="px-4 py-2 text-left text-purple-300">Label</th>
                <th className="px-4 py-2 text-right text-purple-300">Value</th>
                <th className="px-4 py-2 text-right text-purple-300">%</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((item, idx) => (
                <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-2 text-gray-200">
                    <span className="inline-block w-3 h-3 rounded-full mr-2" style={{ backgroundColor: item.color }}></span>
                    {item.fullName}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-300">{item.value.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-gray-400">{((item.value/total)*100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Component to render chartable 2-column tables
function ChartableTable({ children, tableData, chartId }) {
  const [viewMode, setViewMode] = useState('table')
  
  // Parse table data from children if not provided directly
  const parseTableFromChildren = () => {
    if (tableData) return tableData
    
    try {
      // Extract headers and rows from table children
      let headers = []
      let rows = []
      
      const processChildren = (children) => {
        if (!children) return
        const childArray = Array.isArray(children) ? children : [children]
        
        childArray.forEach(child => {
          if (!child?.props) return
          
          if (child.type === 'thead' || child.props?.node?.tagName === 'thead') {
            const headerRow = child.props.children
            if (headerRow?.props?.children) {
              const headerCells = Array.isArray(headerRow.props.children) 
                ? headerRow.props.children 
                : [headerRow.props.children]
              headers = headerCells.map(cell => {
                const content = cell?.props?.children
                return typeof content === 'string' ? content : String(content || '')
              })
            }
          }
          
          if (child.type === 'tbody' || child.props?.node?.tagName === 'tbody') {
            const bodyRows = child.props.children
            const rowArray = Array.isArray(bodyRows) ? bodyRows : [bodyRows]
            rowArray.forEach(row => {
              if (row?.props?.children) {
                const cells = Array.isArray(row.props.children) 
                  ? row.props.children 
                  : [row.props.children]
                const rowData = cells.map(cell => {
                  const content = cell?.props?.children
                  return typeof content === 'string' ? content : String(content || '')
                })
                if (rowData.length > 0) rows.push(rowData)
              }
            })
          }
        })
      }
      
      processChildren(children)
      return { headers, rows }
    } catch (e) {
      return { headers: [], rows: [] }
    }
  }
  
  const { headers, rows } = parseTableFromChildren()
  
  // Check if this is a chartable table (2 columns, second is numeric)
  const isChartable = headers.length === 2 && rows.length > 0 && 
    rows.every(row => row.length >= 2 && !isNaN(parseFloat(row[1])))
  
  // Prepare chart data (top 10 rows)
  const chartData = isChartable 
    ? rows.slice(0, 10).map((row, idx) => ({
        name: row[0].length > 20 ? row[0].substring(0, 18) + '…' : row[0],
        fullName: row[0],
        value: parseFloat(row[1]),
        color: CHART_COLORS[idx % CHART_COLORS.length]
      }))
    : []
  
  // Calculate total for percentages
  const total = chartData.reduce((sum, item) => sum + item.value, 0)
  
  if (!isChartable) {
    // Render normal table
    return (
      <div className="overflow-x-auto my-4">
        <table className="min-w-full border-collapse text-sm">{children}</table>
      </div>
    )
  }
  
  return (
    <div className="my-4">
      {/* View mode toggle buttons */}
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setViewMode('table')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            viewMode === 'table' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          Table
        </button>
        <button
          onClick={() => setViewMode('pie')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            viewMode === 'pie' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          Pie chart
        </button>
        <button
          onClick={() => setViewMode('bar')}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
            viewMode === 'bar' 
              ? 'bg-purple-600 text-white' 
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          }`}
        >
          Bar chart
        </button>
      </div>
      
      {/* Table view */}
      {viewMode === 'table' && (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-sm">{children}</table>
        </div>
      )}
      
      {/* Pie chart view */}
      {viewMode === 'pie' && (
        <div className="bg-white/5 rounded-xl p-4" data-chart-id={chartId}>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                dataKey="value"
                label={({ name, value }) => `${name} ${((value/total)*100).toFixed(1)}%`}
                labelLine={{ stroke: '#9CA3AF', strokeWidth: 1 }}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6'
                }}
                formatter={(value, name, props) => [value, props.payload.fullName]}
              />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 text-center mt-2">
            Showing top {chartData.length} results • Total: {total.toLocaleString()}
          </p>
        </div>
      )}
      
      {/* Bar chart view */}
      {viewMode === 'bar' && (
        <div className="bg-white/5 rounded-xl p-4">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <XAxis type="number" stroke="#9CA3AF" fontSize={10} />
              <YAxis 
                type="category" 
                dataKey="name" 
                stroke="#9CA3AF" 
                fontSize={10}
                width={120}
                tickLine={false}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#1F2937', 
                  border: '1px solid #374151',
                  borderRadius: '8px',
                  color: '#F3F4F6'
                }}
                formatter={(value, name, props) => [value, props.payload.fullName]}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400 text-center mt-2">
            Showing top {chartData.length} results
          </p>
        </div>
      )}
    </div>
  )
}

function CollapsibleSection({ title, children, defaultOpen = false, zone }) {
  // Zone-aware: when wrapped in a ZoneProvider, the toolbar can flip this
  // section open/closed via its zone. Local clicks still work and stay until
  // the next preset is applied.
  const resolvedZone = zone || classifyZone(title)
  const [isOpen, setIsOpen] = useZoneSectionState(resolvedZone, { initialOpen: defaultOpen })
  return (
    <div className="border border-white/10 rounded-lg mb-2 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-purple-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-purple-400 flex-shrink-0" />
        )}
        <span className="text-sm font-semibold text-purple-200">{title}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-3 pt-0">
          {children}
        </div>
      )}
    </div>
  )
}

function splitIntoSections(content) {
  // Split markdown content by ## headers into sections
  const lines = content.split('\n')
  const sections = []
  let currentTitle = null
  let currentLines = []

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/)
    if (headerMatch) {
      // Save previous section
      if (currentTitle !== null || currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
      }
      currentTitle = headerMatch[1].trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  // Save last section
  if (currentTitle !== null || currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  return sections
}

function MarkdownSection({ content, messageId }) {
  // Detect if content looks like a Mermaid diagram
  const isMermaidContent = (text) => {
    const trimmed = text.trim()
    const mermaidKeywords = ['pie', 'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 
      'stateDiagram', 'erDiagram', 'gantt', 'journey', 'gitGraph', 'mindmap', 'timeline',
      'xychart-beta', 'sankey-beta', 'quadrantChart', 'requirementDiagram', 'C4Context']
    return mermaidKeywords.some(kw => trimmed.startsWith(kw))
  }

  const mdComponents = {
    code: ({node, inline, className, children, ...props}) => {
      const text = String(children).replace(/\n$/, '')
      // Detect Mermaid syntax - use mermaid.js for all diagram types
      if (!inline && (className === 'language-mermaid' || isMermaidContent(text))) {
        // Use custom pie chart renderer for pie charts (better styling with recharts)
        if (text.trim().startsWith('pie')) {
          return <MermaidPieChart content={text} chartId={`mermaid-${messageId}`} />
        }
        // Use mermaid.js for all other diagram types
        return <MermaidDiagram content={text} chartId={`mermaid-${messageId}-${Date.now()}`} />
      }
      // Short single-line code blocks → render as inline code (fixes LLM triple-backtick issue)
      if (!inline && !text.includes('\n') && text.length < 120 && !className) {
        return <code className="bg-purple-900/40 px-1.5 py-0.5 rounded text-purple-200" {...props}>{children}</code>
      }
      // Real multi-line code blocks
      if (!inline) {
        return (
          <pre className="bg-black/40 p-4 rounded-xl text-sm overflow-x-auto">
            <code className={className} {...props}>{children}</code>
          </pre>
        )
      }
      return <code className="bg-purple-900/40 px-1.5 py-0.5 rounded text-purple-200" {...props}>{children}</code>
    },
    pre: ({node, children, ...props}) => {
      if (children?.type === MermaidPieChart || children?.type === MermaidDiagram) return children
      return <>{children}</>
    },
    table: ({node, children, ...props}) => (
      <ChartableTable chartId={`table-${messageId}`}>{children}</ChartableTable>
    ),
    thead: ({node, ...props}) => (
      <thead className="bg-purple-900/40" {...props} />
    ),
    th: ({node, ...props}) => (
      <th className="border border-purple-500/30 px-4 py-2 text-left font-semibold text-purple-200 whitespace-nowrap" {...props} />
    ),
    td: ({node, ...props}) => (
      <td className="border border-white/10 px-4 py-2 text-gray-200" {...props} />
    ),
    tr: ({node, ...props}) => (
      <tr className="hover:bg-white/5 transition-colors" {...props} />
    ),
  }
  return (
    <div className="prose prose-invert prose-sm max-w-none break-words overflow-hidden">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function MessageContent({ message }) {
  const sections = splitIntoSections(message.content)
  const hasSections = sections.some(s => s.title !== null)

  // If no ## headers found, render as plain markdown
  if (!hasSections) {
    return <MarkdownSection content={message.content} messageId={message.id} />
  }

  // Determine which sections to expand by default
  const expandByDefault = ['executive summary', 'summary', 'recommended actions', 'recommendations']

  return (
    <div className="space-y-1">
      {sections.map((section, idx) => {
        if (section.title === null) {
          // Content before the first ## header — always show
          return section.content ? (
            <div key={idx} className="mb-2">
              <MarkdownSection content={section.content} messageId={`${message.id}-pre`} />
            </div>
          ) : null
        }

        const zone = classifyZone(section.title)
        const isExpanded =
          expandByDefault.some(k => section.title.toLowerCase().includes(k)) || idx === 1
        return (
          <CollapsibleSection key={idx} title={section.title} defaultOpen={isExpanded} zone={zone}>
            <MarkdownSection content={section.content} messageId={`${message.id}-${idx}`} />
          </CollapsibleSection>
        )
      })}
    </div>
  )
}

function ThoughtProcess({ thoughtProcess }) {
  if (!thoughtProcess) return null
  const { classification, reason, tool_calls } = thoughtProcess

  return (
    <CollapsibleSection title="Thought Process" defaultOpen={false} zone={ZONES.THOUGHTS}>
      <div className="space-y-3">
        {/* Classification */}
        <div className="flex items-start gap-2">
          <div className="mt-0.5 w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
          </div>
          <div>
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Classification</span>
            <p className="text-sm text-gray-300 mt-0.5">{reason || `Routed to ${classification}`}</p>
          </div>
        </div>

        {/* Tool call sequence — gated by its own zone so the Zones bar can
            hide just the tool list while keeping the reasoning visible. */}
        {tool_calls && tool_calls.length > 0 && (
          <CollapsibleSection
            title={`Tool Calls (${tool_calls.length})`}
            defaultOpen={true}
            zone={ZONES.TOOLS}
          >
            <div className="space-y-1">
              {tool_calls.map((call, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[10px] text-gray-600 font-mono w-4 text-right flex-shrink-0">{idx + 1}.</span>
                    <span className="text-xs font-medium text-blue-300">{call.tool}</span>
                    {call.args && (
                      <span className="text-[11px] text-gray-500 truncate" title={call.args}>({call.args})</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </CollapsibleSection>
  )
}

// Icon picker for an evidence, based on its MIME/name.
function evidenceIcon(ev) {
  const kind = evidenceStore.classifyEvidence(ev)
  if (kind === 'image') return ImageIcon
  if (kind === 'archive') return Archive
  if (kind === 'binary') return Package
  if (ev.mime === 'application/json' || /\.json$/i.test(ev.name || '')) return FileJson
  if (kind === 'text') return FileCode
  return FileText
}

function EvidenceChip({ evidence, onRemove, compact = false }) {
  const Icon = evidenceIcon(evidence)
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 text-xs text-gray-200 ' +
        (compact ? 'px-2 py-0.5' : 'px-2.5 py-1')
      }
      title={`${evidence.name} · ${evidence.mime || 'unknown'} · ${evidenceStore.formatBytes(evidence.size)}`}
    >
      <Icon className="w-3.5 h-3.5 text-purple-300" />
      <span className="max-w-[180px] truncate">{evidence.name}</span>
      <span className="text-[10px] text-gray-500">{evidenceStore.formatBytes(evidence.size)}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(evidence) }}
          className="ml-0.5 text-gray-500 hover:text-red-400"
          title="Remove"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  )
}

function MessageEvidenceRow({ evidences }) {
  if (!evidences || evidences.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {evidences.map((ev) => <EvidenceChip key={ev.id} evidence={ev} compact />)}
    </div>
  )
}

function Message({ message, isUser, messageEvidences }) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-4 overflow-hidden break-words ${
          isUser
            ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white'
            : 'glass text-gray-100'
        }`}
      >
        {isUser ? (
          <>
            <p className="whitespace-pre-wrap">{message.content}</p>
            <MessageEvidenceRow evidences={messageEvidences} />
          </>
        ) : (
          <>
            {message.agent && (
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-purple-500/20">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/15 border border-purple-500/25">
                  <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a5 5 0 015 5v3H7V7a5 5 0 015-5z"/><rect x="3" y="10" width="18" height="12" rx="2"/><circle cx="12" cy="16" r="2"/></svg>
                  <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide">{message.agent} agent</span>
                </div>
                {message.toolsUsed && message.toolsUsed.length > 0 && (
                  <span className="text-xs text-gray-500">
                    {message.toolsUsed.length} tool{message.toolsUsed.length !== 1 ? 's' : ''} used
                  </span>
                )}
              </div>
            )}
            <MessageContent message={message} />
            {message.thoughtProcess && (
              <div className="mt-3">
                <ThoughtProcess thoughtProcess={message.thoughtProcess} />
              </div>
            )}
          </>
        )}
        {!isUser && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-white/10">
            {message.toolsUsed.map((tool) => (
              <span key={tool} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/15 text-blue-300 border border-blue-500/25">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>
                {tool}
              </span>
            ))}
          </div>
        )}
        {message.timestamp && (
          <p className={`text-xs mt-2 ${isUser ? 'text-purple-200' : 'text-gray-500'}`}>
            {new Date(message.timestamp).toLocaleTimeString()}
          </p>
        )}
      </div>
    </div>
  )
}

// Human-readable label for each SSE event the backend can emit.
// Anything not listed falls back to the raw event name.
const STEP_LABELS = {
  connecting_mcp: 'Connecting to MCP server',
  discovering_tools: 'Discovering available tools',
  tools_discovered: 'Tools discovered',
  classifying: 'Classifying your query',
  routing: 'Routing to specialist agents',
  orchestrator_start: 'Starting analysis',
  agent_start: 'Agent investigating',
  tool_call: 'Calling tool',
  tool_result: 'Tool returned',
  agent_complete: 'Agent finished',
  synthesizing: 'Synthesizing findings',
  thought_process: 'Preparing response',
}

function stepKey(ev) {
  // Compound keys so simultaneous multi-agent work renders distinct rows
  if (ev.event === 'agent_start' || ev.event === 'agent_complete') {
    return `agent:${ev.data?.agent}`
  }
  if (ev.event === 'tool_call' || ev.event === 'tool_result') {
    return `tool:${ev.data?.agent}:${ev.data?.tool}`
  }
  return ev.event
}

function ThinkingTimeline({ steps }) {
  // Fallback when no events have arrived yet (still connecting, or non-streaming)
  if (!steps || steps.length === 0) {
    return (
      <div className="flex justify-start animate-slide-up">
        <div className="glass rounded-2xl px-5 py-4 flex items-center gap-3">
          <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
          <span className="text-gray-400 text-sm">Connecting to SPECTRA…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start animate-slide-up">
      <div className="glass rounded-2xl px-5 py-4 min-w-[320px] max-w-[640px]">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 rounded-full bg-purple-500/30 animate-ping" />
            <div className="relative w-4 h-4 rounded-full bg-purple-500" />
          </div>
          <span className="text-sm font-medium text-purple-300">SPECTRA is thinking</span>
          <span className="text-[10px] text-gray-500 ml-auto">{steps.length} step{steps.length !== 1 ? 's' : ''}</span>
        </div>
        <ol className="space-y-1.5">
          {steps.map((step, idx) => {
            const isLast = idx === steps.length - 1
            const isActive = !step.done && isLast
            const isError = step.isError
            return (
              <li key={step.key + ':' + idx} className="flex items-start gap-2.5 text-sm animate-slide-up">
                <span className="mt-0.5 flex-shrink-0 w-4 h-4">
                  {isError ? (
                    <X className="w-4 h-4 text-red-400" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  ) : (
                    <Check className="w-4 h-4 text-green-400" />
                  )}
                </span>
                <span className={`flex-1 ${isActive ? 'text-white' : isError ? 'text-red-300' : 'text-gray-400'}`}>
                  {step.label}
                  {step.detail && (
                    <span className="ml-1.5 text-[11px] text-gray-500 font-mono">{step.detail}</span>
                  )}
                </span>
                {step.ms != null && !isActive && (
                  <span className="text-[10px] text-gray-600 tabular-nums mt-1">{step.ms}ms</span>
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

function ExampleCard({ query, onClick }) {
  return (
    <button
      onClick={() => onClick(query)}
      className="glass p-4 rounded-xl text-left hover:bg-white/10 transition-smooth group"
    >
      <p className="text-sm text-gray-300 group-hover:text-white transition-smooth">
        {query}
      </p>
      <ChevronRight className="w-4 h-4 text-purple-400 mt-2 opacity-0 group-hover:opacity-100 transition-smooth" />
    </button>
  )
}

function VaultPanel({ onMessage, onChange }) {
  const [passphrase, setPassphrase] = useState('')
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [sensitive, setSensitive] = useState(storage.isSensitiveMode())
  const [showSessionId, setShowSessionId] = useState(false)
  const sessionId = storage.getSessionId()

  const handleEncryptedExport = async () => {
    if (!passphrase || passphrase.length < 8) {
      onMessage({ type: 'error', text: 'Passphrase must be at least 8 characters' })
      return
    }
    if (passphrase !== confirmPassphrase) {
      onMessage({ type: 'error', text: 'Passphrases do not match' })
      return
    }
    setBusy(true)
    try {
      const snap = storage.exportSnapshot()
      const env = await encryptVault(snap, passphrase)
      downloadVault(env)
      onMessage({ type: 'success', text: 'Encrypted vault downloaded' })
      setPassphrase(''); setConfirmPassphrase('')
    } catch (e) {
      onMessage({ type: 'error', text: e.message })
    } finally { setBusy(false) }
  }

  const handlePlainExport = () => {
    if (!confirm('Export an UNENCRYPTED snapshot? Anyone who reads the file gets your API keys.')) return
    try {
      downloadPlain(storage.exportSnapshot())
      onMessage({ type: 'success', text: 'Plain snapshot downloaded' })
    } catch (e) {
      onMessage({ type: 'error', text: e.message })
    }
  }

  const handleImport = async () => {
    setBusy(true)
    try {
      const file = await pickJsonFile()
      let snapshot
      if (file?.format === 'spectra-vault') {
        const pwd = prompt('Enter the vault passphrase to decrypt:')
        if (!pwd) { setBusy(false); return }
        snapshot = await decryptVault(file, pwd)
      } else if (file?.state) {
        snapshot = file
      } else {
        throw new Error('File is neither a SPECTRA vault nor a plain snapshot')
      }
      const mode = confirm('OK = MERGE with current data\nCancel = REPLACE current data') ? 'merge' : 'replace'
      storage.importSnapshot(snapshot, { mode })
      onMessage({ type: 'success', text: `Imported (${mode})` })
      onChange()
    } catch (e) {
      onMessage({ type: 'error', text: e.message })
    } finally { setBusy(false) }
  }

  const handleSensitiveToggle = (next) => {
    setSensitive(next)
    storage.setSensitiveMode(next)
    onMessage({ type: 'success', text: next
      ? 'Sensitive mode ON — secrets will be cleared on browser reload'
      : 'Sensitive mode OFF — secrets are persisted in localStorage' })
  }

  const handleClearAll = () => {
    const phrase = prompt('Type DELETE to wipe ALL local data (consoles, library, settings).')
    if (phrase !== 'DELETE') return
    storage.clearAll()
    onMessage({ type: 'success', text: 'All local data cleared. Reloading…' })
    setTimeout(() => window.location.reload(), 800)
  }

  return (
    <div className="space-y-5">
      {/* Encrypted export */}
      <div className="glass rounded-xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-purple-300">Encrypted Export (recommended)</h3>
        </div>
        <p className="text-xs text-gray-400">
          Saves a passphrase-encrypted JSON file containing your consoles, API tokens, LLM settings,
          and investigation library. Safe to email or store in any cloud drive. Uses AES-GCM-256 with
          PBKDF2-SHA256 (600 000 iterations) via the browser's Web Crypto API.
        </p>
        <input
          type="password"
          placeholder="Passphrase (min. 8 characters)"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500 text-sm"
        />
        <input
          type="password"
          placeholder="Confirm passphrase"
          value={confirmPassphrase}
          onChange={(e) => setConfirmPassphrase(e.target.value)}
          className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500 text-sm"
        />
        <button
          onClick={handleEncryptedExport}
          disabled={busy}
          className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-smooth flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Download Encrypted Vault
        </button>
      </div>

      {/* Import */}
      <div className="glass rounded-xl p-4 border border-white/10 space-y-3">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-medium text-purple-300">Import Vault or Snapshot</h3>
        </div>
        <p className="text-xs text-gray-400">
          Upload a previously exported vault (you'll be prompted for the passphrase) or a plain snapshot.
          You can choose to merge with the current data or replace it.
        </p>
        <button
          onClick={handleImport}
          disabled={busy}
          className="w-full py-2 glass border border-purple-500/30 hover:bg-white/10 text-purple-300 rounded-lg transition-smooth flex items-center justify-center gap-2 text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Choose file…
        </button>
      </div>

      {/* Plain export (advanced) */}
      <details className="glass rounded-xl p-4 border border-white/5">
        <summary className="text-sm text-gray-400 cursor-pointer flex items-center gap-2">
          <Download className="w-4 h-4" /> Plain (unencrypted) export — advanced
        </summary>
        <div className="mt-3 text-xs text-gray-500 space-y-2">
          <p>For when you want to inspect or hand-edit the snapshot. Contains your secrets in cleartext.</p>
          <button
            onClick={handlePlainExport}
            className="px-3 py-1.5 glass hover:bg-white/10 text-gray-300 rounded-lg text-xs flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" /> Download plain snapshot
          </button>
        </div>
      </details>

      {/* Sensitive mode */}
      <div className="glass rounded-xl p-4 border border-white/10 flex items-start gap-3">
        {sensitive ? <ShieldCheck className="w-5 h-5 text-green-400 mt-0.5" /> : <ShieldOff className="w-5 h-5 text-gray-500 mt-0.5" />}
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-white">Sensitive Mode</h3>
            <button
              onClick={() => handleSensitiveToggle(!sensitive)}
              className={`relative w-11 h-6 rounded-full transition-smooth ${sensitive ? 'bg-purple-500' : 'bg-gray-600'}`}
              aria-pressed={sensitive}
            >
              <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-smooth ${sensitive ? 'left-5' : 'left-0.5'}`} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            When ON, API keys and SentinelOne tokens are kept only in browser memory and are wiped on reload.
            Useful on shared/kiosk machines. The rest (console URLs, names, library) still persists.
          </p>
        </div>
      </div>

      {/* Session id */}
      <div className="glass rounded-xl p-4 border border-white/5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-white">Browser Session ID</h3>
          <button onClick={() => setShowSessionId((v) => !v)} className="text-xs text-purple-400 hover:text-purple-300">
            {showSessionId ? 'Hide' : 'Show'}
          </button>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Sent on every API call as <code className="text-purple-400">X-Spectra-Session-Id</code> so the backend can
          cache an MCP connection per browser. Not personally identifiable.
        </p>
        {showSessionId && (
          <code className="block mt-2 p-2 bg-black/30 rounded text-xs text-gray-300 break-all">
            {sessionId}
          </code>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-xl p-4 border border-red-500/30 bg-red-500/5 space-y-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-medium text-red-300">Danger Zone</h3>
        </div>
        <p className="text-xs text-gray-400">
          Wipe ALL locally stored consoles, library, and settings from this browser. Cannot be undone.
        </p>
        <button
          onClick={handleClearAll}
          className="px-3 py-1.5 bg-red-600/40 hover:bg-red-600/60 text-red-200 rounded-lg text-xs flex items-center gap-2"
        >
          <Trash2 className="w-3.5 h-3.5" /> Clear all local data
        </button>
      </div>
    </div>
  )
}

function SettingsModal({ isOpen, onClose, settings, onSave, availableModels, onRefreshModels, destinations, activeDestinationId, onDestinationsChange }) {
  const [activeTab, setActiveTab] = useState('consoles')
  const [formData, setFormData] = useState({
    llm_provider: settings?.llm_provider || 'anthropic',
    llm_api_key: '',
    llm_model: settings?.llm_model || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshingModels, setIsRefreshingModels] = useState(false)
  const [modelsRefreshedAt, setModelsRefreshedAt] = useState(null)
  const [message, setMessage] = useState(null)
  const [showLogs, setShowLogs] = useState(false)

  // Destination form state
  const [showDestForm, setShowDestForm] = useState(false)
  const [editingDest, setEditingDest] = useState(null)
  const [destForm, setDestForm] = useState({ name: '', console_url: '', api_token: '', mcp_server_url: '' })

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({
        ...prev,
        llm_provider: settings.llm_provider || 'anthropic',
        llm_model: settings.llm_model || '',
      }))
    }
  }, [settings])

  // Auto-switch to consoles tab if no destinations
  useEffect(() => {
    if (isOpen && destinations.length === 0) {
      setActiveTab('consoles')
    }
  }, [isOpen, destinations.length])

  const handleProviderChange = (provider) => {
    setFormData(prev => ({
      ...prev,
      llm_provider: provider,
      llm_model: availableModels?.[provider]?.[0] || '',
    }))
  }

  const handleSaveLLM = () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const patch = {
        provider: formData.llm_provider,
        model: formData.llm_model,
      }
      // Empty key = keep existing
      if (formData.llm_api_key) patch.apiKey = formData.llm_api_key
      const next = storage.setLLM(patch)
      setMessage({ type: 'success', text: 'LLM settings saved' })
      onSave({
        llm_provider: next.provider,
        llm_model: next.model,
        llm_api_key_set: !!next.apiKey,
        llm_api_key_preview: next.apiKey ? next.apiKey.slice(0, 8) + '…' : '',
      })
      setFormData((prev) => ({ ...prev, llm_api_key: '' }))
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefreshModels = async () => {
    // Prefer the freshly typed key; fall back to the stored one so users
    // who've already saved a key can refresh without re-entering it.
    const key = formData.llm_api_key || storage.getLLM().apiKey
    if (!key) {
      setMessage({ type: 'error', text: 'Enter an API key first, then refresh' })
      return
    }
    setIsRefreshingModels(true)
    setMessage(null)
    try {
      const res = await api.refreshModels(formData.llm_provider, key)
      if (res?.status === 'success' && Array.isArray(res.models)) {
        onRefreshModels(formData.llm_provider, res.models)
        setModelsRefreshedAt(new Date())
        setMessage({ type: 'success', text: `Found ${res.models.length} models for ${formData.llm_provider}` })
        // Auto-select the first returned model if none is set or the current one isn't available
        if (!res.models.includes(formData.llm_model)) {
          setFormData((prev) => ({ ...prev, llm_model: res.models[0] || '' }))
        }
      } else {
        setMessage({ type: 'error', text: 'Unexpected response from provider' })
      }
    } catch (e) {
      setMessage({ type: 'error', text: e.message || 'Failed to refresh models' })
    } finally {
      setIsRefreshingModels(false)
    }
  }

  const resetDestForm = () => {
    setDestForm({ name: '', console_url: '', api_token: '', mcp_server_url: '' })
    setEditingDest(null)
    setShowDestForm(false)
  }

  const handleSaveDest = () => {
    if (!destForm.name.trim() || !destForm.console_url.trim() || !destForm.mcp_server_url.trim()) {
      setMessage({ type: 'error', text: 'Name, Console URL, and MCP Server URL are required' })
      return
    }
    setIsSaving(true)
    setMessage(null)
    try {
      if (editingDest) {
        storage.updateDestination(editingDest, {
          name: destForm.name,
          consoleUrl: destForm.console_url,
          mcpServerUrl: destForm.mcp_server_url,
          apiToken: destForm.api_token, // empty = keep current
        })
        setMessage({ type: 'success', text: 'Console updated' })
      } else {
        storage.addDestination({
          name: destForm.name,
          consoleUrl: destForm.console_url,
          apiToken: destForm.api_token,
          mcpServerUrl: destForm.mcp_server_url,
        })
        setMessage({ type: 'success', text: 'Console added' })
      }
      resetDestForm()
      onDestinationsChange()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteDest = (id, name) => {
    if (!confirm(`Delete console "${name}"?`)) return
    try {
      storage.deleteDestination(id)
      setMessage({ type: 'success', text: 'Console deleted' })
      onDestinationsChange()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const handleEditDest = (dest) => {
    setEditingDest(dest.id)
    setDestForm({
      name: dest.name,
      console_url: dest.consoleUrl,
      api_token: '',
      mcp_server_url: dest.mcpServerUrl,
    })
    setShowDestForm(true)
  }

  if (!isOpen) return null

  const currentModels = availableModels?.[formData.llm_provider] || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-darker rounded-2xl w-full max-w-2xl p-6 animate-slide-up max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gradient">Settings</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-smooth">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('consoles')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth flex items-center gap-2 ${
              activeTab === 'consoles' ? 'bg-purple-600/30 text-white border border-purple-500/50' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Globe className="w-4 h-4" />
            Consoles
            <span className="text-xs opacity-60">({destinations.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('llm')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth flex items-center gap-2 ${
              activeTab === 'llm' ? 'bg-purple-600/30 text-white border border-purple-500/50' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            LLM Configuration
          </button>
          <button
            onClick={() => setActiveTab('vault')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-smooth flex items-center gap-2 ${
              activeTab === 'vault' ? 'bg-purple-600/30 text-white border border-purple-500/50' : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Lock className="w-4 h-4" />
            Vault &amp; Privacy
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* === Consoles Tab === */}
          {activeTab === 'consoles' && (
            <div className="space-y-4">
              {/* Add / Edit form */}
              {!showDestForm ? (
                <button
                  onClick={() => { resetDestForm(); setShowDestForm(true) }}
                  className="w-full flex items-center justify-center gap-2 py-3 glass rounded-xl border border-dashed border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500/50 transition-smooth"
                >
                  <Plus className="w-4 h-4" />
                  Add Console
                </button>
              ) : (
                <div className="glass rounded-xl p-4 border border-purple-500/30 space-y-3">
                  <h3 className="text-sm font-medium text-purple-300">
                    {editingDest ? 'Edit Console' : 'New Console'}
                  </h3>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Display Name *</label>
                    <input
                      type="text"
                      value={destForm.name}
                      onChange={(e) => setDestForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g. Production, Lab, Demo"
                      className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">SentinelOne Console URL *</label>
                    <input
                      type="text"
                      value={destForm.console_url}
                      onChange={(e) => setDestForm(prev => ({ ...prev, console_url: e.target.value }))}
                      placeholder="https://your-console.sentinelone.net"
                      className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      API Token
                      {editingDest && !!destinations.find(d => d.id === editingDest)?.apiToken && (
                        <span className="text-green-400 ml-2">✓ Set</span>
                      )}
                    </label>
                    <input
                      type="password"
                      value={destForm.api_token}
                      onChange={(e) => setDestForm(prev => ({ ...prev, api_token: e.target.value }))}
                      placeholder={editingDest ? "Leave blank to keep current..." : "SentinelOne API token"}
                      className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Purple MCP Server URL *</label>
                    <input
                      type="text"
                      value={destForm.mcp_server_url}
                      onChange={(e) => setDestForm(prev => ({ ...prev, mcp_server_url: e.target.value }))}
                      placeholder="http://host.docker.internal:8000"
                      className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500 text-sm"
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveDest}
                      disabled={isSaving}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-smooth flex items-center gap-2 text-sm"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {editingDest ? 'Update' : 'Add'}
                    </button>
                    <button
                      onClick={resetDestForm}
                      className="px-4 py-2 glass hover:bg-white/10 text-gray-300 rounded-lg transition-smooth text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Destinations list */}
              {destinations.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No consoles configured</p>
                  <p className="text-sm mt-1">Add a SentinelOne console to get started</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {destinations.map((dest) => {
                    const isActive = dest.id === activeDestinationId
                    return (
                    <div
                      key={dest.id}
                      className={`glass p-4 rounded-xl transition-smooth group ${
                        isActive ? 'border border-purple-500/40 bg-purple-500/5' : 'hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-white truncate">{dest.name}</h4>
                            {isActive && (
                              <span className="px-2 py-0.5 text-[10px] font-semibold bg-purple-500/20 text-purple-300 rounded-full border border-purple-500/30 uppercase tracking-wide">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-1 truncate flex items-center gap-1">
                            <Globe className="w-3 h-3 flex-shrink-0" />
                            {dest.consoleUrl}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate flex items-center gap-1">
                            <Server className="w-3 h-3 flex-shrink-0" />
                            {dest.mcpServerUrl}
                          </p>
                          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-gray-600">
                            {!!dest.apiToken && (
                              <span className="flex items-center gap-1 text-green-500">
                                <Key className="w-3 h-3" /> Token set
                              </span>
                            )}
                            {dest.lastUsed && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Last used: {new Date(dest.lastUsed).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-smooth">
                          <button
                            onClick={() => handleEditDest(dest)}
                            className="p-1.5 hover:bg-white/10 rounded-lg transition-smooth text-gray-400 hover:text-purple-400"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteDest(dest.id, dest.name)}
                            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-smooth text-gray-400 hover:text-red-400"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}

          {/* === LLM Tab === */}
          {activeTab === 'llm' && (
            <div className="space-y-5">
              {/* LLM Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  LLM Provider
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {LLM_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => handleProviderChange(provider.id)}
                      className={`p-3 rounded-xl text-center transition-smooth ${
                        formData.llm_provider === provider.id
                          ? 'bg-purple-600/30 border border-purple-500'
                          : 'glass hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <span className="text-lg">{provider.icon}</span>
                      <p className="text-xs text-gray-300 mt-1">{provider.name.split(' ')[0]}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* LLM API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  API Key {settings?.llm_api_key_set && (
                    <span className="text-green-400 text-xs ml-2">
                      ✓ Configured ({settings.llm_api_key_preview})
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input
                    type="password"
                    value={formData.llm_api_key}
                    onChange={(e) => setFormData(prev => ({ ...prev, llm_api_key: e.target.value }))}
                    placeholder={settings?.llm_api_key_set ? "Enter new key to change..." : "Enter API key..."}
                    className="w-full pl-11 pr-4 py-3 glass rounded-xl bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
                  />
                </div>
              </div>

              {/* LLM Model */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Model
                    {modelsRefreshedAt && (
                      <span className="ml-2 text-[10px] font-normal text-green-400">
                        · live list ({modelsRefreshedAt.toLocaleTimeString()})
                      </span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={handleRefreshModels}
                    disabled={isRefreshingModels}
                    title="Fetch the list of models actually available to this API key"
                    className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-purple-300 hover:text-purple-200 hover:bg-white/5 rounded-lg transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRefreshingModels ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    {isRefreshingModels ? 'Checking…' : 'Refresh from API key'}
                  </button>
                </div>
                <select
                  value={formData.llm_model}
                  onChange={(e) => setFormData(prev => ({ ...prev, llm_model: e.target.value }))}
                  className="w-full px-4 py-3 glass rounded-xl bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239CA3AF'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '20px' }}
                >
                  {currentModels.length === 0 ? (
                    <option value="">Select a provider first</option>
                  ) : (
                    <>
                      <option value="">Select a model</option>
                      {currentModels.map((model) => (
                        <option key={model} value={model}>{model}</option>
                      ))}
                    </>
                  )}
                </select>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveLLM}
                disabled={isSaving}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl font-medium transition-smooth flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Save LLM Settings
                  </>
                )}
              </button>
            </div>
          )}

          {/* === Vault & Privacy Tab === */}
          {activeTab === 'vault' && (
            <VaultPanel
              onMessage={setMessage}
              onChange={() => { onDestinationsChange(); }}
            />
          )}
        </div>

        {/* Message */}
        {message && (
          <div className={`mt-4 p-3 rounded-xl text-sm ${
            message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Troubleshooting button */}
        <div className="mt-4 pt-4 border-t border-white/5">
          <button
            onClick={() => setShowLogs(true)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-purple-400 transition-smooth"
          >
            <Terminal className="w-4 h-4" />
            Troubleshooting
          </button>
        </div>
      </div>

      {/* Logs Modal */}
      <LogsModal isOpen={showLogs} onClose={() => setShowLogs(false)} />
    </div>
  )
}

function LogsModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState({ backend: null, frontend: null })
  const [isLoading, setIsLoading] = useState(false)
  const [activeLogTab, setActiveLogTab] = useState('backend')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchLogs = async () => {
    setIsLoading(true)
    try {
      const data = await api.logs(200)
      if (data.status === 'success') {
        setLogs(data.logs)
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchLogs()
    }
  }, [isOpen])

  useEffect(() => {
    if (autoRefresh && isOpen) {
      const interval = setInterval(fetchLogs, 3000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, isOpen])

  if (!isOpen) return null

  const currentLogs = logs[activeLogTab]?.logs || []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-darker rounded-2xl w-full max-w-4xl h-[80vh] p-6 animate-slide-up flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-semibold text-gradient">Troubleshooting Logs</h2>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded bg-white/10 border-white/20 text-purple-500 focus:ring-purple-500"
              />
              Auto-refresh
            </label>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 hover:bg-white/10 rounded-lg transition-smooth"
              title="Refresh logs"
            >
              <RefreshCw className={`w-4 h-4 text-purple-400 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-smooth">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Log source tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveLogTab('backend')}
            className={`px-4 py-2 rounded-lg text-sm transition-smooth flex items-center gap-2 ${
              activeLogTab === 'backend' ? 'bg-purple-600/30 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            Backend
            {logs.backend && (
              <span className="text-xs text-gray-500">({logs.backend.logs?.length || 0})</span>
            )}
          </button>
          <button
            onClick={() => setActiveLogTab('frontend')}
            className={`px-4 py-2 rounded-lg text-sm transition-smooth flex items-center gap-2 ${
              activeLogTab === 'frontend' ? 'bg-purple-600/30 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Terminal className="w-4 h-4" />
            Frontend
            {logs.frontend && (
              <span className="text-xs text-gray-500">({logs.frontend.logs?.length || 0})</span>
            )}
          </button>
        </div>

        {/* Log content */}
        <div className="flex-1 overflow-hidden rounded-xl bg-black/40 border border-white/5">
          <div className="h-full overflow-y-auto p-4 font-mono text-xs">
            {isLoading && currentLogs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading logs...
              </div>
            ) : currentLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-500">
                <AlertTriangle className="w-8 h-8 mb-2 opacity-50" />
                <p>No logs available</p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {currentLogs.map((line, i) => (
                  <div
                    key={i}
                    className={`py-0.5 px-2 rounded ${
                      line.includes('ERROR') || line.includes('error')
                        ? 'bg-red-500/10 text-red-300'
                        : line.includes('WARNING') || line.includes('warn')
                        ? 'bg-yellow-500/10 text-yellow-300'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            Source: {logs[activeLogTab]?.source || 'N/A'} | Container: {logs[activeLogTab]?.container || 'N/A'}
          </span>
          <span>
            {autoRefresh ? 'Auto-refreshing every 3s' : 'Manual refresh'}
          </span>
        </div>
      </div>
    </div>
  )
}

// Investigation Library Modal
function LibraryModal({ isOpen, onClose, onLoadInvestigation, currentMessages, conversationKey, currentEvidenceIds }) {
  const [investigations, setInvestigations] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState(null)
  // --- Import bundle state ---
  const [importBusy, setImportBusy] = useState(false)
  const [importProgress, setImportProgress] = useState('')
  const [importInspection, setImportInspection] = useState(null)
  const [importConflict, setImportConflict] = useState(null) // { resolve: (decision) => void, existing, incoming }
  const importFileInputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      loadInvestigations()
    }
  }, [isOpen])

  const loadInvestigations = () => {
    // Browser-owned: read directly from localStorage, sorted newest-first
    const all = [...storage.getInvestigations()].sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
    )
    setInvestigations(all)
  }

  const handleSave = async () => {
    if (!saveTitle.trim()) {
      setMessage({ type: 'error', text: 'Please enter a title' })
      return
    }
    if (currentMessages.length === 0) {
      setMessage({ type: 'error', text: 'No messages to save' })
      return
    }

    setIsLoading(true)
    try {
      // Use the live conversationKey as the id for new saves so evidences in
      // IndexedDB (which were stored against conversationKey) remain linked
      // to the newly-created investigation without a migration step.
      const saveId = editingId || conversationKey
      storage.saveInvestigation({
        id: saveId,
        title: saveTitle,
        description: saveDescription,
        messages: currentMessages,
        tags: saveTags.split(',').map(t => t.trim()).filter(t => t),
        evidenceIds: Array.isArray(currentEvidenceIds) ? currentEvidenceIds : [],
      })
      setMessage({ type: 'success', text: editingId ? 'Investigation updated' : 'Investigation saved' })
      setShowSaveForm(false)
      setSaveTitle('')
      setSaveDescription('')
      setSaveTags('')
      setEditingId(null)
      loadInvestigations()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = (id, title) => {
    if (!confirm(`Delete investigation "${title}"?`)) return
    try {
      storage.deleteInvestigation(id)
      setMessage({ type: 'success', text: 'Investigation deleted' })
      loadInvestigations()
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const handleLoad = (investigation) => {
    onLoadInvestigation(investigation)
    onClose()
  }

  // ------------------------- Import bundle -------------------------
  const handleImportFileSelected = async (file) => {
    if (!file) return
    setImportBusy(true)
    setImportProgress('Reading ZIP…')
    setMessage(null)
    try {
      const inspection = await inspectBundle(file)
      if (!inspection.messages) {
        setMessage({
          type: 'error',
          text: 'This bundle has neither messages.json nor a parseable conversation.md. Nothing to import.',
        })
        setImportBusy(false)
        setImportProgress('')
        return
      }
      const degraded = inspection.messagesSource !== 'messages.json'
      setImportInspection(inspection)
      // If an investigation already exists with this id, ask the user.
      let conflictDecision = null
      const runImport = async (decisionForInvestigation) => {
        try {
          const result = await importBundle({
            inspection,
            titleOverride: null,
            onConflict: async ({ kind, existing, incoming }) => {
              if (kind === 'investigation') return decisionForInvestigation
              // Evidence-level: always dedupe by sha256 (silent 'skip'). Users
              // rarely want duplicate evidence bytes in the same case.
              return 'skip'
            },
            onProgress: (m) => setImportProgress(m),
          })
          setMessage({
            type: 'success',
            text:
              `Imported "${inspection.manifest?.title || 'case'}" — ` +
              `${inspection.messages.length} messages, ` +
              `${result.addedEvidences.length} new evidences, ` +
              `${result.skippedEvidences.length} skipped.` +
              (degraded
                ? ' (Degraded import: messages reconstructed from conversation.md; thought process, tool calls and evidence links were not recovered.)'
                : ''),
          })
          loadInvestigations()
        } catch (e) {
          setMessage({ type: 'error', text: e.message || String(e) })
        } finally {
          setImportBusy(false)
          setImportProgress('')
          setImportInspection(null)
          setImportConflict(null)
        }
      }

      if (inspection.existing) {
        // Defer until user picks a resolution via the conflict dialog.
        setImportConflict({
          existing: inspection.existing,
          incoming: { id: inspection.incomingId, title: inspection.manifest?.title || '(untitled)' },
          resolve: (decision) => {
            if (decision === 'cancel') {
              setImportBusy(false)
              setImportProgress('')
              setImportInspection(null)
              setImportConflict(null)
              setMessage({ type: 'error', text: 'Import cancelled.' })
              return
            }
            setImportConflict(null)
            runImport(decision)
          },
        })
      } else {
        await runImport('rename') // decision irrelevant when no conflict
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Import failed: ${e.message || e}` })
      setImportBusy(false)
      setImportProgress('')
    }
  }

  const formatDate = (isoString) => {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-darker rounded-2xl w-full max-w-3xl p-6 animate-slide-up max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Library className="w-6 h-6 text-purple-400" />
            <h2 className="text-xl font-semibold text-gradient">Investigation Library</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-smooth">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {message && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Save current chat section */}
        <div className="mb-4 p-4 glass rounded-xl">
          {!showSaveForm ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                onClick={() => setShowSaveForm(true)}
                className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-smooth"
                disabled={currentMessages.length === 0}
              >
                <Save className="w-4 h-4" />
                <span>Save current investigation ({currentMessages.length} messages)</span>
              </button>

              <div className="flex items-center gap-2">
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".zip,application/zip"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) handleImportFileSelected(f)
                  }}
                />
                <button
                  onClick={() => importFileInputRef.current?.click()}
                  disabled={importBusy}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm text-gray-200 transition-smooth disabled:opacity-50"
                  title="Import a SPECTRA Case Bundle (.zip) exported by another browser"
                >
                  {importBusy ? (
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                  ) : (
                    <Upload className="w-4 h-4 text-purple-400" />
                  )}
                  <span>Import bundle</span>
                </button>
                {importBusy && importProgress && (
                  <span className="text-xs text-purple-300">{importProgress}</span>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="Investigation title..."
                className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
              />
              <input
                type="text"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                placeholder="Brief description (optional)..."
                className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
              />
              <input
                type="text"
                value={saveTags}
                onChange={(e) => setSaveTags(e.target.value)}
                placeholder="Tags (comma-separated)..."
                className="w-full px-3 py-2 glass rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-smooth flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <button
                  onClick={() => { setShowSaveForm(false); setEditingId(null) }}
                  className="px-4 py-2 glass hover:bg-white/10 text-gray-300 rounded-lg transition-smooth"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Investigations list */}
        <div className="flex-1 overflow-y-auto">
          <h3 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4" />
            Saved Investigations ({investigations.length})
          </h3>
          
          {isLoading && investigations.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading...
            </div>
          ) : investigations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Library className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No saved investigations yet</p>
              <p className="text-sm mt-1">Save your current chat to start building your library</p>
            </div>
          ) : (
            <div className="space-y-2">
              {investigations.map((inv) => (
                <div
                  key={inv.id}
                  className="glass p-4 rounded-xl hover:bg-white/10 transition-smooth group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-white truncate">{inv.title}</h4>
                      {inv.description && (
                        <p className="text-sm text-gray-400 mt-1 truncate">{inv.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {inv.messages.length} messages
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDate(inv.updated_at)}
                        </span>
                      </div>
                      {inv.tags && inv.tags.length > 0 && (
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                          {inv.tags.map((tag, i) => (
                            <span key={i} className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-xs">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 ml-4 opacity-0 group-hover:opacity-100 transition-smooth">
                      <button
                        onClick={() => handleLoad(inv)}
                        className="p-2 hover:bg-purple-500/20 rounded-lg transition-smooth text-purple-400"
                        title="Load investigation"
                      >
                        <FolderOpen className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(inv.id, inv.title)}
                        className="p-2 hover:bg-red-500/20 rounded-lg transition-smooth text-red-400"
                        title="Delete investigation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Import conflict dialog — shown when an investigation with the
            same id already exists in the library. */}
        {importConflict && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="glass-darker rounded-2xl border border-white/10 shadow-2xl w-full max-w-md p-5 animate-slide-up">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-semibold text-gray-100">Investigation already exists</h3>
              </div>
              <p className="text-sm text-gray-400 mb-4">
                An investigation titled{' '}
                <span className="text-gray-200 font-medium">"{importConflict.existing.title}"</span>{' '}
                already exists with id{' '}
                <code className="text-[11px] text-gray-400">{importConflict.existing.id}</code>.
                How would you like to handle this?
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => importConflict.resolve('rename')}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-smooth"
                >
                  <div className="text-sm text-gray-100 font-medium">Keep both (rename incoming)</div>
                  <div className="text-xs text-gray-500">Imports as a new investigation with a fresh id. Evidences are re-added under the new id.</div>
                </button>
                <button
                  onClick={() => importConflict.resolve('replace')}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition-smooth"
                >
                  <div className="text-sm text-red-200 font-medium">Replace existing</div>
                  <div className="text-xs text-red-300/80">Overwrites the existing investigation with the bundle's contents. Existing evidences for that id are kept (sha256-deduped).</div>
                </button>
                <button
                  onClick={() => importConflict.resolve('cancel')}
                  className="w-full text-left px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-smooth"
                >
                  <div className="text-sm text-gray-100 font-medium">Cancel</div>
                  <div className="text-xs text-gray-500">Abort the import.</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Export Case Bundle modal
// ---------------------------------------------------------------------------
function ExportBundleModal({
  isOpen,
  onClose,
  title,
  conversationId,
  messages,
  meta,
  buildPdfBlob,
}) {
  const [opts, setOpts] = useState({
    includeMarkdown: true, // locked on
    includePdf: false,
    includeArtefacts: true,
    includeEvidences: true,
    redact: false,
  })
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [evidenceSize, setEvidenceSize] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [caseTitle, setCaseTitle] = useState(title || 'SPECTRA Investigation')

  useEffect(() => { setCaseTitle(title || 'SPECTRA Investigation') }, [title])

  useEffect(() => {
    let cancelled = false
    if (!isOpen || !conversationId) return
    ;(async () => {
      const list = await evidenceStore.listEvidences(conversationId)
      if (cancelled) return
      setEvidenceCount(list.length)
      setEvidenceSize(list.reduce((a, e) => a + (e.size || 0), 0))
    })()
    return () => { cancelled = true }
  }, [isOpen, conversationId])

  const toggle = (k) => setOpts((p) => ({ ...p, [k]: !p[k] }))

  const handleExport = async () => {
    setBusy(true); setProgress('Starting…')
    try {
      let pdfBlob = null
      if (opts.includePdf && typeof buildPdfBlob === 'function') {
        setProgress('Rendering PDF…')
        pdfBlob = await buildPdfBlob()
      }
      await exportCaseBundle({
        title: caseTitle,
        messages,
        conversationId,
        meta,
        options: {
          includePdf: opts.includePdf,
          includeArtefacts: opts.includeArtefacts,
          includeEvidences: opts.includeEvidences,
          redact: opts.redact,
        },
        pdfBlob,
        onProgress: (m) => setProgress(m),
      })
      setProgress('Done.')
      setTimeout(() => { setBusy(false); onClose() }, 500)
    } catch (e) {
      console.error(e)
      setProgress(`Failed: ${e.message || e}`)
      setBusy(false)
    }
  }

  if (!isOpen) return null

  const Row = ({ k, label, desc, locked, disabled }) => (
    <label className={`flex items-start gap-3 p-3 rounded-lg border transition-smooth ${
      opts[k]
        ? 'border-purple-500/30 bg-purple-500/5'
        : 'border-white/10 bg-white/5'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-white/10'}`}>
      <input
        type="checkbox"
        className="mt-1 accent-purple-500"
        checked={!!opts[k]}
        disabled={locked || disabled}
        onChange={() => !locked && !disabled && toggle(k)}
      />
      <div className="flex-1">
        <div className="text-sm text-gray-200 font-medium flex items-center gap-2">
          {label}
          {locked && <span className="text-[10px] text-purple-300 px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/25">always on</span>}
        </div>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
    </label>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-darker rounded-2xl border border-white/10 shadow-2xl w-full max-w-xl animate-slide-up overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-gray-100">Export Case Bundle</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400" disabled={busy}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-500 uppercase tracking-wider">Case title</label>
            <input
              type="text"
              value={caseTitle}
              onChange={(e) => setCaseTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white text-sm"
              placeholder="Case title"
            />
          </div>

          <div className="space-y-2">
            <Row k="includeMarkdown" label="Conversation (Markdown)" desc="conversation.md — always included as a reliable fallback." locked />
            <Row k="includePdf" label="Conversation (PDF)" desc="conversation.pdf — same renderer as the toolbar PDF export." />
            <Row k="includeArtefacts" label="Agent artefacts (JSON)" desc="One artefacts/*.json per assistant message (thought process, tools, timings)." />
            <Row
              k="includeEvidences"
              label={`Uploaded evidences (${evidenceCount})`}
              desc={`evidences/ folder with originals + .meta.json sidecars. ${evidenceStore.formatBytes(evidenceSize)} total.`}
              disabled={evidenceCount === 0}
            />
            <Row k="redact" label="Redact secrets" desc="Best-effort scrubbing of bearer tokens, API keys, long secret-shaped strings." />
          </div>

          {busy && (
            <div className="flex items-center gap-2 text-xs text-purple-300">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{progress}</span>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-white/5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm text-gray-300 hover:bg-white/5 transition-smooth"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={busy || messages.length === 0}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-sm font-medium flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Download ZIP
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // Live progress steps fed by the SSE /api/query stream
  const [thinkingSteps, setThinkingSteps] = useState([])
  // selectedCategory removed - ARIA handles all categories intelligently
  const [mcpStatus, setMcpStatus] = useState({ status: 'checking', mcp_server: '' })
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [currentInvestigationId, setCurrentInvestigationId] = useState(null)
  const [settings, setSettings] = useState(null)
  const [availableModels, setAvailableModels] = useState({})
  const [destinations, setDestinations] = useState([])
  const [activeDestination, setActiveDestination] = useState(null)
  const [destinationsLoaded, setDestinationsLoaded] = useState(false)
  const [showConsoleSelector, setShowConsoleSelector] = useState(false)
  const consoleSelectorRef = useRef(null)
  const messagesEndRef = useRef(null)

  // --- Evidence state ---------------------------------------------------
  // Conversation key: bound to either an existing investigation id (loaded
  // from the library) or a freshly-minted id for a new draft. Evidences are
  // stored in IndexedDB against this key, so saving the investigation later
  // with the same id keeps them linked for free.
  const [conversationKey, setConversationKey] = useState(() => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().slice(0, 12)
    return 'conv-' + Math.random().toString(36).slice(2, 14)
  })
  // Evidences still "pending" — attached to the composer but not yet committed
  // to a user message. On send they become the next message's evidenceIds.
  const [pendingEvidences, setPendingEvidences] = useState([])
  // All evidences for the current conversation — used to resolve chips on
  // historical messages.
  const [conversationEvidences, setConversationEvidences] = useState([])
  // Composer drag-and-drop highlight
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  // Export bundle modal
  const [showExportBundle, setShowExportBundle] = useState(false)
  const fileInputRef = useRef(null)

  // Reload conversation evidences whenever the key changes or storage bumps.
  const reloadEvidences = async () => {
    try {
      const list = await evidenceStore.listEvidences(conversationKey)
      setConversationEvidences(list)
    } catch (e) {
      console.error('[evidence] list failed:', e)
    }
  }
  useEffect(() => { reloadEvidences() }, [conversationKey])
  useEffect(() => {
    const unsub = evidenceStore.subscribe(() => { reloadEvidences() })
    return () => { unsub && unsub() }
  }, [conversationKey])

  const handleAttachFiles = async (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean)
    if (files.length === 0) return
    const added = []
    for (const f of files) {
      try {
        const meta = await evidenceStore.addEvidence({ conversationId: conversationKey, file: f })
        added.push(meta)
      } catch (e) {
        console.error('[evidence] add failed:', e)
      }
    }
    if (added.length) setPendingEvidences((p) => [...p, ...added])
  }

  const handleRemovePendingEvidence = async (ev) => {
    try { await evidenceStore.deleteEvidence(ev.id) } catch {}
    setPendingEvidences((p) => p.filter((x) => x.id !== ev.id))
  }

  const handleComposerDrop = async (e) => {
    e.preventDefault(); e.stopPropagation()
    setIsDraggingOver(false)
    const dt = e.dataTransfer
    if (!dt) return
    if (dt.files && dt.files.length) await handleAttachFiles(dt.files)
  }

  const handleComposerPaste = async (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    const files = []
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length) {
      e.preventDefault()
      await handleAttachFiles(files)
    }
  }

  // Start a completely new conversation (clears messages, mints a new key).
  const startNewConversation = () => {
    setMessages([])
    setCurrentInvestigationId(null)
    setPendingEvidences([])
    const k = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID().slice(0, 12)
      : 'conv-' + Math.random().toString(36).slice(2, 14)
    setConversationKey(k)
  }

  // Bootstrap: hydrate from localStorage, optionally migrate legacy server data,
  // then fetch the static model catalog and probe MCP health.
  useEffect(() => {
    bootstrap()
  }, [])

  const reloadFromStorage = () => {
    setDestinations(storage.getDestinations())
    setActiveDestination(storage.getActiveDestination())
    const llm = storage.getLLM()
    setSettings({
      llm_provider: llm.provider,
      llm_model: llm.model,
      llm_api_key_set: !!llm.apiKey,
      llm_api_key_preview: llm.apiKey ? llm.apiKey.slice(0, 8) + '…' : '',
    })
  }

  const bootstrap = async () => {
    // 1. One-shot migration from v1.0 single-tenant config files (if any).
    if (storage.getDestinations().length === 0 && storage.getInvestigations().length === 0) {
      try {
        const res = await fetch('/api/legacy/bootstrap')
        const data = await res.json()
        const blob = data?.data || {}
        if (blob.destinations?.length) {
          for (const d of blob.destinations) {
            storage.addDestination({
              name: d.name,
              consoleUrl: d.console_url || d.consoleUrl || '',
              apiToken: d.api_token || d.apiToken || '',
              mcpServerUrl: d.mcp_server_url || d.mcpServerUrl || '',
            })
          }
        }
        if (blob.investigations?.length) {
          for (const inv of blob.investigations) {
            storage.saveInvestigation({
              title: inv.title,
              description: inv.description,
              messages: inv.messages,
              tags: inv.tags || [],
            })
          }
        }
        if (blob.llm) {
          storage.setLLM({ provider: blob.llm.provider, model: blob.llm.model, apiKey: blob.llm.api_key })
        }
      } catch {
        // Legacy bootstrap is best-effort; ignore if disabled or missing.
      }
    }

    // 2. Hydrate React state from storage.
    reloadFromStorage()
    setDestinationsLoaded(true)

    // 3. Static model catalog from the backend (no secrets, safe to cache).
    try {
      const models = await api.models()
      if (models.status === 'success') setAvailableModels(models.models)
    } catch (e) {
      console.error('Failed to load model catalog:', e)
    }

    // 4. Probe MCP health for the active destination (if any).
    if (storage.getActiveDestination()) {
      checkMcpHealth()
    }
  }

  const switchDestination = (destId) => {
    storage.setActiveDestination(destId)
    reloadFromStorage()
    startNewConversation()
    setShowConsoleSelector(false)
    checkMcpHealth()
  }

  // Auto-open settings if no destinations are configured
  useEffect(() => {
    if (destinationsLoaded && destinations.length === 0) {
      setShowSettings(true)
    }
  }, [destinationsLoaded, destinations.length])

  // Close console selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (consoleSelectorRef.current && !consoleSelectorRef.current.contains(e.target)) {
        setShowConsoleSelector(false)
      }
    }
    if (showConsoleSelector) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showConsoleSelector])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const checkMcpHealth = async () => {
    if (!storage.getActiveDestination()) {
      setMcpStatus({ status: 'unconfigured' })
      return
    }
    setIsCheckingStatus(true)
    try {
      const data = await api.mcpHealth()
      setMcpStatus(data)
    } catch (error) {
      setMcpStatus({ status: 'unhealthy', error: error.message })
    } finally {
      setIsCheckingStatus(false)
    }
  }

  const exportToPdf = async () => {
    if (messages.length === 0) return

    // First, capture all chart images from the DOM with their dimensions
    const chartElements = document.querySelectorAll('[data-chart-id]')
    const chartImages = {}
    
    for (const chartEl of chartElements) {
      const chartId = chartEl.getAttribute('data-chart-id')
      try {
        const canvas = await html2canvas(chartEl, {
          backgroundColor: '#ffffff',
          scale: 2, // Higher quality
          logging: false,
        })
        chartImages[chartId] = {
          dataUrl: canvas.toDataURL('image/png'),
          width: chartEl.offsetWidth,
          height: chartEl.offsetHeight,
          aspectRatio: chartEl.offsetWidth / chartEl.offsetHeight
        }
      } catch (err) {
        console.error('Failed to capture chart:', chartId, err)
      }
    }

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    })

    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - (margin * 2)
    let yPos = margin
    
    // Track content on each page for empty page detection
    const pageYPositions = {} // pageNum -> max yPos reached
    let currentPageNum = 1
    
    const updatePageTracking = () => {
      pageYPositions[currentPageNum] = Math.max(pageYPositions[currentPageNum] || 0, yPos)
    }

    // Simple page break - only when content truly won't fit
    const checkPageBreak = (neededHeight) => {
      const footerSpace = 15
      const availableSpace = pageHeight - footerSpace - yPos
      
      if (neededHeight <= availableSpace) {
        return false
      }
      
      // Save current page's max yPos before breaking
      updatePageTracking()
      
      pdf.addPage()
      currentPageNum++
      drawHeader(false)
      return true
    }
    
    // Alias for backward compatibility
    const markContentAdded = updatePageTracking

    // Draw SPECTRA logo (matching the UI SVG logo)
    const drawLogo = (x, y, size) => {
      const s = size / 48 // Scale factor
      const cx = x + 24*s // Center X
      const cy = y + 24*s // Center Y
      
      // Outer spectrum ring (ellipse outline)
      pdf.setDrawColor(168, 85, 247) // purple-500
      pdf.setLineWidth(1.2*s)
      pdf.ellipse(cx, cy, 16*s, 16*s, 'S')
      
      // Converging data stream lines (from nodes to center)
      pdf.setDrawColor(192, 132, 252) // purple-400 glow
      pdf.setLineWidth(1.5*s)
      // Top-left to center
      pdf.line(x + 6*s, y + 12*s, x + 18*s, y + 20*s)
      // Bottom-left to center
      pdf.line(x + 6*s, y + 36*s, x + 18*s, y + 28*s)
      // Top-right to center
      pdf.line(x + 42*s, y + 12*s, x + 30*s, y + 20*s)
      // Bottom-right to center
      pdf.line(x + 42*s, y + 36*s, x + 30*s, y + 28*s)
      // Top to center
      pdf.line(x + 24*s, y + 4*s, x + 24*s, y + 16*s)
      
      // Central eye/lens - unified insight
      pdf.setFillColor(168, 85, 247) // purple-500
      pdf.circle(cx, cy, 8*s, 'F')
      pdf.setFillColor(26, 15, 46) // dark center
      pdf.circle(cx, cy, 4*s, 'F')
      pdf.setFillColor(192, 132, 252) // glow highlight
      pdf.circle(cx, cy, 2*s, 'F')
      
      // Data source nodes
      pdf.setFillColor(168, 85, 247) // purple-500
      pdf.circle(x + 6*s, y + 12*s, 2.5*s, 'F')   // top-left
      pdf.circle(x + 6*s, y + 36*s, 2.5*s, 'F')   // bottom-left
      pdf.circle(x + 42*s, y + 12*s, 2.5*s, 'F')  // top-right
      pdf.circle(x + 42*s, y + 36*s, 2.5*s, 'F')  // bottom-right
      pdf.circle(x + 24*s, y + 4*s, 2.5*s, 'F')   // top
    }

    // Draw header with SPECTRA branding
    const drawHeader = (isFirstPage = false) => {
      // Purple gradient header bar
      pdf.setFillColor(88, 28, 135) // purple-900
      pdf.rect(0, 0, pageWidth, isFirstPage ? 40 : 15, 'F')
      
      if (isFirstPage) {
        // Draw logo
        drawLogo(margin, 5, 30)
        
        // SPECTRA title
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(22)
        pdf.setFont('helvetica', 'bold')
        pdf.text('SPECTRA', margin + 35, 20)
        
        // Tagline
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(196, 181, 253) // purple-300
        pdf.text('Security Posture Exploration & Correlated Threat Response Assistant', margin + 35, 28)
        
        // Date on right
        pdf.setFontSize(8)
        pdf.setTextColor(167, 139, 250) // purple-400
        const dateStr = new Date().toLocaleString()
        pdf.text(dateStr, pageWidth - margin, 20, { align: 'right' })
        
        // Report subtitle
        pdf.setFontSize(7)
        pdf.text('Investigation Report', pageWidth - margin, 28, { align: 'right' })
        
        yPos = 50
      } else {
        // Smaller header for continuation pages
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.text('SPECTRA Investigation Report (continued)', margin, 10)
        yPos = 25
      }
      
      // IMPORTANT: Reset text color to dark for content after header
      pdf.setTextColor(50, 50, 50)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
    }

    // Draw footer
    const drawFooter = () => {
      const footerY = pageHeight - 8
      pdf.setFontSize(7)
      pdf.setTextColor(128, 128, 128)
      pdf.text('Powered by SentinelOne Purple AI + MCP', margin, footerY)
      pdf.text(`Page ${pdf.internal.getCurrentPageInfo().pageNumber}`, pageWidth - margin, footerY, { align: 'right' })
    }

    // Parse and render markdown table
    const renderTable = (tableText) => {
      const lines = tableText.trim().split('\n').filter(l => l.trim())
      if (lines.length < 2) return false
      
      // Parse headers
      const headers = lines[0].split('|').map(h => h.trim()).filter(h => h)
      if (headers.length === 0) return false
      
      // Skip separator line (line with ---)
      const dataStartIndex = lines[1].includes('-') ? 2 : 1
      
      // Parse data rows
      const rows = lines.slice(dataStartIndex).map(line => 
        line.split('|').map(c => c.trim()).filter(c => c)
      ).filter(r => r.length > 0)
      
      // Calculate column widths
      const colCount = headers.length
      const colWidth = (contentWidth - 4) / colCount
      const rowHeight = 6
      const headerHeight = 7
      
      // Check if table fits
      const tableHeight = headerHeight + (rows.length * rowHeight) + 4
      checkPageBreak(tableHeight)
      
      // Draw table header background
      pdf.setFillColor(88, 28, 135) // purple-900
      pdf.rect(margin, yPos, contentWidth, headerHeight, 'F')
      
      // Draw header text
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      headers.forEach((header, i) => {
        const cellX = margin + (i * colWidth) + 2
        const text = header.length > 15 ? header.substring(0, 14) + '…' : header
        pdf.text(text, cellX, yPos + 5)
      })
      yPos += headerHeight
      
      // Draw data rows
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      rows.forEach((row, rowIndex) => {
        // Alternate row background
        if (rowIndex % 2 === 0) {
          pdf.setFillColor(245, 243, 255) // light purple tint
          pdf.rect(margin, yPos, contentWidth, rowHeight, 'F')
        }
        
        // Draw cell borders
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.1)
        pdf.rect(margin, yPos, contentWidth, rowHeight, 'S')
        
        // Draw cell text
        pdf.setTextColor(50, 50, 50)
        row.forEach((cell, i) => {
          if (i < colCount) {
            const cellX = margin + (i * colWidth) + 2
            const text = cell.length > 18 ? cell.substring(0, 17) + '…' : cell
            pdf.text(text, cellX, yPos + 4)
          }
        })
        yPos += rowHeight
      })
      
      yPos += 4
      return true
    }

    // Parse and render Mermaid pie chart as table
    const renderMermaidPie = (pieText) => {
      if (!pieText) return false
      const lines = pieText.split('\n').filter(l => l.trim())
      let title = ''
      const data = []
      
      for (const line of lines) {
        const trimmed = line.trim()
        if (trimmed.startsWith('pie') || trimmed === 'showData') continue
        
        const titleMatch = trimmed.match(/^title\s+(.+)$/i)
        if (titleMatch) {
          title = titleMatch[1]
          continue
        }
        
        const dataMatch = trimmed.match(/^["'](.+?)["']\s*:\s*(\d+(?:\.\d+)?)$/)
        if (dataMatch) {
          data.push({ label: dataMatch[1], value: parseFloat(dataMatch[2]) })
        }
      }
      
      if (data.length === 0) return false
      
      const total = data.reduce((sum, item) => sum + item.value, 0)
      const topData = data.slice(0, 10)
      
      // Render title
      if (title) {
        checkPageBreak(10)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.setTextColor(88, 28, 135)
        pdf.text(title, margin, yPos)
        yPos += 6
      }
      
      // Calculate dimensions
      const colWidths = [contentWidth * 0.6, contentWidth * 0.2, contentWidth * 0.2]
      const rowHeight = 6
      const headerHeight = 7
      const tableHeight = headerHeight + (topData.length * rowHeight) + 4
      checkPageBreak(tableHeight)
      
      // Draw header
      pdf.setFillColor(88, 28, 135)
      pdf.rect(margin, yPos, contentWidth, headerHeight, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Label', margin + 2, yPos + 5)
      pdf.text('Count', margin + colWidths[0] + 2, yPos + 5)
      pdf.text('%', margin + colWidths[0] + colWidths[1] + 2, yPos + 5)
      yPos += headerHeight
      
      // Draw data rows
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      topData.forEach((item, i) => {
        if (i % 2 === 0) {
          pdf.setFillColor(245, 243, 255)
          pdf.rect(margin, yPos, contentWidth, rowHeight, 'F')
        }
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.1)
        pdf.rect(margin, yPos, contentWidth, rowHeight, 'S')
        
        pdf.setTextColor(50, 50, 50)
        const label = item.label.length > 40 ? item.label.substring(0, 38) + '…' : item.label
        pdf.text(label, margin + 2, yPos + 4)
        pdf.text(item.value.toLocaleString(), margin + colWidths[0] + 2, yPos + 4)
        pdf.text(((item.value / total) * 100).toFixed(1) + '%', margin + colWidths[0] + colWidths[1] + 2, yPos + 4)
        yPos += rowHeight
      })
      
      // Show total
      pdf.setFontSize(7)
      pdf.setTextColor(100, 100, 100)
      pdf.text(`Top ${topData.length} of ${data.length} items shown • Total: ${total.toLocaleString()}`, margin, yPos + 4)
      yPos += 8
      
      return true
    }

    drawHeader(true)

    // Process each message
    messages.forEach((msg, index) => {
      const isUser = msg.isUser
      const timestamp = new Date(msg.timestamp).toLocaleTimeString()
      
      // Role label with colored background
      checkPageBreak(15)
      pdf.setFillColor(isUser ? 139 : 88, isUser ? 92 : 28, isUser ? 246 : 135)
      pdf.roundedRect(margin, yPos - 4, isUser ? 18 : 28, 6, 1, 1, 'F')
      
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(255, 255, 255)
      pdf.text(isUser ? 'You' : 'SPECTRA', margin + 2, yPos)
      
      // Timestamp
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(7)
      pdf.setTextColor(128, 128, 128)
      pdf.text(timestamp, margin + (isUser ? 22 : 32), yPos)
      yPos += 6

      // Process content - handle tables and Mermaid pie charts
      let content = msg.content
      
      // Use regex to detect and extract Mermaid pie charts
      // Pattern captures: optional intro text + code fence with pie chart
      const mermaidCharts = []
      
      // Pattern 1: Full block with intro text and code fence
      const fullPattern = /((?:Pie chart \(renderable\)\s*\n)?(?:#\s*Mermaid pie chart\s*\n)?```mermaid\s*\n(pie[\s\S]*?)```)/gi
      
      // Pattern 2: Just code fence without intro
      const codeOnlyPattern = /(```mermaid\s*\n(pie[\s\S]*?)```)/gi
      
      let processedContent = content
      let mermaidMatch
      
      // Try full pattern first
      while ((mermaidMatch = fullPattern.exec(content)) !== null) {
        mermaidCharts.push({
          fullMatch: mermaidMatch[1],
          content: mermaidMatch[2]
        })
      }
      
      // If no matches with full pattern, try code-only pattern
      if (mermaidCharts.length === 0) {
        while ((mermaidMatch = codeOnlyPattern.exec(content)) !== null) {
          mermaidCharts.push({
            fullMatch: mermaidMatch[1],
            content: mermaidMatch[2]
          })
        }
      }
      
      // Remove all matched Mermaid blocks from content
      mermaidCharts.forEach((chart) => {
        processedContent = processedContent.replace(chart.fullMatch, '<<<MERMAID_CHART>>>')
      })
      
      // Also remove any remaining intro text that might be separate
      processedContent = processedContent.replace(/Pie chart \(renderable\)\s*\n?/gi, '')
      processedContent = processedContent.replace(/#\s*Mermaid pie chart\s*\n?/gi, '')
      
      // Split content by table patterns
      const tablePattern = /(\|[^\n]+\|\n\|[-:\s|]+\|\n(?:\|[^\n]+\|\n?)+)/g
      let lastIndex = 0
      let tableMatch
      let chartIndex = 0
      
      // Process content segments
      const segments = processedContent.split('<<<MERMAID_CHART>>>')
      
      segments.forEach((segment, segIdx) => {
        // Process tables in this segment
        lastIndex = 0
        tablePattern.lastIndex = 0
        
        while ((tableMatch = tablePattern.exec(segment)) !== null) {
          // Render text before table
          const textBefore = segment.substring(lastIndex, tableMatch.index).trim()
          if (textBefore) {
            const cleanText = textBefore
              .replace(/\*\*/g, '')
              .replace(/##\s*/g, '')
              .replace(/`/g, '')
              .replace(/\n{3,}/g, '\n\n')
            
            pdf.setFontSize(9)
            pdf.setTextColor(50, 50, 50)
            const lines = pdf.splitTextToSize(cleanText, contentWidth)
            lines.forEach((line) => {
              checkPageBreak(5)
              pdf.text(line, margin, yPos)
              yPos += 4.5
              markContentAdded()
            })
            yPos += 2
          }
          
          // Render the table
          renderTable(tableMatch[1])
          markContentAdded()
          lastIndex = tableMatch.index + tableMatch[0].length
        }
        
        // Render remaining text after last table in segment
        const textAfter = segment.substring(lastIndex).trim()
        if (textAfter) {
          const cleanText = textAfter
            .replace(/\*\*/g, '')
            .replace(/##\s*/g, '')
            .replace(/`/g, '')
            .replace(/\n{3,}/g, '\n\n')
          
          pdf.setFontSize(9)
          pdf.setTextColor(50, 50, 50)
          const textLines = pdf.splitTextToSize(cleanText, contentWidth)
          textLines.forEach((line) => {
            checkPageBreak(5)
            pdf.text(line, margin, yPos)
            yPos += 4.5
            markContentAdded()
          })
        }
        
        // Render Mermaid chart after this segment (if any)
        if (segIdx < mermaidCharts.length) {
          // Check if we have a captured chart image
          const chartId = `mermaid-${msg.id}`
          const chartData = chartImages[chartId]
          if (chartData && chartData.dataUrl) {
            // Use actual aspect ratio from captured element
            const maxWidth = contentWidth * 0.85
            const maxHeight = 100 // Maximum height in mm
            
            // Calculate dimensions preserving aspect ratio
            let imgWidth = maxWidth
            let imgHeight = imgWidth / chartData.aspectRatio
            
            // If too tall, scale down
            if (imgHeight > maxHeight) {
              imgHeight = maxHeight
              imgWidth = imgHeight * chartData.aspectRatio
            }
            
            checkPageBreak(imgHeight + 5)
            try {
              const xOffset = margin + (contentWidth - imgWidth) / 2 // Center
              pdf.addImage(chartData.dataUrl, 'PNG', xOffset, yPos, imgWidth, imgHeight)
              yPos += imgHeight + 5
            } catch (err) {
              console.error('Failed to embed chart image:', err)
              renderMermaidPie(mermaidCharts[segIdx].content)
            }
          } else {
            // Fall back to table rendering
            renderMermaidPie(mermaidCharts[segIdx].content)
          }
        }
      })

      yPos += 6 // Space between messages
      
      // Separator line
      if (index < messages.length - 1) {
        pdf.setDrawColor(200, 200, 200)
        pdf.setLineWidth(0.3)
        pdf.line(margin, yPos - 2, pageWidth - margin, yPos - 2)
        yPos += 4
      }
    })

    // Final tracking update for last page
    updatePageTracking()
    
    // Remove empty pages (pages where yPos stayed near header position)
    // Header ends at ~25mm for continuation pages, ~50mm for first page
    const emptyThreshold = 40 // Pages with max yPos < 40mm are considered empty
    const totalPages = pdf.internal.getNumberOfPages()
    const pagesToDelete = []
    
    for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
      const maxY = pageYPositions[pageNum] || 0
      if (maxY < emptyThreshold) {
        pagesToDelete.push(pageNum)
      }
    }
    
    // Delete from end to avoid index shifting
    for (let i = pagesToDelete.length - 1; i >= 0; i--) {
      pdf.deletePage(pagesToDelete[i])
    }
    
    // Add footer to all remaining pages
    const finalPageCount = pdf.internal.getNumberOfPages()
    for (let i = 1; i <= finalPageCount; i++) {
      pdf.setPage(i)
      drawFooter()
    }

    // Download
    const filename = `SPECTRA_Investigation_${new Date().toISOString().split('T')[0]}.pdf`
    pdf.save(filename)
  }

  const handleSendMessage = async (queryText = null) => {
    const query = queryText || input.trim()
    if (!query || isLoading) return

    // Snapshot pending evidences so we can bind them to this user message.
    const attachedEvidences = pendingEvidences
    const attachedEvidenceIds = attachedEvidences.map((e) => e.id)

    const userMessage = {
      id: Date.now(),
      content: query,
      isUser: true,
      timestamp: new Date().toISOString(),
      evidenceIds: attachedEvidenceIds,
    }

    // Build an "enhanced" user turn that injects small text-like evidences
    // inline so the LLM can actually read them. Binaries and large files are
    // referenced by metadata only to avoid token bloat. (Vision payloads for
    // images are deferred to a follow-up — backend support needed.)
    let enhancedContent = query
    if (attachedEvidences.length) {
      const INLINE_LIMIT = 64 * 1024 // 64 KB per text file
      const lines = ['', '', '---', '**Attached evidence:**']
      for (const ev of attachedEvidences) {
        const kind = evidenceStore.classifyEvidence(ev)
        const base = `- \`${ev.name}\` (${ev.mime || 'unknown'}, ${evidenceStore.formatBytes(ev.size)}, sha256 \`${(ev.sha256 || '').slice(0, 12)}\`)`
        if (kind === 'text' && ev.size <= INLINE_LIMIT) {
          try {
            const text = await evidenceStore.readEvidenceAsText(ev.id, { maxBytes: INLINE_LIMIT })
            if (text != null) {
              const ext = (ev.name.match(/\.([a-z0-9]+)$/i) || [, ''])[1] || ''
              lines.push(base + ' — inlined below:')
              lines.push('```' + ext)
              lines.push(text)
              lines.push('```')
              continue
            }
          } catch {}
        }
        lines.push(base + (kind === 'image' ? ' — image (not inlined; vision support pending)' : ''))
      }
      enhancedContent = query + '\n' + lines.join('\n')
    }

    // Build conversation history for context. Use the enhanced content only
    // for the outgoing request; keep the pure query on the UI bubble.
    const conversationHistory = [...messages, { ...userMessage, content: enhancedContent }].map(msg => ({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.content,
    }))

    // Clear the composer's pending list — they're now owned by the message.
    setPendingEvidences([])

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setThinkingSteps([])

    // Convert one SSE event from the backend into a timeline step, and
    // merge it with existing steps. We keep the list compact by collapsing
    // matching start/complete pairs (e.g. agent_start → agent_complete)
    // into a single row that flips from "in progress" to "done".
    const stepStart = Date.now()
    let finalResult = null
    let finalError = null
    let finalMeta = { agent: null, toolsUsed: [], thoughtProcess: null }

    const appendOrCompleteStep = (ev) => {
      const now = Date.now()
      const key = stepKey(ev)

      // Completion events that should flip an existing in-flight step
      const completeMap = {
        agent_complete: 'agent_start',
        tool_result: 'tool_call',
        tools_discovered: 'discovering_tools',
      }
      const opensKey = completeMap[ev.event]

      setThinkingSteps((prev) => {
        // If this event completes a prior one, mark that row done
        if (opensKey) {
          const openKey = ev.event === 'agent_complete'
            ? `agent:${ev.data?.agent}`
            : ev.event === 'tool_result'
              ? `tool:${ev.data?.agent}:${ev.data?.tool}`
              : 'discovering_tools'
          const idx = [...prev].reverse().findIndex((s) => s.key === openKey && !s.done)
          if (idx !== -1) {
            const realIdx = prev.length - 1 - idx
            const next = [...prev]
            next[realIdx] = {
              ...next[realIdx],
              done: true,
              isError: !!ev.data?.is_error,
              ms: now - next[realIdx].startedAt,
              detail: ev.event === 'tools_discovered' ? `${ev.data?.count ?? '?'} tools` : next[realIdx].detail,
            }
            return next
          }
        }

        // Ignore duplicate keys (e.g. re-emitted agent_start) — keep the first
        if (prev.some((s) => s.key === key && !s.done)) return prev

        // Otherwise append a new row
        let label = STEP_LABELS[ev.event] || ev.event
        let detail = ''
        if (ev.event === 'connecting_mcp') detail = ev.data?.url || ''
        else if (ev.event === 'routing') {
          const agents = ev.data?.agents || []
          detail = agents.length ? agents.join(', ') : ''
          label = ev.data?.multi_agent ? 'Routing to multiple agents' : 'Routing to specialist'
        }
        else if (ev.event === 'agent_start') { label = 'Running'; detail = ev.data?.agent || '' }
        else if (ev.event === 'tool_call')   { label = 'Calling tool'; detail = `${ev.data?.agent || ''} · ${ev.data?.tool || ''}` }
        else if (ev.event === 'synthesizing') detail = (ev.data?.agents || []).join(' + ')

        return [
          ...prev,
          { key, label, detail, done: false, startedAt: now, isError: false },
        ]
      })
    }

    try {
      const agentNames = new Set()
      const toolsSeen = new Set()
      await streamQuery(query, conversationHistory, (ev) => {
        if (ev.event === 'result') {
          finalResult = ev.data
        } else if (ev.event === 'error') {
          finalError = ev.data?.message || 'Unknown error'
        } else if (ev.event === 'thought_process') {
          finalMeta.thoughtProcess = ev.data
        } else {
          if (ev.event === 'agent_complete' && ev.data) {
            if (ev.data.agent && !ev.data.is_error) agentNames.add(ev.data.agent)
            for (const t of ev.data.tools || []) toolsSeen.add(t)
          }
          appendOrCompleteStep(ev)
        }
      })
      finalMeta.agent = [...agentNames].join(' + ') || null
      finalMeta.toolsUsed = [...toolsSeen]

      // Mark any still-open steps as complete
      setThinkingSteps((prev) =>
        prev.map((s) => (s.done ? s : { ...s, done: true, ms: Date.now() - s.startedAt }))
      )

      if (finalError) {
        setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          content: finalError,
          isUser: false,
          timestamp: new Date().toISOString(),
        }])
      } else if (finalResult) {
        const content = typeof finalResult.result === 'string'
          ? finalResult.result
          : JSON.stringify(finalResult.result, null, 2)
        setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          content,
          isUser: false,
          timestamp: new Date().toISOString(),
          agent: finalMeta.agent,
          toolsUsed: finalMeta.toolsUsed,
          thoughtProcess: finalMeta.thoughtProcess,
          totalMs: Date.now() - stepStart,
        }])
      } else {
        setMessages((prev) => [...prev, {
          id: Date.now() + 1,
          content: 'No response received from the backend.',
          isUser: false,
          timestamp: new Date().toISOString(),
        }])
      }
    } catch (error) {
      setMessages((prev) => [...prev, {
        id: Date.now() + 1,
        content: `Connection error: ${error.message}. Please ensure the MCP server is running.`,
        isUser: false,
        timestamp: new Date().toISOString(),
      }])
    } finally {
      setIsLoading(false)
      // Keep the timeline visible for ~1s so the user can see the final checks
      setTimeout(() => setThinkingSteps([]), 1200)
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const isConnected = mcpStatus.status === 'healthy'

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header - sticky */}
      <header className="glass-darker border-b border-purple-500/20 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="glow-purple">
              <SpectraLogo className="w-12 h-12" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gradient">SPECTRA</h1>
              <p className="text-xs text-purple-400/70">Security Posture Exploration & Correlated Threat Response Assistant</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Console Selector */}
            {destinations.length > 0 && (
              <div className="relative" ref={consoleSelectorRef}>
                <button
                  onClick={() => setShowConsoleSelector(!showConsoleSelector)}
                  className={`flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs transition-smooth hover:bg-white/10 ${
                    isConnected ? '' : 'border border-red-500/30'
                  }`}
                >
                  {isConnected ? (
                    <Wifi className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <WifiOff className="w-3.5 h-3.5 text-red-400" />
                  )}
                  <Globe className="w-3.5 h-3.5 text-purple-400" />
                  <span className="text-gray-300 max-w-[180px] truncate">
                    {activeDestination?.name || 'No Console'}
                  </span>
                  {showConsoleSelector ? (
                    <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </button>

                {/* Dropdown */}
                {showConsoleSelector && (
                  <div className="absolute right-0 top-full mt-2 w-72 glass-darker rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50 animate-slide-up">
                    <div className="px-3 py-2 border-b border-white/5">
                      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Switch Console</p>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {destinations.map((dest) => {
                        const isActive = dest.id === activeDestination?.id
                        return (
                        <button
                          key={dest.id}
                          onClick={() => isActive ? setShowConsoleSelector(false) : switchDestination(dest.id)}
                          className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-smooth ${
                            isActive
                              ? 'bg-purple-500/10 border-l-2 border-purple-500'
                              : 'hover:bg-white/5 border-l-2 border-transparent'
                          }`}
                        >
                          <Globe className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isActive ? 'text-purple-400' : 'text-gray-500'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-gray-300'}`}>
                                {dest.name}
                              </span>
                              {isActive && (
                                <Check className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                              )}
                            </div>
                            <p className="text-[11px] text-gray-500 truncate">{dest.consoleUrl}</p>
                          </div>
                        </button>
                      )})}
                    </div>
                    <div className="px-3 py-2 border-t border-white/5">
                      <button
                        onClick={() => { setShowConsoleSelector(false); setShowSettings(true) }}
                        className="flex items-center gap-2 text-xs text-purple-400 hover:text-purple-300 transition-smooth"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Manage Consoles
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Connection status (when no destinations) */}
            {destinations.length === 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs ${
                isConnected ? '' : 'border border-red-500/30'
              }`}>
                {isConnected ? (
                  <>
                    <Wifi className="w-4 h-4 text-green-400" />
                    <span className="text-gray-300">
                      {mcpStatus.server_name || 'MCP'} Connected
                    </span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-4 h-4 text-red-400" />
                    <span className="text-red-400">MCP Disconnected</span>
                  </>
                )}
              </div>
            )}

            <button
              onClick={checkMcpHealth}
              disabled={isCheckingStatus}
              className="p-2 glass rounded-xl hover:bg-white/10 transition-smooth"
              title="Refresh connection status"
            >
              <RefreshCw className={`w-4 h-4 text-purple-400 ${isCheckingStatus ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportToPdf}
              disabled={messages.length === 0}
              className="p-2 glass rounded-xl hover:bg-white/10 transition-smooth disabled:opacity-30 disabled:cursor-not-allowed"
              title="Export chat to PDF"
            >
              <Download className="w-4 h-4 text-purple-400" />
            </button>
            <button
              onClick={() => setShowExportBundle(true)}
              disabled={messages.length === 0}
              className="p-2 glass rounded-xl hover:bg-white/10 transition-smooth disabled:opacity-30 disabled:cursor-not-allowed"
              title="Export Case Bundle (ZIP with conversation + evidences)"
            >
              <Package className="w-4 h-4 text-purple-400" />
            </button>
            <button
              onClick={startNewConversation}
              disabled={messages.length === 0 && pendingEvidences.length === 0}
              className="p-2 glass rounded-xl hover:bg-white/10 transition-smooth disabled:opacity-30 disabled:cursor-not-allowed"
              title="Start a new conversation"
            >
              <Plus className="w-4 h-4 text-purple-400" />
            </button>
            <button
              onClick={() => setShowLibrary(true)}
              className="p-2 glass rounded-xl hover:bg-white/10 transition-smooth"
              title="Investigation Library"
            >
              <Library className="w-4 h-4 text-purple-400" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 glass rounded-xl hover:bg-white/10 transition-smooth"
              title="Settings"
            >
              <Settings className="w-4 h-4 text-purple-400" />
            </button>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={(newSettings) => {
          setSettings(newSettings)
          checkMcpHealth()
        }}
        availableModels={availableModels}
        onRefreshModels={(provider, models) => {
          setAvailableModels((prev) => ({ ...prev, [provider]: models }))
        }}
        destinations={destinations}
        activeDestinationId={activeDestination?.id || null}
        onDestinationsChange={() => {
          reloadFromStorage()
          checkMcpHealth()
        }}
      />

      {/* Export Case Bundle Modal */}
      <ExportBundleModal
        isOpen={showExportBundle}
        onClose={() => setShowExportBundle(false)}
        title={messages[0]?.content?.slice(0, 60) || 'SPECTRA Investigation'}
        conversationId={conversationKey}
        messages={messages}
        meta={{
          console: activeDestination?.name || null,
          llm: settings ? `${settings.llm_provider} / ${settings.llm_model}` : null,
        }}
      />

      {/* Investigation Library Modal */}
      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        currentMessages={messages}
        conversationKey={conversationKey}
        currentEvidenceIds={Array.from(
          new Set(
            messages.flatMap((m) => (m.evidenceIds || []))
          )
        )}
        onLoadInvestigation={(investigation) => {
          setMessages(investigation.messages)
          setCurrentInvestigationId(investigation.id)
          // Rebind evidences to the loaded investigation's id.
          setPendingEvidences([])
          setConversationKey(investigation.id)
        }}
      />

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {!isConnected ? (
            /* Disconnected State */
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-lg animate-slide-up">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-red-700/20 border border-red-500/30 flex items-center justify-center">
                  <WifiOff className="w-10 h-10 text-red-400" />
                </div>
                <h2 className="text-3xl font-bold text-gradient mb-4">
                  MCP Server Not Connected
                </h2>
                <p className="text-gray-400 mb-4">
                  Unable to connect to the Purple MCP server. Please ensure:
                </p>
                <ul className="text-gray-500 text-sm mb-6 space-y-2 text-left max-w-sm mx-auto">
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    The Purple MCP server is running and reachable
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    The MCP URL in <strong className="text-purple-300">Settings &rarr; Consoles</strong> matches exactly what the server exposes
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    The SPECTRA backend container can resolve that hostname (see hint below)
                  </li>
                </ul>
                {mcpStatus.mcp_server && (
                  <p className="text-xs text-gray-600 mb-4">
                    Configured URL: <code className="text-gray-400">{mcpStatus.mcp_server}</code>
                  </p>
                )}
                {mcpStatus.error && (
                  <p className="text-xs text-red-400 mb-4">
                    Error: {mcpStatus.error}
                  </p>
                )}
                {mcpStatus.error && /name or service not known|no address associated|Errno -[25]|getaddrinfo/i.test(String(mcpStatus.error)) && (
                  <div className="text-xs text-left max-w-lg mx-auto mb-6 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200/90">
                    <p className="font-medium mb-1">DNS hint</p>
                    <p>
                      The backend container could not resolve the hostname in the URL above.
                      If it ends in <code>.orb.local</code>, <code>.docker.internal</code>, a Docker
                      service name, or any other LAN-only name, make sure the SPECTRA backend
                      container is on the same Docker network as the MCP server. For OrbStack,
                      attach the backend to the <code>purple-mcp_default</code> network or use
                      the host-accessible URL (e.g. <code>http://host.docker.internal:8001</code>).
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-3 justify-center">
                  <button
                    onClick={checkMcpHealth}
                    disabled={isCheckingStatus}
                    className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl font-medium transition-smooth glow-purple flex items-center gap-3 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-5 h-5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                    Retry Connection
                  </button>
                  <button
                    onClick={() => setShowSettings(true)}
                    className="px-6 py-4 glass border border-purple-500/30 hover:bg-white/10 rounded-xl font-medium transition-smooth flex items-center gap-2 text-purple-300"
                  >
                    <Settings className="w-4 h-4" />
                    Open Settings
                  </button>
                </div>
              </div>
            </div>
          ) : messages.length === 0 ? (
            /* Empty State with Examples */
            <div className="flex-1 flex flex-col items-center justify-center p-8">
              <div className="text-center mb-8 animate-slide-up">
                <div className="mb-6">
                  <SpectraLogo className="w-20 h-20 mx-auto opacity-80" />
                </div>
                <h2 className="text-3xl font-bold text-gradient mb-3">
                  How can I help you today?
                </h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  I can analyze alerts, investigate threats, check vulnerabilities, and help you understand your security posture.
                </p>
                {activeDestination && (
                  <div className="flex items-center justify-center gap-2 mt-3 text-xs text-purple-400/60">
                    <Globe className="w-3.5 h-3.5" />
                    <span>Connected to <span className="text-purple-400">{activeDestination.name}</span></span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-w-4xl w-full">
                {EXAMPLE_QUERIES.map((ex, i) => (
                  <ExampleCard
                    key={i}
                    query={ex.query}
                    onClick={handleSendMessage}
                  />
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <ZoneProvider>
              <div className="flex-1 overflow-y-auto overflow-x-hidden">
                <div className="sticky top-0 z-10 px-6 pt-4 pb-2 bg-gradient-to-b from-[rgba(10,8,20,0.85)] to-transparent backdrop-blur-sm">
                  <div className="max-w-4xl mx-auto flex justify-start">
                    <ZoneControlsBar />
                  </div>
                </div>
                <div className="px-6 pb-6 space-y-4">
                  {messages.map((msg) => {
                    // Resolve evidence metadata for chip display on user turns.
                    const msgEvidences = (msg.evidenceIds || [])
                      .map((id) => conversationEvidences.find((e) => e.id === id))
                      .filter(Boolean)
                    return (
                      <Message
                        key={msg.id}
                        message={msg}
                        isUser={msg.isUser}
                        messageEvidences={msgEvidences}
                      />
                    )
                  })}
                  {isLoading && <ThinkingTimeline steps={thinkingSteps} />}
                  <div ref={messagesEndRef} />
                </div>
              </div>
            </ZoneProvider>
          )}

          {/* Input Area */}
          {isConnected && (
            <div
              className="p-4 border-t border-white/5"
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true) }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleComposerDrop}
            >
              <div className="max-w-4xl mx-auto">
                {/* Pending evidence chips */}
                {pendingEvidences.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {pendingEvidences.map((ev) => (
                      <EvidenceChip
                        key={ev.id}
                        evidence={ev}
                        onRemove={handleRemovePendingEvidence}
                      />
                    ))}
                  </div>
                )}

                <div
                  className={
                    'glass rounded-2xl p-2 flex items-end gap-2 transition-colors ' +
                    (isDraggingOver ? 'ring-2 ring-purple-400/70 bg-purple-500/10' : '')
                  }
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { handleAttachFiles(e.target.files); e.target.value = '' }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 rounded-xl hover:bg-white/10 text-purple-300 transition-smooth"
                    title="Attach evidence (or drag-and-drop / paste)"
                  >
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onPaste={handleComposerPaste}
                    placeholder={
                      isDraggingOver
                        ? 'Drop files to attach as evidence…'
                        : 'Ask about alerts, vulnerabilities, threats, or drop a file here as evidence…'
                    }
                    rows={1}
                    className="flex-1 bg-transparent px-4 py-3 resize-none focus:outline-none text-white placeholder-gray-500 max-h-32"
                    style={{ minHeight: '48px' }}
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={(!input.trim() && pendingEvidences.length === 0) || isLoading}
                    className="p-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-smooth flex items-center justify-center"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="glass-darker border-t border-purple-500/10 py-3">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <p className="text-xs text-gray-600">
            Powered by <span className="text-purple-400">SentinelOne</span> Purple AI + MCP
          </p>
          <p className="text-xs text-gray-600 flex items-center gap-1">
            Crafted with <Heart className="w-3 h-3 text-purple-500" /> by <span className="text-purple-400 cursor-help relative group">The AI Chef Brigade<span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none border border-purple-500/30">Who is The AI Chef Brigade? Nate Smalley and Marco Rottigni a.k.a. The RoarinPenguin</span></span>
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
