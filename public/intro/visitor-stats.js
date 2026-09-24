const visitorStatsEndpoint =
  "https://wcimzbbapfrdotjsfyxa.supabase.co/functions/v1/visitor-visit?stats=1";
const publishableKey = "sb_publishable_sJuiSZhS6bCOza_RGTMVPg_JFiVv0F8";

async function showVisitorStats() {
  try {
    const response = await fetch(visitorStatsEndpoint, {
      method: "POST",
      headers: { apikey: publishableKey },
    });
    if (!response.ok) return;

    const { todayVisitors, totalVisitors } = await response.json();
    if (
      !Number.isSafeInteger(todayVisitors) ||
      todayVisitors < 0 ||
      !Number.isSafeInteger(totalVisitors) ||
      totalVisitors < 0
    ) return;

    const formatter = new Intl.NumberFormat("zh-TW");
    document.getElementById("today-visitor-count").textContent = formatter.format(todayVisitors);
    document.getElementById("total-visitor-count").textContent = formatter.format(totalVisitors);
  } catch {
    // Leave the placeholders in place if the count cannot be loaded.
  }
}

void showVisitorStats();
