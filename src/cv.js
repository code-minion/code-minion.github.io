import cvData from './cv-data.json';

// ---- SECTION NAVIGATION ----
const sections = ['home', 'projects', 'skills', 'experience', 'contact'];

window.showSection = function(id) {
    sections.forEach(s => {
        const el = document.getElementById(`section-${s}`);
        if(el) el.classList.remove('active');
        
        document.querySelectorAll(`.sidebar-link[data-section="${s}"], .nav-link[data-section="${s}"]`).forEach(btn => {
            btn.classList.remove('active');
            if (btn.classList.contains('sidebar-link')) {
                btn.querySelector('.link-bracket').textContent = '';
            }
        });
    });

    const activeEl = document.getElementById(`section-${id}`);
    if(activeEl) activeEl.classList.add('active');

    document.querySelectorAll(`[data-section="${id}"]`).forEach(btn => {
        btn.classList.add('active');
        if (btn.classList.contains('sidebar-link')) {
            btn.querySelector('.link-bracket').textContent = '>';
        }
    });

    // addTraceLog(`nav.goto(${id})`);
    
    const contentArea = document.querySelector('.content-area');
    if(contentArea) contentArea.scrollTop = 0;
};

document.querySelectorAll('[data-section]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const section = btn.getAttribute('data-section');
        window.showSection(section);
        
        if (btn.classList.contains('mobile-nav-btn')) {
            document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
    });
});

// ---- RENDER DATA ----
function renderData() {
    // Hero & Profile
    const codeBody = document.getElementById('code-body');
    if (codeBody) {
        codeBody.innerHTML = `<span class="code-keyword">def</span> <span class="code-fn">initialize_engineer</span>():\n    name   = <span class="code-str">"${cvData.contact.name}"</span>\n    base   = <span class="code-str">"${cvData.contact.location.split(' . ')[0]}"</span>\n    roles  = <span class="code-str">"${cvData.targetRoles[0]}"</span>\n    <span class="code-keyword">while</span> <span class="code-bool">True</span>:\n        <span class="code-fn">solve_hard_problems</span>()\n        <span class="code-fn">mentor_team</span>()\n        <span class="code-fn">ship_quality_code</span>()`;
    }

    const heroBody = document.getElementById('hero-body');
    if (heroBody) {
        heroBody.innerHTML = `
            <p class="terminal-line"><span class="prompt">&gt;</span> INITIALIZING PROTOCOL: <span class="neon-pink">${cvData.contact.name.replace(' ', '_').toUpperCase()}.SYS</span> // ${cvData.targetRoles[0].toUpperCase()}</p>
            <p class="terminal-line"><span class="prompt">&gt;</span> OVERVIEW: <span class="neon-cyan">${cvData.summary}</span></p>
            <br>
            <p class="terminal-line"><a href="./plain.html" target="_blank" style="text-decoration:none; border:1px solid var(--pink); color:var(--pink); padding: 6px 12px; display:inline-block; font-size:0.8rem;">[ DOWNLOAD_PRINTABLE_PDF ]</a></p>
            <p class="terminal-line blink-line"><span class="prompt">&gt;</span> <span class="cursor-block">█</span></p>
        `;
    }

    // Projects (Rows linking to new tab)
    const projectsGrid = document.getElementById('projects-grid');
    if (projectsGrid && cvData.projects) {
        let html = '';
        cvData.projects.forEach(proj => {
            // we make the whole card clickable
            let tagsHtml = proj.tags.map(t => `<span class="tag">${t}</span>`).join('');
            let linksHtml = proj.links.map(l => {
                const isActive = l.url && l.url !== '#';
                const linkClass = isActive ? 'proj-link neon-cyan' : 'proj-link inactive-link';
                return `<span class="${linkClass}">[ ${l.label} ]</span>`;
            }).join(' ');
            
            html += `
            <div class="terminal-panel project-card" style="cursor: pointer;" onclick="window.open('./project.html?id=${proj.id}', '_blank')">
                <div class="panel-title-bar">
                    <span class="panel-title">PROJECT :: ${proj.title.toUpperCase()}</span>
                    <span style="color:var(--neon-pink); font-size: 10px;">${proj.year}</span>
                </div>
                <div class="project-body">
                    <p class="project-desc">${proj.summary}</p>
                    <div class="tag-row">${tagsHtml}</div>
                    <div class="project-links">${linksHtml}</div>
                </div>
            </div>`;
        });
        projectsGrid.innerHTML = html;
    }

    // Skills
    const skillsGrid = document.getElementById('skills-grid');
    if (skillsGrid && cvData.skills) {
        // Group by proficiency or just list
        let html = '';
        let skillsObj = {};
        cvData.skills.forEach(s => {
            if(!skillsObj[s.proficiency]) skillsObj[s.proficiency] = [];
            skillsObj[s.proficiency].push(s.name);
        });
        
        for (let prof in skillsObj) {
            html += `<div class="skill-row"><span class="skill-label">${prof.toUpperCase()}:</span><span>${skillsObj[prof].join(' | ')}</span></div>`;
        }
        skillsGrid.innerHTML = html;
    }

    const skillsBars = document.getElementById('skills-bars');
    if (skillsBars && cvData.skills) {
        let html = '';
        cvData.skills.slice(0, 6).forEach(s => {
            let pct = s.proficiency === 'expert' ? '95%' : s.proficiency === 'advanced' ? '85%' : '70%';
            let pclass = s.proficiency === 'expert' ? 'bar-pink' : '';
            html += `
            <div class="skill-bar-row">
                <span class="bar-label">${s.name}</span>
                <div class="bar-track"><div class="bar-fill ${pclass}" style="--pct: ${pct}"></div></div>
                <span class="bar-pct">${pct}</span>
            </div>`;
        });
        skillsBars.innerHTML = html;
    }

    // Experience
    const expList = document.getElementById('experience-list');
    if (expList && cvData.experience) {
        let html = '';
        cvData.experience.forEach(exp => {
            let tagsHtml = exp.tags.map(t => `<span class="tag">${t}</span>`).join('');
            html += `
            <div class="terminal-panel exp-card">
                <div class="panel-title-bar">
                    <span class="panel-title">NODE :: ${exp.company.toUpperCase().replace(' ','_')} // ${exp.period.toUpperCase()}</span>
                </div>
                <div class="exp-body">
                    <h3 class="exp-title neon-pink">${exp.title}</h3>
                    <p>${exp.description}</p>
                    <div class="tag-row">${tagsHtml}</div>
                </div>
            </div>`;
        });
        expList.innerHTML = html;
    }

    // Contact & Education
    const contactBody = document.getElementById('contact-body');
    if (contactBody) {
        let html = `
            <p class="terminal-line"><span class="prompt">&gt;</span> NETWORK: LINKED_IN // <a href="https://${cvData.contact.linkedin}" target="_blank" class="neon-cyan contact-link">${cvData.contact.linkedin}</a></p>
            <p class="terminal-line"><span class="prompt">&gt;</span> BASE_NODE: <span class="neon-cyan">${cvData.contact.location}</span></p>
            <br/><p class="terminal-line"><span class="prompt">&gt;</span> EDUCATION:</p>
        `;
        cvData.education.forEach(ed => {
            html += `<p class="terminal-line indent">▸ ${ed.degree} — ${ed.institution} (${ed.year})</p>`;
        });
        html += `<br/><p class="terminal-line"><span class="prompt">&gt;</span> LANGUAGES: <span class="neon-cyan">${(cvData.languages || []).map(l => l.language || l).join(' // ')}</span></p>`;
        contactBody.innerHTML = html;
    }
}

