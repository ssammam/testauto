'use client';

import { useState } from 'react';
import { syncInstagramPosts, updateProductReel } from './actions';
import { RefreshCw, Camera, Save, CheckCircle2, Search, Calendar, Image as ImageIcon } from 'lucide-react';

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5"/>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/>
  </svg>
);

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
  </svg>
);

export default function PostManagerClient({ initialPosts }: { initialPosts: any[] }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [localCalcType, setLocalCalcType] = useState('normal');
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // For Live DM Preview
  const [previewPost, setPreviewPost] = useState<any>(null);

  const filteredPosts = initialPosts.filter(post => 
    post.name?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    post.description?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    post.reelId?.includes(searchQuery) ||
    post.sku?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSync = async () => {
    setIsSyncing(true);
    setSyncMessage('');
    const res = await syncInstagramPosts();
    if (res.success) {
      setSyncMessage(`Synced successfully. Added ${res.addedCount} new posts.`);
    } else {
      setSyncMessage(`Error: ${res.error}`);
    }
    setIsSyncing(false);
    
    // Clear success message after 4s
    setTimeout(() => setSyncMessage(''), 4000);
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    setIsSaving(true);
    const formData = new FormData(e.currentTarget);
    const res = await updateProductReel(id, formData);
    
    if (res.success) {
      setEditingId(null);
    } else {
      alert("Error saving: " + res.error);
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col mt-8">
      <div className="border-b border-gray-100 p-6 bg-gray-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-[#fcecf3] p-2 rounded-lg">
            <Camera className="w-5 h-5 text-[#d62976]" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Social Media Posts & Pricing</h2>
            <p className="text-sm text-gray-500 mt-1">Manage pricing details for your Reels and Posts so auto-replies use the correct values.</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
          <div className="relative w-full sm:w-auto">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              placeholder="Search posts..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-[#d62976]/20 focus:border-[#d62976] w-full sm:w-64"
            />
          </div>
          {syncMessage && (
            <span className="text-sm font-medium text-green-600 bg-green-50 px-3 py-1 rounded-md">{syncMessage}</span>
          )}
          <button 
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-xl font-medium flex items-center gap-2 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Sync Recent Posts'}
          </button>
        </div>
      </div>

      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredPosts.map((post) => (
            <div key={post._id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md transition-shadow bg-white flex flex-col">
              {post.thumbnailUrl ? (
                <div className="h-48 w-full relative bg-gray-100 border-b border-gray-100 overflow-hidden group">
                  <img src={post.thumbnailUrl} alt={post.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  
                  {/* Status Badge */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    {post.status === 'sold' && <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-md font-medium shadow-sm">🔴 Sold</span>}
                    {post.status === 'draft' && <span className="bg-yellow-500 text-white text-xs px-2 py-1 rounded-md font-medium shadow-sm">🟡 Draft</span>}
                    {post.status === 'hidden' && <span className="bg-gray-800 text-white text-xs px-2 py-1 rounded-md font-medium shadow-sm">⚫ Hidden</span>}
                    {post.isPriceLocked && <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-md font-medium shadow-sm">🔒 Locked</span>}
                  </div>

                  {post.publishedAt && (
                    <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.publishedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </div>
                  )}

                  {/* Platform Logos */}
                  <div className="absolute bottom-3 right-3 flex gap-1.5">
                    {(post.postedOn === 'instagram' || post.postedOn === 'both' || (!post.postedOn && post.reelId)) && (
                      <div className="bg-white/90 backdrop-blur text-pink-600 p-1.5 rounded-full shadow-sm border border-white/20" title="Instagram Post">
                        <InstagramIcon className="w-4 h-4" />
                      </div>
                    )}
                    {(post.postedOn === 'facebook' || post.postedOn === 'both' || (!post.postedOn && post.fbPostId)) && (
                      <div className="bg-white/90 backdrop-blur text-blue-600 p-1.5 rounded-full shadow-sm border border-white/20" title="Facebook Post">
                        <FacebookIcon className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-32 w-full bg-gray-50 border-b border-gray-100 flex flex-col items-center justify-center text-gray-400">
                  <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
                  <span className="text-xs font-medium">No Thumbnail</span>
                </div>
              )}
              
              <div className="p-4 border-b border-gray-100 bg-white flex-1">
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-semibold text-gray-900 truncate" title={post.name}>{post.name}</h3>
                  {post.category && <span className="text-[10px] font-medium bg-[#f0ece1] text-[#7c6a46] px-2 py-0.5 rounded-full uppercase tracking-wider">{post.category}</span>}
                </div>
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-400 font-mono">ID: {post.reelId}</p>
                  {post.sku && <p className="text-xs font-mono bg-gray-100 px-1.5 rounded text-gray-600">SKU: {post.sku}</p>}
                </div>
                <p className="text-sm text-gray-600 mt-3 line-clamp-2" title={post.description}>
                  {post.description || <span className="italic text-gray-400">No caption</span>}
                </p>
              </div>

              {editingId === post._id ? (
                <form onSubmit={(e) => handleUpdate(e, post._id)} className="p-4 bg-gray-50/50 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Product Name</label>
                      <input name="name" defaultValue={post.name} required className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">SKU</label>
                      <input name="sku" defaultValue={post.sku} placeholder="e.g. VG-ER-2034" className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                      <select name="status" defaultValue={post.status || 'active'} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]">
                        <option value="active">🟢 Active</option>
                        <option value="draft">🟡 Draft</option>
                        <option value="sold">🔴 Sold Out</option>
                        <option value="hidden">⚫ Hidden</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                      <select name="category" defaultValue={post.category || 'rings'} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]">
                        <option value="rings">Rings</option>
                        <option value="chains">Chains</option>
                        <option value="bangles">Bangles</option>
                        <option value="necklaces">Necklaces</option>
                        <option value="earrings">Earrings</option>
                        <option value="pendants">Pendants</option>
                        <option value="bridal">Bridal</option>
                        <option value="temple">Temple Jewellery</option>
                        <option value="silver">Silver</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description (Internal)</label>
                    <textarea name="description" defaultValue={post.description} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46] min-h-[40px]" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Material</label>
                      <select name="materialType" defaultValue={post.materialType} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]">
                        <option value="gold18k">18K Gold</option>
                        <option value="gold22k">22K Gold</option>
                        <option value="gold24k">24K Gold</option>
                        <option value="silver">Silver</option>
                      </select>
                    </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Price Response Type</label>
                      <select name="priceCalculationType" 
                              value={localCalcType} 
                              onChange={(e) => setLocalCalcType(e.target.value)} 
                              className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]">
                        <option value="normal">Normal Calculation</option>
                        <option value="range">Range Price</option>
                      </select>
                    </div>
                  </div>

                  {localCalcType === 'normal' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-gray-200">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Weight (g)</label>
                        <input name="weightGrams" type="number" step="0.01" defaultValue={post.weightGrams} required={localCalcType === 'normal'} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" />
                      </div>
                      <div className="flex items-center gap-2 mt-6">
                        <input type="checkbox" id={`lock-${post._id}`} name="isPriceLocked" value="true" defaultChecked={post.isPriceLocked} className="rounded text-[#7c6a46] focus:ring-[#7c6a46]" />
                        <label htmlFor={`lock-${post._id}`} className="text-xs font-medium text-gray-900">Lock Fixed Price?</label>
                      </div>
                      <div className="col-span-1 sm:col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Locked Price (₹)</label>
                        <input name="lockedPrice" type="number" defaultValue={post.lockedPrice} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" placeholder="e.g. 145000" />
                      </div>
                    </div>
                  )}

                  {localCalcType === 'range' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-white rounded-lg border border-gray-200">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Starting Weight (g)</label>
                        <input name="minWeightGrams" type="number" step="0.01" defaultValue={post.minWeightGrams || 8} required={localCalcType === 'range'} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Ending Weight (g)</label>
                        <input name="maxWeightGrams" type="number" step="0.01" defaultValue={post.maxWeightGrams} required={localCalcType === 'range'} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" />
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Making Charge</label>
                      <select name="makingChargeType" defaultValue={post.makingChargeType || 'percentage'} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]">
                        <option value="percentage">Percentage (%)</option>
                        <option value="flat">Flat Amount (₹)</option>
                        <option value="per_gram">Per Gram (₹/g)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Value</label>
                      <input name="makingCharges" type="number" step="0.01" defaultValue={post.makingCharges} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" placeholder="e.g. 15 for 15%" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Wastage (%)</label>
                      <input name="wastage" type="number" step="0.01" defaultValue={post.wastage !== undefined ? post.wastage : 10} className="w-full text-sm text-gray-900 bg-white border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46]" placeholder="10" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Private Notes</label>
                    <textarea name="notes" defaultValue={post.notes} placeholder="e.g. Max discount 4%" className="w-full text-sm text-gray-900 border-gray-300 rounded-lg py-2 px-3 focus:ring-[#7c6a46] focus:border-[#7c6a46] min-h-[40px] bg-yellow-50" />
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => { setEditingId(null); setPreviewPost(null); }} className="flex-1 py-2 px-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
                    <button type="submit" disabled={isSaving} className="flex-1 py-2 px-3 bg-[#2A2A2A] text-white rounded-lg text-sm font-medium hover:bg-black disabled:opacity-70 flex justify-center items-center gap-2">
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4 text-sm">
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <span className="block text-xs text-gray-500">Material</span>
                      <span className="font-medium text-gray-900">{
                        post.materialType === 'gold18k' ? '18K Gold' : 
                        post.materialType === 'gold22k' ? '22K Gold' : 
                        post.materialType === 'gold24k' ? '24K Gold' : 'Silver'
                      }</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg">
                      <span className="block text-xs text-gray-500">Weight</span>
                      <span className="font-medium text-gray-900">{post.weightGrams}g</span>
                    </div>
                    <div className="bg-gray-50 p-2 rounded-lg col-span-1 sm:col-span-2 flex justify-between items-center">
                      <div>
                        <span className="block text-xs text-gray-500">Making Charges</span>
                        <span className="font-medium text-gray-900">
                          {post.makingChargeType === 'percentage' ? `${post.makingCharges || 0}%` : 
                           post.makingChargeType === 'per_gram' ? `₹${post.makingCharges || 0}/g` : 
                           `₹${post.makingCharges || 0}`}
                        </span>
                      </div>
                      {post.isPriceLocked && (
                        <div className="text-right">
                          <span className="block text-xs text-blue-600 font-medium">Locked Price</span>
                          <span className="font-bold text-gray-900">₹{post.lockedPrice || 0}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => setPreviewPost(post)}
                      className="flex-1 py-2 px-3 border border-gray-200 text-gray-700 hover:bg-gray-50 rounded-lg font-medium text-sm transition-colors"
                    >
                      Preview DM
                    </button>
                    <button 
                      onClick={() => {
                        setEditingId(post._id);
                        setLocalCalcType(post.priceCalculationType || 'normal');
                      }}
                      className="flex-1 py-2 px-4 bg-[#f0ece1] text-[#7c6a46] hover:bg-[#e6dfce] rounded-lg font-medium text-sm transition-colors"
                    >
                      Edit Product
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          {filteredPosts.length === 0 && initialPosts.length > 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl">
              <Search className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-gray-900 font-medium">No matches found</h3>
              <p className="text-gray-500 text-sm mt-1 mb-4">Try adjusting your search query.</p>
              <button 
                onClick={() => setSearchQuery('')}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-xl font-medium hover:bg-gray-200 transition-colors shadow-sm"
              >
                Clear Search
              </button>
            </div>
          )}
          
          {initialPosts.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-gray-200 rounded-2xl">
              <Camera className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-gray-900 font-medium">No posts found</h3>
              <p className="text-gray-500 text-sm mt-1 mb-4">Sync your Instagram account to fetch recent posts.</p>
              <button 
                onClick={handleSync}
                disabled={isSyncing}
                className="bg-[#2A2A2A] text-white px-5 py-2.5 rounded-xl font-medium inline-flex items-center gap-2 hover:bg-black transition-colors disabled:opacity-50 shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>
          )}
        </div>
      </div>
      {/* DM PREVIEW MODAL */}
      {previewPost && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="bg-gray-100 p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Instagram DM Preview</h3>
              <button onClick={() => setPreviewPost(null)} className="text-gray-500 hover:text-black">✕</button>
            </div>
            <div className="p-4 bg-gray-50 flex-1">
              <div className="bg-white border rounded-xl p-4 shadow-sm text-sm text-gray-800 whitespace-pre-wrap font-sans">
                {previewPost.status === 'sold' ? (
                  "This beautiful piece has already been sold! Please DM us to check for similar designs or to place a custom order. We are RH Jewellers Kengeri."
                ) : previewPost.priceCalculationType === 'range' ? (
                  `Namaste, First Name,\n\nThank you for your interest in our ${previewPost.rangeCategoryName || previewPost.category || 'Jewellery'} collection!\n\nMaking Charges: ${previewPost.makingCharges || 0}%\nWastage: ${previewPost.wastage !== undefined ? previewPost.wastage : 10}%\n\nThe price of 1 gram 22kt Gold is LIVE_RATE as on TODAY.\nStarting Range for ${previewPost.rangeCategoryName || previewPost.category || 'Jewellery'} are from ${previewPost.minWeightGrams || 12}gms to ${previewPost.maxWeightGrams || 50} gms. Final price is based on the billing date's gold rate & ornament weight.\n\nBIS Hallmarked & Certified\n\nContact: 9620741404\n\nPlease let us know what you're looking for... We are RH Jewellers Kengeri.`
                ) : (
                  <>
                    Namaste, First Name,
                    <br /><br />
                    Thank you for your interest in our {previewPost.category ? previewPost.category.charAt(0).toUpperCase() + previewPost.category.slice(1) : 'Jewellery'} collection!
                    <br /><br />
                    Making Charges: {previewPost.makingCharges || 0}%
                    <br />
                    Wastage: {previewPost.wastage !== undefined ? previewPost.wastage : 10}%
                    <br /><br />
                    The price of 1 gram 22kt Gold is LIVE_RATE as on TODAY.
                    <br /><br />
                    {previewPost.name || (previewPost.category ? previewPost.category.charAt(0).toUpperCase() + previewPost.category.slice(1) : 'Jewellery')}
                    <br />
                    {previewPost.materialType === 'silver' ? 'Silver' : 'Hallmarked Gold'}
                    <br />
                    Weight: {previewPost.weightGrams}g
                    <br />
                    Total Price: ₹{previewPost.isPriceLocked ? previewPost.lockedPrice : 'LIVE_CALCULATED'}
                    <br />
                    {previewPost.isPriceLocked ? '*(Incl. GST)*\n' : ''}
                    BIS Hallmarked & Certified
                    <br /><br />
                    Contact: 9620741404
                    <br /><br />
                    Please let us know what you're looking for, and we'll help you with detailed information about that particular product. We are RH Jewellers Kengeri.
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
