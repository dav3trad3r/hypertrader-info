import { TrendingUp, Github } from 'lucide-react';
import { Link } from 'react-router-dom';
import { REPO_URL } from '@/lib/links';
import { BSKTS_SITE } from '@/lib/bskts';
import { PAPERTRADE_SITE } from '@/lib/papertrade';
import hyperliquidMark from '@/assets/hyperliquid.png';
import bsktsMark from '@/assets/bskts.svg';
import papertradeMark from '@/assets/papertrade.svg';

// The venues the Tracker reads. One page, so this stands where a nav would:
// each mark links out to the protocol.
const PROTOCOLS = [
  { name: 'Hyperliquid', href: 'https://app.hyperliquid.xyz', mark: hyperliquidMark },
  { name: 'bskts', href: BSKTS_SITE, mark: bsktsMark },
  { name: 'Papertrade', href: PAPERTRADE_SITE, mark: papertradeMark },
];

export function Header() {
  return (
    <header className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <div className="p-2 rounded-lg bg-primary/10 glow-teal">
                <TrendingUp className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Hyper<span className="text-primary">Trader</span>
                </h1>
                <p className="text-xs text-muted-foreground">Open-source Hyperliquid Ecosystem Analytics</p>
              </div>
            </Link>

            {/* Supported protocols */}
            <div className="hidden sm:flex items-center gap-2 pl-6 border-l border-border" aria-label="Supported protocols">
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Tracks</span>
              <div className="flex items-center gap-1">
                {PROTOCOLS.map(p => (
                  <a
                    key={p.name}
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={p.name}
                    aria-label={p.name}
                    className="p-1 rounded-md hover:bg-secondary transition-colors"
                  >
                    <img src={p.mark} alt="" width={22} height={22} className="w-[22px] h-[22px] rounded-[5px]" />
                  </a>
                ))}
              </div>
            </div>
          </div>

          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open source on GitHub"
            title="Open source on GitHub"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Github className="w-5 h-5" />
          </a>
        </div>
      </div>
    </header>
  );
}
