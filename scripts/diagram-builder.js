/**
 * DiagramBuilder — Translates high-level semantic operations into mxGraphModel XML.
 * 
 * The LLM calls tools like add_container, add_node, connect, finalize.
 * This class handles all the graph physics: coordinates, styles, containment, sizing.
 */
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Style Template Registry
// ---------------------------------------------------------------------------
const CONTAINER_STYLES = {
    region: 'swimlane;startSize=24;fillColor=#f5f5f5;strokeColor=#cccccc;html=1;fontSize=12;fontStyle=1;',
    vpc: 'swimlane;startSize=24;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;fontSize=12;fontStyle=1;',
    az: 'swimlane;startSize=24;fillColor=#fff2cc;strokeColor=#d6b656;html=1;fontSize=11;fontStyle=1;',
    subnet: 'swimlane;startSize=24;fillColor=#e1d5e7;strokeColor=#9673a6;html=1;fontSize=11;fontStyle=1;dashed=1;',
    subnet_web: 'swimlane;startSize=24;fillColor=#e1d5e7;strokeColor=#9673a6;html=1;fontSize=11;fontStyle=1;',
    subnet_app: 'swimlane;startSize=24;fillColor=#d5e8d4;strokeColor=#82b366;html=1;fontSize=11;fontStyle=1;',
    subnet_data: 'swimlane;startSize=24;fillColor=#f8cecc;strokeColor=#b85450;html=1;fontSize=11;fontStyle=1;',
    group: 'group;html=1;',
    lane: 'swimlane;horizontal=0;startSize=110;fillColor=#f5f5f5;strokeColor=#666666;html=1;fontSize=12;fontStyle=1;',
};

const NODE_STYLES = {
    ec2: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ec2;fillColor=#ED7100;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    ecs: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.ecs;fillColor=#ED7100;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    lambda: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.lambda;fillColor=#ED7100;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    rds: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.rds;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    elasticache: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.elasticache;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    alb: 'shape=mxgraph.aws4.application_load_balancer;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;pointerEvents=1;html=1;',
    nlb: 'shape=mxgraph.aws4.network_load_balancer;fillColor=#8C4FFF;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;pointerEvents=1;html=1;',
    s3: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.s3;fillColor=#3F8624;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    cloudfront: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.cloudfront;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    route53: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.route_53;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    apigateway: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    api_gateway: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.api_gateway;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    waf: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.waf;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    nat_gateway: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.nat_gateway;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    endpoint: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.endpoints;fillColor=#8C4FFF;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    dynamodb: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.dynamodb;fillColor=#C925D1;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    sqs: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sqs;fillColor=#E7157B;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    sns: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.sns;fillColor=#E7157B;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    eventbridge: 'shape=mxgraph.aws4.resourceIcon;resIcon=mxgraph.aws4.eventbridge;fillColor=#E7157B;strokeColor=#ffffff;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    user: 'shape=mxgraph.aws4.user;fillColor=#5A6C86;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    internet: 'shape=mxgraph.aws4.internet_alt2;fillColor=#232F3E;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    
    // Flowchart
    process: 'rounded=1;whiteSpace=wrap;html=1;',
    decision: 'rhombus;whiteSpace=wrap;html=1;',
    start: 'ellipse;whiteSpace=wrap;html=1;',
    end: 'ellipse;whiteSpace=wrap;html=1;',
    io: 'shape=parallelogram;perimeter=parallelogramPerimeter;whiteSpace=wrap;html=1;fixedSize=1;',
    subroutine: 'shape=process;whiteSpace=wrap;html=1;backgroundOutline=1;',

    // K8s
    pod: 'shape=mxgraph.kubernetes.icon;prIcon=pod;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    service: 'shape=mxgraph.kubernetes.icon;prIcon=svc;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    ingress: 'shape=mxgraph.kubernetes.icon;prIcon=ing;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    configmap: 'shape=mxgraph.kubernetes.icon;prIcon=cm;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    secret: 'shape=mxgraph.kubernetes.icon;prIcon=secret;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    pv: 'shape=mxgraph.kubernetes.icon;prIcon=pv;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    pvc: 'shape=mxgraph.kubernetes.icon;prIcon=pvc;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    hpa: 'shape=mxgraph.kubernetes.icon;prIcon=hpa;fillColor=#326CE5;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',

    // Network
    router: 'shape=mxgraph.cisco.routers.router;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    switch: 'shape=mxgraph.cisco.switches.workgroup_switch;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    firewall: 'shape=mxgraph.cisco.security.firewall;fillColor=#a20025;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    server: 'shape=mxgraph.cisco.servers.standard_host;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    workstation: 'shape=mxgraph.cisco.computers_and_peripherals.pc;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    wireless_ap: 'shape=mxgraph.cisco.misc.wireless_access_point;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    load_balancer: 'shape=mxgraph.cisco.switches.server_load_balancer;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',
    storage: 'shape=mxgraph.cisco.storage.storage_array;fillColor=#005073;strokeColor=none;fontColor=#232F3E;dashed=0;verticalLabelPosition=bottom;verticalAlign=top;align=center;fontSize=11;html=1;',

    // ERD
    table: 'shape=rectangle;whiteSpace=wrap;html=1;align=left;verticalAlign=top;fillColor=#f5f5f5;strokeColor=#cccccc;fontStyle=0;',
    view: 'shape=rectangle;whiteSpace=wrap;html=1;align=left;verticalAlign=top;fillColor=#fff2cc;strokeColor=#d6b656;fontStyle=0;',

    // Sequence
    participant: 'shape=umlLifeline;perimeter=lifelinePerimeter;whiteSpace=wrap;html=1;container=1;collapsible=0;recursiveResize=0;outlineConnect=0;size=40;',
    activation: 'shape=rectangle;whiteSpace=wrap;html=1;fillColor=#f5f5f5;strokeColor=#666666;',
    note: 'shape=note;whiteSpace=wrap;html=1;size=15;backgroundOutline=1;fillColor=#fff2cc;strokeColor=#d6b656;',

    // Mind Map
    central: 'ellipse;whiteSpace=wrap;html=1;align=center;fillColor=#f5f7fa;strokeColor=#475569;strokeWidth=2;fontStyle=1;',
    branch: 'rounded=1;whiteSpace=wrap;html=1;align=center;fillColor=#e2e8f0;strokeColor=#64748b;',
    leaf: 'rounded=1;whiteSpace=wrap;html=1;align=center;fillColor=#ffffff;strokeColor=#cbd5e1;',

    // Generic shapes
    rectangle: 'rounded=1;whiteSpace=wrap;html=1;',
    diamond: 'rhombus;whiteSpace=wrap;html=1;',
    cylinder: 'shape=cylinder3;whiteSpace=wrap;html=1;boundedLbl=1;backgroundOutline=1;size=15;',
    circle: 'ellipse;whiteSpace=wrap;html=1;aspect=fixed;',
    // PFD / P&ID Shapes
    pump: 'shape=mxgraph.pid.pumps.centrifugal_pump_1;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    compressor: 'shape=mxgraph.pid.compressors.centrifugal_compressor;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    valve: 'shape=mxgraph.pid2valves.gate_valve;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    vessel: 'shape=mxgraph.pid.vessels.vertical_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    cyclone: 'shape=mxgraph.pid.misc.cyclone;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    heat_exchanger: 'shape=mxgraph.pid.heat_exchangers.shell_and_tube_1;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',

    // PFD Equipment Variants
    'separator_2-phase': 'shape=mxgraph.pid.vessels.vertical_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'separator_3-phase': 'shape=mxgraph.pid.vessels.horizontal_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    separator: 'shape=mxgraph.pid.vessels.vertical_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'heat_exchanger_shell-and-tube': 'shape=mxgraph.pid.heat_exchangers.shell_and_tube_1;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'heat_exchanger_plate': 'shape=mxgraph.pid.heat_exchangers.plate_heat_exchanger;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'pump_centrifugal': 'shape=mxgraph.pid.pumps.centrifugal_pump_1;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'pump_positive_displacement': 'shape=mxgraph.pid.pumps.rotary_pump;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'compressor_centrifugal': 'shape=mxgraph.pid.compressors.centrifugal_compressor;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'compressor_reciprocating': 'shape=mxgraph.pid.compressors.reciprocating_compressor;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'reactor_CSTR': 'shape=mxgraph.pid.vessels.reactor;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'reactor_PFR': 'shape=mxgraph.pid.vessels.vertical_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    reactor: 'shape=mxgraph.pid.vessels.reactor;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'distillation_column_tray': 'shape=mxgraph.pid.vessels.tray_column;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'distillation_column_packed': 'shape=mxgraph.pid.vessels.packed_column;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    distillation_column: 'shape=mxgraph.pid.vessels.tray_column;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'vessel_storage': 'shape=mxgraph.pid.vessels.tank;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'vessel_surge': 'shape=mxgraph.pid.vessels.vertical_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
    'vessel_accumulator': 'shape=mxgraph.pid.vessels.horizontal_vessel;perimeter=rectanglePerimeter;fillColor=#dae8fc;strokeColor=#6c8ebf;html=1;align=center;verticalLabelPosition=bottom;verticalAlign=top;',
};

const EDGE_STYLES = {
    solid: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;sourcePerimeterSpacing=10;targetPerimeterSpacing=10;jumpStyle=arc;',
    dashed: 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;sourcePerimeterSpacing=10;targetPerimeterSpacing=10;jumpStyle=arc;',
    
    // ERD
    '1:1': 'edgeStyle=orthogonalEdgeStyle;fontSize=12;html=1;endArrow=ERone;startArrow=ERone;endSize=8;startSize=8;',
    '1:N': 'edgeStyle=orthogonalEdgeStyle;fontSize=12;html=1;endArrow=ERmany;startArrow=ERone;endSize=8;startSize=8;',
    'N:M': 'edgeStyle=orthogonalEdgeStyle;fontSize=12;html=1;endArrow=ERmany;startArrow=ERmany;endSize=8;startSize=8;',

    // Sequence
    sync: 'edgeStyle=orthogonalEdgeStyle;html=1;endArrow=block;',
    async: 'edgeStyle=orthogonalEdgeStyle;html=1;endArrow=open;',
    return: 'edgeStyle=orthogonalEdgeStyle;html=1;endArrow=open;dashed=1;',

    // PFD
    process: 'edgeStyle=orthogonalEdgeStyle;html=1;strokeWidth=3;',
    utility: 'edgeStyle=orthogonalEdgeStyle;html=1;dashed=1;strokeWidth=1.5;',
    instrument: 'edgeStyle=orthogonalEdgeStyle;html=1;dashPattern=1 3;dashed=1;strokeWidth=1;',
};

