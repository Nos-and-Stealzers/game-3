import { createGameSelector, gameOptions } from './game-selector.js';

const defaultTheme = {
  gap: '8px',
  marginBottom: '12px',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  borderRadius: '999px',
  borderColor: '#cbd5e1',
  background: '#f8fafc',
  textColor: '#0f172a',
  hoverBackground: '#e2e8f0',
  hoverBorderColor: '#94a3b8',
  activeBackground: '#0f172a',
  activeBorderColor: '#0f172a',
  activeTextColor: '#f8fafc',
  padding: '8px 14px',
  fontSize: '14px',
  fontWeight: '700',
  transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
};

export const gameTabThemePresets = {
  default: {},
  ocean: {
    borderColor: '#7dd3fc',
    background: '#e0f2fe',
    textColor: '#0c4a6e',
    hoverBackground: '#bae6fd',
    hoverBorderColor: '#38bdf8',
    activeBackground: '#0369a1',
    activeBorderColor: '#0369a1',
    activeTextColor: '#f0f9ff',
  },
  sunset: {
    borderColor: '#fdba74',
    background: '#fff7ed',
    textColor: '#7c2d12',
    hoverBackground: '#ffedd5',
    hoverBorderColor: '#fb923c',
    activeBackground: '#9a3412',
    activeBorderColor: '#9a3412',
    activeTextColor: '#ffffff',
  },
  retro: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    borderRadius: '4px',
    borderColor: '#16a34a',
    background: '#dcfce7',
    textColor: '#14532d',
    hoverBackground: '#bbf7d0',
    hoverBorderColor: '#16a34a',
    activeBackground: '#166534',
    activeBorderColor: '#166534',
    activeTextColor: '#ecfdf5',
  },
};

function resolveTheme(themeOptions = {}) {
  const options = themeOptions || {};
  const presetName = options.preset || 'default';
  const preset = gameTabThemePresets[presetName] || gameTabThemePresets.default;
  const { preset: _preset, ...overrides } = options;
  return { ...defaultTheme, ...preset, ...overrides };
}

export function createStyledGameTabs(hostElement, controlsElement, initialGameId = 'maze-runner', themeOptions = {}) {
  if (!(hostElement instanceof HTMLElement)) {
    throw new Error('createStyledGameTabs requires a valid host HTMLElement.');
  }

  if (!(controlsElement instanceof HTMLElement)) {
    throw new Error('createStyledGameTabs requires a valid controls HTMLElement.');
  }

  const theme = resolveTheme(themeOptions);

  const select = document.createElement('select');
  select.style.display = 'none';

  const style = document.createElement('style');
  style.textContent = `
    .game-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: ${theme.gap};
      align-items: center;
      margin: 0 0 ${theme.marginBottom};
      font-family: ${theme.fontFamily};
    }

    .game-tab-btn {
      appearance: none;
      border: 1px solid ${theme.borderColor};
      border-radius: ${theme.borderRadius};
      background: ${theme.background};
      color: ${theme.textColor};
      padding: ${theme.padding};
      font-size: ${theme.fontSize};
      font-weight: ${theme.fontWeight};
      line-height: 1;
      cursor: pointer;
      transition: ${theme.transition};
    }

    .game-tab-btn:hover {
      background: ${theme.hoverBackground};
      border-color: ${theme.hoverBorderColor};
    }

    .game-tab-btn.is-active {
      background: ${theme.activeBackground};
      border-color: ${theme.activeBorderColor};
      color: ${theme.activeTextColor};
    }
  `;

  const tabs = document.createElement('div');
  tabs.className = 'game-tabs';

  controlsElement.innerHTML = '';
  controlsElement.appendChild(style);
  controlsElement.appendChild(tabs);
  controlsElement.appendChild(select);

  const selector = createGameSelector(hostElement, select, initialGameId);

  const buttons = new Map();
  for (const option of gameOptions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'game-tab-btn';
    button.textContent = option.label;
    button.dataset.gameId = option.id;
    button.addEventListener('click', () => {
      selector.mountGame(option.id);
      syncActive();
    });
    buttons.set(option.id, button);
    tabs.appendChild(button);
  }

  function syncActive() {
    const active = selector.getActiveGameId();
    for (const [gameId, button] of buttons) {
      button.classList.toggle('is-active', gameId === active);
    }
  }

  syncActive();

  return {
    getActiveGameId() {
      return selector.getActiveGameId();
    },
    mountGame(gameId) {
      selector.mountGame(gameId);
      syncActive();
    },
    destroy() {
      selector.destroy();
      controlsElement.innerHTML = '';
    },
  };
}

export default createStyledGameTabs;