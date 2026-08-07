export default async function handler(req, res) {
  const appId = String(req.query.appid || '').match(/^\d{3,10}$/)?.[0];
  if (!appId) return res.status(400).json({ error: 'Steam App ID tidak valid.' });
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400');
  try {
    const [storeResult, cmdResult, newsResult] = await Promise.allSettled([
      fetch(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=indonesian&cc=id`, { headers: { 'User-Agent': 'YOSENOV-Patch-Monitor/1.0' } }).then(r => r.json()),
      fetch(`https://api.steamcmd.net/v1/info/${appId}`, { headers: { 'User-Agent': 'YOSENOV-Patch-Monitor/1.0' } }).then(r => r.json()),
      fetch(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=5&maxlength=500&format=json`, { headers: { 'User-Agent': 'YOSENOV-Patch-Monitor/1.0' } }).then(r => r.json())
    ]);
    const store = storeResult.status === 'fulfilled' ? storeResult.value?.[appId]?.data : null;
    const appInfo = cmdResult.status === 'fulfilled' ? cmdResult.value?.data?.[appId] : null;
    const publicBranch = appInfo?.depots?.branches?.public || null;
    const news = newsResult.status === 'fulfilled' ? newsResult.value?.appnews?.newsitems || [] : [];
    const latest = news[0] || null;
    const name = store?.name || appInfo?.common?.name || `Steam App ${appId}`;
    if (!store && !appInfo && !latest) return res.status(502).json({ error: 'Data Steam sedang tidak tersedia. Coba lagi beberapa saat.' });
    return res.status(200).json({
      appId, name, coverUrl: store?.header_image || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
      remoteBuildId: publicBranch?.buildid ? String(publicBranch.buildid) : '', latestPatchAt: publicBranch?.timeupdated ? new Date(Number(publicBranch.timeupdated) * 1000).toISOString() : (latest?.date ? new Date(latest.date * 1000).toISOString() : ''),
      latestNewsTitle: latest?.title || '', latestNewsUrl: latest?.url || '', steamUrl: `https://store.steampowered.com/app/${appId}/`, steamDbUrl: `https://steamdb.info/app/${appId}/patchnotes/`
    });
  } catch (error) { return res.status(500).json({ error: error.message || 'Terjadi kesalahan pada server.' }); }
}