// ---------------------------------------------------------------------------
// Layout Constants
// ---------------------------------------------------------------------------
const NODE_SIZE = { width: 78, height: 78 };
const NODE_SIZES = {
    rectangle: { width: 140, height: 60 },
    diamond: { width: 140, height: 80 },
    cylinder: { width: 100, height: 70 },
    circle: { width: 60, height: 60 },
    vessel: { width: 120, height: 180 },
    pump: { width: 100, height: 70 },
    compressor: { width: 100, height: 80 },
    valve: { width: 80, height: 50 },
    cyclone: { width: 80, height: 120 },
    heat_exchanger: { width: 120, height: 80 },
    
    // Flowchart
    process: { width: 140, height: 60 },
    decision: { width: 140, height: 80 },
    start: { width: 120, height: 60 },
    end: { width: 120, height: 60 },
    io: { width: 140, height: 60 },
    subroutine: { width: 140, height: 60 },
    
    // K8s
    pod: { width: 60, height: 60 },
    service: { width: 60, height: 60 },
    ingress: { width: 60, height: 60 },
    configmap: { width: 60, height: 60 },
    secret: { width: 60, height: 60 },
    pv: { width: 60, height: 60 },
    pvc: { width: 60, height: 60 },
    hpa: { width: 60, height: 60 },

    // Network
    router: { width: 80, height: 60 },
    switch: { width: 80, height: 60 },
    firewall: { width: 80, height: 60 },
    server: { width: 80, height: 60 },
    workstation: { width: 80, height: 60 },
    wireless_ap: { width: 80, height: 60 },
    load_balancer: { width: 80, height: 60 },
    storage: { width: 80, height: 60 },

    // ERD
    table: { width: 160, height: 120 },
    view: { width: 160, height: 120 },

    // Sequence
    participant: { width: 100, height: 300 },
    activation: { width: 20, height: 80 },
    note: { width: 120, height: 60 },

    // Mind Map
    central: { width: 140, height: 70 },
    branch: { width: 120, height: 50 },
    leaf: { width: 100, height: 40 },

    // PFD Equipment Variants
    'separator_2-phase': { width: 100, height: 160 },
    'separator_3-phase': { width: 160, height: 100 },
    separator: { width: 100, height: 160 },
    'heat_exchanger_shell-and-tube': { width: 120, height: 80 },
    'heat_exchanger_plate': { width: 100, height: 80 },
    'pump_centrifugal': { width: 100, height: 70 },
    'pump_positive_displacement': { width: 100, height: 70 },
    'compressor_centrifugal': { width: 100, height: 80 },
    'compressor_reciprocating': { width: 110, height: 80 },
    'reactor_CSTR': { width: 120, height: 160 },
    'reactor_PFR': { width: 80, height: 200 },
    reactor: { width: 120, height: 160 },
    'distillation_column_tray': { width: 100, height: 320 },
    'distillation_column_packed': { width: 100, height: 320 },
    distillation_column: { width: 100, height: 320 },
    'vessel_storage': { width: 160, height: 140 },
    'vessel_surge': { width: 100, height: 180 },
    'vessel_accumulator': { width: 180, height: 100 },
};

const NODE_SPACING = { x: 180, y: 140 };  // grid spacing within containers
const CONTAINER_PADDING = { top: 44, left: 30, right: 30, bottom: 30 };
const CONTAINER_START_SIZE = 24; // swimlane header height
const AZ_GAP = 220; // horizontal gap between AZ containers — room for ALBs + edge routing
const ALB_TYPES = new Set(['alb', 'nlb']); // node types that get center-column placement

// ---------------------------------------------------------------------------
// DiagramBuilder Class
// ---------------------------------------------------------------------------
class DiagramBuilder {
    constructor() {
        this.cells = new Map();    // id → cell object
        this.edges = new Map();    // id → edge object
        this.nextEdgeId = 1;
        this.initialized = false;
        this.title = '';
        this.type = 'architecture';
    }

    // --- Init ---
    init(title = 'Untitled', theme = 'light', type = 'architecture') {
        this.cells.clear();
        this.edges.clear();
        this.nextEdgeId = 1;
        this.title = title;
        this.type = type;
        this.initialized = true;
        // Root cells 0 and 1 are implicit in serialization
        return { success: true, message: `Diagram "${title}" initialized with type "${type}".` };
    }

    // --- Add Container ---
    addContainer(id, label, type, parentId = '1', tier = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (this.cells.has(id)) return { success: false, error: `Cell "${id}" already exists.` };
        if (parentId !== '1' && !this.cells.has(parentId)) {
            return { success: false, error: `Parent "${parentId}" not found.` };
        }

        // Resolve style
        let styleKey = type;
        if (type === 'subnet' && tier) {
            const tierKey = `subnet_${tier}`;
            if (CONTAINER_STYLES[tierKey]) styleKey = tierKey;
        }
        const style = CONTAINER_STYLES[styleKey] || CONTAINER_STYLES.group;

        // Calculate position based on siblings
        const siblings = this._childrenOf(parentId).filter(c => c.isContainer);
        const { x, y, width, height } = this._layoutContainer(type, parentId, siblings, tier);

        const cell = {
            id, label, type, style, parentId, isContainer: true, isEdge: false,
            x, y, width, height,
            childSlots: [],  // tracks which grid positions are occupied
        };

        this.cells.set(id, cell);
        return { success: true, id, message: `Container "${label}" (${type}) added to ${parentId}.` };
    }

    // --- Add Node ---
    addNode(id, label, type, parentId, variant = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (this.cells.has(id)) return { success: false, error: `Cell "${id}" already exists.` };
        if (parentId !== '1' && !this.cells.has(parentId)) {
            return { success: false, error: `Parent "${parentId}" not found.` };
        }

        // Auto-correct generic types if label implies a specific AWS resource
        const lowerLabel = (label || '').toLowerCase();
        if (lowerLabel.includes('api gateway') || lowerLabel.includes('api_gateway')) {
            type = 'apigateway';
        } else if (lowerLabel.includes('cloudfront') || lowerLabel.includes('cdn')) {
            type = 'cloudfront';
        } else if (lowerLabel.includes('task queue') || lowerLabel.includes('sqs')) {
            type = 'sqs';
        } else if (lowerLabel.includes('lambda') || lowerLabel.includes('api handler')) {
            type = 'lambda';
        } else if (lowerLabel.includes('ecs') || lowerLabel.includes('worker')) {
            type = 'ecs';
        } else if (lowerLabel.includes('rds') || lowerLabel.includes('database') || lowerLabel.includes(' db')) {
            type = 'rds';
        } else if (lowerLabel.includes('redis') || lowerLabel.includes('cache')) {
            type = 'elasticache';
        } else if (lowerLabel.includes('user') || lowerLabel.includes('client')) {
            type = 'user';
        } else if (lowerLabel.includes('dynamodb') || lowerLabel.includes('dynamo')) {
            type = 'dynamodb';
        }

        if (type === 'dynamodb') {
            parentId = '1';
        }

        let nodeSize = NODE_SIZES[type] || NODE_SIZE;
        let style = NODE_STYLES[type] || NODE_STYLES.rectangle;
        if (variant) {
            const variantKey = `${type}_${variant}`;
            if (NODE_SIZES[variantKey]) nodeSize = NODE_SIZES[variantKey];
            if (NODE_STYLES[variantKey]) style = NODE_STYLES[variantKey];
        }
        const parent = this.cells.get(parentId);

        let x, y;

        if (this.type === 'flowchart') {
            const siblings = this._childrenOf(parentId).filter(c => !c.isContainer);
            const idx = siblings.length;
            const parentWidth = parent ? parent.width : 800;
            x = (parentWidth - nodeSize.width) / 2;
            y = (parent ? CONTAINER_PADDING.top : 20) + idx * 120;
        } else if (this.type === 'pfd' || type === 'pump' || type === 'vessel' || type === 'compressor') {
            const pfdNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const idx = pfdNodes.length;
            x = 40 + idx * 220;
            y = 150;
        } else if (type === 'participant') {
            const participants = this._childrenOf(parentId).filter(n => n.type === 'participant');
            const idx = participants.length;
            x = 40 + idx * 240;
            y = 20;
        } else if (type === 'activation') {
            const activations = this._childrenOf(parentId).filter(n => n.type === 'activation');
            const idx = activations.length;
            x = 40; // centered on parent participant (width 100, activation width 20)
            y = 60 + idx * 60;
        } else if (type === 'central') {
            x = 400;
            y = 250;
        } else if (type === 'branch') {
            const siblings = this._childrenOf(parentId).filter(n => n.type === 'branch');
            const idx = siblings.length;
            const isRight = idx % 2 === 0;
            x = isRight ? 600 : 80;
            const sideIdx = Math.floor(idx / 2);
            y = 130 + sideIdx * 160;
        } else if (type === 'leaf') {
            const siblings = this._childrenOf(parentId).filter(n => n.type === 'leaf');
            const idx = siblings.length;
            if (parent) {
                const isRight = parent.x >= 400;
                x = isRight ? parent.x + 160 : parent.x - 140;
                y = parent.y - 30 + idx * 50;
            } else {
                x = 400;
                y = 400;
            }
        } else if (type === 'table' || type === 'view') {
            const erdNodes = this._childrenOf(parentId).filter(n => n.type === 'table' || n.type === 'view');
            const idx = erdNodes.length;
            const cols = 3;
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            x = 40 + col * 260;
            y = 40 + row * 220;
        } else if (parent && parent.type === 'deployment') {
            const pods = this._childrenOf(parentId).filter(n => n.type === 'pod');
            const idx = pods.length;
            x = CONTAINER_PADDING.left + idx * 100;
            y = (parent.height - nodeSize.height) / 2;
        } else if (parent && parent.type === 'vlan') {
            const vlanNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const idx = vlanNodes.length;
            x = CONTAINER_PADDING.left + idx * 100;
            y = (parent.height - nodeSize.height) / 2;
        } else if (parent && parent.type === 'lane') {
            const existingNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const slotIndex = existingNodes.length;

            // Swimlanes have 110px header on the left. Children start at x=120, spaced by 180
            x = 120 + slotIndex * 180;
            // Center vertically within the 180px height
            y = (parent.height - nodeSize.height) / 2;
        } else if (ALB_TYPES.has(type) && parent && parent.type === 'vpc') {
            const azChildren = this._childrenOf(parentId).filter(c => c.type === 'az');
            const albSiblings = this._childrenOf(parentId).filter(c => !c.isContainer && ALB_TYPES.has(c.type));
            const albIndex = albSiblings.length;

            // Center horizontally in the VPC
            x = (parent.width - nodeSize.width) / 2;

            if (azChildren.length > 0) {
                // Position vertically based on ALB index:
                // First ALB (External): above the AZs (y=44)
                // Second ALB (Internal): between web and app tiers (~y=380)
                // Additional ALBs: stack below
                if (albIndex === 0) {
                    y = 44; // above AZ containers
                } else if (albIndex === 1) {
                    // Between web subnet bottom and app subnet top
                    y = 380;
                } else {
                    y = 44 + albIndex * 200;
                }
            } else {
                y = CONTAINER_PADDING.top + albIndex * NODE_SPACING.y;
            }
        } else if (parentId === '1' || !parent || ['region', 'group'].includes(parent.type)) {
            // Root-level or Region/Group level nodes (Users, CDN, API Gateway) — place in horizontal row at top
            // Adjust label with variant
            let fullLabel = label;
            if (variant) {
                fullLabel = `${label}&#xa;${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
            }

            const startY = (parentId === '1' || !parent) ? 10 : CONTAINER_PADDING.top;

            const cell = {
                id, label: fullLabel, type, style, parentId, isContainer: false, isEdge: false,
                x: 0, y: startY, width: nodeSize.width, height: nodeSize.height, variant,
            };
            this.cells.set(id, cell);

            // Dynamically center all non-container sibling nodes
            const siblingNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const siblingContainers = this._childrenOf(parentId).filter(c => c.isContainer);
            
            let centerX = 400;
            if (parentId === '1' || !parent) {
                const mainContainer = siblingContainers.find(c => c.type === 'vpc' || c.type === 'region');
                centerX = mainContainer ? (mainContainer.x + mainContainer.width / 2) : 600;
            } else {
                centerX = parent.width / 2;
            }

            const totalWidth = siblingNodes.length * NODE_SPACING.x;
            const startX = centerX - totalWidth / 2;

            siblingNodes.forEach((n, idx) => {
                const nSize = NODE_SIZES[n.type] || NODE_SIZE;
                n.x = startX + idx * NODE_SPACING.x + (NODE_SPACING.x - nSize.width) / 2;
                n.y = startY;
            });

            return { success: true, id, message: `Node "${label}" (${type}) placed horizontally in ${parentId}.` };
        } else {
            // Standard grid placement within parent
            const existingNodes = this._childrenOf(parentId).filter(c => !c.isContainer);
            const slotIndex = existingNodes.length;

            const maxCols = parent
                ? Math.max(1, Math.floor((parent.width - CONTAINER_PADDING.left - CONTAINER_PADDING.right) / NODE_SPACING.x))
                : 3;
            const col = slotIndex % maxCols;
            const row = Math.floor(slotIndex / maxCols);

            x = CONTAINER_PADDING.left + col * NODE_SPACING.x + (NODE_SPACING.x - nodeSize.width) / 2;
            y = CONTAINER_PADDING.top + row * NODE_SPACING.y + (NODE_SPACING.y - nodeSize.height) / 2;
        }

        // Adjust label with variant
        let fullLabel = label;
        if (variant) {
            fullLabel = `${label}&#xa;${variant.charAt(0).toUpperCase() + variant.slice(1)}`;
        }

        const cell = {
            id, label: fullLabel, type, style, parentId, isContainer: false, isEdge: false,
            x, y, width: nodeSize.width, height: nodeSize.height, variant,
        };

        this.cells.set(id, cell);

        // Auto-expand parent if needed
        if (parent) this._autoExpand(parentId);

        return { success: true, id, message: `Node "${label}" (${type}) placed in ${parentId}.` };
    }

    // --- Connect ---
    connect(sourceId, targetId, label = '', style = 'solid', color = null, exitPort = null, entryPort = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (!this.cells.has(sourceId) && sourceId !== '1') {
            return { success: false, error: `Source "${sourceId}" not found.` };
        }
        if (!this.cells.has(targetId) && targetId !== '1') {
            return { success: false, error: `Target "${targetId}" not found.` };
        }

        const sourceNode = this.cells.get(sourceId);
        const targetNode = this.cells.get(targetId);

        // 1. Hard Block: Load balancers cannot publish to asynchronous queues or brokers
        if (sourceNode && targetNode) {
            const isBroker = (n) => ['sqs', 'sns', 'eventbridge'].includes(n.type);
            if ((sourceNode.type === 'alb' || sourceNode.type === 'nlb') && isBroker(targetNode)) {
                return { success: false, error: `Load balancers (${sourceNode.label}) cannot publish to brokers/queues (${targetNode.label}). Outbound ALB traffic must only route to compute instances.` };
            }
        }

        // 1b. Automatic Async Polling/Messaging Styles
        if (sourceNode && targetNode) {
            const isBroker = (n) => ['sqs', 'sns', 'eventbridge'].includes(n.type);
            const isCompute = (n) => {
                if (['apigateway', 'api_gateway', 'route53', 'waf', 'cloudfront', 'dynamodb', 'rds', 'elasticache', 'sqs', 'sns', 'eventbridge'].includes(n.type)) return false;
                if (['ecs', 'ec2', 'lambda'].includes(n.type)) return true;
                const labelLower = (n.label || '').toLowerCase();
                const idLower = (n.id || '').toLowerCase();
                return labelLower.includes('api') || labelLower.includes('worker') || idLower.includes('api') || idLower.includes('worker');
            };
            if ((isBroker(sourceNode) && isCompute(targetNode)) || (isCompute(sourceNode) && isBroker(targetNode))) {
                style = 'dashed';
            }
        }

        // 1c. PFD Auto-Nozzle Port Resolution
        if (this.type === 'pfd' && sourceNode && targetNode) {
            if (!exitPort) {
                if (sourceNode.type === 'pump' || sourceNode.type === 'compressor') {
                    exitPort = 'right';
                } else if (sourceNode.type === 'distillation_column') {
                    const labelLower = (label || '').toLowerCase();
                    if (labelLower.includes('bottom')) exitPort = 'bottom';
                    else if (labelLower.includes('overhead') || labelLower.includes('distillate') || labelLower.includes('vapor')) exitPort = 'top';
                    else if (targetNode.y < sourceNode.y) exitPort = 'top';
                    else if (targetNode.y > sourceNode.y + sourceNode.height - 40) exitPort = 'bottom';
                    else exitPort = 'right';
                } else if (sourceNode.type === 'heat_exchanger') {
                    exitPort = (style === 'utility' || style === 'instrument') ? 'bottom' : 'right';
                } else {
                    exitPort = 'right';
                }
            }
            if (!entryPort) {
                if (targetNode.type === 'pump') {
                    entryPort = 'left';
                } else if (targetNode.type === 'compressor') {
                    entryPort = 'bottom';
                } else if (targetNode.type === 'distillation_column') {
                    if (sourceNode.y > targetNode.y + targetNode.height - 40) entryPort = 'bottom';
                    else entryPort = 'left';
                } else if (targetNode.type === 'heat_exchanger') {
                    entryPort = (style === 'utility' || style === 'instrument') ? 'top' : 'left';
                } else {
                    entryPort = 'left';
                }
            }
        }

        // Check for duplicate
        for (const [eId, edge] of this.edges) {
            if (edge.sourceId === sourceId && edge.targetId === targetId) {
                return { success: false, error: `Edge from "${sourceId}" to "${targetId}" already exists (${eId}).` };
            }
        }

        const edgeId = `e_${this.nextEdgeId++}`;
        let edgeStyle = EDGE_STYLES[style] || (style && style.includes('=') ? style : EDGE_STYLES.solid);
        if (color) edgeStyle += `strokeColor=${color};`;
        if (label) {
            edgeStyle += 'labelBackgroundColor=#ffffff;';
            const lowerL = label.toLowerCase();
            if (lowerL.includes('read') || lowerL.includes('write')) {
                edgeStyle += 'labelPosition=left;verticalLabelPosition=top;align=right;spacingRight=5;';
            }
        }

        if (exitPort) {
            let px = 0.5, py = 0.5;
            if (exitPort === 'top') { px = 0.5; py = 0; }
            else if (exitPort === 'bottom') { px = 0.5; py = 1; }
            else if (exitPort === 'left') { px = 0; py = 0.5; }
            else if (exitPort === 'right') { px = 1; py = 0.5; }
            edgeStyle += `exitX=${px};exitY=${py};exitPerimeter=0;`;
        }
        if (entryPort) {
            let px = 0.5, py = 0.5;
            if (entryPort === 'top') { px = 0.5; py = 0; }
            else if (entryPort === 'bottom') { px = 0.5; py = 1; }
            else if (entryPort === 'left') { px = 0; py = 0.5; }
            else if (entryPort === 'right') { px = 1; py = 0.5; }
            edgeStyle += `entryX=${px};entryY=${py};entryPerimeter=0;`;
        }

        const edge = {
            id: edgeId, sourceId, targetId, label, style: edgeStyle, isEdge: true,
        };

        this.edges.set(edgeId, edge);
        


        return { success: true, id: edgeId, message: `Edge: ${sourceId} → ${targetId}${label ? ` (${label})` : ''}` };
    }

    // --- Disconnect ---
    disconnect(sourceId, targetId) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        let removed = 0;
        for (const [eId, edge] of this.edges) {
            if (edge.sourceId === sourceId && edge.targetId === targetId) {
                this.edges.delete(eId);
                removed++;
            }
        }

        if (removed === 0) {
            return { success: false, error: `No edge from "${sourceId}" to "${targetId}" found.` };
        }
        return { success: true, message: `Removed ${removed} edge(s) from "${sourceId}" to "${targetId}".` };
    }

