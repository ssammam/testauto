'use client';

import { useState } from 'react';
import { updateLeadStatus } from './actions';
import { Phone, User, AtSign, Calendar, MapPin, Sparkles, Folder } from 'lucide-react';

export default function LeadManagerClient({ initialLeads }: { initialLeads: any[] }) {
  const [leads, setLeads] = useState(initialLeads);
  const [updating, setUpdating] = useState<string | null>(null);

  const handleStatusChange = async (id: string, newStatus: string) => {
    setUpdating(id);
    const result = await updateLeadStatus(id, newStatus);
    if (result.success) {
      setLeads(leads.map(lead => lead._id === id ? { ...lead, status: newStatus } : lead));
    }
    setUpdating(null);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'New': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Contacted': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Visited': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Closed': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const incomers = leads.filter(l => l.queryType === 'Store Visit' && l.phoneNumber);
  const customDesign = leads.filter(l => l.queryType === 'Custom Design');
  const generalLeads = leads.filter(l => !((l.queryType === 'Store Visit' && l.phoneNumber) || l.queryType === 'Custom Design'));

  const renderTable = (title: string, desc: string, icon: any, data: any[]) => (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-8">
      <div className="bg-[#2A2A2A] p-6 text-white flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            {icon}
            {title}
          </h2>
          <p className="text-sm text-gray-300 mt-1">{desc}</p>
        </div>
        <div className="bg-white/10 px-4 py-2 rounded-lg text-sm font-medium backdrop-blur-md">
          {data.length} Leads
        </div>
      </div>

      <div className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 text-sm text-gray-500">
                <th className="py-3 px-4 font-medium">Customer</th>
                <th className="py-3 px-4 font-medium">Contact</th>
                <th className="py-3 px-4 font-medium">Inquiry Type</th>
                <th className="py-3 px-4 font-medium">Date Created</th>
                <th className="py-3 px-4 font-medium text-right">Status Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500">No leads found in this category.</td>
                </tr>
              ) : (
                data.map((lead) => (
                  <tr key={lead._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-gray-900">{lead.name || 'Unknown'}</span>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mt-0.5">
                          <AtSign className="w-3 h-3" />
                          <a href={`https://instagram.com/${lead.instagramUsername}`} target="_blank" rel="noreferrer" className="hover:text-blue-600 hover:underline">
                            {lead.instagramUsername}
                          </a>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-col gap-2">
                        {lead.phoneNumber ? (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 bg-gray-100 px-2.5 py-1 rounded-md w-fit">
                            <Phone className="w-3.5 h-3.5 text-gray-500" />
                            {lead.phoneNumber}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No Phone</span>
                        )}
                        
                        {lead.visitDate && (
                          <div className="flex items-center gap-1.5 text-sm font-medium text-blue-800 bg-blue-50 px-2.5 py-1 rounded-md w-fit">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            Requested: {lead.visitDate}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="text-sm text-gray-600 bg-gray-50 border border-gray-100 px-2 py-1 rounded-md whitespace-nowrap">
                        {lead.queryType || 'General'}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(lead._createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor(lead.status)}`}>
                          {lead.status}
                        </span>
                        
                        <select 
                          disabled={updating === lead._id}
                          value={lead.status}
                          onChange={(e) => handleStatusChange(lead._id, e.target.value)}
                          className="text-xs border-gray-200 rounded-lg focus:ring-[#7c6a46] focus:border-[#7c6a46] bg-white cursor-pointer py-1.5"
                        >
                          <option value="New">Mark New</option>
                          <option value="Contacted">Mark Contacted</option>
                          <option value="Visited">Mark Visited</option>
                          <option value="Closed">Mark Closed</option>
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {renderTable(
        "Incomers", 
        "Customers who have requested a store visit and provided a phone number.", 
        <MapPin className="w-5 h-5 text-[#e1b366]" />, 
        incomers
      )}
      
      {renderTable(
        "Custom Design Requests", 
        "Customers who shared external designs and are interested in custom jewelry.", 
        <Sparkles className="w-5 h-5 text-[#e1b366]" />, 
        customDesign
      )}

      {renderTable(
        "General Inquiries", 
        "All other inquiries, price checks, and partial leads.", 
        <Folder className="w-5 h-5 text-[#e1b366]" />, 
        generalLeads
      )}
    </div>
  );
}
