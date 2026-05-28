/**
 * Holds references to OHIF's CommandsManager / ServicesManager so the action
 * poller can drive the viewer through OHIF commands (window/level, scroll,
 * rotate/flip/zoom, …).
 *
 * Populated once in the extension's `preRegistration` hook (index.tsx), which
 * OHIF calls with the full ExtensionParams object. We stash the two managers in
 * module scope because actionPoller runs as a background loop, not inside a
 * React tree, so it has no other way to reach them.
 */
type Managers = {
  commandsManager?: any;
  servicesManager?: any;
};

let _commandsManager: any = null;
let _servicesManager: any = null;

export function setManagers(props: Managers): void {
  _commandsManager = props?.commandsManager ?? null;
  _servicesManager = props?.servicesManager ?? null;
}

export function getCommandsManager(): any {
  return _commandsManager;
}

export function getServicesManager(): any {
  return _servicesManager;
}

/**
 * The active viewport id from the grid service, or undefined. Commands that
 * accept a viewportId can be pointed at a specific viewport; when the agent
 * didn't specify one we fall back to whatever the radiologist is focused on.
 */
export function getActiveViewportId(): string | undefined {
  try {
    const vgs = _servicesManager?.services?.viewportGridService;
    return vgs?.getState?.()?.activeViewportId ?? undefined;
  } catch {
    return undefined;
  }
}
