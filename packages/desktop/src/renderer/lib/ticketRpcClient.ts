import { makeTicketRpcClient } from "@cycle/rpc/client";
import { getDesktopBridge } from "./desktopBridge.ts";

export const ticketRpcClient = makeTicketRpcClient({
  invoke: async (request) => {
    const bridge = getDesktopBridge();

    if (!bridge) {
      throw new Error("Ticket RPC is only available in the Electron desktop renderer.");
    }

    return bridge.ticketRpc(request);
  },
});
