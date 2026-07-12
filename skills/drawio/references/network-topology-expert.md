IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-Network-validation tasks.

## [Project Context]
domain:network-topology-diagrams|env:draw.io-plugin|role:network-infrastructure-architect|task:validate-network-topologies-and-isolation|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
plugin-src:{src/graph-parser.ts,src/validation-engine.ts,src/auto-layout.ts}
network-specs:{docs/network-topology-expert.md}
*always-read-network-specs-before-validating-graph*

## [Three-Tier Architecture Model]
- **Core Layer (`core`)**: The high-speed backbone of the network. Interconnects distribution-layer devices. Should focus on fast packet forwarding without policy filters.
- **Distribution Layer (`distribution`)**: Implements policy-based connectivity, security filtering, access control lists (ACLs), and inter-VLAN routing.
- **Access Layer (`access`)**: Provides local network access for user workstations (`workstation`), printers, IP phones, and local servers (`server`).

## [Network Segmentation & Security Boundaries]
- **DMZ (Demilitarized Zone)**: A separate subnet/VLAN containing public-facing services. Must be isolated from the internal LAN by a Firewall.
- **VLAN Containers**: Modeled as distinct containers/swimlanes. Traffic between different VLANs must route through a Layer 3 switch, router, or firewall (no direct node-to-node cross-VLAN connections).
- **WAN Boundary**: Direct external traffic (WAN/Internet) must terminate at a Firewall or Edge Router.

## [Standard Device Icons & Conventions]
- **Firewall** (`firewall`): Cisco firewall style.
- **Switch** (`switch`): Cisco workgroup or layer 3 switch style.
- **Router** (`router`): Cisco router style.
- **Server** (`server`): Standard rack or tower server style.
- **Workstation** (`workstation`): PC or laptop style.
- **Wireless Access Point** (`wireless_ap`): AP style.

## [Validator Rules Reference & Troubleshooting]

### 1. `DIRECT_WAN_TO_LAN`
- **Trigger**: An edge connects an external WAN/Internet node directly to a private workstation or LAN server, bypassing firewall inspection.
- **Troubleshooting**: Reroute the WAN connection to the Firewall external interface, and route the internal LAN segment from the Firewall internal interface.

### 2. `ORPHAN_DEVICE`
- **Trigger**: A network device (switch, router, firewall, or host) has no connections (0 connected edges).
- **Troubleshooting**: Connect the device to the appropriate switch port or upstream gateway, or remove the device from the diagram.

### 3. `VLAN_LEAK`
- **Trigger**: A direct edge connects two nodes inside different VLAN containers (e.g. `VLAN 10` to `VLAN 20`) without routing through a Layer 3 router or firewall node.
- **Troubleshooting**: Reroute the connection through a gateway switch or router interface that handles inter-VLAN routing.

### 4. `REDUNDANCY_WARNING`
- **Trigger**: Critical trunk links between Core Switches/Routers and Distribution Switches have only a single link (missing high-availability dual-homed connections). (Generates a warning).
- **Troubleshooting**: Add a second redundant physical/logical connection between the two devices to establish a port channel/LAG.
