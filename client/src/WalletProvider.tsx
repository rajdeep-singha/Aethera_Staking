import { AptosWalletAdapterProvider } from "@aptos-labs/wallet-adapter-react";
import { Network } from "@aptos-labs/ts-sdk";
import type { PropsWithChildren } from "react";
import { WalletModalProvider } from "./components/WalletModal";

// Optional: register your dApp at the Aptos Connect dev portal for branding +
// higher keyless rate limits. Keyless (Google/Apple) works without it in dev.
// NOTE: must be `undefined` when unset — passing an empty string "" makes the
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
      }}
      onError={(error) => {
        // Handle specific wallet errors
        const errorMessage = error.message || String(error);
        
        if (errorMessage.includes("User has rejected")) {
          console.warn("User rejected the wallet request");
          // You can dispatch to a state/context here if needed
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
