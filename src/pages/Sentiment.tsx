import { Header } from '@/components/Header';
import { SentimentBanner } from '@/components/SentimentBanner';

const Sentiment = () => {
  return (
    <div className="min-h-screen bg-background grid-bg">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Market Sentiment</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered market analysis updated every 15 minutes
          </p>
        </div>
        
        <SentimentBanner />
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-12 py-6">
        <div className="container mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">HyperTrader</span> • Data sourced from Hyperliquid API • Not financial advice
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Sentiment;
