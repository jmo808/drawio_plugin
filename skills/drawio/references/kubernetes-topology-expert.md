IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-K8s-validation tasks.

## [Project Context]
domain:kubernetes-topology-diagrams|env:draw.io-plugin|role:kubernetes-expert-agent|task:validate-k8s-topology-and-networking|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
plugin-src:{src/graph-parser.ts,src/validation-engine.ts,src/auto-layout.ts}
k8s-specs:{docs/kubernetes-topology-expert.md}
*always-read-k8s-specs-before-validating-graph*

## [K8s Resource Hierarchy & Nesting Rules]
- **Cluster** (`cluster`): Root container representing the boundary of the Kubernetes cluster.
- **Namespace** (`namespace`): Must be directly nested within `cluster` (`parentId === clusterId`).
- **Deployment** (`deployment`): Must be nested within a `namespace`.
- **Pod** (`pod`): Must be nested within a `deployment` (or directly within a `namespace`).
- **Service** (`service`): Must be nested within a `namespace`.
- **ConfigMap** (`configmap`) & **Secret** (`secret`): Namespace-scoped; must reside in the same namespace as the pods referencing them.
- **PersistentVolumeClaim** (`pvc`): Namespace-scoped.
- **PersistentVolume** (`pv`): Cluster-scoped; resides at the cluster level or outside namespaces.

## [Service Discovery & Networking Patterns]
- **Ingress** (`ingress`): Entry point for external traffic; must route to a Service, not directly to a Pod.
- **Service** (`service`): Exposes pods internally or externally; must route/connect to a Pod or Deployment.
- **Pod-to-Pod Communications**: Direct connections are allowed within the same namespace or across namespaces if permitted by NetworkPolicies.

## [Common Architecture Patterns]
- **Sidecar/Init Containers**: Modeled as distinct nodes inside the Pod or grouped within the Pod container.
- **External Services**: Represent databases or third-party APIs residing outside the Cluster boundary.

## [Validator Rules Reference & Troubleshooting]

### 1. `ORPHAN_POD`
- **Trigger**: A pod node (`type === 'pod'`) is placed outside a Deployment or Namespace container (e.g., directly in the root '1').
- **Troubleshooting**: Nest the pod inside a valid deployment or namespace container.

### 2. `SERVICE_WITHOUT_TARGET`
- **Trigger**: A Service node (`type === 'service'`) has no outgoing connections to a Pod or Deployment.
- **Troubleshooting**: Connect the Service to the target Pod/Deployment with a solid connector line.

### 3. `INGRESS_BYPASS`
- **Trigger**: An Ingress node (`type === 'ingress'`) connects directly to a Pod node, bypassing the Service layer.
- **Troubleshooting**: Reroute the edge from the Ingress to the Service, and then from the Service to the Pod.

### 4. `PVC_WITHOUT_PV`
- **Trigger**: A PersistentVolumeClaim (`type === 'pvc'`) exists but is not connected to a PersistentVolume (`type === 'pv'`).
- **Troubleshooting**: Connect the PVC to a PV using a solid connection edge representing the storage volume binding.

### 5. `NAMESPACE_LEAK`
- **Trigger**: Direct cross-talk or connections between namespace-scoped resources (like pods or configmaps) in different namespaces without routing through a Service or Ingress.
- **Troubleshooting**: Use Services for cross-namespace communication or restrict connections using NetworkPolicies.
