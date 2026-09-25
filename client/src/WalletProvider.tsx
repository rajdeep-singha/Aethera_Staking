import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import type { PropsWithChildren } from "react";
import { WalletModalProvider } from "./components/WalletModal";

// Optional: register the dApp at the Petra Web / Aptos Connect portal for
// branding and higher keyless rate limits. Google/Apple work without it in
// development. Must be `undefined` when unset — an empty string "" makes the
// web.petra.app/prompt/ keyless flow render a blank screen.
const APTOS_CONNECT_DAPP_ID =
  import.meta.env.VITE_APTOS_CONNECT_DAPP_ID || undefined;

export function WalletProvider({ children }: PropsWithChildren) {
  return (
    <AptosWalletAdapterProvider
      autoConnect={true}
      dappConfig={{
        network: Network.TESTNET,
        aptosConnectDappId: APTOS_CONNECT_DAPP_ID,
        aptosConnect: APTOS_CONNECT_DAPP_ID
          ? { dappId: APTOS_CONNECT_DAPP_ID }
          : undefined,
      }}
      onError={(error) => {
        const errorMessage = error.message || String(error);

        if (errorMessage.includes("User has rejected")) {
          console.warn("User rejected the wallet request");
        } else if (errorMessage.includes("not installed")) {
          console.error("Wallet extension not installed:", errorMessage);
        } else {
          console.error("Wallet error:", errorMessage);
        }
      }}
    >
      <WalletModalProvider>{children}</WalletModalProvider>
    </AptosWalletAdapterProvider>
  );
}
