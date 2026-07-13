const path = require('path');
const fs = require('fs');

class DomainRegistry {
    constructor() {
        this.domains = new Map();
    }

    loadDomains(builder) {
        const domainsDir = __dirname;
        const subdirs = ['aws', 'gcp', 'erd', 'pfd', 'kubernetes', 'network'];
        
        for (const domainName of subdirs) {
            try {
                const profilePath = path.join(domainsDir, domainName, 'profile.json');
                const correctorPath = path.join(domainsDir, domainName, 'corrector.js');
                
                if (fs.existsSync(profilePath)) {
                    const profile = require(profilePath);
                    let corrector = null;
                    
                    if (fs.existsSync(correctorPath)) {
                        const CorrectorClass = require(correctorPath);
                        corrector = new CorrectorClass();
                    }
                    
                    this.domains.set(domainName, { profile, corrector });
                    
                    // Register styles
                    if (profile.styles) {
                        for (const [type, style] of Object.entries(profile.styles)) {
                            builder.registerStyle(type, style);
                        }
                    }
                    // Register sizes
                    if (profile.sizes) {
                        for (const [type, size] of Object.entries(profile.sizes)) {
                            builder.registerSize(type, size);
                        }
                    }
                    // Register load balancer types
                    if (profile.loadBalancers) {
                        for (const lbType of profile.loadBalancers) {
                            builder.registerLoadBalancer(lbType);
                        }
                    }
                    // Register corrector hooks
                    if (corrector) {
                        builder.registerCorrector(corrector);
                    }
                }
            } catch (err) {
                console.error(`[REGISTRY] Failed to load domain "${domainName}":`, err);
            }
        }
    }
}

module.exports = { DomainRegistry };
