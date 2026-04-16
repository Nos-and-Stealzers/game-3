import {
  mountMazeRunner,
  mountArenaDrift,
  mountCaveHopper,
  mountGardenDefense,
  mountFactoryFreight,
  mountShipyardScramble,
} from './index.js';

const gameMounts = {
  'maze-runner': mountMazeRunner,
  'arena-drift': mountArenaDrift,
  'cave-hopper': mountCaveHopper,
  'garden-defense': mountGardenDefense,
  'factory-freight': mountFactoryFreight,
  'shipyard-scramble': mountShipyardScramble,
};

export const gameOptions = [
  { id: 'maze-runner', label: 'Maze Runner' },
  { id: 'arena-drift', label: 'Arena Drift' },
  { id: 'cave-hopper', label: 'Cave Hopper' },
  { id: 'garden-defense', label: 'Garden Defense' },
  { id: 'factory-freight', label: 'Factory Freight' },
  { id: 'shipyard-scramble', label: 'Shipyard Scramble' },
];

export function createGameSelector(hostElement, selectorElement, initialGameId = 'maze-runner') {
  if (!(hostElement instanceof HTMLElement)) {
    throw new Error('createGameSelector requires a valid host HTMLElement.');
  }

  if (!(selectorElement instanceof HTMLSelectElement)) {
    throw new Error('createGameSelector requires a valid HTMLSelectElement.');
  }

  selectorElement.innerHTML = '';
  for (const option of gameOptions) {
    const element = document.createElement('option');
    element.value = option.id;
    element.textContent = option.label;
    selectorElement.appendChild(element);
  }

  let activeGameId = gameMounts[initialGameId] ? initialGameId : gameOptions[0].id;
  let mounted = null;

  function mountGame(gameId) {
    const mount = gameMounts[gameId];
    if (!mount) {
      throw new Error(`Unknown game id: ${gameId}`);
    }

    if (mounted && typeof mounted.unmount === 'function') {
      mounted.unmount();
    }

    mounted = mount(hostElement);
    activeGameId = gameId;
    selectorElement.value = gameId;
  }

  function onSelectChange() {
    mountGame(selectorElement.value);
  }

  selectorElement.addEventListener('change', onSelectChange);
  mountGame(activeGameId);

  return {
    getActiveGameId() {
      return activeGameId;
    },
    mountGame,
    destroy() {
      selectorElement.removeEventListener('change', onSelectChange);
      if (mounted && typeof mounted.unmount === 'function') {
        mounted.unmount();
      }
      mounted = null;
    },
  };
}
