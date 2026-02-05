 import { useRef, useState } from 'react';
 import { toPng } from 'html-to-image';
 import { Download, Share2, TrendingUp, TrendingDown, Minus, Gauge, Activity } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
 import { cn } from '@/lib/utils';
 
 interface SentimentCardData {
   action: {
     bias: string;
     confidence: string;
     reason: string;
     urgency: string;
   };
   fear_greed: {
     score: number;
     label: string;
   };
   key_prices: {
     BTC?: { price: number; change24h: number };
     ETH?: { price: number; change24h: number };
     HYPE?: { price: number; change24h: number };
   };
   timestamp: string;
 }
 
 interface ShareSentimentCardProps {
   data: SentimentCardData;
 }
 
 function getBiasColor(bias: string): string {
   const upper = bias.toUpperCase();
   if (upper.includes('STRONG SHORT') || upper.includes('BEARISH')) return 'text-loss';
   if (upper.includes('SHORT')) return 'text-loss/80';
   if (upper.includes('STRONG LONG') || upper.includes('BULLISH')) return 'text-profit';
   if (upper.includes('LONG')) return 'text-profit/80';
   return 'text-muted-foreground';
 }
 
 function getBiasIcon(bias: string) {
   const upper = bias.toUpperCase();
   if (upper.includes('SHORT') || upper.includes('BEARISH')) {
     return <TrendingDown className="w-5 h-5" />;
   }
   if (upper.includes('LONG') || upper.includes('BULLISH')) {
     return <TrendingUp className="w-5 h-5" />;
   }
   return <Minus className="w-5 h-5" />;
 }
 
 function getFearGreedColor(score: number): string {
   if (score <= 25) return 'text-loss';
   if (score <= 45) return 'text-orange-500';
   if (score <= 55) return 'text-yellow-500';
   if (score <= 75) return 'text-profit/80';
   return 'text-profit';
 }
 
 function getFearGreedBg(score: number): string {
   if (score <= 25) return 'bg-loss';
   if (score <= 45) return 'bg-orange-500';
   if (score <= 55) return 'bg-yellow-500';
   if (score <= 75) return 'bg-profit/80';
   return 'bg-profit';
 }
 
 function formatPrice(price: number): string {
   if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
   if (price >= 1) return `$${price.toFixed(2)}`;
   return `$${price.toFixed(4)}`;
 }
 
 function formatChange(change: number): string {
   const sign = change >= 0 ? '+' : '';
   return `${sign}${change.toFixed(2)}%`;
 }
 
 export function ShareSentimentCard({ data }: ShareSentimentCardProps) {
   const cardRef = useRef<HTMLDivElement>(null);
   const [isGenerating, setIsGenerating] = useState(false);
   const [isOpen, setIsOpen] = useState(false);
 
   const handleDownload = async () => {
     if (!cardRef.current) return;
     
     setIsGenerating(true);
     try {
       const dataUrl = await toPng(cardRef.current, {
         quality: 1,
         pixelRatio: 2,
         backgroundColor: '#141a24',
       });
       
       const link = document.createElement('a');
       link.download = `market-sentiment-${new Date().toISOString().split('T')[0]}.png`;
       link.href = dataUrl;
       link.click();
     } catch (error) {
       console.error('Failed to generate image:', error);
     } finally {
       setIsGenerating(false);
     }
   };
 
   const handleShare = async () => {
     if (!cardRef.current) return;
     
     setIsGenerating(true);
     try {
       const dataUrl = await toPng(cardRef.current, {
         quality: 1,
         pixelRatio: 2,
         backgroundColor: '#141a24',
       });
       
       const response = await fetch(dataUrl);
       const blob = await response.blob();
       const file = new File([blob], 'market-sentiment.png', { type: 'image/png' });
       
       if (navigator.share && navigator.canShare({ files: [file] })) {
         await navigator.share({
           files: [file],
           title: 'Market Sentiment',
           text: `Market Sentiment: ${data.action.bias} | Fear & Greed: ${data.fear_greed.score} (${data.fear_greed.label})`,
         });
       } else {
         handleDownload();
       }
     } catch (error) {
       console.error('Failed to share:', error);
     } finally {
       setIsGenerating(false);
     }
   };
 
   const biasColor = getBiasColor(data.action.bias);
   const fearGreedColor = getFearGreedColor(data.fear_greed.score);
   const fearGreedBg = getFearGreedBg(data.fear_greed.score);
 
   const prices = [
     { symbol: 'HYPE', data: data.key_prices.HYPE },
     { symbol: 'BTC', data: data.key_prices.BTC },
     { symbol: 'ETH', data: data.key_prices.ETH },
   ].filter(p => p.data);
 
   return (
     <Dialog open={isOpen} onOpenChange={setIsOpen}>
       <DialogTrigger asChild>
         <Button variant="outline" size="sm" className="gap-2">
           <Share2 className="w-4 h-4" />
           Share Sentiment
         </Button>
       </DialogTrigger>
       <DialogContent className="max-w-md p-0 overflow-hidden bg-transparent border-0">
         <div className="p-4 bg-card rounded-lg border border-border">
           <DialogHeader className="mb-4">
             <DialogTitle className="flex items-center justify-between">
               <span>Share Market Sentiment</span>
             </DialogTitle>
           </DialogHeader>
 
           {/* The shareable card */}
           <div
             ref={cardRef}
             className="p-6 rounded-xl overflow-hidden"
             style={{
               background: 'linear-gradient(135deg, #141a24 0%, #1a2332 50%, #0f1419 100%)',
             }}
           >
             {/* Header */}
             <div className="flex items-center justify-between mb-5">
               <div className="flex items-center gap-2">
                 <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                   <Activity className="w-4 h-4 text-primary" />
                 </div>
                 <div>
                   <div className="text-sm font-semibold text-foreground">Market Sentiment</div>
                   <div className="text-xs text-muted-foreground">Powered by NaganoAI</div>
                 </div>
               </div>
               <div className="text-xs text-muted-foreground">
                 {new Date().toLocaleDateString()}
               </div>
             </div>
 
             {/* Trading Bias */}
             <div className="text-center mb-5 p-4 rounded-lg bg-secondary/30">
               <div className="text-xs text-muted-foreground mb-1">Trading Bias</div>
               <div className={cn("text-2xl font-bold flex items-center justify-center gap-2", biasColor)}>
                 {getBiasIcon(data.action.bias)}
                 {data.action.bias}
               </div>
               <div className="flex items-center justify-center gap-2 mt-2">
                 <span className="text-xs bg-background/50 px-2 py-0.5 rounded text-muted-foreground">
                   {data.action.confidence} confidence
                 </span>
                 <span className={cn(
                   "text-xs px-2 py-0.5 rounded",
                   data.action.urgency === 'high' ? 'bg-loss/20 text-loss' : 'bg-secondary text-muted-foreground'
                 )}>
                   {data.action.urgency} urgency
                 </span>
               </div>
             </div>
 
             {/* Fear & Greed */}
             <div className="mb-5 p-4 rounded-lg bg-secondary/30">
               <div className="flex items-center justify-between">
                 <div className="flex items-center gap-2">
                   <Gauge className="w-4 h-4 text-muted-foreground" />
                   <span className="text-xs text-muted-foreground">Fear & Greed</span>
                 </div>
                 <div className="flex items-center gap-3">
                   <span className={cn("text-2xl font-bold", fearGreedColor)}>
                     {data.fear_greed.score}
                   </span>
                   <span className={cn("text-sm font-medium", fearGreedColor)}>
                     {data.fear_greed.label}
                   </span>
                 </div>
               </div>
               <div className="w-full h-2 bg-background/50 rounded-full mt-3 overflow-hidden">
                 <div 
                   className={cn("h-full rounded-full transition-all", fearGreedBg)}
                   style={{ width: `${data.fear_greed.score}%` }}
                 />
               </div>
             </div>
 
             {/* 24h Prices */}
             <div className="space-y-2">
               <div className="text-xs text-muted-foreground mb-2">24h Prices</div>
               {prices.map(({ symbol, data: priceData }) => (
                 <div key={symbol} className="flex items-center justify-between p-2 rounded-lg bg-secondary/30">
                   <span className="font-semibold text-foreground text-sm">{symbol}</span>
                   <div className="flex items-center gap-3">
                     <span className="text-sm font-medium text-foreground">
                       {formatPrice(priceData!.price)}
                     </span>
                     <span className={cn(
                       "text-xs font-medium",
                       priceData!.change24h >= 0 ? 'text-profit' : 'text-loss'
                     )}>
                       {formatChange(priceData!.change24h)}
                     </span>
                   </div>
                 </div>
               ))}
             </div>
 
             {/* Footer */}
             <div className="flex items-center justify-between pt-4 mt-4 border-t border-border/50">
               <div className="text-[10px] text-muted-foreground">
                 {new Date(data.timestamp).toLocaleTimeString()}
               </div>
               <div className="text-xs font-medium text-primary">
                 hyperliquid.xyz
               </div>
             </div>
           </div>
 
           {/* Action buttons */}
           <div className="flex gap-2 mt-4">
             <Button
               onClick={handleDownload}
               disabled={isGenerating}
               className="flex-1 gap-2"
             >
               <Download className="w-4 h-4" />
               {isGenerating ? 'Generating...' : 'Download'}
             </Button>
             <Button
               onClick={handleShare}
               disabled={isGenerating}
               variant="outline"
               className="flex-1 gap-2"
             >
               <Share2 className="w-4 h-4" />
               Share
             </Button>
           </div>
         </div>
       </DialogContent>
     </Dialog>
   );
 }