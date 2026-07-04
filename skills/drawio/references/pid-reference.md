# Piping and Instrumentation Diagram (P&ID) / Process Flow Diagram (PFD) Reference

When generating P&IDs or PFDs for industrial, oil & gas, or mining use cases, follow these conventions to ensure the diagram meets engineering standards.

## 1. ISA 5.1 Instrument Tagging Conventions
Instruments and control loops are identified by alphanumeric tags (e.g., `FIC-100`). Draw.io provides standard instrument bubbles under the `mxgraph.pid2inst` library.

### Common Tag Identifiers
- **F**: Flow (e.g., FT = Flow Transmitter, FIC = Flow Indicating Controller)
- **P**: Pressure (e.g., PT = Pressure Transmitter, PCV = Pressure Control Valve)
- **T**: Temperature (e.g., TT = Temperature Transmitter, TI = Temperature Indicator)
- **L**: Level (e.g., LT = Level Transmitter, LIC = Level Indicating Controller)
- **V**: Valve, Vibration, or Viscosity (context dependent)
- **A**: Analysis (e.g., AT = Analyzer Transmitter)
- **Z**: Position (e.g., ZSC = Position Switch Closed)

### Instrument Shapes (`mxgraph.pid2inst.*`)
- **Field Mounted** (Accessible to operator): Circular bubble.
  - Set `shape=mxgraph.pid2inst.discInst;mounting=field;`
- **Control Room** (DCS/SCADA): Circle within a square (Shared Display/Control).
  - Set `shape=mxgraph.pid2inst.sharedCont;mounting=room;`
- **Local Panel**: Circle with a horizontal line.
  - Set `shape=mxgraph.pid2inst.discInst;mounting=local;`
- **Programmable Logic Controller (PLC)**: Diamond within a square.
  - Set `shape=mxgraph.pid2inst.progLogCont;mounting=room;`

## 2. Line Styles
Use distinct line styles (edges) to represent different types of connections. Set these via the `style` string on the edge:

- **Major Process Line**: Thick solid line. 
  - `strokeWidth=2;dashed=0;`
- **Secondary Process Line**: Standard solid line. 
  - `strokeWidth=1;dashed=0;`
- **Electrical Signal**: Dashed line. 
  - `dashed=1;dashPattern=1 4;`
- **Pneumatic Signal**: Solid line with double slash marks (you can approximate this with specific edge markers if available, or just a distinct color/dash). 
  - Often approximated as: `dashed=1;dashPattern=8 8;`
- **Capillary Tube** (for pressure transmitters): Line with "x" marks. 
  - Often approximated with a specific edge pattern or a simple dashed line with a distinct color.

## 3. Equipment Mapping (Draw.io Native Shapes)

When an architectural description calls for industrial equipment, use the following native shape libraries.

### Valves (`mxgraph.pid2valves.*`)
- Gate Valve: `shape=mxgraph.pid2valves.valve;valveType=gate;actuator=none`
- Globe Valve: `shape=mxgraph.pid2valves.valve;valveType=globe;actuator=none`
- Check Valve: `shape=mxgraph.pid2valves.valve;valveType=check;actuator=none`
- Control Valve (Pneumatic Actuator): `shape=mxgraph.pid2valves.valve;valveType=gate;actuator=diaphragm`

### Pumps and Compressors
- Centrifugal Pump: `shape=mxgraph.pid.pumps.centrifugal_pump_1;` or `shape=mxgraph.pid.engines.electric_motor;` attached to a pump casing.
- Centrifugal Compressor: `shape=mxgraph.pid.compressors.centrifugal_compressor`
- Positive Displacement Pump: `shape=mxgraph.pid.pumps.positive_displacement_pump_1;`

### Vessels, Tanks, and Columns
- Separator / Settling Vessel: `shape=mxgraph.pid.separators.gravity_separator,_settling_chamber2;`
- Distillation Column: `shape=mxgraph.pid2misc.column;columnType=tray`
- Simple Storage Tank: Use a generic cylinder or `shape=mxgraph.pid.vessels.tank;`

### Heat Exchangers
Since a dedicated "Shell and Tube" specific shape may not surface directly via simple queries, use the closest approximation or combine primitives:
- Air Cooler / Fin Fan: `shape=mxgraph.pid.misc.air_cooler;`
- Generic Boiler / Heater: `shape=mxgraph.pid.misc.boiler_(dome,_hot_liquid);`
- Simple Heater/Cooler Coil: Often represented by a zigzag line inside a vessel or on a line.

### Mining & Minerals Processing
- Crusher: `shape=mxgraph.pid.crushers_grinding.crusher;`
- Conveyor Belt: `shape=mxgraph.pid.misc.conveyor_(belt);`

## 4. Diagram Layout Strategy (PFDs)
1. **Flow Direction**: Flow typically goes from **Left to Right**. Feed streams enter on the left, and products exit on the right.
2. **Gravity**: Place equipment relative to its physical elevation (e.g., distillation columns span multiple vertical rows, pumps are at the bottom, condensers are higher up).
3. **Spacing**: Leave ample room between major equipment nodes to route process lines and place instrumentation loops without clutter. Use the standard rigid grid but space equipment further apart (e.g., every 2 or 3 columns) compared to software architecture diagrams.
