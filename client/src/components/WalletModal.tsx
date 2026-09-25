import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import {
  useWallet,
  groupAndSortWallets,
  type AdapterWallet,
  type AdapterNotDetectedWallet,
} from "@aptos-labs/wallet-adapter-react";
import "./WalletModal.css";

interface WalletModalContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const WalletModalContext = createContext<WalletModalContextValue | null>(null);

export function useWalletModal(): WalletModalContextValue {
  const ctx = useContext(WalletModalContext);
  if (!ctx) {
    throw new Error("useWalletModal must be used within a WalletModalProvider");
  }
  return ctx;
}

/**
 * App-wide provider that owns the wallet-picker modal. Mount it inside
 * AptosWalletAdapterProvider so the modal can call useWallet().
 */
export function WalletModalProvider({ children }: PropsWithChildren) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <WalletModalContext.Provider value={{ open, close, isOpen }}>
      {children}
      {isOpen && <WalletModal onClose={close} />}
    </WalletModalContext.Provider>
  );
}

function WalletModal({ onClose }: { onClose: () => void }) {
  const { wallets, notDetectedWallets, connect, connected } = useWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connected) onClose();
  }, [connected, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const { petraWebWallets, availableWallets, installableWallets } =
    groupAndSortWallets([
      ...(wallets ?? []),
      ...(notDetectedWallets ?? []),
    ]);

  const handleConnect = async (wallet: AdapterWallet) => {
    setError(null);
    setPending(wallet.name);
    try {
      await connect(wallet.name);
    } catch (e: any) {
      setError(e?.message || `Failed to connect to ${wallet.name}`);
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="wm-overlay" onClick={onClose}>
      <div
        className="wm-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="wm-head">
          <h3>Connect</h3>
          <button className="wm-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {error && <div className="wm-error">{error}</div>}

        {petraWebWallets.length > 0 && (
          <div className="wm-section">
            <p className="wm-label">Continue with Google or Apple (no wallet needed)</p>
            {petraWebWallets.map((w) => (
              <button
                key={w.name}
                className="wm-option wm-social"
                onClick={() => handleConnect(w)}
                disabled={pending !== null}
              >
                <img src={w.icon} alt="" className="wm-icon" />
                <span>{pending === w.name ? "Connecting…" : w.name}</span>
              </button>
            ))}
          </div>
        )}

        {availableWallets.length > 0 && (
          <div className="wm-section">
            <p className="wm-label">Connect a wallet</p>
            {availableWallets.map((w) => (
              <button
                key={w.name}
                className="wm-option"
                onClick={() => handleConnect(w)}
                disabled={pending !== null}
              >
                <img src={w.icon} alt="" className="wm-icon" />
                <span>{pending === w.name ? "Connecting…" : w.name}</span>
              </button>
            ))}
          </div>
        )}

        {installableWallets.length > 0 && (
          <div className="wm-section">
            <p className="wm-label">Don't have a wallet?</p>
            {installableWallets.map((w: AdapterNotDetectedWallet) => (
              <a
                key={w.name}
                className="wm-option wm-install"
                href={w.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={w.icon} alt="" className="wm-icon" />
                <span>Install {w.name}</span>
                <span className="wm-ext">↗</span>
              </a>
            ))}
          </div>
        )}

        {petraWebWallets.length === 0 &&
          availableWallets.length === 0 &&
          installableWallets.length === 0 && (
            <p className="wm-empty">No wallet options available.</p>
          )}
      </div>
    </div>
  );
}
