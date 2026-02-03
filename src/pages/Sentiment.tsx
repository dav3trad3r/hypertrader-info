import { Header } from '@/components/Header';
import { SentimentBanner } from '@/components/SentimentBanner';
import naganoLogo from '@/assets/nagano-ai-logo.jpg';

const Sentiment = () => {
  return (
    <div className="min-h-screen bg-background grid-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Market Sentiment</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered market analysis updated every 15 minutes
            </p>
          </div>
          
          {/* NaganoAI Attribution */}
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg px-4 py-2">
            <span className="text-xs text-muted-foreground">Powered by</span>
            <a 
              href="https://nagano.ai" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <img 
                src={naganoLogo} 
                alt="NaganoAI" 
                className="w-6 h-6 rounded"
              />
              <span className="font-semibold text-foreground">NaganoAI</span>
            </a>
          </div>
        </div>
        
        <SentimentBanner />
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">HyperTrader</span> • Sentiment data by NaganoAI • Not financial advice
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Sentiment;