    // --- Connect Tiers ---
    connectTiers(sourceTier, targetTier, label = '', style = 'solid') {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        const sourceNodes = this._nodesByTier(sourceTier);
        const targetNodes = this._nodesByTier(targetTier);

        if (sourceNodes.length === 0) return { success: false, error: `No nodes found in tier "${sourceTier}".` };
        if (targetNodes.length === 0) return { success: false, error: `No nodes found in tier "${targetTier}".` };

        const results = [];
        for (const src of sourceNodes) {
            for (const tgt of targetNodes) {
                const r = this.connect(src.id, tgt.id, label, style);
                results.push(r);
            }
        }

        const successes = results.filter(r => r.success).length;
        return { success: true, message: `Connected ${successes} edges from tier "${sourceTier}" to tier "${targetTier}".`, details: results };
    }

    // --- Connect HA Compute to Data ---
    connectHaComputeToData(computeId, primaryDbId, replicaDbId, primaryCacheId = null, replicaCacheId = null) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (!this.cells.has(computeId)) return { success: false, error: `Compute node "${computeId}" not found.` };
        if (!this.cells.has(primaryDbId)) return { success: false, error: `Primary DB "${primaryDbId}" not found.` };
        if (!this.cells.has(replicaDbId)) return { success: false, error: `Replica DB "${replicaDbId}" not found.` };

        const results = [];
        const hasEdge = (src, tgt) => {
            for (const [, e] of this.edges) {
                if (e.sourceId === src && e.targetId === tgt) return true;
            }
            return false;
        };

        // 1. Connect compute to Replica DB (Read Only)
        if (!hasEdge(computeId, replicaDbId)) {
            results.push(this.connect(computeId, replicaDbId, 'Read Only', 'solid'));
        }

        // 2. Connect compute to Primary DB (Read/Write)
        if (!hasEdge(computeId, primaryDbId)) {
            results.push(this.connect(computeId, primaryDbId, 'Read/Write', 'solid'));
        }

        // 3. Connect Primary DB to Replica DB (Async Replication)
        if (!hasEdge(primaryDbId, replicaDbId)) {
            results.push(this.connect(primaryDbId, replicaDbId, 'Async Replication', 'dashed'));
        }

        // 4. Handle Cache connections if provided
        if (primaryCacheId && replicaCacheId) {
            if (this.cells.has(primaryCacheId) && this.cells.has(replicaCacheId)) {
                // Connect Primary Cache to Replica Cache (Async Replication)
                if (!hasEdge(primaryCacheId, replicaCacheId)) {
                    results.push(this.connect(primaryCacheId, replicaCacheId, 'Async Replication', 'dashed'));
                }

                // Helper to get AZ container ID for a node
                const getAz = (cellId) => {
                    let curr = this.cells.get(cellId);
                    while (curr && curr.parentId && curr.parentId !== '1') {
                        if (curr.type === 'az') return curr.id;
                        curr = this.cells.get(curr.parentId);
                    }
                    return null;
                };

                const computeAz = getAz(computeId);
                const primaryCacheAz = getAz(primaryCacheId);
                const replicaCacheAz = getAz(replicaCacheId);

                // Connect compute to local cache (Cache Access)
                if (computeAz && computeAz === primaryCacheAz) {
                    if (!hasEdge(computeId, primaryCacheId)) {
                        results.push(this.connect(computeId, primaryCacheId, 'Cache Access', 'solid'));
                    }
                } else if (computeAz && computeAz === replicaCacheAz) {
                    if (!hasEdge(computeId, replicaCacheId)) {
                        results.push(this.connect(computeId, replicaCacheId, 'Cache Access', 'solid'));
                    }
                }
            }
        }

