import cvData from './cv-data.json';

const urlParams = new URLSearchParams(window.location.search);
const projId = urlParams.get('id');

const pTitle = document.getElementById('proj-panel-title');
const content = document.getElementById('project-content');

const architectureLenses = {
    ingest: {
        label: 'INGEST',
        title: 'Normalize the firehose without hiding market truth.',
        copy: 'The platform treats raw ticks, corrections, and late packets as first-class events. It separates transport reliability from domain interpretation so downstream models can replay the exact market view that informed a decision.',
        signal: 'Event sourcing, deterministic replay, backpressure control.'
    },
    risk: {
        label: 'RISK',
        title: 'Make risk visible before optimization takes over.',
        copy: 'Every fast path carries explicit limits, kill-switch hooks, and audit metadata. The architecture avoids a false trade-off between speed and governance by making controls mechanical rather than meeting-driven.',
        signal: 'Pre-trade guardrails, exposure windows, explainable decisions.'
    },
    evolve: {
        label: 'EVOLVE',
        title: 'Design seams around changing strategies.',
        copy: 'Strategies, features, and model inputs change faster than the core ledger of events. The system isolates experimentation from settlement-grade records so research can move quickly without weakening production confidence.',
        signal: 'Stable contracts, research-to-production path, bounded coupling.'
    }
};

const marketTradeoffs = {
    velocity: {
        label: 'Optimize for delivery learning',
        title: 'Architectural move: reversible decisions first',
        body: 'Start with a modular monolith or thin BFF seam, instrument the flow, and avoid premature platform extraction. The key is not to avoid structure; it is to delay irreversible boundaries until product risk has been converted into evidence.',
        metrics: ['Lead time', 'Decision reversibility', 'Feedback quality']
    },
    resilience: {
        label: 'Optimize for resilience',
        title: 'Architectural move: isolate failure domains',
        body: 'Separate the paths where failure has different blast radii, introduce explicit contracts, retries with budgets, idempotency keys, and operational dashboards. The design protects customer trust before it chases theoretical purity.',
        metrics: ['Error budget', 'Recovery time', 'Contract stability']
    },
    scale: {
        label: 'Optimize for scale',
        title: 'Architectural move: scale the bottleneck, not the org chart',
        body: 'Use traffic shape, data ownership, and team topology to decide what deserves independent scaling. A senior architect resists splitting everything and instead creates a roadmap from measured constraint to focused extraction.',
        metrics: ['Throughput headroom', 'Data contention', 'Team autonomy']
    }
};

function renderMarketSystemsDemo(proj) {
    const tagsHtml = proj.tags.map(t => `<span class="large-tag">${t}</span>`).join('');
    content.innerHTML = `
        <section class="architect-demo">
            <div class="demo-kicker">ONE_PAGE_DEMO // HYPOTHETICAL_MARKET_SYSTEMS_CASE</div>
            <h1>${proj.title}</h1>
            <p class="demo-lede">${proj.description}</p>
            <div class="large-tag-row">${tagsHtml}</div>

            <div class="architect-grid">
                <article class="demo-card span-2">
                    <h2>Architecture premise</h2>
                    <blockquote>
                        "A market-intelligence platform is only useful if it can be fast, replayable, and governed at the same time. The architecture should let researchers test new signals, operators trust the live path, and auditors reconstruct why a decision was made."
                    </blockquote>
                </article>

                <article class="demo-card">
                    <h2>System lens</h2>
                    <div class="lens-tabs" role="tablist" aria-label="System architecture lenses">
                        ${Object.entries(architectureLenses).map(([key, lens]) => `
                            <button class="lens-tab${key === 'risk' ? ' active' : ''}" type="button" data-lens="${key}" role="tab" aria-selected="${key === 'risk'}">${lens.label}</button>
                        `).join('')}
                    </div>
                    <div class="lens-panel" id="lens-panel"></div>
                </article>

                <article class="demo-card">
                    <h2>Decision simulator</h2>
                    <label for="tradeoff-select">What is the system optimizing for?</label>
                    <select id="tradeoff-select" class="demo-select">
                        ${Object.entries(marketTradeoffs).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join('')}
                    </select>
                    <div class="tradeoff-panel" id="tradeoff-panel"></div>
                </article>

                <article class="demo-card span-2">
                    <h2>How this maps to senior roles</h2>
                    <div class="principle-row">
                        <span>01</span>
                        <p><strong>Frame before solving.</strong> Name the forces: latency budget, replay fidelity, risk controls, data ownership, and decision reversibility.</p>
                    </div>
                    <div class="principle-row">
                        <span>02</span>
                        <p><strong>Prefer evolutionary seams.</strong> Keep research experiments, live serving, and audit trails decoupled without creating three competing truths.</p>
                    </div>
                    <div class="principle-row">
                        <span>03</span>
                        <p><strong>Make decisions testable.</strong> A strong design can replay the past, explain the present, and absorb the next strategy without heroic rewrites.</p>
                    </div>
                </article>
            </div>
        </section>
    `;

    const lensPanel = document.getElementById('lens-panel');
    const tradeoffPanel = document.getElementById('tradeoff-panel');
    const tradeoffSelect = document.getElementById('tradeoff-select');

    function setLens(key) {
        const lens = architectureLenses[key];
        lensPanel.innerHTML = `
            <h3>${lens.title}</h3>
            <p>${lens.copy}</p>
            <div class="demo-signal">${lens.signal}</div>
        `;
        document.querySelectorAll('.lens-tab').forEach(tab => {
            const isActive = tab.dataset.lens === key;
            tab.classList.toggle('active', isActive);
            tab.setAttribute('aria-selected', String(isActive));
        });
    }

    function setTradeoff(key) {
        const decision = marketTradeoffs[key];
        tradeoffPanel.innerHTML = `
            <h3>${decision.title}</h3>
            <p>${decision.body}</p>
            <div class="metric-row">
                ${decision.metrics.map(metric => `<span>${metric}</span>`).join('')}
            </div>
        `;
    }

    document.querySelectorAll('.lens-tab').forEach(tab => {
        tab.addEventListener('click', () => setLens(tab.dataset.lens));
    });
    tradeoffSelect.addEventListener('change', () => setTradeoff(tradeoffSelect.value));

    setLens('risk');
    setTradeoff(tradeoffSelect.value);
}

