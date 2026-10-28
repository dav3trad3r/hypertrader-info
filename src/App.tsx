import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Sentiment from "./pages/Sentiment";
import Whales from "./pages/Whales";
import ShareImage from "./pages/ShareImage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          {/* Shareable profile link: hypertrader.info/u/0x… (link previews are rendered per address by workers/og) */}
          <Route path="/u/:address" element={<Index />} />
          <Route path="/sentiment" element={<Sentiment />} />
          <Route path="/whales" element={<Whales />} />
          <Route path="/share/:address" element={<ShareImage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
