import cvData from './cv-data.json';

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('cv-container');
    
    // Build Header
    let contactLinks = [];
    if (cvData.contact.location) contactLinks.push(`<span>${cvData.contact.location}</span>`);
    if (cvData.contact.linkedin) contactLinks.push(`<span>linkedin.com/in/codeminion</span>`);
    
    // Skills
    const skillsHtml = cvData.skills.map(s => {
        return `<div class="skill-item">
            <span class="skill-name">${s.name}</span>
            <span class="skill-prof">${s.proficiency}</span>
        </div>`;
    }).join('');

    // Experience
    const expHtml = cvData.experience.map(e => {
        return `
        <div class="entry">
            <div class="entry-header">
                <h3>${e.title}</h3>
                <span class="entry-date">${e.period}</span>
            </div>
            <div class="entry-subtitle">${e.company}</div>
            <div class="entry-desc">${e.description}</div>
            <div class="tags">
                ${e.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
        </div>`;
    }).join('');

    // Projects
    const projHtml = cvData.projects.map(p => {
        return `
        <div class="entry">
            <div class="entry-header">
                <h3>${p.title}</h3>
                <span class="entry-date">${p.year}</span>
            </div>
            <div class="entry-desc">${p.description}</div>
            <div class="tags">
                ${p.tags.map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
        </div>`;
    }).join('');

    // Education & Others
    const langHtml = (cvData.languages || []).map(l => typeof l === 'string' ? l : `${l.language} (${l.level})`).join(', ');
    const patentHtml = (cvData.patents || []).map(p => {
        return `<li><strong>${p.title}</strong> (${p.status}, ${p.year}) - ${p.description}</li>`;
    }).join('');

    // Compile entire HTML
    const html = `
        <h1>${cvData.contact.name}</h1>
        <div class="header-contact">
            ${contactLinks.join(' <span style="color:#ccc;">|</span> ')}
        </div>
        
        <div class="summary">
            ${cvData.summary}
        </div>

        <h2>Experience</h2>
        ${expHtml}

        <div class="page-break"></div>

        <h2>Projects</h2>
        ${projHtml}

        <h2>Skills and Technologies</h2>
        <div class="skills-grid">
            ${skillsHtml}
        </div>

        <h2>Education</h2>
        <div class="entry">
            <div class="entry-header">
                <h3>Bachelor of Information Sciences (Software Engineering)</h3>
                <span class="entry-date">Graduated 2008</span>
            </div>
            <div class="entry-subtitle">Massey University, New Zealand</div>
        </div>

        ${patentHtml ? `<h2>Patents & Publications</h2>
        <ul style="color: var(--text-secondary); font-size: 14px;">
            ${patentHtml}
        </ul>` : ''}

        ${langHtml ? `<h2>Languages</h2>
        <p style="color: var(--text-secondary);">${langHtml}</p>` : ''}
    `;

    container.innerHTML = html;
});
