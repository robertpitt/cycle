export const getDesktopBridge = () =>
  typeof window === "undefined" ? undefined : window.cycleDesktop;