// ---- BACKGROUND ANIMATIONS ----
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
    
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*<>{}[]ｦｧｨｩｪｵᚁᚂ';
    const fontSize = 18;
    const columns = Math.floor(window.innerWidth / fontSize);
    const drops = Array(columns).fill(1).map(() => Math.floor(Math.random() * -100));

    function drawRain() {
        bgCtx.fillStyle = 'rgba(5, 12, 20, 0.04)';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);
        bgCtx.font = `12px 'Share Tech Mono', monospace`;
        
        drops.forEach((y, i) => {
            bgCtx.fillStyle = '#00d2ff';
            bgCtx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, y);
            
            bgCtx.fillStyle = 'rgba(0, 100, 130, 0.6)';
            for(let j=1; j<5; j++) {
                if(y - j*14 > 0) bgCtx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, y - j*14);
            }
            if(y > bgCanvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i] += 14;
        });
    }
    setInterval(drawRain, 50);
}

// HERO CHART ANIMATION
const heroChart = document.getElementById('hero-chart');
if (heroChart) {
    const ctx = heroChart.getContext('2d');
    let phase = 0;
    function drawChart() {
        heroChart.width = heroChart.offsetWidth;
        heroChart.height = heroChart.offsetHeight;
        const w = heroChart.width, h = heroChart.height;
        ctx.clearRect(0, 0, w, h);
        
        [{color: '#00d2ff', alpha: 0.9, amp: 22, freq: 0.04, ph: phase},
         {color: '#ff2d7e', alpha: 0.7, amp: 14, freq: 0.06, ph: phase * 1.4},
         {color: '#39ff5e', alpha: 0.5, amp: 10, freq: 0.08, ph: phase * 0.7}
        ].forEach(line => {
            ctx.beginPath();
            ctx.moveTo(0, h/2);
            for(let x=0; x<=w; x+=2) {
                let y = h/2 - Math.sin(x*line.freq + line.ph)*line.amp - Math.sin(x*(line.freq*0.5) + line.ph*1.3)*line.amp*0.4;
                if(x===0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.strokeStyle = line.color;
            ctx.globalAlpha = line.alpha;
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 8;
            ctx.shadowColor = line.color;
            ctx.stroke();
        });
        
        // Gradient fill
        ctx.beginPath();
        ctx.moveTo(0, h);
        for(let x=0; x<=w; x+=2) {
            let y = h/2 - Math.sin(x*0.04 + phase)*22 - Math.sin(x*0.02 + phase*1.3)*9;
            ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        let grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, 'rgba(0,210,255,0.15)');
        grad.addColorStop(1, 'rgba(0,210,255,0)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
        ctx.fill();
        
        phase += 0.05;
        requestAnimationFrame(drawChart);
    }
    drawChart();
}

// SYSTEM SIMULATIONS
const latVal = document.getElementById('latency-val');
const ftLat = document.getElementById('footer-latency');
setInterval(() => {
    let lat = (Math.random() * 12 + 18).toFixed(1) + 'ms';
    if(latVal) latVal.textContent = lat;
    if(ftLat) ftLat.textContent = lat;
}, 2500);

const traceLog = document.getElementById('trace-log');
function addTraceLog(msg) {
    if(!traceLog) return;
    const div = document.createElement('div');
    div.className = 'trace-line';
    div.innerHTML = `<span style="color:#00d2ff">OK</span> ${msg}`;
    traceLog.appendChild(div);
    while(traceLog.children.length > 8) traceLog.removeChild(traceLog.firstChild);
}

/* 
const traceMsgs = ['heap.gc()','cache.hit','auth.ok','api.call','render.frame','event.loop','ui.repaint'];
setInterval(() => {
    addTraceLog(traceMsgs[Math.floor(Math.random() * traceMsgs.length)]);
}, 3000);
*/

// INIT
renderData();