        const successes = results.filter(r => r.success).length;
        return {
            success: true,
            message: `HA Compute-to-Data macro completed: ${successes} new connections established.`,
            details: results
        };
    }

    // --- Provision HA Data Tier ---
    provisionHaDataTier(primaryAzComputeId, secondaryAzComputeId, dataResourceType) {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };
        if (!this.cells.has(primaryAzComputeId)) return { success: false, error: `Primary compute node "${primaryAzComputeId}" not found.` };
        if (!this.cells.has(secondaryAzComputeId)) return { success: false, error: `Secondary compute node "${secondaryAzComputeId}" not found.` };

        // Find data nodes
        let primaryData = null;
        let replicaData = null;
        
        for (const [, cell] of this.cells) {
            if (cell.type === dataResourceType) {
                if (this._isPrimary(cell)) {
                    primaryData = cell;
                } else if (this._isReplica(cell)) {
                    replicaData = cell;
                }
            }
        }

        if (!primaryData) return { success: false, error: `Primary ${dataResourceType} node not found (missing variant: "primary").` };
        if (!replicaData) return { success: false, error: `Replica ${dataResourceType} node not found (missing variant: "replica").` };

        const results = [];
        const hasEdge = (src, tgt) => {
            for (const [, e] of this.edges) {
                if (e.sourceId === src && e.targetId === tgt) return true;
            }
            return false;
        };

        if (dataResourceType === 'rds') {
            // 1. Primary compute -> Primary DB (Read/Write)
            if (!hasEdge(primaryAzComputeId, primaryData.id)) {
                results.push(this.connect(primaryAzComputeId, primaryData.id, 'Read/Write', 'solid'));
            }
            // 2. Secondary compute -> Replica DB (Read Only)
            if (!hasEdge(secondaryAzComputeId, replicaData.id)) {
                results.push(this.connect(secondaryAzComputeId, replicaData.id, 'Read Only', 'solid'));
            }
            // 3. Secondary compute -> Primary DB (Read/Write) [Cross-AZ Write]
            if (!hasEdge(secondaryAzComputeId, primaryData.id)) {
                results.push(this.connect(secondaryAzComputeId, primaryData.id, 'Read/Write', 'solid'));
            }
            // 4. Primary DB -> Replica DB (Async Replication)
            if (!hasEdge(primaryData.id, replicaData.id)) {
                results.push(this.connect(primaryData.id, replicaData.id, 'Async Replication', 'dashed'));
            }
        } else if (dataResourceType === 'elasticache') {
            // 1. Primary compute -> Primary Cache (Cache Access)
            if (!hasEdge(primaryAzComputeId, primaryData.id)) {
                results.push(this.connect(primaryAzComputeId, primaryData.id, 'Cache Access', 'solid'));
            }
            // 2. Secondary compute -> Replica Cache (Cache Access)
            if (!hasEdge(secondaryAzComputeId, replicaData.id)) {
                results.push(this.connect(secondaryAzComputeId, replicaData.id, 'Cache Access', 'solid'));
            }
            // 3. Primary Cache -> Replica Cache (Async Replication)
            if (!hasEdge(primaryData.id, replicaData.id)) {
                results.push(this.connect(primaryData.id, replicaData.id, 'Async Replication', 'dashed'));
            }
        }

        const successes = results.filter(r => r.success).length;
        return {
            success: true,
            message: `HA ${dataResourceType} data tier provisioned: ${successes} new connections established.`,
            details: results
        };
    }

    // --- Get State ---
    getState() {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        const containers = [];
        const nodes = [];

        for (const [id, cell] of this.cells) {
            if (cell.isContainer) {
                containers.push({
                    id: cell.id,
                    label: cell.label,
                    type: cell.type,
                    parent: cell.parentId,
                    x: cell.x,
                    y: cell.y,
                    width: cell.width,
                    height: cell.height,
                    children: this._childrenOf(cell.id).map(c => c.id),
                });
            } else {
                nodes.push({
                    id: cell.id,
                    label: cell.label,
                    type: cell.type,
                    parent: cell.parentId,
                    x: cell.x,
                    y: cell.y,
                    width: cell.width,
                    height: cell.height,
                    variant: cell.variant || null,
                });
            }
        }

        const edges = [];
        for (const [id, edge] of this.edges) {
            edges.push({
                id: edge.id,
                source: edge.sourceId,
                target: edge.targetId,
                label: edge.label || '',
                style: (edge.style || '').includes('dashed=1') ? 'dashed' : 'solid',
            });
        }

        return {
            success: true,
            title: this.title,
            containers,
            nodes,
            edges,
            summary: `${containers.length} containers, ${nodes.length} nodes, ${edges.length} edges`,
        };
    }

    // --- Validate ---
    validate() {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        const xml = this.toXml();
        try {
            const { validateXml } = require('./validate');
            const result = validateXml(xml, this.type);
            if (result.success) {
                return { success: true, message: 'Validation passed. No issues found.' };
            } else {
                return { success: false, error: 'Validation failed.', details: result.errors.join('\n') };
            }
        } catch (error) {
            return { success: false, error: `Validation crash: ${error.message}` };
        }
    }

    // --- Finalize (returns XML string — wrapper handles forwarding) ---
    finalize() {
        if (!this.initialized) return { success: false, error: 'Call init_diagram first.' };

        this._applyTopologicalCorrections();

        const validation = this.validate();
        if (!validation.success) {
            return { success: false, error: 'Cannot finalize — validation failed.', details: validation.details };
        }

        return { success: true, xml: this.toXml(), type: this.type, message: 'Diagram validated and ready.' };
    }

    // --- Serialize to XML ---
    toXml() {
        const lines = [];
        lines.push('<mxGraphModel>');
        lines.push('  <root>');
        lines.push('    <mxCell id="0"/>');
        lines.push('    <mxCell id="1" parent="0"/>');

        // Serialize containers (depth-first by parent chain)
        const sortedCells = this._topologicalSort();
        for (const cell of sortedCells) {
            if (cell.isContainer) {
                lines.push(`    <mxCell id="${this._esc(cell.id)}" value="${this._esc(cell.label)}" style="${this._esc(cell.style)}" vertex="1" parent="${this._esc(cell.parentId)}">`);
                lines.push(`      <mxGeometry x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" as="geometry"/>`);
                lines.push('    </mxCell>');
            } else {
                lines.push(`    <mxCell id="${this._esc(cell.id)}" value="${this._esc(cell.label)}" style="${this._esc(cell.style)}" vertex="1" parent="${this._esc(cell.parentId)}">`);
                lines.push(`      <mxGeometry x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" as="geometry"/>`);
                lines.push('    </mxCell>');
            }
        }

        // Serialize edges
        for (const [, edge] of this.edges) {
            const valueAttr = edge.label ? ` value="${this._esc(edge.label)}"` : '';
            lines.push(`    <mxCell id="${this._esc(edge.id)}"${valueAttr} edge="1" parent="1" source="${this._esc(edge.sourceId)}" target="${this._esc(edge.targetId)}" style="${this._esc(edge.style)}">`);
            if (edge.points && edge.points.length > 0) {
                lines.push('      <mxGeometry relative="1" as="geometry">');
                lines.push('        <Array as="points">');
                for (const pt of edge.points) {
                    lines.push(`          <mxPoint x="${pt.x}" y="${pt.y}"/>`);
                }
                lines.push('        </Array>');
                lines.push('      </mxGeometry>');
            } else {
                lines.push('      <mxGeometry relative="1" as="geometry"/>');
            }
            lines.push('    </mxCell>');
        }

        lines.push('  </root>');
        lines.push('</mxGraphModel>');
        return lines.join('\n') + '\n';
    }

    // --- Internal Helpers ---

    _childrenOf(parentId) {
        const children = [];
        for (const [, cell] of this.cells) {
            if (cell.parentId === parentId) children.push(cell);
        }
        return children;
    }

    _nodesByTier(tierQuery) {
        const q = tierQuery.toLowerCase();
        const results = [];
        for (const [, cell] of this.cells) {
            if (cell.isContainer) continue;
            // Match by type name
            if (cell.type === q) { results.push(cell); continue; }
            // Match by label
            if (cell.label && cell.label.toLowerCase().includes(q)) { results.push(cell); continue; }
            // Match by parent label/type (e.g., "web" matches nodes in a web subnet)
            const parent = this.cells.get(cell.parentId);
            if (parent && parent.label && parent.label.toLowerCase().includes(q)) {
                results.push(cell);
            }
        }
        return results;
    }

    _layoutContainer(type, parentId, siblings, tier) {
        const parent = this.cells.get(parentId);

        if (type === 'region') {
            return { x: 20, y: 150, width: 1280, height: 300 };
        }

        if (type === 'vpc') {
            return { x: 40, y: 180, width: 1200, height: 300 };
        }

        if (type === 'cluster') {
            const clusterIndex = siblings.filter(s => s.type === 'cluster').length;
            return { x: 40, y: 40 + clusterIndex * 540, width: 1200, height: 500 };
        }

        if (type === 'namespace') {
            const nsIndex = siblings.filter(s => s.type === 'namespace').length;
            const nsWidth = 540;
            const x = 30 + nsIndex * (nsWidth + 40);
            return { x, y: CONTAINER_PADDING.top, width: nsWidth, height: 400 };
        }

        if (type === 'deployment') {
            const deploySiblings = siblings.filter(s => s.type === 'deployment');
            let y = CONTAINER_PADDING.top;
            for (const s of deploySiblings) {
                y = Math.max(y, s.y + s.height + 24);
            }
            const parentWidth = parent ? parent.width : 540;
            return { x: 20, y, width: parentWidth - 40, height: 160 };
        }

        if (type === 'wan' || type === 'dmz' || type === 'lan') {
            const zoneSiblings = siblings.filter(s => s.type === 'wan' || s.type === 'dmz' || s.type === 'lan');
            let y = 40;
            for (const s of zoneSiblings) {
                y = Math.max(y, s.y + s.height + 40);
            }
            return { x: 40, y, width: 1200, height: 300 };
        }

        if (type === 'vlan') {
            const vlanIndex = siblings.filter(s => s.type === 'vlan').length;
            const vlanWidth = 350;
            const x = 20 + vlanIndex * (vlanWidth + 30);
            return { x, y: CONTAINER_PADDING.top, width: vlanWidth, height: 220 };
        }

        if (type === 'group') {
            const groupSiblings = siblings.filter(s => s.type === 'group');
            let y = CONTAINER_PADDING.top;
            for (const s of groupSiblings) {
                y = Math.max(y, s.y + s.height + 24);
            }
            const parentWidth = parent ? parent.width : 600;
            return { x: 20, y, width: parentWidth - 40, height: 200 };
        }

        if (type === 'az') {
            const azIndex = siblings.filter(s => s.type === 'az').length;
            const azWidth = 460;
            // First AZ at x=20, second AZ at x=20+460+AZ_GAP=700
            const x = 20 + azIndex * (azWidth + AZ_GAP);
            return { x, y: 160, width: azWidth, height: 200 };
        }

        if (type === 'subnet' || type.startsWith('subnet_')) {
            // Stack subnets vertically within AZ
            const subnetSiblings = siblings.filter(s => s.type === 'subnet' || s.type.startsWith('subnet_'));
            const parentWidth = parent ? parent.width : 460;

            // Determine height based on tier
            let height;
            if (tier === 'public') height = 60;
            else if (tier === 'data') height = 260;  // taller: more room for nodes + routing
            else height = 160;  // web/app subnets

            // Stack vertically: accumulate heights of existing subnets
            let y = CONTAINER_PADDING.top;
            for (const s of subnetSiblings) {
                y = Math.max(y, s.y + s.height + 24); // 24px gap between subnets
            }

            return {
                x: 20,
                y,
                width: parentWidth - 40,
                height,
            };
        }

        if (type === 'lane') {
            const laneSiblings = siblings.filter(s => s.type === 'lane');
            const parentWidth = parent ? parent.width : 1200;
            let y = CONTAINER_PADDING.top;
            for (const s of laneSiblings) {
                y = Math.max(y, s.y + s.height + 20);
            }
            return { x: 20, y, width: parentWidth - 40, height: 180 };
        }

        // Generic container
        const idx = siblings.length;
        const defaultWidth = parent ? Math.max(300, parent.width - 40) : 400;
        let y = CONTAINER_PADDING.top;
        for (const s of siblings) {
            y = Math.max(y, s.y + s.height + 24);
        }
        return { x: 20, y, width: defaultWidth, height: 220 };
    }

    _autoExpand(parentId) {
        const parent = this.cells.get(parentId);
        if (!parent || !parent.isContainer) return;

        const children = this._childrenOf(parentId);
        if (children.length === 0) return;

        let maxBottom = 0;
        let maxRight = 0;
        for (const child of children) {
            const bottom = child.y + child.height;
            const right = child.x + child.width;
            if (bottom > maxBottom) maxBottom = bottom;
            if (right > maxRight) maxRight = right;
        }

        let bottomPadding = CONTAINER_PADDING.bottom;
        if (parent.type === 'vpc') {
            bottomPadding = 100; // extra padding at bottom of VPC for horizontal cross-AZ routing
        }
        const neededHeight = maxBottom + bottomPadding;
        const neededWidth = maxRight + CONTAINER_PADDING.right;

        let heightChanged = false;
        const oldHeight = parent.height;

        if (neededHeight > parent.height) {
            parent.height = neededHeight;
            heightChanged = true;
        }
        if (neededWidth > parent.width) {
            parent.width = neededWidth;
        }

        // If parent height changed, shift siblings below it (if they exist)
        if (heightChanged && parent.parentId && parent.parentId !== '1') {
            this._shiftSiblingsBelow(parent.parentId, parent.id, oldHeight, parent.height);
        }

        // Recursively expand ancestors
        if (parent.parentId && parent.parentId !== '1') {
            this._autoExpand(parent.parentId);
        }
    }

    _shiftSiblingsBelow(parentId, expandedContainerId, oldHeight, newHeight) {
        const diff = newHeight - oldHeight;
        if (diff <= 0) return;
        const expanded = this.cells.get(expandedContainerId);
        const siblings = this._childrenOf(parentId).filter(c => c.isContainer && c.id !== expandedContainerId);
        for (const sibling of siblings) {
            if (sibling.y > expanded.y) {
                sibling.y += diff;
            }
        }
    }

    _topologicalSort() {
        // Sort cells so parents come before children
        const sorted = [];
        const visited = new Set();

        const visit = (id) => {
            if (visited.has(id)) return;
            visited.add(id);
            const cell = this.cells.get(id);
            if (!cell) return;
            if (cell.parentId !== '1' && this.cells.has(cell.parentId)) {
                visit(cell.parentId);
            }
            sorted.push(cell);
        };

        for (const [id] of this.cells) {
            visit(id);
        }
        return sorted;
    }

    _esc(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }

    _isPrimary(cell) {
        if (!cell) return false;
        const DATA_TYPES = ['rds', 'elasticache', 'dynamodb'];
        const v = (cell.variant || '').toLowerCase();
        const rawId = cell.id || '';
        const id = rawId.toLowerCase();
        const lbl = (cell.label || '').toLowerCase();
        
        if (v.includes('primary')) return true;
        if (id.includes('primary')) return true;
        if (lbl.includes('primary')) return true;
        
        // AZ-based heuristics
        const getAz = (c) => {
            let curr = c;
            while (curr && curr.parentId && curr.parentId !== '1') {
                if (curr.type === 'az') return curr;
                curr = this.cells.get(curr.parentId);
            }
            return null;
        };
        const az = getAz(cell);
        if (az) {
            const azId = az.id.toLowerCase();
            const azLbl = (az.label || '').toLowerCase();
            if (azId.endsWith('a') || azId.endsWith('1') || azLbl.endsWith('a') || azLbl.endsWith('1')) return true;
        }

        // Only apply suffix heuristics to data-tier nodes (case-sensitive and separator checks)
        if (DATA_TYPES.includes(cell.type)) {
            if (rawId.endsWith('A') || rawId.endsWith('1') || rawId.endsWith('_a') || rawId.endsWith('_1') || rawId.endsWith(' a') || rawId.endsWith(' 1')) return true;
            if (lbl.endsWith(' a') || lbl.endsWith(' 1')) return true;
        }
        return false;
    }

    _isReplica(cell) {
        if (!cell) return false;
        const DATA_TYPES = ['rds', 'elasticache', 'dynamodb'];
        const v = (cell.variant || '').toLowerCase();
        const rawId = cell.id || '';
        const id = rawId.toLowerCase();
        const lbl = (cell.label || '').toLowerCase();
        
        if (v.includes('replica') || v.includes('secondary')) return true;
        if (id.includes('replica') || id.includes('secondary')) return true;
        if (lbl.includes('replica') || lbl.includes('secondary')) return true;

        // AZ-based heuristics
        const getAz = (c) => {
            let curr = c;
            while (curr && curr.parentId && curr.parentId !== '1') {
                if (curr.type === 'az') return curr;
                curr = this.cells.get(curr.parentId);
            }
            return null;
        };
        const az = getAz(cell);
        if (az) {
            const azId = az.id.toLowerCase();
            const azLbl = (az.label || '').toLowerCase();
            if (azId.endsWith('b') || azId.endsWith('2') || azLbl.endsWith('b') || azLbl.endsWith('2')) return true;
        }

        // Only apply suffix heuristics to data-tier nodes (case-sensitive and separator checks)
        if (DATA_TYPES.includes(cell.type)) {
            if (rawId.endsWith('B') || rawId.endsWith('2') || rawId.endsWith('_b') || rawId.endsWith('_2') || rawId.endsWith(' b') || rawId.endsWith(' 2')) return true;
            if (lbl.endsWith(' b') || lbl.endsWith(' 2')) return true;
        }
        return false;
    }

    _applyTopologicalCorrections() {
        if (this.type !== 'architecture') {
            return;
        }
        const isCompute = (n) => {
            if (['apigateway', 'api_gateway', 'route53', 'waf', 'cloudfront', 'dynamodb', 'rds', 'elasticache', 'sqs', 'sns', 'eventbridge'].includes(n.type)) return false;
            if (['ecs', 'ec2', 'lambda'].includes(n.type)) return true;
            const labelLower = (n.label || '').toLowerCase();
            const idLower = (n.id || '').toLowerCase();
            return labelLower.includes('api') || labelLower.includes('worker') || idLower.includes('api') || idLower.includes('worker');
        };
        const isBroker = (n) => ['sqs', 'sns', 'eventbridge'].includes(n.type);

        const getAz = (cell) => {
            let curr = cell;
            while (curr && curr.parentId && curr.parentId !== '1') {
                if (curr.type === 'az') return curr;
                curr = this.cells.get(curr.parentId);
            }
            return null;
        };

        const getAbsoluteCoords = (c) => {
            let x = c.x || 0;
            let y = c.y || 0;
            let curr = c;
            while (curr && curr.parentId && curr.parentId !== '1') {
                curr = this.cells.get(curr.parentId);
                if (curr) {
                    x += curr.x || 0;
                    y += curr.y || 0;
                }
            }
            return { x, y };
        };

        const hasEdge = (srcId, tgtId, bidirectional = false) => {
            for (const [, e] of this.edges) {
                if (e.sourceId === srcId && e.targetId === tgtId) return true;
                if (bidirectional && e.sourceId === tgtId && e.targetId === srcId) return true;
            }
            return false;
        };

        // 0. Inject User Client if missing and Route 53 is present
        let hasUser = false;
        for (const [, cell] of this.cells) {
            if (cell.type === 'user') {
                hasUser = true;
                break;
            }
        }
        if (!hasUser) {
            let r53Node = null;
            for (const [, cell] of this.cells) {
                if (cell.type === 'route53') {
                    r53Node = cell;
                    break;
                }
            }
            if (r53Node) {
                // Determine layout sizing
                const nodeSize = NODE_SIZES['user'] || NODE_SIZE;
                const style = NODE_STYLES['user'] || NODE_STYLES.rectangle;
                const userNode = {
                    id: 'user',
                    label: 'User Client',
                    type: 'user',
                    style,
                    parentId: '1',
                    x: 0,
                    y: 10,
                    width: nodeSize.width,
                    height: nodeSize.height
                };
                this.cells.set('user', userNode);
                this.connect('user', r53Node.id, 'HTTPS Request', 'solid');

                // Re-trigger top-level horizontal centering for sibling nodes
                const siblingNodes = this._childrenOf('1').filter(c => !c.isContainer);
                const siblingContainers = this._childrenOf('1').filter(c => c.isContainer);
                const vpc = siblingContainers.find(c => c.type === 'vpc');
                const centerX = vpc ? (vpc.x + vpc.width / 2) : 600;
                const totalWidth = siblingNodes.length * NODE_SPACING.x;
                const startX = centerX - totalWidth / 2;

                siblingNodes.forEach((n, idx) => {
                    const nSize = NODE_SIZES[n.type] || NODE_SIZE;
                    n.x = startX + idx * NODE_SPACING.x + (NODE_SPACING.x - nSize.width) / 2;
                    n.y = 10;
                });
            }
        }

        // Purge any compute-to-compute horizontal edges (no horizontal cross-talk across AZs)
        const computeToComputeEdges = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && isCompute(src) && isCompute(tgt)) {
                const srcAz = getAz(src);
                const tgtAz = getAz(tgt);
                if (srcAz && tgtAz && srcAz.id !== tgtAz.id) {
                    computeToComputeEdges.push(edgeId);
                }
            }
        }
        for (const edgeId of computeToComputeEdges) {
            this.edges.delete(edgeId);
        }

        // 1. Force dashed style for broker-to-compute edges
        for (const [, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt) {
                if ((isBroker(src) && isCompute(tgt)) || (isCompute(src) && isBroker(tgt))) {
                    // Replace entire style to guarantee orthogonal routing + dashed
                    edge.style = EDGE_STYLES.dashed;
                    if (edge.label) edge.style += 'labelBackgroundColor=#ffffff;';

                    // Force upward routing for EventBridge with waypoints at y = 250 to avoid AZ crossing detours
                    if (src.type === 'eventbridge' || tgt.type === 'eventbridge') {
                        const compNode = isCompute(src) ? src : tgt;
                        const ebNode = src.type === 'eventbridge' ? src : tgt;
                        const srcCoords = getAbsoluteCoords(compNode);
                        const tgtCoords = getAbsoluteCoords(ebNode);

                        edge.style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        edge.points = [
                            { x: srcCoords.x + (compNode.width || 78) / 2, y: 250 },
                            { x: tgtCoords.x + (ebNode.width || 78) / 2, y: 250 }
                        ];
                    }
                }
            }
        }

        // 2. Explicit Database Tier Matrices
        let primaryDb = null;
        let replicaDb = null;
        for (const [, cell] of this.cells) {
            if (cell.type === 'rds' || cell.type === 'dynamodb') {
                if (this._isPrimary(cell)) primaryDb = cell;
                if (this._isReplica(cell)) replicaDb = cell;
            }
        }

        if (primaryDb && replicaDb) {
            // A. Clean up ALL existing database connection edges first
            const existingDbEdges = [];
            for (const [edgeId, edge] of this.edges) {
                const tgt = this.cells.get(edge.targetId);
                if (tgt && (tgt.type === 'rds' || tgt.type === 'dynamodb')) {
                    existingDbEdges.push(edgeId);
                }
            }
            for (const edgeId of existingDbEdges) {
                this.edges.delete(edgeId);
            }

            // B. Clean up ALL existing replication edges first
            const replicationEdges = [];
            for (const [edgeId, edge] of this.edges) {
                const lbl = (edge.label || '').toLowerCase();
                if (lbl.includes('replication')) {
                    replicationEdges.push(edgeId);
                }
            }
            for (const edgeId of replicationEdges) {
                this.edges.delete(edgeId);
            }

            // C. Establish strict data tier matrix connection
            for (const [, cell] of this.cells) {
                if (isCompute(cell)) {
                    const az = getAz(cell);
                    const isAzB = az && (az.id.endsWith('b') || az.id.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b|us-east-1b/i.test(az.label || ''));

                    if (!isAzB) {
                        // AZ-A Compute Node: Local Read/Write to Primary DB (No Cross-AZ)
                        let style = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                        if (primaryDb.type === 'dynamodb') {
                            // Force upward routing to regional DynamoDB
                            style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        }
                        this.connect(cell.id, primaryDb.id, 'Read/Write', style);
                    } else {
                        // AZ-B Compute Node:
                        // 1. Local Read Only / Read Local to Replica DB (Solid)
                        const readLbl = primaryDb.type === 'dynamodb' ? 'Read Local' : 'Read Only';
                        let readStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                        if (primaryDb.type === 'dynamodb') {
                            readStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        }
                        this.connect(cell.id, replicaDb.id, readLbl, readStyle);
                        
                        // 2. Cross-AZ Read/Write / Write Cross-AZ to Primary DB in AZ-A
                        const writeLbl = primaryDb.type === 'dynamodb' ? 'Write Cross-AZ' : 'Read/Write';
                        let writeStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                        if (primaryDb.type === 'rds') {
                            const isWeb = cell.id.toLowerCase().includes('web') || (cell.label || '').toLowerCase().includes('web');
                            const entryY = isWeb ? 0.35 : 0.65;
                            writeStyle += `exitX=0;exitY=0.5;exitPerimeter=0;entryX=1;entryY=${entryY};entryPerimeter=0;`;
                            const connRes = this.connect(cell.id, primaryDb.id, writeLbl, writeStyle);
                            
                            // Force waypoint to route cleanly below the App Subnet (offset Web/Worker to avoid overlap/header collision)
                            if (connRes.success) {
                                const createdEdge = this.edges.get(connRes.id);
                                if (createdEdge) {
                                    const srcCoords = getAbsoluteCoords(cell);
                                    const tgtCoords = getAbsoluteCoords(primaryDb);
                                    const routeY = isWeb ? 760 : 840;
                                    createdEdge.points = [
                                        { x: srcCoords.x, y: routeY },
                                        { x: tgtCoords.x + (primaryDb.width || 78), y: routeY }
                                    ];
                                }
                            }
                        } else {
                            // DynamoDB (Regional): Force clean upward routing without waypoints
                            writeStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                            this.connect(cell.id, primaryDb.id, writeLbl, writeStyle);
                        }
                    }
                }
            }

            // Hardcode assertion ensuring every node labeled "Api" and "Worker" in both AZs has an explicitly defined edge targeting the DynamoDB tier
            if (primaryDb && primaryDb.type === 'dynamodb') {
                for (const [, cell] of this.cells) {
                    if (cell.isContainer || !cell.label) continue;
                    const labelLower = cell.label.toLowerCase();
                    if (labelLower.includes('api') || labelLower.includes('worker')) {
                        const az = getAz(cell);
                        if (az) {
                            const isAzB = az.id.endsWith('b') || az.id.endsWith('2') || /[\s\-\/]b\b|[\s\-\/]2\b|us-east-1b/i.test(az.label || '');
                            if (!isAzB) {
                                if (!hasEdge(cell.id, primaryDb.id)) {
                                    let style = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                                    style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                                    this.connect(cell.id, primaryDb.id, 'Read/Write', style);
                                }
                            } else {
                                if (replicaDb && !hasEdge(cell.id, replicaDb.id)) {
                                    let readStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                                    readStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                                    this.connect(cell.id, replicaDb.id, 'Read Local', readStyle);
                                }
                                if (!hasEdge(cell.id, primaryDb.id)) {
                                    let writeStyle = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                                    writeStyle += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                                    this.connect(cell.id, primaryDb.id, 'Write Cross-AZ', writeStyle);
                                }
                            }
                        }
                    }
                }
            }

            // D. Connect DB replication: Primary DB -> Replica DB (Async Replication, dashed)
            const dbRepRes = this.connect(primaryDb.id, replicaDb.id, 'Async Replication', EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;');
            if (dbRepRes.success && primaryDb.type === 'rds') {
                const createdEdge = this.edges.get(dbRepRes.id);
                if (createdEdge) {
                    const srcCoords = getAbsoluteCoords(primaryDb);
                    const tgtCoords = getAbsoluteCoords(replicaDb);
                    createdEdge.points = [
                        { x: srcCoords.x + (primaryDb.width || 78) / 2, y: 1000 },
                        { x: tgtCoords.x + (replicaDb.width || 78) / 2, y: 1000 }
                    ];
                }
            }

            // E. Connect Cache replication: Cache Primary -> Cache Replica (Async Replication, dashed)
            let primaryCache = null;
            let replicaCache = null;
            for (const [, cell] of this.cells) {
                if (cell.type === 'elasticache') {
                    if (this._isPrimary(cell)) primaryCache = cell;
                    if (this._isReplica(cell)) replicaCache = cell;
                }
            }
            if (primaryCache && replicaCache) {
                const cacheRepRes = this.connect(primaryCache.id, replicaCache.id, 'Async Replication', EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;');
                if (cacheRepRes.success) {
                    const createdEdge = this.edges.get(cacheRepRes.id);
                    if (createdEdge) {
                        const srcCoords = getAbsoluteCoords(primaryCache);
                        const tgtCoords = getAbsoluteCoords(replicaCache);
                        createdEdge.points = [
                            { x: srcCoords.x + (primaryCache.width || 78) / 2, y: 835 },
                            { x: tgtCoords.x + (replicaCache.width || 78) / 2, y: 835 }
                        ];
                    }
                }
            }
        }


        // 4. ALB Deduplication: merge only ALBs that are in the SAME AZ.
        //    Per-AZ ALBs (one per AZ) are architecturally valid — do NOT merge them.
        const isInternalAlb = (cell) => {
            const lbl = (cell.label || '').toLowerCase();
            const id = (cell.id || '').toLowerCase();
            return lbl.includes('internal') || id.includes('internal');
        };
        const externalAlbs = [];
        const internalAlbs = [];
        for (const [, cell] of this.cells) {
            if (cell.type === 'alb' || cell.type === 'nlb') {
                if (isInternalAlb(cell)) internalAlbs.push(cell);
                else externalAlbs.push(cell);
            }
        }

        // Group external ALBs by AZ.  Only merge within the same AZ.
        const albsByAz = new Map(); // azId -> [albCell, ...]
        const albsNoAz = [];        // ALBs with no AZ ancestor
        for (const alb of externalAlbs) {
            const az = getAz(alb);
            if (az) {
                if (!albsByAz.has(az.id)) albsByAz.set(az.id, []);
                albsByAz.get(az.id).push(alb);
            } else {
                albsNoAz.push(alb);
            }
        }
        // Merge same-AZ duplicates
        for (const [, albsInAz] of albsByAz) {
            if (albsInAz.length > 1) {
                const keepAlb = albsInAz[0];
                keepAlb.label = keepAlb.label.replace(/ A$/, '').replace(/ B$/, '').replace(/ [12]$/, '');
                for (let i = 1; i < albsInAz.length; i++) {
                    const discardAlb = albsInAz[i];
                    for (const [, edge] of this.edges) {
                        if (edge.sourceId === discardAlb.id) edge.sourceId = keepAlb.id;
                        if (edge.targetId === discardAlb.id) edge.targetId = keepAlb.id;
                    }
                    this.cells.delete(discardAlb.id);
                }
            }
        }
        // Merge no-AZ duplicates
        if (albsNoAz.length > 1) {
            const keepAlb = albsNoAz[0];
            keepAlb.label = keepAlb.label.replace(/ A$/, '').replace(/ B$/, '').replace(/ [12]$/, '');
            for (let i = 1; i < albsNoAz.length; i++) {
                const discardAlb = albsNoAz[i];
                for (const [, edge] of this.edges) {
                    if (edge.sourceId === discardAlb.id) edge.sourceId = keepAlb.id;
                    if (edge.targetId === discardAlb.id) edge.targetId = keepAlb.id;
                }
                this.cells.delete(discardAlb.id);
            }
        }
        // Merge duplicate Internal ALBs (always merge — internal ALBs are singular)
        if (internalAlbs.length > 1) {
            const keepAlb = internalAlbs[0];
            keepAlb.label = keepAlb.label.replace(/ A$/, '').replace(/ B$/, '').replace(/ [12]$/, '');
            for (let i = 1; i < internalAlbs.length; i++) {
                const discardAlb = internalAlbs[i];
                for (const [, edge] of this.edges) {
                    if (edge.sourceId === discardAlb.id) edge.sourceId = keepAlb.id;
                    if (edge.targetId === discardAlb.id) edge.targetId = keepAlb.id;
                }
                this.cells.delete(discardAlb.id);
            }
        }

        // 4.5 Containment: seat EVERY external ALB in its AZ's public subnet.
        //     Rebuild the live external ALB list after merges.
        const liveExtAlbs = [];
        for (const [, cell] of this.cells) {
            if ((cell.type === 'alb' || cell.type === 'nlb') && !isInternalAlb(cell)) liveExtAlbs.push(cell);
        }
        for (const extAlb of liveExtAlbs) {
            const albAz = getAz(extAlb);

            // Find the best public subnet within the same AZ as this ALB
            let pubSubnet = null;

            // 1st choice: public/web subnet whose AZ ancestor matches extAlb's AZ
            if (albAz) {
                for (const [, cell] of this.cells) {
                    if (!cell.isContainer) continue;
                    if (cell.type !== 'subnet' && !cell.id.toLowerCase().includes('subnet')) continue;
                    if (getAz(cell) !== albAz) continue;
                    const idLower = cell.id.toLowerCase();
                    const labelLower = (cell.label || '').toLowerCase();
                    if (idLower.includes('pub') || idLower.includes('public') ||
                        labelLower.includes('pub') || labelLower.includes('public') ||
                        idLower.includes('web') || labelLower.includes('web')) {
                        pubSubnet = cell;
                        break;
                    }
                }
                // 2nd choice: any subnet in the same AZ
                if (!pubSubnet) {
                    for (const [, cell] of this.cells) {
                        if (cell.isContainer && getAz(cell) === albAz &&
                            (cell.type === 'subnet' || cell.id.toLowerCase().includes('subnet'))) {
                            pubSubnet = cell;
                            break;
                        }
                    }
                }
            }

            // 3rd choice: any public subnet anywhere
            if (!pubSubnet) {
                for (const [, cell] of this.cells) {
                    if (!cell.isContainer) continue;
                    if (cell.type !== 'subnet' && !cell.id.toLowerCase().includes('subnet')) continue;
                    const idLower = cell.id.toLowerCase();
                    const labelLower = (cell.label || '').toLowerCase();
                    if (idLower.includes('pub') || idLower.includes('public') ||
                        labelLower.includes('pub') || labelLower.includes('public')) {
                        pubSubnet = cell;
                        break;
                    }
                }
            }
            // Last resort: first subnet in any AZ
            if (!pubSubnet) {
                for (const [, cell] of this.cells) {
                    if (cell.isContainer && cell.type === 'subnet') { pubSubnet = cell; break; }
                }
            }

            if (pubSubnet) {
                extAlb.parentId = pubSubnet.id;
                const nodeW = extAlb.width || 78;
                const nodeH = extAlb.height || 78;
                extAlb.x = Math.max(20, Math.floor((pubSubnet.width - nodeW) / 2));
                extAlb.y = Math.max(30, Math.floor((pubSubnet.height - nodeH) / 2));
                const minHeight = extAlb.y + nodeH + 40;
                if (pubSubnet.height < minHeight) pubSubnet.height = minHeight;
                this._autoExpand(pubSubnet.id);
            }
        }

        // 5. Delete horizontal compute-to-compute edges across AZs
        const edgesToDelete = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && isCompute(src) && isCompute(tgt)) {
                const srcAz = getAz(src);
                const tgtAz = getAz(tgt);
                if (srcAz && tgtAz && srcAz.id !== tgtAz.id) {
                    edgesToDelete.push(edgeId);
                }
            }
        }
        for (const edgeId of edgesToDelete) {
            this.edges.delete(edgeId);
        }

        // 6. Ingress Routing Correction (Bypass, CDN & API Gateway path alignment)
        let clientNode = null;
        let r53Node = null;
        let wafNode = null;
        let cdnNode = null;
        let apigwNode = null;
        let albNode = null; // first live external ALB (for backward compat)
        for (const [, cell] of this.cells) {
            if (cell.type === 'user') clientNode = cell;
            if (cell.type === 'route53') r53Node = cell;
            if (cell.type === 'waf') wafNode = cell;
            if (cell.type === 'cloudfront') cdnNode = cell;
            if (cell.type === 'apigateway' || cell.type === 'endpoint') apigwNode = cell;
            if ((cell.type === 'alb' || cell.type === 'nlb') && !isInternalAlb(cell) && !albNode) albNode = cell;
        }

        // Collect ALL live external ALBs (post-merge)
        const allExtAlbs = [];
        for (const [, cell] of this.cells) {
            if ((cell.type === 'alb' || cell.type === 'nlb') && !isInternalAlb(cell)) allExtAlbs.push(cell);
        }

        // Flip any reverse proxy edges (e.g. ALB -> APIGW or ALB -> CloudFront)
        for (const alb of allExtAlbs) {
            for (const [, edge] of this.edges) {
                const src = this.cells.get(edge.sourceId);
                const tgt = this.cells.get(edge.targetId);
                if (src && tgt && src.id === alb.id &&
                    (tgt.type === 'apigateway' || tgt.type === 'endpoint' || tgt.type === 'cloudfront')) {
                    edge.sourceId = tgt.id;
                    edge.targetId = src.id;
                    edge.label = 'Forward';
                }
            }
        }

        // Establish the linear ingress spine: client → r53 → waf → cdn → apigw
        // ALBs are handled as a fan-out from apigw (or from cdn if no apigw).
        const seq = [];
        if (clientNode) seq.push(clientNode);
        if (r53Node) seq.push(r53Node);
        if (wafNode) seq.push(wafNode);
        if (cdnNode) seq.push(cdnNode);
        if (apigwNode) seq.push(apigwNode);
        // Only add a SINGLE alb to seq when there is no apigw (legacy single-ALB path)
        if (!apigwNode && albNode) seq.push(albNode);

        // Ensure consecutive nodes in the ingress spine are connected
        for (let i = 0; i < seq.length - 1; i++) {
            const src = seq[i];
            const tgt = seq[i+1];
            let found = false;
            for (const [, edge] of this.edges) {
                if (edge.sourceId === src.id && edge.targetId === tgt.id) {
                    found = true;
                    if (src.type === 'user') edge.label = 'HTTPS Request';
                    else if (src.type === 'route53') edge.label = 'Resolve & Route';
                    else if (src.type === 'waf') edge.label = 'Inspect & Filter';
                    else edge.label = 'Forward';
                    edge.style = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    break;
                }
            }
            if (!found) {
                let label = 'Forward';
                if (src.type === 'user') label = 'HTTPS Request';
                else if (src.type === 'route53') label = 'Resolve & Route';
                else if (src.type === 'waf') label = 'Inspect & Filter';
                this.connect(src.id, tgt.id, label, 'solid');
            }
        }

        // Fan out the last node in the ingress spine to ALL external ALBs
        if (seq.length > 0 && allExtAlbs.length > 0) {
            const lastSpineNode = seq[seq.length - 1];
            for (const alb of allExtAlbs) {
                if (!hasEdge(lastSpineNode.id, alb.id)) {
                    this.connect(lastSpineNode.id, alb.id, 'Forward', 'solid');
                }
            }
        }

        // Hard stop: User Client must ONLY connect to Route 53 (or next valid ingress)
        if (clientNode) {
            const validClientTarget = r53Node || wafNode || cdnNode || apigwNode || albNode;
            if (validClientTarget) {
                const clientBypasses = [];
                for (const [edgeId, edge] of this.edges) {
                    if (edge.sourceId === clientNode.id && edge.targetId !== validClientTarget.id) {
                        clientBypasses.push(edgeId);
                    }
                }
                for (const edgeId of clientBypasses) this.edges.delete(edgeId);
            }
        }

        // Purge non-consecutive edges within the ingress SPINE (bypasses/shortcuts/loops)
        const seqIds = new Set(seq.map(n => n.id));
        const allExtAlbIds = new Set(allExtAlbs.map(a => a.id));
        const edgesToPurgeSeq = [];
        for (const [edgeId, edge] of this.edges) {
            if (seqIds.has(edge.sourceId) && seqIds.has(edge.targetId)) {
                const srcIdx = seq.findIndex(n => n.id === edge.sourceId);
                const tgtIdx = seq.findIndex(n => n.id === edge.targetId);
                if (tgtIdx !== srcIdx + 1) {
                    edgesToPurgeSeq.push(edgeId);
                }
            }
            // Strict ingress spine-to-ALB constraint: only the last node in the spine is allowed to connect to ALBs
            if (seqIds.has(edge.sourceId) && allExtAlbIds.has(edge.targetId)) {
                const lastSpineNode = seq[seq.length - 1];
                if (edge.sourceId !== lastSpineNode.id) {
                    edgesToPurgeSeq.push(edgeId);
                }
            }
        }
        for (const edgeId of edgesToPurgeSeq) {
            this.edges.delete(edgeId);
        }

        // Purge any direct CDN-to-Compute bypasses that might remain
        const cdnToComputeEdges = [];
        if (cdnNode) {
            for (const [edgeId, edge] of this.edges) {
                if (edge.sourceId === cdnNode.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && isCompute(tgt)) {
                        cdnToComputeEdges.push(edgeId);
                    }
                }
            }
        }
        for (const edgeId of cdnToComputeEdges) {
            this.edges.delete(edgeId);
        }

        // Purge any direct APIGW-to-Compute bypasses (API Gateway MUST only produce
        // synchronous solid traffic to the next ingress node, never directly to compute)
        if (apigwNode) {
            const apigwToComputeEdges = [];
            for (const [edgeId, edge] of this.edges) {
                if (edge.sourceId === apigwNode.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && isCompute(tgt)) {
                        apigwToComputeEdges.push(edgeId);
                    }
                }
            }
            for (const edgeId of apigwToComputeEdges) {
                this.edges.delete(edgeId);
            }
        }

        // Purge any direct APIGW-to-Broker bypasses (ingress must flow through compute nodes/Lambda first)
        if (apigwNode) {
            const apigwToBrokerEdges = [];
            for (const [edgeId, edge] of this.edges) {
                if (edge.sourceId === apigwNode.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && isBroker(tgt)) {
                        apigwToBrokerEdges.push(edgeId);
                    }
                }
            }
            for (const edgeId of apigwToBrokerEdges) {
                this.edges.delete(edgeId);
            }
        }

        // Purge any WAF bypass edges (WAF directly to ALB or Compute)
        if (wafNode) {
            const wafBypassEdges = [];
            for (const [edgeId, edge] of this.edges) {
                if (edge.sourceId === wafNode.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && (tgt.type === 'alb' || tgt.type === 'nlb' || isCompute(tgt))) {
                        wafBypassEdges.push(edgeId);
                    }
                }
            }
            for (const edgeId of wafBypassEdges) {
                this.edges.delete(edgeId);
            }
        }

        // Purge any ingress-node-to-ALB/Compute bypasses that skip the chain
        // (e.g., Route53 -> ALB, CDN -> ALB when APIGW exists between them)
        if (albNode) {
            const bypassSources = [clientNode, r53Node, wafNode, cdnNode].filter(Boolean);
            for (const srcNode of bypassSources) {
                const srcIdx = seq.findIndex(n => n.id === srcNode.id);
                const albIdx = seq.findIndex(n => n.id === albNode.id);
                if (srcIdx >= 0 && albIdx >= 0 && albIdx !== srcIdx + 1) {
                    // This ingress node should not connect directly to ALB
                    const bypassEdges = [];
                    for (const [edgeId, edge] of this.edges) {
                        if (edge.sourceId === srcNode.id && edge.targetId === albNode.id) {
                            bypassEdges.push(edgeId);
                        }
                    }
                    for (const edgeId of bypassEdges) {
                        this.edges.delete(edgeId);
                    }
                }
            }
        }
        // Ingress spine-to-ALB port alignment: ensure all edges from last spine node to ALBs exit bottom and enter top
        if (seq.length > 0 && allExtAlbs.length > 0) {
            const lastSpineNode = seq[seq.length - 1];
            for (const [, edge] of this.edges) {
                if (edge.sourceId === lastSpineNode.id && allExtAlbIds.has(edge.targetId)) {
                    if (!edge.style.includes('exitX=')) {
                        edge.style += 'exitX=0.5;exitY=1;exitPerimeter=0;';
                    }
                    if (!edge.style.includes('entryX=')) {
                        edge.style += 'entryX=0.5;entryY=0;entryPerimeter=0;';
                    }
                }
            }
        }

        // Ensure ALB/NLB to Compute connections are solid request traffic.
        // For per-AZ ALBs: each ALB connects only to web tasks in its OWN AZ.
        for (const alb of allExtAlbs) {
            const albAz = getAz(alb);

            // 1. Fix existing ALB -> Compute edge styles
            for (const [, edge] of this.edges) {
                const src = this.cells.get(edge.sourceId);
                const tgt = this.cells.get(edge.targetId);
                if (src && tgt && src.id === alb.id && isCompute(tgt)) {
                    edge.style = EDGE_STYLES.solid + 'labelBackgroundColor=#ffffff;';
                    if (!edge.label || edge.label.toLowerCase().includes('event') || edge.label.toLowerCase().includes('log')) {
                        edge.label = 'Forward';
                    }
                }
            }

            // 2. Guarantee ALB → each Web task in same AZ (or globally if no AZ info)
            for (const [, cell] of this.cells) {
                if (!isCompute(cell)) continue;
                if (!cell.id.toLowerCase().includes('web') && !cell.label.toLowerCase().includes('web')) continue;
                const taskAz = getAz(cell);
                const sameAz = !albAz || !taskAz || albAz.id === taskAz.id;
                if (sameAz && !hasEdge(alb.id, cell.id)) {
                    this.connect(alb.id, cell.id, 'Forward', 'solid');
                }
            }
        }

        // Purge ALB/NLB -> Broker edges (load balancers NEVER publish to SQS/SNS/EventBridge)
        const albToBrokerEdges = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && (src.type === 'alb' || src.type === 'nlb') && isBroker(tgt)) {
                albToBrokerEdges.push(edgeId);
            }
        }
        for (const edgeId of albToBrokerEdges) {
            this.edges.delete(edgeId);
        }

        // Purge ALB/NLB -> Worker edges (load balancers only route to Web tasks)
        const albToWorkerEdges = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && (src.type === 'alb' || src.type === 'nlb')) {
                if (isCompute(tgt)) {
                    const isWorker = tgt.id.toLowerCase().includes('worker') || tgt.label.toLowerCase().includes('worker');
                    if (isWorker) {
                        albToWorkerEdges.push(edgeId);
                    }
                }
            }
        }
        for (const edgeId of albToWorkerEdges) {
            this.edges.delete(edgeId);
        }

        // 7. Event Flow & API Gateway Target Correction
        let sqsNode = null;
        for (const [, cell] of this.cells) {
            if (cell.type === 'sqs' || cell.type === 'sns') {
                sqsNode = cell;
                break;
            }
        }

        const edgesToPurge = [];
        for (const [edgeId, edge] of this.edges) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (src && tgt && isCompute(src) && (tgt.type === 'apigateway' || tgt.type === 'endpoint')) {
                const lbl = (edge.label || '').toLowerCase();
                if (lbl.includes('publish') || lbl.includes('event') || lbl.includes('log') || lbl.includes('queue')) {
                    if (sqsNode) {
                        edge.targetId = sqsNode.id;
                        edge.label = 'Publish Event Logs';
                        // Replace entire style to guarantee orthogonal routing + dashed
                        edge.style = EDGE_STYLES.dashed + 'labelBackgroundColor=#ffffff;';
                    }
                } else {
                    edgesToPurge.push(edgeId);
                }
            }
        }
        for (const edgeId of edgesToPurge) {
            this.edges.delete(edgeId);
        }

        // Purge any SQS edges connecting to non-compute nodes (e.g. user, r53, alb)
        if (sqsNode) {
            const badSqsEdges = [];
            for (const [edgeId, edge] of this.edges) {
                if (edge.targetId === sqsNode.id) {
                    const src = this.cells.get(edge.sourceId);
                    if (src && !isCompute(src)) {
                        badSqsEdges.push(edgeId);
                    }
                }
                if (edge.sourceId === sqsNode.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && !isCompute(tgt)) {
                        badSqsEdges.push(edgeId);
                    }
                }
            }
            for (const edgeId of badSqsEdges) {
                this.edges.delete(edgeId);
            }
        }

        // 7b. Symmetric SQS Wiring — ensure ALL Web Tasks publish and ALL Worker Tasks poll
        if (sqsNode) {
            for (const [, cell] of this.cells) {
                if (!isCompute(cell)) continue;
                const isWeb = cell.id.toLowerCase().includes('web') || cell.label.toLowerCase().includes('web');
                const isWorker = cell.id.toLowerCase().includes('worker') || cell.label.toLowerCase().includes('worker');

                if (isWeb && !hasEdge(cell.id, sqsNode.id)) {
                    this.connect(cell.id, sqsNode.id, 'Publish Event Logs', 'dashed', null, 'top', 'bottom');
                }
                if (isWorker && !hasEdge(sqsNode.id, cell.id)) {
                    this.connect(sqsNode.id, cell.id, 'Poll Tasks', 'dashed', null, 'bottom', 'top');
                }
            }

            // 7c. SQS port constraints to avoid crossing top-level rows
            const getAbsoluteCoords = (c) => {
                let x = c.x || 0;
                let y = c.y || 0;
                let curr = c;
                while (curr && curr.parentId && curr.parentId !== '1') {
                    curr = this.cells.get(curr.parentId);
                    if (curr) {
                        x += curr.x || 0;
                        y += curr.y || 0;
                    }
                }
                return { x, y };
            };

            for (const [, edge] of this.edges) {
                if (edge.sourceId === sqsNode.id || edge.targetId === sqsNode.id) {
                    const src = this.cells.get(edge.sourceId);
                    const tgt = this.cells.get(edge.targetId);
                    if (src && tgt) {
                        edge.style = edge.style
                            .replace(/exitX=[^;]+;/g, '')
                            .replace(/exitY=[^;]+;/g, '')
                            .replace(/entryX=[^;]+;/g, '')
                            .replace(/entryY=[^;]+;/g, '')
                            .replace(/exitPerimeter=[^;]+;/g, '')
                            .replace(/entryPerimeter=[^;]+;/g, '');
                        
                        if (edge.sourceId === sqsNode.id) {
                            edge.style += 'exitX=0.5;exitY=1;exitPerimeter=0;entryX=0.5;entryY=0;entryPerimeter=0;';
                        } else {
                            edge.style += 'exitX=0.5;exitY=0;exitPerimeter=0;entryX=0.5;entryY=1;entryPerimeter=0;';
                        }

                        const srcCoords = getAbsoluteCoords(src);
                        const tgtCoords = getAbsoluteCoords(tgt);
                        const srcX = srcCoords.x + (src.width || 78) / 2;
                        const tgtX = tgtCoords.x + (tgt.width || 78) / 2;
                        
                        edge.points = [
                            { x: srcX, y: 620 },
                            { x: tgtX, y: 620 }
                        ];
                    }
                }
            }
        }

        // 8. DNS Direct Routing / Route 53 Hallucination Correction
        let nextIngressNode = null;
        
        for (const [, cell] of this.cells) {
            if (!nextIngressNode && cell.type === 'waf') nextIngressNode = cell;
        }
        
        if (!nextIngressNode) {
            for (const [, cell] of this.cells) {
                if (!nextIngressNode && cell.type === 'cloudfront') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of this.cells) {
                if (!nextIngressNode && cell.type === 'apigateway') nextIngressNode = cell;
            }
        }
        if (!nextIngressNode) {
            for (const [, cell] of this.cells) {
                if (!nextIngressNode && (cell.type === 'alb' || cell.type === 'nlb')) nextIngressNode = cell;
            }
        }
        
        if (r53Node && nextIngressNode) {
            for (const [, edge] of this.edges) {
                if (edge.sourceId === r53Node.id) {
                    const tgt = this.cells.get(edge.targetId);
                    if (tgt && (isCompute(tgt) || tgt.type === 'alb' || tgt.type === 'nlb' || tgt.type === 'apigateway' || tgt.type === 'endpoint')) {
                        if (tgt.id !== nextIngressNode.id) {
                            edge.targetId = nextIngressNode.id;
                            edge.label = 'Route Traffic';
                        }
                    }
                }
            }
        }

        // 9. Mirror Macro Symmetry Constraint (AZ-A / AZ-B Edge Alignment)
        const getBaseName = (str) => {
            return str.toLowerCase()
                .replace(/_a$/, '').replace(/_b$/, '')
                .replace(/ a$/, '').replace(/ b$/, '')
                .replace(/a$/, '').replace(/b$/, '')
                .replace(/1$/, '').replace(/2$/, '')
                .replace(/web/, '').replace(/worker/, '');
        };

        const getMirror = (cell) => {
            if (!cell || cell.parentId === '1') return null;
            const az = getAz(cell);
            if (!az) return null;
            
            const isWeb = cell.id.toLowerCase().includes('web') || (cell.label || '').toLowerCase().includes('web');
            const isWorker = cell.id.toLowerCase().includes('worker') || (cell.label || '').toLowerCase().includes('worker');

            for (const [, other] of this.cells) {
                if (other.id === cell.id) continue;
                if (other.type !== cell.type) continue;
                const otherAz = getAz(other);
                if (!otherAz || otherAz.id === az.id) continue;

                if (cell.type === 'ecs' || cell.type === 'ec2') {
                    const otherWeb = other.id.toLowerCase().includes('web') || (other.label || '').toLowerCase().includes('web');
                    const otherWorker = other.id.toLowerCase().includes('worker') || (other.label || '').toLowerCase().includes('worker');
                    if (isWeb && !otherWeb) continue;
                    if (isWorker && !otherWorker) continue;
                }
                
                if (getBaseName(other.id) === getBaseName(cell.id) || getBaseName(other.label || '') === getBaseName(cell.label || '')) {
                    return other;
                }
            }
            return null;
        };

        // Mirror existing edges to enforce perfect symmetry
        const edgesToMirror = [];
        for (const [, edge] of this.edges) {
            edgesToMirror.push({
                sourceId: edge.sourceId,
                targetId: edge.targetId,
                label: edge.label,
                style: edge.style
            });
        }

        for (const edge of edgesToMirror) {
            const src = this.cells.get(edge.sourceId);
            const tgt = this.cells.get(edge.targetId);
            if (!src || !tgt) continue;

            const srcMirror = getMirror(src);
            const tgtMirror = getMirror(tgt);

            // Case A: Target is regional/global (outside VPC)
            if (srcMirror && (!tgt.parentId || tgt.parentId === '1' || this.cells.get(tgt.parentId)?.type === 'region')) {
                if (!hasEdge(srcMirror.id, tgt.id) && !hasEdge(tgt.id, srcMirror.id)) {
                    this.connect(srcMirror.id, tgt.id, edge.label, edge.style.includes('dashed') ? 'dashed' : 'solid');
                }
            }
            // Case B: Source is regional/global (outside VPC), target is in AZ
            else if (tgtMirror && (!src.parentId || src.parentId === '1' || this.cells.get(src.parentId)?.type === 'region')) {
                if (!hasEdge(src.id, tgtMirror.id) && !hasEdge(tgtMirror.id, src.id)) {
                    this.connect(src.id, tgtMirror.id, edge.label, edge.style.includes('dashed') ? 'dashed' : 'solid');
                }
            }
            // Case C: Both source and target are in AZs (only mirror if intra-AZ to avoid mirroring cross-AZ replication)
            else if (srcMirror && tgtMirror) {
                const srcAz = getAz(src);
                const tgtAz = getAz(tgt);
                if (srcAz && tgtAz && srcAz.id === tgtAz.id) {
                    if (!hasEdge(srcMirror.id, tgtMirror.id) && !hasEdge(tgtMirror.id, srcMirror.id)) {
                        let label = edge.label;
                        if (tgtMirror.type === 'rds' && this._isReplica(tgtMirror)) {
                            label = 'Read Only';
                        } else if (tgtMirror.type === 'rds' && this._isPrimary(tgtMirror)) {
                            label = 'Read/Write';
                        }
                        this.connect(srcMirror.id, tgtMirror.id, label, edge.style.includes('dashed') ? 'dashed' : 'solid');
                    }
                }
            }
        }

        // B. Re-layout top-level nodes (parent '1') horizontally with correct flow sorting
        const topLevelNodes = this._childrenOf('1').filter(c => !c.isContainer);
        const topLevelContainers = this._childrenOf('1').filter(c => c.isContainer);
        const vpc = topLevelContainers.find(c => c.type === 'vpc');
        const centerX = vpc ? (vpc.x + vpc.width / 2) : 600;

        // Sort by pipeline flow: user -> route53 -> waf -> cloudfront -> apigateway -> eventbridge -> dynamodb/rds
        const nodeOrder = ['user', 'route53', 'waf', 'cloudfront', 'apigateway', 'api_gateway', 'eventbridge', 'dynamodb', 'rds'];
        const getOrderIdx = (cell) => {
            if (cell.type === 'dynamodb') {
                if (this._isPrimary(cell)) return 5; // Put primary before EventBridge (index 6)
                if (this._isReplica(cell)) return 7; // Put replica after EventBridge (index 6)
            }
            const idx = nodeOrder.indexOf(cell.type);
            return idx === -1 ? 99 : idx;
        };
        topLevelNodes.sort((a, b) => getOrderIdx(a) - getOrderIdx(b));

        const totalWidth = topLevelNodes.length * NODE_SPACING.x;
        const startX = centerX - totalWidth / 2;

        topLevelNodes.forEach((n, idx) => {
            const nSize = NODE_SIZES[n.type] || NODE_SIZE;
            n.x = startX + idx * NODE_SPACING.x + (NODE_SPACING.x - nSize.width) / 2;
            n.y = 10;
        });

        // Cleanup empty Subnet containers
        const emptySubnets = [];
        for (const [id, cell] of this.cells) {
            if (cell.isContainer && (cell.type === 'subnet' || cell.type.startsWith('subnet_'))) {
                if (this._childrenOf(id).length === 0) {
                    emptySubnets.push(id);
                }
            }
        }
        for (const id of emptySubnets) {
            this.cells.delete(id);
        }
    }
}

module.exports = { DiagramBuilder, NODE_STYLES, CONTAINER_STYLES, EDGE_STYLES };
