// 2D mascot avatar, ported from design_handoff_mascot_2d/mascot-reference.html.
// States: idle | loading | happy | error | wave.

const MASCOT_MARKUP = `
    <svg class="mascot-ring" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="88" fill="none" stroke="#63809A" stroke-width="4"
            stroke-linecap="round" stroke-dasharray="120 434"></circle>
    </svg>
    <svg class="mascot-body" viewBox="0 0 200 200">
        <g class="mascot-arm-group">
            <ellipse cx="163" cy="126" rx="15" ry="9" fill="#63809A"></ellipse>
        </g>

        <path d="M100,38 C132,38 162,54 170,86 C178,117 166,148 139,161 C116,172 92,174 72,163 C48,150 30,127 30,99 C30,68 54,43 86,38 C91,37 95,37 100,38 Z" fill="#63809A"></path>
        <ellipse cx="101" cy="118" rx="40" ry="36" fill="#DCC0A3"></ellipse>

        <g data-face="neutral">
            <circle cx="86" cy="94" r="6" fill="#2B3A45"></circle>
            <circle cx="116" cy="94" r="6" fill="#2B3A45"></circle>
            <path d="M92,118 C97,123 105,123 110,118" fill="none" stroke="#2B3A45" stroke-width="5" stroke-linecap="round"></path>
        </g>

        <g data-face="loading" class="mascot-eyes-loading">
            <circle cx="86" cy="94" r="4.5" fill="#2B3A45"></circle>
            <circle cx="116" cy="94" r="4.5" fill="#2B3A45"></circle>
        </g>

        <g data-face="happy">
            <path d="M78,96 C81,86 91,86 94,96" fill="none" stroke="#2B3A45" stroke-width="5" stroke-linecap="round"></path>
            <path d="M108,96 C111,86 121,86 124,96" fill="none" stroke="#2B3A45" stroke-width="5" stroke-linecap="round"></path>
            <path d="M84,112 C92,126 110,126 118,112" fill="none" stroke="#2B3A45" stroke-width="5" stroke-linecap="round"></path>
        </g>

        <g data-face="error" stroke="#2B3A45" stroke-width="5" stroke-linecap="round">
            <path d="M75,89 L91,101 M91,89 L75,101"></path>
            <path d="M111,89 L127,101 M127,89 L111,101"></path>
            <path d="M88,124 L114,124"></path>
        </g>

        <g data-glasses fill="none" stroke="#2B3A45" stroke-width="4" stroke-linecap="round">
            <circle cx="86" cy="94" r="15"></circle>
            <circle cx="116" cy="94" r="15"></circle>
            <line x1="100" y1="94" x2="102" y2="94"></line>
            <line x1="71" y1="90" x2="63" y2="86"></line>
            <line x1="131" y1="90" x2="139" y2="86"></line>
        </g>

        <g data-face="happy" fill="#63809A">
            <path class="mascot-sparkle" d="M42,52 l3,9 l9,3 l-9,3 l-3,9 l-3,-9 l-9,-3 l9,-3 Z"></path>
            <path class="mascot-sparkle-2" d="M158,44 l2.4,7 l7,2.4 l-7,2.4 l-2.4,7 l-2.4,-7 l-7,-2.4 l7,-2.4 Z"></path>
        </g>
    </svg>
`;

// happy/error/wave are one-shot reactions that auto-revert to idle; loading persists until switched away.
const AUTO_REVERT_MS = { happy: 1600, error: 1400, wave: 2000 };

// Mounts the mascot markup into `root` and returns a setState(state) function.
export function mountMascot(root) {
    root.innerHTML = MASCOT_MARKUP;
    root.dataset.state = 'idle';
    let revertTimer = null;

    return function setMascotState(state) {
        clearTimeout(revertTimer);
        root.dataset.state = state;
        const revertMs = AUTO_REVERT_MS[state];
        if (revertMs) {
            revertTimer = setTimeout(() => { root.dataset.state = 'idle'; }, revertMs);
        }
    };
}
