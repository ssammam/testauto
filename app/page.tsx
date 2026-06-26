import { client } from '@/sanity/lib/client';
import Link from 'next/link';

export const revalidate = 0; // Disable caching to always show the latest rates

export default async function Home() {
  const latestRates = await client.fetch(`*[_type == "dailyPrice"] | order(date desc)[0]`);

  return (
    <div className="min-h-screen bg-[#111111] text-[#f5f5f5] font-sans selection:bg-[#c9a96e] selection:text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md fixed top-0 w-full z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="text-2xl font-serif tracking-widest text-[#c9a96e]">RJ AUTOMATION</div>
          <nav className="hidden md:flex gap-8 text-sm uppercase tracking-widest font-medium text-gray-400">
            <Link href="#" className="hover:text-white transition-colors">Collections</Link>
            <Link href="#" className="hover:text-white transition-colors">Bespoke</Link>
            <Link href="#" className="hover:text-white transition-colors">About Us</Link>
            <Link href="#" className="hover:text-white transition-colors">Contact</Link>
          </nav>
          <Link 
            href="/admin" 
            className="text-xs uppercase tracking-widest border border-[#c9a96e] text-[#c9a96e] px-4 py-2 rounded hover:bg-[#c9a96e] hover:text-black transition-all"
          >
            Vendor Login
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="flex flex-col items-center text-center mt-20 mb-32 space-y-8">
          <h1 className="text-5xl md:text-7xl font-serif font-light tracking-wide text-transparent bg-clip-text bg-gradient-to-r from-[#d4af37] via-[#fff3cd] to-[#d4af37]">
            Timeless Elegance
          </h1>
          <p className="max-w-2xl text-lg md:text-xl text-gray-400 font-light leading-relaxed">
            Discover our curated collection of fine jewelry. From breathtaking diamonds to pure 24k gold, crafted for generations.
          </p>
        </div>

        {/* Live Rates Section */}
        <section className="bg-[#1a1a1a] rounded-3xl p-8 md:p-12 border border-white/5 relative overflow-hidden">
          {/* Decorative blur */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-[#c9a96e] rounded-full blur-[120px] opacity-20 pointer-events-none"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8 mb-12">
            <div>
              <h2 className="text-3xl font-serif text-white mb-2">Today's Live Rates</h2>
              <p className="text-gray-400">
                {latestRates?.date 
                  ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'full' }).format(new Date(latestRates.date)) 
                  : "Fetching latest rates..."}
              </p>
            </div>
            <Link 
              href="/admin" 
              className="group flex items-center gap-2 text-sm text-[#c9a96e] hover:text-[#e0c48e] transition-colors"
            >
              Update Rates 
              <span className="group-hover:translate-x-1 transition-transform">→</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {/* 24K Gold */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-[#c9a96e]/50 transition-colors">
              <div className="text-sm text-gray-400 mb-2 font-medium">24K Pure Gold</div>
              <div className="text-3xl font-light text-white mb-1">
                {latestRates?.goldRate24k ? `₹${latestRates.goldRate24k.toLocaleString('en-IN')}` : '---'}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Per Gram</div>
            </div>

            {/* 22K Gold */}
            <div className="bg-black/40 backdrop-blur-sm border border-[#c9a96e]/30 rounded-2xl p-6 hover:border-[#c9a96e]/80 transition-colors relative">
              <div className="absolute top-0 right-0 bg-[#c9a96e] text-black text-[10px] font-bold px-3 py-1 rounded-bl-2xl rounded-tr-2xl uppercase tracking-widest">
                Popular
              </div>
              <div className="text-sm text-[#c9a96e] mb-2 font-medium">22K Standard Gold</div>
              <div className="text-3xl font-light text-white mb-1">
                {latestRates?.goldRate22k ? `₹${latestRates.goldRate22k.toLocaleString('en-IN')}` : '---'}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Per Gram</div>
            </div>

            {/* 18K Gold */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-[#c9a96e]/50 transition-colors">
              <div className="text-sm text-gray-400 mb-2 font-medium">18K Rose/White Gold</div>
              <div className="text-3xl font-light text-white mb-1">
                {latestRates?.goldRate18k ? `₹${latestRates.goldRate18k.toLocaleString('en-IN')}` : '---'}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Per Gram</div>
            </div>

            {/* Silver */}
            <div className="bg-black/40 backdrop-blur-sm border border-white/10 rounded-2xl p-6 hover:border-[#c9a96e]/50 transition-colors">
              <div className="text-sm text-gray-400 mb-2 font-medium">Fine Silver</div>
              <div className="text-3xl font-light text-white mb-1">
                {latestRates?.silverRate ? `₹${latestRates.silverRate.toLocaleString('en-IN')}` : '---'}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Per Gram</div>
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
