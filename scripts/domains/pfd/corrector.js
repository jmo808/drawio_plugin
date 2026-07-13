class PfdCorrector {
    beforeConnect(builder, sourceNode, targetNode, edgeOpts) {
        if (builder.type !== 'pfd' || !sourceNode || !targetNode) return;

        if (!edgeOpts.exitPort) {
            const type = sourceNode.type;
            if (type === 'pump' || type === 'compressor' || type === 'pump_centrifugal' || type === 'pump_positive_displacement' || type === 'compressor_centrifugal' || type === 'compressor_reciprocating') {
                edgeOpts.exitPort = 'right';
            } else if (type === 'distillation_column' || type === 'distillation_column_tray' || type === 'distillation_column_packed') {
                const labelLower = (edgeOpts.label || '').toLowerCase();
                if (labelLower.includes('bottom')) edgeOpts.exitPort = 'bottom';
                else if (labelLower.includes('overhead') || labelLower.includes('distillate') || labelLower.includes('vapor')) edgeOpts.exitPort = 'top';
                else if (targetNode.y < sourceNode.y) edgeOpts.exitPort = 'top';
                else if (targetNode.y > sourceNode.y + sourceNode.height - 40) edgeOpts.exitPort = 'bottom';
                else edgeOpts.exitPort = 'right';
            } else if (type === 'heat_exchanger' || type === 'heat_exchanger_shell-and-tube' || type === 'heat_exchanger_plate') {
                edgeOpts.exitPort = (edgeOpts.style === 'utility' || edgeOpts.style === 'instrument') ? 'bottom' : 'right';
            } else {
                edgeOpts.exitPort = 'right';
            }
        }
        if (!edgeOpts.entryPort) {
            const type = targetNode.type;
            if (type === 'pump' || type === 'pump_centrifugal' || type === 'pump_positive_displacement') {
                edgeOpts.entryPort = 'left';
            } else if (type === 'compressor' || type === 'compressor_centrifugal' || type === 'compressor_reciprocating') {
                edgeOpts.entryPort = 'bottom';
            } else if (type === 'distillation_column' || type === 'distillation_column_tray' || type === 'distillation_column_packed') {
                if (sourceNode.y > targetNode.y + targetNode.height - 40) edgeOpts.entryPort = 'bottom';
                else edgeOpts.entryPort = 'left';
            } else if (type === 'heat_exchanger' || type === 'heat_exchanger_shell-and-tube' || type === 'heat_exchanger_plate') {
                edgeOpts.entryPort = (edgeOpts.style === 'utility' || edgeOpts.style === 'instrument') ? 'top' : 'left';
            } else {
                edgeOpts.entryPort = 'left';
            }
        }
    }
}

module.exports = PfdCorrector;