if (projId && cvData.projects) {
    const proj = cvData.projects.find(p => p.id === projId);
    if (proj) {
        document.title = `PROJECT // ${proj.title}`;
        pTitle.textContent = `DATA_RECORD :: ${proj.id.toUpperCase()}`;
        if (proj.demo === 'market-systems') {
            renderMarketSystemsDemo(proj);
        } else {
        
        let tagsHtml = proj.tags.map(t => `<span class="large-tag">${t}</span>`).join('');
        let linksHtml = proj.links.map(l => {
            const isActive = l.url && l.url !== '#';
            if (isActive) {
                return `<a href="${l.url}" class="btn-link" target="_blank">[ ${l.label} ]</a>`;
            } else {
                return `<span class="btn-link btn-inactive">[ ${l.label} ]</span>`;
            }
        }).join('');
        
        let imgHtml = '';
        if (proj.image) {
            imgHtml = `<div class="hero-img-container" style="display:block;"><img src="./${proj.image}" alt="${proj.title}" /></div>`;
        }

        // Extremely basic markdown to HTML for description
        let descHtml = proj.description
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br/>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        content.innerHTML = `
            ${imgHtml}
            <h4 style="color:var(--pink);">${proj.year}</h4>
            <h1>${proj.title}</h1>
            <div class="large-tag-row">${tagsHtml}</div>
            
            <p>${descHtml}</p>

            <div class="repo-links">
                ${linksHtml}
            </div>
        `;
        }

    } else {
        content.innerHTML = `<h1 style="color:red;">ERROR: PROJECT NOT FOUND</h1><p>Record ID '${projId}' does not exist in the database.</p>`;
        pTitle.textContent = `ERR_404`;
    }
} else {
    content.innerHTML = `<h1>REQUIRE_PARAMETERS</h1><p>No project ID specified in query.</p>`;
    pTitle.textContent = `ERR_NO_ID`;
}

// Background animation
const bgCanvas = document.getElementById('bg-canvas');
let bgCtx;
if (bgCanvas) {
    bgCtx = bgCanvas.getContext('2d');
    function resizeBg() {
        bgCanvas.width = window.innerWidth;
        bgCanvas.height = window.innerHeight;
    }
    resizeBg();
    window.addEventListener('resize', resizeBg);
    
    // Simplistic slower rain
    setInterval(() => {
        bgCtx.fillStyle = 'rgba(5, 12, 20, 0.1)';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        
        // random blips
        if(Math.random() > 0.5) {
            bgCtx.fillStyle = '#00d2ff';
            bgCtx.font = `12px 'Share Tech Mono', monospace`;
            bgCtx.fillText('1', Math.random()*bgCanvas.width, Math.random()*bgCanvas.height);
        }
    }, 100);
}
