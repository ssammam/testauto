const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
const fbPageId = process.env.FACEBOOK_PAGE_ID;
async function test() {
  const fbUrl = `https://graph.facebook.com/v20.0/${fbPageId}/posts?fields=id,message,created_time,full_picture&access_token=${fbToken}&limit=5`;
  const res = await fetch(fbUrl);
  console.log(await res.json());
}
test();
