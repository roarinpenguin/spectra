# SPECTRA Cross-Domain Investigation Scenarios

These queries showcase SPECTRA's multi-agent orchestrator — scenarios that require correlating data across multiple domains and cannot be answered by a single tool call.

---

## Incident Response

**Active ransomware investigation:**
> We have active ransomware. Identify all affected endpoints, the attack timeline, and what credentials are at risk.

**Compromise blast radius:**
> Frontier-PHX is compromised. What other systems could the attacker reach from there and what evidence should I look for?

**Credential exposure:**
> The STARFLEET\jeanluc account was used on a compromised host. Where else has that account authenticated and are any of those systems showing alerts?

---

## Risk-Prioritized Remediation

**Dual-risk endpoints:**
> Which endpoints have both active critical alerts AND unpatched critical vulnerabilities?

**Exploitable attack paths:**
> Show me endpoints with known-exploited CVEs that also have active network-facing alerts.

**Patch priority by exposure:**
> Prioritize our unpatched vulnerabilities by which ones are on endpoints with the most critical alerts.

---

## Comparative Posture

**Endpoint comparison:**
> Compare the security posture between Frontier-PHX and TheEnterprise — which is higher risk and why?

**Environment overview:**
> Give me a risk-ranked summary of our top 5 most critical assets with alerts, vulnerabilities, and misconfigurations for each.

---

## Attack Surface Analysis

**Lateral movement mapping:**
> Map the potential lateral movement paths from Frontier-PHX based on its network connections, user accounts, and domain membership.

**Cloud-to-endpoint correlation:**
> Are any of our cloud misconfigurations on infrastructure that also hosts endpoints with active alerts?

---

## Multi-Step Threat Hunting

**IOC pivot:**
> I found suspicious process GPAgentInstaller.exe on Frontier-PHX. What other endpoints have seen this binary and what network connections did it make?

**Timeline reconstruction:**
> Build a timeline of all security events on TheBorg-PHX in the last 48 hours — alerts, process activity, and network connections.

**Persistence check after incident:**
> After the ransomware alerts on TheEnterprise, check for persistence mechanisms — scheduled tasks, new services, registry run keys, and startup items.
