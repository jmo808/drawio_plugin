/**
 * ELK Layout Configuration Preset and Options module.
 */

const CONTAINER_PADDING = {
    region: { top: 40, left: 24, right: 24, bottom: 24 },
    vpc: { top: 40, left: 24, right: 24, bottom: 24 },
    az: { top: 40, left: 24, right: 24, bottom: 24 },
    subnet: { top: 40, left: 24, right: 24, bottom: 24 },
    group: { top: 30, left: 15, right: 15, bottom: 15 },
    lane: { top: 40, left: 120, right: 24, bottom: 24 },
    deployment: { top: 30, left: 15, right: 15, bottom: 15 },
    default: { top: 40, left: 24, right: 24, bottom: 24 }
};

const NODE_SIZES = {
    rectangle: { width: 140, height: 60 },
    diamond: { width: 140, height: 80 },
    cylinder: { width: 100, height: 70 },
    circle: { width: 60, height: 60 },
    process: { width: 140, height: 60 },
    decision: { width: 140, height: 80 },
    start: { width: 120, height: 60 },
    end: { width: 120, height: 60 },
    io: { width: 140, height: 60 },
    subroutine: { width: 140, height: 60 },
    participant: { width: 100, height: 300 },
    activation: { width: 20, height: 80 },
    note: { width: 120, height: 60 },
    central: { width: 140, height: 70 },
    branch: { width: 120, height: 50 },
    leaf: { width: 100, height: 40 },
    vessel: { width: 120, height: 180 },
    tank: { width: 120, height: 180 },
    pump: { width: 100, height: 70 },
    compressor: { width: 100, height: 80 },
    valve: { width: 80, height: 50 },
    cyclone: { width: 80, height: 120 },
    heat_exchanger: { width: 120, height: 80 },
    crusher: { width: 100, height: 80 },
    conveyor: { width: 120, height: 40 },
    mill: { width: 100, height: 70 },
    screen: { width: 100, height: 80 },
    silo: { width: 100, height: 120 },
    loadout: { width: 100, height: 80 },
    // Cloud defaults (overridden dynamically from profile size maps if loaded)
    ec2: { width: 78, height: 78 },
    ecs: { width: 78, height: 78 },
    lambda: { width: 78, height: 78 },
    rds: { width: 78, height: 78 },
    elasticache: { width: 78, height: 78 },
    alb: { width: 78, height: 78 },
    nlb: { width: 78, height: 78 },
    s3: { width: 78, height: 78 },
    cloudfront: { width: 78, height: 78 },
    route53: { width: 78, height: 78 },
    apigateway: { width: 78, height: 78 },
    api_gateway: { width: 78, height: 78 },
    waf: { width: 78, height: 78 },
    nat_gateway: { width: 78, height: 78 },
    endpoint: { width: 78, height: 78 },
    dynamodb: { width: 78, height: 78 },
    sqs: { width: 78, height: 78 },
    sns: { width: 78, height: 78 },
    eventbridge: { width: 78, height: 78 },
    user: { width: 78, height: 78 },
    internet: { width: 78, height: 78 }
};

/**
 * Returns ELK option overrides for a specific diagram type.
 * @param {string} diagramType 
 * @returns {object}
 */
function getElkOptions(diagramType) {
    const defaultOptions = {
        'elk.algorithm': 'layered',
        'elk.direction': 'DOWN',
        'elk.edgeRouting': 'ORTHOGONAL',
        'elk.spacing.nodeNode': '40',
        'elk.spacing.edgeNode': '30',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
        'elk.padding': '[top=40,left=24,bottom=24,right=24]'
    };

    if (diagramType === 'network') {
        return {
            ...defaultOptions,
            'elk.direction': 'RIGHT',
            'elk.spacing.nodeNode': '60'
        };
    }

    if (diagramType === 'flowchart') {
        return {
            ...defaultOptions,
            'elk.direction': 'DOWN',
            'elk.spacing.nodeNode': '50'
        };
    }

    return defaultOptions;
}

module.exports = {
    getElkOptions,
    CONTAINER_PADDING,
    NODE_SIZES
};
