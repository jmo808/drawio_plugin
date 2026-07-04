# Mermaid Cheatsheet — All 26 Diagram Types

Quick syntax reference for every Mermaid diagram type supported by draw.io.

## General Rules

- **One statement per line** — `;` works in flowchart but not everywhere
- **No trailing punctuation on node IDs** — IDs are identifiers (`myNode`, `node_1`)
- **Quote labels with special chars** (`:`, `-`, parentheses, non-ASCII) — use `"` not `'`
- **HTML in labels:** only `<br>`, `<b>`, `<i>`, `<u>` are reliable
- **Colors:** use `#hex` — never `rgb()`
- **Match label language** to the user's language
- **Title block** (optional, supported on some types):
  ```
  ---
  title: My Diagram
  ---
  ```

## 1. Flowchart (most common)

```
flowchart TD
  A[Start] --> B{Decision?}
  B -->|Yes| C[Do thing]
  B -->|No| D[Skip]
  C --> E((End))
  D --> E
```

**Direction:** `TD`/`TB` (top-down), `BT`, `LR`, `RL`

### Node Shapes

| Syntax | Shape |
|--------|-------|
| `[text]` | Rectangle |
| `(text)` | Rounded |
| `([text])` | Stadium |
| `[[text]]` | Subroutine |
| `[(text)]` | Cylinder |
| `((text))` | Circle |
| `{text}` | Rhombus (diamond) |
| `{{text}}` | Hexagon |
| `[/text/]` | Parallelogram |
| `[\text\]` | Parallelogram alt |
| `[/text\]` | Trapezoid |
| `>text]` | Asymmetric |

### Edge Syntax

| Syntax | Type |
|--------|------|
| `-->` | Arrow |
| `---` | No arrow |
| `-.->` | Dotted arrow |
| `==>` | Thick arrow |
| `<-->` | Bidirectional |
| `A -- text --> B` | Labeled edge |
| `A -->|text| B` | Labeled edge (alt) |

### Subgraphs

```
subgraph Frontend
  A --> B
end
```

### Styling & Colors

**1. Inline per-node (`style`):**
```
style A fill:#f9f,stroke:#333,stroke-width:2px,color:#fff
```

**2. Reusable classes (`classDef` + `:::`):**
```
classDef happy fill:#dfd,stroke:#0a0
A:::happy --> B
```
Or: `class A,B,C happy`

**3. Link styling (edges by index):**
```
linkStyle 0 stroke:#f00,stroke-width:3px
linkStyle default stroke:#999
```

Properties: `fill`, `stroke`, `stroke-width`, `stroke-dasharray`, `color` (font).

## 2. Sequence Diagram

```
sequenceDiagram
  participant U as User
  participant S as Server
  U->>S: Request
  S-->>U: Response
  Note right of S: Logged
```

| Arrow | Meaning |
|-------|---------|
| `->` | No head |
| `->>` | Arrow |
| `-->>` | Dashed arrow |
| `-x` | X end |
| `--x` | Dashed X |

- **Activate:** `activate S` / `deactivate S` or `+`/`-` suffix on arrow
- **Blocks:** `alt/else/end`, `opt/end`, `loop/end`, `par/and/end`, `critical/option/end`
- **Notes:** `Note left of A`, `Note over A,B: text`
- `autonumber` after header for numbered messages

## 3. Class Diagram

```
classDiagram
  class Animal {
    +String name
    +eat() void
  }
  Animal <|-- Dog : inherits
  Dog "1" --> "*" Bone : has
```

| Relation | Meaning |
|----------|---------|
| `<\|--` | Inheritance |
| `*--` | Composition |
| `o--` | Aggregation |
| `-->` | Association |
| `..>` | Dependency |
| `..\|>` | Realization |

**Visibility:** `+` public, `-` private, `#` protected, `~` package

**Annotations:** `<<interface>>`, `<<abstract>>`, `<<enumeration>>`

**Cardinality:** `"1"`, `"0..*"`, `"*"` flanking the arrow

## 4. State Diagram v2

```
stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> [*]
  state Running {
    [*] --> Working
    Working --> Waiting : block
  }
```

- Use `stateDiagram-v2` (not v1)
- `[*]` = start (as source) or end (as target)
- `state X { ... }` for nested compound states
- Junction nodes: `state fork1 <<fork>>`, `<<join>>`, `<<choice>>`
- Transition: `A --> B : event [guard] / action`

## 5. ER Diagram

```
erDiagram
  CUSTOMER ||--o{ ORDER : places
  CUSTOMER {
    string name
    string email PK
  }
```

**Cardinality symbols:**

| Symbol | Meaning |
|--------|---------|
| `\|o` | Zero-or-one |
| `\|\|` | Exactly-one |
| `}o` | Zero-or-many |
| `}\|` | One-or-many |

Mirror on both sides: `||--o{`. Attributes: `type name [PK|FK|UK]`.

## 6. Journey

```
journey
  title Morning routine
  section Wake up
    Coffee: 5: Me
    Read news: 3: Me
  section Commute
    Drive: 2: Me, Traffic
```

Each task: `Name: score(1-5): Actor[, Actor...]`

## 7. Pie

```
pie showData title Browser share
  "Chrome" : 60
  "Firefox" : 20
  "Safari" : 20
```

`showData` optional. Quoted labels, colon, numeric value.

## 8. Gantt

```
gantt
  title Project timeline
  dateFormat YYYY-MM-DD
  section Phase 1
  Design : a1, 2025-01-01, 7d
  Build  : after a1, 14d
```

- `dateFormat` is mandatory
- Task: `Name : [id,] [after id | date], duration[d/w]`
- Tags: `done`, `active`, `crit` before id

