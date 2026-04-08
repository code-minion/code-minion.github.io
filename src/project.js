import cvData from './cv-data.json';

const urlParams = new URLSearchParams(window.location.search);
const projId = urlParams.get('id');

const pTitle = document.getElementById('proj-panel-title');
const content = document.getElementById('project-content');

if (projId && cvData.projects) {
    const proj = cvData.projects.find(p => p.id === projId);
    if (proj) {
        document.title = `PROJECT // ${proj.title}`;
        pTitle.textContent = `DATA_RECORD :: ${proj.id.toUpperCase()}`;
        
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
            <h4 style="color:var(--neon-pink);">${proj.year}</h4>
            <h1>${proj.title}</h1>
            <div class="large-tag-row">${tagsHtml}</div>
            
            <p>${descHtml}</p>

            <div class="repo-links">
                ${linksHtml}
            </div>
        `;

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
