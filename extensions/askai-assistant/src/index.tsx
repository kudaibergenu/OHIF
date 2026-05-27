import { Types } from '@ohif/core';

import { id } from './id';
import AiAssistantPanel from './AiAssistantPanel';
import { startViewportTracker } from './viewportTracker';

const askaiAssistantExtension: Types.Extensions.Extension = {
  id,

  /**
   * Start tracking the viewport as soon as the extension is registered.
   * Runs once per page load — the tracker subscribes to Cornerstone3D
   * events on the global eventTarget and posts to /capture/state.
   */
  preRegistration: () => {
    startViewportTracker();
  },

  getPanelModule: () => [
    {
      name: 'aiAssistant',
      iconName: 'tab-radar',
      iconLabel: 'AI',
      label: 'AI Assistant',
      component: AiAssistantPanel,
    },
  ],
};

export default askaiAssistantExtension;
