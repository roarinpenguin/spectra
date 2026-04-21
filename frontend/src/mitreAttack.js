/**
 * SPECTRA — MITRE ATT&CK® helpers.
 *
 * Provides:
 *   - TACTICS         : ordered kill-chain tactics (Enterprise matrix).
 *   - TECHNIQUE_TACTIC: static lookup of common techniques -> primary tactic id.
 *   - linkFor()       : ATT&CK web URL for a technique or subtechnique id.
 *   - tacticFor()     : best-effort tactic lookup for a given technique id.
 *   - groupByTactic() : groups a list of technique ids into tactic columns.
 *
 * Rationale: we deliberately ship a small static map (~120 common technique
 * ids) instead of fetching the full ATT&CK STIX bundle at runtime. That keeps
 * the deck renderer fully offline-capable and browser-only. Unknown
 * techniques land in the "unknown" bucket and still render with a working
 * link to the ATT&CK site — the user can then manually classify.
 *
 * When ATT&CK introduces new techniques, extend `TECHNIQUE_TACTIC` below.
 */

// ---------------------------------------------------------------------------
// Tactic catalogue (MITRE ATT&CK Enterprise, v14+ ordering).
// ---------------------------------------------------------------------------

export const TACTICS = [
  { id: 'TA0043', key: 'reconnaissance',      label: 'Reconnaissance',       short: 'Recon' },
  { id: 'TA0042', key: 'resource-development',label: 'Resource Development', short: 'ResDev' },
  { id: 'TA0001', key: 'initial-access',      label: 'Initial Access',       short: 'Access' },
  { id: 'TA0002', key: 'execution',           label: 'Execution',            short: 'Exec' },
  { id: 'TA0003', key: 'persistence',         label: 'Persistence',          short: 'Persist' },
  { id: 'TA0004', key: 'privilege-escalation',label: 'Privilege Escalation', short: 'PrivEsc' },
  { id: 'TA0005', key: 'defense-evasion',     label: 'Defense Evasion',      short: 'Evasion' },
  { id: 'TA0006', key: 'credential-access',   label: 'Credential Access',    short: 'Creds' },
  { id: 'TA0007', key: 'discovery',           label: 'Discovery',            short: 'Discovery' },
  { id: 'TA0008', key: 'lateral-movement',    label: 'Lateral Movement',     short: 'Lateral' },
  { id: 'TA0009', key: 'collection',          label: 'Collection',           short: 'Collect' },
  { id: 'TA0011', key: 'command-and-control', label: 'Command & Control',    short: 'C2' },
  { id: 'TA0010', key: 'exfiltration',        label: 'Exfiltration',         short: 'Exfil' },
  { id: 'TA0040', key: 'impact',              label: 'Impact',               short: 'Impact' },
]

export const TACTIC_UNKNOWN = {
  id: 'UNKNOWN',
  key: 'unknown',
  label: 'Unclassified',
  short: 'Other',
}

// ---------------------------------------------------------------------------
// Technique -> primary tactic lookup.
// Only the base technique id is keyed; subtechniques (e.g. T1566.001)
// inherit their parent's tactic via `tacticFor()`.
// ---------------------------------------------------------------------------

