export function mountStandaloneGame(container, config) {
  if (!(container instanceof HTMLElement)) {
    throw new Error('mountStandaloneGame requires a valid HTMLElement container.');
  }

  const { styles, markup, script, className = 'game-embed-root' } = config;
  const root = container.shadowRoot || (container.attachShadow ? container.attachShadow({ mode: 'open' }) : container);

  // Shadow-root scoped wrapper keeps each embed isolated from site CSS.
  root.innerHTML = `
    <style>
      :host { display: block; width: 100%; }
      .${className} { width: 100%; min-height: 720px; }
      .${className} * { box-sizing: border-box; }
    </style>
    <style>${styles}</style>
    <div class="${className}">${markup}</div>
  `;

  // Execute each game's original script against shadow-root lookups.
  const runner = new Function('document', script);
  runner(root);

  return {
    unmount() {
      if (root) {
        root.innerHTML = '';
      }
    },
  };
}
