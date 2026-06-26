async function testCron() {
  console.log("Triggering Daily Report Email API...");
  try {
    const res = await fetch("http://localhost:3000/api/cron/daily-report", {
      headers: {
        "Authorization": "Bearer godofwar" // Using your CRON_SECRET from .env
      }
    });
    
    const data = await res.text();
    console.log("Status Code:", res.status);
    console.log("Response:", data);
  } catch (e) {
    console.error("Error connecting to server:", e.message);
  }
}

testCron();
