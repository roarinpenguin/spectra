import { useState, useRef, useEffect } from 'react'
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
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

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

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
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
  const mdComponents = {
    code: ({node, inline, className, children, ...props}) => {
      const text = String(children).replace(/\n$/, '')
      // Detect Mermaid pie chart syntax
      if (!inline && (className === 'language-mermaid' || text.trim().startsWith('pie'))) {
        return <MermaidPieChart content={text} chartId={`mermaid-${messageId}`} />
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
      if (children?.type === MermaidPieChart) return children
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
    <div className="prose prose-invert prose-sm max-w-none">
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

        const isExpanded = expandByDefault.some(k => section.title.toLowerCase().includes(k)) || idx === 1
        return (
          <CollapsibleSection key={idx} title={section.title} defaultOpen={isExpanded}>
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
    <CollapsibleSection title="Thought Process" defaultOpen={false}>
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

        {/* Tool call sequence */}
        {tool_calls && tool_calls.length > 0 && (
          <div>
            <span className="text-xs font-semibold text-purple-300 uppercase tracking-wide ml-7">Tool Calls ({tool_calls.length})</span>
            <div className="mt-1.5 ml-7 space-y-1">
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
          </div>
        )}
      </div>
    </CollapsibleSection>
  )
}

function Message({ message, isUser }) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div
        className={`max-w-[80%] rounded-2xl px-5 py-4 ${
          isUser
            ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white'
            : 'glass text-gray-100'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
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

function LoadingIndicator() {
  return (
    <div className="flex justify-start animate-slide-up">
      <div className="glass rounded-2xl px-5 py-4 flex items-center gap-2">
        <div className="flex gap-1">
          <div className="w-2 h-2 bg-purple-400 rounded-full loading-dot" />
          <div className="w-2 h-2 bg-purple-400 rounded-full loading-dot" />
          <div className="w-2 h-2 bg-purple-400 rounded-full loading-dot" />
        </div>
        <span className="text-gray-400 text-sm ml-2">SPECTRA is correlating data...</span>
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

function SettingsModal({ isOpen, onClose, settings, onSave, availableModels }) {
  const [formData, setFormData] = useState({
    mcp_server_url: settings?.mcp_server_url || '',
    llm_provider: settings?.llm_provider || 'anthropic',
    llm_api_key: '',
    llm_model: settings?.llm_model || '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState(null)
  const [showLogs, setShowLogs] = useState(false)

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({
        ...prev,
        mcp_server_url: settings.mcp_server_url || '',
        llm_provider: settings.llm_provider || 'anthropic',
        llm_model: settings.llm_model || '',
      }))
    }
  }, [settings])

  const handleProviderChange = (provider) => {
    setFormData(prev => ({
      ...prev,
      llm_provider: provider,
      llm_model: availableModels?.[provider]?.[0] || '',
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    setMessage(null)
    try {
      const payload = {}
      if (formData.mcp_server_url !== settings?.mcp_server_url) {
        payload.mcp_server_url = formData.mcp_server_url
      }
      if (formData.llm_provider !== settings?.llm_provider) {
        payload.llm_provider = formData.llm_provider
      }
      if (formData.llm_api_key) {
        payload.llm_api_key = formData.llm_api_key
      }
      if (formData.llm_model !== settings?.llm_model) {
        payload.llm_model = formData.llm_model
      }

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await response.json()
      
      if (data.status === 'success') {
        setMessage({ type: 'success', text: data.message || 'Settings saved!' })
        onSave(data.settings)
        setFormData(prev => ({ ...prev, llm_api_key: '' }))
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to save settings' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsSaving(false)
    }
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

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-5">
              {/* MCP Server URL */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  MCP Server URL
                </label>
                <input
                  type="text"
                  value={formData.mcp_server_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, mcp_server_url: e.target.value }))}
                  placeholder="http://localhost:10000"
                  className="w-full px-4 py-3 glass rounded-xl bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
                />
              </div>

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
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Model <span className="text-gray-500 text-xs">(type exact API model ID)</span>
                </label>
                <input
                  type="text"
                  value={formData.llm_model}
                  onChange={(e) => setFormData(prev => ({ ...prev, llm_model: e.target.value }))}
                  placeholder="e.g., gpt-5.2-codex-medium"
                  className="w-full px-4 py-3 glass rounded-xl bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-white placeholder-gray-500"
                  list="model-suggestions"
                />
                <datalist id="model-suggestions">
                  {currentModels.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
                <p className="text-xs text-gray-500 mt-1">
                  Suggestions: {currentModels.slice(0, 3).join(', ')}...
                </p>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="w-full py-3 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl font-medium transition-smooth flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Save Settings
                  </>
                )}
              </button>
            </div>
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
      const res = await fetch('/api/logs?container=all&lines=200')
      const data = await res.json()
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
function LibraryModal({ isOpen, onClose, onLoadInvestigation, currentMessages }) {
  const [investigations, setInvestigations] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [showSaveForm, setShowSaveForm] = useState(false)
  const [saveTitle, setSaveTitle] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    if (isOpen) {
      loadInvestigations()
    }
  }, [isOpen])

  const loadInvestigations = async () => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/investigations')
      const data = await response.json()
      if (data.status === 'success') {
        setInvestigations(data.investigations)
      }
    } catch (error) {
      console.error('Failed to load investigations:', error)
    } finally {
      setIsLoading(false)
    }
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
      const response = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: saveTitle,
          description: saveDescription,
          messages: currentMessages,
          tags: saveTags.split(',').map(t => t.trim()).filter(t => t),
          investigation_id: editingId,
        }),
      })
      const data = await response.json()
      if (data.status === 'success') {
        setMessage({ type: 'success', text: data.message })
        setShowSaveForm(false)
        setSaveTitle('')
        setSaveDescription('')
        setSaveTags('')
        setEditingId(null)
        loadInvestigations()
      } else {
        setMessage({ type: 'error', text: data.detail || 'Failed to save' })
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id, title) => {
    if (!confirm(`Delete investigation "${title}"?`)) return
    
    try {
      const response = await fetch(`/api/investigations/${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.status === 'success') {
        setMessage({ type: 'success', text: 'Investigation deleted' })
        loadInvestigations()
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message })
    }
  }

  const handleLoad = (investigation) => {
    onLoadInvestigation(investigation)
    onClose()
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
            <button
              onClick={() => setShowSaveForm(true)}
              className="flex items-center gap-2 text-purple-400 hover:text-purple-300 transition-smooth"
              disabled={currentMessages.length === 0}
            >
              <Save className="w-4 h-4" />
              <span>Save current investigation ({currentMessages.length} messages)</span>
            </button>
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
      </div>
    </div>
  )
}

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  // selectedCategory removed - ARIA handles all categories intelligently
  const [mcpStatus, setMcpStatus] = useState({ status: 'checking', mcp_server: '' })
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [currentInvestigationId, setCurrentInvestigationId] = useState(null)
  const [settings, setSettings] = useState(null)
  const [availableModels, setAvailableModels] = useState({})
  const messagesEndRef = useRef(null)

  // Load settings and check MCP server connection on load
  useEffect(() => {
    loadSettings()
    checkMcpHealth()
  }, [])

  const loadSettings = async () => {
    try {
      const [settingsRes, modelsRes] = await Promise.all([
        fetch('/api/settings'),
        fetch('/api/settings/models'),
      ])
      const settingsData = await settingsRes.json()
      const modelsData = await modelsRes.json()
      
      if (settingsData.status === 'success') {
        setSettings(settingsData.settings)
      }
      if (modelsData.status === 'success') {
        setAvailableModels(modelsData.models)
      }
    } catch (error) {
      console.error('Failed to load settings:', error)
    }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const checkMcpHealth = async () => {
    setIsCheckingStatus(true)
    try {
      const response = await fetch('/api/mcp-health')
      const data = await response.json()
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

    const userMessage = {
      id: Date.now(),
      content: query,
      isUser: true,
      timestamp: new Date().toISOString(),
    }

    // Build conversation history for context
    const conversationHistory = [...messages, userMessage].map(msg => ({
      role: msg.isUser ? 'user' : 'assistant',
      content: msg.content,
    }))

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, conversation_history: conversationHistory }),
      })

      const data = await response.json()

      let content = 'I apologize, but I encountered an error processing your request.'
      if (data.status === 'success' && data.result) {
        content = typeof data.result === 'string'
          ? data.result
          : JSON.stringify(data.result, null, 2)
      } else if (data.detail) {
        content = `Error: ${data.detail}`
      } else if (data.error) {
        content = `Error: ${data.error}`
      }

      const aiMessage = {
        id: Date.now() + 1,
        content,
        isUser: false,
        timestamp: new Date().toISOString(),
        agent: data.agent || null,
        toolsUsed: data.tools_used || [],
        thoughtProcess: data.thought_process || null,
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      const errorMessage = {
        id: Date.now() + 1,
        content: `Connection error: ${error.message}. Please ensure the MCP server is running.`,
        isUser: false,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
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
            <div className={`flex items-center gap-2 px-3 py-1.5 glass rounded-full text-xs ${
              isConnected ? '' : 'border border-red-500/30'
            }`}>
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-400" />
                  <span className="text-gray-300">
                    {mcpStatus.server_name || 'MCP'} Connected
                    {mcpStatus.console_url && (
                      <span className="text-purple-400 ml-1">
                        → {mcpStatus.console_url.replace('https://', '').split('.')[0]}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-400" />
                  <span className="text-red-400">MCP Disconnected</span>
                </>
              )}
            </div>
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
      />

      {/* Investigation Library Modal */}
      <LibraryModal
        isOpen={showLibrary}
        onClose={() => setShowLibrary(false)}
        currentMessages={messages}
        onLoadInvestigation={(investigation) => {
          setMessages(investigation.messages)
          setCurrentInvestigationId(investigation.id)
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
                    The MCP server is running
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    The MCP_SERVER_URL environment variable is correctly configured
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-purple-400">•</span>
                    Network connectivity between the UI and MCP server
                  </li>
                </ul>
                {mcpStatus.mcp_server && (
                  <p className="text-xs text-gray-600 mb-4">
                    Configured URL: {mcpStatus.mcp_server}
                  </p>
                )}
                {mcpStatus.error && (
                  <p className="text-xs text-red-400 mb-4">
                    Error: {mcpStatus.error}
                  </p>
                )}
                <button
                  onClick={checkMcpHealth}
                  disabled={isCheckingStatus}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 rounded-xl font-medium transition-smooth glow-purple flex items-center gap-3 mx-auto disabled:opacity-50"
                >
                  <RefreshCw className={`w-5 h-5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  Retry Connection
                </button>
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
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((msg) => (
                <Message key={msg.id} message={msg} isUser={msg.isUser} />
              ))}
              {isLoading && <LoadingIndicator />}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Input Area */}
          {isConnected && (
            <div className="p-4 border-t border-white/5">
              <div className="max-w-4xl mx-auto">
                <div className="glass rounded-2xl p-2 flex items-end gap-2">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Ask about alerts, vulnerabilities, threats, or any security question..."
                    rows={1}
                    className="flex-1 bg-transparent px-4 py-3 resize-none focus:outline-none text-white placeholder-gray-500 max-h-32"
                    style={{ minHeight: '48px' }}
                  />
                  <button
                    onClick={() => handleSendMessage()}
                    disabled={!input.trim() || isLoading}
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
            Crafted with <Heart className="w-3 h-3 text-purple-500" /> by <span className="text-purple-400">Roarinpenguin</span>
          </p>
        </div>
      </footer>
    </div>
  )
}

export default App
