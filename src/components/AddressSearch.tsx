import { useState } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface AddressSearchProps {
  onSearch: (address: string) => void;
  isLoading: boolean;
  currentAddress?: string;
  onClear?: () => void;
}

export function AddressSearch({ 
  onSearch, 
  isLoading, 
  currentAddress,
  onClear 
}: AddressSearchProps) {
  const [inputValue, setInputValue] = useState(currentAddress || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSearch(inputValue.trim());
    }
  };

  const handleClear = () => {
    setInputValue('');
    onClear?.();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="relative group">
        <div className="absolute inset-0 bg-primary/20 rounded-lg blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
        
        <div className="relative flex items-center gap-2 bg-card border border-border rounded-lg p-2 focus-within:border-primary focus-within:glow-teal transition-all duration-300">
          <div className="flex items-center justify-center w-10 h-10 rounded-md bg-secondary">
            {isLoading ? (
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            ) : (
              <Search className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          
          <Input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter Hyperliquid address (0x...)"
            className="flex-1 border-0 bg-transparent font-mono text-sm placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isLoading}
          />
          
          {inputValue && !isLoading && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClear}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          )}
          
          <Button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="h-10 px-6 font-medium"
          >
            {isLoading ? 'Fetching...' : 'Search'}
          </Button>
        </div>
      </div>
      
      <p className="text-center text-xs text-muted-foreground mt-3">
        Enter any Hyperliquid wallet address to view their complete trading history
      </p>
    </form>
  );
}
