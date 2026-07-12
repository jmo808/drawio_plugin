IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for any draw.io-ERD-validation tasks.

## [Project Context]
domain:entity-relationship-diagrams(ERD)|env:draw.io-plugin|role:database-schema-architect|task:validate-database-schemas-and-keys|loop:detect-errors→output-corrections→trigger-redraw

## [Docs Index]
plugin-src:{src/graph-parser.ts,src/validation-engine.ts,src/auto-layout.ts}
database-specs:{docs/erd-database-expert.md}
*always-read-database-specs-before-validating-graph*

## [Notation Conventions]
- **Table Card Rendering**: Modeled as structured cards containing:
  - **Table Header**: Table name (bolded).
  - **Columns Section**: List of attributes showing `PK` (Primary Key), `FK` (Foreign Key), column name, data type (e.g., `INT`, `VARCHAR(255)`), and nullability (e.g., `NULL`, `NOT NULL`).
- **Crow's Foot Edges**:
  - **`1:1` Relationship**: Uses `endArrow=ERone;startArrow=ERone`.
  - **`1:N` Relationship**: Uses `endArrow=ERmany;startArrow=ERone`.
  - **`N:M` Relationship**: Uses many-to-many notation, but should generally be decomposed into two `1:N` relationships with a junction table.

## [Database Normalization (1NF - 3NF)]
- **First Normal Form (1NF)**: All attributes are atomic (no repeating groups, comma-separated values, or arrays). Unique primary key identified.
- **Second Normal Form (2NF)**: Meets 1NF + has no partial key dependencies. If the primary key is composite, every non-key column must depend on the *entire* key, not just a subset.
- **Third Normal Form (3NF)**: Meets 2NF + has no transitive dependencies. Non-key columns must depend *only* on the primary key, not on other non-key columns ("the key, the whole key, and nothing but the key").

## [Common Schema Patterns]
- **Junction/Link Tables**: Resolves many-to-many relationships. Contains composite PK composed of two FKs referencing the parent tables.
- **Polymorphic Associations**: Allows an entity to belong to more than one other type of entity (e.g. `Comment` belongs to `Post` or `Image`). Typically uses `commentable_type` and `commentable_id`.
- **Self-Referential Hierarchies**: Model trees (e.g. `employees.manager_id` referencing `employees.id`). Requires a nullable self-referencing FK.

## [Validator Rules Reference & Troubleshooting]

### 1. `FK_WITHOUT_TARGET`
- **Trigger**: A column labeled as a foreign key (`FK`) exists in a table card, but no relationship edge connects this table card to the parent primary key table card.
- **Troubleshooting**: Connect the table card containing the FK to the parent table card using a solid `1:N` or `1:1` connector line.

### 2. `ORPHAN_TABLE`
- **Trigger**: A table card (`type === 'table'`) has no relationships or connected edges. (Generates a warning).
- **Troubleshooting**: Connect the table to related tables or delete it if it is obsolete.

### 3. `DUPLICATE_PK`
- **Trigger**: Multiple columns within the same table card are marked as `PK` without being configured as a composite primary key, or there are duplicate column names.
- **Troubleshooting**: Unmark duplicate PK fields or consolidate them into a declared composite key.

### 4. `SELF_REFERENCE_MISSING`
- **Trigger**: A column is named `parent_id`, `manager_id`, or similar hierarchical name, indicating a self-referencing tree relation, but no self-referencing relationship edge connects the table to itself.
- **Troubleshooting**: Add a self-referencing connection edge from the table card to itself.
