import { Types } from '@ohif/core';

import { id } from './id';
import AiAssistantPanel from './AiAssistantPanel';
import { startViewportTracker } from './viewportTracker';
import { startActionPoller } from './actionPoller';

const askaiAssistantExtension: Types.Extensions.Extension = {
  id,

  /**
   * Start the two background channels as soon as the extension is registered.
   * Both run once per page load:
   *   • viewportTracker → pushes Cornerstone3D viewport state to /capture/state
   *   • actionPoller    → polls /capture/actions and dispatches agent-issued
   *                       actions (e.g. draw a Length annotation) back into
   *                       the viewer.
   */
  preRegistration: () => {
    startViewportTracker();
    startActionPoller();
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
