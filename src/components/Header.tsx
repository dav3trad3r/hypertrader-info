import { TrendingUp, Menu, Github } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { REPO_URL } from '@/lib/links';

export function Header() {
  const location = useLocation();
  
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
                <p className="text-xs text-muted-foreground">Open-source Hyperliquid PnL Tracker & Analytics</p>
              </div>
            </Link>
            
            {/* Navigation */}
            <nav className="hidden sm:flex items-center gap-1">
              <Link 
                to="/" 
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  location.pathname === '/' 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                Tracker
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-3">
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
            
            {/* Mobile Menu */}
            <Sheet>
              <SheetTrigger asChild className="sm:hidden">
                <Button variant="ghost" size="icon">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-64">
                <nav className="flex flex-col gap-2 mt-6">
                  <Link 
                    to="/" 
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      location.pathname === '/' 
                        ? 'bg-primary/10 text-primary' 
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    Tracker
                  </Link>
                </nav>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
