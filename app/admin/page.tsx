import { client } from '@/sanity/lib/client';
import AdminDashboardClient from './AdminDashboardClient';

export const revalidate = 0; // Disable caching for the admin page to always get the latest rates

export default async function AdminPage() {
  const latestRates = await client.fetch(`*[_type == "dailyPrice"] | order(date desc)[0]`);

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Jeweler Dashboard</h1>
            <p className="text-gray-500 mt-1">Manage today's rates and calculate final prices for customers.</p>
          </div>
          <div className="bg-[#f0ece1] text-[#7c6a46] px-4 py-2 rounded-lg font-medium text-sm">
            Live Database Connected
          </div>
        </div>

        <AdminDashboardClient initialRates={latestRates || {}} />
      </div>
    </div>
  );
}
