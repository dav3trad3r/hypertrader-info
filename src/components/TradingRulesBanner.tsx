import { AlertTriangle, Shield } from 'lucide-react';

const RULES = [
  { id: 'a', text: 'Never use more than 10x leverage on US stocks or indices', icon: '📊' },
  { id: 'b', text: 'Never buy in the banana zone', icon: '🍌' },
  { id: 'c', text: 'Do not trade any crypto other than BTC, ETH, SOL', icon: '🪙' },
  { id: 'd', text: 'ALWAYS LOOK AT THE CHARTS before buying', icon: '📈' },
  { id: 'e', text: 'Look for consolidated range formation - you are good at that, that is an edge', icon: '🎯' },
  { id: 'f', text: 'SET STOP LOSS (most important)', icon: '🛑', critical: true },
  { id: 'g', text: 'NEVER trade more than 33% of your account in a single position', icon: '⚖️' },
  { id: 'h', text: 'There is ALWAYS another trade - be patient and wait for the best setups', icon: '⏳' },
  { id: 'i', text: 'Read rules every day', icon: '📖' },
  { id: 'j', text: 'Never use cross margin', icon: '🚫' },
  { id: 'k', text: 'Love what you do and don\'t forget to spend what you earn. Life above all.', icon: '❤️', critical: true },
];

export function TradingRulesBanner() {
  return (
    <div className="bg-gradient-to-br from-card via-card to-primary/5 border-2 border-primary/30 rounded-xl p-6 mb-6 glow-teal">
      <div className="flex items-center gap-3 mb-5">
        <div className="p-2.5 rounded-lg bg-primary/20">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Trading Rules</h2>
          <p className="text-sm text-muted-foreground">Your personal trading discipline framework</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {RULES.map((rule) => (
          <div 
            key={rule.id}
            className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
              rule.critical 
                ? 'bg-loss/10 border border-loss/30' 
                : 'bg-secondary/50 hover:bg-secondary/80'
            }`}
          >
            <span className="text-xl flex-shrink-0">{rule.icon}</span>
            <div className="flex-1">
              <span className="text-xs font-mono text-muted-foreground mr-2">
                {rule.id.toUpperCase()})
              </span>
              <span className={`text-sm ${rule.critical ? 'text-loss font-semibold' : 'text-foreground'}`}>
                {rule.text}
              </span>
            </div>
            {rule.critical && (
              <AlertTriangle className="w-4 h-4 text-loss flex-shrink-0 mt-0.5" />
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t border-border/50 text-center">
        <p className="text-xs text-muted-foreground italic">
          "Discipline is the bridge between goals and accomplishment"
        </p>
      </div>
    </div>
  );
}
