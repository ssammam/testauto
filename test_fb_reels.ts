const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const fbPageId = process.env.FACEBOOK_PAGE_ID;
async function test() {
  const fbReelsUrl = `https://graph.facebook.com/v20.0/${fbPageId}/video_reels?fields=id,description,created_time,picture&access_token=${fbToken}&limit=5`;
  const fbReelsRes = await fetch(fbReelsUrl);
  console.log(await fbReelsRes.json());
}
test();
