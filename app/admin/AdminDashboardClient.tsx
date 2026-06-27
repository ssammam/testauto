'use client';

import { useState, useRef, useEffect } from 'react';
import { saveDailyRates } from './actions';
import { Calculator, Save, TrendingUp, CheckCircle2, Image as ImageIcon, Download, Upload } from 'lucide-react';

export default function AdminDashboardClient({ initialRates, templates = [] }: { initialRates: any, templates?: any[] }) {
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Calculator State
  const [calcWeight, setCalcWeight] = useState<string>('');
  const [calcMakingCharges, setCalcMakingCharges] = useState<string>('');
  const [selectedPurity, setSelectedPurity] = useState<'18k' | '22k' | '24k' | 'silver'>('22k');

  const handleSaveRates = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    
    const formData = new FormData(e.currentTarget);
    const result = await saveDailyRates(formData);
    
    setIsSaving(false);
    if (result.success) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else {
      alert("Error saving rates: " + result.error);
    }
  };

  const getSelectedRate = () => {
    switch (selectedPurity) {
      case '18k': return initialRates?.goldRate18k || 0;
      case '22k': return initialRates?.goldRate22k || 0;
      case '24k': return initialRates?.goldRate24k || 0;
      case 'silver': return (initialRates?.silverRate || 0) / 1000; // Convert kg to g for calculator
      default: return 0;
    }
  };

  const calculateFinalPrice = () => {
    const rate = getSelectedRate();
    const weight = parseFloat(calcWeight) || 0;
    const making = parseFloat(calcMakingCharges) || 0;
    
    // Standard Formula: [(Rate * Weight) + Making Charges] + 3% GST
    const basePrice = (rate * weight) + making;
    const gst = basePrice * 0.03;
    const finalPrice = basePrice + gst;
    
    return {
      base: basePrice,
      gst: gst,
      total: finalPrice
    };
  };

  const result = calculateFinalPrice();

  // Rate Card Generator State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [cardGenerated, setCardGenerated] = useState(false);
  
  // Draggable / Adjustable text coordinates
  const [textX, setTextX] = useState(140);
  const [textY, setTextY] = useState(850);
  const [selectedTemplate, setSelectedTemplate] = useState('');

  const loadTemplate = (url: string, defX = 140, defY = 850) => {
    setTextX(defX);
    setTextY(defY);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      setBgImage(img);
      drawCard(img, defX, defY);
    };
    img.src = url;
  };

  const handleTemplateSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const tmplId = e.target.value;
    setSelectedTemplate(tmplId);
    if (!tmplId) {
      setBgImage(null);
      setCardGenerated(false);
      return;
    }
    const tmpl = templates.find(t => t._id === tmplId);
    if (tmpl && tmpl.imageUrl) {
      loadTemplate(tmpl.imageUrl, tmpl.textX || 140, tmpl.textY || 850);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setBgImage(img);
          drawCard(img);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const drawCard = (img: HTMLImageElement | null = bgImage, currentX = textX, currentY = textY) => {
    if (!img || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Instagram Story Size
    canvas.width = 1080;
    canvas.height = 1920;

    // Draw background
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Add a dark gradient overlay for text readability
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(0,0,0,0.1)');
    gradient.addColorStop(0.5, 'rgba(0,0,0,0.6)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Date
    ctx.fillStyle = '#e1b366';
    ctx.font = 'bold 50px Arial';
    ctx.textAlign = 'center';
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    ctx.fillText(`TODAY'S GOLD RATES`, canvas.width / 2, 700);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '40px Arial';
    ctx.fillText(today, canvas.width / 2, 770);

    // Draw Rates Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = '#e1b366';
    ctx.lineWidth = 4;
    ctx.roundRect(currentX, currentY, 800, 600, 30);
    ctx.fill();
    ctx.stroke();

    // Rates Text
    ctx.textAlign = 'left';
    ctx.font = 'bold 55px Arial';
    
    const ratesData = [
      { label: '24K GOLD', value: `₹${parseFloat(initialRates?.goldRate24k || '0').toLocaleString('en-IN')} /g` },
      { label: '22K GOLD', value: `₹${parseFloat(initialRates?.goldRate22k || '0').toLocaleString('en-IN')} /g` },
      { label: '18K GOLD', value: `₹${parseFloat(initialRates?.goldRate18k || '0').toLocaleString('en-IN')} /g` },
      { label: 'SILVER', value: `₹${parseFloat(initialRates?.silverRate || '0').toLocaleString('en-IN')} /kg` },
    ];

    let yPos = currentY + 120;
    ratesData.forEach((item) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(item.label, currentX + 60, yPos);
      ctx.fillStyle = '#e1b366';
      ctx.textAlign = 'right';
      ctx.fillText(item.value, currentX + 740, yPos);
      ctx.textAlign = 'left';
      yPos += 130;
    });

    setCardGenerated(true);
  };

  // Redraw if rates or positions change
  useEffect(() => {
    if (bgImage) drawCard(bgImage, textX, textY);
  }, [initialRates, bgImage, textX, textY]);

  const downloadCard = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/jpeg', 0.9);
    const link = document.createElement('a');
    link.download = `Gold-Rates-${new Date().toISOString().split('T')[0]}.jpg`;
    link.href = url;
    link.click();
  };

  // Ensure rates exist for the ticker
  const hasRates = initialRates && Object.keys(initialRates).length > 0;

  return (
    <div className="space-y-8">
      {/* LIVE RATES TICKER */}
      {hasRates && (
        <div className="bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#e1b366]/30 shadow-[0_0_15px_rgba(225,179,102,0.15)] flex items-center">
          <div className="bg-gradient-to-r from-[#7c6a46] to-[#e1b366] text-white px-4 py-3 font-bold text-sm tracking-widest uppercase flex items-center gap-2 whitespace-nowrap z-10 shadow-lg">
            <span className="relative flex h-2.5 w-2.5 mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
            </span>
            LIVE RATES
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div className="animate-marquee whitespace-nowrap flex items-center text-[#e1b366] font-medium text-sm py-3 px-4">
              <span className="mx-4 text-white/50">•</span>
              <span>24K Gold: <span className="text-white font-bold tracking-wide">₹{initialRates.goldRate24k?.toLocaleString('en-IN') || 0}/g</span></span>
              <span className="mx-4 text-white/50">•</span>
              <span>22K Gold: <span className="text-white font-bold tracking-wide">₹{initialRates.goldRate22k?.toLocaleString('en-IN') || 0}/g</span></span>
              <span className="mx-4 text-white/50">•</span>
              <span>18K Gold: <span className="text-white font-bold tracking-wide">₹{initialRates.goldRate18k?.toLocaleString('en-IN') || 0}/g</span></span>
              <span className="mx-4 text-white/50">•</span>
              <span>Silver: <span className="text-white font-bold tracking-wide">₹{initialRates.silverRate?.toLocaleString('en-IN') || 0}/kg</span></span>
              <span className="mx-4 text-white/50">•</span>
              
              {/* Duplicate for seamless infinite scroll */}
              <span>24K Gold: <span className="text-white font-bold tracking-wide">₹{initialRates.goldRate24k?.toLocaleString('en-IN') || 0}/g</span></span>
              <span className="mx-4 text-white/50">•</span>
              <span>22K Gold: <span className="text-white font-bold tracking-wide">₹{initialRates.goldRate22k?.toLocaleString('en-IN') || 0}/g</span></span>
              <span className="mx-4 text-white/50">•</span>
              <span>18K Gold: <span className="text-white font-bold tracking-wide">₹{initialRates.goldRate18k?.toLocaleString('en-IN') || 0}/g</span></span>
              <span className="mx-4 text-white/50">•</span>
              <span>Silver: <span className="text-white font-bold tracking-wide">₹{initialRates.silverRate?.toLocaleString('en-IN') || 0}/kg</span></span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* UPDATE RATES CARD */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="border-b border-gray-100 p-6 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-[#f0ece1] p-2 rounded-lg">
              <TrendingUp className="w-5 h-5 text-[#7c6a46]" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Update Today's Rates</h2>
          </div>
          <p className="text-sm text-gray-500 mt-2">Publish live rates to your Instagram Bot & Website instantly.</p>
        </div>
        
        <form onSubmit={handleSaveRates} className="p-6 flex-1 flex flex-col">
          <div className="space-y-5 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">18K Gold Rate (₹/g)</label>
                <input 
                  name="goldRate18k"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={initialRates?.goldRate18k}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#7c6a46]/20 focus:border-[#7c6a46] transition-all"
                  placeholder="e.g. 5200"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">22K Gold Rate (₹/g)</label>
                <input 
                  name="goldRate22k"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={initialRates?.goldRate22k}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#7c6a46]/20 focus:border-[#7c6a46] transition-all"
                  placeholder="e.g. 6400"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">24K Gold Rate (₹/g)</label>
                <input 
                  name="goldRate24k"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={initialRates?.goldRate24k}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#7c6a46]/20 focus:border-[#7c6a46] transition-all"
                  placeholder="e.g. 7000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Silver Rate (₹/kg)</label>
                <input 
                  name="silverRate"
                  type="number"
                  step="0.01"
                  required
                  defaultValue={initialRates?.silverRate}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#7c6a46]/20 focus:border-[#7c6a46] transition-all"
                  placeholder="e.g. 85000"
                />
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSaving}
            className="w-full mt-8 bg-[#2A2A2A] text-white py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-black transition-colors disabled:opacity-70"
          >
            {isSaving ? 'Publishing...' : saveSuccess ? <><CheckCircle2 className="w-5 h-5 text-green-400" /> Published!</> : <><Save className="w-5 h-5" /> Publish Live Rates</>}
          </button>
        </form>
      </div>

      {/* CALCULATOR CARD */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
        <div className="border-b border-gray-100 p-6 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="bg-[#e1f0e8] p-2 rounded-lg">
              <Calculator className="w-5 h-5 text-[#467c5b]" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900">Price Estimator</h2>
          </div>
          <p className="text-sm text-gray-500 mt-2">Generate quick quotes for customers using the standard formula.</p>
        </div>

        <div className="p-6 flex-1 flex flex-col">
          <div className="space-y-5 flex-1">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Select Purity</label>
              <div className="grid grid-cols-4 gap-2">
                {(['18k', '22k', '24k', 'silver'] as const).map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedPurity(p)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium transition-all ${selectedPurity === p ? 'bg-[#2A2A2A] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Weight (grams)</label>
                <input 
                  type="number"
                  value={calcWeight}
                  onChange={e => setCalcWeight(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#467c5b]/20 focus:border-[#467c5b] transition-all"
                  placeholder="e.g. 10.5"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-700">Making Charges (₹)</label>
                <input 
                  type="number"
                  value={calcMakingCharges}
                  onChange={e => setCalcMakingCharges(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#467c5b]/20 focus:border-[#467c5b] transition-all"
                  placeholder="e.g. 4500"
                />
              </div>
            </div>

            {/* QUOTE RECEIPT */}
            <div className="mt-8 bg-[#f8f9fa] rounded-xl p-5 border border-dashed border-gray-300">
              <div className="space-y-3">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Current Rate ({selectedPurity.toUpperCase()})</span>
                  <span className="font-medium text-gray-900">₹{getSelectedRate().toLocaleString('en-IN')}/g</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Metal Value ({calcWeight || 0}g)</span>
                  <span className="font-medium text-gray-900">₹{((getSelectedRate() * (parseFloat(calcWeight) || 0))).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 border-b border-gray-200 pb-3">
                  <span>Making Charges</span>
                  <span className="font-medium text-gray-900">₹{(parseFloat(calcMakingCharges) || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 pt-1">
                  <span>Base Total</span>
                  <span className="font-medium text-gray-900">₹{result.base.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>GST (3%)</span>
                  <span className="font-medium text-gray-900">₹{result.gst.toLocaleString('en-IN')}</span>
                </div>
                
                <div className="flex justify-between items-center pt-3 mt-3 border-t border-gray-300">
                  <span className="text-base font-bold text-gray-900">Final Estimate</span>
                  <span className="text-2xl font-bold text-[#467c5b]">₹{Math.round(result.total).toLocaleString('en-IN')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* RATE CARD GENERATOR */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col lg:col-span-2">
        <div className="border-b border-gray-100 p-6 bg-gray-50/50 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="bg-[#f0ece1] p-2 rounded-lg">
                <ImageIcon className="w-5 h-5 text-[#7c6a46]" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900">Gold Rate Card Generator</h2>
            </div>
            <p className="text-sm text-gray-500 mt-2">Select a template from Sanity or upload your own, and adjust the text to fit perfectly.</p>
          </div>
          <div className="flex gap-2">
            {templates.length > 0 && (
              <select 
                value={selectedTemplate}
                onChange={handleTemplateSelect}
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-medium focus:ring-[#7c6a46] focus:border-[#7c6a46] shadow-sm"
              >
                <option value="">-- Choose Template --</option>
                {templates.map(t => (
                  <option key={t._id} value={t._id}>{t.name}</option>
                ))}
              </select>
            )}
            <label className="cursor-pointer bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors shadow-sm">
              <Upload className="w-4 h-4" />
              Upload Own
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
          </div>
        </div>

        <div className="p-6 flex flex-col md:flex-row gap-8 items-center justify-center bg-gray-50/30">
          <div className="w-full max-w-sm aspect-[9/16] bg-gray-100 border-2 border-dashed border-gray-300 rounded-2xl flex items-center justify-center overflow-hidden relative shadow-inner">
            <canvas ref={canvasRef} className="w-full h-full object-contain absolute inset-0 z-10"></canvas>
            {!cardGenerated && (
              <div className="text-center p-6 text-gray-400 z-0">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="font-medium text-sm">Select a template or upload an image to start.</p>
              </div>
            )}
          </div>
          
          <div className="flex flex-col gap-4 max-w-xs w-full">
            {cardGenerated && (
              <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm space-y-4">
                <h4 className="font-semibold text-gray-900">Adjust Position</h4>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Horizontal (Left/Right)</span>
                    <span>{textX}</span>
                  </div>
                  <input type="range" min="0" max="1080" value={textX} onChange={(e) => setTextX(Number(e.target.value))} className="w-full accent-[#7c6a46]" />
                </div>
                
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Vertical (Up/Down)</span>
                    <span>{textY}</span>
                  </div>
                  <input type="range" min="0" max="1920" value={textY} onChange={(e) => setTextY(Number(e.target.value))} className="w-full accent-[#7c6a46]" />
                </div>
              </div>
            )}

            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
              <h4 className="font-semibold text-gray-900 mb-2">How it works:</h4>
              <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
                <li>Upload your branded blank background image.</li>
                <li>The system reads your current live rates.</li>
                <li>We automatically write the rates on the image.</li>
                <li>Click download and post to your story!</li>
              </ol>
            </div>
            
            <button 
              onClick={downloadCard}
              disabled={!cardGenerated}
              className="w-full bg-gradient-to-r from-[#7c6a46] to-[#e1b366] text-white py-3.5 rounded-xl font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50 disabled:grayscale shadow-md"
            >
              <Download className="w-5 h-5" />
              Download Story Card
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