## 9. GitGraph

```
gitGraph
  commit
  branch develop
  checkout develop
  commit
  checkout main
  merge develop
```

Commands: `commit [id: "x"] [tag: "v1"]`, `branch`, `checkout`, `merge`, `cherry-pick id: "x"`

## 10. Mindmap

```
mindmap
  root((Project))
    Frontend
      React
      CSS
    Backend
      Node
```

Indentation (2-space) = hierarchy. Root shapes: `((circle))`, `[rect]`, `(rounded)`, `))cloud((`, `)hexagon(`, `{{hexagon}}`. No explicit edges.

## 11. Timeline

```
timeline
  title Company history
  section 2020s
    2021 : Founded
    2022 : Series A
         : Launched product
```

Multiple `:` lines under one year add sub-events.

## 12. Quadrant Chart

```
quadrantChart
  title Reach vs Engagement
  x-axis Low --> High
  y-axis Low --> High
  quadrant-1 Stars
  quadrant-2 Question Marks
  quadrant-3 Dogs
  quadrant-4 Cash Cows
  Campaign A: [0.3, 0.6]
```

Point coords: `[0..1, 0..1]`

## 13. Requirement Diagram

```
requirementDiagram
  requirement req1 {
    id: "1"
    text: "The system shall..."
    risk: high
    verifymethod: test
  }
  element user_story { type: "story" }
  user_story - satisfies -> req1
```

Types: `requirement`, `functionalRequirement`, `performanceRequirement`, `interfaceRequirement`, `physicalRequirement`, `designConstraint`

Relations: `contains`, `copies`, `derives`, `satisfies`, `verifies`, `refines`, `traces`

## 14. Sankey

```
sankey-beta
Source,Intermediate,10
Source,Direct,5
Intermediate,Sink,10
```

CSV-style: `source,target,value`. No header row. Use frontmatter for title.

## 15. XY Chart

```
xychart-beta
  title "Revenue"
  x-axis [jan, feb, mar, apr]
  y-axis "USD" 0 --> 10000
  bar [2500, 5000, 7500, 9000]
  line [3000, 4500, 6500, 8500]
```

`bar` and `line` can stack; order matters (later overlays earlier).

## 16. Block

```
block-beta
  columns 3
  A B C
  D["Wide"]:2 E
  A --> D
```

`columns N` sets grid. `Name:N` spans N columns. Flowchart arrow syntax for edges.

## 17. C4 Diagrams

```
C4Context
  Person(user, "User")
  System(app, "App", "Does things")
  Rel(user, app, "Uses")
```

**Variants:** `C4Context`, `C4Container`, `C4Component`, `C4Dynamic`, `C4Deployment`

**Elements:** `Person`, `System`, `System_Ext`, `Container`, `ComponentDb`, `Boundary(id, "label", "type")`

**Args:** positional `(id, label, [type/tech], [description])`

**Styling:** `UpdateElementStyle(tag, $bgColor="#…")`, `AddElementTag`

## 18. Architecture

```
architecture-beta
  group cloud(cloud)[Cloud]
  service api(server)[API] in cloud
  service db(database)[DB] in cloud
  api:R --> L:db
```

Built-in icons: `cloud`, `server`, `database`, `disk`, `internet`. Edge sides: `:T`, `:B`, `:L`, `:R`.

## 19. Radar

```
radar-beta
  title Skills
  axis js["JS"], py["Python"], go["Go"]
  curve alice["Alice"]{80, 60, 70}
  curve bob["Bob"]{50, 90, 65}
```

Values 0–100, positionally aligned with axes.

## 20. Packet

```
packet-beta
  0-15: "Source Port"
  16-31: "Dest Port"
  32-63: "Seq Number"
```

`start-end` bit ranges or single-bit `N`.

## 21. Venn

```
venn-beta
  set A ["Set A"]
  set B ["Set B"]
  union A,B
  text A ["only A"]
  text A,B ["shared"]
```

Define `union` for every intersection you plan to label.

## 22. Treemap

```
treemap-beta
"Category"
    "Leaf 1": 40
    "Leaf 2": 60
```

Numbers are area-weighted values. Indent for hierarchy.

## 23. Tree View

```
treeView-beta
  "Root"
    "Child 1"
      "Grandchild"
    "Child 2"
```

Pure indentation hierarchy, no numbers or edges.

## 24. Ishikawa (Fishbone)

```
ishikawa-beta
  Main Problem
    Category
      Cause
      Sub-cause
    Another Category
      Cause
```

First line = problem statement; top-level indents = categories.

## 25. Kanban

```
kanban
  todo[To Do]
    task1[Write spec]@{ assigned: "Alice", priority: "High" }
  doing[In progress]
    task2[Build feature]
  done[Done]
```

Columns at indent 0. Cards: `id[Label]@{ metadata }`. Keys: `assigned`, `priority` (Very Low/Low/Medium/High/Very High), `ticket`.

## 26. ZenUML

```
zenuml
  @Actor User
  @Boundary Web
  @Control Service
  User -> Web: request
  Web -> Service: process()
  Service -> Web: result
```

Participant roles: `@Actor`, `@Boundary`, `@Control`, `@Entity`, `@Database`. Supports `if/else`, `while`, `par` blocks.

## When to Prefer XML over Mermaid

- Precise positions / custom coordinates
- draw.io-native shapes (AWS, Azure, GCP, P&ID, Cisco)
- Mixed shape libraries or complex multi-layer diagrams
- Per-element color variations at scale
- Swimlane BPMN flowcharts with exact lane control

Default to Mermaid; reach for XML only when Mermaid's syntax can't express what's needed.