export const TECHNIQUE_TACTIC = {
  // --- Initial Access (TA0001) -----------------------------------------
  T1566: 'initial-access',          // Phishing
  T1078: 'initial-access',          // Valid Accounts (also persistence, privesc, evasion)
  T1190: 'initial-access',          // Exploit Public-Facing Application
  T1133: 'initial-access',          // External Remote Services
  T1200: 'initial-access',          // Hardware Additions
  T1091: 'initial-access',          // Replication Through Removable Media
  T1195: 'initial-access',          // Supply Chain Compromise
  T1199: 'initial-access',          // Trusted Relationship
  T1189: 'initial-access',          // Drive-by Compromise

  // --- Execution (TA0002) ----------------------------------------------
  T1059: 'execution',               // Command and Scripting Interpreter
  T1203: 'execution',               // Exploitation for Client Execution
  T1106: 'execution',               // Native API
  T1053: 'execution',               // Scheduled Task/Job (also persistence, privesc)
  T1129: 'execution',               // Shared Modules
  T1072: 'execution',               // Software Deployment Tools
  T1569: 'execution',               // System Services
  T1204: 'execution',               // User Execution
  T1047: 'execution',               // Windows Management Instrumentation
  T1559: 'execution',               // Inter-Process Communication
  T1610: 'execution',               // Deploy Container

  // --- Persistence (TA0003) --------------------------------------------
  T1098: 'persistence',             // Account Manipulation
  T1197: 'persistence',             // BITS Jobs
  T1547: 'persistence',             // Boot/Logon Autostart
  T1037: 'persistence',             // Boot/Logon Initialization Scripts
  T1176: 'persistence',             // Browser Extensions
  T1554: 'persistence',             // Compromise Client Software Binary
  T1136: 'persistence',             // Create Account
  T1543: 'persistence',             // Create/Modify System Process
  T1546: 'persistence',             // Event Triggered Execution
  T1574: 'persistence',             // Hijack Execution Flow
  T1525: 'persistence',             // Implant Internal Image
  T1556: 'persistence',             // Modify Authentication Process
  T1137: 'persistence',             // Office Application Startup
  T1542: 'persistence',             // Pre-OS Boot
  T1505: 'persistence',             // Server Software Component
  T1205: 'persistence',             // Traffic Signaling

  // --- Privilege Escalation (TA0004) -----------------------------------
  T1548: 'privilege-escalation',    // Abuse Elevation Control Mechanism
  T1134: 'privilege-escalation',    // Access Token Manipulation
  T1484: 'privilege-escalation',    // Domain Policy Modification
  T1611: 'privilege-escalation',    // Escape to Host
  T1068: 'privilege-escalation',    // Exploitation for Privilege Escalation

  // --- Defense Evasion (TA0005) ----------------------------------------
  T1562: 'defense-evasion',         // Impair Defenses
  T1070: 'defense-evasion',         // Indicator Removal
  T1202: 'defense-evasion',         // Indirect Command Execution
  T1036: 'defense-evasion',         // Masquerading
  T1112: 'defense-evasion',         // Modify Registry
  T1027: 'defense-evasion',         // Obfuscated Files or Information
  T1055: 'defense-evasion',         // Process Injection
  T1218: 'defense-evasion',         // System Binary Proxy Execution
  T1222: 'defense-evasion',         // File and Directory Permissions Modification
  T1140: 'defense-evasion',         // Deobfuscate/Decode Files
  T1497: 'defense-evasion',         // Virtualization/Sandbox Evasion
  T1553: 'defense-evasion',         // Subvert Trust Controls
  T1620: 'defense-evasion',         // Reflective Code Loading
  T1014: 'defense-evasion',         // Rootkit
  T1564: 'defense-evasion',         // Hide Artifacts

  // --- Credential Access (TA0006) --------------------------------------
  T1110: 'credential-access',       // Brute Force
  T1555: 'credential-access',       // Credentials from Password Stores
  T1212: 'credential-access',       // Exploitation for Credential Access
  T1187: 'credential-access',       // Forced Authentication
  T1606: 'credential-access',       // Forge Web Credentials
  T1056: 'credential-access',       // Input Capture
  T1557: 'credential-access',       // Adversary-in-the-Middle
  T1558: 'credential-access',       // Steal or Forge Kerberos Tickets
  T1552: 'credential-access',       // Unsecured Credentials
  T1003: 'credential-access',       // OS Credential Dumping
  T1040: 'credential-access',       // Network Sniffing (also discovery)
  T1528: 'credential-access',       // Steal Application Access Token

  // --- Discovery (TA0007) ----------------------------------------------
  T1087: 'discovery',               // Account Discovery
  T1010: 'discovery',               // Application Window Discovery
  T1217: 'discovery',               // Browser Information Discovery
  T1083: 'discovery',               // File and Directory Discovery
  T1046: 'discovery',               // Network Service Discovery
  T1135: 'discovery',               // Network Share Discovery
  T1057: 'discovery',               // Process Discovery
  T1012: 'discovery',               // Query Registry
  T1018: 'discovery',               // Remote System Discovery
  T1082: 'discovery',               // System Information Discovery
  T1016: 'discovery',               // System Network Configuration Discovery
  T1049: 'discovery',               // System Network Connections Discovery
  T1033: 'discovery',               // System Owner/User Discovery
  T1007: 'discovery',               // System Service Discovery
  T1124: 'discovery',               // System Time Discovery
  T1069: 'discovery',               // Permission Groups Discovery

  // --- Lateral Movement (TA0008) ---------------------------------------
  T1210: 'lateral-movement',        // Exploitation of Remote Services
  T1534: 'lateral-movement',        // Internal Spearphishing
  T1570: 'lateral-movement',        // Lateral Tool Transfer
  T1563: 'lateral-movement',        // Remote Service Session Hijacking
  T1021: 'lateral-movement',        // Remote Services (RDP, SMB, SSH, WMI)
  T1091: 'lateral-movement',        // Replication Through Removable Media
  T1072: 'lateral-movement',        // Software Deployment Tools
  T1080: 'lateral-movement',        // Taint Shared Content

  // --- Collection (TA0009) ---------------------------------------------
  T1560: 'collection',              // Archive Collected Data
  T1119: 'collection',              // Automated Collection
  T1115: 'collection',              // Clipboard Data
  T1213: 'collection',              // Data from Information Repositories
  T1005: 'collection',              // Data from Local System
  T1039: 'collection',              // Data from Network Shared Drive
  T1025: 'collection',              // Data from Removable Media
  T1074: 'collection',              // Data Staged
  T1114: 'collection',              // Email Collection
  T1185: 'collection',              // Browser Session Hijacking
  T1113: 'collection',              // Screen Capture
  T1125: 'collection',              // Video Capture

  // --- Command & Control (TA0011) --------------------------------------
  T1071: 'command-and-control',     // Application Layer Protocol
  T1132: 'command-and-control',     // Data Encoding
  T1001: 'command-and-control',     // Data Obfuscation
  T1568: 'command-and-control',     // Dynamic Resolution
  T1573: 'command-and-control',     // Encrypted Channel
  T1008: 'command-and-control',     // Fallback Channels
  T1105: 'command-and-control',     // Ingress Tool Transfer
  T1104: 'command-and-control',     // Multi-Stage Channels
  T1095: 'command-and-control',     // Non-Application Layer Protocol
  T1571: 'command-and-control',     // Non-Standard Port
  T1572: 'command-and-control',     // Protocol Tunneling
  T1090: 'command-and-control',     // Proxy
  T1219: 'command-and-control',     // Remote Access Software
  T1102: 'command-and-control',     // Web Service

  // --- Exfiltration (TA0010) -------------------------------------------
  T1020: 'exfiltration',            // Automated Exfiltration
  T1030: 'exfiltration',            // Data Transfer Size Limits
  T1048: 'exfiltration',            // Exfiltration Over Alternative Protocol
  T1041: 'exfiltration',            // Exfiltration Over C2 Channel
  T1011: 'exfiltration',            // Exfiltration Over Other Network Medium
  T1052: 'exfiltration',            // Exfiltration Over Physical Medium
  T1567: 'exfiltration',            // Exfiltration Over Web Service
  T1029: 'exfiltration',            // Scheduled Transfer

  // --- Impact (TA0040) -------------------------------------------------
  T1531: 'impact',                  // Account Access Removal
  T1485: 'impact',                  // Data Destruction
  T1486: 'impact',                  // Data Encrypted for Impact (ransomware)
  T1565: 'impact',                  // Data Manipulation
  T1491: 'impact',                  // Defacement
  T1561: 'impact',                  // Disk Wipe
  T1499: 'impact',                  // Endpoint Denial of Service
  T1495: 'impact',                  // Firmware Corruption
  T1490: 'impact',                  // Inhibit System Recovery
  T1498: 'impact',                  // Network Denial of Service
  T1496: 'impact',                  // Resource Hijacking
  T1489: 'impact',                  // Service Stop
  T1529: 'impact',                  // System Shutdown/Reboot

  // --- Reconnaissance (TA0043) -----------------------------------------
  T1595: 'reconnaissance',          // Active Scanning
  T1592: 'reconnaissance',          // Gather Victim Host Information
  T1589: 'reconnaissance',          // Gather Victim Identity Information
  T1590: 'reconnaissance',          // Gather Victim Network Information
  T1591: 'reconnaissance',          // Gather Victim Org Information
  T1598: 'reconnaissance',          // Phishing for Information
  T1597: 'reconnaissance',          // Search Closed Sources
  T1596: 'reconnaissance',          // Search Open Technical Databases
  T1593: 'reconnaissance',          // Search Open Websites/Domains
  T1594: 'reconnaissance',          // Search Victim-Owned Websites

  // --- Resource Development (TA0042) -----------------------------------
  T1583: 'resource-development',    // Acquire Infrastructure
  T1586: 'resource-development',    // Compromise Accounts
  T1584: 'resource-development',    // Compromise Infrastructure
  T1587: 'resource-development',    // Develop Capabilities
  T1585: 'resource-development',    // Establish Accounts
  T1588: 'resource-development',    // Obtain Capabilities
  T1608: 'resource-development',    // Stage Capabilities
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TACTIC_BY_KEY = Object.fromEntries(TACTICS.map((t) => [t.key, t]))

/**
 * Normalise an incoming id. Returns { base, sub } where `base` is the
 * uppercased technique id (e.g. "T1566") and `sub` is the subtechnique
 * suffix (e.g. "001") or null.
 */
export function parseTechniqueId(raw) {
  if (!raw) return null
  const m = /^T(\d{4})(?:\.(\d{3}))?$/i.exec(String(raw).trim())
  if (!m) return null
  return { base: `T${m[1]}`, sub: m[2] || null }
}

/**
 * Produce the canonical ATT&CK web URL for a technique id.
 * Subtechniques use the `/techniques/Txxxx/yyy/` form per ATT&CK convention.
 */
export function linkFor(raw) {
  const parsed = parseTechniqueId(raw)
  if (!parsed) return null
  return parsed.sub
    ? `https://attack.mitre.org/techniques/${parsed.base}/${parsed.sub}/`
    : `https://attack.mitre.org/techniques/${parsed.base}/`
}

/**
 * Return the tactic object for a technique id (subtechniques inherit the
 * parent's tactic). Returns TACTIC_UNKNOWN when the technique isn't mapped.
 */
export function tacticFor(raw) {
  const parsed = parseTechniqueId(raw)
  if (!parsed) return TACTIC_UNKNOWN
  const key = TECHNIQUE_TACTIC[parsed.base]
  return key ? TACTIC_BY_KEY[key] : TACTIC_UNKNOWN
}

/**
 * Group a list of `{ id, count }` technique observations into tactic
 * columns, preserving the canonical kill-chain order. Returns one entry
 * per tactic that has at least one technique observed, plus an "unknown"
 * bucket if present. Each entry:
 *   { tactic: {id,key,label,short}, techniques: [{id, count, url}] }
 */
export function groupByTactic(observations) {
  const byKey = new Map()
  for (const obs of observations || []) {
    const t = tacticFor(obs.id)
    const row = byKey.get(t.key) || { tactic: t, techniques: [] }
    row.techniques.push({
      id: obs.id,
      count: obs.count || 1,
      url: linkFor(obs.id),
    })
    byKey.set(t.key, row)
  }
  const ordered = []
  for (const tac of TACTICS) {
    if (byKey.has(tac.key)) ordered.push(byKey.get(tac.key))
  }
  if (byKey.has(TACTIC_UNKNOWN.key)) ordered.push(byKey.get(TACTIC_UNKNOWN.key))
  return ordered
}
