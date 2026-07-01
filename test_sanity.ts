import { createClient } from 'next-sanity';
const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET,
  apiVersion: '2023-01-01',
  useCdn: false
});
async function test() {
  const reels = await client.fetch(`*[_type == "productReel" && postedOn != 'instagram']{_id, fbPostId, postedOn}`);
  console.log(reels);
}
test();
