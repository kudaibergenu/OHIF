import { Types } from '@ohif/core';

import { id } from './id';
import { startViewportTracker } from './viewportTracker';
import { startActionPoller } from './actionPoller';
import { setManagers } from './managers';

const askaiAssistantExtension: Types.Extensions.Extension = {
  id,

  /**
   * Start the two background channels as soon as the extension is registered.
   * Both run once per page load:
   *   • viewportTracker → pushes Cornerstone3D viewport state to /capture/state
   *   • actionPoller    → polls /capture/actions and dispatches agent-issued
   *                       actions (e.g. draw a Length annotation) back into
   *                       the viewer.
   *
   * OHIF passes the ExtensionParams here; we capture commandsManager /
   * servicesManager so the action poller can drive the viewer via OHIF
   * commands (window/level, scroll, transforms).
   */
  preRegistration: async (props: any) => {
    setManagers(props);
    startViewportTracker();
    startActionPoller();
  },
};

export default askaiAssistantExtension;
