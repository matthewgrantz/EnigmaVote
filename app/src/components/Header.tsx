import { ConnectButton } from "@rainbow-me/rainbowkit";
import "../styles/Header.css";

export function Header() {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <div className="brand-mark">EV</div>
        <div>
          <p className="brand-eyebrow">EnigmaVote · Zama FHE</p>
          <h1 className="brand-title">Encrypted survey control room</h1>
        </div>
      </div>
      <div className="app-header__actions">
        <span className="network-pill">Sepolia</span>
        <ConnectButton />
      </div>
    </header>
  );
}
