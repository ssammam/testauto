import { client } from '@/sanity/lib/client';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { redirect } from 'next/navigation';
import AdminDashboardClient from './AdminDashboardClient';
import PostManagerClient from './PostManagerClient';
import LeadManagerClient from './LeadManagerClient';
import AdminHeader from './AdminHeader';

export const revalidate = 0; // Disable caching for the admin page to always get the latest rates

export default async function AdminPage() {
  const latestRates = await client.fetch(`*[_type == "dailyPrice"] | order(_createdAt desc)[0]`);
  const productReels = await client.fetch(`*[_type == "productReel"] | order(_createdAt desc)`);
  const leads = await client.fetch(`*[_type == "lead"] | order(_createdAt desc)`);
  const rateCardTemplates = await client.fetch(`*[_type == "rateCardTemplate"]{
    _id,
    name,
    "imageUrl": backgroundImage.asset->url,
    textX,
    textY
  }`);
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-[#fafafa] font-sans p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        <AdminHeader email={session?.user?.email || null} />

        <AdminDashboardClient initialRates={latestRates || {}} templates={rateCardTemplates || []} />
        <LeadManagerClient initialLeads={leads || []} />
        <PostManagerClient initialPosts={productReels || []} leads={leads || []} />
      </div>
    </div>
  );
}
